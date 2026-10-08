import type {
  EnergyHistoryChange,
  EnergyHistoryPreset,
  EnergyHistoryResult,
  EnergyHistorySeriesName,
  EnergyHistoryTotal,
  EnergyKpi,
  EnergyKpiName,
} from '../../../services/energyCoreClient';
import { translateConsumption, type ConsumptionCopyKey } from '../../../i18n/consumptionCopy';
import type { AppLocale } from '../../../i18n/I18nProvider';
import { formatKwh } from './energyHistoryModel';

/*
 * Presentation of the period analytics of `get_history` (summary, kpis,
 * previous.comparison): words and number formatting only. Totals, KPIs,
 * changes, completeness and tolerances all come from the backend; nothing is
 * summed, divided or compared here beyond choosing the words for a sign.
 */

export const PERIOD_TEXT: Record<EnergyHistoryPreset, { current: ConsumptionCopyKey; previous: ConsumptionCopyKey }> = {
  '24h': { current: 'Ultime 24 ore', previous: 'rispetto alle 24 ore precedenti' },
  '7d': { current: 'Ultimi 7 giorni', previous: 'rispetto ai 7 giorni precedenti' },
  '30d': { current: 'Ultimi 30 giorni', previous: 'rispetto ai 30 giorni precedenti' },
  '12m': { current: 'Ultimi 12 mesi', previous: 'rispetto ai 12 mesi precedenti' },
};

/** Consumption and production first, then the other flows, as the user reads them. */
export const TOTALS: Array<{ id: EnergyHistorySeriesName; label: ConsumptionCopyKey }> = [
  { id: 'consumption', label: 'Consumi' },
  { id: 'production', label: 'Produzione' },
  { id: 'grid_import', label: 'Prelievo' },
  { id: 'grid_export', label: 'Immissione' },
  { id: 'battery_charge', label: 'Carica batteria' },
  { id: 'battery_discharge', label: 'Scarica batteria' },
  { id: 'wallbox_consumption', label: 'Ricarica auto' },
];

export const periodText = (period: EnergyHistoryPreset, locale: AppLocale = 'it') => ({
  current: translateConsumption(locale, PERIOD_TEXT[period].current),
  previous: translateConsumption(locale, PERIOD_TEXT[period].previous),
});

export const formatPercent = (value: number, locale: AppLocale = 'it') =>
  `${value.toLocaleString(locale, { maximumFractionDigits: 1 })}%`;

export type TotalReading = {
  value: string;
  /** The period is not over: the value is the energy so far. */
  soFar: boolean;
  /** A closed bucket is missing: no total, only what is known. */
  incomplete: boolean;
  note: string | null;
};

/** A total as the backend gives it: a partial value is never shown as the total. */
export function readTotal(total: EnergyHistoryTotal, locale: AppLocale = 'it'): TotalReading {
  if (total.status === 'complete' && total.value !== null) {
    return { value: `${formatKwh(total.value)} kWh`, soFar: total.in_progress, incomplete: false, note: null };
  }
  const known = total.partial_value === undefined
    ? null
    : translateConsumption(locale, 'Dato parziale: {value} kWh misurati', { value: formatKwh(total.partial_value) });
  return { value: '—', soFar: false, incomplete: true, note: known };
}

export type ChangeReading = {
  /** Visible text: an arrow and the percentage, or why there is none. */
  main: string;
  /** Visible words after `main`, when they apply. */
  suffix: string | null;
  /** The whole change in words, for screen readers. */
  sentence: string;
};

/** A total against the previous period in words; the arrow is neutral, never good or bad. */
export function readChange(
  change: EnergyHistoryChange | undefined,
  label: string,
  previous: string,
  locale: AppLocale = 'it',
): ChangeReading | null {
  if (!change) return null;
  const say = (key: ConsumptionCopyKey, parameters?: Record<string, string>) =>
    translateConsumption(locale, key, { label, previous, ...parameters });
  if (change.status === 'complete' && change.percent_change !== null) {
    const percent = formatPercent(Math.abs(change.percent_change), locale);
    if (change.percent_change > 0) return { main: `↑ ${percent}`, suffix: previous, sentence: say('{label} in aumento {previous}: più {percent}', { percent }) };
    if (change.percent_change < 0) return { main: `↓ ${percent}`, suffix: previous, sentence: say('{label} in calo {previous}: meno {percent}', { percent }) };
    return { main: say('Nessuna variazione'), suffix: previous, sentence: say('{label} senza variazioni {previous}') };
  }
  if (change.status === 'complete' && change.reason === 'no_percentage_baseline') {
    return { main: say('Nuovo'), suffix: previous, sentence: say('{label}: nessuna energia nel periodo precedente, quindi nessuna percentuale') };
  }
  if (change.status === 'partial_data') {
    return { main: say('Confronto non disponibile · dati incompleti'), suffix: null, sentence: say('{label}: confronto non disponibile, dati incompleti') };
  }
  return { main: say('Confronto non disponibile'), suffix: null, sentence: say('{label}: confronto non disponibile') };
}

