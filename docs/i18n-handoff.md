# Handoff internazionalizzazione essenziale

Ultimo aggiornamento: 7 settembre 2026.

## Obiettivo di release

Non pubblicare la release multilingua finché `/home`, `/rooms` e `/settings` non sono complete end-to-end in italiano, inglese e francese. Per complete si intendono anche pagine nidificate, Builder e pannelli raggiungibili, popup, conferme, errori, stati vuoti, etichette accessibili e testi responsive.

Le route non ancora tradotte dovranno mostrare, quando la lingua attiva non è l'italiano, una schermata localizzata `Disponibile prossimamente` invece di un'interfaccia mista.

## Stato completato

- Provider centrale in `src/i18n/I18nProvider.tsx`.
- Cataloghi tipizzati in `src/i18n/translations.ts`.
- Lingue disponibili: `it`, `en`, `fr`.
- Lingua iniziale da Home Assistant, poi browser, con italiano come fallback.
- Preferenza esplicita salvata solo sul dispositivo corrente.
- Selettore lingua nella pagina Profilo.
- Shell di navigazione principale, Profilo, onboarding, setup, organizzazione e riconnessione.
- Parti essenziali della Home già migrate: saluto, notifiche, Undo/Redo, indicatore di salvataggio, azioni principali Edit Mode e relativi dialoghi.
- Home: migrati anche catalogo componenti, selezione destinazione, anteprima breakpoint, recupero bozze, stato connessione, guida iniziale e dialoghi di stack/versione remota.
- Pannelli contestuali Home completati in IT/EN/FR: Light, Switch, Cover, Climate, Media Player e Sensor; Lock è migrato nelle superfici principali e negli stati attività.
- Le route non ancora tradotte mostrano ora un gate localizzato `Disponibile prossimamente` quando la lingua attiva non è l’italiano, evitando interfacce miste.
- `/rooms` migrata in IT/EN/FR, compresi:
  - titoli, sezioni, form, gestione piani e stanze;
  - selezione, aggiunta, spostamento e rimozione dispositivi;
  - stati vuoti, errori e conferme;
  - domini e stati reali Home Assistant per luci, switch, ventole, media player, cover, lock, binary sensor e climate;
  - guida `Tieni premuto per organizzare`;
  - formattazione dell'orario con la lingua attiva.
- `/settings` completata end-to-end in IT/EN/FR, incluse anteprime, inventario entità e dispositivi, Centro Attenzione, connessione Home Assistant, persone e accessi, dati e backup, cronologia versioni, sistema, supporto, shell e navigazione nidificata.
- `/appgallery` e l’app Irrigazione completate in IT/EN/FR: launcher, shell dedicata, panoramica, zone, programmazione, calendario, consumi, configurazione, messaggi operativi e anteprime demo delle app in arrivo.
- Le altre route restano protette dal gate localizzato quando la lingua attiva non è l’italiano.
- Stati, anomalie e domini dell’inventario Home Assistant vengono tradotti nell’interfaccia senza alterare nomi di entità, dispositivi, aree o persone forniti dal server.
- Traduzione francese dell'integrazione Home Assistant in `custom_components/domusos/translations/fr.json`.

## Verifiche già superate

- `npm.cmd run check`
- `npm.cmd run test:unit -- src/components/settings src/pages/SettingsDashboard.test.tsx`
  - 23 file e 82 test superati;
  - inclusi casi espliciti per inglese e francese.
- `npm.cmd run test:unit -- src/components/rooms/RoomSectionInteractionGuide.test.tsx`
  - 2 test superati;
  - coperta anche la lingua inglese selezionata esplicitamente.
- `npm.cmd run test:unit -- src/pages/AppGallery.i18n.test.jsx src/pages/AppGallery.irrigation.test.jsx src/components/apps`
  - 11 file e 36 test superati;
  - coperti launcher inglese e workspace Irrigazione francese.

## Ordine esatto di ripresa

### 1. Completare `/settings` — completato

La route e tutti i componenti raggiungibili elencati sotto sono stati migrati:

- `SettingsCardPreview.tsx`;
- `SettingsDevicesList.tsx` e dettaglio dispositivo;
- `SettingsEntitiesList.tsx`;
- `SettingsAttentionSection.tsx`;
- `SettingsHouseAccessSection.tsx`;
- `SettingsDataBackupSection.tsx`;
- `SettingsLayoutVersionsSection.tsx`;
- `SettingsHomeAssistantSection.tsx`;
- `SupportFeedbackSection.tsx`;
- shell e navigazione delle sezioni gestite.

Percorsi da collaudare:

- `/settings`;
- `/settings/home`;
- `/settings/devices` e `/settings/devices/:id`;
- `/settings/entities`;
- `/settings/dashboard`;
- `/settings/attention`;
- `/settings/security`;
- `/settings/advanced`;
- `/settings/access`;
- `/settings/connections`;
- `/settings/data` e `/settings/data/history`;
- `/settings/system`;
- `/support`.

Non tradurre nomi di entità, dispositivi, aree, persone o altri contenuti provenienti da Home Assistant.

### 2. Completare `/home` — implementazione completata

Auditare `MainBoard`, catalogo, Builder, toolbar, popup e pannelli contestuali. Migrare le card realmente utilizzabili e tutte le azioni raggiungibili. Prestare particolare attenzione agli stati generati da Home Assistant e alle stringhe presenti nei callback, non soltanto al JSX visibile.

Sono stati migrati Alarm, Camera, Vacuum, Weather, Centro Attenzione, le configurazioni del Builder in `RightSidebarManager`, le card e i callback residui principali di `MainBoard`. Anche ricerca/filtri condivisi, timeline posizione e date seguono ora la lingua attiva. I nomi delle entità e gli altri contenuti forniti da Home Assistant o dai dati dimostrativi restano invariati intenzionalmente.

Verifiche aggiuntive superate:

- `npm.cmd run i18n:audit`: nessuna stringa UI italiana evidente nello scope multilingua;
- `npm.cmd run check`;
- 20 test mirati per pannelli, card e Centro Attenzione;
- 8 test mirati finali per Light e Climate.

### 3. Gestire le route fuori scope — completato

Implementare il gate localizzato `Disponibile prossimamente` per le route non ancora complete quando `locale !== 'it'`. Non bloccare `/home`, `/rooms`, `/settings`, Profilo e primo accesso.

### 4. Audit e collaudo finale

- aggiungere un controllo automatico delle stringhe italiane residue nello scope multilingua;
- verificare che ogni chiave italiana esista anche in inglese e francese;
- eseguire test unitari mirati, suite completa, type-check e build;
- collaudare manualmente desktop, tablet e smartphone nelle tre lingue;
- controllare clipping, pulsanti troppo stretti e bottom sheet con testi francesi più lunghi;
- eseguire `npm.cmd run release:gate` soltanto a migrazione conclusa.

## Note sul worktree

Il worktree contiene molte modifiche precedenti e tutte devono essere preservate. Non usare reset, checkout distruttivi o pulizie massive. Prima di creare commit o release, separare consapevolmente il checkpoint i18n dalle altre modifiche oppure verificare l'intero insieme.

Non è stata pubblicata alcuna release durante questo checkpoint.
