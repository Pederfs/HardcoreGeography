// Nivåene: hva som spørres om, hva kartet viser, og hva som låser opp hva.
window.HG = window.HG || {};

HG.nivaer = (() => {
  const N = window.NORGE;
  const O = window.OSLO;
  const NIVA5_ANTALL = 50;
  const OSLO = '03';

  // Id-er: 'f46' fylke, '4621' kommune, 'b030105' bydel, 'p0274' postnummer.
  const fylker = N.fylker.map(f => ({ id: 'f' + f.nr, nr: f.nr, navn: f.navn, fullt: f.fullt, fylke: f.nr }));
  const kommuner = N.kommuner.map(k => ({ id: k.nr, nr: k.nr, navn: k.navn, fullt: k.fullt, fylke: k.fylke }));
  const bydeler = O.bydeler.filter(b => b.ekte).map(b => ({ id: 'b' + b.nr, nr: b.nr, navn: b.navn, fullt: b.navn, fylke: OSLO }));
  const postnummer = O.postnummer.map(p => ({ id: 'p' + p.nr, nr: p.nr, navn: p.nr, fullt: '', fylke: OSLO, bydel: p.bydel }));
  const fylkeNavn = Object.fromEntries(N.fylker.map(f => [f.nr, f.navn]));
  const bydelNavn = Object.fromEntries(O.bydeler.map(b => [b.nr, b.navn]));

  // Postnummer-bonusen deles i grupper etter bydel (Sentrum og Marka får egne grupper).
  const postGrupper = O.bydeler
    .map(b => ({ nr: b.nr, navn: b.navn, antall: postnummer.filter(p => p.bydel === b.nr).length }))
    .filter(g => g.antall > 0);

  const type = id => (/^\d/.test(id) ? 'k' : id[0]);

  const TITLER = {
    1: 'Fylker – navn',
    2: 'Fylker – nummer',
    3: 'Kommuner',
    5: 'Hele Norge',
    6: 'Hardcore',
  };

  // Alle nivåer med bare tall er fjernet, unntatt postnummer-bonusen:
  // fylkesnummer (gamle 2) og kommunenummer/bydelsnummer (gamle 4). Id-ene inni
  // koden er beholdt så lagret fremgang virker, men spilleren ser nivåene
  // nummerert 1–4 uten hull.
  const VIST = { 1: 1, 3: 2, 5: 3, 6: 4 };

  // Et fylke er ferdig (og mestret) når kommunenavnene er bestått (bydeler for Oslo).
  const sisteIFylket = nr => '3:' + nr;
  const fylkeFerdig = (nr, t) => !!t.bestatt[sisteIFylket(nr)];

  function del(id) {
    const [niva, ledd] = String(id).split(':');
    if (niva === 'P') return { niva, fylke: OSLO, gruppe: ledd };
    return { niva: Number(niva), fylke: ledd };
  }

  function tittel(id) {
    const { niva, fylke, gruppe } = del(id);
    if (niva === 'P') return 'Bonus: Postnummer · ' + (gruppe === 'alle' ? 'Hele Oslo' : bydelNavn[gruppe]);
    if (fylke === OSLO && niva === 3) return `Nivå ${VIST[3]}: Bydeler · Oslo`;
    return `Nivå ${VIST[niva]}: ${TITLER[niva]}` + (fylke ? ` · ${fylkeNavn[fylke]}` : '');
  }

  function erApen(id, t) {
    const { niva, fylke } = del(id);
    switch (niva) {
      case 1: return true;
      case 3: return !!t.bestatt['1'];
      case 5: return N.fylker.every(f => fylkeFerdig(f.nr, t));
      case 6: return !!t.bestatt['5'];
      case 'P': return fylkeFerdig(OSLO, t);
    }
    return false;
  }

  // Vektet trekk uten tilbakelegging: tidligere bom trekkes oftere.
  function vektetUtvalg(liste, antall, t) {
    const pool = liste.map(s => ({ s, v: 1 + 3 * (t.bom[s.id] || 0) }));
    const ut = [];
    while (ut.length < antall && pool.length) {
      let r = Math.random() * pool.reduce((sum, p) => sum + p.v, 0);
      let i = 0;
      while ((r -= pool[i].v) > 0) i++;
      ut.push(pool.splice(i, 1)[0].s);
    }
    return ut;
  }

  const bokser = Object.fromEntries([
    ...O.bydeler.map(b => ['b' + b.nr, b.boks]),
    ...O.postnummer.map(p => ['p' + p.nr, p.boks]),
  ]);

  // Rammen rundt alle områdene i en runde, brukt som startvisning.
  function samletBoks(ider) {
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const id of ider) {
      const k = bokser[id];
      b[0] = Math.min(b[0], k[0]); b[1] = Math.min(b[1], k[1]);
      b[2] = Math.max(b[2], k[2]); b[3] = Math.max(b[3], k[3]);
    }
    return b;
  }

  const visNavn = s => ({ liten: 'Finn', stor: s.navn });
  const visNr = s => ({ liten: 'Postnummer', stor: s.nr });
  // Etiketter viser navn (hele det offisielle navnet), postnummer bare nummeret.
  const etikett = s => (type(s.id) === 'p' ? s.nr : s.fullt || s.navn);

  // Lager alt en runde trenger for nivå-id-en.
  // lag: hvilken type id som kan klikkes ('f', 'k', 'b' eller 'p').
  function lag(id, t) {
    const { niva, fylke, gruppe } = del(id);
    // Fjernede nivåer: fylkesnummer (2) og bydelsnummer for Oslo (4:03).
    if (niva === 2 || niva === 4) throw new Error('Nivået finnes ikke lenger: ' + id);
    // Satellittbilde under kartet fra nivå 3 og i bonusen.
    const satellitt = niva === 'P' || niva >= 3;
    const felles = { id, niva, fylke, tittel: tittel(id), etikett, liv: 3, visEtiketter: false, satellitt };

    if (niva === 'P') {
      const sporsmal = postnummer.filter(p => gruppe === 'alle' || p.bydel === gruppe);
      const ider = new Set(sporsmal.map(p => p.id));
      const boks = gruppe === 'alle' ? N.kommuner.find(k => k.nr === '0301').boks : samletBoks(ider);
      return { ...felles, lag: 'p', sporsmal: HG.stokk(sporsmal), tekst: visNr, visEtiketter: true,
        kart: { modus: 'post', aktive: ider, fylke: OSLO, boks } };
    }
    if (niva === 3 && fylke === OSLO) {
      // Startvisningen er bydelene, ikke hele Oslo med Marka.
      const aktive = new Set(bydeler.map(b => b.id));
      const kart = { modus: 'bydel', aktive, fylke, boks: samletBoks(aktive) };
      return { ...felles, lag: 'b', sporsmal: HG.stokk(bydeler), tekst: visNavn, kart };
    }

    const iFylket = kommuner.filter(k => k.fylke === fylke);
    const fylkeKart = { modus: 'fylke', aktive: new Set(iFylket.map(k => k.id)), fylke };
    const ingen = new Set();
    switch (niva) {
      case 1: return { ...felles, lag: 'f', sporsmal: HG.stokk(fylker), tekst: visNavn, kart: { modus: 'fylker', aktive: ingen } };
      case 3: return { ...felles, lag: 'k', sporsmal: HG.stokk(iFylket), tekst: visNavn, kart: fylkeKart };
      // Nivå 5–6 går i to steg: velg fylket, så kommunen (se main.js).
      case 5: return { ...felles, lag: 'k', totrinn: true, sporsmal: vektetUtvalg(kommuner, NIVA5_ANTALL, t),
        tekst: visNavn, kart: { modus: 'fylker', aktive: ingen } };
      case 6: return { ...felles, lag: 'k', totrinn: true, sporsmal: HG.stokk(kommuner),
        tekst: visNavn, kart: { modus: 'fylker', aktive: ingen }, liv: 1 };
    }
    throw new Error('Ukjent nivå ' + id);
  }

  return { lag, erApen, tittel, del, type, fylkeFerdig, sisteIFylket, VIST, fylker, kommuner, bydeler, postnummer, postGrupper, fylkeNavn, NIVA5_ANTALL, OSLO };
})();