export type PeriodTotal = { id: EnergyHistorySeriesName; label: string; reading: TotalReading; change: ChangeReading | null };

/**
 * The totals worth a tile: configured series with some data. A series
 * without any is named in the chart notes instead of an empty tile.
 */
export function periodTotals(result: EnergyHistoryResult, period: EnergyHistoryPreset, locale: AppLocale = 'it'): PeriodTotal[] {
  const previous = periodText(period, locale).previous;
  return TOTALS.flatMap(({ id, label: key }) => {
    const total = result.summary[id];
    if (!total || total.status === 'unavailable') return [];
    const label = translateConsumption(locale, key);
    return [{ id, label, reading: readTotal(total, locale), change: readChange(result.previous?.comparison.series[id], label, previous, locale) }];
  });
}

export type KpiMeta = { id: EnergyKpiName; label: ConsumptionCopyKey; description: ConsumptionCopyKey; method: ConsumptionCopyKey; bar: boolean };

/** Self-consumption and self-sufficiency are 0–100; the solar coverage can exceed 100 and has no bar. */
export const KPIS: KpiMeta[] = [
  {
    id: 'self_consumption',
    label: 'Autoconsumo',
    description: 'Quanta energia solare hai utilizzato direttamente in casa.',
    method: 'La parte della produzione solare che non è stata immessa in rete, sul totale prodotto.',
    bar: true,
  },
  {
    id: 'self_sufficiency',
    label: 'Autosufficienza',
    description: 'Quanta parte dei tuoi consumi è stata coperta senza prelevare energia dalla rete.',
    method: 'La parte dei consumi coperta da fotovoltaico e batteria, sul totale consumato.',
    bar: true,
  },
  {
    id: 'solar_offset',
    label: 'Copertura solare',
    description: 'Rapporto tra energia solare prodotta e consumi del periodo.',
    method: 'L’energia solare prodotta rispetto ai consumi dello stesso periodo (Solar Offset). Supera il 100% quando produci più di quanto consumi e non dice quanta energia solare hai usato.',
    bar: false,
  },
];

const KPI_REASON_TEXT: Record<NonNullable<EnergyKpi['reason']>, ConsumptionCopyKey> = {
  no_solar_production: 'Nessuna produzione solare nel periodo.',
  no_consumption: 'Nessun consumo nel periodo.',
  missing_data: 'Mancano i contatori necessari.',
  partial_data: 'Dati incompleti nel periodo.',
  incoherent_balance: 'I contatori non sono coerenti in questo periodo.',
};

export type KpiReading = {
  value: string;
  /** The value for the bar of a 0–100 KPI, as the backend gave it. */
  percent: number | null;
  soFar: boolean;
  note: string | null;
};

export function readKpi(meta: KpiMeta, kpi: EnergyKpi, locale: AppLocale = 'it'): KpiReading {
  if (kpi.status === 'complete' && kpi.value !== null) {
    const over = meta.id === 'solar_offset' && kpi.value > 100;
    return {
      value: formatPercent(kpi.value, locale),
      percent: meta.bar ? kpi.value : null,
      soFar: kpi.in_progress,
      note: over ? translateConsumption(locale, 'Nel periodo hai prodotto più energia solare di quanta ne hai consumata.') : null,
    };
  }
  const note = kpi.reason ? translateConsumption(locale, KPI_REASON_TEXT[kpi.reason]) : null;
  return { value: kpi.status === 'unavailable' ? translateConsumption(locale, 'Non disponibile') : '—', percent: null, soFar: false, note };
}

/** A KPI's words in the user's language. */
export const kpiText = (meta: KpiMeta, locale: AppLocale = 'it') => ({
  label: translateConsumption(locale, meta.label),
  description: translateConsumption(locale, meta.description),
  method: translateConsumption(locale, meta.method),
});

/** The KPIs the backend returned: without photovoltaics the solar ones do not exist. */
export const periodKpis = (result: EnergyHistoryResult, locale: AppLocale = 'it') =>
  KPIS.flatMap((meta) => {
    const kpi = result.kpis[meta.id];
    return kpi ? [{ ...meta, ...kpiText(meta, locale), reading: readKpi(meta, kpi, locale) }] : [];
  });
