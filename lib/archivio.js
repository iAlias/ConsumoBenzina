/**
 * Lettura e scrittura di data.json, l'unico archivio dell'applicazione.
 * Nessuna logica di calcolo: qui si tratta solo di byte su disco.
 */

import { readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { VERSIONE_ARCHIVIO } from '../public/dominio.js';

const RADICE = dirname(dirname(fileURLToPath(import.meta.url)));

export const PERCORSO_ARCHIVIO = join(RADICE, 'data.json');

const ARCHIVIO_VUOTO = { versione: VERSIONE_ARCHIVIO, viaggi: [] };

/** Errore che segnala un archivio illeggibile: non va mai sovrascritto. */
export class ArchivioCorrottoError extends Error {
  constructor(causa) {
    super(
      `Il file ${PERCORSO_ARCHIVIO} esiste ma non contiene JSON valido ` +
        `(${causa}). Correggilo o spostalo altrove: non verrà sovrascritto ` +
        `per non perdere i dati.`,
    );
    this.name = 'ArchivioCorrottoError';
  }
}

/**
 * Legge l'archivio. Un file assente è normale al primo avvio e restituisce un
 * archivio vuoto; un file illeggibile è invece un errore.
 */
export async function leggi() {
  let contenuto;

  try {
    contenuto = await readFile(PERCORSO_ARCHIVIO, 'utf8');
  } catch (errore) {
    if (errore.code === 'ENOENT') return { ...ARCHIVIO_VUOTO };
    throw errore;
  }

  if (contenuto.trim() === '') return { ...ARCHIVIO_VUOTO };

  let dati;
  try {
    dati = JSON.parse(contenuto);
  } catch (errore) {
    throw new ArchivioCorrottoError(errore.message);
  }

  if (!Array.isArray(dati?.viaggi)) {
    throw new ArchivioCorrottoError('manca la lista "viaggi"');
  }

  return { versione: dati.versione ?? VERSIONE_ARCHIVIO, viaggi: dati.viaggi };
}

/**
 * Scrive l'archivio in modo atomico: prima su un file temporaneo, poi con una
 * rinomina. Un'interruzione a metà scrittura non lascia un archivio troncato.
 */
export async function scrivi(archivio) {
  const temporaneo = `${PERCORSO_ARCHIVIO}.tmp`;
  const contenuto = JSON.stringify({ ...archivio, versione: VERSIONE_ARCHIVIO }, null, 2);

  await writeFile(temporaneo, `${contenuto}\n`, 'utf8');
  await rename(temporaneo, PERCORSO_ARCHIVIO);
}

