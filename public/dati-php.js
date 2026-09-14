/**
 * Fonte dati "php": i viaggi stanno in un data.json sul server, gestito da
 * api.php. È la modalità della versione pubblicata su uno spazio web con PHP.
 *
 * Il server restituisce solo l'elenco dei viaggi: litri, spese e statistiche
 * vengono calcolati qui, con le stesse funzioni usate da tutte le altre
 * modalità. Le formule restano in un posto solo.
 */

import { componiRisposta, validaViaggio, VERSIONE_ARCHIVIO } from './dominio.js';

const API = 'api.php';

export const descrizione = 'salvati sul server';

/**
 * Ogni chiamata restituisce l'elenco aggiornato dei viaggi.
 * Si usano solo GET e POST: parecchi hosting condivisi bloccano PUT e DELETE.
 */
async function chiama(corpo) {
  let risposta;

  try {
    risposta = await fetch(API, {
      method: corpo ? 'POST' : 'GET',
      headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
      body: corpo ? JSON.stringify(corpo) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new Error(
      'Il server non risponde. Controlla la connessione e riprova: i dati inseriti restano nel modulo.',
    );
  }

  const testo = await risposta.text();
  let dati;

  try {
    dati = JSON.parse(testo);
  } catch {
    // Con PHP mancante o in errore arriva HTML, non JSON: dirlo aiuta a capire
    // che il problema è nell'hosting e non in quello che si è appena scritto.
    throw new Error(
      risposta.status === 404
        ? 'api.php non è stato trovato sul server: controlla di averlo caricato accanto a index.html.'
        : `Il server ha risposto in modo inatteso (HTTP ${risposta.status}). Se l'hosting non esegue PHP, l'archivio sul server non può funzionare.`,
    );
  }

  if (!risposta.ok) throw new Error(dati.errore || 'Il server ha risposto con un errore.');
  if (!Array.isArray(dati.viaggi)) throw new Error('Il server ha risposto senza la lista dei viaggi.');

  return dati.viaggi;
}

export async function leggi(periodo) {
  return componiRisposta(await chiama(null), periodo);
}

export async function aggiungi(dati, periodo) {
  // Validato anche qui per dare l'errore subito, senza un giro sulla rete.
  const viaggio = validaViaggio(dati);
  return componiRisposta(await chiama({ azione: 'aggiungi', viaggio }), periodo);
}

export async function aggiorna(id, dati, periodo) {
  const viaggio = validaViaggio(dati);
  return componiRisposta(await chiama({ azione: 'aggiorna', id, viaggio }), periodo);
}

export async function elimina(id, periodo) {
  return componiRisposta(await chiama({ azione: 'elimina', id }), periodo);
}

export async function sostituisci(archivio, periodo) {
  return componiRisposta(await chiama({ azione: 'sostituisci', archivio }), periodo);
}

export async function esporta() {
  return { versione: VERSIONE_ARCHIVIO, viaggi: await chiama(null) };
}
