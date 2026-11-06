# Domus Climate — CLM.1 foundation

> Historical CLM.1 design. CLM.2 persists HOUSE configuration; CLM.3A adds a separate [intent runtime](domus-climate-intent-runtime.md); CLM.4A adds [profiles and weekly schedules](domus-climate-profiles-schedules.md); CLM.4B adds the [automatic target resolver](domus-climate-auto-resolver.md). See [zone mapping](domus-climate-zone-mapping.md) for the installation contract.

Domus Climate is HOUSE configuration for shared climate intent. The Settings entry is **Impostazioni → Casa → Clima**, at `/settings/climate`. This phase provides a typed contract and a small page shell. It reads and writes no climate configuration, runs no scheduler, creates no Home Assistant automation, and sends no service call. There is no backend module in CLM.1 because the shell does not need an API or storage. The existing Home Assistant shared house document is a candidate for later persistence; CLM.2 must decide the schema, migration and ownership before saving anything. The Settings registry therefore marks the current storage as `not_persisted`.

The route uses the existing `house.manage` capability, the same house configuration authority as floors and rooms. The Settings list and route guard read the same route rule. This is a frontend visibility rule, not backend security. No new capability or enforcement is added. When the feature gains read and write APIs, assess `climate.view` and `climate.manage` separately and enforce backend authorization for every operation.

## Domain contract

`src/pages/climate/climateModel.ts` defines the proposed `ClimateSystem` v1 document. The types are intentionally compile-time only; they neither validate untrusted data nor run control logic. Before persistence, add a runtime parser and versioned migration at the actual storage boundary.

| Concept | Responsibility |
| --- | --- |
| `ClimateSystem` | HOUSE root: manual/auto control intent, heating/cooling/off season and collections of zones, endpoints, circuits, generators, profiles and schedules. |
| `ClimateZone` | Controlled space, referencing an existing Home Assistant `area_id`; optional explicit temperature sensor, room target, endpoint and program references. It does not duplicate the room tree. |
| `ClimateEndpoint` | Zone actuator such as one AC per bedroom or a smart TRV. Its declared capabilities distinguish heat/cool/fan/swing from heat-only valves. An endpoint can belong to a circuit. |
| `ClimateEntityBinding` | One primary entity and optional related controls (`entityId`, `role`), for example `climate.termostufa` with `select.ventilazione`, `select.potenza` and `switch.eco`. This can later align with the secondary card controls. |
| `ClimateCircuit` | Radiator circuit connecting zone/TRV demand to a controller and generators. The corridor thermostat can be its controller without becoming the global master or setting every room's target. |
| `ClimateGenerator` | Boiler or thermostove feeding circuits; not necessarily in a room. Its services explicitly include space heating and/or domestic hot water. |
| `ClimateProfile` | User-defined named room target. Comfort, Eco, Night and Away are examples, not fixed enum values. |
| `ClimateSchedule` | Weekly local-time events per zone, selecting a profile or an explicit room target. No event is evaluated in CLM.1. |
| `ClimateStrategy` | Future preference for radiators, AC or automatic source, and boiler, thermostove or automatic radiator generator. No choice algorithm exists yet. |
| `ClimateOverride` | Future temporary zone intent until a time or next schedule event. No timer or application logic exists yet. |

The temperature reference is the zone's `referenceTemperatureEntityId` (for example `sensor.camera_temperatura`). TRV or AC readings may become fallback sources later, but there is no selection logic now. `RoomTemperatureTarget` and `GeneratorWaterTarget` have distinct `kind` discriminants and distinct positions in the contract. A 21 °C bedroom target cannot be assigned to the thermostove's 55–80 °C water setpoint by type-compatible copying. Runtime validation is still required before using saved data. A TRV setting does not itself produce heat: zone heat demand, aggregate circuit demand and generator operation remain separate future computations. A thermostove serving domestic hot water must not be switched off solely because space-heating demand is false; ACS/DHW control is outside CLM.1.

The intended flow is **Domus climate intent → future engine → zone / circuit / generator → Home Assistant entities**. There is no single physical climate entity whose commands are copied to the whole house. ACs remain independent zone endpoints, TRVs are radiator circuit endpoints, a boiler is a generator, and the corridor thermostat is a circuit controller. `manual`/`auto` and `heating`/`cooling`/`off` are configuration vocabulary only.

## Decisions

- **C1:** Domus climate intent is logical, not a physical climate master.
- **C2:** Zones express room intent and reference existing areas.
- **C3:** Endpoints, circuits and generators have separate responsibilities.
- **C4:** The main thermostat can control a circuit without controlling every room target.
- **C5:** A thermostove water target is separate from a room target.
- **C6:** TRV demand is separate from heat generation.
- **C7:** Thermostove space heating and domestic hot water are separate services.
- **C8:** Climate configuration belongs to HOUSE.

## Next phases

| Phase | Scope |
| --- | --- |
| CLM.1 | Foundation, Settings entry and shell (this phase) |
| CLM.2 | Zones, device mapping, runtime schema and persistence decision |
| CLM.3 | Manual control with backend authorization |
| CLM.4 | Schedules and profiles |
| CLM.5 | Temporary overrides |
| CLM.6 | Hydronic demand and generators, including DHW constraints |
| CLM.7 | Automatic source strategy |
| CLM.8 | Energy-aware optimization with Domus Energy (price, solar production and cost) |

