# Domus Profile Core

Il Domus Profile estende un utente Home Assistant con ciò che Domus aggiunge
(dispositivi personali, preferenze di notifica). Home Assistant resta
l'autorità per autenticazione, utenti, persone, ruoli, nomi, foto, presenza e
permessi: il profilo non ne copia nessuno.

## Identità

| Ruolo | Identificatore | Note |
| --- | --- | --- |
| Proprietario del profilo | `user_id` Home Assistant | Ricavato sempre dalla connessione WebSocket, mai dal client |
| Destinatario futuro (persona) | id interno della Person (`attributes.id`) | Assegnato alla creazione, non cambia con la rinomina; obbligatorio anche in YAML |
| Presentazione | `entity_id`, `friendly_name`, `entity_picture` | Letti dal vivo, mai salvati |

Una ricerca restituisce `unknown` (nessuna corrispondenza), `resolved` (una) o
`ambiguous` (più di una): con più corrispondenze non si sceglie mai una persona.
Nomi, username ed email non vengono mai confrontati.

Gli account `system_generated` non hanno un profilo; un account disattivato
conserva il profilo ma non può usarlo.

## Store

Un solo Store, `domusos.profiles.v1`, con una revisione per profilo (optimistic
concurrency). Una lettura non scrive mai: un profilo mai salvato viene
sintetizzato con `revision: 0`. Un documento non valido, o messo da parte da
Home Assistant perché illeggibile, non viene mai sovrascritto.

### Label di un dispositivo

Label assente, `null`, `""` e stringa di soli spazi significano tutti
"nessuna label personalizzata". Una label esiste solo se dopo il trim resta una
stringa non vuota, che viene salvata già trimmata (massimo 64 caratteri).

- Forma canonica salvata: senza label il campo `label` è **assente**; non si
  salvano mai `null`, `""` o spazi.
- Input permissivo: client e Store possono contenere una qualsiasi delle forme
  equivalenti. Una label che non è né stringa né `null` resta un errore
  (`invalid_profile` dal client, Store non valido al caricamento).
- Uno Store esistente con label `null`, vuote o di soli spazi viene
  normalizzato **solo in memoria** al caricamento: il file viene riscritto in
  forma canonica soltanto alla prossima modifica reale del profilo.
- I dispositivi rimandati dal client vengono confrontati dopo la
  normalizzazione: rimandare `label: null` per un dispositivo senza label non è
  una modifica.

### Salvataggi senza modifiche

`save_self` segue sempre questo ordine:

1. validazione della richiesta;
2. controllo di `expected_revision`: una revisione diversa è `revision_conflict`,
   anche se il contenuto inviato è identico a quello attuale;
3. normalizzazione del contenuto;
4. confronto con il contenuto attuale normalizzato;
5. nessuna scrittura oppure nuova revisione.

Un salvataggio con lo stesso contenuto è un **no-op**: la revisione e
`updated_at` non cambiano, lo Store non viene scritto e la risposta è lo stato
corrente. Vale anche per un profilo mai salvato: rimandare i valori predefiniti
(`notifications.enabled: true`, nessun dispositivo, nessuna preferenza) con
`expected_revision: 0` lascia `persisted: false` e `revision: 0`. Solo la prima
modifica reale crea il profilo (`revision: 1`, `created_at` = `updated_at`);
`created_at` non cambia più dopo.

## Dispositivi personali

Un `PersonalDevice` è un oggetto Domus: un dispositivo fisico dell'utente,
identificato da un id Domus generato dal server e collegato a un dispositivo del
Device Registry di Home Assistant (`source.ha_device_id`). Il profilo salva solo
id, `ha_device_id`, label facoltativa, `added_at` e `notifications.enabled`.
Nome, tipo, presenza, stato e target di notifica sono calcolati dal vivo a ogni
richiesta e non vengono mai salvati.

Un dispositivo personale non è un `device_tracker` e non è un target di
notifica: la presenza resta di Home Assistant e il Profile Core non modifica
mai i tracker di una persona.

### Proprietà verificata

