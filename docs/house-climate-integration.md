# HOUSE.4 — Climate and House Core

`ClimateZone.id` remains the Climate operating identity. `ClimateZone.areaId`, when set,
is the HA area ID exposed as a canonical `DomusRoom.id`. Multiple zones may point to one
room; a zone may have no room. Climate saves only the area ID. It never stores room or
floor names, environmental readings, or a House topology revision.

Climate calls the internal `HouseManager` room projection directly. The projection
returns only rooms referenced by configured zones, with name, floor and sanitized
temperature and humidity readings. The administrator's selector uses a separate
small room list from the same manager. Neither Climate endpoint returns the full
House topology, devices, unrelated rooms, or raw HA state attributes. House Core
does not import Climate. Non-admin readers do not need `rooms.view`; HA entity read
permissions still filter House environment source IDs and readings.

Each Climate config or state read derives House context afresh. A topology rename,
floor move, deletion, or environmental state change therefore changes the next
projection without changing Climate config or state revisions. A deleted room yields
`room_orphaned` and `orphaned_house_room_reference`; it is never remapped by name.
An unavailable House manager yields `house_unavailable` while the Climate config
remains readable. A partial Area Registry read also yields `house_unavailable` for
unknown IDs. On save, a new link must exist in the House room list. An unchanged
legacy orphan can remain while other configuration is edited; clearing it is allowed.

Climate's `zone.reference` is the explicit room control temperature reference used
by the intent preview and execution eligibility. `zone.humidityReference` is a
Climate-specific input for cooling and radiant safety. They can refer to sensors
different from House's general room temperature and humidity. HOUSE.4 does not
change their priority, freshness or fallback rules, nor condensation rules.
House environmental readings remain contextual and never become control inputs.
Any future default from House environment needs an explicit migration decision.

The House context is added only to Climate read responses, after plan evaluation.
It is excluded from plan inputs, plan tokens, execute revision checks, arm state,
ownership, the supervisory adapter and service dispatch. House failure during an
explicit execution cannot invalidate an otherwise valid physical plan. HOUSE.4
does not run physical QA; that remains `NOT_YET_EXECUTED`.
