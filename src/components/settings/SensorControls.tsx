import React, { useMemo, useState } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { Clock3, Droplets, Wifi, WifiOff } from 'lucide-react';
import type { SensorConnectionState } from './types';
import { CONTEXT_PANEL_LAYOUT } from './layoutClasses';
import { ContextPanelHeader } from './ContextPanelHeader';
import { formatSensorNumericValue } from '../../utils/sensorValue';
import { resolveSensorVisualGroup, type SensorVisualGroup } from '../../utils/sensorPresentation';
import { SensorHeroVisual } from './SensorHeroVisual';
import GlassSegmentSelect from '../ui/GlassSegmentSelect';
import { BatteryLevelGlyph, parseBatteryPercentage } from './DeviceMetadataCard';
import { DeviceTelemetryStrip, type DeviceTelemetryStripItem } from './DeviceTelemetryStrip';
import { useI18n } from '../../i18n/I18nProvider';

interface SensorControlsProps {
  name: string;
  status?: string;
  value?: number;
  unit?: string;
  displayPrecision?: number;
  entityId?: string;
  deviceClass?: string;
  history?: number[];
  battery?: string;
  connection?: string;
  connectionState?: SensorConnectionState;
}

type SensorChartKind = 'line' | 'bar';

const SENSOR_HISTORY_WINDOWS = [3, 6, 12, 24] as const;

const BAR_DEVICE_CLASSES = new Set([
  'water',
  'volume',
  'precipitation',
  'precipitation_intensity',
  'rain',
  'gas',
]);

const BAR_KEYWORDS = [
  'lit',
  'liter',
  'litri',
  'lpm',
  'l/min',
  'm3',
  'm^3',
  'gall',
  'consum',
  'flow',
  'water',
  'rain',
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeHintText(...parts: Array<string | undefined>) {
  return parts
    .map((part) => (part ?? '').trim().toLowerCase())
    .filter((part) => part.length > 0)
    .join(' ');
}

function hasKeyword(source: string, keywords: string[]) {
  return keywords.some((keyword) => source.includes(keyword));
}

function resolveSensorChartKind({
  unit,
  name,
  entityId,
  deviceClass,
}: {
  unit?: string;
  name: string;
  entityId?: string;
  deviceClass?: string;
}): SensorChartKind {
  const normalizedDeviceClass = (deviceClass ?? '').trim().toLowerCase();
  if (BAR_DEVICE_CLASSES.has(normalizedDeviceClass)) {
    return 'bar';
  }
  const hint = normalizeHintText(normalizedDeviceClass, unit, name, entityId);
  if (hasKeyword(hint, BAR_KEYWORDS)) {
    return 'bar';
  }
  return 'line';
}

function normalizeTrendLinePoints(values: number[], width: number, height: number, padding: number) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(0.001, max - min);
  return values.map((value, index) => {
    const progressX = values.length <= 1 ? 0 : index / (values.length - 1);
    const x = padding + progressX * (width - padding * 2);
    const progressY = (value - min) / spread;
    const y = height - padding - progressY * (height - padding * 2);
    return { x, y };
  });
}

