// Page « Bot de trading » : suivi du bot de paper trading (dépôt OffNorth/idk) via le relais /api/bot.
// Aucune donnée personnelle : la clé d'accès (?k=…) est gardée sur l'appareil (localStorage marches:botKey).
'use strict';
(function () {
  const KEY_STORE = 'marches:botKey';
  let KEY = new URLSearchParams(location.search).get('k') || '';
  try {
    if (KEY) localStorage.setItem(KEY_STORE, KEY);
    else KEY = localStorage.getItem(KEY_STORE) || '';
  } catch (e) { /* stockage indisponible */ }

  const S = { tab: 'portfolio', market: null, state: null, catalog: null, hidden: {}, hist: {}, histYear: {}, histIds: null, catFilter: 'active', catQuery: '', error: null };
  const $ = (id) => document.getElementById(id);

  /* ---------- Telegram (mini-app) ---------- */
  function tg() { const w = window.Telegram && window.Telegram.WebApp; return w && w.initData ? w : null; }
  function tgSetup() {
    const w = tg(); if (!w) return;
    w.ready(); w.expand();
    // Dans Telegram : thème clair / sombre de Telegram, sans toucher au réglage de l'app
    document.documentElement.dataset.theme = w.colorScheme === 'light' ? 'light' : 'dark';
    $('home-link').hidden = true;
  }
  window.addEventListener('load', tgSetup);

  /* ---------- Format ---------- */
  const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  const money = (v) => (v == null ? 'n/d' : (Math.abs(v) >= 100000 ? '$' + nf0.format(v / 1000) + 'k' : '$' + nf0.format(v)));
  const price = (v) => (v == null ? 'n/d' : '$' + v.toLocaleString('fr-FR', { maximumFractionDigits: v > 1000 ? 0 : 2 }));
  const pct = (v, d = 1) => (v == null ? 'n/d' : (v > 0 ? '+' : '') + v.toFixed(d).replace('.', ',') + ' %');
  const signed = (v) => (v >= 0 ? '+' : '−') + money(Math.abs(v));
  const cls = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dt = (t) => new Date(t * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' });
  const dtt = (t) => new Date(t * 1000).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  function ago(t) {
    const s = Date.now() / 1000 - t;
    if (s < 90) return 'à l’instant';
    if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
    if (s < 172800) return `il y a ${Math.round(s / 3600)} h`;
    return `il y a ${Math.round(s / 86400)} j`;
  }
  const tfLabel = (tf) => ({ '1d': '1 jour', '1h': '1 h', '6h': '6 h', '5m': '5 min', '1m': '1 min' }[tf] || tf);
  const swatch = (s) => `<span class="b-dot ${s.dash ? 'dash' : ''}" style="background:${s.ref ? 'var(--muted)' : esc(s.color)}"></span>`;

  /* ---------- API (relais du site) ---------- */
  async function api(page, params = {}) {
    const q = new URLSearchParams({ p: page, ...params });
    if (KEY) q.set('k', KEY);
    const res = await fetch(`/api/bot?${q}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(body.error || `HTTP ${res.status}`), { retry: Boolean(body.retry), status: res.status });
    return body;
  }
  async function loadState() {
    $('refresh').classList.add('spinning');
    try {
      S.state = await api('state');
      S.error = null;
      if (!S.market || !S.state.markets.some((m) => m.id === S.market)) S.market = S.state.markets[0] && S.state.markets[0].id;
    } catch (e) { S.error = e.message; S.errorStatus = e.status; }
    $('refresh').classList.remove('spinning');
    render();
  }
  async function loadCatalog() {
    try { S.catalog = await api('catalog'); } catch (e) { S.catalog = { strategies: [], error: e.message }; }
    if (S.tab === 'catalog') render();
  }

  /* ---------- Graphique SVG ---------- */
  function niceStep(range, target = 4) {
    const raw = range / target; const mag = 10 ** Math.floor(Math.log10(raw)); const n = raw / mag;
    return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
  }
  function chartWidth() { return Math.round(Math.max(260, Math.min($('main').clientWidth - 32, 728) - 30)); }
  /** series : [{ id, color, dash, ref, curve: [[t, v]] }] */
  function chartSvg(series, { baseline = null, log = false, height = 220 } = {}) {
    const W = chartWidth(), H = height, L = 50, R = 8, T = 10, B = 22;
    const pts = series.flatMap((s) => s.curve);
    if (pts.length < 2) return '<p class="b-muted b-small b-center" style="padding:36px 0">Pas encore assez de points : la courbe se remplit au fil des heures.</p>';
    const f = log ? (v) => Math.log10(Math.max(v, 1)) : (v) => v;
    let t0 = Infinity, t1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of pts) { t0 = Math.min(t0, p[0]); t1 = Math.max(t1, p[0]); v0 = Math.min(v0, f(p[1])); v1 = Math.max(v1, f(p[1])); }
    if (baseline != null) { v0 = Math.min(v0, f(baseline)); v1 = Math.max(v1, f(baseline)); }
    if (t1 === t0) t1 = t0 + 3600;
    if (!log && v1 - v0 < Math.abs(v1) * 0.02) { const mid = (v0 + v1) / 2; v0 = mid * 0.99; v1 = mid * 1.01; }
    const pad = (v1 - v0) * 0.06 || 1; v0 -= pad; v1 += pad;
    const X = (t) => L + ((t - t0) / (t1 - t0)) * (W - L - R);
    const Y = (v) => T + (1 - (f(v) - v0) / (v1 - v0)) * (H - T - B);
    let g = '';
    const hline = (v) => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--border)"/><text x="${L - 6}" y="${Y(v) + 3}" text-anchor="end">${money(v)}</text>`;
    if (log) {
      for (let e = Math.floor(v0); e <= Math.ceil(v1); e++) for (const m of [1, 2, 5]) { const v = m * 10 ** e; const fv = Math.log10(v); if (fv >= v0 && fv <= v1) g += hline(v); }
    } else {
      const step = niceStep(v1 - v0);
      for (let v = Math.ceil(v0 / step) * step; v <= v1; v += step) g += hline(v);
    }
    const span = t1 - t0;
    for (let k = 0; k <= 3; k++) {
      const t = t0 + (span * k) / 3; const d = new Date(t * 1000);
      const lab = span > 400 * 86400 ? String(d.getUTCFullYear()) : span > 3 * 86400 ? d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      g += `<text x="${X(t)}" y="${H - 6}" text-anchor="${k === 0 ? 'start' : k === 3 ? 'end' : 'middle'}">${lab}</text>`;
    }
    if (baseline != null) g += `<line x1="${L}" x2="${W - R}" y1="${Y(baseline)}" y2="${Y(baseline)}" stroke="var(--muted)" stroke-dasharray="4 4" opacity=".6"/>`;
    for (const s of [...series].sort((a, b) => (b.ref ? 1 : 0) - (a.ref ? 1 : 0))) {
      if (!s.curve.length) continue;
      const d = s.curve.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
      const dash = s.ref ? 'stroke-dasharray="5 4"' : s.dash ? 'stroke-dasharray="7 4"' : '';
      g += `<path d="${d}" fill="none" stroke="${s.ref ? 'var(--muted)' : esc(s.color)}" stroke-width="${s.ref ? 1.6 : 2}" ${dash} stroke-linejoin="round"/>`;
    }
    g += `<line class="b-cross" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="var(--muted)" opacity="0"/>`;
    const meta = encodeURIComponent(JSON.stringify({ t0, t1, L, R, W }));
    return `<div style="position:relative"><svg class="b-chart" viewBox="0 0 ${W} ${H}" data-meta="${meta}" role="img" aria-label="Évolution du capital">${g}</svg><div class="b-tip" hidden></div></div>`;
  }
  /** Info-bulle au toucher / survol : valeur de chaque courbe à la date pointée. */
  function bindChart(root, series) {
    const svg = root && root.querySelector('svg.b-chart'); if (!svg) return;
    const tip = root.querySelector('.b-tip'); const cross = svg.querySelector('.b-cross');
    const m = JSON.parse(decodeURIComponent(svg.dataset.meta));
    const hide = () => { tip.hidden = true; cross.setAttribute('opacity', '0'); };
    const show = (ev) => {
      const box = svg.getBoundingClientRect();
      const x = ((ev.clientX - box.left) / box.width) * m.W;
      if (x < m.L || x > m.W - m.R) return hide();
      const t = m.t0 + ((x - m.L) / (m.W - m.L - m.R)) * (m.t1 - m.t0);
      const rows = series.filter((s) => s.curve.length).map((s) => {
        let best = s.curve[0];
        for (const p of s.curve) if (Math.abs(p[0] - t) < Math.abs(best[0] - t)) best = p;
        return { s, v: best[1] };
      }).sort((a, b) => b.v - a.v).slice(0, 8);
      tip.innerHTML = `<div class="b-muted">${dt(t)}</div>` + rows.map(({ s, v }) => `<div>${swatch(s)} ${esc(s.id)} <b>${money(v)}</b></div>`).join('');
      tip.hidden = false;
      tip.style.left = Math.min(Math.max(0, ev.clientX - box.left + 12), box.width - tip.offsetWidth) + 'px';
      tip.style.top = '4px';
      cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('opacity', '.5');
    };
    svg.addEventListener('pointermove', show);
    svg.addEventListener('pointerdown', show);
    svg.addEventListener('pointerleave', hide);
  }

  /* ---------- Vues ---------- */
  const market = () => S.state && S.state.markets.find((m) => m.id === S.market);

  function viewPortfolio() {
    const m = market(); if (!m) return '<div class="b-card b-muted">Aucun marché actif.</div>';
    const ret = (m.totalEquity / m.totalStart - 1) * 100;
    const visible = m.strategies.filter((s) => !S.hidden[m.id + s.id]);
    return `
    <section class="b-card">
      <div class="b-muted b-small">${m.emoji} ${esc(m.name)} · ${m.strategies.length} stratégies × ${money(m.startCapital)}${m.since ? ' depuis le ' + dt(m.since) : ''}</div>
      <div class="b-big">${money(m.totalEquity)} <small class="${cls(ret)}">${pct(ret)}</small></div>
      <div class="b-kpis">
        <div class="b-kpi"><b>${price(m.price)}</b><span>prix actuel</span></div>
        <div class="b-kpi"><b>${m.inPosition} / ${m.strategies.length}</b><span>en position</span></div>
        <div class="b-kpi"><b>${String(m.feePct).replace('.', ',')} %</b><span>frais/côté${m.financingPct ? ` · ${m.financingPct} %/an` : ''}</span></div>
      </div>
    </section>
    <section class="b-card" id="live-chart">
      <div class="b-row"><h2>Évolution du capital</h2><span class="b-muted b-small">gains réinvestis</span></div>
      ${chartSvg(visible, { baseline: m.startCapital })}
      <div class="b-legend">${m.strategies.map((s) => `<button type="button" data-toggle="${esc(s.id)}" aria-pressed="${!S.hidden[m.id + s.id]}">${swatch(s)}${esc(s.id)}</button>`).join('')}</div>
    </section>
    <h3 class="b-h">Stratégies</h3>
    <div class="b-list">${[...m.strategies].sort((a, b) => b.equity - a.equity).map(stratRow).join('')}</div>`;
  }
  function stratRow(s) {
    const p = s.position;
    const pos = p ? `<span class="b-badge ${p.side}">${p.side === 'long' ? '📈 achat' : '📉 vente'} ${pct(p.unrealizedPct)}</span>` : '<span class="b-badge">à plat</span>';
    return `<button type="button" class="b-strat" data-strat="${esc(s.id)}">${swatch(s)}
      <span><div class="name">${esc(s.name)}</div><div class="meta">${pos}${s.trades} trade${s.trades > 1 ? 's' : ''}${s.trades ? ` · ${Math.round(s.winRate)} % gagnants` : ''}</div></span>
      <span class="val">${money(s.equity)}<small class="${cls(s.returnPct)}">${pct(s.returnPct)}</small></span></button>`;
  }
  function stratSheet(s, m) {
    const p = s.position;
    const cat = S.catalog && S.catalog.strategies.find((c) => c.id === s.id.split('@')[0]);
    return `
      <div class="b-row"><h2>${esc(s.name)}</h2><span class="b-badge">${tfLabel(s.tf)}</span></div>
      <p class="b-muted b-small" style="margin:4px 0 10px"><code>${esc(s.id)}</code> · ${m.emoji} ${esc(m.name)}${cat && cat.note ? ' · banc d’essai : ' + esc(cat.note) : ''}</p>
      <section class="b-card"><div class="b-big">${money(s.equity)} <small class="${cls(s.returnPct)}">${pct(s.returnPct)}</small></div>
        <div class="b-kpis">
          <div class="b-kpi"><b>${s.trades}</b><span>trades clôturés</span></div>
          <div class="b-kpi"><b>${s.trades ? Math.round(s.winRate) + ' %' : '–'}</b><span>gagnants</span></div>
          <div class="b-kpi"><b class="${cls(s.pnlUsd)}">${s.trades ? signed(s.pnlUsd) : '–'}</b><span>gains réalisés</span></div>
        </div>
        <div id="sheet-chart" style="margin-top:10px">${chartSvg([s], { baseline: m.startCapital, height: 160 })}</div>
      </section>
      ${p ? `<section class="b-card"><h2>${p.side === 'long' ? '📈 Position à l’achat' : '📉 Position à la vente'}</h2><span class="b-muted b-small">depuis le ${dtt(p.entryT)} · montant engagé ${money(p.size)}</span>
        <div class="b-grid2">
          <div class="b-kpi"><b>${price(p.entry)}</b><span>prix d’entrée</span></div>
          <div class="b-kpi"><b class="${cls(p.unrealized)}">${pct(p.unrealizedPct, 2)} · ${signed(p.unrealized)}</b><span>gain / perte latent</span></div>
          <div class="b-kpi"><b>${price(p.sl)}</b><span>stop de protection</span></div>
          <div class="b-kpi"><b>${p.tp ? price(p.tp) : '—'}</b><span>objectif</span></div>
        </div></section>`
        : '<section class="b-card b-muted">Pas de position ouverte : la stratégie attend son signal.</section>'}
      <section class="b-card"><h2>Comment elle marche</h2><p style="margin:0">${esc(s.desc)}</p></section>
      <section class="b-card"><h2>Derniers trades</h2>
        ${s.closed.length ? `<div class="b-table-wrap"><table class="b-table"><tr><th>Date</th><th>Sens</th><th>Entrée → sortie</th><th>Résultat</th></tr>${s.closed.slice(0, 30).map((t) => `<tr><td>${dt(t.exitT)}<div class="b-muted b-small">${esc(t.reason)}</div></td><td>${t.side === 'long' ? 'achat' : 'vente'}</td><td>${price(t.entry)} → ${price(t.exit)}</td><td class="${cls(t.pnlUsd)}">${pct(t.pnlPct, 2)}<div class="b-small">${signed(t.pnlUsd)}</div></td></tr>`).join('')}</table></div>` : '<p class="b-muted b-small">Aucun trade clôturé pour l’instant.</p>'}
      </section>
      ${cat && cat.testable ? `<button type="button" class="btn" style="width:100%" data-test="${esc(s.id)}">Voir sur l’historique</button>` : ''}`;
  }

  function viewFeed() {
    const m = market(); if (!m) return '';
    const byId = Object.fromEntries(m.strategies.map((s) => [s.id, s]));
    if (!m.feed.length) return '<div class="b-card b-muted">Aucune activité pour l’instant.</div>';
    return `<section class="b-card b-feed">${m.feed.map((e) => {
      const s = byId[e.id] || { name: e.id };
      if (e.type === 'open') return `<div class="item"><div class="ico">${e.side === 'long' ? '🟢' : '🔴'}</div><div><div><b>${e.side === 'long' ? 'Achat' : 'Vente à découvert'}</b> · ${esc(s.name)}</div><div class="when">${price(e.price)} · ${dtt(e.t)} · ${ago(e.t)}${e.live ? ' · <b>en cours</b>' : ''}</div></div></div>`;
      return `<div class="item"><div class="ico">${e.pnlUsd >= 0 ? '✅' : '❌'}</div><div><div><b>Clôture</b> · ${esc(s.name)} <b class="${cls(e.pnlUsd)}">${pct(e.pnlPct, 2)} (${signed(e.pnlUsd)})</b></div><div class="when">${price(e.price)} · ${esc(e.reason)} · ${dtt(e.t)} · ${ago(e.t)}</div></div></div>`;
    }).join('')}</section>`;
  }

  const YEARS = { gold: [2001, 2010, 2016, 2021, 2024], nas100: [1990, 2000, 2010, 2020, 2023] };
  const defYear = (id) => (id === 'nas100' ? 2010 : 2021);
  const histKey = () => `${S.market}:${S.histYear[S.market] || defYear(S.market)}:${S.histIds ? S.histIds.join(',') : ''}`;
  function viewHistory() {
    const m = market(); if (!m) return '';
    const year = S.histYear[m.id] || defYear(m.id);
    const h = S.hist[histKey()];
    let body;
    if (!h || h.loading) body = '<div class="b-spin"></div><p class="b-muted b-small b-center">Simulation en cours (le premier calcul peut prendre jusqu’à 1 min)…</p>';
    else if (h.error) body = `<div class="b-err">${esc(h.error)}</div><p class="b-center"><button type="button" class="btn btn-sm" data-retry>Réessayer</button></p>`;
    else {
      const d = h.data; const log = d.years > 8;
      body = `<section class="b-card" id="hist-chart">
        <div class="b-row"><h2>${d.emoji} ${esc(d.name)} · ${d.year} → ${dt(d.last)}</h2><span class="b-muted b-small">${log ? 'échelle log' : ''}</span></div>
        ${chartSvg(d.results, { baseline: d.startCapital, log })}
        <p class="b-muted b-small" style="margin:6px 0 0">Gains réinvestis, ${esc(d.fees)}. Départ ${money(d.startCapital)} par stratégie · ${esc(d.source)}</p>
      </section>
      <section class="b-card b-table-wrap"><table class="b-table">
        <tr><th>Stratégie</th><th>Final</th><th>Par an</th><th>Pire baisse</th><th>Trades</th></tr>
        ${d.results.map((r) => `<tr><td>${swatch(r)} ${esc(r.name)}</td><td>${money(r.equity)}</td><td class="${cls(r.perYear)}"><b>${pct(r.perYear)}</b></td><td class="neg">−${Math.round(r.dd)} %</td><td>${r.ref ? '—' : r.trades}</td></tr>`).join('')}
      </table><p class="b-muted b-small">« Par an » = rendement annuel moyen composé. Résultats passés ≠ résultats futurs.</p></section>`;
    }
    return `<section class="b-card">
      <h2>Simulation sur l’historique</h2>
      <p class="b-muted b-small" style="margin:0">${S.histIds ? `Stratégie testée : <b>${esc(S.histIds.filter((x) => x !== 'hold').join(', '))}</b> contre « garder ». <a href="#" data-allstrats>Revenir aux stratégies actives</a>` : 'Les stratégies actives, comme si le bot avait tourné depuis l’année choisie.'}</p>
      <div class="b-chips seg" role="group" aria-label="Année de départ">${YEARS[m.id].map((y) => `<button type="button" data-year="${y}" aria-pressed="${y === year}">depuis ${y}</button>`).join('')}</div>
    </section>${body}`;
  }
  async function loadHistory(retries = 2) {
    const key = histKey();
    if (S.hist[key] && !S.hist[key].error && !S.hist[key].loading) return;
    S.hist[key] = { loading: true };
    if (S.tab === 'history') render();
    const year = S.histYear[S.market] || defYear(S.market);
    try {
      const params = { market: S.market, from: String(year) };
      if (S.histIds) params.ids = S.histIds.join(',');
      S.hist[key] = { data: await api('history', params) };
    } catch (e) {
      // Premier calcul trop long pour le relais : le bot continue, on redemande
      if (e.retry && retries > 0) { delete S.hist[key]; await new Promise((r) => setTimeout(r, 4000)); return loadHistory(retries - 1); }
      S.hist[key] = { error: e.message };
    }
    if (S.tab === 'history') render();
  }

  const VERDICT = { retenue: ['retenue au test', ''], dispo: ['disponible', ''], essai: ['à l’essai', 'try'], rejet: ['rejetée', 'rej'], ref: ['référence', ''] };
  function viewCatalog() {
    if (!S.catalog) return '<div class="b-spin"></div>';
    if (S.catalog.error) return `<div class="b-err">${esc(S.catalog.error)}</div>`;
    const all = S.catalog.strategies.filter((s) => s.id !== 'hold');
    const q = S.catQuery.toLowerCase();
    const list = S.catalog.strategies.filter((s) => {
      if (S.catFilter === 'active' && !s.active.length) return false;
      if (S.catFilter === 'dispo' && (s.active.length || !['dispo', 'retenue'].includes(s.verdict))) return false;
      if (S.catFilter === 'rejet' && s.verdict !== 'rejet') return false;
      return !q || (s.name + ' ' + s.id + ' ' + s.desc).toLowerCase().includes(q);
    });
    const nG = all.filter((s) => s.active.includes('gold')).length;
    const nN = all.filter((s) => s.active.includes('nas100')).length;
    const fams = [...new Set(list.map((s) => s.family))];
    return `<section class="b-card">
      <h2>${all.length} stratégies codées · ${all.filter((s) => s.active.length).length} actives</h2>
      <p class="b-muted b-small" style="margin:0">${nG} tradées sur l’or, ${nN} sur le Nasdaq (certaines sur les deux). Toutes ont été testées sur l’historique ; seules celles qui passent le test sont tradées.</p>
      <div class="b-chips seg" role="group" aria-label="Filtre">${[['active', 'Actives'], ['dispo', 'Disponibles'], ['rejet', 'Rejetées'], ['all', 'Toutes']].map(([k, l]) => `<button type="button" data-cat="${k}" aria-pressed="${S.catFilter === k}">${l}</button>`).join('')}</div>
      <input type="search" id="cat-search" class="b-input" placeholder="Rechercher une stratégie…" aria-label="Rechercher une stratégie" value="${esc(S.catQuery)}">
    </section>
    ${fams.map((f) => `<h3 class="b-h">${esc(f)}</h3>${list.filter((s) => s.family === f).map(catItem).join('')}`).join('') || '<p class="b-muted b-center">Aucune stratégie.</p>'}`;
  }
  function catItem(s) {
    const v = VERDICT[s.verdict] || ['', ''];
    const act = s.active.map((m) => (m === 'gold' ? '<span class="b-badge gold">🥇 active sur l’or</span>' : '<span class="b-badge nas">🇺🇸 active sur le Nasdaq</span>')).join('');
    const markets = s.markets.filter((m) => S.state && S.state.markets.some((x) => x.id === m));
    return `<section class="b-card b-cat"><b>${esc(s.name)}</b><div class="b-muted b-small"><code>${esc(s.id)}</code> · bougies ${tfLabel(s.tf)}</div>
      <div style="margin:6px 0">${act}${s.active.length ? '' : `<span class="b-badge ${v[1]}">${v[0]}</span>`}</div>
      ${s.note ? `<div class="b-small">${esc(s.note)}</div>` : ''}
      <details><summary>Comment elle marche</summary><p class="b-small" style="margin:6px 0">${esc(s.desc)}</p></details>
      ${s.testable && s.id !== 'hold' && markets.length ? `<div class="b-tests">${markets.map((m) => `<button type="button" class="btn btn-sm" data-test="${esc(s.testId || s.id)}" data-tmarket="${m}">Tester sur ${m === 'gold' ? 'l’or' : 'le Nasdaq'}</button>`).join('')}</div>` : ''}
    </section>`;
  }

  function viewError() {
    const why = S.errorStatus === 401 ? 'Clé d’accès manquante ou incorrecte : ouvrez cette page avec le lien envoyé par la commande /app du bot.' : esc(S.error);
    return `<div class="b-err"><b>Données du bot indisponibles</b>${why}</div>`;
  }

  /* ---------- Rendu ---------- */
  function render() {
    const seg = $('market-seg');
    seg.innerHTML = (S.state ? S.state.markets : []).map((m) => `<button type="button" data-market="${m.id}" aria-pressed="${m.id === S.market}">${m.emoji} ${esc(m.id === 'nas100' ? 'Nasdaq' : m.name)}</button>`).join('');
    seg.hidden = S.tab === 'catalog' || !(S.state && S.state.markets.length > 1);
    const m = market();
    $('subtitle').textContent = S.error ? 'Données indisponibles' : m && m.lastUpdate ? `Paper trading · mis à jour ${ago(m.lastUpdate / 1000)}` : 'Paper trading · en attente du bot…';
    const v = $('view');
    if (!S.state) v.innerHTML = S.error ? viewError() : '<div class="b-spin"></div>';
    else {
      v.innerHTML = (S.error ? viewError() : '') + { portfolio: viewPortfolio, feed: viewFeed, history: viewHistory, catalog: viewCatalog }[S.tab]();
      if (S.tab === 'portfolio' && m) bindChart($('live-chart'), m.strategies.filter((s) => !S.hidden[m.id + s.id]));
      if (S.tab === 'history') { const h = S.hist[histKey()]; if (h && h.data) bindChart($('hist-chart'), h.data.results); }
    }
    const search = $('cat-search');
    if (search) search.addEventListener('input', (e) => {
      S.catQuery = e.target.value; const pos = e.target.selectionStart; render();
      const s2 = $('cat-search'); s2.focus(); s2.setSelectionRange(pos, pos);
    });
    document.querySelectorAll('.b-tabbar button').forEach((b) => { if (b.dataset.tab === S.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  }

  function openSheet(html, after) {
    $('sheet-body').innerHTML = html;
    $('sheet-bg').hidden = false;
    requestAnimationFrame(() => $('sheet').classList.add('open'));
    if (after) after();
    const w = tg(); if (w && w.BackButton) { w.BackButton.show(); w.BackButton.onClick(closeSheet); }
  }
  function closeSheet() {
    $('sheet').classList.remove('open');
    $('sheet-bg').hidden = true;
    const w = tg(); if (w && w.BackButton) { w.BackButton.hide(); w.BackButton.offClick(closeSheet); }
  }
  function goTest(id, marketId) {
    closeSheet();
    S.market = marketId || S.market; S.histIds = [id, 'hold']; S.tab = 'history';
    render(); loadHistory(); window.scrollTo(0, 0);
  }

  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('button, a'); if (!t) return;
    const d = t.dataset;
    if (d.tab) { S.tab = d.tab; render(); if (S.tab === 'history') loadHistory(); if (S.tab === 'catalog' && !S.catalog) loadCatalog(); window.scrollTo(0, 0); }
    else if (d.market) { S.market = d.market; render(); if (S.tab === 'history') loadHistory(); }
    else if (d.toggle) { const k = S.market + d.toggle; S.hidden[k] = !S.hidden[k]; render(); }
    else if (d.strat) { const m = market(); const s = m.strategies.find((x) => x.id === d.strat); openSheet(stratSheet(s, m), () => bindChart($('sheet-chart'), [s])); }
    else if (d.year) { S.histYear[S.market] = Number(d.year); render(); loadHistory(); }
    else if (d.cat) { S.catFilter = d.cat; render(); }
    else if (d.test) goTest(d.test, d.tmarket || S.market);
    else if (t.hasAttribute('data-retry')) { delete S.hist[histKey()]; loadHistory(); }
    else if (t.hasAttribute('data-allstrats')) { ev.preventDefault(); S.histIds = null; render(); loadHistory(); }
  });
  $('sheet-bg').addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
  $('refresh').addEventListener('click', () => { loadState(); if (S.tab === 'catalog') loadCatalog(); });
  let resizeT;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(render, 150); });
  window.addEventListener('marches-theme', () => render());

  loadState();
  loadCatalog();
  setInterval(() => { if (!document.hidden) loadState(); }, 60000);
})();
