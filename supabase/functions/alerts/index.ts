// Fonction Edge Supabase « alerts » — alertes de prix et comptes de démonstration synchronisés de l'app Marchés.
//
// Appels (POST JSON, relayés par /api/alerts du site, sauf `check`) :
//   config                         → { publicKey } (clé publique VAPID)
//   register { token, sub, lang }  → enregistre l'appareil (abonnement push du navigateur)
//   list     { token }             → alertes de l'appareil
//   create   { token, alert }      → nouvelle alerte (20 actives au plus par appareil, dont 10 techniques)
//   summary.set { token, time, tz, assets } → résumé quotidien par notification (heure locale), ou désactivation (time null)
//   moves.set { token, pct, assets } → alertes automatiques de forts mouvements (seuil en %), ou désactivation (pct null)
//   delete   { token, id }         → supprime une alerte
//   forget   { token }             → supprime l'appareil et toutes ses alertes
//   paper.*  { code, … }            → compte de démonstration synchronisé (voir plus bas), groupes et classement
//   check    (en-tête x-alerts-secret) → tâche planifiée : alertes, puis exécution des comptes de démonstration
//
// L'appareil s'authentifie avec un jeton aléatoire qu'il garde ; seule son empreinte SHA-256 est stockée.
// Les secrets (clés VAPID, secret de la tâche planifiée) sont dans Supabase Vault, jamais dans le code.
import postgres from 'npm:postgres@3.4.5';
import { generateVapidKeys, sendPush } from './webpush.js';
import { normalize, recordEquity, runEngine, summary } from './paper-engine.js';
import { rsi, sma, volumeRatio } from './indicators.js';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 3, idle_timeout: 20 });
const APP_URL = Deno.env.get('APP_URL') || 'https://marches-eight.vercel.app';
const MAX_ACTIVE = 20;
const MAX_TECH = 10; // alertes techniques actives par appareil (chacune demande des bougies)
const TECH = new Set(['rsi', 'ma', 'vol']);
const validSymbol = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9.^=&-]{1,20}$/.test(v);
function validTz(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length > 64) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
}
const MAX_DEVICES = 5000;
// Services push des navigateurs (Chrome/Android, Firefox, Safari/iOS, Edge) : la fonction n'envoie qu'à eux.
const PUSH_HOST = /^(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$/;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

async function sha256(s: string) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('');
}
async function vaultGet(name: string): Promise<string | null> {
  const [row] = await sql`select decrypted_secret from vault.decrypted_secrets where name = ${name}`;
  return row?.decrypted_secret ?? null;
}

/** Clés VAPID : créées au premier appel puis conservées dans Vault. */
let vapidCache: { publicKey: string; privateJwk: JsonWebKey; subject: string } | null = null;
async function vapid() {
  if (vapidCache) return vapidCache;
  let pub = await vaultGet('vapid_public_key');
  let priv = await vaultGet('vapid_private_jwk');
  if (!pub || !priv) {
    const k = await generateVapidKeys();
    await sql`select vault.create_secret(${k.publicKey}, 'vapid_public_key', 'Clé publique VAPID (alertes Marchés)')
              where not exists (select 1 from vault.secrets where name = 'vapid_public_key')`;
    await sql`select vault.create_secret(${JSON.stringify(k.privateJwk)}, 'vapid_private_jwk', 'Clé privée VAPID (alertes Marchés)')
              where not exists (select 1 from vault.secrets where name = 'vapid_private_jwk')`;
    pub = await vaultGet('vapid_public_key');
    priv = await vaultGet('vapid_private_jwk');
  }
  vapidCache = { publicKey: pub!, privateJwk: JSON.parse(priv!), subject: APP_URL };
  return vapidCache;
}

const validToken = (t: unknown): t is string => typeof t === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(t);
async function device(token: unknown) {
  if (!validToken(token)) return null;
  const [d] = await sql`update marches.devices set last_seen = now() where token_hash = ${await sha256(token)} returning id, lang`;
  return d ?? null;
}
const publicAlert = (a: Record<string, unknown>) => ({
  id: a.id, kind: a.kind, assetId: a.asset_id, label: a.label, direction: a.direction, target: a.target,
  currency: a.currency, metric: a.metric, symbol: a.symbol, createdAt: a.created_at, triggeredAt: a.triggered_at, triggeredPrice: a.triggered_price,
});

/* ---------- Actions de l'appareil ---------- */
async function register(body: Record<string, any>) {
  const { token, sub, lang } = body;
  if (!validToken(token)) return json({ error: 'jeton invalide' }, 400);
  const endpoint = sub?.endpoint, p256dh = sub?.keys?.p256dh, auth = sub?.keys?.auth;
  let host = '';
  try { host = new URL(endpoint).hostname; } catch { /* invalide */ }
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://') || endpoint.length > 1000 || !PUSH_HOST.test(host)) {
    return json({ error: 'abonnement push non pris en charge' }, 400);
  }
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(p256dh || '') || !/^[A-Za-z0-9_-]{16,32}$/.test(auth || '')) return json({ error: 'clés invalides' }, 400);
  const l = ['fr', 'en', 'zh'].includes(lang) ? lang : 'fr';
  const hash = await sha256(token);
  const [{ n }] = await sql`select count(*)::int as n from marches.devices`;
  const [exists] = await sql`select 1 from marches.devices where token_hash = ${hash}`;
  if (!exists && n >= MAX_DEVICES) return json({ error: 'service complet' }, 503);
  await sql`insert into marches.devices (token_hash, endpoint, p256dh, auth, lang)
            values (${hash}, ${endpoint}, ${p256dh}, ${auth}, ${l})
            on conflict (token_hash) do update set endpoint = excluded.endpoint, p256dh = excluded.p256dh,
              auth = excluded.auth, lang = excluded.lang, last_seen = now()`;
  return json({ ok: true });
}

