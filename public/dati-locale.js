/**
 * Fonte dati "locale": i viaggi stanno nel browser, in localStorage.
 * È la modalità della versione statica, dove non c'è nessun server a scrivere
 * un file. Espone le stesse funzioni di dati-rete.js, così l'interfaccia non sa
 * quale delle due sta usando.
 *
 * Conseguenza da tenere presente: i dati appartengono a questo browser. Un
 * altro dispositivo ha un altro archivio, e cancellare i dati di navigazione
 * cancella anche questo. Per questo esistono Esporta e Importa.
 */

import { componiRisposta, validaViaggio, validaArchivio, nuovoId, VERSIONE_ARCHIVIO } from './dominio.js';

const CHIAVE = 'consumo-benzina';

export const descrizione = 'salvati in questo browser';

/** Legge l'archivio dal browser. Un archivio illeggibile non viene sovrascritto. */
function leggiArchivio() {
  let contenuto;

  try {
    contenuto = localStorage.getItem(CHIAVE);
  } catch {
    throw new Error(
      'Questo browser non permette di salvare dati (succede in navigazione privata). ' +
        'Prova in una finestra normale.',
    );
  }

  if (contenuto === null || contenuto.trim() === '') {
    return { versione: VERSIONE_ARCHIVIO, viaggi: [] };
  }

  try {
    const dati = JSON.parse(contenuto);
    if (!Array.isArray(dati?.viaggi)) throw new Error('manca la lista dei viaggi');
    return { versione: dati.versione ?? VERSIONE_ARCHIVIO, viaggi: dati.viaggi };
  } catch (errore) {
    throw new Error(
      `I dati salvati in questo browser sono illeggibili (${errore.message}). ` +
        'Se hai un file esportato, usa Importa per ripartire da quello.',
    );
  }
}

function scriviArchivio(archivio) {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify({ ...archivio, versione: VERSIONE_ARCHIVIO }));
  } catch (errore) {
    const spazioEsaurito = errore.name === 'QuotaExceededError';
    throw new Error(
      spazioEsaurito
        ? 'Lo spazio di questo browser è esaurito: esporta l\'archivio e libera spazio.'
        : 'Non è stato possibile salvare in questo browser. Se sei in navigazione privata, prova in una finestra normale.',
    );
  }
}

/** Applica una modifica e restituisce lo stato completo aggiornato. */
function modifica(cambia, periodo) {
  const archivio = leggiArchivio();
  cambia(archivio.viaggi);
  scriviArchivio(archivio);
  return componiRisposta(archivio.viaggi, periodo);
}

function posizioneDi(viaggi, id) {
  const posizione = viaggi.findIndex((v) => v.id === id);
  if (posizione === -1) {
    throw new Error('Viaggio non trovato: forse è già stato eliminato.');
  }
  return posizione;
}

// Le funzioni sono dichiarate async perché l'interfaccia le attende tutte allo
// stesso modo, senza sapere se dietro c'è la rete o il browser.

export async function leggi(periodo) {
  return componiRisposta(leggiArchivio().viaggi, periodo);
}

export async function aggiungi(dati, periodo) {
  const viaggio = validaViaggio(dati);
  return modifica((viaggi) => viaggi.push({ id: nuovoId(viaggi), ...viaggio }), periodo);
}

export async function aggiorna(id, dati, periodo) {
  const viaggio = validaViaggio(dati);
  return modifica((viaggi) => {
    viaggi[posizioneDi(viaggi, id)] = { id, ...viaggio };
  }, periodo);
}

export async function elimina(id, periodo) {
  return modifica((viaggi) => {
    viaggi.splice(posizioneDi(viaggi, id), 1);
  }, periodo);
}

export async function sostituisci(archivio, periodo) {
  const valido = validaArchivio(archivio);
  scriviArchivio(valido);
  return componiRisposta(valido.viaggi, periodo);
}

export async function esporta() {
  return { versione: VERSIONE_ARCHIVIO, viaggi: leggiArchivio().viaggi };
}
