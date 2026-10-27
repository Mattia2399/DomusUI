import { describe, expect, it } from 'vitest';
import {
  areraBand,
  buildPlugEnergy,
  findEnergySource,
  priceAt,
  readPlugTariff,
  statisticRows,
  statisticsRequest,
  type StatisticRow,
} from './plugEnergy';

const at = (hour: number, minute = 0) => new Date(2026, 9, 27, hour, minute).getTime();
const row = (start: number, change: number | null, mean: number | null = null): StatisticRow => ({ start, change, mean });
const sensor = (attributes: Record<string, unknown>) => ({ state: '1', rawAttributes: attributes });

describe('findEnergySource', () => {
  it('prefers an energy meter of the same device, then one named after the plug, then the power meter', () => {
    const states = {
      'switch.tv': sensor({ device_class: 'outlet' }),
      'sensor.tv_energy': sensor({ device_class: 'energy', unit_of_measurement: 'kWh' }),
      'sensor.meter_total': sensor({ unit_of_measurement: 'Wh' }),
      'sensor.tv_power': sensor({ device_class: 'power', unit_of_measurement: 'W' }),
    } as never;
    const sameDevice = (id: string) => (id === 'switch.tv' || id === 'sensor.meter_total' ? 'device-1' : null);
    expect(findEnergySource('switch.tv', states, 'sensor.tv_power', sameDevice)).toEqual({ statisticId: 'sensor.meter_total', kind: 'energy' });
    expect(findEnergySource('switch.tv', states, 'sensor.tv_power')).toEqual({ statisticId: 'sensor.tv_energy', kind: 'energy' });
    expect(findEnergySource('switch.lamp', states, 'sensor.tv_power')).toEqual({ statisticId: 'sensor.tv_power', kind: 'power' });
    expect(findEnergySource('switch.lamp', states, null)).toBeNull();
  });
});

describe('statistics', () => {
  it('asks for the change of an energy meter and the mean of a power meter', () => {
    const start = new Date(at(0));
    const end = new Date(at(10));
    expect(statisticsRequest({ statisticId: 'sensor.e', kind: 'energy' }, 'hour', start, end)).toMatchObject({
      type: 'recorder/statistics_during_period',
      statistic_ids: ['sensor.e'],
      period: 'hour',
      types: ['change'],
      units: { energy: 'kWh' },
    });
    expect(statisticsRequest({ statisticId: 'sensor.p', kind: 'power' }, '5minute', start, end)).toMatchObject({ types: ['mean'], units: { power: 'W' } });
  });

  it('reads rows with a start in milliseconds or as a date', () => {
    const payload = { 'sensor.e': [{ start: at(1), change: 0.2 }, { start: new Date(at(2)).toISOString(), change: 0.3 }, { start: 'no' }] };
    expect(statisticRows(payload, 'sensor.e')).toEqual([row(at(1), 0.2), row(at(2), 0.3)]);
    expect(statisticRows(null, 'sensor.e')).toEqual([]);
  });
});

describe('buildPlugEnergy', () => {
  const now = new Date(at(10, 30));

  it('fills today from the compiled hours and the five-minute rows of the hours still open', () => {
    const energy = buildPlugEnergy({
      kind: 'energy',
      hourRows: [row(at(-1), 9), row(at(0), 0.1), row(at(8), 0.5)],
      fiveMinuteRows: [row(at(8, 55), 7), row(at(9, 0), 0.05), row(at(9, 5), 0.05), row(at(10, 0), 0.02)],
      dayRows: [row(new Date(2026, 9, 1).getTime(), 1.5), row(new Date(2026, 9, 2).getTime(), 2)],
      tariff: null,
      now,
    });
    expect(energy.hours[0]).toBeCloseTo(0.1);
    expect(energy.hours[8]).toBeCloseTo(0.5);
    expect(energy.hours[9]).toBeCloseTo(0.1);
    expect(energy.hours[10]).toBeCloseTo(0.02);
    expect(energy.hours[11]).toBeNull();
    expect(energy.hourNow).toBe(10);
    expect(energy.today).toBeCloseTo(0.72);
    expect(energy.month).toBeCloseTo(4.22);
    expect(energy.cost).toBeNull();
  });

  it('turns the mean power of a plug without an energy meter into kWh', () => {
    const energy = buildPlugEnergy({
      kind: 'power',
      hourRows: [row(at(8), null, 500)],
      fiveMinuteRows: [row(at(10, 0), null, 1200)],
      dayRows: [row(new Date(2026, 9, 26).getTime(), null, 100)],
      tariff: null,
      now,
    });
    expect(energy.hours[8]).toBeCloseTo(0.5);
    expect(energy.hours[10]).toBeCloseTo(0.1);
    expect(energy.month).toBeCloseTo(2.4 + 0.6);
  });

  it('prices each hour in its band and adds VAT; without the days the month is unknown', () => {
    const tariff = { scheme: 'three_band', price: 0.31, prices: { f1: 0.3, f2: 0.2, f3: 0.1 }, vatPercent: 10 };
    const energy = buildPlugEnergy({
      kind: 'energy',
      hourRows: [row(at(3), 1), row(at(7), 1), row(at(9), 1)],
      fiveMinuteRows: [],
      dayRows: null,
      tariff,
      now,
    });
    expect(energy.cost).toBeCloseTo((0.1 + 0.2 + 0.3) * 1.1);
    expect(energy.month).toBeNull();
  });
});

describe('tariff', () => {
  it('reads the tariff of the Energy state, telling a missing tariff from an old integration', () => {
    expect(readPlugTariff({ tariff: { scheme: 'two_band', price: 0.3, prices: { f1: 0.3, f23: 0.2 }, vat_percent: 10 } })).toEqual({
      scheme: 'two_band',
      price: 0.3,
      prices: { f1: 0.3, f23: 0.2 },
      vatPercent: 10,
    });
    expect(readPlugTariff({ tariff: { scheme: 'single', price: 0.25 } })).toMatchObject({ prices: null, vatPercent: null });
    expect(readPlugTariff({ tariff: null })).toBeNull();
    expect(readPlugTariff({ configured: false })).toBeUndefined();
    expect(readPlugTariff(null)).toBeUndefined();
  });

  it('follows the ARERA bands, Sundays and holidays included', () => {
    expect(areraBand(new Date(2026, 9, 26, 10))).toBe('F1');
    expect(areraBand(new Date(2026, 9, 26, 7, 30))).toBe('F2');
    expect(areraBand(new Date(2026, 9, 26, 19))).toBe('F2');
    expect(areraBand(new Date(2026, 9, 26, 23))).toBe('F3');
    expect(areraBand(new Date(2026, 9, 31, 10))).toBe('F2');
    expect(areraBand(new Date(2026, 10, 1, 10))).toBe('F3');
    expect(areraBand(new Date(2026, 11, 8, 10))).toBe('F3');
    expect(areraBand(new Date(2026, 3, 6, 10))).toBe('F3');
  });

  it('uses the price now when the prices of the bands are not known', () => {
    const monday = new Date(2026, 9, 26, 10);
    expect(priceAt({ scheme: 'three_band', price: 0.31, prices: null, vatPercent: null }, monday)).toBe(0.31);
    expect(priceAt({ scheme: 'two_band', price: 0.3, prices: { f1: 0.3, f23: 0.2 }, vatPercent: null }, new Date(2026, 9, 26, 20))).toBe(0.2);
    expect(priceAt({ scheme: 'single', price: 0.25, prices: { single: 0.25 }, vatPercent: null }, monday)).toBe(0.25);
  });
});
