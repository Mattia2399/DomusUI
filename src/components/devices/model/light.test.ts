// @vitest-environment node

import { describe, expect, it } from 'vitest';
import type { MockEntityState } from '../../../types/ha';
import {
  applyLightAction,
  lightCapsOf,
  lightHasPanel,
  lightServiceCall,
  lightStatusOf,
  lightTone,
  toLightModel,
} from './light';

const light = (state: string, attributes: Record<string, unknown> = {}, extra: Partial<MockEntityState> = {}): MockEntityState => ({
  state,
  rawAttributes: { friendly_name: 'Lampada da terra', ...attributes },
  ...extra,
});

describe('what a light can do', () => {
  it.each([
    [['onoff'], 'onoff'],
    [['brightness'], 'dim'],
    [['color_temp'], 'ct'],
    [['color_temp', 'hs'], 'color'],
    [['xy'], 'color'],
    [['rgb'], 'color'],
    [['rgbw'], 'color'],
    [['rgbww'], 'color'],
  ])('%j is %s', (modes, caps) => {
    expect(lightCapsOf(light('on', { supported_color_modes: modes }))).toBe(caps);
  });

  it('opens a panel only when there is more than on and off', () => {
    expect(lightHasPanel(toLightModel('light.a', light('on', { supported_color_modes: ['onoff'] })))).toBe(false);
    expect(lightHasPanel(toLightModel('light.a', light('on', { supported_color_modes: ['brightness'] })))).toBe(true);
  });
});

describe('the state of a light', () => {
  it('reads brightness 0–255 as 1–100%', () => {
    const at = (brightness: number) =>
      toLightModel('light.a', light('on', { supported_color_modes: ['brightness'], brightness })).brightnessPct;
    expect(at(255)).toBe(100);
    expect(at(184)).toBe(72);
    expect(at(1)).toBe(1);
    expect(at(0)).toBe(1);
  });

  it('takes the current mode, the temperature in kelvin and the hue', () => {
    const white = toLightModel(
      'light.a',
      light('on', { supported_color_modes: ['color_temp', 'hs'], color_mode: 'color_temp', color_temp_kelvin: 2700 }),
    );
    expect(white).toMatchObject({ caps: 'color', mode: 'temp', kelvin: 2700 });
    const coloured = toLightModel(
      'light.a',
      light('on', { supported_color_modes: ['color_temp', 'hs'], color_mode: 'hs', hs_color: [200, 80] }),
    );
    expect(coloured).toMatchObject({ mode: 'color', hue: 200, saturation: 80 });
    expect(toLightModel('light.a', light('on', { supported_color_modes: ['color_temp'], color_temp: 250 })).kelvin).toBe(4000);
  });

  it.each([
    [2200, 'candle'],
    [2499, 'candle'],
    [2700, 'warm'],
    [3299, 'warm'],
    [4000, 'neutral'],
    [4799, 'neutral'],
    [6500, 'cool'],
  ])('calls %i K %s', (kelvin, tone) => {
    expect(lightTone(kelvin)).toBe(tone);
  });

  it('says what the light is doing', () => {
    const status = (state: string, attributes: Record<string, unknown>) => lightStatusOf(toLightModel('light.a', light(state, attributes)));
    expect(status('on', { supported_color_modes: ['color_temp'], brightness: 184, color_temp_kelvin: 2700 })).toEqual({
      kind: 'level',
      pct: 72,
      detail: 'warm',
    });
    expect(status('on', { supported_color_modes: ['hs'], color_mode: 'hs', brightness: 102 })).toEqual({
      kind: 'level',
      pct: 40,
      detail: 'color',
    });
    expect(status('on', { supported_color_modes: ['brightness'], brightness: 128 })).toEqual({ kind: 'level', pct: 50, detail: null });
    expect(status('on', { supported_color_modes: ['onoff'] })).toEqual({ kind: 'on' });
    expect(status('off', { supported_color_modes: ['brightness'] })).toEqual({ kind: 'off' });
    expect(status('unavailable', {})).toEqual({ kind: 'unavailable' });
    expect(lightStatusOf(toLightModel('light.gone', undefined))).toEqual({ kind: 'unavailable' });
  });

  it('names a light from Home Assistant, or from its id', () => {
    expect(toLightModel('light.a', light('on')).name).toBe('Lampada da terra');
    expect(toLightModel('light.living_room_lamp', { state: 'on' }).name).toBe('Living Room Lamp');
  });
});

describe('the commands of a light', () => {
  const lamp = toLightModel(
    'light.lamp',
    light('on', { supported_color_modes: ['color_temp', 'hs'], color_mode: 'color_temp', color_temp_kelvin: 2700, hs_color: [30, 90] }),
  );

  it('builds the Home Assistant call of each command', () => {
    expect(lightServiceCall(lamp, { type: 'turn_off' })).toEqual({ domain: 'light', service: 'turn_off', data: { entity_id: 'light.lamp' } });
    expect(lightServiceCall(lamp, { type: 'turn_on' })).toEqual({ domain: 'light', service: 'turn_on', data: { entity_id: 'light.lamp' } });
    expect(lightServiceCall(lamp, { type: 'brightness', pct: 50 }).data).toEqual({ entity_id: 'light.lamp', brightness: 128 });
    expect(lightServiceCall(lamp, { type: 'kelvin', kelvin: 4000 }).data).toEqual({ entity_id: 'light.lamp', color_temp_kelvin: 4000 });
    expect(lightServiceCall(lamp, { type: 'hue', hue: 200 }).data).toEqual({ entity_id: 'light.lamp', hs_color: [200, 90] });
    expect(lightServiceCall(lamp, { type: 'mode', mode: 'color' }).data).toEqual({ entity_id: 'light.lamp', hs_color: [30, 90] });
  });

  it('shows the result straight away', () => {
    expect(applyLightAction(lamp, { type: 'turn_off' }).on).toBe(false);
    expect(applyLightAction({ ...lamp, on: false }, { type: 'brightness', pct: 30 })).toMatchObject({ on: true, brightnessPct: 30 });
    expect(applyLightAction(lamp, { type: 'hue', hue: 130 })).toMatchObject({ mode: 'color', hue: 130 });
    expect(applyLightAction(lamp, { type: 'kelvin', kelvin: 6500 })).toMatchObject({ mode: 'temp', kelvin: 6500 });
  });
});
