<div align="center">
  <img src="https://raw.githubusercontent.com/Mattia2399/DomusUI/main/brand/icon.png" width="112" alt="Domus UI logo" />
  <h1>Domus UI</h1>
  <p><strong>A new Home Assistant experience, designed for desktop, tablet, and mobile.</strong></p>
  <p>A responsive dashboard, visual builder, and advanced controls in one consistent, premium interface.</p>

[![Release](https://img.shields.io/github/v/release/Mattia2399/DomusUI?include_prereleases&style=flat-square)](https://github.com/Mattia2399/DomusUI/releases)
[![Release gate](https://img.shields.io/github/actions/workflow/status/Mattia2399/DomusUI/release-gate.yml?branch=main&label=release%20gate&style=flat-square)](https://github.com/Mattia2399/DomusUI/actions/workflows/release-gate.yml)
[![HACS validation](https://img.shields.io/github/actions/workflow/status/Mattia2399/DomusUI/hacs.yml?branch=main&label=HACS&style=flat-square)](https://github.com/Mattia2399/DomusUI/actions/workflows/hacs.yml)
![Stable](https://img.shields.io/badge/status-stable-2f855a?style=flat-square)
![Responsive](https://img.shields.io/badge/desktop%20%C2%B7%20tablet%20%C2%B7%20mobile-responsive-1473e6?style=flat-square)
[![License GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-2f855a?style=flat-square)](LICENSE)
</div>

![Domus UI on desktop, tablet, and mobile](https://raw.githubusercontent.com/Mattia2399/DomusUI/main/docs/images/domusos-showcase.png)

## Your home, one experience

| Visual builder                                                                | Truly responsive layouts                                                        | Home Assistant native                                                               |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Cards, stacks, drag and drop, sizing, and configuration without writing YAML. | Dedicated desktop, tablet, and mobile grids, synchronized across the same home. | HACS installation, HA sessions, permissions, and commands authorized by the server. |

| Explicit security                                                                   | Consistent experience                                               | Diagnostics and recovery                                               |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Isolated Demo mode, secrets excluded from layouts, and protected sensitive actions. | Light and dark themes, glass surfaces, and touch-friendly controls. | Layout history, sanitized backups, rollback, and privacy-safe reports. |

## Why Domus UI

- One home layout shared and synchronized across devices.
- Authoritative shared reset: an old browser cache cannot accidentally restore a deleted layout.
- Separate desktop, tablet, and mobile grids with drag and drop and undo/redo.
- Responsive cards and contextual panels for the main Home Assistant entity domains.
- Guided onboarding, isolated Demo mode, and connection through the authenticated Home Assistant session.
- A visual builder with catalog, stacks, breakpoint-aware sizing, and related-device configuration.
- Light and dark themes, glass surfaces, and touch-friendly controls.
- Centralized permissions: Home Assistant remains the authority for identity, roles, and commands.
- An optional per-user startup preference can open Domus UI after Home Assistant sign-in; disabling it restores the previous available panel or the Home Assistant system default.

<div align="center">
  <img src="https://raw.githubusercontent.com/Mattia2399/DomusUI/main/docs/images/domusos-mobile.jpg" width="390" alt="Domus UI on a smartphone" />
</div>

## Install with HACS

HACS is the supported installation method for Domus UI. The future official app will become the second supported channel.

[![Open the repository in HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=Mattia2399&repository=DomusUI&category=integration)

1. Install and configure [HACS](https://www.hacs.xyz/) in Home Assistant.
2. Open the link above, or add `Mattia2399/DomusUI` as a custom **Integration** repository.
3. Download **Domus UI** and restart Home Assistant.
4. Go to **Settings -> Devices & services -> Add integration**.
5. Search for **Domus UI**, confirm, and open the new sidebar entry.

No `configuration.yaml` changes, manual tokens, or `/www` copies are required. See the [complete installation guide](docs/installation-beta.md) for updates, rollback, and troubleshooting.

> A HACS release must contain the `domusos.zip` asset. Git tags without a published GitHub Release cannot be installed by HACS.

## Feature status

| Area                     | Status       | Notes                                                                          |
| ------------------------ | ------------ | ------------------------------------------------------------------------------ |
| Home and Builder         | Operational  | Shared layout, Edit Mode, catalog, stacks, versions, and recovery              |
| Rooms                    | Operational  | Floors, rooms, devices, and controls authorized by HA                          |
| Security                 | Operational  | Alarm, cameras, and sensors; not a replacement for a certified security system |
| Consumption              | Operational  | Summaries based on data exposed by HA entities                                 |
| Profile and Settings     | Operational  | Personal preferences separated from home-wide configuration                    |
| App Gallery              | Partial      | Irrigation is in beta; Utility Room and Pool & Spa are in development          |
| Automations              | Coming later | The incomplete interface is not exposed as a usable feature                    |
| Calendar                | Operational  | Native Domus UI calendar plus compatible Home Assistant calendar entities      |
| Map and Lists           | Planned      | Scheduled for future releases                                                  |

Detailed status and verified hardware limitations are documented in [Feature status](docs/feature-status.md).

> **Irrigation:** overview, configuration, calendar, consumption, and the first
> Domus Core server-side scheduler are available. Real cycles use bounded
> server timers, actuator confirmation, a close watchdog, and safe restart
> recovery. Complete the documented hardware validation before relying on
> unattended scheduling.

## Available cards

Sensor, Light, Switch, Fan, Humidifier, Climate, Alarm, Lock, Cover, Camera, Media Player, Vacuum, Calendar, and Members. Cards adapt their content and layout to the available size. Some capabilities depend on the attributes, supported features, and services actually exposed by the device's Home Assistant integration.

## Security and privacy

- Tokens, PINs, Alarm/Lock codes, and passkeys are excluded from layouts, backups, and synchronization.
- Demo mode and the real home use separate storage spaces.
- Structural changes are restricted to Owner/Admin users and fail closed.
- Home Assistant still performs final server-side authorization for commands.
- WebAuthn device confirmation is a local safeguard, not a certified server-side second factor.
- Domus UI is not a certified alarm, security, or safety system.

Read [Security and privacy](docs/security-and-privacy.md) and the [release checklist](docs/release-checklist.md) before using Domus UI in a real home.

## Support and feedback

Domus UI includes **Profile > Support & feedback**. From there, you can download a sanitized local diagnostic report and choose the appropriate channel:

- [report a reproducible bug](https://github.com/Mattia2399/DomusUI/issues/new?template=bug_report.yml);
- [suggest an idea or ask a question](https://github.com/Mattia2399/DomusUI/discussions);
- [privately report a vulnerability](https://github.com/Mattia2399/DomusUI/security/advisories/new).

Diagnostics are never sent automatically and exclude tokens, PINs, URLs, entity or room names, and home state values. Before publishing screenshots or logs, always verify that they do not reveal personal information.

## Development

Node.js 22.22.0 or newer is required.

```bash
npm ci
npm run dev
```

Run the complete verification suite before a release:

```bash
npm run release:gate
npm run release:package
```

Packaging creates both the diagnostic web-app archive and `release-artifacts/domusos.zip`, ready for a HACS GitHub Release.

## Documentation

- [HACS installation](docs/installation-beta.md)
- [Updates and rollback](docs/update-and-rollback.md)
- [Feature status](docs/feature-status.md)
- [Security and privacy](docs/security-and-privacy.md)
- [Domus Core Irrigation](docs/irrigation-core.md)
- [Roadmap](docs/roadmap.md)
- [Release checklist](docs/release-checklist.md)
- [Changelog](CHANGELOG.md)

## License and support

Domus UI is released under the [GNU GPL-3.0](LICENSE). You may use, study, modify, and redistribute it under the terms of that license. The official app, hosted services, and commercial support may be offered separately in the future.

See [CONTRIBUTING.md](CONTRIBUTING.md) before contributing. Vulnerabilities must be reported through the private channel described in [SECURITY.md](SECURITY.md), never through public issues.
