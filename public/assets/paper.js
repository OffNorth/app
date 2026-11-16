// Papertrading : compte de démonstration en argent fictif, stocké uniquement sur l'appareil (marches:paper).
// Aucun ordre réel n'est transmis. Exécution au cours affiché lors des vérifications (à chaque rafraîchissement
// des données, toutes les 60 s quand l'app est ouverte) ; jamais sur un cours absent ou ancien.
// Multi-devises : prix, TP, SL et ordres dans la devise de l'actif (points pour un indice) ; compte, marge,
// frais et P&L en dollars US, convertis au taux de change du moment (fx = dollars pour 1 unité de devise).

import * as E from './paper-engine.js';
import { CAPITALS, FEE, LEVERAGES, MAX_ORDERS, MAX_OPEN, dirOf, liqPrice } from './paper-engine.js';

export { liqPrice };
const KEY = 'paper';
const SYNC_KEY = 'paperSync'; // { code, rev, notify } : compte synchronisé (facultatif)

export function createPaper(ctx) {
  const { t, store, esc, isNum } = ctx;
  let acct = E.normalize(store.get(KEY));
  let sync = store.get(SYNC_KEY);
  let syncError = false;
  let board = null; // classement (groupes) chargé à l'affichage
  let ticket = null; // ticket d'ordre ouvert
  let manageId = null; // position en cours de gestion
  let picker = null; // fonction de redessin du sélecteur d'actif ouvert

  /* ---------- Compte (moteur partagé avec le serveur : paper-engine.js) ---------- */
  function save() {
    store.set(KEY, acct);
    if (sync) schedulePush();
  }
  const nextId = () => E.nextId(acct);
  function create(initial) {
    acct = E.newAccount(initial);
    save();
  }
  const assetOf = E.assetOf;
  const fxOf = (p, q = ctx.quote(p)) => E.fxOf(p, q);
  const upnl = (p, price, fx = fxOf(p)) => E.upnl(p, price, fx);
  const liqOf = (p, fx = fxOf(p)) => E.liqOf(p, fx);
  const px = (v, a) => ctx.price(v, a.kind, a.ccy);
  const summary = () => E.summary(acct, ctx.quote);
  function recordEquity() { if (E.recordEquity(acct, ctx.quote)) save(); }
  const openPosition = (asset, args) => E.openPosition(acct, asset, args);
  const closePosition = (p, price, fraction = 1, reason = 'manual', fx = fxOf(p)) => E.closePosition(acct, p, price, fraction, reason, fx);

  /** Moteur : ordres en attente puis TP / SL / liquidation, au cours actuel. Renvoie les événements. */
  function run() {
    if (!acct) return [];
    const events = E.runEngine(acct, ctx.quote);
    if (events.length) save();
    recordEquity();
    for (const e of events) notify(e);
    return events;
  }

  /* ---------- Synchronisation (facultative) ----------
   * Le compte est copié sur le serveur, protégé par un code secret (seule son empreinte y est stockée).
   * Le serveur l'exécute toutes les 5 minutes, même app fermée ; l'app reprend la version la plus récente.
   */
  let pushTimer = 0, pushing = false;
  function schedulePush() { clearTimeout(pushTimer); pushTimer = setTimeout(push, 500); }
  function setSync(v) { sync = v; if (v) store.set(SYNC_KEY, v); else try { localStorage.removeItem(`marches:${SYNC_KEY}`); } catch { /* rien */ } }
  function adopt(r) {
    const a = E.normalize(r.data);
    if (a) { acct = a; store.set(KEY, acct); }
    setSync({ ...sync, rev: r.rev });
    ctx.changed();
  }
  async function push() {
    if (!sync || !acct || pushing) return;
    pushing = true;
    try {
      const r = await ctx.api('paper.put', { code: sync.code, data: acct, rev: sync.rev });
      setSync({ ...sync, rev: r.rev });
      syncError = false;
    } catch (err) {
      if (err.status === 409 && err.body?.data) { adopt(err.body); ctx.toast(t('sync.conflict')); }
      else if (err.status === 404) { setSync(null); ctx.toast(t('sync.gone'), 'neg'); ctx.changed(); }
      else syncError = true;
    } finally { pushing = false; }
  }
  async function pull() {
    if (!sync) return;
    try {
      const r = await ctx.api('paper.get', { code: sync.code });
      syncError = false;
      if (r.rev !== sync.rev) adopt(r);
    } catch (err) {
      if (err.status === 404) { setSync(null); ctx.toast(t('sync.gone'), 'neg'); ctx.changed(); } else syncError = true;
    }
  }
  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => B32[b & 31]).join('');
  const showCode = (c) => c.match(/.{1,4}/g).join('-');
  const readCode = (v) => String(v || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  async function enableSync() {
    if (!acct) create(CAPITALS[1]);
    const code = newCode();
    const r = await ctx.api('paper.put', { code, data: acct, create: true });
    setSync({ code, rev: r.rev, notify: false });
  }
  async function joinSync(raw) {
    const code = readCode(raw);
    if (code.length !== 24) throw Object.assign(new Error('code'), { status: 400 });
    const r = await ctx.api('paper.get', { code });
    if (acct && acct.history.length + acct.positions.length > 0 && !confirm(t('sync.replaceConfirm'))) return false;
    setSync({ code, rev: r.rev, notify: false });
    adopt(r);
    return true;
  }
  async function stopSync(remove) {
    if (!sync) return;
    if (remove) await ctx.api('paper.delete', { code: sync.code }).catch(() => {});
    else if (sync.notify) await ctx.linkDevice(sync.code, false).catch(() => {});
    setSync(null);
    board = null;
  }
  async function loadBoard() {
    if (!sync) return;
    try { board = await ctx.api('group.board', { code: sync.code }); } catch { board = board || { groups: [], error: true }; }
  }

  /* ---------- Formats ---------- */
  const money = (v) => ctx.money(v);
  const signed = (v) => (isNum(v) ? `${v > 0.004 ? '+' : v < -0.004 ? '−' : ''}${ctx.money(Math.abs(v))}` : ctx.ND);
  const cls = (v) => (!isNum(v) || Math.abs(v) < 0.005 ? '' : v > 0 ? 'pos' : 'neg');
  const sideLabel = (s) => t(s === 'long' ? 'pt.long' : 'pt.short');
  const typeLabel = (ty) => t(`pt.${ty}`);
  const qtyFmt = (v) => ctx.qty(v);

  function notify(e) {
    if (e.type === 'filled') ctx.toast(t('pt.t.filled', { s: sideLabel(e.p.side), q: qtyFmt(e.p.qty), l: e.p.label, p: px(e.p.entry, e.p) }));
    else if (e.type === 'fail') ctx.toast(t('pt.t.fail', { l: e.o.label }), 'neg');
    else if (e.type === 'closed') {
      const key = { tp: 'pt.t.tp', sl: 'pt.t.sl', liq: 'pt.t.liq' }[e.h.reason] || 'pt.t.closed';
      ctx.toast(t(key, { l: e.h.label, pnl: signed(e.h.net) }), e.h.net >= 0 ? 'pos' : 'neg');
    }
  }

  /* ---------- Comparaison au marché (S&P 500, Bitcoin) sur la même période ----------
   * Bougies réelles (/api/candles, Yahoo Finance) : cours de départ = dernière clôture connue avant la création
   * du compte ; cours actuel = dernière bougie. Indice absent ou trop ancien → « n/d », rien d'extrapolé.
   */
  const BENCH = [
    { key: 'spx', kind: 'i', symbol: '^GSPC', label: 'S&P 500' },
    { key: 'btc', kind: 'c', symbol: 'BTC', id: 'bitcoin', label: 'Bitcoin' },
  ];
  let bench = null, benchLoading = false;
  const benchFresh = () => bench && bench.since === acct.createdAt && Date.now() - bench.at < 10 * 60_000;
  async function loadBench() {
    if (benchLoading || !acct || benchFresh()) return false;
    benchLoading = true;
    const since = acct.createdAt;
    const hourly = Date.now() - since < 80 * 86_400_000; // bougies horaires sur 3 mois, sinon journalières (5 ans)
    const step = (hourly ? 3600 : 86_400) * 1000;
    const series = {};
    await Promise.all(BENCH.map(async (b) => {
      try {
        const r = await fetch(`/api/candles?kind=${b.kind}&symbol=${encodeURIComponent(b.symbol)}${b.id ? `&id=${b.id}` : ''}&tf=${hourly ? '1h' : '1d'}`);
        if (!r.ok) return;
        const d = await r.json();
        const c = (d.candles || []).map((x) => [x[0] * 1000, x[4]]).filter((x) => isNum(x[1]) && x[1] > 0);
        // Dernière bougie terminée avant la création du compte (heure de fin ≤ création).
        let i = -1;
        for (let k = 0; k < c.length; k++) if (Math.min(c[k + 1]?.[0] ?? Infinity, c[k][0] + step) <= since) i = k;
        if (i < 0 || c.length - 1 <= i && Date.now() - c[i][0] > 4 * 86_400_000) return;
        const start = c[i][1], last = c[c.length - 1][1];
        series[b.key] = { start, pct: (last / start - 1) * 100, pts: [[since, start], ...c.slice(i + 1)], source: d.source };
      } catch { /* indisponible : n/d */ }
    }));
    bench = { since, at: Date.now(), series };
    benchLoading = false;
    return true;
  }

  /* ---------- Onglet Compte ---------- */
  function equitySVG() {
    const pts = acct.equity.map(([x, y]) => [x, y]);
    const s = summary();
    if (s.valued) pts.push([Date.now(), s.equity]);
    if (pts.length < 2) return '';
    const W = 320, H = 70;
    // Indices de comparaison ramenés à la même mise de départ que le compte.
    const lines = BENCH.map((b) => {
      const sr = bench?.since === acct.createdAt ? bench.series[b.key] : null;
      return sr ? { key: b.key, pts: sr.pts.map(([x, v]) => [x, (acct.initial * v) / sr.start]) } : null;
    }).filter(Boolean);
    const all = [...pts, ...lines.flatMap((l) => l.pts)];
    const xs = pts.map((p) => p[0]), ys = all.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs, ...lines.map((l) => l.pts[l.pts.length - 1][0])), y0 = Math.min(...ys, acct.initial), y1 = Math.max(...ys, acct.initial);
    const X = (x) => (x1 === x0 ? 0 : ((Math.max(x0, x) - x0) / (x1 - x0)) * W);
    const Y = (y) => (y1 === y0 ? H / 2 : H - 4 - ((y - y0) / (y1 - y0)) * (H - 8));
    const path = (p) => p.map((q, i) => `${i ? 'L' : 'M'}${X(q[0]).toFixed(1)},${Y(q[1]).toFixed(1)}`).join('');
    const d = path(pts);
    const up = pts[pts.length - 1][1] >= acct.initial;
    return `<svg class="pt-curve ${up ? 'up' : 'down'}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(t('pt.equityChart'))}">
      <line x1="0" x2="${W}" y1="${Y(acct.initial).toFixed(1)}" y2="${Y(acct.initial).toFixed(1)}" class="base"/>
      ${lines.map((l) => `<path d="${path(l.pts)}" class="bench b-${l.key}"/>`).join('')}
      <path d="${d}L${X(pts[pts.length - 1][0]).toFixed(1)},${H}L0,${H}Z" class="area"/><path d="${d}" class="line"/></svg>`;
  }
  function benchHTML(s) {
    const fresh = bench?.since === acct.createdAt;
    const item = (key, label, v) => `<span class="pt-bench-i"><i class="sw sw-${key}"></i>${esc(label)} <b class="${cls(v)}">${isNum(v) ? ctx.pct(v) : fresh ? ctx.ND : '…'}</b></span>`;
    const src = [...new Set(Object.values(bench?.series || {}).map((x) => x.source).filter(Boolean))].join(', ');
    return `<div class="pt-bench">${item('acct', t('pt.bench.acct'), s.valued ? s.pnlPct : null)}
      ${BENCH.map((b) => item(b.key, b.label, fresh ? bench.series[b.key]?.pct : null)).join('')}
      <small>${t('pt.bench.note')}${src ? ` · ${esc(src)}` : ''}</small></div>`;
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
    const pnl = isNum(q.price) ? Math.max(-p.margin, upnl(p, q.price, fxOf(p, q))) : null;
    const pct = pnl == null ? null : (pnl / p.margin) * 100;
    const liq = liqOf(p, fxOf(p, q));
    const note = q.ok ? '' : `<span class="pt-note">${esc(t(`pt.why.${q.reason || 'na'}`, { c: q.ccy || '' }))}</span>`;
    return `<li class="pt-pos" data-id="${esc(p.id)}">
      <div class="pt-row1">${ctx.logo(p, 22)}<strong>${esc(p.label)}</strong><span class="pt-badge ${p.side}">${p.side === 'long' ? 'LONG' : 'SHORT'} ${p.lev}×</span>
        <span class="pt-pnl ${cls(pnl)}">${signed(pnl)} <small>${pct == null ? '' : ctx.pct(pct)}</small></span></div>
      <div class="pt-row2">${qtyFmt(p.qty)} @ ${px(p.entry, p)} · ${t('pt.nowShort')} ${isNum(q.price) ? px(q.price, p) : ctx.ND}</div>
      <div class="pt-row3">TP ${p.tp != null ? px(p.tp, p) : '—'} · SL ${p.sl != null ? px(p.sl, p) : '—'} · ${t('pt.liqShort')} ${liq != null ? px(liq, p) : '—'} ${note}</div>
      <div class="pt-actions"><button type="button" class="btn btn-sm" data-manage="${esc(p.id)}">${t('pt.manage')}</button>
        <button type="button" class="btn btn-sm" data-close="${esc(p.id)}">${t('pt.close')}</button>
        <button type="button" class="btn btn-sm" data-share="${esc(p.id)}">${t('share.btn')}</button></div>
    </li>`;
  }

  function render(el) {
    if (!acct && sync) { el.innerHTML = `<p class="pt-empty">${t('loading')}</p>`; pull().then(() => render(el)); return; }
    if (!acct) {
      el.innerHTML = `<div class="pt-welcome card">
        <h2>${t('pt.welcome')}</h2><p>${t('pt.welcomeP')}</p>
        <p class="pt-label">${t('pt.capital')}</p>
        <div class="seg seg-wide" role="group" aria-label="${esc(t('pt.capital'))}">${CAPITALS.map((c, i) =>
          `<button type="button" data-cap="${c}" aria-pressed="${i === 1}">${money(c)}</button>`).join('')}</div>
        <button type="button" class="btn btn-primary pt-create">${t('pt.create')}</button>
        <p class="consent-small">${t('pt.disclaimer')}</p></div>
        ${syncHTML()}`;
      bindSync(el); // nouvel appareil : on peut aussi retrouver un compte synchronisé avec son code
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
        ${benchHTML(s)}
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
        <div class="pt-row2">${qtyFmt(o.qty)} @ ${px(o.price, o)} · TP ${o.tp != null ? px(o.tp, o) : '—'} · SL ${o.sl != null ? px(o.sl, o) : '—'}</div>
        <div class="pt-actions"><button type="button" class="btn btn-sm" data-cancel="${esc(o.id)}">${t('pt.cancel')}</button></div></li>`).join('')}</ul>`
        : `<p class="pt-empty">${t('pt.noOrders')}</p>`}

      <h2 class="pt-h">${t('pt.history')} <span>${acct.history.length}</span></h2>
      ${acct.history.length ? `<ul class="pt-list pt-hist">${acct.history.slice(0, 50).map((h) => `<li>
        <div class="pt-row1">${ctx.logo(h, 20)}<strong>${esc(h.label)}</strong><span class="pt-badge ${h.side}">${h.side === 'long' ? 'LONG' : 'SHORT'} ${h.lev}×</span>
          <span class="pt-reason r-${h.reason}">${t(`pt.reason.${h.reason}`)}</span><span class="pt-pnl ${cls(h.net)}">${signed(h.net)}</span>
          <button type="button" class="pt-share" data-share-h="${esc(h.id)}" aria-label="${esc(t('share.btn'))}" title="${esc(t('share.btn'))}"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 14v5h14v-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
        <div class="pt-row2">${qtyFmt(h.qty)} · ${px(h.entry, h)} → ${px(h.exit, h)} · ${t('pt.feesShort')} ${money(h.fees)} · ${ctx.day(h.closedAt)} ${ctx.time(h.closedAt)}</div></li>`).join('')}</ul>`
        : `<p class="pt-empty">${t('pt.noHistory')}</p>`}

      <h2 class="pt-h">${t('pt.stats')}</h2>
      <dl class="pt-kv pt-stats">${stats().map(([k, v, c]) => `<div><dt>${k}</dt><dd class="${v === ctx.ND ? '' : c || ''}">${v}</dd></div>`).join('')}</dl>

      ${syncHTML()}
      <p class="consent-small pt-disc">${t('pt.disclaimer')}</p>
      <button type="button" class="btn btn-sm pt-reset" data-reset>${t('pt.reset')}</button>`;
    bindSync(el);
    if (!benchFresh()) loadBench().then((changed) => { if (changed && el.isConnected) render(el); });

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
    el.querySelectorAll('[data-share]').forEach((b) => b.addEventListener('click', () => {
      const p = acct.positions.find((x) => x.id === b.dataset.share);
      if (p) ctx.share(p, false);
    }));
    el.querySelectorAll('[data-share-h]').forEach((b) => b.addEventListener('click', () => {
      const h = acct.history.find((x) => x.id === b.dataset.shareH);
      if (h) ctx.share(h, true);
    }));
    el.querySelectorAll('[data-manage]').forEach((b) => b.addEventListener('click', () => openManage(b.dataset.manage)));
    el.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => {
      const p = acct.positions.find((x) => x.id === b.dataset.close);
      if (p) closeManual(p, 1);
    }));
  }

  /* ---------- Carte « Synchronisation et classement » ---------- */
  function syncHTML() {
    if (!sync) {
      return `<section class="card pt-sync"><h2>${t('sync.title')}</h2><p>${t('sync.pitch')}</p>
        <div class="pt-top-actions"><button type="button" class="btn btn-primary" data-sync="on">${t('sync.enable')}</button></div>
        <div class="pt-join"><div class="alert-input"><input id="pt-code" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${esc(t('sync.codePh'))}"></div>
          <button type="button" class="btn" data-sync="join">${t('sync.join')}</button></div>
        <p class="consent-small">${t('sync.privacy', { link: `<a href="${ctx.legalPrefix()}/confidentialite.html#demo">${t('alert.privacy')}</a>` })}</p></section>`;
    }
    const groups = board?.groups || [];
    const pct = (v) => (isNum(v) ? ctx.pct(v) : ctx.ND);
    return `<section class="card pt-sync"><h2>${t('sync.title')} <span class="pt-badge long">${t('sync.on')}</span></h2>
      ${syncError ? `<p class="pt-note">${t('sync.error')}</p>` : ''}
      <p>${t('sync.onText')}</p>
      <p class="pt-label">${t('sync.code')}</p>
      <div class="pt-code"><code>${esc(showCode(sync.code))}</code><button type="button" class="btn btn-sm" data-sync="copy">${t('sync.copy')}</button></div>
      <p class="consent-small">${t('sync.codeNote')}</p>
      <label class="pt-switch"><input type="checkbox" data-sync="notify" ${sync.notify ? 'checked' : ''}> ${t('sync.notify')}</label>
      <h3>${t('lb.title')}</h3>
      <div class="pt-join"><div class="alert-input"><input id="pt-pseudo" type="text" maxlength="20" autocomplete="nickname" value="${esc(board?.pseudo || '')}" placeholder="${esc(t('lb.pseudoPh'))}"></div>
        <button type="button" class="btn" data-sync="pseudo">${t('lb.savePseudo')}</button></div>
      ${groups.map((g) => `<div class="pt-board"><div class="pt-board-h"><strong>${esc(g.name)}</strong><span>${t('lb.code')} <code>${esc(g.code)}</code></span>
          <button type="button" class="alert-del" data-leave="${esc(g.code)}" aria-label="${esc(t('lb.leave'))}">✕</button></div>
        <ol>${g.members.map((m) => `<li class="${m.me ? 'me' : ''}"><span>${esc(m.pseudo || t('lb.anon'))}${m.me ? ` (${t('lb.me')})` : ''}</span>
          <span class="${isNum(m.pnlPct) && m.pnlPct > 0 ? 'pos' : isNum(m.pnlPct) && m.pnlPct < 0 ? 'neg' : ''}">${pct(m.pnlPct)}</span><small>${m.trades} ${t('lb.trades')}</small></li>`).join('')}</ol></div>`).join('')}
      ${board?.error ? `<p class="pt-note">${t('sync.error')}</p>` : ''}
      <div class="pt-join"><div class="alert-input"><input id="pt-group" type="text" maxlength="30" autocomplete="off" placeholder="${esc(t('lb.groupPh'))}"></div>
        <button type="button" class="btn" data-sync="gcreate">${t('lb.create')}</button><button type="button" class="btn" data-sync="gjoin">${t('lb.join')}</button></div>
      <p class="consent-small">${t('lb.note')}</p>
      <div class="pt-top-actions"><button type="button" class="btn btn-sm" data-sync="off">${t('sync.stop')}</button>
        <button type="button" class="btn btn-sm" data-sync="delete">${t('sync.delete')}</button></div></section>`;
  }
  function bindSync(el) {
    const busy = async (btn, fn) => {
      btn.disabled = true;
      try { await fn(); } catch (err) { ctx.toast(t(err.status === 404 ? 'sync.unknown' : err.status === 400 ? 'sync.invalid' : err.status === 409 ? 'lb.limit' : 'sync.error'), 'neg'); }
      btn.disabled = false;
      render(el);
    };
    el.querySelectorAll('[data-sync]').forEach((b) => b.addEventListener(b.type === 'checkbox' ? 'change' : 'click', () => {
      const a = b.dataset.sync;
      if (a === 'on') busy(b, async () => { await enableSync(); ctx.toast(t('sync.enabled')); });
      if (a === 'join') busy(b, async () => { if (await joinSync(el.querySelector('#pt-code').value)) ctx.toast(t('sync.joined')); });
      if (a === 'copy') { navigator.clipboard?.writeText(showCode(sync.code)).then(() => ctx.toast(t('sync.copied'))).catch(() => {}); }
      if (a === 'notify') busy(b, async () => {
        await ctx.linkDevice(sync.code, b.checked);
        setSync({ ...sync, notify: b.checked });
      });
      if (a === 'pseudo') busy(b, async () => { await ctx.api('paper.pseudo', { code: sync.code, pseudo: el.querySelector('#pt-pseudo').value }); await loadBoard(); ctx.toast(t('lb.saved')); });
      if (a === 'gcreate') busy(b, async () => { const r = await ctx.api('group.create', { code: sync.code, name: el.querySelector('#pt-group').value }); await loadBoard(); ctx.toast(t('lb.created', { c: r.code })); });
      if (a === 'gjoin') busy(b, async () => { await ctx.api('group.join', { code: sync.code, group: el.querySelector('#pt-group').value }); await loadBoard(); ctx.toast(t('lb.joined')); });
      if (a === 'off') busy(b, async () => { if (confirm(t('sync.stopConfirm'))) await stopSync(false); });
      if (a === 'delete') busy(b, async () => { if (confirm(t('sync.deleteConfirm'))) await stopSync(true); });
    }));
    el.querySelectorAll('[data-leave]').forEach((b) => b.addEventListener('click', () => busy(b, async () => {
      if (!confirm(t('lb.leaveConfirm'))) return;
      await ctx.api('group.leave', { code: sync.code, group: b.dataset.leave });
      await loadBoard();
    })));
    if (sync && !board) loadBoard().then(() => { if (el.isConnected && board) render(el); });
  }

  function closeManual(p, fraction) {
    const q = ctx.quote(p);
    if (!q.ok) { ctx.toast(t(`pt.why.${q.reason || 'na'}`, { c: q.ccy || '' }), 'neg'); return false; }
    const h = closePosition(p, q.price, fraction, 'manual', q.fx);
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
      ul.innerHTML = items.length ? items.map((a, i) => `<li><button type="button" data-i="${list.indexOf(a)}">${ctx.logo(a, 24)}<span class="pk-l"><strong>${esc(a.label)}</strong><small>${esc(a.name || '')} · ${t(a.kind === 'c' ? 'fav.crypto' : a.kind === 'i' ? 'fav.index' : a.kind === 'm' ? 'macro.kind' : 'fav.stock')}</small></span>
        <span class="pk-p">${isNum(a.price) ? px(a.price, a) : ctx.ND}<small class="${cls(a.chg)}">${ctx.pct(a.chg)}</small></span></button></li>`).join('')
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
    const fx = isNum(q.fx) ? q.fx : null;
    r.entry = k.type === 'market' ? q.price : P(k.price);
    const amt = P(k.amount);
    if (isNum(r.entry) && r.entry > 0 && isNum(amt) && amt > 0 && fx) {
      r.qty = k.mode === 'usd' ? amt / (r.entry * fx) : amt;
      r.notional = r.qty * r.entry * fx;
      r.margin = r.notional / k.lev;
      r.fee = r.notional * FEE;
      r.after = acct.cash - r.margin - r.fee;
    }
    r.liq = isNum(r.entry) ? liqPrice(k.side, r.entry, k.lev) : null;
    const d = dirOf(k.side);
    r.tp = k.tp.trim() ? P(k.tp) : null;
    r.sl = k.sl.trim() ? P(k.sl) : null;
    if (isNum(r.qty) && isNum(r.tp)) r.tpPnl = (r.tp - r.entry) * r.qty * d * fx - r.fee - r.qty * r.tp * fx * FEE;
    if (isNum(r.qty) && isNum(r.sl)) r.slPnl = Math.max(-r.margin, (r.sl - r.entry) * r.qty * d * fx) - r.fee - r.qty * r.sl * fx * FEE;
    if (isNum(r.tpPnl) && isNum(r.slPnl) && r.slPnl < 0) r.rr = r.tpPnl / -r.slPnl;

    // Erreurs, dans l'ordre où elles se corrigent.
    if (k.type === 'market' && !q.ok) r.errors.push(t(`pt.why.${q.reason || 'na'}`, { c: q.ccy || '' }));
    if (k.type !== 'market' && (!isNum(q.price) || !fx)) r.errors.push(t(`pt.why.${q.reason || 'na'}`, { c: q.ccy || '' }));
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
    else if (isNum(r.sl) && r.liq != null && (r.sl - r.liq) * d <= 0) r.errors.push(t('pt.err.slLiq', { p: px(r.liq, { kind: k.asset.kind, ccy: q.ccy }) }));
    if (isNum(r.after) && r.after < -1e-9) r.errors.push(t('pt.err.funds'));
    if (acct.positions.length >= MAX_OPEN) r.errors.push(t('pt.err.maxPos'));
    if (k.type !== 'market' && acct.orders.length >= MAX_ORDERS) r.errors.push(t('pt.err.maxOrders'));
    return r;
  }

  function drawTicket() {
    const k = ticket, a = k.asset, q = ctx.quote(a);
    const unit = k.mode === 'usd' ? '$' : esc(a.label);
    const pu = esc(ctx.unit(a.kind, q.ccy)); // unité des prix : $, €, KRW, pts…
    const aq = { kind: a.kind, ccy: q.ccy };
    card.innerHTML = `
      <div class="trade-head">${ctx.logo(a, 32)}<div class="th-l"><h2 id="trade-title">${esc(a.label)}</h2><p>${esc(a.name || '')}</p></div>
        <div class="th-p"><strong>${isNum(q.price) ? px(q.price, aq) : ctx.ND}</strong><small class="${cls(q.chg)}">${ctx.pct(q.chg)}</small></div></div>
      ${q.ok ? '' : `<p class="pt-note">${esc(t(`pt.why.${q.reason || 'na'}`, { c: q.ccy || '' }))}</p>`}
      ${q.ok && q.closed ? `<p class="pt-note">${esc(t('pt.closedNote', { d: q.lastTime ? `${ctx.day(q.lastTime)} ${ctx.time(q.lastTime)}` : ctx.ND }))} ${q.clock?.kind === 'open' ? ctx.cd(q.clock) : ''}</p>` : ''}
      ${q.ok && q.ccy && q.ccy !== 'USD' ? `<p class="pt-fx">${esc(t(a.kind === 'i' ? 'pt.fxIndex' : 'pt.fxNote', { c: q.ccy, r: ctx.fxText(q.fx, q.ccy) }))}</p>` : ''}
      ${segHTML('side', [['long', t('pt.buy'), 'buy'], ['short', t('pt.sell'), 'sell']], k.side, 'trade-side')}
      ${segHTML('type', [['market', t('pt.market')], ['limit', t('pt.limit')], ['stop', t('pt.stop')]], k.type)}
      ${k.type === 'market' ? '' : `<label for="tr-price">${t(k.type === 'limit' ? 'pt.limitPrice' : 'pt.stopPrice')}</label>
        <div class="alert-input"><input id="tr-price" type="text" inputmode="decimal" autocomplete="off" value="${esc(k.price)}" placeholder="${isNum(q.price) ? ctx.fmtInput(q.price) : ''}"><span>${pu}</span></div>`}
      <label for="tr-amount">${t(k.mode === 'usd' ? 'pt.amountUsd' : 'pt.qty')}</label>
      <div class="trade-amount"><div class="alert-input"><input id="tr-amount" type="text" inputmode="decimal" autocomplete="off" value="${esc(k.amount)}"><span>${unit}</span></div>
        ${segHTML('mode', [['usd', '$'], ['qty', t('pt.qtyShort')]], k.mode)}</div>
      <div class="trade-quick">${[10, 25, 50, 100].map((p) => `<button type="button" class="btn btn-sm" data-pct="${p}">${p} %</button>`).join('')}</div>
      <label>${t('pt.lev')}</label>
      ${segHTML('lev', LEVERAGES.map((l) => [l, `${l}×`]), k.lev)}
      <div class="trade-tpsl">
        <div><label for="tr-tp">${t('pt.tp')} <small>${t('pt.optional')}</small></label>
          <div class="alert-input"><input id="tr-tp" type="text" inputmode="decimal" autocomplete="off" value="${esc(k.tp)}"><span>${pu}</span></div><small class="tr-hint" id="tr-tp-h"></small></div>
        <div><label for="tr-sl">${t('pt.sl')} <small>${t('pt.optional')}</small></label>
          <div class="alert-input"><input id="tr-sl" type="text" inputmode="decimal" autocomplete="off" value="${esc(k.sl)}"><span>${pu}</span></div><small class="tr-hint" id="tr-sl-h"></small></div>
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
      if (k.mode !== 'usd' && !isNum(r.q.fx)) { updateTicket(); return; }
      k.amount = k.mode === 'usd' ? trim(notional, 2) : trim(notional / (r.entry * r.q.fx), 8);
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
    const fx = r.q.fx;
    if (!isNum(amt) || !isNum(r.entry) || r.entry <= 0 || !isNum(fx)) return;
    ticket.amount = prevMode === 'usd' ? trim(amt / (r.entry * fx), 8) : trim(amt * r.entry * fx, 2);
  }

  function updateTicket() {
    if (!ticket) return;
    const r = computeTicket();
    const row = (k, v, c = '') => `<div><dt>${k}</dt><dd class="${c}">${v}</dd></div>`;
    card.querySelector('#tr-sum').innerHTML = [
      row(t(ticket.type === 'market' ? 'pt.entryEst' : 'pt.entry'), isNum(r.entry) ? px(r.entry, { kind: ticket.asset.kind, ccy: r.q.ccy }) : ctx.ND),
      row(t('pt.qty'), isNum(r.qty) ? `${qtyFmt(r.qty)} ${esc(ticket.asset.label)}` : ctx.ND),
      row(t('pt.value'), isNum(r.notional) ? money(r.notional) : ctx.ND),
      row(t('pt.marginReq'), isNum(r.margin) ? money(r.margin) : ctx.ND),
      row(t('pt.fees'), isNum(r.fee) ? money(r.fee) : ctx.ND),
      row(t('pt.liq'), r.liq != null && isNum(r.liq) ? px(r.liq, { kind: ticket.asset.kind, ccy: r.q.ccy }) : '—'),
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
      const res = openPosition(k.asset, { ...base, price: r.q.price, fx: r.q.fx, ccy: r.q.ccy });
      if (res.error) { ctx.toast(t(`pt.err.${res.error}`), 'neg'); return; }
      save();
      recordEquity();
      notify({ type: 'filled', p: res.position });
    } else {
      const o = { id: nextId(), ...k.asset, ccy: r.q.ccy, fxOpen: r.q.fx, ...base, type: k.type, price: r.entry, createdAt: Date.now() };
      acct.orders.push(o);
      save();
      ctx.toast(t('pt.t.placed', { s: sideLabel(k.side), ty: typeLabel(k.type).toLowerCase(), q: qtyFmt(r.qty), l: k.asset.label, p: px(r.entry, o) }));
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
    const pnl = isNum(q.price) ? Math.max(-p.margin, upnl(p, q.price, fxOf(p, q))) : null;
    const liq = liqOf(p, fxOf(p, q));
    const pu = esc(ctx.unit(p.kind, p.ccy));
    card.innerHTML = `
      <div class="trade-head">${ctx.logo(p, 32)}<div class="th-l"><h2 id="trade-title">${esc(p.label)} <span class="pt-badge ${p.side}">${p.side === 'long' ? 'LONG' : 'SHORT'} ${p.lev}×</span></h2>
        <p>${qtyFmt(p.qty)} @ ${px(p.entry, p)}</p></div>
        <div class="th-p"><strong>${isNum(q.price) ? px(q.price, p) : ctx.ND}</strong><small class="${cls(pnl)}">${signed(pnl)}</small></div></div>
      <dl class="pt-kv"><div><dt>${t('pt.marginReq')}</dt><dd>${money(p.margin)}</dd></div><div><dt>${t('pt.liq')}</dt><dd>${liq != null ? px(liq, p) : '—'}</dd></div>
        <div><dt>${t('pt.openedAt')}</dt><dd>${ctx.day(p.openedAt)} ${ctx.time(p.openedAt)}</dd></div><div><dt>${t('pt.feesShort')}</dt><dd>${money(p.fees)}</dd></div></dl>
      <div class="trade-tpsl">
        <div><label for="mg-tp">${t('pt.tp')}</label><div class="alert-input"><input id="mg-tp" type="text" inputmode="decimal" value="${p.tp != null ? ctx.fmtInput(p.tp) : ''}"><span>${pu}</span></div></div>
        <div><label for="mg-sl">${t('pt.sl')}</label><div class="alert-input"><input id="mg-sl" type="text" inputmode="decimal" value="${p.sl != null ? ctx.fmtInput(p.sl) : ''}"><span>${pu}</span></div></div>
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
      else if (isNum(sl) && liq != null && (sl - liq) * d <= 0) err = t('pt.err.slLiq', { p: px(liq, p) });
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
  // Sans synchronisation, tout s'exécute avant le rendu de l'app (pas d'attente) ; avec, l'écran est redessiné
  // une fois la version du serveur reprise et le moteur exécuté.
  async function onData() {
    const synced = !!sync;
    if (synced) await pull();
    const ev = run();
    if (synced && ev.length) ctx.changed();
    if (picker && !modal.hidden) picker();
    if (ticket && !modal.hidden) {
      const head = card.querySelector('.th-p strong');
      const q = ctx.quote(ticket.asset);
      if (head) head.textContent = isNum(q.price) ? px(q.price, { kind: ticket.asset.kind, ccy: q.ccy }) : ctx.ND;
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
    const liq = liqOf(p, fxOf(p, q));
    if (type === 'tp' && (price - ref) * d <= 0) return t('pt.err.tpNow');
    if (type === 'sl' && (price - ref) * d >= 0) return t('pt.err.slNow');
    if (type === 'sl' && liq != null && (price - liq) * d <= 0) return t('pt.err.slLiq', { p: px(liq, p) });
    const v = Number(price.toPrecision(8));
    if (type === 'tp') p.tp = v; else p.sl = v;
    save();
    ctx.toast(t(type === 'tp' ? 'pt.t.tpSet' : 'pt.t.slSet', { l: p.label, p: px(v, p) }));
    ctx.changed();
    return null;
  }

  return {
    isSynced: () => !!sync,
    liqOf,
    fxOf,
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
