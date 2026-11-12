# Domus House Core contract — closeout

Status: frozen for the current House scope at base `e443d4aaefcbff20486b2df68f5eac03fda5bc35`. This document describes the implementation, not a new API. Earlier HOUSE.2–HOUSE.5C documents remain phase records; this is the current contract when their descriptions differ.

## Purpose and authority

Home Assistant (HA) floor, area, device and entity registries are the structural source of truth. House Core owns their read-side normalization, effective membership, room environmental context, structural issues, and topology revision/fingerprint. It does not persist a second house structure.

```text
Home Assistant registries
          ↓
      House Core
          ↓
 ┌────────┼──────────┬──────────┐
Rooms   Dashboard  Settings   Climate

HA states → live/domain runtime consumers
```

The dependency direction is Rooms/Dashboard/System/Climate → House. House imports no Dashboard, System/Settings, Climate or Energy module. Its shared access instrumentation only enforces authorization. Canonical structural reads come from House; writes go to native HA registry APIs. House has **zero write APIs, registry writes, HA service calls and physical actions**. The House schema remains `domusos.house.v1`; this closeout adds no dependency or runtime feature.

### Identity and topology

| Concept | Identity | Rule |
| --- | --- | --- |
| Floor | HA `floor_id` | HA registry order is preserved. |
| Room | HA `area_id` (`AreaEntry.id` server-side) | A room may reference a floor. |
| Device | HA device registry ID | Its `area_id` is its room assignment. |
| Entity | HA entity registry entry ID when present | `entity_id` is the current addressable runtime ID; it can change. |

The canonical chain is Floor → Room → Device → Entity. Effective entity room membership is `entity.area_id ?? device.area_id ?? null`. An explicit but invalid area remains explicit and produces an issue; it does not silently inherit the device area. Names are display labels, never identities. Unassigned and broken references are represented without inventing structure. `custom:*` rooms are presentation only; they are not HA Areas or canonical House rooms.

### Environment

House Environment is general room context. For each temperature/humidity metric, an explicitly configured HA Area primary is respected even when missing or unavailable. Without a primary, House selects only a conservative, HA-readable, room-assigned `sensor.*` with the matching device class, compatible unit and safe provenance. It does not infer suitability from a name or unit alone. If no candidate is safe, the reading is unavailable. Selection identity does not change merely because a live state changes. Climate Control Sensor is a separate Climate-domain control input; House Environment never automatically becomes its fallback.

HA 2025.1.0 lacks the Area environmental reference fields present in HA 2026.2.3. The safe fallback is therefore important for 2025.1. Both versions are in the existing private Linux CI compatibility matrix. The last HOUSE.5C run at this base (`43031764781`) reported HA 2025.1.0/Python 3.12: 1,671 passed, 1 skipped; HA 2026.2.3/Python 3.13: 1,732 passed. This closeout does not rerun that matrix. The real-environment QA record supplied for this closeout is: **Camera Mattia** manual primary refs preserved; **Cucina** battery humidity, **Giardino** flame temperature and **Soggiorno** printer ink humidity rejected as unsafe fallbacks. Preserve these cases as regression evidence; they are not Climate control inputs.

## Projections and permission freeze

Every WebSocket command accepts only transport `id` and `type`; the caller cannot select a different principal or request a wider projection. The HA user on the connection is the principal. Domus Access checks the capability; House filters entities by HA `POLICY_READ` for non-admin users. Admin bypasses that HA entity filter only within the authorized endpoint. There is no privilege bridge from a narrower capability to a broader one.

