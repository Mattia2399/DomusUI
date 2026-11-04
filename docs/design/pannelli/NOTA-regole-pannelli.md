# DomusUI: stato di card e pannelli al 3 novembre 2026

**Il repository GitHub è indietro: non contiene nulla di quanto scritto qui. Dove codice o design del repository e questa nota non coincidono, vale questa nota.** Le immagini allegate mostrano lo stato attuale dell'app, versione `1.6.0-dev.711d1ad`, già provata su una casa reale.

## Regole da rispettare

1. **Stesse funzioni ovunque.** Una card fa le stesse cose in Home, in Stanze e in ogni altra pagina. Una differenza tra pagine è un errore, non una variante.
2. **Il pannello si adatta all'entità.** Mostra solo i controlli che quell'entità espone. Un controllo senza dati o funzione reale non esiste: non va disegnato disabilitato e non va inventato.
3. **Tocchi sulla card.** L'icona comanda il dispositivo, la superficie apre il pannello. Solo un interruttore virtuale, che non ha un pannello, si comanda anche dalla superficie.
4. **Telefono.** Il pannello esce da sotto, da bordo a bordo, sempre alla stessa altezza. Solo il media player è a tutto schermo.
5. **Home su desktop.** Il pannello resta fisso nella colonna a lato, per avere i controlli attivi senza perdere di vista il resto. Non va centrato.
6. **Stanze su desktop.** Il pannello resta nel dialogo centrale. Non va spostato a lato.
7. **Colore.** Il foglio del telefono e il dialogo di Stanze prendono il colore del dispositivo. La colonna della Home su desktop resta **neutra**: lì il colore sta solo su icona e slider.
8. **Stile.** Aspetto Apple, liste raggruppate come la pagina Profilo. Ogni controllo usa i componenti condivisi `Glass*`, che si possono ridisegnare ma non duplicare. I layout delle card usano container query.

## La struttura dei pannelli

Vale quando il pannello è largo fino a 520 px, cioè su telefono e nella colonna della Home. Tutto sta sull'asse centrale, dall'alto verso il basso:

| Zona | Contenuto | Misure |
|---|---|---|
| Foglio (solo telefono) | Tocca i lati e il fondo dello schermo; maniglia in alto | Altezza `min(90dvh, 720px)`, raggio 30 px solo in alto |
| Intestazione | Icona, sopra nome e stato; X nell'angolo in alto a destra | Icona 48, nome 20 bold, stato 13 |
| Protagonista | Slider verticale, oppure ciò che lo sostituisce | Larghezza 148, altezza data dallo spazio libero (300 nella colonna) |
| Zona controlli | Scorciatoie, oppure i controlli della scorciatoia aperta | **148 px fissi**, qualunque cosa contenga |
| Fondo | Accensione al centro, Indietro a sinistra solo nelle sotto-schermate | Altezza 68, accensione 64 |

Le zone sono separate da 18 px.

**La regola più importante: lo slider non cambia mai altezza né posizione**, né da un dispositivo all'altro né aprendo una scorciatoia. Anche l'accensione resta ferma. Per questo la zona controlli è fissa.

**Scorciatoie.** Bottone rotondo da 48 con il nome sotto (12 semibold), massimo 4 per fila e 2 file, nomi di una parola. Ce ne sono di due tipi:
- aprono i propri controlli al posto della fila, mentre lo slider resta visibile e mostra l'effetto (Colore, Effetti, Timer);
- agiscono subito e si illuminano quando sono attive (Protetta, Oscillazione, Alette).

Quando il pannello è più largo di 520 px, come nel dialogo di Stanze su desktop, lo slider sta a sinistra (128 × 300), i controlli sono tutti visibili a destra e l'accensione è nell'intestazione.

## Pannelli già convertiti