async function list(body: Record<string, any>) {
  const d = await device(body.token);
  if (!d) return json({ alerts: [], registered: false });
  const rows = await sql`select * from marches.alerts where device_id = ${d.id} order by created_at desc`;
  const [dev] = await sql`select summary_time, tz, summary_assets, moves_pct, moves_assets from marches.devices where id = ${d.id}`;
  return json({ alerts: rows.map(publicAlert), registered: true,
    summary: dev?.summary_time ? { time: dev.summary_time, tz: dev.tz, count: (dev.summary_assets || []).length } : null,
    moves: dev?.moves_pct ? { pct: dev.moves_pct, count: (dev.moves_assets || []).length } : null });
}

async function create(body: Record<string, any>) {
  const d = await device(body.token);
  if (!d) return json({ error: 'appareil non enregistré' }, 401);
  const a = body.alert || {};
  const target = Number(a.target);
  const metric = ['pct', 'rsi', 'ma', 'vol'].includes(a.metric) ? a.metric : 'price';
  const tech = TECH.has(metric);
  const okTarget = metric === 'price' ? target > 0 && target <= 1e13
    : metric === 'pct' ? target >= -99 && target <= 1000 && target !== 0
    : metric === 'rsi' ? target >= 1 && target <= 99
    : metric === 'ma' ? target === 1
    : target >= 1.2 && target <= 50; // vol : multiple de la moyenne
  if (!['c', 's', 'i', 'm'].includes(a.kind) || typeof a.assetId !== 'string' || !/^[\w.^=&:-]{1,64}$/.test(a.assetId)
    || typeof a.label !== 'string' || !a.label.trim() || a.label.length > 64
    || !['above', 'below'].includes(a.direction) || !Number.isFinite(target) || !okTarget
    || (metric === 'vol' && a.direction !== 'above')
    || (tech && (a.kind === 'i' || a.kind === 'm') && !validSymbol(a.symbol))
    || (a.currency != null && !/^[A-Za-z]{3}$/.test(a.currency))) {
    return json({ error: 'alerte invalide' }, 400);
  }
  const [{ n, t }] = await sql`select count(*)::int as n, count(*) filter (where metric in ('rsi', 'ma', 'vol'))::int as t
    from marches.alerts where device_id = ${d.id} and triggered_at is null`;
  if (n >= MAX_ACTIVE || (tech && t >= MAX_TECH)) return json({ error: 'limite', max: tech ? MAX_TECH : MAX_ACTIVE }, 409);
  const symbol = tech && validSymbol(a.symbol) ? a.symbol : null;
  const [row] = await sql`insert into marches.alerts (device_id, kind, asset_id, label, direction, target, currency, metric, symbol)
    values (${d.id}, ${a.kind}, ${a.assetId}, ${a.label.trim()}, ${a.direction}, ${target}, ${metric === 'price' ? a.currency ?? null : null}, ${metric}, ${symbol}) returning *`;
  return json({ alert: publicAlert(row) });
}

/** Résumé quotidien : heure locale (HH:MM) et fuseau de l'appareil, actifs suivis (30 au plus) ; time null = désactivé. */
async function summarySet(body: Record<string, any>) {
  const d = await device(body.token);
  if (!d) return json({ error: 'appareil non enregistré' }, 401);
  if (body.time == null) {
    await sql`update marches.devices set summary_time = null, summary_assets = null, summary_sent = null where id = ${d.id}`;
    return json({ ok: true });
  }
  if (typeof body.time !== 'string' || !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(body.time) || !validTz(body.tz)) return json({ error: 'réglage invalide' }, 400);
  const assets = (Array.isArray(body.assets) ? body.assets : []).slice(0, 30)
    .filter((x: any) => ['c', 's', 'i', 'm'].includes(x?.kind) && typeof x.assetId === 'string' && /^[\w.^=&:-]{1,64}$/.test(x.assetId)
      && typeof x.label === 'string' && x.label.length <= 64)
    .map((x: any) => ({ kind: x.kind, assetId: x.assetId, label: x.label }));
  await sql`update marches.devices set summary_time = ${body.time}, tz = ${body.tz}, summary_assets = ${sql.json(assets)} where id = ${d.id}`;
  return json({ ok: true, count: assets.length });
}

/** Forts mouvements : seuil (1 à 50 %) et actifs suivis (30 au plus) ; pct null = désactivé. */
async function movesSet(body: Record<string, any>) {
  const d = await device(body.token);
  if (!d) return json({ error: 'appareil non enregistré' }, 401);
  if (body.pct == null) {
    await sql`update marches.devices set moves_pct = null, moves_assets = null, moves_sent = null where id = ${d.id}`;
    return json({ ok: true });
  }
  const pct = Number(body.pct);
  if (!Number.isFinite(pct) || pct < 1 || pct > 50) return json({ error: 'réglage invalide' }, 400);
  const assets = (Array.isArray(body.assets) ? body.assets : []).slice(0, 30)
    .filter((x: any) => ['c', 's', 'i', 'm'].includes(x?.kind) && typeof x.assetId === 'string' && /^[\w.^=&:-]{1,64}$/.test(x.assetId)
      && typeof x.label === 'string' && x.label.length <= 64)
    .map((x: any) => ({ kind: x.kind, assetId: x.assetId, label: x.label }));
  await sql`update marches.devices set moves_pct = ${pct}, moves_assets = ${sql.json(assets)} where id = ${d.id}`;
  return json({ ok: true, count: assets.length });
}

async function remove(body: Record<string, any>) {
  const d = await device(body.token);
  if (!d) return json({ error: 'appareil non enregistré' }, 401);
  if (typeof body.id !== 'string' || !/^[0-9a-f-]{36}$/.test(body.id)) return json({ error: 'id invalide' }, 400);
  await sql`delete from marches.alerts where id = ${body.id} and device_id = ${d.id}`;
  return json({ ok: true });
}

