import type { HaArea } from '../hooks/useHaLiveConnection';
import type { HaFloorEntry, HaRegistryEntityEntry, RoomsApiCall } from '../components/rooms/roomsDirectory';

export const HOUSE_SCHEMA = 'domusos.house.v1';

export type HouseFloor = { id: string; name: string; level: number | null; aliases: string[]; order: number };
export type HouseRoom = {
  id: string; name: string; floorId: string | null; aliases: string[];
  icon: string | null; picture: string | null;
  temperatureEntityId: string | null; humidityEntityId: string | null;
};
export type HouseDevice = { id: string; name: string; areaId: string | null };
export type HouseEntity = {
  entityId: string; registryId: string | null; domain: string; deviceId: string | null;
  explicitAreaId: string | null; effectiveAreaId: string | null; deviceClass: string | null;
};
export type HouseIssue = { code: string; subjectId: string; referenceId: string | null };
export type HouseTopology = {
  schemaVersion: typeof HOUSE_SCHEMA; topologyRevision: number; topologyFingerprint: string; generatedAt: string;
  floors: HouseFloor[]; rooms: HouseRoom[]; devices: HouseDevice[]; entities: HouseEntity[];
  unassigned: { deviceIds: string[]; entityIds: string[] }; issues: HouseIssue[];
};
export type HouseReading = {
  configured: boolean; available: boolean; value: number | null; unit: string | null;
  sourceEntityId: string | null; updatedAt: string | null; status: string;
  metric: 'temperature' | 'humidity'; configuredPrimaryEntityId: string | null;
  selectedEntityId: string | null; selectionSource: 'HA_AREA_PRIMARY' | 'SAFE_ROOM_FALLBACK' | 'NONE';
  selectionReason: string; fallbackUsed: boolean;
};
export type HouseSnapshot = {
  schemaVersion: typeof HOUSE_SCHEMA; topologyFingerprint: string; generatedAt: string;
  rooms: Array<{ roomId: string; temperature: HouseReading; humidity: HouseReading }>;
  issues?: HouseIssue[];
};

const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const string = (value: unknown): value is string => typeof value === 'string';
const nullableString = (value: unknown) => value === null || string(value);
const stringArray = (value: unknown) => Array.isArray(value) && value.every(string);

export function parseHouseTopology(value: unknown): HouseTopology {
  if (!record(value) || value.schemaVersion !== HOUSE_SCHEMA || !string(value.topologyFingerprint) ||
      !Number.isInteger(value.topologyRevision) || !string(value.generatedAt) ||
      !Array.isArray(value.floors) || !Array.isArray(value.rooms) || !Array.isArray(value.devices) ||
      !Array.isArray(value.entities) || !record(value.unassigned) || !stringArray(value.unassigned.deviceIds) ||
      !stringArray(value.unassigned.entityIds) || !Array.isArray(value.issues)) {
    throw new Error('Invalid House topology');
  }
  if (!value.floors.every((entry) => record(entry) && string(entry.id) && string(entry.name) &&
      (entry.level === null || Number.isInteger(entry.level)) && stringArray(entry.aliases) && Number.isInteger(entry.order)) ||
      !value.rooms.every((entry) => record(entry) && string(entry.id) && string(entry.name) &&
        nullableString(entry.floorId) && stringArray(entry.aliases) && nullableString(entry.icon) &&
        nullableString(entry.picture) && nullableString(entry.temperatureEntityId) && nullableString(entry.humidityEntityId)) ||
      !value.devices.every((entry) => record(entry) && string(entry.id) && string(entry.name) && nullableString(entry.areaId)) ||
      !value.entities.every((entry) => record(entry) && string(entry.entityId) && nullableString(entry.registryId) &&
        string(entry.domain) && nullableString(entry.deviceId) && nullableString(entry.explicitAreaId) &&
        nullableString(entry.effectiveAreaId) && nullableString(entry.deviceClass)) ||
      !value.issues.every((entry) => record(entry) && string(entry.code) && string(entry.subjectId) && nullableString(entry.referenceId))) {
    throw new Error('Invalid House topology entries');
  }
  return value as HouseTopology;
}

