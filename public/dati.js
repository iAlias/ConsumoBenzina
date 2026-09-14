/**
 * Da dove arrivano e dove finiscono i dati.
 *
 * Questa è la versione locale: parla col server, che scrive su data.json.
 * `npm run build` sostituisce questo file nella copia dentro dist/ con uno che
 * punta a dati-locale.js, cioè al salvataggio nel browser.
 *
 * L'import è statico e non condizionale di proposito: un import dinamico
 * richiederebbe il top-level await, che i browser prima del 2021 non
 * conoscono: lì la pagina si disegnerebbe ma non risponderebbe a nulla.
 *
 * L'interfaccia esposta è sempre la stessa:
 *   leggi(periodo) · aggiungi(dati, periodo) · aggiorna(id, dati, periodo)
 *   elimina(id, periodo) · sostituisci(archivio, periodo) · esporta()
 *
 * Tutte restituiscono lo stato completo dell'applicazione, così chi disegna non
 * deve sapere se dietro c'è un server o il browser.
 */

export * from './dati-rete.js';
