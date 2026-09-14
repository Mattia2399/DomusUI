# HACS installation

Updated: 2026-09-02

HACS is the only distributed installation channel for the Domus UI public beta. The future official app will become the second supported method. Previous manual `/www` and `panel_custom` installations are considered legacy and are not part of the public installation path.

## Requirements

- Home Assistant 2025.1.0 or newer;
- HACS configured;
- Owner/Admin access to install and add the integration;
- a recent Home Assistant backup;
- a Domus UI GitHub Release containing `domusos.zip`.

## Installation

1. Open the repository directly in HACS:

   [![Open the repository in HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=Mattia2399&repository=DomusUI&category=integration)

2. If the link does not import the repository, open the custom repositories menu in HACS and add:

   ```text
   https://github.com/Mattia2399/DomusUI
   ```

   Category: `Integration`.

3. Download the latest **Domus UI** release.
4. Restart Home Assistant.
5. Go to **Settings -> Devices & services -> Add integration**.
6. Search for **Domus UI** and confirm.
7. Open **Domus UI** from the sidebar and complete onboarding.

The integration registers the panel and frontend files automatically. You do not need to edit `configuration.yaml`, create a token, or copy files to `/config/www`.

## First launch

1. The welcome screen with `Get started` must appear.
2. Choose between Demo mode and connecting your home.
3. In the HACS panel, Domus UI discovers the home through the already authenticated Home Assistant session.
4. Even when the home is detected automatically, complete Analysis, Layout, and Organize.
5. At the end, choose whether to keep the guided-demo layout or start from an empty canvas when that option is available in the installed release.

## Updating

1. Create a Domus UI dashboard backup and a Home Assistant backup.
2. Install the update offered by HACS.
3. Restart Home Assistant if HACS requests it.
4. Hard-refresh the browser, or fully close and reopen the Home Assistant app.
5. Check the version in Settings, then verify Home, Rooms, and Security.

HACS installs published GitHub Releases, not standalone Git tags. The `Publish release` workflow generates and attaches `domusos.zip` when a tag matching the version in `package.json` is published.

Public beta versions keep the SemVer `-beta.N` suffix but are published as standard GitHub Releases. This lets HACS select `domusos.zip` instead of attempting to install a commit from the default branch.

## Rollback

Open Domus UI in HACS, select one of the available previous releases, and reinstall it. After restarting, verify that the existing layout format is still supported. Rolling back the integration does not restore an older layout by itself.

See [Updates and rollback](update-and-rollback.md) for the complete procedure.

## Troubleshooting

### Domus UI does not appear in the integrations list

- Restart Home Assistant after installing through HACS.
- Clear the browser cache.
- Confirm that `/config/custom_components/domusos/manifest.json` exists.
- Check Home Assistant logs for `domusos` errors.

### The panel is black or does not load

- Reinstall the release from HACS to restore the `frontend` directory included in the ZIP.
- Confirm that `domusos.zip` belongs to the version shown by the release.
- Hard-refresh the browser.
- Check the browser console for failed requests under `/domusos_static/`.

### Edit Mode is unavailable

- Confirm that the Home Assistant identity is Owner/Admin.
- Check the connection status shown by Domus UI.
- Wait for shared configuration hydration to finish.
- Do not use mock entities to send Home Assistant services.

## Minimum post-installation verification

- Welcome and onboarding appear on first launch.
- The displayed Home Assistant role is correct.
- A limited user cannot enter Edit Mode.
- The layout is saved to Home Assistant and loaded by a second device.
- Home and Rooms navigate without reloading the document.
- Real commands are blocked while the connection is offline.
- Domus Core Irrigation remains stopped after installation or restart until it
  is explicitly enabled, and its configured actuators are confirmed closed.
- Backups and layout versions do not expose tokens, PINs, or codes.

## Building from source

For maintainers:

```bash
npm ci
npm run release:gate
npm run release:package
```

The packaging command creates:

- `release-artifacts/domusos.zip` for HACS;
- the diagnostic web archive;
- `release-artifacts/SHA256SUMS`.
