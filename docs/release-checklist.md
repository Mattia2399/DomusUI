# Checklist rilascio beta

Aggiornata: 2026-09-01

## Gate automatico

- [x] Node minimo fissato a 22.22.0.
- [x] TypeScript senza errori.
- [x] Unit test verdi.
- [x] Build di produzione verde.
- [x] Bundle sotto i limiti bloccanti.
- [x] Audit senza vulnerabilità moderate, high o critical.
- [x] E2E Chromium verdi.
- [x] Route applicative immutabili.
- [x] Primo setup panel/iframe coperto da E2E.
- [x] Struttura integrazione e pacchetto HACS validabili in CI.
- [x] Coerenza Light/Dark verificata sulle route principali e nidificate, senza overflow mobile.

Comando:

```bash
npm run release:gate
```

## Collaudo manuale obbligatorio

- [x] Panel bridge su Home Assistant reale.
- [ ] Installazione HACS pulita su Home Assistant reale.
- [ ] Aggiornamento e rollback HACS tra due release pubblicate.
- [ ] OAuth esterno su HTTPS.
- [ ] Owner, Admin non Owner e utente limitato.
- [ ] Backup e restore su due browser o dispositivi.
- [ ] Reset totale su HA reale: conferma informativa, avanzamento, ritorno al primo avvio e nessuna reidratazione del vecchio layout su un secondo dispositivo.
- [ ] Aggiornamento da una directory versionata e rollback.
- [ ] Alarm SOS su entità mock o impianto di test sicuro.
- [ ] Lock `open` su entità che espone lo scrocco.
- [ ] Stati Lock transitori e `jammed`.
- [ ] `/security`: errore generico, rate limit e fallback tastierino.
- [ ] Smoke CSP per Camera, Media, Mappa, OAuth e WebSocket.
- [ ] Matrice anti-clipping finale sui breakpoint supportati.

## Pacchetto e documentazione

- [x] La versione corrente ha una sezione completa e in inglese in `CHANGELOG.md`.
- [x] `npm run release:notes` genera `release-artifacts/RELEASE_NOTES.md` con contenuto verificato.
- [x] L'anteprima aggiornamento HACS mostra note della release e il confronto completo.
- [x] README coerente con lo scope reale.
- [x] Istruzioni HACS come unico canale beta distribuito.
- [x] Procedura aggiornamento e rollback.
- [x] Pagina Sicurezza e privacy.
- [x] Roadmap pubblica e limiti dichiarati.
- [x] Numero versione tecnica `0.1.0-beta.14`.
- [x] Versione leggibile nella pagina Impostazioni.
- [x] Archivio release riproducibile, manifest file e checksum SHA-256.
- [x] Diagnostica supporto aggregata e priva di segreti.
- [x] Licenza GPL-3.0 OSI compatibile con HACS.
- [ ] Condizioni commerciali/Early Access.
- [x] Canale supporto e feedback con Issues, Discussions, advisory privata e diagnostica locale.
- [x] Screenshot desktop/mobile reali nel README.
- [ ] Video e landing page definitivi.

## Go/no-go

Non pubblicare se:

- un test automatico è rosso;
- backup o restore espongono segreti;
- un utente limitato può modificare la dashboard;
- Alarm/Lock accettano un codice non valido;
- panel o OAuth non hanno un percorso di recupero;
- esiste clipping bloccante nel layout predefinito;
- non è disponibile un rollback documentato.
