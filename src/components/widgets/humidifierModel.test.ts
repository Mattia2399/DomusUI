import { describe, expect, it } from 'vitest';
import { HUMIDIFIER_FEATURE_MODES, HUMIDIFIER_PENDING_ATTRIBUTE, clampHumidifierTarget, resolveHumidifierModel } from './humidifierModel';
import { HUMIDIFIER_CARD_CAPABILITY } from './cardCapabilityRegistry';

describe('humidifier capability model', () => {
  it('reads the HA humidity, action and modes contract', () => {
    const model = resolveHumidifierModel({
      state: 'on',
      supportedFeatures: HUMIDIFIER_FEATURE_MODES,
      rawAttributes: {
        action: 'humidifying',
        current_humidity: 42,
        humidity: 50,
        min_humidity: 30,
        max_humidity: 70,
        target_humidity_step: 5,
        mode: 'auto',
        available_modes: ['normal', 'auto'],
      },
    });
    expect(model.available).toBe(true);
    expect(model.action).toBe('humidifying');
    expect(model.currentHumidity).toBe(42);
    expect(model.targetHumidity).toBe(50);
    expect(model.canSetHumidity).toBe(true);
    expect(model.canSetMode).toBe(true);
  });

  it('uses optimistic values without mutating Home Assistant attributes', () => {
    const rawAttributes = {
      humidity: 45,
      mode: 'normal',
      [HUMIDIFIER_PENDING_ATTRIBUTE]: { targetHumidity: 55, mode: 'sleep' },
    };
    const model = resolveHumidifierModel({ state: 'on', supportedFeatures: 1, rawAttributes });
    expect(model.targetHumidity).toBe(55);
    expect(model.mode).toBe('sleep');
    expect(rawAttributes.humidity).toBe(45);
  });

  it('fails closed when unavailable and clamps to the configured step', () => {
    const model = resolveHumidifierModel({ state: 'unavailable', supportedFeatures: 1, rawAttributes: { humidity: 50 } });
    expect(model.available).toBe(false);
    expect(model.canSetHumidity).toBe(false);
    expect(clampHumidifierTarget(58, 30, 70, 5)).toBe(60);
    expect(clampHumidifierTarget(46, 35, 75, 10)).toBe(45);
  });

  it('uses state-independent card spans', () => {
    expect(HUMIDIFIER_CARD_CAPABILITY.supportsAutoExpand).toBe(false);
    expect(HUMIDIFIER_CARD_CAPABILITY.defaultSpans.xs).toEqual({ w: 2, h: 1 });
    expect(HUMIDIFIER_CARD_CAPABILITY.defaultSpans.xl).toEqual({ w: 2, h: 1 });
    expect(HUMIDIFIER_CARD_CAPABILITY.resolveDisplayVariant({ layout: { w: 2, h: 1 }, isInsideStack: false })).toBe('standard');
    expect(HUMIDIFIER_CARD_CAPABILITY.resolvePixelDisplayVariant({ width: 210, height: 110 })).toBe('standard');
  });
});
