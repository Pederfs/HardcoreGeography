// Satellittbilder bak kartet: Sentinel-2 cloudless fra EOX (CC BY-NC-SA 4.0).
//
// Flisene finnes bare i Web Mercator, mens kartet er i UTM 33. Hver flis tegnes
// derfor på et lerret (canvas) delt i 8×8 småbiter, og hver bit plasseres for
// seg. Da blir feilen under en halv piksel, også når du ser et helt fylke.
window.HG = window.HG || {};

HG.Satellitt = class Satellitt {
  static URL = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg';
  static KREDITT = 'Satellittbilde: Sentinel-2 cloudless – s2maps.eu av EOX IT Services GmbH '
    + '(inneholder modifiserte Copernicus Sentinel-data 2024), CC BY-NC-SA 4.0';
  static MAKS_Z = 16;
  static MAKS_FLISER = 120;
  static RUTER = 8;          // småbiter per flis i hver retning
  static MARG = 0.25;        // lerretet går 25 % utenfor rammen på hver side (for zoom ut og panorering)
  static HUSK = 400;         // antall fliser som holdes i minnet

  constructor(lerret) {
    this.lerret = lerret;
    this.ctx = lerret.getContext('2d');
    this.bilder = new Map(); // 'z/x/y' -> Image
  }

  // vis: { cx, cy, s } i kartkoordinater. W, H: rammen i CSS-piksler.
  oppdater(vis, W, H) {
    const P = HG.projeksjon;
    const m = Satellitt.MARG;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const bredde = Math.round(W * (1 + 2 * m) * dpr), hoyde = Math.round(H * (1 + 2 * m) * dpr);
    if (this.lerret.width !== bredde || this.lerret.height !== hoyde) {
      this.lerret.width = bredde;
      this.lerret.height = hoyde;
    }
    // Lerretets øvre venstre hjørne i kartkoordinater, og kartenheter -> lerretspiksler.
    this.visning = {
      ox: vis.cx - (W / 2 + W * m) * vis.s,
      oy: vis.cy - (H / 2 + H * m) * vis.s,
      k: dpr / vis.s,
    };

    // Lengde/breddegrad for et rutenett over området lerretet dekker.
    const punkter = [];
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
      punkter.push(P.fraKart(this.visning.ox + bredde / this.visning.k * i / 4,
        this.visning.oy + hoyde / this.visning.k * j / 4));
    }
    const midtBredde = P.fraKart(vis.cx, vis.cy)[1];

    // Zoomnivå der én flispiksel er omtrent én skjermpiksel.
    const meterPerPiksel = vis.s * P.meter / dpr;
    let z = Math.round(Math.log2(156543.034 * Math.cos(midtBredde * Math.PI / 180) / meterPerPiksel));
    z = Math.max(3, Math.min(Satellitt.MAKS_Z, z));
    let omrade;
    for (;; z--) {
      omrade = this.flisomrade(punkter, z);
      if (omrade.antall <= Satellitt.MAKS_FLISER || z <= 3) break;
    }

    this.fliser = [];
    for (let x = omrade.x0; x <= omrade.x1; x++) {
      for (let y = omrade.y0; y <= omrade.y1; y++) {
        this.fliser.push([z, x, y]);
        this.hent(z, x, y);
      }
    }
    this.ryddMinne();
    this.tegn();
  }

  flisomrade(punkter, z) {
    const n = 2 ** z;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [lon, lat] of punkter) {
      const x = Math.floor((lon + 180) / 360 * n);
      const r = lat * Math.PI / 180;
      const y = Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(n - 1, x1); y1 = Math.min(n - 1, y1);
    return { x0, x1, y0, y1, antall: (x1 - x0 + 1) * (y1 - y0 + 1) };
  }

  hent(z, x, y) {
    const nokkel = `${z}/${x}/${y}`;
    if (this.bilder.has(nokkel)) {
      const b = this.bilder.get(nokkel);
      this.bilder.delete(nokkel); // flytt bakerst: sist brukt
      this.bilder.set(nokkel, b);
      return;
    }
    const bilde = new Image();
    bilde.crossOrigin = 'anonymous';
    bilde.onload = () => this.planlegg();
    bilde.src = Satellitt.URL.replace('{z}', z).replace('{x}', x).replace('{y}', y);
    this.bilder.set(nokkel, bilde);
  }

  ryddMinne() {
    while (this.bilder.size > Satellitt.HUSK) {
      this.bilder.delete(this.bilder.keys().next().value);
    }
  }

  // Tegner på nytt neste bilde når fliser blir lastet (flere samles til én tegning).
  planlegg() {
    if (this.venter) return;
    this.venter = requestAnimationFrame(() => { this.venter = 0; this.tegn(); });
  }

  tegn() {
    if (!this.visning || !this.fliser) return;
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.lerret.width, this.lerret.height);
    ctx.imageSmoothingQuality = 'high';
    for (const [z, x, y] of this.fliser) {
      const bilde = this.bilder.get(`${z}/${x}/${y}`);
      if (bilde?.complete && bilde.naturalWidth) {
        this.tegnFlis(bilde, z, x, y, 0, 0, 256);
        continue;
      }
      // Ikke lastet ennå: bruk en grovere flis som dekker samme område, hvis vi har den.
      for (let d = 1; d <= 6 && z - d >= 0; d++) {
        const forelder = this.bilder.get(`${z - d}/${x >> d}/${y >> d}`);
        if (forelder?.complete && forelder.naturalWidth) {
          const del = 256 >> d;
          this.tegnFlis(forelder, z, x, y, (x - ((x >> d) << d)) * del, (y - ((y >> d) << d)) * del, del);
          break;
        }
      }
    }
  }

  // Tegner flisen (z, x, y) med bildeutsnittet (sx, sy, str) fra `bilde`, delt i småbiter.
  tegnFlis(bilde, z, x, y, sx, sy, str) {
    const P = HG.projeksjon;
    const { ox, oy, k } = this.visning;
    const g = Satellitt.RUTER, n = 2 ** z;
    // Rutepunktene i lerretspiksler.
    const pkt = [];
    for (let j = 0; j <= g; j++) {
      const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + j / g) / n))) * 180 / Math.PI;
      for (let i = 0; i <= g; i++) {
        const lon = (x + i / g) / n * 360 - 180;
        const [kx, ky] = P.tilKart(lon, lat);
        pkt.push([(kx - ox) * k, (ky - oy) * k]);
      }
    }
    // Hver bit tegnes litt større (e) så den overlapper naboen og det ikke blir
    // sømmer. Utsnittet fra bildet holdes innenfor bildet (ved flisens kant
    // strekkes biten i stedet bitte lite).
    const del = str / g, e = 1;
    const B = bilde.naturalWidth;
    for (let j = 0; j < g; j++) {
      for (let i = 0; i < g; i++) {
        const D0 = pkt[j * (g + 1) + i], D1 = pkt[j * (g + 1) + i + 1], D2 = pkt[(j + 1) * (g + 1) + i];
        this.ctx.setTransform(
          (D1[0] - D0[0]) / del, (D1[1] - D0[1]) / del,
          (D2[0] - D0[0]) / del, (D2[1] - D0[1]) / del,
          D0[0], D0[1]);
        const u0 = Math.max(0, sx + i * del - e), v0 = Math.max(0, sy + j * del - e);
        const u1 = Math.min(B, sx + (i + 1) * del + e), v1 = Math.min(B, sy + (j + 1) * del + e);
        this.ctx.drawImage(bilde, u0, v0, u1 - u0, v1 - v0, -e, -e, del + 2 * e, del + 2 * e);
      }
    }
  }

  tom() {
    this.fliser = null;
    this.visning = null;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.lerret.width, this.lerret.height);
  }
};
