# Domus Climate — CLM.3A intent runtime

CLM.3A adds live, read-only climate decisions. The flow is **installation config → intent → observed HA state → derived preview**. Physical execution is absent.

| Layer | Source and lifetime | Contract |
| --- | --- | --- |
| Config | `domusos.climate.v1`, persistent HOUSE installation | Zones, references, terminals, circuits, generators, auxiliaries and equipment groups. Existing optional mode fields are compatibility seeds only when no intent store exists. |
| Intent | `domusos.climate_state.v1`, persistent HA Store | House `operatingMode` (`heating`/`cooling`/`off`) and independent `controlMode` (`manual`/`auto`); each zone has `follow_house`/`off` and optional room temperature target. Versioned schema, revision conflict and idempotent writes. |
| Observed | Current HA states, never persisted by Climate | Ordered primary/fallback temperature and humidity readings and terminal availability/setpoints. Invalid or unavailable readings fall through. `stale` is reserved for explicit health metadata; no ungrounded timeout is imposed. |
| Derived | Recomputed on configured entity events and reads, never persisted | Effective target, thermal status and compatible terminal/circuit/generator paths. A 0.2 °C deadband yields `satisfied`. Unknown readings or missing targets yield `unknown`, never demand. |
| Execution | Absent in CLM.3A | No HA service calls, generator start, source optimizer, schedule or dew point engine. |

House and zone intent **survive restart** in the separate state store. The first state is safely off unless legacy config explicitly seeded an operating mode; the first successful edit persists the entire intent document. A config change updates the mapped zone set without copying observed or derived values into either store. Auto mode keeps manual targets but has no effective target until a future scheduler provides one; it reports `autoPendingConfiguration`. The pure preview accepts an explicit auto-target fixture for future integration, while production passes none.

The preview reports path candidates according to declared capabilities and optional generator preference metadata; it neither chooses a source nor infers that radiant cooling is safe. Humidity and condensation requirements and dehumidifier candidates are visible constraints. A changed physical device setpoint is shown as a mismatch with `unknown` cause; CLM.3A does not restore it or classify it as a user override. Room targets have no connection to circuit supply or generator water setpoints.

WebSocket commands are `domusos/climate/get_state` (`climate.view`), `set_house_intent` and `set_zone_intent` (`climate.control`). Config writes remain `climate.manage` and HA admin only. Access Control checks every direct WebSocket command and fails closed. Active resident, member and wall panel roles can control intent; restricted and locked roles cannot. Revision conflicts require reload. The frontend observes configured HA entities only; no timer polls all HA states.

## Decisions

- **C28:** House intent is runtime state separate from installation configuration.
- **C29:** Operating mode and control mode are independent.
- **C30:** Zone intent supports `follow_house` and `off`.
- **C31:** Thermal status is derived and is not persisted.
- **C32:** Sensor fallback resolution occurs at runtime.
- **C33:** Unknown sensor state produces no demand.
- **C34:** CLM.3A produces decision preview without execution.
- **C35:** Room target is semantically separate from hydronic and generator setpoints.
- **C36:** Capability filtering identifies compatible paths, not an optimal source.
- **C37:** Physical execution remains CLM.3B and requires prior Linux validation. CLM.2/2A Linux validation remains environment blocked because WSL2 and Docker are unavailable locally.
