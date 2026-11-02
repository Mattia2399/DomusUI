// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  applyDeviceAction,
  deviceHasPanel,
  deviceKindOf,
  deviceServiceCall,
  deviceStatusOf,
  findPowerSensor,
  iconActionOf,
  isStandby,
  readWatts,
  toDeviceModel,
} from './device';

const e = (state: string, attributes: Record<string, unknown> = {}) => ({ state, rawAttributes: attributes });

describe('what a device is', () => {
  it.each([
    ['switch.tv', e('on', { device_class: 'outlet' }), 'outlet'],
    ['switch.boiler', e('on'), 'switch'],
    ['input_boolean.quiet', e('off'), 'virtual'],
    ['fan.ceiling', e('off'), 'fan'],
    ['cover.blind', e('closed'), 'cover'],
    ['humidifier.dry', e('off'), 'humidifier'],
    ['light.lamp', e('on'), null],
  ])('%s is %s', (entityId, entity, kind) => {
    expect(deviceKindOf(entityId, entity)).toBe(kind);
  });

  it('finds the meter of a plug by its device, or by its name', () => {
    const states = {
      'switch.tv': e('on'),
      'sensor.tv_power': e('86', { device_class: 'power', unit_of_measurement: 'W' }),
      'sensor.meter_7': e('12', { device_class: 'power', unit_of_measurement: 'W' }),
      'sensor.tv_energy': e('3.2', { device_class: 'energy', unit_of_measurement: 'kWh' }),
    };
    expect(findPowerSensor('switch.tv', states)).toBe('sensor.tv_power');
    const device = (id: string) => ({ 'switch.tv': 'dev1', 'sensor.meter_7': 'dev1' })[id] ?? null;
    expect(findPowerSensor('switch.tv', states, device)).toBe('sensor.meter_7');
    expect(findPowerSensor('switch.other', states)).toBeNull();
    expect(readWatts(e('0.42', { unit_of_measurement: 'kW' }))).toBe(420);
    expect(readWatts(e('unavailable'))).toBeNull();
  });
});

describe('the state of a device', () => {
  it('says the power of a plug, and that it is on standby below 8 W', () => {
    const plug = toDeviceModel('switch.tv', e('on', { device_class: 'outlet' }), { watts: 86 })!;
    expect(deviceStatusOf(plug)).toEqual({ kind: 'watts', watts: 86, standby: false });
    const console = toDeviceModel('switch.console', e('on', { device_class: 'outlet' }), { watts: 4 })!;
    expect(isStandby(console)).toBe(true);
    expect(deviceStatusOf(toDeviceModel('switch.x', e('off'), { watts: 0 })!)).toEqual({ kind: 'off', device: 'switch' });
    expect(deviceStatusOf(toDeviceModel('switch.x', e('unavailable'))!)).toEqual({ kind: 'unavailable' });
  });

  it('reads a fan: speed in steps, oscillation, direction and presets', () => {
    const fan = toDeviceModel(
      'fan.living',
      e('on', { percentage: 66, percentage_step: 33.33, oscillating: true, preset_modes: ['Auto', 'Notte'], preset_mode: null, supported_features: 11 }),
    )!;
    expect(fan.fan).toMatchObject({ pct: 66, steps: 3, oscillating: true, presets: ['Auto', 'Notte'] });
    expect(deviceStatusOf(fan)).toMatchObject({ kind: 'fan', level: 2, steps: 3, oscillating: true, winter: false });
    const ceiling = toDeviceModel('fan.ceiling', e('on', { percentage: 40, direction: 'reverse' }))!;
    expect(deviceStatusOf(ceiling)).toMatchObject({ level: 40, steps: 0, winter: true });
  });

  it('reads a cover: position, movement, stop and tilt', () => {
    const blind = toDeviceModel('cover.blind', e('opening', { current_position: 40, supported_features: 15 + 128, current_tilt_position: 30 }))!;
    expect(blind.cover).toEqual({ position: 40, moving: 'opening', canPosition: true, canStop: true, canOpen: true, canClose: true, tilt: 30 });
    expect(blind.on).toBe(true);
    expect(deviceStatusOf(blind)).toEqual({ kind: 'cover', moving: 'opening', position: 40, open: true });
    expect(toDeviceModel('cover.door', e('closed', { supported_features: 3 }))!.cover).toMatchObject({ position: null, canPosition: false, canStop: false });
  });

  it('reads a humidifier: now, target and modes', () => {
    const dry = toDeviceModel('humidifier.dry', e('on', { current_humidity: 48, humidity: 50, available_modes: ['Normale', 'Auto'], mode: 'Auto' }))!;
    expect(deviceStatusOf(dry)).toEqual({ kind: 'humidity', current: 48, target: 50 });
    expect(deviceStatusOf({ ...dry, on: false })).toEqual({ kind: 'off', device: 'humidifier', humidity: 48 });
  });

  it('opens a panel only when there is more than on and off', () => {
    expect(deviceHasPanel(toDeviceModel('switch.x', e('on'))!)).toBe(false);
    expect(deviceHasPanel(toDeviceModel('input_boolean.x', e('on'))!)).toBe(false);
    expect(deviceHasPanel(toDeviceModel('switch.x', e('on'), { watts: 3 })!)).toBe(true);
    expect(deviceHasPanel(toDeviceModel('fan.x', e('off'))!)).toBe(true);
  });
});

