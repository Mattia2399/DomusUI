import type { SeriesPoint } from './sensor';
import { airBand, SENSOR_ALERT_THRESHOLDS as T, toCelsius, toKmh, toKw, type SensorFamily } from './sensorFamily';

/*
 * What the panel of a sensor shows for each family: its chart, the periods it
 * can read, the scale it sits on, and the threshold the household may move.
 * Plain data and functions; the words live with the panel.
 */

export type SensorChartKind = 'line' | 'bars' | 'strip';

const CHART_KINDS: Record<SensorFamily, SensorChartKind> = {
  temperature: 'line',
  humidity: 'line',
  air: 'line',
  light: 'line',
  weather: 'line',
  signal: 'line',
  measure: 'line',
  battery: 'line',
  energy: 'bars',
  water: 'bars',
  price: 'bars',
  motion: 'bars',
  opening: 'strip',
  safety: 'strip',
  device: 'strip',
  time: 'strip',
  state: 'strip',
};

export const chartKindOf = (family: SensorFamily) => CHART_KINDS[family];

export type SensorPanelPeriod = '24h' | '7d' | '30d' | '6mo' | '1y';

/**
 * The periods of a sensor. 7 and 30 days come from the long-term statistics,
 * which Home Assistant keeps only for what declares a state class; yes/no
 * families and words have none, so they read the last 24 hours.
 */
export function periodsOf(family: SensorFamily, attributes: Record<string, unknown>, statisticsMissing: boolean): SensorPanelPeriod[] {
  if (family === 'opening' || family === 'motion' || family === 'safety' || family === 'device') return ['24h', '7d'];
  if (statisticsMissing) return ['24h'];
  if (family === 'battery') return typeof attributes.state_class === 'string' && attributes.state_class ? ['6mo', '1y'] : ['24h'];
  if (chartKindOf(family) === 'strip') return ['24h'];
  return typeof attributes.state_class === 'string' && attributes.state_class ? ['24h', '7d', '30d'] : ['24h'];
}

/** The question to the recorder for a period: by the hour over 7 days, by the day over 30. */
export function statisticsQuery(entityId: string, period: Exclude<SensorPanelPeriod, '24h'>, now: number) {
  const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '6mo' ? 183 : 365;
  return {
    type: 'recorder/statistics_during_period',
    start_time: new Date(now - days * 86_400_000).toISOString(),
    end_time: new Date(now).toISOString(),
    statistic_ids: [entityId],
    period: period === '7d' ? 'hour' : 'day',
    types: ['mean', 'min', 'max', 'change'],
  };
}

export type StatisticPoint = { t: number; mean: number | null; min: number | null; max: number | null; change: number | null };

const toNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

export function parseStatistics(payload: unknown, entityId: string): StatisticPoint[] {
  const rows = payload && typeof payload === 'object' ? (payload as Record<string, unknown>)[entityId] : null;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const entry = row as Record<string, unknown>;
    const t = typeof entry.start === 'number' ? entry.start : typeof entry.start === 'string' ? Date.parse(entry.start) : Number.NaN;
    if (!Number.isFinite(t)) return [];
    return [{ t, mean: toNumber(entry.mean), min: toNumber(entry.min), max: toNumber(entry.max), change: toNumber(entry.change) }];
  });
}

/** Rows of the recorder as the points of a line: the mean, or the state of a total. */
export function statisticsToPoints(rows: StatisticPoint[]): SeriesPoint[] {
  return rows.flatMap((row) => (row.mean !== null ? [{ t: row.t, v: row.mean }] : []));
}

/** Bars of a period grouped by day, so that 7 days of hours read as 7 bars. */
export function dailyBars(rows: StatisticPoint[], read: (row: StatisticPoint) => number | null, reduce: 'sum' | 'mean') {
  const days = new Map<string, number[]>();
  rows.forEach((row) => {
    const value = read(row);
    if (value === null) return;
    const date = new Date(row.t);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    days.set(key, [...(days.get(key) ?? []), Math.max(0, value)]);
  });
  return [...days.values()].map((values) => {
    const sum = values.reduce((total, value) => total + value, 0);
    return reduce === 'sum' ? sum : sum / values.length;
  });
}