function TrendLine({ values }: { values: number[] }) {
  const { t } = useI18n();
  if (values.length < 2) {
    return (
      <div className="dashboard-content-surface-soft flex h-[clamp(8.5rem,28vw,10rem)] items-center justify-center rounded-[clamp(0.9rem,3vw,1rem)] p-[clamp(0.6rem,2.2vw,0.95rem)]">
        <p className="text-[clamp(0.66rem,1.8vw,0.76rem)] text-[color:var(--ui-text-tertiary)]">{t('controls.common.noHistory')}</p>
      </div>
    );
  }

  const width = 320;
  const height = 108;
  const padding = 6;
  const points = normalizeTrendLinePoints(values, width, height, padding);
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
  const areaPath = [
    `M ${firstPoint.x.toFixed(2)} ${(height - padding).toFixed(2)}`,
    `L ${firstPoint.x.toFixed(2)} ${firstPoint.y.toFixed(2)}`,
    ...points.slice(1).map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`),
    `L ${lastPoint.x.toFixed(2)} ${(height - padding).toFixed(2)}`,
    'Z',
  ].join(' ');

  return (
    <div className="dashboard-content-surface-soft h-[clamp(8.5rem,28vw,10rem)] rounded-[clamp(0.9rem,3vw,1rem)] p-[clamp(0.6rem,2.2vw,0.95rem)]">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" fill="none" aria-hidden="true">
        <path d={areaPath} fill="rgb(var(--ui-accent-rgb) / 0.16)" />
        <path
          d={linePath}
          stroke="rgb(var(--ui-accent-rgb) / 0.95)"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <circle cx={lastPoint.x} cy={lastPoint.y} r={2.6} fill="rgb(var(--ui-accent-rgb))" />
      </svg>
    </div>
  );
}

function TrendBars({ values }: { values: number[] }) {
  const { t } = useI18n();
  const normalizedHeights = useMemo(() => {
    if (values.length === 0) {
      return [];
    }
    const max = Math.max(...values);
    const min = Math.min(...values);
    const spread = Math.max(1, max - min);
    return values.map((value) => {
      const ratio = (value - min) / spread;
      return Math.round(26 + ratio * 54);
    });
  }, [values]);

  if (normalizedHeights.length === 0) {
    return (
      <div className="dashboard-content-surface-soft flex h-[clamp(8.5rem,28vw,10rem)] items-center justify-center rounded-[clamp(0.9rem,3vw,1rem)] p-[clamp(0.6rem,2.2vw,0.95rem)]">
        <p className="text-[clamp(0.66rem,1.8vw,0.76rem)] text-[color:var(--ui-text-tertiary)]">{t('controls.common.noHistory')}</p>
      </div>
    );
  }

  return (
    <div className="dashboard-content-surface-soft h-[clamp(8.5rem,28vw,10rem)] rounded-[clamp(0.9rem,3vw,1rem)] p-[clamp(0.6rem,2.2vw,0.95rem)]">
      <div className="h-full flex items-end justify-between gap-[clamp(0.3rem,1vw,0.5rem)]">
        {normalizedHeights.map((height, index) => {
          const isLast = index === normalizedHeights.length - 1;
          return (
            <div
              key={`${index}-${height}`}
              className={`w-[clamp(0.34rem,1vw,0.52rem)] rounded-full transition-all ${isLast ? 'bg-[color:var(--ui-accent)] shadow-[0_0_14px_rgb(var(--ui-accent-rgb)/0.45)]' : 'bg-[color:var(--ui-fill-primary)]'}`}
              style={{ height: `${height}%` }}
              aria-hidden="true"
            />
          );
        })}
      </div>
    </div>
  );
}

function resolveSensorChartAccent(group: SensorVisualGroup) {
  if (group === 'energy') {
    return {
      stroke: 'rgba(255,214,10,0.86)',
      fill: 'rgba(255,214,10,0.10)',
    };
  }
  if (group === 'environment') {
    return {
      stroke: 'rgba(143,242,207,0.86)',
      fill: 'rgba(52,211,153,0.10)',
    };
  }
  if (group === 'fluid') {
    return {
      stroke: 'rgba(125,211,252,0.86)',
      fill: 'rgba(14,165,233,0.10)',
    };
  }
  if (group === 'measurement') {
    return {
      stroke: 'rgba(196,181,253,0.86)',
      fill: 'rgba(167,139,250,0.10)',
    };
  }
  return {
    stroke: 'rgba(148,163,184,0.86)',
    fill: 'rgba(148,163,184,0.10)',
  };
}

export function SensorControlsPanel({
  name,
  status,
  value,
  unit,
  displayPrecision = 0,
  entityId,
  deviceClass,
  history,
  battery,
  connection,
  connectionState,
}: SensorControlsProps) {
  const { t } = useI18n();
  const sensorValue = formatSensorNumericValue(value, displayPrecision) ?? '—';
  const [historyHours, setHistoryHours] = useState<(typeof SENSOR_HISTORY_WINDOWS)[number]>(24);
  const hasSensorValue = typeof value === 'number' && Number.isFinite(value);
  const visualGroup = resolveSensorVisualGroup(deviceClass);
  const chartAccent = resolveSensorChartAccent(visualGroup);
  const chartData = useMemo(() => {
    const historyValues = (history ?? []).filter((entry) => Number.isFinite(entry));
    if (historyValues.length < 2) {
      return [];
    }
    const visiblePoints = Math.max(2, Math.ceil((historyValues.length * historyHours) / 24));
    const values = historyValues.slice(-visiblePoints);
    return values.map((entry, index) => ({ index, value: entry }));
  }, [history, historyHours]);
  const average =
    chartData.length > 0
      ? chartData.reduce((sum, item) => sum + item.value, 0) / chartData.length
      : null;
  const averageLabel =
    average !== null
      ? t('controls.sensor.average', { value: `${formatSensorNumericValue(average, displayPrecision)}${unit && unit.trim().length > 0 ? ` ${unit}` : ''}` })
      : t('controls.sensor.noAverage');
  const batteryValue = battery && battery.trim().length > 0 ? battery : 'N/D';
  const resolvedConnectionState = connectionState ?? 'unknown';
  const connectionLabel =
    connection && connection.trim().length > 0
      ? connection.trim()
      : resolvedConnectionState === 'offline'
        ? t('controls.sensor.disconnected')
        : resolvedConnectionState === 'online'
          ? t('controls.sensor.connected')
          : t('controls.common.unknown');
  const connectionSubtitleClass =
    resolvedConnectionState === 'offline'
      ? 'text-rose-200/90'
      : resolvedConnectionState === 'online'
        ? 'text-emerald-200/90'
        : 'text-[color:var(--ui-text-secondary)]';
  const connectionValue = connectionLabel;
  const batteryPercent = parseBatteryPercentage(batteryValue);
  const telemetryItems = useMemo<DeviceTelemetryStripItem[]>(() => [
    {
      id: 'battery',
      icon: <BatteryLevelGlyph percentage={batteryPercent} compact />,
      label: t('controls.sensor.battery'),
      value: batteryValue,
      tone:
        batteryPercent === undefined
          ? 'neutral'
          : batteryPercent <= 20
            ? 'danger'
            : batteryPercent <= 50
              ? 'warning'
              : 'success',
    },
    {
      id: 'connection',
      icon: resolvedConnectionState === 'offline' ? <WifiOff size={15} /> : <Wifi size={15} />,
      label: t('controls.sensor.connection'),
      value: connectionValue,
      tone:
        resolvedConnectionState === 'online'
          ? 'success'
          : resolvedConnectionState === 'offline'
            ? 'danger'
            : 'neutral',
    },
  ], [batteryPercent, batteryValue, connectionValue, resolvedConnectionState, t]);
  return (
    <div className={`${CONTEXT_PANEL_LAYOUT.shell} gap-[clamp(0.7rem,2.4vw,1rem)]`}>
      <ContextPanelHeader
        title={name}
        subtitle={connectionLabel}
        icon={<Droplets size={22} />}
        fallbackTitle={t('controls.sensor.title')}
        iconClassName="text-cyan-200"
        subtitleClassName={connectionSubtitleClass}
      />

      <div className={`${CONTEXT_PANEL_LAYOUT.sectionSoft} mb-1`}>
        <div className="aspect-square w-full max-w-[clamp(13rem,62vw,17.5rem)] mx-auto">
          <SensorHeroVisual
            group={visualGroup}
            value={sensorValue}
            numericValue={hasSensorValue ? value : undefined}
            unit={hasSensorValue ? unit : undefined}
            deviceClass={deviceClass}
            history={history}
            status={status}
          />
        </div>
      </div>

      <div className={`${CONTEXT_PANEL_LAYOUT.section} mb-1`}>
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <span className="inline-flex min-w-0 items-center gap-2 text-xs font-semibold text-[color:var(--ui-text-tertiary)]">
            <Clock3 size={14} />
            {t('controls.sensor.trend')}
          </span>
          <span className="shrink-0 text-xs font-semibold text-[color:var(--ui-text-secondary)]">{averageLabel}</span>
        </div>

        <GlassSegmentSelect<(typeof SENSOR_HISTORY_WINDOWS)[number]>
          ariaLabel={t('controls.sensor.historyRange')}
          options={SENSOR_HISTORY_WINDOWS.map((hours) => ({
            value: hours,
            label: `${hours}h`,
            ariaLabel: t('controls.sensor.lastHours', { hours }),
          }))}
          value={historyHours}
          onChange={setHistoryHours}
          optionClassName="h-9"
        />

        <div className="dashboard-content-surface-soft mt-3 h-36 overflow-hidden rounded-[1.55rem] px-2 py-3">
          {chartData.length >= 2 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 4, left: 4, bottom: 4 }}>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={chartAccent.stroke}
                  strokeWidth={2.2}
                  fill={chartAccent.fill}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center px-4 text-center text-xs text-[color:var(--ui-text-tertiary)]">
              {t('controls.common.noHistory')}
            </div>
          )}
        </div>
      </div>

      <div className="mt-auto">
        <DeviceTelemetryStrip items={telemetryItems} />
      </div>
    </div>
  );
}

export const SensorControls = SensorControlsPanel;
