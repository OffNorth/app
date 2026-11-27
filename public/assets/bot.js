// Catégorie « Bot » : terminal de suivi du bot de paper trading (simulation, argent fictif).
// État publié par le bot toutes les 15 s environ (/api/bot) : comptes FTMO et Lucid simulés, positions ouvertes avec
// entrée / SL / TP, trades clôturés. Graphique : le vrai graphique TradingView (widget, après consentement) par défaut ;
// vue « Trades du bot » : TradingView Lightweight Charts™ (servie par le site), bougies Yahoo (/api/candles), lignes
// d'entrée, de stop et d'objectif de chaque position, repères des trades clôturés.
// Mise en page « terminal » : bandeau d'état, liste des marchés, graphique, comptes, blotter à onglets.

const LIB = '/vendor/lightweight-charts/lightweight-charts.standalone.production.js';
const TFS = ['1m', '5m', '15m', '1h', '1d'];
const TF_SEC = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '1d': 86400 };
const TV_TF = { '1m': '1', '5m': '5', '15m': '15', '1h': '60', '1d': 'D' };
const SRC_KEY = 'marches:botChart';
const readSrc = () => { try { return localStorage.getItem(SRC_KEY) === 'tv' ? 'tv' : 'bot'; } catch { return 'bot'; } };
const TV = { gold: 'COMEX:GC1!', nas100: 'NASDAQ:NDX', spx: 'SP:SPX', eurusd: 'FX:EURUSD', silver: 'COMEX:SI1!', dow: 'DJ:DJI', russell: 'TVC:RUT',
  tlt: 'NASDAQ:TLT', googl: 'NASDAQ:GOOGL', pltr: 'NASDAQ:PLTR', lly: 'NYSE:LLY', ba: 'NYSE:BA' };
// Symboles intégrables dans le widget (les indices et futures n'y sont pas disponibles : CFD équivalents, comme sur FTMO)
const TV_EMBED = { ...TV, gold: 'OANDA:XAUUSD', nas100: 'CAPITALCOM:US100', spx: 'CAPITALCOM:US500', silver: 'OANDA:XAGUSD', dow: 'CAPITALCOM:US30', russell: 'CAPITALCOM:RTY' };
// Code court affiché à la place d'un émoji (contrat équivalent)
const CODE = { gold: 'XAU', nas100: 'NDX', spx: 'SPX', eurusd: 'EURUSD', silver: 'XAG', dow: 'DJI', russell: 'RUT' };
const LIVE_MS = 15_000;
const CANDLE_MS = 30_000;
const PAGE = 40;
const local = (sec) => sec - new Date(sec * 1000).getTimezoneOffset() * 60;

/*
 * Or et argent en temps réel : bougies des contrats perpétuels publics de Binance (XAUUSDT / XAGUSDT), lues
 * directement par le navigateur (sans compte ni clé ; Yahoo a ≈ 10 min de retard). Les trades du bot sont publiés à
 * l'échelle Yahoo : ils sont décalés de l'écart Binance − Yahoo (celui du bot s'il trade sur Binance, sinon la médiane
 * des clôtures communes). Binance injoignable (pays bloqué) ou écart inconnu : bougies Yahoo, comme avant.
 */
