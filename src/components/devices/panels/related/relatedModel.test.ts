import { describe, expect, it } from 'vitest';
import { dateAndTimeOf } from './looks/TextLooks';
import { secondsOf } from './looks/AdvancedLooks';
import { formatRelatedValue, isInternalPath, relatedModelOf } from './relatedModel';

describe('reading an entity', () => {
  it('takes the number, its limits and its unit', () => {
    const model = relatedModelOf('number.a', { state: '3', rawAttributes: { friendly_name: 'Potenza', min: 1, max: 5, step: 1 } });
    expect(model).toMatchObject({ name: 'Potenza', number: 3, min: 1, max: 5, step: 1, available: true, domain: 'number' });
  });

  it('its own name comes first', () => {
    expect(relatedModelOf('number.a', { state: '3', rawAttributes: { friendly_name: 'Potenza' } }, 'Fiamma').name).toBe('Fiamma');
    expect(relatedModelOf('number.a', undefined).name).toBe('number.a');
  });

  it('an entity that is gone or does not answer is not available', () => {
    expect(relatedModelOf('sensor.a', undefined).available).toBe(false);
    expect(relatedModelOf('sensor.a', { state: 'unavailable' }).available).toBe(false);
    expect(relatedModelOf('sensor.a', { state: 'unknown' }).available).toBe(false);
  });

  it('a button is "unknown" until it is pressed, and that is fine', () => {
    expect(relatedModelOf('button.a', { state: 'unknown' }).available).toBe(true);
    expect(relatedModelOf('scene.a', { state: 'unknown' }).available).toBe(true);
    expect(relatedModelOf('button.a', { state: 'unavailable' }).available).toBe(false);
  });

  it('on and off as the small widgets have always read them', () => {
    expect(relatedModelOf('switch.a', { state: 'on' }).on).toBe(true);
    expect(relatedModelOf('switch.a', { state: 'off' }).on).toBe(false);
    expect(relatedModelOf('switch.a', { state: 'off', toggleOn: true }).on).toBe(true);
    expect(relatedModelOf('lock.a', { state: 'locked' }).on).toBe(true);
  });

  it('how full it is, as the small ring has always read it', () => {
    expect(relatedModelOf('sensor.a', { state: '140', unit: '%' }).percent).toBe(100);
    expect(relatedModelOf('sensor.a', { state: '0.4' }).percent).toBe(40);
    expect(relatedModelOf('sensor.a', { state: '72' }).percent).toBe(72);
    expect(relatedModelOf('light.a', { state: 'on', brightness: 127.5 }).percent).toBe(50);
    expect(relatedModelOf('light.a', { state: 'on' }).percent).toBe(100);
    expect(relatedModelOf('light.a', { state: 'off' }).percent).toBe(0);
  });

  it('writes the value with its unit in the language of the user', () => {
    expect(formatRelatedValue({ number: 56.4, unit: '°C', state: '56.4' }, 'it-IT')).toBe('56,4°');
    expect(formatRelatedValue({ number: 40, unit: '%', state: '40' }, 'it-IT')).toBe('40%');
    expect(formatRelatedValue({ number: 3, unit: 'kW', state: '3' }, 'it-IT')).toBe('3 kW');
    expect(formatRelatedValue({ number: null, state: 'Comfort' }, 'it-IT')).toBe('Comfort');
  });
});

describe('the path of a page button', () => {
  it.each(['/home', '/rooms', '/settings/access', '/settings?tab=a#b'])('accepts %s', (path) => {
    expect(isInternalPath(path)).toBe(true);
  });

  it.each(['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '/javascript:alert(1)', 'home', '', '/a b', '\\\\evil'])('ignores %s', (path) => {
    expect(isInternalPath(path)).toBe(false);
  });

  it('ignores what is not a text', () => {
    expect(isInternalPath(undefined)).toBe(false);
  });
});

describe('reading times', () => {
  it('a date and a time from their entity', () => {
    expect(dateAndTimeOf({ domain: 'input_datetime', state: '2026-11-14 18:00:00', attributes: {} })).toEqual({ date: '2026-11-14', time: '18:00' });
    expect(dateAndTimeOf({ domain: 'input_datetime', state: '06:30:00', attributes: {} })).toEqual({ date: null, time: '06:30' });
    expect(dateAndTimeOf({ domain: 'input_datetime', state: '2026-11-14', attributes: {} })).toEqual({ date: '2026-11-14', time: null });
    expect(dateAndTimeOf({ domain: 'time', state: '06:30:00', attributes: {} })).toEqual({ date: null, time: '06:30' });
    expect(dateAndTimeOf({ domain: 'datetime', state: '2026-11-14T18:00:00+00:00', attributes: {} })).toEqual({ date: '2026-11-14', time: '18:00' });
  });

  it('the seconds of a timer', () => {
    expect(secondsOf('0:04:06')).toBe(246);
    expect(secondsOf('bad')).toBe(0);
    expect(secondsOf(undefined)).toBe(0);
  });
});
