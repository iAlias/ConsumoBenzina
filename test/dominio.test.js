import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validaViaggio,
  validaArchivio,
  componiRisposta,
  nuovoId,
  DatiNonValidiError,
} from '../public/dominio.js';

const viaggioValido = {
  data: '2026-08-17',
  descrizione: '  Roma - Napoli  ',
  km: 225,
  kmPerLitro: 16.4,
  prezzoLitro: 1.789,
};

test('validaViaggio accetta dati corretti e ripulisce la descrizione', () => {
  const viaggio = validaViaggio(viaggioValido);

  assert.equal(viaggio.descrizione, 'Roma - Napoli');
  assert.equal(viaggio.km, 225);
});

test('validaViaggio accetta i numeri scritti con la virgola', () => {
  const viaggio = validaViaggio({ ...viaggioValido, km: '225,5', prezzoLitro: '1,789' });

  assert.equal(viaggio.km, 225.5);
  assert.equal(viaggio.prezzoLitro, 1.789);
});

test('validaViaggio rifiuta numeri non positivi', () => {
  for (const campo of ['km', 'kmPerLitro', 'prezzoLitro']) {
    assert.throws(
      () => validaViaggio({ ...viaggioValido, [campo]: 0 }),
      DatiNonValidiError,
      `${campo} a zero doveva essere rifiutato`,
    );
    assert.throws(
      () => validaViaggio({ ...viaggioValido, [campo]: -1 }),
      DatiNonValidiError,
    );
    assert.throws(
      () => validaViaggio({ ...viaggioValido, [campo]: 'ciao' }),
      DatiNonValidiError,
    );
  }
});

test('validaViaggio rifiuta date malformate o inesistenti', () => {
  assert.throws(() => validaViaggio({ ...viaggioValido, data: '17/08/2026' }), DatiNonValidiError);
  assert.throws(() => validaViaggio({ ...viaggioValido, data: '2026-02-30' }), DatiNonValidiError);
  assert.throws(() => validaViaggio({ ...viaggioValido, data: undefined }), DatiNonValidiError);
});

test('validaViaggio rifiuta descrizioni troppo lunghe', () => {
  assert.throws(
    () => validaViaggio({ ...viaggioValido, descrizione: 'x'.repeat(201) }),
    DatiNonValidiError,
  );
});

test('nuovoId non ripete un id gia presente', () => {
  const esistenti = [{ id: 'aaa' }, { id: 'bbb' }];
  const id = nuovoId(esistenti);

  assert.ok(id.length > 0);
  assert.ok(!esistenti.some((v) => v.id === id));
});

test('validaArchivio accetta un file corretto', () => {
  const archivio = validaArchivio({
    versione: 1,
    viaggi: [{ id: 'abc', ...viaggioValido }],
  });

  assert.equal(archivio.viaggi.length, 1);
  assert.equal(archivio.viaggi[0].id, 'abc');
});

test('validaArchivio dice quale viaggio del file e sbagliato', () => {
  assert.throws(
    () =>
      validaArchivio({
        viaggi: [{ id: 'a', ...viaggioValido }, { id: 'b', ...viaggioValido, km: -3 }],
      }),
    /Viaggio numero 2/,
  );
});

test('validaArchivio rifiuta un file senza lista di viaggi', () => {
  assert.throws(() => validaArchivio({ roba: [] }), DatiNonValidiError);
  assert.throws(() => validaArchivio(null), DatiNonValidiError);
});

test('validaArchivio assegna un id ai viaggi che non ce l hanno o lo ripetono', () => {
  const archivio = validaArchivio({
    viaggi: [
      { ...viaggioValido },
      { id: 'doppio', ...viaggioValido },
      { id: 'doppio', ...viaggioValido },
    ],
  });

  const id = archivio.viaggi.map((v) => v.id);
  assert.equal(new Set(id).size, 3, `id non univoci: ${id.join(', ')}`);
});

test('componiRisposta filtra i viaggi ma non il riepilogo del mese', () => {
  const risposta = componiRisposta(
    [
      { id: 'a', ...viaggioValido, data: '2026-08-05', km: 100, kmPerLitro: 10, prezzoLitro: 2 },
      { id: 'b', ...viaggioValido, data: '2026-06-01', km: 300, kmPerLitro: 10, prezzoLitro: 2 },
    ],
    '2026-06',
  );

  assert.equal(risposta.periodo, '2026-06');
  assert.equal(risposta.viaggi.length, 1);
  assert.equal(risposta.statistiche.kmTotali, 300);
  // Il mese corrente e i valori proposti guardano sempre tutto l'archivio.
  assert.equal(risposta.mensili.length, 2);
  assert.deepEqual(risposta.periodi.map((p) => p.valore), ['2026', '2026-08', '2026-06']);
});

test('componiRisposta aggiunge litri e spesa a ogni viaggio', () => {
  const risposta = componiRisposta(
    [{ id: 'a', ...viaggioValido, km: 100, kmPerLitro: 10, prezzoLitro: 2 }],
    'tutti',
  );

  assert.equal(risposta.viaggi[0].litri, 10);
  assert.equal(risposta.viaggi[0].spesa, 20);
});

test('componiRisposta regge un archivio vuoto', () => {
  const risposta = componiRisposta([], 'tutti');

  assert.deepEqual(risposta.viaggi, []);
  assert.deepEqual(risposta.periodi, []);
  assert.deepEqual(risposta.mensili, []);
  assert.equal(risposta.ultimiValori, null);
  assert.equal(risposta.statistiche.mediaKmL, null);
});