async function forget(body: Record<string, any>) {
  if (!validToken(body.token)) return json({ ok: true });
  await sql`delete from marches.devices where token_hash = ${await sha256(body.token)}`;
  return json({ ok: true });
}

/* ---------- Cours (pour les alertes et les comptes de démonstration) ---------- */
type Q = { price: number | null; ok: boolean; fx: number | null; ccy: string | null; chg: number | null; fresh?: boolean };
type Asset = { kind: string; assetId: string; label?: string };

async function getJSON(path: string) {
  const res = await fetch(`${APP_URL}${path}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${path} : HTTP ${res.status}`);
  return res.json();
}
const okNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const MINOR: Record<string, [string, number]> = { GBp: ['GBP', 100], GBX: ['GBP', 100], ILA: ['ILS', 100], ZAc: ['ZAR', 100], ZAC: ['ZAR', 100], USX: ['USD', 100] };

/**
 * Charge les cours nécessaires aux actifs donnés et renvoie quote(asset), même logique que l'app :
 * ok = cours frais et taux de change connu ; données anciennes ou absentes → ok = false (rien n'est exécuté).
 */
async function quoteBook(assets: Asset[]) {
  const kinds = new Set(assets.map((a) => a.kind));
  const maps: Record<string, Map<string, Q>> = { c: new Map(), s: new Map(), i: new Map(), m: new Map() };
  let rates: Record<string, number> = {};
  const usdPer = (ccy: string | null) => {
    if (!ccy) return null;
    if (ccy === 'USD') return 1;
    const [base, div] = MINOR[ccy] || [ccy, 1];
    if (base === 'USD') return 1 / div;
    const r = rates[base];
    return okNum(r) ? r / div : null;
  };
  const put = (kind: string, key: string, price: unknown, ccy: string | null, fresh: boolean, chg: unknown) => {
    if (!okNum(price)) return;
    maps[kind].set(key, { price, fresh, ok: false, fx: null, ccy, chg: typeof chg === 'number' && Number.isFinite(chg) ? chg : null });
  };
  const jobs: Promise<unknown>[] = [];
  if (kinds.size && [...kinds].some((k) => k !== 'c')) jobs.push(getJSON('/api/fx').then((d) => { rates = d.rates || {}; }));
  if (kinds.has('c')) jobs.push(getJSON('/api/crypto').then((d) => {
    for (const c of d.coins || []) { put('c', c.id, c.price, 'USD', !d.stale, c.changePct); put('c', `sym:${c.symbol}`, c.price, 'USD', !d.stale, c.changePct); }
  }));
  if (kinds.has('s')) jobs.push(getJSON('/api/stocks?n=100').then((d) => { for (const c of d.companies || []) put('s', c.id, c.price, c.currency || null, !d.stale, c.changePct); }));
  if (kinds.has('i')) jobs.push(getJSON('/api/indices').then((d) => { for (const x of d.indices || []) put('i', x.id, x.price, x.currency || null, !d.stale && !x.outdated, x.changePct); }));
  if (kinds.has('m')) jobs.push(getJSON('/api/macro').then((d) => { for (const x of d.items || []) put('m', x.id, x.price, x.currency || null, !d.stale && !x.outdated, x.changePct); }));
  const errors: string[] = [];
  for (const r of await Promise.allSettled(jobs)) if (r.status === 'rejected') errors.push(String(r.reason));
  // Actifs hors des listes principales (trouvés par la recherche) : /api/quote.
  for (const kind of ['c', 's']) {
    const missing = [...new Set(assets.filter((a) => a.kind === kind && !maps[kind].has(a.assetId) && !(kind === 'c' && a.label && maps.c.has(`sym:${a.label}`))).map((a) => a.assetId))];
    for (let i = 0; i < missing.length; i += 30) {
      try {
        const d = await getJSON(`/api/quote?kind=${kind}&ids=${missing.slice(i, i + 30).map(encodeURIComponent).join(',')}`);
        for (const x of d.items || []) put(kind, x.id, x.price, kind === 'c' ? 'USD' : x.currency || null, true, x.changePct);
      } catch (err) { errors.push(String(err)); }
    }
  }
  // Valorisation une fois tous les cours et taux chargés : ok = cours frais et taux de change connu.
  for (const m of Object.values(maps)) for (const [k, q] of m) { const fx = usdPer(q.ccy); m.set(k, { ...q, fx, ok: !!q.fresh && fx != null }); }
  const quote = (a: Asset): Q => maps[a.kind]?.get(a.assetId) ?? (a.kind === 'c' && a.label ? maps.c.get(`sym:${a.label}`) : undefined)
    ?? { price: null, ok: false, fx: null, ccy: null, chg: null };
  return { quote, errors };
}

