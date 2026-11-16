// Fonction Edge Supabase « alerts » — alertes de prix et comptes de démonstration synchronisés de l'app Marchés.
//
// Appels (POST JSON, relayés par /api/alerts du site, sauf `check`) :
//   config                         → { publicKey } (clé publique VAPID)
//   register { token, sub, lang }  → enregistre l'appareil (abonnement push du navigateur)
//   list     { token }             → alertes de l'appareil
//   create   { token, alert }      → nouvelle alerte (20 actives au plus par appareil)
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

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 3, idle_timeout: 20 });
const APP_URL = Deno.env.get('APP_URL') || 'https://marches-eight.vercel.app';
const MAX_ACTIVE = 20;
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
  currency: a.currency, metric: a.metric, createdAt: a.created_at, triggeredAt: a.triggered_at, triggeredPrice: a.triggered_price,
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
  return json({ alerts: rows.map(publicAlert), registered: true });
}

async function create(body: Record<string, any>) {
  const d = await device(body.token);
  if (!d) return json({ error: 'appareil non enregistré' }, 401);
  const a = body.alert || {};
  const target = Number(a.target);
  const metric = a.metric === 'pct' ? 'pct' : 'price';
  if (!['c', 's', 'i', 'm'].includes(a.kind) || typeof a.assetId !== 'string' || !/^[\w.^=&:-]{1,64}$/.test(a.assetId)
    || typeof a.label !== 'string' || !a.label.trim() || a.label.length > 64
    || !['above', 'below'].includes(a.direction) || !Number.isFinite(target)
    || (metric === 'price' ? (target <= 0 || target > 1e13) : (target < -99 || target > 1000 || target === 0))
    || (a.currency != null && !/^[A-Za-z]{3}$/.test(a.currency))) {
    return json({ error: 'alerte invalide' }, 400);
  }
  const [{ n }] = await sql`select count(*)::int as n from marches.alerts where device_id = ${d.id} and triggered_at is null`;
  if (n >= MAX_ACTIVE) return json({ error: 'limite', max: MAX_ACTIVE }, 409);
  const [row] = await sql`insert into marches.alerts (device_id, kind, asset_id, label, direction, target, currency, metric)
    values (${d.id}, ${a.kind}, ${a.assetId}, ${a.label.trim()}, ${a.direction}, ${target}, ${metric === 'pct' ? null : a.currency ?? null}, ${metric}) returning *`;
  return json({ alert: publicAlert(row) });
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
    paperBody: 'Compte de démonstration (argent fictif) · {r}', loc: 'fr-FR' },
  en: { above: '{l} rose above {t}', below: '{l} fell below {t}', body: 'Price: {p}. Alert set on Markets — information only, not financial advice.',
    pctAbove: '{l}: change of {v} ({w})', pctBelow: '{l}: change of {v} ({w})', pctBody: 'Threshold: {t}. Alert set on Markets — information only, not financial advice.',
    w24: 'over 24h', wDay: 'on the session', filled: 'Demo: order filled on {l}', tp: 'Demo: TP hit on {l}', sl: 'Demo: SL triggered on {l}', liq: 'Demo: position liquidated on {l}',
    paperBody: 'Demo account (play money) · {r}', loc: 'en-US' },
  zh: { above: '{l} 已升至 {t} 以上', below: '{l} 已跌至 {t} 以下', body: '价格：{p}。在“市场行情”中设置的提醒——仅供参考，不构成投资建议。',
    pctAbove: '{l}：涨跌幅 {v}（{w}）', pctBelow: '{l}：涨跌幅 {v}（{w}）', pctBody: '设定值：{t}。在“市场行情”中设置的提醒——仅供参考，不构成投资建议。',
    w24: '24小时', wDay: '当日', filled: '模拟：{l} 订单已成交', tp: '模拟：{l} 触发止盈', sl: '模拟：{l} 触发止损', liq: '模拟：{l} 已强平',
    paperBody: '模拟账户（虚拟资金）· {r}', loc: 'zh-CN' },
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

