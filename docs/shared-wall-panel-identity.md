# Pannello a parete condiviso: identità, sessioni e «accesso completo» (design P2.5D.1.1A)

Come un tablet appeso al muro può essere un dispositivo di tutta la casa
mentre l'autorità cambia con la persona **davvero autenticata** che lo usa.
È solo design: nessun codice, ruolo, capability o token cambia in P2.5D.1.1A.

Collegati: [architettura](access-control-architecture.md),
[enforcement](access-control-enforcement.md),
[Persone e accessi](access-control-people-access.md),
[capability](access-control-capabilities.md),
[threat model](access-control-threat-model.md),
[scope delle Impostazioni](settings-scopes.md),
[Kiosk](device-kiosk.md), [Screensaver](device-screensaver.md),
[Alimentazione](device-power-management.md), [Profile Core](profile-core.md).

Base: `ed1975a`, con P2.5D.1 validata su Linux e in casa. L'Alimentazione è il
primo dominio enforced.

## 1. Due problemi diversi

**A. «Accesso completo».** In Ruoli e permessi il ruolo **Amministratore** è
descritto come «Accesso completo a Domus». Dato a un account che **non** è
admin in Home Assistant, però, non apre tutte le sezioni. Non è un bug: è la
regola di P2.1, «ciò che HA riserva agli amministratori viene tolto a chiunque
altro» (`resolve_access_profile`). L'account perde le 15 capability con
`requires_ha_admin`:

```text
dashboard.edit dashboard.reset security.manage automations.manage
energy.manage irrigation.manage waste.manage house.manage people.manage
access.manage system.manage backup.restore ha.restart
device_power.manage notifications.recipients
```

Gli resta: il ruolo Membro, più `access.control`, `security.control`,
`backup.export`, `developer.use` e `ha_frontend.open`. In pratica è già un
**accesso completo alla casa** senza amministrazione, ma con un nome e una
descrizione che promettono amministrazione. Il problema è di significato e di
interfaccia, non di sicurezza.

**B. Il pannello a parete.** «Pannello» (`wall_panel`) oggi esiste solo come
**ruolo Domus**: un insieme di capability per un account HA usato su un display
condiviso. Il rischio è leggerlo come «la persona è un pannello». Il tablet è un
dispositivo; chi lo usa cambia.

## 2. Il principio

```text
DISPOSITIVO ≠ UTENTE ≠ SESSIONE ≠ RUOLO
```

| Concetto | Cos'è | Dove vive oggi |
| --- | --- | --- |
| Dispositivo | Il browser o tablet fisico | `domusui.client_id.v1` (id casuale in `localStorage`); preferenze di Kiosk, Screensaver e Aspetto in `localStorage`; il legame con l'Alimentazione tramite `client_id` |
| Modalità del dispositivo | Come si comporta: Kiosk, Screensaver, Alimentazione, in futuro «pannello a parete» | Scope **Questo dispositivo** ([scope](settings-scopes.md)) |
| Utente (principal) | Chi è autenticato: un utente HA, `user_id` | `connection.user` sul server |
| Sessione | Il legame autenticato fra questo dispositivo e un utente, per un tempo | La connessione WebSocket e i suoi token |
| Ruolo | Cosa può fare quell'utente in Domus | Policy Access Control, per `user_id` |

Esempio:

```text
Tablet soggiorno · modalità pannello · sessione base   → account HA «Pannello soggiorno» · ruolo wall_panel
Tablet soggiorno · modalità pannello · sessione Mattia → user_id di Mattia · ruolo admin
Tablet soggiorno · modalità pannello · sessione base   → di nuovo «Pannello soggiorno»
```

Il dispositivo non cambia. Cambia l'identità autenticata, e con lei tutto ciò
che Domus mostra e permette.

## 3. Cosa esiste oggi (audit)

**Il ruolo `wall_panel`** (backend `models.py`):
- capability: `dashboard.view`, `rooms.view`, `devices.control`,
  `security.view`, `automations.run`, `energy.view`, `irrigation.view`,
  `waste.view`;
- niente `device.manage`, `profile.manage`, `device_power.manage` né
  configurazione;
- nel frontend compare solo negli elenchi dei ruoli (`accessControl.ts`,
  `accessAdminClient.ts`, il validatore del bridge, Persone e accessi).
  Nessuna funzione controlla il ruolo (D50): tutto passa da `can()`;
- il Kiosk è indipendente: un account `wall_panel` non attiva il Kiosk (e2e
  P2.4.1).