/** The ideal band drawn behind a line, where the family has one. */
export function idealBandOf(family: SensorFamily, deviceClass: string, unit: string): [number, number] | null {
  if (family === 'temperature' && deviceClass !== 'temperature_delta') {
    return unit.includes('F') ? [68, 73.4] : [20, 23];
  }
  if (family === 'humidity' && deviceClass === 'humidity') return T.humidity.ideal;
  if (family === 'air') {
    const edges = T.air[deviceClass];
    return edges ? [0, edges[0]] : null;
  }
  return null;
}

export type ScaleZone = { label: ScaleWord; width: number; color: string };
export type ScaleWord =
  | 'ssTagCold' | 'ssTempComfort' | 'ssTagHot'
  | 'ssHumDry' | 'ssHumIdeal' | 'ssHumHumid'
  | 'ssAirGood' | 'ssAirFair' | 'ssAirPoor'
  | 'ssNormal' | 'snHigh' | 'snLimit'
  | 'ssBattChange' | 'ssBattHalf' | 'ssBattFull'
  | 'ssLight0' | 'ssLight1' | 'ssLight3'
  | 'ssWindCalm' | 'ssWindModerate' | 'ssWindStrongWord';

const GREEN = '#30d158';
const ORANGE = '#ff9f0a';
const RED = '#ff453a';
const BLUE = '#64d2ff';
const GREY = '#8e8e93';
const YELLOW = '#ffd60a';

const fraction = (value: number, lo: number, hi: number) => Math.max(0, Math.min(1, (value - lo) / (hi - lo)));

const zonesFrom = (lo: number, hi: number, edges: [number, number], parts: Array<[ScaleWord, string]>): ScaleZone[] => {
  const widths = [edges[0] - lo, edges[1] - edges[0], hi - edges[1]].map((part) => (part / (hi - lo)) * 100);
  return parts.map(([label, color], index) => ({ label, color, width: widths[index] }));
};

/** Where the value sits, for the families with a scale that means something. */
export function scaleOf(family: SensorFamily, deviceClass: string, unit: string, value: number | null, meterKw: number): { zones: ScaleZone[]; mark: number } | null {
  if (value === null) return null;
  if (family === 'temperature' && deviceClass !== 'temperature_delta') {
    const [lo, hi] = T.temperature.scale;
    return {
      zones: zonesFrom(lo, hi, [18, T.temperature.hot], [['ssTagCold', BLUE], ['ssTempComfort', GREEN], ['ssTagHot', ORANGE]]),
      mark: fraction(toCelsius(value, unit), lo, hi),
    };
  }
  if (family === 'humidity' && deviceClass === 'humidity') {
    return {
      zones: zonesFrom(0, 100, T.humidity.ideal, [['ssHumDry', ORANGE], ['ssHumIdeal', GREEN], ['ssHumHumid', BLUE]]),
      mark: fraction(value, 0, 100),
    };
  }
  if (family === 'air') {
    const edges = T.air[deviceClass];
    if (!edges || airBand(deviceClass, value) === null) return null;
    const hi = edges[2] * 1.1;
    return {
      zones: zonesFrom(0, hi, [edges[0], edges[1]], [['ssAirGood', GREEN], ['ssAirFair', ORANGE], ['ssAirPoor', RED]]),
      mark: fraction(value, 0, hi),
    };
  }
  if (family === 'energy' && deviceClass === 'power') {
    return {
      zones: zonesFrom(0, meterKw, [meterKw * 0.6, meterKw * T.energy.nearLimit], [['ssNormal', GREEN], ['snHigh', ORANGE], ['snLimit', RED]]),
      mark: fraction(toKw(value, unit), 0, meterKw),
    };
  }
  if (family === 'battery') {
    return {
      zones: zonesFrom(0, 100, [T.battery.low, T.battery.bands[2]], [['ssBattChange', RED], ['ssBattHalf', ORANGE], ['ssBattFull', GREEN]]),
      mark: fraction(value, 0, 100),
    };
  }
  if (family === 'light' && deviceClass !== 'irradiance') {
    // The eye reads light in steps, not in lux.
    const log = (lux: number) => Math.log10(Math.max(1, lux));
    const hi = log(T.light.steps[4]);
    return {
      zones: zonesFrom(0, hi, [log(T.light.dark), log(T.light.steps[2])], [['ssLight0', GREY], ['ssLight1', ORANGE], ['ssLight3', YELLOW]]),
      mark: fraction(log(value), 0, hi),
    };
  }
  if (family === 'weather' && deviceClass === 'wind_speed') {
    const hi = T.weather.windStorm * 1.2;
    return {
      zones: zonesFrom(0, hi, [20, T.weather.windStrong], [['ssWindCalm', GREEN], ['ssWindModerate', ORANGE], ['ssWindStrongWord', RED]]),
      mark: fraction(toKmh(value, unit), 0, hi),
    };
  }
  return null;
}

