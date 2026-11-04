import type { MockEntityState } from '../../../types/ha';

/*
 * What a climate device exposes beyond modes and temperature, read from its entity, and
 * the Home Assistant call for each: the humidity it aims at and the horizontal louvers.
 */

const FEATURE_TARGET_HUMIDITY = 4;
const FEATURE_SWING_HORIZONTAL = 512;

export type ClimateExtras = {
  supportsTargetHumidity?: boolean;
  targetHumidity?: number;
  minHumidity?: number;
  maxHumidity?: number;
  targetHumidityStep?: number;
  supportsHorizontalSwing?: boolean;
  horizontalSwing?: string;
  horizontalSwingModes?: string[];
};

export type ClimateExtraAction = { type: 'humidity'; value: number } | { type: 'horizontal_swing'; mode: string };

const asNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

export function climateExtrasOf(entity: MockEntityState | undefined): ClimateExtras {
  const attributes = entity?.rawAttributes ?? {};
  const features = Number(attributes.supported_features ?? entity?.supportedFeatures ?? 0) || 0;
  const modes = attributes.swing_horizontal_modes;
  return {
    supportsTargetHumidity: (features & FEATURE_TARGET_HUMIDITY) !== 0,
    targetHumidity: asNumber(attributes.humidity),
    minHumidity: asNumber(attributes.min_humidity),
    maxHumidity: asNumber(attributes.max_humidity),
    targetHumidityStep: asNumber(attributes.target_humidity_step),
    supportsHorizontalSwing: (features & FEATURE_SWING_HORIZONTAL) !== 0,
    horizontalSwing: typeof attributes.swing_horizontal_mode === 'string' ? attributes.swing_horizontal_mode : undefined,
    horizontalSwingModes: Array.isArray(modes) ? modes.filter((mode): mode is string => typeof mode === 'string' && mode.trim() !== '') : [],
  };
}

export function climateExtraCall(entityId: string, action: ClimateExtraAction) {
  return action.type === 'humidity'
    ? { domain: 'climate', service: 'set_humidity', data: { entity_id: entityId, humidity: action.value } }
    : { domain: 'climate', service: 'set_swing_horizontal_mode', data: { entity_id: entityId, swing_horizontal_mode: action.mode } };
}
