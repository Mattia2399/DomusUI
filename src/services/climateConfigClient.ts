import type { ClimateHouseConfig } from '../pages/climate/climateModel';

export type ClimateStoreState = 'absent' | 'ready' | 'corrupt' | 'unsupported' | 'migration_failed';
export type ClimateHouseRoom = { id: string; name: string; floorId: string | null; floorName: string | null; available: boolean };
export type ClimateHouseReading = { value: number | null; unit: string | null; available: boolean; sourceEntityId: string | null; updatedAt: string | null; status: string };
export type ClimateZoneHouseContext = { status: 'unlinked' | 'linked' | 'room_orphaned' | 'house_unavailable' | 'room_filtered'; room?: ClimateHouseRoom; environment?: { temperature: ClimateHouseReading; humidity: ClimateHouseReading }; issues?: string[] };
export type ClimateHouseContext = { topologyRevision: number | null; zones: Record<string, ClimateZoneHouseContext> };
export type ClimateConfigResponse = { state: ClimateStoreState; revision: number; config: ClimateHouseConfig | null; houseContext?: ClimateHouseContext };
export type ClimateRoomChoices = { status: 'available' | 'house_unavailable'; rooms: Array<Omit<ClimateHouseRoom, 'available'>> };
export type ClimateCallApi = <T = unknown>(message: Record<string, unknown>, options?: { reportError?: boolean; throwOnError?: boolean }) => Promise<T | null>;

export const CLIMATE_CONFIG_TYPES = { get: 'domusos/climate/get_config', save: 'domusos/climate/save_config', rooms: 'domusos/climate/get_house_rooms' } as const;

export function emptyClimateConfig(): ClimateHouseConfig {
  return { version: 1, physicalExecutionEnabled: false, zones: [], endpoints: [], circuits: [], generators: [], profiles: [], schedules: [], strategy: null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isClimateConfigResponse(value: unknown): value is ClimateConfigResponse {
  if (!isRecord(value) || !['absent', 'ready', 'corrupt', 'unsupported', 'migration_failed'].includes(String(value.state)) ||
      !Number.isInteger(value.revision) || Number(value.revision) < 0) return false;
  if (value.state !== 'ready') return value.config === null;
  const config = value.config;
  return isRecord(config) && config.version === 1 &&
    ['zones', 'endpoints', 'circuits', 'generators', 'profiles', 'schedules'].every((key) => Array.isArray(config[key])) &&
    config.strategy === null && (config.physicalExecutionEnabled === undefined || typeof config.physicalExecutionEnabled === 'boolean');
}

export async function getClimateConfig(callApi: ClimateCallApi): Promise<ClimateConfigResponse> {
  const result = await callApi<ClimateConfigResponse>({ type: CLIMATE_CONFIG_TYPES.get }, { reportError: false, throwOnError: true });
  if (!isClimateConfigResponse(result)) throw new Error('Risposta Clima non valida.');
  return result;
}

export async function getClimateHouseRooms(callApi: ClimateCallApi): Promise<ClimateRoomChoices> {
  const result = await callApi<ClimateRoomChoices>({ type: CLIMATE_CONFIG_TYPES.rooms }, { reportError: false, throwOnError: true });
  if (!isRecord(result) || !['available', 'house_unavailable'].includes(String(result.status)) ||
      !Array.isArray(result.rooms) || !result.rooms.every((room) => isRecord(room) && typeof room.id === 'string' &&
        typeof room.name === 'string' && (room.floorId === null || typeof room.floorId === 'string') &&
        (room.floorName === null || typeof room.floorName === 'string'))) throw new Error('Elenco stanze Clima non valido.');
  return result as ClimateRoomChoices;
}

export async function saveClimateConfig(callApi: ClimateCallApi, config: ClimateHouseConfig, expectedRevision: number): Promise<ClimateConfigResponse> {
  const result = await callApi<ClimateConfigResponse>(
    { type: CLIMATE_CONFIG_TYPES.save, config, expected_revision: expectedRevision },
    { reportError: false, throwOnError: true },
  );
  if (!isClimateConfigResponse(result) || result.state !== 'ready') throw new Error('Salvataggio Clima non confermato.');
  return result;
}
