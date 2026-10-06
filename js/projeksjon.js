// Omregning mellom lengde/breddegrad og kartkoordinatene (UTM 33, EUREF89/GRS80),
// samme formler (Snyder) som byggeskriptene bruker. Brukes til satellittbildene.
window.HG = window.HG || {};

HG.projeksjon = (() => {
  const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996, lon0 = 15 * Math.PI / 180;
  const e2 = f * (2 - f), e4 = e2 * e2, e6 = e4 * e2, ep2 = e2 / (1 - e2);
  const grad = Math.PI / 180;

  function tilUtm(lon, lat) {
    const phi = lat * grad, lam = lon * grad;
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

  function fraUtm(x, y) {
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    const mu = (y / k0) / (a * (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256));
    const phi1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
      + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
      + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
      + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
    const sin = Math.sin(phi1), cos = Math.cos(phi1), tan = Math.tan(phi1);
    const C1 = ep2 * cos * cos, T1 = tan * tan;
    const N1 = a / Math.sqrt(1 - e2 * sin * sin);
    const R1 = a * (1 - e2) / (1 - e2 * sin * sin) ** 1.5;
    const D = (x - 500000) / (N1 * k0);
    const lat = phi1 - (N1 * tan / R1) * (D * D / 2
      - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24
      + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720);
    const lon = lon0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6
      + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120) / cos;
    return [lon / grad, lat / grad];
  }

  // Kartkoordinater: x = (øst - x0) / meter, y = (y1 - nord) / meter (se build-data.mjs).
  const { x0, y1, meter } = window.NORGE.utm;
  const tilKart = (lon, lat) => { const [x, y] = tilUtm(lon, lat); return [(x - x0) / meter, (y1 - y) / meter]; };
  const fraKart = (kx, ky) => fraUtm(x0 + kx * meter, y1 - ky * meter);

  return { tilUtm, fraUtm, tilKart, fraKart, meter };
})();
