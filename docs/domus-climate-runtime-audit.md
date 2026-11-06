# Domus Climate CLM.5A — audit del runtime prima dell'esecuzione

Baseline: `feature/domus-climate-overrides` a `e6c3e900365c7a1fa094a8f8097fe604ec69fac7`, working tree pulito. Audit locale sul branch `feature/domus-climate-runtime-audit`. Questo documento descrive il codice CLM.2–CLM.5 dopo i tre fix locali indicati sotto. Nessuna chiamata fisica HA è stata aggiunta. L'harness HA Linux resta `ENVIRONMENT_BLOCKED`: i test che importano Home Assistant non sono convalidati qui.

## Mappa e ownership

| Livello | Fonte unica | Proprietario e percorso | Contenuto |
| --- | --- | --- | --- |
| Config HOUSE | `.storage/domusos.climate.v1` | `ClimateManager`, `climate/manager.py`; schema `climate/models.py`, catalogo `climate/validation.py` | Zone e ID stabili, riferimenti HA, terminali, circuiti, generatori, ausiliari, gruppi, profili e settimana. `strategy=null`. Campi legacy `operatingMode`/`controlMode` possono solo inizializzare uno state assente. |
| Intent persistente | `.storage/domusos.climate_state.v1` | `ClimateStateManager`, `climate/state_manager.py`; schema `climate/intent.py`, expiry `climate/overrides.py` | House Mode, control mode, zone mode, target manuale e override con scadenza UTC assoluta. |
| Osservazione | `hass.states` | `state_manager.py` ascolta i riferimenti configurati; `intent.py` legge primary/fallback e stato terminali | Valori HA correnti, mai copiati nello store Climate. |
| Derivato | memoria `_snapshot`, ricalcolata su evento/lettura | `auto_resolver.py` (settimana), `intent.py` (decision preview), `auto_timer.py` (prossimo boundary) | Profilo/evento attivi, target effettivo, temperatura/umidità, stato termico, candidati. Non persistito. |
| API e UI | sette comandi WS; client TS | `climate/api.py`, `access/actions.py`, `src/services/climate*Client.ts`, `ClimateRuntimePanel.tsx`, `ClimateSettingsShell.tsx` | Il frontend visualizza la risposta backend; stato React è solo una cache per la vista. |

La setup in `custom_components/domusos/__init__.py` carica prima config e poi intent, registra il manager config, inizializza lo state manager, quindi collega `manager.on_change=state_manager.refresh_config`. Lo state manager pulisce expiry/orfani prima di installare listener, calcola la prima snapshot e arma il timer. All'unload cancella timer e listener. Config assente/corrotta/non supportata dà `preview=null`; state corrotto/non supportato dà `preview=null` dopo il fix. Config assente + state presente non usa quell'intent: resta unresolved e le write sono rifiutate. Config presente + state assente usa `default_intent`, con target manuali null e gli eventuali mode legacy come seme iniziale; la risposta espone `state=absent`.

`activeProfile`, `activeEvent`, `nextEvent`, `effectiveTarget`, `thermalStatus`, readings, candidati e tempo rimanente non compaiono in nessuno dei due documenti di storage. Gli ID di zona/profilo, non i nomi, legano target, schedule, intent e override. Il parser rifiuta profili mancanti e riferimenti incrociati invalidi; il resolver pure restituisce `profile_missing` per input malformed, senza target.

## Findings classificati

