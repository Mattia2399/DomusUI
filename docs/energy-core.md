# Domus Energy Core

Domus Energy Core is the read-only energy foundation inside the Domus UI Home
Assistant integration. It describes the energy hardware a home actually has,
normalizes its sensors, and exposes the result to the Domus context registry.
It runs inside the existing `domusos` integration: no cloud service, add-on,
extra process, or new Home Assistant component is involved.

Phase 1 added the backend. Phase 2 connects it to the existing Energy
subpage of Consumi (`/consumi/energia`) with guided setup. Domus Energy still
does **not** include history charts, decisions, automations, inverter or
battery control, or wallbox commands.

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

The profile has an optimistic `revision` and is stored as an Energy Profile v2
(see below); an existing `domusos.energy.v1` document is read and converted
until the first save. Saving applies the new bindings in place. The config
entry is not reloaded, so Irrigation sessions are never interrupted. An
invalid stored document disables Energy only, and is logged and flagged with
`load_error` until a valid profile is saved.

## Energy Profile v2

`energy/profile_v2.py` defines the stored profile. It describes each module as
devices plus an optional total:

```json
{
  "schema": "domusos-energy-profile",
  "version": 2,
  "revision": 4,
  "updated_at": "…",
  "migrated_from": { "version": 1, "revision": 4, "updated_at": "…" },
  "plant": {
    "solar": {
      "devices": [
        {
          "id": "solar-1",
          "name": "Tetto sud",
          "ha_device_id": null,
          "power": { "sensors": { "production_power": "sensor.inv1_power" } },
          "energy": { "production_energy": ["sensor.inv1_energy"] }
        },
        { "id": "solar-2", "name": null, "ha_device_id": null,
          "power": { "sensors": { "production_power": "sensor.inv2_power" } } }
      ],
      "total": { "power": { "sensors": { "production_power": "sensor.pv_total" } } }
    },
    "battery": {
      "devices": [
        { "id": "battery-1", "name": null, "ha_device_id": null,
          "capacity": { "nominal_kwh": 10, "usable_kwh": 9.5 },
          "power": { "sensors": { "state_of_charge": "sensor.soc", "net_power": "sensor.bat" },
                     "sign_convention": "positive_discharge" } }
      ]
    }
  },
  "tariff": null,
  "retired_device_ids": ["solar-3"]
}
```

- **Power** sensors per device follow exactly the v1 module rules (roles,
  `sensor.*`, signed wiring and sign convention).
- **Energy** meters are lists of Home Assistant statistic ids, `sensor.*` or
  external (`source:id`), whose sum is the role: `grid.import_energy` /
  `export_energy`, `solar.production_energy`, `home.consumption_energy`,
  `battery.charge_energy` / `discharge_energy`, `wallbox.charging_energy`. A
  plant without meters is valid; no energy is ever derived from power.
- **Devices** have stable ids (lowercase, starting with a letter, unique in
  the plant), an optional name and Home Assistant device id; only batteries
  declare a capacity, keeping nominal and usable values apart.
- **Total**: a source that already covers all devices of the module; it
  needs at least two devices and is never added to them.
- Every sensor and statistic id is used once across devices, totals, power
  and energy.
- **Ids are never regenerated.** Renaming a device keeps its id. Removing it
  records the id in `retired_device_ids` (server-managed, at most 512), and a
  later save cannot give that id to another device, so history and future
  references never point at the wrong device. The converted v1 ids
  (`<module>-1`) are the exception: a v1 save can only express "the module's
  device", so removing a module and adding it back keeps `<module>-1`.

**From v1.** `upgrade_v1` converts in memory, deterministically: each module
becomes the device `<module>-1` with the same sensors and sign convention;
revision, timestamp and tariff carry over and `migrated_from` records the
source. `load_profile_document` reads either version and is idempotent.

**v1 clients.** A v2 profile has a v1 view (`lossless_v1`) only when v1 can
hold all of it: one device per module with the converted id, no name, Home
Assistant device, capacity, energy meter or total. A v1 save may replace a
profile only in that case (`v1_save_allowed`); otherwise it would drop data
and is refused with `profile_requires_v2`.

### Storage and migration

| Stored documents                    | Loaded profile                                                    | Writes on load |
| ----------------------------------- | ----------------------------------------------------------------- | -------------- |
| none                                | empty, `configured: false`                                       | none           |
| `domusos.energy.v1` only            | `upgrade_v1` in memory, `migrated_from` set                       | none           |
| valid `domusos.energy.v2`           | v2, authoritative; v1 is never read into it                       | none           |
| invalid `domusos.energy.v2`         | empty, `load_error`; **no fallback to v1**                        | none           |
| invalid v1 only                     | empty, `load_error`                                               | none           |

- **First write.** Only an explicit administrator save writes, and only to
  `domusos.energy.v2`: the revision is checked, the whole profile validated,
  the revision incremented, and `migrated_from`, tariff, sign conventions and
  device ids carried over. `domusos.energy.v1` is never written again and stays
  byte for byte the pre-migration snapshot. Other applications' Stores are not
  touched.
- **Revisions** continue across the migration (v1 revision 6 → v2 revision 7),
  so a client still holding the v1 revision gets a normal conflict. With an
  unreadable document, the highest revision it still declares is kept for the
  same reason.
