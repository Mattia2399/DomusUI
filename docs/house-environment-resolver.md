# Canonical House environment resolution (HOUSE.3B)

`domusos/house/get_snapshot` now supplies the temperature and humidity shown
for HA rooms. Each metric includes `configuredPrimaryEntityId`,
`selectedEntityId`, `selectionSource`, `selectionReason`, `fallbackUsed`,
`safeFallbackEntityId`, `safeFallbackAvailable`, `available`, scalar value,
unit, timestamp and status. These are additive
fields in `domusos.house.v1`; topology still contains only registry facts and
the configured Area references. Snapshot `issues` contains runtime diagnostics.

## Selection

1. A configured HA Area reference always wins. Its identity stays selected
   through `missing`, `unknown` and `unavailable`; House does not silently
   display a different sensor. Known metric or unit mismatches suppress the
   value and generate a diagnostic issue. A primary assigned outside the room,
   unassigned, or missing from the entity registry also generates an issue.
2. Without a primary, House considers only readable `sensor.*` registry
   entries whose effective Area is the room and whose `device_class` exactly
   matches the metric. Disabled, hidden and categorized entities are excluded.
   Units and live `device_class` must also be compatible before displaying a
   value. Entity IDs, friendly names and units do not establish candidacy.
3. A sensor without a device needs an explicit entity Area assignment. A
   device-backed sensor needs a temperature/humidity pair on the same device
   in the room, and that device must expose no control domains. This rejects
   isolated equipment thermometers such as stove flame temperature. The rule
   intentionally favors a missing value over an uncertain one. A device that
   exposes both ambient metrics and a control is also excluded; the user can
   configure an explicit Area primary for it.

Candidates rank by explicit entity Area before inherited device Area, then
stable registry ID and entity ID. Current availability never changes the
chosen identity. A selected sensor becoming unavailable stays selected until
the registry topology changes. Multiple safe candidates generate a snapshot
diagnostic. Registry events rebuild the candidate index; state changes read a
new snapshot without rebuilding topology. `POLICY_READ` filters candidates
before each user snapshot. Candidate metadata stays backend-only.

HA 2025.1 has no native Area environmental refs, so the strict fallback is
used when it can establish a safe source. HA 2026.2.3 uses Area primary refs
when configured. Rooms requests a snapshot after topology updates and source
state changes. Demo and browser-local custom rooms remain local. The old Rooms
resolver is retained for local/offline presentation and shadow diagnostics;
it is not used to display environmental readings for connected HA rooms.

## Real installation QA

After installing this build, call the admin-only
`domusos/house/get_environment_shadow` command as described in
`house-environment-shadow.md`. Check Camera Mattia's two primary identities
and any provenance issues. Confirm the Cucina battery percentage, Giardino
flame temperature, and Soggiorno printer ink percentage appear as
`LEGACY_UNSAFE_FALLBACK_REJECTED` and are absent from the new Rooms header.
Only that real-house check can establish readiness for HOUSE.4.
