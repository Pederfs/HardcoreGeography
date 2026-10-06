// Bygger data/oslo.js: Oslos bydeler og postnummerområder.
// Kjør etter build-data.mjs: node tools/build-oslo.mjs
//
// Bydelene lages ved å slå sammen SSBs grunnkretser etter SSBs kobling
// grunnkrets -> bydel. Postnummerområdene kommer fra Kartverket/Posten.
// Nedlastinger lagres i tools/.cache/. Slett mappen for å laste ned på nytt.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boks, etikettpunkt, inni, sjekk, sti, tilKart, utm33 } from './geo.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'tools', '.cache');
const OUT = path.join(ROOT, 'data', 'oslo.js');

const SSB_DATO = '2026-01-01';
// Samme kilde og versjon som build-data.mjs, men i høyeste kvalitet (L) for Oslos kystlinje.
const KART_L = 'https://raw.githubusercontent.com/robhop/fylker-og-kommuner/ae8782500090144c2b74d6bb2a89365a7ff2236d/Kommuner-L.geojson';
const GRUNNKRETSER = '51d279f8-e2be-4f5e-9f72-1a53f7535ec1';
const POSTNUMMER = '462a5297-33ef-438a-82a5-07fff5799be3';

// Oslo tegnes med 10 m oppløsning, ti ganger finere enn resten av kartet.
const METER = 10;

async function hentJson(navn, url) {
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

// Bestiller Oslo kommune som GeoJSON i UTM 33 fra Geonorge, laster ned og pakker ut.
async function hentGeonorge(uuid, navn, filnavn) {
  const mappe = path.join(CACHE, 'geonorge-' + navn);
  const finn = () => fs.existsSync(mappe) && fs.readdirSync(mappe).find(f => f.includes(filnavn));
  if (!finn()) {
    console.log(`Bestiller ${navn} fra Geonorge`);
    const ordre = await fetch('https://nedlasting.geonorge.no/api/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: '',
        orderLines: [{
          metadataUuid: uuid,
          areas: [{ code: '0301', type: 'kommune', name: 'Oslo' }],
          projections: [{ code: '25833' }],
          formats: [{ name: 'GeoJSON' }],
        }],
      }),
    }).then(r => r.json());
    const fil = ordre.files?.find(f => f.status === 'ReadyForDownload');
    sjekk(fil, `Geonorge-bestillingen av ${navn} er ikke klar: ${JSON.stringify(ordre).slice(0, 300)}`);
    const zip = Buffer.from(await (await fetch(fil.downloadUrl)).arrayBuffer());
    fs.mkdirSync(mappe, { recursive: true });
    const zipFil = path.join(mappe, 'data.zip');
    fs.writeFileSync(zipFil, zip);
    execFileSync('unzip', ['-o', '-q', zipFil, '-d', mappe]);
  }
  const tekst = fs.readFileSync(path.join(mappe, finn()), 'utf8').replace(/^﻿/, '');
  return JSON.parse(tekst);
}

// --- Hjelpere ---

const ringerAv = geom => (geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates);
const uten = ring => ring.slice(0, -1); // GeoJSON gjentar første punkt til slutt
const signert = ring => {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    s += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return s / 2;
};

