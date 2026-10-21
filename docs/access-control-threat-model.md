# Domus Access Control — threat model (P2.0)

Rischi concreti per l'autorizzazione in Domus, con esposizione **attuale** (base
`f5eb98d`) e mitigazione **richiesta**. Architettura in
[access-control-architecture.md](access-control-architecture.md); capability,
route e azioni in [access-control-capabilities.md](access-control-capabilities.md).

## Attori

| Attore | Descrizione |
| --- | --- |
| **Membro** | Utente HA normale (`system-users`), autenticato, che vuole fare più di quanto la casa gli concede in Domus |
| **Ristretto** | Utente HA con ruolo Domus limitato (es. un bambino) |
| **Pannello** | Chiunque davanti a un tablet a muro, loggato con l'account del pannello |
| **Admin HA** | Amministratore Home Assistant; fuori dal perimetro di Domus per costruzione |
| **Client modificato** | Qualunque codice nel browser dell'utente: DevTools, estensioni, client WS scritto a mano |
| **Guasto** | Store corrotto, HA offline, riavvio, migrazione non riuscita, race |
| **Futuro** | Moduli Domus Lab, azioni di Domus Intelligence |

Fuori perimetro: chi non ha credenziali HA (lo protegge HA) e l'admin HA, che
può modificare HA e i file `.storage`.

## Rischio strutturale principale

**Le azioni native di Home Assistant non passano dal backend Domus.**

- Un membro può chiamare `call_service`, `person/list`, `frontend/get_system_data`
  e le API di storia con la propria sessione, dalla console del pannello o con
  un client qualsiasi.
- HA dà a `system-users` controllo su **tutte** le entità. Una capability Domus
  negata su `access.control` non impedisce `lock.unlock` dalla sessione HA, né
  una negata su `security.control` impedisce di disarmare l'allarme.

Mitigazione: dichiararlo (D6), usare i permessi nativi di HA per i limiti veri
(utente di sola lettura, account dedicati), affidarsi ai codici validati da HA
per serrature e allarme, e rendere Domus una barriera vera dove esegue lui.

## Tabella

