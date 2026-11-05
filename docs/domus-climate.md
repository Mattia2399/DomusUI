# Domus Climate — CLM.1 foundation

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

The future UX can replace the lazy shell with a climate overview, zone card and detail, device mapping, schedule and profile editors, source selector, manual/auto switch, season selector and temporary override. None of these interfaces or behaviors is implemented here.
