/**
 * Logica di calcolo pura: riceve dati, restituisce numeri.
 * Non conosce né HTTP né filesystem, ed è l'unico posto in cui vivono le formule.
 *
 * Sta in public/ perché lo usano sia il server sia il browser: nella versione
 * statica i calcoli avvengono nella pagina, e duplicare le formule
 * significherebbe vederle divergere.
 *
 *   litri = km / kmPerLitro
 *   spesa = litri * prezzoLitro
 *
 * Nessun valore viene arrotondato qui: l'arrotondamento è una scelta di
 * presentazione e appartiene all'interfaccia.
 */

/** Aggiunge a un viaggio i campi derivati `litri` e `spesa`. */
export function arricchisci(viaggio) {
  const litri = viaggio.km / viaggio.kmPerLitro;
  return { ...viaggio, litri, spesa: litri * viaggio.prezzoLitro };
}

/** Divisione che restituisce null quando il divisore è nullo. */
function dividi(dividendo, divisore) {
  return divisore > 0 ? dividendo / divisore : null;
}

/** Somma km, litri e spesa di un insieme di viaggi. */
function totali(viaggi) {
  return viaggi.reduce(
    (acc, viaggio) => {
      const { litri, spesa } = arricchisci(viaggio);
      return {
        km: acc.km + viaggio.km,
        litri: acc.litri + litri,
        spesa: acc.spesa + spesa,
      };
    },
    { km: 0, litri: 0, spesa: 0 },
  );
}

/**
 * Statistiche aggregate. Con un insieme vuoto i totali valgono 0 e le medie
 * null: l'interfaccia mostra un trattino invece di un numero senza senso.
 */
export function statistiche(viaggi) {
  const { km, litri, spesa } = totali(viaggi);

  return {
    numeroViaggi: viaggi.length,
    kmTotali: km,
    litriTotali: litri,
    spesaTotale: spesa,
    // Ponderata sui km: un viaggio da 500 km pesa più di uno da 20 km.
    mediaKmL: dividi(km, litri),
    costoPerKm: dividi(spesa, km),
    spesaMediaViaggio: dividi(spesa, viaggi.length),
    prezzoMedioLitro: dividi(spesa, litri),
  };
}

/** Il mese di una data `YYYY-MM-DD`, nel formato `YYYY-MM`. */
function meseDi(data) {
  return data.slice(0, 7);
}

/** Aggrega i viaggi per mese, dal più vecchio al più recente. */
export function perMese(viaggi) {
  const gruppi = new Map();

  for (const viaggio of viaggi) {
    const mese = meseDi(viaggio.data);
    if (!gruppi.has(mese)) gruppi.set(mese, []);
    gruppi.get(mese).push(viaggio);
  }

  return [...gruppi.keys()]
    .sort()
    .map((mese) => {
      const { km, litri, spesa } = totali(gruppi.get(mese));
      return { mese, km, litri, spesa, mediaKmL: dividi(km, litri) };
    });
}

/** Il mese di un oggetto Date, nel formato `YYYY-MM`. */
function meseDiData(data) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Riepilogo del mese in corso con la variazione percentuale della spesa
 * rispetto al mese precedente. La variazione è null se il mese precedente non
 * ha viaggi: non esiste un termine di paragone.
 */
export function riepilogoMeseCorrente(viaggi, oggi = new Date()) {
  const mese = meseDiData(oggi);
  const precedente = meseDiData(new Date(oggi.getFullYear(), oggi.getMonth() - 1, 1));

  const correnti = totali(viaggi.filter((v) => meseDi(v.data) === mese));
  const precedenti = totali(viaggi.filter((v) => meseDi(v.data) === precedente));

  const variazioneSpesa =
    precedenti.spesa > 0
      ? ((correnti.spesa - precedenti.spesa) / precedenti.spesa) * 100
      : null;

  return {
    mese,
    km: correnti.km,
    litri: correnti.litri,
    spesa: correnti.spesa,
    variazioneSpesa,
  };
}

/**
 * I periodi selezionabili nel filtro, dal più recente: ogni anno seguito dai
 * suoi mesi.
 */
export function elencoPeriodi(viaggi) {
  const mesi = [...new Set(viaggi.map((v) => meseDi(v.data)))].sort().reverse();
  const periodi = [];
  let annoCorrente = null;

  for (const mese of mesi) {
    const anno = mese.slice(0, 4);
    if (anno !== annoCorrente) {
      periodi.push({ valore: anno, tipo: 'anno' });
      annoCorrente = anno;
    }
    periodi.push({ valore: mese, tipo: 'mese' });
  }

  return periodi;
}

/**
 * Dal più recente al meno recente; a parità di data, l'inserito per ultimo.
 * Restituisce un nuovo array: l'ordine dell'archivio è quello di inserimento e
 * non va perso.
 */
export function ordinaPerData(viaggi) {
  return viaggi
    .map((viaggio, posizione) => ({ viaggio, posizione }))
    .sort((a, b) =>
      a.viaggio.data === b.viaggio.data
        ? b.posizione - a.posizione
        : b.viaggio.data.localeCompare(a.viaggio.data),
    )
    .map(({ viaggio }) => viaggio);
}

/**
 * Consumo e prezzo da proporre per il prossimo viaggio, presi dal viaggio con
 * la data più recente. Si guarda la data e non l'ordine di inserimento perché
 * un viaggio vecchio registrato in ritardo non dice nulla sui prezzi di oggi.
 */
export function ultimiValori(viaggi) {
  if (viaggi.length === 0) return null;

  const [ultimo] = ordinaPerData(viaggi);
  return { kmPerLitro: ultimo.kmPerLitro, prezzoLitro: ultimo.prezzoLitro };
}

/**
 * Filtra i viaggi per anno (`2026`), mese (`2026-08`) o tutti.
 * Un periodo non riconosciuto equivale a nessun filtro.
 */
export function filtraPerPeriodo(viaggi, periodo) {
  if (/^\d{4}$/.test(periodo)) {
    return viaggi.filter((v) => v.data.slice(0, 4) === periodo);
  }
  if (/^\d{4}-\d{2}$/.test(periodo)) {
    return viaggi.filter((v) => meseDi(v.data) === periodo);
  }
  return viaggi;
}