| ID | Gravità | Tipo | Evidenza e decisione |
| --- | --- | --- | --- |
| F1 | HIGH, corretto | real bug | State corrupt/unsupported poteva ricevere `default_intent` e generare una preview AUTO credibile se il config legacy impostava AUTO e uno schedule. Ora `_recompute` restituisce `preview=null`, cancella il timer e non scrive. Test HA aggiunto, in attesa dell'harness. |
| F2 | HIGH, corretto | race condition reale | Un callback già accodato del vecchio timer poteva eseguire `_fire` dopo `cancel`, azzerare l'handle del timer nuovo e crearne un altro. Il token di generazione rende il callback obsoleto inerte. Lo state manager ora ignora anche eventi HA/config già accodati dopo unload, che altrimenti potevano riarmare il timer; test pure passa e test HA aggiunto. |
| F3 | MEDIUM, corretto | incoerenza di stato | La rimozione di una zona puliva gli override, ma lasciava un intent di zona orfano nello store se non c'erano override. Il cleanup ora riconcilia sempre gli ID; test HA aggiunto. Il config save e il cleanup state sono due write separati: se il secondo fallisce, la preview ignora l'orfano e una lettura/refresh ritenta. |
| F4 | BLOCKER per service call | future execution concern | Temperatura numerica non ha una policy di freschezza, range o conversione unità: `validation.py` ammette sensori °F/K, mentre `_reading` usa il numero come °C; un valore finito estremo passa. Nessun comando fisico è consentibile da questa preview. Definire conversione/validità e provarla in HA prima dell'esecuzione. |
| F5 | BLOCKER per service call | semantic ambiguity | `compatiblePaths` elenca candidati, non seleziona un terminale; una zona AC+TRV e un circuito con più generatori restano ambigui. `strategy=null` è riservato. Servono delivery strategy, arbitraggio e aggregazione circuito/generatore. |
| F6 | BLOCKER per radiant cooling | future execution concern | Il path espone `humidityConstraintPresent`, `condensationProtectionRequired` e ausiliari candidati; non calcola dew point né sequenzia deumidificazione. Attendere CLM.7 per cooling radiante. |
| F7 | BLOCKER di validazione | test gap | Harness HA Linux `ENVIRONMENT_BLOCKED`: WS, store HA, round-trip, setup/unload e Access Control con HA restano non convalidati su Linux. Non dedurre da test pure l'idoneità ai comandi. |
| F8 | HIGH per futura execution | future execution concern | Nessuna ownership dei comandi, correlazione con stati osservati, rate limit, anti short cycle, gestione partial failure o distinzione tra comando Domus e modifica locale. Il mismatch è intenzionalmente `unknown`. Definire prima dell'adapter HA. |
| F9 | MEDIUM | UX-only issue | Nessuna push subscription Climate e nessun polling: la UI aperta aggiorna su cambi HA osservati, propria write o ricarica. Boundary schedule, expiry e write da altro client possono restare invisibili finché non arriva un trigger. Backend `get_state` ricalcola sempre. Serve strategia di convergenza prima dell'esecuzione multi client. |
| F10 | MEDIUM | documentation/test gap | `save_config` emette un `AuditEntry` di successo. Write di intent/override ed expiry/clear scrivono solo log INFO con zone ID; nessun evento strutturato persistente. Il lock dello state manager evita doppio log della stessa rimozione, ma serve una policy di audit durevole prima di comandare dispositivi. |
| F11 | MEDIUM | semantic ambiguity | `get_state` chiama `async_cleanup_overrides`: anche `climate.view` può provocare una write server di manutenzione, con incremento della revisione. È accettabile come housekeeping interno: non cambia intent operativo visibile, applica solo expiry e ID validi, ma la UI deve ricaricare dopo conflict. Nessun audit di successo viene falsificato. |
| F12 | MEDIUM | future execution concern | Il timer usa delay monotono calcolato da wall clock. Un salto manuale/NTP senza evento o lettura lascia snapshot e UI vecchie fino al callback corrente. Con lettura o evento, forward/backward jump ricalcola il boundary; dopo un salto indietro il callback anticipato riarma il timer. Prima dei comandi occorre definire una fonte affidabile per i clock change, senza introdurre polling ogni minuto qui. |
| F13 | LOW | UX-only issue | I ruoli assegnabili `admin`, `resident`, `member`, `wall_panel` hanno sia view sia control; `restricted` non ha view. Un grant personalizzato può creare view-only. Nessun bypass: modello autorizzativo corretto, preset da discutere con prodotto (soprattutto wall panel/restricted). Non blocca il design execution. |
| F14 | LOW | validation/UX gap | Il client TS valida la shape principale dello state ma non ogni campo annidato; alcuni errori write diventano un generico messaggio di conflict anche se non sono conflict. Nessun dato UI è source of truth; migliorare reason propagation in una fase UX mirata. |

