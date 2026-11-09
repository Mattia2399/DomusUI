# Domus Climate — CLM.5 temporary zone overrides

CLM.5 lets a user choose a temporary **room target** for one zone while House Control is AUTO. It changes the read-only thermal decision preview, never a Home Assistant device, generator, circuit, profile, or weekly schedule. The backend is authoritative for target precedence and expiry. A physical TRV or AC change remains an observed mismatch of unknown cause; it does not create an override. Device-originated override attribution is a future extension point.

## State and precedence

Each zone has at most one override, keyed by `zoneId`. The persisted definition contains `id`, `zoneId`, `targetTemperature` (5–40 °C), `createdAt`, `expiresAt`, and `expiryMode`. Instants are canonical UTC ISO values. An override is active exactly while `now < expiresAt`; at equality it has expired. A new create request replaces the zone's previous override and gets a new ID, even for the same target and expiry. Clearing an absent override is a no-op. Writes use the climate state revision and `expected_revision`.

The order is **House OFF → Zone OFF → active override → active schedule target → no target**. OFF prevents thermal demand while retaining an unexpired override. AUTO → MANUAL cancels all overrides; MANUAL then uses the unchanged manual zone target. MANUAL → AUTO starts from the currently resolved schedule. An override may provide a temporary target when the active profile has no target or the whole week has no schedule. At expiry, the current schedule and profile are resolved again; the schedule present when the override was created is not cached as its fallback. House heating/cooling changes affect only the demand direction, not the override target. The existing 0.2 °C deadband remains.

The V1 `domusos.climate_state.v1` intent document accepts an optional `overrides` map, preserving compatibility with existing documents that have only `house` and `zones`. Climate config `domusos.climate.v1` is unchanged. `get_state` reports each zone's active `override`, `scheduledTarget`, `effectiveTarget`, `targetSource` and expiry detail. Runtime fields such as active status, remaining time, thermal status and scheduled target are never persisted. Missing or invalid stored override fields fail the state store closed as corrupt; an expired or orphaned zone override is ignored immediately and removed by controlled cleanup on startup, WebSocket read, timer callback, or config refresh. Cleanup increments the climate state revision when it writes.

## Expiry and timer

- `next_schedule_event` snapshots the **next real event occurrence** from CLM.4B as absolute UTC `expiresAt` at creation. Later schedule edits do not move that expiry. Without a resolvable next event, creation fails with `next_schedule_event_unavailable`.
- `duration` accepts 1–1440 minutes and adds that duration to the creation instant. It works without a schedule.
- `until_time` accepts `HH:MM` as the next future occurrence in the Home Assistant house timezone. It uses CLM.4B's DST rule: a spring gap moves forward by the gap; an autumn overlap uses the first occurrence on that date. If today's occurrence is past, tomorrow is selected. Invalid or missing house timezone fails closed.

All modes persist one absolute UTC expiry, at most seven days after creation. The Climate timer uses the earliest of the next schedule event and all active override expiries. It remains **one cancelable timer** for the whole Climate runtime, with no zone timers or minute polling. A callback recomputes from current time, removes expired definitions from the store and schedules the next boundary. A read also recomputes current time; the WebSocket read performs cleanup first. As in CLM.4B, a system clock jump with no event or read can defer the cleanup write until the existing timer fires, while a read never applies an expired target.

## API, access and UI

`domusos/climate/set_zone_override` takes `zone_id`, `target_temperature`, `expiry_mode`, `expected_revision`, and the matching `duration_minutes` or `until_time` when required. `domusos/climate/clear_zone_override` takes `zone_id` and `expected_revision`. Both are enforced as `climate.control` at the direct WebSocket boundary; `climate.manage` is not needed. `get_state` remains `climate.view`. Denial occurs before the handler and causes no revision or store change. No new read API exists. Audit uses the existing Climate logger with semantic create, clear, and expiry messages and no temperature payload.

The existing Climate cards show the effective temporary target, absolute local expiry and the scheduled target underneath. Controls offer next schedule change by default when available, 30 minutes, one hour, two hours, or a local `HH:MM`. When no next event is available, one hour is the default. The cancel action restores the current schedule immediately. View-only users see the override without controls; manual mode shows only manual target controls. No frontend countdown or browser timezone calculation is used.

Pure tests cover A–Q and T with fixed instants and fake timer. HA state and WebSocket tests for persistence, restart, revision and direct authorization passed in the [Linux HA validation](domus-climate-linux-validation.md). Physical execution still requires an adapter and separate validation.

## Decisions C59–C70

- **C59:** V1 supports temporary target overrides for individual zones only.
- **C60:** Override precedes schedule target but cannot override House or Zone OFF.
- **C61:** Override definitions belong to climate state, not HOUSE config.
- **C62:** One active override per zone; a new create replaces it.
- **C63:** Each override persists an absolute UTC expiry.
- **C64:** `next_schedule_event` expiry is frozen at creation.
- **C65:** Expiry resumes the schedule and profile valid at that time.
- **C66:** AUTO → MANUAL cancels overrides.
- **C67:** Override changes only environmental target, never House Mode or source strategy.
- **C68:** Override may supply a target where the active profile has none.
- **C69:** Physical device changes do not become overrides in CLM.5.
- **C70:** One Climate timer coordinates schedule events and override expiries.
