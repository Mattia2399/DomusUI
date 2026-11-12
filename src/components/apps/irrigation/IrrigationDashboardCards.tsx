import type { LucideIcon } from 'lucide-react';
import { ChevronRight, Clock3, LoaderCircle, Minus, Play, Plus, Square } from 'lucide-react';
import { useCan } from '../../../security/AccessControlProvider';
import { IRRIGATION_ABSOLUTE_MAX_DURATION_MIN } from './irrigationConfigurationModel';
import { useI18n } from '../../../i18n/I18nProvider';

export type IrrigationZoneCardModel = {
  id: string;
  name: string;
  detail: string;
  status: string;
  progress: number;
  icon: LucideIcon;
  manualDurationMin: number;
  maximumManualDurationMin?: number;
  manualRemainingSeconds: number;
  isManualActive: boolean;
  manualSessionState?: 'queued' | 'opening' | 'running' | 'closing' | 'paused';
  isCommandPending?: boolean;
  entityId: string;
};

type ZoneCardProps = {
  zone: IrrigationZoneCardModel;
  onProgram: () => void;
  onDurationChange: (value: number) => void;
  onManualToggle: () => void;
};

export function IrrigationZoneCard({ zone, onProgram, onDurationChange, onManualToggle }: ZoneCardProps) {
  // irrigation.control: without it the state shows and no command is offered.
  const canControl = useCan('irrigation.control');
  const { t } = useI18n();
  const Icon = zone.icon;
  const isAlert = zone.status === 'alert';
  const isActive = zone.status === 'active';
  const isScheduled = zone.status === 'scheduled';
  const incomplete = !zone.entityId;
  const accent = isAlert ? '#fb7185' : isScheduled ? '#f59e0b' : '#65a30d';
  const progress = zone.isManualActive ? zone.progress : isActive ? Math.max(12, zone.progress) : 0;
  const hasSession = zone.isManualActive;
  const remainingMinutes = Math.floor(zone.manualRemainingSeconds / 60);
  const remainingSeconds = Math.max(0, zone.manualRemainingSeconds % 60);
  const remainingLabel = `${remainingMinutes}:${String(remainingSeconds).padStart(2, '0')}`;

  return (
    <article className="flex min-h-[12.25rem] flex-col rounded-[1.45rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] p-3.5 text-[color:var(--ui-text-primary)] shadow-[var(--ui-shadow-card)] sm:min-h-[13rem] sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-lime-500/12 text-lime-700 dark:text-lime-300">
          <Icon className="h-[1.15rem] w-[1.15rem]" />
        </span>
        <span className="mt-1 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accent, boxShadow: `0 0 12px ${accent}` }} aria-label={zone.status} />
      </div>

      <div className="mt-3 min-w-0">
        <h3 className="truncate text-sm font-semibold sm:text-base">{zone.name}</h3>
        <p className="mt-1 line-clamp-2 min-h-8 text-[10px] leading-4 text-[color:var(--ui-text-secondary)] sm:text-[11px]">{incomplete ? t('irrigation.zone.configure') : zone.detail}</p>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[color:var(--ui-fill-secondary)]">
        <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${progress}%`, backgroundColor: accent }} />
      </div>

      <div className="mt-auto flex items-center gap-1.5 pt-3">
        <button
          type="button"
          onClick={onProgram}
          disabled={incomplete}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)] disabled:opacity-35"
          aria-label={t('irrigation.zone.program', { name: zone.name })}
        >
          <Clock3 className="h-3.5 w-3.5" />
        </button>
        {canControl ? (
        <>
        <div className="flex h-9 min-w-0 flex-1 items-center justify-between rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-1">
          <button type="button" onClick={() => onDurationChange(zone.manualDurationMin - 1)} disabled={zone.manualDurationMin <= 1 || isAlert || hasSession} className="flex h-7 w-7 items-center justify-center rounded-full disabled:opacity-30" aria-label={t('irrigation.zone.timerDecrease', { name: zone.name })}>
            <Minus className="h-3 w-3" />
          </button>
          <span className="text-[10px] font-semibold tabular-nums">{hasSession ? remainingLabel : `${zone.manualDurationMin}m`}</span>
          <button type="button" onClick={() => onDurationChange(zone.manualDurationMin + 1)} disabled={zone.manualDurationMin >= (zone.maximumManualDurationMin ?? IRRIGATION_ABSOLUTE_MAX_DURATION_MIN) || isAlert || hasSession} className="flex h-7 w-7 items-center justify-center rounded-full disabled:opacity-30" aria-label={t('irrigation.zone.timerIncrease', { name: zone.name })}>
            <Plus className="h-3 w-3" />
          </button>
        </div>
        <button
          type="button"
          onClick={onManualToggle}
          disabled={isAlert || incomplete || zone.isCommandPending}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white shadow-sm disabled:opacity-35 ${zone.isManualActive ? 'bg-rose-500' : 'bg-lime-600'}`}
          aria-label={zone.isCommandPending ? t('irrigation.zone.pending', { name: zone.name }) : hasSession ? t('irrigation.zone.stopReset', { name: zone.name }) : t('irrigation.zone.start', { name: zone.name })}
          title={hasSession ? t('irrigation.zone.stopReset', { name: zone.name }) : undefined}
        >
          {zone.isCommandPending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : zone.isManualActive ? <Square className="h-3.5 w-3.5" fill="currentColor" /> : <Play className="ml-0.5 h-3.5 w-3.5" fill="currentColor" />}
        </button>
        </>
        ) : null}
      </div>
    </article>
  );
}

