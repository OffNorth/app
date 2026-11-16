// Moteur du compte de démonstration (papertrading), sans interface ni stockage :
// le même fichier tourne dans l'app (assets/paper.js) et sur le serveur (fonction Supabase « alerts »),
// pour que les ordres, TP, SL et liquidations soient calculés exactement de la même façon.
//
// Compte : { v: 1, initial, cash, positions, orders, history, equity: [[ms, $]], createdAt, seq }
// quote(asset) → { price, ok, fx, ccy } ; ok = cours frais (et taux de change connu) ; fx = dollars pour 1 unité.
// Prix, TP, SL et ordres dans la devise de l'actif ; liquidités, marge, frais et P&L en dollars.

export const FEE = 0.001; // frais simulés : 0,1 % de la valeur, à l'ouverture et à la clôture
export const LEVERAGES = [1, 2, 5, 10];
export const CAPITALS = [1000, 10000, 100000];
export const MAX_OPEN = 50, MAX_ORDERS = 50, MAX_HISTORY = 500, MAX_POINTS = 400;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
export const dirOf = (side) => (side === 'long' ? 1 : -1);

/** Prix de liquidation à l'ouverture (marge isolée, perte limitée à la marge). Achat sans levier : aucun. */
export function liqPrice(side, entry, lev) {
  if (side === 'long') return lev > 1 ? entry * (1 - 1 / lev) : null;
  return entry * (1 + 1 / lev);
}

export function newAccount(initial, now = Date.now()) {
  return { v: 1, initial, cash: initial, positions: [], orders: [], history: [], equity: [[now, initial]], createdAt: now, seq: 1 };
}

/** Compte valide (et mis à niveau : comptes d'avant le multi-devises) ou null. */
export function normalize(a) {
  if (!(a && a.v === 1 && isNum(a.cash) && isNum(a.initial) && Array.isArray(a.positions) && Array.isArray(a.orders) && Array.isArray(a.history))) return null;
  for (const x of [...a.positions, ...a.orders]) { x.ccy ||= 'USD'; if (!isNum(x.fxOpen)) x.fxOpen = 1; }
  if (!Array.isArray(a.equity)) a.equity = [[a.createdAt || Date.now(), a.initial]];
  if (!isNum(a.seq)) a.seq = 1;
  return a;
}

export const nextId = (acct) => `${Date.now().toString(36)}${(acct.seq++).toString(36)}`;
export const assetOf = (x) => ({ kind: x.kind, assetId: x.assetId, label: x.label, name: x.name, symbol: x.symbol, logo: x.logo, logoSmall: x.logoSmall });
/** Dollars pour 1 unité de la devise de la position : taux actuel, sinon celui de l'ouverture. */
export const fxOf = (p, q) => (isNum(q?.fx) ? q.fx : p.fxOpen ?? 1);
/** P&L latent en dollars. */
export const upnl = (p, price, fx) => (price - p.entry) * p.qty * dirOf(p.side) * fx;
/** Prix (devise de l'actif) auquel la perte atteint la marge, au taux de change donné. */
export function liqOf(p, fx) {
  const v = p.entry - dirOf(p.side) * p.margin / (p.qty * fx);
  return v > 0 ? v : null;
}

export function summary(acct, quote) {
  let unreal = 0, margin = 0, valued = true;
  for (const p of acct.positions) {
    margin += p.margin;
    const q = quote(p);
    if (isNum(q.price)) unreal += Math.max(-p.margin, upnl(p, q.price, fxOf(p, q)));
    else valued = false;
  }
  const equity = acct.cash + margin + unreal;
  return { cash: acct.cash, margin, unreal, equity, valued, pnl: equity - acct.initial, pnlPct: (equity / acct.initial - 1) * 100 };
}

