import type { ClimateControlMode, ClimateHouseConfig, ClimateOperatingMode, ClimateZoneMode } from '../pages/climate/climateModel';
import type { ClimateCallApi } from './climateConfigClient';

export type ClimateThermalStatus = 'off' | 'satisfied' | 'needs_heating' | 'needs_cooling' | 'unknown';
export type ClimateSensorAvailability = 'available' | 'unavailable' | 'invalid' | 'stale';
export type ClimateAutoEvent = { day: string; time: string; profileId: string; profileName?: string | null; occursAt?: string };
export type ClimateAutoResolution = { status: 'resolved' | 'no_schedule' | 'timezone_unavailable' | 'invalid_schedule' | 'profile_missing' | 'invalid_instant'; activeProfileId: string | null; activeProfileName: string | null; activeEvent: ClimateAutoEvent | null; nextEvent: ClimateAutoEvent | null; zoneTargets: Record<string, { status: 'resolved' | 'no_target'; value: number | null }> };
export type ClimateZoneState = {
  zoneId: string;
  intent: { mode: ClimateZoneMode; targetTemperature: number | null };
  observed: { temperature: number | null; humidity: number | null; temperatureSource: string | null; humiditySource: string | null; temperatureAvailability: ClimateSensorAvailability; humidityAvailability: ClimateSensorAvailability };
  derived: { effectiveTarget: number | null; targetSource: 'manual' | 'schedule' | 'auto_fixture' | null; targetReason?: string | null; thermalReason?: string | null; effectiveTargetDetail?: { value: number | null; source: 'manual' | 'schedule' | 'auto_fixture' | null; profileId: string | null; event: ClimateAutoEvent | null }; autoPendingConfiguration: boolean; thermalStatus: ClimateThermalStatus;
    terminals: { id: string; entityId: string; available: boolean; compatible: boolean; observedTarget: number | null; targetMismatch: boolean; mismatchCause: 'unknown'; equipmentGroupIds: string[] }[];
    compatiblePaths: { terminalId: string; circuitId: string | null; generatorCandidates: { id: string; role: 'preferred' | 'fallback' | 'required' | 'available' }[]; humidityConstraintPresent: boolean; condensationProtectionRequired: boolean; auxiliaryCandidates: string[]; sharedOperatingMode: boolean }[] };
};
export type ClimateStateResponse = { state: 'absent' | 'ready' | 'corrupt' | 'unsupported' | 'migration_failed'; revision: number; configState: string; configRevision: number; preview: { house: { operatingMode: ClimateOperatingMode; controlMode: ClimateControlMode }; autoResolution?: ClimateAutoResolution | null; zones: ClimateZoneState[]; deadbandCelsius: number } | null };

export const CLIMATE_STATE_TYPES = { get: 'domusos/climate/get_state', house: 'domusos/climate/set_house_intent', zone: 'domusos/climate/set_zone_intent' } as const;

function stateResponse(value: unknown): ClimateStateResponse {
  const record = (item: unknown): item is Record<string, unknown> => item !== null && typeof item === 'object' && !Array.isArray(item);
  if (!record(value) || !['absent', 'ready', 'corrupt', 'unsupported', 'migration_failed'].includes(String(value.state)) ||
      !Number.isInteger(value.revision) || Number(value.revision) < 0 || !Number.isInteger(value.configRevision) ||
      typeof value.configState !== 'string' || !('preview' in value)) throw new Error('Stato Clima non valido.');
  if (value.preview !== null) {
    if (!record(value.preview) || !record(value.preview.house) || !['heating', 'cooling', 'off'].includes(String(value.preview.house.operatingMode)) ||
        !['manual', 'auto'].includes(String(value.preview.house.controlMode)) || !Array.isArray(value.preview.zones) ||
        typeof value.preview.deadbandCelsius !== 'number' || !value.preview.zones.every((zone: unknown) => record(zone) &&
          typeof zone.zoneId === 'string' && record(zone.intent) && record(zone.observed) && record(zone.derived) &&
          Array.isArray(zone.derived.terminals) && Array.isArray(zone.derived.compatiblePaths))) throw new Error('Stato Clima non valido.');
  }
  return value as ClimateStateResponse;
}

export async function getClimateState(callApi: ClimateCallApi): Promise<ClimateStateResponse> {
  return stateResponse(await callApi<ClimateStateResponse>({ type: CLIMATE_STATE_TYPES.get }, { reportError: false, throwOnError: true }));
}

export async function setHouseIntent(callApi: ClimateCallApi, mode: ClimateOperatingMode, control: ClimateControlMode, revision: number): Promise<ClimateStateResponse> {
  return stateResponse(await callApi<ClimateStateResponse>({ type: CLIMATE_STATE_TYPES.house, operating_mode: mode, control_mode: control, expected_revision: revision }, { reportError: false, throwOnError: true }));
}

export async function setZoneIntent(callApi: ClimateCallApi, zoneId: string, mode: ClimateZoneMode, target: number | null, revision: number): Promise<ClimateStateResponse> {
  return stateResponse(await callApi<ClimateStateResponse>({ type: CLIMATE_STATE_TYPES.zone, zone_id: zoneId, mode, target_temperature: target, expected_revision: revision }, { reportError: false, throwOnError: true }));
}

/** Only configured entities trigger a refresh. No timer or HA-wide polling. */
export function climateObservedKey(config: ClimateHouseConfig, states: Record<string, { state: string; rawAttributes?: Record<string, unknown> }>): string {
  const ids = new Set<string>();
  for (const zone of config.zones) for (const reference of [zone.reference, zone.humidityReference]) if (reference) {
    ids.add(reference.primaryEntityId);
    reference.fallbacks.forEach((id) => ids.add(id));
  }
  config.endpoints.forEach((endpoint) => { if (endpoint.entity.primaryEntityId) ids.add(endpoint.entity.primaryEntityId); });
  return JSON.stringify([...ids].sort().map((id) => [id, states[id]?.state, states[id]?.rawAttributes?.current_temperature, states[id]?.rawAttributes?.current_humidity, states[id]?.rawAttributes?.temperature]));
}
