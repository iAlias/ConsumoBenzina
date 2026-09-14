/* ------------------------------------------------------------------
   Consumo Benzina — interfaccia

   Non sa dove finiscono i dati: chiede tutto a dati.js, che a seconda della
   configurazione parla col server o con localStorage. Ogni operazione
   restituisce lo stato completo, e da lì si ridisegna.
   ------------------------------------------------------------------ */

import * as dati from './dati.js';

const elemento = (id) => document.getElementById(id);

/**
 * Svuota un elemento. Fa quello che farebbe replaceChildren(), che però manca
 * ai browser precedenti al 2021: su quelli la pagina si disegnerebbe e poi non
 * risponderebbe più a niente.
 */
function svuota(nodo) {
  while (nodo.firstChild) nodo.removeChild(nodo.firstChild);
}

const MESI = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];

// --- Formattazione ------------------------------------------------

const decimali = (cifre) =>
  new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: cifre,
    maximumFractionDigits: cifre,
  });

const interi = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 });
const unaCifra = decimali(1);
const dueCifre = decimali(2);
const treCifre = decimali(3);

const euro = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
});

/** I valori assenti si mostrano con un trattino, mai con "0" o "NaN". */
const oTrattino = (valore, formatta) =>
  valore === null || valore === undefined ? '—' : formatta(valore);

const dataBreve = (iso) => {
  const [anno, mese, giorno] = iso.split('-');
  return `${giorno} ${MESI[Number(mese) - 1].slice(0, 3)} ${anno.slice(2)}`;
};

const meseEsteso = (iso) => {
  const [anno, mese] = iso.split('-');
  return `${MESI[Number(mese) - 1]} ${anno}`;
};

const meseAbbreviato = (iso) => MESI[Number(iso.split('-')[1]) - 1].slice(0, 3);

const oggiIso = () => {
  const oggi = new Date();
  const mese = String(oggi.getMonth() + 1).padStart(2, '0');
  const giorno = String(oggi.getDate()).padStart(2, '0');
  return `${oggi.getFullYear()}-${mese}-${giorno}`;
};

// --- Stato --------------------------------------------------------

let periodoAttivo = 'tutti';
let idInModifica = null;
let idInAttesaDiConferma = null;
let timerConferma = null;
let valoriSuggeriti = null;

// --- Messaggi in cima alla pagina ----------------------------------

/**
 * Mostra un messaggio, eventualmente con dei pulsanti. Le azioni servono a
 * chiedere conferma senza finestre di sistema, che bloccherebbero la pagina.
 */
function mostraAvviso(messaggio, { tono = 'errore', azioni = [] } = {}) {
  const avviso = elemento('avviso');
  avviso.className = `avviso avviso--${tono}`;
  svuota(avviso);

  const testo = document.createElement('p');
  testo.className = 'avviso__testo';
  testo.textContent = messaggio;
  avviso.append(testo);

  if (azioni.length > 0) {
    const gruppo = document.createElement('div');
    gruppo.className = 'avviso__azioni';

    for (const azione of azioni) {
      const bottone = document.createElement('button');
      bottone.type = 'button';
      bottone.className = `pulsante pulsante--minuto${azione.primario ? ' pulsante--primario' : ''}`;
      bottone.textContent = azione.etichetta;
      bottone.addEventListener('click', azione.azione);
      gruppo.append(bottone);
    }

    avviso.append(gruppo);
  }

  avviso.hidden = false;
}

function nascondiAvviso() {
  elemento('avviso').hidden = true;
}

// --- Disegno delle statistiche ------------------------------------