The active Climate work includes a lazy Climate shell, overview and zone cards, device mapping, schedule and profile editors, manual/auto controls and temporary zone targets. Physical source control and optimization remain future work.

## General climate architecture (CLM.2A)

The persistent HOUSE document is described in [CLM.2 zone mapping](domus-climate-zone-mapping.md). Its logical path is **house operating intent → zone → terminal/actuator → optional hydronic circuit → generator**, with auxiliaries and shared equipment alongside it. An AC can serve a zone directly. A manifold valve can connect a zone to a radiant circuit. The endpoint key remains in the wire format for CLM.2 compatibility; it now represents a logical terminal, which can bind a primary HA entity plus related controls.

| Concept | Configuration meaning |
| --- | --- |
| Zone | Area reference, ordered temperature source, optional ordered humidity source, terminal IDs and `follow_house`/`off` intent. |
| Terminal | AC, TRV, manifold actuator, fan coil or ducted unit; explicit heating, cooling, fan and dehumidification capabilities; primary `climate`, `switch`, `valve` or `input_boolean` binding plus secondary controls. |
| Circuit | Descriptive kind (radiators, radiant floor/ceiling, fan coil or generic hydronic) and explicit heating/cooling capabilities; generator links, optional controller, component bindings and circuit supply setpoint binding. |
| Generator | Boiler, thermostove or heat pump; separate space heating, cooling and DHW capabilities. Generator water setpoint is distinct from circuit supply and room target. |
| Auxiliary | Dehumidifier or ventilation device scoped to one or more zones and/or circuits. A shared dehumidifier is one resource with several zone references. |
| Equipment group | Several terminals, optional generator references and a `sharedOperatingMode` constraint, for example a multisplit outdoor unit. |

**C16:** V1 house operating mode is a single `heating`, `cooling` or `off` intent. It is independent of the physical HVAC mode reported by any HA entity. `supportsSimultaneousModes` is implicitly false in V1; a later capability could change this.

**C17:** A zone may `follow_house` or be `off`. It cannot request the opposite thermal mode. This is a configuration contract; no runtime enforcement or service calls exist yet.

**C18:** A logical terminal need not be one `climate.*` entity. A manifold head may use `switch.*` or `valve.*`; a fan coil can aggregate `climate.*` and fan/valve controls.

**C19:** Circuit heating and cooling capabilities are explicit. Circuit kind is descriptive and does not force capabilities from a name. A radiator circuit could technically declare cooling if the installation really supports it; validation checks the declared links, not a preset assumption.

**C20:** Room target, circuit supply setpoint and generator water setpoint have separate semantic kinds and bindings. No setpoint value or regulation is stored by CLM.2A.

**C21:** Humidity reference is optional per zone, with primary and ordered fallbacks, parallel to temperature. Sensor `available`, `unavailable` and `stale` health is future runtime state, not HOUSE config.

**C22:** A cooling circuit may declare humidity control and condensation protection requirements and reference scoped auxiliaries. These are design constraints, not an active safety system. Future cooling must evaluate humidity and derived dew point, apply dehumidification or safety rules, then allow or inhibit radiant cooling.

**C23:** Dehumidification and ventilation are auxiliaries rather than generators.

**C24:** Auxiliaries may serve a single zone or be shared by multiple zones/circuits. A `required` auxiliary relationship is represented by a circuit cooling constraint; no priority engine exists.

**C25:** Generators declare space heating, cooling and DHW independently. DHW demand and priority are future concepts separate from space climate demand. A generator serving DHW must never be assumed safe to turn off merely because zones have no space demand.

**C26:** Shared equipment groups may constrain several terminal modes. A multisplit's `sharedOperatingMode` is only configuration metadata today.

**C27:** HOUSE stores installation topology and optional operating/control intent; readings, active physical mode, sensor health, demand, dew point, active generator and overrides remain runtime/derived state outside this store. `controlMode` (`manual`/`auto`), `operatingMode` (`heating`/`cooling`/`off`) and reserved source `strategy` are distinct. Generator `preferred`/`fallback`/`required` links express topology metadata only.

External window, occupancy, weather, PV and price signals belong to a future generic signal/constraint extension point, not special core fields. CLM.5 accepts temporary overrides requested through Domus. Physical changes at a TRV, AC remote or thermostat remain observed mismatches of unknown cause; attribution and any resulting action belong to a later phase.

## CLM.3A intent runtime

The active runtime contract is [CLM.3A intent runtime](domus-climate-intent-runtime.md). It separates installation configuration, persistent house and zone intent, observed HA readings, and derived decision preview. It does not execute HA services. C28–C37 supersede the earlier suggestion in C27 that operating and control mode belong in the installation document: existing optional fields only seed an absent intent store for compatibility.

CLM.4B resolves weekly schedule targets as described in [automatic target resolver](domus-climate-auto-resolver.md). CLM.5 adds [temporary zone overrides](domus-climate-overrides.md) to AUTO with one absolute UTC expiry per zone and one shared next-boundary timer. Neither phase issues HA service commands.

CLM.5A records the [pre-execution runtime audit](domus-climate-runtime-audit.md). Its local fixes prevent a corrupt intent store from yielding an AUTO preview, ignore stale timer and listener callbacks after unload, and remove orphan zone intents after configuration changes. The HA-specific paths still await the Linux harness; physical execution remains gated by sensor validity, delivery selection and command ownership.
