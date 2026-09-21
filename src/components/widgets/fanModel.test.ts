import { describe, expect, it } from 'vitest';
import { FAN_FEATURE, FAN_PENDING_ATTRIBUTE, quantizeFanPercentage, resolveFanModel } from './fanModel';
import { FAN_CARD_CAPABILITY } from './cardCapabilityRegistry';

describe('fan capability model', () => {
  it('keeps unsupported controls hidden for a power-only entity', () => {
    const fan = resolveFanModel({
      state: 'off',
      supportedFeatures: FAN_FEATURE.TURN_ON | FAN_FEATURE.TURN_OFF,
      rawAttributes: { percentage: 40, oscillating: false, preset_modes: ['breeze'] },
    });
    expect(fan.canTurnOn).toBe(true);
    expect(fan.canSetSpeed).toBe(false);
    expect(fan.canSetPreset).toBe(false);
    expect(fan.canOscillate).toBe(false);
    expect(fan.canSetDirection).toBe(false);
  });

  it('exposes only features supported by HA and valid attributes', () => {
    const fan = resolveFanModel({
      state: 'on',
      supportedFeatures: 63,
      rawAttributes: {
        percentage: 75,
        speed_count: 4,
        preset_modes: ['eco', 'breeze'],
        preset_mode: 'eco',
        oscillating: true,
        direction: 'reverse',
      },
    });
    expect(fan.isOn).toBe(true);
    expect(fan.canSetSpeed).toBe(true);
    expect(fan.canSetPreset).toBe(true);
    expect(fan.canOscillate).toBe(true);
    expect(fan.canSetDirection).toBe(true);
    expect(fan.percentage).toBe(75);
    expect(fan.direction).toBe('reverse');
  });

  it('shows optimistic values without mutating the HA attributes', () => {
    const attributes = {
      percentage: 25,
      [FAN_PENDING_ATTRIBUTE]: { percentage: 75, isOn: true },
    };
    const fan = resolveFanModel({ state: 'off', supportedFeatures: 63, rawAttributes: attributes });
    expect(fan.isOn).toBe(true);
    expect(fan.percentage).toBe(75);
    expect(attributes.percentage).toBe(25);
  });

  it('fails closed when the fan is unavailable', () => {
    const fan = resolveFanModel({ state: 'unavailable', supportedFeatures: 63, rawAttributes: { percentage: 50 } });
    expect(fan.available).toBe(false);
    expect(fan.canTurnOn).toBe(false);
    expect(fan.canSetSpeed).toBe(false);
  });

  it('snaps requested percentages to discrete speed steps', () => {
    expect(quantizeFanPercentage(63, 4)).toBe(75);
    expect(quantizeFanPercentage(24, 4)).toBe(25);
    const fan = resolveFanModel({ state: 'on', supportedFeatures: 63, rawAttributes: { percentage: 50, percentage_step: 25 } });
    expect(fan.speedCount).toBe(4);
  });

  it('uses static layout spans regardless of the power state', () => {
    expect(FAN_CARD_CAPABILITY.supportsAutoExpand).toBe(false);
    expect(FAN_CARD_CAPABILITY.defaultSpans.xs).toEqual({ w: 2, h: 1 });
    expect(FAN_CARD_CAPABILITY.defaultSpans.xl).toEqual({ w: 2, h: 1 });
    expect(FAN_CARD_CAPABILITY.resolveDisplayVariant({ layout: { w: 2, h: 1 }, isInsideStack: false })).toBe('standard');
    expect(FAN_CARD_CAPABILITY.resolvePixelDisplayVariant({ width: 210, height: 110 })).toBe('standard');
  });
});
