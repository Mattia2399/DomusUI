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

## Decisioni architetturali

Decisioni fissate dopo P1.1. La colonna di destra indica se il codice attuale le
rispetta già.

| # | Decisione | Stato in P1.1 |
| --- | --- | --- |
| 1 | **Label**: assente, `null`, `""` o solo spazi significano tutti "nessuna label". | **Da allineare.** Oggi una label vuota o di soli spazi salvata rende lo Store non valido, e `label: null` rimandato dal client per un dispositivo senza label viene trattato come modifica dei dispositivi. |
| 2 | **Dispositivo in due profili attivi**: conflitto di proprietà, in quarantena; nessun proprietario e nessun last-write-wins. | Rispettata: il dispositivo esce dall'indice inverso e compare solo tra i conflitti. |
| 3 | **Profili orfani**: nessuna pulizia automatica in V1. | Rispettata: alla rimozione dell'utente il profilo diventa `orphaned` e resta. |
| 4 | **Profilo orfano e nuovo proprietario**: un profilo orfano non blocca per sempre l'associazione di un dispositivo, se il nuovo proprietario supera la verifica reale lato Home Assistant. | Base pronta: i profili orfani sono già esclusi dall'indice di proprietà. La verifica arriva con P1.2. |
| 5 | **Salvataggio senza modifiche**: nessun incremento di revisione. | **Da allineare.** Oggi ogni salvataggio accettato incrementa la revisione e scrive, anche se nulla cambia. |
| 6 | **Rimozione e nuova aggiunta** dello stesso dispositivo: nuovo `PersonalDevice.id`. | Da implementare con P1.2 (oggi i dispositivi non si possono modificare). |
| 7 | **Ospiti**: nessun riconoscimento per nome; non selezionabili come destinatari finché non esiste un'identità o un ruolo stabile ed esplicito. | Rispettata: il Profile Core non contiene logica ospiti. |