L'interpretazione **«ruolo dell'account tecnico di base di un display
condiviso»** è quindi già compatibile con il codice, senza modifiche.

**«Creatore»** è un'etichetta del frontend per l'owner di HA (`isOwner`), nel
profilo, nel drawer e nella condivisione della dashboard. Non è un ruolo
Domus e non lo diventa: l'owner è un admin HA con un badge.

**Autenticazione, per modalità:**

| Modalità | Identità | Token |
| --- | --- | --- |
| Pannello di HA | L'utente del frontend di HA; il bridge usa la `hass` del pannello | Quelli del frontend di HA, gestiti da HA; Domus non li vede |
| Standalone, OAuth | Utente che ha fatto il login OAuth (`getAuth` di `home-assistant-js-websocket`) | Una sola coppia access e refresh in `localStorage`, chiave `hass_auth_tokens` |
| Standalone, token a lunga durata | L'utente del token | Il token salvato nella configurazione |
| App Companion | L'utente dell'app; Domus come pannello di HA | Gestiti dall'app |

In ogni modalità c'è **una sola identità per browser**. Il principal di Access
Control resta `user_id` (D61, D63): una sessione personale deve produrre un
vero `user_id` autenticato da HA.

**Cosa offre HA** (sorgente HA 2026.2):
- OAuth documentato (`/auth/authorize`, `/auth/token`) e revoca
  (`POST /auth/revoke`; `action=revoke` su `/auth/token` è deprecato);
- la pagina di login chiede sempre le credenziali: non c'è un «single sign-on»
  a cookie. Fa eccezione il provider `trusted_networks`, che sulla rete locale
  può far scegliere l'utente senza password (`allow_bypass_login`): è
  esattamente il «tocca Mattia e diventi Mattia» da evitare;
- un utente disattivato perde i refresh token e non può connettersi (verificato
  in P2.4.1);
- non c'è un meccanismo supportato per passare da un utente all'altro nello
  stesso frontend di HA senza rifare il login.

**Dispositivi personali** (`PersonalDevice`, Profile Core): sono i dispositivi
di notifica dell'utente (app Companion), lato server e per persona. Non sono il
tablet a parete e non vanno confusi con lui.

## 4. Modello delle sessioni

| | Sessione del dispositivo | Sessione base del pannello | Sessione personale |
| --- | --- | --- | --- |
| Cos'è | Il dispositivo e le sue preferenze | L'account tecnico del tablet, quando nessuno si è autenticato | Una persona reale autenticata da HA |
| Autorità | Nessuna: preferenze locali, mai sicurezza | Il ruolo dell'account tecnico (oggi `wall_panel`) | Il ruolo e i grant di quella persona |
| Durata | Finché il dispositivo esiste | Sempre: è lo stato di riposo | Temporanea, sempre (Q20) |
| Capability | — | Le più basse utili alla casa | Quelle della persona |
| Dove | `localStorage` (`client_id`, Kiosk, Screensaver) | La sessione HA principale del tablet | Da definire (Q18): solo in memoria, mai su disco |
| Fine | Reset del dispositivo | Mai, salvo cambio di account del tablet | Timeout, Esci, Blocca, Screensaver, riavvio, ricarica |

**Stati:**

```text
AVVIO ──► BASE (account tecnico del tablet)
           │  «Chi sta usando Domus?» → scelta della persona → verifica vera (Q18)
           ▼
        PERSONALE (user_id della persona)
           │  timeout · Esci · Blocca · Screensaver · ricarica · riavvio · offline
           ▼
        BASE
```

- «Admin» **non è uno stato** né un booleano: è ciò che la sessione personale
  ottiene dalle capability di chi si è autenticato. Niente `adminMode`, niente
  `setActiveRole`, niente impersonificazione.
- **Blocca e Termina coincidono**: su un tablet condiviso una sessione bloccata
  con credenziali privilegiate in memoria è un rischio senza vantaggi. Bloccare
  significa terminare: token revocati, ritorno alla base.
- **Ricarica e riavvio**: si torna alla base (D82). Le credenziali personali
  non sopravvivono alla pagina.
- **Offline** (Q13): fail closed. Una sessione personale non ottiene nulla
  offline e, se la connessione cade, termina.
- **Più schede**: la sessione personale vive in una sola scheda e in memoria.
  Le altre schede restano sulla base; nessuno stato condiviso
  (`localStorage`, `BroadcastChannel`) porta l'autorità da una scheda
  all'altra.

