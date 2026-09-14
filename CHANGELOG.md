# Changelog

## 0.1.0 - 2026-09-14

### Stable scope

- Domus UI reaches its first stable release for the Home dashboard and visual
  builder, Rooms, Security, Consumption, Profile, Settings, shared layouts,
  backups, revision history, and the HACS installation lifecycle.
- Italian, English, and French remain supported across the stable routes,
  onboarding, dialogs, contextual controls, errors, and accessible labels.
- Incomplete workspaces remain unavailable behind an explicit `Coming later`
  screen instead of exposing partial controls.

### Added

- A per-user Home Assistant startup preference in Profile. Users can choose to
  open Domus UI after signing in without changing other frontend preferences;
  disabling it restores the previous available panel or the Home Assistant
  system default.
- A separate `Return to Home Assistant` action in the desktop/tablet sidebar
  and mobile drawer. It opens the native Home Assistant Overview without
  disabling the Domus UI startup preference or disconnecting the account.
- The same return action is available during local development when Domus UI is
  connected to a real Home Assistant instance.

### Improved

- The panel bridge now exposes an explicit, allowlisted host-navigation
  capability and keeps iframe navigation separate from WebSocket commands and
  stored frontend preferences.
- Public documentation, installation guidance, release notes, and feature
  status now distinguish the stable Domus UI surface from features that are
  still in Beta or planned.

### Validation

- TypeScript, unit tests, production build, bundle budget, dependency audit,
  release packaging, and Chromium end-to-end tests are required by the release
  workflow before GitHub and HACS assets are published.
- The Home Assistant panel bridge distribution contract verifies that the
  navigation action is present in the generated HACS frontend bundle.

### Known limitations

- Domus Core Irrigation remains explicitly in Beta while additional real-world
  actuator and failure-path validation continues. It is not part of the stable
  unattended-operation guarantee.
- Automations, Utility Room, Pool & Spa, Calendar, Map, Lists, QR sharing,
  device profiles, and Domus Core Security remain planned or `Coming later`.
- Domus UI is not a certified alarm, security, irrigation, or safety system.

## 0.1.0-beta.15 - 2026-09-14

### Added

- **Domus Core Irrigation**, an authoritative server-side irrigation engine
  built directly into the Domus UI Home Assistant integration. Schedules,
  safety timers, queues, and active sessions now continue to run when every
  browser and Domus UI screen is closed.
- A versioned Home Assistant Store for irrigation configuration and runtime
  state, with optimistic revisions and idempotent command identifiers.
- Authenticated WebSocket commands and native Home Assistant actions for
  starting or stopping a zone, stopping the complete system, and pausing or
  resuming irrigation. Action descriptions are available in Italian, English,
  and French.
- A server-owned scheduler using Home Assistant local time, duplicate-run
  protection across daylight-saving transitions, configurable concurrency,
  and a FIFO queue when all available slots are occupied.
- A compact activity card on the Irrigation overview and a dedicated Activity
  page for completed, stopped, skipped, interrupted, and failed sessions.
- A guided migration for configurations created by earlier Domus UI betas. Only
  recognizable legacy irrigation automations are disabled and presented for
  review and manual removal.
- A localized end-of-onboarding choice between keeping the prepared starter
  dashboard and beginning with an intentionally empty canvas, plus an explicit
  starter-template restore action in Settings.
- A redesigned contextual Weather experience with hourly or daily temperature,
  animated humidity, pressure, UV, wind, sunrise/sunset, localized conditions,
  and capability-based modules that disappear when data is unavailable.

### Safety and reliability

- Real irrigation zones accept only `valve.*` and `switch.*` actuators;
  `input_boolean.*` remains isolated to Demo mode.
- Manual and scheduled sessions have a server-side deadline and watchdog, with
  configurable durations from 5 to 60 minutes.
- Parallel operation defaults to one zone and requires an explicit hydraulic
  capacity acknowledgement before a higher limit can be saved.
- Rain protection is fail-closed when enabled: an unavailable rain sensor blocks
  new starts and closes active zones. Rain during a cycle can either stop it
  immediately or allow the active cycle to finish.
- Pause closes active actuators while preserving remaining time for an explicit
  resume. Stop closes everything, clears queued work, and blocks schedules until
  the system is enabled again.
- Failed actuator confirmation is retried; an unconfirmed close moves the engine
  to `fault` and creates a persistent Home Assistant Repair issue.
