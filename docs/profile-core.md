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

## Decisioni architetturali

Decisioni fissate dopo P1.1. La colonna di destra indica se il codice attuale le
rispetta già.

| # | Decisione | Stato in P1.1 |
| --- | --- | --- |
| 1 | **Label**: assente, `null`, `""` o solo spazi significano tutti "nessuna label". | Rispettata da P1.1a: forma canonica senza campo `label`, normalizzazione in memoria al caricamento, confronto dei dispositivi dopo la normalizzazione. |
| 2 | **Dispositivo in due profili attivi**: conflitto di proprietà, in quarantena; nessun proprietario e nessun last-write-wins. | Rispettata: il dispositivo esce dall'indice inverso e compare solo tra i conflitti. |
| 3 | **Profili orfani**: nessuna pulizia automatica in V1. | Rispettata: alla rimozione dell'utente il profilo diventa `orphaned` e resta. |
| 4 | **Profilo orfano e nuovo proprietario**: un profilo orfano non blocca per sempre l'associazione di un dispositivo, se il nuovo proprietario supera la verifica reale lato Home Assistant. | Base pronta: i profili orfani sono già esclusi dall'indice di proprietà. La verifica arriva con P1.2. |
| 5 | **Salvataggio senza modifiche**: nessun incremento di revisione. | Rispettata da P1.1a, anche per un profilo mai salvato; il conflitto di revisione viene controllato prima. |
| 6 | **Rimozione e nuova aggiunta** dello stesso dispositivo: nuovo `PersonalDevice.id`. | Da implementare con P1.2 (oggi i dispositivi non si possono modificare). |
| 7 | **Ospiti**: nessun riconoscimento per nome; non selezionabili come destinatari finché non esiste un'identità o un ruolo stabile ed esplicito. | Rispettata: il Profile Core non contiene logica ospiti. |
