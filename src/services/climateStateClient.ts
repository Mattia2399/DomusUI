import type { ClimateControlMode, ClimateHouseConfig, ClimateOperatingMode, ClimateZoneMode } from '../pages/climate/climateModel';
import type { ClimateCallApi } from './climateConfigClient';

export type ClimateThermalStatus = 'off' | 'satisfied' | 'needs_heating' | 'needs_cooling' | 'unknown';
export type ClimateSensorAvailability = 'available' | 'unavailable' | 'invalid' | 'stale';
export type ClimateAutoEvent = { day: string; time: string; profileId: string; profileName?: string | null; occursAt?: string };
export type ClimateAutoResolution = { status: 'resolved' | 'no_schedule' | 'timezone_unavailable' | 'invalid_schedule' | 'profile_missing' | 'invalid_instant'; activeProfileId: string | null; activeProfileName: string | null; activeEvent: ClimateAutoEvent | null; nextEvent: ClimateAutoEvent | null; zoneTargets: Record<string, { status: 'resolved' | 'no_target'; value: number | null }> };
export type ClimateOverrideExpiryMode = 'next_schedule_event' | 'duration' | 'until_time';
export type ClimateZoneOverride = { id: string; zoneId: string; targetTemperature: number; createdAt: string; expiresAt: string; expiryMode: ClimateOverrideExpiryMode; expiresAtLocalTime?: string | null; expiresAtLocalDate?: string | null };
export type ClimateZoneState = {
  zoneId: string;
  intent: { mode: ClimateZoneMode; targetTemperature: number | null };
  override?: ClimateZoneOverride | null;
  observed: { temperature: number | null; humidity: number | null; temperatureSource: string | null; humiditySource: string | null; temperatureAvailability: ClimateSensorAvailability; humidityAvailability: ClimateSensorAvailability };
  derived: { effectiveTarget: number | null; targetSource: 'manual' | 'schedule' | 'override' | 'auto_fixture' | null; targetReason?: string | null; thermalReason?: string | null; scheduledTarget?: number | null; effectiveTargetDetail?: { value: number | null; source: 'manual' | 'schedule' | 'override' | 'auto_fixture' | null; profileId: string | null; event: ClimateAutoEvent | null; expiresAt?: string | null; expiryMode?: ClimateOverrideExpiryMode | null }; autoPendingConfiguration: boolean; thermalStatus: ClimateThermalStatus;
    terminals: { id: string; entityId: string; available: boolean; compatible: boolean; observedTarget: number | null; targetMismatch: boolean; mismatchCause: 'unknown'; equipmentGroupIds: string[] }[];
    compatiblePaths: { terminalId: string; circuitId: string | null; generatorCandidates: { id: string; role: 'preferred' | 'fallback' | 'required' | 'available' }[]; humidityConstraintPresent: boolean; condensationProtectionRequired: boolean; auxiliaryCandidates: string[]; sharedOperatingMode: boolean }[] };
};
export type ClimateExecutionAction = { kind: 'set_hvac_mode' | 'set_temperature'; entityId: string; value: string | number; temperatureUnit?: '°C' | '°F'; expected: { hvacMode?: 'heat' | 'cool'; targetTemperature?: number } };
export type ClimateExecutionPlan = {
  planId: string; zoneId: string; status: 'eligible' | 'noop' | 'blocked' | 'unresolved';
  endpointId: string | null; entityId: string | null; controlKind: 'supervisory' | null;
  desired: { hvacMode: 'heat' | 'cool'; requestedTargetCelsius: number; requestedTarget: number; targetTemperature: number; temperatureUnit: '°C' | '°F'; normalization: 'endpoint_step' | null; targetStep: number | null } | null;
  observed: { hvacMode: string; targetTemperature: number | null; currentTemperature: number | null; available: boolean; temperatureUnit: '°C' | '°F' } | null;
  diff: { hvacModeChanged: boolean; targetChanged: boolean } | null;
  actions: ClimateExecutionAction[];
  sensor: { status: 'valid' | 'sensor_invalid' | 'sensor_unit_unknown' | 'sensor_outside_plausible_range' | 'stale'; valueCelsius: number | null; source: string | null; unit: string | null; freshness: 'verified' | 'stale' | 'unknown'; lastUpdated: string | null } | null;
  reasons: string[]; planSafe: boolean; physicalExecutionAllowed: boolean; physicalBlockers: string[];
  configRevision: number; stateRevision: number; inputFingerprint: string; evaluatedAt: string; validUntil: string | null;
};
export type ClimateExecutionPreview = { plans: ClimateExecutionPlan[]; configRevision: number; stateRevision: number; evaluatedAt: string };
export type ClimateStateResponse = { state: 'absent' | 'ready' | 'corrupt' | 'unsupported' | 'migration_failed'; revision: number; configState: string; configRevision: number; preview: { house: { operatingMode: ClimateOperatingMode; controlMode: ClimateControlMode }; autoResolution?: ClimateAutoResolution | null; zones: ClimateZoneState[]; deadbandCelsius: number } | null; executionPreview?: ClimateExecutionPreview | null };

export const CLIMATE_STATE_TYPES = { get: 'domusos/climate/get_state', house: 'domusos/climate/set_house_intent', zone: 'domusos/climate/set_zone_intent', override: 'domusos/climate/set_zone_override', clearOverride: 'domusos/climate/clear_zone_override' } as const;

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
  if (value.executionPreview != null && (!record(value.executionPreview) || !Array.isArray(value.executionPreview.plans) ||
      !value.executionPreview.plans.every((plan: unknown) => record(plan) && typeof plan.zoneId === 'string' &&
        ['eligible', 'noop', 'blocked', 'unresolved'].includes(String(plan.status)) && Array.isArray(plan.actions) &&
        Array.isArray(plan.reasons) && typeof plan.physicalExecutionAllowed === 'boolean' &&
        Array.isArray(plan.physicalBlockers)))) throw new Error('Anteprima controllo non valida.');
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

export async function setZoneOverride(callApi: ClimateCallApi, zoneId: string, target: number, expiryMode: ClimateOverrideExpiryMode, revision: number, options: { durationMinutes?: number; untilTime?: string } = {}): Promise<ClimateStateResponse> {
  return stateResponse(await callApi<ClimateStateResponse>({ type: CLIMATE_STATE_TYPES.override, zone_id: zoneId, target_temperature: target, expiry_mode: expiryMode, expected_revision: revision,
    ...(options.durationMinutes === undefined ? {} : { duration_minutes: options.durationMinutes }),
    ...(options.untilTime === undefined ? {} : { until_time: options.untilTime }) }, { reportError: false, throwOnError: true }));
}

export async function clearZoneOverride(callApi: ClimateCallApi, zoneId: string, revision: number): Promise<ClimateStateResponse> {
  return stateResponse(await callApi<ClimateStateResponse>({ type: CLIMATE_STATE_TYPES.clearOverride, zone_id: zoneId, expected_revision: revision }, { reportError: false, throwOnError: true }));
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
