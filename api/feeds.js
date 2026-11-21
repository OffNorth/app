// Point d'entrée unique des flux en lecture (limite de 12 fonctions du plan Hobby de Vercel).
// Les anciennes adresses (/api/news, /api/quote…) restent valables : vercel.json les réécrit vers /api/feeds?r=<nom>.
import { json } from './_lib.js';
import { GET as news } from './_news.js';
import { GET as sentiment } from './_sentiment.js';
import { GET as cryptocats } from './_cryptocats.js';
import { GET as econ } from './_econ.js';
import { GET as dividends } from './_dividends.js';
import { GET as calendar } from './_calendar.js';
import { GET as macro } from './_macro.js';
import { GET as search } from './_search.js';
import { GET as quote } from './_quote.js';
import { GET as rates } from './_rates.js';
import { GET as events } from './_events.js';
import { GET as btc } from './_btc.js';
import { GET as agents } from './_agents.js';
import { GET as bot } from './_bot.js';

export const ROUTES = { news, sentiment, cryptocats, econ, dividends, calendar, macro, search, quote, rates, events, btc, agents, bot };

export function GET(request) {
  const r = new URL(request.url).searchParams.get('r');
  const handler = Object.hasOwn(ROUTES, r) ? ROUTES[r] : null;
  return handler ? handler(request) : json({ error: 'introuvable' }, 404, 0);
}
