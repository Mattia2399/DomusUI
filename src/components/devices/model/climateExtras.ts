import type { MockEntityState } from '../../../types/ha';

/*
 * What a climate device exposes beyond modes and temperature, read from its entity, and
 * the Home Assistant call for each: the humidity it aims at and the horizontal louvers.
 */

export type ClimateExtraAction = { type: 'humidity'; value: number } | { type: 'horizontal_swing'; mode: string };

/** Read with the model of the climate: the panels that read one read the other. */
export { climateExtrasOf, type ClimateExtras } from './climate';

export function climateExtraCall(entityId: string, action: ClimateExtraAction) {
  return action.type === 'humidity'
    ? { domain: 'climate', service: 'set_humidity', data: { entity_id: entityId, humidity: action.value } }
    : { domain: 'climate', service: 'set_swing_horizontal_mode', data: { entity_id: entityId, swing_horizontal_mode: action.mode } };
}