Non sono emersi altri bug riproducibili nei test pure. Le ambiguità di F4–F8 sono condizioni di safety da progettare; non sono state risolte cambiando arbitrariamente l'architettura approvata.

## Store, transizioni e concorrenza

Config e state hanno lock e revisioni **indipendenti**. `save_config` confronta `expected_revision` con `ClimateManager.revision`; house/zone/override/clear confrontano con `ClimateStateManager.revision`. Due write state sulla stessa revisione sono serializzate: una sola vince, l'altra riceve `conflict` senza write o timer side effect. Config write e state write non si sovrascrivono, ma l'aggiornamento del catalogo seguito da cleanup state non è una transazione cross-store. L'intent di una zona cancellata non influenza la preview; il cleanup ora lo elimina al prossimo tentativo riuscito.

| Write | Idempotenza e side effect |
| --- | --- |
| `save_config` | Stessa config canonica e revisione corrente: nessuna write/revision/audit. Con revisione vecchia: conflict, anche se payload uguale. |
| `set_house_intent` | Stesso payload finale: nessuna write. AUTO→MANUAL elimina tutti gli override **nella stessa write state**; se `async_save` fallisce, mode e override restano entrambi vecchi. MANUAL→AUTO conserva target manuali e non ripristina override eliminati. |
| `set_zone_intent` | Stesso mode/target: nessuna write; target manuale resta nello state durante AUTO. |
| `set_zone_override` | Non idempotente: ogni richiesta valida crea nuovo UUID e scadenza calcolata al momento, poi incrementa revisione. Retry richiede nuova revision e può sostituire override. |
| `clear_zone_override` | Se assente e revisione corrente: nessuna write; se presente: una write. Cleanup di expiry/orfani usa lo stesso lock, quindi non duplica la rimozione. |

L'ordine di autorizzazione WS è: enforcement Access Control su `connection.user`, poi schema/closed fields, poi metodo manager e validazione semantica, infine write. `save_config` ha anche `require_admin` HA e controllo manager; `climate.manage` richiede HA admin nel catalogo capabilities. Utente inattivo/nullo, policy locked/corrupt/unsupported/migration_failed e decisione interna non disponibile sono deny prima del handler. I context HA senza user non passano dal WebSocket Climate e nessuna sua action opta per l'eccezione unattributed service. Deny, invalid payload e revision conflict non cambiano store; il timer cambia solo dopo una write riuscita o una lettura autorizzata che ricalcola/effettua cleanup interno.

| API WS (`domusos/climate/…`) | Capability | HA admin | Tipo e store |
| --- | --- | --- | --- |
| `get_config` | `climate.view` | No | read config |
| `save_config` | `climate.manage` | Sì | write config |
| `get_state` | `climate.view` | No | read preview + cleanup interno state |
| `set_house_intent` | `climate.control` | No | write state |
| `set_zone_intent` | `climate.control` | No | write state |
| `set_zone_override` | `climate.control` | No | write state |
| `clear_zone_override` | `climate.control` | No | write state |

Nessun payload WS accetta principal, capability o revision alternativa: le shape sono chiuse; gli `expected_revision` sono controllati nello store appropriato. La rev che cambia per housekeeping può far fallire un client già aperto con conflict: il frontend mostra il messaggio, ma richiede refresh manuale. Config save non altera state revision salvo cleanup successivo di zone obsolete.

## Semantica temporale e decisionale