export async function fetchHouseTopology(callApi: RoomsApiCall): Promise<HouseTopology> {
  return parseHouseTopology(await callApi({ type: 'domusos/house/get_topology' }, { reportError: false, throwOnError: true }));
}

export async function fetchHouseSnapshot(callApi: RoomsApiCall): Promise<HouseSnapshot> {
  const value = await callApi({ type: 'domusos/house/get_snapshot' }, { reportError: false, throwOnError: true });
  if (!record(value) || value.schemaVersion !== HOUSE_SCHEMA || !string(value.topologyFingerprint) ||
      !string(value.generatedAt) || !Array.isArray(value.rooms) ||
      !value.rooms.every((room) => record(room) && string(room.roomId) &&
        (['temperature', 'humidity'] as const).every((metric) => {
          const reading = room[metric];
          return record(reading) && reading.metric === metric && nullableString(reading.configuredPrimaryEntityId) &&
            nullableString(reading.selectedEntityId) &&
            ['HA_AREA_PRIMARY', 'SAFE_ROOM_FALLBACK', 'NONE'].includes(String(reading.selectionSource)) &&
            string(reading.selectionReason) && typeof reading.available === 'boolean' &&
            (reading.value === null || typeof reading.value === 'number') && typeof reading.fallbackUsed === 'boolean';
        }))) throw new Error('Invalid House snapshot');
  return value as HouseSnapshot;
}

/** A shape adapter for existing Rooms presentation. No relationship is recomputed here. */
export function projectHouseForRooms(topology: HouseTopology) {
  const areas: HaArea[] = topology.rooms.map((room) => ({
    area_id: room.id, name: room.name, floor_id: room.floorId, aliases: room.aliases,
    icon: room.icon, picture: room.picture ?? undefined,
    temperature_entity_id: room.temperatureEntityId, humidity_entity_id: room.humidityEntityId,
  }));
  const floors: HaFloorEntry[] = [...topology.floors].sort((a, b) => a.order - b.order).map((floor) => ({
    floor_id: floor.id, name: floor.name, aliases: floor.aliases, level: floor.level,
  }));
  const registryEntities: HaRegistryEntityEntry[] = topology.entities.map((entity) => ({
    entityId: entity.entityId, registryId: entity.registryId, deviceId: entity.deviceId, areaId: entity.explicitAreaId,
    name: null, originalName: null, disabledBy: null, hiddenBy: null, platform: null,
  }));
  const entityAreaByEntityId = Object.fromEntries(topology.entities
    .filter((entity) => entity.effectiveAreaId !== null)
    .map((entity) => [entity.entityId, entity.effectiveAreaId as string]));
  return {
    areas, floors, registryEntities, entityAreaByEntityId,
    visibleEntityIds: new Set(topology.entities.map((entity) => entity.entityId)),
    unassignedEntityIds: new Set(topology.unassigned.entityIds),
    unassignedDeviceIds: new Set(topology.unassigned.deviceIds),
    devices: topology.devices,
  };
}

export type EnvironmentComparison = 'MATCH' | 'LEGACY_FALLBACK_ONLY' | 'HOUSE_PRIMARY_ONLY' |
  'UNAVAILABLE' | 'DIFFERENT_SOURCE' | 'DIFFERENT_VALUE';

export function compareEnvironment(
  legacy: { value: number | undefined; sourceEntityId: string | null },
  house: HouseReading,
): EnvironmentComparison {
  if (legacy.value === undefined && !house.available) return 'UNAVAILABLE';
  if (legacy.value !== undefined && !house.available) return 'LEGACY_FALLBACK_ONLY';
  if (legacy.value === undefined && house.available) return 'HOUSE_PRIMARY_ONLY';
  if (legacy.sourceEntityId !== house.sourceEntityId) return 'DIFFERENT_SOURCE';
  return legacy.value === house.value ? 'MATCH' : 'DIFFERENT_VALUE';
}
