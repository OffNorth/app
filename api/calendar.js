// GET /api/calendar — agenda des marchés :
//   central  : décisions de politique monétaire de la Fed (FOMC) et de la BCE, lues sur leurs pages officielles ;
//   earnings : publications de résultats des grandes entreprises cotées aux États-Unis (calendrier Nasdaq).
// Seules les dates publiées par ces sources sont reprises (aucune heure ni date déduite). Source en panne → section absente.
import { cached, fetchWithTimeout, json } from './_lib.js';

const FED_URL = 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm';
const ECB_URL = 'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html';
const NASDAQ_URL = 'https://api.nasdaq.com/api/calendar/earnings?date=';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MIN_CAP = 20e9; // résultats affichés : capitalisation ≥ 20 Md$ (chiffre Nasdaq)
const EARN_DAYS = 14;
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const today = () => new Date().toISOString().slice(0, 10);

/** Réunions du FOMC : jour de la décision = dernier jour de la réunion. « * » = projections économiques publiées. */
async function fed() {
  const html = await fetchWithTimeout(FED_URL, { as: 'text', timeout: 10000 });
  const out = [];
  const heads = [...html.matchAll(/(\d{4}) FOMC Meetings/g)];
  heads.forEach((h, i) => {
    const year = Number(h[1]);
    const part = html.slice(h.index, heads[i + 1]?.index ?? h.index + 60000);
    for (const m of part.matchAll(/fomc-meeting__month[^>]*>\s*(?:<strong>)?\s*([A-Za-z/]+)\s*(?:<\/strong>)?\s*<\/div>\s*<div[^>]*fomc-meeting__date[^>]*>\s*([^<]+?)\s*</g)) {
      const months = m[1].split('/').map((x) => MONTHS.indexOf(x) + 1);
      const days = m[2].replace(/[*\s]|\(.*\)/g, '').match(/^(\d{1,2})(?:-(\d{1,2}))?$/);
      if (!days || months.some((x) => x < 1)) continue; // ligne non reconnue : ignorée plutôt que devinée
      const last = Number(days[2] || days[1]);
      // Réunion à cheval sur deux mois (« April/May 30-1 ») : la décision tombe le second mois.
      const month = months.length > 1 && days[2] && Number(days[2]) < Number(days[1]) ? months[1] : months[0];
      out.push({ bank: 'fed', date: iso(year, month, last), sep: m[2].includes('*') });
    }
  });
  if (!out.length) throw new Error('Fed : calendrier introuvable');
  return out;
}

/** Réunions de politique monétaire de la BCE : jour suivi de la conférence de presse (annonce de la décision). */
async function ecb() {
  const html = await fetchWithTimeout(ECB_URL, { as: 'text', timeout: 10000 });
  const out = [];
  for (const m of html.matchAll(/<dt[^>]*>\s*(\d{2})\/(\d{2})\/(\d{4})\s*<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g)) {
    const text = m[4].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    if (/monetary policy meeting/i.test(text) && !/non-monetary/i.test(text) && /press conference/i.test(text)) {
      out.push({ bank: 'ecb', date: iso(m[3], m[2], m[1]) });
    }
  }
  if (!out.length) throw new Error('BCE : calendrier introuvable');
  return out;
}

/** Résultats trimestriels annoncés sur les 14 prochains jours (jours ouvrés), grandes capitalisations. */
async function earnings() {
  const days = []; // jours ouvrés des 14 prochains jours
  for (let i = 0, d = new Date(); i < EARN_DAYS; i++, d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) days.push(d.toISOString().slice(0, 10));
  }
  const res = await Promise.allSettled(days.map((day) => fetchWithTimeout(NASDAQ_URL + day, { timeout: 8000 }).then((j) => ({ day, rows: j?.data?.rows || [] }))));
  const ok = res.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  if (!ok.length) throw new Error('Nasdaq : calendrier indisponible');
  const out = [];
  for (const { day, rows } of ok) {
    for (const r of rows) {
      const cap = Number(String(r.marketCap || '').replace(/[$,]/g, ''));
      if (!(cap >= MIN_CAP) || !/^[A-Z.-]{1,10}$/.test(r.symbol || '')) continue;
      const eps = Number(String(r.epsForecast || '').replace(/[$,()]/g, ''));
      out.push({
        date: day, symbol: r.symbol, name: r.name || r.symbol, marketCap: cap,
        time: r.time === 'time-pre-market' ? 'pre' : r.time === 'time-after-hours' ? 'after' : null,
        eps: Number.isFinite(eps) && r.epsForecast ? (String(r.epsForecast).includes('(') ? -eps : eps) : null,
        quarter: r.fiscalQuarterEnding || null,
      });
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || b.marketCap - a.marketCap);
  return { items: out, days: ok.map((x) => x.day).sort(), missing: days.length - ok.length };
}

async function load() {
  const [f, e, n] = await Promise.allSettled([cached('cal:fed', 86_400_000, fed), cached('cal:ecb', 86_400_000, ecb), cached('cal:earn', 6 * 3_600_000, earnings)]);
  const from = today();
  const central = [...(f.status === 'fulfilled' ? f.value : []), ...(e.status === 'fulfilled' ? e.value : [])]
    .filter((x) => x.date >= from).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12);
  return {
    central,
    centralOk: { fed: f.status === 'fulfilled', ecb: e.status === 'fulfilled' },
    earnings: n.status === 'fulfilled' ? n.value.items : null,
    earningsDays: n.status === 'fulfilled' ? n.value.days : [],
    sources: { fed: FED_URL, ecb: ECB_URL, earnings: 'https://www.nasdaq.com/market-activity/earnings' },
    fetchedAt: Date.now(),
  };
}

export async function GET() {
  try {
    const data = await cached('calendar', 30 * 60_000, load);
    if (!data.central.length && !data.earnings) return json({ error: 'Agenda indisponible' }, 502, 0);
    return json(data, 200, 1800);
  } catch (err) {
    return json({ error: 'Agenda indisponible', detail: String(err.message || err) }, 502, 0);
  }
}
