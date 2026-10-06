// Bygger data/norge.js fra Kartverkets grenser (via robhop/fylker-og-kommuner)
// og SSBs offisielle kommuneliste. Kjør: node tools/build-data.mjs
//
// Nedlastinger lagres i tools/.cache/. Slett mappen for å laste ned på nytt.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'tools', '.cache');
const OUT = path.join(ROOT, 'data', 'norge.js');

const KART_SHA = 'ae8782500090144c2b74d6bb2a89365a7ff2236d';
const KART = `https://raw.githubusercontent.com/robhop/fylker-og-kommuner/${KART_SHA}`;
const SSB_DATO = '2026-10-06';
const SSB = `https://data.ssb.no/api/klass/v1/classifications/131/codesAt?date=${SSB_DATO}`;

// Kartets oppløsning: 1 enhet = 100 m.
const ENHET = 100;

// Kommuner der det norske navnet ikke står først i det offisielle navnet.
const NORSK_NAVN = {
  '1826': 'Hattfjelldal', '1875': 'Hamarøy', '5041': 'Snåsa', '5043': 'Røyrvik',
  '5512': 'Tjeldsund', '5518': 'Lavangen', '5540': 'Kåfjord', '5610': 'Karasjok',
  '5612': 'Kautokeino', '5628': 'Tana', '5636': 'Nesseby',
};
// SSB-API-et mangler ŋ her.
const FULLT_NAVN = { '5622': 'Porsanger - Porsáŋgu - Porsanki' };

const FYLKER_2024 = ['03', '11', '15', '18', '31', '32', '33', '34', '39', '40', '42', '46', '50', '55', '56'];

async function hent(navn, url) {
  const fil = path.join(CACHE, navn);
  if (!fs.existsSync(fil)) {
    console.log(`Laster ned ${url}`);
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(fil, await res.text());
  }
  return JSON.parse(fs.readFileSync(fil, 'utf8'));
}

function sjekk(ok, melding) {
  if (!ok) throw new Error(`Kontroll feilet: ${melding}`);
}

// --- Projeksjon: UTM sone 33 (EUREF89/GRS80), Snyders formler ---

const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996, lon0 = 15 * Math.PI / 180;
const e2 = f * (2 - f), e4 = e2 * e2, e6 = e4 * e2, ep2 = e2 / (1 - e2);

function utm33([lon, lat]) {
  const phi = lat * Math.PI / 180, lam = lon * Math.PI / 180;
  const sin = Math.sin(phi), cos = Math.cos(phi), tan = Math.tan(phi);
  const N = a / Math.sqrt(1 - e2 * sin * sin);
  const T = tan * tan, C = ep2 * cos * cos, A = (lam - lon0) * cos;
  const M = a * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi
    - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * phi)
    + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * phi)
    - (35 * e6 / 3072) * Math.sin(6 * phi));
  const x = k0 * N * (A + (1 - T + C) * A ** 3 / 6
    + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
  const y = k0 * (M + N * tan * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24
    + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720));
  return [x, y];
}

// GeoJSON-geometri -> liste av polygoner, hver en liste av ringer i UTM-meter.
function polygoner(geom) {
  const liste = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  return liste.map(poly => poly.map(ring => ring.map(utm33)));
}

// --- Geometrihjelpere (i kartenheter) ---

function areal(ring) {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    s += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(s / 2);
}

function inni([x, y], ringer) {
  let inne = false;
  for (const ring of ringer) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inne = !inne;
    }
  }
  return inne;
}

function avstandTilKant([x, y], ringer) {
  let min = Infinity;
  for (const ring of ringer) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x1, y1] = ring[j], [x2, y2] = ring[i];
      const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / l2)) : 0;
      min = Math.min(min, Math.hypot(x - x1 - t * dx, y - y1 - t * dy));
    }
  }
  return min;
}

function boks(polys) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of polys) for (const [x, y] of poly[0]) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}

// Punktet i det største polygonet som ligger lengst fra kanten (for etiketter).
function etikettpunkt(polys) {
  const storst = polys.reduce((m, p) => (areal(p[0]) > areal(m[0]) ? p : m));
  const [x0, y0, x1, y1] = boks([storst]);
  let best = null, bestD = -1;
  const steg = 40;
  for (let i = 0; i <= steg; i++) {
    for (let j = 0; j <= steg; j++) {
      const p = [x0 + (x1 - x0) * i / steg, y0 + (y1 - y0) * j / steg];
      if (!inni(p, storst)) continue;
      const d = avstandTilKant(p, storst);
      if (d > bestD) { bestD = d; best = p; }
    }
  }
  return best ?? storst[0][0];
}

// --- Fra UTM-meter til heltallige SVG-koordinater ---

let X0, Y1;
function tilKart(polys) {
  const ut = [];
  for (const poly of polys) {
    const ringer = [];
    for (const [i, ring] of poly.entries()) {
      const r = [];
      for (const [x, y] of ring) {
        const p = [Math.round((x - X0) / ENHET), Math.round((Y1 - y) / ENHET)];
        const forrige = r[r.length - 1];
        if (!forrige || forrige[0] !== p[0] || forrige[1] !== p[1]) r.push(p);
      }
      if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop();
      if (r.length >= 3) ringer.push(r);
      // Et polygon uten ytterring faller bort (bittesmå holmer).
      else if (i === 0) break;
    }
    if (ringer.length) ut.push(ringer);
  }
  return ut;
}

