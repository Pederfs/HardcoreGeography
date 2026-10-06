// Nivåene: hva som spørres om, hva kartet viser, og hva som låser opp hva.
window.HG = window.HG || {};

HG.nivaer = (() => {
  const N = window.NORGE;
  const NIVA5_ANTALL = 50;

  const fylker = N.fylker.map(f => ({ id: 'f' + f.nr, nr: f.nr, navn: f.navn, fullt: f.fullt, fylke: f.nr }));
  const kommuner = N.kommuner.map(k => ({ id: k.nr, nr: k.nr, navn: k.navn, fullt: k.fullt, fylke: k.fylke }));
  const fylkeNavn = Object.fromEntries(N.fylker.map(f => [f.nr, f.navn]));

  const TITLER = {
    1: 'Fylker – navn',
    2: 'Fylker – nummer',
    3: 'Kommuner – navn',
    4: 'Kommunenummer',
    5: 'Hele Norge',
    6: 'Hardcore',
  };

  function del(id) {
    const [niva, fylke] = String(id).split(':');
    return { niva: Number(niva), fylke };
  }

  function tittel(id) {
    const { niva, fylke } = del(id);
    return `Nivå ${niva}: ${TITLER[niva]}` + (fylke ? ` · ${fylkeNavn[fylke]}` : '');
  }

  function erApen(id, t) {
    const { niva, fylke } = del(id);
    switch (niva) {
      case 1: return true;
      case 2: return !!t.bestatt['1'];
      case 3: return !!t.bestatt['2'];
      case 4: return !!t.bestatt['3:' + fylke];
      case 5: return N.fylker.every(f => t.bestatt['4:' + f.nr]);
      case 6: return !!t.bestatt['5'];
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

  const visNavn = s => ({ liten: 'Finn', stor: s.navn });
  const visNr = s => ({ liten: s.id.startsWith('f') ? 'Fylkesnummer' : 'Kommunenummer', stor: s.nr });
  const etikett = s => `${s.nr} ${s.fullt}`;

  // Lager alt en runde trenger for nivå-id-en.
  function lag(id, t) {
    const { niva, fylke } = del(id);
    const iFylket = kommuner.filter(k => k.fylke === fylke);
    const felles = { id, niva, fylke, tittel: tittel(id), etikett, liv: 3, visEtiketter: false };
    switch (niva) {
      case 1: return { ...felles, sporsmal: HG.stokk(fylker), tekst: visNavn, kart: { modus: 'fylker' } };
      case 2: return { ...felles, sporsmal: HG.stokk(fylker), tekst: visNr, kart: { modus: 'fylker' } };
      case 3: return { ...felles, sporsmal: HG.stokk(iFylket), tekst: visNavn, kart: { modus: 'fylke', fylke } };
      case 4: return { ...felles, sporsmal: HG.stokk(iFylket), tekst: visNr, kart: { modus: 'fylke', fylke }, visEtiketter: true };
      case 5: return { ...felles, sporsmal: vektetUtvalg(kommuner, NIVA5_ANTALL, t), tekst: visNr, kart: { modus: 'skjult' } };
      case 6: return { ...felles, sporsmal: HG.stokk(kommuner), tekst: visNr, kart: { modus: 'skjult' }, liv: 1 };
    }
    throw new Error('Ukjent nivå ' + id);
  }

  return { lag, erApen, tittel, del, fylker, kommuner, fylkeNavn, NIVA5_ANTALL };
})();
