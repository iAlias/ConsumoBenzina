<?php
/**
 * Consumo Benzina — archivio sul server.
 *
 * Legge e scrive data.json, nella stessa cartella di questo file. Non calcola
 * niente: litri, spese e statistiche restano in calcoli.js, che gira nella
 * pagina. Duplicare qui le formule significherebbe vederle divergere.
 *
 * Un solo endpoint, con GET e POST soltanto: parecchi hosting condivisi
 * bloccano PUT e DELETE, e un'app che funziona ovunque vale più di un'API
 * formalmente elegante.
 *
 *   GET  api.php                    → { viaggi: [...] }
 *   GET  api.php?diagnostica=1      → stato di PHP e dei permessi
 *   POST api.php  { azione: 'aggiungi',    viaggio: {...} }
 *   POST api.php  { azione: 'aggiorna',    id: '...', viaggio: {...} }
 *   POST api.php  { azione: 'elimina',     id: '...' }
 *   POST api.php  { azione: 'sostituisci', archivio: { viaggi: [...] } }
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

const ARCHIVIO = __DIR__ . '/data.json';
const VERSIONE_ARCHIVIO = 1;

/** Chiude la richiesta con un errore comprensibile a chi usa l'app. */
function errore(int $stato, string $messaggio): void
{
    http_response_code($stato);
    echo json_encode(['errore' => $messaggio], JSON_UNESCAPED_UNICODE);
    exit;
}

/** L'archivio su disco. Un file assente è normale al primo avvio. */
function leggiArchivio(): array
{
    if (!file_exists(ARCHIVIO)) {
        return ['versione' => VERSIONE_ARCHIVIO, 'viaggi' => []];
    }

    $contenuto = @file_get_contents(ARCHIVIO);
    if ($contenuto === false) {
        errore(500, 'Impossibile leggere data.json sul server: controlla i permessi del file.');
    }
    if (trim($contenuto) === '') {
        return ['versione' => VERSIONE_ARCHIVIO, 'viaggi' => []];
    }

    $dati = json_decode($contenuto, true);
    if (!is_array($dati) || !isset($dati['viaggi']) || !is_array($dati['viaggi'])) {
        // Non viene sovrascritto: i dati devono restare recuperabili a mano.
        errore(500, 'Il file data.json sul server è illeggibile e non verrà sovrascritto. Scaricalo e correggilo, oppure rinominalo per ripartire da zero.');
    }

    return ['versione' => VERSIONE_ARCHIVIO, 'viaggi' => array_values($dati['viaggi'])];
}

/**
 * Scrive in modo atomico: prima un file temporaneo, poi la rinomina. Se il
 * server si ferma a metà scrittura, l'archivio non resta troncato.
 */
function scriviArchivio(array $archivio): void
{
    $archivio['versione'] = VERSIONE_ARCHIVIO;
    $archivio['viaggi'] = array_values($archivio['viaggi']);

    $json = json_encode(
        $archivio,
        JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
    if ($json === false) {
        errore(500, 'Impossibile preparare i dati da salvare.');
    }

    $temporaneo = ARCHIVIO . '.tmp';
    if (@file_put_contents($temporaneo, $json . "\n", LOCK_EX) === false) {
        errore(500, 'Il server non può scrivere in questa cartella. Serve il permesso di scrittura (chmod 755 sulla cartella).');
    }
    if (!@rename($temporaneo, ARCHIVIO)) {
        @unlink($temporaneo);
        errore(500, 'Il server non è riuscito a sostituire data.json.');
    }
}

/** Numero finito e maggiore di zero, accettando anche la virgola decimale. */
function numeroPositivo($valore, string $campo): float
{
    if (is_string($valore)) {
        $valore = str_replace(',', '.', trim($valore));
    }
    if (!is_numeric($valore)) {
        errore(400, "Il campo \"$campo\" deve essere un numero maggiore di zero.");
    }

    $numero = (float) $valore;
    if (!is_finite($numero) || $numero <= 0) {
        errore(400, "Il campo \"$campo\" deve essere un numero maggiore di zero.");
    }

    return $numero;
}

/** Data AAAA-MM-GG che esiste davvero nel calendario. */
function dataValida($valore): string
{
    if (!is_string($valore) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $valore, $parti)) {
        errore(400, 'La data deve essere nel formato AAAA-MM-GG.');
    }
    if (!checkdate((int) $parti[2], (int) $parti[3], (int) $parti[1])) {
        errore(400, "La data $valore non esiste.");
    }

    return $valore;
}

/**
 * Valida un viaggio. La pagina controlla già i campi, ma il controllo che
 * conta è questo: una richiesta può arrivare da chiunque, non solo dal form.
 */
