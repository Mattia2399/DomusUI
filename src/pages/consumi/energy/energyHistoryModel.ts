import type {
  EnergyHistoryBucket,
  EnergyHistoryPreset,
  EnergyHistoryResult,
  EnergyHistoryResultPoint,
  EnergyHistorySeriesName,
  EnergyHistoryUnavailable,
} from '../../../services/energyCoreClient';

/*
 * Presentation of the `get_history` document: order, labels, states and the
 * text of each bucket. Buckets, totals, the derived consumption and the time
 * zone come from the backend; nothing is summed, balanced or re-bucketed here.
 */

export const HISTORY_PERIODS: Array<{ value: EnergyHistoryPreset; label: string }> = [
  { value: '24h', label: '24 ore' },
  { value: '7d', label: '7 giorni' },
  { value: '30d', label: '30 giorni' },
  { value: '12m', label: '12 mesi' },
];

export type HistorySeriesMeta = { id: EnergyHistorySeriesName; label: string; color: string; dash?: string };

/**
 * Display order. Colours follow the component (validated for both themes in
 * index.css); direction is encoded by dashes, so identity is never colour alone.
 * The car charge is informational and drawn as a neutral dotted line.
 */
export const HISTORY_SERIES: HistorySeriesMeta[] = [
  { id: 'consumption', label: 'Consumi', color: 'var(--chart-home)' },
  { id: 'production', label: 'Fotovoltaico', color: 'var(--chart-solar)' },
  { id: 'grid_import', label: 'Prelievo', color: 'var(--chart-grid)' },
  { id: 'grid_export', label: 'Immissione', color: 'var(--chart-grid)', dash: '5 4' },
  { id: 'battery_charge', label: 'Carica batteria', color: 'var(--chart-battery)', dash: '5 4' },
  { id: 'battery_discharge', label: 'Scarica batteria', color: 'var(--chart-battery)' },
  { id: 'wallbox_consumption', label: 'Ricarica auto', color: 'var(--ui-text-secondary)', dash: '1 4' },
];

export const BUCKET_LABEL: Record<EnergyHistoryBucket, string> = { hour: 'ora', day: 'giorno', week: 'settimana', month: 'mese' };

/** Only the series the backend returned: hardware that is absent has no curve. */
export const availableSeries = (result: EnergyHistoryResult) => HISTORY_SERIES.filter((meta) => result.series[meta.id]);

const REASON_TEXT: Record<EnergyHistoryUnavailable['reason'], string> = {
  no_energy_meter: 'nessun contatore di energia',
  no_data: 'nessun dato nel periodo',
  recorder_unavailable: 'storico non disponibile',
  incompatible_configuration: 'contatore non compatibile',
};

/** Installed series without history while others have it, with the reason in user terms. */
export const missingSeries = (result: EnergyHistoryResult) =>
  HISTORY_SERIES.flatMap((meta) => {
    const unavailable = result.unavailable[meta.id];
    return unavailable ? [{ ...meta, reason: REASON_TEXT[unavailable.reason] }] : [];
  });

export type HistoryState =
  | { kind: 'data'; partial: boolean; inProgress: boolean }
  | { kind: 'no_meter' | 'incompatible' | 'no_data' | 'recorder_unavailable' | 'not_configured' };

/** What the section shows for a document: the chart, or why there is none. */
export function historyState(result: EnergyHistoryResult): HistoryState {
  const series = Object.values(result.series);
  if (!result.configured) return { kind: 'not_configured' };
  if (series.length) {
    return {
      kind: 'data',
      partial: series.some((item) => item.status === 'partial_data'),
      inProgress: series.some((item) => item.in_progress_last),
    };
  }
  const reasons = Object.values(result.unavailable).map((item) => item.reason);
  if (!reasons.length) return { kind: 'not_configured' };
  if (reasons.includes('recorder_unavailable')) return { kind: 'recorder_unavailable' };
  // Valid meters without statistics yet are not a configuration problem.
  if (reasons.includes('no_data')) return { kind: 'no_data' };
  if (reasons.includes('incompatible_configuration')) return { kind: 'incompatible' };
  return { kind: 'no_meter' };
}

export const formatKwh = (value: number) =>
  value.toLocaleString('it-IT', { maximumFractionDigits: Math.abs(value) < 10 ? 2 : Math.abs(value) < 100 ? 1 : 0 });

export type PointReading = { text: string; note: string | null; incomplete: boolean };

