/**
 * Prepara dist/: la cartella da caricare sullo spazio web.
 *
 * Non c'è compilazione né minificazione, perché non c'è niente da compilare:
 * l'app è HTML, CSS e moduli ES che i browser eseguono direttamente. Questo
 * script copia i file che servono e riscrive dati.js, cioè decide dove
 * finiscono i dati.
 *
 *   npm run build          archivio sul server, in data.json (serve PHP)
 *   npm run build locale   archivio nel browser di chi apre la pagina
 */

import { cp, mkdir, rm, writeFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = dirname(fileURLToPath(import.meta.url));
const SORGENTE = join(RADICE, 'public');
const USCITA = join(RADICE, 'dist');

const MODALITA = process.argv[2] === 'locale' ? 'locale' : 'php';

const VARIANTI = {
  php: {
    // dati-rete.js parla col server Node, che sull'hosting non c'è.
    escludi: ['dati.js', 'dati-rete.js', 'dati-locale.js'],
    riesporta: './dati-php.js',
    extra: ['api.php', '.htaccess'],
    dove: 'in data.json sul server, condivisi tra tutti i dispositivi',
  },
  locale: {
    escludi: ['dati.js', 'dati-rete.js', 'dati-php.js'],
    riesporta: './dati-locale.js',
    extra: [],
    dove: 'nel browser di chi apre la pagina, un archivio per dispositivo',
  },
};

const variante = VARIANTI[MODALITA];

await rm(USCITA, { recursive: true, force: true });
await mkdir(USCITA, { recursive: true });

const daCopiare = (await readdir(SORGENTE)).filter((nome) => !variante.escludi.includes(nome));

for (const nome of daCopiare) {
  await cp(join(SORGENTE, nome), join(USCITA, nome), { recursive: true });
}

for (const nome of variante.extra) {
  await cp(join(RADICE, 'php', nome), join(USCITA, nome));
}

await writeFile(
  join(USCITA, 'dati.js'),
  `/**
 * Generato da build.js — non modificare a mano.
 *
 * In questa copia i dati vengono salvati ${variante.dove}.
 */

export * from '${variante.riesporta}';
`,
  'utf8',
);

const totale = daCopiare.length + variante.extra.length + 1;

console.log(`\n  ✓  Pronta la cartella dist/ — modalità "${MODALITA}", ${totale} file`);
console.log(`     Dati salvati ${variante.dove}.\n`);
console.log('     Carica il CONTENUTO di dist/ nella cartella pubblica del tuo');
console.log('     hosting, non la cartella stessa.\n');

if (MODALITA === 'php') {
  console.log('     Poi apri api.php?diagnostica=1 nel browser: dice in una riga');
  console.log('     se il server può salvare i dati.\n');
  console.log('     Attenzione: .htaccess è un file nascosto, controlla che il');
  console.log('     programma FTP lo mostri e lo carichi.\n');
}