| Projection / endpoint | Consumer | Domus capability | HA requirement | Exposed scope / exclusions |
| --- | --- | --- | --- | --- |
| Public `domusos/house/get_topology` | Rooms | `rooms.view` | Per-entity HA `POLICY_READ` for non-admin | Filtered floors, rooms, devices with visible entities, entity structural refs, unassigned refs and issues; no raw states, sensitive payloads or controls. |
| Public `domusos/house/get_snapshot` | Rooms Environment | `rooms.view` | Same entity filter | Temperature/humidity scalar readings, source/provenance/status and diagnostics; no raw HA attribute map, history or control sensor selection. |
| Diagnostic `domusos/house/get_environment_shadow` | Admin real-environment comparison | `rooms.view` | HA admin | On-demand comparison of legacy vs House environmental selection; no history, subscription or writes. **SUPPORTED_DIAGNOSTIC**: keep it for real-environment regression investigations. |
| Dashboard `domusos/dashboard/get_house_context` | HomePanel, SensorPanel, Home Attention, Mobile Sidebar, Panel Editor | `dashboard.view` | Per-entity HA `POLICY_READ` for non-admin | Only referenced room ID/name, permitted non-security device/entity membership and revision. No full topology, other rooms, environment, security data or registry administration. |
| System `domusos/system/get_house_context` | Settings Rooms, Entities, Devices | `system.manage` | HA admin | Minimal room ID/name and effective device/entity membership, including hidden/disabled inventory entries for the administrator. No full House topology, state data or inventory ownership. |
| Climate internal manager `async_get_room_contexts` / room choices | Climate config and linked zones | `climate.view` for config context; `climate.manage` + HA admin for room choices | HA-readable entity filtering for context; admin for choices | Requested linked rooms, floor labels, environmental scalar readings/status and issues, or minimal room choices. No public House WS hop, unrelated rooms, device inventory, raw attributes or automatic control fallback. |

The public topology response contains `schemaVersion`, `topologyRevision`, `topologyFingerprint`, `generatedAt`, `floors`, `rooms`, `devices`, `entities`, `unassigned`, and `issues`. The snapshot contains `schemaVersion`, `topologyFingerprint`, `generatedAt`, `rooms` and runtime `issues`. The existing `domusos.house.v1` shape is unchanged. Dashboard and System use their own versioned, narrower schemas; neither is a second general topology API. Settings inventory remains HA registries and HA states, while its room context comes from House.

## Invalidation and freshness

One HouseManager is attached to each HA config entry. Floor, area, device and entity registry update events mark its structural cache dirty. The next request rebuilds under a lock. A 300-second request-triggered expiry recovers missed events; incomplete registry reads retry after 30 seconds. There is no background House poll. HA state changes do not invalidate topology; a snapshot reads current states on request, with a new `generatedAt` and the same fingerprint when structural content is unchanged.

`topologyFingerprint` is the SHA-256 of deterministic, authorized structural content, excluding revision, generation time and runtime states; it is the content comparison key for a given permission view. `topologyRevision` starts at 1 per manager lifetime and resets on integration reload. **Current implementation detail:** a dirty registry event increments the manager revision on rebuild even when the resulting internal fingerprint is unchanged; expiry without a dirty event increments it only if content changed. A revision increment alone therefore does not prove a visible structural change. This corrects the simplified HOUSE.2 phase description without changing runtime behavior. Snapshot freshness is request time, not a guarantee of immediate push delivery.

Rooms fetches topology on connection and explicit refresh, then polls every 30 seconds; its environment snapshot refreshes after topology changes and selected source state changes. Dashboard fetches its projection on connection and every 30 seconds, and on focus/visibility. Settings fetches its projection on connection and every 30 seconds, on focus/visibility and after its observed registry revision changes, clearing stale membership while it refreshes. Reconnect changes the relevant connection/session state and triggers fresh requests. **Known limitation:** structural UI refresh can be delayed up to the recovery polling interval when no focus, visibility or reconnect event occurs. This is accepted for closeout.

## Ownership and canonical consumer map

