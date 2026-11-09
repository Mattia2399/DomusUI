# Domus Climate — CLM.4A profiles and weekly schedules

CLM.4A stores user profiles and one weekly house schedule in the existing `domusos.climate.v1` HOUSE configuration. It adds no active-profile resolver, timer, intent write, or Home Assistant service command. CLM.3A preview and intent behavior remain unchanged even when control mode is `auto`.

## Contract

`profiles` is an array of `{id, name, zoneTargets}`. `id` is a stable machine ID; renaming changes only `name`. `zoneTargets` maps existing zone IDs to room-temperature targets from 5 to 40 °C. An absent mapping means no explicit target; no default temperature is inferred. The same target applies regardless of whether House Intent is heating or cooling. Profiles contain neither HVAC mode nor device/source preferences. A profile referenced by any schedule event cannot be removed: the parser returns `profile_in_use`.

`schedules` is the single house week, represented as up to seven `{day, events}` rows. Days use the locale-independent keys `monday` through `sunday`. Each event is `{time, profileId}`; `time` is canonical 24-hour `HH:MM`, including `00:00`, and represents the **house's local wall-clock time**, not UTC. The parser sorts days Monday to Sunday and events by time, rejects two events at the same time on one day with `duplicate_schedule_time`, and omits empty day rows from the canonical document. An empty week is valid. The editor can add an event to a selected group of days and copy one day to several others; it saves only the per-day form.

The existing `domusos/climate/get_config` and `save_config` APIs provide reads and atomic full-document writes. `save_config` requires `climate.manage` and an active HA administrator. `climate.control` applies only to CLM.3A intent commands and cannot save programs. The config revision uses `expected_revision`; a stale write is rejected, and an identical write leaves the revision and store unchanged. The frontend holds an explicit draft with Save and Cancel, warns on page unload when dirty, and displays conflict and access errors. No new store or dependency is introduced. Version 1 remains appropriate because the earlier Climate phases are unreleased and already reserved these fields.

The editor starts with empty profiles and schedule. It invents no automation. V1 has one weekly schedule, no holiday/calendar exceptions, no separate seasonal schedules, and no second enabled switch. [CLM.4B](domus-climate-auto-resolver.md) resolves events in the Home Assistant/house local time zone, including DST gaps and overlaps and the Sunday-to-Monday boundary; CLM.4A stores times without making those choices.

## Decisions C38–C47

- **C38:** Profiles are persistent HOUSE config in `domusos.climate.v1`.
- **C39:** Profile identity uses a stable ID, never the display name.
- **C40:** Profiles contain optional room-temperature targets by zone ID, not HVAC mode.
- **C41:** Profiles contain no device command or source strategy.
- **C42:** V1 has one weekly HOUSE schedule.
- **C43:** Schedule storage is canonical per day and ordered event.
- **C44:** Times are house-local wall-clock `HH:MM`, not UTC.
- **C45:** CLM.4A does not calculate the active profile or next event.
- **C46:** CLM.4A does not modify Climate Intent.
- **C47:** Schedule and profile edits use `climate.manage`, not `climate.control`.

## Validation boundary

Pure parser and draft tests cover CRUD, target and reference checks, ordering, duplicates, copying, midnight, and empty days. HA manager and direct WebSocket tests cover persistence, revision, authorization, and zero service calls; they require the Linux HA harness and remain queued for that environment. Local Windows validation does not substitute for those HA tests.
