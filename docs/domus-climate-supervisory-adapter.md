# CLM.3D — Manual supervisory Home Assistant adapter

Climate now has a narrowly scoped path from an eligible execution plan to a real Home Assistant service call. Installing or updating DomusOS cannot trigger that path. An administrator must first enable `physicalExecutionEnabled` in the HOUSE configuration, an endpoint must be explicitly owned by Domus, physical readiness must pass, and a user with `climate.control` must confirm and request execution for one zone.

The WebSocket command `domusos/climate/execute_plan` accepts only `zone_id`, `expected_plan_token`, `expected_config_revision`, and `expected_state_revision`. The server recomputes the current plan and readiness. It rejects stale requests before dispatch. The client never chooses an entity, service, HVAC mode, temperature, or action list. The adapter is the only Climate module calling `hass.services.async_call`; its fixed allowlist is `climate.set_hvac_mode` with `heat` or `cool`, and `climate.set_temperature`. If both actions are needed, mode precedes target. Already aligned fields are left alone.

Only one unambiguous, direct supervisory `climate.*` endpoint is supported. Hydronic dependencies, circuits, direct actuators, composite and shared equipment, generators, and all other topology remain blocked. `off`, `auto`, `heat_cool`, presets, fan, humidity, and turn on/off policies are outside this phase. The adapter checks live HA availability and advertised capabilities again before each action. Service calls are blocking and carry the requesting HA user's context.

Each manual dispatch creates an in-memory correlation with the expected changed fields. An HA state change or a single deadline timer reconciles it to `converged` or `failed`; a handler error yields `failed` or `partial_failure`. A duplicate pending request is suppressed. A new explicit request may supersede the pending correlation. There is no automatic retry, rollback, restart recovery, or command persistence. Unload cancels the timer and clears correlations. Audit events record arming, disarming, dispatch, convergence, failure, partial failure, and supersession without storing temperature payloads.

| Decision | Contract |
| --- | --- |
| C110 | First physical execution supports only direct supervisory `climate.*`. |
| C111 | Physical readiness and the execution arm are independent. |
| C112 | `physicalExecutionEnabled` defaults to false, including older stored configurations. |
| C113 | Changing the arm requires `climate.manage` and HA administrator status. |
| C114 | Manual dispatch requires `climate.control`. |
| C115 | The client cannot specify physical entity, service, or payload. |
| C116 | The server recomputes the plan immediately before dispatch. |
| C117 | A stale plan makes zero service calls. |
| C118 | The only services are `climate.set_hvac_mode` and `climate.set_temperature`. |
| C119 | When both are needed, HVAC mode precedes target. |
| C120 | Correlations exist only in runtime memory. |
| C121 | There is no automatic retry. |
| C122 | Partial failure does not cause an automatic rollback. |
| C123 | Passive runtime events never dispatch. |
| C124 | Physical OFF policy is deferred. |
| C125 | The manual adapter is validated before continuous automation is considered. |
