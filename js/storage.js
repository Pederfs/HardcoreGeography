// Lagring av fremgang i nettleseren (localStorage).
window.HG = window.HG || {};

HG.lagring = (() => {
  const NOKKEL = 'hardcore-geografi-v1';

  function tom() {
    return {
      bestatt: {},   // nivå-id -> true, f.eks. '1', '3:46', '5'
      mestret: {},   // fylkesnr -> true når nivå 4 er bestått og ikke glemt
      bom: {},       // spørsmåls-id -> antall bom som ikke er rettet opp ennå
      rekord: 0,     // lengste streak i Hardcore
      hardcore: false,
      fritt: false,  // fritt valg: alle nivåer åpne, for å prøve dem
      satellitt: true, // satellittbilde under kartet i nivå 3–6 og bonusen
    };
  }

  function last() {
    try {
      const tekst = localStorage.getItem(NOKKEL);
      if (tekst) return Object.assign(tom(), JSON.parse(tekst));
    } catch (e) {
      console.warn('Kunne ikke lese fremgang', e);
    }
    return tom();
  }

  function lagre(tilstand) {
    try {
      localStorage.setItem(NOKKEL, JSON.stringify(tilstand));
    } catch (e) {
      console.warn('Kunne ikke lagre fremgang', e);
    }
  }

  function nullstill() {
    try { localStorage.removeItem(NOKKEL); } catch (e) { /* ignorer */ }
    return tom();
  }

  return { last, lagre, nullstill, tom };
})();
