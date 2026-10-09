# Domus Notification Router

Il Notification Router consegna una notifica Domus alle **persone**, sui
dispositivi personali che ciascuna ha scelto nel proprio Domus Profile. È un
servizio backend interno (`custom_components/domusos/notifications/`), non una
feature: lo useranno Waste Collection, Security, Energy, Irrigation, Calendar e
le funzioni future, nessuna delle quali deve conoscere telefoni, servizi
`notify` o entità.

Una configurazione futura salverà quindi solo `recipients: [person_id]`, mai
`notify.mobile_app_x`, `ha_device_id`, `PersonalDevice.id` o `device_tracker.*`.

## Perché un package separato

Il Router dipende dal Profile Core (resolver delle persone, `ProfileManager`,
target resolver di P1.2) solo attraverso le sue API pubbliche, e non dipende da
nessuna feature né dal frontend. Tenerlo fuori da `profile/` rende esplicito che
è infrastruttura condivisa, e impedisce che una feature importi il Profile per
mandare una notifica.

## Pipeline

```
person internal id
  → person.* live (attributo id)
  → user_id della persona
  → Domus Profile persistito e attivo
  → notifications.enabled (interruttore generale)
  → PersonalDevice[] con notifications.enabled
  → stato live del dispositivo (ancora tuo, esistente, abilitato)
  → target risolto live (NotifyEntity, poi servizio legacy mobile_app)
  → Home Assistant notify
```

Tutto, dalla persona al target, viene risolto **a ogni invio** e mai salvato:

- **Rinomina**: `person.mattia` → `person.mattia_ticconi` non cambia nulla,
  perché il destinatario è l'id interno.
- **Ricollegamento**: se un amministratore collega la persona a un altro
  utente, da quel momento si usa il profilo del nuovo utente. È voluto.
- Il target (`notify.*`) non entra mai nel Profile Store né nel ledger.

## Richiesta

```python
request = NotificationRequest.create(
    recipients=["<person id>", ...],   # id interni delle persone, max 32, duplicati rimossi
    source="waste_collection",         # slug del modulo chiamante, max 64
    category="waste",                  # default, waste, security, energy, irrigation, calendar, urgent
    title="...",                       # facoltativo, max 256
    message="...",                     # obbligatorio, max 4096
    dedupe_key="...",                  # facoltativo, max 256, deciso dal chiamante
    metadata={...},                    # facoltativo, JSON, max 4 KB, solo in memoria
)
result = await router.async_send(request)
```

Una richiesta non valida solleva `InvalidNotificationRequestError` e non invia
nulla. La stessa persona ripetuta conta una volta, nella posizione della prima
occorrenza.

In V1 `category` viene solo validata e conservata: **non** cambia ancora il
routing. Non esistono `notifications.categories`, ore di silenzio né override
urgenti. `metadata` serve al chiamante per correlazione e debug: non viene
salvato, loggato né passato a Home Assistant. Il contratto portabile è solo
titolo + messaggio: nessun payload specifico (azioni, immagini, canali, alert
critici).

## Preferenze e disponibilità

Due cose diverse, che non si mescolano mai:

- **Preferenza** (salvata): un dispositivo vuole notifiche se
  `profile.notifications.enabled` **e** `device.notifications.enabled`.
- **Disponibilità** (live): il target si può usare adesso.

Un target non disponibile non modifica mai un interruttore salvato.

Regole per destinatario:

| Situazione | Esito | Motivo |
| --- | --- | --- |
| Nessuna persona con quell'id | skipped | `unknown_recipient` |
| Più persone con lo stesso id (mai la prima) | skipped | `ambiguous_recipient` |
| Persona senza account | skipped | `no_account` |
| Account disattivato | skipped | `account_disabled` |
| Account di sistema o rimosso | skipped | `account_unavailable` |
| Profilo mai salvato (sintetico) | skipped | `no_profile` |
| Profilo orfano o Profile Store non leggibile | skipped | `profile_unavailable` |
| Interruttore generale spento (i dispositivi non vengono esaminati) | skipped | `notifications_disabled` |
| Profilo senza dispositivi | skipped | `no_devices` |
| Dispositivi presenti ma tutti spenti | skipped | `notifications_disabled` |

`no_profile` e `no_devices` restano distinti: il primo è un utente che non ha
mai configurato Domus, il secondo un profilo senza dispositivi.

Per ogni dispositivo acceso:

| Situazione | Esito | Motivo |
| --- | --- | --- |
| Home Assistant non lo lega più a questo utente, o è in conflitto di proprietà | skipped | `device_not_verified` |
| Dispositivo rimosso o disabilitato in Home Assistant | skipped | `target_unavailable` |
| Target non disponibile, o sparito tra risoluzione e invio | skipped | `target_unavailable` |
| Target ambiguo (mai scelto a caso) | skipped | `ambiguous_target` |
| Ledger non disponibile con `dedupe_key` | skipped | `dedupe_unavailable` |
| Già consegnato per la stessa chiave | already_sent | `already_sent` |
| Errore del servizio | failed | `delivery_failed` |
| Timeout | failed | `delivery_timeout` |
| Consegnato | delivered | — |

