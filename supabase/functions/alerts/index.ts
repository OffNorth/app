// Fonction Edge Supabase « alerts » — alertes de prix de l'app Marchés.
//
// Appels (POST JSON, relayés par /api/alerts du site, sauf `check`) :
//   config                         → { publicKey } (clé publique VAPID)
//   register { token, sub, lang }  → enregistre l'appareil (abonnement push du navigateur)
//   list     { token }             → alertes de l'appareil
//   create   { token, alert }      → nouvelle alerte (20 actives au plus par appareil)
//   delete   { token, id }         → supprime une alerte
//   forget   { token }             → supprime l'appareil et toutes ses alertes
//   check    (en-tête x-alerts-secret) → tâche planifiée : compare les cours et envoie les notifications
//
// L'appareil s'authentifie avec un jeton aléatoire qu'il garde ; seule son empreinte SHA-256 est stockée.
// Les secrets (clés VAPID, secret de la tâche planifiée) sont dans Supabase Vault, jamais dans le code.
import postgres from 'npm:postgres@3.4.5';
import { generateVapidKeys, sendPush } from './webpush.js';

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
  currency: a.currency, createdAt: a.created_at, triggeredAt: a.triggered_at, triggeredPrice: a.triggered_price,
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
  if (!['c', 's', 'i'].includes(a.kind) || typeof a.assetId !== 'string' || !/^[\w.^=&:-]{1,64}$/.test(a.assetId)
    || typeof a.label !== 'string' || !a.label.trim() || a.label.length > 64
    || !['above', 'below'].includes(a.direction) || !Number.isFinite(target) || target <= 0 || target > 1e13
    || (a.currency != null && !/^[A-Z]{3}$/.test(a.currency))) {
    return json({ error: 'alerte invalide' }, 400);
  }
  const [{ n }] = await sql`select count(*)::int as n from marches.alerts where device_id = ${d.id} and triggered_at is null`;
  if (n >= MAX_ACTIVE) return json({ error: 'limite', max: MAX_ACTIVE }, 409);
  const [row] = await sql`insert into marches.alerts (device_id, kind, asset_id, label, direction, target, currency)
    values (${d.id}, ${a.kind}, ${a.assetId}, ${a.label.trim()}, ${a.direction}, ${target}, ${a.currency ?? null}) returning *`;
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

/* ---------- Tâche planifiée ---------- */
type Quote = { price: number; currency: string | null };

async function getJSON(path: string) {
  const res = await fetch(`${APP_URL}${path}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${path} : HTTP ${res.status}`);
  return res.json();
}

/** Cours actuels, par type d'actif. Données anciennes ou absentes → ignorées (jamais d'alerte sur une valeur douteuse). */
async function quotes(kinds: Set<string>) {
  const out: Record<string, Map<string, Quote>> = { c: new Map(), s: new Map(), i: new Map() };
  const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
  const jobs: Promise<void>[] = [];
  if (kinds.has('c')) jobs.push(getJSON('/api/crypto').then((d) => {
    if (d.stale) return;
    for (const c of d.coins || []) if (ok(c.price)) { out.c.set(c.id, { price: c.price, currency: 'USD' }); out.c.set(`sym:${c.symbol}`, { price: c.price, currency: 'USD' }); }
  }));
  if (kinds.has('s')) jobs.push(getJSON('/api/stocks?n=100').then((d) => {
    if (d.stale) return;
    for (const c of d.companies || []) if (ok(c.price) && ['open', 'closed', 'break'].includes(c.state)) out.s.set(c.id, { price: c.price, currency: c.currency || null });
  }));
  if (kinds.has('i')) jobs.push(getJSON('/api/indices').then((d) => {
    if (d.stale) return;
    for (const x of d.indices || []) if (ok(x.price) && !x.outdated) out.i.set(x.id, { price: x.price, currency: null });
  }));
  const res = await Promise.allSettled(jobs);
  return { out, errors: res.filter((r) => r.status === 'rejected').map((r) => String((r as PromiseRejectedResult).reason)) };
}

