# Domus Access Control — capability, route e azioni (P2.0)

Proposta iniziale del registro capability e delle matrici, costruita dalle
funzioni reali del repository (base `f5eb98d`). Nulla di questo è implementato.
Principi e decisioni in
[access-control-architecture.md](access-control-architecture.md); rischi in
[access-control-threat-model.md](access-control-threat-model.md).

**Enforcement**:

- `domus`: il backend Domus decide, ed è sicurezza vera;
- `ha_native`: decide HA; Domus filtra solo la UI;
- `local`: preferenza del browser, solo UX.

**HA admin**: la capability richiede comunque `is_admin` in HA.

## Registro proposto (V1)

| Capability | Dominio | Descrizione | Rischio | HA admin | Enforcement |
| --- | --- | --- | --- | --- | --- |
| `dashboard.view` | Home | Vedere la Home e le sue card | low | — | ha_native |
| `dashboard.edit` | Home | Modificare layout e card condivisi | medium | sì (`set_system_data`) | ha_native |
| `dashboard.reset` | Home | Ripristinare la configurazione iniziale | high | sì | ha_native |
| `rooms.view` | Stanze | Vedere le stanze | low | — | ha_native |
| `devices.control` | Dispositivi | Luci, prese, clima, tapparelle, media, aspirapolvere, ventole | medium | — | ha_native (`check_entity`) |
| `security.view` | Sicurezza | Pagina Sicurezza, telecamere, sensori | medium | — | ha_native |
| `security.control` | Sicurezza | Serrature, allarme, cancelli e garage (Q4) | high | — | ha_native (+ codici HA) |
| `security.manage` | Sicurezza | Configurazione di sicurezza, card protette | high | sì | ha_native |
| `automations.view` | Automazioni | Vedere le automazioni | low | — | ha_native |
| `automations.run` | Automazioni | Eseguire scene, script, automazioni | medium | — | ha_native |
| `automations.manage` | Automazioni | Creare e modificare automazioni | high | sì (REST config) | ha_native |
| `energy.view` | Energy | Stato e storia dell'energia | low | — | **domus** |
| `energy.manage` | Energy | Profilo dell'impianto, discovery | medium | sì (oggi) | **domus** |
| `irrigation.view` | Irrigazione | Zone, calendario, attività, consumi | low | — | **domus** (+ lettura HA) |
| `irrigation.control` | Irrigazione | Avviare, fermare, mettere in pausa | medium | — | **domus** (+ `check_entity`) |
| `irrigation.manage` | Irrigazione | Configurazione, migrazione automazioni | medium | sì (oggi) | **domus** |
| `waste.manage` | Raccolta rifiuti | Configurazione e notifica di prova | low | sì (oggi) | **domus** |
| `house.manage` | Casa | Piani, aree, stanze | medium | sì (registri) | ha_native |
| `people.view` | Persone | Elenco membri e persone | low | — | ha_native (`person/list`) |
| `people.manage` | Persone | Creare persone, collegare account, foto | high | sì | ha_native |
| `access.manage` | Accessi | Assegnare ruoli Domus, recupero | critical | sì (sempre) | **domus** |
| `system.view` | Sistema | Pagina Sistema, diagnostica | low | — | ha_native |
| `system.manage` | Sistema | Connessione, dispositivi, entità | high | sì (registri) | ha_native / local |
| `backup.export` | Dati | Scaricare la configurazione | medium | — (oggi admin) | local |
| `backup.restore` | Dati | Ripristinare una configurazione | high | sì | ha_native |
| `ha.restart` | Sistema | Riavviare Home Assistant | critical | sì (servizio admin) | ha_native |
| `device.manage` | Questo dispositivo | Aspetto, lingua, screensaver, kiosk, attenzione | low | — | local |
| `device_power.manage` | Questo dispositivo | Alimentazione e ricarica | high | sì (oggi) | **domus** |
| `profile.manage` | Profilo | Il proprio profilo, dispositivi personali, notifica di prova | low | — | **domus** (solo sé) |
| `notifications.recipients` | Notifiche | Scegliere i destinatari | medium | sì (oggi) | **domus** |
| `developer.use` | Avanzate | Modalità sviluppatore | low | — (oggi admin) | local |

31 capability. Sono abbastanza larghe da durare (una per area e verbo) e
abbastanza strette da distinguere davvero i ruoli.

