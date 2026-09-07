import React from 'react';
import { Area, AreaChart, Bar, BarChart, Line, LineChart, ResponsiveContainer } from 'recharts';
import type { MicroWidget } from '../../../types/dashboardModels';
import type { MockEntityState } from '../../../types/ha';
import { useI18n } from '../../../i18n/I18nProvider';

type MicroSuperChartProps = {
  widget: MicroWidget;
  state?: MockEntityState;
  history?: number[];
};

type ChartPoint = {
  index: number;
  value: number;
};

function parseNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function resolveCurrentValue(state: MockEntityState | undefined) {
  const rawAttributes = state?.rawAttributes;
  return (
    parseNumber(state?.numericValue) ??
    parseNumber(state?.state) ??
    parseNumber(rawAttributes?.value) ??
    parseNumber(rawAttributes?.current_value) ??
    parseNumber(rawAttributes?.temperature)
  );
}

function resolveChartType(widget: MicroWidget): 'line' | 'area' | 'bar' {
  if (widget.superChartType === 'area' || widget.superChartType === 'bar') {
    return widget.superChartType;
  }
  return 'line';
}

function buildSeries(history: number[] | undefined, fallbackValue: number | undefined) {
  const finiteHistory = (history ?? []).filter((value) => Number.isFinite(value));
  const series =
    finiteHistory.length >= 2
      ? finiteHistory.slice(-18)
      : fallbackValue !== undefined
        ? [fallbackValue, fallbackValue]
        : [];
  return series.map((value, index) => ({ index, value }));
}

function renderChart(type: 'line' | 'area' | 'bar', data: ChartPoint[]) {
  if (type === 'area') {
    return (
      <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="micro-superchart-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(125,211,252,0.56)" />
            <stop offset="100%" stopColor="rgba(56,189,248,0.04)" />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke="rgba(186,230,253,0.95)"
          strokeWidth={1.8}
          fill="url(#micro-superchart-area)"
          isAnimationActive={false}
        />
      </AreaChart>
    );
  }
  if (type === 'bar') {
    return (
      <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <Bar
          dataKey="value"
          fill="rgba(125,211,252,0.82)"
          radius={[3, 3, 0, 0]}
          isAnimationActive={false}
          maxBarSize={8}
        />
      </BarChart>
    );
  }
  return (
    <LineChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
      <Line
        type="monotone"
        dataKey="value"
        stroke="rgba(186,230,253,0.95)"
        strokeWidth={1.8}
        dot={false}
        isAnimationActive={false}
      />
    </LineChart>
  );
}

export function MicroSuperChart({ widget, state, history }: MicroSuperChartProps) {
  const { t } = useI18n();
  const label = widget.label?.trim() || state?.rawAttributes?.friendly_name?.toString() || widget.entity;
  const unit =
    (state?.unit ?? state?.rawAttributes?.unit_of_measurement ?? state?.rawAttributes?.native_unit_of_measurement)?.toString() ??
    '';
  const chartType = resolveChartType(widget);
  const currentValue = resolveCurrentValue(state);
  const formattedValue = currentValue !== undefined ? `${Math.round(currentValue * 10) / 10}${unit ? ` ${unit}` : ''}` : '--';
  const series = buildSeries(history, currentValue);

  return (
    <div className="min-h-[4.25rem] rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-3 py-2.5 text-[color:var(--ui-text-primary)] transition-all duration-200 ease-out hover:-translate-y-[1px] hover:border-[color:var(--ui-border-strong)] hover:bg-[color:var(--ui-fill-secondary)] hover:shadow-[0_8px_24px_var(--ui-shadow-soft)]">
      <div className="flex h-full min-w-0 flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium leading-tight text-[color:var(--ui-text-primary)]">{label}</p>
          <p className="shrink-0 text-[11px] font-semibold leading-tight text-[color:var(--ui-text-secondary)]">{formattedValue}</p>
        </div>
        <div className="h-10 w-full">
          {series.length >= 2 ? (
            <ResponsiveContainer width="100%" height="100%">
              {renderChart(chartType, series)}
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[11px] text-[color:var(--ui-text-tertiary)]">{t('card.noData')}</div>
          )}
        </div>
      </div>
    </div>
  );
}
