# Consumo Benzina — Documento di design

Data: 2026-08-17

## Obiettivo

Applicazione web locale per monitorare i consumi dell'auto. L'utente inserisce, per
ogni viaggio, i chilometri percorsi, il consumo in km/l e il prezzo del carburante
al litro; l'applicazione calcola litri consumati e spesa, mostra statistiche
aggregate in alto e l'elenco dei viaggi in basso.

Nessun database: l'archivio è un singolo file `data.json` nella cartella del
progetto.

## Scelte fondanti

**Server locale Node + Express.** Un browser non può scrivere su file locali, quindi
serve un processo che lo faccia. Express serve la cartella `public/` ed espone
quattro endpoint REST. Nessun build step: si modifica un file e si ricarica la
pagina.

**La spesa non viene salvata, viene calcolata.** In `data.json` finiscono solo i dati
inseriti dall'utente. Litri ed euro sono valori derivati, ricalcolati ad ogni
lettura. Così non possono andare fuori sincrono quando un viaggio viene corretto.

**Logica di calcolo isolata.** `lib/calcoli.js` contiene funzioni pure che non
conoscono né HTTP né filesystem: ricevono dati, restituiscono numeri. È l'unico
modulo che ha bisogno di test approfonditi.

## Due modalità di salvataggio

L'applicazione esiste in due versioni che condividono tutto il codice tranne il
punto in cui i dati vengono scritti:

- **rete** — il server Node scrive su `data.json` (uso locale, `npm start`);
- **locale** — il browser scrive in `localStorage` (versione pubblicata su uno
  spazio web statico, generata da `npm run build`).

La scelta sta in `public/dati.js`, un file di una riga che riesporta
l'implementazione giusta e che `build.js` riscrive nella copia dentro `dist/`.
La modalità è decisa al momento della pubblicazione e non indovinata a runtime,
dove un server momentaneamente irraggiungibile porterebbe a scrivere nel posto
sbagliato.

L'import è statico e non condizionale: sceglierlo a runtime richiederebbe il
top-level await, che i browser precedenti al 2021 non conoscono. Lì la pagina
si disegnerebbe e poi non risponderebbe a nulla — un guasto silenzioso, il
peggior tipo. Per lo stesso motivo l'interfaccia non usa `replaceChildren()`.

`dati.js` espone l'unica interfaccia che l'interfaccia grafica conosce
(`leggi`, `aggiungi`, `aggiorna`, `elimina`, `sostituisci`, `esporta`). Le
formule e le regole vivono in
`public/calcoli.js` e `public/dominio.js`, usati sia dal server sia dal browser:
duplicarli significherebbe vederli divergere.

Nella modalità locale i dati appartengono al browser che li ha scritti. È il
motivo per cui esistono Esporta e Importa, ed è scritto nell'intestazione della
pagina: chi la usa deve sapere dove stanno i suoi dati.

## Struttura del progetto

```
Consumo Benzina/
├── server.js          # Express: file statici + API REST (modalità rete)
├── build.js           # prepara dist/ per l'hosting statico
├── data.json          # archivio dati (creato al primo avvio)
├── package.json
├── lib/
│   └── archivio.js    # lettura/scrittura atomica di data.json
├── test/
│   ├── calcoli.test.js
│   └── dominio.test.js
└── public/
    ├── calcoli.js     # formule e statistiche (condiviso)
    ├── dominio.js     # validazione e risposta completa (condiviso)
    ├── dati.js        # indica la fonte; build.js lo riscrive in dist/
    ├── dati-rete.js   # salvataggio via server
    ├── dati-locale.js # salvataggio in localStorage
    ├── app.js         # interfaccia
    ├── index.html
    └── stile.css
```

Flusso in modalità rete: browser → `dati-rete.js` → `server.js` →
`archivio.js` → `dominio.js` → risposta JSON.

Flusso in modalità locale: browser → `dati-locale.js` → `localStorage` →
`dominio.js`, tutto nella stessa pagina.

`calcoli.js` e `dominio.js` stanno in `public/` perché devono essere serviti al
browser: è la posizione che li rende davvero condivisi invece che duplicati.

## Formato dati

```json
{
  "versione": 1,
  "viaggi": [
    {
      "id": "k3f9a2",
      "data": "2026-08-17",
      "descrizione": "Roma - Napoli",
      "km": 225,
      "kmPerLitro": 16.4,
      "prezzoLitro": 1.789
    }
  ]
}
```