Un dispositivo non più verificato non riceve **mai** la notifica: se l'app ora
appartiene a un altro account, il messaggio non deve arrivargli.

## Risultato

```
DispatchResult { request_id, results: RecipientResult[] }
RecipientResult { person_id, status, reason?, devices: DeviceDeliveryResult[] }
DeviceDeliveryResult { personal_device_id, status, reason?, warning? }
```

Lo stato del destinatario si ricava dai dispositivi accesi:

- tutti soddisfatti (`delivered` o `already_sent`): **delivered** (anche se
  tutti erano già stati inviati: l'obiettivo è raggiunto);
- alcuni soddisfatti, altri no: **partial**;
- nessuno soddisfatto dopo almeno un tentativo reale: **failed**
  (`delivery_timeout` se tutti i tentativi sono scaduti, altrimenti
  `delivery_failed`);
- nessun tentativo reale: **skipped**, con il motivo prevalente.

I risultati seguono l'ordine dei destinatari della richiesta e, per ciascuno,
l'ordine dei dispositivi nel profilo. `request_id` è generato a ogni chiamata
per la diagnostica: non è una chiave di deduplica e non viene salvato. Nessun
risultato contiene titolo, messaggio, servizi, entità, token o webhook.

## Isolamento e concorrenza

Ogni destinatario e ogni dispositivo è un compito separato: un errore su un
telefono di Mattia non blocca né il suo tablet né il telefono di Erika, e
un'eccezione inattesa diventa un risultato `failed` invece di interrompere la
chiamata. `asyncio.CancelledError` invece si propaga sempre.

Gli invii partono in parallelo sotto un semaforo condiviso dal Router di **8**
consegne contemporanee: bastano per 10 dispositivi per profilo e 32 destinatari,
e tengono Home Assistant reattivo.

## Consegna

`delivery.py` è l'unico punto che chiama `notify`; la risoluzione del target
resta in `profile/targets.py`. Comportamento verificato su Home Assistant
2025.1 e 2026.2.3, identico nelle due versioni:

- **NotifyEntity**: `notify.send_message` con `message` (e `title`), mirato
  all'entità risolta. Home Assistant passa il titolo a ogni entità, qualunque
  cosa supporti, quindi il Router lo invia solo alle entità che dichiarano
  `NotifyEntityFeature.TITLE`; il messaggio va sempre. Un entity service salta
  **in silenzio** le entità mancanti o non disponibili, per cui l'entità viene
  ricontrollata subito prima della chiamata: altrimenti un target sparito
  risulterebbe consegnato.
- **Servizio legacy** `notify.mobile_app_<nome>`: `message` e `title` facoltativo,
  soltanto sul servizio già risolto da P1.2 (nessun accesso a push
  registration, webhook, URL di push o token). `mobile_app` scarta il titolo
  predefinito "Home Assistant", solleva `HomeAssistantError` se l'app non è
  raggiungibile e **registra senza sollevare** un rifiuto del gateway push.
- Le chiamate sono `blocking=True`, quindi un errore del servizio arriva al
  Router. `ServiceNotFound` diventa `target_unavailable`, le altre eccezioni
  `delivery_failed`, il timeout `delivery_timeout`.
- **Timeout**: 15 secondi per consegna. `mobile_app` concede già 10 secondi al
  gateway push; un timeout più corto segnerebbe come scadute consegne che
  stanno per riuscire. Allo scadere la chiamata viene cancellata; un eventuale
  lavoro già in un thread di Home Assistant non si può fermare.

"Consegnato" significa quindi "Home Assistant ha accettato la notifica senza
errori", non "il telefono l'ha mostrata".

## Deduplica

Facoltativa e decisa dal chiamante: il Router non inventa mai una
`dedupe_key`, perché solo il modulo chiamante conosce l'evento (per esempio, in
futuro, `waste:2026-10-12:paper:evening`). Senza chiave ogni chiamata è un
nuovo invio, senza ledger.

Con la chiave, una consegna è ricordata per **source + dedupe_key + persona +
PersonalDevice**, e solo **dopo** che è riuscita. Quindi:

- la stessa richiesta ripetuta dà `already_sent` sui dispositivi già serviti e
  ritenta solo gli altri (un tablet fallito viene ritentato, il telefono già
  servito no);
- la stessa chiave per un'altra persona, un altro dispositivo o un'altra
  sorgente non collide;
- `target_unavailable`, `ambiguous_target`, `failed` e `timeout` non vengono
  mai registrati.

Due richieste contemporanee per la stessa consegna sono serializzate da un lock
per fingerprint, tenuto da controllo a invio a registrazione: una invia,
l'altra trova `already_sent`. Il lock del ledger è breve e non è mai tenuto
durante un invio, quindi una notifica lenta per una persona non blocca le
altre.

### Garanzie, e cosa non è garantito

- **Exactly once a runtime**: con Home Assistant in esecuzione, richieste
  concorrenti con la stessa chiave non producono due invii.
- **Deduplica persistente** dopo che la consegna è stata registrata, anche
  dopo un riavvio.
