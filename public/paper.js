// Papertrading : compte de démonstration en argent fictif, stocké uniquement sur l'appareil (marches:paper).
// Aucun ordre réel n'est transmis. Exécution au cours affiché lors des vérifications (à chaque rafraîchissement
// des données, toutes les 60 s quand l'app est ouverte) ; jamais sur un cours absent, ancien ou de marché fermé.

const KEY = 'paper';
const FEE = 0.001; // frais simulés : 0,1 % de la valeur, à l'ouverture et à la clôture
const LEVERAGES = [1, 2, 5, 10];
const CAPITALS = [1000, 10000, 100000];
const MAX_OPEN = 50, MAX_ORDERS = 50, MAX_HISTORY = 500, MAX_POINTS = 400;

const dirOf = (side) => (side === 'long' ? 1 : -1);
/** Prix de liquidation (marge isolée, perte limitée à la marge). Achat sans levier : aucun. */
export function liqPrice(side, entry, lev) {
  if (side === 'long') return lev > 1 ? entry * (1 - 1 / lev) : null;
  return entry * (1 + 1 / lev);
}

export function createPaper(ctx) {
  const { t, store, esc, isNum } = ctx;
  let acct = load();
  let ticket = null; // ticket d'ordre ouvert
  let manageId = null; // position en cours de gestion
  let picker = null; // fonction de redessin du sélecteur d'actif ouvert

  /* ---------- Compte ---------- */
  function load() {
    const a = store.get(KEY);
    return a && a.v === 1 && isNum(a.cash) && Array.isArray(a.positions) ? a : null;
  }
  const save = () => store.set(KEY, acct);
  const nextId = () => `${Date.now().toString(36)}${(acct.seq++).toString(36)}`;
  function create(initial) {
    acct = { v: 1, initial, cash: initial, positions: [], orders: [], history: [], equity: [[Date.now(), initial]], createdAt: Date.now(), seq: 1 };
    save();
  }
  const assetOf = (x) => ({ kind: x.kind, assetId: x.assetId, label: x.label, name: x.name, logo: x.logo, logoSmall: x.logoSmall });
  const upnl = (p, price) => (price - p.entry) * p.qty * dirOf(p.side);

  function summary() {
    let unreal = 0, margin = 0, valued = true;
    for (const p of acct.positions) {
      margin += p.margin;
      const q = ctx.quote(p);
      if (isNum(q.price)) unreal += Math.max(-p.margin, upnl(p, q.price));
      else valued = false;
    }
    const equity = acct.cash + margin + unreal;
    return { cash: acct.cash, margin, unreal, equity, valued, pnl: equity - acct.initial, pnlPct: (equity / acct.initial - 1) * 100 };
  }
  function recordEquity() {
    const s = summary();
    if (!s.valued) return;
    const pts = acct.equity;
    const last = pts[pts.length - 1];
    const now = Date.now();
    if (last && now - last[0] < 10 * 60_000 && Math.abs(s.equity - last[1]) < acct.initial * 0.002) return;
    pts.push([now, Math.round(s.equity * 100) / 100]);
    if (pts.length > MAX_POINTS) pts.splice(1, pts.length - MAX_POINTS); // garde le point de départ
    save();
  }

  function openPosition(asset, { side, qty, price, lev, tp, sl }) {
    const notional = qty * price, margin = notional / lev, fee = notional * FEE;
    if (acct.positions.length >= MAX_OPEN) return { error: 'maxPos' };
    if (margin + fee > acct.cash + 1e-9) return { error: 'funds' };
    acct.cash -= margin + fee;
    const p = { id: nextId(), ...assetOf(asset), side, qty, entry: price, lev, margin, fees: fee, tp: tp ?? null, sl: sl ?? null, openedAt: Date.now() };
    acct.positions.push(p);
    return { position: p };
  }

  /** Clôture (totale ou partielle) au prix donné ; perte plafonnée à la marge (liquidation). */
  function closePosition(p, price, fraction = 1, reason = 'manual') {
    const all = fraction >= 0.999;
    const qty = all ? p.qty : p.qty * fraction;
    const share = qty / p.qty;
    const margin = p.margin * share;
    const gross = (price - p.entry) * qty * dirOf(p.side);
    const liquidated = gross <= -margin;
    const pnl = Math.max(-margin, gross);
    const closeFee = Math.min(qty * price * FEE, margin + pnl);
    const openFee = p.fees * share;
    acct.cash += margin + pnl - closeFee;
    const h = {
      id: nextId(), ...assetOf(p), side: p.side, qty, entry: p.entry, exit: price, lev: p.lev,
      gross: pnl, fees: openFee + closeFee, net: pnl - openFee - closeFee,
      reason: liquidated ? 'liq' : reason, openedAt: p.openedAt, closedAt: Date.now(),
    };
    acct.history.unshift(h);
    if (acct.history.length > MAX_HISTORY) acct.history.length = MAX_HISTORY;
    if (all) acct.positions = acct.positions.filter((x) => x.id !== p.id);
    else { p.qty -= qty; p.margin -= margin; p.fees -= openFee; }
    return h;
  }

  /** Moteur : ordres en attente puis TP / SL / liquidation, au cours actuel. Renvoie les événements. */
  function run() {
    if (!acct) return [];
    const events = [];
    for (const o of [...acct.orders]) {
      const q = ctx.quote(o);
      if (!q.ok) continue; // cours absent, ancien, ou marché fermé : rien n'est exécuté
      const px = q.price;
      const hit = o.type === 'limit' ? (o.side === 'long' ? px <= o.price : px >= o.price)
        : (o.side === 'long' ? px >= o.price : px <= o.price);
      if (!hit) continue;
      acct.orders = acct.orders.filter((x) => x.id !== o.id);
      const r = openPosition(o, { side: o.side, qty: o.qty, price: px, lev: o.lev, tp: o.tp, sl: o.sl });
      events.push(r.error ? { type: 'fail', o, reason: r.error } : { type: 'filled', p: r.position });
    }
    for (const p of [...acct.positions]) {
      const q = ctx.quote(p);
      if (!q.ok) continue;
      const px = q.price, d = dirOf(p.side), liq = liqPrice(p.side, p.entry, p.lev);
      let reason = null;
      if (p.sl != null && (d > 0 ? px <= p.sl : px >= p.sl)) reason = 'sl';
      else if (p.tp != null && (d > 0 ? px >= p.tp : px <= p.tp)) reason = 'tp';
      else if (liq != null && (d > 0 ? px <= liq : px >= liq)) reason = 'liq';
      if (reason) events.push({ type: 'closed', h: closePosition(p, px, 1, reason) });
    }
    if (events.length) save();
    recordEquity();
    for (const e of events) notify(e);
    return events;
  }

  /* ---------- Formats ---------- */
  const money = (v) => ctx.money(v);
  const signed = (v) => (isNum(v) ? `${v > 0.004 ? '+' : v < -0.004 ? '−' : ''}${ctx.money(Math.abs(v))}` : ctx.ND);
  const cls = (v) => (!isNum(v) || Math.abs(v) < 0.005 ? '' : v > 0 ? 'pos' : 'neg');
  const sideLabel = (s) => t(s === 'long' ? 'pt.long' : 'pt.short');
  const typeLabel = (ty) => t(`pt.${ty}`);
  const qtyFmt = (v) => ctx.qty(v);

  function notify(e) {
    if (e.type === 'filled') ctx.toast(t('pt.t.filled', { s: sideLabel(e.p.side), q: qtyFmt(e.p.qty), l: e.p.label, p: money(e.p.entry) }));
    else if (e.type === 'fail') ctx.toast(t('pt.t.fail', { l: e.o.label }), 'neg');
    else if (e.type === 'closed') {
      const key = { tp: 'pt.t.tp', sl: 'pt.t.sl', liq: 'pt.t.liq' }[e.h.reason] || 'pt.t.closed';
      ctx.toast(t(key, { l: e.h.label, pnl: signed(e.h.net) }), e.h.net >= 0 ? 'pos' : 'neg');
    }
  }

  /* ---------- Onglet Compte ---------- */
  function equitySVG() {
    const pts = acct.equity.map(([x, y]) => [x, y]);
    const s = summary();
    if (s.valued) pts.push([Date.now(), s.equity]);
    if (pts.length < 2) return '';
    const W = 320, H = 70;
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys, acct.initial), y1 = Math.max(...ys, acct.initial);
    const X = (x) => (x1 === x0 ? 0 : ((x - x0) / (x1 - x0)) * W);
    const Y = (y) => (y1 === y0 ? H / 2 : H - 4 - ((y - y0) / (y1 - y0)) * (H - 8));
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
    const up = pts[pts.length - 1][1] >= acct.initial;
    return `<svg class="pt-curve ${up ? 'up' : 'down'}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(t('pt.equityChart'))}">
      <line x1="0" x2="${W}" y1="${Y(acct.initial).toFixed(1)}" y2="${Y(acct.initial).toFixed(1)}" class="base"/>
      <path d="${d}L${W},${H}L0,${H}Z" class="area"/><path d="${d}" class="line"/></svg>`;
  }

  function stats() {
    const h = acct.history;
    const wins = h.filter((x) => x.net > 0), losses = h.filter((x) => x.net <= 0);
    const avg = (a) => (a.length ? a.reduce((s, x) => s + x.net, 0) / a.length : null);
    return [
      [t('pt.trades'), String(h.length)],
      [t('pt.winrate'), h.length ? `${ctx.NF1().format((wins.length / h.length) * 100)}${ctx.pctSign()}` : ctx.ND],
      [t('pt.avgWin'), avg(wins) == null ? ctx.ND : signed(avg(wins)), 'pos'],
      [t('pt.avgLoss'), avg(losses) == null ? ctx.ND : signed(avg(losses)), 'neg'],
      [t('pt.best'), h.length ? signed(Math.max(...h.map((x) => x.net))) : ctx.ND],
      [t('pt.worst'), h.length ? signed(Math.min(...h.map((x) => x.net))) : ctx.ND],
      [t('pt.feesPaid'), money(h.reduce((s, x) => s + x.fees, 0) + acct.positions.reduce((s, p) => s + p.fees, 0))],
    ];
  }

  function positionHTML(p) {
    const q = ctx.quote(p);
    const pnl = isNum(q.price) ? Math.max(-p.margin, upnl(p, q.price)) : null;
    const pct = pnl == null ? null : (pnl / p.margin) * 100;
    const liq = liqPrice(p.side, p.entry, p.lev);
    const note = q.ok ? '' : `<span class="pt-note">${esc(t(`pt.why.${q.reason || 'na'}`, { c: q.currency || '' }))}</span>`;
    return `<li class="pt-pos" data-id="${esc(p.id)}">
      <div class="pt-row1">${ctx.logo(p, 22)}<strong>${esc(p.label)}</strong><span class="pt-badge ${p.side}">${p.side === 'long' ? 'LONG' : 'SHORT'} ${p.lev}×</span>
        <span class="pt-pnl ${cls(pnl)}">${signed(pnl)} <small>${pct == null ? '' : ctx.pct(pct)}</small></span></div>
      <div class="pt-row2">${qtyFmt(p.qty)} @ ${money(p.entry)} · ${t('pt.nowShort')} ${isNum(q.price) ? money(q.price) : ctx.ND}</div>
      <div class="pt-row3">TP ${p.tp != null ? money(p.tp) : '—'} · SL ${p.sl != null ? money(p.sl) : '—'} · ${t('pt.liqShort')} ${liq != null ? money(liq) : '—'} ${note}</div>
      <div class="pt-actions"><button type="button" class="btn btn-sm" data-manage="${esc(p.id)}">${t('pt.manage')}</button>
        <button type="button" class="btn btn-sm" data-close="${esc(p.id)}">${t('pt.close')}</button></div>
    </li>`;
  }

  function render(el) {
    if (!acct) {
      el.innerHTML = `<div class="pt-welcome card">
        <h2>${t('pt.welcome')}</h2><p>${t('pt.welcomeP')}</p>
        <p class="pt-label">${t('pt.capital')}</p>
        <div class="seg seg-wide" role="group" aria-label="${esc(t('pt.capital'))}">${CAPITALS.map((c, i) =>
          `<button type="button" data-cap="${c}" aria-pressed="${i === 1}">${money(c)}</button>`).join('')}</div>
        <button type="button" class="btn btn-primary pt-create">${t('pt.create')}</button>
        <p class="consent-small">${t('pt.disclaimer')}</p></div>`;
      let cap = CAPITALS[1];
      el.querySelectorAll('[data-cap]').forEach((b) => b.addEventListener('click', () => {
        cap = Number(b.dataset.cap);
        el.querySelectorAll('[data-cap]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      }));
      el.querySelector('.pt-create').addEventListener('click', () => { create(cap); render(el); });
      return;
    }
    const s = summary();
    const avail = acct.cash;
    el.innerHTML = `
      <div class="pt-summary card">
        <div class="pt-eq-label">${t('pt.equity')}${s.valued ? '' : ` <span class="pt-note">${t('pt.partial')}</span>`}</div>
        <div class="pt-eq">${money(s.equity)}</div>
        <div class="pt-perf ${cls(s.pnl)}">${signed(s.pnl)} (${ctx.pct(s.pnlPct)}) <span>${t('pt.since', { d: ctx.day(acct.createdAt), c: money(acct.initial) })}</span></div>
        ${equitySVG()}
        <dl class="pt-kv">
          <div><dt>${t('pt.cash')}</dt><dd>${money(avail)}</dd></div>
          <div><dt>${t('pt.margin')}</dt><dd>${money(s.margin)}</dd></div>
          <div><dt>${t('pt.unreal')}</dt><dd class="${cls(s.unreal)}">${signed(s.unreal)}</dd></div>
          <div><dt>${t('pt.openCount')}</dt><dd>${acct.positions.length}</dd></div>
        </dl>
        <div class="pt-top-actions"><button type="button" class="btn btn-primary" data-new>${t('pt.newOrder')}</button></div>
      </div>

      <h2 class="pt-h">${t('pt.positions')} <span>${acct.positions.length}</span></h2>
      ${acct.positions.length ? `<ul class="pt-list">${acct.positions.map(positionHTML).join('')}</ul>` : `<p class="pt-empty">${t('pt.noPositions')}</p>`}

      <h2 class="pt-h">${t('pt.orders')} <span>${acct.orders.length}</span></h2>
      ${acct.orders.length ? `<ul class="pt-list">${acct.orders.map((o) => `<li class="pt-order">
        <div class="pt-row1">${ctx.logo(o, 22)}<strong>${esc(o.label)}</strong><span class="pt-badge ${o.side}">${sideLabel(o.side)} · ${typeLabel(o.type)} ${o.lev}×</span></div>
        <div class="pt-row2">${qtyFmt(o.qty)} @ ${money(o.price)} · TP ${o.tp != null ? money(o.tp) : '—'} · SL ${o.sl != null ? money(o.sl) : '—'}</div>
        <div class="pt-actions"><button type="button" class="btn btn-sm" data-cancel="${esc(o.id)}">${t('pt.cancel')}</button></div></li>`).join('')}</ul>`
        : `<p class="pt-empty">${t('pt.noOrders')}</p>`}

      <h2 class="pt-h">${t('pt.history')} <span>${acct.history.length}</span></h2>
      ${acct.history.length ? `<ul class="pt-list pt-hist">${acct.history.slice(0, 50).map((h) => `<li>
        <div class="pt-row1">${ctx.logo(h, 20)}<strong>${esc(h.label)}</strong><span class="pt-badge ${h.side}">${h.side === 'long' ? 'LONG' : 'SHORT'} ${h.lev}×</span>
          <span class="pt-reason r-${h.reason}">${t(`pt.reason.${h.reason}`)}</span><span class="pt-pnl ${cls(h.net)}">${signed(h.net)}</span></div>
        <div class="pt-row2">${qtyFmt(h.qty)} · ${money(h.entry)} → ${money(h.exit)} · ${t('pt.feesShort')} ${money(h.fees)} · ${ctx.day(h.closedAt)} ${ctx.time(h.closedAt)}</div></li>`).join('')}</ul>`
        : `<p class="pt-empty">${t('pt.noHistory')}</p>`}

      <h2 class="pt-h">${t('pt.stats')}</h2>
      <dl class="pt-kv pt-stats">${stats().map(([k, v, c]) => `<div><dt>${k}</dt><dd class="${v === ctx.ND ? '' : c || ''}">${v}</dd></div>`).join('')}</dl>

      <p class="consent-small pt-disc">${t('pt.disclaimer')}</p>
      <button type="button" class="btn btn-sm pt-reset" data-reset>${t('pt.reset')}</button>`;

    el.querySelector('[data-new]').addEventListener('click', openPicker);
    el.querySelector('[data-reset]').addEventListener('click', () => {
      if (!confirm(t('pt.resetConfirm'))) return;
      acct = null;
      try { localStorage.removeItem(`marches:${KEY}`); } catch { /* rien */ }
      render(el);
    });
    el.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => {
      acct.orders = acct.orders.filter((o) => o.id !== b.dataset.cancel);
      save();
      render(el);
    }));
    el.querySelectorAll('[data-manage]').forEach((b) => b.addEventListener('click', () => openManage(b.dataset.manage)));
    el.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => {
      const p = acct.positions.find((x) => x.id === b.dataset.close);
      if (p) closeManual(p, 1);
    }));
  }

  function closeManual(p, fraction) {
    const q = ctx.quote(p);
    if (!q.ok) { ctx.toast(t(`pt.why.${q.reason || 'na'}`, { c: q.currency || '' }), 'neg'); return false; }
    const h = closePosition(p, q.price, fraction, 'manual');
    save();
    recordEquity();
    notify({ type: 'closed', h });
    ctx.changed();
    return true;
  }

  /* ---------- Fenêtres (ticket, gestion, choix d'actif) ---------- */
  const modal = document.createElement('div');
  modal.id = 'trade';
  modal.className = 'snap';
  modal.hidden = true;
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'trade-title');
  modal.innerHTML = '<div class="snap-card trade-card" id="trade-card"></div>';
  document.body.append(modal);
  const card = modal.querySelector('#trade-card');
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  function showModal() { modal.hidden = false; document.body.style.overflow = 'hidden'; }
  function closeModal() {
    if (modal.hidden) return;
    modal.hidden = true;
    ticket = null;
    manageId = null;
    picker = null;
    if ($chartOpen()) return;
    document.body.style.overflow = '';
  }
  const $chartOpen = () => !document.querySelector('#chart')?.hidden;
  const segHTML = (key, opts, cur, extraCls = '') => `<div class="seg seg-wide ${extraCls}" role="group">${opts.map(([v, label, c]) =>
    `<button type="button" data-k="${key}" data-v="${v}" class="${c || ''}" aria-pressed="${String(cur) === String(v)}">${label}</button>`).join('')}</div>`;

  /* Choix d'un actif */
  function openPicker() {
    let list = ctx.assets();
    card.innerHTML = `<h2 id="trade-title">${t('pt.pick')}</h2>
      <div class="alert-input"><input id="pt-search" type="search" placeholder="${esc(t('pt.search'))}" autocomplete="off" enterkeyhint="search"></div>
      <ul class="pt-pick" id="pt-pick"></ul>
      <div class="snap-actions"><button type="button" class="btn" data-x>${t('snap.close')}</button></div>`;
    const ul = card.querySelector('#pt-pick');
    const draw = (f = card.querySelector('#pt-search')?.value || '') => {
      list = ctx.assets();
      const s = f.trim().toLowerCase();
      if (!list.length) { ul.innerHTML = `<li class="pt-empty">${t('loading')}</li>`; return; }
      const items = list.filter((a) => !s || a.label.toLowerCase().includes(s) || (a.name || '').toLowerCase().includes(s)).slice(0, 120);
      ul.innerHTML = items.length ? items.map((a, i) => `<li><button type="button" data-i="${list.indexOf(a)}">${ctx.logo(a, 24)}<span class="pk-l"><strong>${esc(a.label)}</strong><small>${esc(a.name || '')} · ${a.kind === 'c' ? t('fav.crypto') : t('fav.stock')}</small></span>
        <span class="pk-p">${isNum(a.price) ? money(a.price) : ctx.ND}<small class="${cls(a.chg)}">${ctx.pct(a.chg)}</small></span></button></li>`).join('')
        : `<li class="pt-empty">${t('pt.noMatch')}</li>`;
    };
    draw();
    picker = draw;
    card.querySelector('#pt-search').addEventListener('input', (e) => draw(e.target.value));
    ul.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (b) openTicket(list[Number(b.dataset.i)]);
    });
    card.querySelector('[data-x]').addEventListener('click', closeModal);
    showModal();
    card.querySelector('#pt-search').focus();
  }

  /* Ticket d'ordre */
  /** Ticket d'ordre ; `pre` peut fixer le sens, le type et le prix (ordre passé depuis le graphique). */
  function openTicket(asset, pre = {}) {
    picker = null;
    if (!acct) { create(CAPITALS[1]); ctx.toast(t('pt.t.created', { c: money(CAPITALS[1]) })); }
    ticket = {
      asset: assetOf(asset), side: pre.side === 'short' ? 'short' : 'long', type: ['limit', 'stop'].includes(pre.type) ? pre.type : 'market',
      mode: 'usd', lev: 1, price: isNum(pre.price) ? ctx.fmtInput(pre.price) : '', amount: '', tp: '', sl: '',
    };
    drawTicket();
    showModal();
  }

  function readTicket() {
    const k = ticket;
    for (const f of ['price', 'amount', 'tp', 'sl']) {
      const input = card.querySelector(`#tr-${f}`);
      if (input) k[f] = input.value;
    }
  }

  /** Calcul du ticket : prix d'entrée, quantité, marge, frais, liquidation, P&L à TP / SL, erreurs. */
  function computeTicket() {
    const k = ticket, q = ctx.quote(k.asset), P = ctx.parse;
    const r = { q, errors: [] };
    r.entry = k.type === 'market' ? q.price : P(k.price);
    const amt = P(k.amount);
    if (isNum(r.entry) && r.entry > 0 && isNum(amt) && amt > 0) {
      r.qty = k.mode === 'usd' ? amt / r.entry : amt;
      r.notional = r.qty * r.entry;
      r.margin = r.notional / k.lev;
      r.fee = r.notional * FEE;
      r.after = acct.cash - r.margin - r.fee;
    }
    r.liq = isNum(r.entry) ? liqPrice(k.side, r.entry, k.lev) : null;
    const d = dirOf(k.side);
    r.tp = k.tp.trim() ? P(k.tp) : null;
    r.sl = k.sl.trim() ? P(k.sl) : null;
    if (isNum(r.qty) && isNum(r.tp)) r.tpPnl = (r.tp - r.entry) * r.qty * d - r.fee - r.qty * r.tp * FEE;
    if (isNum(r.qty) && isNum(r.sl)) r.slPnl = Math.max(-r.margin, (r.sl - r.entry) * r.qty * d) - r.fee - r.qty * r.sl * FEE;
    if (isNum(r.tpPnl) && isNum(r.slPnl) && r.slPnl < 0) r.rr = r.tpPnl / -r.slPnl;

    // Erreurs, dans l'ordre où elles se corrigent.
    if (k.type === 'market' && !q.ok) r.errors.push(t(`pt.why.${q.reason || 'na'}`, { c: q.currency || '' }));
    if (k.type !== 'market' && (!isNum(q.price) || q.reason === 'currency')) r.errors.push(t(`pt.why.${q.reason || 'na'}`, { c: q.currency || '' }));
    if (k.type !== 'market') {
      if (!isNum(r.entry) || r.entry <= 0) r.errors.push(t('pt.err.price'));
      else if (isNum(q.price)) {
        const above = r.entry > q.price;
        if (k.type === 'limit' && k.side === 'long' && above) r.errors.push(t('pt.err.limitLong'));
        if (k.type === 'limit' && k.side === 'short' && !above) r.errors.push(t('pt.err.limitShort'));
        if (k.type === 'stop' && k.side === 'long' && !above) r.errors.push(t('pt.err.stopLong'));
        if (k.type === 'stop' && k.side === 'short' && above) r.errors.push(t('pt.err.stopShort'));
      }
    }
    if (!isNum(r.qty)) r.errors.push(t('pt.err.amount'));
    if (k.tp.trim() && (!isNum(r.tp) || (isNum(r.entry) && (r.tp - r.entry) * d <= 0))) r.errors.push(t('pt.err.tp'));
    if (k.sl.trim() && (!isNum(r.sl) || (isNum(r.entry) && (r.sl - r.entry) * d >= 0))) r.errors.push(t('pt.err.sl'));
    else if (isNum(r.sl) && r.liq != null && (r.sl - r.liq) * d <= 0) r.errors.push(t('pt.err.slLiq', { p: money(r.liq) }));
    if (isNum(r.after) && r.after < -1e-9) r.errors.push(t('pt.err.funds'));
    if (acct.positions.length >= MAX_OPEN) r.errors.push(t('pt.err.maxPos'));
    if (k.type !== 'market' && acct.orders.length >= MAX_ORDERS) r.errors.push(t('pt.err.maxOrders'));
    return r;
  }

  function drawTicket() {
    const k = ticket, a = k.asset, q = ctx.quote(a);
    const unit = k.mode === 'usd' ? '$' : esc(a.label);
    card.innerHTML = `
      <div class="trade-head">${ctx.logo(a, 32)}<div class="th-l"><h2 id="trade-title">${esc(a.label)}</h2><p>${esc(a.name || '')}</p></div>
        <div class="th-p"><strong>${isNum(q.price) ? money(q.price) : ctx.ND}</strong><small class="${cls(q.chg)}">${ctx.pct(q.chg)}</small></div></div>
      ${q.ok ? '' : `<p class="pt-note">${esc(t(`pt.why.${q.reason || 'na'}`, { c: q.currency || '' }))}</p>`}
      ${segHTML('side', [['long', t('pt.buy'), 'buy'], ['short', t('pt.sell'), 'sell']], k.side, 'trade-side')}
      ${segHTML('type', [['market', t('pt.market')], ['limit', t('pt.limit')], ['stop', t('pt.stop')]], k.type)}
      ${k.type === 'market' ? '' : `<label for="tr-price">${t(k.type === 'limit' ? 'pt.limitPrice' : 'pt.stopPrice')}</label>
        <div class="alert-input"><input id="tr-price" type="text" inputmode="decimal" autocomplete="off" value="${esc(k.price)}" placeholder="${isNum(q.price) ? ctx.NF2().format(q.price) : ''}"><span>$</span></div>`}
      <label for="tr-amount">${t(k.mode === 'usd' ? 'pt.amountUsd' : 'pt.qty')}</label>
      <div class="trade-amount"><div class="alert-input"><input id="tr-amount" type="text" inputmode="decimal" autocomplete="off" value="${esc(k.amount)}"><span>${unit}</span></div>
        ${segHTML('mode', [['usd', '$'], ['qty', t('pt.qtyShort')]], k.mode)}</div>
      <div class="trade-quick">${[10, 25, 50, 100].map((p) => `<button type="button" class="btn btn-sm" data-pct="${p}">${p} %</button>`).join('')}</div>
      <label>${t('pt.lev')}</label>
      ${segHTML('lev', LEVERAGES.map((l) => [l, `${l}×`]), k.lev)}
      <div class="trade-tpsl">
        <div><label for="tr-tp">${t('pt.tp')} <small>${t('pt.optional')}</small></label>
          <div class="alert-input"><input id="tr-tp" type="text" inputmode="decimal" autocomplete="off" value="${esc(k.tp)}"><span>$</span></div><small class="tr-hint" id="tr-tp-h"></small></div>
        <div><label for="tr-sl">${t('pt.sl')} <small>${t('pt.optional')}</small></label>
          <div class="alert-input"><input id="tr-sl" type="text" inputmode="decimal" autocomplete="off" value="${esc(k.sl)}"><span>$</span></div><small class="tr-hint" id="tr-sl-h"></small></div>
      </div>
      <dl class="pt-kv trade-sum" id="tr-sum"></dl>
      <p class="alert-msg" id="tr-msg" hidden></p>
      <div class="snap-actions"><button type="button" class="btn" data-x>${t('snap.close')}</button>
        <button type="button" class="btn ${k.side === 'long' ? 'btn-buy' : 'btn-sell'}" id="tr-go">${t(k.side === 'long' ? 'pt.submitBuy' : 'pt.submitSell', { l: esc(a.label) })}</button></div>
      <p class="snap-hint">${t('pt.ticketNote')}</p>`;
    card.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => {
      readTicket();
      const key = b.dataset.k;
      const prev = k[key];
      k[key] = key === 'lev' ? Number(b.dataset.v) : b.dataset.v;
      if (key === 'mode' && prev !== k.mode) convertAmount(prev);
      drawTicket();
    }));
    card.querySelectorAll('[data-pct]').forEach((b) => b.addEventListener('click', () => {
      readTicket();
      const r = computeTicket();
      if (!isNum(r.entry) || r.entry <= 0) { updateTicket(); return; }
      const notional = (acct.cash * (Number(b.dataset.pct) / 100)) / (1 / k.lev + FEE) * 0.9999;
      k.amount = k.mode === 'usd' ? trim(notional, 2) : trim(notional / r.entry, 8);
      card.querySelector('#tr-amount').value = k.amount;
      updateTicket();
    }));
    card.querySelectorAll('input').forEach((i) => i.addEventListener('input', () => { readTicket(); updateTicket(); }));
    card.querySelector('[data-x]').addEventListener('click', closeModal);
    card.querySelector('#tr-go').addEventListener('click', submitTicket);
    updateTicket();
  }
  const trim = (v, d) => String(Math.floor(v * 10 ** d) / 10 ** d);
  function convertAmount(prevMode) {
    const r = computeTicket();
    const amt = ctx.parse(ticket.amount);
    if (!isNum(amt) || !isNum(r.entry) || r.entry <= 0) return;
    ticket.amount = prevMode === 'usd' ? trim(amt / r.entry, 8) : trim(amt * r.entry, 2);
  }

  function updateTicket() {
    if (!ticket) return;
    const r = computeTicket();
    const row = (k, v, c = '') => `<div><dt>${k}</dt><dd class="${c}">${v}</dd></div>`;
    card.querySelector('#tr-sum').innerHTML = [
      row(t(ticket.type === 'market' ? 'pt.entryEst' : 'pt.entry'), isNum(r.entry) ? money(r.entry) : ctx.ND),
      row(t('pt.qty'), isNum(r.qty) ? `${qtyFmt(r.qty)} ${esc(ticket.asset.label)}` : ctx.ND),
      row(t('pt.value'), isNum(r.notional) ? money(r.notional) : ctx.ND),
      row(t('pt.marginReq'), isNum(r.margin) ? money(r.margin) : ctx.ND),
      row(t('pt.fees'), isNum(r.fee) ? money(r.fee) : ctx.ND),
      row(t('pt.liq'), r.liq != null && isNum(r.liq) ? money(r.liq) : '—'),
      row(t('pt.after'), isNum(r.after) ? money(r.after) : money(acct.cash), isNum(r.after) && r.after < 0 ? 'neg' : ''),
      row(t('pt.rr'), isNum(r.rr) ? `1 : ${ctx.NF2().format(r.rr)}` : '—'),
    ].join('');
    const hint = (id, v) => { const el = card.querySelector(id); el.textContent = isNum(v) ? `${signed(v)} ${t('pt.netFees')}` : ''; el.className = `tr-hint ${cls(v)}`; };
    hint('#tr-tp-h', r.tpPnl);
    hint('#tr-sl-h', r.slPnl);
    const go = card.querySelector('#tr-go');
    go.disabled = r.errors.length > 0;
    const msg = card.querySelector('#tr-msg');
    // On n'affiche une erreur qu'une fois le montant saisi (pas d'erreur sur un formulaire vide).
    const show = ticket.amount.trim() || ticket.price.trim() || ticket.tp.trim() || ticket.sl.trim() || !r.q.ok;
    msg.textContent = show && r.errors.length ? r.errors[0] : '';
    msg.hidden = !(show && r.errors.length);
  }

  function submitTicket() {
    readTicket();
    const r = computeTicket();
    if (r.errors.length) { updateTicket(); return; }
    const k = ticket;
    const base = { side: k.side, qty: r.qty, lev: k.lev, tp: r.tp, sl: r.sl };
    if (k.type === 'market') {
      const res = openPosition(k.asset, { ...base, price: r.q.price });
      if (res.error) { ctx.toast(t(`pt.err.${res.error}`), 'neg'); return; }
      save();
      recordEquity();
      notify({ type: 'filled', p: res.position });
    } else {
      acct.orders.push({ id: nextId(), ...k.asset, ...base, type: k.type, price: r.entry, createdAt: Date.now() });
      save();
      ctx.toast(t('pt.t.placed', { s: sideLabel(k.side), ty: typeLabel(k.type).toLowerCase(), q: qtyFmt(r.qty), l: k.asset.label, p: money(r.entry) }));
    }
    closeModal();
    ctx.changed();
  }

  /* Gestion d'une position : TP / SL, clôture partielle ou totale */
  function openManage(id) {
    picker = null;
    manageId = id;
    drawManage();
    showModal();
  }
  function drawManage() {
    const p = acct.positions.find((x) => x.id === manageId);
    if (!p) { closeModal(); return; }
    const q = ctx.quote(p);
    const pnl = isNum(q.price) ? Math.max(-p.margin, upnl(p, q.price)) : null;
    const liq = liqPrice(p.side, p.entry, p.lev);
    card.innerHTML = `
      <div class="trade-head">${ctx.logo(p, 32)}<div class="th-l"><h2 id="trade-title">${esc(p.label)} <span class="pt-badge ${p.side}">${p.side === 'long' ? 'LONG' : 'SHORT'} ${p.lev}×</span></h2>
        <p>${qtyFmt(p.qty)} @ ${money(p.entry)}</p></div>
        <div class="th-p"><strong>${isNum(q.price) ? money(q.price) : ctx.ND}</strong><small class="${cls(pnl)}">${signed(pnl)}</small></div></div>
      <dl class="pt-kv"><div><dt>${t('pt.marginReq')}</dt><dd>${money(p.margin)}</dd></div><div><dt>${t('pt.liq')}</dt><dd>${liq != null ? money(liq) : '—'}</dd></div>
        <div><dt>${t('pt.openedAt')}</dt><dd>${ctx.day(p.openedAt)} ${ctx.time(p.openedAt)}</dd></div><div><dt>${t('pt.feesShort')}</dt><dd>${money(p.fees)}</dd></div></dl>
      <div class="trade-tpsl">
        <div><label for="mg-tp">${t('pt.tp')}</label><div class="alert-input"><input id="mg-tp" type="text" inputmode="decimal" value="${p.tp != null ? ctx.fmtInput(p.tp) : ''}"><span>$</span></div></div>
        <div><label for="mg-sl">${t('pt.sl')}</label><div class="alert-input"><input id="mg-sl" type="text" inputmode="decimal" value="${p.sl != null ? ctx.fmtInput(p.sl) : ''}"><span>$</span></div></div>
      </div>
      <p class="alert-msg" id="mg-msg" hidden></p>
      <button type="button" class="btn" id="mg-save">${t('pt.saveTpSl')}</button>
      <label>${t('pt.closePos')}</label>
      <div class="trade-quick">${[25, 50, 100].map((f) => `<button type="button" class="btn btn-sm" data-cf="${f}">${f} %</button>`).join('')}</div>
      <div class="snap-actions"><button type="button" class="btn" data-x>${t('snap.close')}</button></div>`;
    const msg = card.querySelector('#mg-msg');
    card.querySelector('#mg-save').addEventListener('click', () => {
      const P = ctx.parse, d = dirOf(p.side);
      const tpS = card.querySelector('#mg-tp').value.trim(), slS = card.querySelector('#mg-sl').value.trim();
      const tp = tpS ? P(tpS) : null, sl = slS ? P(slS) : null;
      const ref = isNum(q.price) ? q.price : p.entry;
      let err = '';
      if (tpS && (!isNum(tp) || (tp - ref) * d <= 0)) err = t('pt.err.tpNow');
      else if (slS && (!isNum(sl) || (sl - ref) * d >= 0)) err = t('pt.err.slNow');
      else if (isNum(sl) && liq != null && (sl - liq) * d <= 0) err = t('pt.err.slLiq', { p: money(liq) });
      if (err) { msg.textContent = err; msg.hidden = false; return; }
      p.tp = tp; p.sl = sl;
      save();
      ctx.toast(t('pt.t.saved', { l: p.label }));
      closeModal();
      ctx.changed();
    });
    card.querySelectorAll('[data-cf]').forEach((b) => b.addEventListener('click', () => {
      if (closeManual(p, Number(b.dataset.cf) / 100)) {
        if (acct.positions.some((x) => x.id === p.id)) drawManage(); else closeModal();
      }
    }));
    card.querySelector('[data-x]').addEventListener('click', closeModal);
  }

  /** Données rafraîchies : moteur, puis mise à jour du ticket ouvert (cours). */
  function onData() {
    const ev = run();
    if (picker && !modal.hidden) picker();
    if (ticket && !modal.hidden) {
      const head = card.querySelector('.th-p strong');
      const q = ctx.quote(ticket.asset);
      if (head) head.textContent = isNum(q.price) ? money(q.price) : ctx.ND;
      updateTicket();
    }
    return ev;
  }

  /** Positions et ordres en attente sur un actif (graphique de trading). */
  function forAsset(a) {
    const same = (x) => x.kind === a.kind && x.assetId === a.assetId;
    return { positions: acct ? acct.positions.filter(same) : [], orders: acct ? acct.orders.filter(same) : [] };
  }

  /** Modifie le TP ou le SL d'une position (glisser sur le graphique). Renvoie un message d'erreur ou null. */
  function setLevel(id, type, price) {
    const p = acct?.positions.find((x) => x.id === id);
    if (!p || !isNum(price) || price <= 0) return t('pt.err.price');
    const d = dirOf(p.side), q = ctx.quote(p);
    const ref = isNum(q.price) ? q.price : p.entry;
    const liq = liqPrice(p.side, p.entry, p.lev);
    if (type === 'tp' && (price - ref) * d <= 0) return t('pt.err.tpNow');
    if (type === 'sl' && (price - ref) * d >= 0) return t('pt.err.slNow');
    if (type === 'sl' && liq != null && (price - liq) * d <= 0) return t('pt.err.slLiq', { p: money(liq) });
    const v = Number(price.toPrecision(8));
    if (type === 'tp') p.tp = v; else p.sl = v;
    save();
    ctx.toast(t(type === 'tp' ? 'pt.t.tpSet' : 'pt.t.slSet', { l: p.label, p: money(v) }));
    ctx.changed();
    return null;
  }

  return {
    forAsset,
    setLevel,
    render,
    run,
    onData,
    openTicket,
    closeModal,
    isOpen: () => !modal.hidden,
    exposure: () => (acct ? [...acct.positions, ...acct.orders] : []),
  };
}
