// Fonction Edge Supabase « bot » — état en direct du bot de paper trading (simulation, argent fictif).
//
// Actions :
//   GET  ?action=get[&slot=main]                 → public, lecture seule : { data, updated_at }
//   POST ?action=put[&slot=main] (x-bot-key)     → le bot publie son état (≤ 400 Ko). La clé est générée par le bot ;
//                                                   au 1er envoi sur un emplacement, son empreinte SHA-256 est enregistrée,
//                                                   ensuite seule cette clé peut écrire (aucun secret échangé à la main).
//   POST ?action=backup_put (x-backup-key)        → sauvegarde quotidienne des données du bot (gzip + base64, ≤ 8 Mo) ;
//                                                   la précédente est gardée (« previous »). Clé dérivée du token du bot.
//   POST ?action=backup_get[&which=previous] (x-backup-key) → relit la sauvegarde (même clé seulement : données privées).
import postgres from 'npm:postgres@3.4.5';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2, idle_timeout: 20 });
const MAX = 400_000;
const SLOTS = new Set(['main', 'test']);

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

async function sha256(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const BACKUP_MAX = 8_000_000;
/** Sauvegarde privée : écriture et lecture avec la clé dont l'empreinte a été enregistrée au 1er envoi. */
async function backup(req: Request, url: URL, action: string) {
  if (req.method !== 'POST') return reply({ error: 'POST seulement' }, 405);
  const key = req.headers.get('x-backup-key') || '';
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(key)) return reply({ error: 'clé absente ou invalide' }, 401);
  const hash = await sha256(key);
  const [cur] = await sql`select key_hash from marches.bot_backup where id = 'daily'`;
  if (cur && cur.key_hash !== hash) return reply({ error: 'clé refusée' }, 403);
  if (action === 'backup_get') {
    const which = url.searchParams.get('which') === 'previous' ? 'previous' : 'daily';
    const [row] = await sql`select data, files, bytes, version, updated_at from marches.bot_backup where id = ${which} and key_hash = ${hash}`;
    return reply(row || { data: null });
  }
  const text = await req.text();
  if (text.length > BACKUP_MAX) return reply({ error: 'sauvegarde trop grosse' }, 413);
  let b: { data?: string; files?: number; bytes?: number; version?: string };
  try { b = JSON.parse(text); } catch { return reply({ error: 'JSON invalide' }, 400); }
  if (!b || typeof b.data !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(b.data)) return reply({ error: 'sauvegarde invalide' }, 400);
  await sql.begin(async (tx) => {
    await tx`delete from marches.bot_backup where id = 'previous'`;
    await tx`update marches.bot_backup set id = 'previous' where id = 'daily'`;
    await tx`insert into marches.bot_backup (id, key_hash, data, files, bytes, version, updated_at)
             values ('daily', ${hash}, ${b.data}, ${b.files || 0}, ${b.bytes || 0}, ${String(b.version || '').slice(0, 40)}, now())`;
  });
  return reply({ ok: true });
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'get';
    const slot = url.searchParams.get('slot') || 'main';
    if (action === 'backup_put' || action === 'backup_get') return await backup(req, url, action);
    if (!SLOTS.has(slot)) return reply({ error: 'emplacement inconnu' }, 400);

    if (action === 'get') {
      const [row] = await sql`select data, updated_at from marches.bot_live where slot = ${slot}`;
      return reply(row ? { data: row.data, updated_at: row.updated_at } : { data: null, updated_at: null });
    }

    if (action === 'put' && req.method === 'POST') {
      const key = req.headers.get('x-bot-key') || '';
      if (!/^[A-Za-z0-9_-]{32,128}$/.test(key)) return reply({ error: 'clé absente ou invalide' }, 401);
      const text = await req.text();
      if (text.length > MAX) return reply({ error: 'état trop gros' }, 413);
      let data: unknown;
      try { data = JSON.parse(text); } catch { return reply({ error: 'JSON invalide' }, 400); }
      if (!data || typeof data !== 'object') return reply({ error: 'état invalide' }, 400);
      const hash = await sha256(key);
      // 1er envoi : l'empreinte est enregistrée ; ensuite, seule la même clé peut remplacer l'état
      const rows = await sql`
        insert into marches.bot_live (slot, key_hash, data, updated_at)
        values (${slot}, ${hash}, ${sql.json(data as Record<string, unknown>)}, now())
        on conflict (slot) do update set data = excluded.data, updated_at = now()
        where marches.bot_live.key_hash = excluded.key_hash
        returning updated_at`;
      if (!rows.length) return reply({ error: 'clé refusée' }, 403);
      return reply({ ok: true, updated_at: rows[0].updated_at });
    }
    return reply({ error: 'action inconnue' }, 400);
  } catch (err) {
    return reply({ error: 'erreur interne', detail: String((err as Error).message || err) }, 500);
  }
});