// Slår sammen polygoner som deler kanter: kanter som går begge veier er indre
// grenser og forsvinner, resten lenkes sammen til nye ringer.
function slaSammen(polygoner) {
  const nokkel = p => p[0].toFixed(2) + ',' + p[1].toFixed(2);
  const kanter = new Map();
  for (const poly of polygoner) {
    for (const ring of poly) {
      const r = uten(ring);
      for (let i = 0; i < r.length; i++) {
        const a = r[i], b = r[(i + 1) % r.length];
        const fram = nokkel(a) + '|' + nokkel(b), bak = nokkel(b) + '|' + nokkel(a);
        if (kanter.has(bak)) kanter.delete(bak);
        else kanter.set(fram, [a, b]);
      }
    }
  }
  const fra = new Map();
  for (const [k, [a, b]] of kanter) {
    const n = nokkel(a);
    if (!fra.has(n)) fra.set(n, []);
    fra.get(n).push({ k, a, b });
  }
  const ringer = [];
  for (const k of kanter.keys()) {
    if (!kanter.has(k)) continue;
    const ring = [];
    let kant = fra.get(k.split('|')[0]).find(e => e.k === k);
    const start = nokkel(kant.a);
    for (;;) {
      kanter.delete(kant.k);
      fra.get(nokkel(kant.a)).splice(fra.get(nokkel(kant.a)).indexOf(kant), 1);
      ring.push(kant.a);
      const neste = nokkel(kant.b);
      if (neste === start) break;
      kant = fra.get(neste)?.[0];
      sjekk(kant, 'åpen ring ved sammenslåing');
    }
    ringer.push(ring);
  }
  return ringer;
}

// --- Last inn ---

const norge = (() => {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'data', 'norge.js'), 'utf8'), ctx);
  return ctx.window.NORGE;
})();
sjekk(norge?.utm, 'data/norge.js mangler utm. Kjør build-data.mjs først.');
const { x0: X0, y1: Y1, meter: ENHET } = norge.utm;
const DELER = ENHET / METER;
const kart = polys => tilKart(polys, { x0: X0, y1: Y1, meter: METER });
const tilEnhet = ([x, y]) => [Math.round((x - X0) / METER) / DELER, Math.round((Y1 - y) / METER) / DELER];
const boksEnhet = polys => boks(polys).map(v => v / DELER);

const grunnkretser = (await hentGeonorge(GRUNNKRETSER, 'grunnkretser', 'Grunnkrets')).features;
const postGeo = await hentGeonorge(POSTNUMMER, 'postnummer', 'Postnummeromrader');
const postnummer = postGeo['postnummeromrader.postnummeromrade'].features;
const kobling = (await hentJson(`ssb-grunnkrets-bydel-${SSB_DATO}.json`,
  `https://data.ssb.no/api/klass/v1/classifications/1/correspondsAt?targetClassificationId=103&date=${SSB_DATO}`))
  .correspondenceItems;
const bydelNavn = Object.fromEntries((await hentJson(`ssb-bydeler-${SSB_DATO}.json`,
  `https://data.ssb.no/api/klass/v1/classifications/103/codesAt?date=${SSB_DATO}`))
  .codes.filter(c => c.code.startsWith('0301') && c.code !== '030199').map(c => [c.code, c.name]));

// --- Bydeler ---

const tilBydel = Object.fromEntries(kobling.filter(k => k.sourceCode.startsWith('0301')).map(k => [k.sourceCode, k.targetCode]));
const perBydel = {};
let sumAreal = 0;
for (const ft of grunnkretser) {
  const nr = ft.properties.grunnkretsnummer;
  const bydel = tilBydel[nr];
  sjekk(bydel && bydelNavn[bydel], `grunnkrets ${nr} mangler bydel`);
  const polys = ringerAv(ft.geometry);
  for (const p of polys) for (const r of p) sumAreal += signert(uten(r));
  (perBydel[bydel] ??= []).push(...polys);
}

const bydeler = Object.keys(bydelNavn).sort().map(nr => {
  const ringer = slaSammen(perBydel[nr]);
  const polys = ringer.map(r => [r]);
  return { nr, navn: bydelNavn[nr], ekte: Number(nr.slice(4)) <= 15, ringer, polys };
});

const sammenslattAreal = bydeler.reduce((s, b) => s + b.ringer.reduce((t, r) => t + signert(r), 0), 0);
sjekk(Math.abs(sammenslattAreal - sumAreal) < 1, `arealet endret seg ved sammenslåing (${sumAreal} -> ${sammenslattAreal})`);

for (const b of bydeler) b.ramme = boks(b.polys);
const iBydel = (p, b) => p[0] >= b.ramme[0] && p[0] <= b.ramme[2] && p[1] >= b.ramme[1] && p[1] <= b.ramme[3]
  && inni(p, b.ringer);

