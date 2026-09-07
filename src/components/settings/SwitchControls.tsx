import { useMemo, useState } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { Clock3, Plug, Power, ToggleRight, Zap } from 'lucide-react';
import type { MockEntityState } from '../../types/ha';
import { ContextPanelHeader } from './ContextPanelHeader';
import { CONTEXT_PANEL_LAYOUT } from './layoutClasses';
import GlassSegmentSelect from '../ui/GlassSegmentSelect';
import { useI18n } from '../../i18n/I18nProvider';

const SWITCH_TOGGLE_PENDING_ATTRIBUTE_KEY = '__dashboard_pending_switch_toggle';

type SwitchControlsProps = {
  name: string;
  entityId?: string;
  fallbackStatus?: string;
  entity?: MockEntityState;
  consumptionEntityId?: string;
  consumptionEntity?: MockEntityState;
  consumptionHistory?: number[];
  onToggle: () => void;
};

type ResolvedSwitchState = 'on' | 'off' | 'unavailable' | 'unknown';

const CONSUMPTION_HISTORY_WINDOWS = [3, 6, 12, 24] as const;

function normalizeSwitchState(value: string | undefined): ResolvedSwitchState {
  const normalized = (value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (['on', 'active', 'enabled', 'true', 'acceso', 'accesa', 'attivo', 'attiva'].includes(normalized)) {
    return 'on';
  }
  if (['off', 'inactive', 'disabled', 'false', 'spento', 'spenta', 'disattivo', 'disattiva'].includes(normalized)) {
    return 'off';
  }
  if (normalized === 'unavailable') {
    return 'unavailable';
  }
  return 'unknown';
}

function resolvePendingTarget(value: unknown) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 'on') {
    return true;
  }
  if (value === 'off') {
    return false;
  }
  return undefined;
}

function toFiniteNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function formatConsumptionValue(value: number, formatNumber: ReturnType<typeof useI18n>['formatNumber']) {
  const absoluteValue = Math.abs(value);
  if (absoluteValue >= 100) {
    return formatNumber(Math.round(value));
  }
  if (absoluteValue >= 10) {
    return formatNumber(value, { maximumFractionDigits: 1 });
  }
  return formatNumber(value, { maximumFractionDigits: 2 });
}

function resolveConsumptionKind(entity: MockEntityState | undefined) {
  const deviceClass = String(entity?.rawAttributes?.device_class ?? '').trim().toLowerCase();
  const unit = (entity?.unit ?? String(entity?.rawAttributes?.unit_of_measurement ?? '')).trim().toLowerCase();
  if (deviceClass === 'power' || ['w', 'kw', 'mw'].includes(unit)) {
    return 'power';
  }
  if (deviceClass === 'energy' || ['wh', 'kwh', 'mwh'].includes(unit)) {
    return 'energy';
  }
  return 'consumption';
}

