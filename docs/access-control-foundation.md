# Domus Access Control — fondamento (P2.1)

Il «cervello» dei permessi: registro delle capability, ruoli di sistema, policy
salvata, risoluzione del profilo e `domusos/access/get_self`. **Non blocca
ancora nulla**:

- nessuna route, nessun pulsante, nessuna azione cambia;
- Energy, Irrigazione, Alimentazione e Profile non chiamano il modello.

Architettura e decisioni in [access-control-architecture.md](access-control-architecture.md),
capability e matrici in [access-control-capabilities.md](access-control-capabilities.md),
rischi in [access-control-threat-model.md](access-control-threat-model.md).

## Dove sta

| File | Contenuto |
| --- | --- |
| `custom_components/domusos/access/models.py` | Registro, ruoli, schema, validazione, migrazioni, risoluzione. Python puro, senza import di Home Assistant. |
| `custom_components/domusos/access/manager.py` | Store `domusos.access.v1`, stati, quarantena, scritture con revisione, reset. |
| `custom_components/domusos/access/api.py` | WebSocket `domusos/access/get_self` e servizio admin `domusos.reset_access_policy`. |
| `custom_components/domusos/__init__.py` | Avvio isolato: se l'accesso non parte, gli altri moduli continuano. |

Le capability di accesso hanno un tipo proprio (`AccessCapability`,
`AccessCapabilityId`) e un registro chiuso. Non sono le capability dei
dispositivi del Core (`core.capabilities.CapabilityState`): un id come
`light.brightness` non è nel registro e viene rifiutato.

## Principal, persona, dispositivo

- **Principal**: l'utente Home Assistant della connessione (`connection.user`),
  letto dal server.
  - `get_self` non accetta parametri: un `user_id`, `role` o `person_id` nel
    messaggio fa rispondere HA con `invalid_format`.
  - Account di sistema o disattivati: nessun profilo, errore `access_denied`.
- **Persona**: non entra nel modello. Collegare un'altra persona all'account non
  cambia ruolo né capability.
- **Dispositivo e browser**: non entrano nel modello. Nulla viene letto da
  `localStorage`.

## Registro

33 capability `dominio.azione`. Ognuna dichiara:

- `risk`: `low` / `medium` / `high` / `critical`;
- `enforcement`:
  - `domus`: il backend Domus potrà applicarla davvero;
  - `ha_native`: decide HA, Domus filtra solo la sua interfaccia;
  - `local`: solo UX;
- `requires_ha_admin`: HA la consente solo agli amministratori;
- `user_grantable`: si può concedere a un singolo account oltre al ruolo.

Le novità rispetto a P2.0 sono tre:

- **`access.control`**: accesso fisico, cioè serrature, porte, cancelli, garage
  e altri ingressi motorizzati.
- **`security.control`**: l'antifurto, cioè armare, disarmare e le modalità.
  Prima comprendeva anche gli accessi.
- **`ha_frontend.open`**: il comando «Torna a Home Assistant». È solo UX:
  nasconderlo non impedisce di aprire HA con l'indirizzo, l'app o le
  credenziali.

## Ruoli e grant

| Ruolo | Nome in UI | Note |
| --- | --- | --- |
| `admin` | Amministratore | Tutto; ciò che HA riserva agli amministratori resta solo per gli admin HA |
| `member` | Membro | Uso quotidiano; serrature e allarme solo con grant personale |
| `restricted` | Accesso limitato | Casa e dispositivi di tutti i giorni; niente energia, accessi, allarme |
| `wall_panel` | Pannello | Account HA di un pannello dedicato (non è la modalità Kiosk); vede l'energia, non gestisce nulla |
| `locked` | — | Interno, mai assegnabile: il pavimento sicuro quando la policy non è affidabile |

- **Default senza assignment**: admin HA → `admin`, altri → `member`.
  - Calcolato al volo, non salvato: vedere un utente non crea record.
  - È ciò che ogni account può fare oggi.
- **Un ruolo per account, niente deny**: capability effettive = ruolo ∪ grant
  validi.
