// Skjermer og spillflyt: meny, runde, resultat.
(() => {
  const N = window.NORGE;
  const $ = s => document.querySelector(s);
  const nivaer = HG.nivaer;

  // Fritt valg låser opp alle nivåer, for å teste. Bryteren (og ?test i adressen)
  // virker bare når spillet kjører lokalt (localhost eller fil). På den delte
  // siden må nivåene låses opp ved å bestå dem.
  const lokalt = location.protocol === 'file:' || ['localhost', '127.0.0.1', ''].includes(location.hostname);
  const testIAdressen = lokalt && new URLSearchParams(location.search).has('test');
  const kanVelgeFritt = lokalt;
  const fritt = () => testIAdressen || (lokalt && !!t.fritt);

  let t = HG.lagring.last();
  let niva = null, runde = null, opptatt = false;
  // Nivå 5–6 går i to steg: 'fylke' (velg fylket) og så 'kommune'.
  let steg = null;

  const kart = new HG.Kart($('#kart'));

  // 'P:alle' står for hele postnummer-bonusen når vi melder hva som ble låst opp.
  const alleIder = () => ['1', '2',
    ...N.fylker.flatMap(f => ['3:' + f.nr, '4:' + f.nr]), '5', '6', 'P:alle'];
  const apen = id => fritt() || nivaer.erApen(id, t);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // --- Meny ---

  function status(id) {
    if (t.bestatt[id]) return '<span class="merke ok">✓ Bestått</span>';
    if (!apen(id)) return '<span class="merke laast">Låst</span>';
    return '<span class="merke">Åpen</span>';
  }

  function kort(id, beskrivelse, ekstra = '') {
    return `<button class="niva" data-start="${id}" ${apen(id) ? '' : 'disabled'}>
      <span class="niva-topp"><strong>${esc(nivaer.tittel(id))}</strong>${status(id)}</span>
      <span class="niva-tekst">${beskrivelse}</span>${ekstra}
    </button>`;
  }

  function fylkeRad(f) {
    const knapp = (niva, tekst) => {
      const id = niva + ':' + f.nr;
      const klasse = t.bestatt[id] ? 'ok' : '';
      return `<button class="liten-knapp ${klasse}" data-start="${id}" ${apen(id) ? '' : 'disabled'}
        title="${esc(nivaer.tittel(id))}">${t.bestatt[id] ? '✓ ' : ''}${tekst}</button>`;
    };
    const mestret = t.mestret[f.nr]
      ? '<span class="stjerne" title="Mestret">★</span>'
      : (t.bestatt['4:' + f.nr] ? '<span class="stjerne glemt" title="Mestret før, men glemt i nivå 5 eller 6">☆</span>' : '');
    const navn = f.nr === nivaer.OSLO ? `${esc(f.navn)} <small>(bydeler)</small>` : esc(f.navn);
    return `<li><span class="fylke-nr">${f.nr}</span><span class="fylke-navn">${navn}</span>
      ${knapp(3, 'Navn')}${knapp(4, 'Nummer')}<span class="mestret">${mestret}</span></li>`;
  }

  function visMeny() {
    runde = null;
    document.body.dataset.skjerm = 'meny';
    const antallMestret = N.fylker.filter(f => t.mestret[f.nr]).length;
    const rekord = `<span class="niva-tekst">Rekord: <strong>${t.rekord}</strong> av ${N.kommuner.length}
      ${t.hardcore ? ' · <strong class="hardcore">Du er Hardcore</strong>' : ''}</span>`;

    $('#meny-innhold').innerHTML = `
      ${kanVelgeFritt ? `<label class="fritt-valg ${fritt() ? 'pa' : ''}">
        <input type="checkbox" id="fritt" ${fritt() ? 'checked' : ''} ${testIAdressen ? 'disabled' : ''}>
        <span><strong>Fritt valg</strong> – alle nivåer er åpne, så du kan prøve hva du vil.
        ${testIAdressen ? 'Slått på med ?test i adressen.' : 'Bare synlig når du tester lokalt.'}</span>
      </label>` : ''}
      ${kort('1', 'Hele Norge med fylkesgrenser. Finn fylket med navnet.')}
      ${kort('2', 'Samme kart. Finn fylket med nummeret.')}
      <section class="niva fylkesliste ${apen('3:' + N.fylker[0].nr) ? '' : 'stengt'}">
        <span class="niva-topp"><strong>Nivå 3 og 4: Kommuner, ett fylke om gangen</strong>
          <span class="merke">${antallMestret} / ${N.fylker.length} mestret</span></span>
        <span class="niva-tekst">Navn først, så nummer. Nivå 5 åpnes når alle fylkene har bestått nummer.</span>
        <ul>${N.fylker.map(fylkeRad).join('')}</ul>
      </section>
      ${kort('5', `${nivaer.NIVA5_ANTALL} kommuner fra hele landet. Du får nummer og navn, velger fylket først og så kommunen.`)}
      ${kort('6', 'Alle 357 kommuner, bare nummer. Velg fylket, så kommunen. Ett liv. Lengste streak er poengsummen.', rekord)}
      ${postBonus()}
    `;
  }

  function postBonus() {
    const apenBonus = apen('P:alle');
    const rad = (id, navn, antall) => `<li><span class="fylke-navn">${esc(navn)}</span>
      <span class="antall">${antall}</span>
      <button class="liten-knapp ${t.bestatt[id] ? 'ok' : ''}" data-start="${id}" ${apenBonus ? '' : 'disabled'}
        title="${esc(nivaer.tittel(id))}">${t.bestatt[id] ? '✓ ' : ''}Spill</button></li>`;
    const antallBestatt = nivaer.postGrupper.filter(g => t.bestatt['P:' + g.nr]).length;
    return `<section class="niva fylkesliste bonus ${apenBonus ? '' : 'stengt'}">
      <span class="niva-topp"><strong>Bonus: Postnummer i Oslo</strong>
        <span class="merke">${apenBonus ? `${antallBestatt} / ${nivaer.postGrupper.length} bestått` : 'Låst'}</span></span>
      <span class="niva-tekst">${apenBonus
        ? 'Alle postnummer med eget område i Oslo, én bydel om gangen. Sentrum og Marka er egne grupper.'
        : 'Låses opp når du har bestått nivå 4 for Oslo (bydelsnummer).'}</span>
      <ul>${nivaer.postGrupper.map(g => rad('P:' + g.nr, g.navn, g.antall)).join('')}
        ${rad('P:alle', 'Hele Oslo', nivaer.postnummer.length)}</ul>
    </section>`;
  }

  $('#meny').addEventListener('click', e => {
    const knapp = e.target.closest('[data-start]');
    if (knapp && !knapp.disabled) start(knapp.dataset.start);
  });

  $('#meny').addEventListener('change', e => {
    if (e.target.id !== 'fritt') return;
    t.fritt = e.target.checked;
    HG.lagring.lagre(t);
    visMeny();
  });

  $('#nullstill').addEventListener('click', () => {
    if (confirm('Slette all fremgang? Dette kan ikke angres.')) {
      t = HG.lagring.nullstill();
      visMeny();
    }
  });

  $('#kilde').textContent = N.kilde + ' ' + window.OSLO.kilde + ' ' + HG.Satellitt.KREDITT + '.';
  $('#satkreditt').textContent = HG.Satellitt.KREDITT;

  // --- Runde ---

  function start(id) {
    niva = nivaer.lag(id, t);
    runde = new HG.Runde(niva.sporsmal, { liv: niva.liv });
    opptatt = false;
    $('#resultat').close();
    document.body.dataset.skjerm = 'spill';
    document.body.dataset.fri = niva.kart.fri === false ? 'nei' : 'ja';
    $('#niva-tittel').textContent = niva.tittel;
    kart.oppsett({ ...niva.kart, satellitt: visSat() });
    oppdaterSatKnapp();
    steg = niva.totrinn ? 'fylke' : null;
    visSporsmal();
  }

  // Satellittbilde vises i nivåer som har det, med mindre spilleren har slått det av.
  const visSat = () => !!niva?.satellitt && t.satellitt !== false;

  function oppdaterSatKnapp() {
    document.body.dataset.sat = niva?.satellitt ? 'ja' : 'nei';
    $('#satkreditt').hidden = !visSat();
    $('[data-zoom="sat"]').classList.toggle('pa', visSat());
  }

  // Tilbake til fylkeskartet for neste spørsmål i nivå 5–6.
  function fylkeSteg() {
    steg = 'fylke';
    kart.oppsett({ ...niva.kart, behold: true, satellitt: visSat() });
  }

  // Riktig fylke valgt: zoom inn og vis bare kommunene i fylket.
  function kommuneSteg(fylke) {
    steg = 'kommune';
    const aktive = new Set(nivaer.kommuner.filter(k => k.fylke === fylke).map(k => k.id));
    kart.oppsett({ modus: 'fylke', fylke, aktive, behold: true, satellitt: visSat() });
    visSporsmal();
  }

  function visSporsmal() {
    const { liten, stor, under = '' } = niva.tekst(runde.naa);
    $('#sporsmal .liten').textContent = steg === 'fylke' ? `${liten} · velg fylket`
      : steg === 'kommune' ? `${liten} · finn kommunen` : liten;
    $('#sporsmal .stor').textContent = stor;
    $('#sporsmal .under').textContent = under;
    oppdaterHud();
  }

  function oppdaterHud() {
    $('#liv').textContent = '♥'.repeat(runde.liv) + '♡'.repeat(runde.startLiv - runde.liv);
    $('#liv').title = `${runde.liv} liv igjen`;
    $('#fremdrift').textContent = niva.niva === 6
      ? `Streak ${runde.streak} · Rekord ${Math.max(t.rekord, runde.lengste)}`
      : `${runde.igjen} igjen`;
    $('#ikke-perfekt').hidden = !(runde.feil > 0 && niva.liv > 1);
  }

  kart.paKlikk(async id => {
    if (!runde || runde.ferdig || opptatt) return;
    // Bare klikk i laget som spørres om, teller.
    if (nivaer.type(id) !== (steg === 'fylke' ? 'f' : niva.lag)) return;

    const denne = runde;
    // Første steg i nivå 5–6: riktig fylke går videre til kommunene. Feil fylke
    // teller som bom på kommunen, siden bare første klikk teller.
    const fylkeSvar = steg === 'fylke';
    if (fylkeSvar && id === 'f' + runde.naa.fylke) {
      kart.markerRiktig(id);
      kommuneSteg(runde.naa.fylke);
      return;
    }

    const { riktig, maal } = runde.svar(id);
    if (riktig) {
      if (t.bom[maal.id] > 1) t.bom[maal.id]--; else delete t.bom[maal.id];
      kart.markerRiktig(id);
      // Med 3 liv blir det du har klart liggende grønt og kan ikke klikkes igjen.
      if (niva.liv > 1) kart.markerFerdig(id);
      if (niva.visEtiketter) kart.visEtikett(id, niva.etikett(maal));
      HG.lagring.lagre(t);
    } else {
      t.bom[maal.id] = (t.bom[maal.id] || 0) + 1;
      // Glemt i nivå 5 eller 6: fylket mister "mestret".
      if (niva.niva >= 5) delete t.mestret[maal.fylke];
      HG.lagring.lagre(t);
      kart.markerFeil(id);
      opptatt = true;
      oppdaterHud();
      // Feil fylke: vis riktig fylke. Feil kommune: vis riktig kommune.
      const fylke = N.fylker.find(f => f.nr === maal.fylke);
      if (fylkeSvar) await kart.blink('f' + fylke.nr, `${fylke.nr} ${fylke.navn}`);
      else await kart.blink(maal.id, niva.etikett(maal));
      // Spilleren kan ha gått til menyen eller startet på nytt under blinkingen.
      if (runde !== denne) return;
      opptatt = false;
    }

    if (niva.totrinn && !runde.ferdig) {
      // La det grønne synes et øyeblikk før kartet går tilbake til fylkene.
      if (riktig) {
        opptatt = true;
        await new Promise(r => setTimeout(r, 400));
        if (runde !== denne) return;
        opptatt = false;
      }
      fylkeSteg();
    }
    if (runde.ferdig) avslutt(); else visSporsmal();
  });

  // Første fylke som ikke er ferdig med nivå 4, og hvilket nivå det står på.
  function nesteFylke() {
    const f = N.fylker.find(x => !t.bestatt['4:' + x.nr]);
    if (!f) return '5';
    return (t.bestatt['3:' + f.nr] ? '4:' : '3:') + f.nr;
  }

  function nesteNiva(id) {
    const { niva: n, fylke } = nivaer.del(id);
    if (n === 1) return '2';
    if (n === 2) return nesteFylke();
    if (n === 3) return '4:' + fylke;
    if (n === 4) return nesteFylke();
    if (n === 5) return '6';
    return null; // nivå 6 og bonusen
  }

  function avslutt() {
    oppdaterHud();
    const forApne = new Set(alleIder().filter(apen));
    const id = niva.id;
    const nyRekord = niva.niva === 6 && runde.lengste > t.rekord;

    if (runde.perfekt) {
      t.bestatt[id] = true;
      if (niva.niva === 4) t.mestret[niva.fylke] = true;
    }
    if (niva.niva === 6) {
      t.rekord = Math.max(t.rekord, runde.lengste);
      if (runde.perfekt) t.hardcore = true;
    }
    HG.lagring.lagre(t);
    const nyApne = alleIder().filter(x => apen(x) && !forApne.has(x));

    let tittel, tekst;
    if (niva.niva === 6) {
      tittel = runde.perfekt ? 'Du er Hardcore!' : 'Ute!';
      tekst = runde.perfekt
        ? `Alle ${N.kommuner.length} kommuner uten en eneste feil.`
        : `Streak: ${runde.lengste} av ${N.kommuner.length}. ${nyRekord ? 'Ny rekord!' : `Rekord: ${t.rekord}.`}`;
    } else if (runde.perfekt) {
      tittel = 'Perfekt!';
      tekst = nyApne.length
        ? `Låst opp: ${nyApne.map(x => (x === 'P:alle' ? 'Bonus: Postnummer i Oslo' : esc(nivaer.tittel(x)))).join(', ')}.`
        : 'Alt riktig på første forsøk.';
      if (niva.niva === 4) tekst += ` ${esc(nivaer.fylkeNavn[niva.fylke])} er mestret.`;
    } else if (runde.tapt) {
      tittel = 'Tom for liv';
      tekst = 'Tre feil. Runden starter på nytt fra null.';
    } else {
      tittel = `Fullført med ${runde.feil} feil`;
      tekst = 'Bare en perfekt runde låser opp neste nivå. 99 % er stryk.';
    }

    const neste = runde.perfekt && nesteNiva(id);
    $('#resultat-tittel').textContent = tittel;
    $('#resultat-tekst').innerHTML = tekst;
    $('#neste').hidden = !(neste && apen(neste));
    $('#neste').dataset.start = neste || '';
    $('#neste').textContent = neste ? `Neste: ${nivaer.tittel(neste)}` : '';
    $('#igjen').textContent = runde.perfekt ? 'Spill igjen' : 'Prøv igjen';
    $('#resultat').showModal();
  }

  $('#igjen').addEventListener('click', () => start(niva.id));
  $('#neste').addEventListener('click', e => start(e.currentTarget.dataset.start));
  $('#til-meny').addEventListener('click', () => { $('#resultat').close(); visMeny(); });
  $('#tilbake').addEventListener('click', visMeny);

  // Zoomknapper.
  $('#zoomknapper').addEventListener('click', e => {
    const valg = e.target.closest('[data-zoom]')?.dataset.zoom;
    if (valg === 'inn') kart.zoom(1.6);
    if (valg === 'ut') kart.zoom(1 / 1.6);
    if (valg === 'hele') kart.visHele();
    if (valg === 'sat') {
      t.satellitt = !visSat();
      HG.lagring.lagre(t);
      kart.settSatellitt(visSat());
      oppdaterSatKnapp();
    }
  });

  document.addEventListener('keydown', e => {
    if (document.body.dataset.skjerm !== 'spill' || $('#resultat').open) return;
    if (e.key === 'Escape') visMeny();
    if (!kart.fri) return;
    if (e.key === '+' || e.key === '=') kart.zoom(1.6);
    if (e.key === '-') kart.zoom(1 / 1.6);
    if (e.key === '0') kart.visHele();
  });

  visMeny();
})();
