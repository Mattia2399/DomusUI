import type { MockEntityState } from '../../types/ha';

/*
 * Rooms, the entities in them and the Home Assistant registry that places
 * them: plain functions shared by the Rooms pages. Moved from RoomsDashboard
 * unchanged.
 */

export type RoomsApiCall = (
  message: Record<string, unknown>,
  options?: { reportError?: boolean },
) => Promise<unknown | null>;

export const ROOM_ID_CUSTOM_PREFIX = 'custom:';

export type RoomTab = {
  id: string;
  name: string;
  source: 'ha' | 'custom';
};

export type RoomEntityBuckets = {
  lights: string[];
  climates: string[];
  locks: string[];
  medias: string[];
  switches: string[];
  sensors: string[];
  covers: string[];
  cameras: string[];
  weathers: string[];
  others: string[];
};

export type HaRegistryEntityEntry = {
  entityId: string;
  deviceId: string | null;
  areaId: string | null;
  name: string | null;
  originalName: string | null;
  disabledBy: string | null;
  hiddenBy: string | null;
  platform: string | null;
};

export type HaRegistryDeviceEntry = {
  id: string;
  areaId: string | null;
  name: string;
  nameByUser: string | null;
  manufacturer: string | null;
  model: string | null;
};

export type RegistrySnapshot = {
  entityAreaByEntityId: Record<string, string>;
  registryEntities: HaRegistryEntityEntry[];
  registryDevices: HaRegistryDeviceEntry[];
};

export const DEMO_ROOM_TABS: RoomTab[] = [
  { id: 'demo-living-room', name: 'Soggiorno', source: 'custom' },
  { id: 'demo-bedroom', name: 'Camera', source: 'custom' },
  { id: 'demo-kitchen', name: 'Cucina', source: 'custom' },
  { id: 'demo-bathroom', name: 'Bagno', source: 'custom' },
];

export function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function toTitleCase(value: string) {
  return value
    .split('_')
    .map((token) => (token ? `${token[0].toUpperCase()}${token.slice(1)}` : token))
    .join(' ');
}

export function normalizeRoomName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export function getEntityFriendlyName(entityId: string, state?: MockEntityState) {
  const friendly = state?.rawAttributes?.friendly_name;
  if (typeof friendly === 'string' && friendly.trim().length > 0) {
    return friendly.trim();
  }
  const fallback = entityId.split('.').at(1) ?? entityId;
  return toTitleCase(fallback);
}

export function createEmptyBuckets(): RoomEntityBuckets {
  return {
    lights: [],
    climates: [],
    locks: [],
    medias: [],
    switches: [],
    sensors: [],
    covers: [],
    cameras: [],
    weathers: [],
    others: [],
  };
}

export function bucketEntityId(entityId: string, buckets: RoomEntityBuckets) {
  const domain = entityId.split('.')[0];
  if (domain === 'light') {
    buckets.lights.push(entityId);
    return;
  }
  if (domain === 'climate' || domain === 'humidifier') {
    buckets.climates.push(entityId);
    return;
  }
  if (domain === 'lock') {
    buckets.locks.push(entityId);
    return;
  }
  if (domain === 'media_player') {
    buckets.medias.push(entityId);
    return;
  }
  if (domain === 'switch' || domain === 'input_boolean' || domain === 'fan') {
    buckets.switches.push(entityId);
    return;
  }
  if (domain === 'sensor' || domain === 'binary_sensor') {
    buckets.sensors.push(entityId);
    return;
  }
  if (domain === 'cover') {
    buckets.covers.push(entityId);
    return;
  }
  if (domain === 'camera') {
    buckets.cameras.push(entityId);
    return;
  }
  if (domain === 'weather') {
    buckets.weathers.push(entityId);
    return;
  }
  buckets.others.push(entityId);
}

export function filterRoomEntityBuckets(
  buckets: RoomEntityBuckets,
  predicate: (entityId: string) => boolean,
): RoomEntityBuckets {
  return {
    lights: buckets.lights.filter(predicate),
    climates: buckets.climates.filter(predicate),
    locks: buckets.locks.filter(predicate),
    medias: buckets.medias.filter(predicate),
    switches: buckets.switches.filter(predicate),
    sensors: buckets.sensors.filter(predicate),
    covers: buckets.covers.filter(predicate),
    cameras: buckets.cameras.filter(predicate),
    weathers: buckets.weathers.filter(predicate),
    others: buckets.others.filter(predicate),
  };
}