| Concept | Canonical owner | Read source | Write source | Consumers |
| --- | --- | --- | --- | --- |
| Floors, rooms | HA registries, normalized by House | House topology or narrow projection | Native HA registry API | Rooms, Settings, Climate room choices |
| Device/entity effective membership | House read-side | House topology, Dashboard/System projection | Native HA registry API | Rooms, Home panels, Home Attention, Mobile Sidebar, Panel Editor, Settings Entities/Devices |
| General room environment | House | House snapshot or Climate internal room context | HA Area reference configuration via native registry API | Rooms Environment, Climate display context |
| Device/entity administrative inventory | HA registries | HA registry lists and HA states | Native HA registry API | Settings Devices/Entities |
| Climate control/strategy | Climate | Climate store/runtime and its own sensor refs | Climate authorized APIs | Climate UI/runtime |
| Dashboard layout | Dashboard configuration | `SharedHouseConfiguration.dashboard` | Dashboard configuration repository | Home/Panel Editor |
| Security policy and camera privacy | Security/Camera domain | Existing domain-specific paths | Domain-specific APIs | Security/Camera UI |
| Custom rooms | Rooms presentation | Browser/demo/local presentation config | Rooms presentation config | Rooms demo/custom views |

Active House consumers: Rooms and Rooms Environment; Settings Rooms read-side; Climate linked room context and room choices; HomePanel; SensorPanel; Home Attention; Mobile Sidebar; Panel Editor same-room grouping; Settings Entities room context; Settings Devices room context. HA states continue to supply live/domain runtime data separately.

House does **not** own dashboard layout, custom room presentation, labels/favorites, device or entity administration, HA registry writes, Climate control sensors or strategy, Energy topology, Profile device ownership, Security policy, camera privacy, person data, automations or Domus Intelligence. `SharedHouseConfiguration.dashboard` and `.rooms` are **PRESENTATION**; `.security` is **DOMAIN_CONFIGURATION**; `revision`/`publication` are configuration metadata; `customRooms`/`hiddenEntitiesByRoom` remain legacy/presentation fields and are not House topology.

## Final static authority audit

Searches covered frontend `areaId`/`area_id`/effective membership and device→area maps, plus backend registry imports and House import direction. The table groups every residual structural reconstruction or direct registry read outside the canonical House implementation; ordinary use of House-projected room IDs is a consumer, not another authority.