- **Solo `access.control` e `security.control` sono concedibili.**
  - Esempio: Mario è `member` con `access.control`; Anna è `member` con
    `access.control` e `security.control`; Luca è `member` senza grant.
- **`access.manage`**: richiede l'admin HA, non è concedibile, ed è sempre
  disponibile a ogni admin HA, qualunque sia il suo ruolo. È il percorso di
  recupero: nessun lockout.
- **Nessun «tutto permesso» per l'admin HA**: riceve `access.manage` in più,
  nient'altro. Il resto dipende dal ruolo.
  - Un admin HA con ruolo `wall_panel` ha le capability del pannello più
    `access.manage`.
- **Limite superiore HA**: ciò che richiede l'admin HA non arriva mai a un non
  admin, né dal ruolo né da un grant. Assegnare `admin` a un non admin gli dà
  solo la parte non amministrativa.
- **Downgrade in HA**: `is_admin` viene letto da HA a ogni richiesta e non è mai
  salvato. Un admin declassato perde `access.manage` alla richiesta successiva,
  senza nuova revisione della policy.

Matrice completa in [capability](access-control-capabilities.md#ruoli-di-sistema).

## Store

`Store` di Home Assistant `domusos.access.v1`, nel backend. Contiene solo id e
dati di policy: nessun nome, email, foto o persona.

```json
{
  "schema": "domusos-access-policy",
  "version": 1,
  "revision": 3,
  "updated_at": "2026-10-20T10:00:00+00:00",
  "assignments": {
    "<ha_user_id>": {
      "role": "member",
      "grants": ["access.control"],
      "assigned_at": "2026-10-20T10:00:00+00:00",
      "assigned_by": "<ha_user_id>"
    }
  },
  "audit": [
    {
      "at": "…",
      "event": "assignment_changed",
      "actor": "<ha_user_id>",
      "user_id": "<ha_user_id>",
      "revision": 3,
      "role": "member",
      "grants": ["access.control"]
    }
  ]
}
```

- **Revisione** monotona; `0` finché lo store non esiste.
- Ogni scrittura richiede `expected_revision` uguale alla corrente: un secondo
  scrittore con la revisione vecchia riceve `revision_conflict`, mai una
  sovrascrittura. Un assignment identico non crea una revisione.
- Una scrittura fallita non cambia nulla in memoria.
- **Audit** limitato agli ultimi 200 cambi di assignment.
- **Scritture**: solo primitive backend (`async_assign`, `async_unassign`), per
  i test e per P2.6. Nessun client può chiamarle: nessuna mutazione pubblica in
  P2.1.

### Stati

| Stato | Quando | Profilo |
| --- | --- | --- |
| `absent` | Nessuno store, mai creato | Default; nulla viene scritto |
| `ready` | Store valido | Assignment e grant applicati |
| `corrupt` | Schema non valido, ruolo o capability sconosciuti, grant non concedibile, campi in più, file illeggibile o messo in quarantena da HA | Non admin → `locked`; admin HA → `locked` + `access.manage` |
| `unsupported` | `version` più nuova, o involucro HA più nuovo | Come `corrupt`; file intatto |
| `migration_failed` | Migrazione non completata | Come `corrupt`; l'originale non viene riscritto |

- Nessun documento viene «aggiustato»: un valore sbagliato rende corrotto
  l'intero store. Uno store non affidabile non viene mai scritto.
- HA mostra un avviso di riparazione (`access_policy_untrusted`) con il nome
  dell'azione di recupero.
- **Quarantena**: un file JSON illeggibile viene rinominato da HA
  (`.corrupt.<data>`). Finché la copia resta lì, lo store resta `corrupt`
  anche dopo un riavvio.
- **Migrazioni**: funzioni pure `MIGRATIONS[n]` (vN → vN+1), applicate in
  memoria passo per passo. Ogni passo deve produrre la versione successiva,
  altrimenti `migration_failed`. Oggi nessuna: lo schema nasce alla v1.
- **Assignment orfani**: un `user_id` che HA non ha più resta nello store. Si
  vede con `orphaned_assignments`, non viene cancellato da solo. Se lo stesso id
  torna, l'assignment vale di nuovo. Il nome non conta mai.

## Recupero

Servizio HA `domusos.reset_access_policy`, registrato come servizio
amministrativo: HA lo rifiuta (`Unauthorized`) a chi non è admin.

- Funziona in ogni stato. Sposta lo store attuale e le copie in quarantena
  accanto a sé (`domusos.access.v1.reset.<data>…`), **senza cancellare nulla**.
- Riporta lo store ad `absent`: admin HA → `admin`, altri → `member`. Non scrive
  mai «tutti admin».
- Lascia una voce di audit nel `DomusAuditService` (`access.policy`,
  `policy_reset`, autore, stato e revisione precedenti, file conservati) e un
  warning nel log. Rimuove l'avviso di riparazione.
- Non viene mai invocato in automatico.

In ultima istanza, a HA fermo, si può spostare a mano `.storage/domusos.access.v1`.

## `domusos/access/get_self`

Richiesta: solo `{"type": "domusos/access/get_self"}`.

```json
{
  "principal": { "user_id": "…", "is_admin": false, "is_owner": false },
  "access": {
    "role": "member",
    "assigned": true,
    "grants": ["access.control"],
    "capabilities": ["access.control", "automations.run", "…"],
    "state": "ready",
    "revision": 3
  }
}
```

- `user_id` permette al client di verificare che la risposta sia dell'account
  che mostra (cambio utente, tab vecchie). Non è mai un input.
- Le capability sono già risolte per Domus: la metà HA si verifica sulle singole
  azioni, nelle fasi successive.
- Risposta piccola: stringhe ordinate, nessun registro.
- Errori:
  - `access_denied`: account di sistema o disattivato;
  - `access_unavailable`: modulo non avviato;
  - in nessun caso viene restituito un profilo per errore.

`domusos/access/get_status` non serve: lo stato è già in `get_self`.

`domusos/access/subscribe` è rimandato a P2.3/P2.4. Oggi le scritture esistono
solo nel backend, quindi non ci sono eventi da spingere.

## Limite di Home Assistant (invariato)

Per le azioni native, cioè luci, clima, serrature, cancelli, garage, allarme e
servizi, il browser parla direttamente con Home Assistant.

- Le capability Domus governeranno l'interfaccia di Domus, ma non impediscono
  allo stesso account di usare HA direttamente se HA glielo consente.
- Per i comandi del backend Domus l'enforcement sarà davvero lato server
  (P2.2/P2.5).
- Nessun proxy universale verso HA.

## UX futura (non in P2.1)

Persone e accessi (P2.6), per un Membro:

```
Mario · Membro
[ ] Controllo accessi      → access.control
[ ] Controllo allarme      → security.control
```

«Torna a Home Assistant» sarà visibile solo con `ha_frontend.open` (P2.4).

La pagina dovrà dichiarare (testo da rifinire in P2.6):

> Le autorizzazioni Domus regolano ciò che questo account può vedere e fare
> all'interno di Domus. Home Assistant mantiene i propri permessi: un utente che
> può accedere direttamente a Home Assistant potrebbe avere possibilità diverse.

## Test

| File | Cosa |
| --- | --- |
| `tests_python/test_access_models.py` | Registro (nomi, metadati, concedibili), matrice dei ruoli, scenari Membro/Pannello/Accesso limitato/Admin, limite HA, `locked`, recupero admin, grant, schema, migrazioni, audit, orfani, indipendenza da persone e dispositivi. Gira anche senza Home Assistant. |
| `tests_python/test_access_manager.py` | Stati con lo store di HA, quarantena, scritture, conflitti, scrittura fallita, account di sistema, downgrade, reset, spostamento dei file. |
| `tests_python/test_access_websocket.py` | `get_self` sullo stack reale: admin, membro, payload falsificato, persona collegata, store corrotto, modulo assente, servizio di reset solo admin, ciclo di vita dell'integrazione. |
| `src/security/accessAuthority.test.ts` | Contratto: l'autorità UX del frontend non legge storage del browser; `get_self` non accetta un account. |