const TEXT: Record<string, { above: string; below: string; body: string; loc: string }> = {
  fr: { above: '{l} est passé au-dessus de {t}', below: '{l} est passé en dessous de {t}', body: 'Cours : {p}. Alerte créée sur Marchés — information, pas un conseil financier.', loc: 'fr-FR' },
  en: { above: '{l} rose above {t}', below: '{l} fell below {t}', body: 'Price: {p}. Alert set on Markets — information only, not financial advice.', loc: 'en-US' },
  zh: { above: '{l} 已升至 {t} 以上', below: '{l} 已跌至 {t} 以下', body: '价格：{p}。在“市场行情”中设置的提醒——仅供参考，不构成投资建议。', loc: 'zh-CN' },
};
function money(v: number, currency: string | null, loc: string) {
  const digits = v >= 1000 ? 0 : v >= 1 ? 2 : 6;
  const n = new Intl.NumberFormat(loc, { maximumFractionDigits: digits, minimumFractionDigits: Math.min(digits, 2) }).format(v);
  if (!currency) return n; // indice : en points
  if (currency === 'USD') return loc === 'fr-FR' ? `${n} $` : `$${n}`;
  return `${n} ${currency}`;
}

async function check() {
  const due = await sql`select a.*, d.endpoint, d.p256dh, d.auth, d.lang from marches.alerts a
                        join marches.devices d on d.id = a.device_id where a.triggered_at is null`;
  let sent = 0, gone = 0, failed = 0;
  let errors: string[] = [];
  if (due.length) {
    const q = await quotes(new Set(due.map((a) => a.kind)));
    errors = q.errors;
    const keys = await vapid();
    for (const a of due) {
      const quote = q.out[a.kind].get(a.asset_id) ?? (a.kind === 'c' ? q.out.c.get(`sym:${a.label}`) : undefined);
      if (!quote) continue;
      if ((a.currency || null) !== (quote.currency || null) && a.kind !== 'i') continue; // devise différente : pas de comparaison
      const hit = a.direction === 'above' ? quote.price >= a.target : quote.price <= a.target;
      if (!hit) continue;
      const L = TEXT[a.lang] || TEXT.fr;
      const t = money(a.target, a.currency, L.loc), p = money(quote.price, quote.currency, L.loc);
      const tab = a.kind === 'c' ? 'crypto' : a.kind === 's' ? 'actions' : 'favoris';
      const status = await sendPush({ endpoint: a.endpoint, p256dh: a.p256dh, auth: a.auth }, {
        title: L[a.direction as 'above' | 'below'].replace('{l}', a.label).replace('{t}', t),
        body: L.body.replace('{p}', p),
        tag: `alert-${a.id}`,
        url: `/#${tab}`,
      }, keys).catch(() => 0);
      if (status >= 200 && status < 300) {
        sent++;
        await sql`update marches.alerts set triggered_at = now(), triggered_price = ${quote.price} where id = ${a.id}`;
      } else if (status === 404 || status === 410) {
        gone++; // abonnement expiré ou révoqué : on supprime l'appareil et ses alertes
        await sql`delete from marches.devices where id = ${a.device_id}`;
      } else {
        failed++;
      }
    }
  }
  // Conservation limitée : alertes déclenchées gardées 30 jours ; appareils sans alerte inactifs depuis 90 jours supprimés.
  await sql`delete from marches.alerts where triggered_at < now() - interval '30 days'`;
  await sql`delete from marches.devices d where last_seen < now() - interval '90 days'
            and not exists (select 1 from marches.alerts a where a.device_id = d.id and a.triggered_at is null)`;
  return json({ checked: due.length, sent, gone, failed, errors });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'méthode non autorisée' }, 405);
  let body: Record<string, any> = {};
  try {
    const text = await req.text();
    if (text.length > 4096) return json({ error: 'requête trop longue' }, 413);
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