type UsageCardProps = {
  usage: number | null;
  average: number | null;
  savingsLabel: string | null;
  positiveSavings: boolean;
  bars: readonly number[];
};

type ZonesSnapshotCardProps = {
  zones: IrrigationZoneCardModel[];
  nextCycleLabel: string;
  onOpen: () => void;
};

export function IrrigationZonesSnapshotCard({ zones, nextCycleLabel, onOpen }: ZonesSnapshotCardProps) {
  const { t } = useI18n();
  const activeCount = zones.filter((zone) => zone.status === 'active' || zone.isManualActive).length;
  const alertCount = zones.filter((zone) => zone.status === 'alert').length;
  const visibleZones = zones.slice(0, 5);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-full min-h-[11.5rem] w-full flex-col rounded-[1.65rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] p-4 text-left text-[color:var(--ui-text-primary)] shadow-[var(--ui-shadow-card)] transition-transform active:scale-[0.99] sm:p-5"
      aria-label={t('irrigation.zones.open')}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--ui-text-tertiary)]">{t('irrigation.zones.eyebrow')}</p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.035em]">{t('irrigation.zones.title')}</h2>
        </div>
        <span className="rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-2.5 py-1 text-[10px] font-semibold text-[color:var(--ui-text-secondary)]">{zones.length}</span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 xl:grid-cols-5">
        {visibleZones.map((zone, index) => {
          const Icon = zone.icon;
          const tone = zone.status === 'alert' ? '#fb7185' : zone.status === 'active' || zone.isManualActive ? '#65a30d' : '#94a3b8';
          const statusLabel = zone.status === 'alert' ? t('irrigation.zones.attention') : zone.status === 'active' || zone.isManualActive ? t('irrigation.zones.running') : t('irrigation.zones.waiting');
          return (
            <span key={zone.id} className={`${index > 2 ? 'hidden xl:flex' : 'flex'} min-w-0 flex-col rounded-[1.05rem] bg-[color:var(--ui-fill-tertiary)] px-2.5 py-2.5 xl:min-h-[5.75rem]`}>
              <span className="flex items-center justify-between gap-1.5">
                <Icon className="h-3.5 w-3.5 text-lime-700 dark:text-lime-300" />
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tone, boxShadow: `0 0 9px ${tone}` }} />
              </span>
              <span className="mt-2 block truncate text-[10px] font-semibold xl:text-xs">{zone.name}</span>
              <span className="mt-auto hidden truncate pt-1 text-[9px] text-[color:var(--ui-text-tertiary)] xl:block">{statusLabel}</span>
            </span>
          );
        })}
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 pt-3">
        <div className="min-w-0">
          <p className="truncate text-[10px] text-[color:var(--ui-text-tertiary)]">{t('irrigation.zones.next')}</p>
          <p className="mt-0.5 truncate text-xs font-semibold">{nextCycleLabel}</p>
        </div>
        <p className="shrink-0 text-[10px] font-semibold text-[color:var(--ui-text-secondary)]">
          {activeCount ? t(activeCount === 1 ? 'irrigation.zones.activeOne' : 'irrigation.zones.activeMany', { count: activeCount }) : t('irrigation.zones.allStopped')}{alertCount ? ` · ${t('irrigation.zones.alerts', { count: alertCount })}` : ''}
        </p>
      </div>
    </button>
  );
}

