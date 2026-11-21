// Fonction Edge Supabase « bot » — état en direct du bot de paper trading (simulation, argent fictif).
//
// Actions :
//   GET  ?action=get[&slot=main]                 → public, lecture seule : { data, updated_at }
//   POST ?action=put[&slot=main] (x-bot-key)     → le bot publie son état (≤ 400 Ko). La clé est générée par le bot ;
//                                                   au 1er envoi sur un emplacement, son empreinte SHA-256 est enregistrée,
//                                                   ensuite seule cette clé peut écrire (aucun secret échangé à la main).
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

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'get';
    const slot = url.searchParams.get('slot') || 'main';
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
