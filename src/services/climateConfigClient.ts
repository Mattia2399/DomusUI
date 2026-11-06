import type { ClimateHouseConfig } from '../pages/climate/climateModel';

export type ClimateStoreState = 'absent' | 'ready' | 'corrupt' | 'unsupported' | 'migration_failed';
export type ClimateConfigResponse = { state: ClimateStoreState; revision: number; config: ClimateHouseConfig | null };
export type ClimateCallApi = <T = unknown>(message: Record<string, unknown>, options?: { reportError?: boolean; throwOnError?: boolean }) => Promise<T | null>;

export const CLIMATE_CONFIG_TYPES = { get: 'domusos/climate/get_config', save: 'domusos/climate/save_config' } as const;

export function emptyClimateConfig(): ClimateHouseConfig {
  return { version: 1, zones: [], endpoints: [], circuits: [], generators: [], profiles: [], schedules: [], strategy: null };
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
    config.strategy === null;
}

export async function getClimateConfig(callApi: ClimateCallApi): Promise<ClimateConfigResponse> {
  const result = await callApi<ClimateConfigResponse>({ type: CLIMATE_CONFIG_TYPES.get }, { reportError: false, throwOnError: true });
  if (!isClimateConfigResponse(result)) throw new Error('Risposta Clima non valida.');
  return result;
}

export async function saveClimateConfig(callApi: ClimateCallApi, config: ClimateHouseConfig, expectedRevision: number): Promise<ClimateConfigResponse> {
  const result = await callApi<ClimateConfigResponse>(
    { type: CLIMATE_CONFIG_TYPES.save, config, expected_revision: expectedRevision },
    { reportError: false, throwOnError: true },
  );
  if (!isClimateConfigResponse(result) || result.state !== 'ready') throw new Error('Salvataggio Clima non confermato.');
  return result;
}
