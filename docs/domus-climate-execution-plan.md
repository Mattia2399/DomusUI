# Domus Climate CLM.3B — supervisory execution plan

CLM.3B inserts a **pure, derived execution plan** after Climate intent, AUTO/manual/override resolution, observed state and compatible paths. `get_state` returns `executionPreview` under the existing `climate.view` authorization. CLM.LNX2 allows `physicalExecutionAllowed=true` when a direct supervisory symbolic plan meets every safety gate, including the validated Linux HA pre-execution gate. CLM.3D adds an independently armed, explicitly requested manual adapter; see [the adapter contract](domus-climate-supervisory-adapter.md). A plan preview alone never sends a command.

## Decisions C71–C87

| ID | Decision |
| --- | --- |
| C71 | A separate `execution_plan.py` derives a snapshot; the existing Climate runtime still owns intent and observation. |
| C72 | One zone and exactly one compatible supervisory endpoint form the initial plan subset. |
| C73 | `climate.*` alone does not prove independent control: AC must have no circuit or group; `kind=other` needs explicit `controlTopology=direct_supervisory`. |
| C74 | A direct switch/valve/relay needs a different controller, hysteresis and dependencies. |
| C75 | More than one compatible terminal yields `delivery_strategy_required`; ordering never selects one. |
| C76 | Plan is derived, deterministic for equal inputs and instant, bound to config/state revisions and never stored. |
| C77 | Endpoint desired mode/target and observed mode/target produce a structured diff. |
| C78 | Equal desired/observed produces `noop`, with no actions. |
| C79 | Out-of-range target blocks; step rounding is explicit in `requestedTarget`, `targetTemperature`, `normalization`. |
| C80 | A room reference requires finite value, known °C/°F unit and 0–50 °C plausibility for plan generation. Sample freshness remains unproven and blocks future physical execution. |
| C81 | Access permission and command ownership are different. Configured binding defaults to unknown ownership. |
| C82 | Local device changes are observed only; no local-change override is created. |
| C83 | Future reconciliation must correlate issued command, expected state, timestamp and HA updates. |
| C84 | Supervisory thermostat sets a native controller's mode/setpoint; direct actuation drives hardware state and is out of scope. |
| C85 | Radiant cooling is hard blocked until condensation/dew-point safety exists. |
| C86 | Circuit, pump and generator control are absent. |
| C87 | No HA service calls, even when symbolic actions are present. |

## Plan model and rules

Each plan exposes a time-varying planId and a stable planToken bound to its relevant inputs and revisions. Neither is a persisted command identifier. Other fields include zone/status, desired and observed state, symbolic actions, safety reasons, input fingerprint, evaluation time and optional validUntil.

The House `heating` mode maps only to HA `heat`; `cooling` maps only to `cool`. `heat_cool` and `auto` are not fallbacks. The endpoint must currently advertise the exact mode, `TARGET_TEMPERATURE` in `supported_features`, a known `temperature_unit`, and numeric `min_temp`/`max_temp`. The room target is canonical °C; endpoint ranges, observed target and step use the endpoint's HA state unit. Step normalization rounds to the nearest multiple of the advertised step with halves away from zero. It happens only after checking the requested target against the endpoint range, and the normalized target is checked again. No silent clamp occurs. Adapter translation remains separate from these domain-level actions.

Actions are data. If mode and target differ, order is set_hvac_mode then set_temperature. If only one differs, only that action appears. If both match within 0.0001 endpoint units, there are no actions. The 0.2 C thermal deadband is for decision preview; it never turns a supervisory device on or off.

House OFF and Zone OFF produce no physical OFF action: shared endpoints, external automations, multisplit and local device control make ownership unclear. `no_target` is unresolved, with no invented fallback. A hydronic TRV can be recognized as supervisory but its plan is blocked by unmanaged circuit/generator dependency. A fancoil with related controls is composite and blocked. A shared multisplit requires group coordination. Generator and circuit actions never appear.

## Sensor and time policy

HA sensor state exposes `unit_of_measurement`; HA climate state exposes `temperature_unit`. Both can be °C or °F. The plan converts room °F to canonical °C and rejects unknown units, non-finite values and room temperatures outside **0–50 °C**, a conservative residential range distinct from the configurable target range of 5–40 °C. A bad selected reference blocks rather than silently changing to an unverified source. The intent preview also converts an explicit °F unit to °C for its thermal decision, and rejects an explicit unknown unit. Historical fixture states with no unit remain readable in the older preview for compatibility, but `executionPreview` rejects them.

