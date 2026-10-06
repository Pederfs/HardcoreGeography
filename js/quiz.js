// Runde-motoren: spørsmålskø, liv, perfekt-flagg og bom som kommer tilbake.
// Ingen DOM her, så den kan testes med Node.
window.HG = window.HG || {};

HG.stokk = function stokk(liste, rng = Math.random) {
  const a = liste.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

HG.Runde = class Runde {
  // sporsmal: liste av objekter med minst { id }.
  constructor(sporsmal, { liv = 3, rng = Math.random } = {}) {
    this.ko = sporsmal.slice();
    this.totalt = sporsmal.length;
    this.liv = liv;
    this.startLiv = liv;
    this.rng = rng;
    this.feil = 0;
    this.riktige = 0;
    this.streak = 0;
    this.lengste = 0;
  }

  get naa() { return this.ko[0]; }
  get igjen() { return this.ko.length; }
  get tapt() { return this.liv === 0; }
  get ferdig() { return this.tapt || this.ko.length === 0; }
  get perfekt() { return this.ko.length === 0 && this.feil === 0; }

  // Bare første klikk teller. Returnerer { riktig, maal }.
  svar(id) {
    if (this.ferdig) throw new Error('Runden er ferdig');
    const maal = this.ko.shift();
    const riktig = id === maal.id;
    if (riktig) {
      this.riktige++;
      this.streak++;
      this.lengste = Math.max(this.lengste, this.streak);
    } else {
      this.feil++;
      this.liv--;
      this.streak = 0;
      if (this.liv > 0) {
        // Bommet spørsmål kommer igjen 3–5 spørsmål senere.
        const pos = Math.min(this.ko.length, 3 + Math.floor(this.rng() * 3));
        this.ko.splice(pos, 0, maal);
      }
    }
    return { riktig, maal };
  }
};
