# Header di sicurezza per la produzione

La policy nel file `index.html` è il fallback di sviluppo. Durante `vite build` viene sostituita con una policy stretta. Nessun origin esterno è autorizzato di default, né nella build standalone né nel pacchetto HACS (la mappa dei membri con le tile CARTO è stata rimossa insieme a MapLibre).

Per un’installazione esterna, dichiarare soltanto gli ulteriori origin realmente necessari separati da virgola:

```text
VITE_CSP_ALLOWED_ORIGINS=https://ha.example.test
```

Senza questa variabile, la build non incorpora alcun origin Home Assistant personale: resta consentito soltanto same-origin. Il server dovrebbe comunque inviare l’header seguente, perché `frame-ancestors` non è applicabile tramite `<meta>`.

## Panel Home Assistant (consigliato)

```http
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; frame-src 'self'; manifest-src 'self'
Referrer-Policy: strict-origin-when-cross-origin
X-Content-Type-Options: nosniff
Permissions-Policy: camera=(), microphone=(), geolocation=(self), publickey-credentials-get=(self)
```

## Installazione esterna OAuth

```http
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://HA_ORIGIN; media-src 'self' blob: https://HA_ORIGIN; connect-src 'self' https://HA_ORIGIN wss://HA_ORIGIN; worker-src 'self' blob:; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'self'; manifest-src 'self'
```

Gli origin configurati con `VITE_CSP_ALLOWED_ORIGINS` mantengono il supporto immagini, media, connessioni HTTP e WebSocket. CARTO viene invece sempre deduplicato e limitato a immagini e richieste cartografiche: non riceve permessi `media-src` o WebSocket. Non usare wildcard o `unsafe-eval`. `frame-ancestors` deve essere inviato come header HTTP: nei tag `<meta>` non è applicabile.
