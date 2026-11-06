# Domus Climate — CLM.4B automatic target resolver

CLM.4B turns the saved weekly program into **derived runtime decisions** when House Intent uses `controlMode=auto`. It does not command a Home Assistant device, choose a generator, or create an override. Config remains in `domusos.climate.v1`; manual and house/zone intent remain in `domusos.climate_state.v1`. Active profile, next event, and effective targets are never persisted.

## Time and resolution

The backend reads `hass.config.time_zone`, using Home Assistant's already loaded timezone object when it matches. The pure resolver receives a timezone and an explicit aware instant. Missing or invalid timezone produces `timezone_unavailable` and no automatic target. Schedule `HH:MM` values are house-local wall times. For each event the resolver constructs occurrences in the previous, current, and next local week, then selects the latest occurrence at or before now and the earliest one after now. This covers days without events, before the first event, and Sunday-to-Monday wrap. An empty week produces `no_schedule`; a missing profile produces `profile_missing`; malformed runtime input produces `invalid_schedule`. None produces a target.

Python `zoneinfo` supplies real timezone transitions. During a spring gap, a nonexistent wall time moves forward by the gap: `02:30` in a one-hour gap occurs at `03:30` local. During autumn overlap, an event occurs at the **first** instance of its repeated wall time. At the second instance it is not applied again; active resolution follows real chronological occurrences, so it cannot roll back to an earlier profile. The next event contains a UTC `occursAt` for scheduling while `day` and `time` preserve the local program. This rule is deterministic and does not persist UTC in the weekly config.

The runtime reports `autoResolution` in the existing `get_state` preview: status, active profile ID/name, active event, next event, and per-zone target or `no_target`. Each zone keeps the existing numeric `effectiveTarget` for compatibility and adds `effectiveTargetDetail`, `targetSource`, `targetReason`, and `thermalReason`. Manual mode still uses the stored manual target. AUTO uses only the active profile target; a missing target never falls back to manual, a previous profile, or a default. Sensor absence is reported separately from target absence. Zone OFF and house OFF still prevent demand. The CLM.3A 0.2 °C deadband is unchanged.

## Updates and limits

One cancelable backend timer is scheduled for the next resolved event. Config saves, intent writes, relevant sensor changes, and HA's [`core_config_updated` event](https://www.home-assistant.io/docs/configuration/events/#core_config_updated) recompute immediately and replace the timer when its boundary changes. Restart reloads config and intent and creates a fresh timer. `get_state` recomputes on read, so a device waking from sleep or a system-clock jump observes current time; the timer callback also reads the current time instead of assuming precise delivery. A forward clock jump without another event or read may delay recomputation until the already scheduled monotonic timer fires; there is no portable wall-clock-jump event in this phase. There is no every-minute polling or per-zone timer.

The frontend displays backend-provided active profile, next change, and scheduled zone target in the existing Climate cards. It does not resolve the week itself. An open page refreshes on existing observed-state changes, intent writes, or a user reload; there is no new push subscription in CLM.4B. The backend always resolves current time on `get_state`.

Pure fixed-instant tests cover scenarios A–Q including DST and a fake-clock timer lifecycle. HA integration tests for boundary, config and timezone updates, persistence isolation and zero service calls are prepared for the Linux HA harness. That harness remains environment-blocked here; it is required before physical execution work.

## Decisions C48–C58

- **C48:** AUTO targets derive from the weekly schedule.
- **C49:** Home Assistant's house timezone is the source of truth.
- **C50:** Schedule times are local wall-clock times.
- **C51:** Active event is the latest real occurrence at or before now, with weekly wrap.
- **C52:** Empty days inherit the chronologically previous event.
- **C53:** A profile without a zone target yields no automatic target for that zone.
- **C54:** The manual target remains persisted during AUTO.
- **C55:** Active profile, next event, and scheduled effective targets are derived only.
- **C56:** Backend resolver is authoritative; frontend does not duplicate it.
- **C57:** CLM.4B sends no device commands.
- **C58:** The runtime uses one next-boundary timer, without periodic polling.
