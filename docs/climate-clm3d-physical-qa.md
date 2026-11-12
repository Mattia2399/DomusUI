# CLM.3D controlled physical QA evidence

Date: 2026-11-12 (Europe/Rome). QA branch: `qa/clm3d-physical`. Base Domus commit: `a7b80d84f39cfbe72e8f1bd7c20dbfa13eb49d29`. This is an evidence record; no real hardware result is inferred from code or automated tests.

## Gate status

| Gate | Status | Evidence |
| --- | --- | --- |
| `CLM3D_PRECHECK` | BLOCKED | Branch/base clean, operator presence and authenticated HTTPS HA reads verified. HA 2026.7.2 reports Climate config `absent`, revision 0, **zero zones/endpoints**, `physicalExecutionEnabled=false`; runtime revision 0, `armed=false`, no plan or correlation. All HA `climate.*` entities are stove/water equipment, unsuitable as a first low-impact terminal test. Installed Domus commit cannot be established from these APIs. |
| `CLM3D_DRY_RUN` | BLOCKED | Real read-only `get_state` completed; `executionPreview.plans=[]`, so no executable plan/token exists. No dispatch command was sent. |
| `CLM3D_REJECTION_TESTS` | NOT_EXECUTED | No valid zone/plan exists for meaningful disarmed, invalid-token or revision-mismatch tests. Unknown-zone requests would test only absent configuration. |
| `CLM3D_PHYSICAL_EXECUTION` | NOT_EXECUTED | No approved target; no physical command sent. |
| `CLM3D_RESTORE` | NOT_EXECUTED | Nothing was changed physically. |
| `CLM3D_DISARM` | NOT_EXECUTED | Initial and final `armed=false` confirmed read-only; no arm/disarm write was needed or attempted. |

`CLM3D_PHYSICAL_QA = BLOCKED` because this installation has no Climate configuration and no safe first target. `READY_FOR_DOMUS_INTELLIGENCE_FOUNDATION = NO`.

## Static precheck of the execution contract

The QA has made no production source/test/House changes. Source inspection confirms:

- `domusos/climate/get_config` and `get_state` expose the current config/runtime and an `executionPreview` plan. `get_state` recomputes the preview; that path does not dispatch HA services.
- `physicalExecutionAllowed` is plan readiness independent of arming. `physicalExecutionEnabled` is the persisted configuration arm, defaults to false for absent/legacy config, and changing it uses `save_config` with `climate.manage` plus HA admin. **This installation reported `physicalExecutionEnabled=false` and `armed=false`.**
- `domusos/climate/execute_plan` takes zone ID, plan token, config revision and state revision. Server recomputation rejects stale values before dispatch, then rejects disarmed execution. A valid token alone is not authorization to issue a service.
- The adapter permits only `climate.set_hvac_mode` (`heat`/`cool`) and `climate.set_temperature`, against the configured direct supervisory `climate.*` endpoint. It rechecks live capability before each action. Plans with circuits, generators, shared equipment or direct actuators are blocked.
- Execution correlations are runtime memory only. Reconciliation can observe HA state or hit a deadline; passive state/config events do not call the adapter. This is static evidence, not a real reconnect or hardware test.

## Real installation evidence

| Item | Observation |
| --- | --- |
| HA version and installed Domus commit | HA 2026.7.2; installed Domus commit not exposed by queried APIs. This HA version is newer than the existing 2025.1/2026.2.3 CI matrix. |
| Operator physically present and able to stop/restore | Presence confirmed in chat; manual stop and restore capability cannot be assessed without a safe target. |
| Config/state revision, selected control sensor, zone and ownership | Climate config `absent`, revision 0; runtime `absent`, revision 0; zones 0, endpoints 0, no selected control sensor or ownership. |
| `physicalExecutionAllowed`, `physicalExecutionEnabled`, initial arm | No plan exists, so `physicalExecutionAllowed` is not applicable; persisted arm false; runtime `armed=false`. |
| Candidate zone/entity/device and original HVAC/setpoint | No configured zone/device. Three HA stove-related entities appear below; none is recommended for the first test. |
| Dry-run plan/token, ordered actions and allowlist comparison | Read-only `get_state` returned `plans=[]`; no token/actions to review. Adapter allowlist inspected statically, not exercised against hardware. |
| Disarmed, invalid-token, revision and permission rejections | Not executed |
| Arm, physical execute, HA service log/correlation, physical observation | Not executed |
| Restore, disarm, reload/reconnect observations | No physical change to restore; final arm still false. Reload/reconnect behavior not tested. |

### Candidate inventory from HA states

These are **unconfigured HA entities**, not approved Climate zone targets. No service or payload was planned.

| Zone | HA entity | Observed HVAC / target | Possible action | Risk | Reversible first test | Recommended |
| --- | --- | --- | --- | --- | --- | --- |
| None | `climate.termostufa_integrata` | `heat` / 71 | Temperature-capable stove/water control | High; heating source | No safe first-test determination | NO |
| None | `climate.stufa_casa` | `heat` / no target | Target setting not advertised in observed feature mask | High; stove | No | NO |
| None | `climate.stufa_casa_water` | `heat` / 71 | Temperature-capable water control | High; water/source | No safe first-test determination | NO |

All three states lacked a `temperature_unit` attribute required by the current adapter's live capability check. No low-impact direct supervisory terminal was identified. Candidate selection for a future attempt must use a configured zone and a fresh live plan. Before the **first** physical call, present the exact zone, entity, current value, proposed minimal reversible change, expected service/payload and restore plan for explicit user approval. The QA sent **zero service commands**; no HA service log instrumentation or physical observation was performed, so automatic/duplicate/unexpected actions in the installation are not claimed to be verified absent.

## Baseline and next action

The existing automated Linux HA matrix (2025.1/Python 3.12 and 2026.2.3/Python 3.13) is a prior software baseline, not physical evidence or proof for HA 2026.7.2. No CI was triggered for this document-only QA branch. The next action is a **separate configuration/target selection step**: provide a stable, low-impact, directly supervised `climate.*` terminal zone with a verified control sensor, ownership and safe return path; then restart this QA at precheck. Do not repurpose the observed stove/water entities as the first physical test. If a later installation is already armed without an explicit operator action, stop and mark QA **FAIL**; if any production safety bug appears, stop physical QA and record it without a code fix on this branch.

```text
CLM3D_PRECHECK = BLOCKED
CLM3D_DRY_RUN = BLOCKED
CLM3D_REJECTION_TESTS = NOT_EXECUTED
CLM3D_PHYSICAL_EXECUTION = NOT_EXECUTED
CLM3D_RESTORE = NOT_EXECUTED
CLM3D_DISARM = NOT_EXECUTED
CLM3D_PHYSICAL_QA = BLOCKED
CLM3D_PHYSICAL_EXECUTION_VERIFIED = NO
CLM3D_RESTORE_VERIFIED = NO
CLM3D_DISARM_VERIFIED = NO
CLM3D_UNEXPECTED_SERVICE_CALLS = NOT_MEASURED
READY_FOR_DOMUS_INTELLIGENCE_FOUNDATION = NO
```
