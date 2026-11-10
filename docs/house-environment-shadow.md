# House environment shadow diagnostic

`domusos/house/get_environment_shadow` is an on-demand, read-only WebSocket
command. It requires Domus `rooms.view` and a Home Assistant administrator.
It returns HA rooms only; browser-local `custom:*` rooms and Demo are outside
House topology. Connected Rooms displays the canonical House Snapshot reading.
The command reads one current HA state map per request. It does not subscribe,
poll, store history, write House configuration, or call HA services. Request it
again after a topology or state change. When Domus House is offline, the command
returns `house_unavailable` rather than a misleading mismatch.

The report contains room ID/name, metric, source entity ID, resolution source,
availability, normalized scalar value, unit, update time, status, category,
per-metric counters, and conservative readiness. No raw HA attributes are
serialized. `READY` means every row is `MATCH`, `BOTH_UNAVAILABLE`, or an
intentional `LEGACY_UNSAFE_FALLBACK_REJECTED` divergence;
`PARTIAL` means at least one `MATCH` and one mismatch; `NOT_READY` means
mismatches with no `MATCH`. `READY` from fixtures does not authorize migration.

Temperature comparisons normalize `°F`/`F` to Celsius and accept `°C`/`C`.
Humidity is percentage. Empty units are treated as Celsius or percentage
because legacy Rooms accepts numeric states without a unit. An incompatible
unit leaves the raw numeric scalar and `incompatible_unit` status in the
diagnostic but cannot count as a value match. Tolerance is **0.05 °C** or
**0.1 percentage point**, inclusive. `DIFFERENT_SOURCE_SAME_VALUE` is a
distinct category even when values are equivalent; it does not count as
`READY` until reviewed.

## Legacy selection audit

| Current Rooms rule | Classification | Reason for review |
| --- | --- | --- |
| HA Area temperature/humidity reference wins when non-null | SAFE_TO_CENTRALIZE | Explicit user choice; missing, unknown, or unavailable primary stays selected and no fallback is tried. |
| Entity's explicit Area overrides its device Area; otherwise device Area applies | SAFE_TO_CENTRALIZE | Matches House topology membership. |
| Fallback searches only `sensor.*` states assigned to the room | SAFE_TO_CENTRALIZE | Climate `current_temperature`, weather entities, and binary sensors are excluded. |
| Candidate matches device class, unit, **or** `temperature`/`humidity` in entity ID | AMBIGUOUS | A battery or unrelated sensor can match by name/unit; no quality ranking. |
| First matching state wins in live-state insertion order | UNSAFE | Multiple sensors have no semantic priority; order can change after state recreation. |
| Candidate selection ignores availability and disabled registry flags | UNSAFE | The first unavailable candidate can block a valid later candidate; disabled entities generally have no live state. |
| Legacy numeric parsing accepts decimal comma and a numeric prefix | UI_ONLY | This is a presentation tolerance, not a trustworthy source quality rule. |
| Numeric state wins, then `current_temperature` attribute, then a climate target attribute, then numeric-prefix state parsing | UI_ONLY | A configured sensor can show an attribute value even if its HA state is `unavailable`; House Snapshot reads the state only. |
| Custom-room and Demo readings | DOMAIN_SPECIFIC | They are local to Rooms, not HA House topology. |

The shadow command mirrors the retired legacy selection for diagnosis only.
It compares it to the canonical House Snapshot, including its strict fallback.
`LEGACY_UNSAFE_FALLBACK_REJECTED` identifies a legacy fallback that House
intentionally refused. For a configured primary that is unavailable,
both sides remain unavailable; `status` and `entityId` distinguish that from
an unconfigured Area. When the Area has no primary reference, HA 2025.1 can
report `LEGACY_FALLBACK_ONLY`; HA 2026.2.3 can report `MATCH` with a configured
Area sensor. State insertion order comes from HA's current state map, matching
the normal initial live map used by Rooms. A long-running browser whose live
map has a different insertion order after removals/reinsertions may select a
different first fallback. Compare the reported legacy entity ID with the
Rooms display before making a migration decision.

## Real-house QA

1. Install the tested Domus build on HA and sign in as an HA administrator
   who has `rooms.view`. Open Domus Rooms and note displayed temperature and
   humidity for each HA room. Keep the Home Assistant connection online.
2. In the HA browser developer console, use the HA connection available on
   that page. For the standard HA frontend:

   ```js
   const hass = document.querySelector('home-assistant')?.hass;
   const report = await hass.connection.sendMessagePromise({
     type: 'domusos/house/get_environment_shadow',
   });
   console.table(report.rows.map(({ roomName, metric, legacy, house, category }) => ({
     roomName, metric, legacy: legacy.entityId, legacyValue: legacy.normalizedValue,
     house: house.entityId, houseValue: house.normalizedValue, category,
   })));
   copy(JSON.stringify(report, null, 2));
   ```

3. Share the copied JSON through the agreed private channel. Verify the
   `legacy.entityId` corresponds to the sensor Rooms actually chose, especially
   in rooms with multiple sensors or recently recreated states. Re-run the
   request after changing an Area reference or sensor state; there is no
   automatic polling. Review every non-`MATCH` row before deciding whether a
   central House fallback is safe.

The next decision after real-house QA is either HOUSE.3B (design and implement
a central environmental fallback) or HOUSE.4 (proceed to Climate if configured
House references already cover the real installation).
