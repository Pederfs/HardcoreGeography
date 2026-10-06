// Felles geometrihjelpere for byggeskriptene.
//
// Et polygon er en liste av ringer (første er ytterringen), en ring er en liste av [x, y].

// --- Projeksjon: UTM sone 33 (EUREF89/GRS80), Snyders formler ---

const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996, lon0 = 15 * Math.PI / 180;
const e2 = f * (2 - f), e4 = e2 * e2, e6 = e4 * e2, ep2 = e2 / (1 - e2);

export function utm33([lon, lat]) {
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

export function areal(ring) {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    s += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(s / 2);
}

// Partall/oddetall-regelen over alle ringene, så hull teller som utenfor.
export function inni([x, y], ringer) {
  let inne = false;
  for (const ring of ringer) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inne = !inne;
    }
  }
  return inne;
}

export function avstandTilKant([x, y], ringer) {
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

export function boks(polys) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of polys) for (const [x, y] of poly[0]) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}

// Punktet i det største polygonet som ligger lengst fra kanten (for etiketter).
// `tillatt` kan avvise punkter, f.eks. de som ligger i sjøen, og `ekstraKanter`
// er ringer (f.eks. kystlinjen) som etiketten også skal holde avstand til.
// Gir null hvis ingen punkter i rutenettet er tillatt.
export function etikettpunkt(polys, tillatt = null, ekstraKanter = []) {
  const kandidater = polys.slice().sort((a, b) => areal(b[0]) - areal(a[0]));
  for (const poly of tillatt ? kandidater : kandidater.slice(0, 1)) {
    const p = beste(poly, tillatt, ekstraKanter);
    if (p) return p;
  }
  return tillatt ? null : kandidater[0][0][0];
}

function beste(storst, tillatt, ekstraKanter) {
  const [x0, y0, x1, y1] = boks([storst]);
  let best = null, bestD = -1;
  const steg = 40;
  for (let i = 0; i <= steg; i++) {
    for (let j = 0; j <= steg; j++) {
      const p = [x0 + (x1 - x0) * i / steg, y0 + (y1 - y0) * j / steg];
      if (!inni(p, storst) || (tillatt && !tillatt(p))) continue;
      const d = Math.min(avstandTilKant(p, storst), avstandTilKant(p, ekstraKanter));
      if (d > bestD) { bestD = d; best = p; }
    }
  }
  return best;
}

// UTM-meter -> heltallige kartkoordinater, der én enhet er `meter` meter.
// Doble punkter etter avrunding fjernes, og ringer med under tre punkter faller bort.
export function tilKart(polys, { x0, y1, meter }) {
  const ut = [];
  for (const poly of polys) {
    const ringer = [];
    for (const [i, ring] of poly.entries()) {
      const r = [];
      for (const [x, y] of ring) {
        const p = [Math.round((x - x0) / meter), Math.round((y1 - y) / meter)];
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

// Kompakt SVG-sti med relative koordinater. Heltallene deles på `deler`,
// så finere enheter kan skrives i samme koordinatsystem som resten av kartet.
export function sti(polys, deler = 1) {
  let d = '';
  const tall = n => {
    const v = n / deler;
    return (v < 0 || d.endsWith('l') || d.endsWith('M') ? '' : ' ') + v;
  };
  for (const poly of polys) {
    for (const ring of poly) {
      d += 'M' + ring[0][0] / deler + tall(ring[0][1]) + 'l';
      for (let i = 1; i < ring.length; i++) {
        d += tall(ring[i][0] - ring[i - 1][0]);
        d += tall(ring[i][1] - ring[i - 1][1]);
      }
      d += 'z';
    }
  }
  return d;
}

export function sjekk(ok, melding) {
  if (!ok) throw new Error(`Kontroll feilet: ${melding}`);
}