The attribute/unit behavior follows the official [Home Assistant climate entity contract](https://contributors.home-assistant.io/core/entities/climate/) and [sensor entity contract](https://contributors.home-assistant.io/core/entities/sensor/). Climate state values are converted to the installation unit before HA writes the state; the plan reads the resulting `temperature_unit` rather than assuming °C.

HA last_updated alone does not prove the device sampled recently. The explicit per-reference freshness policy is required for physical readiness. A newly recomputed plan, its planToken, revisions, observed input fingerprint, and validUntil guard manual execution. The adapter rechecks ownership, sensor freshness, availability, and capabilities before each service call.

## Manual reconciliation contract

CLM.3D provides runtime-only command correlations for explicit manual dispatch. They track pending, converged, failed, partial_failure and superseded outcomes, with a single deadline timer and no automatic retry or rollback. The complete contract is documented in domus-climate-supervisory-adapter.md.

## Feature gate

| Equipment | Plan | Physical execution in CLM.3B |
| --- | --- | --- |
| Direct split AC `climate.*` | Yes if unique and capable | No |
| Explicit autonomous thermostat `climate.*` | Yes with `controlTopology=direct_supervisory` | No |
| Hydronic TRV | Blocked, dependency explained | No |
| Manifold switch/valve, relay, raw pump | Blocked, direct actuator | No |
| Composite fancoil, radiator/radiant circuit | Blocked | No |
| Boiler, stove, heat pump, dehumidifier | No zone plan | No |
| Radiant cooling | Hard blocked | No |
| Shared multisplit | Blocked pending coordination | No |

## Failure matrix

| Condition | Plan possible? | Readiness for a future adapter? | Reason |
| --- | --- | --- | --- |
| Config absent/corrupt or state corrupt | No preview | No | Existing runtime health gate |
| House/Zone OFF | No action | No | `house_off` / `zone_off`; no inferred physical OFF |
| No effective target | No | No | `no_target` |
| Sensor unavailable, NaN, unknown unit or out of range | No | No | Specific `sensor_*` reason |
| Freshness unknown | Symbolic plan possible | No | `sensor_freshness_policy_required` |
| Endpoint unavailable or mode/feature/range changed | No | No | Specific endpoint reason |
| Zero compatible terminals | No | No | `no_compatible_terminal` |
| One direct supervisory terminal | Yes, including `noop` | Ready only with ownership, verified freshness and all safety checks | No adapter exists yet |
| Two compatible terminals | No | No | `delivery_strategy_required` |
| Hydronic dependency or shared equipment | No | No | Dependency/coordination reason |
| Radiant cooling | No | No | `condensation_safety_not_implemented` |
| Linux HA validation missing in an injected build capability | Symbolic plan possible | No | `linux_ha_validation_required` |

## Invariants E1–E18

E1/E18 zero HA service calls; E2 no plan with invalid config/state; E3 no plan without target; E4 invalid reference cannot produce eligible plan; E5 heating never plans cool; E6 cooling never plans heat; E7 exactly one supervisory endpoint; E8 ambiguous delivery never selected; E9 direct actuator never supervisory; E10 unavailable endpoint never eligible; E11 out-of-range target never clamped; E12 desired equals observed yields no actions; E13 plans carry config/state revisions; E14 stale revision/boundary invalidates plan; E15 plans are never persisted; E16 radiant cooling blocked; E17 no hydronic generator actions. The pure test suite covers these rules and source/schedule/override transitions. Linux HA round-trip, Access Control and service-call observation passed in CLM.LNX1; see [validation evidence](domus-climate-linux-validation.md).
# CLM.3C update

The CLM.3B sections above record the original planning baseline. CLM.3C adds explicit endpoint ownership, optional reference freshness policy, a pure readiness evaluator and a future command-correlation contract. CLM.LNX2 supplies the validated Linux HA capability, so eligible direct supervisory plans can report readiness. The CLM.3D runtime sends service calls only after explicit manual execution with an armed and ready plan; see the supervisory adapter contract. See [the CLM.3C safety contract](domus-climate-execution-safety.md) for decisions C88–C101 and [Linux validation evidence](domus-climate-linux-validation.md) for C102–C109.
