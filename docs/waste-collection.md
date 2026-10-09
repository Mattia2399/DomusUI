# Raccolta rifiuti — promemoria

La raccolta rifiuti manda **un solo promemoria la sera prima** di ogni giorno di
raccolta, con tutte le tipologie di quel giorno ("Raccolta di domani: Organico ·
Carta e cartone"), all'orario scelto. Il server calcola i giorni da regole fisse,
calendari Home Assistant ed eccezioni; lo scheduler scatta una volta al giorno.

## Chi riceve: persone, non dispositivi

Dalla versione 2 del documento (`domusos.waste_collection.v1`, campo `version:
2`) i promemoria vanno alle **persone** di Home Assistant, tramite il
[Notification Router](notification-router.md). L'amministratore sceglie chi;
ogni persona sceglie dove, dai propri dispositivi nel Profilo Domus.

```json
"notifications": {
  "enabled": true,
  "time": "20:00",
  "mode": "recipients",
  "recipients": ["<id interno persona>", "..."],
  "legacyTargets": []
}
```

`mode` indica l'**unico** percorso di consegna:

| `mode` | Usa | Non usa mai |
| --- | --- | --- |
| `recipients` | `recipients` tramite il Notification Router | `legacyTargets` |
| `legacy` | `legacyTargets`, come la versione 1 usava `targets` | il Router |

Non esiste uno stato "inviali entrambi" e nessun fallback da un percorso
all'altro: se il Router non è disponibile, un promemoria in modalità
`recipients` non parte (`notification_router_unavailable`) e i target
precedenti restano inattivi; se una persona non è pronta, non si torna ai
vecchi target.

- `recipients` contiene solo id interni di persona: unici, nell'ordine scelto,
  al massimo 32, validati per forma e mai per esistenza (una persona può essere
  stata rimossa). Nessun id di utente, entità persona, dispositivo, servizio o
  tracker.
- Una persona rinominata o ricollegata a un altro utente non richiede alcuna
  modifica: il Router la risolve a ogni invio.
- Una persona rimossa o diventata ambigua resta nella configurazione finché un
  amministratore non la toglie; il Router la riporta come `unknown_recipient` o
  `ambiguous_recipient` e gli altri continuano normalmente. Lo stesso vale per
  chi non ha profilo, dispositivi, notifiche accese o account: la prontezza non
  decide chi si può scegliere.
- Con le notifiche accese in modalità `recipients` serve almeno una persona.

## Migrazione dalla versione 1

La migrazione è **strutturale e automatica**, al caricamento:

```
v1: notifications { enabled, time, targets }
v2: notifications { enabled, time, mode: "legacy", recipients: [], legacyTargets: targets }
```

Tutto il resto del documento resta identico, incluso il dispatch ledger. Una
configurazione migrata continua a comportarsi **esattamente** come prima.
Leggere non scrive: la versione 2 arriva su disco con il primo salvataggio
reale. Unica eccezione: un documento v1 **senza target** non poteva mandare
nulla, quindi parte in modalità `recipients`, senza alcun comportamento da
conservare.

Nessuna conversione semantica automatica: un target come
`notify.mobile_app_mattia` non viene mai associato alla persona "Mattia", né per
nome, né per utente, né per dispositivo, e la conversione non preseleziona
nessuno.

## Conversione esplicita

Una configurazione `legacy` mostra "Configurazione precedente" e il pulsante
**Converti in persone**. Il pannello di conversione spiega la differenza
(persone invece di dispositivi) e apre il selettore di persone; si completa solo
con **Converti e salva**, con almeno una persona, in un unico salvataggio
atomico (`mode` e `recipients` insieme, con controllo di revisione: una
revisione superata dà `revision_conflict`). Annullare non scrive nulla. Se ci
sono altre modifiche non salvate, prima vanno salvate o annullate.

I `legacyTargets` restano nel documento dopo la conversione, inutilizzati, per
diagnostica e per un eventuale ripristino amministrativo futuro. Non c'è un
"torna al sistema precedente" nell'interfaccia, e il server rifiuta ogni
passaggio da `recipients` a `legacy`. I target precedenti appartengono al
server: un client non li può aggiungere né modificare (il salvataggio rifiuta
`targets` e `legacyTargets`), e le API restituiscono solo quanti sono
(`legacyTargetCount`), mai quali.

## Invio

- **`recipients`**: Waste costruisce una `NotificationRequest` con `source:
  "waste_collection"`, `category: "waste"`, le persone scelte, lo stesso titolo
  e testo di sempre, e una `dedupe_key`. Il Router fa il resto.
- **`legacy`**: il percorso precedente, invariato, con il proprio dispatch
  ledger.

Waste non conosce dispositivi personali, dispositivi Home Assistant, servizi
`notify` o target nel percorso nuovo: conosce solo id di persona e l'esito per
persona.

### Chiave di deduplica

```
waste:reminder:<giorno di raccolta>:<tipologie in ordine>:evening
```

per esempio `waste:reminder:2026-10-07:organic+paper:evening` (con molte
tipologie lunghe, un SHA-256 delle tipologie al loro posto). Il giorno è quello
di raccolta nel fuso orario di Home Assistant, non l'istante dell'esecuzione;
titolo, testo e lingua non entrano nella chiave. Lo stesso promemoria ha sempre
la stessa chiave; un altro giorno, o un'altra combinazione di tipologie nello
stesso giorno (un'eccezione aggiunta dopo), è un altro promemoria. Il Router
aggiunge da sé persona e dispositivo, quindi un nuovo tentativo dello stesso
promemoria ripete solo i dispositivi che non l'hanno ricevuto. Oggi lo
scheduler non ritenta da solo.

### Esiti

Il risultato del promemoria e del test riporta uno stato complessivo
(`delivered`, `partial`, `failed`, `skipped`) e, per persona, `status` e
`reason`; mai dettagli dei dispositivi. Un invio parziale o fallito è un
risultato, non un errore: lo scheduler continua. Nei log: id della richiesta,
stato, numero di persone e, in debug, persona e motivo; mai il testo.

### Notifica di prova

- `recipients`: va alle persone scelte tramite il Router, **senza** chiave di
  deduplica: ogni prova è nuova. L'interfaccia dice "Notifica di prova
  inviata.", "Invio parziale: alcune persone non sono raggiungibili." o "Nessuna
  persona può ricevere la notifica in questo momento.".
- `legacy`: il percorso precedente, invariato; non serve convertire per provare.

## Due ledger, separati

- Il **dispatch ledger** di Waste (`giorno|target`) serve solo alla modalità
  `legacy` e resta finché esiste la compatibilità con i target precedenti.
- Il **Notification Ledger** del Router serve solo alla modalità `recipients`.

Non interagiscono e le vecchie voci non vengono migrate: non hanno lo stesso
modello di identità. Di conseguenza la deduplica **non attraversa** la
conversione: se un promemoria è partito con i target precedenti e lo stesso
promemoria venisse eseguito di nuovo dopo la conversione, potrebbe arrivare una
seconda volta. In pratica lo scheduler manda un solo promemoria per sera e la
conversione avviene fuori da quell'istante.

## Permessi e privacy

Salvare e provare restano per amministratori, sia nell'API sia nel manager; il
selettore di persone usa `domusos/profile/list_recipients`, anch'esso solo per
amministratori. Il documento contiene id di persona e, per le configurazioni
precedenti, i loro target tecnici; mai dati di dispositivi, preferenze del
profilo, email o target moderni.