- Un solo `BoundaryTimer` nello state manager, con al massimo un handle valido. Config/intent/override update, lettura, sensore HA, timezone event e boundary ricalcolano; unload cancella. Il token di generazione impedisce a callback obsoleti di toccare il timer corrente; `_running` impedisce ai listener tardivi di riarmarlo dopo unload. La cleanup async è accodata con flag unico; non è un secondo timer.
- Schedule: wall clock della house timezone, settimana con wrap, ultimo evento prima di `now`, primo dopo. Gap primaverile spostato avanti della differenza DST; overlap autunnale usa solo la prima occorrenza. Restart durante transition ricalcola da UTC e config. Cambio timezone reinterpreta lo schedule e sostituisce il timer.
- Override: `duration`, `until_time` e `next_schedule_event` si convertono una volta in `expiresAt` UTC. `next_schedule_event` resta congelato anche se lo schedule cambia. Il cambio timezone modifica solo label locale, non scadenza. Startup, get_state, timer, config update, MANUAL, clear e rimozione zona eliminano override non più validi. Un `until_time` in gap/overlap segue la stessa regola del resolver.
- Precedenza: MANUAL usa solo target manuale; AUTO usa override attivo, poi target del profilo, poi nessun target. AUTO senza schedule + override resta valido fino a expiry, quindi torna `no_schedule`. Profilo attivo senza target zona restituisce `no_target`; un override lo copre temporaneamente. House OFF e Zone OFF mantengono le informazioni ma danno `thermalStatus=off` e nessun path compatibile. Heating non genera cooling demand e viceversa.
- Il deadband è confronto istantaneo: heating se `temperature < target − 0.2 °C`, cooling se `temperature > target + 0.2 °C`; ai due boundary esatti risulta `satisfied`. Non è hysteresis, controllo anti short cycle né comando termostatico.
- Primary/fallback: primo valore numerico finito disponibile; unknown/unavailable saltati, NaN/infinity/invalid esclusi, umidità limitata 0–100. `stale` appare solo se un chiamante fornisce esplicitamente `stale_ids`; oggi lo state manager non lo fa. Il ritorno del primary lo riprende subito, con possibile flapping. Unità e range temperatura restano F4.
- Il terminale `climate.*` espone mismatch target con causa `unknown`, gli attuatori switch/valve non ricevono un desiderato implicito. Fan coil resta un terminale logico con related controls; un gruppo multisplit espone `sharedOperatingMode` ma non sceglie attivazioni. Split diretto ha `circuitId=null` e path valido. TRV/valve usano path idronico con candidati generatori. DHW è capacità distinta e non genera domanda di zona. Room target, supply setpoint e generator water setpoint restano campi separati.
- `compatiblePaths` esclude capability incompatibili e generatori incompatibili, ma non è un execution plan. Un circuito senza generatori può comunque apparire come path con lista generatori vuota; la futura execution deve rifiutarlo se richiede calore/acqua da generatore. Cooling radiante non è mai dichiarato sicuro. Ausiliari sono candidati informativi, senza desired activation. Finestre, occupazione, meteo ed Energy non entrano nel resolver corrente.

## Failure matrix per il futuro adapter

`No` significa che la preview CLM.5A non è autorizzazione a fare un service call, anche quando lo status è una domanda termica.

| Caso | Stato runtime attuale | Esecuzione futura da questa sola preview? | Motivo |
| --- | --- | --- | --- |
| Config absent/corrupt/unsupported/migration_failed | `preview=null` | No | Nessuna topologia affidabile. |
| State corrupt/unsupported | `preview=null` | No | Intent non affidabile; F1 corretto. |
| State absent con config valido | default/target manuale null; eventuale seme legacy | No | Verificare ownership/inizializzazione prima del comando. |
| Sensore unavailable/invalid/stale | `unknown`, nessuna domanda | No | F4: policy sensore incompleta. |
| Zona senza target / schedule assente | `unknown`, `no_target`/`no_schedule` | No | Nessuna consigna. |
| Nessun terminale compatibile | domanda possibile, `compatiblePaths=[]` | No | Nessun endpoint selezionabile. |
| Più terminali compatibili | più path candidati | No | F5: delivery strategy assente. |
| Circuito/generatore mancante | parser rifiuta link malformed; path idronico può avere zero generatori | No | Dipendenza non soddisfatta. |
| Ausiliario richiesto / radiant cooling | constraint informativo | No | F6: deumidificazione/condensa non implementate. |
| Timezone unavailable | AUTO `timezone_unavailable`, salvo override assoluto | No | Schedule non risolto; verificare modalità ammessa. |
| Override invalid/corrupt | state corrupt oppure write `invalid_config` | No | Non fidarsi del dato. |
| Authorization denied | `access_denied` prima del handler | No | Nessun side effect. |
| Revision conflict | `conflict` prima della write | No | Reload richiesto. |

