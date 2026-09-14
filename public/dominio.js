/**
 * Regole dell'applicazione che valgono ovunque i dati vengano salvati: come si
 * valida un viaggio, che aspetto ha la risposta completa, come si genera un id.
 *
 * Usato dal server e dalla versione statica. Il server traduce gli errori di
 * validazione in risposte HTTP 400; la versione statica li mostra e basta.
 */

import {
  arricchisci,
  statistiche,
  perMese,
  riepilogoMeseCorrente,
  elencoPeriodi,
  filtraPerPeriodo,
  ordinaPerData,
  ultimiValori,
} from './calcoli.js';

export const VERSIONE_ARCHIVIO = 1;

/** Dati rifiutati perché sbagliati, non per un guasto. */
export class DatiNonValidiError extends Error {
  constructor(messaggio) {
    super(messaggio);
    this.name = 'DatiNonValidiError';
  }
}

/** Numero finito e strettamente positivo, accettando anche la virgola. */
function numeroPositivo(valore, campo) {
  const numero = typeof valore === 'string' ? Number(valore.replace(',', '.')) : valore;

  if (typeof numero !== 'number' || !Number.isFinite(numero) || numero <= 0) {
    throw new DatiNonValidiError(
      `Il campo "${campo}" deve essere un numero maggiore di zero.`,
    );
  }
  return numero;
}

/** Data nel formato AAAA-MM-GG che esiste davvero nel calendario. */
function dataValida(valore) {
  if (typeof valore !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valore)) {
    throw new DatiNonValidiError('La data deve essere nel formato AAAA-MM-GG.');
  }

  const [anno, mese, giorno] = valore.split('-').map(Number);
  const data = new Date(Date.UTC(anno, mese - 1, giorno));
  const esiste =
    data.getUTCFullYear() === anno &&
    data.getUTCMonth() === mese - 1 &&
    data.getUTCDate() === giorno;

  if (!esiste) throw new DatiNonValidiError(`La data ${valore} non esiste.`);
  return valore;
}

/** Normalizza e valida i dati di un viaggio in arrivo dal form. */
export function validaViaggio(dati) {
  const descrizione = (dati?.descrizione ?? '').toString().trim();

  if (descrizione.length > 200) {
    throw new DatiNonValidiError('La descrizione non può superare i 200 caratteri.');
  }

  return {
    data: dataValida(dati?.data),
    descrizione,
    km: numeroPositivo(dati?.km, 'km'),
    kmPerLitro: numeroPositivo(dati?.kmPerLitro, 'km/l'),
    prezzoLitro: numeroPositivo(dati?.prezzoLitro, 'prezzo al litro'),
  };
}

/** Identificativo breve e univoco per un nuovo viaggio. */
export function nuovoId(viaggiEsistenti) {
  const presenti = new Set(viaggiEsistenti.map((v) => v.id));
  let id;
  do {
    id = Math.random().toString(36).slice(2, 8);
  } while (presenti.has(id));
  return id;
}

/**
 * Verifica un archivio letto da un file: serve sia al server all'avvio sia
 * all'importazione di un JSON scelto dall'utente.
 */
export function validaArchivio(dati) {
  if (!dati || typeof dati !== 'object' || !Array.isArray(dati.viaggi)) {
    throw new DatiNonValidiError('Il file non contiene una lista di viaggi.');
  }

  const viaggi = dati.viaggi.map((viaggio, indice) => {
    try {
      return { id: viaggio?.id ?? '', ...validaViaggio(viaggio) };
    } catch (errore) {
      throw new DatiNonValidiError(`Viaggio numero ${indice + 1}: ${errore.message}`);
    }
  });

  // Gli id devono restare univoci, anche se il file è stato modificato a mano.
  const visti = new Set();
  for (const viaggio of viaggi) {
    if (viaggio.id === '' || visti.has(viaggio.id)) viaggio.id = nuovoId([...visti].map((id) => ({ id })));
    visti.add(viaggio.id);
  }

  return { versione: VERSIONE_ARCHIVIO, viaggi };
}

/**
 * La risposta completa che l'interfaccia si aspetta. Viaggi e statistiche
 * seguono il periodo richiesto; grafico, riepilogo del mese e valori proposti
 * guardano sempre l'archivio intero, così non dipendono dal filtro attivo.
 */
export function componiRisposta(viaggi, periodo) {
  const selezionati = ordinaPerData(filtraPerPeriodo(viaggi, periodo));

  return {
    periodo: periodo ?? 'tutti',
    periodi: elencoPeriodi(viaggi),
    viaggi: selezionati.map(arricchisci),
    statistiche: statistiche(selezionati),
    meseCorrente: riepilogoMeseCorrente(viaggi),
    mensili: perMese(viaggi).slice(-12),
    ultimiValori: ultimiValori(viaggi),
  };
}
