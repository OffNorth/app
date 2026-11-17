// Garde-fous des agents IA : chaque ordre proposé par le modèle est vérifié ici, côté serveur, avant toute exécution.
// L'IA ne peut rien faire que ces règles n'autorisent pas. Exécution avec le moteur démo partagé (paper-engine.js) :
// argent fictif uniquement. Fichier sans dépendance (testable sous Node et Deno).
import { FEE, LEVERAGES, MAX_ORDERS, closePosition, dirOf, nextId, openPosition, summary } from './paper-engine.js';

export const LIMITS = {
  maxLev: 3, // levier maximal d'un agent (parmi LEVERAGES du moteur : 1, 2, 5, 10)
  maxMarginPct: 20, // marge d'une position ≤ 20 % de la valeur du compte
  maxOpen: 15, // positions ouvertes au plus
  maxOrdersPerDecision: 8, // ordres traités par décision
};

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const round = (v, d = 8) => Number(v.toFixed(d));

/**
 * Applique une décision du modèle au compte (modifié en place).
 * ctx.quote(asset) → { price, ok, fx, ccy } (même logique que l'app : ok = cours frais et taux de change connu)
 * ctx.asset(kind, assetId) → { kind, assetId, label, name, symbol, closed } ou null (actif absent des données du site)
 * Renvoie { executed: [...], rejected: [{ order, why }] }.
 */
export function applyDecision(acct, decision, ctx, limits = LIMITS) {
  const executed = [], rejected = [];
  const orders = Array.isArray(decision?.orders) ? decision.orders : [];
  const reject = (order, why) => rejected.push({ order, why });
  orders.slice(limits.maxOrdersPerDecision).forEach((o) => reject(o, 'trop d’ordres dans la décision'));
  for (const o of orders.slice(0, limits.maxOrdersPerDecision)) {
    if (!o || typeof o !== 'object') { reject(o, 'ordre illisible'); continue; }
    const reason = typeof o.reason === 'string' ? o.reason.slice(0, 160) : '';
    try {
      if (o.action === 'open') {
        const r = openOrder(acct, o, ctx, limits);
        if (r.error) reject(o, r.error); else executed.push({ ...r.done, reason });
      } else if (o.action === 'close') {
        const p = acct.positions.find((x) => x.id === o.positionId);
        if (!p) { reject(o, 'position inconnue'); continue; }
        const q = ctx.quote(p);
        if (!q.ok || !isNum(q.price)) { reject(o, 'cours indisponible ou ancien'); continue; }
        const fraction = isNum(o.fraction) && o.fraction > 0 && o.fraction <= 1 ? o.fraction : 1;
        const h = closePosition(acct, p, q.price, fraction, 'manual', q.fx);
        executed.push({ action: 'close', label: p.label, kind: p.kind, assetId: p.assetId, side: p.side, qty: h.qty, price: q.price, net: round(h.net, 2), reason });
      } else if (o.action === 'cancel') {
        const before = acct.orders.length;
        acct.orders = acct.orders.filter((x) => x.id !== o.orderId);
        if (acct.orders.length === before) reject(o, 'ordre inconnu');
        else executed.push({ action: 'cancel', orderId: o.orderId, reason });
      } else if (o.action === 'set_tp_sl') {
        const p = acct.positions.find((x) => x.id === o.positionId);
        if (!p) { reject(o, 'position inconnue'); continue; }
        const q = ctx.quote(p);
        const ref = isNum(q.price) ? q.price : p.entry;
        const tp = isNum(o.tp) && o.tp > 0 ? o.tp : p.tp, sl = isNum(o.sl) && o.sl > 0 ? o.sl : p.sl;
        const err = levelsError(p.side, ref, tp, sl);
        if (err) { reject(o, err); continue; }
        if (p.lev > 1 && sl == null) { reject(o, 'stop loss obligatoire avec effet de levier'); continue; }
        p.tp = tp ?? null; p.sl = sl ?? null;
        executed.push({ action: 'set_tp_sl', label: p.label, tp: p.tp, sl: p.sl, reason });
      } else reject(o, 'action inconnue');
    } catch (err) {
      reject(o, `erreur : ${String(err?.message || err).slice(0, 80)}`);
    }
  }
  return { executed, rejected };
}

/** TP au-dessus et SL en dessous du cours pour un achat, l'inverse pour une vente à découvert. */
export function levelsError(side, price, tp, sl) {
  const d = dirOf(side);
  if (tp != null && (!isNum(tp) || (tp - price) * d <= 0)) return 'take profit du mauvais côté du cours';
  if (sl != null && (!isNum(sl) || (sl - price) * d >= 0)) return 'stop loss du mauvais côté du cours';
  return null;
}