| Pannello | Al centro | Scorciatoie (solo se esposte) |
|---|---|---|
| Luce | Luminosità; il disco colore nella schermata Colore | Colore o Temperatura, Canale bianco, Effetti, Lampeggio |
| Ventola | Velocità | Modalità, Oscillazione, Direzione, Timer |
| Umidificatore | Obiettivo | Umidità adesso, Modalità, Timer |
| Clima | Temperatura obiettivo; su intervallo o senza obiettivo, una scheda con i valori | Modalità, Ventola, Profilo, Alette, Umidità, Orizzontali, Allinea |
| Tapparella | Apertura | Nessuna: Aperta / Metà / Chiusa e lamelle sono sempre visibili. Stop prende il posto dell'accensione mentre si muove |
| Presa | Watt, barre delle ore, Oggi / Questo mese / Costo oggi; senza misuratore, lo stato in grande | Protetta, Timer |

Una presa protetta chiede conferma prima di spegnersi, sia dalla card sia dal pannello. Il timer attivo compare nello stato della card ("spegne tra 15 min").

## Componenti nuovi

**`GlassColorPicker`** (`src/components/ui/`): componente riutilizzabile per tonalità e saturazione.
- Disco morbido con i colori intorno (rosso in alto, in senso orario), bianco al centro, bordo sfumato sullo sfondo.
- Maniglia bianca da 30 px, 36 mentre si trascina.
- Prende la larghezza che gli viene data e resta rotondo.
- Si usa con dito, mouse e frecce.
- Il colore si applica mentre si trascina: non c'è un tasto di conferma.
- Interfaccia: `value`, `onChange`, `label`, `valueText`, `disabled`, `className`.

**`ScrollingName`**: il nome della card su una riga.
- Se non entra, scorre in loop: prima resta fermo un momento, poi si muove a circa 28 px/s, con una sfumatura sul bordo destro.
- Un nome che entra resta fermo.
- Non scorre in modalità modifica né con "riduci movimento".
- Oggi è attivo solo sulle card Luce.

## Card

- Tre misure: `U×2`, `U×4`, `W×4`. Una luce accesa di 3 righe resta `U×3`.
- **Slider delle card** (Luce, Ventola, Tapparella): il riempimento occupa tutta la barra, senza margine né bordo di altro colore. Altezza 46 (40 nelle card standard ed estese), raggio 16.
- Spenta, si vede solo la barra vuota. Accesa, il riempimento è largo almeno 32 px per restare tondo.
- Un colore poco saturo appare tenue su card e pannello.

## Cosa manca ancora

**Da progettare con la stessa struttura:** Sensori, Robot, Calendario, Membri, Camera, Allarme, Serratura. Hanno schede e dati più che uno slider, quindi il protagonista va ripensato caso per caso, tenendo ferme le altre zone.
- **Meteo:** ha già la cornice nuova, ma il contenuto è ancora quello vecchio.
- **Allarme e Serratura con codice:** verranno riguardati insieme alla parte di sicurezza, ancora aperta.
- **Stack:** sospesi finché non diventeranno Gruppi. Non vanno progettati ora.
- **Mappa dei membri e notifiche:** disattivate. Non vanno disegnate come se esistessero.

## Immagini allegate

| File | Cosa mostra |
|---|---|
| `01-telefono-card` | Card sulla Home, con slider pieno e titolo scorrevole |
| `02-telefono-light` | Luce, schermata principale |
| `03-telefono-light-temperatura` | Luce, scorciatoia aperta: bianchi |
| `04-telefono-light-colore` | Luce, disco colore |
| `05-telefono-light-effetti` | Luce, effetti |
| `06-telefono-clima` | Clima con due file di scorciatoie |
| `07-telefono-clima-modalita` | Clima, sette modalità nella zona fissa |
| `08-telefono-tapparella` | Tapparella |
| `09-telefono-ventola-timer` | Ventola, timer |
| `10-telefono-presa-senza-consumo` | Presa senza misuratore |
| `11-telefono-presa-con-consumo` | Presa con consumi |
| `12-telefono-light-scuro` | Luce, tema scuro |
| `13-telefono-light-colore-scuro` | Disco colore, tema scuro |
| `14-desktop-home-colonna` | Home su desktop, colonna neutra |
| `15-desktop-home-colonna-colore` | Disco colore nella colonna |
| `16-desktop-home-colonna-scuro` | Colonna con il clima, tema scuro |
| `17-desktop-stanze-dialogo` | Dialogo di Stanze su desktop |

Le immagini vengono dalla casa demo: nomi e valori sono di prova.