- Integration reloads and Home Assistant restarts never resume old cycles:
  previously active actuators are closed and their sessions are recorded as
  interrupted.
- Owner/Admin permissions protect configuration changes, while every operational
  command re-checks the Home Assistant user's permission for its actuator.

### Improved

- Irrigation configuration, rain-protection changes, sessions, countdowns,
  queue state, and anomalies synchronize between open clients through push
  updates instead of browser polling.
- New zones can be prepared while other zones are running; changes that would
  affect an active actuator or live safety policy are rejected with a clear,
  localized explanation.
- Manual zone controls now expose queued, opening, running, closing, and paused
  states consistently with the server, including remaining-time countdowns.
- Consumption history is loaded on the overview as well as the detailed page.
  Its chart now has stable dimensions and uses a per-user, per-server session
  cache so known data renders immediately while stale values refresh in the
  background.
- Irrigation overview spacing, warning banners, configuration access, calendar,
  zone cards, activity history, and responsive mobile/desktop layouts have been
  refined.

### Fixed

- Opening Irrigation now always starts from the Overview instead of reusing a
  stale nested route such as Consumption.
- Rain-protection changes now propagate live to other open Domus UI clients.
- Paused sessions retain their backend remaining time instead of resetting the
  zone timer in the interface.
- Safe zone additions are no longer blocked merely because another zone is
  currently irrigating.
- Irrigation command failures now surface the reason returned by Home Assistant
  instead of a generic API error.
- The overview consumption bars no longer collapse inside an auto-sized card.

### Validation performed

- Real Home Assistant checks completed with a `switch.*` actuator and a binary
  rain sensor: configuration persistence, reload, manual start/stop, rain block,
  rain interruption, single-slot FIFO queue, parallel capacity, global
  pause/resume, and live multi-client rain-setting synchronization.
- Automated backend coverage includes Store normalization, revisions,
  idempotency, WebSocket and action routing, permissions, scheduling, queueing,
  rain policies, actuator timeouts, close retries, fault recovery, reload, and
  restart safety.
- Frontend coverage includes migration, unavailable backend, configuration
  conflicts, active-session editing, countdown behavior, activity history,
  consumption caching, and Italian/English/French interface contracts.

### Known limitations

- This first Core release does not yet include pump control, flow monitoring,
  weather- or soil-based automatic adjustment, Cycle & Soak, or robot lawn
  mower support.
- A host power outage cannot close a powered valve while Home Assistant is
  offline. Critical installations still require a hardware auto-off or local
  watchdog and should not rely solely on beta software.

## 0.1.0-beta.14 - 2026-09-07

### Added

- Essential multilingual experience in Italian, English, and French, with the
  initial language detected from Home Assistant or the browser and an explicit
  per-device language selector in Profile.
- Complete translations for onboarding and reconnection, Home, Rooms,
  Settings, App Library, and the Irrigation workspace, including their nested
  pages, dialogs, empty states, errors, and accessible labels.
- Localized `Coming soon` protection for routes that are not ready to offer a
  consistent translated experience yet.
- English release notes generated automatically for GitHub and the HACS update
  preview, plus a French Home Assistant Config Flow translation.

### Improved

- Home Assistant entity states, dates, times, and numbers now follow the active
  language without changing user-defined entity, device, area, or person names.
- Apple devices now use the native system font stack consistently with Windows
  and Android.
- App Library and Irrigation navigation, configuration, calendar, consumption,
  zone management, and demo previews now share the same localization contract.
- Release checks now audit untranslated strings and test a deterministic Italian
  browser locale while retaining explicit English and French coverage.

### Fixed

- Compatibility with Home Assistant versions that do not expose
  `frontend.async_panel_exists` through the same API.
- Tablet navigation no longer maps the App Library icon to the Home route when
  the sidebar switches to its compact layout.
- Legacy test selectors and accessibility contracts now follow the localized
  navigation and control labels.

## 0.1.0-beta.13 - 2026-09-01

### Added

- Integrated Support & feedback center with direct access to bug reports,
  feature requests, Discussions, and local diagnostics.
- Contextual help in Rooms device lists explaining selection, long press, and
  section customization.
- Explicit choice when removing a stack: keep its cards on the canvas, remove
  them with the stack, or cancel.

### Improved