// Kompakt SVG-sti med relative koordinater.
function sti(polys) {
  let d = '';
  const tall = n => (n < 0 || d.endsWith('l') || d.endsWith('M') ? '' : ' ') + n;
  for (const poly of polys) {
    for (const ring of poly) {
      d += 'M' + ring[0][0] + tall(ring[0][1]) + 'l';
      for (let i = 1; i < ring.length; i++) {
        d += tall(ring[i][0] - ring[i - 1][0]);
        d += tall(ring[i][1] - ring[i - 1][1]);
      }
      d += 'z';
    }
  }
  return d;
}

// --- Bygg ---

const kommuneGeo = await hent('Kommuner-M.geojson', `${KART}/Kommuner-M.geojson`);
const fylkeGeo = await hent('Fylker-M.geojson', `${KART}/Fylker-M.geojson`);
const norgeGeo = await hent('Norge-M.geojson', `${KART}/Norge-M.geojson`);
const ssb = await hent(`ssb-${SSB_DATO}.json`, SSB);

const ssbNavn = Object.fromEntries(
  ssb.codes.filter(c => c.code !== '9999').map(c => [c.code, c.name.replace(/ \(.*\)$/, '')]),
);

const norgeUtm = norgeGeo.features.flatMap(ft => polygoner(ft.geometry));
{
  let xmin = Infinity, ymax = -Infinity;
  for (const poly of norgeUtm) for (const [x, y] of poly[0]) {
    xmin = Math.min(xmin, x); ymax = Math.max(ymax, y);
  }
  X0 = Math.floor(xmin / ENHET) * ENHET - 2000;
  Y1 = Math.ceil(ymax / ENHET) * ENHET + 2000;
}
const norge = tilKart(norgeUtm);
const [, , bredde, hoyde] = boks(norge).map(v => v + 20);

const fylker = fylkeGeo.features.map(ft => {
  const polys = tilKart(polygoner(ft.geometry));
  return {
    nr: ft.properties.fylkesnummer,
    navn: ft.properties.name,
    fullt: ft.properties.fylkesnavn,
    d: sti(polys),
    boks: boks(polys),
    punkt: etikettpunkt(polys).map(Math.round),
    _polys: polys,
  };
}).sort((x, y) => x.nr.localeCompare(y.nr));

const kommuner = kommuneGeo.features.map(ft => {
  const nr = ft.properties.kommunenummer;
  const polys = tilKart(polygoner(ft.geometry));
  sjekk(polys.length > 0, `${nr} har ingen geometri igjen etter avrunding`);
  const fullt = FULLT_NAVN[nr] ?? ssbNavn[nr];
  sjekk(fullt, `${nr} finnes ikke i SSBs liste`);
  const p = etikettpunkt(polys);
  return {
    nr,
    navn: NORSK_NAVN[nr] ?? fullt.split(' - ')[0],
    fullt,
    fylke: nr.slice(0, 2),
    d: sti(polys),
    boks: boks(polys),
    punkt: [Math.round(p[0]), Math.round(p[1])],
  };
}).sort((x, y) => x.nr.localeCompare(y.nr));

// --- Kontroller ---

sjekk(fylker.length === 15, `forventet 15 fylker, fikk ${fylker.length}`);
sjekk(fylker.map(f => f.nr).join() === FYLKER_2024.join(), 'fylkesnumrene stemmer ikke');
sjekk(kommuner.length === 357, `forventet 357 kommuner, fikk ${kommuner.length}`);
sjekk(new Set(kommuner.map(k => k.nr)).size === 357, 'kommunenumrene er ikke unike');
sjekk(Object.keys(ssbNavn).length === 357, `SSB har ${Object.keys(ssbNavn).length} kommuner`);
for (const nr of Object.keys(ssbNavn)) sjekk(kommuner.some(k => k.nr === nr), `${nr} mangler i kartet`);
for (const k of kommuner) {
  const fylke = fylker.find(f => f.nr === k.fylke);
  sjekk(fylke, `${k.nr} ${k.navn}: fylke ${k.fylke} finnes ikke`);
  sjekk(fylke._polys.some(p => inni(k.punkt, p)), `${k.nr} ${k.navn} ligger ikke inne i ${fylke.navn}`);
  sjekk(!k.navn.includes(' - '), `${k.nr} har flerspråklig kortnavn`);
}
for (const f of fylker) delete f._polys;

// --- Skriv ---

const data = {
  kilde: 'Kartgrunnlag: Kartverket (CC BY 4.0), via robhop/fylker-og-kommuner. Kommuneliste: SSB.',
  bredde, hoyde,
  omriss: sti(norge),
  fylker,
  kommuner,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT,
  '// Generert av tools/build-data.mjs. Ikke rediger for hånd.\n'
  + `window.NORGE = ${JSON.stringify(data)};\n`);

const kb = Math.round(fs.statSync(OUT).size / 1024);
console.log(`Skrev ${path.relative(ROOT, OUT)}: ${fylker.length} fylker, ${kommuner.length} kommuner, ${kb} KB, ${bredde}x${hoyde}`);