- `versione`: intero, consente migrazioni future senza rompere i file esistenti.
- `id`: stringa breve generata dal server, univoca all'interno del file.
- `data`: formato `YYYY-MM-DD`.
- `descrizione`: stringa, può essere vuota. Massimo 200 caratteri.
- `km`, `kmPerLitro`, `prezzoLitro`: numeri strettamente maggiori di zero.

**Scrittura atomica.** Ogni salvataggio scrive su `data.json.tmp` e poi rinomina il
file. Un'interruzione a metà scrittura non lascia un archivio troncato.

**Archivio corrotto.** Se `data.json` esiste ma non è JSON valido, il server non lo
sovrascrive: si arresta all'avvio con un messaggio che indica il percorso del file,
lasciando all'utente la possibilità di recuperarlo.

## Formule

```
litri  = km / kmPerLitro
spesa  = litri × prezzoLitro
```

Statistiche aggregate su un insieme di viaggi:

| Statistica | Formula |
|---|---|
| Km totali | somma dei `km` |
| Litri totali | somma dei litri di ogni viaggio |
| Spesa totale | somma delle spese di ogni viaggio |
| Media km/l | `km totali / litri totali` (ponderata sui km) |
| Costo al km | `spesa totale / km totali` |
| Spesa media a viaggio | `spesa totale / numero viaggi` |
| Prezzo medio carburante | `spesa totale / litri totali` |

La media km/l è **ponderata sui chilometri**, non aritmetica sui valori inseriti: un
viaggio da 500 km deve pesare più di uno da 20 km.

Con zero viaggi tutti i totali valgono `0` e le medie valgono `null`; l'interfaccia
mostra `—` al posto di un numero privo di significato.

## API

| Metodo | Rotta | Corpo | Risposta |
|---|---|---|---|
| `GET` | `/api/viaggi?periodo=` | — | `{ viaggi, statistiche, periodi, meseCorrente, mensili, ultimiValori }` |
| `POST` | `/api/viaggi` | dati viaggio | elenco aggiornato |
| `PUT` | `/api/viaggi/:id` | dati viaggio | elenco aggiornato |
| `DELETE` | `/api/viaggi/:id` | — | elenco aggiornato |

Ogni viaggio restituito include i campi derivati `litri` e `spesa`. I viaggi sono
ordinati per data decrescente, e a parità di data per ordine di inserimento
decrescente.

**Il filtro periodo è lato server.** `periodo` accetta `tutti` (default), un anno
(`2026`) o un mese (`2026-08`). Il campo `viaggi` e le statistiche si riferiscono
sempre al periodo richiesto, mentre `periodi` elenca tutti i valori selezionabili
ricavati dall'archivio completo. Così la logica di aggregazione vive in un solo
posto — `lib/calcoli.js`, coperto dai test — e non viene riscritta nel browser. Il
blocco "mese corrente" e il grafico sono calcolati sempre sull'archivio intero,
indipendentemente dal filtro.

**Validazione lato server.** Il browser non è l'unica difesa: il server verifica
tipi, positività dei numeri e formato della data, e risponde `400` con
`{ errore: "messaggio in italiano" }`. Un `id` inesistente su `PUT`/`DELETE`
risponde `404`.

## Interfaccia

Tema scuro da quadro strumenti: sfondo `#12141a`, numeri grandi con accenti ambra,
verde per le variazioni positive.

### Fascia statistiche (in alto)

Tre blocchi:

1. **Principale** — km totali, media km/l, spesa totale, numero viaggi.
2. **Efficienza** — costo medio al km, spesa media a viaggio, litri totali, prezzo
   medio del carburante.
3. **Mese corrente** — km e spesa del mese in corso, con variazione percentuale
   rispetto al mese precedente. Verde se la spesa è calata, ambra se è cresciuta.
   Se manca il mese precedente, la variazione non viene mostrata.

### Grafico

SVG generato a mano, senza librerie esterne. Barre della spesa mensile con
sovrapposta la linea del consumo medio (km/l) per mese, su un asse secondario.
Mostra ultimi 12 mesi con dati. Con meno di due mesi disponibili, il grafico è
nascosto.

### Form di inserimento

Riga unica: data (default oggi), descrizione, km, km/l, €/litro. Mentre l'utente
digita compare l'anteprima calcolata in tempo reale: `≈ 13,7 litri — 24,53 €`.