export type IrrigationScheduleSnapshotItem = {
  id: string;
  name: string;
  when: string;
  durationMin: number;
};

type ScheduleSnapshotCardProps = {
  items: IrrigationScheduleSnapshotItem[];
  onOpen: () => void;
};

export function IrrigationScheduleSnapshotCard({ items, onOpen }: ScheduleSnapshotCardProps) {
  const { t } = useI18n();
  const visibleItems = items.slice(0, 3);

  return (
    <section className="space-y-3" aria-label={t('irrigation.schedule.next')}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[1.4rem] font-bold tracking-[-0.02em] text-[color:var(--ui-text-primary)]">{t('irrigation.today.upcoming')}</h2>
        <button type="button" onClick={onOpen} className="text-sm font-semibold text-[color:var(--app-workspace-accent)]">{t('irrigation.today.calendarLink')}</button>
      </div>
      <div className="liquid-glass-panel !rounded-[1.5rem] divide-y divide-[color:var(--ui-separator)] overflow-hidden">
        {visibleItems.length ? visibleItems.map((item) => (
          <button key={item.id} type="button" onClick={onOpen} aria-label={t('irrigation.today.openCycle', { name: item.name })} className="flex min-h-[3.65rem] w-full items-center gap-3 px-4 text-left transition-colors hover:bg-[color:var(--ui-fill-tertiary)]">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.65rem] bg-[color:var(--app-workspace-accent)] text-white"><Clock3 className="h-[1.1rem] w-[1.1rem]" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1 py-2">
              <span className="block truncate text-base font-semibold text-[color:var(--ui-text-primary)]">{item.name}</span>
              <span className="block truncate text-xs font-medium text-[color:var(--ui-text-secondary)]">{item.when} · {item.durationMin} min</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--ui-text-tertiary)]" aria-hidden="true" />
          </button>
        )) : <p className="px-4 py-5 text-sm text-[color:var(--ui-text-secondary)]">{t('irrigation.schedule.empty')}</p>}
      </div>
    </section>
  );
}

type ConsumptionSnapshotCardProps = UsageCardProps & {
  onOpen: () => void;
  loading?: boolean;
};

