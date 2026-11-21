// GET /api/bot — état en direct du bot de paper trading (comptes FTMO / Lucid simulés, positions avec entrée / SL / TP,
// derniers trades). Relais en lecture seule de l'action « get » de la fonction Supabase « bot » (aucun secret).
// Développement local : BOT_SAMPLE=<fichier JSON> sert un état d'exemple au lieu de la fonction.
import { cached, fetchWithTimeout, json } from './_lib.js';

const FUNCTION_URL = process.env.BOT_FUNCTION_URL || 'https://glvxxxoxcxsxdnbofgqf.supabase.co/functions/v1/bot';

export async function GET() {
  try {
    if (process.env.BOT_SAMPLE && !process.env.VERCEL) {
      const { readFile } = await import('node:fs/promises');
      const data = JSON.parse(await readFile(process.env.BOT_SAMPLE, 'utf8'));
      return json({ data: { ...data, at: Date.now() - 20_000 }, updated_at: new Date(Date.now() - 20_000).toISOString() }, 200, 0);
    }
    const d = await cached('bot', 10_000, () => fetchWithTimeout(`${FUNCTION_URL}?action=get&slot=main`, { timeout: 10000 }));
    if (!d || !('data' in d)) return json({ error: 'Bot indisponible' }, 502, 0);
    return json(d, 200, 10);
  } catch (err) {
    return json({ error: 'Bot indisponible', detail: String(err.message || err) }, 502, 0);
  }
}
