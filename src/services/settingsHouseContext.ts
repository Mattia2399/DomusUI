import type { HaArea } from '../hooks/useHaLiveConnection';
import type { HaDeviceRegistryEntry, HaEntityRegistryEntry } from './haRegistryPresentation';

export const SETTINGS_HOUSE_SCHEMA = 'domusos.system.house.v1';

export type SettingsHouseContext = {
  schemaVersion: typeof SETTINGS_HOUSE_SCHEMA;
  topologyRevision: number;
  rooms: Array<{ id: string; name: string }>;
  devices: Array<{ id: string; roomId: string | null }>;
  entities: Array<{ registryId: string | null; entityId: string; effectiveRoomId: string | null }>;
};

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const nullableString = (value: unknown) => value === null || typeof value === 'string';

export function parseSettingsHouseContext(value: unknown): SettingsHouseContext {
  if (!record(value) || value.schemaVersion !== SETTINGS_HOUSE_SCHEMA ||
      !Number.isInteger(value.topologyRevision) || !Array.isArray(value.rooms) ||
      !Array.isArray(value.devices) || !Array.isArray(value.entities) ||
      !value.rooms.every((room) => record(room) && typeof room.id === 'string' && typeof room.name === 'string') ||
      !value.devices.every((device) => record(device) && typeof device.id === 'string' && nullableString(device.roomId)) ||
      !value.entities.every((entity) => record(entity) && nullableString(entity.registryId) &&
        typeof entity.entityId === 'string' && nullableString(entity.effectiveRoomId))) {
    throw new Error('Invalid Settings House context');
  }
  return value as SettingsHouseContext;
}

export async function fetchSettingsHouseContext(
  callApi: (message: Record<string, unknown>, options?: { reportError?: boolean; throwOnError?: boolean }) => Promise<unknown>,
): Promise<SettingsHouseContext> {
  return parseSettingsHouseContext(await callApi(
    { type: 'domusos/system/get_house_context' }, { reportError: false, throwOnError: true },
  ));
}

export function settingsHouseLookups(context: SettingsHouseContext | null) {
  const roomNames = new Map(context?.rooms.map((room) => [room.id, room.name] as const) ?? []);
  const devices = new Map(context?.devices.map((device) => [device.id, device] as const) ?? []);
  const entitiesById = new Map(context?.entities.map((entity) => [entity.entityId, entity] as const) ?? []);
  const entitiesByRegistryId = new Map(context?.entities.filter((entity) => entity.registryId !== null)
    .map((entity) => [entity.registryId as string, entity] as const) ?? []);
  const validRoom = (roomId: string | null | undefined) => roomId && roomNames.has(roomId) ? roomId : null;
  return {
    roomNames,
    deviceRoomId: (deviceId: string) => validRoom(devices.get(deviceId)?.roomId),
    entityRoomId: (entityId: string, registryId?: string) => {
      const entry = registryId ? entitiesByRegistryId.get(registryId) ?? entitiesById.get(entityId) : entitiesById.get(entityId);
      return validRoom(entry?.effectiveRoomId);
    },
    roomName: (roomId: string | null | undefined) => roomNames.get(roomId ?? '') ?? undefined,
  };
}

/** Add physical room presentation to HA health rows without changing health logic. */
export function projectSettingsDeviceRooms<T extends { id: string; areaId?: string; areaName?: string; roomContextUnavailable?: boolean }>(
  devices: T[], context: SettingsHouseContext | null,
): T[] {
  const house = settingsHouseLookups(context);
  return devices.map((device) => {
    const roomId = house.deviceRoomId(device.id) ?? undefined;
    return {
      ...device,
      areaId: roomId,
      areaName: house.roomName(roomId),
      roomContextUnavailable: !context,
    };
  });
}

/** Explicit offline fixture only; real Settings never reconstructs rooms from HA registries. */
export function demoSettingsHouseContext(
  areas: HaArea[], devices: HaDeviceRegistryEntry[], entities: HaEntityRegistryEntry[],
): SettingsHouseContext {
  return {
    schemaVersion: SETTINGS_HOUSE_SCHEMA,
    topologyRevision: 0,
    rooms: areas.map((area) => ({ id: area.area_id, name: area.name })),
    devices: devices.map((device) => ({ id: device.id, roomId: device.areaId ?? null })),
    entities: entities.map((entity) => ({
      registryId: entity.registryId ?? null,
      entityId: entity.entityId,
      effectiveRoomId: entity.areaId ?? devices.find((device) => device.id === entity.deviceId)?.areaId ?? null,
    })),
  };
}
