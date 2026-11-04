import { describe, expect, it } from 'vitest';
import { climateExtraCall, climateExtrasOf } from './climateExtras';

const entity = (rawAttributes: Record<string, unknown>) => ({ state: 'heat', rawAttributes }) as never;

describe('what a climate device exposes beyond its temperature', () => {
  it('reads the humidity and the horizontal louvers it declares', () => {
    const extras = climateExtrasOf(entity({ supported_features: 4 | 512, humidity: 50, min_humidity: 30, max_humidity: 80, swing_horizontal_mode: 'center', swing_horizontal_modes: ['center', 'wide', ''] }));
    expect(extras.supportsTargetHumidity).toBe(true);
    expect(extras.targetHumidity).toBe(50);
    expect(extras.supportsHorizontalSwing).toBe(true);
    expect(extras.horizontalSwing).toBe('center');
    expect(extras.horizontalSwingModes).toEqual(['center', 'wide']);
  });

  it('offers neither when the device does not declare them', () => {
    const extras = climateExtrasOf(entity({ supported_features: 1, humidity: 50, swing_horizontal_modes: ['center'] }));
    expect(extras.supportsTargetHumidity).toBe(false);
    expect(extras.supportsHorizontalSwing).toBe(false);
    expect(climateExtrasOf(undefined).horizontalSwingModes).toEqual([]);
  });

  it('calls the service of each', () => {
    expect(climateExtraCall('climate.a', { type: 'humidity', value: 55 })).toEqual({ domain: 'climate', service: 'set_humidity', data: { entity_id: 'climate.a', humidity: 55 } });
    expect(climateExtraCall('climate.a', { type: 'horizontal_swing', mode: 'wide' })).toEqual({ domain: 'climate', service: 'set_swing_horizontal_mode', data: { entity_id: 'climate.a', swing_horizontal_mode: 'wide' } });
  });
});