describe('the commands of a device', () => {
  it('turns things on and off in their own domain', () => {
    expect(deviceServiceCall(toDeviceModel('input_boolean.quiet', e('off'))!, { type: 'turn_on' })).toEqual({
      domain: 'input_boolean',
      service: 'turn_on',
      data: { entity_id: 'input_boolean.quiet' },
    });
  });

  it('opens, closes or stops a cover from the icon', () => {
    const closed = toDeviceModel('cover.blind', e('closed', { current_position: 0, supported_features: 15 }))!;
    expect(iconActionOf(closed)).toEqual({ type: 'cover_open' });
    const open = toDeviceModel('cover.blind', e('open', { current_position: 60, supported_features: 15 }))!;
    expect(iconActionOf(open)).toEqual({ type: 'cover_close' });
    const moving = toDeviceModel('cover.blind', e('closing', { current_position: 30, supported_features: 15 }))!;
    expect(iconActionOf(moving)).toEqual({ type: 'cover_stop' });
    expect(deviceServiceCall(open, { type: 'cover_position', position: 50 })).toEqual({
      domain: 'cover',
      service: 'set_cover_position',
      data: { entity_id: 'cover.blind', position: 50 },
    });
    expect(applyDeviceAction(open, { type: 'cover_position', position: 20 }).cover?.moving).toBe('closing');
  });

  it('builds the fan and humidifier calls', () => {
    const fan = toDeviceModel('fan.f', e('on', { percentage: 50 }))!;
    expect(deviceServiceCall(fan, { type: 'fan_pct', pct: 66 }).data).toEqual({ entity_id: 'fan.f', percentage: 66 });
    expect(deviceServiceCall(fan, { type: 'fan_oscillate', oscillating: true }).service).toBe('oscillate');
    expect(deviceServiceCall(fan, { type: 'fan_direction', direction: 'reverse' }).data).toEqual({ entity_id: 'fan.f', direction: 'reverse' });
    expect(deviceServiceCall(fan, { type: 'fan_preset', preset: 'Notte' }).data).toEqual({ entity_id: 'fan.f', preset_mode: 'Notte' });
    const dry = toDeviceModel('humidifier.h', e('on', { humidity: 50 }))!;
    expect(deviceServiceCall(dry, { type: 'humidity', target: 55 }).data).toEqual({ entity_id: 'humidifier.h', humidity: 55 });
    expect(deviceServiceCall(dry, { type: 'humidifier_mode', mode: 'Auto' }).service).toBe('set_mode');
  });
});