export function getRoomSectionEntityIds(sectionId: string, buckets: RoomEntityBuckets) {
  if (sectionId === 'lights') {
    return buckets.lights;
  }
  if (sectionId === 'switches') {
    return buckets.switches;
  }
  if (sectionId === 'lights_switches') {
    return [...buckets.lights, ...buckets.switches];
  }
  if (sectionId === 'clima') {
    return buckets.climates;
  }
  if (sectionId === 'media') {
    return buckets.medias;
  }
  if (sectionId === 'sensors') {
    return buckets.sensors;
  }
  if (sectionId === 'security') {
    return [...buckets.locks, ...buckets.cameras];
  }
  if (sectionId === 'accessories') {
    return uniqueStrings([
      ...buckets.covers,
      ...buckets.weathers,
      ...buckets.others.filter((entityId) => !entityId.startsWith('automation.') && !entityId.startsWith('script.')),
    ]);
  }
  return [];
}

export function readTrimmedRecordString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'string' ? value.trim() : '';
}

export function extractRegistryArray(payload: unknown, key: 'entities' | 'devices') {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const record = payload as Record<string, unknown>;
  const direct = record[key];
  if (Array.isArray(direct)) {
    return direct;
  }
  const result = record.result;
  if (result && typeof result === 'object') {
    const resultDirect = (result as Record<string, unknown>)[key];
    if (Array.isArray(resultDirect)) {
      return resultDirect;
    }
  }
  return [];
}

export function parseRegistryEntityEntries(payload: unknown): HaRegistryEntityEntry[] {
  return extractRegistryArray(payload, 'entities')
    .map((entry): HaRegistryEntityEntry | null => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const entityId = readTrimmedRecordString(record, 'entity_id');
      if (!entityId) {
        return null;
      }
      const deviceId = readTrimmedRecordString(record, 'device_id');
      const areaId = readTrimmedRecordString(record, 'area_id');
      const name = readTrimmedRecordString(record, 'name') || readTrimmedRecordString(record, 'name_by_user');
      const originalName = readTrimmedRecordString(record, 'original_name');
      const disabledBy = readTrimmedRecordString(record, 'disabled_by');
      const hiddenBy = readTrimmedRecordString(record, 'hidden_by');
      const platform = readTrimmedRecordString(record, 'platform');
      return {
        entityId,
        deviceId: deviceId || null,
        areaId: areaId || null,
        name: name || null,
        originalName: originalName || null,
        disabledBy: disabledBy || null,
        hiddenBy: hiddenBy || null,
        platform: platform || null,
      };
    })
    .filter((entry): entry is HaRegistryEntityEntry => entry !== null);
}

export function parseRegistryDeviceEntries(payload: unknown): HaRegistryDeviceEntry[] {
  return extractRegistryArray(payload, 'devices')
    .map((entry): HaRegistryDeviceEntry | null => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const id = readTrimmedRecordString(record, 'id') || readTrimmedRecordString(record, 'device_id');
      if (!id) {
        return null;
      }
      const nameByUser = readTrimmedRecordString(record, 'name_by_user');
      const manufacturer = readTrimmedRecordString(record, 'manufacturer');
      const model = readTrimmedRecordString(record, 'model');
      const registryName =
        nameByUser ||
        readTrimmedRecordString(record, 'name') ||
        readTrimmedRecordString(record, 'original_name') ||
        model ||
        id;
      const areaId = readTrimmedRecordString(record, 'area_id');
      return {
        id,
        areaId: areaId || null,
        name: registryName,
        nameByUser: nameByUser || null,
        manufacturer: manufacturer || null,
        model: model || null,
      };
    })
    .filter((entry): entry is HaRegistryDeviceEntry => entry !== null);
}

export function buildDeviceAreaMap(registryDevices: HaRegistryDeviceEntry[]) {
  return registryDevices.reduce<Record<string, string>>((acc, device) => {
    if (device.areaId) {
      acc[device.id] = device.areaId;
    }
    return acc;
  }, {});
}

