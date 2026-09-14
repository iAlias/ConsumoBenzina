import test from 'node:test';
import assert from 'node:assert/strict';

import {
  arricchisci,
  statistiche,
  perMese,
  riepilogoMeseCorrente,
  elencoPeriodi,
  filtraPerPeriodo,
  ordinaPerData,
  ultimiValori,
} from '../public/calcoli.js';

/** Confronto tra numeri in virgola mobile. */
function vicino(effettivo, atteso, tolleranza = 1e-9) {
  assert.ok(
    Math.abs(effettivo - atteso) < tolleranza,
    `atteso ${atteso}, ottenuto ${effettivo}`,
  );
}

function viaggio(campi) {
  return {
    id: 'x',
    data: '2026-08-17',
    descrizione: '',
    km: 100,
    kmPerLitro: 10,
    prezzoLitro: 1.5,
    ...campi,
  };
}

test('arricchisci calcola litri e spesa di un viaggio', () => {
  const v = arricchisci(viaggio({ km: 225, kmPerLitro: 16.4, prezzoLitro: 1.789 }));

  vicino(v.litri, 225 / 16.4);
  vicino(v.spesa, (225 / 16.4) * 1.789);
});

test('arricchisci conserva i campi originali', () => {
  const v = arricchisci(viaggio({ id: 'abc', descrizione: 'Roma - Napoli' }));

  assert.equal(v.id, 'abc');
  assert.equal(v.descrizione, 'Roma - Napoli');
  assert.equal(v.km, 100);
});

test('statistiche somma km, litri e spesa di piu viaggi', () => {
  const s = statistiche([
    viaggio({ km: 100, kmPerLitro: 10, prezzoLitro: 2 }), // 10 l, 20 €
    viaggio({ km: 300, kmPerLitro: 15, prezzoLitro: 2 }), // 20 l, 40 €
  ]);

  assert.equal(s.numeroViaggi, 2);
  vicino(s.kmTotali, 400);
  vicino(s.litriTotali, 30);
  vicino(s.spesaTotale, 60);
});

test('la media km/l e ponderata sui km, non aritmetica', () => {
  // 20 km a 5 km/l (4 l) + 500 km a 25 km/l (20 l) = 520 km con 24 l
  const s = statistiche([
    viaggio({ km: 20, kmPerLitro: 5 }),
    viaggio({ km: 500, kmPerLitro: 25 }),
  ]);

  vicino(s.mediaKmL, 520 / 24); // ~21,67
  assert.notEqual(Math.round(s.mediaKmL * 100), Math.round(15 * 100)); // media aritmetica = 15
});

test('statistiche calcola costo al km, spesa media e prezzo medio', () => {
  const s = statistiche([
    viaggio({ km: 100, kmPerLitro: 10, prezzoLitro: 2 }), // 10 l, 20 €
    viaggio({ km: 300, kmPerLitro: 15, prezzoLitro: 1 }), // 20 l, 20 €
  ]);

  vicino(s.costoPerKm, 40 / 400);
  vicino(s.spesaMediaViaggio, 40 / 2);
  vicino(s.prezzoMedioLitro, 40 / 30);
});

test('statistiche su elenco vuoto: totali a zero e medie nulle', () => {
  const s = statistiche([]);

  assert.equal(s.numeroViaggi, 0);
  assert.equal(s.kmTotali, 0);
  assert.equal(s.litriTotali, 0);
  assert.equal(s.spesaTotale, 0);
  assert.equal(s.mediaKmL, null);
  assert.equal(s.costoPerKm, null);
  assert.equal(s.spesaMediaViaggio, null);
  assert.equal(s.prezzoMedioLitro, null);
});

test('perMese aggrega i viaggi e ordina i mesi in ordine crescente', () => {
  const mesi = perMese([
    viaggio({ data: '2026-08-02', km: 100, kmPerLitro: 10, prezzoLitro: 2 }),
    viaggio({ data: '2026-06-15', km: 200, kmPerLitro: 20, prezzoLitro: 2 }),
    viaggio({ data: '2026-08-30', km: 300, kmPerLitro: 10, prezzoLitro: 2 }),
  ]);

  assert.deepEqual(mesi.map((m) => m.mese), ['2026-06', '2026-08']);
  vicino(mesi[1].km, 400);
  vicino(mesi[1].litri, 40);
  vicino(mesi[1].spesa, 80);
  vicino(mesi[1].mediaKmL, 10);
});

test('perMese su elenco vuoto restituisce un array vuoto', () => {
  assert.deepEqual(perMese([]), []);
});

test('riepilogoMeseCorrente confronta la spesa con il mese precedente', () => {
  const r = riepilogoMeseCorrente(
    [
      viaggio({ data: '2026-08-05', km: 100, kmPerLitro: 10, prezzoLitro: 2 }), // 20 €
      viaggio({ data: '2026-07-05', km: 200, kmPerLitro: 10, prezzoLitro: 2 }), // 40 €
    ],
    new Date('2026-08-17T12:00:00'),
  );

  assert.equal(r.mese, '2026-08');
  vicino(r.km, 100);
  vicino(r.spesa, 20);
  vicino(r.variazioneSpesa, -50); // da 40 € a 20 €
});

