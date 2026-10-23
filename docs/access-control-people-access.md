# Domus Access Control — Persone e accessi (P2.4.1)

Un amministratore di Home Assistant sceglie, per ogni account della casa, il
ruolo Domus e i permessi personali. È la prima scrittura della policy da un
client, e arriva **prima** dell'enforcement: P2.4.1 rende i permessi
configurabili, non li applica nel backend. Il frontend resta esperienza d'uso
(D46); decidono il backend Domus, da P2.5, e Home Assistant per le sue azioni.

Collegati: [architettura](access-control-architecture.md),
[fondamento](access-control-foundation.md),
[capability](access-control-capabilities.md),
[autorizzazione](access-control-authorization.md),
[frontend](access-control-frontend.md),
[threat model](access-control-threat-model.md),
[bridge del pannello](home-assistant-panel-bridge.md).

## Dove

Impostazioni › Persone e accessi › **Ruoli e permessi**
(`/settings/access/roles`).

- La voce compare solo con `access.manage`, cioè a un admin HA attivo.
- L'indirizzo scritto a mano da un altro account mostra «Non disponibile per il
  tuo account» e non chiede nulla al backend.
- La pagina è un chunk separato, caricato quando si apre.

## Cosa si vede

Una riga per account di Home Assistant, nell'elenco raggruppato delle
Impostazioni:

- nome: quello della persona HA collegata, se c'è, altrimenti il nome
  dell'account. La persona presta solo il nome: la policy resta per `user_id`;
- ruolo effettivo (Amministratore, Membro, Accesso limitato, Pannello,
  Bloccato);
- «Predefinito» se il ruolo viene dal default (admin HA → Amministratore, gli
  altri → Membro), «Personalizzato» se è assegnato;
- «Tu» sul proprio account, «Proprietario di Home Assistant» sull'owner;
- i permessi personali in più.

Gli account disattivati in HA sono in un gruppo a parte, in sola lettura. Gli
account di sistema (Supervisor, add-on, integrazioni) non compaiono.

Una nota dice il limite in modo onesto: le regole limitano i controlli mostrati
da Domus, i permessi di Home Assistant restano indipendenti (D6, T1).

## Cosa si cambia

Toccando un account si apre l'editor (`GlassModal`):

- **Ruolo**: uno fra `admin`, `resident` (da P2.5D.1.1B), `member`, `restricted`,
  `wall_panel`. `admin` solo per un admin HA (Q24). `locked` non
  si assegna mai: è lo stato di sicurezza di una policy non affidabile.
- **Permessi personali**: solo i due `user_grantable` del registro (D20):
  - «Controllo accessi» (`access.control`): serrature, cancelli, garage;
  - «Controllo allarme» (`security.control`): arma e disarma.

  Per un Amministratore i due interruttori sono disattivati: li ha già, e non
  vengono salvati.
- «Modifiche non salvate» finché la bozza differisce da ciò che dice il backend.
- **Salva** scrive ruolo e permessi in un'unica scrittura.
- **Ripristina ruolo predefinito** cancella l'assegnazione, invece di scrivere
  il ruolo di default: l'account seguirà di nuovo HA.
- Sul proprio account un avviso ricorda che un admin HA può sempre gestire gli
  accessi; dopo il salvataggio l'interfaccia si aggiorna subito
  (`access.refresh()`).

Non esistono ruoli personalizzati, deny espliciti né scope per stanza o area:
restano fuori da V1.

## Revisione e conflitti

Ogni scrittura porta `expected_revision`, la revisione letta con l'elenco.

- Se un'altra sessione ha salvato prima, il backend risponde
  `revision_conflict` e non cambia nulla.
- L'editor mostra «Le autorizzazioni sono state aggiornate da un'altra
  sessione.» in un avviso con il focus e il pulsante **Ricarica**.
- Ricarica rilegge l'elenco e riparte da ciò che dice il backend: la bozza
  vecchia viene scartata, mai riproposta né salvata sopra.

## Policy non affidabile e ripristino

Se lo store è `corrupt`, `unsupported` o `migration_failed`:

- l'elenco risponde comunque, con ogni account `locked` e non modificabile;
- una scheda spiega che i ruoli salvati non si possono usare;
- in fondo c'è il gruppo «Ripristino» con **Ripristina autorizzazioni Domus**.

Il ripristino chiede una conferma esplicita (`GlassModal`). Il testo spiega che
le assegnazioni di Domus vengono eliminate, che ognuno torna al ruolo
predefinito e che utenti e permessi di HA non cambiano. Usa il comando di
recupero esistente `domusos/access/reset_policy` (P2.1.2), che resta legato
all'admin HA attivo della connessione. Dopo il ripristino l'elenco e il profilo
corrente si ricaricano.

