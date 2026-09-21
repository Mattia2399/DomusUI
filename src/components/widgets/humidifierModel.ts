import type { MockEntityState } from '../../types/ha';

export const HUMIDIFIER_FEATURE_MODES = 1;
export const HUMIDIFIER_PENDING_ATTRIBUTE = '__dashboard_pending_humidifier';

export type HumidifierPending = {
  isOn?: boolean;
  targetHumidity?: number;
  mode?: string;
};

export type HumidifierModel = {
  available: boolean;
  isOn: boolean;
  action: 'humidifying' | 'drying' | 'idle' | 'off' | 'unknown';
  deviceClass: 'humidifier' | 'dehumidifier';
  currentHumidity?: number;
  targetHumidity?: number;
  minHumidity: number;
  maxHumidity: number;
  targetHumidityStep: number;
  mode?: string;
  availableModes: string[];
  canSetHumidity: boolean;
  canSetMode: boolean;
  pending: HumidifierPending;
};

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function pendingValue(value: unknown): HumidifierPending {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  return {
    isOn: typeof record.isOn === 'boolean' ? record.isOn : undefined,
    targetHumidity: numberValue(record.targetHumidity),
    mode: typeof record.mode === 'string' ? record.mode : undefined,
  };
}

export function clampHumidifierTarget(value: number, min: number, max: number, step: number) {
  const safeMin = Math.min(min, max);
  const safeMax = Math.max(min, max);
  const safeStep = step > 0 ? step : 1;
  return Math.max(safeMin, Math.min(safeMax, safeMin + Math.round((value - safeMin) / safeStep) * safeStep));
}

export function resolveHumidifierModel(entity: MockEntityState | undefined): HumidifierModel {
  const attributes = entity?.rawAttributes ?? {};
  const state = String(entity?.state ?? entity?.stateLabel ?? '').trim().toLowerCase();
  const available = Boolean(entity) && (state === 'on' || state === 'off');
  const pending = pendingValue(attributes[HUMIDIFIER_PENDING_ATTRIBUTE]);
  const currentHumidity = numberValue(entity?.currentHumidity) ?? numberValue(attributes.current_humidity);
  const targetHumidity = pending.targetHumidity ?? numberValue(entity?.targetHumidity) ?? numberValue(attributes.humidity);
  const minHumidity = numberValue(entity?.minHumidity) ?? numberValue(attributes.min_humidity) ?? 0;
  const maxHumidity = numberValue(entity?.maxHumidity) ?? numberValue(attributes.max_humidity) ?? 100;
  const targetHumidityStep = numberValue(entity?.targetHumidityStep) ?? numberValue(attributes.target_humidity_step) ?? 1;
  const availableModes = Array.isArray(attributes.available_modes)
    ? attributes.available_modes.filter((mode): mode is string => typeof mode === 'string' && mode.trim().length > 0)
    : [];
  const features = numberValue(entity?.supportedFeatures ?? attributes.supported_features) ?? 0;
  const rawAction = String(attributes.action ?? '').trim().toLowerCase();
  const action = rawAction === 'humidifying' || rawAction === 'drying' || rawAction === 'idle' || rawAction === 'off'
    ? rawAction
    : 'unknown';
  return {
    available,
    isOn: pending.isOn ?? (typeof entity?.toggleOn === 'boolean' ? entity.toggleOn : state === 'on'),
    action,
    deviceClass: attributes.device_class === 'dehumidifier' ? 'dehumidifier' : 'humidifier',
    currentHumidity,
    targetHumidity,
    minHumidity: Math.min(minHumidity, maxHumidity),
    maxHumidity: Math.max(minHumidity, maxHumidity),
    targetHumidityStep: targetHumidityStep > 0 ? targetHumidityStep : 1,
    mode: pending.mode ?? (typeof attributes.mode === 'string' ? attributes.mode : undefined),
    availableModes,
    canSetHumidity: available && targetHumidity !== undefined,
    canSetMode: available && (features & HUMIDIFIER_FEATURE_MODES) !== 0 && availableModes.length > 0,
    pending,
  };
}
