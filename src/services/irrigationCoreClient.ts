import type { IrrigationConfigurationModel } from '../components/apps/irrigation/irrigationConfigurationModel';

export const IRRIGATION_CORE_TYPES = {
  getConfig: 'domusos/irrigation/get_config',
  saveConfig: 'domusos/irrigation/save_config',
  getState: 'domusos/irrigation/get_state',
  subscribe: 'domusos/irrigation/subscribe',
  startZone: 'domusos/irrigation/start_zone',
  stopZone: 'domusos/irrigation/stop_zone',
  pause: 'domusos/irrigation/pause',
  resume: 'domusos/irrigation/resume',
  stopAll: 'domusos/irrigation/stop_all',
  prepareLegacyRemoval: 'domusos/irrigation/prepare_legacy_removal',
} as const;

export type IrrigationCoreMode = 'enabled' | 'paused' | 'stopped' | 'fault';

export type IrrigationCoreSession = {
  id: string;
  zoneId: string;
  entityId: string;
  state: 'queued' | 'opening' | 'running' | 'closing' | 'paused';
  source: 'manual' | 'schedule' | 'service' | 'resume';
  startedAt: string | null;
  deadline: string | null;
  remainingSeconds: number;
  durationMin: number;
  reason?: string | null;
};

export type IrrigationCoreHistoryEntry = {
  sessionId?: string | null;
  zoneId?: string | null;
  source?: 'manual' | 'schedule' | 'service' | 'resume' | string | null;
  state?: 'completed' | 'interrupted' | 'failed' | 'skipped' | string | null;
  reason?: string | null;
  at?: string | null;
};

export type IrrigationCoreState = {
  available: true;
  revision: number;
  mode: IrrigationCoreMode;
  rain: { enabled: boolean; active: boolean; available: boolean; blocked: boolean; reason: string | null };
  sessions: IrrigationCoreSession[];
  history: IrrigationCoreHistoryEntry[];
  serverTime: string;
  legacyAutomations: string[];
  legacyAutomationsReadyForRemoval?: boolean;
  legacyAutomationsRequireRestart?: boolean;
};

export type IrrigationCoreDocument = {
  schema: 'domusos-irrigation';
  version: 1;
  revision: number;
  mode: IrrigationCoreMode;
  settings: {
    maximumManualDurationMin: number;
    maxConcurrentZones: number;
    parallelSafetyAcknowledged: boolean;
    rainSensorEnabled: boolean;
    rainSensorEntityId: string;
    blockOnRainSensorUnavailable: boolean;
    rainDuringCycle: 'stop_immediately' | 'finish_active';
  };
  sources: {
    weatherEntityId: string;
    humidityEntityId: string;
    outdoorTempEntityId: string;
    soilMoistureEntityId: string;
    waterUsageEntityId: string;
    waterAverageEntityId: string;
  };
  zones: IrrigationConfigurationModel['zones'];
  legacyAutomations: string[];
};

export type IrrigationCallApi = <T = unknown>(
  message: Record<string, unknown>,
  options?: { reportError?: boolean; throwOnError?: boolean },
) => Promise<T | null>;

export type IrrigationSubscribeApi = <T = unknown>(
  message: Record<string, unknown>,
  callback: (event: T) => void,
) => Promise<() => void>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isIrrigationCoreDocument(value: unknown): value is IrrigationCoreDocument {
  return isRecord(value) && value.schema === 'domusos-irrigation' && value.version === 1 &&
    Number.isInteger(value.revision) && isRecord(value.settings) && isRecord(value.sources) &&
    Array.isArray(value.zones);
}

export function isIrrigationCoreState(value: unknown): value is IrrigationCoreState {
  return isRecord(value) && value.available === true && Number.isInteger(value.revision) &&
    ['enabled', 'paused', 'stopped', 'fault'].includes(String(value.mode)) && Array.isArray(value.sessions);
}

export function fromIrrigationCoreDocument(document: IrrigationCoreDocument): IrrigationConfigurationModel {
  return {
    ...document.settings,
    ...document.sources,
    zones: document.zones.map((zone) => ({ ...zone })),
  };
}

export function toIrrigationCoreConfiguration(config: IrrigationConfigurationModel) {
  return {
    settings: {
      maximumManualDurationMin: config.maximumManualDurationMin,
      maxConcurrentZones: config.maxConcurrentZones,
      parallelSafetyAcknowledged: config.parallelSafetyAcknowledged,
      rainSensorEnabled: config.rainSensorEnabled,
      rainSensorEntityId: config.rainSensorEntityId,
      blockOnRainSensorUnavailable: config.blockOnRainSensorUnavailable,
      rainDuringCycle: config.rainDuringCycle,
    },
    sources: {
      weatherEntityId: config.weatherEntityId,
      humidityEntityId: config.humidityEntityId,
      outdoorTempEntityId: config.outdoorTempEntityId,
      soilMoistureEntityId: config.soilMoistureEntityId,
      waterUsageEntityId: config.waterUsageEntityId,
      waterAverageEntityId: config.waterAverageEntityId,
    },
    zones: config.zones.map((zone) => ({ ...zone })),
  };
}

export async function getIrrigationCoreConfig(callApi: IrrigationCallApi) {
  const result = await callApi<IrrigationCoreDocument>(
    { type: IRRIGATION_CORE_TYPES.getConfig },
    { reportError: false, throwOnError: true },
  );
  if (!isIrrigationCoreDocument(result)) throw new Error('Risposta Domus Core non valida.');
  return result;
}

export async function getIrrigationCoreState(callApi: IrrigationCallApi) {
  const result = await callApi<IrrigationCoreState>(
    { type: IRRIGATION_CORE_TYPES.getState },
    { reportError: false, throwOnError: true },
  );
  if (!isIrrigationCoreState(result)) throw new Error('Stato Domus Core non valido.');
  return result;
}

export async function saveIrrigationCoreConfig(
  callApi: IrrigationCallApi,
  config: IrrigationConfigurationModel,
  expectedRevision: number | null,
  migrateLegacy = false,
) {
  const result = await callApi<IrrigationCoreDocument>(
    {
      type: IRRIGATION_CORE_TYPES.saveConfig,
      config: toIrrigationCoreConfiguration(config),
      expected_revision: expectedRevision,
      migrate_legacy: migrateLegacy,
    },
    { reportError: false, throwOnError: true },
  );
  if (!isIrrigationCoreDocument(result)) throw new Error('Salvataggio Domus Core non confermato.');
  return result;
}

export async function callIrrigationCoreCommand<T = IrrigationCoreState>(
  callApi: IrrigationCallApi,
  type: string,
  payload: Record<string, unknown> = {},
) {
  return callApi<T>({ type, ...payload }, { reportError: false, throwOnError: true });
}