/* ---------- Alertes ---------- */
async function checkAlerts() {
  const due = await sql`select a.*, d.endpoint, d.p256dh, d.auth, d.lang from marches.alerts a
                        join marches.devices d on d.id = a.device_id where a.triggered_at is null`;
  let sent = 0, gone = 0, failed = 0;
  if (!due.length) return { checked: 0, sent, gone, failed, errors: [] as string[] };
  const { quote, errors } = await quoteBook(due.map((a) => ({ kind: a.kind, assetId: a.asset_id, label: a.label })));
  for (const a of due) {
    const q = quote({ kind: a.kind, assetId: a.asset_id, label: a.label });
    if (!q.ok || q.price == null) continue;
    const L = TEXT[a.lang] || TEXT.fr;
    let msg: Record<string, string> | null = null;
    let value = q.price;
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
  const [row] = await sql`update marches.paper_accounts set data = ${sql.json(acct)}, rev = rev + 1, trades = ${trades}, updated_at = now(), last_seen = now()
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
  const rows = await sql`select g.code, g.name, p.id, p.pseudo, p.pnl_pct, p.trades from marches.paper_members me
    join marches.paper_groups g on g.code = me.group_code
    join marches.paper_members m on m.group_code = g.code
    join marches.paper_accounts p on p.id = m.account_id
    where me.account_id = ${a.id} order by g.created_at, p.pnl_pct desc nulls last`;
  const groups: Record<string, any> = {};
  for (const r of rows) {
    groups[r.code] ||= { code: r.code, name: r.name, members: [] };
    groups[r.code].members.push({ pseudo: r.pseudo || null, pnlPct: r.pnl_pct, trades: r.trades, me: r.id === a.id });
  }
  return json({ groups: Object.values(groups), pseudo: a.pseudo });
}

async function runAccounts() {
  const accts = await sql`select id, data, rev from marches.paper_accounts
    where jsonb_array_length(data->'positions') > 0 or jsonb_array_length(data->'orders') > 0 or pnl_pct is null limit 3000`;
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
        equity = ${s.valued ? s.equity : null}, pnl_pct = coalesce(${pnl}, pnl_pct), updated_at = now() where id = ${row.id} and rev = ${row.rev} returning id`;
      if (!ok) continue; // modifié par un appareil entre-temps : il sera exécuté au prochain passage
    } else if (pnl != null) {
      await sql`update marches.paper_accounts set equity = ${s.equity}, pnl_pct = ${pnl} where id = ${row.id}`;
    }
    if (!events.length) continue;
    total += events.length;
    const devs = await sql`select d.id, d.endpoint, d.p256dh, d.auth, d.lang from marches.paper_devices pd join marches.devices d on d.id = pd.device_id where pd.account_id = ${row.id}`;
    for (const e of events) {
      const l = e.type === 'closed' ? e.h.label : e.type === 'filled' ? e.p.label : e.o.label;
      for (const d of devs) {
        const L = TEXT[d.lang] || TEXT.fr;
        const key = e.type === 'closed' ? e.h.reason === 'tp' ? 'tp' : e.h.reason === 'sl' ? 'sl' : e.h.reason === 'liq' ? 'liq' : 'filled' : 'filled';
        const r = e.type === 'closed' ? `${e.h.net >= 0 ? '+' : '−'}${money(Math.abs(e.h.net), 'USD', L.loc)}` : e.type === 'filled' ? money(e.p.entry, e.p.ccy === 'USD' ? 'USD' : e.p.ccy, L.loc) : '—';
        await pushTo(d, { title: fill(L[key], { l }), body: fill(L.paperBody, { r }), tag: `paper-${row.id}-${Date.now()}`, url: '/#compte' });
      }
    }
  }
  return { accounts: accts.length, events: total };
}

async function check() {
  const alerts = await checkAlerts();
  let paper: Record<string, unknown> = {};
  try { paper = await runAccounts(); } catch (err) { console.error('paper', err); paper = { error: String(err) }; }
  // Conservation limitée : alertes déclenchées 30 jours ; appareils sans alerte ni compte lié, inactifs 90 jours ; comptes démo inactifs 1 an.
  await sql`delete from marches.alerts where triggered_at < now() - interval '30 days'`;
  await sql`delete from marches.devices d where last_seen < now() - interval '90 days'
            and not exists (select 1 from marches.alerts a where a.device_id = d.id and a.triggered_at is null)
            and not exists (select 1 from marches.paper_devices p where p.device_id = d.id)`;
  await sql`delete from marches.paper_accounts where last_seen < now() - interval '365 days'`;
  await sql`delete from marches.paper_groups g where not exists (select 1 from marches.paper_members m where m.group_code = g.code)`;
  return json({ ...alerts, paper });
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