// Grunnkretsene og postnummerområdene går ut i fjorden til kommunegrensen.
// Land er Oslo slik hovedkartet tegner den (klippet etter kystlinjen), og
// spillet klipper bydeler og postnummer mot den samme formen.
const osloLand = ringerAv((await hentJson('Kommuner-L.geojson', KART_L))
  .features.find(f => f.properties.kommunenummer === '0301').geometry)
  .map(poly => poly.map(ring => ring.map(utm33)));
const kyst = osloLand.flat();
const landRamme = boks(osloLand);
const paLand = p => p[0] >= landRamme[0] && p[0] <= landRamme[2] && p[1] >= landRamme[1] && p[1] <= landRamme[3]
  && osloLand.some(poly => inni(p, poly));

const bydelUt = bydeler.map(b => {
  // Etiketten skal ligge i bydelens eget område, ikke i en enklave inni den.
  const p = etikettpunkt(b.polys, q => iBydel(q, b) && paLand(q), kyst);
  sjekk(p, `fant ikke etikettpunkt for ${b.navn}`);
  return { nr: b.nr, navn: b.navn, ekte: b.ekte, d: sti(kart(b.polys), DELER), boks: boksEnhet(kart(b.polys)), punkt: tilEnhet(p) };
});

// --- Postnummer ---

const perNummer = {};
for (const ft of postnummer) (perNummer[ft.properties.postnummer] ??= []).push(...ringerAv(ft.geometry));

const utelatt = [];
const postUt = [];
for (const nr of Object.keys(perNummer).sort()) {
  const polys = perNummer[nr];
  // Områdene går ut i fjorden, så etiketten må ligge på land.
  const p = etikettpunkt(polys, paLand, kyst);
  if (!p) { utelatt.push(nr); continue; }
  const bydel = bydeler.find(b => iBydel(p, b)).nr;
  const k = kart(polys);
  postUt.push({ nr, bydel, d: sti(k, DELER), boks: boksEnhet(k), punkt: tilEnhet(p) });
}

// --- Kontroller ---

sjekk(bydelUt.filter(b => b.ekte).length === 15, 'forventet 15 bydeler');
sjekk(bydelUt.length === 17, 'forventet 15 bydeler pluss Sentrum og Marka');
sjekk(Object.keys(tilBydel).length === grunnkretser.length, 'antall grunnkretser stemmer ikke med SSBs kobling');
sjekk(postUt.length >= 400, `bare ${postUt.length} postnummer`);
sjekk(new Set(postUt.map(p => p.nr)).size === postUt.length, 'postnummer er ikke unike');
for (const p of postUt) sjekk(/^\d{4}$/.test(p.nr), `ugyldig postnummer ${p.nr}`);

// --- Skriv ---

const data = {
  kilde: 'Kystlinje: Kartverket (CC BY 4.0). Bydeler: SSB (grunnkretser og bydelskobling, CC BY 4.0). Postnummer: Posten/Kartverket (CC BY 4.0).',
  // Oslo klippet etter kystlinjen. Bydeler og postnummer klippes mot denne.
  land: sti(kart(osloLand), DELER),
  bydeler: bydelUt,
  postnummer: postUt,
};
fs.writeFileSync(OUT,
  '// Generert av tools/build-oslo.mjs. Ikke rediger for hånd.\n'
  + `window.OSLO = ${JSON.stringify(data)};\n`);

const kb = Math.round(fs.statSync(OUT).size / 1024);
console.log(`Skrev ${path.relative(ROOT, OUT)}: ${bydelUt.length} bydelsområder, ${postUt.length} postnummer, ${kb} KB`);
if (utelatt.length) console.log(`Utelatt (ingen del på land): ${utelatt.join(', ')}`);
for (const b of bydelUt) console.log(`  ${b.nr} ${b.navn}: ${postUt.filter(p => p.bydel === b.nr).length} postnummer`);