/* ---------- Notifications ---------- */
const TEXT: Record<string, Record<string, string>> = {
  fr: { above: '{l} est passé au-dessus de {t}', below: '{l} est passé en dessous de {t}', body: 'Cours : {p}. Alerte créée sur Marchés — information, pas un conseil financier.',
    pctAbove: '{l} : variation de {v} ({w})', pctBelow: '{l} : variation de {v} ({w})', pctBody: 'Seuil : {t}. Alerte créée sur Marchés — information, pas un conseil financier.',
    w24: 'sur 24 h', wDay: 'sur la séance', filled: 'Démo : ordre exécuté sur {l}', tp: 'Démo : TP atteint sur {l}', sl: 'Démo : SL déclenché sur {l}', liq: 'Démo : position liquidée sur {l}',
    paperBody: 'Compte de démonstration (argent fictif) · {r}', fail: 'Démo : ordre non exécuté sur {l}',
    rsiAbove: '{l} : RSI 14 à {v} (seuil {t})', rsiBelow: '{l} : RSI 14 à {v} (seuil {t})', maUp: '{l} : la MM20 passe au-dessus de la MM50',
    maDown: '{l} : la MM20 passe en dessous de la MM50', vol: '{l} : volume du jour {v} × la moyenne de 20 jours',
    techBody: 'Bougies journalières · alerte créée sur Marchés — information, pas un conseil financier.',
    moveUp: '{l} : forte hausse, {v} ({w})', moveDown: '{l} : forte baisse, {v} ({w})', moveBody: 'Seuil automatique : {t}. Information, pas un conseil financier.',
    sumTitle: 'Résumé Marchés · {d}', sumDemo: 'Compte démo {v}', sumNone: 'Aucune donnée disponible pour vos favoris (n/d).', loc: 'fr-FR' },
  en: { above: '{l} rose above {t}', below: '{l} fell below {t}', body: 'Price: {p}. Alert set on Markets — information only, not financial advice.',
    pctAbove: '{l}: change of {v} ({w})', pctBelow: '{l}: change of {v} ({w})', pctBody: 'Threshold: {t}. Alert set on Markets — information only, not financial advice.',
    w24: 'over 24h', wDay: 'on the session', filled: 'Demo: order filled on {l}', tp: 'Demo: TP hit on {l}', sl: 'Demo: SL triggered on {l}', liq: 'Demo: position liquidated on {l}',
    paperBody: 'Demo account (play money) · {r}', fail: 'Demo: order not filled on {l}',
    rsiAbove: '{l}: RSI 14 at {v} (threshold {t})', rsiBelow: '{l}: RSI 14 at {v} (threshold {t})', maUp: '{l}: the 20-day MA crosses above the 50-day MA',
    maDown: '{l}: the 20-day MA crosses below the 50-day MA', vol: '{l}: today’s volume {v} × the 20-day average',
    techBody: 'Daily candles · alert set on Markets — information only, not financial advice.',
    moveUp: '{l}: sharp rise, {v} ({w})', moveDown: '{l}: sharp fall, {v} ({w})', moveBody: 'Automatic threshold: {t}. Information only, not financial advice.',
    sumTitle: 'Markets summary · {d}', sumDemo: 'Demo account {v}', sumNone: 'No data available for your favorites (n/a).', loc: 'en-US' },
  zh: { above: '{l} 已升至 {t} 以上', below: '{l} 已跌至 {t} 以下', body: '价格：{p}。在“市场行情”中设置的提醒——仅供参考，不构成投资建议。',
    pctAbove: '{l}：涨跌幅 {v}（{w}）', pctBelow: '{l}：涨跌幅 {v}（{w}）', pctBody: '设定值：{t}。在“市场行情”中设置的提醒——仅供参考，不构成投资建议。',
    w24: '24小时', wDay: '当日', filled: '模拟：{l} 订单已成交', tp: '模拟：{l} 触发止盈', sl: '模拟：{l} 触发止损', liq: '模拟：{l} 已强平',
    paperBody: '模拟账户（虚拟资金）· {r}', fail: '模拟：{l} 订单未成交',
    rsiAbove: '{l}：RSI 14 为 {v}（设定值 {t}）', rsiBelow: '{l}：RSI 14 为 {v}（设定值 {t}）', maUp: '{l}：20日均线上穿50日均线',
    maDown: '{l}：20日均线下穿50日均线', vol: '{l}：今日成交量为20日均量的 {v} 倍',
    techBody: '日K线 · 在“市场行情”中设置的提醒——仅供参考，不构成投资建议。',
    moveUp: '{l}：大幅上涨 {v}（{w}）', moveDown: '{l}：大幅下跌 {v}（{w}）', moveBody: '自动阈值：{t}。仅供参考，不构成投资建议。',
    sumTitle: '市场行情摘要 · {d}', sumDemo: '模拟账户 {v}', sumNone: '您的自选暂无数据（n/d）。', loc: 'zh-CN' },
};
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
function money(v: number, currency: string | null, loc: string) {
  const digits = Math.abs(v) >= 1000 ? 0 : Math.abs(v) >= 1 ? 2 : 6;
  const n = new Intl.NumberFormat(loc, { maximumFractionDigits: digits, minimumFractionDigits: Math.min(digits, 2) }).format(v);
  if (!currency) return n;
  if (currency === 'USD') return loc === 'fr-FR' ? `${n} $` : `$${n}`;
  if (currency === 'USX') return `${n} ¢`;
  return `${n} ${currency}`;
}
const pctFmt = (v: number, loc: string) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${new Intl.NumberFormat(loc, { maximumFractionDigits: 2, minimumFractionDigits: 1 }).format(Math.abs(v))}${loc === 'fr-FR' ? ' %' : '%'}`;

/** Envoie à un appareil ; renvoie 'ok', 'gone' (abonnement expiré : appareil supprimé) ou 'fail'. */
async function pushTo(dev: { id: string; endpoint: string; p256dh: string; auth: string }, msg: Record<string, string>) {
  const status = await sendPush({ endpoint: dev.endpoint, p256dh: dev.p256dh, auth: dev.auth }, msg, await vapid()).catch(() => 0);
  if (status >= 200 && status < 300) return 'ok';
  if (status === 404 || status === 410) { await sql`delete from marches.devices where id = ${dev.id}`; return 'gone'; }
  return 'fail';
}

/* ---------- Bougies journalières (alertes techniques) ---------- */
const barKey = (a: Record<string, any>) => `${a.kind}:${a.kind === 'c' ? a.asset_id : a.kind === 's' ? a.asset_id : a.symbol}`;
/** Bougies 1 j de chaque actif (une requête par actif), via /api/candles du site ; anciennes (> 5 j) ou absentes → ignorées.
 *  Pour une crypto, on passe le cours connu (`ref`) afin que le site écarte un ticker Yahoo désignant un autre actif. */
async function dailyBars(alerts: Record<string, any>[], errors: string[], quote: (a: Asset) => Q) {
  const out = new Map<string, { time: number; close: number; volume: number | null }[]>();
  const todo = new Map<string, Record<string, any>>();
  for (const a of alerts) if (!todo.has(barKey(a))) todo.set(barKey(a), a);
  for (const [key, a] of todo) {
    const symbol = a.kind === 'c' ? a.label : a.kind === 's' ? a.asset_id : a.symbol;
    if (!symbol) continue;
    const q = new URLSearchParams({ kind: a.kind, symbol, tf: '1d' });
    if (a.kind === 'c') {
      q.set('id', a.asset_id);
      // Cours de référence : écarte un ticker Yahoo qui désignerait un autre actif (même garde-fou que le graphique).
      const ref = quote({ kind: 'c', assetId: a.asset_id, label: a.label }).price;
      if (ref) q.set('ref', String(ref));
    }
    try {
      const d = await getJSON(`/api/candles?${q}`);
      const c = (d.candles || []).map((x: number[]) => ({ time: x[0], close: x[4], volume: x[5] ?? null })).filter((x: any) => Number.isFinite(x.close));
      if (c.length >= 51 && Date.now() / 1000 - c.at(-1).time < 5 * 86400) out.set(key, c);
    } catch (err) { errors.push(String(err)); }
  }
  return out;
}

/* ---------- Alertes ---------- */
async function checkAlerts() {
  const due = await sql`select a.*, d.endpoint, d.p256dh, d.auth, d.lang from marches.alerts a
                        join marches.devices d on d.id = a.device_id where a.triggered_at is null`;
  let sent = 0, gone = 0, failed = 0;
  if (!due.length) return { checked: 0, sent, gone, failed, errors: [] as string[] };
  const { quote, errors } = await quoteBook(due.filter((a) => !TECH.has(a.metric) || a.kind === 'c').map((a) => ({ kind: a.kind, assetId: a.asset_id, label: a.label })));
  const bars = await dailyBars(due.filter((a) => TECH.has(a.metric)), errors, quote);
  for (const a of due) {
    const L = TEXT[a.lang] || TEXT.fr;
    let msg: Record<string, string> | null = null;
    let value: number;
    const nf1 = (v: number) => new Intl.NumberFormat(L.loc, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(v);
    if (TECH.has(a.metric)) {
      const b = bars.get(barKey(a));
      if (!b) continue; // bougies indisponibles ou anciennes : rien n'est déclenché
      if (a.metric === 'rsi') {
        const r = rsi(b).at(-1)?.value;
        if (!Number.isFinite(r) || !(a.direction === 'above' ? r >= a.target : r <= a.target)) continue;
        value = r;
        msg = { title: fill(L[a.direction === 'above' ? 'rsiAbove' : 'rsiBelow'], { l: a.label, v: nf1(r), t: nf1(a.target) }), body: L.techBody };
      } else if (a.metric === 'ma') {
        const m20 = sma(b, 20).at(-1)?.value, m50 = sma(b, 50).at(-1)?.value;
        if (!Number.isFinite(m20) || !Number.isFinite(m50) || m20 === m50) continue;
        const sign = m20 > m50 ? 1 : -1;
        if (a.last_sign !== sign) await sql`update marches.alerts set last_sign = ${sign} where id = ${a.id}`;
        // Croisement : changement de côté par rapport à la dernière observation (la première ne fait que l'enregistrer).
        if (a.last_sign == null || a.last_sign === sign || (sign > 0) !== (a.direction === 'above')) continue;
        value = b.at(-1).close;
        msg = { title: fill(L[sign > 0 ? 'maUp' : 'maDown'], { l: a.label }), body: L.techBody };
      } else {
        const r = volumeRatio(b);
        if (r == null || r < a.target) continue;
        value = r;
        msg = { title: fill(L.vol, { l: a.label, v: nf1(r) }), body: L.techBody };
      }
    } else {
    const q = quote({ kind: a.kind, assetId: a.asset_id, label: a.label });
    if (!q.ok || q.price == null) continue;
    value = q.price;
    if (a.metric === 'pct') {
      if (q.chg == null) continue;
      if (!(a.direction === 'above' ? q.chg >= a.target : q.chg <= a.target)) continue;
      value = q.chg;
      msg = {
        title: fill(L[a.direction === 'above' ? 'pctAbove' : 'pctBelow'], { l: a.label, v: pctFmt(q.chg, L.loc), w: a.kind === 'c' ? L.w24 : L.wDay }),
        body: fill(L.pctBody, { t: pctFmt(a.target, L.loc) }),
      };
    } else {
      if ((a.currency || null) !== (q.ccy || null) && a.kind !== 'i') continue; // devise différente : pas de comparaison
      if (!(a.direction === 'above' ? q.price >= a.target : q.price <= a.target)) continue;
      const cur = a.kind === 'i' ? null : a.currency;
      msg = {
        title: fill(L[a.direction], { l: a.label, t: money(a.target, cur, L.loc) }),
        body: fill(L.body, { p: money(q.price, cur, L.loc) }),
      };
    }
    }
    const tab = a.kind === 'c' ? 'crypto' : a.kind === 's' ? 'actions' : a.kind === 'm' ? 'indices' : 'favoris';
    const r = await pushTo({ id: a.device_id, endpoint: a.endpoint, p256dh: a.p256dh, auth: a.auth }, { ...msg, tag: `alert-${a.id}`, url: `/#${tab}` });
    if (r === 'ok') { sent++; await sql`update marches.alerts set triggered_at = now(), triggered_price = ${value} where id = ${a.id}`; }
    else if (r === 'gone') gone++;
    else failed++;
  }
  return { checked: due.length, sent, gone, failed, errors };
}