function disegnaStatistiche(stato) {
  const s = stato.statistiche;

  elemento('km-totali').textContent = oTrattino(s.kmTotali, (v) => interi.format(v));
  elemento('media-kml').textContent = oTrattino(s.mediaKmL, (v) => unaCifra.format(v));
  elemento('spesa-totale').textContent = oTrattino(s.spesaTotale, (v) => dueCifre.format(v));
  elemento('numero-viaggi').textContent = interi.format(s.numeroViaggi);

  elemento('costo-km').textContent = oTrattino(s.costoPerKm, (v) => `${treCifre.format(v)} €`);
  elemento('spesa-media').textContent = oTrattino(s.spesaMediaViaggio, (v) => euro.format(v));
  elemento('litri-totali').textContent = oTrattino(s.litriTotali, (v) => `${unaCifra.format(v)} l`);
  elemento('prezzo-medio').textContent = oTrattino(s.prezzoMedioLitro, (v) => `${treCifre.format(v)} €/l`);

  // Dire dove stanno i dati non è un dettaglio: nella versione statica
  // appartengono a questo browser e solo a questo.
  const quanti =
    s.numeroViaggi === 0
      ? 'Archivio vuoto'
      : `${interi.format(s.numeroViaggi)} ${s.numeroViaggi === 1 ? 'viaggio' : 'viaggi'}`;
  elemento('riepilogo-archivio').textContent = `${quanti} · ${dati.descrizione}`;
}

/**
 * Scala graduata: colloca la media km/l tra il viaggio meno efficiente e il
 * più efficiente. Con un solo viaggio, o con viaggi tutti uguali, non c'è un
 * intervallo da mostrare e la scala resta nascosta.
 */
function disegnaScala(stato) {
  const scala = elemento('scala');
  const consumi = stato.viaggi.map((v) => v.kmPerLitro);
  const media = stato.statistiche.mediaKmL;

  if (consumi.length < 2 || media === null) {
    scala.hidden = true;
    return;
  }

  const minimo = Math.min(...consumi);
  const massimo = Math.max(...consumi);

  if (massimo === minimo) {
    scala.hidden = true;
    return;
  }

  scala.hidden = false;
  elemento('scala-min').textContent = `${unaCifra.format(minimo)} km/l`;
  elemento('scala-max').textContent = `${unaCifra.format(massimo)} km/l`;
  elemento('scala-indice').style.left =
    `${((media - minimo) / (massimo - minimo)) * 100}%`;
}

function disegnaMeseCorrente(stato) {
  const mese = stato.meseCorrente;

  elemento('titolo-mese').textContent = meseEsteso(mese.mese);
  elemento('mese-spesa').textContent = euro.format(mese.spesa);
  elemento('mese-km').textContent =
    mese.km > 0
      ? `${interi.format(mese.km)} km percorsi`
      : 'nessun viaggio questo mese';

  const variazione = elemento('mese-variazione');

  if (mese.variazioneSpesa === null) {
    variazione.hidden = true;
    return;
  }

  const calo = mese.variazioneSpesa <= 0;
  variazione.hidden = false;
  variazione.className = `variazione ${calo ? 'variazione--calo' : 'variazione--aumento'}`;
  variazione.textContent =
    `${calo ? '▼' : '▲'} ${unaCifra.format(Math.abs(mese.variazioneSpesa))}% sul mese scorso`;
}

// --- Grafico ------------------------------------------------------

/**
 * Barre della spesa mensile con sovrapposta la linea del consumo medio.
 * Serve a distinguere un mese caro perché si è guidato molto da un mese caro
 * perché l'auto ha bevuto. Con un mese solo non c'è andamento da mostrare.
 */
