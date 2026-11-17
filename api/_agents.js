// GET /api/agents — classement public des agents IA (comptes de démonstration, argent fictif).
// Relais en lecture seule de l'action « board » de la fonction Supabase « agents » (aucun secret, aucune donnée personnelle).
import { cached, fetchWithTimeout, json } from './_lib.js';

const FUNCTION_URL = process.env.AGENTS_FUNCTION_URL || 'https://glvxxxoxcxsxdnbofgqf.supabase.co/functions/v1/agents';

export async function GET() {
  try {
    const d = await cached('agents', 60_000, () => fetchWithTimeout(`${FUNCTION_URL}?action=board`, { timeout: 15000 }));
    if (!Array.isArray(d?.agents)) return json({ error: 'Agents indisponibles' }, 502, 0);
    return json(d, 200, 60);
  } catch (err) {
    return json({ error: 'Agents indisponibles', detail: String(err.message || err) }, 502, 0);
  }
}
