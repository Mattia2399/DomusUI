import type { Widget } from '../../types/dashboardModels';
import type { MockEntityState } from '../../types/ha';
import { resolveSensorVisualGroup, type SensorVisualGroup } from '../../utils/sensorPresentation';
import {
  formatSensorNumericValue,
  resolveSensorDisplayPrecision,
  resolveSensorNumericValue,
} from '../../utils/sensorValue';
import { translateForLocale, type AppLocale } from '../../i18n/I18nProvider';

const SENSOR_MIN_ATTRIBUTE_KEYS = ['min', 'min_value', 'min_level', 'min_db', 'minimum'];
const SENSOR_MAX_ATTRIBUTE_KEYS = ['max', 'max_value', 'max_level', 'max_db', 'maximum'];

export type SensorTrendDirection = 'up' | 'down' | 'stable' | 'none';

export type SensorCardModel = {
  title: string;
  available: boolean;
  valueText: string;
  compactValueText: string;
  unit?: string;
  visualGroup: SensorVisualGroup;
  level: 'low' | 'medium' | 'high' | 'unknown';
  levelRatio: number;
  range: {
    min: number;
    max: number;
    minText: string;
    maxText: string;
  };
  stats: {
    minText: string;
    averageText: string;
    maxText: string;
  };
  trend: {
    direction: SensorTrendDirection;
    label: string;
    deltaText?: string;
  };
  history: number[];
  visualization: 'sparkline' | 'range';
  status: {
    activeBars: number;
    label: string;
    color?: string;
  };
};