/* ---------- Comptes de démonstration synchronisés ----------
 * Le code de synchronisation (aléatoire, gardé par les appareils) authentifie le compte : seule son empreinte est stockée.
 * Le serveur garde le compte et l'exécute toutes les 5 minutes avec le même moteur que l'app (paper-engine.js).
 * Concurrence : chaque écriture porte la révision lue ; si une autre écriture est passée entre-temps, refus (409) + version actuelle.
 */
const validCode = (c: unknown): c is string => typeof c === 'string' && /^[A-Z2-7]{24}$/.test(c);
const MAX_DATA = 400_000;
async function account(code: unknown) {
  if (!validCode(code)) return null;
  const [a] = await sql`update marches.paper_accounts set last_seen = now() where token_hash = ${await sha256(code)} returning *`;
  return a ?? null;
}
const accountOut = (a: Record<string, any>) => ({ data: a.data, rev: a.rev, pseudo: a.pseudo, updatedAt: a.updated_at });
function checkData(data: unknown) {
  const acct = normalize(structuredClone(data));
  if (!acct) return null;
  if (JSON.stringify(acct).length > MAX_DATA) return null;
  return acct;
}

async function paperPut(body: Record<string, any>) {
  if (!validCode(body.code)) return json({ error: 'code invalide' }, 400);
  const acct = checkData(body.data);
  if (!acct) return json({ error: 'compte invalide' }, 400);
  const hash = await sha256(body.code);
  const [cur] = await sql`select * from marches.paper_accounts where token_hash = ${hash}`;
  const trades = acct.history.length;
  if (!cur) {
    if (!body.create) return json({ error: 'compte inconnu' }, 404);
    const [{ n }] = await sql`select count(*)::int as n from marches.paper_accounts`;
    if (n >= MAX_DEVICES) return json({ error: 'service complet' }, 503);
    const [row] = await sql`insert into marches.paper_accounts (token_hash, data, trades) values (${hash}, ${sql.json(acct)}, ${trades}) returning *`;
    return json(accountOut(row));
  }
  if (Number(body.rev) !== cur.rev) return json({ error: 'conflit', ...accountOut(cur) }, 409);
  const [row] = await sql`update marches.paper_accounts set data = ${sql.json(acct)}, rev = rev + 1, trades = ${trades}, stale = true, updated_at = now(), last_seen = now()
                          where id = ${cur.id} and rev = ${cur.rev} returning *`;
  if (!row) { const [now] = await sql`select * from marches.paper_accounts where id = ${cur.id}`; return json({ error: 'conflit', ...accountOut(now) }, 409); }
  return json(accountOut(row));
}
async function paperGet(body: Record<string, any>) {
  const a = await account(body.code);
  return a ? json(accountOut(a)) : json({ error: 'compte inconnu' }, 404);
}
async function paperDelete(body: Record<string, any>) {
  if (validCode(body.code)) await sql`delete from marches.paper_accounts where token_hash = ${await sha256(body.code)}`;
  return json({ ok: true });
}
async function paperLink(body: Record<string, any>) {
  const a = await account(body.code);
  const d = await device(body.device);
  if (!a || !d) return json({ error: 'inconnu' }, 404);
  if (body.on === false) await sql`delete from marches.paper_devices where account_id = ${a.id} and device_id = ${d.id}`;
  else await sql`insert into marches.paper_devices (account_id, device_id) values (${a.id}, ${d.id}) on conflict do nothing`;
  return json({ ok: true });
}
const validPseudo = (p: unknown): p is string => typeof p === 'string' && /^[\p{L}\p{N} _.'-]{2,20}$/u.test(p.trim());
async function paperPseudo(body: Record<string, any>) {
  const a = await account(body.code);
  if (!a) return json({ error: 'compte inconnu' }, 404);
  if (!validPseudo(body.pseudo)) return json({ error: 'pseudo invalide' }, 400);
  await sql`update marches.paper_accounts set pseudo = ${body.pseudo.trim()} where id = ${a.id}`;
  return json({ ok: true });
}
const GROUP_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
async function groupCreate(body: Record<string, any>) {
  const a = await account(body.code);
  if (!a) return json({ error: 'compte inconnu' }, 404);
  const name = String(body.name || '').trim();
  if (name.length < 2 || name.length > 30) return json({ error: 'nom invalide' }, 400);
  const [{ n }] = await sql`select count(*)::int as n from marches.paper_members where account_id = ${a.id}`;
  if (n >= 10) return json({ error: 'limite' }, 409);
  for (let i = 0; i < 5; i++) {
    const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => GROUP_CHARS[b % GROUP_CHARS.length]).join('');
    const [g] = await sql`insert into marches.paper_groups (code, name) values (${code}, ${name}) on conflict do nothing returning code`;
    if (g) { await sql`insert into marches.paper_members (group_code, account_id) values (${code}, ${a.id})`; return json({ code }); }
  }
  return json({ error: 'réessayez' }, 503);
}
async function groupJoin(body: Record<string, any>) {
  const a = await account(body.code);
  if (!a) return json({ error: 'compte inconnu' }, 404);
  const g = String(body.group || '').trim().toUpperCase();
  const [grp] = await sql`select code from marches.paper_groups where code = ${g}`;
  if (!grp) return json({ error: 'groupe inconnu' }, 404);
  const [{ n }] = await sql`select count(*)::int as n from marches.paper_members where group_code = ${g}`;
  if (n >= 50) return json({ error: 'groupe complet' }, 409);
  await sql`insert into marches.paper_members (group_code, account_id) values (${g}, ${a.id}) on conflict do nothing`;
  return json({ ok: true });
}
async function groupLeave(body: Record<string, any>) {
  const a = await account(body.code);
  if (!a) return json({ error: 'compte inconnu' }, 404);
  await sql`delete from marches.paper_members where group_code = ${String(body.group || '')} and account_id = ${a.id}`;
  await sql`delete from marches.paper_groups g where not exists (select 1 from marches.paper_members m where m.group_code = g.code)`;
  return json({ ok: true });
}
async function groupBoard(body: Record<string, any>) {
  const a = await account(body.code);
  if (!a) return json({ error: 'compte inconnu' }, 404);
  const month = new Date().toISOString().slice(0, 7);
  const rows = await sql`select g.code, g.name, p.id, p.pseudo, p.pnl_pct, p.trades, p.equity, p.month_key, p.month_equity from marches.paper_members me
    join marches.paper_groups g on g.code = me.group_code
    join marches.paper_members m on m.group_code = g.code
    join marches.paper_accounts p on p.id = m.account_id
    where me.account_id = ${a.id} order by g.created_at, p.pnl_pct desc nulls last`;
  const groups: Record<string, any> = {};
  for (const r of rows) {
    groups[r.code] ||= { code: r.code, name: r.name, members: [] };
    const monthPct = r.month_key === month && r.month_equity > 0 && Number.isFinite(r.equity) ? (r.equity / r.month_equity - 1) * 100 : null;
    groups[r.code].members.push({ pseudo: r.pseudo || null, pnlPct: r.pnl_pct, monthPct, trades: r.trades, me: r.id === a.id });
  }
  return json({ groups: Object.values(groups), pseudo: a.pseudo, month });
}