function disegnaGrafico(mensili) {
  const pannello = elemento('pannello-grafico');

  if (mensili.length < 2) {
    pannello.hidden = true;
    return;
  }
  pannello.hidden = false;

  // Il viewBox è vicino alla larghezza reale del pannello: così testo e
  // tratti non vengono rimpiccioliti dallo scalamento.
  const L = 360;
  const A = 180;
  const bordo = { alto: 12, basso: 26, lato: 12 };
  const larghezzaUtile = L - bordo.lato * 2;
  const altezzaUtile = A - bordo.alto - bordo.basso;
  const passo = larghezzaUtile / mensili.length;

  const spesaMassima = Math.max(...mensili.map((m) => m.spesa));
  const consumi = mensili.map((m) => m.mediaKmL ?? 0);
  const consumoMin = Math.min(...consumi);
  const consumoMax = Math.max(...consumi);
  const intervallo = consumoMax - consumoMin || 1;

  const centroX = (indice) => bordo.lato + passo * (indice + 0.5);
  // La linea resta nel 70% centrale dell'area, così non tocca mai i bordi.
  const yConsumo = (valore) =>
    bordo.alto + altezzaUtile * 0.15 +
    (1 - (valore - consumoMin) / intervallo) * altezzaUtile * 0.7;

  const larghezzaBarra = Math.min(passo * 0.55, 30);
  const barre = mensili
    .map((m, i) => {
      const altezza = spesaMassima > 0 ? (m.spesa / spesaMassima) * altezzaUtile : 0;
      const y = bordo.alto + altezzaUtile - altezza;
      return `<rect class="barra" x="${centroX(i) - larghezzaBarra / 2}" y="${y}" width="${larghezzaBarra}" height="${Math.max(altezza, 1)}" rx="2"><title>${meseEsteso(m.mese)}: ${euro.format(m.spesa)}</title></rect>`;
    })
    .join('');

  const percorso = mensili
    .map((m, i) => `${i === 0 ? 'M' : 'L'} ${centroX(i)} ${yConsumo(m.mediaKmL ?? 0)}`)
    .join(' ');

  const punti = mensili
    .map(
      (m, i) =>
        `<circle class="punto" cx="${centroX(i)}" cy="${yConsumo(m.mediaKmL ?? 0)}" r="3"><title>${meseEsteso(m.mese)}: ${unaCifra.format(m.mediaKmL ?? 0)} km/l</title></circle>`,
    )
    .join('');

  // Con molti mesi le etichette si sovrappongono: se ne mostra una ogni due.
  const salto = mensili.length > 8 ? 2 : 1;
  const etichette = mensili
    .map((m, i) =>
      i % salto === 0
        ? `<text class="etichetta-mese" x="${centroX(i)}" y="${A - 8}" text-anchor="middle">${meseAbbreviato(m.mese)}</text>`
        : '',
    )
    .join('');

  elemento('grafico').innerHTML =
    `<svg viewBox="0 0 ${L} ${A}" role="img" aria-label="Spesa mensile e consumo medio">` +
    `${barre}<path class="linea" d="${percorso}" />${punti}${etichette}</svg>`;
}

// --- Elenco -------------------------------------------------------

function cella(testo, classe) {
  const td = document.createElement('td');
  td.textContent = testo;
  if (classe) td.className = classe;
  return td;
}

/**
 * Icone disegnate come SVG e non come emoji: il font monospace della
 * tabella non ha i glifi corrispondenti e mostrerebbe dei rettangoli.
 */
const ICONE = {
  duplica:
    '<path d="M9 9h10v11H9zM5 15V4h10v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  modifica:
    '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  elimina:
    '<path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13M10 11v5M14 11v5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
};

