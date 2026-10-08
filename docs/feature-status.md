# Feature status

Updated: 2026-10-08

This page distinguishes stable functionality from previews and planned work. **Operational** means that the primary path is implemented and covered by project tests; it does not guarantee compatibility with every Home Assistant hardware integration.

## Pages

| Page        | Status           | Available experience                                                                               |
| ----------- | ---------------- | -------------------------------------------------------------------------------------------------- |
| Home        | Operational      | Dashboard, cards, contextual panels, builder, stacks, versions, and shared layout                  |
| Rooms       | Operational      | Floor/room browsing and controls for entities authorized by HA                                     |
| Security    | Operational      | Alarm hub, cameras, selectable sensors, and shared authorization                                   |
| Consumption | Operational      | Views based on data actually available in HA                                                       |
| Domus Energy Core | Operational in 1.5.0 | Read-only live energy, guided setup, multi-device installations, tariffs and Recorder-backed history charts |
| Profile     | Operational      | Personal preferences, device theme, language, and startup panel                                    |
| Settings    | Operational      | Home, entities, people/account linking and member photos (administrators), system, backups, versions, and attention preferences |
| App Gallery | Partial          | Launcher and Irrigation beta are available; Utility Room and Pool & Spa are marked as coming later |
| Automations | Coming later     | The old workspace remains disabled until its workflow is ready for public use                      |
| Calendar    | Operational      | Native Domus UI calendar and compatible Home Assistant calendar entities                           |
| Waste collection | Beta in 1.5.0 | Fixed days (weekly or every 2–4 weeks) or a Home Assistant calendar as source, waste types with icon, color and other names, special days, one aggregated reminder the evening before, 7-day preview; collections appear read-only in Calendar with their type icon and color |

## Cards and controls

The builder catalog currently offers **16 cards/elements**: 14 device widget
types plus greeting/weather and scenes, and **3 stack containers** (vertical,
horizontal and grid). Standalone Weather is not an additional selectable
catalog entry. The website derives these counts from the catalog itself.

| Family                 | Status                                 | Known limitations                                                                         |
| ---------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------- |
| Sensor, Light, Switch  | Verified                               | Primary paths tested with real entities                                                   |
| Alarm, Lock            | Verified with limitations              | HA remains the final authorization authority; Domus UI is not a certified security system |
| Camera, Media Player   | Operational                             | Advanced features depend on capabilities exposed by the entity/device                     |
| Climate, Cover, Vacuum | Operational, partially hardware-tested | Not every hardware and feature combination has been tested                                |
| Fan, Humidifier        | Operational, partially hardware-tested | Controls adapt to capabilities exposed by the entity integration                          |
| Calendar               | Operational                           | Recurrence authoring, aggregation, and advanced month interaction remain planned; waste collection rows are read-only and need the updated integration for their type icon and color |
| Members                | Operational                            | Location map loads on demand when trackers provide coordinates; people without coordinates stay listed |

Desktop editing of tablet and phone layouts is available. Catalog, contextual
panels and member maps load on demand. See [the changelog](../CHANGELOG.md)
for released versions versus upcoming changes, and [Energy Core](energy-core.md)
for its current limits. Historical energy costs and savings are not available.

## Planned for future releases

- advanced Calendar recurrence, aggregation, and month interaction;
- broader map and location management beyond the available member map;
- shopping/Todo lists;
- Utility Room and Pool & Spa apps;
- redesigned Automation Builder;
- richer notifications and contextual snackbars;
- configuration sharing through QR codes;
- official app.

Unavailable pages and apps must use `FeatureAvailabilityPage`. Incomplete functionality must never be presented as operational or left in an ambiguous state.