| Residual location | Classification | Reason / boundary |
| --- | --- | --- |
| `src/services/setupWizard.ts` | INTENTIONALLY_HA_DIRECT | Initial setup/discovery scans unassigned devices with retry semantics, not runtime topology. |
| `src/pages/rooms/roomManagement.ts`, `useRoomManagement.ts`, `RoomsManagePage.tsx`, `RoomManageSheets.tsx`, `RoomsPage.tsx` assignment targets; `src/components/rooms/roomsDirectory.ts` assignment helper | WRITE_PATH_ONLY | Prepare/present native HA registry edits and temporary optimistic state. |
| `src/components/settings/SettingsRoomsManager.tsx` floor/area edits | WRITE_PATH_ONLY | Native HA registry write UI; its device counts read House-projected devices. |
| `src/pages/SettingsDashboard.tsx` registry revision input; `SettingsEntitiesList.tsx`, `SettingsDevicesList.tsx`; `src/services/haRegistryPresentation.ts`; `src/hooks/useHaLiveConnection.ts` area parsing | INTENTIONALLY_HA_DIRECT / PRESENTATION_ONLY | Administrative inventory/health, live HA bridge and write/change detection; room labels/membership for Settings come from System House projection. Registry parsing alone is not a structural authority. |
| `src/services/settingsHouseContext.ts` demo projection; `src/components/dashboard/sidebarQuickCard.ts` demo path; `src/hooks/useHaPanelBridgeConnection.ts` demo registry adapter; dev lab fixtures | DEMO_OR_OFFLINE | Explicit local/demo projection only; connected runtime uses House. |
| `src/components/rooms/roomsDirectory.ts` environment resolver and `RoomsPage.tsx` demo/custom branch | DEMO_OR_OFFLINE | Needed for Demo/local custom rooms and legacy shadow comparison. Never used for connected HA room readings. |
| `src/components/rooms/roomsDirectory.ts` `buildDeviceAreaMap`/`buildEntityAreaMap` | LEGACY_DEAD_CODE | Zero production/demo/offline/diagnostic callers, but `src/services/houseCore.test.ts` uses them for legacy parity; test-required, so **retained** under the safe delete rule. |
| `src/components/devices/panels/panelData.ts` `fetchRegistry`; AlarmPanel, security sensor/HomePanel paths | SECURITY_DEFERRED | Legacy room map limited to alarm/binary sensor/security contexts pending policy/privacy review. |
| `src/components/homeAttention/homeAttentionEngine.ts` security-domain and undefined-context compatibility path | SECURITY_DEFERRED / DEMO_OR_OFFLINE | Real non-security shell supplies House; security and offline compatibility retain old mapping. |
| `src/components/panelEditor/deviceEntities.ts` security-domain and undefined-context branch | SECURITY_DEFERRED / DEMO_OR_OFFLINE | Non-security same-room comes from Dashboard House projection. |
| `src/components/dashboard/mainboard/mainBoardCameraModel.ts` | SECURITY_DEFERRED | Camera-specific metadata pending privacy boundary. |
| `src/components/dashboard/MainBoard.tsx` registry lists, `useHaLiveConnection.ts` area list | DOMAIN_SPECIFIC / PRESENTATION_ONLY | Home loads entity/device technical inventory, favorites labels and HA area display data for domain widgets; House projection supplies normal Home room membership. |
| `src/components/dashboard/MainBoard.tsx`, `RightSidebarManager.tsx`, `mainboard/useVacuumCommands.ts`, `settings/ContextSidebar.tsx` vacuum device area and mapped cleaning areas | DOMAIN_SPECIFIC | Vacuum technical metadata/command targets, not general room membership. |
| `custom_components/domusos/energy/discovery.py` | DOMAIN_SPECIFIC | Energy technical entity/device discovery, not physical room authority. |
| `custom_components/domusos/climate/models.py`, `validation.py`, `manager.py` zone `areaId` | DOMAIN_SPECIFIC | Climate zone linkage and validation use House room choices/context; Climate owns its own zone IDs and control refs. |
| `custom_components/domusos/profile/devices.py`, `mobile_app.py`, `targets.py` | DOMAIN_SPECIFIC | Device ownership, mobile registration, notify/presence targets. |
| `custom_components/domusos/device_power/manager.py`, `irrigation/manager.py`, `waste_collection/manager.py` | DOMAIN_SPECIFIC | Entity existence/control-domain validation, no physical room reconstruction. |
| Labels/favorites and `SharedHouseConfiguration` | PRESENTATION_ONLY | User/presentation preferences and configuration metadata; never canonical room identity. |

`SECURITY_HOUSE_INTEGRATION = DEFERRED_BY_PERMISSION_BOUNDARY`; this is an explicit non-consumer, not an unclassified authority. Onboarding, Energy technical discovery, Profile, Labels, Demo/local presentation and HA registry write paths remain intentional non-consumers. There is no grouping by room name as an identity rule in the current canonical scope. **Unclassified structural authorities: 0.** No helper meets all five zero-caller conditions for safe deletion, so this closeout deletes no source code.

## Future boundary and gates

`HOUSE_4B_REQUIRED_NOW = NO`. Any further House/Climate rationalization belongs to Climate evolution. CLM.3D execution behavior is unchanged and physical QA has not been run in this closeout. A future Domus Intelligence may receive an authorized, minimal, permission-aware, domain-composed, immutable/read-only and provenance-aware `HouseContext`; it should not read raw HA registries. No Intelligence schema or API is defined here.

```text
HOUSE_CORE_CANONICAL_COVERAGE = COMPLETE_FOR_CURRENT_SCOPE
HOUSE_CORE_CLOSEOUT = PASS
HOUSE_CORE_CONTRACT_FROZEN = YES
HOUSE_CORE_UNCLASSIFIED_AUTHORITIES = 0
HOUSE_LEGACY_DEAD_CODE = NONE_SAFE_TO_REMOVE
READY_FOR_CLM3D_PHYSICAL_QA = YES
READY_FOR_DOMUS_INTELLIGENCE_FOUNDATION = BLOCKED_BY_CLM3D_PHYSICAL_QA
```
