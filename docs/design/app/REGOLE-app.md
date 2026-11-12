# DomusUI · regole del disegno dell’app (Casa, funzioni, Impostazioni)

Prototipi cliccabili in questa cartella (si aprono nel browser; in alto c’è una barra di prova con schermo, tema e stati):
- `casa.html` — la pagina Casa (plancia della casa)
- `sicurezza.html` — la funzione Sicurezza
- `../irrigazione/irrigazione-prototipo.html` — la funzione Irrigazione (con primo avvio guidato e card della Dashboard)
- `impostazioni.html` — /settings, Profilo, Barra di navigazione

Sono una **specifica**: misure, colori, testi, stati e comportamenti. Si riproducono con React, Tailwind, i token e i componenti `Glass*` del progetto. Non si copia l’HTML.

## 1. Materiali (come Stanze e pannelli)
- Sfondo con luci colorate sfocate; card e liste in vetro (`backdrop-filter`), bordo chiaro sottile, ombra morbida.
- Titoli grandi (30 px, 700), testo secondario 13–15 px, font di sistema (nessun font incluso nell’app).
- Pillola nera (bianca in scuro) per la scelta attiva; interruttori verdi; segmentati con lo sfondo bianco sulla scelta.
- Colore dell’app: blu, con il viola nelle luci. Ogni funzione ha il suo colore (Sicurezza verde, Clima arancio, Energia giallo, Irrigazione smeraldo, Rifiuti verde) e lo usa per luci di sfondo, icone e comando principale. Rosso, arancio e viola restano per errore, attenzione e pioggia.
- Icone quadrate colorate nelle liste, un colore per famiglia.
- Valori a destra di una riga solo se dicono qualcosa (stato, numero, avviso).

## 2. Intestazione di pagina e pulsante indietro
- Una sola riga in alto: **pulsante rotondo in vetro ‹** (solo se serve tornare indietro) · **titolo** · strumenti a destra (ingranaggio, puntina, azione principale).
- Sotto il titolo, se serve, una riga piccola di dettaglio.
- Il pulsante ‹ è l’**unico** modo di tornare indietro: niente etichette “‹ pagina precedente” sopra il titolo.

## 3. Navigazione
- **Una sola barra, quella dell’app** (in basso sul telefono, a sinistra su tablet e desktop). Le funzioni non hanno barre proprie.
- **Aspetto: quello di oggi.** `BottomBarNav` sul telefono e `LeftSidebar` su tablet e desktop: solo icone (i nomi restano per l’accessibilità), la goccia di vetro (`liquid-glass-drop`) con la sua animazione elastica e il piccolo ingrandimento dell’icona attiva. L’icona attiva usa il colore del testo (`--ui-text-primary`), non il blu; nella barra laterale la voce attiva ha un fondo neutro. **Niente pillola nera e niente nomi visibili**: la barra di `casa.html`, `sicurezza.html` e `impostazioni.html` è superata e non va copiata. **Niente colori di stato e niente puntini** sulle icone.
- Barra consigliata: **Dashboard · Stanze · Casa · Profilo** (la foto, che apre Impostazioni). Sicurezza, Consumi, Automazioni e App Gallery si raggiungono da Casa.
- **Le voci si scelgono solo da Impostazioni › Questo dispositivo › Barra di navigazione**, per dispositivo: Dashboard sempre prima, Profilo sempre ultimo, in mezzo fino a 3 voci sul telefono e fino a 7 nella barra laterale (un solo elenco: il telefono mostra le prime 3). Solo voci che il ruolo può aprire. “Ripristina quella consigliata”. Nella barra non c’è una voce “Aggiungi”; le voci non si modificano dalla modalità modifica della Dashboard.
- Il pulsante Modifica della barra laterale compare solo sulla Dashboard.

## 4. Livelli: mai più di due
- Livello 1: la pagina (Casa, una funzione, Impostazioni).
- Livello 2: la sotto-pagina, aperta con “Tutte ›”, l’ingranaggio o una riga. **Sul telefono copre la pagina; su tablet e desktop si apre nella colonna a destra** accanto alla pagina, che resta visibile.
- Un terzo livello diventa un **foglio** (dal basso sul telefono, colonna a destra su desktop), chiuso con la X.
- Le azioni rapide (scegliere una modalità, inserire un codice, avviare una zona) sono fogli.

## 5. Casa (la plancia della casa)
In ordine: vista 3D della casa con quello che succede (se c’è Domus 3D, altrimenti un invito a provarlo) · riepilogo in una riga (“Tutto in ordine” / “2 cose da guardare”) · **Funzioni** attive come righe grandi con colore, stato e comando rapido · “Aggiungi una funzione” · **Strumenti** (Domus 3D, Editor di card) in fondo, più discreti.
- Funzioni = parti della casa che lavorano ogni giorno (Sicurezza, Clima, Energia, Irrigazione, Rifiuti…). Strumenti = cose da usare ogni tanto per costruire o personalizzare.
- Nomi delle voci (deciso il 12 novembre 2026): **Casa** per la plancia della casa; la pagina oggi chiamata "Home" si chiama **Dashboard** in tutta l’interfaccia (barra, titoli, testi). Route e chiavi interne (`/home`, `id: 'home'`) restano uguali.

## 6. Pagina di una funzione
Una pagina sola che scorre: stato e comando principale in alto, poi le sezioni in anteprima con “Tutte ›”. Le impostazioni della funzione si aprono dall’ingranaggio (livello 2). Esempi: `sicurezza.html`, `irrigazione.html`.

## 7. Impostazioni
Profilo · La casa (Piani e stanze, Persone e accessi, Dashboard, Avvisi) · Home Assistant (Connessione, Dispositivi ed entità, Aggiornamenti e diagnostica, Dati e backup) · Questo dispositivo (Aspetto, Lingua, Barra di navigazione, Usare come pannello) · Supporto e informazioni. Funzioni e strumenti **non** stanno qui. Profilo solo con cose personali (Informazioni, Attività e spostamenti, Notifiche, Codice e conferme, Apri Domus all’avvio, Esci).

## 8. Regole di sempre
- Solo quello che l’entità espone: niente controlli finti o disabilitati.
- Un componente, un posto: le primitive in `src/components/ui/`, niente copie locali.
- Container query, non la larghezza della finestra.
- Testi semplici, per un utente base.
- I file vietati (Grid Engine, `MainBoard.tsx`, `RightSidebarManager.tsx`, solver, contratti, persistenza) non si toccano senza mostrare prima il diff minimo e avere l’ok.