type BuildSensorCardModelInput = {
  locale?: AppLocale;
  widget: Widget;
  value?: number;
  sensorHistory?: number[];
  liveEntity?: MockEntityState;
  batteryEntity?: MockEntityState;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function readAttributeNumber(attributes: Record<string, unknown> | undefined, keys: string[]) {
  for (const key of keys) {
    const parsed = toFiniteNumber(attributes?.[key]);
    if (parsed !== undefined) {
      return parsed;
    }
  }
  return undefined;
}

function niceCeil(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return value <= 0 ? 0 : 10;
  }
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function niceFloor(value: number) {
  if (!Number.isFinite(value) || value >= 0) {
    return 0;
  }
  const magnitude = 10 ** Math.floor(Math.log10(Math.abs(value)));
  const normalized = Math.abs(value) / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return -step * magnitude;
}

function resolveDefaultRange(unit: string | undefined, value: number) {
  const normalizedUnit = (unit ?? '').trim().toLowerCase();
  if (normalizedUnit.includes('%')) return { min: 0, max: 100 };
  if (normalizedUnit.includes('db')) return { min: 0, max: 120 };
  if (normalizedUnit.includes('mbps') || normalizedUnit.includes('mbit')) return { min: 0, max: 200 };
  if (normalizedUnit === 'c' || normalizedUnit === '°c') return { min: 0, max: 50 };
  return {
    min: value < 0 ? niceFloor(value * 1.2) : 0,
    max: Math.max(10, niceCeil(Math.max(10, Math.abs(value) * 1.8))),
  };
}

function resolveRange(
  value: number,
  unit: string | undefined,
  history: number[],
  attributes: Record<string, unknown> | undefined,
) {
  const fallback = resolveDefaultRange(unit, value);
  const attrMin = readAttributeNumber(attributes, SENSOR_MIN_ATTRIBUTE_KEYS);
  const attrMax = readAttributeNumber(attributes, SENSOR_MAX_ATTRIBUTE_KEYS);
  const historyMin = history.length >= 3 ? Math.min(...history) : undefined;
  const historyMax = history.length >= 3 ? Math.max(...history) : undefined;
  let min = attrMin ?? (historyMin !== undefined ? niceFloor(historyMin) : fallback.min);
  let max = attrMax ?? (historyMax !== undefined ? niceCeil(historyMax) : fallback.max);
  if (value < min) min = niceFloor(value);
  if (value > max) max = niceCeil(value);
  if (max <= min) max = min + Math.max(1, Math.abs(min) * 0.25);
  return { min, max };
}

function formatCompactValue(value: number | undefined, precision: number) {
  if (value === undefined) return '—';
  const absolute = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const compact = (divisor: number, suffix: string) => {
    const scaled = absolute / divisor;
    const decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
    return `${sign}${scaled.toFixed(decimals).replace(/\.0+$/, '')}${suffix}`;
  };
  if (absolute >= 1_000_000_000) return compact(1_000_000_000, 'G');
  if (absolute >= 1_000_000) return compact(1_000_000, 'M');
  if (absolute >= 10_000) return compact(1_000, 'k');
  const decimals = absolute >= 100 ? 0 : absolute >= 10 ? Math.min(1, precision) : Math.min(2, precision);
  return value.toFixed(decimals);
}

function parseBatteryPercentage(value: unknown) {
  const parsed = toFiniteNumber(value);
  return parsed === undefined ? undefined : clamp(Math.round(parsed), 0, 100);
}

function resolveStatus(
  hasBatteryEntity: boolean,
  batteryEntity: MockEntityState | undefined,
  liveEntity: MockEntityState | undefined,
  available: boolean,
  locale: AppLocale,
) {
  if (!hasBatteryEntity) {
    return {
      activeBars: available ? 3 : 0,
      label: translateForLocale(locale, available ? 'card.sensor.available' : 'card.sensor.unavailable'),
    };
  }
  const percentage =
    parseBatteryPercentage(batteryEntity?.numericValue) ??
    parseBatteryPercentage(batteryEntity?.state) ??
    parseBatteryPercentage(liveEntity?.rawAttributes?.battery_level) ??
    parseBatteryPercentage(liveEntity?.rawAttributes?.battery);
  if (percentage === undefined) {
    return { activeBars: 0, label: translateForLocale(locale, 'card.sensor.batteryUnavailable'), color: '#8f96aa' };
  }
  if (percentage <= 20) {
    return { activeBars: 1, label: translateForLocale(locale, 'card.sensor.batteryLevel', { value: percentage }), color: '#fb7185' };
  }
  if (percentage <= 50) {
    return { activeBars: 2, label: translateForLocale(locale, 'card.sensor.batteryLevel', { value: percentage }), color: '#f59e0b' };
  }
  return { activeBars: 3, label: translateForLocale(locale, 'card.sensor.batteryLevel', { value: percentage }), color: '#22c55e' };
}

function resolveTrend(value: number | undefined, history: number[], rangeSpan: number, precision: number, locale: AppLocale) {
  if (value === undefined || history.length < 2) {
    return { direction: 'none' as const, label: translateForLocale(locale, value === undefined ? 'card.sensor.unavailableShort' : 'card.sensor.availableShort') };
  }
  const lastHistoryValue = history[history.length - 1];
  const previousValue = lastHistoryValue === value && history.length > 1
    ? history[history.length - 2]
    : lastHistoryValue;
  const delta = value - previousValue;
  const threshold = Math.max(rangeSpan * 0.01, 10 ** -Math.max(0, precision));
  if (Math.abs(delta) <= threshold) {
    return { direction: 'stable' as const, label: translateForLocale(locale, 'card.sensor.stable'), deltaText: '0' };
  }
  const deltaText = `${delta > 0 ? '+' : ''}${formatSensorNumericValue(delta, Math.min(precision, 2)) ?? '0'}`;
  return delta > 0
    ? { direction: 'up' as const, label: translateForLocale(locale, 'card.sensor.increasing'), deltaText }
    : { direction: 'down' as const, label: translateForLocale(locale, 'card.sensor.decreasing'), deltaText };
}

export function buildSensorCardModel({
  widget,
  value,
  sensorHistory,
  liveEntity,
  batteryEntity,
  locale = 'it',
}: BuildSensorCardModelInput): SensorCardModel {
  const numericValue = resolveSensorNumericValue(value, liveEntity);
  const available = numericValue !== undefined;
  const unit = liveEntity?.unit ?? widget.unit;
  const precision = resolveSensorDisplayPrecision(
    widget.sensorDisplayPrecision,
    liveEntity?.rawAttributes,
    unit,
  );
  const history = (sensorHistory ?? []).filter(Number.isFinite).slice(-24);
  const safeValue = numericValue ?? 0;
  const range = resolveRange(safeValue, unit, history, liveEntity?.rawAttributes);
  const rangeSpan = Math.max(0.001, range.max - range.min);
  const levelRatio = available ? clamp((safeValue - range.min) / rangeSpan, 0, 1) : 0;
  const level = !available ? 'unknown' : levelRatio < 0.45 ? 'low' : levelRatio < 0.75 ? 'medium' : 'high';
  const statValues = available
    ? history[history.length - 1] === safeValue
      ? history
      : [...history, safeValue]
    : history;
  const statMin = statValues.length > 0 ? Math.min(...statValues) : range.min;
  const statMax = statValues.length > 0 ? Math.max(...statValues) : range.max;
  const statAverage = statValues.length > 0
    ? statValues.reduce((sum, entry) => sum + entry, 0) / statValues.length
    : safeValue;
  const deviceClass = liveEntity?.rawAttributes?.device_class;

  return {
    title: widget.title.trim() || translateForLocale(locale, 'controls.sensor.title'),
    available,
    valueText: formatSensorNumericValue(numericValue, precision) ?? '—',
    compactValueText: formatCompactValue(numericValue, precision),
    unit: available ? unit : undefined,
    visualGroup: resolveSensorVisualGroup(deviceClass),
    level,
    levelRatio,
    range: {
      min: range.min,
      max: range.max,
      minText: formatSensorNumericValue(range.min, precision) ?? '—',
      maxText: formatSensorNumericValue(range.max, precision) ?? '—',
    },
    stats: {
      minText: formatSensorNumericValue(statMin, precision) ?? '—',
      averageText: formatSensorNumericValue(statAverage, precision) ?? '—',
      maxText: formatSensorNumericValue(statMax, precision) ?? '—',
    },
    trend: resolveTrend(numericValue, history, rangeSpan, precision, locale),
    history,
    visualization: history.length >= 2 ? 'sparkline' : 'range',
    status: resolveStatus(Boolean(widget.sensorBatteryEntityId?.trim()), batteryEntity, liveEntity, available, locale),
  };
}