**Il selettore di profilo.** «Chi sta usando Domus?» mostra le persone di HA,
con foto e nome. Toccare una foto **non è autenticazione**: avvia la verifica
per l'utente HA collegato a quella persona. La persona presta la faccia,
l'utente presta l'autorità (Person ≠ User). Presenza, tracker, prossimità o
Bluetooth non autenticano mai.

## 5. Come autenticare una persona sul tablet (Q18)

| Opzione | Cosa resta sul tablet | Furto o accesso fisico | Revoca | Fattibilità | Valutazione |
| --- | --- | --- | --- | --- | --- |
| **A.** Logout del tablet e login della persona, poi di nuovo il tablet | I token della persona finché non esce; poi servono di nuovo le credenziali dell'account tecnico | La password dell'account tecnico va digitata ogni volta: finisce per essere nota a tutti, o salvata | Logout | Possibile con il login di HA | **No**: interfaccia pesante e base fragile |
| **B.** Seconda connessione HA autenticata, solo in memoria, per la sessione personale | Una coppia di token in memoria, per minuti | Perde valore alla fine della sessione; nessuna traccia su disco | `POST /auth/revoke` alla fine; HA revoca anche disattivando l'utente | OAuth documentato; standalone probabile; pannello HA e app Companion **da verificare** (redirect, popup, webview) | **Direzione consigliata**, da validare con uno spike |
| **C.** Più token salvati sul tablet (uno per persona) | Token di tutti, anche admin, a lunga durata | Il tablet diventa una cassaforte di credenziali estraibile da DevTools | Una per una | Facile | **No**: rifiutata |
| **D.** PIN di Domus | Un segreto di Domus | Un PIN è indovinabile; è Domus a decidere chi sei | Solo Domus | Possibile | **No in V1**: Domus diventerebbe un fornitore d'identità e cambierebbe «HA autentica, Domus restringe» |
| **E.** Approvazione dal telefono personale (QR) | Dipende: servirebbe che HA emetta una sessione per il tablet, o che Domus agisca per conto di qualcuno | — | — | HA non offre un'emissione supportata di token per un altro dispositivo | **Futuro**: richiede un design suo |
| **F.** Passkey o WebAuthn | Una credenziale legata al dispositivo | Forte se l'IdP è HA | Dall'IdP | Il login con passkey **in HA** è da verificare; la passkey locale di Domus esiste ma è solo una conferma (T23), non un'identità | **Futuro**, solo con HA come IdP |

Regole che valgono per ogni opzione:
- Domus non memorizza mai password di HA, né in chiaro né cifrate (D80).
- Un PIN non è mai un sostituto della password di HA.
- Nessuna API privata di HA per comodità; nessun token emesso da Domus per
  conto di un utente.

**Q18 resta aperta**: il principio è chiuso, una sessione personale nasce solo
da un'autenticazione vera di HA. Il meccanismo dipende dallo spike sull'opzione B
nelle tre modalità (D81).

## 6. Durata della sessione personale (Q20)

- `personal_session_timeout`, scope **Questo dispositivo**, configurabile da un
  admin (vedi 7).
- Uscita per: inattività, Screensaver, «Esci» o «Blocca», ricarica, riavvio,
  connessione persa, cambio di account del tablet.
- **Sessioni admin più brevi**, con un tetto non disattivabile: nessuna
  sessione con capability di amministrazione resta aperta oltre il tetto,
  anche se c'è attività.
- **Screensaver**: la sua attivazione termina la sessione personale. Non ci
  sono controindicazioni, perché lo Screensaver è già un'interfaccia locale
  sopra la pagina ([Screensaver](device-screensaver.md)). Se il Kiosk è
  attivo, il ritorno va alla pagina iniziale del pannello.
- **Kiosk** resta modalità d'uso del dispositivo, non sicurezza (D49, T22): non
  protegge una sessione admin.

## 7. Configurare il dispositivo (Q21)

Le impostazioni privilegiate di **questo dispositivo** richiedono un'autorità
da amministratore:
- l'Alimentazione (`device_power.manage`, enforced);
- e, come scelta di prodotto, il passaggio in modalità pannello, il timeout
  della sessione personale e la configurazione del Kiosk del pannello.

L'account tecnico del pannello **non** riceve `device_power.manage` né altre
capability da admin solo perché gira su quel tablet (D79). Il ruolo
`wall_panel` resta com'è.

Flusso futuro:

```text
pannello (base) → «Configura questo dispositivo» → sessione personale di un admin
→ Impostazioni › Questo dispositivo (Alimentazione, Kiosk, Screensaver, timeout)
→ Esci o timeout → pannello (base)
```

