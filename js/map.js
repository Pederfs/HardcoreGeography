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

    lag('path', { class: 'omriss', d: N.omriss }, svg);
    this.kommuneLag = lag('g', { class: 'kommuner' }, svg);
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
    for (const f of N.fylker) {
      const id = 'f' + f.nr;
      this.el[id] = lag('path', { d: f.d, 'data-id': id }, this.fylkeLag);
      this.boks[id] = f.boks;
      this.punkt[id] = f.punkt;
    }

    this.lyttEtterPekere();
    new ResizeObserver(() => (this.fri ? this.tegn() : this.tilpass(this.malBoks))).observe(svg);
  }

  // modus: 'fylker' (nivå 1–2), 'fylke' (nivå 3–4, med fylke), 'skjult' (nivå 5–6).
  // fri: spilleren kan zoome og panorere selv.
  oppsett({ modus, fylke = null, fri = true }) {
    this.fri = fri;
    this.svg.setAttribute('class', 'kart modus-' + modus + (fri ? ' fri' : ''));
    for (const p of this.kommuneLag.children) {
      p.classList.toggle('aktiv', modus === 'skjult' || p.dataset.fylke === fylke);
    }
    for (const p of this.fylkeLag.children) {
      p.classList.toggle('valgt', p.dataset.id === 'f' + fylke);
    }
    this.fjernEtiketter();
    this.fjernMarkeringer();
    this.startBoks = modus === 'fylke' ? this.boks['f' + fylke] : [0, 0, this.N.bredde, this.N.hoyde];
    this.tilpass(this.startBoks);
  }

  paKlikk(fn) { this.klikkFn = fn; }

  // --- Visning ---

  passendeS([x0, y0, x1, y1], marg) {
    const { width: W, height: H } = this.svg.getBoundingClientRect();
    return Math.max((x1 - x0) / W, (y1 - y0) / H) * (1 + 2 * marg);
  }

  tilpass(boks, marg = 0.06) {
    this.malBoks = boks;
    const { width: W, height: H } = this.svg.getBoundingClientRect();
    if (!W || !H) return;
    const [x0, y0, x1, y1] = boks;
    this.vis = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, s: this.passendeS(boks, marg) };
    this.tegn();
  }

  tegn() {
    const { width: W, height: H } = this.svg.getBoundingClientRect();
    const { cx, cy, s } = this.vis;
    this.svg.setAttribute('viewBox', `${cx - W * s / 2} ${cy - H * s / 2} ${W * s} ${H * s}`);
    // Etiketter holder fast skjermstørrelse.
    this.etikettLag.style.fontSize = 14 * s + 'px';
    this.etikettLag.style.strokeWidth = 4 * s + 'px';
  }

  synligBoks() {
    const { width: W, height: H } = this.svg.getBoundingClientRect();
    const { cx, cy, s } = this.vis;
    return [cx - W * s / 2, cy - H * s / 2, cx + W * s / 2, cy + H * s / 2];
  }

  zoom(faktor, px, py) {
    const r = this.svg.getBoundingClientRect();
    if (px === undefined) { px = r.width / 2; py = r.height / 2; }
    const { cx, cy, s } = this.vis;
    // Lengst ut: startvisningen. Lengst inn: ca. 10 m per skjermpiksel.
    const maks = this.passendeS(this.startBoks, 0.06);
    const ny = Math.min(maks, Math.max(0.1, s / faktor));
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
        const r = svg.getBoundingClientRect();
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
      const r = svg.getBoundingClientRect();
      this.zoom(Math.exp(-dy * (e.ctrlKey ? 0.015 : 0.004)), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });

    // Safari på Mac sender klyping som gesture-hendelser.
    let skala = 1;
    svg.addEventListener('gesturestart', e => { e.preventDefault(); skala = 1; });
    svg.addEventListener('gesturechange', e => {
      e.preventDefault();
      if (!this.fri) return;
      const r = svg.getBoundingClientRect();
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
      if (tilbake) { this.vis = tilbake; this.tegn(); }
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
