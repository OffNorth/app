// Génère public/data/sectors.json : secteur d'activité de chaque entreprise suivie (top 100),
// d'après la recherche Yahoo Finance (champ « sector », classement de Yahoo).
// Usage : node scripts/sectors.mjs [URL du site, défaut http://localhost:8787]
// Une entreprise sans secteur fourni par Yahoo est absente du fichier (affichée « Autre / n/d »), jamais devinée.
import { readFile, writeFile } from 'node:fs/promises';

const SITE = process.argv[2] || 'http://localhost:8787';
const OUT = new URL('../public/data/sectors.json', import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { companies } = await (await fetch(`${SITE}/api/stocks?n=100`)).json();
let prev = {};
try { prev = JSON.parse(await readFile(OUT, 'utf8')).sectors || {}; } catch { /* premier passage */ }
const sectors = { ...prev };
const missing = [];
for (const c of companies) {
  let sector = null;
  for (const host of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
    try {
      const r = await fetch(`https://${host}/v1/finance/search?q=${encodeURIComponent(c.id)}&quotesCount=6&newsCount=0&listsCount=0`,
        { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
      if (!r.ok) continue;
      const q = (await r.json()).quotes?.find((x) => x.symbol === c.id);
      sector = q?.sector || null;
      break;
    } catch { /* hôte suivant */ }
  }
  if (sector) sectors[c.id] = sector;
  else missing.push(c.id);
  await sleep(250);
}
const sorted = Object.fromEntries(Object.entries(sectors).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(OUT, `${JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), source: 'Yahoo Finance (recherche, champ sector)', sectors: sorted }, null, 1)}\n`);
console.log(`${Object.keys(sorted).length} secteurs ; sans secteur Yahoo : ${missing.join(', ') || 'aucune'}`);
