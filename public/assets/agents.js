// Agents IA : classement public des agents (Claude) qui tradent des comptes de démonstration (argent fictif).
// Données en lecture seule (/api/agents). Les décisions sont générées par une IA : elles sont publiées à titre pédagogique,
// ce n'est jamais un conseil financier. Comparaison avec le compte démo de l'utilisateur faite sur son appareil.

const KIND = { c: 'fav.crypto', s: 'fav.stock', i: 'fav.index', m: 'macro.kind' };

export function createAgents(ctx) {
  const { t, esc, isNum, ND } = ctx;
  const st = { d: null, at: 0, loading: false, err: false, offline: false, open: null };
  const cls = (v) => (!isNum(v) || Math.abs(v) < 0.005 ? '' : v > 0 ? 'pos' : 'neg');

  async function load(after) {
    if (st.loading || Date.now() - st.at < (st.d ? 60_000 : 20_000)) return;
    st.loading = true;
    try {
      const r = await ctx.getJSON('/api/agents');
      if (r.body.error || !Array.isArray(r.body.agents)) throw new Error('n/d');
      Object.assign(st, { d: r.body, err: false, offline: r.fromCache });
    } catch { st.err = true; }
    st.at = Date.now(); st.loading = false;
    after?.();
  }

  /** P&L latent d'une position d'agent, aux cours affichés par l'app (n/d si le cours ou le taux manquent). */
  function pnlOf(p) {
    const q = ctx.quote({ kind: p.kind, assetId: p.assetId, label: p.label, symbol: p.symbol });
    if (!isNum(q.price)) return { price: null, pnl: null };
    const fx = ctx.usdPer(q.ccy || p.ccy) ?? p.fxOpen;
    if (!isNum(fx)) return { price: q.price, pnl: null };
    const raw = (q.price - p.entry) * p.qty * (p.side === 'long' ? 1 : -1) * fx;
    return { price: q.price, ccy: q.ccy || p.ccy, pnl: Math.max(-p.margin, raw) };
  }

  function curveSVG(pts, initial) {
    if (!pts || pts.length < 2) return `<p class="mc-note">${t('ai.noCurve')}</p>`;
    const W = 320, H = 70;
    const xs = pts.map((p) => p[0]), ys = [...pts.map((p) => p[1]), initial];
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const X = (x) => (x1 === x0 ? 0 : ((x - x0) / (x1 - x0)) * W);
    const Y = (y) => (y1 === y0 ? H / 2 : H - 4 - ((y - y0) / (y1 - y0)) * (H - 8));
    const d = pts.map((q, i) => `${i ? 'L' : 'M'}${X(q[0]).toFixed(1)},${Y(q[1]).toFixed(1)}`).join('');
    const up = pts[pts.length - 1][1] >= initial;
    return `<svg class="pt-curve ${up ? 'up' : 'down'}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(t('pt.equityChart'))}">
      <line x1="0" x2="${W}" y1="${Y(initial).toFixed(1)}" y2="${Y(initial).toFixed(1)}" class="base"/>
      <path d="${d}L${X(pts[pts.length - 1][0]).toFixed(1)},${H}L0,${H}Z" class="area"/><path d="${d}" class="line"/></svg>`;
  }

  const sideTxt = (s) => t(s === 'long' ? 'pt.long' : 'pt.short');
  function execLine(e) {
    if (e.action === 'open') return `${sideTxt(e.side)} <b>${esc(e.label)}</b> ${e.type !== 'market' ? `(${t(`pt.${e.type}`).toLowerCase()} ${ctx.num(e.price)})` : ''} ${e.lev > 1 ? `${e.lev}×` : ''}${isNum(e.qty) && isNum(e.price) ? '' : ''}`;
    if (e.action === 'close') return `${t('ai.closed')} <b>${esc(e.label)}</b> <span class="${cls(e.net)}">${ctx.signed(e.net)}</span>`;
    if (e.action === 'cancel') return t('ai.cancelled');
    if (e.action === 'set_tp_sl') return `${t('ai.tpsl')} <b>${esc(e.label)}</b>`;
    return esc(e.action || '');
  }

  function decisionsHTML(a) {
    if (!a.decisions.length) return `<p class="mc-note">${t('ai.noDecision')}</p>`;
    return `<ol class="ai-log">${a.decisions.map((d) => `<li>
      <div class="ai-log-h"><time>${esc(ctx.day(Date.parse(d.at)))} ${esc(ctx.time(Date.parse(d.at)))}</time>
        <span class="ai-st ai-st-${esc(d.status)}">${t(`ai.st.${d.status}`)}</span></div>
      ${d.summary ? `<p>${esc(d.summary)}</p>` : ''}
      ${d.executed?.length ? `<ul class="ai-exec">${d.executed.map((e) => `<li>${execLine(e)}${e.reason ? ` <small>— ${esc(e.reason)}</small>` : ''}</li>`).join('')}</ul>` : d.status === 'applied' ? `<p class="mc-note">${t('ai.noOrder')}</p>` : ''}
      ${d.rejected?.length ? `<details class="ai-rej"><summary>${t('ai.rejected', { n: d.rejected.length })}</summary><ul>${d.rejected.map((r) => `<li>${esc(r.label || r.action || '')} : ${esc(r.why)}</li>`).join('')}</ul></details>` : ''}
    </li>`).join('')}</ol>`;
  }

  function detailHTML(a) {
    const pos = a.positions.map((p) => ({ p, ...pnlOf(p) }));
    return `<div class="ai-detail">
      <p class="ai-strat">${esc(a.strategy)}</p>
      <p class="mc-note">${t('ai.meta', { lev: a.maxLev, n: a.trades })}</p>
      ${curveSVG(a.equityCurve, a.initial)}
      <h4>${t('ai.positions', { n: a.positions.length })}</h4>
      ${pos.length ? `<ul class="ai-pos">${pos.map(({ p, price, pnl, ccy }) => `<li><span><b>${esc(p.label)}</b> <small>${t(KIND[p.kind] || 'fav.stock')}</small></span>
        <span>${sideTxt(p.side)} ${p.lev}× · ${t('ai.entry')} ${ctx.price(p.entry, p.kind, p.ccy)} → ${isNum(price) ? ctx.price(price, p.kind, ccy) : ND}</span>
        <span class="${cls(pnl)}">${isNum(pnl) ? ctx.signed(pnl) : ND}</span></li>`).join('')}</ul>` : `<p class="mc-note">${t('ai.noPos')}</p>`}
      ${a.orders ? `<p class="mc-note">${t('ai.orders', { n: a.orders })}</p>` : ''}
      <h4>${t('ai.log')}</h4>${decisionsHTML(a)}
    </div>`;
  }

  function render(el) {
    const d = st.d;
    const me = ctx.myAccount(); // compte démo de l'utilisateur (sur l'appareil)
    let body;
    if (!d) body = `<p class="mc-note">${st.err ? t('ai.na') : t('loading')}</p>`;
    else {
      const rows = d.agents.map((a) => ({ a, pct: a.pnlPct }));
      if (me && isNum(me.pnlPct)) rows.push({ me, pct: me.pnlPct });
      rows.sort((x, y) => (y.pct ?? -1e9) - (x.pct ?? -1e9));
      body = `<ol class="ai-board">${rows.map((r, i) => r.me
        ? `<li class="ai-row ai-me"><span class="ai-rank">${i + 1}</span><span class="ai-name"><b>${t('ai.you')}</b><small>${esc(me.name || t('pf.demo'))}</small></span>
            <span class="ai-pct ${cls(r.pct)}">${ctx.pct(r.pct)}</span></li>`
        : `<li class="ai-row${st.open === r.a.slug ? ' open' : ''}"><button type="button" class="ai-head" data-ai="${esc(r.a.slug)}" aria-expanded="${st.open === r.a.slug}">
            <span class="ai-rank">${i + 1}</span><span class="ai-name"><b>${esc(r.a.name)}</b><small>${r.a.thinking ? t('ai.thinking') : r.a.nextRunAt && d.enabled ? t('ai.next', { t: ctx.time(Date.parse(r.a.nextRunAt)) }) : t('ai.paused')}</small></span>
            <span class="ai-pct ${cls(r.pct)}">${ctx.pct(r.pct)}<small>${isNum(r.a.equity) ? ctx.money(r.a.equity) : ND}</small></span></button>
            ${st.open === r.a.slug ? detailHTML(r.a) : ''}</li>`).join('')}</ol>
        ${!d.enabled ? `<p class="mc-note">${t('ai.notEnabled')}</p>` : ''}
        <p class="mc-note">${t('ai.rules', { m: d.limits?.maxMarginPct ?? ND, p: d.limits?.maxOpen ?? ND })} ${t('ai.updated', { t: ctx.time(d.fetchedAt) })}${st.offline ? ` · <b class="neg">${t('off.cached', { d: ctx.day(d.fetchedAt), t: ctx.time(d.fetchedAt) })}</b>` : ''}</p>`;
    }
    el.innerHTML = `<section class="card ai-card">
      <h2>${t('ai.title')}</h2>
      <p class="ai-badge" role="note">${t('ai.disclosure')}</p>
      <p class="consent-small">${t('ai.intro', { c: ctx.money(d?.capital ?? 100000) })}</p>
      ${body}
      ${!me ? `<p class="consent-small">${t('ai.youNone')}</p>` : ''}
    </section>`;
    el.onclick = (e) => {
      const b = e.target.closest('[data-ai]');
      if (!b) return;
      st.open = st.open === b.dataset.ai ? null : b.dataset.ai;
      render(el);
    };
    load(() => { if (el.isConnected) render(el); });
  }

  /** Ligne courte pour l'onglet « En bref » : meilleur agent. */
  function homeHTML() {
    const best = st.d?.agents?.[0];
    if (!best) return '';
    if (!st.d.agents.some((a) => a.decisions.length)) return `<p class="home-line"><b>${t('ai.title')}</b> <small>${t('ai.notStarted')}</small></p>`;
    return `<p class="home-line"><b>${t('ai.title')}</b> ${t('ai.leader', { n: esc(best.name) })} <span class="${cls(best.pnlPct)}">${ctx.pct(best.pnlPct)}</span></p>`;
  }

  return { render, load, homeHTML };
}