function pulsanteIcona(icona, classe, titolo, azione) {
  const bottone = document.createElement('button');
  bottone.type = 'button';
  bottone.className = `icona ${classe}`;
  bottone.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONE[icona]}</svg>`;
  bottone.title = titolo;
  bottone.setAttribute('aria-label', titolo);
  bottone.addEventListener('click', azione);
  return bottone;
}

function disegnaElenco(viaggi) {
  const corpo = elemento('corpo-tabella');
  svuota(corpo);

  elemento('elenco-vuoto').hidden = viaggi.length > 0;
  elemento('tabella').hidden = viaggi.length === 0;

  for (const viaggio of viaggi) {
    const riga = document.createElement('tr');
    riga.dataset.id = viaggio.id;
    if (viaggio.id === idInModifica) riga.className = 'in-modifica';

    riga.append(
      cella(dataBreve(viaggio.data), 'cella-data'),
      cella(viaggio.descrizione, 'cella-descrizione'),
      cella(`${interi.format(viaggio.km)} km`, 'numerico cella-km'),
      cella(`${unaCifra.format(viaggio.kmPerLitro)}`, 'numerico cella-consumo'),
      cella(`${unaCifra.format(viaggio.litri)} l`, 'numerico cella-litri'),
      cella(euro.format(viaggio.spesa), 'numerico cella-spesa'),
    );

    const azioni = document.createElement('td');
    azioni.className = 'cella-azioni';
    azioni.append(
      pulsanteIcona('duplica', 'icona--duplica', 'Ripeti questo viaggio oggi', () =>
        duplica(viaggio),
      ),
      pulsanteIcona('modifica', 'icona--modifica', 'Modifica questo viaggio', () =>
        iniziaModifica(viaggio),
      ),
      pulsanteIcona('elimina', 'icona--elimina', 'Elimina questo viaggio', (evento) =>
        chiediConferma(viaggio.id, evento.currentTarget),
      ),
    );
    riga.append(azioni);
    corpo.append(riga);
  }
}

function aggiornaFiltro(periodi) {
  const filtro = elemento('filtro-periodo');
  svuota(filtro);

  const tutti = new Option('Tutti', 'tutti');
  filtro.append(tutti);

  for (const periodo of periodi) {
    const etichetta =
      periodo.tipo === 'anno'
        ? `Anno ${periodo.valore}`
        : `  ${meseEsteso(periodo.valore)}`;
    filtro.append(new Option(etichetta, periodo.valore));
  }

  // Se il periodo attivo sparisce (ultimo viaggio di quel mese eliminato),
  // si torna a "Tutti" invece di mostrare un elenco vuoto senza spiegazione.
  const esiste = [...filtro.options].some((o) => o.value === periodoAttivo);
  periodoAttivo = esiste ? periodoAttivo : 'tutti';
  filtro.value = periodoAttivo;
}

function disegna(stato) {
  valoriSuggeriti = stato.ultimiValori;

  disegnaStatistiche(stato);
  disegnaScala(stato);
  disegnaMeseCorrente(stato);
  disegnaGrafico(stato.mensili);
  aggiornaFiltro(stato.periodi);
  disegnaElenco(stato.viaggi);
  proponiValoriSuggeriti();
}

// --- Form ---------------------------------------------------------

const form = elemento('form-viaggio');

/** I valori del form, senza normalizzazioni: pensa il server a validarli. */
function datiForm() {
  const dati = Object.fromEntries(new FormData(form));
  return {
    data: dati.data,
    descrizione: dati.descrizione,
    km: dati.km,
    kmPerLitro: dati.kmPerLitro,
    prezzoLitro: dati.prezzoLitro,
  };
}

function aggiornaAnteprima() {
  const anteprima = elemento('anteprima');
  const km = Number(elemento('campo-km').value);
  const kml = Number(elemento('campo-kml').value);
  const prezzo = Number(elemento('campo-prezzo').value);

  if (!(km > 0) || !(kml > 0) || !(prezzo > 0)) {
    anteprima.className = 'anteprima';
    anteprima.textContent = 'Compila i campi per vedere il calcolo';
    return;
  }

  const litri = km / kml;
  anteprima.className = 'anteprima anteprima--attiva';
  anteprima.textContent = `≈ ${unaCifra.format(litri)} litri — ${euro.format(litri * prezzo)}`;
}

/**
 * Evidenzia la riga in modifica senza ridisegnare l'elenco: entrare in
 * modifica non cambia i dati, quindi non c'è motivo di ricostruire tutto.
 */
function evidenziaRigaInModifica() {
  for (const riga of document.querySelectorAll('#corpo-tabella tr')) {
    riga.classList.toggle('in-modifica', riga.dataset.id === idInModifica);
  }
}

const CAMPI_NUMERICI = ['campo-km', 'campo-kml', 'campo-prezzo'];

/**
 * Propone consumo e prezzo dell'ultimo viaggio: tra un rifornimento e
 * l'altro cambiano poco, e ridigitarli ogni volta è la parte più noiosa.
 * Tocca solo i campi vuoti o ancora suggeriti, mai quello che è stato scritto.
 */
function proponiValoriSuggeriti() {
  if (idInModifica || !valoriSuggeriti) return;

  suggerisci('campo-kml', valoriSuggeriti.kmPerLitro);
  suggerisci('campo-prezzo', valoriSuggeriti.prezzoLitro);
  aggiornaAnteprima();
}

function suggerisci(id, valore) {
  const campo = elemento(id);
  if (campo.value !== '' && !campo.classList.contains('campo--suggerito')) return;

  campo.value = valore;
  campo.classList.add('campo--suggerito');
  campo.title = "Valore dell'ultimo viaggio: correggilo se è cambiato";
}

/** Un valore digitato o scelto dall'utente non è più un suggerimento. */
function smarcaSuggerito(campo) {
  campo.classList.remove('campo--suggerito');
  campo.removeAttribute('title');
}

function impostaModalitaNuovo() {
  idInModifica = null;
  evidenziaRigaInModifica();
  elemento('titolo-form').textContent = 'Nuovo viaggio';
  elemento('invia').textContent = 'Aggiungi viaggio';
  elemento('annulla').hidden = true;
}

function iniziaModifica(viaggio) {
  idInModifica = viaggio.id;
  evidenziaRigaInModifica();

  elemento('campo-data').value = viaggio.data;
  elemento('campo-descrizione').value = viaggio.descrizione;
  elemento('campo-km').value = viaggio.km;
  elemento('campo-kml').value = viaggio.kmPerLitro;
  elemento('campo-prezzo').value = viaggio.prezzoLitro;
  CAMPI_NUMERICI.forEach((id) => smarcaSuggerito(elemento(id)));

  elemento('titolo-form').textContent = 'Modifica viaggio';
  elemento('invia').textContent = 'Salva modifiche';
  elemento('annulla').hidden = false;

  aggiornaAnteprima();
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  elemento('campo-km').focus();
}

/**
 * Ripete un tragitto abituale: stessi valori, data di oggi, come nuovo
 * viaggio. I valori arrivano da un viaggio scelto, quindi non sono
 * suggerimenti da segnalare.
 */
function duplica(viaggio) {
  impostaModalitaNuovo();

  elemento('campo-data').value = oggiIso();
  elemento('campo-descrizione').value = viaggio.descrizione;
  elemento('campo-km').value = viaggio.km;
  elemento('campo-kml').value = viaggio.kmPerLitro;
  elemento('campo-prezzo').value = viaggio.prezzoLitro;
  CAMPI_NUMERICI.forEach((id) => smarcaSuggerito(elemento(id)));

  aggiornaAnteprima();
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  elemento('campo-km').select();
}

function annullaModifica() {
  impostaModalitaNuovo();
  form.reset();
  CAMPI_NUMERICI.forEach((id) => smarcaSuggerito(elemento(id)));
  elemento('campo-data').value = oggiIso();
  proponiValoriSuggeriti();
  aggiornaAnteprima();
}

// --- Eliminazione con conferma ------------------------------------

/**
 * Conferma in due tempi sul pulsante stesso: niente finestra di sistema che
 * interrompe il flusso, ma nemmeno una cancellazione con un click solo.
 */
function chiediConferma(id, bottone) {
  if (idInAttesaDiConferma === id) {
    clearTimeout(timerConferma);
    idInAttesaDiConferma = null;
    elimina(id);
    return;
  }

  clearTimeout(timerConferma);
  idInAttesaDiConferma = id;

  const originale = bottone.innerHTML;
  const etichettaOriginale = bottone.getAttribute('aria-label');

  bottone.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONE.elimina}</svg>Confermi?`;
  bottone.setAttribute('aria-label', 'Conferma eliminazione');
  bottone.classList.add('icona--conferma');

  timerConferma = setTimeout(() => {
    idInAttesaDiConferma = null;
    bottone.innerHTML = originale;
    bottone.setAttribute('aria-label', etichettaOriginale);
    bottone.classList.remove('icona--conferma');
  }, 4000);
}

