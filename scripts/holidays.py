"""Génère public/data/holidays.json : jours de fermeture des bourses suivies (jours de semaine sans séance).

Source : bibliothèque open source exchange_calendars (https://github.com/gerrymanoim/exchange_calendars).
Usage : pip install exchange_calendars && python3 scripts/holidays.py [début AAAA-MM-JJ] [fin AAAA-MM-JJ]
Pour chaque place : jours de week-end (masque de la bibliothèque), jours fériés et date de fin de couverture
(certaines places ne sont renseignées que jusqu'à une année donnée : au-delà, rien n'est supposé).
"""
import datetime as dt
import json
import pathlib
import re
import sys

import exchange_calendars as xc
import pandas as pd

# Fuseau horaire de la place (champ exchangeTimezoneName de Yahoo Finance) → code ISO 10383 de la bourse principale.
MARKETS = {
    'America/New_York': 'XNYS', 'America/Toronto': 'XTSE', 'America/Sao_Paulo': 'BVMF', 'America/Mexico_City': 'XMEX',
    'America/Argentina/Buenos_Aires': 'XBUE', 'Europe/Paris': 'XPAR', 'Europe/Berlin': 'XETR', 'Europe/London': 'XLON',
    'Europe/Madrid': 'XMAD', 'Europe/Rome': 'XMIL', 'Europe/Amsterdam': 'XAMS', 'Europe/Zurich': 'XSWX', 'Europe/Brussels': 'XBRU',
    'Europe/Lisbon': 'XLIS', 'Europe/Vienna': 'XWBO', 'Europe/Stockholm': 'XSTO', 'Europe/Oslo': 'XOSL', 'Europe/Warsaw': 'XWAR',
    'Europe/Istanbul': 'XIST', 'Asia/Shanghai': 'XSHG', 'Asia/Hong_Kong': 'XHKG', 'Asia/Tokyo': 'XTKS', 'Asia/Seoul': 'XKRX',
    'Asia/Taipei': 'XTAI', 'Asia/Kolkata': 'XBOM', 'Asia/Singapore': 'XSES', 'Asia/Jakarta': 'XIDX', 'Asia/Kuala_Lumpur': 'XKLS',
    'Asia/Bangkok': 'XBKK', 'Australia/Sydney': 'XASX', 'Pacific/Auckland': 'XNZE', 'Asia/Riyadh': 'XSAU', 'Asia/Jerusalem': 'XTAE',
    'Africa/Johannesburg': 'XJSE',
}
JS_DAY = [1, 2, 3, 4, 5, 6, 0]  # masque exchange_calendars : lundi → dimanche

start = sys.argv[1] if len(sys.argv) > 1 else dt.date.today().isoformat()
end = sys.argv[2] if len(sys.argv) > 2 else f'{dt.date.today().year + 1}-12-31'
out = {}
for tz, mic in MARKETS.items():
    stop = end
    try:
        cal = xc.get_calendar(mic, start=start, end=stop)
    except Exception as err:  # place renseignée jusqu'à une année antérieure : on s'arrête là
        year = re.search(r'to the year (\d{4})', str(err))
        if not year:
            print(f'{mic} ignorée : {err}', file=sys.stderr)
            continue
        stop = min(end, f'{year.group(1)}-12-31')
        cal = xc.get_calendar(mic, start=start, end=stop)
    stop = min(stop, cal.last_session.strftime('%Y-%m-%d'))
    days = pd.bdate_range(start, stop, freq='C', weekmask=cal.weekmask)
    sessions = set(cal.sessions.strftime('%Y-%m-%d'))
    out[tz] = {
        'mic': mic,
        'weekend': [JS_DAY[i] for i, c in enumerate(cal.weekmask) if c == '0'],
        'until': stop,
        'closed': [d.strftime('%Y-%m-%d') for d in days if d.strftime('%Y-%m-%d') not in sessions],
    }

dest = pathlib.Path(__file__).resolve().parent.parent / 'public' / 'data' / 'holidays.json'
dest.write_text(json.dumps({
    'generatedAt': dt.date.today().isoformat(), 'from': start,
    'source': f'exchange_calendars {xc.__version__}', 'markets': out,
}, ensure_ascii=False, separators=(',', ':')) + '\n')
print(f'{len(out)} places → {dest}')
for tz, m in out.items():
    print(f"  {m['mic']} {tz}: {len(m['closed'])} jours fériés jusqu'au {m['until']}, week-end {m['weekend']}")