const BN_SYM = { gold: 'XAUUSDT', silver: 'XAGUSDT' };
const NYH = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', hour12: false });
/** Marché des métaux ouvert (dimanche 18 h → vendredi 17 h à New York, pause de 17 h) : Binance cote aussi le week-end. */
function metalsOpen(t) {
  const p = Object.fromEntries(NYH.formatToParts(new Date(t * 1000)).map((x) => [x.type, x.value]));
  const h = Number(p.hour) % 24;
  if (p.weekday === 'Sat') return false;
  if (p.weekday === 'Sun') return h >= 18;
  if (p.weekday === 'Fri') return h < 17;
  return h !== 17;
}
// Lecture directe de Binance par le navigateur ; si elle échoue une fois (réseau, pays, navigateur), relais du site
// (/api/bn, serveur en Europe) pour le reste de la visite
let bnDirect = true;
async function getJSONTimeout(url, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
async function binanceRows(sym, tf) {
  if (bnDirect) {
    const rows = await getJSONTimeout(`https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=${tf}&limit=1000`, 5000);
    if (Array.isArray(rows)) return rows;
    bnDirect = false;
  }
  return getJSONTimeout(`/api/bn?symbol=${sym}&interval=${tf}`, 8000);
}
async function binanceCandles(id, tf, yahoo, botBasis) {
  const sym = BN_SYM[id];
  if (!sym || tf === '1d') return null;
  try {
    const rows = await binanceRows(sym, tf);
    const bars = (Array.isArray(rows) ? rows : []).map((r) => [Math.floor(Number(r[0]) / 1000), +r[1], +r[2], +r[3], +r[4], +r[5]])
      .filter((b) => b[4] > 0 && metalsOpen(b[0]));
    if (bars.length < 10) return null;
    let shift = Number.isFinite(botBasis) ? botBasis : null;
    if (shift === null) {
      const ym = new Map((yahoo || []).map((c) => [c[0], c[4]]));
      const d = bars.filter((b) => ym.has(b[0])).slice(-60).map((b) => b[4] - ym.get(b[0])).sort((x, y) => x - y);
      if (d.length >= 3) shift = d[Math.floor(d.length / 2)];
    }
    return shift === null ? null : { candles: bars, shift, sym };
  } catch {
    return null;
  }
}


// Thème sombre de TradingView (couleurs des bougies, grille, réticule, volume)
const TVC = { bg: '#0f1217', txt: '#b2b5be', grid: 'rgba(42, 46, 57, 0.55)', line: '#2a2e39', cross: '#9598a1', label: '#363a45',
  up: '#089981', dn: '#f23645', volUp: 'rgba(8, 153, 129, 0.45)', volDn: 'rgba(242, 54, 69, 0.45)', entry: '#2962ff',
  font: '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif' };

/**
 * Zones d'un trade, comme l'outil « position longue / courte » de TradingView : rouge de l'entrée au stop d'origine,
 * vert de l'entrée à l'objectif (ou au cours de sortie si l'objectif n'est pas connu), de l'entrée à la sortie
 * (position ouverte : jusqu'à la dernière bougie et un peu au-delà). Trait pointillé de l'entrée à la sortie.
 */
class PositionZones {
  constructor(prec, locale) { this.zones = []; this.times = []; this.sec = 60; this.prec = prec; this.locale = locale; this.chart = null; this.series = null; this.req = null; }
  attached({ chart, series, requestUpdate }) { this.chart = chart; this.series = series; this.req = requestUpdate; }
  detached() { this.chart = null; this.series = null; this.req = null; }
  set(zones, times, sec) { this.zones = zones; this.times = times; this.sec = sec; this.req?.(); }
  updateAllViews() {}
  // Temps → position logique (fractionnaire) dans la liste des bougies, y compris avant / après
  logical(t) {
    const T = this.times; const n = T.length;
    if (!n) return null;
    if (t <= T[0]) return (t - T[0]) / this.sec;
    if (t >= T[n - 1]) return n - 1 + (t - T[n - 1]) / this.sec;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (T[mid] <= t) lo = mid; else hi = mid; }
    return lo + Math.min(1, (t - T[lo]) / Math.max(1, T[hi] - T[lo]));
  }
  fmt(v) { return v.toLocaleString(this.locale, { minimumFractionDigits: this.prec, maximumFractionDigits: this.prec }); }
  paneViews() {
    return [{ zOrder: () => 'bottom', renderer: () => ({ draw: (target) => this.draw(target) }) }];
  }
  draw(target) {
    const ch = this.chart, se = this.series;
    if (!ch || !se || !this.zones.length) return;
    const ts = ch.timeScale();
    const lastL = this.times.length - 1;
    target.useBitmapCoordinateSpace(({ context: g, horizontalPixelRatio: hr, verticalPixelRatio: vr, bitmapSize }) => {
      for (const z of this.zones) {
        const l0 = this.logical(z.t0);
        const l1 = z.open ? lastL + 6 : this.logical(z.t1);
        if (l0 == null || l1 == null) continue;
        // logicalToCoordinate n'accepte que des positions entières : interpolation entre deux bougies
        const xOf = (l) => { const i = Math.floor(l); const a = ts.logicalToCoordinate(i), b = ts.logicalToCoordinate(i + 1); return a == null || b == null ? null : a + (l - i) * (b - a); };
        let x0 = xOf(l0), x1 = xOf(Math.max(l1, l0 + 1));
        if (x0 == null || x1 == null) continue;
        x0 = Math.round(x0 * hr); x1 = Math.round(x1 * hr);
        if (x1 < 0 || x0 > bitmapSize.width) continue;
        const yE = se.priceToCoordinate(z.entry);
        if (yE == null) continue;
        const long = z.side === 'long';
        const gain = (v) => Number.isFinite(v) && (long ? v > z.entry : v < z.entry);
        const tp = gain(z.tp) ? z.tp : gain(z.exit) ? z.exit : null;
        const box = (price, fill, stroke) => {
          const y = se.priceToCoordinate(price);
          if (y == null) return null;
          const a = Math.round(Math.min(y, yE) * vr), b = Math.round(Math.max(y, yE) * vr);
          g.fillStyle = fill; g.fillRect(x0, a, x1 - x0, Math.max(1, b - a));
          g.fillStyle = stroke; g.fillRect(x0, Math.round(y * vr), x1 - x0, Math.max(1, Math.round(vr)));
          return { a, b, y: Math.round(y * vr) };
        };
        // Stop du côté de la perte seulement (anciens trades : le stop publié peut avoir suivi le cours au-delà de l'entrée)
        const slOk = Number.isFinite(z.sl) && (long ? z.sl < z.entry : z.sl > z.entry);
        const red = slOk ? box(z.sl, 'rgba(242, 54, 69, 0.20)', 'rgba(242, 54, 69, 0.85)') : null;
        const green = tp != null ? box(tp, 'rgba(8, 153, 129, 0.20)', 'rgba(8, 153, 129, 0.85)') : null;
        // Ligne d'entrée
        g.fillStyle = 'rgba(178, 181, 190, 0.9)'; g.fillRect(x0, Math.round(yE * vr), x1 - x0, Math.max(1, Math.round(vr)));
        // Trajet entrée → sortie (pointillé)
        if (!z.open && Number.isFinite(z.exit)) {
          const yX = se.priceToCoordinate(z.exit);
          if (yX != null) {
            g.save(); g.strokeStyle = z.win ? 'rgba(8, 153, 129, 0.95)' : 'rgba(242, 54, 69, 0.95)'; g.lineWidth = Math.max(1, Math.round(hr));
            g.setLineDash([4 * hr, 3 * hr]); g.beginPath(); g.moveTo(x0, Math.round(yE * vr)); g.lineTo(x1, Math.round(yX * vr)); g.stroke(); g.restore();
          }
        }
        // Libellés (si la zone est assez grande) : objectif et stop, en R
        const w = x1 - x0;
        if (w > 70 * hr) {
          const R = slOk ? Math.abs(z.entry - z.sl) : 0;
          g.font = `${Math.round(10.5 * vr)}px ${TVC.font}`; g.textBaseline = 'middle';
          const tag = (zone, txt, color) => {
            if (!zone || zone.b - zone.a < 14 * vr) return;
            const yy = zone.y === zone.a ? zone.a + 8 * vr : zone.b - 8 * vr;
            const tw = g.measureText(txt).width + 8 * hr;
            if (tw > w - 6 * hr) return; // pas assez de place dans la zone
            g.fillStyle = color; g.fillRect(x0 + 3 * hr, yy - 7 * vr, tw, 14 * vr);
            g.fillStyle = '#ffffff'; g.fillText(txt, x0 + 7 * hr, yy + 0.5 * vr);
          };
          if (green && tp != null) tag(green, `${tp === z.tp ? 'TP' : 'Sortie'} ${this.fmt(tp)}${R ? ` · ${(Math.abs(tp - z.entry) / R).toLocaleString(this.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} R` : ''}`, 'rgba(8, 153, 129, 0.95)');
          if (red) tag(red, `SL ${this.fmt(z.sl)}`, 'rgba(242, 54, 69, 0.95)');
        }
      }
    });
  }
}


/**
 * Script Pine (v6) des trades du bot sur un marché, à coller dans l'éditeur Pine de TradingView : zones rouge (risque)
 * et verte (objectif) comme l'outil position, ligne d'entrée, trajet jusqu'à la sortie, étiquettes et résultat.
 * Photo des trades au moment de la copie (TradingView ne peut pas lire le bot en direct).
 */
function pineScript({ market, name, tvSymbol, trades, at }) {
  const fl = (v) => { if (!Number.isFinite(v)) return '0.0'; let x = String(Number(v.toPrecision(10))); if (!/[.e]/.test(x)) x += '.0'; return x; };
  const str = (v) => `"${String(v).replace(/["\\]/g, '').slice(0, 40)}"`;
  const list = trades.slice(-150);
  const arr = (f) => list.map(f).join(', ');
  const d = new Date(at);
  const stamp = `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  const head = `//@version=6
// Trades du bot de paper trading (simulation, argent fictif) · ${name}
// Généré le ${stamp} : ${list.length} trade(s). Les trades suivants n'y sont pas : recopie le script depuis le site.
// À ouvrir sur ${tvSymbol} (mêmes cours que le bot).
indicator("Trades du bot · ${name.replace(/"/g, '')}", overlay = true, max_boxes_count = 500, max_lines_count = 500, max_labels_count = 500)

showZones = input.bool(true, "Zones rouge / verte")
showLabels = input.bool(true, "Étiquettes")
showPath = input.bool(true, "Trajet entrée → sortie")

UP = #089981
DN = #f23645
`;
  if (!list.length) return `${head}
if barstate.islastconfirmedhistory
    label.new(bar_index, high, "Aucun trade du bot sur ce marché pour l'instant", style = label.style_label_down, color = color.gray, textcolor = color.white)
`;
  return `${head}
// Un trade par colonne : entrée et sortie (ms, UTC ; 0 = position ouverte), sens (1 achat, -1 vente), prix, stop d'origine,
// objectif (0 = inconnu), sortie, résultat ($), étiquette
var T0 = array.from(${arr((x) => Math.round(x.entryT * 1000))})
var T1 = array.from(${arr((x) => (x.exitT ? Math.round(x.exitT * 1000) : 0))})
var S = array.from(${arr((x) => (x.side === 'long' ? 1 : -1))})
var E = array.from(${arr((x) => fl(x.entry))})
var SL = array.from(${arr((x) => fl(x.sl0 ?? x.sl))})
var TP = array.from(${arr((x) => fl(x.tp))})
var X = array.from(${arr((x) => fl(x.exit))})
var PNL = array.from(${arr((x) => fl(x.pnl ?? 0))})
var TXT = array.from(${arr((x) => str(`${x.acct} ${x.sid}`))})

barMs = time - nz(time[1], time - 60000)

if barstate.islastconfirmedhistory
    n = array.size(T0)
    for i = 0 to n - 1
        t0 = array.get(T0, i)
        t1 = array.get(T1, i)
        isOpen = t1 == 0
        tEnd = isOpen ? time + 10 * barMs : t1
        ext = isOpen ? extend.right : extend.none
        e = array.get(E, i)
        sl = array.get(SL, i)
        tp = array.get(TP, i)
        x = array.get(X, i)
        s = array.get(S, i)
        pnl = array.get(PNL, i)
        win = pnl >= 0
        if showZones
            if sl > 0 and (s == 1 ? sl < e : sl > e)
                box.new(left = t0, top = math.max(e, sl), right = tEnd, bottom = math.min(e, sl), xloc = xloc.bar_time, extend = ext, border_color = color.new(DN, 20), bgcolor = color.new(DN, 80), text = "SL " + str.tostring(sl, format.mintick), text_color = color.new(DN, 0), text_size = size.tiny, text_halign = text.align_left, text_valign = s == 1 ? text.align_bottom : text.align_top)
            tgt = tp > 0 and (s == 1 ? tp > e : tp < e) ? tp : not isOpen and (s == 1 ? x > e : x < e) ? x : 0.0
            if tgt > 0
                box.new(left = t0, top = math.max(e, tgt), right = tEnd, bottom = math.min(e, tgt), xloc = xloc.bar_time, extend = ext, border_color = color.new(UP, 20), bgcolor = color.new(UP, 80), text = (tgt == tp ? "TP " : "Sortie ") + str.tostring(tgt, format.mintick), text_color = color.new(UP, 0), text_size = size.tiny, text_halign = text.align_left, text_valign = s == 1 ? text.align_top : text.align_bottom)
            line.new(t0, e, tEnd, e, xloc = xloc.bar_time, extend = ext, color = color.new(#b2b5be, 0), width = 1)
        if showPath and not isOpen
            line.new(t0, e, t1, x, xloc = xloc.bar_time, color = win ? UP : DN, style = line.style_dashed, width = 2)
        if showLabels
            label.new(t0, e, (s == 1 ? "▲ " : "▼ ") + array.get(TXT, i), xloc = xloc.bar_time, style = s == 1 ? label.style_label_up : label.style_label_down, color = #2962ff, textcolor = color.white, size = size.small)
            if not isOpen
                label.new(t1, x, (win ? "+" : "") + str.tostring(pnl, "#,##0") + " $", xloc = xloc.bar_time, style = label.style_label_left, color = win ? UP : DN, textcolor = color.white, size = size.small)

// Rappel du symbole : les prix du bot sont ceux de ${tvSymbol}
var table info = table.new(position.top_right, 1, 2)
if barstate.islastconfirmedhistory
    table.cell(info, 0, 0, "Trades du bot · ${name.replace(/"/g, '')} · ${list.length} trade(s) au ${stamp}", text_color = color.white, bgcolor = color.new(#2a2e39, 0), text_size = size.small)
    if syminfo.prefix + ":" + syminfo.ticker != "${tvSymbol}"
        table.cell(info, 0, 1, "Ouvre ce script sur ${tvSymbol} : ce graphique a d'autres prix", text_color = color.white, bgcolor = color.new(DN, 10), text_size = size.small)
`;
}

let libPromise = null;
function loadLib() {
  if (window.LightweightCharts) return Promise.resolve(window.LightweightCharts);
  libPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = LIB;
    s.onload = () => resolve(window.LightweightCharts);
    s.onerror = () => { libPromise = null; reject(new Error('lightweight-charts')); };
    document.head.append(s);
  });
  return libPromise;
}
const cssVar = (el, n, d) => (el && getComputedStyle(el).getPropertyValue(n).trim()) || d;

export function createBot(ctx) {
  const { t, esc, isNum, ND } = ctx;
  const st = { d: null, at: 0, err: false, loading: false, market: null, tf: '1m', timer: null, chart: null, el: null, tab: 'pos', shown: PAGE, focus: null, curves: {}, src: readSrc() };
  const cls = (v) => (!isNum(v) || Math.abs(v) < 0.5 ? '' : v > 0 ? 'up' : 'dn');
  const money = (v) => (isNum(v) ? ctx.money(v) : ND);
  const signed = (v) => (isNum(v) ? ctx.signed(v) : ND);
  const px = (v) => (isNum(v) ? (Math.abs(v) < 10 ? v.toFixed(5) : v.toLocaleString(ctx.locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })) : ND);
  const mkName = (id) => st.d?.markets?.find((m) => m.id === id)?.name || id;
  const code = (id) => CODE[id] || String(id).toUpperCase();
  const side = (s) => `<span class="tm-dir ${s === 'long' ? 'up' : 'dn'}">${esc(t(s === 'long' ? 'bot.buy' : 'bot.sell'))}</span>`;
  const firm = (a) => `<span class="tm-firm tm-firm-${esc(a.id)}">${esc(a.firm)}</span>`;
  const hhmm = (sec) => `${esc(ctx.day(sec * 1000))} ${esc(ctx.time(sec * 1000))}`;

  async function load(after) {
    if (st.loading) return;
    st.loading = true;
    try {
      const r = await ctx.getJSON('/api/bot');
      if (r.body.error) throw new Error(r.body.error);
      st.d = r.body.data || null;
      st.err = false;
    } catch { st.err = true; }
    st.at = Date.now();
    st.loading = false;
    after?.();
  }

  // Libellé court d'un compte : « Lucid financé », « Lucid journalier », « Lucid intraday » (2 évaluations Lucid)
  const tagOf = (a) => { const g = a.tag || (a.id === 'lucidf' ? 'funded' : ''); return g === 'funded' ? t('bot.fundedShort') : g === 'daily' ? t('bot.tagDaily') : g === 'intraday' ? t('bot.tagIntraday') : g === 'combined' ? t('bot.tagCombined') : ''; };
  const acctName = (a) => (tagOf(a) ? `${a.firm} ${tagOf(a)}` : a.firm);
  const positionsOn = (market) => (st.d?.accounts || []).flatMap((a) => a.open.filter((p) => p.market === market).map((p) => ({ ...p, acct: acctName(a) })));
  const allOpen = () => (st.d?.accounts || []).flatMap((a) => a.open.map((p) => ({ a, p })));

  /* ---------- Bandeau d'état ---------- */
  function statusHTML() {
    const at = st.d?.at;
    const age = at ? Math.max(0, Math.round((Date.now() - at) / 1000)) : null;
    const live = age !== null && age < 180;
    const pnl = (st.d?.accounts || []).reduce((s, a) => s + (a.unrealized || 0), 0);
    return `<div class="tm-stat">
      <span class="tm-dot ${live ? 'on' : 'off'}"></span><b>${live ? t('bot.tmLive') : t('bot.tmOff')}</b>
      <span class="tm-k">${t('bot.tmUpd')}</span><span class="tm-v">${at ? esc(ctx.time(at)) : ND}</span>
      <span class="tm-k">${t('bot.tmAge')}</span><span class="tm-v">${age === null ? ND : `${age} s`}</span>
      <span class="tm-k">${t('bot.tmOpen')}</span><span class="tm-v">${allOpen().length}</span>
      <span class="tm-k">${t('bot.tmUnreal')}</span><span class="tm-v ${cls(pnl)}">${signed(pnl)}</span>
      ${st.d?.version ? `<span class="tm-k">${t('bot.tmVer')}</span><span class="tm-v">${esc(String(st.d.version).slice(0, 7))}</span>` : ''}
      <span class="tm-sp"></span><a class="tm-tv tm-pdf" href="/docs/strategies-bot.pdf" target="_blank" rel="noopener" title="${esc(t('bot.pdf'))}">📄 PDF</a><span class="tm-sim">${t('bot.tmSim')}</span>
    </div>`;
  }

  /* ---------- Liste des marchés ---------- */
  function watchHTML() {
    const ms = st.d?.markets || [];
    const rows = ms.map((m) => {
      const pos = positionsOn(m.id);
      const pnl = pos.reduce((s, p) => s + (p.pnl || 0), 0);
      const dir = pos.length ? (pos.every((p) => p.side === 'long') ? 'up' : pos.every((p) => p.side === 'short') ? 'dn' : '') : '';
      return `<button type="button" class="tm-w${m.id === st.market ? ' on' : ''}" data-bmk="${esc(m.id)}" aria-pressed="${m.id === st.market}">
        <span class="tm-w-c">${esc(code(m.id))}</span><span class="tm-w-p">${px(m.price)}</span>
        <span class="tm-w-n">${esc(m.name)}</span><span class="tm-w-x ${dir}">${pos.length ? `${pos.length} POS <i class="${cls(pnl)}">${signed(pnl)}</i>` : '—'}</span>
      </button>`;
    }).join('');
    return `<div class="tm-ph"><span>${t('bot.tmWatch')}</span><span>${ms.length}</span></div><div class="tm-wl" role="group" aria-label="${t('bot.market')}">${rows}</div>`;
  }

  /* ---------- Comptes ---------- */
  function bar(frac, tone) {
    const w = Math.max(0, Math.min(1, isNum(frac) ? frac : 0)) * 100;
    return `<span class="tm-bar"><i class="${tone}" style="width:${w.toFixed(1)}%"></i></span>`;
  }
  function accountHTML(a) {
    const ret = ((a.equity / a.capital) - 1) * 100;
    const danger = (u) => (u > 0.6 ? 'dn' : u > 0.3 ? 'wn' : 'up');
    const phase = a.phase === 'funded' ? t('bot.funded') : `${esc(a.program)} · ${t('bot.attempt', { n: a.attempt })}`;
    const row = (k, v, extra = '') => `<div class="tm-kv"><span>${k}</span><b>${v}</b>${extra}</div>`;
    return `<section class="tm-acct">
      <div class="tm-ph">${firm(a)}<span class="tm-ph-t">${esc(a.label)}</span><span class="tm-ph-m">${phase}</span></div>
      <div class="tm-eq"><b>${money(a.equity)}</b><span class="${cls(ret * 100)}">${ctx.pct(ret)}</span></div>
      <div class="tm-kvs">
        ${row(t('bot.tmBal'), money(a.balance))}
        ${row(t('bot.tmUnreal'), `<span class="${cls(a.unrealized)}">${signed(a.unrealized)}</span>`, `<em>${a.open.length} pos</em>`)}
        ${row(t('bot.tmReal'), `<span class="${cls(a.realized)}">${signed(a.realized)}</span>`)}
        ${isNum(a.target)
    ? row(t('bot.tmTarget', { p: a.targetPct }), money(a.target), `<em>${Math.round(Math.min(1, Math.max(0, a.progress || 0)) * 100)} %</em>${bar(a.progress, 'up')}`)
    : row(t('bot.funded'), `${a.split} %`)}
        ${isNum(a.dailyLimitPct)
    ? row(t('bot.tmDay', { p: a.dailyLimitPct }), money(a.dailyFloor), `<em>${Math.round((a.dailyUsed || 0) * 100)} %</em>${bar(a.dailyUsed, danger(a.dailyUsed))}`)
    : row(t('bot.tmDayNone'), '—')}
        ${row(t(a.trailing ? 'bot.tmMaxT' : 'bot.tmMax', { v: money(a.maxLoss) }), money(a.maxFloor), `<em>${Math.round((a.maxUsed || 0) * 100)} %</em>${bar(a.maxUsed, danger(a.maxUsed))}`)}
        ${a.phase === 'funded'
    ? row(t('bot.tmPayouts'), `${a.payouts?.n || 0}${a.payoutsMax ? ` / ${a.payoutsMax}` : ''}`, `<em>${money(a.payouts?.trader || 0)}</em>`) + (a.maxContracts ? row(t('bot.tmContracts'), `${a.maxContracts} micros`) : '')
    : row(t('bot.tmDays'), `${a.days} / ${a.minDays}`, a.bestDayPct ? `<em>${t('bot.tmBest', { p: a.bestDayPct })}</em>` : '')}
      </div>
      <div class="tm-curve" data-curve="${esc(a.id)}"></div>
    </section>`;
  }

  /** Portefeuille perso simulé (50 % monde, 10 % or, 40 % bot) : valeur en €, répartition, poches du bot. */
  function portfolioHTML(p) {
    const eur = (v) => `${Math.round(v).toLocaleString(ctx.locale())} €`;
    const sp = (x) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)} %`;
    const w = p.weights || {};
    const row = (k, v, extra = '') => `<div class="tm-kv"><span>${k}</span><b>${v}</b>${extra}</div>`;
    const alloc = [['WORLD', t('bot.ppWorld')], ['GLD', t('bot.ppGold')], ['BOT', t('bot.ppBot')]]
      .map(([k, name]) => row(name, `${Math.round((w[k] || 0) * 100)} %`, `<em>${t('bot.ppTarget', { p: Math.round((p.target?.[k] || 0) * 100) })}</em>`)).join('');
    return `<section class="tm-acct">
      <div class="tm-ph"><span class="tm-firm tm-firm-perso">PERSO</span><span class="tm-ph-t">${t('bot.ppTitle')}</span><span class="tm-ph-m">${t('bot.ppSince', { d: ctx.day(p.startT * 1000) })}</span></div>
      <div class="tm-eq"><b>${eur(p.value)}</b><span class="${cls(p.ret * 1000)}">${sp(p.ret)}</span></div>
      <div class="tm-kvs">
        ${row(t('bot.ppDd'), `<span class="${cls(p.drawdown * 1000)}">${sp(p.drawdown)}</span>`, `<em>${t('bot.ppMaxDd', { v: sp(p.maxDrawdown) })}</em>`)}
        ${alloc}
        ${(p.sleeves || []).map((s) => row(esc(s.name), `<span class="${s.open ? 'up' : ''}">${s.open ? esc(s.sym) : t('bot.ppCash')}</span>`)).join('')}
      </div>
      <div class="tm-curve" data-curve="perso"></div>
    </section>`;
  }

  /** Courbe de la valeur du compte (trades clôturés, puis valeur actuelle). */
  async function drawCurves(root) {
    const LWC = await loadLib().catch(() => null);
    if (!LWC || !st.d) return;
    const pf = st.d.portfolio;
    const pbox = root.querySelector('[data-curve="perso"]');
    if (pf && pbox && pf.curve?.length > 1) {
      st.curves.perso?.remove?.();
      pbox.innerHTML = '';
      const ch = LWC.createChart(pbox, { height: 64, autoSize: true, layout: { background: { type: 'solid', color: 'transparent' }, textColor: cssVar(st.el, '--tm-mut', '#6b7785'), attributionLogo: false },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } }, rightPriceScale: { visible: false }, timeScale: { visible: false }, handleScroll: false, handleScale: false, crosshair: { mode: 2 } });
      const s = ch.addSeries(LWC.LineSeries, { color: pf.value >= pf.capital ? cssVar(st.el, '--tm-up', '#2ebd85') : cssVar(st.el, '--tm-dn', '#f6465d'), lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      s.setData(pf.curve.map(([time, value]) => ({ time, value })));
      s.createPriceLine({ price: pf.capital, color: cssVar(st.el, '--tm-mut', '#6b7785'), lineStyle: 2, lineWidth: 1, axisLabelVisible: false, title: '' });
      ch.timeScale().fitContent();
      st.curves.perso = ch;
    }
    for (const a of st.d.accounts) {
      const box = root.querySelector(`[data-curve="${a.id}"]`);
      if (!box) continue;
      st.curves[a.id]?.remove?.();
      box.innerHTML = '';
      const pts = [];
      let v = a.balance - a.closed.reduce((s, x) => s + (x.pnl || 0), 0);
      const t0 = a.closed[0]?.entryT || Math.floor(Date.now() / 1000) - 86400;
      pts.push({ time: local(t0), value: v });
      for (const x of [...a.closed].sort((p, q) => p.exitT - q.exitT)) { v += x.pnl || 0; pts.push({ time: local(x.exitT), value: v }); }
      pts.push({ time: local(Math.floor((st.d.at || Date.now()) / 1000)), value: a.equity });
      const uniq = []; for (const p of pts) { if (uniq.length && p.time <= uniq[uniq.length - 1].time) p.time = uniq[uniq.length - 1].time + 1; uniq.push(p); }
      const up = a.equity >= a.capital;
      const ch = LWC.createChart(box, { height: 64, autoSize: true, layout: { background: { type: 'solid', color: 'transparent' }, textColor: cssVar(st.el, '--tm-mut', '#6b7785'), attributionLogo: false },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } }, rightPriceScale: { visible: false }, timeScale: { visible: false }, handleScroll: false, handleScale: false, crosshair: { mode: 2 } });
      const s = ch.addSeries(LWC.LineSeries, { color: up ? cssVar(st.el, '--tm-up', '#2ebd85') : cssVar(st.el, '--tm-dn', '#f6465d'), lineWidth: 1, lineType: 1, priceLineVisible: false, lastValueVisible: false });
      s.setData(uniq);
      s.createPriceLine({ price: a.capital, color: cssVar(st.el, '--tm-mut', '#6b7785'), lineStyle: 2, lineWidth: 1, axisLabelVisible: false, title: '' });
      ch.timeScale().fitContent();
      st.curves[a.id] = ch;
    }
  }

  /* ---------- Graphique ---------- */
  function chartBarHTML() {
    const m = st.d?.markets?.find((x) => x.id === st.market);
    const pos = positionsOn(st.market);
    return `<div class="tm-cb">
      <b class="tm-cb-s">${esc(code(st.market))}</b><span class="tm-cb-n">${esc(m?.name || '')}</span><span class="tm-cb-p">${px(m?.price)}</span>
      ${pos.length ? `<span class="tm-cb-pos">${pos.map((p) => `${esc(p.acct)} ${side(p.side)} @ ${px(p.entry)}`).join(' · ')}</span>` : ''}
      <span class="tm-sp"></span>
      <span class="tm-tfs" role="group" aria-label="${t('bot.src')}">${[['tv', t('bot.srcTV')], ['bot', t('bot.srcBot')]].map(([v, l]) => `<button type="button" data-bsrc="${v}" aria-pressed="${srcOf() === v}">${esc(l)}</button>`).join('')}</span>
      <span class="tm-tfs" role="group" aria-label="${t('bot.tf')}">${TFS.map((x) => `<button type="button" data-btf="${x}" aria-pressed="${x === st.tf}">${x}</button>`).join('')}</span>
      <button type="button" class="tm-tv" data-pine title="${esc(t('bot.pineTitle'))}">Pine</button>
      <a class="tm-tv" href="https://www.tradingview.com/chart/?symbol=${encodeURIComponent(TV[st.market] || '')}" target="_blank" rel="noopener" title="${esc(t('bot.openTV', { m: m?.name || '' }))}">TV ↗</a>
    </div>`;
  }
  // Légende O H L C (style TradingView) : symbole · unité de temps · source, puis les cours de la bougie
  function ohlcHTML(m, b, bars) {
    if (!b) return '';
    const i = bars.indexOf(b);
    const prev = i > 0 ? bars[i - 1].close : b.open;
    const d = b.close - prev;
    const dp = m.id === 'eurusd' ? 5 : 2;
    const fd = (v) => v.toLocaleString(ctx.locale(), { minimumFractionDigits: dp, maximumFractionDigits: dp });
    const c2 = b.close >= b.open ? 'up' : 'dn';
    return `<span class="tm-ohlc-s">${esc(code(m.id))} · ${esc(st.tf)} · ${esc(m.name || '')}</span>
      <span>O<b class="${c2}">${px(b.open)}</b></span><span>H<b class="${c2}">${px(b.high)}</b></span><span>L<b class="${c2}">${px(b.low)}</b></span><span>C<b class="${c2}">${px(b.close)}</b></span>
      <b class="${d >= 0 ? 'up' : 'dn'}">${d >= 0 ? '+' : '−'}${fd(Math.abs(d))} (${d >= 0 ? '+' : '−'}${Math.abs((d / prev) * 100).toLocaleString(ctx.locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %)</b>`;
  }
  const srcOf = () => (st.src === 'tv' && TV_EMBED[st.market] && ctx.tv ? 'tv' : 'bot');
  async function drawChart() {
    const box = st.el?.querySelector('#bot-chart');
    if (!box || !st.d) return;
    const legend = st.el.querySelector('#bot-legend');
    if (legend) legend.textContent = srcOf() === 'tv' ? t('bot.tvLegend') : t('bot.legend');
    if (srcOf() === 'tv') {
      // Vrai graphique TradingView : rechargé seulement si le marché, l'unité de temps ou le consentement changent
      const m = st.d.markets.find((x) => x.id === st.market) || st.d.markets[0];
      const key = `tv:${m?.id}:${st.tf}`;
      if (box.dataset.k === key && box.firstElementChild) return;
      st.chart?.chart?.remove(); st.chart = null;
      box.dataset.k = key;
      box.classList.add('tm-chart-tv');
      ctx.tv(box, TV_EMBED[m.id], TV_TF[st.tf], m.name || m.id);
      return;
    }
    if (box.dataset.k) { delete box.dataset.k; box.classList.remove('tm-chart-tv'); box.innerHTML = ''; }
    const LWC = await loadLib().catch(() => null);
    if (srcOf() === 'tv') return;
    if (!LWC) { box.innerHTML = `<p class="tm-empty">${t('bot.chartNa')}</p>`; return; }
    const m = st.d.markets.find((x) => x.id === st.market) || st.d.markets[0];
    if (!m) return;
    let data = null;
    const tf0 = st.tf, mk0 = st.market;
    try { data = (await ctx.getJSON(`/api/candles?kind=i&symbol=${encodeURIComponent(m.symbol)}&tf=${tf0}`)).body; } catch { /* n/d */ }
    // Or / argent : bougies Binance en temps réel si joignables (décalage des trades : sh)
    const bn = BN_SYM[m.id] ? await binanceCandles(m.id, tf0, data?.candles, m.feed === 'binance' ? m.basis : null) : null;
    const sh = bn ? bn.shift : 0;
    if (bn) data = { ...(data || {}), candles: bn.candles };
    if (!box.isConnected || srcOf() === 'tv') return; // entre-temps : retour au graphique TradingView
    if (st.tf !== tf0 || st.market !== mk0) return; // réponse d'un ancien choix : le nouveau graphique arrive
    if (!data?.candles?.length) { box.innerHTML = `<p class="tm-empty">${t('bot.chartNa')}</p>`; st.chart?.chart?.remove(); st.chart = null; return; }
    const key = `${m.id}:${st.tf}`;
    // Couleurs et réglages de TradingView (thème sombre)
    const UP = TVC.up, DN = TVC.dn;
    const prec = m.id === 'eurusd' ? 5 : 2;
    if (!st.chart || st.chart.key !== key || !box.contains(st.chart.host)) {
      st.chart?.chart?.remove();
      box.innerHTML = '';
      const host = document.createElement('div');
      host.className = 'tm-chart-host';
      const ohlc = document.createElement('div');
      ohlc.className = 'tm-ohlc';
      box.append(host, ohlc);
      const chart = LWC.createChart(host, { autoSize: true,
        layout: { background: { type: 'solid', color: TVC.bg }, textColor: TVC.txt, fontSize: 11, fontFamily: TVC.font, attributionLogo: true },
        grid: { vertLines: { color: TVC.grid }, horzLines: { color: TVC.grid } },
        rightPriceScale: { borderColor: TVC.line, scaleMargins: { top: 0.1, bottom: 0.22 } },
        crosshair: { mode: 0, vertLine: { color: TVC.cross, width: 1, style: 3, labelBackgroundColor: TVC.label }, horzLine: { color: TVC.cross, width: 1, style: 3, labelBackgroundColor: TVC.label } },
        timeScale: { borderColor: TVC.line, timeVisible: st.tf !== '1d', secondsVisible: false, rightOffset: 8 } });
      const series = chart.addSeries(LWC.CandlestickSeries, { upColor: UP, downColor: DN, borderVisible: false, wickUpColor: UP, wickDownColor: DN,
        priceFormat: { type: 'price', precision: prec, minMove: prec === 5 ? 0.00001 : 0.01 },
        // Zoom automatique en prix : l'échelle englobe l'entrée, le stop et l'objectif des trades visibles
        autoscaleInfoProvider: (orig) => {
          const r = orig();
          const c = st.chart;
          if (!r?.priceRange || !c?.zones) return r;
          const vr = chart.timeScale().getVisibleRange();
          if (!vr) return r;
          let lo = r.priceRange.minValue, hi = r.priceRange.maxValue;
          for (const z of c.zones.zones) {
            const t1 = z.open ? Infinity : z.t1;
            if (t1 < vr.from || z.t0 > vr.to) continue;
            for (const v of [z.entry, z.sl, z.tp]) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
          }
          return { ...r, priceRange: { minValue: lo, maxValue: hi } };
        } });
      const vol = chart.addSeries(LWC.HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
      chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      const zones = new PositionZones(prec, ctx.locale());
      series.attachPrimitive(zones);
      st.chart = { key, host, chart, series, vol, zones, ohlc, bars: [], LWC, lines: [], markers: null, first: true };
      // Légende O H L C en haut à gauche, comme TradingView (suit le réticule)
      chart.subscribeCrosshairMove((param) => {
        const c = st.chart;
        if (!c || c.chart !== chart) return;
        const bar = param?.time ? c.bars.find((b) => b.time === param.time) : null;
        c.ohlc.innerHTML = ohlcHTML(m, bar || c.bars[c.bars.length - 1], c.bars) + (c.srcTag || '') + (c.stale ? `<span class="tm-stale">${esc(c.stale)}</span>` : '');
      });
    }
    const c = st.chart;
    c.bars = data.candles.map(([time, o, h, l, cl]) => ({ time: local(time), open: o, high: h, low: l, close: cl }));
    c.series.setData(c.bars);
    const hasVol = data.candles.some((x) => x[5] > 0);
    c.vol.setData(hasVol ? data.candles.map(([time, o, , , cl, v]) => ({ time: local(time), value: v || 0, color: cl >= o ? TVC.volUp : TVC.volDn })) : []);
    c.srcTag = bn ? `<span class="tm-src" title="${esc(t('bot.srcBinanceTip'))}">${esc(t('bot.srcBinance', { s: bn.sym }))}</span>` : '';
    c.ohlc.innerHTML = ohlcHTML(m, c.bars[c.bars.length - 1], c.bars) + c.srcTag;
    // Données figées (marché fermé, jour férié, flux Yahoo en retard) : dite clairement plutôt qu'un graphique qui semble bloqué
    const lastT = data.candles[data.candles.length - 1][0];
    const ageMin = (Date.now() / 1000 - lastT) / 60;
    c.stale = ageMin > Math.max(20, (3 * TF_SEC[st.tf]) / 60) && st.tf !== '1d'
      ? t(m.synthetic ? 'bot.staleSyn' : 'bot.stale', { d: ctx.day(lastT * 1000), t: ctx.time(lastT * 1000) }) : '';
    if (c.stale) c.ohlc.insertAdjacentHTML('beforeend', `<span class="tm-stale">${esc(c.stale)}</span>`);
    // Lignes des positions ouvertes : stop actuel (il peut avoir suivi le cours) ; entrée et objectif sont dans les zones
    for (const l of c.lines) c.series.removePriceLine(l);
    c.lines = [];
    const add = (price, color, title, style = 0) => { if (isNum(price)) c.lines.push(c.series.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title })); };
    // Trades publiés à l'échelle Yahoo → échelle des bougies affichées (Binance : + écart)
    const S = (v) => (isNum(v) ? v + sh : v);
    const shifted = (x) => (sh ? { ...x, entry: S(x.entry), sl: S(x.sl), sl0: S(x.sl0), tp: S(x.tp), exit: S(x.exit) } : x);
    for (const p of positionsOn(m.id).map(shifted)) {
      const tag = `${p.acct} ${p.sid}`;
      add(p.entry, TVC.entry, `${tag} ${t(p.side === 'long' ? 'bot.buy' : 'bot.sell')}`);
      add(p.sl, DN, `${tag} SL`, 2);
      if (isNum(p.tp)) add(p.tp, UP, `${tag} TP`, 2);
    }
    // Zones rouge (risque : entrée → stop) et verte (objectif : entrée → TP), comme l'outil « position » de TradingView
    const first = data.candles[0][0];
    const paperMode = st.tab === 'paper';
    const hist = histRows().filter((y) => y.market === m.id && y.exitT >= first).map(shifted);
    const open = positionsOn(m.id).map(shifted);
    const zl = [];
    for (const x of hist) zl.push({ side: x.side, entry: x.entry, sl: x.sl0 ?? x.sl, tp: x.tp, exit: x.exit, t0: local(x.entryT), t1: local(x.exitT), win: paperMode ? x.pnlPct >= 0 : x.pnl >= 0 });
    for (const p of open) zl.push({ side: p.side, entry: p.entry, sl: p.sl0 ?? p.sl, tp: p.tp, exit: null, t0: local(p.entryT), t1: null, open: true, label: `${p.acct} ${p.sid}` });
    c.zones.set(zl, c.bars.map((b) => b.time), TF_SEC[st.tf]);
    // Repères : entrée (flèche) et sortie (résultat)
    const sec = TF_SEC[st.tf];
    const snap = (x) => local(Math.floor(x / sec) * sec);
    const marks = [];
    for (const x of hist) {
      const win = paperMode ? x.pnlPct >= 0 : x.pnl >= 0;
      if (x.entryT >= first) marks.push({ time: snap(x.entryT), position: x.side === 'long' ? 'belowBar' : 'aboveBar', color: TVC.entry, shape: x.side === 'long' ? 'arrowUp' : 'arrowDown', text: x.sid });
      marks.push({ time: snap(x.exitT), position: x.side === 'long' ? 'aboveBar' : 'belowBar', color: win ? UP : DN, shape: 'circle', text: paperMode ? ctx.pct(x.pnlPct) : signed(x.pnl) });
    }
    for (const p of open) if (p.entryT >= first) marks.push({ time: snap(p.entryT), position: p.side === 'long' ? 'belowBar' : 'aboveBar', color: TVC.entry, shape: p.side === 'long' ? 'arrowUp' : 'arrowDown', text: `${p.acct} ${p.sid}` });
    marks.sort((a, b) => a.time - b.time);
    if (c.markers) c.markers.setMarkers(marks); else c.markers = c.LWC.createSeriesMarkers(c.series, marks);
    // Zoom automatique sur la position : trade choisi, sinon (nouveau graphique) la dernière position ouverte du marché
    const n = data.candles.length;
    const target = st.focus || (c.first && open.length ? { entryT: Math.max(...open.map((p) => p.entryT)), exitT: null } : null);
    const l0 = target ? c.zones.logical(local(target.entryT)) : null;
    try {
      if (target && l0 != null && l0 >= 0 && l0 <= n - 1) {
        const l1 = Math.max(l0, Math.min(n - 1, target.exitT ? c.zones.logical(local(target.exitT)) : n - 1));
        const pad = Math.max(12, Math.round((l1 - l0) * 0.35));
        const from = Math.max(0, l0 - pad), to = Math.max(from + 20, target.exitT ? l1 + pad : n - 1 + Math.max(10, pad / 2));
        c.chart.timeScale().setVisibleLogicalRange({ from, to });
      } else if (c.first || target) c.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 150), to: n + 6 }); // position plus récente que les bougies : fin du graphique
    } finally { c.first = false; st.focus = null; }
  }

  /* ---------- Script Pine pour TradingView ---------- */
  function marketTrades(id) {
    const out = [];
    for (const a of st.d?.accounts || []) {
      for (const x of [...(a.archive || []), ...a.closed]) if (x.market === id) out.push({ ...x, acct: acctName(a) });
      for (const p of a.open) if (p.market === id) out.push({ ...p, acct: acctName(a), exitT: 0, exit: null, pnl: p.pnl });
    }
    return out.sort((p, q) => p.entryT - q.entryT);
  }
  function openPine() {
    const m = st.d?.markets?.find((x) => x.id === st.market);
    if (!m) return;
    const trades = marketTrades(m.id);
    const code = pineScript({ market: m.id, name: m.name || m.id, tvSymbol: TV[m.id] || '', trades, at: Date.now() });
    document.querySelector('#bot-pine')?.remove();
    const dlg = document.createElement('div');
    dlg.id = 'bot-pine'; dlg.className = 'snap'; dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true'); dlg.setAttribute('aria-labelledby', 'bot-pine-t');
    dlg.innerHTML = `<div class="snap-card pine-card">
      <h2 id="bot-pine-t">${esc(t('bot.pineH', { m: m.name || m.id }))}</h2>
      <ol class="pine-steps">${t('bot.pineSteps', { s: `<b>${esc(TV[m.id] || '')}</b>`, n: Math.min(150, trades.length) })}</ol>
      <textarea class="pine-code" readonly spellcheck="false" aria-label="Pine Script">${esc(code)}</textarea>
      <p class="pine-msg" role="status"></p>
      <div class="snap-actions"><button type="button" class="btn" data-pclose>${esc(t('snap.close'))}</button><button type="button" class="btn btn-primary" data-pcopy>${esc(t('bot.pineCopy'))}</button></div>
    </div>`;
    document.body.append(dlg);
    document.body.style.overflow = 'hidden';
    const close = () => { dlg.remove(); document.body.style.overflow = ''; };
    const ta = dlg.querySelector('textarea');
    dlg.addEventListener('click', async (e) => {
      if (e.target === dlg || e.target.closest('[data-pclose]')) { close(); return; }
      if (e.target.closest('[data-pcopy]')) {
        let ok = false;
        try { await navigator.clipboard.writeText(code); ok = true; } catch { ta.focus(); ta.select(); try { ok = document.execCommand('copy'); } catch { ok = false; } }
        dlg.querySelector('.pine-msg').textContent = ok ? t('bot.pineCopied') : t('bot.pineSelect');
      }
    });
    dlg.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    dlg.querySelector('[data-pcopy]').focus();
  }

  /* ---------- Blotter ---------- */
  function histRows() {
    if (!st.d) return [];
    if (st.tab === 'paper') return [...(st.d.paper || [])].sort((p, q) => q.exitT - p.exitT);
    const id = st.tab.startsWith('hist-') ? st.tab.slice(5) : 'ftmo'; // ftmo, lucid ou lucidf (compte Lucid financé à part)
    const a = st.d.accounts.find((x) => x.id === id) || st.d.accounts[0];
    if (!a) return [];
    return [...a.closed.map((x) => ({ ...x, attempt: a.attempt })), ...(a.archive || [])].sort((p, q) => q.exitT - p.exitT);
  }
  function tabsHTML() {
    const refused = st.d?.accounts?.find((a) => a.refused)?.refused;
    const tabs = [['pos', `${t('bot.tmTabPos')} <i>${allOpen().length}</i>`],
      ...(st.d?.accounts || []).map((a) => [`hist-${a.id}`, `${t('bot.tmTabHist')} ${esc(acctName(a))}`]),
      ['paper', t('bot.tmTabPaper')], ...(refused ? [['ai', `${t('bot.tmTabAi')} <i>${refused.n}</i>`]] : [])];
    return `<div class="tm-tabs" role="tablist">${tabs.map(([v, txt]) => `<button type="button" role="tab" data-tab2="${v}" aria-selected="${st.tab === v}">${txt}</button>`).join('')}</div>`;
  }
  function posTable() {
    const rows = allOpen();
    if (!rows.length) return `<p class="tm-empty">${t('bot.noPos')}</p>`;
    return `<table class="tm-t"><thead><tr><th>${t('bot.acct')}</th><th>${t('bot.market')}</th><th>${t('bot.strat')}</th><th>${t('bot.side')}</th><th class="r">${t('bot.entry')}</th><th class="r">SL</th><th class="r">TP</th><th class="r">${t('bot.size')}</th><th class="r">${t('bot.risk')}</th><th class="r">${t('bot.tmOpened')}</th><th class="r">${t('bot.pnl')}</th></tr></thead><tbody>
      ${rows.map(({ a, p }) => `<tr data-mk="${esc(p.market)}" data-pe="${p.entryT || ''}" class="tm-click"><td>${firm(a)}${tagOf(a) ? ` <em>${esc(tagOf(a))}</em>` : ''}</td><td><b>${esc(code(p.market))}</b></td>
        <td title="${esc(p.name || '')}">${esc(p.sid)}${isNum(p.ai) ? ` <em>IA ${p.ai}%</em>` : ''}</td><td>${side(p.side)}</td>
        <td class="r">${px(p.entry)}</td><td class="r dn">${px(p.sl)}</td><td class="r up">${isNum(p.tp) ? px(p.tp) : '—'}</td>
        <td class="r">${p.n ? `${p.n} ${esc(p.contract || '')}` : money(p.notional)}</td><td class="r">${money(p.risk)}</td><td class="r">${p.entryT ? hhmm(p.entryT) : ND}</td>
        <td class="r ${cls(p.pnl)}"><b>${signed(p.pnl)}</b></td></tr>`).join('')}</tbody></table>`;
  }
  function histTable() {
    const rows = histRows();
    if (!rows.length) return `<p class="tm-empty">${t('bot.noTrades')}</p>`;
    const paperMode = st.tab === 'paper';
    const val = (x) => (paperMode ? x.pnlPct : x.pnl);
    const wins = rows.filter((x) => val(x) > 0).length;
    const total = rows.reduce((s2, x) => s2 + (val(x) || 0), 0);
    const sum = paperMode
      ? t('bot.sumPaper', { n: rows.length, w: Math.round((wins / rows.length) * 100), v: signed(Math.round(total * 10)) })
      : t('bot.sumAcct', { n: rows.length, w: Math.round((wins / rows.length) * 100), v: signed(total) });
    const shown = rows.slice(0, st.shown);
    return `<div class="tm-sum">${sum}${paperMode ? ` · ${t('bot.paperNote')}` : ''}</div>
      <table class="tm-t"><thead><tr><th>${t('bot.tmClosed')}</th>${paperMode ? '' : `<th>${t('bot.challenge')}</th>`}<th>${t('bot.market')}</th><th>${t('bot.strat')}</th><th>${t('bot.side')}</th><th class="r">${t('bot.entry')}</th><th class="r">${t('bot.tmExit')}</th><th class="r">${t('bot.result')}</th><th class="r">R</th><th>${t('bot.why')}</th></tr></thead><tbody>
      ${shown.map((x) => { const v = val(x); const wl = v > 0 ? 'tm-win' : v < 0 ? 'tm-loss' : ''; return `<tr data-mk="${esc(x.market)}" data-te="${x.entryT}" data-tx="${x.exitT}" class="tm-click ${wl}"><td>${hhmm(x.exitT)}</td>
        ${paperMode ? '' : `<td>${isNum(x.attempt) ? `#${x.attempt}` : '—'}</td>`}<td><b>${esc(code(x.market))}</b></td><td title="${esc(x.name || '')}">${esc(x.sid)}</td>
        <td><span class="tm-dir">${esc(t(x.side === 'long' ? 'bot.buy' : 'bot.sell'))}</span></td><td class="r">${px(x.entry)}</td><td class="r">${px(x.exit)}</td>
        <td class="r ${cls(paperMode ? x.pnlPct * 100 : x.pnl)}"><b>${paperMode ? ctx.pct(x.pnlPct) : signed(x.pnl)}</b></td>
        <td class="r">${!paperMode && isNum(x.risk) && x.risk > 0 ? (x.pnl / x.risk).toFixed(2) : '—'}</td><td class="tm-why">${esc(x.reason || '')}</td></tr>`; }).join('')}</tbody></table>
      ${rows.length > st.shown ? `<button type="button" class="tm-more" data-more>${t('bot.more', { n: Math.min(PAGE, rows.length - st.shown), r: rows.length - st.shown })}</button>` : ''}`;
  }
  function aiTable() {
    const r = st.d?.accounts?.find((a) => a.refused)?.refused;
    if (!r) return `<p class="tm-empty">—</p>`;
    const head = `<div class="tm-sum">${t('bot.refused', { n: r.n, c: r.closed, v: signed(r.closedPnl), w: r.wins })}${r.closed ? ` · ${r.closedPnl <= 0 ? t('bot.aiRight') : t('bot.aiWrong')}` : ''}</div>`;
    if (!r.last?.length) return head;
    return `${head}<table class="tm-t"><thead><tr><th>${t('bot.date')}</th><th>${t('bot.market')}</th><th>${t('bot.strat')}</th><th>${t('bot.side')}</th><th class="r">${t('bot.entry')}</th><th class="r">${t('bot.tmProb')}</th><th class="r">${t('bot.result')}</th></tr></thead><tbody>
      ${[...r.last].reverse().map((x) => `<tr data-mk="${esc(x.market)}" class="tm-click"><td>${hhmm(x.entryT)}</td><td><b>${esc(code(x.market))}</b></td><td>${esc(x.sid)}</td><td>${side(x.side)}</td>
        <td class="r">${px(x.entry)}</td><td class="r">${x.p}%</td><td class="r ${cls(x.pnl)}">${signed(x.pnl)}${x.state === 'open' ? ' <em>*</em>' : ''}</td></tr>`).join('')}</tbody></table>`;
  }
  function blotterHTML() {
    const body = st.tab === 'pos' ? posTable() : st.tab === 'ai' ? aiTable() : histTable();
    return `${tabsHTML()}<div class="tm-scroll">${body}</div>`;
  }

  /* ---------- Rendu ---------- */
  function fill() {
    const el = st.el;
    if (!el?.isConnected) return;
    if (!st.d) {
      el.querySelector('#bot-body').innerHTML = `<p class="tm-empty">${st.err ? t('bot.na') : st.at ? t('bot.never') : t('loading')}</p>`;
      return;
    }
    if (!st.market || !st.d.markets.some((m) => m.id === st.market)) st.market = (allOpen()[0]?.p.market) || st.d.markets[0]?.id;
    const body = el.querySelector('#bot-body');
    if (!body.querySelector('#bot-chart')) {
      body.innerHTML = `<div class="tm-grid">
        <div class="tm-status" id="bot-status"></div>
        <aside class="tm-panel tm-watch" id="bot-watch"></aside>
        <section class="tm-panel tm-main"><div id="bot-cbar"></div><div id="bot-chart" class="tm-chart"></div>
          <div class="tm-legend" id="bot-legend">${t('bot.legend')}</div></section>
        <aside class="tm-side" id="bot-accts"></aside>
        <section class="tm-panel tm-blot" id="bot-blot"></section>
        <div class="tm-foot">${t('bot.disclosure')}${st.d.adapt ? ` · ${esc(String(st.d.adapt).replace(/\p{Extended_Pictographic}\uFE0F?\s*/gu, ''))}` : ''}</div>
      </div>`;
    }
    body.querySelector('#bot-status').innerHTML = statusHTML();
    body.querySelector('#bot-watch').innerHTML = watchHTML();
    body.querySelector('#bot-cbar').innerHTML = chartBarHTML();
    body.querySelector('#bot-accts').innerHTML = (st.d.accounts.map(accountHTML).join('') + (st.d.portfolio ? portfolioHTML(st.d.portfolio) : '')) || `<p class="tm-empty">${t('bot.noAcct')}</p>`;
    const sc = body.querySelector('.tm-scroll')?.scrollTop || 0; // garder la position dans le tableau
    body.querySelector('#bot-blot').innerHTML = blotterHTML();
    const scroller = body.querySelector('.tm-scroll'); if (scroller) scroller.scrollTop = sc;
    drawCurves(body);
    drawChart();
  }

  function tick() {
    if (!st.el?.isConnected || document.hidden) return;
    load(fill);
  }

  function render(el) {
    st.el = el;
    el.innerHTML = `<div class="tm" id="bot-body"></div>`;
    st.chart = null;
    fill();
    el.onclick = (e) => {
      if (e.target.closest('[data-pine]')) { openPine(); return; }
      const b = e.target.closest('[data-bmk],[data-btf],[data-bsrc],[data-mk],[data-tab2],[data-more]');
      if (!b) return;
      if (b.dataset.tab2) {
        st.tab = b.dataset.tab2; st.shown = PAGE;
        el.querySelector('#bot-blot').innerHTML = blotterHTML();
        drawChart();
        return;
      }
      if (b.hasAttribute('data-more')) { st.shown += PAGE; el.querySelector('#bot-blot').innerHTML = blotterHTML(); return; }
      if (b.dataset.bmk) st.market = b.dataset.bmk;
      else if (b.dataset.btf) st.tf = b.dataset.btf;
      else if (b.dataset.bsrc) { st.src = b.dataset.bsrc; try { localStorage.setItem(SRC_KEY, st.src); } catch { /* stockage indisponible */ } }
      else if (b.dataset.mk) {
        st.market = b.dataset.mk;
        if (b.dataset.te) {
          // Trade de l'historique : unité de temps qui couvre sa date (Yahoo : 5 j en 5 min, 1 mois en 15 min, 3 mois en 1 h)
          const te = Number(b.dataset.te), tx = Number(b.dataset.tx);
          const age = (Date.now() / 1000 - te) / 86400;
          st.tf = age < 1.8 && tx - te < 8 * 3600 ? '1m' : age < 4 && tx - te < 86400 ? '5m' : age < 28 ? '15m' : age < 85 ? '1h' : '1d';
          st.focus = { entryT: te, exitT: tx };
          st.src = 'bot';
        }
        else if (b.dataset.pe) { st.focus = { entryT: Number(b.dataset.pe), exitT: null }; st.src = 'bot'; }
        el.querySelector('#bot-chart')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      st.chart?.chart?.remove(); st.chart = null;
      fill();
    };
    load(fill);
    clearInterval(st.timer);
    let n = 0;
    st.timer = setInterval(() => {
      if (!st.el?.isConnected) { clearInterval(st.timer); st.timer = null; return; }
      n++;
      tick();
      if ((n * LIVE_MS) % CANDLE_MS === 0) drawChart();
    }, LIVE_MS);
  }

  return { render, load };
}