- **Non** è garantito exactly once in caso di crash: se Home Assistant si ferma
  dopo l'invio e prima della scrittura del ledger, un nuovo tentativo invia di
  nuovo. `notify` non offre una transazione che permetta di fare meglio.
- Se la notifica parte ma il ledger non si riesce a scrivere, l'esito resta
  `delivered` con `warning: dedupe_not_recorded`, e il problema è loggato senza
  contenuto. La consegna resta ricordata in memoria fino al riavvio; dopo, un
  nuovo tentativo potrebbe ripeterla.
- Se il ledger non è disponibile **prima** dell'invio e la richiesta ha una
  chiave, non si invia (`dedupe_unavailable`): il chiamante ha chiesto al
  massimo una volta. Le richieste senza chiave continuano a funzionare.

## Ledger

Store separato `domusos.notifications.v1` (schema `domusos-notifications`,
versione 1); il Profile Store resta solo profilo. Ogni voce contiene solo:

```json
{ "fingerprint": "<sha256>", "delivered_at": "<ISO 8601>" }
```

Il fingerprint è lo SHA-256 dell'array JSON `[source, dedupe_key, person_id,
personal_device_id]`, che non è ambiguo qualunque carattere contengano le
parti. Non vengono salvati la chiave in chiaro, persona, dispositivo, sorgente,
titolo, messaggio, metadata, servizi o entità: per deduplicare basta il
fingerprint.

Il ledger è limitato a **1000** voci: oltre, si eliminano le più vecchie in
ordine di consegna, in modo deterministico. Nessun TTL e nessuno scheduler. Un
ledger illeggibile (documento non valido, errore di caricamento, file messo da
parte da Home Assistant) resta su disco così com'è, non viene azzerato né
sovrascritto, e il ledger risulta `corrupt`: si comporta come non disponibile,
mentre Profile e dispositivi continuano a funzionare.

## Test di notifica (`domusos/profile/test_self`)

L'unico comando lato client. Non è un endpoint di invio:

```json
{ "type": "domusos/profile/test_self", "personal_device_id": "<facoltativo>" }
```

- Accetta solo `type` e un `personal_device_id` facoltativo: nessun testo,
  destinatario, persona, utente, `ha_device_id`, servizio, target o dato.
  Home Assistant e il bridge rifiutano ogni altro campo.
- Agisce sull'utente della connessione e sul suo profilo, **senza** passare
  dalla persona: anche un utente senza persona può provare i propri dispositivi.
- Con `personal_device_id` prova solo quel dispositivo, se è nel suo profilo;
  altrimenti `device_not_in_profile`, anche se l'id esiste in un altro profilo.
- Rispetta le preferenze (interruttore generale e del dispositivo).
- Titolo "Domus UI", testo "Test notification from Domus UI.", decisi dal
  server; nessuna localizzazione finché non esiste una UI dedicata.
- Una prova ogni 10 secondi per utente, in memoria (`rate_limited`); nessuna
  deduplica.
- Usa lo stesso motore del Router: stessa risoluzione del target, stesse
  chiamate, timeout e gestione degli errori.
- Senza Router risponde `notification_router_unavailable`.
- Capability del bridge: `profile_notifications_v1`; la versione del
  protocollo non cambia. Nessun pulsante nella UI in questa fase.

## Ciclo di vita

All'avvio dell'integrazione: Profile Core pronto → ledger caricato → Router
creato. Se il Profile Core non parte, il Router non esiste; se il ledger non
parte, il Router funziona ma rifiuta le richieste con `dedupe_key`; se il Router
non parte, tutti gli altri moduli continuano. All'unload si rilasciano lo
stato in memoria e il rate limit. Nessun polling, scheduler, ContextProvider o
evento sul bus Domus: non ci sono ancora consumatori.

## Log

Si loggano solo `request_id`, `source`, id della persona, id del
`PersonalDevice`, stato e motivo. Mai titolo, messaggio, metadata, token,
webhook, servizio o entità di destinazione, coordinate o email. Gli errori di
Home Assistant sono loggati solo con il tipo, perché il testo può riportare il
payload.

## Come lo userà Waste Collection (P1.6)

Oggi Waste Collection usa ancora i propri `notifications.targets`, il proprio
dispatch ledger e il proprio `test_notification`, e P1.4 non li tocca. Con la
migrazione salverà `recipients: [person_id]` e chiamerà:

```python
await router.async_send(NotificationRequest.create(
    recipients=config.recipients,
    source="waste_collection",
    category="waste",
    title=...,
    message=...,
    dedupe_key=f"waste:{day}:{types}:evening",
))
```

## Non ancora implementato

- Scelta dei destinatari (`PersonRecipientPicker`, `list_recipients`) — P1.5.
- Migrazione di Waste Collection al Router — P1.6.
- Preferenze per categoria, ore di silenzio, override urgenti.
- Inbox Domus e cronologia delle notifiche.
- Payload ricchi (azioni, immagini, canali, alert critici).
- Pulsante "Invia notifica di prova" nella UI del Profilo.
