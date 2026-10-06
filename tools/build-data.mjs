// Bygger data/norge.js fra Kartverkets grenser (via robhop/fylker-og-kommuner)
// og SSBs offisielle kommuneliste. Kjør: node tools/build-data.mjs
//
// Nedlastinger lagres i tools/.cache/. Slett mappen for å laste ned på nytt.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boks, etikettpunkt, inni, sjekk, sti, tilKart, utm33 } from './geo.mjs';

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

// GeoJSON-geometri -> liste av polygoner, hver en liste av ringer i UTM-meter.
function polygoner(geom) {
  const liste = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  return liste.map(poly => poly.map(ring => ring.map(utm33)));
}

let X0, Y1;
const kart = polys => tilKart(polys, { x0: X0, y1: Y1, meter: ENHET });

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
const norge = kart(norgeUtm);
const [, , bredde, hoyde] = boks(norge).map(v => v + 20);

const fylker = fylkeGeo.features.map(ft => {
  const polys = kart(polygoner(ft.geometry));
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
  const polys = kart(polygoner(ft.geometry));
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
  // Fra UTM 33 (EUREF89) til kartkoordinater: x = (øst - x0) / meter, y = (y1 - nord) / meter.
  utm: { x0: X0, y1: Y1, meter: ENHET },
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
