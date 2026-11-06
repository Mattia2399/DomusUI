import type { MockEntityState } from '../../../types/ha';

/*
 * What a light exposes beyond brightness and colour, read from its entity, and
 * the Home Assistant call for each: the white channel, the effects, the flash.
 */

export type LightExtraAction =
  | { type: 'white'; value: number }
  | { type: 'effect'; effect: string }
  | { type: 'flash'; mode: 'short' | 'long' };

/** Read with the model of the light: the panels that read one read the other. */
export { lightExtrasOf } from './light';

export function lightExtraCall(entityId: string, action: LightExtraAction) {
  const data: Record<string, unknown> = { entity_id: entityId };
  if (action.type === 'white') data.white = Math.round((Math.min(100, Math.max(0, action.value)) / 100) * 255);
  else if (action.type === 'effect') data.effect = action.effect;
  else data.flash = action.mode;
  return { domain: 'light', service: 'turn_on', data };
}
