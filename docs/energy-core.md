# Domus Energy Core

Domus Energy Core is the read-only energy foundation inside the Domus UI Home
Assistant integration. It describes the energy hardware a home actually has,
normalizes its sensors, and exposes the result to the Domus context registry.
It runs inside the existing `domusos` integration: no cloud service, add-on,
extra process, or new Home Assistant component is involved.

Phase 1 is backend-only. It does **not** include an Energy dashboard,
configuration screens, decisions, automations, inverter or battery control,
or wallbox commands.

## Energy Profile

The profile lists only the modules that exist in the installation. Every
module is optional, and an absent module is simply not present: Domus never
creates a placeholder battery, wallbox, or solar module.

| Module    | Roles                                                         |
| --------- | ------------------------------------------------------------- |
| `grid`    | `import_power` + `export_power`, **or** signed `net_power`     |
| `solar`   | `production_power`                                            |
| `home`    | `consumption_power`                                           |
| `battery` | `state_of_charge`; `charge_power` + `discharge_power`, **or** signed `net_power` |
| `wallbox` | `charging_power`                                              |

Validation rules:

- every role references a `sensor.*` entity, and one sensor can fill only one
  role;
- a module needs at least one sensor (omit absent modules);
- a signed `net_power` sensor cannot be combined with directional power
  sensors in the same module;
- a signed sensor **must** declare its sign convention
  (`positive_import`/`positive_export` for the grid,
  `positive_discharge`/`positive_charge` for the battery). Domus never infers
  flow direction from an unverified sign.

The profile is stored in the Home Assistant Store document
`domusos.energy.v1` with an optimistic `revision`. Saving it applies the new
bindings in place. The config entry is not reloaded, so Irrigation sessions
are never interrupted. An invalid stored document disables Energy only, and
is logged and flagged with `load_error` until a valid profile is saved.

## Hardware conditions

Each module is in exactly one condition:

- **absent**: not part of the profile. It is listed in `absent_modules` and
  has no adapter.
- **offline**: configured, but no configured sensor currently provides valid
  data. It stays in the profile and in the context with `status: offline`.
- **online**: at least one configured sensor provides valid data.
  `complete: false` flags a partially available module.

Domus tracks the configured sensors and publishes
`energy.availability_changed` only when a module moves between online and
offline.

## Normalization

- Power is normalized to W from `mW`, `W`, `kW`, `MW`, `GW`, `TW`, and
  `BTU/h`. Unit symbols are matched exactly, because `mW` and `MW` differ by
  nine orders of magnitude.
- State of charge must use `%` and stay within 0–100.
- Cumulative energy (`Wh`, `kWh`, `J`, `energy` device class,
  `total`/`total_increasing` state class) is never accepted where power is
  expected.
- `unavailable`, `unknown`, and missing entities are `unavailable`.
  Non-numeric, non-finite, unit-less, unsupported, out-of-range, or
  unexpectedly negative values are `invalid`. Missing data is never turned
  into zero.

Every value carries a `status` (`ok`, `unavailable`, `invalid`,
`not_measured`) and a `source` (`measured` or `derived`). Canonical net power
follows the Home Assistant Energy convention: positive values flow into the
home (grid import, battery discharge). With a signed sensor, directional
flows are derived only through the declared convention.

### Home consumption

A dedicated `home.consumption_power` sensor is always reported as
`measured`. If that sensor is offline, consumption is `unavailable`; Domus
does not silently replace it.

Without a dedicated sensor, Domus derives

```text
grid net (positive = import) + solar production + battery net (positive = discharge)
```

only when the grid has complete flows and every configured solar and battery
module provides complete flows. A battery with only a state-of-charge sensor
therefore prevents the derivation. A negative result is reported as
`invalid` / `incoherent_balance` rather than clamped. The wallbox is behind
the meter, so a derived value includes its load.

## Assisted discovery

`EnergyDiscoveryService` proposes bindings and never saves a profile.

1. **Gates**: domain `sensor`, enabled entities, a compatible device class,
   unit, and state class. State attributes are read first, and registry
   metadata is used when an entity is unavailable.
2. **High confidence**: power sensors and sign conventions the user already
   assigned in the Home Assistant Energy dashboard.
3. **Medium confidence**: structural metadata. The sensor shares a device
   with a meter used by the Energy dashboard, or a state-of-charge sensor sits
   on energy hardware (a device that also exposes power or energy meters).
   For bidirectional modules, the role must be resolved.
4. **Low confidence**: translation keys and names only. These rank
   candidates but are never sufficient to suggest a binding. Diagnostic
   entities and `mobile_app` devices are always low confidence.

The result contains:

- `suggested_profile`: a valid draft built only from unique high or medium
  matches;
- `ambiguous`: ties, one sensor matching several roles, or net/directional
  conflicts;
- `requires_input`: signed sensors whose convention is not verified;
- `proposals`: ranked candidates with their evidence;
- `unassigned`: power sensors with no module evidence;
- `candidates`: metadata and a normalized preview;
- `ignored`: counts of cumulative, incompatible, or disabled sensors.

## Domus Core integration

- `EnergyModuleAdapter` implements `CapabilityAdapter` per configured module
  (`energy.grid`, `energy.solar`, `energy.home`, `energy.battery`,
  `energy.wallbox`).
- `EnergyContextProvider` (`energy`) is registered only while the profile is
  non-empty. Homes without energy hardware report `energy` as **missing** in a
  context snapshot.
- Energy starts after Calendar and Irrigation in an isolated block. Setup,
  provider, and unload failures are logged and never prevent the other Domus
  Core modules from running or unloading.

## WebSocket API (administrators only)

| Command                       | Purpose                                           |
| ----------------------------- | ------------------------------------------------- |
| `domusos/energy/discover`     | Return proposals; nothing is saved                |
| `domusos/energy/get_profile`  | Return the profile and the condition of each module |
| `domusos/energy/save_profile` | Save confirmed or corrected bindings (`profile`, `expected_revision`) |

Error codes are `invalid_profile`, `revision_conflict`, `energy_unavailable`,
and `unknown_error`. No context snapshot endpoint is exposed.
