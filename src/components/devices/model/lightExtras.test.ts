import { describe, expect, it } from 'vitest';
import type { MockEntityState } from '../../../types/ha';
import { lightExtraCall, lightExtrasOf } from './lightExtras';

const light = (rawAttributes: Record<string, unknown>) => ({ state: 'on', rawAttributes }) as unknown as MockEntityState;

describe('what a light exposes beyond brightness and colour', () => {
  it('shows nothing for a light that exposes nothing', () => {
    expect(lightExtrasOf(light({ supported_color_modes: ['brightness'] }))).toEqual({
      supportsWhite: false,
      supportsEffects: false,
      supportsFlash: false,
      effect: undefined,
      effects: [],
    });
  });

  it('reads the white channel, the flash and the effects, each name once', () => {
    const extras = lightExtrasOf(light({ supported_color_modes: ['white'], supported_features: 8, effect: 'Pulse', effect_list: ['Pulse', 'pulse', ' Colorloop ', 3] }));
    expect(extras.supportsWhite).toBe(true);
    expect(extras.supportsFlash).toBe(true);
    expect(extras.supportsEffects).toBe(true);
    expect(extras.effect).toBe('Pulse');
    expect(extras.effects).toEqual(['Pulse', 'Colorloop']);
  });

  it('does not offer effects when the entity does not list them', () => {
    expect(lightExtrasOf(light({ supported_features: 4 })).supportsEffects).toBe(false);
  });

  it('calls light.turn_on with what was asked', () => {
    expect(lightExtraCall('light.a', { type: 'white', value: 50 }).data).toEqual({ entity_id: 'light.a', white: 128 });
    expect(lightExtraCall('light.a', { type: 'effect', effect: 'Pulse' }).data).toEqual({ entity_id: 'light.a', effect: 'Pulse' });
    expect(lightExtraCall('light.a', { type: 'flash', mode: 'long' })).toEqual({ domain: 'light', service: 'turn_on', data: { entity_id: 'light.a', flash: 'long' } });
  });
});
