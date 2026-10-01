# Header di sicurezza per la produzione

La policy nel file `index.html` è il fallback di sviluppo. Durante `vite build` viene sostituita con una policy stretta. Gli asset della mappa membri su `https://tiles.basemaps.cartocdn.com` sono autorizzati di default soltanto in `img-src` e `connect-src`, sia nella build standalone sia nel pacchetto HACS.

Per un’installazione esterna, dichiarare soltanto gli ulteriori origin realmente necessari separati da virgola:

```text
VITE_CSP_ALLOWED_ORIGINS=https://ha.example.test
```

Senza questa variabile, la build non incorpora alcun origin Home Assistant personale: oltre a same-origin rimane consentito soltanto l’origin CARTO nelle due direttive necessarie. Il server dovrebbe comunque inviare l’header seguente, perché `frame-ancestors` non è applicabile tramite `<meta>`. Se l’header HTTP è più restrittivo del tag `<meta>`, deve includere CARTO nelle stesse direttive o la mappa verrà bloccata.

## Panel Home Assistant (consigliato)

```http
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://tiles.basemaps.cartocdn.com; media-src 'self' blob:; connect-src 'self' https://tiles.basemaps.cartocdn.com; worker-src 'self' blob:; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; frame-src 'self'; manifest-src 'self'
Referrer-Policy: strict-origin-when-cross-origin
X-Content-Type-Options: nosniff
Permissions-Policy: camera=(), microphone=(), geolocation=(self), publickey-credentials-get=(self)
```

## Installazione esterna OAuth

```http
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://tiles.basemaps.cartocdn.com https://HA_ORIGIN; media-src 'self' blob: https://HA_ORIGIN; connect-src 'self' https://tiles.basemaps.cartocdn.com https://HA_ORIGIN wss://HA_ORIGIN; worker-src 'self' blob:; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'self'; manifest-src 'self'
```

Gli origin configurati con `VITE_CSP_ALLOWED_ORIGINS` mantengono il supporto immagini, media, connessioni HTTP e WebSocket. CARTO viene invece sempre deduplicato e limitato a immagini e richieste cartografiche: non riceve permessi `media-src` o WebSocket. Non usare wildcard o `unsafe-eval`. `frame-ancestors` deve essere inviato come header HTTP: nei tag `<meta>` non è applicabile.
