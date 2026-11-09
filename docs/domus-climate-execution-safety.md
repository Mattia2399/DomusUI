# Domus Climate CLM.3C: supervisory execution safety

CLM.3C defines a **read-only** contract for a future physical adapter. It creates no command record, HA service call, retry loop, generator or circuit action. CLM.LNX2 records the successful Linux HA pre-execution validation as a code-defined capability. A direct supervisory plan can now report `physicalExecutionAllowed=true` when every other safety gate passes. This means ready for a future adapter, not that a command was sent. See [Linux validation evidence and decisions C102-C109](domus-climate-linux-validation.md).

## C88–C101 decisions

| Decision | Contract |
| --- | --- |
| C88 | A configured endpoint is not automatically owned for commands. |
| C89 | Missing `executionOwnership` means `observe_only`. No migration enables commands. |
| C90 | Only explicit `domus_supervised` passes the ownership gate. It is not sufficient for execution. |
| C91 | Ownership belongs to endpoint HOUSE config `domusos.climate.v1`; editing it uses the existing admin plus `climate.manage` config write path. It never belongs to `climate_state.v1`. |
| C92 | Finite value, known unit and plausible room reading are separate from sample freshness. |
| C93 | HA `last_updated` is **not** a guaranteed physical sample timestamp. |
| C94 | Unknown or stale freshness blocks V1 physical execution while logical preview may continue. |
| C95 | The 0–50 °C check is an **execution plausibility guard for room reference** only; it is not used for generator water, circuit supply or DHW. °F is converted to canonical °C; unknown units fail. |
| C96 | A future issued command requires correlation ID, plan generation, endpoint entity, actual issue time, expected state, status and optional deadline. CLM.3C creates no issued record. |
| C97 | An identical desired command already pending must be suppressed. Observed equals desired yields a `noop` with no actions. |
| C98 | A newer plan generation supersedes a pending correlation. It cannot keep governing the endpoint. |
| C99 | Symbolic plan eligibility and physical readiness are distinct. All readiness blockers are returned in stable order. |
| C100 | Linux HA validation is a mandatory environment gate. The evaluator accepts an injectable validation capability; the current live runtime passes the validated capability. |
| C101 | CLM.3C makes zero HA service calls. |

## Stored configuration and reference selection

Endpoint `executionOwnership` accepts `observe_only` or `domus_supervised`. The absent field behaves as `observe_only`, including legacy documents. Zone `reference.freshnessPolicy` accepts `none` (default) or `max_age`. For `max_age`, `maxAgeSeconds` is a required integer from **30 to 86400**; it is invalid with `none`. These fields use the existing config revision, store round trip, admin checks and `climate.manage` authorization. No new write API exists. The read-only execution preview remains under `climate.view`.

`none` yields `freshness=unknown`, never verified. With explicit `max_age`, HA `last_updated` is a chosen proxy: a timezone-aware timestamp between now and `maxAgeSeconds` ago yields `verified`; older is `stale`; missing, naive or future timestamps yield `unknown` and fail closed. This policy does not assert when the sensor physically sampled. With `max_age`, a stale primary is skipped and a usable fallback can become the actual selected room reference. Freshness is computed on that selected source. The logical preview still works with unknown freshness and no policy.

## Readiness and equipment boundary

The pure readiness evaluator requires trusted config/state, a current plan generation (revision, fingerprint, plan ID and time boundary), an eligible action, valid target and room reference, verified freshness, one available direct supervisory `climate.*`, exact HVAC mode and supported in-range target, explicit ownership, and Linux HA validation. Plan eligibility already checks the endpoint capabilities and excludes unsupported topology. It returns all relevant blockers, including `endpoint_not_owned`, `sensor_freshness_unknown`, `sensor_stale`, `plan_stale` and `linux_ha_validation_required`.

A unique autonomous direct split AC or explicitly declared autonomous thermostat, owned with a verified reference and valid target, has an eligible symbolic plan and can report **readiness with no blockers**. The Linux blocker remains available when an unvalidated capability is injected for tests or a future build. A hydronic TRV remains blocked by `hydronic_dependency_unmanaged`; direct manifold switches/valves by `unsupported_direct_actuator`; composite fan coils by `composite_execution_not_supported`; shared multisplit by `shared_equipment_coordination_required`; radiant cooling by `condensation_safety_not_implemented`. No control of circuit, generator, dehumidifier or raw actuator is inferred.

## Future reconciliation contract

`ClimateCommandCorrelation` is a pure typed model with `correlationId`, `planGeneration`, `entityId`, nullable `issuedAt`, `expectedState`, `status`, optional `reconciliationDeadline` and optional failure reason. Expected state contains **only fields changed by the plan**: HVAC mode and/or target. The pure helpers compare the same target tolerance as the plan (0.0001 endpoint units), return `converged` on match, `pending` while waiting, `superseded` on a newer plan, or `failed` for unavailable entity, stale plan or an explicitly supplied expired deadline. `partial_failure` is reserved in the status contract for a future action-level adapter. No timeout is chosen in CLM.3C.

Future failure reasons are `service_call_failed`, `entity_unavailable`, `state_not_converged`, `plan_stale` and `capability_changed`. The adapter must record the actual issue time and action results; it must not treat a planned action as issued. It should suppress a duplicate pending desired state, revalidate the plan before dispatch and reconcile HA state after dispatch. The future physical action will require `climate.control` as well as endpoint ownership. Attribution of a local device change remains `unknown` without reliable origin evidence; CLM.3C neither restores Domus settings nor creates an override. Available evidence would include the last correlation, actual issue time, expected state, HA observed-state timestamp and plan generation.

## Next phase

The pre-execution Linux HA validation passed on the two documented HA versions. The next phase can design the first direct supervisory `climate.*` adapter with action-level correlation and service-call tests. No physical execution exists until that work is implemented and tested.
