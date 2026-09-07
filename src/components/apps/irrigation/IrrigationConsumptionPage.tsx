import {
  CalendarClock,
  ChevronRight,
  CircleGauge,
  Droplets,
  Gauge,
  RefreshCw,
  Settings2,
  Sprout,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import GlassSegmentSelect from '../../ui/GlassSegmentSelect';
import type { IrrigationConsumptionPeriod, IrrigationConsumptionPoint } from './irrigationConsumptionModel';
import { useI18n } from '../../../i18n/I18nProvider';

type ConsumptionStatus = 'loading' | 'available' | 'empty' | 'insufficient' | 'error' | 'offline';

export type IrrigationZoneConsumption = {
  id: string;
  name: string;
  liters: number | null;
  share: number;
  plannedMinutes: number;
};

type IrrigationConsumptionPageProps = {
  period: IrrigationConsumptionPeriod;
  onPeriodChange: (period: IrrigationConsumptionPeriod) => void;
  status: ConsumptionStatus;
  totalLiters: number | null;
  dailyAverageLiters: number | null;
  comparisonPct: number | null;
  points: IrrigationConsumptionPoint[];
  zones: IrrigationZoneConsumption[];
  configuredZones: number;
  plannedMinutes: number;
  dataSourceLabel: string;
  isRefreshing?: boolean;
  isStale?: boolean;
  updatedAt?: number | null;
  isEstimatedBreakdown: boolean;
  onOpenSettings?: () => void;
  onManageZones?: () => void;
};

function formatLiters(value: number | null, compact = false, locale = 'it') {
  if (value === null || !Number.isFinite(value)) return 'N/D';
  return `${value.toLocaleString(locale, { maximumFractionDigits: compact ? 0 : 1 })} L`;
}

function SummaryCard({ icon: Icon, eyebrow, value, detail, tone = 'lime', loading = false }: {
  icon: typeof Droplets;
  eyebrow: string;
  value: string;
  detail: string;
  tone?: 'lime' | 'cyan' | 'neutral';
  loading?: boolean;
}) {
  const { t } = useI18n();
  const iconClass = tone === 'lime' ? 'text-lime-500' : tone === 'cyan' ? 'text-cyan-500' : 'text-[color:var(--ui-text-secondary)]';
  return (
    <article className="rounded-[1.5rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] p-4 shadow-[var(--ui-shadow-card)] sm:p-5">
      <div className="flex items-center gap-2.5">
        <Icon className={`h-4 w-4 ${iconClass}`} />
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--ui-text-tertiary)]">{eyebrow}</p>
      </div>
      {loading ? (
        <>
          <span className="mt-4 block h-7 w-24 animate-pulse rounded-full bg-[color:var(--ui-fill-secondary)]" aria-label={t('irrigation.consumption.loadingValue')} />
          <span className="mt-2 block h-3 w-32 animate-pulse rounded-full bg-[color:var(--ui-fill-tertiary)]" />
        </>
      ) : (
        <>
          <p className="mt-4 text-2xl font-semibold tracking-[-0.045em] text-[color:var(--ui-text-primary)]">{value}</p>
          <p className="mt-1 text-xs text-[color:var(--ui-text-secondary)]">{detail}</p>
        </>
      )}
    </article>
  );
}

function EmptyConsumption({ status, onOpenSettings }: Pick<IrrigationConsumptionPageProps, 'status' | 'onOpenSettings'>) {
  const { t } = useI18n();
  if (status === 'loading') {
    return (
      <div className="flex min-h-[17rem] items-end gap-2 rounded-[1.4rem] bg-[color:var(--ui-fill-tertiary)] px-5 pb-5 pt-12" aria-label={t('irrigation.consumption.loadingChart')}>
        {[38, 64, 48, 82, 56, 72, 44, 68].map((height, index) => (
          <span key={`${height}-${index}`} className="min-w-0 flex-1 animate-pulse rounded-t-xl bg-[color:var(--ui-fill-secondary)]" style={{ height: `${height}%`, animationDelay: `${index * 55}ms` }} />
        ))}
      </div>
    );
  }
  const title = status === 'insufficient'
      ? t('irrigation.consumption.insufficient')
    : status === 'offline'
      ? t('irrigation.consumption.offline')
      : status === 'error'
        ? t('irrigation.consumption.historyUnavailable')
        : t('irrigation.consumption.connectMeter');
  const description = status === 'insufficient'
      ? t('irrigation.consumption.insufficientDescription')
    : status === 'empty'
      ? t('irrigation.consumption.emptyDescription')
      : t('irrigation.consumption.retryDescription');
  return (
    <div className="flex min-h-[17rem] flex-col items-center justify-center rounded-[1.4rem] border border-dashed border-[color:var(--ui-border)] px-6 text-center">
      <span className="liquid-glass-control flex h-12 w-12 items-center justify-center rounded-full">
        <Droplets className="h-5 w-5 text-[color:var(--ui-text-secondary)]" />
      </span>
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-xs leading-5 text-[color:var(--ui-text-secondary)]">{description}</p>
      {status === 'empty' && onOpenSettings ? (
        <button type="button" onClick={onOpenSettings} className="liquid-glass-control mt-4 inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-xs font-semibold">
          <Settings2 className="h-4 w-4" /> {t('irrigation.consumption.configureMeter')}
        </button>
      ) : null}
    </div>
  );
}

