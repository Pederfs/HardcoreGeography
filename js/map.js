// Kartet: SVG-tegning, zoom/panorering, klikk, blink og etiketter.
window.HG = window.HG || {};

HG.Kart = class Kart {
  constructor(svg) {
    const N = window.NORGE;
    this.svg = svg;
    this.N = N;
    this.vis = { cx: N.bredde / 2, cy: N.hoyde / 2, s: 1 };
    this.malBoks = [0, 0, N.bredde, N.hoyde];
    this.startBoks = this.malBoks;
    this.fri = true;
    this.klikkFn = () => {};

    const ns = 'http://www.w3.org/2000/svg';
    const lag = (tag, attr, forelder) => {
      const el = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attr)) el.setAttribute(k, v);
      forelder.appendChild(el);
      return el;
    };
    this.lag = lag;

    const O = window.OSLO;
    lag('path', { d: O.land }, lag('clipPath', { id: 'oslo-klipp' }, lag('defs', {}, svg)));
    lag('path', { class: 'omriss', d: N.omriss }, svg);
    this.kommuneLag = lag('g', { class: 'kommuner' }, svg);
    // Bydeler og postnummer går ut i fjorden, så de klippes etter Oslos kystlinje.
    const oslo = lag('g', { class: 'oslo', 'clip-path': 'url(#oslo-klipp)' }, svg);
    this.postLag = lag('g', { class: 'postnummer' }, oslo);
    this.bydelLag = lag('g', { class: 'bydeler' }, oslo);
    this.fylkeLag = lag('g', { class: 'fylker' }, svg);
    this.etikettLag = lag('g', { class: 'etiketter' }, svg);

    this.el = {};
    this.boks = {};
    this.punkt = {};
    for (const k of N.kommuner) {
      this.el[k.nr] = lag('path', { d: k.d, 'data-id': k.nr, 'data-fylke': k.fylke }, this.kommuneLag);
      this.boks[k.nr] = k.boks;
      this.punkt[k.nr] = k.punkt;
    }
    const leggTil = (id, o, forelder) => {
      this.el[id] = lag('path', { d: o.d, 'data-id': id }, forelder);
      this.boks[id] = o.boks;
      this.punkt[id] = o.punkt;
    };
    for (const f of N.fylker) leggTil('f' + f.nr, f, this.fylkeLag);
    for (const b of O.bydeler) leggTil('b' + b.nr, b, this.bydelLag);
    for (const p of O.postnummer) leggTil('p' + p.nr, p, this.postLag);

    this.flate = svg.parentNode;
    this.lyttEtterPekere();
    let str = '';
    new ResizeObserver(() => {
      const { width, height } = this.ramme();
      if (width + 'x' + height === str) return; // bare når størrelsen faktisk endres
      str = width + 'x' + height;
      if (this.fri) this.fest(); else this.tilpass(this.malBoks);
    }).observe(this.flate);
  }

  // modus: 'fylker' (nivå 1–2), 'fylke' (nivå 3–4), 'bydel' (Oslo i nivå 3–4),
  // 'post' (postnummer-bonus) eller 'norge' (nivå 5–6, alle kommuner).
  // aktive: id-ene som kan klikkes. fylke: fylket som utheves. boks: startvisningen.
  // fri: spilleren kan zoome og panorere selv.
  oppsett({ modus, aktive, fylke = null, boks = null, fri = true }) {
    this.fri = fri;
    this.svg.setAttribute('class', 'kart modus-' + modus + (fri ? ' fri' : ''));
    for (const lag of [this.kommuneLag, this.bydelLag, this.postLag]) {
      for (const p of lag.children) p.classList.toggle('aktiv', aktive.has(p.dataset.id));
    }
    for (const p of this.fylkeLag.children) {
      p.classList.toggle('valgt', p.dataset.id === 'f' + fylke);
    }
    this.fjernEtiketter();
    this.fjernMarkeringer();
    this.startBoks = boks || (fylke ? this.boks['f' + fylke] : [0, 0, this.N.bredde, this.N.hoyde]);
    this.tilpass(this.startBoks);
  }

  paKlikk(fn) { this.klikkFn = fn; }

  // --- Visning ---

  // Kartflaten rundt kartet. Den skaleres aldri, så mål tas herfra og ikke fra
  // selve kartet, som kan være midlertidig skalert under zoom (se tegn).
  ramme() { return this.flate.getBoundingClientRect(); }

  passendeS([x0, y0, x1, y1], marg) {
    const { width: W, height: H } = this.ramme();
    return Math.max((x1 - x0) / W, (y1 - y0) / H) * (1 + 2 * marg);
  }

  tilpass(boks, marg = 0.06) {
    this.malBoks = boks;
    const { width: W, height: H } = this.ramme();
    if (!W || !H) return;
    const [x0, y0, x1, y1] = boks;
    this.vis = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, s: this.passendeS(boks, marg) };
    this.fest();
  }

  // Under zoom og panorering tegnes ikke kartet på nytt. Det ferdigtegnede
  // bildet flyttes og skaleres med en CSS-transform, som er nesten gratis.
  // Når bevegelsen har stoppet en liten stund, tegnes kartet skarpt (fest).
  tegn() {
    if (this.bildeVenter) return;
    this.bildeVenter = requestAnimationFrame(() => {
      this.bildeVenter = 0;
      const t = this.tegnet, v = this.vis;
      if (!t) return this.fest();
      const { width: W, height: H } = this.ramme();
      const k = t.s / v.s;
      // Blir bildet for uskarpt (over 2x forstørret) eller for lite, tegnes kartet
      // skarpt med en gang, men høyst omtrent hvert 0,4 sekund.
      if ((k > 2 || k < 0.5) && performance.now() - this.sistFestet > 400) return this.fest();
      const tx = W / 2 * (1 - k) + (t.cx - v.cx) / v.s;
      const ty = H / 2 * (1 - k) + (t.cy - v.cy) / v.s;
      this.svg.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`;
      clearTimeout(this.festTid);
      this.festTid = setTimeout(() => this.fest(), 150);
    });
  }

  // Tegner kartet skarpt for visningen i this.vis.
  fest() {
    clearTimeout(this.festTid);
    cancelAnimationFrame(this.bildeVenter);
    this.bildeVenter = 0;
    const { width: W, height: H } = this.ramme();
    const { cx, cy, s } = this.vis;
    this.svg.setAttribute('viewBox', `${cx - W * s / 2} ${cy - H * s / 2} ${W * s} ${H * s}`);
    this.svg.style.transform = '';
    this.tegnet = { ...this.vis };
    this.sistFestet = performance.now();
    // Etiketter holder fast skjermstørrelse.
    this.etikettLag.style.fontSize = 14 * s + 'px';
    this.etikettLag.style.strokeWidth = 4 * s + 'px';
  }

  synligBoks() {
    const { width: W, height: H } = this.ramme();
    const { cx, cy, s } = this.vis;
    return [cx - W * s / 2, cy - H * s / 2, cx + W * s / 2, cy + H * s / 2];
  }

  zoom(faktor, px, py) {
    const r = this.ramme();
    if (px === undefined) { px = r.width / 2; py = r.height / 2; }
    const { cx, cy, s } = this.vis;
    // Lengst ut: startvisningen. Lengst inn: ca. 2 m per skjermpiksel (for små postnummer).
    const maks = this.passendeS(this.startBoks, 0.06);
    const ny = Math.min(maks, Math.max(0.02, s / faktor));
    // Punktet under markøren blir liggende i ro.
    const mx = cx + (px - r.width / 2) * s, my = cy + (py - r.height / 2) * s;
    this.vis = { cx: mx - (px - r.width / 2) * ny, cy: my - (py - r.height / 2) * ny, s: ny };
    this.begrens();
    this.tegn();
  }

  panorer(dx, dy) {
    this.vis.cx -= dx * this.vis.s;
    this.vis.cy -= dy * this.vis.s;
    this.begrens();
    this.tegn();
  }

  begrens() {
    const v = this.vis, [x0, y0, x1, y1] = this.startBoks;
    v.cx = Math.max(x0, Math.min(x1, v.cx));
    v.cy = Math.max(y0, Math.min(y1, v.cy));
  }

  visHele() { this.tilpass(this.startBoks); }

  // --- Pekere: klikk, dra, klype, rulle ---

  lyttEtterPekere() {
    const svg = this.svg;
    const pekere = new Map();
    let dratt = false, start = null, klypeAvstand = 0;

    svg.addEventListener('pointerdown', e => {
      pekere.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pekere.size === 1) { dratt = false; start = { x: e.clientX, y: e.clientY }; }
      if (pekere.size === 2) { dratt = true; klypeAvstand = avstand(); }
      svg.setPointerCapture(e.pointerId);
    });

    svg.addEventListener('pointermove', e => {
      const forrige = pekere.get(e.pointerId);
      if (!forrige) return;
      const naa = { x: e.clientX, y: e.clientY };
      pekere.set(e.pointerId, naa);
      if (!this.fri) return;
      if (pekere.size === 1) {
        if (!dratt && Math.hypot(naa.x - start.x, naa.y - start.y) > 6) dratt = true;
        if (dratt) this.panorer(naa.x - forrige.x, naa.y - forrige.y);
      } else if (pekere.size === 2) {
        const d = avstand();
        const r = this.ramme();
        const [a, b] = [...pekere.values()];
        if (klypeAvstand) this.zoom(d / klypeAvstand, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
        klypeAvstand = d;
      }
    });

    const slutt = e => {
      if (!pekere.has(e.pointerId)) return;
      pekere.delete(e.pointerId);
      if (e.type === 'pointerup' && pekere.size === 0 && !dratt) {
        const mal = document.elementFromPoint(e.clientX, e.clientY);
        const id = mal && mal.closest && mal.closest('[data-id]');
        if (id && svg.contains(id)) this.klikkFn(id.dataset.id);
      }
      if (pekere.size < 2) klypeAvstand = 0;
    };
    svg.addEventListener('pointerup', slutt);
    svg.addEventListener('pointercancel', slutt);

    // Musehjul og styreflate. Klyping på styreflaten kommer som wheel med ctrlKey
    // og små verdier, så den trenger høyere følsomhet.
    svg.addEventListener('wheel', e => {
      if (!this.fri) return;
      e.preventDefault();
      const enhet = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const dy = Math.max(-100, Math.min(100, e.deltaY * enhet));
      const r = this.ramme();
      this.zoom(Math.exp(-dy * (e.ctrlKey ? 0.015 : 0.004)), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });

    // Safari på Mac sender klyping som gesture-hendelser.
    let skala = 1;
    svg.addEventListener('gesturestart', e => { e.preventDefault(); skala = 1; });
    svg.addEventListener('gesturechange', e => {
      e.preventDefault();
      if (!this.fri) return;
      const r = this.ramme();
      this.zoom(e.scale / skala, e.clientX - r.left, e.clientY - r.top);
      skala = e.scale;
    });

    function avstand() {
      const [a, b] = [...pekere.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    }
  }

  // --- Tilbakemelding ---

  markerRiktig(id) { this.puls(id, 'riktig', 450); }

  markerFeil(id) { this.puls(id, 'feil', 1000); }

  // Klart i denne runden: blir grønt og kan ikke klikkes igjen.
  markerFerdig(id) { this.el[id]?.classList.add('ferdig'); }

  // Viser riktig sted i ms millisekunder. Er det utenfor skjermen, zoomes det
  // midlertidig ut så både det du ser på og riktig sted er synlig.
  blink(id, tekst, ms = 1000) {
    let tilbake = null;
    if (this.fri) {
      const [a0, b0, a1, b1] = this.synligBoks();
      const [x0, y0, x1, y1] = this.boks[id];
      if (x0 < a0 || y0 < b0 || x1 > a1 || y1 > b1) {
        tilbake = { ...this.vis };
        this.tilpass([Math.min(a0, x0), Math.min(b0, y0), Math.max(a1, x1), Math.max(b1, y1)], 0.1);
      }
    }
    this.puls(id, 'blink', ms);
    const etikett = this.visEtikett(id, tekst, 'midlertidig');
    return new Promise(ferdig => setTimeout(() => {
      etikett.remove();
      if (tilbake) { this.vis = tilbake; this.fest(); }
      ferdig();
    }, ms));
  }

  puls(id, klasse, ms) {
    const el = this.el[id];
    if (!el) return;
    el.classList.add(klasse);
    el.parentNode.appendChild(el); // øverst, så kanten synes
    setTimeout(() => el.classList.remove(klasse), ms);
  }

  visEtikett(id, tekst, klasse = '') {
    const [x, y] = this.punkt[id];
    const t = this.lag('text', { x, y, class: klasse }, this.etikettLag);
    t.textContent = tekst;
    return t;
  }

  fjernEtiketter() { this.etikettLag.replaceChildren(); }

  fjernMarkeringer() {
    for (const el of Object.values(this.el)) el.classList.remove('riktig', 'feil', 'blink', 'ferdig');
  }
};
