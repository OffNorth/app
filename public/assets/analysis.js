// Outils d'analyse : courbe des taux US, réseau Bitcoin, saisonnalité, simulateur d'investissement programmé,
// corrélations entre favoris, calculatrices (taille de position, intérêts composés) et plan de trading par actif.
// Données réelles uniquement (API du site) ; donnée absente → « n/d ». Information, pas un conseil financier.

const TENOR_X = { '3m': 0, '5y': 1, '10y': 2, '30y': 3 };
const PLAN_KEY = 'plans';
const MAX_PLANS = 100;

export function createAnalysis(ctx) {
  const { t, esc, isNum, ND } = ctx;
  const pc = (v, d = 2) => (isNum(v) ? `<span class="${ctx.signClass(v)}">${ctx.pct(v, d)}</span>` : ND);
  const offTag = (fromCache, at) => (fromCache ? ` · <b class="neg">${t('off.cached', { d: ctx.day(at), t: ctx.time(at) })}</b>` : '');

  /* ---------- Courbe des taux américains (/api/rates) ---------- */
  const rates = { d: null, at: 0, loading: false, fromCache: false, err: false };
  async function loadRates(after) {
    if (rates.loading || Date.now() - rates.at < (rates.d ? 30 * 60_000 : 60_000)) return; // échec : nouvel essai après 1 min
    rates.loading = true;
    try {
      const r = await ctx.getJSON('/api/rates');
      if (r.body.error) throw new Error(r.body.error);
      Object.assign(rates, { d: r.body, fromCache: r.fromCache, err: false, at: Date.now() });
    } catch { rates.err = true; rates.at = Date.now(); }
    rates.loading = false;
    after?.();
  }
  const rateTxt = (v) => (isNum(v) ? `${ctx.num(v, 2)}${ctx.pctSign()}` : ND);
  const bp = (a, b) => (isNum(a) && isNum(b) ? Math.round((a - b) * 100) : null);
  const bpTxt = (v) => (isNum(v) ? `<span class="${ctx.signClass(v)}">${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} ${t('rt.bp')}</span>` : ND);

  function curveSVG(tenors) {
    const W = 320, H = 170, L = 38, R = 12, T = 12, B = 26;
    const series = [['yearAgo', 'var(--muted)', '2 4', 0.55], ['monthAgo', 'var(--muted)', '5 3', 0.9], ['rate', 'var(--accent)', '', 1]];
    const vals = tenors.flatMap((x) => series.map(([k]) => x[k])).filter(isNum);
    if (!vals.length) return '';
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = Math.max(0.15, (hi - lo) * 0.15); lo -= pad; hi += pad;
    const x = (id) => L + (TENOR_X[id] / 3) * (W - L - R);
    const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const ticks = []; const step = hi - lo > 3 ? 1 : hi - lo > 1.2 ? 0.5 : 0.25;
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
    const lines = series.map(([k, color, dash, op]) => {
      const pts = tenors.filter((tn) => isNum(tn[k])).map((tn) => `${x(tn.id).toFixed(1)},${y(tn[k]).toFixed(1)}`);
      if (pts.length < 2) return '';
      return `<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="${k === 'rate' ? 2.5 : 1.6}" ${dash ? `stroke-dasharray="${dash}"` : ''} opacity="${op}"/>
        ${k === 'rate' ? tenors.filter((tn) => isNum(tn.rate)).map((tn) => `<circle cx="${x(tn.id).toFixed(1)}" cy="${y(tn.rate).toFixed(1)}" r="3.5" fill="var(--accent)"/>`).join('') : ''}`;
    }).join('');
    return `<svg class="rt-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('rt.svg'))}">
      ${ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="var(--border)"/><text x="${L - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" class="rt-ax">${ctx.num(v, step < 0.5 ? 2 : 1)}</text>`).join('')}
      ${tenors.map((tn) => `<text x="${x(tn.id).toFixed(1)}" y="${H - 6}" text-anchor="middle" class="rt-ax">${t(`rt.t.${tn.id}`)}</text>`).join('')}
      ${lines}</svg>`;
  }
  function spreadSVG(hist) {
    if (!hist?.length || hist.length < 4) return '';
    const W = 320, H = 64, P = 4;
    const v = hist.map((p) => p[1]);
    const lo = Math.min(0, ...v), hi = Math.max(0, ...v);
    const x = (i) => P + (i / (hist.length - 1)) * (W - 2 * P);
    const y = (val) => P + (1 - (val - lo) / (hi - lo || 1)) * (H - 2 * P);
    return `<svg class="rt-spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('rt.spreadHist'))}">
      <line x1="${P}" x2="${W - P}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" stroke="var(--muted)" stroke-dasharray="3 3"/>
      <polyline points="${hist.map((p, i) => `${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ')}" fill="none" stroke="var(--accent)" stroke-width="1.8"/></svg>`;
  }
  function ratesHTML() {
    const d = rates.d;
    if (!d) return `<section class="card rt-card"><h2>${t('rt.title')} ${ctx.gloss('curve')}</h2><p class="mc-note">${rates.err ? t('rt.na') : t('loading')}</p></section>`;
    const sp = d.spread;
    return `<section class="card rt-card"><h2>${t('rt.title')} ${ctx.gloss('curve')}</h2>
      <p class="rt-state ${d.inverted == null ? '' : d.inverted ? 'neg' : 'pos'}">${d.inverted == null ? ND : t(d.inverted ? 'rt.inverted' : 'rt.normal')}
        <small>${t('rt.spread')} ${isNum(sp) ? `${sp >= 0 ? '+' : '−'}${ctx.num(Math.abs(sp), 2)} ${t('rt.pts')}` : ND}</small></p>
      ${curveSVG(d.tenors)}
      <p class="rt-legend"><span><i class="rt-sw now"></i>${t('rt.now')}</span><span><i class="rt-sw m1"></i>${t('rt.m1')}</span><span><i class="rt-sw y1"></i>${t('rt.y1')}</span></p>
      <div class="table-wrap"><table class="scr-table rt-table"><thead><tr><th>${t('rt.tenor')}</th><th class="num">${t('rt.rate')}</th><th class="num">${t('rt.d1m')}</th><th class="num">${t('rt.d1y')}</th></tr></thead>
        <tbody>${d.tenors.map((tn) => `<tr><td>${t(`rt.long.${tn.id}`)}</td><td class="num"><b>${rateTxt(tn.rate)}</b></td><td class="num">${bpTxt(bp(tn.rate, tn.monthAgo))}</td><td class="num">${bpTxt(bp(tn.rate, tn.yearAgo))}</td></tr>`).join('')}</tbody></table></div>
      <h3>${t('rt.spreadHist')}</h3>${spreadSVG(d.spreadHistory) || `<p class="mc-note">${ND}</p>`}
      <p class="mc-note">${t('rt.explain')}</p>
      <p class="mc-note">${t('rt.src', { s: esc(d.source || ND), t: ctx.time(d.tenors.find((x) => x.lastTime)?.lastTime) })}${offTag(rates.fromCache, d.fetchedAt)}</p></section>`;
  }
  function renderRates(box, rerender) {
    box.innerHTML = ratesHTML();
    loadRates(() => { if (box.isConnected && !box.hidden) { box.innerHTML = ratesHTML(); rerender?.(); } });
  }
  /** Ligne courte pour l'onglet « En bref ». */
  function homeRatesHTML() {
    const d = rates.d; const ten = d?.tenors.find((x) => x.id === '10y');
    if (!d) return '';
    return `<p class="home-line"><b>${t('rt.us10')}</b> ${rateTxt(ten?.rate)} <small>${bpTxt(bp(ten?.rate, ten?.monthAgo))} ${t('rt.in1m')}</small> ·
      <span class="${d.inverted ? 'neg' : 'pos'}">${d.inverted == null ? ND : t(d.inverted ? 'rt.invertedShort' : 'rt.normalShort')}</span></p>`;
  }

  /* ---------- Réseau Bitcoin (/api/btc) ---------- */
  const btc = { d: null, at: 0, loading: false, fromCache: false, err: false };
  async function loadBtc(after) {
    if (btc.loading || Date.now() - btc.at < (btc.d ? 5 * 60_000 : 60_000)) return;
    btc.loading = true;
    try {
      const r = await ctx.getJSON('/api/btc');
      if (r.body.error) throw new Error(r.body.error);
      Object.assign(btc, { d: r.body, fromCache: r.fromCache, err: false, at: Date.now() });
    } catch { btc.err = true; btc.at = Date.now(); }
    btc.loading = false;
    after?.();
  }
  function btcHTML() {
    const d = btc.d;
    if (!d) return `<section class="card btc-card"><h2>${t('btc.title')}</h2><p class="mc-note">${btc.err ? t('btc.na') : t('loading')}</p></section>`;
    const h = d.halving, int = (v) => (isNum(v) ? ctx.num(v, 0) : ND);
    const days = Math.max(0, Math.round((h.estimatedAt - Date.now()) / 864e5));
    const f = d.fees;
    return `<section class="card btc-card"><h2>${t('btc.title')} ${ctx.gloss('halving')}</h2>
      <div class="btc-halv"><div><span class="btc-k">${t('btc.next', { n: h.number })}</span>
        <b class="btc-big">${t('btc.inDays', { n: int(days) })}</b>
        <small>${t('btc.estimate', { d: ctx.day(h.estimatedAt) })}</small></div>
        <div class="btc-reward"><span class="btc-k">${t('btc.reward')}</span><b>${ctx.num(h.rewardNow, 4)} → ${ctx.num(h.rewardNext, 4)} BTC</b></div></div>
      <div class="pf-bar btc-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(h.progressPct)}" aria-label="${esc(t('btc.progress'))}"><i style="width:${h.progressPct.toFixed(1)}%;background:var(--warn)"></i></div>
      <p class="mc-note">${t('btc.blocks', { h: int(d.height), n: int(h.nextHeight), r: int(h.remainingBlocks) })}</p>
      <dl class="facts">
        <div><dt>${t('btc.diff')}</dt><dd>${d.difficulty ? `${pc(d.difficulty.changePct, 1)} <small>${t('btc.diffWhen', { d: ctx.day(d.difficulty.estimatedAt) })}</small>` : ND}</dd></div>
        <div><dt>${t('btc.blockTime')}</dt><dd>${isNum(d.difficulty?.avgBlockSec) ? t('btc.min', { m: ctx.num(d.difficulty.avgBlockSec / 60, 1) }) : ND}</dd></div>
        <div><dt>${t('btc.fees')}</dt><dd>${f ? t('btc.feesV', { a: int(f.fast), b: int(f.hour), c: int(f.economy) }) : ND}</dd></div>
        <div><dt>${t('btc.hash')}</dt><dd>${isNum(d.hashrateEh) ? `${ctx.num(d.hashrateEh, 0)} EH/s` : ND}</dd></div>
      </dl>
      <p class="mc-note">${t('btc.note')} ${t('btc.src', { t: ctx.time(d.fetchedAt) })}${offTag(btc.fromCache, d.fetchedAt)}</p></section>`;
  }
  function renderBtc(box) {
    box.innerHTML = btcHTML();
    loadBtc(() => { if (box.isConnected) box.innerHTML = btcHTML(); });
  }

  /* ---------- Historique mensuel (saisonnalité, simulateur) ---------- */
  const monthly = new Map(); // clé d'actif → { at, d }
  async function months(asset) {
    const key = `${asset.kind}:${asset.assetId}`;
    const hit = monthly.get(key);
    if (hit && Date.now() - hit.at < 3600_000) return hit.d;
    let d = null;
    try { d = await ctx.fetchCandles(asset, '1mo'); } catch { /* n/d */ }
    const rows = (d?.candles || []).filter((x) => isNum(x[4]) && x[4] > 0)
      // Date du mois : +3 jours pour les places dont minuit local tombe la veille en UTC.
      .map((x) => { const dt = new Date((x[0] + 3 * 86400) * 1000); return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), close: x[4] }; });
    const res = rows.length ? { rows, currency: d.currency || null, source: d.source || null } : null;
    monthly.set(key, { at: Date.now(), d: res });
    return res;
  }
  /** Saisonnalité : variation moyenne de chaque mois de l'année (mois terminés seulement). */
  function seasonality(rows) {
    const now = new Date();
    const done = rows.filter((r) => !(r.y === now.getUTCFullYear() && r.m === now.getUTCMonth()));
    const by = Array.from({ length: 12 }, () => []);
    for (let i = 1; i < done.length; i++) {
      const a = done[i - 1], b = done[i];
      const consecutive = (b.y * 12 + b.m) - (a.y * 12 + a.m) === 1;
      if (consecutive) by[b.m].push({ y: b.y, r: (b.close / a.close - 1) * 100 });
    }
    const years = [...new Set(by.flat().map((x) => x.y))].sort();
    return { months: by.map((l) => ({ n: l.length, avg: l.length ? l.reduce((s, x) => s + x.r, 0) / l.length : null, up: l.length ? (l.filter((x) => x.r > 0).length / l.length) * 100 : null })),
      from: years[0], to: years[years.length - 1] };
  }
  function seasonSVG(ms) {
    const W = 320, H = 150, T = 10, B = 22, L = 4, R = 4;
    const vals = ms.map((m) => m.avg).filter(isNum);
    if (!vals.length) return '';
    const max = Math.max(1, ...vals.map(Math.abs));
    const bw = (W - L - R) / 12, mid = T + (H - T - B) / 2, half = (H - T - B) / 2;
    const names = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(ctx.loc(), { month: 'narrow', timeZone: 'UTC' }).format(Date.UTC(2021, i, 15)));
    return `<svg class="ss-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('ss.svg'))}">
      <line x1="${L}" x2="${W - R}" y1="${mid}" y2="${mid}" stroke="var(--border)"/>
      ${ms.map((m, i) => {
        const x = L + i * bw + bw * 0.15, w = bw * 0.7;
        const hgt = isNum(m.avg) ? (Math.abs(m.avg) / max) * half : 0;
        const y = isNum(m.avg) && m.avg < 0 ? mid : mid - hgt;
        return `${isNum(m.avg) ? `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(1, hgt).toFixed(1)}" rx="2" fill="${m.avg >= 0 ? 'var(--up)' : 'var(--down)'}"><title>${esc(`${names[i]} ${ctx.pct(m.avg, 1)}`)}</title></rect>` : ''}
          <text x="${(x + w / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" class="rt-ax">${esc(names[i])}</text>`;
      }).join('')}</svg>`;
  }
  async function seasonHTML(asset) {
    const d = await months(asset);
    if (!d || d.rows.length < 25) return `<p class="mc-note">${t('ss.na')}</p>`;
    const s = seasonality(d.rows);
    const mName = (i) => new Intl.DateTimeFormat(ctx.loc(), { month: 'long', timeZone: 'UTC' }).format(Date.UTC(2021, i, 15));
    return `${seasonSVG(s.months)}
      <div class="table-wrap"><table class="scr-table ss-table"><thead><tr><th>${t('ss.month')}</th><th class="num">${t('ss.avg')}</th><th class="num">${t('ss.up')}</th><th class="num">${t('ss.years')}</th></tr></thead>
        <tbody>${s.months.map((m, i) => `<tr${i === new Date().getUTCMonth() ? ' class="ss-now"' : ''}><td>${esc(mName(i))}</td><td class="num">${pc(m.avg, 1)}</td><td class="num">${isNum(m.up) ? `${ctx.num(m.up, 0)}${ctx.pctSign()}` : ND}</td><td class="num">${m.n || ND}</td></tr>`).join('')}</tbody></table></div>
      <p class="mc-note">${t('ss.note', { a: s.from ?? ND, b: s.to ?? ND, s: esc(d.source || ND) })}</p>`;
  }

  /** Simulateur : achats mensuels réguliers au cours de clôture de chaque mois, depuis l'année choisie. */
  function simulate(rows, monthlyAmount, fromYear) {
    const buys = rows.filter((r) => r.y >= fromYear);
    if (buys.length < 2) return null;
    const last = rows[rows.length - 1].close;
    let units = 0, invested = 0;
    const curve = [];
    for (const r of buys) { units += monthlyAmount / r.close; invested += monthlyAmount; curve.push([invested, units * r.close]); }
    const value = units * last;
    const lump = (invested / buys[0].close) * last; // même somme investie en une fois au premier mois
    return { invested, value, gainPct: (value / invested - 1) * 100, lump, lumpPct: (lump / invested - 1) * 100, n: buys.length, from: buys[0], curve };
  }
  function simSVG(curve) {
    if (curve.length < 2) return '';
    const W = 320, H = 120, P = 6;
    const max = Math.max(...curve.flat());
    const x = (i) => P + (i / (curve.length - 1)) * (W - 2 * P);
    const y = (v) => P + (1 - v / (max || 1)) * (H - 2 * P);
    const line = (k, color, dash = '') => `<polyline points="${curve.map((c, i) => `${x(i).toFixed(1)},${y(c[k]).toFixed(1)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
    return `<svg class="rt-spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('sim.svg'))}">${line(0, 'var(--muted)', '4 3')}${line(1, 'var(--accent)')}</svg>
      <p class="rt-legend"><span><i class="rt-sw now"></i>${t('sim.valueLine')}</span><span><i class="rt-sw m1"></i>${t('sim.investedLine')}</span></p>`;
  }
  async function simSetup(box, asset) {
    box.innerHTML = `<p class="mc-note">${t('loading')}</p>`;
    const d = await months(asset);
    if (!box.isConnected) return;
    if (!d || d.rows.length < 3) { box.innerHTML = `<p class="mc-note">${t('sim.na')}</p>`; return; }
    const years = [...new Set(d.rows.map((r) => r.y))];
    const ccy = d.currency || 'USD';
    const saved = ctx.store.get('simPrefs') || {};
    const def = years.includes(saved.y) ? saved.y : years[Math.max(0, years.length - 6)];
    box.innerHTML = `<div class="sim-form"><label for="sim-amt">${t('sim.amount')}</label>
        <div class="alert-input"><input id="sim-amt" type="text" inputmode="decimal" value="${esc(ctx.fmtInput(isNum(saved.a) ? saved.a : 100))}"><span>${esc(ccy)}</span></div>
        <label for="sim-from">${t('sim.from')}</label>
        <select id="sim-from" class="lang-select">${years.map((y) => `<option value="${y}"${y === def ? ' selected' : ''}>${y}</option>`).join('')}</select></div>
      <div id="sim-out"></div>`;
    const draw = () => {
      const a = ctx.parse(box.querySelector('#sim-amt').value);
      const y = Number(box.querySelector('#sim-from').value);
      const out = box.querySelector('#sim-out');
      if (!(isNum(a) && a > 0)) { out.innerHTML = `<p class="alert-msg">${t('sim.errAmount')}</p>`; return; }
      ctx.store.set('simPrefs', { a, y });
      const r = simulate(d.rows, a, y);
      if (!r) { out.innerHTML = `<p class="mc-note">${t('sim.na')}</p>`; return; }
      const m = (v) => ctx.native(v, ccy);
      out.innerHTML = `<dl class="facts">
          <div><dt>${t('sim.invested', { n: r.n })}</dt><dd>${m(r.invested)}</dd></div>
          <div><dt>${t('sim.value')}</dt><dd><b>${m(r.value)}</b> ${pc(r.gainPct, 1)}</dd></div>
          <div><dt>${t('sim.lump', { d: `${String(r.from.m + 1).padStart(2, '0')}/${r.from.y}` })}</dt><dd>${m(r.lump)} ${pc(r.lumpPct, 1)}</dd></div></dl>
        ${simSVG(r.curve)}
        <p class="mc-note">${t('sim.note', { s: esc(d.source || ND) })}</p>`;
    };
    box.querySelector('#sim-amt').addEventListener('input', draw);
    box.querySelector('#sim-from').addEventListener('change', draw);
    draw();
  }

  /* ---------- Corrélations des favoris (variations quotidiennes, 90 jours) ---------- */
  function pearson(a, b) {
    const n = a.length; if (n < 20) return null;
    const ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
    return da && db ? num / Math.sqrt(da * db) : null;
  }
  const dayKey = (sec) => new Date(sec * 1000).toISOString().slice(0, 10);
  async function corrRender(grid, items, isActive) {
    const list = items.slice(0, 10);
    grid.innerHTML = `<div class="card corr-card"><p class="mc-note">${t('loading')}</p></div>`;
    const series = await Promise.all(list.map(async (it) => {
      if (!it.asset) return null;
      try {
        const d = await ctx.fetchCandles(it.asset, '1d');
        const c = (d.candles || []).filter((x) => isNum(x[4]) && x[4] > 0);
        const cut = c.length ? c[c.length - 1][0] - 92 * 86400 : 0;
        const m = new Map();
        for (const x of c) if (x[0] >= cut - 7 * 86400) m.set(dayKey(x[0]), x[4]);
        return m;
      } catch { return null; }
    }));
    if (!grid.isConnected || !isActive()) return;
    // Variations entre deux jours de cotation consécutifs communs aux deux actifs.
    const corr = (A, B) => {
      if (!A || !B) return null;
      const days = [...A.keys()].filter((k) => B.has(k)).sort();
      const ra = [], rb = [];
      for (let i = 1; i < days.length; i++) { ra.push(A.get(days[i]) / A.get(days[i - 1]) - 1); rb.push(B.get(days[i]) / B.get(days[i - 1]) - 1); }
      return pearson(ra.slice(-90), rb.slice(-90));
    };
    const cell = (v) => {
      if (!isNum(v)) return `<td class="corr-c">${ND}</td>`;
      const a = Math.min(1, Math.abs(v));
      const bg = v >= 0 ? `rgba(59,130,246,${(0.12 + a * 0.6).toFixed(2)})` : `rgba(245,158,11,${(0.12 + a * 0.6).toFixed(2)})`;
      return `<td class="corr-c" style="background:${bg}">${ctx.num(v, 2).replace('-', '−')}</td>`;
    };
    grid.innerHTML = `<div class="card corr-card"><h2>${t('corr.title')} ${ctx.gloss('corr')}</h2>
      ${list.length < 2 ? `<p class="mc-note">${t('corr.need')}</p>` : `<div class="table-wrap"><table class="corr-table"><thead><tr><th></th>${list.map((it) => `<th scope="col">${esc(it.label)}</th>`).join('')}</tr></thead>
        <tbody>${list.map((it, i) => `<tr><th scope="row">${esc(it.label)}</th>${list.map((jt, j) => (i === j ? '<td class="corr-c corr-self">1</td>' : cell(corr(series[i], series[j])))).join('')}</tr>`).join('')}</tbody></table></div>`}
      <p class="rt-legend"><span><i class="rt-sw corr-pos"></i>${t('corr.pos')}</span><span><i class="rt-sw corr-neg"></i>${t('corr.neg')}</span></p>
      <p class="mc-note">${t('corr.note')}${items.length > list.length ? ` ${t('corr.max', { n: list.length })}` : ''}</p></div>`;
  }

  /* ---------- Calculatrices : taille de position, intérêts composés ---------- */
  let calcDlg = null;
  function openCalc(opts = {}) {
    if (!calcDlg) {
      calcDlg = document.createElement('div');
      calcDlg.className = 'snap'; calcDlg.id = 'calc'; calcDlg.hidden = true;
      calcDlg.setAttribute('role', 'dialog'); calcDlg.setAttribute('aria-modal', 'true'); calcDlg.setAttribute('aria-labelledby', 'calc-title');
      document.body.append(calcDlg);
      calcDlg.addEventListener('click', (e) => { if (e.target === calcDlg) closeCalc(); });
    }
    const mode = opts.mode || ctx.store.get('calcMode') || 'pos';
    const saved = ctx.store.get('calcPos') || {};
    const v = (x) => (isNum(x) ? esc(ctx.fmtInput(x)) : '');
    calcDlg.innerHTML = `<div class="snap-card alert-card calc-card"><h2 id="calc-title">${t('calc.title')}</h2>
      <div class="seg seg-wide" role="group" aria-label="${esc(t('calc.title'))}">
        <button type="button" data-cm="pos" aria-pressed="${mode === 'pos'}">${t('calc.pos')}</button>
        <button type="button" data-cm="ci" aria-pressed="${mode === 'ci'}">${t('calc.ci')}</button></div>
      ${mode === 'pos' ? `
        <label for="cp-cap">${t('calc.capital')}</label><div class="alert-input"><input id="cp-cap" type="text" inputmode="decimal" value="${v(opts.capital ?? saved.cap)}"><span>${esc(opts.unitCap || '$')}</span></div>
        <label for="cp-risk">${t('calc.risk')}</label><div class="alert-input"><input id="cp-risk" type="text" inputmode="decimal" value="${v(saved.risk ?? 1)}"><span>%</span></div>
        <div class="trade-tpsl"><div><label for="cp-entry">${t('calc.entry')}</label><div class="alert-input"><input id="cp-entry" type="text" inputmode="decimal" value="${v(opts.entry)}"></div></div>
          <div><label for="cp-stop">${t('calc.stop')} ${ctx.gloss('sl')}</label><div class="alert-input"><input id="cp-stop" type="text" inputmode="decimal" value="${v(opts.stop)}"></div></div></div>
        <label for="cp-tp">${t('calc.target')} <small>${t('pt.optional')}</small></label><div class="alert-input"><input id="cp-tp" type="text" inputmode="decimal" value="${v(opts.target)}"></div>
        ${opts.fx && opts.fx !== 1 ? `<p class="consent-small">${t('calc.fx')}</p>` : ''}
        <dl class="pt-kv" id="cp-out"></dl>` : `
        <label for="ci-p">${t('calc.initial')}</label><div class="alert-input"><input id="ci-p" type="text" inputmode="decimal" value="1000"></div>
        <label for="ci-m">${t('calc.monthly')}</label><div class="alert-input"><input id="ci-m" type="text" inputmode="decimal" value="100"></div>
        <div class="trade-tpsl"><div><label for="ci-r">${t('calc.rate')}</label><div class="alert-input"><input id="ci-r" type="text" inputmode="decimal" value="5"><span>%</span></div></div>
          <div><label for="ci-y">${t('calc.years')}</label><div class="alert-input"><input id="ci-y" type="text" inputmode="numeric" value="10"></div></div></div>
        <div id="ci-out"></div>`}
      <p class="consent-small">${t(mode === 'pos' ? 'calc.posNote' : 'calc.ciNote')}</p>
      <div class="snap-actions"><button type="button" class="btn" data-calc-x>${t('snap.close')}</button>
        ${mode === 'pos' && opts.onUse ? `<button type="button" class="btn btn-primary" data-calc-use disabled>${t('calc.use')}</button>` : ''}</div></div>`;
    const P = (id) => ctx.parse(calcDlg.querySelector(id)?.value ?? '');
    let lastQty = null;
    const compute = () => {
      if (mode === 'pos') {
        const cap = P('#cp-cap'), risk = P('#cp-risk'), entry = P('#cp-entry'), stop = P('#cp-stop'), tp = P('#cp-tp');
        const fx = isNum(opts.fx) && opts.fx > 0 ? opts.fx : 1;
        const out = calcDlg.querySelector('#cp-out');
        const ok = isNum(cap) && cap > 0 && isNum(risk) && risk > 0 && risk <= 100 && isNum(entry) && entry > 0 && isNum(stop) && stop > 0 && stop !== entry;
        lastQty = null;
        if (!ok) { out.innerHTML = `<div><dt>${t('calc.result')}</dt><dd>${t('calc.fill')}</dd></div>`; }
        else {
          ctx.store.set('calcPos', { cap: opts.capital == null ? cap : saved.cap, risk });
          const riskAmt = cap * risk / 100, perUnit = Math.abs(entry - stop) * fx;
          const qty = riskAmt / perUnit, size = qty * entry * fx;
          lastQty = qty;
          const rr = isNum(tp) && tp > 0 ? Math.abs(tp - entry) / Math.abs(entry - stop) : null;
          const dirOk = !isNum(tp) || (tp - entry) * (entry - stop) > 0;
          out.innerHTML = `<div><dt>${t('calc.riskAmt')}</dt><dd>${ctx.native(riskAmt, 'USD')}</dd></div>
            <div><dt>${t('calc.qty')}</dt><dd><b>${ctx.qty(qty)}</b> <small>(${t(entry > stop ? 'calc.long' : 'calc.short')})</small></dd></div>
            <div><dt>${t('calc.size')}</dt><dd>${ctx.native(size, 'USD')} <small>${ctx.num(size / cap * 100, 1)}${ctx.pctSign()} ${t('calc.ofCap')}</small></dd></div>
            ${size > cap ? `<div><dt>${t('calc.lev')}</dt><dd class="neg">${ctx.num(size / cap, 1)}× ${ctx.gloss('lev')}</dd></div>` : ''}
            ${isNum(rr) ? `<div><dt>${t('calc.rr')}</dt><dd>${dirOk ? `1 : ${ctx.num(rr, 2)}` : `<span class="neg">${t('calc.tpSide')}</span>`}</dd></div>` : ''}`;
        }
        const use = calcDlg.querySelector('[data-calc-use]'); if (use) use.disabled = !isNum(lastQty);
      } else {
        const p = P('#ci-p') || 0, m = P('#ci-m') || 0, r = P('#ci-r'), y = Math.round(P('#ci-y'));
        const out = calcDlg.querySelector('#ci-out');
        if (!(isNum(r) && r > -100 && r <= 100 && isNum(y) && y > 0 && y <= 60 && p >= 0 && m >= 0)) { out.innerHTML = `<p class="mc-note">${t('calc.fill')}</p>`; return; }
        // Capitalisation mensuelle au taux annuel équivalent ; versements en fin de mois.
        const rm = (1 + r / 100) ** (1 / 12) - 1;
        let bal = p; const rowsY = [];
        for (let i = 1; i <= y * 12; i++) { bal = bal * (1 + rm) + m; if (i % 12 === 0) rowsY.push([i / 12, bal, p + m * i]); }
        const paid = p + m * y * 12;
        const show = rowsY.filter((x) => x[0] === y || x[0] % Math.max(1, Math.ceil(y / 6)) === 0);
        out.innerHTML = `<dl class="pt-kv"><div><dt>${t('calc.final')}</dt><dd><b>${ctx.num(bal, 2)}</b></dd></div>
            <div><dt>${t('calc.paid')}</dt><dd>${ctx.num(paid, 2)}</dd></div>
            <div><dt>${t('calc.interest')}</dt><dd class="${bal - paid >= 0 ? 'pos' : 'neg'}">${ctx.num(bal - paid, 2)}</dd></div></dl>
          <div class="table-wrap"><table class="scr-table"><thead><tr><th>${t('calc.year')}</th><th class="num">${t('calc.balance')}</th><th class="num">${t('calc.paid')}</th></tr></thead>
            <tbody>${show.map((x) => `<tr><td>${x[0]}</td><td class="num">${ctx.num(x[1], 0)}</td><td class="num">${ctx.num(x[2], 0)}</td></tr>`).join('')}</tbody></table></div>`;
      }
    };
    calcDlg.querySelectorAll('input').forEach((i) => i.addEventListener('input', compute));
    calcDlg.querySelectorAll('[data-cm]').forEach((b) => b.addEventListener('click', () => { ctx.store.set('calcMode', b.dataset.cm); openCalc({ ...opts, mode: b.dataset.cm }); }));
    calcDlg.querySelector('[data-calc-x]').addEventListener('click', closeCalc);
    calcDlg.querySelector('[data-calc-use]')?.addEventListener('click', () => { if (isNum(lastQty)) { opts.onUse(lastQty); closeCalc(); } });
    compute();
    calcDlg.hidden = false;
    document.body.style.overflow = 'hidden';
    calcDlg.querySelector('input')?.focus();
  }
  function closeCalc() {
    if (!calcDlg || calcDlg.hidden) return;
    calcDlg.hidden = true;
    if (!document.querySelector('.snap:not([hidden])')) document.body.style.overflow = ''; // le ticket peut rester ouvert dessous
  }

  /* ---------- Plan de trading par actif (sur l'appareil) ---------- */
  const plans = () => { const p = ctx.store.get(PLAN_KEY); return p && typeof p === 'object' ? p : {}; };
  const getPlan = (key) => { const p = plans()[key]; return p && (p.note || isNum(p.target) || isNum(p.stop)) ? p : null; };
  function setPlan(key, plan) {
    const all = plans();
    if (plan) all[key] = { ...plan, at: Date.now() }; else delete all[key];
    const keys = Object.keys(all).sort((a, b) => (all[a].at || 0) - (all[b].at || 0));
    while (keys.length > MAX_PLANS) delete all[keys.shift()];
    ctx.store.set(PLAN_KEY, all);
  }
  function planSetup(box, asset, unit) {
    const key = `${asset.kind}:${asset.assetId}`;
    const draw = () => {
      const p = getPlan(key);
      box.innerHTML = `<p class="consent-small">${t('plan.intro')}</p>
        <label for="plan-note">${t('plan.note')}</label><textarea id="plan-note" class="plan-note" maxlength="500" rows="3">${esc(p?.note || '')}</textarea>
        <div class="trade-tpsl"><div><label for="plan-target">${t('plan.target')}</label><div class="alert-input"><input id="plan-target" type="text" inputmode="decimal" value="${p && isNum(p.target) ? esc(ctx.fmtInput(p.target)) : ''}"><span>${esc(unit)}</span></div></div>
          <div><label for="plan-stop">${t('plan.stop')}</label><div class="alert-input"><input id="plan-stop" type="text" inputmode="decimal" value="${p && isNum(p.stop) ? esc(ctx.fmtInput(p.stop)) : ''}"><span>${esc(unit)}</span></div></div></div>
        <p class="alert-msg" id="plan-msg" hidden></p>
        <div class="pt-actions"><button type="button" class="btn btn-sm btn-primary" data-plan="save">${t('plan.save')}</button>
          ${p ? `<button type="button" class="btn btn-sm" data-plan="del">${t('plan.del')}</button><small class="mc-note">${t('plan.saved', { d: ctx.day(p.at) })}</small>` : ''}</div>`;
      box.querySelector('[data-plan="save"]').addEventListener('click', () => {
        const note = box.querySelector('#plan-note').value.trim().slice(0, 500);
        const rt = box.querySelector('#plan-target').value.trim(), rs = box.querySelector('#plan-stop').value.trim();
        const target = rt ? ctx.parse(rt) : null, stop = rs ? ctx.parse(rs) : null;
        const msg = box.querySelector('#plan-msg');
        if ((rt && !(isNum(target) && target > 0)) || (rs && !(isNum(stop) && stop > 0))) { msg.textContent = t('plan.err'); msg.hidden = false; return; }
        if (!note && target == null && stop == null) { setPlan(key, null); draw(); return; }
        setPlan(key, { note, target, stop });
        ctx.toast(t('plan.ok'));
        draw();
      });
      box.querySelector('[data-plan="del"]')?.addEventListener('click', () => { if (confirm(t('plan.delConfirm'))) { setPlan(key, null); draw(); } });
    };
    draw();
  }

  return {
    loadRates, renderRates, ratesHTML, homeRatesHTML, rates: () => rates.d,
    loadBtc, renderBtc,
    seasonHTML, simSetup,
    corrRender,
    openCalc, closeCalc, calcOpen: () => !!calcDlg && !calcDlg.hidden,
    getPlan, setPlan, planSetup,
  };
}
