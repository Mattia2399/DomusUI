// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  applyLockCommand,
  lockServiceCall,
  onSpans,
  parseStateHistory,
  securityAlerts,
  securityKindOf,
  securityWarns,
  toSecurityModel,
} from './security';

const e = (state: string, attributes: Record<string, unknown> = {}) => ({ state, rawAttributes: attributes });

describe('what a security device is', () => {
  it.each([
    ['binary_sensor.window', 'window', 'contact'],
    ['binary_sensor.door', 'door', 'contact'],
    ['binary_sensor.hall', 'motion', 'motion'],
    ['binary_sensor.room', 'occupancy', 'motion'],
    ['binary_sensor.glass', 'vibration', 'vibration'],
    ['binary_sensor.sink', 'moisture', 'leak'],
    ['binary_sensor.smoke', 'smoke', null],
    ['lock.front', '', 'lock'],
    ['camera.garden', '', 'camera'],
  ])('%s of class %s is %s', (entityId, deviceClass, kind) => {
    expect(securityKindOf(entityId, e('off', { device_class: deviceClass }))).toBe(kind);
  });
});

describe('what calls for attention', () => {
  it('an open window, a leak, a lock not locked or stuck, a device away, a low battery', () => {
    const window = (state: string, battery?: number) =>
      toSecurityModel('binary_sensor.w', e(state, { device_class: 'window' }), { battery })!;
    expect(securityWarns(window('on'))).toBe(true);
    expect(securityAlerts(window('on'))).toBe(true);
    expect(securityWarns(window('off'))).toBe(false);
    expect(securityWarns(window('off', 12))).toBe(true);
    expect(securityAlerts(window('off', 12))).toBe(false);
    expect(securityWarns(window('unavailable'))).toBe(true);
    const lock = (state: string) => toSecurityModel('lock.front', e(state))!;
    expect(securityWarns(lock('locked'))).toBe(false);
    expect(securityWarns(lock('unlocked'))).toBe(true);
    expect(securityAlerts(lock('jammed'))).toBe(true);
    expect(securityWarns(toSecurityModel('binary_sensor.m', e('on', { device_class: 'motion' }))!)).toBe(false);
  });
});

describe('a lock', () => {
  it('locks, unlocks and opens when it can', () => {
    const lock = toSecurityModel('lock.front', e('locked', { supported_features: 1 }))!;
    expect(lock.canOpen).toBe(true);
    expect(lockServiceCall(lock, 'unlock')).toEqual({ domain: 'lock', service: 'unlock', data: { entity_id: 'lock.front' } });
    expect(applyLockCommand(lock, 'unlock')).toMatchObject({ lock: 'unlocking', active: true });
    expect(toSecurityModel('lock.back', e('locked'))!.canOpen).toBe(false);
  });
});

describe('the day of a contact', () => {
  it('reads the state changes, without repeats, and the spans it was open', () => {
    const changes = parseStateHistory(
      {
        'binary_sensor.w': [
          { s: 'off', lu: 0 },
          { s: 'on', lu: 3600 },
          { s: 'on', lu: 3700 },
          { s: 'off', lu: 7200 },
          { s: 'on', lu: 18000 },
        ],
      },
      'binary_sensor.w',
    );
    expect(changes.map((change) => change.state)).toEqual(['off', 'on', 'off', 'on']);
    const spans = onSpans(changes, 0, 21_600_000);
    expect(spans).toHaveLength(2);
    expect(spans[0]).toEqual({ start: 1 / 6, end: 2 / 6 });
    expect(spans[1].end).toBe(1);
  });
});