// --- Operazioni ---------------------------------------------------

async function carica() {
  try {
    disegna(await dati.leggi(periodoAttivo));
    nascondiAvviso();
  } catch (errore) {
    mostraAvviso(`Impossibile leggere i viaggi: ${errore.message}`);
  }
}

async function elimina(id) {
  try {
    disegna(await dati.elimina(id, periodoAttivo));
    if (idInModifica === id) annullaModifica();
    nascondiAvviso();
  } catch (errore) {
    mostraAvviso(`Eliminazione non riuscita: ${errore.message}`);
  }
}

form.addEventListener('submit', async (evento) => {
  evento.preventDefault();

  const invia = elemento('invia');
  invia.disabled = true;

  try {
    const stato = idInModifica
      ? await dati.aggiorna(idInModifica, datiForm(), periodoAttivo)
      : await dati.aggiungi(datiForm(), periodoAttivo);

    // Il form si svuota solo a salvataggio riuscito: in caso di errore i
    // dati digitati restano dove sono.
    annullaModifica();
    disegna(stato);
    nascondiAvviso();
  } catch (errore) {
    mostraAvviso(errore.message);
  } finally {
    invia.disabled = false;
  }
});

// --- Esporta e importa --------------------------------------------

/** Scarica l'archivio come file JSON, con la data nel nome. */
async function esporta() {
  try {
    const archivio = await dati.esporta();
    const contenuto = `${JSON.stringify(archivio, null, 2)}\n`;
    const url = URL.createObjectURL(new Blob([contenuto], { type: 'application/json' }));

    const collegamento = document.createElement('a');
    collegamento.href = url;
    collegamento.download = `consumo-benzina-${oggiIso()}.json`;
    collegamento.click();
    URL.revokeObjectURL(url);

    nascondiAvviso();
  } catch (errore) {
    mostraAvviso(`Esportazione non riuscita: ${errore.message}`);
  }
}