test('riepilogoMeseCorrente non calcola la variazione senza il mese precedente', () => {
  const r = riepilogoMeseCorrente(
    [viaggio({ data: '2026-08-05', km: 100 })],
    new Date('2026-08-17T12:00:00'),
  );

  assert.equal(r.variazioneSpesa, null);
});

test('riepilogoMeseCorrente gestisce un mese corrente senza viaggi', () => {
  const r = riepilogoMeseCorrente(
    [viaggio({ data: '2026-07-05', km: 200, kmPerLitro: 10, prezzoLitro: 2 })],
    new Date('2026-08-17T12:00:00'),
  );

  assert.equal(r.mese, '2026-08');
  assert.equal(r.km, 0);
  assert.equal(r.spesa, 0);
  // Il mese precedente esiste: -100% è un dato vero, non un dato mancante.
  vicino(r.variazioneSpesa, -100);
});

test('il mese precedente a gennaio e dicembre dell anno prima', () => {
  const r = riepilogoMeseCorrente(
    [
      viaggio({ data: '2026-01-10', km: 100, kmPerLitro: 10, prezzoLitro: 2 }), // 20 €
      viaggio({ data: '2025-12-20', km: 50, kmPerLitro: 10, prezzoLitro: 2 }), // 10 €
    ],
    new Date('2026-01-31T12:00:00'),
  );

  vicino(r.variazioneSpesa, 100);
});

test('elencoPeriodi elenca anni e mesi dal piu recente', () => {
  const periodi = elencoPeriodi([
    viaggio({ data: '2025-12-01' }),
    viaggio({ data: '2026-08-17' }),
    viaggio({ data: '2026-06-03' }),
    viaggio({ data: '2026-08-01' }),
  ]);

  assert.deepEqual(periodi, [
    { valore: '2026', tipo: 'anno' },
    { valore: '2026-08', tipo: 'mese' },
    { valore: '2026-06', tipo: 'mese' },
    { valore: '2025', tipo: 'anno' },
    { valore: '2025-12', tipo: 'mese' },
  ]);
});

test('filtraPerPeriodo seleziona per anno, per mese o tutto', () => {
  const viaggi = [
    viaggio({ id: 'a', data: '2026-08-17' }),
    viaggio({ id: 'b', data: '2026-06-03' }),
    viaggio({ id: 'c', data: '2025-12-01' }),
  ];

  assert.deepEqual(filtraPerPeriodo(viaggi, 'tutti').map((v) => v.id), ['a', 'b', 'c']);
  assert.deepEqual(filtraPerPeriodo(viaggi, '2026').map((v) => v.id), ['a', 'b']);
  assert.deepEqual(filtraPerPeriodo(viaggi, '2026-08').map((v) => v.id), ['a']);
});

test('filtraPerPeriodo tratta un periodo sconosciuto come tutti', () => {
  const viaggi = [viaggio({ id: 'a' })];

  assert.equal(filtraPerPeriodo(viaggi, undefined).length, 1);
  assert.equal(filtraPerPeriodo(viaggi, 'boh').length, 1);
});

test('ordinaPerData mette per primo il viaggio piu recente', () => {
  const ordinati = ordinaPerData([
    viaggio({ id: 'vecchio', data: '2026-06-01' }),
    viaggio({ id: 'nuovo', data: '2026-08-17' }),
    viaggio({ id: 'medio', data: '2026-07-04' }),
  ]);

  assert.deepEqual(ordinati.map((v) => v.id), ['nuovo', 'medio', 'vecchio']);
});

test('a parita di data ordinaPerData mette per primo l inserito per ultimo', () => {
  const ordinati = ordinaPerData([
    viaggio({ id: 'primo', data: '2026-08-17' }),
    viaggio({ id: 'secondo', data: '2026-08-17' }),
  ]);

  assert.deepEqual(ordinati.map((v) => v.id), ['secondo', 'primo']);
});

test('ordinaPerData non modifica l elenco ricevuto', () => {
  const viaggi = [
    viaggio({ id: 'vecchio', data: '2026-06-01' }),
    viaggio({ id: 'nuovo', data: '2026-08-17' }),
  ];

  ordinaPerData(viaggi);

  assert.deepEqual(viaggi.map((v) => v.id), ['vecchio', 'nuovo']);
});

test('ultimiValori prende consumo e prezzo del viaggio piu recente', () => {
  const valori = ultimiValori([
    viaggio({ data: '2026-06-01', kmPerLitro: 12, prezzoLitro: 1.7 }),
    viaggio({ data: '2026-08-17', kmPerLitro: 16.4, prezzoLitro: 1.789 }),
    viaggio({ data: '2026-07-04', kmPerLitro: 14, prezzoLitro: 1.75 }),
  ]);

  assert.deepEqual(valori, { kmPerLitro: 16.4, prezzoLitro: 1.789 });
});

test('ultimiValori guarda la data, non l ordine di inserimento', () => {
  // Un viaggio di giugno inserito oggi non deve suggerire il prezzo di giugno.
  const valori = ultimiValori([
    viaggio({ data: '2026-08-17', kmPerLitro: 16.4, prezzoLitro: 1.789 }),
    viaggio({ data: '2026-06-01', kmPerLitro: 12, prezzoLitro: 1.7 }),
  ]);

  assert.equal(valori.prezzoLitro, 1.789);
});

test('ultimiValori non propone nulla su un archivio vuoto', () => {
  assert.equal(ultimiValori([]), null);
});
