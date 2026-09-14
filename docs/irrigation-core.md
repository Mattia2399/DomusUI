# Domus Core Irrigation

Domus Core Irrigation is the server-owned irrigation engine included in the
Domus UI Home Assistant integration. The browser is only a client: schedules,
queues, deadlines, safety checks, and actuator verification continue to run
inside Home Assistant when every Domus UI screen is closed.

This first Core release intentionally excludes pump control, flow monitoring,
weather-based adjustment, soil-based automatic adjustment, Cycle & Soak, and
robot lawn mower support. It follows conservative controller design principles
but is not an EPA WaterSense-certified controller.

## Supported actuators and safety limits

- Real zones accept only `valve.*` and `switch.*` entities.
- `input_boolean.*` is available only in the isolated Demo experience.
- Each cycle is bounded to 1–60 minutes; the configurable system maximum is
  constrained to 5–60 minutes.
- One concurrent zone is the safe default. A higher value is limited by the
  configured zones and requires an explicit hydraulic-capacity confirmation.
- An enabled but unavailable rain sensor blocks new cycles by default and
  immediately closes active zones, regardless of the selected rain policy.
- Rain can either stop active cycles immediately (default) or let active
  cycles finish; queued cycles are skipped in both cases.
- A failed close is retried, moves the engine to `fault`, and creates a
  persistent Home Assistant Repair issue.
- A fault cannot be cleared until all configured actuators report a closed or
  off state.

## Operating modes

| Mode | Behaviour |
| --- | --- |
| `enabled` | Schedules and manual commands may start; capacity uses a FIFO queue. |
| `paused` | Active zones are closed and retain their remaining time. Resume is explicit. |
| `stopped` | Active sessions and the queue are cancelled; schedules remain blocked. |
| `fault` | A safe close could not be proven; manual intervention is required. |

Cycles that mature while paused or stopped are recorded as skipped and are
never replayed. A local occurrence key prevents a repeated wall-clock time from
starting the same schedule twice during daylight-saving transitions.

After an integration reload or Home Assistant restart, Domus Core closes the
actuators associated with previously active sessions, records every visible
session as interrupted, clears the queue, and remains stopped. Interrupted
cycles are never resumed automatically.

## Home Assistant API

Authenticated WebSocket commands:

- `domusos/irrigation/get_config`
- `domusos/irrigation/save_config`
- `domusos/irrigation/get_state`
- `domusos/irrigation/subscribe`
- `domusos/irrigation/start_zone`
- `domusos/irrigation/stop_zone`
- `domusos/irrigation/pause`
- `domusos/irrigation/resume`
- `domusos/irrigation/stop_all`
- `domusos/irrigation/prepare_legacy_removal` (Owner/Admin)

Home Assistant actions expose the same manager and checks:

- `domusos.start_irrigation_zone`
- `domusos.stop_irrigation_zone`
- `domusos.pause_irrigation`
- `domusos.resume_irrigation`
- `domusos.stop_all_irrigation`

Configuration writes require an Owner/Admin. Operational commands re-check the
authenticated Home Assistant user's control permission for every associated
actuator; a global resume checks every enabled zone because it also enables
future schedules. Legacy migration remains restricted to Owner/Admin. Service
actions triggered internally by Home Assistant use their
normal HA context and the same manager state machine.

## Persistence and migration

The authoritative versioned store is `domusos.irrigation.v1`. Changes use an
optimistic revision, so one client cannot silently overwrite a newer update.
Manual request IDs are retained in the Store as a bounded idempotency ledger.
The local browser copy is only a display cache and Demo uses a separate key.

On first connection Domus UI can migrate the irrigation section from
`domusos.app-configurations.v1`. Before the Core scheduler is enabled, the
manager also detects only legacy automations carrying both known Domus UI
markers:

- an `irrigation_` unique ID;
- an `Irrigazione Smart:` name.

Those automations are turned off persistently and listed in Domus UI so an
Admin can review and delete them from Home Assistant. Earlier Core builds also
hid them through the entity registry; the migration guide now removes that
visibility flag, reloads the automation integration, and verifies they remain
off before opening the supported Automation editor. Domus UI no longer writes
the internal `/api/config/automation/config` endpoint.

## Important physical limitation

Software cannot close a valve while the Home Assistant host, its network, or
the actuator has no power. For unattended or damage-sensitive installations,
use normally closed valves and a device-level auto-off/watchdog that works
without Home Assistant. Validate the installation with the real valve, a real
switch, the rain sensor, a full browser close, an integration reload, and a
Home Assistant restart before relying on schedules.

## Verification

Frontend tests cover the Core client, migration path, Demo isolation, bridge
allow-list, and IT/EN/FR configuration UI. The dedicated Home Assistant test
workflow covers storage validation, optimistic revisions, permissions,
idempotency, confirmed open/close, FIFO queueing, rain policies, pause/resume,
stop, fault recovery, close watchdog, restart handling, and the WebSocket
subscription contract.

Hardware validation remains a release gate rather than an automated claim.