Lo stesso tablet mostra o nasconde i menu di amministrazione in base
all'**autorità effettiva della sessione**, mai perché è un pannello. Le
impostazioni del dispositivo restano del dispositivo e non seguono la persona
su un altro tablet.

Le preferenze locali che oggi il ruolo `member` può cambiare con
`device.manage` (Aspetto, Lingua, Screensaver, Kiosk) restano come sono. In
modalità pannello diventano configurazione da admin.

## 8. «Accesso completo alla casa» ≠ Amministratore (Q17)

| | Cosa significa |
| --- | --- |
| **Accesso completo alla casa** | Usare tutte le normali funzioni domestiche: luci, clima, scenari, irrigazione, allarme e accessi se concessi, energia, rifiuti, il proprio profilo. Senza amministrare |
| **Amministratore** | Amministrare Domus e HA: persone, ruoli e permessi, recupero, configurazioni della casa e del sistema, Alimentazione, backup e ripristino. In V1 richiede **sempre** un admin HA |
| **Owner di HA** | Un admin HA col badge «Proprietario». Nessun ruolo Domus in più |

**Classificazione delle capability** (registro attuale, nomi invariati):

| Classe | Capability | A chi |
| --- | --- | --- |
| Vedere | `dashboard.view`, `rooms.view`, `security.view`, `automations.view`, `energy.view`, `irrigation.view`, `waste.view`, `people.view`, `system.view` | Accesso alla casa |
| Comandare | `devices.control`, `automations.run`, `irrigation.control`, `access.control` (grant), `security.control` (grant) | Accesso alla casa |
| Personale o locale | `profile.manage`, `device.manage`, `backup.export`, `ha_frontend.open`, `developer.use` | Persona o dispositivo; `developer.use` e `ha_frontend.open` sono da admin nella sostanza |
| Configurare la casa | `dashboard.edit`, `house.manage`, `energy.manage`, `irrigation.manage`, `waste.manage`, `security.manage`, `automations.manage`, `notifications.recipients`, `device_power.manage` | Amministratore (oggi tutte `requires_ha_admin`) |
| Amministrare | `access.manage`, `people.manage`, `system.manage`, `backup.restore`, `dashboard.reset`, `ha.restart` | Amministratore |

**Il suffisso `.manage`** mescola tre significati:

| Capability | Significato reale | Admin HA |
| --- | --- | --- |
| `profile.manage` | Il **proprio** profilo, personale | no |
| `device.manage` | Preferenze di **questo browser** | no |
| `energy.manage`, `irrigation.manage`, `waste.manage`, `house.manage`, `security.manage` | Configurazione **della casa** | sì |
| `device_power.manage` | Configurazione di un dispositivo con effetto fisico | sì |
| `people.manage`, `system.manage`, `access.manage` | **Amministrazione** | sì |

I nomi non cambiano in V1. La tabella serve per le future interfacce e per
evitare di leggere «manage» come «uso avanzato».

**Come rappresentare l'accesso completo alla casa:**

| Strada | Pro | Contro |
| --- | --- | --- |
| **A.** Membro più altri grant concedibili | Nessun ruolo nuovo | Più interruttori, combinazioni da capire, e un grant non può togliere (nessun deny esplicito) |
| **B.** Nuovo ruolo di sistema `resident` | Un nome chiaro, una riga nella matrice, test semplici | Un ruolo in più nello store, nel bridge e nei contratti |
| **C.** Preset nell'interfaccia che assegna ruolo e grant | Un'interfaccia semplice | È solo un'etichetta sopra A o B |

**Raccomandazione**: B, presentato come C.
- Un ruolo `resident` = `member` più `access.control` e `security.control`.
  Resta da decidere se anche `automations.run` e `automations.view`, che
  `member` ha già.
- L'interfaccia di Persone e accessi separa due assi:

```text
Accesso alla casa:   ○ Limitato   ○ Standard   ○ Completo
Amministrazione:     [ ] Gestisce Domus   (solo per gli amministratori di Home Assistant)
```

con «Limitato» = `restricted`, «Standard» = `member`, «Completo» = `resident`;
«Gestisce Domus» = ruolo `admin`, possibile solo per un admin HA.

- Nell'immediato, a livello di testi: il ruolo Amministratore dato a un
  account che non è admin HA dovrebbe dire che **non** amministra. Oggi la
  descrizione «Accesso completo a Domus» è sbagliata per quel caso (Q23).
- Niente deny esplicito (D55): ogni proposta aggiunge, non toglie.

**Persone tipo:**

