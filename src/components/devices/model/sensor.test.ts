// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  parseHistoryPoints,
  sensorKindOf,
  sensorNeedsAttention,
  sensorReading,
  seriesStats,
  seriesTrend,
  sparkline,
  toSensorModel,
} from './sensor';

const e = (state: string, attributes: Record<string, unknown>) => ({ state, rawAttributes: attributes });

describe('what a sensor is', () => {
  it.each([
    ['sensor.t', 'temperature', 'temp'],
    ['sensor.h', 'humidity', 'hum'],
    ['sensor.c', 'carbon_dioxide', 'co2'],
    ['sensor.p', 'pm25', 'pm'],
    ['sensor.l', 'illuminance', 'lux'],
    ['sensor.n', 'sound_pressure', 'noise'],
    ['binary_sensor.s', 'smoke', 'smoke'],
    ['sensor.power', 'power', null],
    ['binary_sensor.door', 'door', null],
  ])('%s of class %s is %s', (entityId, deviceClass, kind) => {
    expect(sensorKindOf(entityId, e('1', { device_class: deviceClass }))).toBe(kind);
  });
});

describe('where a reading sits', () => {
  it('names the band of each kind, and warns when something should be done', () => {
    const at = (entityId: string, deviceClass: string, value: string) =>
      sensorReading(toSensorModel(entityId, e(value, { device_class: deviceClass }))!);
    expect(at('sensor.t', 'temperature', '21.5')).toEqual({ word: 'comfort', warn: false });
    expect(at('sensor.h', 'humidity', '71')).toEqual({ word: 'tooHumid', warn: true });
    expect(at('sensor.h', 'humidity', '62')).toEqual({ word: 'aBitHigh', warn: false });
    expect(at('sensor.c', 'carbon_dioxide', '910')).toEqual({ word: 'airOut', warn: true });
    expect(at('sensor.p', 'pm25', '9')).toEqual({ word: 'excellent', warn: false });
  });

  it('puts first what is away, out of range, or running out of battery', () => {
    expect(sensorNeedsAttention(toSensorModel('sensor.t', e('unavailable', { device_class: 'temperature' }))!)).toBe(true);
    expect(sensorNeedsAttention(toSensorModel('sensor.t', e('21', { device_class: 'temperature' }), { battery: 9 })!)).toBe(true);
    expect(sensorNeedsAttention(toSensorModel('sensor.t', e('21', { device_class: 'temperature' }), { battery: 80 })!)).toBe(false);
    expect(toSensorModel('binary_sensor.s', e('on', { device_class: 'smoke' }))!.alarm).toBe(true);
  });
});

describe('the history of a sensor', () => {
  it('reads both the short and the long keys of Home Assistant', () => {
    const points = parseHistoryPoints(
      {
        'sensor.t': [
          { s: '21.0', lu: 1_700_000_000 },
          { state: '21.4', last_updated: '2023-11-14T22:30:00Z' },
          { s: 'unavailable', lu: 1_700_000_900 },
        ],
      },
      'sensor.t',
    );
    expect(points.map((point) => point.v)).toEqual([21, 21.4]);
    expect(parseHistoryPoints(null, 'sensor.t')).toEqual([]);
  });

  it('gives the lowest, highest and mean, the trend of the last hour and a line', () => {
    const now = 10 * 3_600_000;
    const points = [
      { t: now - 2 * 3_600_000, v: 20 },
      { t: now - 3_600_000, v: 21 },
      { t: now, v: 21.5 },
    ];
    expect(seriesStats(points)).toEqual({ min: 20, max: 21.5, avg: 62.5 / 3 });
    expect(seriesTrend(points, 'temp', now)).toBe(0.5);
    expect(seriesTrend(points, 'hum', now)).toBe(0);
    const line = sparkline(points, 32)!;
    expect(line.line.split(' ')).toHaveLength(3);
    expect(line.area.startsWith('0,32 ')).toBe(true);
    expect(sparkline([points[0]])).toBeNull();
  });
});
