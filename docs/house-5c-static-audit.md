# HOUSE.5C static room authority audit

Search: `rg -n 'areaId|area_id|effectiveAreaId|deviceArea|roomOf' src` and targeted searches for `entity.area_id ?? device.area_id` and equivalents. This classification covers the production code paths that still read HA room assignment after Settings Entities and Devices moved to House Core.

| Location | Remaining use | Classification |
| --- | --- | --- |
| `src/services/settingsHouseContext.ts` `demoSettingsHouseContext` | Build an explicit offline fixture from demo registries | DEMO/OFFLINE |
| `src/services/setupWizard.ts` | Identify unassigned devices during first setup scan | INTENTIONALLY_HA_DIRECT |
| `src/components/devices/panels/panelData.ts` `fetchRegistry` | Legacy alarm and binary sensor room context | SECURITY_DEFERRED |
| `src/components/homeAttention/homeAttentionEngine.ts` `resolveContext` | Security domains use the legacy registry association; `houseContext === undefined` is a compatibility path, while the real Home shell supplies `null` if House is unavailable | SECURITY_DEFERRED / LEGACY_DEAD_CODE |
| `src/components/dashboard/sidebarQuickCard.ts` | Build the local demo quick card | DEMO/OFFLINE |
| `src/components/dashboard/mainboard/mainBoardCameraModel.ts` | Camera-specific device metadata | SECURITY_DEFERRED |
| `src/components/dashboard/MainBoard.tsx` vacuum `deviceInfo.areaId` | Vacuum-specific technical metadata, not the Home room projection | DOMAIN_SPECIFIC |
| `src/components/rooms/roomsDirectory.ts` `buildDeviceAreaMap` and `buildEntityAreaMap` | No production callers; retained by a legacy parity test | LEGACY_DEAD_CODE |
| `src/pages/rooms/RoomsPage.tsx` assignment target selection and `src/pages/rooms/roomManagement.ts` | Choose native HA registry write target and hold temporary write presentation | WRITE_PATH_ONLY |
| `src/components/settings/SettingsRoomsManager.tsx` device counts | Reads House topology devices, not HA registry devices | HOUSE_CORE |
| `src/components/settings/SettingsDevicesList.tsx` room grouping/filter | Reads `projectSettingsDeviceRooms` values from the Settings House context | HOUSE_CORE |
| `src/components/panelEditor/DeviceTab.tsx` and `src/components/editor/EntityPicker.tsx` | Group already projected picker items by House room ID | HOUSE_CORE |

Settings Entities continues to union runtime states and HA entity registry entries for its administrative inventory. Settings Devices continues to enumerate HA device registry entries and compute health from HA states. The Settings House endpoint returns only room IDs/names and effective memberships; the public `domusos.house.v1` schema is unchanged.

Unclassified parallel physical topology consumers in the current scope: **0**. Security and Camera retain their own permission review, and the dead Rooms helper is left for a separate cleanup.
