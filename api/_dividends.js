// GET /api/dividends — dates de détachement (ex-dividende) des 14 prochains jours (calendrier des dividendes Nasdaq,
// sociétés cotées aux États-Unis). L'app ne garde que les entreprises qu'elle suit et vos favoris.
import { cached, fetchWithTimeout, json, num } from './_lib.js';

const us = (s) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || '')); return m ? `${m[3]}-${m[1]}-${m[2]}` : null; };

async function load() {
  const days = [];
  for (let i = 0, d = new Date(); i < 14; i++, d.setUTCDate(d.getUTCDate() + 1)) if (d.getUTCDay() % 6) days.push(d.toISOString().slice(0, 10));
  const res = await Promise.allSettled(days.map((day) => fetchWithTimeout(`https://api.nasdaq.com/api/calendar/dividends?date=${day}`, { timeout: 8000 })
    .then((j) => ({ day, rows: j?.data?.calendar?.rows || [] }))));
  const ok = res.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  if (!ok.length) throw new Error('Nasdaq : calendrier des dividendes indisponible');
  const items = [];
  for (const { rows } of ok) {
    for (const r of rows) {
      if (!/^[A-Z.-]{1,10}$/.test(r.symbol || '')) continue;
      items.push({ symbol: r.symbol, name: String(r.companyName || r.symbol).slice(0, 80), exDate: us(r.dividend_Ex_Date), payDate: us(r.payment_Date),
        amount: num(r.dividend_Rate), annual: num(r.indicated_Annual_Dividend) });
    }
  }
  return { items, days: ok.map((x) => x.day).sort(), source: 'Nasdaq', url: 'https://www.nasdaq.com/market-activity/dividends', fetchedAt: Date.now() };
}

export async function GET() {
  try {
    return json(await cached('dividends', 6 * 3_600_000, load), 200, 3600);
  } catch (err) {
    return json({ error: 'Dividendes indisponibles', detail: String(err.message || err) }, 502, 0);
  }
}