## Ruoli di sistema proposti

`●` concessa, `—` no, `admin` = solo se l'utente è anche admin HA.

| Capability | admin | member | restricted | wall_panel |
| --- | :---: | :---: | :---: | :---: |
| `dashboard.view`, `rooms.view` | ● | ● | ● | ● |
| `devices.control` | ● | ● | ● | ● |
| `security.view` | ● | ● | — | ● |
| `security.control` | ● | ● | — | — |
| `automations.view` | ● | ● | — | — |
| `automations.run` | ● | ● | — | ● |
| `energy.view` | ● | ● | — | — (Q6) |
| `irrigation.view` | ● | ● | ● | ● |
| `irrigation.control` | ● | ● | — | — |
| `people.view` | ● | ● | — | — |
| `system.view` | ● | ● | — | — |
| `device.manage` | ● | ● | — | — |
| `profile.manage` | ● | ● | ● | — |
| Tutte quelle con «HA admin: sì», `backup.export`, `developer.use` | admin | — | — | — |
| `access.manage` | admin (sempre per ogni admin HA) | — | — | — |

- `member` riproduce ciò che un utente HA non admin può fare oggi in Domus: è
  il default che non rompe nulla.
- `locked` (interno, mai assegnabile, usato quando lo store non è leggibile)
  contiene `dashboard.view`, `rooms.view`, `profile.manage`.

## Migrazione delle capability esistenti

| Oggi (`DashboardCapability`) | Domani |
| --- | --- |
| `edit_dashboard` | `dashboard.edit` |
| `manage_rooms` (usata anche per la guardia sulle API amministrative) | `house.manage`, e la guardia diventa «capability del comando» |
| `manage_security_config` | `security.manage` |
| `download_backup` | `backup.export` |
| `restore_backup` | `backup.restore` |
| `reset_dashboard` | `dashboard.reset` |
| `developer_mode` | `developer.use` |
| `restart_home_assistant` | `ha.restart` |
| `manage_energy` | `energy.manage` |
| `administratorsOnly` (Alimentazione) | `device_power.manage` |

La demo resta un insieme a parte (`DEMO_CAPABILITIES`), fuori dalla policy.

## Capability matrix

`Backend` = enforcement possibile nel backend Domus.

| Funzione | Azione | Capability | Rischio | Backend | Visibilità frontend | Check nativo HA |
| --- | --- | --- | --- | --- | --- | --- |
| Home | Vedere card e stati | `dashboard.view` | low | no | route, nav | lettura stati |
| Home | Modifica layout, undo, versioni | `dashboard.edit` | medium | no | Edit mode, Impostazioni › Dashboard | `set_system_data` admin |
| Home | Reset dashboard | `dashboard.reset` | high | no | Impostazioni › Dati | `set_system_data` admin |
| Card luce/presa/clima/tapparella/media/aspirapolvere | Comandare | `devices.control` | medium | no | card disabilitata | `check_entity` control |
| Card serratura | Sblocca, apri | `security.control` | high | no | card disabilitata | `check_entity` + codice HA |
| Card allarme | Arma, disarma | `security.control` | high | no | card disabilitata | `check_entity` + codice HA |
| Card scena/script | Eseguire | `automations.run` | medium | no | card disabilitata | `check_entity` |
| Telecamere | Vedere flusso e storia | `security.view` | medium | no | route `/security/cameras` | lettura entità |
| Stanze | Vedere; rinominare/organizzare | `rooms.view`; `house.manage` | low; medium | no | route; voci di gestione | registri admin |
| Automazioni | Vedere; creare/modificare; reload | `automations.view`; `automations.manage` | low; high | no | route; editor | REST config admin, reload admin |
| Energy | Stato, storia | `energy.view` | low | **sì** | route `/consumi/energia` | — |
| Energy | Profilo, discovery, wizard | `energy.manage` | medium | **sì** | wizard, impostazioni Energy | — (oggi `require_admin`) |
| Irrigazione | Configurazione, stato | `irrigation.view` | low | **sì** | route `/appgallery/irrigation` | lettura entità |
| Irrigazione | Avvio/stop zona, pausa | `irrigation.control` | medium | **sì** (WS e servizi) | pulsanti | `check_entity` control |
| Irrigazione | Configurazione, migrazione | `irrigation.manage` | medium | **sì** | impostazioni dell'app | — (oggi admin) |
| Raccolta rifiuti | Configurazione, prova | `waste.manage` | low | **sì** | Impostazioni › Raccolta | — (oggi admin) |
| Profilo | Leggere/salvare sé, dispositivi personali, prova | `profile.manage` | low | **sì** | `/settings/profile` | account domestico |
| Notifiche | Elenco destinatari | `notifications.recipients` | medium | **sì** | scelta destinatari | — (oggi admin) |
| Persone e accessi | Elenco membri | `people.view` | low | no | `/settings/access` | `config/auth/list` admin, `person/list` aperto |
| Persone e accessi | Crea persona, collega account, foto | `people.manage` | high | no | azioni | `person/*` admin, upload admin |
| Persone e accessi | Ruoli Domus | `access.manage` | critical | **sì** | futura sezione Accessi | admin |
| Sicurezza | Configurazione e card protette | `security.manage` | high | no | Impostazioni › Sicurezza | `set_system_data` admin |
| Sistema | Connessione | `system.manage` | high | no (browser) | Impostazioni › Connessioni | — |
| Sistema | Dispositivi, entità | `system.manage` | high | no | Impostazioni › Dispositivi/Entità | registri admin |
| Sistema | Riavvio HA | `ha.restart` | critical | no | Impostazioni › Sistema | servizio admin |
| Dati | Export / restore | `backup.export` / `backup.restore` | medium / high | no | Impostazioni › Dati | restore: `set_system_data` admin |
| Questo dispositivo | Aspetto, lingua, screensaver, kiosk, attenzione | `device.manage` | low | no (browser) | Impostazioni › Dispositivo | — |
| Questo dispositivo | Alimentazione | `device_power.manage` | high | **sì** | Impostazioni › Alimentazione | — (oggi `require_admin`) |
| Avanzate | Modalità sviluppatore | `developer.use` | low | no (browser) | Impostazioni › Avanzate | — |