export function SwitchControls({
  name,
  entityId,
  fallbackStatus,
  entity,
  consumptionEntityId,
  consumptionEntity,
  consumptionHistory,
  onToggle,
}: SwitchControlsProps) {
  const { formatNumber, t } = useI18n();
  const [historyHours, setHistoryHours] = useState<(typeof CONSUMPTION_HISTORY_WINDOWS)[number]>(24);
  const pendingTarget = resolvePendingTarget(entity?.rawAttributes?.[SWITCH_TOGGLE_PENDING_ATTRIBUTE_KEY]);
  const resolvedState = normalizeSwitchState(
    typeof entity?.toggleOn === 'boolean'
      ? entity.toggleOn
        ? 'on'
        : 'off'
      : entity?.stateLabel ?? entity?.state ?? fallbackStatus,
  );
  const isUnavailable = resolvedState === 'unavailable' || resolvedState === 'unknown';
  const isOn = pendingTarget ?? (resolvedState === 'on');
  const isPending = pendingTarget !== undefined;
  const stateLabel = isUnavailable
    ? resolvedState === 'unavailable'
      ? t('controls.common.unavailable')
      : t('controls.common.unknown')
    : isPending
      ? pendingTarget
        ? t('controls.switch.turningOn')
        : t('controls.switch.turningOff')
      : isOn
        ? t('controls.common.on')
        : t('controls.common.off');
  const deviceClass = String(entity?.rawAttributes?.device_class ?? '').trim().toLowerCase();
  const deviceSearchText = `${entityId ?? ''} ${name}`.trim().toLowerCase();
  const isOutlet =
    deviceClass === 'outlet' ||
    ['outlet', 'socket', 'plug', 'presa'].some((token) => deviceSearchText.includes(token));
  const HeaderIcon = isOutlet ? Plug : ToggleRight;
  const deviceTypeLabel = isOutlet ? t('controls.switch.outlet') : t('controls.switch.switch');
  const consumptionValue =
    toFiniteNumber(consumptionEntity?.numericValue) ?? toFiniteNumber(consumptionEntity?.state);
  const consumptionUnit =
    consumptionEntity?.unit?.trim() ||
    String(consumptionEntity?.rawAttributes?.unit_of_measurement ?? '').trim();
  const consumptionName = String(consumptionEntity?.rawAttributes?.friendly_name ?? '').trim();
  const consumptionChartData = useMemo(() => {
    const historyValues = (consumptionHistory ?? []).filter((value) => Number.isFinite(value));
    if (historyValues.length < 2) {
      return [];
    }
    const visiblePoints = Math.max(2, Math.ceil((historyValues.length * historyHours) / 24));
    const values = historyValues.slice(-visiblePoints);
    return values.map((value, index) => ({ index, value }));
  }, [consumptionHistory, historyHours]);
  const consumptionAverage =
    consumptionChartData.length > 0
      ? consumptionChartData.reduce((sum, point) => sum + point.value, 0) / consumptionChartData.length
      : undefined;

  return (
    <div className={CONTEXT_PANEL_LAYOUT.shell}>
      <ContextPanelHeader
        title={name}
        subtitle={stateLabel}
        icon={<HeaderIcon size={21} />}
          fallbackTitle={t('controls.switch.switch')}
      />

      <div className={`${CONTEXT_PANEL_LAYOUT.section} mb-1`}>
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <span className="text-sm font-medium text-[color:var(--ui-text-secondary)]">{t('controls.common.status')}</span>
          <span className="text-xs font-semibold text-[color:var(--ui-text-tertiary)]">{stateLabel}</span>
        </div>
        <button
          type="button"
          onClick={onToggle}
          disabled={isUnavailable || isPending}
          className={`group flex min-h-[5rem] w-full items-center justify-between gap-4 rounded-[1.55rem] border px-4 text-left transition-all active:scale-[0.985] disabled:cursor-not-allowed ${
            isOn && !isUnavailable
              ? 'liquid-glass-selection border-[color:rgb(var(--ui-accent-rgb)/0.34)] shadow-[0_14px_35px_var(--ui-shadow-soft)]'
              : 'dashboard-content-surface-soft border-[color:var(--ui-border)]'
          } ${isUnavailable ? 'opacity-55' : 'hover:border-[color:var(--ui-border-strong)] hover:bg-[color:var(--ui-fill-secondary)]'}`}
          aria-label={isOn ? t('controls.switch.turnOff', { name }) : t('controls.switch.turnOn', { name })}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors ${
                isOn && !isUnavailable
                  ? 'border-[color:rgb(var(--ui-accent-rgb)/0.58)] bg-[color:var(--ui-accent)] text-[color:var(--ui-accent-contrast)] shadow-[0_8px_22px_rgb(var(--ui-accent-rgb)/0.22)]'
                  : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]'
              }`}
            >
              <HeaderIcon size={19} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-base font-semibold text-[color:var(--ui-text-primary)]">{stateLabel}</span>
              <span className="mt-0.5 block truncate text-xs text-[color:var(--ui-text-tertiary)]">{deviceTypeLabel}</span>
            </span>
          </span>
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors ${
              isOn && !isUnavailable
                ? 'border-[color:rgb(var(--ui-accent-rgb)/0.58)] bg-[color:var(--ui-accent)] text-[color:var(--ui-accent-contrast)]'
                : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]'
            }`}
          >
            <Power size={17} />
          </span>
        </button>
      </div>

      {consumptionEntityId ? (
        <div className={`${CONTEXT_PANEL_LAYOUT.section} mb-1`}>
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <span className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-[color:var(--ui-text-secondary)]">
              <Zap size={15} className="text-[color:var(--ui-warning)]" />
              {t(`controls.switch.${resolveConsumptionKind(consumptionEntity)}`)}
            </span>
            <span className="max-w-[9rem] truncate text-xs text-[color:var(--ui-text-tertiary)]">
              {consumptionName || consumptionEntityId}
            </span>
          </div>
          <div className="dashboard-content-surface-soft rounded-[1.55rem] px-4 py-5">
            {consumptionValue !== undefined ? (
              <div className="flex items-end gap-2">
                <span className="text-[2.65rem] font-light leading-none text-[color:var(--ui-text-primary)]">
                  {formatConsumptionValue(consumptionValue, formatNumber)}
                </span>
                {consumptionUnit ? (
                  <span className="pb-1 text-sm font-semibold text-[color:var(--ui-text-secondary)]">{consumptionUnit}</span>
                ) : null}
              </div>
            ) : (
              <p className="text-sm font-medium text-[color:var(--ui-text-secondary)]">{t('controls.switch.noData')}</p>
            )}
            <p className="mt-2 truncate text-xs text-[color:var(--ui-text-tertiary)]">{consumptionEntityId}</p>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 px-1">
            <span className="inline-flex min-w-0 items-center gap-2 text-xs font-semibold text-[color:var(--ui-text-tertiary)]">
              <Clock3 size={14} />
              {t('controls.switch.trend')}
            </span>
            <span className="shrink-0 text-xs font-semibold text-[color:var(--ui-text-secondary)]">
              {consumptionAverage !== undefined
                ? t('controls.switch.average', { value: `${formatConsumptionValue(consumptionAverage, formatNumber)}${consumptionUnit ? ` ${consumptionUnit}` : ''}` })
                : t('controls.switch.noAverage')}
            </span>
          </div>

          <GlassSegmentSelect<(typeof CONSUMPTION_HISTORY_WINDOWS)[number]>
            ariaLabel={t('controls.switch.historyRange')}
            className="mt-2"
            options={CONSUMPTION_HISTORY_WINDOWS.map((hours) => ({
              value: hours,
              label: `${hours}h`,
              ariaLabel: t('controls.switch.lastHours', { hours }),
            }))}
            value={historyHours}
            onChange={setHistoryHours}
            optionClassName="h-9"
          />

          <div className="dashboard-content-surface-soft mt-3 h-36 overflow-hidden rounded-[1.55rem] px-2 py-3">
            {consumptionChartData.length >= 2 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={consumptionChartData} margin={{ top: 8, right: 4, left: 4, bottom: 4 }}>
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="var(--ui-warning)"
                    strokeWidth={2.2}
                    fill="color-mix(in srgb, var(--ui-warning) 10%, transparent)"
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
      ) : null}
    </div>
  );
}
