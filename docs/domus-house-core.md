# Domus House Core — HOUSE.2

The House Core is a **read-only backend projection** of the Home Assistant floor,
area, device and entity registries. It has no persistent House store, no registry
write endpoint, and no service call. Rooms, Climate, Energy and Security retain
their current behavior in HOUSE.2.

## Sources, identity and compatibility

| Fact | Authority | Public identity |
|---|---|---|
| Floor and its order | HA Floor Registry | `floor_id` |
| Room, floor assignment and native environment refs | HA Area Registry | `area_id` (`AreaEntry.id` in Python) |
| Device and area assignment | HA Device Registry | `DeviceEntry.id` |
| Entity and explicit area | HA Entity Registry | `RegistryEntry.id` when present; current `entity_id` also exposed |

`ENTITY_STABLE_ID = RegistryEntry.id`: checked in the HA 2025.1.0 and 2026.2.3
Python registry entries and their serialized registry dictionaries. It is a
registry entry ID separate from `entity_id`, which can change. The resolver
does not construct an ID from names, position or `unique_id`.

The relevant HA source contracts were checked at
[2025.1.0 entity registry](https://github.com/home-assistant/core/blob/2025.1.0/homeassistant/helpers/entity_registry.py),
[2026.2.3 entity registry](https://github.com/home-assistant/core/blob/2026.2.3/homeassistant/helpers/entity_registry.py),
[2025.1.0 area registry](https://github.com/home-assistant/core/blob/2025.1.0/homeassistant/helpers/area_registry.py) and
[2026.2.3 area registry](https://github.com/home-assistant/core/blob/2026.2.3/homeassistant/helpers/area_registry.py).
The floor, area, device and entity registry modules expose public
`EVENT_*_REGISTRY_UPDATED` constants in both versions. The resolver subscribes
to those constants, not literal event strings. HA 2025.1.0 AreaEntry has no
`temperature_entity_id` or `humidity_entity_id`; HA 2026.2.3 has both. Missing
attributes normalize to `null`. HOUSE.3B can select a strict runtime fallback
for a room without a primary; see `house-environment-resolver.md`.
HA 2025.1.0 has no floor reorder method; 2026.2.3 adds one. The resolver only
reads each version's registry order and reports its index.

The one effective-area rule is:

```text
entity.area_id ?? device.area_id ?? null
```

An invalid explicit area remains explicit and generates an issue; it does not
silently fall back to the device. Unassigned devices and entities are normal.

## API and schemas

Both WebSocket commands are read-only and accept **only** `type` (plus HA's
transport `id`):

- `domusos/house/get_topology`
- `domusos/house/get_snapshot`

Both responses use `schemaVersion: "domusos.house.v1"`. The topology has
`topologyRevision`, `topologyFingerprint`, `generatedAt`, `floors`, `rooms`,
`devices`, `entities`, `unassigned` and `issues`. Floor order comes from the HA
registry list. Rooms expose native temperature and humidity reference IDs or
`null`. Entity records expose `registryId` and `entityId` separately. Issues are
typed: `registry_unavailable`, `missing_floor_reference`,
`missing_area_reference`, `missing_device_reference`,
`missing_temperature_entity`, `missing_humidity_entity`. An unavailable
registry returns a partial topology and an issue; it never fabricates entries.

`topologyFingerprint` is SHA-256 of canonical JSON from the **authorized
projection**, excluding revision, generated time and runtime states. Ordering
is deterministic: floors follow HA order, rooms/devices/entities/issues sort by
identity. `topologyRevision` starts at 1 per manager lifetime and increments
only when the internal normalized topology fingerprint changes. It resets on
integration reload and can advance when a registry change is hidden from a
particular user; clients should compare their returned fingerprint for content
changes. Two clients with the same permission view receive the same logical
content and fingerprint.

The snapshot returns `schemaVersion`, `topologyFingerprint`, `generatedAt` and
`rooms`. Each room has only `temperature` and `humidity`. A reading has
`configured`, `available`, numeric `value` or `null`, `unit` or `null`,
`sourceEntityId`, `updatedAt` and a status (`unconfigured`, `missing`,
`unavailable`, `unknown`, `invalid`, `available`). Only the explicitly configured
HA Area source is read. Runtime states are read on every snapshot request;
they are never included in the topology hash or cached as a House state dump.
Only `unit_of_measurement` is read from state attributes. No attributes object,
camera stream, person, alarm or location payload is returned.

## Authorization and minimal projection

The two backend commands are enforced by Domus Access using the existing
`rooms.view` capability. No `house.view` capability is introduced. The
connection's HA user is the principal; request fields cannot select another
user or request an administrative view. For non-admin users, each emitted
entity must pass `user.permissions.check_entity(entity_id, POLICY_READ)`; a
missing or failing permission check denies the entity. Administrators bypass
that HA entity check but still receive the safe House projection.

HOUSE.3 also emits HA-readable structural references for the domains used by
Rooms live controls: lights, climate, media players, covers, sensors, binary
sensors, switches, input booleans, fans, humidifiers, scenes, weather, locks
and cameras. A reference carries only the registry ID, current entity ID,
device/area assignment and device class. Camera streams, lock state, security
attributes, person and alarm entities remain outside House topology. The
existing HA live stream supplies runtime state under its own authorization.
Capability records still represent only the initial deterministic categories.
They indicate `present` and `permitted`; their
`available` value is `null` in topology because availability belongs to
runtime snapshots. A device is emitted only if it owns an emitted entity.
Consequently, registry-only devices and devices with only hidden or sensitive
entities remain internal to the resolver. The public `unassigned` list covers
the same filtered projection, so it cannot reveal hidden device IDs.

Rooms and floor names are part of the `rooms.view` house view. They are not
used to infer a room type or other AI semantics. The House API does not include
Security selections or Climate control details.

## Invalidation, cache and lifecycle

One `HouseManager` belongs to one HA config entry. The first request builds
the topology; registry updates mark it dirty, and the next request rebuilds it
under an async lock. The four official registry events cover floor, area,
device and entity changes on both supported versions. A 300-second
request-triggered expiry recovers missed events. An incomplete registry read
is retried on a request after 30 seconds. No background polling runs. State
changes do not mark topology dirty: the next snapshot reads current state.
On unload, listeners are removed, the cache is dropped and further requests
against the stopped manager fail safely. Reload creates a new manager.

## Boundaries and future work

`custom:*` Rooms and demo rooms remain browser-local and are absent from this
HA topology. `SharedHouseConfiguration` remains presentation configuration,
not a House store. Climate's `domusos.climate.v1`, zones, endpoints, plans and
physical execution are unchanged. HOUSE.3 can compare Rooms' current area
mapping with this resolver and migrate its **reads** incrementally. It must
preserve local custom-room data and the demo, and must not silently create HA
areas or alter Climate zone IDs.