## Route

| Route | Accesso oggi | Capability proposta | URL diretto | Note |
| --- | --- | --- | --- | --- |
| `/`, `/home` | Ogni utente HA | `dashboard.view` | «Non disponibile» | Ogni ruolo la ha |
| `/rooms`, `/rooms/:id` | Ogni utente; gestione solo admin | `rooms.view` | «Non disponibile» | |
| `/security` | Ogni utente | `security.view` | «Non disponibile» | |
| `/security/cameras`, `/security/sensors` | Ogni utente | `security.view` | «Non disponibile» | |
| `/automations` | Ogni utente | `automations.view` | «Non disponibile» | L'editor richiede `automations.manage` |
| `/consumi` | Ogni utente | `energy.view` | «Non disponibile» | Acqua, Gas, Report sono anteprime: stessa capability |
| `/consumi/energia` | Ogni utente; wizard/impostazioni admin | `energy.view` | «Non disponibile» | Mini-app autonoma |
| `/consumi/acqua`, `/gas`, `/report` | Ogni utente | `energy.view` | «Non disponibile» | |
| `/appgallery` | Ogni utente | almeno una capability di app | «Non disponibile» | Mostra solo le app concesse |
| `/appgallery/irrigation/*` | Ogni utente; dati filtrati | `irrigation.view` | «Non disponibile» | `/settings` dell'app: `irrigation.manage` |
| `/appgallery/pool`, `/technical` | Anteprime | `dashboard.view` | — | Anteprime senza dati |
| `/settings` | Ogni utente; voci filtrate | qualsiasi voce visibile | sempre (c'è il Profilo) | |
| `/settings/profile/*` | Ogni account domestico | `profile.manage` | «Non disponibile» | Non per `wall_panel` |
| `/settings/dashboard` | `edit_dashboard` | `dashboard.edit` | «Non disponibile» | |
| `/settings/floors` | Ogni utente, azioni admin | `house.manage` | «Non disponibile» | |
| `/settings/access/*` | `manage_rooms` | `people.view`; azioni `people.manage` / `access.manage` | «Non disponibile» | Futura sezione Accessi |
| `/settings/safety` | `manage_security_config` | `security.manage` | «Non disponibile» | |
| `/settings/home/waste-collection` | Ogni utente, salvataggio admin | `waste.manage` | «Non disponibile» | |
| `/settings/connections` | Ogni utente | `system.manage` | «Non disponibile» | Nel pannello è informativa |
| `/settings/devices`, `/entities` | Ogni utente, azioni admin | `system.manage` | «Non disponibile» | |
| `/settings/system` | Ogni utente | `system.view`; riavvio `ha.restart` | «Non disponibile» | |
| `/settings/data` | `download_backup` | `backup.export`; restore `backup.restore` | «Non disponibile» | |
| `/settings/device/appearance`, `/language`, `/screensaver`, `/kiosk` | Ogni utente | `device.manage` | «Non disponibile» | Preferenze del browser |
| `/settings/device/power` | Solo admin HA | `device_power.manage` | «Non disponibile» | |
| `/settings/attention` | `edit_dashboard` | `device.manage` | «Non disponibile» | Oggi admin: va deciso se resta |
| `/settings/advanced` | `developer_mode` | `developer.use` | «Non disponibile» | |
| `/setup` | Solo a configurazione non completata o `?reconnect=1` | — | — | Onboarding, prima dell'identità; fuori dalla policy |

## Azioni

| Azione | Percorso oggi | Servizio HA | Backend Domus | Capability | Rischio |
| --- | --- | --- | --- | --- | --- |
| Accendere/spegnere luce, presa | `call_service` dal browser | `light.*`, `switch.*` | no | `devices.control` | medium |
| Setpoint e modi clima | `call_service` | `climate.*` | no | `devices.control` | medium |
| Tapparelle | `call_service` | `cover.*` | no | `devices.control` (garage/cancello: `security.control`) | medium/high |
| Media, aspirapolvere, ventole | `call_service` | `media_player.*`, `vacuum.*`, `fan.*` | no | `devices.control` | low |
| Sblocca/apri serratura | `call_service` + gate locale + codice | `lock.unlock`, `lock.open` | no | `security.control` | high |
| Arma/disarma allarme | `call_service` + codice | `alarm_control_panel.*` | no | `security.control` | high |
| Scena, script | `call_service` | `scene.turn_on`, `script.*` | no | `automations.run` | medium |
| Salvare la dashboard | `frontend/set_system_data` | — | no | `dashboard.edit` | medium |
| Ripristino / reset | `frontend/set_system_data` | — | no | `backup.restore` / `dashboard.reset` | high |
| Piani, aree | `config/floor_registry/*`, `config/area_registry/*` | — | no | `house.manage` | medium |
| Dispositivi, entità | `config/device_registry/update`, `config/entity_registry/update` | — | no | `system.manage` | high |
| Persona: crea, collega, foto | `person/create`, `person/update`, `/api/image/upload` | — | no | `people.manage` | high |
| Automazione: salva | REST `/api/config/automation/config/:id` | — | no | `automations.manage` | high |
| Automazione: reload | `call_service` | `automation.reload` (admin) | no | `automations.manage` | medium |
| Riavvio HA | `call_service` | `homeassistant.restart` (admin) | no | `ha.restart` | critical |
| Energy: stato, storia | WS | — | `domusos/energy/get_state`, `get_history` | `energy.view` | low |
| Energy: profilo, discovery | WS | — | `get_profile`, `save_profile`, `discover` | `energy.manage` | medium |
| Irrigazione: zona, pausa, stop | WS o servizio | `domusos.*_irrigation*` | `irrigation/start_zone`, `stop_zone`, `pause`, `resume`, `stop_all` | `irrigation.control` | medium |
| Irrigazione: configurazione | WS | — | `irrigation/save_config`, `prepare_legacy_removal` | `irrigation.manage` | medium |
| Alimentazione | WS | (il controller agisce in HA) | `device_power/get_state`, `save_policy`, `bind_policy`, `delete_policy` | `device_power.manage` | high |
| Raccolta rifiuti | WS | — | `waste_collection/save_config`, `test_notification` (`get_config`, `preview` aperti) | `waste.manage` | low |
| Profilo | WS | — | `profile/get_self`, `save_self`, `*_device`, `test_self` | `profile.manage` | low |
| Destinatari notifiche | WS | — | `profile/list_recipients` | `notifications.recipients` | medium |
| Ruoli Domus | — (futuro) | — | `domusos/access/*` | `access.manage` | critical |
| Recupero policy | — (futuro) | `domusos.reset_access_policy` (admin) | sì | `access.manage` | critical |
