// Indicateurs techniques (barres : { time, close, volume? }), partagés par le graphique de l'app (tradechart.js)
// et par le serveur d'alertes (copie identique dans supabase/functions/alerts/indicators.js).

/** Moyenne mobile simple sur n périodes. */
export function sma(bars, n) {
  const out = []; let sum = 0;
  bars.forEach((b, i) => { sum += b.close; if (i >= n) sum -= bars[i - n].close; if (i >= n - 1) out.push({ time: b.time, value: sum / n }); });
  return out;
}
export function emaArr(values, n) {
  const k = 2 / (n + 1); const out = []; let prev = null;
  values.forEach((v, i) => {
    if (i < n - 1) { out.push(null); return; }
    if (prev === null) prev = values.slice(0, n).reduce((a, b) => a + b, 0) / n; else prev = v * k + prev * (1 - k);
    out.push(prev);
  });
  return out;
}
/** RSI de Wilder sur 14 périodes. */
export function rsi(bars, n = 14) {
  const out = []; let g = 0, l = 0;
  for (let i = 1; i < bars.length; i++) {
    const d = bars[i].close - bars[i - 1].close;
    const up = Math.max(d, 0), dn = Math.max(-d, 0);
    if (i <= n) { g += up; l += dn; if (i === n) { g /= n; l /= n; out.push({ time: bars[i].time, value: l === 0 ? 100 : 100 - 100 / (1 + g / l) }); } continue; }
    g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n;
    out.push({ time: bars[i].time, value: l === 0 ? 100 : 100 - 100 / (1 + g / l) });
  }
  return out;
}
/** MACD(12, 26, 9) : ligne, signal, histogramme. */
export function macd(bars) {
  const closes = bars.map((b) => b.close);
  const e12 = emaArr(closes, 12), e26 = emaArr(closes, 26);
  const line = closes.map((_, i) => (e12[i] != null && e26[i] != null ? e12[i] - e26[i] : null));
  const start = line.findIndex((v) => v != null);
  const sig = start < 0 ? [] : emaArr(line.slice(start), 9);
  const out = { line: [], signal: [], hist: [] };
  for (let i = start; i >= 0 && i < bars.length; i++) {
    const t = bars[i].time, m = line[i], sgl = sig[i - start];
    out.line.push({ time: t, value: m });
    if (sgl != null) { out.signal.push({ time: t, value: sgl }); out.hist.push({ time: t, value: m - sgl, color: m - sgl >= 0 ? 'rgba(34,197,94,.55)' : 'rgba(240,82,82,.55)' }); }
  }
  return out;
}

/** Dernier volume rapporté à la moyenne des n volumes précédents (null si volumes absents). */
export function volumeRatio(bars, n = 20) {
  const v = bars.map((b) => b.volume);
  if (v.length < n + 1) return null;
  const prev = v.slice(-n - 1, -1);
  if (prev.some((x) => !(typeof x === 'number' && x > 0)) || !(v[v.length - 1] >= 0)) return null;
  return v[v.length - 1] / (prev.reduce((a, b) => a + b, 0) / n);
}
