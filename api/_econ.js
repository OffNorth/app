// GET /api/econ — calendrier économique des 7 prochains jours (calendrier économique Nasdaq) :
// publication, pays, heure, consensus, précédent, publié. Grandes économies uniquement.
// Les heures de Nasdaq (champ « gmt ») sont en fait celles de New York (vérifié : statistiques américaines à 08:30) :
// elles sont converties en instant exact (`at`, ms UTC) pour un affichage à l'heure locale de l'utilisateur.
import { cached, fetchWithTimeout, json } from './_lib.js';

const COUNTRIES = new Set(['United States', 'Euro Zone', 'France', 'Germany', 'United Kingdom', 'Italy', 'Spain', 'China', 'Japan', 'Canada', 'Switzerland', 'Australia']);
/** Instant UTC d'une date et heure de New York (heure d'été comprise). */
function nyToUtc(day, hm) {
  const guess = Date.parse(`${day}T${hm}:00Z`);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(guess).map((p) => [p.type, p.value]));
  const asNy = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00Z`);
  return guess + (guess - asNy);
}
const clean = (v, max = 40) => { const s = String(v ?? '').replace(/&nbsp;/g, ' ').replace(/<[^>]*>/g, '').trim(); return s && s !== '-' ? s.slice(0, max) : null; };

async function load() {
  const days = [];
  for (let i = 0, d = new Date(); i < 7; i++, d.setUTCDate(d.getUTCDate() + 1)) if (d.getUTCDay() % 6) days.push(d.toISOString().slice(0, 10));
  const res = await Promise.allSettled(days.map((day) => fetchWithTimeout(`https://api.nasdaq.com/api/calendar/economicevents?date=${day}`, { timeout: 8000 }).then((j) => ({ day, rows: j?.data?.rows || [] }))));
  const ok = res.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  if (!ok.length) throw new Error('Nasdaq : calendrier économique indisponible');
  const events = [];
  for (const { day, rows } of ok) {
    for (const r of rows) {
      if (!COUNTRIES.has(r.country) || !r.eventName) continue;
      const at = /^\d{2}:\d{2}$/.test(r.gmt || '') ? nyToUtc(day, r.gmt) : null;
      events.push({ date: day, at, country: r.country, name: clean(r.eventName, 90), actual: clean(r.actual), consensus: clean(r.consensus), previous: clean(r.previous) });
    }
  }
  events.sort((a, b) => (a.at ?? Date.parse(`${a.date}T23:59:00Z`)) - (b.at ?? Date.parse(`${b.date}T23:59:00Z`)));
  return { events, days: ok.map((x) => x.day).sort(), source: 'Nasdaq', url: 'https://www.nasdaq.com/market-activity/economic-calendar', fetchedAt: Date.now() };
}

export async function GET() {
  try {
    return json(await cached('econ', 60 * 60_000, load), 200, 1800);
  } catch (err) {
    return json({ error: 'Calendrier économique indisponible', detail: String(err.message || err) }, 502, 0);
  }
}