/** One bucket of one series in words: a real 0 is "0 kWh", a missing bucket is never 0. */
export function readPoint(point: EnergyHistoryResultPoint | undefined, inProgress: boolean): PointReading {
  if (point && point.value !== null) return { text: `${formatKwh(point.value)} kWh`, note: null, incomplete: false };
  // The bucket in progress may have no hour compiled yet: that is not a gap.
  if (!point || (inProgress && point.partial_value === undefined)) return { text: 'Non disponibile', note: null, incomplete: false };
  if (point.reason === 'incoherent_balance') return { text: 'Non disponibile', note: 'Dati incompleti · contatori non coerenti', incomplete: true };
  if (point.partial_value !== undefined) {
    return { text: 'Non disponibile', note: `Dati incompleti · parziale ${formatKwh(point.partial_value)} kWh`, incomplete: true };
  }
  return { text: 'Non disponibile', note: 'Dati incompleti', incomplete: true };
}

/* --- Time labels ---------------------------------------------------------------- */

const OFFSET = /(?:Z|([+-])(\d{2}):?(\d{2}))$/;

/**
 * A formatter in the backend time zone. A browser without that zone falls back
 * to the offset written in each bucket start, which is the same wall clock.
 */
function zoned(timezone: string, options: Intl.DateTimeFormatOptions) {
  try {
    const format = new Intl.DateTimeFormat('it-IT', { ...options, timeZone: timezone });
    return (start: string) => format.format(new Date(start));
  } catch {
    const format = new Intl.DateTimeFormat('it-IT', { ...options, timeZone: 'UTC' });
    return (start: string) => {
      const [, sign, hours = '0', minutes = '0'] = start.match(OFFSET) ?? [];
      const offset = (sign === '-' ? -1 : 1) * (Number(hours) * 60 + Number(minutes));
      return format.format(new Date(Date.parse(start) + offset * 60_000));
    };
  }
}

export type BucketLabel = { short: string; long: string; inProgress: boolean };

const CURRENT: Record<EnergyHistoryBucket, string | null> = { hour: null, day: 'Oggi', week: 'Questa settimana', month: 'Questo mese' };

/**
 * Axis and reading labels of the buckets as the backend returned them, in its
 * time zone: a 23 or 25 hour day keeps its own hours, and an hour repeated by
 * the change to winter time says which one it is.
 */
export function bucketLabels(result: EnergyHistoryResult): BucketLabel[] {
  const series = Object.values(result.series)[0];
  if (!series) return [];
  const { bucket, timezone } = result.range;
  const starts = series.points.map((point) => point.start);
  const last = series.in_progress_last ? starts.length - 1 : -1;
  let short: (start: string, index: number) => string;
  let long: (start: string) => string;
  if (bucket === 'hour') {
    const hour = zoned(timezone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const day = zoned(timezone, { weekday: 'short', day: 'numeric', month: 'short' });
    short = (start) => hour(start).slice(0, 2);
    long = (start) => `${day(start)} · ${hour(start)}`;
  } else if (bucket === 'month') {
    const month = zoned(timezone, { month: 'short' });
    const monthOfYear = zoned(timezone, { month: 'short', year: 'numeric' });
    const monthNumber = zoned(timezone, { month: 'numeric' });
    // The year appears on the first bucket and on every January.
    short = (start, index) => (index === 0 || monthNumber(start) === '1' ? monthOfYear(start) : month(start));
    long = zoned(timezone, { month: 'long', year: 'numeric' });
  } else {
    const day = zoned(timezone, { day: 'numeric', month: 'numeric' });
    const date = zoned(timezone, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    short = (start) => day(start);
    long = bucket === 'week' ? (start) => `Settimana dal ${date(start)}` : date;
  }
  const longs = starts.map(long);
  const current = CURRENT[bucket];
  return starts.map((start, index) => {
    let text = longs[index];
    // Two equal readings only happen on the hour repeated by the change to winter time: name its offset.
    if (longs.indexOf(text) !== longs.lastIndexOf(text)) text = `${text} (${offsetName(start)})`;
    if (index === last) text = current ? `${current} · in corso` : `${text} · in corso`;
    return { short: short(start, index), long: text, inProgress: index === last };
  });
}

/** The UTC offset written in a bucket start, e.g. "GMT+2". */
export function offsetName(start: string) {
  const [, sign, hours = '0', minutes = '00'] = start.match(OFFSET) ?? [];
  if (!sign) return 'GMT';
  return `GMT${sign}${Number(hours)}${minutes === '00' ? '' : `:${minutes}`}`;
}
