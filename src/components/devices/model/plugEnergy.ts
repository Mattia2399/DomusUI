import type { MockEntityState } from '../../../types/ha';

/*
 * What a plug used today and this month, from Home Assistant's long-term
 * statistics, and what today cost with the tariff of the Energy page. A meter
 * of energy (kWh) is read as it is; a plug with only a power meter (W) is read
 * through its mean power, which over an hour is the Wh of that hour.
 */

export type EnergySource = { statisticId: string; kind: 'energy' | 'power' };

export type PlugTariff = {
  scheme: string;
  /** The price now: used for every hour when the prices of the bands are not known. */
  price: number;
  prices: Record<string, number> | null;
  vatPercent: number | null;
};

export type PlugEnergy = {
  /** kWh of each hour of today; null for the hours to come and those without data. */
  hours: Array<number | null>;
  hourNow: number;
  today: number;
  month: number | null;
  /** Euro spent today, VAT included when the tariff has it; null without a tariff. */
  cost: number | null;
};

export type StatisticRow = { start: number; change: number | null; mean: number | null };

const ENERGY_UNITS = new Set(['Wh', 'kWh', 'MWh']);

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/*
 * The meter to read for a plug: an energy sensor of the same device in the
 * registry, or one named after the plug ("switch.tv" → "sensor.tv_energy");
 * otherwise its power sensor.
 */
export function findEnergySource(
  entityId: string,
  states: Record<string, MockEntityState | undefined>,
  powerSensorId: string | null,
  deviceIdOf: (entityId: string) => string | null | undefined = () => null,
): EnergySource | null {
  const objectId = entityId.split('.')[1] ?? '';
  const deviceId = deviceIdOf(entityId);
  const isEnergy = (id: string) => {
    const attributes = states[id]?.rawAttributes ?? {};
    const unit = `${attributes.unit_of_measurement ?? states[id]?.unit ?? ''}`.trim();
    return id.startsWith('sensor.') && (`${attributes.device_class ?? ''}` === 'energy' || ENERGY_UNITS.has(unit));
  };
  const candidates = Object.keys(states).filter(isEnergy);
  const named = [`sensor.${objectId}_energy`, `sensor.${objectId}_energy_total`, `sensor.${objectId}_total_energy`];
  const energy =
    (deviceId ? candidates.find((id) => deviceIdOf(id) === deviceId) : undefined) ?? candidates.find((id) => named.includes(id));
  if (energy) return { statisticId: energy, kind: 'energy' };
  return powerSensorId ? { statisticId: powerSensorId, kind: 'power' } : null;
}

/** The rows of one statistic in an answer of recorder/statistics_during_period. */
export function statisticRows(payload: unknown, statisticId: string): StatisticRow[] {
  const rows = payload && typeof payload === 'object' ? (payload as Record<string, unknown>)[statisticId] : null;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const entry = row as Record<string, unknown>;
    const start = typeof entry.start === 'number' ? entry.start : typeof entry.start === 'string' ? Date.parse(entry.start) : NaN;
    return Number.isFinite(start) ? [{ start, change: readNumber(entry.change), mean: readNumber(entry.mean) }] : [];
  });
}

/** The question to Home Assistant for one meter over a period. */
export function statisticsRequest(source: EnergySource, period: '5minute' | 'hour' | 'day', start: Date, end: Date) {
  return {
    type: 'recorder/statistics_during_period',
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    statistic_ids: [source.statisticId],
    period,
    types: [source.kind === 'energy' ? 'change' : 'mean'],
    units: source.kind === 'energy' ? { energy: 'kWh' } : { power: 'W' },
  };
}

function kwhOf(row: StatisticRow, kind: EnergySource['kind'], hours: number) {
  const value = kind === 'energy' ? row.change : row.mean === null ? null : (row.mean / 1000) * hours;
  return value === null ? null : Math.max(0, value);
}