async function runAccounts() {
  const accts = await sql`select id, data, rev from marches.paper_accounts
    where stale or jsonb_array_length(data->'positions') > 0 or jsonb_array_length(data->'orders') > 0 or pnl_pct is null limit 3000`;
  if (!accts.length) return { accounts: 0, events: 0 };
  const assets: Asset[] = [];
  for (const a of accts) for (const x of [...(a.data.positions || []), ...(a.data.orders || [])]) assets.push({ kind: x.kind, assetId: x.assetId, label: x.label });
  const { quote } = await quoteBook(assets);
  let total = 0;
  for (const row of accts) {
    const acct = normalize(row.data);
    if (!acct) continue;
    const events = runEngine(acct, quote);
    const added = recordEquity(acct, quote);
    const s = summary(acct, quote);
    const pnl = s.valued ? s.pnlPct : null;
    if (events.length || added) {
      const [ok] = await sql`update marches.paper_accounts set data = ${sql.json(acct)}, rev = rev + 1, trades = ${acct.history.length},
        equity = ${s.valued ? s.equity : null}, pnl_pct = coalesce(${pnl}, pnl_pct), stale = ${!s.valued}, updated_at = now() where id = ${row.id} and rev = ${row.rev} returning id`;
      if (!ok) continue; // modifié par un appareil entre-temps : il sera exécuté au prochain passage
    } else if (pnl != null) {
      await sql`update marches.paper_accounts set equity = ${s.equity}, pnl_pct = ${pnl}, stale = false where id = ${row.id} and rev = ${row.rev}`;
    }
    if (!events.length) continue;
    total += events.length;
    const devs = await sql`select d.id, d.endpoint, d.p256dh, d.auth, d.lang from marches.paper_devices pd join marches.devices d on d.id = pd.device_id where pd.account_id = ${row.id}`;
    for (const e of events) {
      if (e.type === 'trail' || e.type === 'oco') continue; // SL suiveur déplacé, ordre lié annulé : pas de notification
      const l = e.type === 'closed' ? e.h.label : e.type === 'filled' ? e.p.label : e.o.label;
      for (const d of devs) {
        const L = TEXT[d.lang] || TEXT.fr;
        const key = e.type === 'closed' ? e.h.reason === 'tp' ? 'tp' : e.h.reason === 'sl' ? 'sl' : e.h.reason === 'liq' ? 'liq' : 'filled' : e.type === 'fail' ? 'fail' : 'filled';
        const r = e.type === 'closed' ? `${e.h.net >= 0 ? '+' : '−'}${money(Math.abs(e.h.net), 'USD', L.loc)}` : e.type === 'filled' ? money(e.p.entry, e.p.ccy === 'USD' ? 'USD' : e.p.ccy, L.loc) : '—';
        await pushTo(d, { title: fill(L[key], { l }), body: fill(L.paperBody, { r }), tag: `paper-${row.id}-${Date.now()}`, url: '/#compte' });
      }
    }
  }
  return { accounts: accts.length, events: total };
}