Un admin `locked` raggiunge la pagina dall'avviso della policy bloccata («Apri
Ruoli e permessi»).

## Comandi WebSocket

Tutti con `require_admin` di HA e, nello stesso handler,
`manager.require_access_manager(connection.user)`: un principal valido (niente
account di sistema, niente account disattivato), admin HA, con `access.manage`.
Funziona in ogni stato dello store, perché un admin HA tiene sempre
`access.manage` (D21, D23).

| Comando | Messaggio | Risposta |
| --- | --- | --- |
| `domusos/access/list_accounts` | solo `type` | `{state, revision, accounts}` |
| `domusos/access/set_assignment` | `user_id`, `role`, `grants: [str]`, `expected_revision: int` | `{state, revision, account}` |
| `domusos/access/remove_assignment` | `user_id`, `expected_revision: int` | `{state, revision, account \| null}` |

Ogni account è descritto così, e con nient'altro (niente email, credenziali,
token, gruppi):

```text
{ user_id, name, is_admin, is_owner, is_active, manageable,
  role, assigned, grants }
```

Regole del backend:

- **Chi agisce** viene solo da `connection.user`. Lo schema è chiuso: un campo
  in più (`assigned_by`, `assigned_at`, `is_admin`, `is_owner`,
  `capabilities`, `policy_state`…) è `invalid_format`. `assigned_by` e
  `assigned_at` li scrive il server.
- **Il bersaglio** deve essere un account HA esistente (`unknown_account`),
  attivo e non di sistema (`account_not_manageable`).
- **Ruolo e grant** passano per `assignment_request`: ruolo fra i quattro
  assegnabili, grant solo `user_grantable`, ognuno una volta. Per `admin` i
  grant vengono validati e poi non salvati.
- **Revisione**: diversa dalla corrente → `revision_conflict`, nessuna
  scrittura. Un'assegnazione identica non crea una revisione.
- **Store non affidabile**: le scritture sono rifiutate
  (`access_store_untrusted`); resta il ripristino.
- `remove_assignment` funziona anche per un'assegnazione orfana (account non
  più in HA), mai per un account disattivato.
- Ogni cambio è un record di sicurezza nel `DomusAuditService` (`access.policy`,
  `assignment_changed` o `assignment_removed`): chi ha agito, su chi, la
  revisione, ruolo e grant prima e dopo. Solo id, nessun nome.

