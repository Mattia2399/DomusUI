import type { MockEntityState } from '../../../types/ha';

/*
 * The environment of a room: temperature, humidity, CO₂, fine dust, light and
 * noise, and smoke. Each kind has its unit, an ideal band, a scale and the
 * words that say where the value sits. Plain functions, with the reading of
 * Home Assistant history into points.
 */

export type SensorKind = 'temp' | 'hum' | 'co2' | 'pm' | 'lux' | 'noise' | 'smoke';

export type SensorWord =
  | 'cool'
  | 'comfort'
  | 'warm'
  | 'dry'
  | 'ideal'
  | 'aBitHigh'
  | 'tooHumid'
  | 'goodAir'
  | 'airOut'
  | 'staleAir'
  | 'excellent'
  | 'fair'
  | 'poor'
  | 'dim'
  | 'soft'
  | 'bright'
  | 'quiet'
  | 'normal'
  | 'noisy';

export type SensorKindSpec = {
  unit: string;
  decimals: number;
  ideal: [number, number];
  /** Ends of the scale of "where it is now". */
  lo: number;
  hi: number;
  /** Where the zones of the scale change, when not at the ideal band. */
  zoneCut?: [number, number];
  /** The smallest change in an hour that reads as a trend. */
  trendMin: number;
  word: (value: number) => SensorWord;
  warn: (value: number) => boolean;
  hasTip: boolean;
};

export const SENSOR_KINDS: Record<Exclude<SensorKind, 'smoke'>, SensorKindSpec> = {
  temp: {
    unit: '°',
    decimals: 1,
    ideal: [20, 23],
    lo: 14,
    hi: 30,
    trendMin: 0.2,
    word: (v) => (v < 20 ? 'cool' : v > 23 ? 'warm' : 'comfort'),
    warn: () => false,
    hasTip: false,
  },
  hum: {
    unit: '%',
    decimals: 0,
    ideal: [40, 60],
    lo: 20,
    hi: 90,
    trendMin: 2,
    word: (v) => (v < 40 ? 'dry' : v > 65 ? 'tooHumid' : v > 60 ? 'aBitHigh' : 'ideal'),
    warn: (v) => v > 65,
    hasTip: true,
  },
  co2: {
    unit: 'ppm',
    decimals: 0,
    ideal: [400, 800],
    lo: 350,
    hi: 1600,
    trendMin: 40,
    word: (v) => (v <= 800 ? 'goodAir' : v < 1000 ? 'airOut' : 'staleAir'),
    warn: (v) => v >= 900,
    hasTip: true,
  },
  pm: {
    unit: 'µg/m³',
    decimals: 0,
    ideal: [0, 15],
    lo: 0,
    hi: 60,
    zoneCut: [15, 35],
    trendMin: 2,
    word: (v) => (v <= 15 ? 'excellent' : v <= 35 ? 'fair' : 'poor'),
    warn: (v) => v > 35,
    hasTip: true,
  },
  lux: {
    unit: 'lx',
    decimals: 0,
    ideal: [150, 500],
    lo: 0,
    hi: 1000,
    trendMin: 40,
    word: (v) => (v < 150 ? 'dim' : v <= 500 ? 'soft' : 'bright'),
    warn: () => false,
    hasTip: false,
  },
  noise: {
    unit: 'dB',
    decimals: 0,
    ideal: [25, 45],
    lo: 20,
    hi: 80,
    trendMin: 3,
    word: (v) => (v <= 45 ? 'quiet' : v <= 60 ? 'normal' : 'noisy'),
    warn: () => false,
    hasTip: false,
  },
};

const DEVICE_CLASS_KIND: Record<string, Exclude<SensorKind, 'smoke'>> = {
  temperature: 'temp',
  humidity: 'hum',
  carbon_dioxide: 'co2',
  pm25: 'pm',
  illuminance: 'lux',
  sound_pressure: 'noise',
};

/** Below this a battery needs changing. */
export const LOW_BATTERY_PCT = 15;

export type SensorModel = {
  entityId: string;
  name: string;
  kind: SensorKind;
  available: boolean;
  /** The reading; for smoke, null. */
  value: number | null;
  /** Smoke detected, for a smoke detector. */
  alarm: boolean;
  battery: number | null;
  /** When the value last changed, in ms. */
  changedAt: number | null;
};

function readNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function readTime(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value;
  if (typeof value === 'string' && value) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function sensorKindOf(entityId: string, entity: MockEntityState | undefined): SensorKind | null {
  const domain = entityId.split('.')[0];
  const deviceClass = `${entity?.rawAttributes?.device_class ?? ''}`.trim().toLowerCase();
  if (domain === 'binary_sensor') return deviceClass === 'smoke' ? 'smoke' : null;
  if (domain !== 'sensor') return null;
  return DEVICE_CLASS_KIND[deviceClass] ?? null;
}

export function isBatterySensor(entityId: string, entity: MockEntityState | undefined) {
  return entityId.startsWith('sensor.') && `${entity?.rawAttributes?.device_class ?? ''}` === 'battery';
}

/*
 * The battery of a sensor: a battery sensor of the same device in the
 * registry, or one named after it ("sensor.living_temperature" →
 * "sensor.living_temperature_battery").
 */
export function findBatterySensor(
  entityId: string,
  states: Record<string, MockEntityState | undefined>,
  deviceIdOf: (entityId: string) => string | null | undefined = () => null,
) {
  const objectId = entityId.split('.')[1] ?? '';
  const deviceId = deviceIdOf(entityId);
  const batteries = Object.keys(states).filter((id) => isBatterySensor(id, states[id]));
  return (
    (deviceId ? batteries.find((id) => deviceIdOf(id) === deviceId) : undefined) ??
    batteries.find((id) => id === `sensor.${objectId}_battery`) ??
    null
  );
}

export function toSensorModel(
  entityId: string,
  entity: MockEntityState | undefined,
  options: { battery?: number | null } = {},
): SensorModel | null {
  const kind = sensorKindOf(entityId, entity);
  if (!kind) return null;
  const state = `${entity?.state ?? ''}`.trim().toLowerCase();
  const friendly = entity?.rawAttributes?.friendly_name;
  const value = kind === 'smoke' ? null : readNumber(entity?.state) ?? null;
  return {
    entityId,
    name: typeof friendly === 'string' && friendly.trim() ? friendly.trim() : entityId.split('.')[1] ?? entityId,
    kind,
    available: Boolean(entity) && state !== 'unavailable' && state !== 'unknown' && state !== '' && (kind === 'smoke' || value !== null),
    value,
    alarm: kind === 'smoke' && state === 'on',
    battery: options.battery ?? null,
    changedAt: readTime(entity?.rawAttributes?.last_changed) ?? null,
  };
}

export const isLowBattery = (model: SensorModel) => model.battery !== null && model.battery <= LOW_BATTERY_PCT;

/** Where the reading sits, and whether it calls for something to be done. */
export function sensorReading(model: SensorModel): { word: SensorWord | null; warn: boolean } {
  if (model.kind === 'smoke' || model.value === null) return { word: null, warn: model.alarm };
  const spec = SENSOR_KINDS[model.kind];
  return { word: spec.word(model.value), warn: spec.warn(model.value) };
}

/** To check first in the section: away, out of range, smoke, or a battery running out. */
export function sensorNeedsAttention(model: SensorModel) {
  return !model.available || sensorReading(model).warn || isLowBattery(model);
}

export type SeriesPoint = { t: number; v: number };

/*
 * Points of one entity from `history/history_during_period`, which answers
 * with the short keys of Home Assistant ({ s, lu }) or the long ones.
 */
export function parseHistoryPoints(payload: unknown, entityId: string): SeriesPoint[] {
  if (!payload || typeof payload !== 'object') return [];
  const list = (payload as Record<string, unknown>)[entityId];
  if (!Array.isArray(list)) return [];
  return list
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const v = readNumber(record.s ?? record.state);
      const t = readTime(record.lu ?? record.lc ?? record.last_updated ?? record.last_changed);
      return v === undefined || t === null ? null : { t, v };
    })
    .filter((point): point is SeriesPoint => point !== null)
    .sort((a, b) => a.t - b.t);
}

export function seriesStats(points: SeriesPoint[]) {
  if (points.length === 0) return null;
  const values = points.map((point) => point.v);
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    avg: values.reduce((sum, value) => sum + value, 0) / values.length,
  };
}

/** The change over the last hour, or 0 when it is too small to tell. */
export function seriesTrend(points: SeriesPoint[], kind: SensorKind, now = Date.now()) {
  if (kind === 'smoke' || points.length < 2) return 0;
  const last = points[points.length - 1];
  const hourAgo = [...points].reverse().find((point) => point.t <= now - 3_600_000) ?? points[0];
  const change = last.v - hourAgo.v;
  return Math.abs(change) < SENSOR_KINDS[kind].trendMin ? 0 : change;
}

/** A polyline in a box of 100 × height, with the area under it. */
export function sparkline(points: SeriesPoint[], height = 32, top = 2, bottom = 2) {
  if (points.length < 2) return null;
  const t0 = points[0].t;
  const span = points[points.length - 1].t - t0 || 1;
  const values = points.map((point) => point.v);
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  const coordinates = points.map(
    (point) => `${(((point.t - t0) / span) * 100).toFixed(1)},${(height - bottom - ((point.v - min) / range) * (height - top - bottom)).toFixed(1)}`,
  );
  return { line: coordinates.join(' '), area: `0,${height} ${coordinates.join(' ')} 100,${height}` };
}