Un dispositivo è **verificato** per l'utente collegato solo se:

1. esiste una registrazione della Companion App (`mobile_app`) attiva, cioè non
   disabilitata;
2. Home Assistant l'ha creata per quell'utente (`user_id` della registrazione);
3. la registrazione è collegata a un solo dispositivo del Device Registry, che
   porta l'identificatore dell'app, ed esso esiste e non è disabilitato;
4. quel dispositivo non è collegato ad altre registrazioni.

Verificato significa "Home Assistant lega questo dispositivo al tuo account",
non "aggiunto": l'utente conferma sempre. Nomi del dispositivo, del tracker,
della persona, username ed email non contano mai, nemmeno come indizio.

Solo `profile/mobile_app.py` conosce la struttura delle registrazioni: legge
`user_id`, `device_id` e `device_name` e mai webhook, segreti, token o URL di
push. `user_id` nei dati della registrazione non è un'API documentata di Home
Assistant, ma `mobile_app` stesso lo usa per rimuovere le app di un utente
eliminato; si comporta allo stesso modo in 2025.1 e 2026.2.3.

### Scoperta

`discover_devices` elenca soltanto le registrazioni create dall'utente
collegato: un dispositivo di un altro utente non compare mai, qualunque nome
abbia. Non scrive nulla e non concede nulla. Ogni voce ha `confidence:
"verified"` e uno stato:

| Stato | Significato | Aggiungibile |
| --- | --- | --- |
| `available` | Verificato e libero | sì |
| `already_owned` | Già nel tuo profilo | no |
| `owned_by_other` | Appartiene a un altro profilo attivo (nessun dettaglio sul proprietario) | no |
| `ownership_conflict` | In più profili attivi, in quarantena | no |
| `missing` | La registrazione non ha un dispositivo nel Device Registry | no |
| `unavailable` | Registrazione o dispositivo disabilitati, o non dimostrabili | no |

### Proprietà attiva e conflitti

Un dispositivo appartiene al massimo a **un profilo attivo**. L'indice inverso
`ha_device_id -> proprietario` considera solo i profili attivi: se lo stesso
dispositivo compare in più profili attivi è in **conflitto**, senza
proprietario, finché uno dei profili non lo rimuove esplicitamente; allora
l'indice ricostruito lo assegna all'unico rimasto. Nessun last-write-wins,
nessun trasferimento né correzione automatica, e uno Store con un conflitto
resta valido e leggibile.

Un profilo **orfano** non possiede nulla: non blocca l'aggiunta dello stesso
dispositivo da parte di un utente attivo verificato, e conserva comunque il
proprio dato storico. Lo stesso `ha_device_id` può quindi comparire in un
profilo orfano e in un solo profilo attivo senza che sia un conflitto.

### Ciclo di vita

- **Aggiunta** (`add_device`): il server rivaluta tutto dal vivo, sotto il lock
  del documento e subito prima della scrittura: il dispositivo esiste, la
  registrazione lo verifica per l'utente, non è in conflitto né di un altro
  profilo attivo, il profilo ha meno di 10 dispositivi. Il nuovo record riceve
  un id e un `added_at` generati dal server e `notifications.enabled: true`.
  Aggiungere un dispositivo già presente è un no-op.
- **Rimozione** (`remove_device`): sempre possibile per un dispositivo proprio,
  anche se Home Assistant non lo conosce più. Rimuovere e aggiungere di nuovo lo
  stesso dispositivo crea un **nuovo** record, con nuovo id e nuovo `added_at`.
- **Modifica** (`update_device`): solo label e `notifications.enabled`. Id,
  `added_at`, `source` e `ha_device_id` non cambiano mai: per cambiare
  dispositivo si rimuove e se ne aggiunge un altro.
- Una Companion App reinstallata crea un nuovo dispositivo in Home Assistant: il
  vecchio record risulta `missing`, la scoperta propone il nuovo e nulla viene
  trasferito automaticamente.

Tutte le scritture passano da `_async_commit`, con revisione, normalizzazione
della label e no-op come per `save_self`. `save_self` invece non cambia mai i
dispositivi.