Il registro delle azioni dichiara i tre comandi con `access.manage` e controllo
HA `admin`, esenti dallo shadow come il ripristino: sono già enforced sull'admin
della connessione ([autorizzazione](access-control-authorization.md#registro-delle-azioni)).

## Bridge del pannello

Dentro il pannello di HA il frontend non ha una connessione propria: il bridge
inoltra i comandi sulla connessione `hass` dell'utente che ha aperto il
pannello. `connection.user` è quindi sempre la persona davanti allo schermo,
mai un account host o di servizio.

- Nuova capability del bridge `access_admin_v1`.
- Il bridge inoltra `list_accounts`, `set_assignment`, `remove_assignment` e
  `reset_policy`, con un validatore dedicato (`isValidAccessMessage`): chiavi
  esatte, `user_id` di 32 caratteri esadecimali, uno dei cinque ruoli, al più i
  due grant, revisione intera non negativa.
- `reset_policy` entra nel bridge per la pagina di ripristino con conferma, solo
  con `type`: la protezione di P2.1.2 resta nel backend, sull'admin della
  connessione.
- La diagnostica shadow resta fuori.

## Logout e offline (Q12, Q13)

- **Q12 chiusa.** Ogni account autenticato può uscire: Impostazioni ha **Esci**
  per tutti, con conferma, e il drawer usa la stessa uscita. Fuori dal pannello
  di HA cancella i token e torna alla connessione; dentro il pannello il logout
  è quello di HA.
- **Q13 chiusa per V1.** Senza Home Assistant le pagine protette restano chiuse
  (fail closed); restano raggiungibili riprova, riconnessione e logout.
- **Q11 aperta / rimandata**: `/settings/attention` resta `dashboard.edit`.
  Nessuna capability nuova solo per chiuderla.

## Cosa P2.4.1 non fa

- Nessun enforcement nuovo nel backend: i comandi Domus girano come prima, lo
  shadow continua a contare (T2 resta aperta fino a P2.5).
- Nessun ruolo personalizzato, deny esplicito o resource scope.
- Nessun grant oltre `access.control` e `security.control`.
- Q10 resta aperta.

## Test

| File | Cosa | Dove |
| --- | --- | --- |
| `tests_python/test_access_administration.py` | Account elencati e no, tipi, vista per stato, ordine, richiesta di assegnazione: ruoli, grant, duplicati, admin senza grant, `locked` rifiutato | ovunque (37 test) |
| `tests_python/test_access_people_ha.py` | Comandi con HA vero: elenco, member e account di sistema rifiutati, grant che arriva al member, campi falsificati, revisione vecchia, bersaglio sconosciuto, disattivato o di sistema, ruolo e grant non validi, admin senza grant ridondanti, rimozione e orfano, store non affidabile e ripristino, auto-declassamento, nome della persona; campi obbligatori e nient'altro, `restricted` e `wall_panel` con grant, admin disattivato | Linux con fixture HA (16 test) |
| `tests_python/test_access_manager.py` | Record di audit per ogni cambio (nessuno per no-op, conflitto o rifiuto); `require_access_manager` in ogni stato | Linux con fixture HA |
| `tests_python/test_access_actions.py`, `test_access_contract.py`, `test_access_shadow_ha.py` | 43 superfici (38 + 5); tre esenzioni nuove motivate; chi agisce mai letto dal messaggio | ovunque / Linux |
| `src/services/accessAdminClient.test.ts` | Messaggi esatti, niente campi del server, grant ordinati e senza duplicati, admin senza grant, errori | Vitest |
| `src/components/settings/PeopleAccessManager.test.tsx` | Elenco, badge, editor, modifiche non salvate, salvataggio, conflitto con focus e Ricarica, admin, proprio account, store non affidabile e ripristino con conferma | Vitest |
| `SettingsHouseAccessSection.test.tsx`, `SettingsDashboard.test.tsx`, `routeAccess.test.ts` | Voce solo con `access.manage`; route protetta; Esci per tutti | Vitest |
| `panelDistributionContract.test.ts`, `accessAuthority.test.ts` | Bridge: solo i comandi elencati, campi esatti, niente diagnostica | Vitest |
| `tests/people-access.spec.cjs` | Due sessioni sullo stesso HA finto: l'admin concede e toglie il controllo allarme a Mario e Mario lo vede dopo il ricaricamento; ruolo `restricted` e `wall_panel`; ripristino del default; conflitto; Mario non vede la voce; 390, 820 e 1440 px; Esci anche offline | Playwright |

## Validazione Linux

I test con il fixture di Home Assistant non girano su Windows. Li ha eseguiti
GitHub Actions sul repository privato `archive`.

- **Come**: un branch temporaneo `ci/access-control-p241-linux-validation`,
  uguale al codice validato più un solo commit che aggiungeva quel nome al
  trigger `push` di `irrigation-core.yml`. Il branch è stato eliminato dopo la
  run e il commit temporaneo non è nella storia del feature branch.
- **Codice validato**: `3cf2eaa` (applicazione) e `d909ce7` (lo stesso codice
  con quattro test HA in più, chiesti dalla validazione completa).

| Run | Commit | HA | Python | Test | Esito |
| --- | --- | --- | --- | --- | --- |
| 39758189365 | `3cf2eaa` | 2025.1.0 | 3.12.15 | 1151 passati | **verde** |
| 39758189365 | `3cf2eaa` | 2026.2.3 | 3.13.16 | 1185 passati | **verde** |
| 39760657395 | `d909ce7` | 2025.1.0 | 3.12.15 | 1155 passati | **verde** |
| 39760657395 | `d909ce7` | 2026.2.3 | 3.13.16 | 1189 passati | **verde** |

- Rispetto a P2.3 (run 39590575540: 1099 e 1133) entrambi i job hanno 52 test
  in più: `test_access_administration` (37), `test_access_people_ha` (12), due
  in `test_access_manager` e uno in `test_access_contract`. La run 39760657395
  ne aggiunge 4 a `test_access_people_ha`: ogni campo obbligatorio e nessun
  campo in più, anche sui comandi con solo `type`; `restricted` e `wall_panel`
  con entrambi i grant, che arrivano al profilo senza `access.manage`; un admin
  disattivato che non può nemmeno connettersi (HA ne revoca i token). Nessun
  test fallito, saltato o in errore di setup o teardown.
- **Job HA 2025.1**: `test_access_people_ha` (16), `test_access_administration`
  (37), `test_access_manager` (39), `test_access_actions` (39),
  `test_access_contract` (5), `test_access_models` (70),
  `test_access_authorization` (68), `test_access_authorization_ha` (7),
  `test_access_shadow` (43), `test_access_shadow_ha` (11).
- **Job HA 2026.2.3**: tutta `tests_python`, comprese le stesse suite e
  `test_access_websocket` (16: `get_self` e `reset_policy` invariati).
- **Registrazioni reali**, verificate in entrambe le versioni: 38 comandi
  WebSocket e 5 servizi, nessuna superficie non dichiarata; 31 WebSocket e 5
  servizi osservati dallo shadow; 7 esenzioni, fra cui i tre comandi di Persone
  e accessi.
- **HACS validation** fallisce su `archive` perché l'azione HACS valida solo
  repository pubblici: è un workflow separato.

## Residente e ruolo Amministratore (P2.5D.1.1B)

**Ruoli** che si possono assegnare:

| Ruolo | Nome | Descrizione | Accesso alla casa | Amministrazione |
| --- | --- | --- | --- | --- |
| `admin` | Amministratore | Gestisce Domus, persone, accessi e configurazione | Completo | Sì, solo per un admin HA |
| `resident` | Residente | Accesso completo alla casa, senza funzioni amministrative | Completo | No |
| `member` | Membro | Accesso standard alle funzioni della casa | Standard | No |
| `restricted` | Accesso limitato | Solo le aree essenziali | Limitato | No |
| `wall_panel` | Pannello | Account tecnico per un pannello condiviso | Pannello | No |

- **Residente** = Membro più `access.control` e `security.control`: serrature,
  cancelli, garage e allarme. Nessuna capability che HA riserva agli
  amministratori, quindi niente `access.manage` né `device_power.manage`
  (contratto). È per il coniuge e per gli adulti di casa.
- **I default non cambiano**: admin HA → Amministratore, gli altri → Membro.
  Residente si assegna sempre a mano; rimuovere l'assegnazione torna al default,
  mai a Residente.
- **Amministratore solo per un admin HA (Q24)**:
  - `set_assignment` con `role: "admin"` per un account che HA non considera
    amministratore risponde `role_requires_ha_admin`;
  - nulla viene scritto: stessa revisione, nessuna voce di audit;
  - Domus non concede mai più di quanto concede HA.
- **Grant ridondanti**: per Amministratore e Residente, che hanno già i due
  grant, i grant inviati vengono validati e poi non salvati. Il client non li
  invia.
- **Assegnazioni vecchie** (`admin` su un account che non è admin HA, salvate
  prima di P2.5D.1.1B):
  - restano valide: lo store non diventa `corrupt`, nulla viene migrato o
    cancellato;
  - come prima, l'account non riceve nessuna capability riservata agli admin HA;
  - nella pagina la riga mostra «Da rivedere» e l'editor spiega di scegliere
    Residente;
  - una nuova scrittura `admin` è rifiutata, il passaggio a Residente è
    accettato.
- **L'editor** mostra Amministratore solo per un admin HA; per gli altri
  spiega perché non c'è. Due righe di riepilogo, solo per leggere: «Accesso
  alla casa» (Completo, Standard, Limitato, Pannello) e «Amministrazione» (Sì
  solo per Amministratore su un admin HA). Non sono due autorità nello store:
  decide il ruolo, cioè le sue capability.
- **Store**: `resident` si salva così com'è, `"resident"`. Lo schema non cambia
  e non c'è migrazione: un ruolo sconosciuto resta `corrupt`.
- **Pagine e Impostazioni**: seguono le capability, senza controlli sul ruolo.
  Un Residente non vede Persone e accessi né l'Alimentazione, e le richieste
  dirette all'Alimentazione ricevono `access_denied` (P2.5D.1).
- **Bridge**: il validatore del pannello accetta i cinque ruoli.

Test: `test_access_administration.py` (Residente = Membro più i due grant, niente
capability da admin, eleggibilità, grant ridondanti, assegnazione vecchia, default
invariati), `test_access_models.py` (matrice a cinque ruoli),
`test_access_people_ha.py` (+5: Amministratore rifiutato senza effetti,
Amministratore per un admin HA, Residente, transizioni, assegnazione vecchia),
`test_access_enforcement_ha.py` (Residente rifiutato sull'Alimentazione),
`PeopleAccessManager.test.tsx` (+2), `accessAdminClient.test.ts`, i contratti del
bridge e delle fixture, `tests/people-access.spec.cjs` (+2).
