import type {
  EnergyHistoryBucket,
  EnergyHistoryResult,
  EnergyHistoryResultPoint,
  EnergyHistorySeries,
  EnergyHistorySeriesName,
  EnergyHistoryUnavailable,
} from '../../../services/energyCoreClient';

/* Test fixtures shaped like the A2.0 `get_history` document; never imported by the app. */

const pad = (value: number) => String(value).padStart(2, '0');

/** Hour starts of one day, written in the backend time zone with its offset. */
export const hourStarts = (count = 24, day = '2026-10-05', offset = '+02:00') =>
  Array.from({ length: count }, (_, hour) => `${day}T${pad(hour)}:00:00${offset}`);

/** Day starts from `first` (YYYY-MM-DD) within one month. */
export const dayStarts = (count: number, first = '2026-09-29', offset = '+02:00') => {
  const [year, month, day] = first.split('-').map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, day + index));
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T00:00:00${offset}`;
  });
};

/** Month starts from November 2025: winter months at +01:00, summer months at +02:00. */
export const monthStarts = (count = 12) =>
  Array.from({ length: count }, (_, index) => {
    const month = ((10 + index) % 12) + 1;
    const year = 2025 + Math.floor((10 + index) / 12);
    return `${year}-${pad(month)}-01T00:00:00${month >= 4 && month <= 10 ? '+02:00' : '+01:00'}`;
  });

export type PointSpec = number | null | Omit<EnergyHistoryResultPoint, 'start'>;

export function series(starts: string[], values: PointSpec[], extra: Partial<EnergyHistorySeries> = {}): EnergyHistorySeries {
  const points = values.map((spec, index): EnergyHistoryResultPoint => {
    if (typeof spec === 'number') return { start: starts[index], value: spec };
    if (spec === null) return { start: starts[index], value: null };
    return { start: starts[index], ...spec };
  });
  const inProgress = extra.in_progress_last ?? false;
  const complete = (inProgress ? points.slice(0, -1) : points).every((point) => point.value !== null);
  return {
    source: 'total',
    statistic_ids: ['sensor.energy'],
    points,
    complete,
    status: complete ? 'complete' : 'partial_data',
    in_progress_last: inProgress,
    ...extra,
  };
}

export function historyResult({
  bucket = 'hour',
  starts = hourStarts(),
  timezone = 'Europe/Rome',
  series: entries = {},
  unavailable = {},
  configured = true,
}: {
  bucket?: EnergyHistoryBucket;
  starts?: string[];
  timezone?: string;
  series?: Partial<Record<EnergyHistorySeriesName, EnergyHistorySeries>>;
  unavailable?: Partial<Record<EnergyHistorySeriesName, EnergyHistoryUnavailable>>;
  configured?: boolean;
} = {}): EnergyHistoryResult {
  return {
    configured,
    range: { start: starts[0] ?? '2026-10-05T00:00:00+02:00', end: '2026-10-06T00:00:00+02:00', bucket, timezone },
    unit: 'kWh',
    recorder: 'available',
    verification: 'complete',
    series: entries,
    unavailable,
    devices: {},
    cost: null,
    previous: null,
    generated_at: '2026-10-05T23:30:00+00:00',
  };
}
