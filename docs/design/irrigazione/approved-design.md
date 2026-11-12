# Irrigazione - disegno approvato

Data: 2026-11-12. Riferimento visivo e comportamentale: [prototipo cliccabile](irrigazione-prototipo.html), SHA-256 `45AB7D8F4CF227B1487136311A586388440BF387794DCDA72EA638D6BDB4DEB1`. Il file HTML e conservato solo come riferimento di design; la mini app va costruita con React, Tailwind, token Domus UI e componenti `Glass*`. La versione pubblicata del prototipo e [qui](https://claude.ai/artifact/TXBXPDrADcvVb4VqygEh9n); il file locale e la copia verificabile in repository.

## Contratto visivo

- Accento Irrigazione: `#0E9F6E` nel tema chiaro e `#34D399` nel tema scuro, coerente con la card della galleria. Rosso e viola sono riservati a guasto e pioggia.
- Materiali delle Stanze: sfondo con luci sfocate verde, acqua e lime; card in vetro; tessere attive bianche; pillole di scelta attiva nere; titolo grande allineato a sinistra; liste di impostazioni raggruppate in vetro. Usare i token semantici esistenti e aggiungere soltanto token locali dell'app, senza alterare le altre route.
- Font di sistema gia previsto dai token `--ui-font-system` e `--ui-font-display`; nessun font aggiuntivo.
- Riquadro fotografico di stato: immagine leggermente sfocata (circa 3-4 px), velatura scura in basso, etichetta e numero in alto, titolo e frase in basso, massimo due azioni. Stati: in corso, pronto, pioggia, guasto.
- Asset fotografici: cinque immagini reali in WebP, larghezza massima 900 px, conservate in `src/assets/irrigation/`. La hero usa quelle di sessione attiva, pronto, pioggia e guasto; la foto del prato per il robot resta pronta per la card futura. Il WebP del guasto e riusato quando il Core non e disponibile.

| Stato | Asset | Fonte |
| --- | --- | --- |
| In corso | `active.webp` | [Water Sprinklers on Green Grass, Pexels](https://www.pexels.com/photo/water-sprinklers-on-green-grass-12887876/) |
| Pronto | `ready.webp` | [Grass in a Garden, Pexels](https://www.pexels.com/photo/a-lush-green-lawn-with-a-gate-and-trees-27397124/) |
| Pioggia | `rain.webp` | [Water Drops on Grass, Pexels](https://www.pexels.com/photo/close-up-photo-of-water-drops-on-grass-4047727/) |
| Guasto / Core assente | `fault.webp` | [Trees, Shrubs and Lawn in a Garden, Pexels](https://www.pexels.com/photo/trees-shrubs-and-lawn-in-a-garden-12220735/) |
| Tagliaerba | `mower-lawn.webp` | [Sunlit Grass Lawn, Pexels](https://www.pexels.com/photo/sunlit-grass-lawn-with-lengthening-shadows-35015571/) |

Le schede delle fotografie indicano licenza Free; la [licenza Pexels](https://www.pexels.com/license/) consente l'uso gratuito e non richiede attribuzione. Le fonti restano registrate per tracciabilita. Il prototipo e la vecchia `irrigation-smart-hero.jpg` non sono fonti dei nuovi asset.

## Navigazione e schermate

| Area | Disegno approvato | Stato del codice al 2026-11-12 |
| --- | --- | --- |
| Shell | Il prototipo propone Oggi, Programmi, Consumi, Tagliaerba e Impostazioni. | Decisione successiva del 2026-11-12: mantenere la navigazione condivisa attuale. Restano Panoramica, Zone, Calendario, Consumi, Attivita e Impostazioni dove gia previste; sul telefono Libreria resta nella barra e Impostazioni resta fuori dalla barra. I nomi delle route cambieranno solo se concordati separatamente. |
| Oggi | Data sotto il titolo; riquadro fotografico di stato; Meteo, Terreno, Acqua; prossimi programmi; tessere zone; card robot condizionale. Pannelli zona e avvio manuale apribili. | Intestazione, hero compatta, tre riquadri Meteo/Terreno/Acqua, lista raggruppata e tessere zone ora seguono la gerarchia del prototipo. Le righe Prossimi rappresentano cicli per zona: il Core non espone ancora programmi nominati e ordinati. Restano pannello di zona fedele al prototipo e card robot. I numeri si mostrano solo se HA/Core li forniscono. |
| Programmi | Settimana, card per programma con giorni, ora, durata e zone in ordine; toggle; editor con nome, giorni, ora, minuti per zona, aggiunta/rimozione. Durate adattate alla stagione. | La pagina Calendar attuale mostra eventi per zona; il Core persiste giorni/orari/durata su ciascuna zona. Non esiste ancora un programma nominato e ordinato: l'editor completo dipende dal nuovo contratto server. |
| Consumi | Settimana/Mese, totale, grafico, litri per zona e riga perdita/nessuna perdita quando misurabile. | La pagina attuale legge un contatore HA quando configurato e distingue stime. Mancano portata per zona autorevole e rilevamento perdite. Senza contatore, mostrare solo stime esplicite e omettere la diagnosi perdite. |
| Tagliaerba | Pagina solo con robot: foto, stato, numero grande, batteria, altezza di taglio, lame, attesa dell'irrigazione. | La pagina e il supporto Core non esistono. Mostrare solo attributi/capability esposti dall'entita; niente avanzamento senza fine prevista. |
| Impostazioni | Stagione; Meteo; Tagliaerba; pagine Zone e valvole, Sensori, Sicurezza, Robot. | Configurazione, validazione delle entita, zone e sicurezza di base esistono. Stagione, portata, previsioni che saltano il ciclo, coordinamento robot e struttura delle sottopagine richiedono lavoro. |
| Primo avvio | Sei passi: benvenuto, valvole trovate, nomi zone, primo programma, controlli pioggia/automazioni legacy, tutto pronto. | Esistono suggerimenti entita e migrazione delle automazioni legacy; non esiste il wizard di sei passi. Salvare solo configurazione confermata dal Core e non avviare lo scheduler se la migrazione legacy non e conclusa. |
| Card Home | Irrigazione fotografica Mini/Standard/Espansa, icona di comando e apertura mini app; Tagliaerba Mini/Standard/Espansa con prato rigato, anello batteria, stima/avvio, stati e azione di ritorno solo nella versione espansa. | Non esistono come famiglie dedicate nel catalogo Home/Grid Engine 2.0. Vanno aggiunte tramite capability registry e varianti responsive, con permessi e conferme Core; la card Standard Tagliaerba va riusata nella pagina Oggi. |

### Dettagli dei quattro stati del riquadro Oggi

- **In corso:** tempo rimanente e barra solo da sessione Core con scadenza nota; azioni Pausa e Ferma secondo permessi/stato.
- **Pronto:** durata del prossimo programma confermato; Salta domani e Annaffia ora diventano comandi reali soltanto dopo il relativo contratto Core. Finche non esiste, non mostrare pulsanti che fingono di agire.
- **Pioggia:** millimetri di oggi solo da un sensore o una fonte HA attendibile; lo stato di blocco arriva dal Core.
- **Guasto:** litri passati solo da contatore reale; Vedi cosa fare apre istruzioni basate sul fault/Repair effettivo, senza suggerire che l'acqua sia stata fermata quando la chiusura non e confermata.

## Componenti condivisi: riuso e differenze

| Componente | Riuso previsto | Differenza dal prototipo |
| --- | --- | --- |
| `AppWorkspaceShell` | Sidebar e barra mobile, focus, navigazione, ritorno | Si conserva la navigazione attuale, inclusi Libreria nella barra mobile e Impostazioni fuori dalla barra mobile. La pillola nera del prototipo non prevale sullo stato attivo condiviso. Nessuna variante della shell necessaria per questa differenza. |
| `GlassBottomSheet`/`GlassModal` | Sheet mobile, focus trap e chiusura | Si conserva il foglio dal basso sul telefono e la modale centrata su tablet/desktop. Nessuna variante laterale necessaria. |
| `GlassListRow` | Righe di impostazioni e selezione entita | Le righe attuali hanno sfondo e angoli individuali con spazio tra loro; il prototipo usa un unico gruppo in vetro con separatori. Preferire una composizione/variante `Glass` raggruppata. |
| `GlassTiles` | Scelte esclusive come stagione, se adatte | Non usare per le tessere Zona: sono stato + navigazione + azione, non un `radiogroup`. Creare una tessera Irrigazione sopra le superfici/tokens condivisi. |
| `GlassToggle`, `GlassSegmented`, `GlassStepper`, `GlassButton`, grafici `Glass*` | Impostazioni, periodo, durata, azioni e Consumi | Riutilizzabili con accento locale e copy tradotto; verificare clipping e target touch ai breakpoint. |
| `GlassBattery`/`GlassRing` | Semantica di batteria e progressione | `GlassBattery` e una barra e `GlassRing` e un timer grande; l'anello batteria compatto del robot con fulmine in carica richiede una piccola variante dedicata. |

Le differenze di navigazione e posizione della modale sono state risolte dal committente il 2026-11-12. Le eventuali varianti per liste raggruppate e batteria del robot dovranno restare locali o opzionali e saranno verificate sulle altre schermate che usano i componenti condivisi. Evitare override CSS globali.

Oggi usa `AppWorkspaceShell`, superfici e token esistenti. `IrrigationTodayHero`, `IrrigationTodayFacts` e `IrrigationTodayZones` sono composizioni specifiche della mini app: la hero distingue una sessione attiva dal solo scheduler abilitato e le tessere zona aprono la route Zone. `IrrigationScheduleSnapshotCard` usa righe raggruppate nello stesso vetro. La protezione pioggia si configura nella pagina Impostazioni, non nella panoramica. La modale e la navigazione restano condivise senza nuove varianti. L'anello batteria compatto e il pannello di zona del disegno non sono ancora implementati.

## Lavoro sul motore Home Assistant da pianificare

Il Core attuale possiede Store versionato, scheduler per zona, FIFO, limiti, pioggia da sensore, permessi, idempotenza, watchdog e Repair. La [specifica del Core](../../irrigation-core.md) resta la base. I punti sotto sono nuove capability, non presenti oggi: non abilitarne i comandi nella UI reale prima del contratto server e del collaudo.

1. **Programmi nominati con zone ordinate.** Nuovo schema versionato e migrazione sicura dalle schedule per zona; durata per zona, giorni/orari, toggle, avvio manuale di un intero programma. Esecuzione sequenziale server-owned, revisione e conflitti; nessuna doppia attivazione con lo scheduler precedente.
2. **Salta e rimanda.** Eccezioni per occorrenza con scadenza e motivo, visibili su tutti i client e persistenti dopo riavvio; niente sola modifica locale del calendario.
3. **Stagione.** Coefficiente sulle durate (50/80/120% nel disegno), applicato dal Core prima dell'esecuzione con limiti di sicurezza e anteprima della durata risultante; la UI non cambia la durata autorevole da sola.
4. **Previsioni e terreno.** Valutare sorgente, freschezza, unita e soglie. Se dati assenti o non affidabili, comportamento esplicito e conservativo. Il sensore pioggia esistente continua a proteggere l'impianto.
5. **Portata e perdite.** Portata L/min configurata per zona, stima distinta dalle letture misurate, contatore reale e soglie per anomalie; nessuna riga “Nessuna perdita” senza misura sufficiente.
6. **Robot.** Mappatura capability dell'entita HA, blocco/attesa quando l'irrigazione e attiva o il prato non e pronto, riconciliazione dopo restart e comandi solo se supportati/autorizzati. Nessuna pagina o card se non e configurato un robot valido.

Per ogni fase: contratti WebSocket e servizi versionati, validazione server, permessi HA, idempotenza, revisioni, eventi push, test pure e HA su Linux e prove hardware controllate. Conservare il principio fail-closed e il requisito del watchdog fisico per impianti non presidiati. I cinque asset fotografici e il supporto `it`/`en`/`fr` sono parte del lavoro UI, non rifiniture finali.

## Sequenza di realizzazione

1. Preparare solo le varianti ancora necessarie, token locali, asset ottimizzati e struttura i18n; verificare la shell attuale su telefono/tablet/desktop in Light/Dark.
2. Ricostruire Oggi e le pagine di lettura con dati reali e stati vuoto/offline/fault; mantenere i comandi attuali del Core senza simularne di nuovi.
3. Aggiungere wizard e sottopagine Impostazioni per i campi gia supportati, con salvataggio e conferma Core.
4. Estendere il Core con programmi, eccezioni e stagione; poi abilitare editor Programmi, Salta/Rimanda e avvio completo.
5. Estendere il Core con portata, meteo/terreno e robot; poi Consumi avanzati, pagina e card Tagliaerba e card Home Irrigazione.
6. Chiudere test UI, accessibilita, traduzioni, budget performance e QA su valvole/sensori/robot reali prima di dichiarare completa la funzione.
