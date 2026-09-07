import type { Widget } from '../../types/dashboardModels';
import type { MockEntityState } from '../../types/ha';
import { translateForLocale, type AppLocale } from '../../i18n/I18nProvider';

export const VACUUM_FEATURE_PAUSE = 4;
export const VACUUM_FEATURE_STOP = 8;
export const VACUUM_FEATURE_RETURN_HOME = 16;
export const VACUUM_FEATURE_FAN_SPEED = 32;
export const VACUUM_FEATURE_SEND_COMMAND = 256;
export const VACUUM_FEATURE_LOCATE = 512;
export const VACUUM_FEATURE_CLEAN_SPOT = 1024;
export const VACUUM_FEATURE_MAP = 2048;
export const VACUUM_FEATURE_STATE = 4096;
export const VACUUM_FEATURE_START = 8192;
export const VACUUM_FEATURE_CLEAN_AREA = 16384;

export type VacuumUiState =
  | 'docked'
  | 'cleaning'
  | 'paused'
  | 'error'
  | 'returning'
  | 'idle'
  | 'unavailable'
  | 'unknown';

export type VacuumCardTone = 'ready' | 'cleaning' | 'paused' | 'returning' | 'error' | 'offline';
export type VacuumPrimaryAction = 'start' | 'pause' | 'resume' | 'details' | 'none';

export type VacuumCapabilities = {
  supportedFeatures?: number;
  supportsStart: boolean;
  supportsPause: boolean;
  supportsStop: boolean;
  supportsReturnHome: boolean;
  supportsFanSpeed: boolean;
  supportsSendCommand: boolean;
  supportsLocate: boolean;
  supportsCleanSpot: boolean;
  supportsMap: boolean;
  supportsCleanArea: boolean;
};

export type VacuumCardModel = VacuumCapabilities & {
  title: string;
  entityId: string;
  state: VacuumUiState;
  stateLabel: string;
  subtitle: string;
  tone: VacuumCardTone;
  isAvailable: boolean;
  isActive: boolean;
  commandPending: boolean;
  batteryLevel?: number;
  cleanedArea?: number;
  cleanedAreaLabel?: string;
  cleaningMinutes?: number;
  cleaningTimeLabel?: string;
  fanSpeed?: string;
  fanSpeedLabel?: string;
  mapUrl?: string;
  errorLabel?: string;
  primaryAction: VacuumPrimaryAction;
  primaryActionLabel: string;
  primaryActionEnabled: boolean;
};