/** The tariff in an answer of domusos/energy/get_state: null when none is set, undefined when it cannot be known. */
export function readPlugTariff(payload: unknown): PlugTariff | null | undefined {
  if (!payload || typeof payload !== 'object' || !('tariff' in payload)) return undefined;
  const tariff = (payload as { tariff: unknown }).tariff;
  if (!tariff || typeof tariff !== 'object') return null;
  const entry = tariff as Record<string, unknown>;
  const price = readNumber(entry.price);
  if (price === null) return null;
  const prices =
    entry.prices && typeof entry.prices === 'object'
      ? Object.fromEntries(Object.entries(entry.prices as Record<string, unknown>).flatMap(([band, value]) => (readNumber(value) === null ? [] : [[band, value as number]])))
      : null;
  return { scheme: `${entry.scheme ?? 'single'}`, price, prices, vatPercent: readNumber(entry.vat_percent) };
}

function easterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const FIXED_HOLIDAYS = new Set(['1-1', '1-6', '4-25', '5-1', '6-2', '8-15', '11-1', '12-8', '12-25', '12-26']);

/** The ARERA band of a local time, as the integration computes it (energy/tariff.py). */
export function areraBand(moment: Date): 'F1' | 'F2' | 'F3' {
  const easterMonday = easterSunday(moment.getFullYear());
  easterMonday.setDate(easterMonday.getDate() + 1);
  const holiday =
    FIXED_HOLIDAYS.has(`${moment.getMonth() + 1}-${moment.getDate()}`) ||
    (moment.getMonth() === easterMonday.getMonth() && moment.getDate() === easterMonday.getDate());
  const hour = moment.getHours();
  if (moment.getDay() === 0 || holiday || hour < 7 || hour >= 23) return 'F3';
  if (moment.getDay() === 6) return 'F2';
  return hour >= 8 && hour < 19 ? 'F1' : 'F2';
}

export function priceAt(tariff: PlugTariff, moment: Date) {
  const prices = tariff.prices;
  if (!prices) return tariff.price;
  if (tariff.scheme === 'single') return prices.single ?? tariff.price;
  const band = areraBand(moment);
  if (tariff.scheme === 'two_band') return (band === 'F1' ? prices.f1 : prices.f23) ?? tariff.price;
  return prices[band.toLowerCase()] ?? tariff.price;
}

/*
 * Today hour by hour: the compiled hours, then the five-minute rows for the
 * hours not compiled yet (the one in progress, and the last one for a few
 * minutes after it ends). The month adds the days before today.
 */
export function buildPlugEnergy({
  kind,
  hourRows,
  fiveMinuteRows,
  dayRows,
  tariff,
  now,
}: {
  kind: EnergySource['kind'];
  hourRows: StatisticRow[];
  fiveMinuteRows: StatisticRow[];
  /** Days of this month before today; null when they could not be read. */
  dayRows: StatisticRow[] | null;
  tariff: PlugTariff | null;
  now: Date;
}): PlugEnergy {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const hours: Array<number | null> = Array.from({ length: 24 }, () => null);
  const add = (rows: StatisticRow[], span: number, skip?: Set<number>) => {
    const seen = new Set<number>();
    rows.forEach((row) => {
      if (row.start < midnight || row.start > now.getTime()) return;
      const hour = new Date(row.start).getHours();
      const kwh = kwhOf(row, kind, span);
      if (skip?.has(hour) || kwh === null) return;
      hours[hour] = (hours[hour] ?? 0) + kwh;
      seen.add(hour);
    });
    return seen;
  };
  const compiled = add(hourRows, 1);
  add(fiveMinuteRows, 1 / 12, compiled);

  const today = hours.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const before =
    dayRows === null
      ? null
      : dayRows.filter((row) => row.start < midnight).reduce((sum, row) => sum + (kwhOf(row, kind, 24) ?? 0), 0);
  const cost =
    tariff === null
      ? null
      : hours.reduce<number>((sum, value, hour) => {
          if (value === null) return sum;
          const moment = new Date(midnight);
          moment.setHours(hour);
          return sum + value * priceAt(tariff, moment);
        }, 0) *
        (1 + (tariff.vatPercent ?? 0) / 100);
  return { hours, hourNow: now.getHours(), today, month: before === null ? null : before + today, cost };
}