## Confine della futura execution

Innesto proposto: **Climate Decision → Execution Plan → Execution Adapter → HA Services**. Il resolver non chiama HA. Un contratto di design dovrebbe portare `configRevision`, `stateRevision`, timestamp/validità sensore, zona e target derivato, `selectedTerminalIds` con motivazione della selezione, domanda aggregata per circuito e generatore, vincoli safety, idempotency key, stato atteso e scadenza del piano. Nessuno di questi oggetti o adapter è implementato in CLM.5A.

Per `climate.*` con termostato nativo il design può partire da controllo supervisore di target/mode, senza commutare il dispositivo a ogni crossing del deadband. Per switch/valve diretti serve un controller ON/OFF con hysteresis, intervallo minimo e dipendenze circuito. Più zone richiedono aggregazione prima di circuito/generatore; più generatori richiedono arbitraggio `preferred`/`fallback`/`required` e tutela DHW. AC+TRV nella stessa zona non può essere comandato senza delivery strategy. Il mismatch locale non identifica l'autore: occorrono ultimo comando, tempo, stato atteso e correlazione degli eventi HA, poi una scelta esplicita tra accettare modifica esterna e ripristinare desiderato. Altrimenti 20 °C comandati e 19.5 °C osservati possono creare un loop di comandi.

Prima del primo service call servono inoltre unit/range/freshness dei sensori, validazione capability al momento del comando, ownership e reconciliation, intervallo minimo, anti short cycle, ordine terminale/circuito/generatore, timeout/failure handling, partial failure/rollback policy, audit strutturato e test HA reali. Nessuna di queste regole si può inferire dal solo deadband 0.2 °C.

| Area | Ready per design CLM.3B? | Blocco per service call | Fase richiesta |
| --- | --- | --- | --- |
| `climate.*` termostato nativo | Sì, subset supervisore | F4, F7, F8; capability reale e ownership | CLM.3B design + harness |
| TRV | Sì come contratto, non attivazione | Circuito/generatore e demand aggregation | CLM.6 |
| Split AC diretto | Sì, subset supervisore se univoco | F4, F7, F8; shared mode se raggruppato | CLM.3B design |
| Manifold valve | Sì come contratto | Controllo diretto, hysteresis, circuito | CLM.6 |
| Fan coil | Sì come contratto | Coordinamento climate/fan/valve | CLM.6 |
| Radiator circuit | Sì come contratto | Aggregazione zone e generatore | CLM.6 |
| Heat pump | Sì come contratto | Arbitraggio, DHW, protezioni | CLM.6 |
| Boiler | Sì come contratto | Aggregazione e sequenziamento | CLM.6 |
| Hydronic stove | Sì come contratto | Acqua e DHW, safety dedicata | CLM.6 |
| Radiant heating | Sì come contratto | Circuito, massetto, anti short cycle | CLM.6 |
| Radiant cooling | Sì solo come vincolo | F6; mai abilitare prima di dew point e dehumidifier sequencing | CLM.7 |
| Dehumidifier | Sì come dipendenza | Nessun desired activation oggi | CLM.7 |
| Multisplit/shared equipment | Sì come vincolo | Arbitraggio gruppo e divieto mixed mode | CLM.3B design/CLM.7 |

## Invarianti, test e decisione

