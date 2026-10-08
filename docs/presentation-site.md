# Presentation website

The public presentation is built independently of the Home Assistant dashboard.
Its component is still named `BetaLandingPage`, but `/beta` is no longer a
dashboard route. Cloudflare Pages hosts Italian at `https://domusui.pages.dev/`
and English at `/en/`. `site/public/_redirects` redirects the legacy `/beta`
and `/beta/en` URLs to those canonical pages, including trailing slashes.

## Develop, verify and publish

```sh
npm run build:site
npm run site:budget
npm run test:site
npm run preview:site -- --host 127.0.0.1 --port 4180
```

Cloudflare Pages settings: build command `npm run build:site`, output directory
`dist-site`. Publish that directory through the existing Pages project. The
build and test commands do not deploy. Preview uses the compiled production
assets; Cloudflare `_headers` and `_redirects` rules apply only on Pages.

## Content contract

- IT and EN share a typed copy structure under `src/components/site/i18n`.
- The card count comes from `WIDGET_CATALOG` and non-stack `SECTION_CATALOG`
  entries: currently 14 device cards + greeting/weather + scenes = **16 cards**,
  plus **3 stack containers**. Weather is part of greeting, not an additional
  currently selectable catalog entry.
- Energy Core is labelled **available in 1.5.0**, matching `CHANGELOG.md`. It
  includes guided setup, multi-device installations, data quality, live
  readings, tariffs and Recorder-backed history charts. Historical costs and
  savings are not promised.
- Members management, member location maps, desktop editing of other device
  layouts and on-demand loading are already released. General maps/lists,
  Utility Room, Pool & Spa and the Automation Builder are not presented as ready.

## Performance work (2026-10-07)

Same local production build, uncompressed decimal KB:

| Asset group | Before | After |
| --- | ---: | ---: |
| Initial JavaScript | 1,130 | 462 |
| Initial CSS | 537 | 175 |
| All CSS, including deferred cards | 537 | 302 |
| Three app photographs | 822 | 238 |

Real demo widgets and their app translations are loaded separately and mounted
only near the viewport. On phones the opening viewport does not fetch the card
runtime. On desktop visible hero cards request it: total JS after opening the
demos is still about 1.13 MB, not 462 KB. Shared demo state survives unmounting.
The page, navigation and HACS links remain usable if the optional demo fails.

Tailwind scans only presentation/card sources for this build. The dashboard's
styles and build are unaffected. Fonts are declared in CSS so discovery no
longer waits for JavaScript; the opening headline and calls to action do not
wait for entrance animations. Photographs use local WebP derivatives; the
Energy illustration uses existing AVIF/WebP assets and native lazy loading.
The camera demo has no entity id and never calls Home Assistant proxy endpoints.

`npm run site:images` regenerates the three WebP derivatives using the installed
Playwright Chromium, max width 1200, quality 0.78; originals remain untouched.
The production browser checks cover both languages, mobile and desktop, live
light controls, lazy mounting, navigation and optional-demo failure recovery.
`site:budget` caps both raw and gzip initial/total JS and CSS and runs in CI.

For exploratory browser measurements:

```sh
node scripts/measure-site.mjs https://domusui.pages.dev/ http://127.0.0.1:4180/
```

These are cold-context lab samples, not field Core Web Vitals. Local and remote
load times are not directly comparable; validate deployed performance under
the same network/device conditions after publishing.