export type ThresholdRule = {
  direction: 'above' | 'below' | 'longer' | 'before';
  start: number;
  step: number;
  decimals: number;
  unit?: string;
  min?: number;
};

/** The thresholds of the families with a number, with the steps of the board. A yes/no has none. */
export function thresholdRuleOf(family: SensorFamily, deviceClass: string, unit: string): ThresholdRule | null {
  switch (family) {
    case 'temperature':
      return deviceClass === 'temperature_delta' ? null : { direction: 'above', start: unit.includes('F') ? 79 : 26, step: 0.5, decimals: 1, unit: '°' };
    case 'humidity':
      return { direction: 'above', start: 70, step: 5, decimals: 0, unit: '%' };
    case 'air':
      return { direction: 'above', start: T.air[deviceClass]?.[1] ?? 1000, step: deviceClass === 'carbon_dioxide' ? 100 : Math.max(1, Math.round((T.air[deviceClass]?.[1] ?? 100) / 10)), decimals: 0, unit: unit ? ` ${unit}` : '' };
    case 'energy':
      return deviceClass === 'power' ? { direction: 'above', start: 3, step: 0.5, decimals: 1, unit: ' kW' } : null;
    case 'water':
      return { direction: 'longer', start: 1, step: 0.5, decimals: 1, unit: ' h' };
    case 'battery':
      return { direction: 'below', start: 20, step: 5, decimals: 0, unit: '%' };
    case 'weather':
      return deviceClass === 'wind_speed' ? { direction: 'above', start: 50, step: 5, decimals: 0, unit: unit ? ` ${unit}` : ' km/h' } : null;
    case 'signal':
      return deviceClass === 'data_rate' ? { direction: 'below', start: 50, step: 10, decimals: 0, unit: unit ? ` ${unit}` : ' Mbit/s' } : null;
    case 'measure':
      return { direction: 'above', start: deviceClass === 'sound_pressure' ? 55 : 0, step: deviceClass === 'sound_pressure' ? 5 : 1, decimals: 0, unit: unit ? ` ${unit}` : '' };
    case 'price':
      return { direction: 'above', start: 0.3, step: 0.02, decimals: 2, unit: unit ? ` ${unit}` : ' €/kWh' };
    case 'opening':
      return { direction: 'longer', start: 15, step: 5, decimals: 0, unit: ' min' };
    case 'light':
      return { direction: 'below', start: 10, step: 5, decimals: 0, unit: unit ? ` ${unit}` : ' lx' };
    default:
      return null;
  }
}

/** One step of a threshold: never below one step for what cannot be negative. */
export function stepThreshold(rule: ThresholdRule, current: number, direction: 1 | -1) {
  const next = Number((current + direction * rule.step).toFixed(Math.max(rule.decimals, 2)));
  return Math.max(rule.direction === 'above' && rule.start <= 0 ? next : rule.step, next);
}

/** Whether the value is past the threshold of the household, for those that read a number. */
export function thresholdCrossed(rule: ThresholdRule, threshold: number, value: number | null, unit: string) {
  if (value === null) return false;
  const reading = rule.unit === ' kW' ? toKw(value, unit) : value;
  if (rule.direction === 'above') return reading > threshold;
  if (rule.direction === 'below') return reading < threshold;
  return false;
}

const THRESHOLDS_KEY = 'ha.dashboard.sensorAlertThresholds.v1';

export function readStoredThresholds(): Record<string, number> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(THRESHOLDS_KEY) ?? '{}') as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1])));
  } catch {
    return {};
  }
}

export function storeThreshold(entityId: string, value: number) {
  try {
    window.localStorage.setItem(THRESHOLDS_KEY, JSON.stringify({ ...readStoredThresholds(), [entityId]: value }));
  } catch {
    // A browser that refuses to store keeps the threshold while the panel is open.
  }
}