| Persona | Account | Accesso | Note |
| --- | --- | --- | --- |
| Coniuge | Personale, non admin HA | Completo (`resident`) | Tutta la casa, niente persone, ruoli, recupero o sistema |
| Figli | Personale | Limitato, con grant scelti dai genitori | Sessione breve; niente configurazione; accessi e allarme solo se concessi |
| Collaboratrice domestica | Personale | Limitato | Orari e stanze sono estensioni future (resource scope, P2.7), fuori V1 |
| Ospite | — | — | Q7: account dedicato dopo P2.6 |
| Pannello | Tecnico, per tablet | `wall_panel` | La base comune |

## 9. L'account tecnico del pannello (Q19)

| | Un account per tablet | Un account per tutti i pannelli |
| --- | --- | --- |
| Audit | Si sa quale tablet ha fatto cosa | Un solo `user_id` per tutti |
| Revoca | Tablet perso: si disattiva solo lui | Si disattivano tutti i pannelli |
| Raggio del danno | Un tablet | Tutti |
| Configurazione | Più account da creare | Uno |

**Raccomandazione**: un account HA per tablet, non admin, con ruolo
`wall_panel`, creato a mano in HA (Impostazioni → Persone → Utenti). Domus non
crea utenti HA da sé: i comandi che usa l'interfaccia di HA sono interni al
suo frontend, non un'API di sviluppo da automatizzare. Un account solo per più
pannelli resta possibile per una casa con un unico tablet. **Q19 resta aperta**
fino a una tua conferma, perché è un compromesso di configurazione.

**Ruolo `wall_panel` (Q22): KEEP per V1** come ruolo dell'account tecnico di
base, con le capability di oggi. In futuro si potrà rinominarlo nell'interfaccia
(«Pannello condiviso»), senza migrazione dello store: l'id resta `wall_panel`.
Rendere configurabili le sue capability per tablet richiede ruoli
personalizzati (P2.7).

## 10. Rischi del dispositivo fisico

Il pannello è un **dispositivo semi-fidato, accessibile fisicamente da
chiunque in casa**. Minacce T70–T78 nel
[threat model](access-control-threat-model.md):

| # | Rischio | Mitigazione nel design |
| --- | --- | --- |
| T70 | Confondere il dispositivo con la persona | Dispositivo, utente, sessione e ruolo separati (D78) |
| T71 | Selettore di profilo come escalation | Toccare una foto non autentica (D80) |
| T72 | Sessione admin lasciata aperta | Sessioni personali temporanee, tetto per l'admin, Screensaver = fine (Q20) |
| T73 | Token di più persone salvati sul tablet | Opzione C rifiutata; token personali solo in memoria e revocati |
| T74 | PIN locale preso per identità HA | Nessun PIN come identità o come password (D80) |
| T75 | Account del pannello che diventa admin del dispositivo | Nessuna capability da admin per il pannello (D79, Q21) |
| T76 | Presenza o persona usate come autenticazione | Mai (D80) |
| T77 | Più schede con autorità diverse | Sessione personale in una sola scheda e in memoria |
| T78 | Tablet rubato o credenziali estratte | Sul disco solo i token dell'account tecnico, non admin; revoca disattivando quell'utente in HA |

DevTools, `localStorage`, deep link e «indietro» del browser non danno nulla in
più: il backend decide sul principal della connessione (D46, P2.5D.1). Il
pannello base non può chiamare l'Alimentazione: `access_denied`, verificato in
casa.

## 11. Cosa serve prima della Raccolta rifiuti

**Niente di questa implementazione.** Basta questo design: l'enforcement della
Raccolta rifiuti (P2.5D.2) applica le capability di oggi:
- `waste.view` per tutti tranne `locked`, quindi anche per il pannello;
- `waste.manage` solo per l'admin HA.

Non dipende da come una persona si autentica sul tablet. L'architettura va
fissata ora; l'implementazione si può fare a fasi.

## 12. Fasi

| Fase | Contenuto |
| --- | --- |
| **P2.5D.1.1A** ✓ | Questo design |
| P2.5D.1.1B | Significato dei ruoli nell'interfaccia: descrizioni corrette, «Accesso alla casa» separato da «Amministrazione», eventuale ruolo `resident` (Q23) |
| P2.5D.1.1C | Modalità pannello come impostazione di **questo dispositivo** e `personal_session_timeout`, configurabili da un admin |
| P2.5D.1.1D | Spike, poi sessione personale sicura (opzione B, Q18) nelle tre modalità |
| P2.5D.1.1E | QA in casa con il tablet condiviso |

P2.5D.2 (Raccolta rifiuti) può procedere in parallelo da subito.
