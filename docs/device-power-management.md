# Gestione alimentazione e ricarica

Un tablet a parete resta sempre in carica e la batteria ne soffre. Domus può
tenerla tra due soglie: sotto la soglia di avvio accende la presa smart del
caricatore, sopra la soglia di arresto la spegne, in mezzo non fa nulla.

| Dimensione | Valore |
| --- | --- |
| Scope | **DEVICE**: riguarda un dispositivo preciso, non la persona né la casa |
| Owner | **DEVICE_POWER**, modulo dell'integrazione DomusOS (`custom_components/domusos/device_power`) |
| Posizione | Impostazioni › Questo dispositivo › Alimentazione e ricarica (`/settings/device/power`) |
| Autorità | Store dell'integrazione `domusos.device_power.v1` in Home Assistant |
| Esecuzione | Home Assistant, sempre: mai un timer del browser |
| Permessi | Solo amministratori Home Assistant |

## Dove gira

Il controller vive nell'integrazione DomusOS, dentro Home Assistant. Funziona
con lo schermo spento, con Domus chiusa, con il browser in background e dopo
un riavvio di Home Assistant. Il browser legge e salva soltanto la
configurazione: non esiste un comando che accenda o spenga lo switch dal
client, e il pannello non ne lascia passare nessuno
(`domusos/device_power/*` ha quattro comandi: `get_state`, `save_policy`,
`bind_policy`, `delete_policy`).

## Il documento

Lo Store di Home Assistant (versione 1) contiene:

```json
{
  "policies": [
    {
      "policy_id": "0123456789abcdef0123456789abcdef",
      "client_id": "a3f0…",
      "label": "Tablet soggiorno",
      "enabled": true,
      "battery_entity_id": "sensor.tablet_battery_level",
      "switch_entity_id": "switch.presa_tablet",
      "start_threshold": 30,
      "stop_threshold": 80,
      "revision": 4,
      "created_at": "2026-10-16T08:00:00+00:00",
      "updated_at": "2026-10-16T09:12:00+00:00"
    }
  ]
}
```

- Chiavi esatte: un campo in più o in meno rende il documento non valido.
- `policy_id`: 32 caratteri esadecimali, scelto dal server.
- `revision`: per configurazione; ogni modifica deve indicare quella vista
  (`expected_revision`), altrimenti `revision_conflict` e la pagina mostra
  «Questa configurazione è stata modificata altrove.».
- Un salvataggio che non cambia nulla non scrive nulla e non aumenta la
  revisione.
- `label`: spazi rimossi ai bordi, al massimo 64 caratteri, vuota → nessuna
  etichetta.
- Al massimo 20 configurazioni.
- Lo stato vivo (batteria, switch, ultimo comando, ultimo errore) non viene
  mai salvato: lo calcola il controller e arriva con `get_state`.