/**
 * Legge il file scelto e chiede conferma prima di sostituire: l'importazione
 * cancella l'archivio esistente, e va detto prima di farlo, non dopo.
 */
async function leggiFileDaImportare(file) {
  let archivio;

  try {
    archivio = JSON.parse(await file.text());
  } catch {
    mostraAvviso(`"${file.name}" non è un file JSON valido.`);
    return;
  }

  if (!Array.isArray(archivio?.viaggi)) {
    mostraAvviso(`"${file.name}" non contiene una lista di viaggi.`);
    return;
  }

  const attuali = Number(elemento('numero-viaggi').textContent.replace(/\D/g, '')) || 0;
  const messaggio =
    attuali === 0
      ? `Importo i ${archivio.viaggi.length} viaggi di "${file.name}"?`
      : `"${file.name}" contiene ${archivio.viaggi.length} viaggi e sostituirà i ${attuali} attuali. I dati di adesso vanno persi.`;

  mostraAvviso(messaggio, {
    tono: 'domanda',
    azioni: [
      { etichetta: 'Annulla', azione: nascondiAvviso },
      { etichetta: 'Sostituisci', primario: true, azione: () => sostituisci(archivio) },
    ],
  });
}

async function sostituisci(archivio) {
  try {
    annullaModifica();
    disegna(await dati.sostituisci(archivio, periodoAttivo));
    mostraAvviso('Archivio importato.', { tono: 'conferma' });
  } catch (errore) {
    mostraAvviso(`Importazione non riuscita: ${errore.message}`);
  }
}

elemento('esporta').addEventListener('click', esporta);

elemento('importa').addEventListener('click', () => elemento('file-importa').click());

elemento('file-importa').addEventListener('change', (evento) => {
  const [file] = evento.target.files;
  if (file) leggiFileDaImportare(file);
  // Azzerato perché riscegliere lo stesso file torni a scatenare l'evento.
  evento.target.value = '';
});

elemento('annulla').addEventListener('click', annullaModifica);

elemento('filtro-periodo').addEventListener('change', (evento) => {
  periodoAttivo = evento.target.value;
  carica();
});

for (const id of CAMPI_NUMERICI) {
  elemento(id).addEventListener('input', (evento) => {
    smarcaSuggerito(evento.target);
    aggiornaAnteprima();
  });
}

// --- Avvio --------------------------------------------------------

elemento('campo-data').value = oggiIso();
carica();