- **Unreadable v2.** It is never overwritten on load. The next explicit save
  first copies it to `domusos.energy.v2.rejected`, then writes the new
  profile. A file Home Assistant cannot decode at all is moved by Home
  Assistant to `domusos.energy.v2.corrupt.<time>` (with a repair issue); Domus
  treats that copy as an unreadable v2, so Energy stays disabled with
  `load_error` instead of returning to v1. The same applies to an undecodable
  `domusos.energy.v1`.
- **Saves** run under a lock and either complete or change nothing: a failed
  write leaves the stored document and the live profile as they were, and
  readers see the previous profile until the write has finished.
- **Realtime.** Every device is served live and combined per module (see
  [Several devices per module](#several-devices-per-module)). For every
  profile v1 can express, `get_state` is unchanged apart from additive fields.

**Rollback.** Going back to a version that only knows v1 is safe: it reads the
frozen `domusos.energy.v1` and ignores `domusos.energy.v2`. That snapshot does
**not** contain anything saved after the migration; the previous version shows
the installation as it was configured before the first v2 save. If it saves,
it writes v1 only. Upgrading again keeps v2 authoritative and never merges the
v1 edit: `get_profile` reports `legacy_v1.diverged: true` and the change is
logged, so the user can repeat it in the v2 configuration. A v2 document
written without a migration also reports any later v1 document as diverged.

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
- `unavailable`, `unknown`, and missing entities are `unavailable`, with the
  reasons `state_unavailable`, `state_unknown` and `entity_missing`.
  Non-numeric, non-finite, unit-less, unsupported, out-of-range, or
  unexpectedly negative values are `invalid`. Missing data is never turned
  into zero.
- Solar production between −50 W and 0 W reads 0 W: inverters report a few
  watts below zero at night (standby draw, offset). Anything lower stays
  `invalid` / `unexpected_negative`, so a reversed sign or wiring error is
  never hidden. The tolerance is `NEGATIVE_NOISE_TOLERANCE_W` in
  `normalization.py` and applies only to roles that declare `negative_noise`
  (today `solar.production_power`).

### Freshness

Every valid value also says whether its integration is still reporting it:

- `fresh` while Home Assistant's `last_reported` is recent enough. That
  timestamp moves on every write, an unchanged value included, so a polling
  integration never trips the check.
- `stale` after 30 minutes for power and 3 hours for state of charge
  (`STALE_AFTER` in `normalization.py`). The windows are deliberately
  generous because some integrations only report on change and a steady load
  may stay silent for a while. A stale value is kept and labelled, never
  turned into zero or unavailable.
- No freshness at all (`null`) for `unavailable`, `unknown` or invalid states.

Quantities carry `freshness`, `reported_at` (the oldest report behind the
value) and, when measured, `stale_after` in seconds. Each module carries a
`freshness` summary, stale as soon as one of its valid sensors is stale, and a
derived value follows its stalest term. The fields are additive: older
clients ignore them. A per-entity window learned from each sensor's own
reporting rhythm is possible later without changing the contract.

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
therefore prevents the derivation. Sensors are sampled at slightly different
instants and rounded by their integrations, so a deficit up to 50 W or 2% of
the absolute terms, whichever is larger, reads 0 W (`BALANCE_TOLERANCE_W` and
`BALANCE_TOLERANCE_RATIO` in `adapter.py`). A larger deficit is reported as
`invalid` / `incoherent_balance` rather than clamped. The wallbox is behind
the meter, so a derived value includes its load. A solar or battery module
installed without any realtime power sensor (energy meters only) also
prevents the derivation, since the balance would leave it out.

### Several devices per module

Each device of an Energy Profile v2 is read by its own `DeviceAdapter`, which
applies the module adapter above unchanged: units, sign conventions, real
zeros, the −50 W night tolerance, freshness, and unavailable or unknown
states work per device exactly as for a v1 module. A `ModuleAggregator`
(`energy/aggregation.py`) then gives the module its canonical quantities:

| Module plan | Module quantity |
| --- | --- |
| one device, no total | the device's value, identical to a v1 module (`origin: "device"`) |
| several devices | the sum of the devices (`origin: "devices_sum"`, `source: "derived"`) only when every device provides a valid value |
| a total | the total, for every quantity it measures (`origin: "total"`); never added to the devices |
| batteries, state of charge | capacity-weighted average of every battery (see below) |

- **Partial data.** When some devices have no valid value, the quantity is
  not valid (`status` of the worst device, `value: null`,
  `reason: "partial_devices"`); the sum of the others is kept in
  `partial_value` and `coverage: {contributing, configured}` says how many
  contribute. A partial value is not the total, and for signed quantities
  (grid and battery net power) it is not even a lower bound. When no device
  contributes, the A0 reason (`source_unavailable`, `source_invalid`) stays.
  A device with energy meters only has no realtime power and is never counted
  as 0 W: the module quantity is then `not_measured` with the same partial
  fields.
- **Totals.** A total is authoritative for the quantities it measures and is
  independent from the devices: an offline device does not affect it. When the
  total itself is unavailable or invalid, the quantity says so
  (`total_unavailable` / `total_invalid`) and Domus does **not** fall back to
  the sum of the devices; the devices stay valid in the detail. Quantities the
  total does not measure (for example the state of charge next to a battery
  total power) come from the devices.
- **Signs.** Every device value is already canonical (positive into the home),
  so batteries or grid meters with different sign conventions add up
  directly: discharge counts towards the home, charge against it. Import and
  export are the sums of each meter's own import and export.
- **State of charge.** With several batteries the module value is the average
  weighted by usable capacity when every battery declares it
  (`devices_weighted_usable`), else by nominal capacity when every battery
  declares that (`devices_weighted_nominal`); the two are never mixed. If a
  capacity is missing, it is `not_measured` / `capacity_unknown`, and if a
  battery has no valid value it is not shown, not even as partial. Each
  battery's own value stays in the detail. No stored energy or remaining
  autonomy is computed.
- **Wallboxes** are summed like any device and, being behind the meter, never
  added to the home consumption a second time.
- **Module condition.** A module is online when any of its sensors (devices
  or total) is valid, `complete` only when all of them are, and `freshness`
  is stale as soon as one valid sensor is stale. `sign_convention` is set only
  when every signed source agrees; each device reports its own.
- **Home balance.** The formula and tolerances above are applied to the
  aggregated module values, so a partial module prevents the derivation. A
  dedicated home meter, single or summed, keeps its precedence, with no
  fallback to the balance.
- **Modules without realtime sensors.** A module whose devices and total have
  energy meters only is listed in `unsupported_modules` with
  `no_power_sensors`, not in `modules` and not as absent, until history support
  can show it.

Each sensor is read once per projection, and a state change re-reads only the
module that owns the sensor, so 16 devices per module cost one pass.

## Energy meters

POWER and ENERGY stay separate. Power sensors (W) feed the live values above;
energy meters (`device.energy` and `total.energy`, Wh/kWh/MWh...) are Home
Assistant long-term statistics kept for the history and never enter the live
balance. A device with meters only has no live power, never 0 W.

`energy/meters.py` checks each statistic id against Home Assistant, read-only,
with the official Recorder API (`recorder.statistics.get_metadata`, then
`list_statistic_ids` for the ids without metadata, in one Recorder executor
job per request). Statuses are computed when asked (`get_profile`,
`save_profile`) and never stored in the profile, because they change on their
own in Home Assistant; nothing is polled.

| Status | Meaning |
| --- | --- |
| `valid` | Long-term statistics with a sum in an energy unit |
| `pending` | Recorded and suitable, but not compiled yet (`awaiting_first_statistics`): a new meter is never treated as invalid |
| `unavailable` | Statistics exist but the entity is gone or not reporting (`entity_missing`, `state_unavailable`, `state_unknown`), or a sensor that cannot be checked while unavailable |
| `incompatible` | Verifiably not an energy meter: `incompatible_device_class` (power, temperature, `energy_storage`...), `not_energy_unit` (W, °C...), `unit_missing`, `no_state_class`, `no_sum` (`measurement`), `not_recorded` (excluded from the Recorder) |
| `unknown` | Neither the Recorder nor Home Assistant knows the id (`not_found`), e.g. an entity or external statistic that does not exist yet |
| `recorder_unavailable` | The Recorder is not loaded, migrating or not ready; or, right after a start, the sensor platform is not registered yet (`recorder_starting`) and a meter would only look unrecorded: nothing more can be verified now |

- **Saving.** A save refuses only the meters it adds that are `incompatible`,
  with `invalid_profile` and the reason (`sensor.x cannot be an energy meter
  (not_energy_unit)`). `pending`, `unknown`, `unavailable` and
  `recorder_unavailable` are saved and reported, so a temporary condition never
  blocks or corrupts the profile, and a meter that turns incompatible later
  does not block unrelated edits. Without the Recorder, what an entity declares
  is still enough to refuse a power or temperature sensor. A profile with power
  sensors only never queries the Recorder.
- **External statistics** (`source:id`, e.g. `opower:energy`) have no entity;
  they are `valid` when the Recorder has them with a sum, else `unknown`.
- **Units.** Every Home Assistant energy unit is accepted (`EnergyConverter`:
  Wh, kWh, MWh, mWh, GWh, TWh, J, kJ, MJ, GJ and calories). `energy_to_kwh`
  normalizes to kWh with Home Assistant's converter, keeps 0 as 0, removes
  float noise, and refuses power units, unknown units and a missing unit.
- **Several meters.** Statistics listed together in one role are summed, for
  example F1, F2, F3; they are flagged `multiple_parts` because only the user
  can confirm they are disjoint. Each statistic id may appear only once in the
  whole profile, power sensors included.
- **Plan.** `energy_meter_plan` states how each module energy role will be
  obtained, with the rules of the live aggregation: a total is authoritative
  and never added to the devices (`total_with_devices`); otherwise the devices
  are summed, and a device without the meter makes the sum partial
  (`devices_without_meter`, `coverage`, `complete: false`) instead of counting
  as 0 kWh.

Home Assistant semantics, verified on 2025.1 and 2026.2.3 with the real
Recorder (`tests_python/test_energy_meters.py`):

- metadata exists only after the first statistics compilation (every 5
  minutes); until then only the sensor recorder platform lists the meter;
- `sum` accumulates changes and survives resets: a `total_increasing` drop
  below 90% restarts from 0, a new `last_reset` starts a new `total` cycle;
- `state` is the raw meter reading, unusable across resets;
- `change` is the difference of `sum` over a period; a unit change within the
  energy class is converted by Home Assistant, and `units={"energy": "kWh"}`
  returns kWh;
- a period without data has no row, which is not 0.

The history (A2) will therefore read `change` with `units={"energy": "kWh"}`
(`HISTORY_STATISTIC_TYPE`, `HISTORY_UNITS`), following the plan. The only
difference found between the two versions is the metadata format (2026.2 adds
`mean_type` and `unit_class`, and deprecates `has_mean`); Domus reads only
`has_sum`, `source` and the unit, which both provide.

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

### Discovery v2: devices and energy meters

The same command adds `v2`, a proposal in the shape of an Energy Profile v2
(`plant → modules → devices[]`). It reuses the evidence and confidence levels
above (`discovery_plant.py`); nothing is saved, the profile and the Stores are
only read, and a high confidence is a suggestion, never an authorized
configuration.

**Sources, by reliability.**

1. The Energy dashboard: grid `flow_from` / `flow_to`, solar and battery
   sources, and individual consumers. One solar or battery entry is one
   physical source, so its statistics belong to the same device. Home
   Assistant 2025.1 stores energy statistics only; 2026.2 adds `stat_rate` and
   `power_config` (power) to the same entries and `stat_rate` /
   `included_in_stat` to consumers. Every field is optional. The dashboard is
   evidence of configuration, not proof that a sensor still works.
2. The device and entity registries: sensors are grouped by Home Assistant
   device, per module. A device that serves several flows (a hybrid
   inverter) gives one proposal per module.
3. Metadata: device class, unit and state class are hard gates. Power (W, kW)
   is never proposed as a meter and a meter (kWh, `total`/`total_increasing`)
   never as power.
4. Words in names and translation keys, as `low` confidence only. Among the
   modules a device already shows, a sensor's own words can confirm one,
   never add another.

**Meters.** A meter of the dashboard is `high`. A meter on the Home Assistant
device of a module's power sensors is `medium` when its module is clear and,
for grid and battery, its direction is named (import/export, charge/
discharge). Anything else is `low`. Every proposed meter is checked once
with `EnergyMeterResolver` (one Recorder read for the whole discovery), and
its A1.4 status is reported. `incompatible` and `unknown` meters are never
suggested. `pending` and not yet verifiable meters are kept, with a warning.

**Several meters for one role.**

- The parts the Energy dashboard sums (e.g. F1/F2/F3 grid imports) are
  parts; any other meter for that role is a `possible_overlap`.
- Without the dashboard, tariff bands alone (`f1`, `f2`, `f3`, `tariff`,
  `peak`…) are proposed as parts, with `parts_disjointness_unconfirmed`.
- Bands next to a plain meter give a `total_or_bands` choice, and two plain
  meters give `multiple_candidates`.
- A meter that restarts every period ("today") gives way to a lifetime one,
  reported as `alternative_meters`.

The same applies to power: several candidates for one role on one device
(MPPT strings and the inverter total) are a choice, never picked by name.

**Totals.** A module total is `verified` only when Home Assistant computes it
from the devices: a `group` helper of type `sum` whose members are the
devices' sensors. It is then proposed as `total` and never as a device.

- A group of unknown type, or a sensor without a device whose name says
  "total"/"plant"/"impianto"…, is `presumed`. It is reported, and never used
  or summed.
- A sensor without a device next to device sensors is
  `membership_undetermined`: it could be one more device or their total.
- When a module has a single device, its meters without a device are that
  device's meters.

**Existing profiles.** Discovery reads the current profile, v1 or v2, and
changes nothing.

- Detected devices are matched by Home Assistant device or by shared sensors:
  - `configured`: nothing new;
  - `update`: `additions` (a new meter or role) and `corrections` (a
    different sensor or sign convention), both to confirm;
  - `new`;
  - `conflict`: the device matches several configured devices.
- Configured devices that were not detected are listed with
  `detected: false`.
- A sensor already used by another configured device is not proposed again.
- `suggested_plant` is the current plant unchanged plus the new devices that
  need no choice, with ids never used before (retired ids included). New
  devices are not added to a module whose configured total might not cover
  them (`total_coverage_unknown`).
- Names, capacities and sign conventions are never invented: a capacity is
  left unknown, and a signed sensor without a verified convention
  `requires` it.

**Recorder.** Until the Recorder is running with the sensor platform loaded,
`verification` is `incomplete`. A meter that might only be not registered
yet is `recorder_unavailable` / `recorder_starting`, never `incompatible`.
Running the discovery again verifies again; nothing is polled.

| `v2` field | Content |
| --- | --- |
| `profile` | `{configured, revision, load_error}` of the current profile |
| `verification`, `recorder` | `complete`/`incomplete`, `available`/`unavailable` |
| `devices[]` | Each with the fields below |
| `devices[].key`, `module`, `status` | Stable proposal key; `new`, `configured`, `update` or `conflict` |
| `devices[].device_id` | Configured id, or the id suggested for a new device |
| `devices[].ha_device_id`, `name`, `integration` | From the device registry, never made up |
| `devices[].confidence`, `eligible` | Strongest evidence; whether the device enters `suggested_plant` |
| `devices[].power[]` | `{role, entity_id, confidence, evidence, sign_convention, requires}` |
| `devices[].energy[]` | `{role, statistic_ids, confidence, evidence, statuses}` |
| `devices[].additions`, `corrections`, `warnings` | Changes to confirm, and what to look at |
| `totals[]` | `{module, kind, role, ids, status: verified/presumed/configured, covers, evidence}` |
| `meters` | A1.4 status of every proposed statistic id, external ones included (`source:id`, no device) |
| `ambiguous[]` | `{module, role, entity_ids, reason}`: `multiple_candidates`, `total_or_bands`, `presumed_total`, `partial_aggregate`, `membership_undetermined`, `net_and_directional_conflict`, `entity_matches_multiple_roles`, `module_unresolved`, `role_unresolved`, `matches_several_configured_devices`, `total_coverage_unknown`, `invalid_combination`, `too_many_devices` |
| `suggested_plant` | A valid v2 `plant`, or `null` when there is nothing new to suggest |
| `low_confidence` | Loose name-only matches without a device (at most 100) |

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

## Electricity tariff

The profile may carry an optional `tariff`, used to show the current band and
price. Costs are not computed yet because they need the energy history.

```json
{
  "scheme": "three_band",
  "prices": { "f1": 0.31, "f2": 0.27, "f3": 0.22 },
  "fixed_monthly": 9.5,
  "vat_percent": 10,
  "export_price": 0.09
}
```

| Scheme       | Price keys     |
| ------------ | -------------- |
| `single`     | `single`       |
| `two_band`   | `f1`, `f23`    |
| `three_band` | `f1`, `f2`, `f3` |

- Prices are in €/kWh (0 to 10). `fixed_monthly` (€/month, 0 to 10000),
  `vat_percent` (0 to 100) and `export_price` (€/kWh) are optional and may be
  `null`. Unknown keys are rejected.
- Bands follow the ARERA hours in Home Assistant local time: F1 Monday to
  Friday 8 to 19; F2 Monday to Friday 7 to 8 and 19 to 23, Saturday 7 to 23;
  F3 nights 23 to 7, Sundays and national holidays (fixed dates plus Easter
  Monday). A two-band tariff merges F2 and F3 into F23.
- `save_profile` without a `tariff` key keeps the stored tariff, so saving the
  plant never drops it; `"tariff": null` removes it.
- `get_state` adds `tariff`: `{scheme, band, band_label, price, export_price,
  currency}` for the current moment, or `null` without a tariff.

## WebSocket API

| Command                       | Access         | Purpose                                           |
| ----------------------------- | -------------- | ------------------------------------------------- |
| `domusos/energy/get_state`    | Authenticated  | Normalized values of configured modules, absent/offline modules, home consumption |
| `domusos/energy/discover`     | Administrators | Return proposals, A0 draft and `v2` devices; nothing is saved |
| `domusos/energy/get_profile`  | Administrators | Return the profile and the condition of each module |
| `domusos/energy/save_profile` | Administrators | Save confirmed or corrected bindings (`profile` **or** `profile_v2`, `expected_revision`) |

`get_state` returns the same projection as `EnergyContextProvider` and no
configuration beyond the device ids and names that tell devices apart.
Without a profile it reports `configured: false` and lists every module as
absent. Since multi-device support the fields below are added; every A0 field
keeps its meaning and format, so module totals read exactly as before:

| Field | Content |
| --- | --- |
| `modules.<m>.quantities.<q>.origin` | `device`, `devices_sum`, `devices_weighted_usable`, `devices_weighted_nominal`, `total`, or `null` when nothing measures it |
| `modules.<m>.quantities.<q>.partial_value` | Sum of the devices that do provide a value, only when some do not |
| `modules.<m>.quantities.<q>.coverage` | `{contributing, configured}` devices, or `null` for a total |
| `modules.<m>.devices[]` | `device_id`, `name`, `status` (`online`, `offline`, `not_measured`), `complete`, `freshness`, `sign_convention`, `reason`, `quantities` (A0 format) |
| `modules.<m>.total` | Same detail for the total source, or `null` |
| `unsupported_modules` | `{module: "no_power_sensors"}` for installed modules without realtime sensors |

The new reasons are `partial_devices`, `total_unavailable`, `total_invalid`,
`capacity_unknown` and `no_power_sensors`. Error codes are `invalid_profile`,
`revision_conflict`, `profile_requires_v2`, `energy_unavailable`,
`unauthorized`, and `unknown_error`. The generic Domus context registry
remains internal. The live `tariff` also carries `vat_percent`, the rate the
prices exclude.

`get_profile` and `save_profile` return:

| Field          | Content                                                                  |
| -------------- | ------------------------------------------------------------------------ |
| `profile`      | The v1 view with `load_error`, exactly as before, or `null` when v1 cannot hold the profile |
| `profile_v2`   | The full v2 document with `load_error`                                   |
| `v1_compatible`| Whether `profile` is present and a v1 save is accepted                   |
| `runtime`      | `{supported, reason, unsupported_modules}`: whether `get_state` can show every module live |
| `legacy_v1`    | `{valid, revision, updated_at, diverged}` of the frozen v1 document, or `null` |
| `module_status`| Condition of each module, as before                                      |
| `energy_meters`| `{recorder, verification, meters, plan}`: `recorder` is `available` or `unavailable`, `verification` is `incomplete` while Home Assistant or the Recorder is still starting, `meters` the status of each statistic id, `plan` how each module energy role is obtained (see [Energy meters](#energy-meters)) |

No field changes meaning between versions: v1 clients read `profile` and send
`profile` (the `modules` and optional `tariff` of v1); v2 clients send
`profile_v2` (the whole `plant`, optional `tariff`). Sending both, or neither,
is `invalid_profile`, and so is a `profile_v2` without `plant`, so a partial
save cannot erase devices. A missing `tariff` keeps the stored tariff.
Clients from before v2 reject a `null` `profile` as an invalid response
instead of reading it as an empty installation; the current client reads it,
next to `profile_v2`, as a configured plant that v1 cannot hold. Both halves
of the panel bridge forward either save shape, exactly: `profile` with
`modules` (at most 20,000 characters) or `profile_v2` with `plant` (at most
131,072, room for 16 devices per module with their meters), never both,
always with `expected_revision`.

## Energy subpage

The canonical route is `/consumi/energia`, inside the existing Consumi
section; no new route exists.

- **Display**: every value comes only from `get_state`. Only configured
  modules appear, offline modules stay visible without values, absent modules
  leave no gap, and each value is labelled *Misurato* or *Derivato*. The page
  refreshes the projection at most every 1.5 s when a bound sensor changes in
  the Home Assistant state stream it already receives. No state change
  announces that a value went stale, so it also reads the projection again
  when the first fresh value would expire (timed on the server clock) and
  every minute while something is stale.
- **Stale data** keeps its last value: the tile and the details say
  *Non aggiornato da 35 min* and the hero shows *Dati non aggiornati*.
- **Several devices** (from `get_state`, never summed, averaged or completed
  in the browser). A module with one device looks exactly as before. With
  several devices or a total sensor, the component details add *Dispositivi*:
  the total sensor first, then each device with its name (or *Fotovoltaico 2*),
  value, state (offline, not updated, energy meters only) and, opened, its own
  sensors and sign convention. The module values are listed as *Valori del
  modulo* and say where they come from: *Misurato*, *Derivato*, *Somma di N
  dispositivi*, *Media pesata sulla capacità utilizzabile/nominale*,
  *Misurato dal sensore totale*. A module convention is shown only when the
  backend reports one.
  - *Partial*: when some devices do not report, the module value stays
    missing (*Non tutti i dispositivi rispondono · 2 di 3*; the tile says
    *2 di 3 dispositivi*) and the sum of the others is a separate line,
    *Dai dispositivi disponibili · 3,5 kW · 2 di 3*. Signed flows give a
    direction (*in carica 1,2 kW*), never a bound.
  - *Totals*: a valid total stays the module value when a device is offline;
    the details say *dettaglio dei dispositivi incompleto* and the hero does
    not report partial data. An unavailable total says so, with no fallback.
  - *Batteries*: the charge level is the backend's capacity-weighted average,
    or *Totale non calcolabile* with each battery's level in the detail.
  - Modules with energy meters only are named in a note, never shown as 0 W.
  - Every device and total sensor refreshes the projection, through the same
    single state stream.
- **Layout** mirrors the Irrigation overview structure:
  - *Mobile*: the page header floats over a full-bleed, sticky house hero; the
    cards ride up on a rounded sheet (`-mt-28`) that turns opaque while
    scrolling, with the same parallax and darkening driven by
    `--energy-scroll-progress` (scroll / 220 px). Reduced motion keeps it
    static.
  - *Desktop*: the sheet becomes `display: contents`, so every card joins the
    12-column grid (`md:gap-5`, `md:px-6` to `xl:px-10`): the hero spans 8
    columns and two rows, beside the component tiles and *Analisi* (4 each,
    with dense placement), and *Andamento* takes the full width below.
  - *Impostazioni* (administrators) lives in the page header, like
    Irrigation's configure action. Without a profile the page offers the
    guided setup instead.
  1. *House hero*: the home consumption under the heading *Consumo della
     casa*, how it is obtained in plain words (*Misurato dal sensore della
     casa* or *Calcolato da rete, fotovoltaico e batteria*), and on the right
     a column with a coloured dot and the live share of each supply
     (photovoltaic, battery discharge, grid import). Exports and battery
     charging draw on the same supplies, so each feeds the home in proportion;
     shares add up to 100 and the column is hidden when a source is unknown or
     there is only the grid. Then the 3D house of the configured hardware with value callouts and animated
     flows. A status badge appears only for partial data or offline sensors;
     the grid exchange lives in its tile.
  2. *Components*: a compact tile per configured module (value, one status
     line, charge bar for the battery); home consumption lives in the hero.
     Two columns on phones (an odd last tile takes the whole row), one row on
     tablets, two by two beside the house on desktop. Rows stop at 11.5rem so a small plant does not
     stretch them to the hero height.
  3. *Andamento*: 24 h / 7 d / 30 d selector, the series available for this
     installation, daily summary slots and an explicit empty state.
  4. *Analisi*: the current tariff band and price, then self-consumption,
     self-sufficiency, costs, savings and comparisons, listed only when
     relevant and marked as not configured or waiting for history.
  5. *Component details*: every tile, and the arrow next to *Consumo della
     casa*, opens a sheet (bottom sheet on phones, centred dialog from
     `sm`) with the live figures, the paths of its power (only those
     carrying at least 10 W), the current band and hourly cost estimate for
     the grid (energy price plus the tariff's VAT; the fixed fee has no hourly
     meaning and is left out), the last 24 hours
     when history exists, and its sensors with entities, origin, sign
     convention and unavailability reasons. Administrators get *Modifica
     sensori*, which opens the settings with that module's editor open.
- **Calculated or estimated**: meters give totals, not paths. The hero's
  source split and the details' flows are *calcolati* whenever one supply or
  one destination besides the home is involved. They are only an estimate,
  shown with "≈" in the hero, "Stima · percorsi non misurabili" and
  *Flussi · stimati* in the details, when solar and the grid both feed while
  the battery charges, when solar and the battery both feed while power is
  exported, and for the wallbox mix whenever more than one source supplies
  the home.
- **House renders** (`public/images/energy/mobile/`) are chosen from the
  configured hardware only, online or offline, and only one is downloaded.
  Each PNG has AVIF and WebP copies (8–22 KB instead of 480–626 KB, made by
  `scripts/optimize-energy-renders.py`); the page picks AVIF, then WebP,
  then the PNG, and a failed compressed copy retries the PNG before the
  schematic takes over:

  | Configured hardware | Render |
  | --- | --- |
  | Grid | `grid-only.png` |
  | Grid + solar | `grid-solar.png` |
  | Grid + solar + battery | `grid-solar-battery.png` |
  | Grid + solar + battery + wallbox | `grid-solar-battery-ev.png` |
  | Grid + battery | `grid-solar-battery-night.png` (the file shows no panels) |

  Every other combination uses the schematic fallback drawn by the same flow
  renderer, so no render ever shows hardware that is not installed. No night
  variant is used: the only night render lacks solar panels, and day or night
  would have to come from a reliable source such as `sun.sun`, not from zero
  production.
- **Flows** follow a route of their own on each render, so hardware that sits
  close together on the wall does not pile up: the grid from the street edge
  of the plot to the meter, solar from the roof into the house, the battery
  into the wall conduit and the wallbox along its cable to the car. Routes run
  towards the home and outbound flows travel them backwards. They only
  animate for an online module with a known, non-zero direction. Without a
  per-path split from the backend, solar-to-battery or solar-to-grid paths
  are not invented. `prefers-reduced-motion` keeps the lines static.
- **States**: no Home Assistant connection, outdated integration or bridge,
  failed refresh, and no profile. The isolated Demo keeps its existing gate
  on Consumi, so no energy sample is shown there.
- **Guided setup** (administrators, loaded on demand) takes the whole detail
  area with its own header and close button (also Escape) and keeps its
  actions pinned to the bottom. The first setup runs in six steps;
  re-detection skips the tariff and runs in five:
  1. Detection: on a first setup where discovery preselected a plant, a
     summary with its illustration, the number of matched entities, the
     components it includes and their sensors. A complete plant can be
     confirmed directly (*Conferma impianto* skips to the next step after
     the bindings); pending sign conventions and ambiguous matches are listed
     and lead to the bindings. Otherwise, a per-module summary of what
     `discover` found.
  2. Plant type: illustrated tiles, one per grid-connected combination of
     solar, battery and wallbox, drawn as a house with only that hardware,
     plus *Altro* for off-grid or partial metering. A tile sets which modules
     exist; drafts that fit no tile open on *Altro*.
  3. Bindings: a summary of the chosen type with *Cambia*, then only the
     sensors that type needs, with the home meter optional (*Altro* keeps
     *Configura* or *Rimuovi* per module): directional or signed wiring,
     suggested or manual sensors, an explicit sign convention for signed
     sensors, and an offline flag for saved modules.
  4. Tariff (first setup only, optional): the same fields as the settings
     page. An empty form shows *Salta per ora*, a filled one can still be
     skipped, and invalid prices block only until corrected or skipped.
  5. Preview: the same diagram, showing only present modules with readings
     the backend already normalized; derived consumption is announced as
     computed after saving, plus a summary of the tariff or a note that it
     can be added later.
  6. Save: one `save_profile` call with the modules and, unless skipped, the
     tariff, using the expected revision, with progress, success, and errors
     that keep the draft.
- **Settings** (*Impostazioni Energia*, administrators, loaded on demand)
  replace the wizard once a profile exists:
  - *Impianto*: one row per module with its sensors or *Non presente*, an
    offline badge, and inline editing with the same editor as the setup;
    *Ripeti rilevamento* opens re-detection. *Salva impianto* sends only the
    modules, so the stored tariff is kept.
  - *Tariffa e costi*: single, two-band or three-band structure, a price per
    band with its hours, fixed monthly fee, VAT, and the export price when a
    grid is configured. Decimal commas are accepted and invalid values are
    flagged inline. *Salva tariffa* and *Rimuovi tariffa* keep the saved
    modules, and a failed save keeps the edits on screen.
  - *Energy Profile v2*: when v1 cannot hold the profile (`profile: null`),
    *Impianto* lists each module with its devices and total sensor. A device
    opens on its name, power sensors and sign convention (the same editor),
    its energy meters (one statistic id per line, several are summed) with
    their Recorder status and reason (*Valido*, *In attesa delle prime
    statistiche*, *Non disponibile ora*, *Non compatibile*, *Non trovato*,
    *Non verificabile ora*), and a battery's nominal and usable capacity. A
    device can be removed after an explicit confirmation that its id is
    retired. The draft (`energyPlantDraft.ts`) mirrors the backend rules and
    saves the whole plant with `profile_v2` and the expected revision; every
    other device, the total, the Home Assistant device and the tariff travel
    unchanged. A save that would leave a total with one device is blocked.
    Adding devices, totals or modules is left to the multi-device setup;
    the v1 wizard refuses to open on such a plant instead of dropping data.
    The tariff is saved with the stored plant, never with unsaved edits.
  - Notices: a `legacy_v1.diverged` warning (an older Domus UI changed the
    plant after the update; nothing was merged), an unreadable stored
    profile, and meters that cannot be verified while Home Assistant or the
    Recorder starts. `profile_requires_v2` and revision conflicts are
    explained, never shown as network errors.
- **Discovery v2** is typed and sorted for review (`energyDiscoveryModel.ts`:
  new devices, changes to confirm, configured, not detected, conflicts,
  ambiguities, totals, incomplete verification). Nothing applies it:
  `suggested_plant` never replaces the profile and high confidence is not
  consent.
- **Re-detection** never changes confirmed bindings: differences are listed
  with an *Applica* action. Only a first setup preselects unique high or medium
  confidence matches, and nothing is saved without confirmation.
- **Permissions**: everyone with Home Assistant access can view the page;
  configuration requires the `manage_energy` capability (owner or
  administrator), the client administrative API gate, and the backend's own
  `require_admin` check.
- **HACS bridge**: both bridge halves allowlist exactly the four
  `domusos/energy/*` commands with exact-shape validation (`save_profile`
  with either `profile` or `profile_v2`) and announce the `energy_core`
  capability.

## History data contract (not implemented)

Energy Core only exposes instantaneous power today, so the live page shows an
empty *Andamento* chart and marks the analysis as waiting for history. A
reliable implementation needs a backend command; the frontend must not compute
energy from raw state history.

The frontend already renders this contract when it is supplied
(`EnergyDashboard`'s `history` prop, typed as `EnergyHistory`):

- *Andamento*: one kWh axis with a 2 px line per series, solid for production,
  consumption, import and battery discharge, dashed for export and battery
  charge. A legend that doubles as a filter shows production, consumption and
  import first. A crosshair tooltip follows the pointer or the arrow keys, an
  accessible table carries every value, and a `null` bucket breaks the line.
  Series colours follow the component and were checked for both themes and
  colour-vision deficiencies. Totals for the period sit below the chart.
- *Analisi*: self-consumption `(production − export) / production`,
  self-sufficiency `(consumption − import) / consumption`, the period cost with
  its breakdown, estimated savings and the change in consumption against the
  previous period. Costs come from the backend, which owns the ARERA bands.
- Only the git-ignored local preview supplies simulated history; the live
  page passes none.

Proposed command, readable by any authenticated user:
`domusos/energy/get_history` with `period: "24h" | "7d" | "30d"`.

```json
{
  "period": "24h",
  "bucket": "hour",
  "unit": "kWh",
  "series": {
    "production": [{ "start": "2026-10-02T10:00:00+00:00", "value": 1.42 }],
    "consumption": [],
    "import": [],
    "export": [],
    "battery_charge": [],
    "battery_discharge": []
  },
  "derived": ["consumption"],
  "missing": { "battery_charge": "not_configured" },
  "cost": {
    "currency": "EUR",
    "energy": 1.6,
    "fixed": 0.32,
    "vat": 0.19,
    "export_credit": 0,
    "net": 2.11,
    "savings": 4.28
  },
  "previous": { "consumption": 41.2, "net_cost": 2.3 }
}
```

- Buckets: hourly for 24 h, daily for 7 and 30 days; `value: null` for a
  bucket without data, never `0`.
- Source: Home Assistant recorder long-term statistics, the `change` of the
  energy meters of the profile in kWh, following `energy_meter_plan` (see
  [Energy meters](#energy-meters)), which handles meter resets.
- Directional power sensors may fall back to the time-weighted hourly `mean`
  converted to kWh. A signed net sensor must not: imports and exports within
  the same hour cancel out, so separate import/export energy is unknowable.
- Only series of configured modules are returned; derived series are listed
  in `derived` and computed with the same completeness rules as the live
  balance.
- `cost` is `null` without a tariff. `energy` prices each imported bucket at
  its ARERA band, `fixed` prorates the monthly fee over the period, `vat`
  applies to both, `export_credit` values exports at the export price, and
  `net = energy + fixed + vat − export_credit`. `savings` values self-consumed
  solar energy at the import price including VAT, or is `null` without solar.
- `previous` holds the same totals for the period before, or `null`.