- More compact and complete desktop/tablet sidebar on intermediate viewports.
- Smoother Rooms header while scrolling, compatible with touch dragging.
- Grid and horizontal stacks now derive automatic width from their content and
  respect the configured column count in manual mode.
- Favorites stacks populate automatically without removing cards that were
  already placed manually on the canvas.
- Public repository assets and documentation aligned with the Domus UI brand
  and the HACS information view.

### Fixed

- The System section now always opens at the top of the page.
- README images render correctly in the HACS information view.
- Cards at the bottom of stacks are no longer clipped, and automatic layouts
  no longer leave unused horizontal space.
- Stack removal now requires an explicit decision, preventing accidental loss
  of contained cards.

## 0.1.0-beta.12 - 2026-08-31

### Changed

- The public product name is now **Domus UI**, better reflecting its role as a
  Home Assistant dashboard and builder.
- The public repository was renamed to `Mattia2399/DomusUI`; GitHub preserves a
  redirect from the previous address.
- Panel title, Config Flow, HACS, onboarding, documentation, and user-facing
  messages now use the new brand consistently.
- `domusos` remains the compatible technical domain for the integration,
  storage, internal URLs, and HACS package; existing layouts require no
  migration.
- Added 256/512 px icons and documentation for Home Assistant brand assets.

## 0.1.0-beta.11 - 2026-08-28

### Improved

- New responsive promotional image for the GitHub repository and HACS page.
- Complete separation between Demo fixtures and real data: cards, catalog, and
  panels no longer use simulated values in a Home Assistant session.
- Rooms keeps separate preferences for Demo and real homes and no longer
  invents rooms when Home Assistant exposes no areas.
- Nested Consumption pages now use the shared nested-page header.
- Security logs are empty in real homes and explicitly marked as demonstrative
  in Demo mode.

### Fixed

- Stacks preserve their configured width when a Light changes state. Automatic
  expansion can use more rows without resizing adjacent cards or changing the
  persisted layout.
- Light panel no longer crashes for entities without `hs_color`.
- Real cards no longer inherit capabilities or fallback values from Demo mock
  entities.
- Minor responsive alignment fixes for Light, Climate, Consumption, and App
  Library.

## 0.1.0-beta.10 - 2026-08-28

### Added

- Irrigation redesigned as an independent responsive workspace with Overview,
  Zones, Calendar, Consumption, and shared home configuration.
- Guided setup for valves, weather sensors, soil sensors, and meters, with
  suggestions based on available Home Assistant entities.
- Real consumption history for 7 days, 30 days, and 12 months, including data
  caching and refreshes that preserve existing values instead of showing `N/A`.
- Clearly separated Demo mockups for Utility Room and Pool & Spa.
- Recognition of an existing shared Domus UI configuration from a new origin,
  including `localhost`, avoiding repeated setup for the same home.
- Roadmap for a server-side irrigation engine with scheduler, watchdog, safe
  recovery, and fail-closed controls in the HACS integration.

### Improved

- Panel/iframe onboarding now distinguishes a new home from an existing Domus
  UI installation.
- Mobile and desktop App Library layouts, contextual navigation, and immersive
  pages.
- Irrigation sensor formatting with consistent rounding and readable units.
- App configuration is shared through Home Assistant while the browser remains
  a local cache.

### Fixed

- Scenario card removal from the Builder.
- Shared configuration recovery and panel-bridge allowlist for new
  initialization and reset flows.
- Mobile padding, loading states, and Consumption card updates.

### Known limitations

- Irrigation beta does not yet replace an autonomous controller with a
  server-side watchdog. Manual commands must be supervised, and beta scheduling
  must not be the only safeguard for a real installation.

## 0.1.0-beta.9 - 2026-08-25

### Added

- Authoritative shared reset with blocking progress and Home Assistant storage
  verification.
- Synchronized reset tombstone preventing secondary browsers and devices from
  republishing obsolete layouts.
- Local reset recognition preventing loops in the new onboarding flow.

### Fixed

- Reset removes layouts, history, caches, drafts, and card secrets without
  treating an intentionally cleared store as a first migration.
- Secondary devices keep Home Assistant credentials, passkeys, and personal
  preferences when applying a global reset.
- Panel bridge now validates the reset marker through a strict schema and
  allowlist.

## 0.1.0-beta.8 - 2026-08-25

### Fixed

