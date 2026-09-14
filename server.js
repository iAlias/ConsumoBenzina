/**
 * Server locale dell'applicazione: serve i file statici di public/ ed espone
 * l'API REST sui viaggi.
 *
 * Qui c'è solo HTTP. Le regole stanno in public/dominio.js e le formule in
 * public/calcoli.js, entrambi condivisi con la versione statica; la scrittura
 * su disco sta in lib/archivio.js.
 */

import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validaViaggio,
  validaArchivio,
  componiRisposta,
  nuovoId,
  DatiNonValidiError,
} from './public/dominio.js';
import { leggi, scrivi, ArchivioCorrottoError, PERCORSO_ARCHIVIO } from './lib/archivio.js';

const RADICE = dirname(fileURLToPath(import.meta.url));
const PORTA = Number(process.env.PORT) || 3000;

const app = express();
app.use(express.json());
app.use(express.static(join(RADICE, 'public')));

/**
 * Le richieste che modificano l'archivio vengono messe in fila: leggere,
 * modificare e riscrivere non è atomico, e due richieste sovrapposte
 * perderebbero una delle due modifiche.
 */
let coda = Promise.resolve();
function inCoda(operazione) {
  const risultato = coda.then(operazione, operazione);
  coda = risultato.catch(() => {});
  return risultato;
}

/** Errore con codice HTTP, per distinguere gli sbagli dell'utente dai guasti. */
class ErroreRichiesta extends Error {
  constructor(stato, messaggio) {
    super(messaggio);
    this.stato = stato;
  }
}

/** Cattura gli errori dei gestori asincroni e li passa al middleware finale. */
function gestore(funzione) {
  return (richiesta, risposta, avanti) =>
    Promise.resolve(funzione(richiesta, risposta)).catch(avanti);
}

/** Applica una modifica all'archivio e restituisce l'elenco aggiornato. */
function modifica(cambia) {
  return inCoda(async () => {
    const archivio = await leggi();
    cambia(archivio.viaggi);
    await scrivi(archivio);
    return archivio.viaggi;
  });
}

/** Posizione di un viaggio, o errore 404 se non esiste più. */
function posizioneDi(viaggi, id) {
  const posizione = viaggi.findIndex((v) => v.id === id);
  if (posizione === -1) {
    throw new ErroreRichiesta(404, 'Viaggio non trovato: forse è già stato eliminato.');
  }
  return posizione;
}

app.get(
  '/api/viaggi',
  gestore(async (richiesta, risposta) => {
    const archivio = await leggi();
    risposta.json(componiRisposta(archivio.viaggi, richiesta.query.periodo));
  }),
);

app.post(
  '/api/viaggi',
  gestore(async (richiesta, risposta) => {
    const dati = validaViaggio(richiesta.body);
    const viaggi = await modifica((elenco) => {
      elenco.push({ id: nuovoId(elenco), ...dati });
    });

    risposta.status(201).json(componiRisposta(viaggi, richiesta.query.periodo));
  }),
);

app.put(
  '/api/viaggi/:id',
  gestore(async (richiesta, risposta) => {
    const dati = validaViaggio(richiesta.body);
    const viaggi = await modifica((elenco) => {
      elenco[posizioneDi(elenco, richiesta.params.id)] = { id: richiesta.params.id, ...dati };
    });

    risposta.json(componiRisposta(viaggi, richiesta.query.periodo));
  }),
);

app.delete(
  '/api/viaggi/:id',
  gestore(async (richiesta, risposta) => {
    const viaggi = await modifica((elenco) => {
      elenco.splice(posizioneDi(elenco, richiesta.params.id), 1);
    });

    risposta.json(componiRisposta(viaggi, richiesta.query.periodo));
  }),
);

// Sostituisce l'intero archivio: è l'importazione di un file esportato prima.
app.put(
  '/api/archivio',
  gestore(async (richiesta, risposta) => {
    const archivio = validaArchivio(richiesta.body);

    const viaggi = await inCoda(async () => {
      await scrivi(archivio);
      return archivio.viaggi;
    });

    risposta.json(componiRisposta(viaggi, richiesta.query.periodo));
  }),
);

app.use((errore, richiesta, risposta, avanti) => {
  if (errore instanceof DatiNonValidiError) {
    return risposta.status(400).json({ errore: errore.message });
  }
  if (errore instanceof ErroreRichiesta) {
    return risposta.status(errore.stato).json({ errore: errore.message });
  }

  console.error(errore);
  risposta.status(500).json({
    errore: 'Errore interno del server: controlla la finestra del terminale.',
  });
});

// All'avvio l'archivio viene letto una volta: meglio fermarsi subito con un
// messaggio chiaro che scoprire il problema al primo salvataggio.
try {
  const archivio = await leggi();
  app.listen(PORTA, () => {
    console.log(`\n  ⛽  Consumo Benzina è attivo su http://localhost:${PORTA}`);
    console.log(`      Archivio: ${PERCORSO_ARCHIVIO} (${archivio.viaggi.length} viaggi)`);
    console.log('      Premi Ctrl+C per fermarlo.\n');
  });
} catch (errore) {
  if (errore instanceof ArchivioCorrottoError) {
    console.error(`\n  ✗  ${errore.message}\n`);
    process.exit(1);
  }
  throw errore;
}
