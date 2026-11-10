# HOUSE.3 — Rooms topology through House Core

In connected mode, Rooms and Settings Rooms read `domusos/house/get_topology`
through the shared typed client in `src/services/houseCore.ts`. The Rooms adapter
translates House's floor/room/entity fields to the existing presentation shape.
It copies `effectiveAreaId`; it never recomputes the entity/device area rule.

| Rooms field | House source | Notes |
|---|---|---|
| Floor ID, name, level, aliases, order | `floors[]` | Existing local room order stays in browser layout. |
| Area ID, name, floor, aliases, icon, picture | `rooms[]` | HA room identity is `area_id`. |
| Environment references | `rooms[]` | Explicit Area primary references remain topology facts. |
| Environment readings | `get_snapshot.rooms[]` | Connected Rooms displays canonical House temperature and humidity. |
| Device membership | `devices[].areaId` | Filtered to devices with readable entity refs. |
| Entity ID, stable registry ID, device, direct/effective area | `entities[]` | House is authoritative for membership. |
| Unassigned | `unassigned` | No synthesized HA assignment. |
| Issues | `issues[]` | Available for diagnostics, not shown as technical warnings. |

The topology schema has no new fields. Its authorized projection includes
minimal registry references for the domains Rooms already uses, including
sensor refs without a device class and HA-readable lock/camera refs. This is
needed to preserve Rooms membership and enable backend 2025.1 fallback. It
contains no state or attributes. Person/alarm entities remain excluded. Every
non-admin entity ref must pass Home Assistant `POLICY_READ`.

Rooms' live controls still consume the existing HA state stream. The browser
does not call floor, area, device or entity registry list commands for its
connected topology. The removed `fetchRegistrySnapshot` function no longer
provides a parallel structural source. Legacy area-mapping helpers remain only
for shadow parity tests. The global HA connection's area feed, Onboarding and
other settings/device screens are separate consumers and remain unchanged.

The House hook loads on mount and reconnect, after local registry writes, and
every 30 seconds as recovery for external changes. A request generation
prevents late results from overwriting newer data; an authorized fingerprint
avoids React updates for unchanged topology. On disconnect or House failure,
the hook drops HA topology and keeps browser-local `custom:*` rooms. Errors
remain distinct from an empty topology. Rooms writes stay on HA registry
commands; temporary room/floor presentation changes reconcile on the next
House read. Settings Rooms uses the same client and refreshes after writes.

HOUSE.3B moves connected Rooms temperature and humidity to the canonical
Snapshot. HA 2025.1 uses a strict backend fallback when no Area reference
exists. HA 2026.2 Area references remain authoritative. The admin-only shadow
command compares the retired legacy selection with House and calls out unsafe
legacy fallbacks. See `house-environment-resolver.md` for candidate rules and
the real-installation QA handoff. No Climate file, House store or House write
API changes in this phase.
