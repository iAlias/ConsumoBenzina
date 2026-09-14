/**
 * Fonte dati "rete": i viaggi stanno in data.json e li gestisce il server.
 * Ogni operazione restituisce lo stato completo, così l'interfaccia ridisegna
 * sempre partendo dai dati veri e non da una copia locale.
 */

import { VERSIONE_ARCHIVIO } from './dominio.js';

async function chiama(percorso, periodo, opzioni = {}) {
  const separatore = percorso.includes('?') ? '&' : '?';
  let risposta;

  try {
    risposta = await fetch(`${percorso}${separatore}periodo=${encodeURIComponent(periodo)}`, {
      ...opzioni,
      headers: opzioni.corpo ? { 'Content-Type': 'application/json' } : undefined,
      body: opzioni.corpo ? JSON.stringify(opzioni.corpo) : undefined,
    });
  } catch {
    // Il messaggio nativo del browser ("Failed to fetch") non dice all'utente
    // né cosa è successo né cosa fare.
    throw new Error(
      'Il server non risponde. Controlla che sia ancora avviato nella finestra del terminale, poi riprova.',
    );
  }

  const dati = await risposta.json().catch(() => ({}));
  if (!risposta.ok) throw new Error(dati.errore || 'Il server ha risposto con un errore.');
  return dati;
}

export const descrizione = 'salvati in data.json';

export const leggi = (periodo) => chiama('/api/viaggi', periodo);

export const aggiungi = (dati, periodo) =>
  chiama('/api/viaggi', periodo, { method: 'POST', corpo: dati });

export const aggiorna = (id, dati, periodo) =>
  chiama(`/api/viaggi/${id}`, periodo, { method: 'PUT', corpo: dati });

export const elimina = (id, periodo) =>
  chiama(`/api/viaggi/${id}`, periodo, { method: 'DELETE' });

export const sostituisci = (archivio, periodo) =>
  chiama('/api/archivio', periodo, { method: 'PUT', corpo: archivio });

/** L'archivio nudo, come va salvato su file: senza i valori calcolati. */
export async function esporta() {
  const stato = await chiama('/api/viaggi', 'tutti');

  return {
    versione: VERSIONE_ARCHIVIO,
    viaggi: stato.viaggi.map(({ litri, spesa, ...viaggio }) => viaggio),
  };
}
