import type { MockEntityState } from '../../types/ha';

export const FAN_FEATURE = {
  SET_SPEED: 1,
  OSCILLATE: 2,
  DIRECTION: 4,
  PRESET_MODE: 8,
  TURN_OFF: 16,
  TURN_ON: 32,
} as const;

export const FAN_PENDING_ATTRIBUTE = '__dashboard_pending_fan';

export type FanPending = {
  isOn?: boolean;
  percentage?: number;
  presetMode?: string;
  oscillating?: boolean;
  direction?: 'forward' | 'reverse';
};

export type FanModel = {
  available: boolean;
  isOn: boolean;
  percentage?: number;
  speedCount?: number;
  presetMode?: string;
  presetModes: string[];
  oscillating?: boolean;
  direction?: 'forward' | 'reverse';
  canTurnOn: boolean;
  canTurnOff: boolean;
  canSetSpeed: boolean;
  canSetPreset: boolean;
  canOscillate: boolean;
  canSetDirection: boolean;
  pending: FanPending;
};

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function hasFeature(features: number | undefined, feature: number) {
  return features !== undefined && (features & feature) !== 0;
}

function pendingValue(value: unknown): FanPending {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const draft = value as Record<string, unknown>;
  return {
    isOn: typeof draft.isOn === 'boolean' ? draft.isOn : undefined,
    percentage: finiteNumber(draft.percentage),
    presetMode: typeof draft.presetMode === 'string' ? draft.presetMode : undefined,
    oscillating: typeof draft.oscillating === 'boolean' ? draft.oscillating : undefined,
    direction: draft.direction === 'forward' || draft.direction === 'reverse' ? draft.direction : undefined,
  };
}

export function resolveFanModel(entity: MockEntityState | undefined): FanModel {
  const attributes = entity?.rawAttributes ?? {};
  const state = (entity?.state ?? entity?.stateLabel ?? '').trim().toLowerCase();
  const available = Boolean(entity) && (state === 'on' || state === 'off');
  const features = finiteNumber(entity?.supportedFeatures ?? attributes.supported_features);
  const presetModes = Array.isArray(attributes.preset_modes)
    ? attributes.preset_modes.filter((mode): mode is string => typeof mode === 'string' && mode.trim().length > 0)
    : [];
  const rawDirection = attributes.direction ?? attributes.current_direction;
  const rawPercentage = finiteNumber(attributes.percentage);
  const percentageStep = finiteNumber(attributes.percentage_step);
  const speedCount = finiteNumber(attributes.speed_count) ??
    (percentageStep !== undefined && percentageStep > 0 ? 100 / percentageStep : undefined);
  const pending = pendingValue(attributes[FAN_PENDING_ATTRIBUTE]);
  const isOn = pending.isOn ?? (typeof entity?.toggleOn === 'boolean' ? entity.toggleOn : state === 'on');
  return {
    available,
    isOn,
    percentage: pending.percentage ?? (rawPercentage !== undefined ? Math.max(0, Math.min(100, rawPercentage)) : undefined),
    speedCount: speedCount !== undefined && speedCount >= 1 ? Math.round(speedCount) : undefined,
    presetMode: pending.presetMode ?? (typeof attributes.preset_mode === 'string' ? attributes.preset_mode : undefined),
    presetModes,
    oscillating: pending.oscillating ?? (typeof attributes.oscillating === 'boolean' ? attributes.oscillating : undefined),
    direction: pending.direction ?? (rawDirection === 'forward' || rawDirection === 'reverse' ? rawDirection : undefined),
    canTurnOn: available && (features === undefined || hasFeature(features, FAN_FEATURE.TURN_ON)),
    canTurnOff: available && (features === undefined || hasFeature(features, FAN_FEATURE.TURN_OFF)),
    canSetSpeed: available && hasFeature(features, FAN_FEATURE.SET_SPEED) && rawPercentage !== undefined,
    canSetPreset: available && presetModes.length > 0 &&
      (hasFeature(features, FAN_FEATURE.PRESET_MODE) || hasFeature(features, FAN_FEATURE.SET_SPEED)),
    canOscillate: available && hasFeature(features, FAN_FEATURE.OSCILLATE) && typeof attributes.oscillating === 'boolean',
    canSetDirection: available && hasFeature(features, FAN_FEATURE.DIRECTION) &&
      (rawDirection === 'forward' || rawDirection === 'reverse'),
    pending,
  };
}

export function quantizeFanPercentage(value: number, speedCount?: number): number {
  const safe = Math.max(0, Math.min(100, Math.round(value)));
  if (!speedCount || speedCount >= 100) return safe;
  return Math.max(0, Math.min(100, Math.round(Math.round((safe * speedCount) / 100) * (100 / speedCount))));
}