function openOrder(acct, o, ctx, limits) {
  if (!['c', 's', 'i', 'm'].includes(o.kind) || typeof o.assetId !== 'string') return { error: 'actif invalide' };
  const asset = ctx.asset(o.kind, o.assetId);
  if (!asset) return { error: 'actif absent des données du site' };
  const q = ctx.quote(asset);
  if (!q.ok || !isNum(q.price) || !isNum(q.fx)) return { error: 'cours indisponible ou ancien' };
  if (!['long', 'short'].includes(o.side)) return { error: 'sens invalide' };
  const type = ['market', 'limit', 'stop'].includes(o.type) ? o.type : null;
  if (!type) return { error: 'type d’ordre invalide' };
  if (type === 'market' && asset.closed) return { error: 'marché fermé : ordre limite ou stop seulement' };
  const lev = isNum(o.lev) ? o.lev : 1;
  if (!LEVERAGES.includes(lev) || lev > limits.maxLev) return { error: `levier refusé (${limits.maxLev}× au plus)` };
  if (!isNum(o.amountUsd) || o.amountUsd <= 0) return { error: 'montant invalide' };
  const s = summary(acct, ctx.quote);
  const equity = isNum(s.equity) ? s.equity : acct.cash;
  if (o.amountUsd / lev > equity * limits.maxMarginPct / 100) return { error: `marge supérieure à ${limits.maxMarginPct} % du compte` };
  if (acct.positions.length >= limits.maxOpen) return { error: `déjà ${limits.maxOpen} positions ouvertes` };
  const entry = type === 'market' ? q.price : o.price;
  if (!isNum(entry) || entry <= 0) return { error: 'prix d’entrée invalide' };
  if (type !== 'market') {
    const above = entry > q.price;
    if (type === 'limit' && (o.side === 'long') === above) return { error: 'ordre limite du mauvais côté du cours' };
    if (type === 'stop' && (o.side === 'long') !== above) return { error: 'ordre stop du mauvais côté du cours' };
    if (acct.orders.length + 1 > MAX_ORDERS) return { error: 'trop d’ordres en attente' };
  }
  const tp = isNum(o.tp) && o.tp > 0 ? o.tp : null, sl = isNum(o.sl) && o.sl > 0 ? o.sl : null;
  if (lev > 1 && sl == null) return { error: 'stop loss obligatoire avec effet de levier' };
  const lerr = levelsError(o.side, entry, tp, sl);
  if (lerr) return { error: lerr };
  const qty = o.amountUsd / (entry * q.fx);
  if (!(qty > 0)) return { error: 'quantité nulle' };
  // Marge et frais disponibles (même calcul que le moteur ; vérifié aussi pour un ordre en attente).
  if (o.amountUsd / lev + o.amountUsd * FEE > acct.cash + 1e-9) return { error: 'liquidités insuffisantes' };
  const base = { side: o.side, qty, lev, tp, sl, trail: null };
  const a = { kind: asset.kind, assetId: asset.assetId, label: asset.label, name: asset.name, symbol: asset.symbol };
  if (type === 'market') {
    const res = openPosition(acct, a, { ...base, price: q.price, fx: q.fx, ccy: q.ccy || 'USD' });
    if (res.error) return { error: res.error === 'funds' ? 'liquidités insuffisantes' : 'trop de positions' };
    return { done: { action: 'open', type, label: a.label, kind: a.kind, assetId: a.assetId, side: o.side, qty: round(qty), price: q.price, lev, tp, sl, positionId: res.position.id } };
  }
  const order = { id: nextId(acct), ...a, ccy: q.ccy || 'USD', fxOpen: q.fx, ...base, type, price: entry, createdAt: Date.now() };
  acct.orders.push(order);
  return { done: { action: 'open', type, label: a.label, kind: a.kind, assetId: a.assetId, side: o.side, qty: round(qty), price: entry, lev, tp, sl, orderId: order.id } };
}

/** Schéma de la réponse attendue du modèle (sortie structurée). Champs facultatifs : null. */
const numOrNull = { anyOf: [{ type: 'number' }, { type: 'null' }] };
const strOrNull = { anyOf: [{ type: 'string' }, { type: 'null' }] };
export const DECISION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'orders'],
  properties: {
    summary: { type: 'string', description: 'Résumé de l’analyse et de la décision, en français, 400 caractères au plus.' },
    orders: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['action', 'kind', 'assetId', 'positionId', 'orderId', 'side', 'type', 'amountUsd', 'fraction', 'price', 'lev', 'tp', 'sl', 'reason'],
        properties: {
          action: { type: 'string', enum: ['open', 'close', 'cancel', 'set_tp_sl'] },
          kind: { anyOf: [{ type: 'string', enum: ['c', 's', 'i', 'm'] }, { type: 'null' }] },
          assetId: strOrNull,
          positionId: strOrNull,
          orderId: strOrNull,
          side: { anyOf: [{ type: 'string', enum: ['long', 'short'] }, { type: 'null' }] },
          type: { anyOf: [{ type: 'string', enum: ['market', 'limit', 'stop'] }, { type: 'null' }] },
          amountUsd: numOrNull,
          fraction: numOrNull,
          price: numOrNull,
          lev: numOrNull,
          tp: numOrNull,
          sl: numOrNull,
          reason: { type: 'string' },
        },
      },
    },
  },
};
