// Génère public/data/world.json : contours simplifiés des pays (Natural Earth 1:110m, domaine public,
// via le paquet world-atlas 2.0.2, licence ISC) projetés en Equal Earth, pour la carte des indices.
// Usage (dans un dossier de travail) : npm i world-atlas@2.0.2 topojson-client@3.1.0 d3-geo@3.1.1
//   puis : node /chemin/vers/scripts/worldmap.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const mod = (p) => import(pathToFileURL(join(process.cwd(), 'node_modules', p)).href);
const { feature } = await mod('topojson-client/src/index.js');
const { geoEqualEarth, geoPath } = await mod('d3-geo/src/index.js');
const topo = JSON.parse(await readFile(join(process.cwd(), 'node_modules/world-atlas/countries-110m.json'), 'utf8'));
const W = 1000, H = 470;
const land = feature(topo, topo.objects.countries);
land.features = land.features.filter((f) => f.id !== '010'); // sans l'Antarctique
const proj = geoEqualEarth().fitExtent([[4, 4], [W - 4, H - 4]], land);
const path = geoPath(proj).digits(1);
const countries = land.features.map((f) => ({ id: String(f.id || ''), name: f.properties?.name || '', d: path(f) })).filter((c) => c.d);
// Places trop petites pour la carte au 1:110m : un point à leurs coordonnées.
const points = { 344: [114.17, 22.32], 702: [103.82, 1.35] }; // Hong Kong, Singapour
const dots = Object.fromEntries(Object.entries(points).map(([id, ll]) => [id, proj(ll).map((v) => Math.round(v * 10) / 10)]));
const out = new URL('../public/data/world.json', import.meta.url);
await writeFile(out, JSON.stringify({ w: W, h: H, source: 'Natural Earth (domaine public), world-atlas 2.0.2 (ISC)', countries, dots }));
console.log(`${countries.length} pays, ${(JSON.stringify(countries).length / 1024).toFixed(0)} Ko`);