export function IrrigationConsumptionSnapshotCard({
  usage,
  average,
  savingsLabel,
  positiveSavings,
  bars,
  onOpen,
  loading = false,
}: ConsumptionSnapshotCardProps) {
  const { t, formatNumber } = useI18n();
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-full min-h-[11.5rem] w-full flex-col rounded-[1.65rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] p-4 text-left text-[color:var(--ui-text-primary)] shadow-[var(--ui-shadow-card)] transition-transform active:scale-[0.99] sm:p-5"
      aria-label={t('irrigation.usage.open')}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--ui-text-tertiary)]">{t('irrigation.usage.week')}</p>
          <p className="mt-1 text-2xl font-semibold tracking-[-0.045em]">{loading ? <span className="inline-block h-7 w-24 animate-pulse rounded-lg bg-[color:var(--ui-fill-secondary)]" aria-label={t('irrigation.consumption.loadingValue')} /> : usage === null ? 'N/D' : `${formatNumber(usage)} L`}</p>
        </div>
        {savingsLabel ? <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${positiveSavings ? 'bg-lime-500/14 text-lime-700 dark:text-lime-300' : 'bg-rose-500/14 text-rose-600 dark:text-rose-300'}`}>{savingsLabel}</span> : null}
      </div>

      <div className="mt-4 flex h-[4.75rem] shrink-0 flex-col" aria-hidden="true">
        <div className="flex min-h-0 flex-1 items-end gap-1.5">
          {loading ? [35, 58, 44, 76, 52, 68, 40].map((value, index) => (
            <span key={`loading-${index}`} className="block min-w-0 flex-1 animate-pulse rounded-full bg-[color:var(--ui-fill-secondary)]" style={{ height: `${value}%` }} />
          )) : bars.length ? bars.map((value, index) => (
            <span key={`${value}-${index}`} className="block min-w-0 flex-1 rounded-full bg-lime-500/25" style={{ height: `${Math.max(14, value)}%`, opacity: index === 3 ? 1 : 0.55 }} />
          )) : <span className="m-auto text-[10px] text-[color:var(--ui-text-tertiary)]">N/D</span>}
        </div>
        <div className="mt-2 hidden grid-cols-7 text-center text-[8px] font-semibold text-[color:var(--ui-text-tertiary)] xl:grid">
          {['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
        </div>
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 pt-3">
        <div><p className="text-[10px] text-[color:var(--ui-text-tertiary)]">{t('irrigation.usage.averageWeek')}</p><p className="mt-0.5 text-xs font-semibold">{loading ? '—' : average === null ? 'N/D' : `${formatNumber(average)} L`}</p></div>
        <span className="text-[10px] font-semibold text-[color:var(--app-workspace-accent)]">{t('irrigation.usage.openDetail')}</span>
      </div>
    </button>
  );
}

export function IrrigationUsageCard({ usage, average, savingsLabel, positiveSavings, bars }: UsageCardProps) {
  const { t, formatNumber } = useI18n();
  const usageVsAverage = usage === null || average === null ? null : Math.max(
    0,
    Math.min(999, Math.round((usage / Math.max(average, 1)) * 100)),
  );
  return (
    <div className="h-full rounded-[1.65rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] p-4 text-[color:var(--ui-text-primary)] shadow-[var(--ui-shadow-card)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--ui-text-tertiary)]">{t('irrigation.usage.weekly')}</p>
          <p className="mt-1 text-2xl font-semibold tracking-[-0.04em]">{usageVsAverage === null ? 'N/D' : `${usageVsAverage}%`}</p>
          <p className="text-[10px] text-[color:var(--ui-text-muted)]">{t('irrigation.usage.ofAverage')}</p>
        </div>
        {savingsLabel ? <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${positiveSavings ? 'bg-lime-500/14 text-lime-700 dark:text-lime-300' : 'bg-rose-500/14 text-rose-600 dark:text-rose-300'}`}>
          {savingsLabel}
        </span> : null}
      </div>
      <div className="mt-4 flex h-14 items-end gap-1">
        {bars.map((value, index) => (
          <span key={`${value}-${index}`} className="block min-w-0 flex-1 rounded-full bg-lime-500/25" style={{ height: `${Math.max(14, value)}%`, opacity: index === 3 ? 1 : 0.55 }} />
        ))}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] text-[color:var(--ui-text-tertiary)]">{t('irrigation.usage.water')}</p>
          <p className="mt-0.5 text-lg font-semibold">{usage === null ? 'N/D' : `${formatNumber(usage)} L`}</p>
        </div>
        <p className="text-right text-[10px] text-[color:var(--ui-text-secondary)]">{t('irrigation.usage.averageWeek')}<br />{average === null ? 'N/D' : `${formatNumber(average)} L`}</p>
      </div>
    </div>
  );
}