- Panel registration is compatible with current and future Home Assistant APIs.
- `handle_safe_area` is passed only when supported by the installed Home
  Assistant version.

## 0.1.0-beta.7 - 2026-08-25

### Fixed

- Home Assistant manifest aligned with Hassfest, including local-push IoT class
  and ordered keys.
- YAML configuration explicitly excluded for the Config Flow-only integration.
- Added the Hassfest workflow required for submission to the public HACS store.

## 0.1.0-beta.6 - 2026-08-25

### Added

- Public **DomusOS** identity applied to the app, GitHub project, Home Assistant
  panel, and HACS distribution.
- HACS integration with Config Flow and automatic panel registration.
- `domusos.zip` release package, HACS validation, and tag-based automated
  publishing.
- Complete GitHub README with real screenshots, page matrix, and HACS
  installation.
- Shared `Coming later` state for unfinished features.

### Fixed

- The `dist` build now includes `ha-dashboard-builder-panel.js`, preventing
  partial updates between the app and iframe bridge.
- App and bridge declare protocol and persistence capabilities so mismatched
  versions can be diagnosed.
- Edit Mode reports specific errors for outdated bridges, insufficient
  permissions, conflicts, or unavailable HA storage.
- Updated `js-yaml` and `nanoid` to versions resolving release-gate advisories.

## 0.1.0-beta.5 - in preparation

### Improved

- Greeting is now a stable home summary without duplicating weather and values
  from individual cards.
- Mock weather is restricted to Demo mode and explicit mockups.
- Separate states for unconfigured weather and Home Assistant offline.

### Fixed

- Removed artificial forecasts when Home Assistant returns no forecast data.
- Weather card and panel now show explicit unconfigured, offline, and forecast
  unavailable states.

## 0.1.0-beta.4 - in preparation

### Fixed

- Correct active state for desktop navigation, mobile drawer, and bottom bar
  while running inside the iframe panel.
- Explicit initial Home route for internal panel navigation.
- Nested route matching now uses the effective React route rather than the
  iframe's static URL.

## 0.1.0-beta.3 - in preparation

### Fixed

- Added `config/area_registry/list` to app and panel-bridge allowlists.
- Organize can once again read the area registry through the panel.
- App and bridge are distributed together in one versioned directory for
  atomic updates and rollback.

## 0.1.0-beta.2 - in preparation

### Added

- Mandatory welcome screen for every new installation, including the Home
  Assistant panel.
- Automatic Home Assistant session detection after choosing to connect a home.
- Timed fallback to classic setup when no home is detected.

### Fixed

- Migration for panel installations left in the old intermediate `detected`
  state.
- Responsive tests updated for the new connection flow.

## 0.1.0-beta.1 - technical baseline

### Added

- Initial onboarding with isolated Demo mode, OAuth, and panel-bridge detection.
- Explicit confirmation of the home detected inside iframe/panel installations.
- Centralized permissions, fail-closed behavior, and local confirmation for
  sensitive actions.
- Backups, restore, reset, and recovery snapshots without secrets.
- Shared command coordinator with pending, confirmation, timeout, and rollback.
- Undo/redo, responsive preview, and editor save status.
- Shared Glass components and semantic theme system.
- Installation, update, rollback, and security documentation.
- Versioned distribution package with manifest and SHA-256 checksums.

### Changed

- Updated React and React DOM to 19.2.8.
- Updated React Router to 8.3.0.
- Aligned the `panel_custom` name with the Web Component registered by the
  bridge.
- Made application routes immutable through a central registry.
- Reduced MainBoard and split responsibilities into dedicated controllers and
  services.
- Migrated Sensor, Light, and Switch to the first container-owned phase.

### Security

- Tokens, PINs, codes, passkeys, and local snapshots are excluded from backups
  and synchronization.
- One-time OAuth state with expiration and same-origin return URL.
- Same-origin panel bridge with allowlist and request/response correlation.
- Production CSP without `unsafe-eval`.
- Alarm and Lock share one gate and do not display negative validation before
  submitting a command.

### Known limitations

- The beta is not a certified security system.
- Calendar, Map, Lists, and the official app are not yet available.
- Advanced hardware testing for Climate, Cover, Vacuum, and some Lock/Alarm
  capabilities is still incomplete.
- The bundle remains within the blocking limit but needs additional code
  splitting.
- The final anti-clipping matrix will resume after the container-query pause.
