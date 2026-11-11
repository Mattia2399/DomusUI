/** The narrow Dashboard projection of House, independent of rooms.view. */
export const DASHBOARD_HOUSE_SCHEMA = 'domusos.dashboard.house.v1';

export type DashboardHouseContext = {
  schemaVersion: typeof DASHBOARD_HOUSE_SCHEMA;
  topologyRevision: number;
  rooms: Array<{ id: string; name: string }>;
  devices: Array<{ id: string; effectiveRoomId: string | null }>;
  entities: Array<{ registryId: string | null; entityId: string; deviceId: string | null; effectiveRoomId: string | null }>;
};

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const nullableString = (value: unknown) => value === null || typeof value === 'string';

export function parseDashboardHouseContext(value: unknown): DashboardHouseContext {
  if (!record(value) || value.schemaVersion !== DASHBOARD_HOUSE_SCHEMA ||
      !Number.isInteger(value.topologyRevision) || !Array.isArray(value.rooms) ||
      !Array.isArray(value.devices) || !Array.isArray(value.entities) ||
      !value.rooms.every((room) => record(room) && typeof room.id === 'string' && typeof room.name === 'string') ||
      !value.devices.every((device) => record(device) && typeof device.id === 'string' && nullableString(device.effectiveRoomId)) ||
      !value.entities.every((entity) => record(entity) && nullableString(entity.registryId) &&
        typeof entity.entityId === 'string' && nullableString(entity.deviceId) && nullableString(entity.effectiveRoomId))) {
    throw new Error('Invalid Dashboard House context');
  }
  return value as DashboardHouseContext;
}

export async function fetchDashboardHouseContext(
  callApi: (message: Record<string, unknown>, options?: { reportError?: boolean; throwOnError?: boolean }) => Promise<unknown>,
): Promise<DashboardHouseContext> {
  return parseDashboardHouseContext(await callApi(
    { type: 'domusos/dashboard/get_house_context' }, { reportError: false, throwOnError: true },
  ));
}

export function dashboardHouseLookups(context: DashboardHouseContext | null) {
  const roomNames = new Map(context?.rooms.map((room) => [room.id, room.name] as const) ?? []);
  const entities = new Map(context?.entities.map((entity) => [entity.entityId, entity] as const) ?? []);
  const entitiesByRegistryId = new Map(context?.entities
    .filter((entity) => entity.registryId !== null)
    .map((entity) => [entity.registryId as string, entity] as const) ?? []);
  return {
    roomNames, entities, entitiesByRegistryId,
    roomIdOf: (entityId: string) => entities.get(entityId)?.effectiveRoomId ?? null,
    roomNameOf: (entityId: string) => roomNames.get(entities.get(entityId)?.effectiveRoomId ?? '') ?? undefined,
    deviceIdOf: (entityId: string) => entities.get(entityId)?.deviceId ?? null,
  };
}
