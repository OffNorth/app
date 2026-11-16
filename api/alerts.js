// POST /api/alerts — relais vers la fonction Supabase « alerts » (alertes de prix).
// Le navigateur ne parle qu'au site (CSP connect-src 'self') ; l'adresse IP du visiteur n'est pas transmise.
// L'action « check » (tâche planifiée) n'est jamais relayée.
import { json } from './_lib.js';

const FUNCTION_URL = process.env.ALERTS_FUNCTION_URL || 'https://glvxxxoxcxsxdnbofgqf.supabase.co/functions/v1/alerts';
const ACTIONS = new Set(['config', 'register', 'list', 'create', 'delete', 'forget', 'summary.set', 'moves.set', 'remind.set', 'weekly.set',
  'paper.put', 'paper.get', 'paper.delete', 'paper.link', 'paper.pseudo', 'group.create', 'group.join', 'group.leave', 'group.board']);
const MAX_BODY = 420_000; // un compte démo complet (historique compris) tient dans cette limite

export async function POST(request) {
  let body;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return json({ error: 'requête trop longue' }, 413, 0);
    body = JSON.parse(text || '{}');
    if (text.length > 4096 && body?.action !== 'paper.put') return json({ error: 'requête trop longue' }, 413, 0);
  } catch {
    return json({ error: 'JSON invalide' }, 400, 0);
  }
  if (!ACTIONS.has(body?.action)) return json({ error: 'action inconnue' }, 400, 0);
  try {
    const res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({ error: 'réponse invalide' }));
    return json(data, res.status, 0);
  } catch {
    return json({ error: 'service d’alertes injoignable' }, 502, 0);
  }
}

export function GET() {
  return json({ error: 'méthode non autorisée' }, 405, 0);
}