/* ---------- Résumé quotidien ---------- */
function localNow(tz: string) {
  const o: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date())) o[p.type] = p.value;
  return { day: `${o.year}-${o.month}-${o.day}`, hm: `${o.hour}:${o.minute}` };
}
/** Une notification par jour et par appareil, après l'heure locale choisie : variations des favoris (6 plus fortes) et compte démo lié. */
async function sendSummaries() {
  const devs = await sql`select id, endpoint, p256dh, auth, lang, tz, summary_time, summary_assets, summary_sent from marches.devices where summary_time is not null`;
  const due = devs.filter((d) => {
    if (!validTz(d.tz)) return false;
    const n = localNow(d.tz);
    const sent = d.summary_sent ? new Date(d.summary_sent).toISOString().slice(0, 10) : null;
    return n.hm >= d.summary_time && sent !== n.day;
  });
  if (!due.length) return { due: 0, sent: 0 };
  const { quote } = await quoteBook(due.flatMap((d) => d.summary_assets || []));
  let sent = 0;
  for (const d of due) {
    const L = TEXT[d.lang] || TEXT.fr;
    const items = (d.summary_assets || []).map((x: Record<string, string>) => ({ x, q: quote(x) }))
      .filter((r: any) => r.q.ok && typeof r.q.chg === 'number').sort((a: any, b: any) => Math.abs(b.q.chg) - Math.abs(a.q.chg)).slice(0, 6)
      .map((r: any) => `${r.x.label} ${pctFmt(r.q.chg, L.loc)}`);
    const [acct] = await sql`select p.pnl_pct from marches.paper_devices pd join marches.paper_accounts p on p.id = pd.account_id
      where pd.device_id = ${d.id} and p.pnl_pct is not null limit 1`;
    const parts = [...items];
    if (acct) parts.push(fill(L.sumDemo, { v: pctFmt(acct.pnl_pct, L.loc) }));
    const day = localNow(d.tz).day;
    const title = fill(L.sumTitle, { d: new Intl.DateTimeFormat(L.loc, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`)) });
    const r = await pushTo(d, { title, body: parts.length ? parts.join(' · ') : L.sumNone, tag: `summary-${day}`, url: '/#accueil' });
    if (r === 'ok') sent++;
    if (r !== 'gone') await sql`update marches.devices set summary_sent = ${day} where id = ${d.id}`;
  }
  return { due: due.length, sent };
}

/* ---------- Forts mouvements ---------- */
/** Une notification par actif et par jour (UTC) quand la variation dépasse le seuil de l'appareil. */
async function sendMoves() {
  const devs = await sql`select id, endpoint, p256dh, auth, lang, moves_pct, moves_assets, moves_sent from marches.devices where moves_pct is not null`;
  if (!devs.length) return { devices: 0, sent: 0 };
  const { quote } = await quoteBook(devs.flatMap((d) => d.moves_assets || []));
  const today = new Date().toISOString().slice(0, 10);
  let sent = 0;
  for (const d of devs) {
    const L = TEXT[d.lang] || TEXT.fr;
    const done: Record<string, string> = { ...(d.moves_sent || {}) };
    let changed = false;
    for (const x of d.moves_assets || []) {
      const q = quote(x);
      const key = `${x.kind}:${x.assetId}`;
      if (!q.ok || typeof q.chg !== 'number' || Math.abs(q.chg) < d.moves_pct || done[key] === today) continue;
      const r = await pushTo(d, { title: fill(L[q.chg > 0 ? 'moveUp' : 'moveDown'], { l: x.label, v: pctFmt(q.chg, L.loc), w: x.kind === 'c' ? L.w24 : L.wDay }),
        body: fill(L.moveBody, { t: `±${pctFmt(d.moves_pct, L.loc).replace(/^[+−]/, '')}` }), tag: `move-${key}`, url: '/#favoris' });
      if (r === 'gone') break;
      if (r === 'ok') sent++;
      done[key] = today; changed = true;
    }
    for (const k of Object.keys(done)) if (done[k] !== today) { delete done[k]; changed = true; }
    if (changed) await sql`update marches.devices set moves_sent = ${sql.json(done)} where id = ${d.id}`;
  }
  return { devices: devs.length, sent };
}

async function check() {
  const alerts = await checkAlerts();
  let paper: Record<string, unknown> = {};
  try { paper = await runAccounts(); } catch (err) { console.error('paper', err); paper = { error: String(err) }; }
  // Défi du mois : valeur de référence = valeur du compte au premier passage du mois (UTC).
  await sql`update marches.paper_accounts set month_key = to_char(now() at time zone 'UTC', 'YYYY-MM'), month_equity = equity
            where equity is not null and month_key is distinct from to_char(now() at time zone 'UTC', 'YYYY-MM')`;
  let summaries: Record<string, unknown> = {};
  try { summaries = await sendSummaries(); } catch (err) { console.error('summary', err); summaries = { error: String(err) }; }
  let moves: Record<string, unknown> = {};
  try { moves = await sendMoves(); } catch (err) { console.error('moves', err); moves = { error: String(err) }; }
  // Conservation limitée : alertes déclenchées 30 jours ; appareils sans alerte ni compte lié, inactifs 90 jours ; comptes démo inactifs 1 an.
  await sql`delete from marches.alerts where triggered_at < now() - interval '30 days'`;
  await sql`delete from marches.devices d where last_seen < now() - interval '90 days'
            and not exists (select 1 from marches.alerts a where a.device_id = d.id and a.triggered_at is null)
            and not exists (select 1 from marches.paper_devices p where p.device_id = d.id) and d.summary_time is null and d.moves_pct is null`;
  await sql`delete from marches.paper_accounts where last_seen < now() - interval '365 days'`;
  await sql`delete from marches.paper_groups g where not exists (select 1 from marches.paper_members m where m.group_code = g.code)`;
  return json({ ...alerts, paper, summaries, moves });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'méthode non autorisée' }, 405);
  let body: Record<string, any> = {};
  try {
    const text = await req.text();
    if (text.length > MAX_DATA + 2000) return json({ error: 'requête trop longue' }, 413);
    body = text ? JSON.parse(text) : {};
  } catch {
    return json({ error: 'JSON invalide' }, 400);
  }
  const action = new URL(req.url).searchParams.get('action') || body.action;
  try {
    switch (action) {
      case 'config': return json({ publicKey: (await vapid()).publicKey });
      case 'register': return await register(body);
      case 'list': return await list(body);
      case 'create': return await create(body);
      case 'delete': return await remove(body);
      case 'forget': return await forget(body);
      case 'summary.set': return await summarySet(body);
      case 'moves.set': return await movesSet(body);
      case 'paper.put': return await paperPut(body);
      case 'paper.get': return await paperGet(body);
      case 'paper.delete': return await paperDelete(body);
      case 'paper.link': return await paperLink(body);
      case 'paper.pseudo': return await paperPseudo(body);
      case 'group.create': return await groupCreate(body);
      case 'group.join': return await groupJoin(body);
      case 'group.leave': return await groupLeave(body);
      case 'group.board': return await groupBoard(body);
      case 'check': {
        const secret = await vaultGet('alerts_cron_secret');
        if (!secret || req.headers.get('x-alerts-secret') !== secret) return json({ error: 'non autorisé' }, 401);
        return await check();
      }
      default: return json({ error: 'action inconnue' }, 400);
    }
  } catch (err) {
    console.error(action, err);
    return json({ error: 'erreur interne' }, 500);
  }
});