export function toVacuumFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = Number.parseFloat(value.trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function toVacuumString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeVacuumState(value: string | undefined): VacuumUiState {
  const normalized = (value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'charging' || normalized === 'fully_charged') return 'docked';
  if (normalized === 'returning_to_base' || normalized === 'returning_home') return 'returning';
  if (normalized === 'offline' || normalized === 'disconnected') return 'unavailable';
  if (
    normalized === 'docked' ||
    normalized === 'cleaning' ||
    normalized === 'paused' ||
    normalized === 'error' ||
    normalized === 'returning' ||
    normalized === 'idle' ||
    normalized === 'unavailable'
  ) {
    return normalized;
  }
  return 'unknown';
}

export function translateVacuumState(state: VacuumUiState, locale: AppLocale = 'it') {
  return translateForLocale(locale, `vacuum.state.${state}`);
}

export function formatVacuumOption(value: string | undefined) {
  const normalized = (value ?? '').trim().replace(/[_-]+/g, ' ');
  if (!normalized) return undefined;
  return normalized
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function resolveVacuumCapabilities(entity: MockEntityState | undefined): VacuumCapabilities {
  const fromEntity = typeof entity?.supportedFeatures === 'number' ? entity.supportedFeatures : undefined;
  const fromAttributes = toVacuumFiniteNumber(entity?.rawAttributes?.supported_features);
  const supportedFeatures = fromEntity ?? fromAttributes;
  const has = (feature: number) =>
    typeof supportedFeatures === 'number' && (supportedFeatures & feature) === feature;

  return {
    supportedFeatures,
    supportsStart: has(VACUUM_FEATURE_START),
    supportsPause: has(VACUUM_FEATURE_PAUSE),
    supportsStop: has(VACUUM_FEATURE_STOP),
    supportsReturnHome: has(VACUUM_FEATURE_RETURN_HOME),
    supportsFanSpeed: has(VACUUM_FEATURE_FAN_SPEED),
    supportsSendCommand: has(VACUUM_FEATURE_SEND_COMMAND),
    supportsLocate: has(VACUUM_FEATURE_LOCATE),
    supportsCleanSpot: has(VACUUM_FEATURE_CLEAN_SPOT),
    supportsMap: has(VACUUM_FEATURE_MAP),
    supportsCleanArea: has(VACUUM_FEATURE_CLEAN_AREA),
  };
}

function resolveTone(state: VacuumUiState): VacuumCardTone {
  if (state === 'cleaning') return 'cleaning';
  if (state === 'paused') return 'paused';
  if (state === 'returning') return 'returning';
  if (state === 'error') return 'error';
  if (state === 'unavailable' || state === 'unknown') return 'offline';
  return 'ready';
}

function formatDuration(minutes: number | undefined) {
  if (minutes === undefined || minutes < 0) return undefined;
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return remainder > 0 ? `${hours} h ${remainder} min` : `${hours} h`;
}

function resolvePrimaryAction(state: VacuumUiState, capabilities: VacuumCapabilities, locale: AppLocale) {
  const action = (key: 'error' | 'pause' | 'cleaning' | 'resume' | 'start' | 'controls' | 'returning' | 'unavailable') =>
    translateForLocale(locale, `vacuum.action.${key}`);
  if (state === 'error') {
    return { action: 'details' as const, label: action('error'), enabled: true };
  }
  if (state === 'cleaning') {
    return capabilities.supportsPause
      ? { action: 'pause' as const, label: action('pause'), enabled: true }
      : { action: 'none' as const, label: action('cleaning'), enabled: false };
  }
  if (state === 'paused') {
    return capabilities.supportsStart
      ? { action: 'resume' as const, label: action('resume'), enabled: true }
      : { action: 'none' as const, label: action('pause'), enabled: false };
  }
  if (state === 'docked' || state === 'idle') {
    return capabilities.supportsStart
      ? { action: 'start' as const, label: action('start'), enabled: true }
      : { action: 'none' as const, label: action('controls'), enabled: true };
  }
  if (state === 'returning') {
    return { action: 'none' as const, label: action('returning'), enabled: false };
  }
  return { action: 'none' as const, label: action('unavailable'), enabled: false };
}

export function buildVacuumCardModel({
  widget,
  liveEntity,
  locale = 'it',
}: {
  widget: Widget;
  liveEntity?: MockEntityState;
  locale?: AppLocale;
}): VacuumCardModel {
  const attributes = liveEntity?.rawAttributes ?? {};
  const state = normalizeVacuumState(
    toVacuumString(liveEntity?.state) ??
      toVacuumString(liveEntity?.stateLabel) ??
      toVacuumString(widget.status),
  );
  const capabilities = resolveVacuumCapabilities(liveEntity);
  const batteryLevel =
    toVacuumFiniteNumber(attributes.__dashboard_battery_level) ??
    toVacuumFiniteNumber(attributes.battery_level) ??
    toVacuumFiniteNumber(attributes.battery) ??
    (!liveEntity ? toVacuumFiniteNumber(widget.value) : undefined);
  const cleanedArea =
    toVacuumFiniteNumber(attributes.__dashboard_cleaned_area) ??
    toVacuumFiniteNumber(attributes.cleaned_area) ??
    toVacuumFiniteNumber(attributes.clean_area) ??
    (!liveEntity ? toVacuumFiniteNumber(widget.vacuumCleanedArea) : undefined);
  const cleanedAreaUnit =
    toVacuumString(attributes.__dashboard_cleaned_area_unit) ??
    toVacuumString(attributes.cleaned_area_unit) ??
    toVacuumString(attributes.area_unit) ??
    'm²';
  const cleaningMinutes =
    toVacuumFiniteNumber(attributes.__dashboard_cleaning_minutes) ??
    toVacuumFiniteNumber(attributes.cleaning_time) ??
    toVacuumFiniteNumber(attributes.clean_time) ??
    (!liveEntity ? toVacuumFiniteNumber(widget.vacuumCleaningMinutes) : undefined);
  const fanSpeed =
    toVacuumString(attributes.fan_speed) ??
    toVacuumString(attributes.fan_mode) ??
    (!liveEntity ? toVacuumString(widget.vacuumFanSpeed) : undefined);
  const mapUrl =
    toVacuumString(attributes.__dashboard_map_url) ??
    toVacuumString(liveEntity?.imageUrl) ??
    toVacuumString(attributes.entity_picture) ??
    toVacuumString(attributes.map_url) ??
    toVacuumString(attributes.map_image) ??
    (!liveEntity ? toVacuumString(widget.vacuumMapUrl) : undefined);
  const errorLabel =
    toVacuumString(attributes.error) ??
    toVacuumString(attributes.error_description) ??
    toVacuumString(attributes.error_code);
  const stateLabel = translateVacuumState(state, locale);
  const primary = resolvePrimaryAction(state, capabilities, locale);
  const subtitle = state === 'error' && errorLabel ? errorLabel : stateLabel;
  const commandPhase = toVacuumString(attributes.__dashboard_command_phase);

  return {
    ...capabilities,
    title: toVacuumString(attributes.friendly_name) ?? widget.title ?? 'Robot aspirapolvere',
    entityId: widget.entityId,
    state,
    stateLabel,
    subtitle,
    tone: resolveTone(state),
    isAvailable: state !== 'unavailable' && state !== 'unknown',
    isActive: state === 'cleaning' || state === 'paused' || state === 'returning',
    commandPending: commandPhase === 'sending' || commandPhase === 'awaiting_confirmation',
    batteryLevel: batteryLevel === undefined ? undefined : Math.max(0, Math.min(100, Math.round(batteryLevel))),
    cleanedArea,
    cleanedAreaLabel: cleanedArea === undefined ? undefined : `${Math.round(cleanedArea * 10) / 10} ${cleanedAreaUnit}`,
    cleaningMinutes,
    cleaningTimeLabel: formatDuration(cleaningMinutes),
    fanSpeed,
    fanSpeedLabel: formatVacuumOption(fanSpeed),
    mapUrl,
    errorLabel,
    primaryAction: primary.action,
    primaryActionLabel: primary.label,
    primaryActionEnabled: primary.enabled,
  };
}
