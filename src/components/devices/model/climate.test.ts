// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  applyClimateAction,
  climateCanStep,
  climateOnMode,
  climateServiceCall,
  climateSwingToggle,
  toClimateModel,
} from './climate';

const ac = (state: string, attributes: Record<string, unknown> = {}) =>
  toClimateModel('climate.living', {
    state,
    rawAttributes: {
      friendly_name: 'Climatizzatore',
      hvac_modes: ['off', 'heat', 'cool', 'heat_cool', 'dry', 'fan_only'],
      min_temp: 16,
      max_temp: 30,
      target_temp_step: 0.5,
      current_temperature: 20.9,
      ...attributes,
    },
  });

describe('what a climate device is doing', () => {
  it('reads its modes in a fixed order, and its targets', () => {
    const model = ac('heat', { temperature: 23 });
    expect(model.modes).toEqual(['off', 'heat', 'cool', 'heat_cool', 'dry', 'fan_only']);
    expect(model).toMatchObject({ mode: 'heat', target: 23, current: 20.9, min: 16, max: 30, step: 0.5 });
  });

  it('takes what it is doing from Home Assistant, else works it out', () => {
    expect(ac('heat', { temperature: 23, hvac_action: 'idle' }).activity).toBe('idle');
    expect(ac('heat', { temperature: 23 }).activity).toBe('heating');
    expect(ac('cool', { temperature: 25 }).activity).toBe('idle');
    expect(ac('heat_cool', { target_temp_low: 21, target_temp_high: 24 }).activity).toBe('heating');
    expect(ac('dry').activity).toBe('drying');
    expect(ac('off').activity).toBe('off');
  });

  it('steps a target or a whole range, within its limits', () => {
    expect(climateCanStep(ac('heat', { temperature: 23 }))).toBe(true);
    expect(climateCanStep(ac('dry'))).toBe(false);
    expect(climateCanStep(ac('off', { temperature: 23 }))).toBe(false);
    expect(applyClimateAction(ac('heat', { temperature: 29.5 }), { type: 'step', delta: 2 }).target).toBe(30);
    const range = applyClimateAction(ac('heat_cool', { target_temp_low: 20, target_temp_high: 24 }), { type: 'step', delta: -1 });
    expect([range.low, range.high]).toEqual([19.5, 23.5]);
  });

  it('turns on in heating when it can, and offers a switch for a simple swing', () => {
    expect(climateOnMode(ac('off'))).toBe('heat');
    expect(climateOnMode(toClimateModel('climate.x', { state: 'off', rawAttributes: { hvac_modes: ['off', 'cool'] } }))).toBe('cool');
    expect(climateSwingToggle(ac('cool', { swing_modes: ['off', 'vertical'], swing_mode: 'vertical' }))).toEqual({ on: true, onMode: 'vertical' });
    expect(climateSwingToggle(ac('cool', { swing_modes: ['vertical', 'horizontal'] }))).toBeNull();
  });

  it('leaves out the empty preset of Home Assistant', () => {
    const model = ac('heat', { preset_modes: ['none', 'eco', 'comfort'], preset_mode: 'none' });
    expect(model.presets).toEqual(['eco', 'comfort']);
    expect(model.preset).toBeNull();
  });
});

describe('the commands of a climate device', () => {
  it('builds the Home Assistant calls', () => {
    const model = ac('heat', { temperature: 23, target_temp_low: 20, target_temp_high: 24 });
    expect(climateServiceCall(model, { type: 'turn_off' })).toEqual({
      domain: 'climate',
      service: 'set_hvac_mode',
      data: { entity_id: 'climate.living', hvac_mode: 'off' },
    });
    expect(climateServiceCall(ac('off'), { type: 'turn_on' }).data).toEqual({ entity_id: 'climate.living', hvac_mode: 'heat' });
    expect(climateServiceCall(model, { type: 'step', delta: 1 }).data).toEqual({ entity_id: 'climate.living', temperature: 23.5 });
    expect(climateServiceCall(model, { type: 'range', low: 19.9, high: 24.2 }).data).toEqual({
      entity_id: 'climate.living',
      target_temp_low: 20,
      target_temp_high: 24,
    });
    expect(climateServiceCall(model, { type: 'fan', fanMode: 'low' }).service).toBe('set_fan_mode');
    expect(climateServiceCall(model, { type: 'swing', swing: 'off' }).service).toBe('set_swing_mode');
    expect(climateServiceCall(model, { type: 'preset', preset: 'eco' }).data).toEqual({ entity_id: 'climate.living', preset_mode: 'eco' });
  });
});
