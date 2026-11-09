# Domus Climate: Linux pre-execution validation

**Result:** `LINUX_HA_VALIDATION = PASS` on 2026-11-09. This validates the Climate and Access Control **pre-execution runtime** through CLM.3C. No physical adapter existed in these runs, and no Home Assistant service call was made by Climate.

| Runner | Python | Home Assistant | Backend tests |
| --- | --- | --- | --- |
| Ubuntu 26.04.1 LTS (`ubuntu-latest`) | 3.12.16 | 2025.1.0 | 1,616 passed; 0 failed; 0 skipped |
| Ubuntu 26.04.1 LTS (`ubuntu-latest`) | 3.13.18 | 2026.2.3 | 1,671 passed; 0 failed; 0 skipped |

The [complete private run](https://github.com/Mattia2399/DomusOS-private-archive/actions/runs/42586803454) used the existing backend matrix. The [targeted private run](https://github.com/Mattia2399/DomusOS-private-archive/actions/runs/42587240131) passed all five previously failing HA tests on both versions. The test-only fixture commit is `cc3fa8974f87c8ddbb971b7e4e4a276032dbc2ae`. The temporary remote CI branch was deleted; the archive remained private.

The tested scope includes integration setup and unload, config and state stores, WebSocket authorization, revisions, Access Control, schedule and override timers, execution preview, ownership and freshness rules, and the CLM.3C safety evaluator. The static scan found no `hass.services.async_call` or `call_service` in Climate. The physical service-call adapter, command issue, correlation and retry were **not** tested because they do not exist yet.

## Build capability and runtime meaning

`ExecutionValidationCapabilities` in `climate/execution_validation.py` holds code-defined evidence. The production capability has `linux_home_assistant=True` for the validated **direct supervisory `climate.*` subset**. It is injected into the read-only preview, and tests can inject `False` to retain the `linux_ha_validation_required` blocker. It is not stored in `domusos.climate.v1` or `climate_state.v1`, exposed as a user setting, or writable through WebSocket.

The validated versions are evidence, **not a runtime whitelist**. The integration could read its installed HA version from `homeassistant.const.__version__` for future diagnostics; that source was checked in HA 2026.2.3. CLM.LNX2 does not compare or block a different patch or minor version. A later compatibility policy must be decided separately.

`physicalExecutionAllowed=true` means the current symbolic plan meets the software readiness requirements for a future adapter. It does **not** mean a command was sent. A `noop` has no actions to execute. Ownership, verified sensor freshness, availability, capabilities, target range and a current plan remain mandatory. Direct actuators, hydronic dependencies, generators, circuits, composite fan coils, shared multisplit and radiant cooling remain outside the executable subset.

## Decisions C102-C109

| ID | Decision |
| --- | --- |
| C102 | CLM.LNX1 validated the Climate pre-execution runtime on Linux Home Assistant. |
| C103 | Evidence covers the direct supervisory subset through CLM.3C, not a future physical adapter. |
| C104 | Validation is a software/build capability, not user configuration or persistent house state. |
| C105 | The current production build considers the Linux pre-execution gate satisfied. |
| C106 | The capability is injectable so tests can reproduce an unvalidated build and its blocker. |
| C107 | Linux validation does not enable direct actuators, hydronic paths, generators, circuits or radiant cooling. |
| C108 | `physicalExecutionAllowed=true` is readiness, not an issued command. |
| C109 | CLM.LNX2 still makes zero HA service calls. |

The next phase may design and test the first physical direct supervisory adapter. That phase must separately validate dispatch authorization, service calls, correlation, state reconciliation and failure behavior.