/** Ajoute un point à la courbe de valeur (au plus toutes les 10 min, ou si la valeur a bougé). Renvoie true si ajouté. */
export function recordEquity(acct, quote, now = Date.now()) {
  const s = summary(acct, quote);
  if (!s.valued) return false;
  const pts = acct.equity;
  const last = pts[pts.length - 1];
  if (last && now - last[0] < 10 * 60_000 && Math.abs(s.equity - last[1]) < acct.initial * 0.002) return false;
  pts.push([now, Math.round(s.equity * 100) / 100]);
  if (pts.length > MAX_POINTS) pts.splice(1, pts.length - MAX_POINTS); // garde le point de départ
  return true;
}

export function openPosition(acct, asset, { side, qty, price, lev, tp, sl, fx = 1, ccy = 'USD' }) {
  const notional = qty * price * fx, margin = notional / lev, fee = notional * FEE;
  if (acct.positions.length >= MAX_OPEN) return { error: 'maxPos' };
  if (margin + fee > acct.cash + 1e-9) return { error: 'funds' };
  acct.cash -= margin + fee;
  const p = { id: nextId(acct), ...assetOf(asset), ccy, fxOpen: fx, side, qty, entry: price, lev, margin, fees: fee, tp: tp ?? null, sl: sl ?? null, openedAt: Date.now() };
  acct.positions.push(p);
  return { position: p };
}

/** Clôture (totale ou partielle) au prix donné ; perte plafonnée à la marge (liquidation). */
export function closePosition(acct, p, price, fraction, reason, fx) {
  const all = fraction >= 0.999;
  const qty = all ? p.qty : p.qty * fraction;
  const share = qty / p.qty;
  const margin = p.margin * share;
  const gross = (price - p.entry) * qty * dirOf(p.side) * fx;
  const liquidated = gross <= -margin;
  const pnl = Math.max(-margin, gross);
  const closeFee = Math.min(qty * price * fx * FEE, margin + pnl);
  const openFee = p.fees * share;
  acct.cash += margin + pnl - closeFee;
  const h = {
    id: nextId(acct), ...assetOf(p), ccy: p.ccy, side: p.side, qty, entry: p.entry, exit: price, lev: p.lev,
    gross: pnl, fees: openFee + closeFee, net: pnl - openFee - closeFee,
    reason: liquidated ? 'liq' : reason, openedAt: p.openedAt, closedAt: Date.now(),
  };
  acct.history.unshift(h);
  if (acct.history.length > MAX_HISTORY) acct.history.length = MAX_HISTORY;
  if (all) acct.positions = acct.positions.filter((x) => x.id !== p.id);
  else { p.qty -= qty; p.margin -= margin; p.fees -= openFee; }
  return h;
}

/**
 * Exécution : ordres en attente, puis TP / SL / liquidation, au cours actuel.
 * Jamais sur un cours absent ou ancien (q.ok faux). Renvoie la liste des événements.
 */
export function runEngine(acct, quote) {
  const events = [];
  for (const o of [...acct.orders]) {
    const q = quote(o);
    if (!q.ok) continue;
    const last = q.price;
    const hit = o.type === 'limit' ? (o.side === 'long' ? last <= o.price : last >= o.price)
      : (o.side === 'long' ? last >= o.price : last <= o.price);
    if (!hit) continue;
    acct.orders = acct.orders.filter((x) => x.id !== o.id);
    const r = openPosition(acct, o, { side: o.side, qty: o.qty, price: last, lev: o.lev, tp: o.tp, sl: o.sl, fx: q.fx, ccy: q.ccy });
    events.push(r.error ? { type: 'fail', o, reason: r.error } : { type: 'filled', p: r.position });
  }
  for (const p of [...acct.positions]) {
    const q = quote(p);
    if (!q.ok) continue;
    const last = q.price, d = dirOf(p.side);
    let reason = null;
    if (p.sl != null && (d > 0 ? last <= p.sl : last >= p.sl)) reason = 'sl';
    else if (p.tp != null && (d > 0 ? last >= p.tp : last <= p.tp)) reason = 'tp';
    else if (upnl(p, last, q.fx) <= -p.margin) reason = 'liq'; // perte ≥ marge (en dollars, change compris)
    if (reason) events.push({ type: 'closed', h: closePosition(acct, p, last, 1, reason, q.fx) });
  }
  return events;
}