export function buildEntityAreaMap(
  registryEntities: HaRegistryEntityEntry[],
  deviceAreaByDeviceId: Record<string, string>,
) {
  const result: Record<string, string> = {};
  registryEntities.forEach((entry) => {
    if (entry.areaId) {
      result[entry.entityId] = entry.areaId;
      return;
    }
    if (!entry.deviceId) {
      return;
    }
    const areaFromDevice = deviceAreaByDeviceId[entry.deviceId];
    if (areaFromDevice) {
      result[entry.entityId] = areaFromDevice;
    }
  });
  return result;
}

export async function fetchRegistrySnapshot(
  onCallApi: RoomsApiCall,
): Promise<RegistrySnapshot> {
  const [entityPayload, devicePayload] = await Promise.all([
    (await onCallApi({ type: 'config/entity_registry/list' }, { reportError: false })) ??
      (await onCallApi({ type: 'config/entity_registry/list_for_display' }, { reportError: false })),
    (await onCallApi({ type: 'config/device_registry/list' }, { reportError: false })) ??
      (await onCallApi({ type: 'config/device_registry/list_for_display' }, { reportError: false })),
  ]);
  const registryDevices = parseRegistryDeviceEntries(devicePayload);
  const registryEntities = parseRegistryEntityEntries(entityPayload);
  const deviceAreaByDeviceId = buildDeviceAreaMap(registryDevices);
  const entityAreaByEntityId = buildEntityAreaMap(registryEntities, deviceAreaByDeviceId);
  return { entityAreaByEntityId, registryEntities, registryDevices };
}

/** The Home Assistant areas, as rooms, in their order. */
export function toHaRoomTabs(areas: Array<{ area_id: string; name: string }>): RoomTab[] {
  return areas.map((area) => ({
    id: area.area_id,
    name: area.name,
    source: 'ha',
  }));
}

/** The rooms kept only in this browser, oldest first. */
export function toCustomRoomTabs(customRooms: Array<{ id: string; name: string; createdAt: number }>): RoomTab[] {
  return [...customRooms]
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((room) => ({
      id: room.id,
      name: room.name,
      source: 'custom',
    }));
}

/** Areas first, then local rooms; the demo rooms when there are none at all. */
export function mergeRoomTabs(haRoomTabs: RoomTab[], customRoomTabs: RoomTab[], runtimeMode: string): RoomTab[] {
  const merged = [...haRoomTabs, ...customRoomTabs];
  return merged.length > 0 ? merged : runtimeMode === 'demo' ? DEMO_ROOM_TABS : [];
}

/** A device with its entities, or entities on their own, to place in an area. */
export type RoomAreaTarget = {
  kind: 'device' | 'entity';
  deviceId?: string;
  entityIds: string[];
};

/*
 * Places the targets in an area (null: in none). A device moves with its
 * entities; an entity that has its own area is moved too, so it follows.
 * Throws at the first update Home Assistant refuses.
 */
export async function assignRoomAreaTargets(
  onCallApi: RoomsApiCall,
  targets: RoomAreaTarget[],
  normalizedAreaId: string | null,
  hasOwnArea: (entityId: string) => boolean,
) {
  for (const target of targets) {
    if (target.kind === 'device' && target.deviceId) {
      const deviceResult = await onCallApi({
        type: 'config/device_registry/update',
        device_id: target.deviceId,
        area_id: normalizedAreaId,
      });
      if (deviceResult === null) {
        throw new Error('device update failed');
      }

      const directEntityIds = target.entityIds.filter(hasOwnArea);
      for (const entityId of directEntityIds) {
        const entityResult = await onCallApi({
          type: 'config/entity_registry/update',
          entity_id: entityId,
          area_id: normalizedAreaId,
        });
        if (entityResult === null) {
          throw new Error('entity update failed');
        }
      }
      continue;
    }

    for (const entityId of target.entityIds) {
      const entityResult = await onCallApi({
        type: 'config/entity_registry/update',
        entity_id: entityId,
        area_id: normalizedAreaId,
      });
      if (entityResult === null) {
        throw new Error('entity update failed');
      }
    }
  }
}

/** The floors of Home Assistant, from the floor registry. */
export type HaFloorEntry = {
  floor_id: string;
  name: string;
  aliases?: string[];
  level?: number | null;
  icon?: string | null;
};