Nessun campo `strategy` nella versione 1. Una strategia diversa dalle soglie
arriverà con una nuova versione del documento e una migrazione esplicita
(vedi [Futuro](#futuro)).

### Store non valido

Se il documento non si legge o non è valido il modulo **si ferma chiuso**:
nessun controller parte, nessuno switch viene comandato, il file non viene
riscritto (resta lì per la riparazione) e la pagina mostra «Configurazioni non
leggibili». Il resto di DomusOS continua a funzionare.

## Identità del dispositivo

Ogni browser sceglie una volta un riferimento casuale
(`domusui.client_id.v1`, 16 byte casuali in esadecimale) e lo tiene nel suo
`localStorage`. Serve solo a ritrovare «la configurazione di questo
dispositivo».

- **Non è un'autorizzazione.** Chi può leggere o cambiare le configurazioni
  lo decide Home Assistant (amministratore), mai il `client_id`.
- **Non descrive il dispositivo**: niente fingerprint, user agent, indirizzo
  IP, nome del dispositivo, `friendly_name`, email o nome utente.
- **Non è un PersonalDevice.** I dispositivi personali del Profilo sono le
  app Companion di una persona, per le notifiche; il tablet a parete è della
  casa e non appartiene a nessuno. Il suo id non viene riusato.
- Una configurazione per `client_id`; più dispositivi hanno ognuno la sua.

### Recupero

Se il browser viene ripulito il riferimento cambia, ma la configurazione resta
in Home Assistant e continua a funzionare. Nella pagina, sotto
«Configurazioni esistenti», un amministratore vede le configurazioni degli
altri dispositivi e può:

- **Collegarla a questo dispositivo** (solo se questo non ne ha già una):
  `bind_policy` sostituisce il `client_id` alla revisione vista;
- **Eliminarla**.

## Entità

| Campo | Requisiti |
| --- | --- |
| Sensore batteria | `sensor.*`; valore numerico finito tra 0 e 100. Il selettore propone prima i sensori `device_class: battery`, poi quelli in `%` |
| Alimentazione | solo `switch.*`; stato `on` o `off`. Mai `light`, `input_boolean`, script o servizi arbitrari |

Le entità devono esistere (stato o registro entità) al salvataggio. Il
selettore mostra il nome e, sotto, l'`entity_id`.

## Soglie e isteresi

`0 <= avvio < arresto <= 100`, interi. Valori diversi vengono rifiutati
(pagina e server), mai corretti. Predefiniti: 30 % e 80 %.

| Batteria | Decisione |
| --- | --- |
| `<= avvio` | lo switch deve essere acceso |
| `>= arresto` | lo switch deve essere spento |
| tra le due | nessun cambiamento (isteresi) |

Il comando parte solo se lo switch non è già nello stato voluto: rivalutare
non produce comandi ripetuti.

## Controller

Un controller per configurazione attiva, con un lock: una valutazione alla
volta; una richiesta arrivata durante una valutazione ne produce una sola
subito dopo.

- **Eventi**: `state_changed` del sensore e dello switch.
- **Riconciliazione**: ogni 5 minuti, solo come rete di sicurezza per un
  evento perso.
- **Avvio**: alla partenza di Home Assistant (`async_at_started`) le
  configurazioni attive vengono rilette dallo Store e valutate una volta.
- **Pausa tra comandi**: 60 secondi. Un comando richiesto prima viene rinviato
  alla fine della pausa (un solo timer), mai ripetuto in un ciclo.
- **Errori del servizio**: registrati (`last_error.code =
  service_call_failed`, stato Errore, evento `device_power.error`). Il
  tentativo successivo avviene solo con un nuovo evento o la riconciliazione,
  e comunque dopo la pausa.
- **Sensore o switch non disponibile** (`unavailable`, `unknown`, non
  numerico, fuori 0–100, mancante): nessun comando; stato «Sensore batteria
  non disponibile» o «Alimentazione non disponibile», un avviso nel log al
  cambio di stato. Quando l'entità torna, la valutazione successiva riprende.

Ogni comando riuscito pubblica `device_power.started_charging` o
`device_power.stopped_charging` sul runtime DomusOS, con una voce di audit.
Nel log non finiscono token né dati personali.

### Salvataggio

Una modifica ferma prima il vecchio controller (aspettando un comando in
corso), poi scrive lo Store, poi avvia il nuovo: vecchia e nuova
configurazione non comandano mai insieme lo stesso switch. Se la scrittura
fallisce, torna attivo il controller precedente e la configurazione salvata
resta quella di prima (`save_failed`).

### Due configurazioni sullo stesso switch

Due configurazioni **attive** non possono usare lo stesso switch:
`switch_in_use`. Una disattivata può puntarlo.

## La pagina

Come una pagina di Impostazioni di iOS, senza pulsante Salva:

- **Gestione automatica** è l'interruttore in alto. Spento, la pagina mostra
  solo cosa fa la funzione; acceso, si aprono Stato e Configurazione.
- **Prima configurazione**: acceso l'interruttore, si sceglie il sensore
  batteria e la presa; appena entrambi sono validi la configurazione viene
  creata, attiva, senza altri passaggi. Spegnere prima di quel momento non
  invia nulla.
- **Ogni modifica si salva da sola** dopo una breve pausa (700 ms). Un valore
  non valido (soglie, entità scritta a mano che Home Assistant non ha) mostra
  il motivo e non viene inviato; una modifica rifiutata dal server
  (`switch_in_use`) non viene ritentata finché non cambia.
- La riga dell'interruttore dice in parole lo stato: «Attiva: la presa si
  accende con la batteria a 30 % o meno e si spegne a 80 % o più…» oppure
  «Disattivata: la presa resta accesa e Domus non la comanda.».

## Disattivazione ed eliminazione

- **Disattivare** vale subito e cambia solo `enabled`. Ferma il controller,
  lascia lo switch com'è e chiude Stato e Configurazione; la configurazione
  resta salvata.
- **Riattivare** riavvia il controller, che valuta subito la batteria e, se
  serve, accende o spegne la presa.
- **Eliminare** (sempre disponibile se esiste una configurazione) ferma il
  controller e la rimuove; lo switch resta com'è: «La configurazione verrà
  rimossa. Lo stato attuale dello switch non verrà modificato.»

## Permessi

Tutti i comandi sono `require_admin` e il manager controlla di nuovo
l'amministratore. La voce di Impostazioni è nascosta agli altri utenti; la
pagina, aperta comunque, spiega che serve un amministratore e non chiede
nulla. Non esiste una capability `manage_device_power`: quando arriverà
Domus Access Control potrà sostituire il controllo amministratore.

## Compatibilità

Il pannello annuncia la capability `device_power_v1`. Con una versione di
DomusOS che non la offre la pagina mostra «Gestione alimentazione non
disponibile con questa versione di DomusOS.». Un comando sconosciuto viene
trattato allo stesso modo.

## Prestazioni

Pagina, testi (it, en, fr) e client vengono caricati solo aprendo la pagina;
la partenza dell'app contiene soltanto titolo e sottotitolo della voce.

## Futuro

Non implementato:

- fasce orarie, giorni, tariffe, fotovoltaico, carica notturna, override di
  emergenza (`strategy = schedule`, `strategy = smart`);
- screensaver e kiosk, indipendenti da questa funzione.

Una strategia nuova userà la versione 2 del documento con un campo
`strategy` (default `threshold` per le configurazioni migrate) e lascerà la
decisione al controller, che resta l'unico a comandare lo switch.