export default function IrrigationConsumptionPage({
  period,
  onPeriodChange,
  status,
  totalLiters,
  dailyAverageLiters,
  comparisonPct,
  points,
  zones,
  configuredZones,
  plannedMinutes,
  dataSourceLabel,
  isRefreshing = false,
  isStale = false,
  updatedAt = null,
  isEstimatedBreakdown,
  onOpenSettings,
  onManageZones,
}: IrrigationConsumptionPageProps) {
  const { locale, t } = useI18n();
  const periodOptions = [
    { value: '7d', label: t('irrigation.consumption.period7') },
    { value: '30d', label: t('irrigation.consumption.period30') },
    { value: '12m', label: t('irrigation.consumption.period12m') },
  ] as const;
  const maxPoint = Math.max(1, ...points.map((point) => point.value));
  const comparisonPositive = comparisonPct !== null && comparisonPct <= 0;
  const ComparisonIcon = comparisonPositive ? TrendingDown : TrendingUp;
  const comparisonValue = comparisonPct === null ? 'N/D' : `${comparisonPct > 0 ? '+' : ''}${comparisonPct}%`;
  const isInitialLoading = status === 'loading';
  const updatedLabel = updatedAt
    ? new Date(updatedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="mx-auto w-full max-w-[92rem] pb-[calc(env(safe-area-inset-bottom)+5rem)] md:pb-1">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-h-5 items-center gap-2 text-xs text-[color:var(--ui-text-secondary)]">
          {isRefreshing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
          <span>{isRefreshing ? t('irrigation.consumption.updatingBackground') : isStale ? t('irrigation.consumption.latest', { time: updatedLabel ? ` · ${updatedLabel}` : '' }) : t('irrigation.consumption.selectPeriod')}</span>
        </div>
        <GlassSegmentSelect
          value={period}
          onChange={onPeriodChange}
          options={periodOptions}
          ariaLabel={t('irrigation.consumption.periodA11y')}
          className="w-full sm:w-[22rem]"
          optionClassName="!h-9 !px-2"
        />
      </div>

      <section className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard icon={Droplets} eyebrow={t('irrigation.usage.water')} value={formatLiters(totalLiters, true, locale)} detail={dataSourceLabel} loading={isInitialLoading} />
        <SummaryCard icon={Gauge} eyebrow={t('irrigation.consumption.dailyAverage')} value={formatLiters(dailyAverageLiters, false, locale)} detail={t('irrigation.consumption.selectedPeriod')} tone="cyan" loading={isInitialLoading} />
        <SummaryCard icon={ComparisonIcon} eyebrow={t('irrigation.consumption.comparison')} value={comparisonValue} detail={comparisonPct === null ? t('irrigation.consumption.averageMissing') : comparisonPositive ? t('irrigation.consumption.lower') : t('irrigation.consumption.higher')} tone={comparisonPositive ? 'lime' : 'neutral'} loading={isInitialLoading} />
      </section>

      <section className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-12">
        <article className="rounded-[1.65rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] p-4 shadow-[var(--ui-shadow-card)] sm:p-5 xl:col-span-8">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--ui-text-tertiary)]">{t('irrigation.consumption.trend')}</p>
              <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em]">{t('irrigation.consumption.distribution')}</h2>
            </div>
            {status === 'available' ? <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${isStale ? 'bg-amber-500/12 text-amber-700 dark:text-amber-300' : 'bg-lime-500/12 text-lime-700 dark:text-lime-300'}`}>{isRefreshing ? <RefreshCw className="h-3 w-3 animate-spin" /> : null}{isRefreshing ? t('irrigation.consumption.updating') : isStale ? t('irrigation.consumption.cache') : t('irrigation.consumption.haData')}</span> : null}
          </div>
          {status !== 'available' || points.length === 0 ? (
            <div className="mt-4"><EmptyConsumption status={status} onOpenSettings={onOpenSettings} /></div>
          ) : (
            <div className="mt-6">
              <div className="flex h-56 items-end gap-1.5 sm:gap-2" aria-label={t('irrigation.consumption.chartA11y')}>
                {points.map((point) => (
                  <div key={point.key} className="group flex h-full min-w-0 flex-1 flex-col justify-end">
                    <div className="relative flex min-h-0 flex-1 items-end">
                      <span className="absolute bottom-full left-1/2 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-full bg-[color:var(--ui-text-primary)] px-2 py-1 text-[9px] font-semibold text-[color:var(--ui-bg-canvas)] group-hover:block">{formatLiters(point.value, false, locale)}</span>
                      <span className="block w-full rounded-t-xl bg-[linear-gradient(180deg,rgba(132,204,22,0.95),rgba(34,197,94,0.4))] transition-[height] duration-500" style={{ height: `${Math.max(4, (point.value / maxPoint) * 100)}%` }} />
                    </div>
                    <span className="mt-2 truncate text-center text-[8px] font-semibold uppercase text-[color:var(--ui-text-tertiary)]">{point.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </article>

        <article className="rounded-[1.65rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] p-4 shadow-[var(--ui-shadow-card)] sm:p-5 xl:col-span-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--ui-text-tertiary)]">{t('irrigation.consumption.byZone')}</p>
              <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em]">{t('irrigation.consumption.where')}</h2>
            </div>
            {isEstimatedBreakdown ? <span className="rounded-full bg-amber-500/12 px-2.5 py-1 text-[9px] font-semibold text-amber-700 dark:text-amber-300">{t('irrigation.consumption.estimate')}</span> : null}
          </div>
          <div className="mt-5 space-y-4">
            {zones.length ? zones.map((zone) => (
              <div key={zone.id}>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate font-semibold">{zone.name}</span>
                  <span className="shrink-0 text-[color:var(--ui-text-secondary)]">{formatLiters(zone.liters, true, locale)} · {zone.share}%</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color:var(--ui-fill-tertiary)]"><span className="block h-full rounded-full bg-lime-500" style={{ width: `${Math.max(zone.share > 0 ? 4 : 0, zone.share)}%` }} /></div>
                <p className="mt-1 text-[9px] text-[color:var(--ui-text-tertiary)]">{t('irrigation.consumption.plannedWeek', { minutes: zone.plannedMinutes })}</p>
              </div>
            )) : (
              <button type="button" onClick={onManageZones} disabled={!onManageZones} className="flex min-h-36 w-full flex-col items-center justify-center rounded-[1.25rem] border border-dashed border-[color:var(--ui-border)] px-4 text-center disabled:cursor-default">
                <Sprout className="h-5 w-5 text-[color:var(--ui-text-secondary)]" />
                <span className="mt-2 text-sm font-semibold">{t('irrigation.consumption.configureZones')}</span>
                <span className="mt-1 text-[10px] text-[color:var(--ui-text-secondary)]">{t('irrigation.consumption.breakdownHere')}</span>
              </button>
            )}
          </div>
          {isEstimatedBreakdown && zones.length ? <p className="mt-5 border-t border-[color:var(--ui-border)] pt-3 text-[10px] leading-4 text-[color:var(--ui-text-tertiary)]">{t('irrigation.consumption.estimateNote')}</p> : null}
        </article>
      </section>

      <section className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard icon={CalendarClock} eyebrow={t('irrigation.consumption.planned')} value={`${plannedMinutes} min`} detail={t('irrigation.consumption.everyWeek')} tone="neutral" />
        <SummaryCard icon={Sprout} eyebrow={t('irrigation.consumption.connectedZones')} value={`${configuredZones}`} detail={t('irrigation.consumption.haCommand')} tone="lime" />
        <SummaryCard icon={CircleGauge} eyebrow={t('irrigation.consumption.coverage')} value={status === 'available' ? t('irrigation.consumption.active') : t('irrigation.consumption.incomplete')} detail={status === 'available' ? t('irrigation.consumption.historyReady') : t('irrigation.consumption.openSettings')} tone="cyan" />
        <button type="button" onClick={onOpenSettings} disabled={!onOpenSettings} className="group rounded-[1.5rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] p-4 text-left shadow-[var(--ui-shadow-card)] disabled:cursor-default sm:p-5">
          <Settings2 className="h-4 w-4 text-[color:var(--ui-text-secondary)]" />
          <p className="mt-4 text-sm font-semibold">{t('irrigation.consumption.sources')}</p>
          <p className="mt-1 text-xs text-[color:var(--ui-text-secondary)]">{onOpenSettings ? t('irrigation.consumption.configureSources') : t('irrigation.consumption.adminOnly')}</p>
          {onOpenSettings ? <ChevronRight className="mt-3 h-4 w-4 text-[color:var(--ui-text-tertiary)] transition-transform group-hover:translate-x-1" /> : null}
        </button>
      </section>
    </div>
  );
}