export function parseHaFloorList(payload: unknown): HaFloorEntry[] {
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload
    .map((entry): HaFloorEntry | null => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const floorId = typeof record.floor_id === 'string' ? record.floor_id.trim() : '';
      const name = typeof record.name === 'string' ? record.name.trim() : '';
      const aliases = Array.isArray(record.aliases)
        ? record.aliases.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : undefined;
      if (!floorId || !name) {
        return null;
      }
      return {
        floor_id: floorId,
        name,
        aliases,
        level: typeof record.level === 'number' ? record.level : null,
        icon: typeof record.icon === 'string' ? record.icon : null,
      } satisfies HaFloorEntry;
    })
    .filter((entry): entry is HaFloorEntry => entry !== null);
}

export function parseHaFloorEntry(payload: unknown): HaFloorEntry | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const floorId = typeof record.floor_id === 'string' ? record.floor_id.trim() : '';
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  const aliases = Array.isArray(record.aliases)
    ? record.aliases.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : undefined;
  if (!floorId || !name) {
    return null;
  }
  return {
    floor_id: floorId,
    name,
    aliases,
    level: typeof record.level === 'number' ? record.level : null,
    icon: typeof record.icon === 'string' ? record.icon : null,
  };
}

/** The rooms of a floor ('all' for every room); local rooms belong to no floor. */
export function filterRoomTabsByFloor(
  tabs: RoomTab[],
  areas: Array<{ area_id: string; floor_id?: string | null }>,
  floorId: string,
): RoomTab[] {
  if (floorId === 'all') {
    return tabs;
  }
  return tabs.filter((tab) => {
    if (tab.source !== 'ha') {
      return false;
    }
    const area = areas.find((haArea) => haArea.area_id === tab.id);
    return area?.floor_id === floorId;
  });
}

/** Numbers as Home Assistant sends them, also "21,5". */
export function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().replace(',', '.');
    if (!normalized) {
      return undefined;
    }
    const parsed = Number.parseFloat(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

export function isAreaSensorEntityCandidate(entityId: string, state: MockEntityState | undefined, kind: 'temperature' | 'humidity') {
  const domain = entityId.split('.')[0];
  if (domain !== 'sensor') {
    return false;
  }
  const deviceClass = `${state?.rawAttributes?.device_class ?? ''}`.trim().toLowerCase();
  const unit = `${state?.unit ?? state?.rawAttributes?.unit_of_measurement ?? ''}`.trim().toLowerCase();
  const normalizedEntityId = entityId.toLowerCase();
  if (kind === 'temperature') {
    return deviceClass === 'temperature' || ['c', 'f', '\u00b0c', '\u00b0f'].includes(unit) || normalizedEntityId.includes('temperature');
  }
  return deviceClass === 'humidity' || unit === '%' || normalizedEntityId.includes('humidity');
}

export function getEntityNumericValue(entity?: MockEntityState) {
  return (
    toNumber(entity?.numericValue) ??
    toNumber(entity?.currentValue) ??
    toNumber(entity?.targetValue) ??
    toNumber(entity?.state)
  );
}

export function formatAmbientTemperature(value: number) {
  return `${value.toFixed(1)}\u00b0C`;
}

export function formatAmbientHumidity(value: number) {
  return `${Math.round(value)}%`;
}

/** Temperature and humidity of a room: the area's own sensors first, else the first matching sensor in it. */
export function resolveRoomClimateReadings(
  area: { temperature_entity_id?: string | null; humidity_entity_id?: string | null } | null | undefined,
  sensorIds: string[],
  states: Record<string, MockEntityState | undefined>,
) {
  const roomSensorFor = (kind: 'temperature' | 'humidity') =>
    sensorIds.find((entityId) => isAreaSensorEntityCandidate(entityId, states[entityId], kind)) ?? null;
  const temperatureEntityId = area?.temperature_entity_id ?? roomSensorFor('temperature');
  const humidityEntityId = area?.humidity_entity_id ?? roomSensorFor('humidity');
  return {
    temperature: temperatureEntityId ? getEntityNumericValue(states[temperatureEntityId]) : undefined,
    humidity: humidityEntityId ? getEntityNumericValue(states[humidityEntityId]) : undefined,
  };
}