**Valori proposti.** Km/l e prezzo al litro arrivano già compilati con quelli del
viaggio dalla data più recente: tra un rifornimento e l'altro cambiano poco, e
ridigitarli ogni volta è la parte più noiosa dell'inserimento. Si guarda la data
e non l'ordine di inserimento, perché un viaggio vecchio registrato in ritardo
non dice nulla sui prezzi di oggi.

I campi proposti hanno bordo tratteggiato e testo attenuato: sono da confermare,
non dati già inseriti. Alla prima digitazione tornano normali. La proposta tocca
solo campi vuoti o ancora contrassegnati come proposti, quindi un aggiornamento
dei dati non sovrascrive mai quello che l'utente sta scrivendo, e in modalità
modifica non interviene affatto.

Il pulsante *modifica* su una riga carica il viaggio nel form, che passa in
modalità modifica con pulsanti *Salva modifiche* e *Annulla*.

### Lista viaggi (in basso)

Filtro periodo: Tutti / anno / singolo mese. Al cambio del filtro il client richiede
di nuovo `/api/viaggi?periodo=…`: le fasce statistiche 1 e 2 si riferiscono al
periodo selezionato, mentre la card "mese corrente" e il grafico restano sempre
riferiti all'archivio completo.

Colonne: data, descrizione, km, km/l, litri, spesa (in evidenza), azioni
duplica/modifica/elimina.

**Duplica** ripete un tragitto abituale: riapre il form come nuovo viaggio con
descrizione e valori copiati e la data di oggi, con il campo km già selezionato
per correggerlo al volo. Sono valori scelti da un viaggio preciso, quindi non
vengono contrassegnati come proposti.

L'eliminazione chiede conferma **sul pulsante stesso**: il primo click lo
trasforma in "Confermi?", il secondo elimina, e dopo quattro secondi senza
risposta torna com'era. Niente finestra di sistema: interromperebbe il flusso e
stonerebbe con il resto dell'interfaccia.

### Responsive

- **Sotto i 960 px** le due colonne delle statistiche si impilano.
- **Sotto i 700 px** i valori passano a due colonne, i campi del form si
  allargano a 16 px di corpo (sotto questa soglia i browser mobili ingrandiscono
  la pagina da soli quando il campo prende il fuoco), i pulsanti diventano aree
  toccabili col dito e ogni riga della tabella diventa una scheda: descrizione e
  spesa sulla prima riga, data e metriche in tono minore sulla seconda.
- **Sotto i 420 px** i pulsanti di riga scendono su una riga propria, così le
  metriche restano leggibili anche con km a quattro cifre.

La pagina non deve mai scorrere in orizzontale a nessuna larghezza tra 1600 e
320 px. Il vincolo va verificato misurando, non a occhio su tre schermi: un solo
elemento che non sa andare a capo allarga l'intera griglia della pagina. Per
questo `.pagina` usa `minmax(0, 1fr)` invece di `1fr` — senza il minimo a zero
una griglia non scende mai sotto il contenuto minimo dei suoi figli.

### Esporta e importa

Due pulsanti nell'intestazione. **Esporta** scarica l'archivio nudo, nello
stesso formato di `data.json`, con la data nel nome del file. **Importa**
sostituisce l'intero archivio, e siccome è distruttivo dice prima quanti viaggi
arrivano e quanti se ne perdono, chiedendo conferma nella barra dei messaggi.
Un file non valido viene rifiutato indicando quale viaggio è sbagliato.

## Errori

Se il server non risponde o il salvataggio fallisce, compare un avviso in cima alla
pagina e **i dati digitati restano nel form**: l'utente non perde ciò che stava
inserendo. Gli errori di validazione vengono mostrati con lo stesso meccanismo.

## Test

`node:test` (incluso in Node, nessuna dipendenza aggiuntiva), eseguiti con
`npm test`. Coprono `lib/calcoli.js`:

- calcolo di litri e spesa per un singolo viaggio;
- media km/l ponderata, verificando che differisca dalla media aritmetica;
- totali su più viaggi;
- aggregazione mensile e ordinamento dei mesi;
- confronto mese corrente / mese precedente, incluso il caso di mese precedente
  assente;
- ordinamento per data, incluso il pareggio di date e la non alterazione
  dell'elenco ricevuto;
- valori proposti: presi dalla data più recente e non dall'ultimo inserimento,
  `null` su archivio vuoto;
- insieme vuoto: totali a zero, medie a `null`.

## Fuori ambito

Multi-veicolo, autenticazione, deploy remoto, valute diverse dall'euro, importazione
da file esterni, calcolo del consumo reale da pieno a pieno.