Severità: impatto × probabilità, sul danno nel mondo reale. Le fasi sono quelle
della [roadmap](access-control-architecture.md#19-roadmap).

| # | Threat | Actor | Attack path | Impact | Current mitigation | Required mitigation | Enforcement layer | Severity | Phase |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | Azione nativa HA negata da Domus eseguita lo stesso | Membro, Ristretto | `call_service` dalla sessione HA (console, client WS) | Apre serrature, disarma allarme, muove cancelli | Nessuna in Domus; HA: codici allarme/serratura se configurati | D6 in UI; account con limiti veri = utente HA di sola lettura o pannello dedicato; codici HA obbligatori per serrature e allarme; nessuna promessa di sicurezza dove Domus non decide | HA (5) | **Critica** (documentata, non risolvibile in Domus) | P2.0 doc, P2.6 UI |
| T2 | Comando Domus chiamato senza la UI | Membro, Client modificato | WS manuale `domusos/energy/get_history`, `irrigation/start_zone`, … | Lettura dati energetici, avvio irrigazione | `require_admin` sui comandi di configurazione; `check_entity` in Irrigazione; Energy get_state/get_history aperti | `require_capability` su **ogni** comando, test di contratto che lo imponga | Backend Domus (4) | Alta | P2.2, P2.5 |
| T3 | Servizio HA `domusos.*` usato per aggirare il WS | Membro | `call_service domusos.start_irrigation_zone` | Come T2 | `_service_user` + `check_entity` | `authorize_service_call` con la stessa capability del WS | Backend Domus (4) | Media | P2.5 |
| T4 | Identità falsificata nel payload | Client modificato | `user_id`, `person_id` o ruolo nel messaggio | Agire come un altro | Profile e bridge rifiutano id nel payload; principal da `connection.user` | Invariante D1 nel registro; test di contratto: payload con id utente → rifiuto | Backend Domus (4) | Alta | P2.2 |
| T5 | `localStorage` modificato (`role=admin`, capability in cache) | Client modificato | DevTools | La UI mostra funzioni non concesse | Nessuno stato di ruolo in `localStorage`; `can()` di oggi deriva da `auth/current_user` | Cache solo UX; backend rivaluta ogni richiesta (test S2) | Backend Domus (4), HA (5) | Bassa (solo UX) | P2.4, P2.5 |
| T6 | IndexedDB / cache del bridge alterati | Client modificato | DevTools | Come T5 | Nessuna autorità lato client | Come T5 | (4)(5) | Bassa | — |
| T7 | Route digitata a mano | Membro, Ristretto | `/settings/data`, `/settings/device/power` | Vede pagine non previste | Voci nascoste; azioni ripetute da HA o Domus | Guard di route + «Non disponibile»; azioni comunque nel backend | Route (2) + (4)(5) | Bassa | P2.4 |
| T8 | Frontend modificato che ignora `can()` | Client modificato | Bundle alterato o richieste costruite a mano | Come T1/T2 | Come T1/T2 | Come T1/T2: il frontend non è autorità | (4)(5) | Come T1/T2 | P2.5 |
| T9 | Replay di una richiesta | Client modificato | Rinvio di un comando registrato | Ripetere un'azione | WS autenticato per sessione; `expected_revision` nelle scritture Domus | Capability rivalutata a ogni richiesta; scritture con `expected_revision`; azioni idempotenti dove possibile | (4) | Bassa | P2.2 |
| T10 | Tab con autorizzazioni vecchie | Membro dopo un cambio | Tab aperta prima del downgrade | Azione non più permessa | Rilettura `auth/current_user` ogni 15 s; HA invalida `is_admin` subito | Push di `revision` (`domusos/access/subscribe`); backend valuta sempre con lo store corrente (test S3) | (4) + UX | Media | P2.4, P2.5 |
| T11 | Ruolo cambiato a tab aperta | Admin che restringe | Come T10 | Come T10 | Come T10 | Come T10 + chiusura della pagina con avviso | (4) + UX | Media | P2.4 |
| T12 | Utente rimosso da HA | — | Sessioni chiuse da HA | Assignment orfano | HA chiude l'accesso | Ascoltare `user_removed`, ripulire l'assignment; mai riusato da un nuovo account | (4) | Bassa | P2.1 |
| T13 | Downgrade admin → utente | Admin HA che si declassa | Gruppi HA cambiati | Capability admin residue | `is_admin` vivo in HA; `require_admin` per richiesta | `requires_ha_admin` valutato a ogni richiesta, mai salvato nello store | (4)(5) | Media | P2.2 |
| T14 | Policy store corrotto | Guasto | File `.storage` non valido | Restrizioni perse → ristretti tornano membri (fail open) | P2.1: stato `corrupt`, file mai riscritto, quarantena HA rispettata, `locked` per non admin, issue HA, recupero admin | — | (4) | Alta | P2.1 ✓ |
| T15 | Store mancante | Guasto o prima installazione | File assente | Nessuna restrizione | — (non esiste) | `absent` = default di oggi; se lo store era già stato creato, la sparizione è `corrupt` (marcatore nello stato HA) | (4) | Media | P2.1 |
| T16 | Migrazione non riuscita | Guasto | Aggiornamento dell'integrazione | Come T14 | — | `migration_failed` = `corrupt` senza riscrivere l'originale | (4) | Media | P2.1 |
| T17 | Versione dello schema più nuova (rollback) | Guasto | Downgrade dell'integrazione | Lettura errata | — | `unsupported`: file intatto, ruolo `locked` per non admin | (4) | Media | P2.1 |
| T18 | Race all'avvio | Guasto | Richieste prima che lo store sia caricato | Decisione su dati parziali | Alimentazione: `DevicePowerUnavailableError` finché non è pronta | Stato `loading` = DENY per capability `high`/`critical` e `locked` per il resto; mai default prima del caricamento | (4) | Media | P2.1 |
| T19 | HA non raggiungibile | Guasto | WS chiusa, bridge offline | Azioni a stato incerto | Bridge: dopo 40 s comandi bloccati; fail closed su identità in risoluzione | Nessuna autorità offline; la UI tiene l'ultimo stato solo in lettura | UX + (5) | Bassa | P2.4 |
| T20 | Backend Domus riavviato | Guasto | Reload dell'integrazione | Subscription perse, cache vecchie | Il frontend ricarica lo stato al reconnect | Ricarica `get_self` al reconnect; revisione monotona persistita | (4) | Bassa | P2.4 |
| T21 | Dati di permesso parziali | Guasto | Ruolo con capability sconosciuta (versione futura) | Concessione imprevista | — | Capability sconosciute ignorate (mai ALLOW); ruoli di sistema dal codice | (4) | Media | P2.1 |
| T22 | Kiosk scambiato per sicurezza | Pannello | Uscita dal Kiosk, Impostazioni dal pannello | Accesso alle impostazioni dal muro | Documentato: Kiosk non è una serratura | Account HA dedicato con ruolo `wall_panel`; `device.manage` negato; limiti veri da HA (T1) | UX + (4)(5) | Media | P2.6 |
| T23 | Passkey locale scambiata per autorizzazione | Client modificato | Bypass del gate WebAuthn locale | Azione sensibile senza conferma | Il gate è dopo `can()`; HA ripete i controlli admin | Restare conferma UX; la capability decide nel backend | UX | Bassa | — |
| T24 | Configurazione della casa leggibile da tutti | Membro | `frontend/get_system_data` | Vede layout, card, nomi | Codici esclusi dallo stato condiviso (`widgetSecrets`) | Accettato: è HA a esporlo. Nessun segreto nello stato condiviso | (5) | Bassa | — |
| T25 | Codici allarme/serratura ricordati sul dispositivo | Pannello | Browser condiviso con «ricorda» attivo | Chiunque al pannello usa il codice | Default in memoria; il salvataggio è una scelta esplicita | `wall_panel` senza opzione «ricorda»; HA valida il codice | UX + (5) | Media | P2.6 |
| T26 | Confused deputy nel backend | Membro | Comando Domus che esegue servizi con privilegi di sistema | Domus concede ciò che HA nega | Irrigazione usa `check_entity`; Alimentazione solo admin | Invariante D14 + test S4 | (4) | Alta | P2.2 |
| T27 | Azione dell'AI come bypass | Futuro | «Apri la serratura» via assistente | Come T1 ma con privilegi di sistema | — (non esiste) | Azioni AI con utente richiedente e `authorize()`; `DomusAction` con principal | (4) | Alta | prima di Intelligence |
| T28 | Modulo Domus Lab come bypass | Futuro | Modulo custom che chiama servizi direttamente | Come T26 | — | Stessa pipeline, capability dichiarate | (4) | Alta | prima di Lab |
| T29 | Lockout dell'amministrazione | Guasto, errore umano | Ultimo admin declassato, store corrotto | Nessuno amministra Domus | P2.1: `access.manage` sempre agli admin HA; recupero con il comando WebSocket admin `domusos/access/reset_policy` | — | (4)(5) | Alta | P2.1 ✓ |
| T30 | Fail open per errore | Guasto | Eccezione nel motore → «consenti» | Escalation | — | Qualsiasi eccezione nel motore = DENY; test dedicati | (4) | Alta | P2.2 |
| T31 | Grant fuori registro nello store | Guasto, file modificato a mano | `grants: ["access.manage"]` o una capability sconosciuta | Un Membro diventa amministratore | P2.1: solo capability `user_grantable` (`access.control`, `security.control`); qualsiasi altro grant, ruolo sconosciuto o `locked` rende lo store `corrupt`, mai filtrato | — | (4) | Alta | P2.1 ✓ |
| T32 | Pulsante «Torna a Home Assistant» nascosto scambiato per sicurezza | Pannello, Membro | Aprire HA con l'indirizzo, l'app o le credenziali | Accesso all'interfaccia HA | `ha_frontend.open` classificata `local` (solo UX) e documentata così | Per un pannello: account HA dedicato e limiti di HA (T1) | UX | Bassa | P2.4 |
| T33 | Admin HA declassato a un ruolo basso che, a store corrotto, torna `admin` | Guasto | Store corrotto con un admin HA usato su un pannello | Ritorno inatteso dell'interfaccia completa sul muro | P2.1: a store non affidabile anche l'admin HA scende a `locked` + `access.manage` (D23) | — | (4) | Media | P2.1 ✓ |
| T34 | Reset della policy da un'automazione o da uno script | Automazione, script, credenziale admin usata da un altro strumento | `domusos.reset_access_policy` in un'automazione (senza `user_id`) o in uno script avviato da un admin | Restrizioni azzerate senza una richiesta diretta | **Mitigata (P2.1.2)**: servizio rimosso (`ServiceNotFound`, contratto sul sorgente); reset solo dal comando WebSocket con l'admin HA attivo della connessione. Resta lo strumento esterno con un token admin, che agisce come quell'admin: perimetro delle credenziali HA | — | (4) | Media (alta quando P2.5 applicherà la policy) | P2.1.2 ✓ |

## Minacce critiche

- **T1**: non mitigabile da Domus, solo da HA. Va comunicato, non nascosto.
- **T2, T26**: l'Access Control è sicurezza solo se **ogni** comando Domus passa
  dal backend con una capability e senza confused deputy.
- **T14, T29, T30**: un sistema che si apre o si blocca da solo è peggio di uno
  che non esiste.

## Capability ad alto rischio

| Capability | Perché |
| --- | --- |
| `access.manage` | Cambia chi può fare cosa (critica) |
| `ha.restart` | Ferma la casa (critica) |
| `backup.restore`, `dashboard.reset` | Sovrascrivono la configurazione condivisa |
| `access.control` | Serrature, porte, cancelli, garage (concedibile a un singolo Membro) |
| `security.control` | Antifurto: armare, disarmare, modalità (concedibile a un singolo Membro) |
| `security.manage` | Configurazione di sicurezza e card protette |
| `people.manage` | Account e persone collegati |
| `system.manage` | Dispositivi, entità, connessione |
| `device_power.manage` | Accende e spegne uno switch fisico |
| `automations.manage` | Logica che gira senza nessuno davanti |

Ricevono:

- audit dei deny;
- conferma UX esistente (frase, passkey);
- per le distruttive, `expected_revision`.

L'autorizzazione non sostituisce conferme, rate limit e guardie di sicurezza.

## Test di sicurezza obbligatori

Validi per i comandi Domus. Per i nativi HA si documenta che decide HA.

| Test | Scenario | Atteso |
| --- | --- | --- |
| **S1** | Utente senza capability chiama un comando `domusos/*` direttamente sulla WS, senza la UI | DENY `access_denied` |
| **S2** | `localStorage` / stato del frontend modificati (`role=admin`), poi comando Domus | DENY: il backend non legge il client |
| **S3** | Capability revocata a sessione aperta; la tab vecchia ritenta | DENY con revisione nuova |
| **S4** | Domus concede la capability ma HA nega (`check_entity` falso, o servizio admin per un non admin) | DENY |
| **S5** | HA concede ma la capability Domus manca | DENY |

Più:

- S6: store `corrupt` → nessun non admin oltre `locked`;
- S7: eccezione nel motore → DENY;
- S8: ogni comando registrato dichiara una capability.