### Target di notifica

Il target è risolto dal vivo e non viene mai salvato. Lo usa il
[Notification Router](notification-router.md) a ogni invio; la risoluzione
resta qui, l'invio è nel router:

1. un'entità `notify.*` che l'Entity Registry lega allo stesso dispositivo;
2. il servizio legacy `notify.mobile_app_<nome>` della registrazione collegata,
   verificato con `hass.services.has_service` (in 2025.1 e 2026.2.3
   `mobile_app` usa ancora questo modello);
3. nessuno.

| `notification_target_status` | Significato |
| --- | --- |
| `ready` | Target utilizzabile ora |
| `unavailable` | Target previsto ma non registrato, disabilitato o non disponibile |
| `ambiguous` | Più entità del dispositivo, o un servizio legacy condiviso con un'altra registrazione |
| `unsupported` | Nessuna registrazione dell'app e nessuna entità `notify` |

Proprietà e target sono indipendenti: un dispositivo verificato può avere un
target ambiguo o non disponibile, e in quel caso non è pronto per le notifiche.

### API

| Comando | Richiesta | Note |
| --- | --- | --- |
| `domusos/profile/get_self` | solo `type` | `profile` (dati salvati) + `live_devices` (stato dal vivo per ogni dispositivo: `device_id`, `status`, `display_name`, `kind`, `capabilities`, `notification_target_status`, `presence`) |
| `domusos/profile/discover_devices` | solo `type` | `devices` + `revision` del profilo |
| `domusos/profile/add_device` | `expected_revision`, `ha_device_id`, `label?` | mai id o data dal client |
| `domusos/profile/remove_device` | `expected_revision`, `device_id` | |
| `domusos/profile/update_device` | `expected_revision`, `device_id`, `label?`, `notifications?` | almeno uno dei due |
| `domusos/profile/test_self` | `personal_device_id?` | notifica di prova a testo fisso sui propri dispositivi; vedi [Notification Router](notification-router.md#test-di-notifica-domusosprofiletest_self) |

Stato dal vivo di un dispositivo del profilo: `active`, `unverified` (la
registrazione non lo verifica più per l'utente), `ownership_conflict`,
`unavailable` (disabilitato in Home Assistant) o `missing` (non più nel Device
Registry). Nessun comando accetta id di utente, persona o proprietario, e gli
errori non rivelano mai il proprietario di un dispositivo.

Errori dei dispositivi: `device_not_found`, `device_not_claimable`,
`device_owned_by_other_profile`, `device_ownership_conflict`,
`too_many_devices`, `invalid_device`, `device_not_in_profile`;
`notification_target_unavailable` e `ambiguous_target` sono riservati
all'invio.

### Privacy

Non vengono mai salvati né restituiti token o URL di push, id dei webhook,
segreti o dati completi della registrazione, servizi di notifica, email,
coordinate o storico della posizione. I log riportano solo identificatori
tecnici minimi.

## Schermata "I miei dispositivi"

Profilo → I miei dispositivi (`/profile/devices`) è la gestione self-service
dei dispositivi personali. Usa solo i comandi `domusos/profile/*` già descritti
e non invia mai id di utente, persona o proprietario, né un `ha_device_id`
scritto a mano: si associa solo un dispositivo proposto dalla scoperta.

- **Lettura**: `get_self` viene chiamato all'apertura del Profilo, una volta,
  senza polling né sottoscrizioni. La panoramica e la schermata dei dispositivi
  usano la stessa risposta; la riga "I miei dispositivi" mostra il numero di
  `personal_devices` del profilo, non dei tracker.
- **Dati salvati e dati dal vivo** restano separati: label e interruttori
  vengono dal profilo, nome, tipo, stato, target e presenza da `live_devices`.
  Un dispositivo senza dati dal vivo è mostrato come non più disponibile.
- **Notifiche**: l'interruttore generale (`save_self` con solo
  `notifications.enabled`) e quello di ogni dispositivo (`update_device`) sono
  valori indipendenti. Spegnere il generale non cambia i dispositivi, che
  restano modificabili. "Riceve notifiche" = generale && dispositivo &&
  `capabilities.notifications`: è solo una presentazione e non viene salvato.
  Se il dispositivo non può ricevere notifiche il suo interruttore è bloccato
  ma conserva il valore.
- **Revisione**: ogni scrittura invia `expected_revision`. I comandi partono
  uno alla volta, ciascuno con l'ultima revisione ricevuta, e un interruttore
  resta bloccato finché il suo comando non risponde. Su `revision_conflict` la
  schermata rilegge il profilo e lo dice all'utente; non ripete mai il comando
  da sola.
- **Aggiunta**: la scoperta parte all'apertura del pannello, si può aggiornare
  e mette prima i dispositivi associabili, poi quelli già nel profilo, poi gli
  altri. Un dispositivo non associabile non ha alcun pulsante; associare chiede
  una conferma leggera.
- **Rimozione**: possibile anche per un dispositivo non più verificato o non
  più presente in Home Assistant, e non tocca Home Assistant.
- **Presenza**: solo descritta ("Gestita da Home Assistant", "Tracker
  disponibile", "Non configurata"); la schermata non chiama mai
  `person/update`.
- **Disponibilità**: fuori dal pannello basta la connessione; dentro il
  pannello serve anche la capability `profile_devices_v1` del bridge (non la
  versione del protocollo). Senza supporto la riga mostra "Non disponibile";
  offline le modifiche sono disattivate.
- I dettagli tecnici (id del dispositivo Home Assistant, tracker, stato del
  target) sono chiusi per impostazione predefinita e non includono mai user
  id, webhook, token o URL di push.

### Persona corrente e presenza

La persona corrente è solo la `person` il cui attributo `user_id` è uguale
all'id dell'utente Home Assistant collegato; se non ce n'è esattamente una,
non c'è persona né presenza. I tracker sono solo quelli che quella persona
dichiara (`device_trackers`, `source`, `entity_id` quando presente). Nomi,
username, email e attributi dei tracker non contano mai: un utente senza
persona collegata non vede la presenza di nessun altro. Il numero di tracker
resta solo nella pagina Attività, come "Fonti di presenza".

## Decisioni architetturali

Decisioni fissate dopo P1.1. La colonna di destra indica come il codice attuale
le rispetta.

| # | Decisione | Stato |
| --- | --- | --- |
| 1 | **Label**: assente, `null`, `""` o solo spazi significano tutti "nessuna label". | Rispettata da P1.1a: forma canonica senza campo `label`, normalizzazione in memoria al caricamento, confronto dei dispositivi dopo la normalizzazione. |
| 2 | **Dispositivo in due profili attivi**: conflitto di proprietà, in quarantena; nessun proprietario e nessun last-write-wins. | Rispettata: il dispositivo esce dall'indice inverso e compare solo tra i conflitti. |
| 3 | **Profili orfani**: nessuna pulizia automatica in V1. | Rispettata: alla rimozione dell'utente il profilo diventa `orphaned` e resta. |
| 4 | **Profilo orfano e nuovo proprietario**: un profilo orfano non blocca per sempre l'associazione di un dispositivo, se il nuovo proprietario supera la verifica reale lato Home Assistant. | Rispettata da P1.2: i profili orfani non entrano nell'indice di proprietà e conservano il dato. |
| 5 | **Salvataggio senza modifiche**: nessun incremento di revisione. | Rispettata da P1.1a, anche per un profilo mai salvato; il conflitto di revisione viene controllato prima. |
| 6 | **Rimozione e nuova aggiunta** dello stesso dispositivo: nuovo `PersonalDevice.id`. | Rispettata da P1.2: ogni aggiunta genera id e `added_at` sul server. |
| 7 | **Ospiti**: nessun riconoscimento per nome; non selezionabili come destinatari finché non esiste un'identità o un ruolo stabile ed esplicito. | Rispettata: il Profile Core non contiene logica ospiti. |