I1 House OFF → zero domanda; I2 Zone OFF → zero domanda; I3 override AUTO prevale sullo schedule; I4 MANUAL ignora schedule/override; I5 sensore ignoto → zero domanda; I6 target mancante → zero domanda; I7 heating non genera cooling demand; I8 cooling non genera heating demand; I9 nessun terminale compatibile → nessun path; I10 derived non persistito; I11 massimo un timer valido; I12 zero HA service call. La matrice pure da 72 combinazioni copre mode/control/zone/sensore/fonte e determinismo a parità d'input; i test esistenti coprono schedule, DST, override, scenari A–F, parser, topology e service-call scan. Tre test HA nuovi coprono F1/F2/F3 ma attendono Linux. Le transizioni e l'ordine degli eventi sono deterministici quando config, state, HA states, istante e timezone finali coincidono; questa proprietà va riprovata sull'harness HA con write concorrenti e reload.

La UI configurata non risolve settimana, expiry o domanda termica: usa i campi backend. Solo il mock Playwright riproduce una versione ridotta del resolver per il test. Refresh browser rilegge config e state; multi tab può restare stale e un conflict non fa reload automatico. Le stringhe UI traducono vari reason, ma un errore write non distinto diventa genericamente conflict. Nessun redesign è stato eseguito.

### Validazione locale effettuata

| Verifica | Risultato |
| --- | --- |
| Python 3.13.2, Climate pure CLM.2–5 + nuova matrice (con `--noconftest`) | 165 passed; include parser, validation, A–F, AUTO, DST, override, timer e scan di tutti i moduli Climate per service call. |
| Access Control pure | 317 passed. Totale backend pure 482 passed, 2 warning pytest per opzioni `pytest-asyncio` non disponibili in questo ambiente Windows. |
| Backend HA (`test_climate_manager`, `test_climate_state_manager`, `test_climate_websocket`, Access Control HA, init/round-trip) | `ENVIRONMENT_BLOCKED`: Home Assistant/fixture HA non sono installati su Windows e il prompt vieta di ritentare WSL/Docker. I tre nuovi test HA sono preparati, non eseguiti. |
| Ruff sui moduli Climate e test modificati | PASS. |
| Typecheck | `npm run check`: PASS. |
| Vitest Climate mirato | 18 passed. |
| Playwright Climate | 6 passed; lo scenario esteso copre manual → AUTO → schedule → override → House OFF/ON → expiry → profile update → manual, controllando target/source/thermal/revision e zero `call_service`. Il fake HA del test non sostituisce l'harness backend. |
| Production smoke | 20 passed, inclusa la route Climate lazy. |
| Build e performance budget | PASS con warning esistenti. Totale 1590.1/1650 KB gzip, Climate lazy 128.8 KB raw/33.9 KB gzip, onboarding 119.9/120 KB raw. Climate non entra nel boot/onboarding. |
| Dipendenze | Nessuna variazione a `package.json`, lockfile o requirements. Per i test temporali Windows, `tzdata` è stata installata solo nella cartella temporanea dell'ambiente di test. |

Il build segnala `compat-check.js` non bundlato come script non-module e alcuni chunk oltre 500 KB; il budget resta rispettato. La warning pytest dipende dall'assenza del plugin HA/asyncio in questa installazione, non da fallimenti dei test pure. `git diff --check` è pulito; Git avvisa solo che potrebbe normalizzare LF→CRLF in alcuni file del working copy.

**Decisione: `READY_FOR_EXECUTION_DESIGN`**, limitata alla progettazione di controllo supervisore per un singolo `climate.*` termostatico o split AC diretto e univoco, con feature gating iniziale di attuatori diretti, idronica, generatori, cooling radiante e gruppi condivisi. Non significa pronto per esecuzione fisica: F4–F8, Linux HA e le politiche di comando restano prerequisiti bloccanti. Prossima fase consigliata: CLM.3B **design only** del contratto, validità sensori, ownership/reconciliation e safety gate per quel subset, seguita da harness HA prima di qualunque adapter che chiami servizi.
