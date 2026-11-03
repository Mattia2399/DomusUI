import type { MockEntityState } from '../../../types/ha';

/*
 * What a light exposes beyond brightness and colour, read from its entity, and
 * the Home Assistant call for each: the white channel, the effects, the flash.
 */

const FEATURE_FLASH = 8;
const FEATURE_WHITE = 128;

export type LightExtraAction =
  | { type: 'white'; value: number }
  | { type: 'effect'; effect: string }
  | { type: 'flash'; mode: 'short' | 'long' };

export function lightExtrasOf(entity: MockEntityState | undefined) {
  const attributes = entity?.rawAttributes ?? {};
  const features = Number(attributes.supported_features ?? entity?.supportedFeatures ?? 0) || 0;
  const modes = Array.isArray(attributes.supported_color_modes) ? attributes.supported_color_modes : [];
  const list = Array.isArray(attributes.effect_list) ? attributes.effect_list : [];
  const effects = Array.from(
    new Map(
      list
        .filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
        .map((entry) => [entry.trim().toLowerCase(), entry.trim()] as const)
        .reverse(),
    ).values(),
  ).reverse();
  return {
    supportsWhite: modes.includes('white') || (features & FEATURE_WHITE) !== 0,
    supportsEffects: effects.length > 0,
    supportsFlash: (features & FEATURE_FLASH) !== 0,
    effect: typeof attributes.effect === 'string' ? attributes.effect : undefined,
    effects,
  };
}

export function lightExtraCall(entityId: string, action: LightExtraAction) {
  const data: Record<string, unknown> = { entity_id: entityId };
  if (action.type === 'white') data.white = Math.round((Math.min(100, Math.max(0, action.value)) / 100) * 255);
  else if (action.type === 'effect') data.effect = action.effect;
  else data.flash = action.mode;
  return { domain: 'light', service: 'turn_on', data };
}
