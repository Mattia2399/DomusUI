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
| `domusos/energy/discover`     | Administrators | Return proposals; nothing is saved                |
| `domusos/energy/get_profile`  | Administrators | Return the profile and the condition of each module |
| `domusos/energy/save_profile` | Administrators | Save confirmed or corrected bindings (`profile`, `expected_revision`) |

`get_state` returns the same projection as `EnergyContextProvider` and never
configuration details. Without a profile it reports `configured: false` and
lists every module as absent. Error codes are `invalid_profile`,
`revision_conflict`, `energy_unavailable`, `unauthorized`, and
`unknown_error`. The generic Domus context registry remains internal.
The live `tariff` also carries `vat_percent`, the rate the prices exclude.

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
- **Re-detection** never changes confirmed bindings: differences are listed
  with an *Applica* action. Only a first setup preselects unique high or medium
  confidence matches, and nothing is saved without confirmation.
- **Permissions**: everyone with Home Assistant access can view the page;
  configuration requires the `manage_energy` capability (owner or
  administrator), the client administrative API gate, and the backend's own
  `require_admin` check.
- **HACS bridge**: both bridge halves allowlist exactly the four
  `domusos/energy/*` commands with exact-shape validation and announce the
  `energy_core` capability.

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
- Source: Home Assistant recorder long-term statistics, preferably the
  `change` of optional cumulative energy meters (kWh, `total_increasing`)
  added to the Energy Profile, which handles meter resets.
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
