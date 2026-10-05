import type { EnergyHistory, EnergyHistoryPeriod, EnergyHistorySeriesId } from '../../../services/energyCoreClient';

/* Period figures computed only from the history the backend returns: nothing is estimated here. */

export const PERIOD_LABEL: Record<EnergyHistoryPeriod, string> = {
  '24h': 'Ultime 24 ore',
  '7d': 'Ultimi 7 giorni',
  '30d': 'Ultimi 30 giorni',
};

/** Sum of the buckets with data, or null when the series is missing or entirely empty. */
export function seriesTotal(history: EnergyHistory, id: EnergyHistorySeriesId) {
  const values = (history.series[id] ?? []).map((point) => point.value).filter((value): value is number => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

const ratio = (part: number | null, whole: number | null) =>
  part === null || whole === null || whole <= 0 ? null : Math.max(0, Math.min(1, part / whole));

export function historyBalance(history: EnergyHistory) {
  const production = seriesTotal(history, 'production');
  const consumption = seriesTotal(history, 'consumption');
  const imported = seriesTotal(history, 'import');
  const exported = seriesTotal(history, 'export');
  return {
    production,
    consumption,
    imported,
    exported,
    // Share of solar energy used on site rather than exported.
    selfConsumption: production === null || exported === null ? null : ratio(production - exported, production),
    // Share of home consumption not drawn from the grid.
    selfSufficiency: consumption === null || imported === null ? null : ratio(consumption - imported, consumption),
    change: history.previous?.consumption && consumption !== null ? consumption / history.previous.consumption - 1 : null,
  };
}

export const formatKwh = (value: number | null) =>
  value === null ? '—' : value.toLocaleString('it-IT', { maximumFractionDigits: value < 10 ? 1 : 0 });
export const formatEuro = (value: number) =>
  value.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatPercent = (value: number, signed = false) =>
  `${signed && value > 0 ? '+' : ''}${Math.round(value * 100).toLocaleString('it-IT')}%`;

/** Axis and tooltip label for a bucket start, in the local time of the viewer. */
export function bucketLabel(start: string, bucket: EnergyHistory['bucket'], long = false) {
  const date = new Date(start);
  if (bucket === 'hour') {
    const hour = date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    return long ? `${date.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric' })} · ${hour}` : hour.slice(0, 2);
  }
  return long
    ? date.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
    : date.toLocaleDateString('it-IT', { day: 'numeric', month: 'numeric' });
}
