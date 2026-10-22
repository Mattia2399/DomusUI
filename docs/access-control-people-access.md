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

- **Ruolo**: uno fra `admin`, `member`, `restricted`, `wall_panel`. `locked` non
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
  esatte, `user_id` di 32 caratteri esadecimali, uno dei quattro ruoli, al più i
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
| `tests_python/test_access_people_ha.py` | Comandi con HA vero: elenco, member e account di sistema rifiutati, grant che arriva al member, campi falsificati, revisione vecchia, bersaglio sconosciuto, disattivato o di sistema, ruolo e grant non validi, admin senza grant ridondanti, rimozione e orfano, store non affidabile e ripristino, auto-declassamento, nome della persona | Linux con fixture HA (12 test) |
| `tests_python/test_access_manager.py` | Record di audit per ogni cambio (nessuno per no-op, conflitto o rifiuto); `require_access_manager` in ogni stato | Linux con fixture HA |
| `tests_python/test_access_actions.py`, `test_access_contract.py`, `test_access_shadow_ha.py` | 43 superfici (38 + 5); tre esenzioni nuove motivate; chi agisce mai letto dal messaggio | ovunque / Linux |
| `src/services/accessAdminClient.test.ts` | Messaggi esatti, niente campi del server, grant ordinati e senza duplicati, admin senza grant, errori | Vitest |
| `src/components/settings/PeopleAccessManager.test.tsx` | Elenco, badge, editor, modifiche non salvate, salvataggio, conflitto con focus e Ricarica, admin, proprio account, store non affidabile e ripristino con conferma | Vitest |
| `SettingsHouseAccessSection.test.tsx`, `SettingsDashboard.test.tsx`, `routeAccess.test.ts` | Voce solo con `access.manage`; route protetta; Esci per tutti | Vitest |
| `panelDistributionContract.test.ts`, `accessAuthority.test.ts` | Bridge: solo i comandi elencati, campi esatti, niente diagnostica | Vitest |
| `tests/people-access.spec.cjs` | Due sessioni sullo stesso HA finto: l'admin concede e toglie il controllo allarme a Mario e Mario lo vede dopo il ricaricamento; ruolo `restricted` e `wall_panel`; ripristino del default; conflitto; Mario non vede la voce; 390, 820 e 1440 px; Esci anche offline | Playwright |