function validaViaggio($dati): array
{
    if (!is_array($dati)) {
        errore(400, 'Dati del viaggio mancanti.');
    }

    $descrizione = trim((string) ($dati['descrizione'] ?? ''));

    // mbstring non è installata ovunque: senza, si contano i byte anziché i
    // caratteri, che per un limite di guardia va benissimo.
    $lunghezza = function_exists('mb_strlen') ? mb_strlen($descrizione) : strlen($descrizione);
    if ($lunghezza > 200) {
        errore(400, 'La descrizione non può superare i 200 caratteri.');
    }

    return [
        'data' => dataValida($dati['data'] ?? null),
        'descrizione' => $descrizione,
        'km' => numeroPositivo($dati['km'] ?? null, 'km'),
        'kmPerLitro' => numeroPositivo($dati['kmPerLitro'] ?? null, 'km/l'),
        'prezzoLitro' => numeroPositivo($dati['prezzoLitro'] ?? null, 'prezzo al litro'),
    ];
}

/** Identificativo breve e univoco. */
function nuovoId(array $viaggi): string
{
    $presenti = array_column($viaggi, 'id');
    do {
        $id = bin2hex(random_bytes(3));
    } while (in_array($id, $presenti, true));

    return $id;
}

/** Posizione di un viaggio nell'archivio, o 404. */
function posizioneDi(array $viaggi, $id): int
{
    foreach ($viaggi as $posizione => $viaggio) {
        if (($viaggio['id'] ?? null) === $id) {
            return $posizione;
        }
    }
    errore(404, 'Viaggio non trovato: forse è già stato eliminato.');
}

function rispondi(array $archivio): void
{
    echo json_encode(['viaggi' => $archivio['viaggi']], JSON_UNESCAPED_UNICODE);
    exit;
}

// --- Diagnostica ----------------------------------------------------------
// Serve a capire in un colpo solo se l'hosting può ospitare l'archivio.

if (isset($_GET['diagnostica'])) {
    $cartella = __DIR__;
    $esiste = file_exists(ARCHIVIO);

    $prova = $cartella . '/.prova-scrittura';
    $puoScrivere = @file_put_contents($prova, 'x') !== false;
    if ($puoScrivere) {
        @unlink($prova);
    }

    echo json_encode([
        'php' => PHP_VERSION,
        'cartella' => $cartella,
        'archivioEsiste' => $esiste,
        'archivioScrivibile' => $esiste ? is_writable(ARCHIVIO) : null,
        'cartellaScrivibile' => $puoScrivere,
        'viaggi' => $esiste ? count(leggiArchivio()['viaggi']) : 0,
        'esito' => $puoScrivere
            ? 'Tutto a posto: il server può salvare i dati.'
            : 'PHP funziona ma non può scrivere in questa cartella: dal pannello dell\'hosting dai il permesso di scrittura (chmod 755).',
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

// --- Richieste ------------------------------------------------------------

$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($metodo === 'GET') {
    rispondi(leggiArchivio());
}

if ($metodo !== 'POST') {
    errore(405, 'Metodo non supportato.');
}

$corpo = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($corpo)) {
    errore(400, 'Richiesta non leggibile.');
}

$archivio = leggiArchivio();
$azione = $corpo['azione'] ?? '';

switch ($azione) {
    case 'aggiungi':
        $viaggio = validaViaggio($corpo['viaggio'] ?? null);
        $archivio['viaggi'][] = array_merge(['id' => nuovoId($archivio['viaggi'])], $viaggio);
        break;

    case 'aggiorna':
        $id = $corpo['id'] ?? null;
        $viaggio = validaViaggio($corpo['viaggio'] ?? null);
        $archivio['viaggi'][posizioneDi($archivio['viaggi'], $id)] = array_merge(['id' => $id], $viaggio);
        break;

    case 'elimina':
        array_splice($archivio['viaggi'], posizioneDi($archivio['viaggi'], $corpo['id'] ?? null), 1);
        break;

    case 'sostituisci':
        $arrivati = $corpo['archivio']['viaggi'] ?? null;
        if (!is_array($arrivati)) {
            errore(400, 'Il file non contiene una lista di viaggi.');
        }

        $nuovi = [];
        $idVisti = [];
        foreach ($arrivati as $indice => $viaggio) {
            $valido = validaViaggio($viaggio);
            $id = (string) ($viaggio['id'] ?? '');
            if ($id === '' || in_array($id, $idVisti, true)) {
                $id = nuovoId(array_map(fn($v) => ['id' => $v], $idVisti));
            }
            $idVisti[] = $id;
            $nuovi[] = array_merge(['id' => $id], $valido);
        }
        $archivio['viaggi'] = $nuovi;
        break;

    default:
        errore(400, 'Azione sconosciuta.');
}

scriviArchivio($archivio);
rispondi($archivio);
