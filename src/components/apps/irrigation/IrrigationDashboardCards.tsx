import type { LucideIcon } from 'lucide-react';
import {
  CalendarDays,
  ChevronRight,
  CloudRain,
  Clock3,
  Droplets,
  LoaderCircle,
  Minus,
  Pause,
  Play,
  Plus,
  Settings2,
  Square,
  Thermometer,
} from 'lucide-react';
import GlassToggle from '../../ui/GlassToggle';
import { IRRIGATION_ABSOLUTE_MAX_DURATION_MIN } from './irrigationConfigurationModel';
import { useI18n } from '../../../i18n/I18nProvider';

const IRRIGATION_HERO_IMAGE = new URL(
  '../../../assets/irrigation-smart-hero.jpg',
  import.meta.url,
).href;

type IrrigationHeroProps = {
  masterTitle: string;
  masterIsRunning: boolean;
  masterIsStopped: boolean;
  temperature: number;
  humidity: number;
  rainProbability?: number;
  rainStatusLabel: string;
  rainSummaryTitle: string;
  rainSummaryDescription: string;
  rainSensorEnabled: boolean;
  rainSensorSyncing: boolean;
  onRainSensorToggle: () => void;
  onPrimaryAction: () => void;
  onStop: () => void;
};

export function IrrigationHero({
  masterTitle,
  masterIsRunning,
  masterIsStopped,
  temperature,
  humidity,
  rainProbability,
  rainStatusLabel,
  rainSummaryTitle,
  rainSummaryDescription,
  rainSensorEnabled,
  rainSensorSyncing,
  onRainSensorToggle,
  onPrimaryAction,
  onStop,
}: IrrigationHeroProps) {
  const { t } = useI18n();
  return (
    <div
      data-testid="irrigation-progressive-hero"
      className="relative flex h-[52svh] min-h-[25rem] max-h-[28.75rem] flex-col overflow-hidden rounded-none text-white md:h-auto md:max-h-none md:min-h-[28rem] md:rounded-[2rem]"
    >
      <img
        src={IRRIGATION_HERO_IMAGE}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover object-center [will-change:transform] motion-reduce:!transform-none md:!transform-none"
        style={{
          transform: 'translate3d(0, calc(var(--irrigation-scroll-progress) * 18px), 0) scale(calc(1.045 - var(--irrigation-scroll-progress) * 0.045))',
          transformOrigin: 'center top',
        }}
      />
      <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,17,9,0.14)_5%,rgba(4,17,9,0.2)_38%,rgba(4,17,9,0.9)_100%)]" />
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_78%_16%,rgba(190,242,100,0.18),transparent_36%)]" />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black motion-reduce:hidden md:hidden"
        style={{ opacity: 'calc(var(--irrigation-scroll-progress) * 0.5)' }}
      />

      <div className="relative z-10 flex flex-1 flex-col px-4 pb-5 pt-[calc(env(safe-area-inset-top)+1.25rem)] sm:p-7 lg:p-8">
        <div
          data-testid="irrigation-progressive-header"
          className="flex items-end justify-between gap-4 motion-reduce:!opacity-100 motion-reduce:!transform-none md:!opacity-100 md:!transform-none"
          style={{
            opacity: 'calc(1 - var(--irrigation-scroll-progress) * 1.15)',
            transform: 'translate3d(0, calc(var(--irrigation-scroll-progress) * -24px), 0)',
          }}
        >
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">{t('irrigation.hero.eyebrow')}</p>
            <h1 className="mt-1 text-[2rem] font-semibold leading-none tracking-[-0.045em] sm:text-[2.7rem]">
              {masterIsRunning ? t('irrigation.hero.running') : t('irrigation.hero.ready')}
            </h1>
            <p className="mt-2 line-clamp-1 text-xs text-white/72 sm:text-sm">{rainSummaryTitle}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[2.55rem] font-light leading-none tracking-[-0.06em] sm:text-5xl">{`${temperature.toFixed(0)}°`}</p>
            <p className="mt-1 text-[11px] font-medium text-white/75">{rainStatusLabel}</p>
          </div>
        </div>

        <div className="mt-auto hidden pt-5 md:block">
          <div className="grid grid-cols-3 gap-2">
            <HeroMetric icon={Thermometer} label={t('irrigation.metric.temperature')} value={`${temperature.toFixed(1)}°C`} />
            <HeroMetric icon={Droplets} label={t('irrigation.metric.humidity')} value={`${humidity}%`} />
            <HeroMetric icon={CloudRain} label={t('irrigation.metric.rain')} value={rainProbability === undefined ? 'N/D' : `${rainProbability}%`} />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[1.5rem] border border-white/18 bg-black/28 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-2xl sm:p-4">
          <div className="order-1 min-w-0 flex-1 px-1">
            <p className="truncate text-sm font-semibold">{masterTitle}</p>
            <p className="mt-0.5 truncate text-[10px] text-white/60">
              {masterIsRunning ? t('irrigation.manual.running') : t('irrigation.manual.ready')}
            </p>
          </div>
          <div className="order-4 mt-1 flex w-full items-center justify-between gap-3 border-t border-white/12 pt-3">
            <div className="min-w-0">
              <p className="truncate text-[10px] font-semibold text-white/75">{t('irrigation.rain.protection')}</p>
              <p className="mt-0.5 truncate text-[9px] text-white/50">
                {rainSensorEnabled ? t('irrigation.rain.active') : t('irrigation.rain.disabled')}
              </p>
            </div>
            <GlassToggle
              checked={rainSensorEnabled}
              label={t('irrigation.rain.toggle')}
              onChange={onRainSensorToggle}
              busy={rainSensorSyncing}
              size="compact"
            />
          </div>
          {!masterIsStopped ? (
            <button
              type="button"
              onClick={onStop}
              className="order-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-rose-200/30 bg-rose-500/75 text-white shadow-[0_8px_22px_rgba(190,24,93,0.3)] transition-transform active:scale-95"
              aria-label={t('irrigation.action.stop')}
            >
              <Square className="h-4 w-4" fill="currentColor" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onPrimaryAction}
            aria-pressed={masterIsRunning}
            className="order-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-lime-100/40 bg-lime-300 text-[#16320d] shadow-[0_8px_24px_rgba(163,230,53,0.3)] transition-transform active:scale-95"
            aria-label={masterIsRunning ? t('irrigation.action.pause') : t('irrigation.action.start')}
          >
            {masterIsRunning ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="ml-0.5 h-4 w-4" fill="currentColor" />}
          </button>
          </div>

          <p className="mt-3 line-clamp-2 px-1 text-[11px] leading-4 text-white/55 sm:text-xs">
            {rainSummaryDescription}
          </p>
        </div>
      </div>
    </div>
  );
}

export function IrrigationMobileOverview({
  masterTitle,
  masterIsRunning,
  masterIsStopped,
  temperature,
  humidity,
  rainProbability,
  rainSensorEnabled,
  rainSensorSyncing,
  onRainSensorToggle,
  onPrimaryAction,
  onStop,
  onConfigure,
}: IrrigationHeroProps & { onConfigure?: () => void }) {
  const { t } = useI18n();
  return (
    <div data-testid="irrigation-mobile-overview" className="space-y-3 md:hidden">
      <section className="rounded-[1.55rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] p-4 text-[color:var(--ui-text-primary)] shadow-[var(--ui-shadow-card)]">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--ui-text-tertiary)]">{t('irrigation.system')}</p>
              {onConfigure ? (
                <button type="button" onClick={onConfigure} className="liquid-glass-control flex h-8 w-8 shrink-0 items-center justify-center rounded-full" aria-label={t('irrigation.configure')}>
                  <Settings2 className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
            <h2 className="mt-1 truncate text-lg font-semibold tracking-[-0.03em]">{masterTitle}</h2>
            <p className="mt-0.5 truncate text-[10px] text-[color:var(--ui-text-secondary)]">
              {masterIsRunning ? t('irrigation.manual.running') : t('irrigation.manual.ready')}
            </p>
          </div>
          {!masterIsStopped ? (
            <button
              type="button"
              onClick={onStop}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-rose-400/25 bg-rose-500/85 text-white shadow-[0_8px_22px_rgba(190,24,93,0.2)] transition-transform active:scale-95"
              aria-label={t('irrigation.action.stop')}
            >
              <Square className="h-4 w-4" fill="currentColor" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onPrimaryAction}
            aria-pressed={masterIsRunning}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-lime-500/30 bg-lime-400 text-[#16320d] shadow-[0_8px_24px_rgba(132,204,22,0.24)] transition-transform active:scale-95"
            aria-label={masterIsRunning ? t('irrigation.action.pause') : t('irrigation.action.start')}
          >
            {masterIsRunning ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="ml-0.5 h-4 w-4" fill="currentColor" />}
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-[color:var(--ui-separator)] pt-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">{t('irrigation.rain.protection')}</p>
            <p className="mt-0.5 truncate text-[10px] text-[color:var(--ui-text-secondary)]">
              {rainSensorEnabled ? t('irrigation.rain.active') : t('irrigation.rain.disabled')}
            </p>
          </div>
          <GlassToggle
            checked={rainSensorEnabled}
            label={t('irrigation.rain.toggle')}
            onChange={onRainSensorToggle}
            busy={rainSensorSyncing}
            size="compact"
          />
        </div>
      </section>

      <div className="grid grid-cols-3 gap-2">
        <SheetMetric icon={Thermometer} label={t('irrigation.metric.temperature')} value={`${temperature.toFixed(1)}°C`} />
        <SheetMetric icon={Droplets} label={t('irrigation.metric.humidity')} value={`${humidity}%`} />
        <SheetMetric icon={CloudRain} label={t('irrigation.metric.rain')} value={rainProbability === undefined ? 'N/D' : `${rainProbability}%`} />
      </div>
    </div>
  );
}

function SheetMetric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-[1.2rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] px-2 py-3 text-center text-[color:var(--ui-text-primary)] shadow-[var(--ui-shadow-control)] backdrop-blur-xl">
      <Icon className="mx-auto h-4 w-4 text-lime-600 dark:text-lime-300" strokeWidth={1.8} />
      <p className="mt-1 truncate text-[9px] text-[color:var(--ui-text-secondary)]">{label}</p>
      <p className="mt-0.5 truncate text-xs font-semibold">{value}</p>
    </div>
  );
}

function HeroMetric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-[1.2rem] border border-white/18 bg-black/24 px-2 py-2.5 text-center backdrop-blur-xl sm:px-3 sm:py-3">
      <Icon className="mx-auto h-4 w-4 text-lime-200" strokeWidth={1.8} />
      <p className="mt-1 truncate text-[9px] text-white/58 sm:text-[10px]">{label}</p>
      <p className="mt-0.5 truncate text-xs font-semibold text-white sm:text-sm">{value}</p>
    </div>
  );
}

type MoistureCardProps = {
  value: number;
  description: string;
};

export function IrrigationMoistureCard({ value, description }: MoistureCardProps) {
  const { t } = useI18n();
  const tone = value < 35 ? '#f59e0b' : value > 70 ? '#22c55e' : '#84cc16';
  return (
    <div className="flex h-full items-center gap-4 rounded-[1.65rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] p-4 text-[color:var(--ui-text-primary)] shadow-[var(--ui-shadow-card)] sm:p-5">
      <div
        className="relative flex h-[5.25rem] w-[5.25rem] shrink-0 items-center justify-center rounded-full"
        style={{ background: `conic-gradient(${tone} ${value * 3.6}deg, var(--ui-fill-secondary) 0deg)` }}
      >
        <span className="absolute inset-[7px] rounded-full bg-[color:var(--ui-surface-primary)]" />
        <span className="relative text-lg font-semibold tracking-[-0.04em]">{value}%</span>
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--ui-text-tertiary)]">{t('irrigation.soil.health')}</p>
        <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em]">{t('irrigation.soil.optimal')}</h2>
        <p className="mt-1 line-clamp-2 text-xs leading-4 text-[color:var(--ui-text-secondary)]">{description}</p>
      </div>
    </div>
  );
}

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
  const { t } = useI18n();
  const Icon = zone.icon;
  const isAlert = zone.status === 'alert';
  const isActive = zone.status === 'active';
  const isScheduled = zone.status === 'scheduled';
  const incomplete = !zone.entityId;
  const accent = isAlert ? '#fb7185' : isScheduled ? '#f59e0b' : '#65a30d';
  const progress = zone.isManualActive ? zone.progress : isActive ? Math.max(12, zone.progress) : 0;

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
        <div className="flex h-9 min-w-0 flex-1 items-center justify-between rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-1">
          <button type="button" onClick={() => onDurationChange(zone.manualDurationMin - 1)} disabled={zone.manualDurationMin <= 1 || isAlert} className="flex h-7 w-7 items-center justify-center rounded-full disabled:opacity-30" aria-label={t('irrigation.zone.timerDecrease', { name: zone.name })}>
            <Minus className="h-3 w-3" />
          </button>
          <span className="text-[10px] font-semibold tabular-nums">{zone.isManualActive ? `${Math.ceil(zone.manualRemainingSeconds / 60)}m` : `${zone.manualDurationMin}m`}</span>
          <button type="button" onClick={() => onDurationChange(zone.manualDurationMin + 1)} disabled={zone.manualDurationMin >= (zone.maximumManualDurationMin ?? IRRIGATION_ABSOLUTE_MAX_DURATION_MIN) || isAlert} className="flex h-7 w-7 items-center justify-center rounded-full disabled:opacity-30" aria-label={t('irrigation.zone.timerIncrease', { name: zone.name })}>
            <Plus className="h-3 w-3" />
          </button>
        </div>
        <button
          type="button"
          onClick={onManualToggle}
          disabled={isAlert || incomplete || zone.isCommandPending}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white shadow-sm disabled:opacity-35 ${zone.isManualActive ? 'bg-rose-500' : 'bg-lime-600'}`}
          aria-label={zone.isCommandPending ? t('irrigation.zone.pending', { name: zone.name }) : zone.isManualActive ? t('irrigation.zone.stop', { name: zone.name }) : t('irrigation.zone.start', { name: zone.name })}
        >
          {zone.isCommandPending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : zone.isManualActive ? <Square className="h-3.5 w-3.5" fill="currentColor" /> : <Play className="ml-0.5 h-3.5 w-3.5" fill="currentColor" />}
        </button>
      </div>
    </article>
  );
}

type UsageCardProps = {
  usage: number;
  average: number;
  savingsLabel: string;
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
    <button
      type="button"
      onClick={onOpen}
      className="flex h-full min-h-0 w-full flex-col rounded-[1.65rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] p-4 text-left text-[color:var(--ui-text-primary)] shadow-[var(--ui-shadow-card)] transition-transform active:scale-[0.99] sm:p-5"
      aria-label={t('irrigation.schedule.open')}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--ui-text-tertiary)]">{t('irrigation.schedule.eyebrow')}</p>
          <h2 className="mt-1 text-lg font-semibold tracking-[-0.035em]">{t('irrigation.schedule.next')}</h2>
        </div>
        <CalendarDays className="h-4 w-4 text-[color:var(--app-workspace-accent)]" />
      </div>

      {visibleItems.length ? (
        <div className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-hidden">
          {visibleItems.map((item, index) => (
            <span key={item.id} className={`${index > 1 ? 'hidden 2xl:flex' : 'flex'} items-center gap-2 rounded-[0.9rem] bg-[color:var(--ui-fill-tertiary)] px-2.5 py-2`}>
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${index === 0 ? 'bg-[color:var(--app-workspace-accent)]' : 'bg-[color:var(--ui-text-tertiary)]'}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[10px] font-semibold">{item.name}</span>
                <span className="block truncate text-[9px] text-[color:var(--ui-text-tertiary)]">{item.when}</span>
              </span>
              <span className="shrink-0 text-[9px] font-semibold text-[color:var(--ui-text-secondary)]">{item.durationMin} min</span>
            </span>
          ))}
        </div>
      ) : (
        <div className="mt-3 flex min-h-0 flex-1 items-center rounded-[1rem] bg-[color:var(--ui-fill-tertiary)] px-3 text-[10px] text-[color:var(--ui-text-secondary)]">
          {t('irrigation.schedule.empty')}
        </div>
      )}

      <span className="mt-2 flex items-center justify-end gap-1 text-[10px] font-semibold text-[color:var(--app-workspace-accent)]">
        {t('irrigation.schedule.full')}
        <ChevronRight className="h-3 w-3" />
      </span>
    </button>
  );
}

type ConsumptionSnapshotCardProps = UsageCardProps & {
  onOpen: () => void;
};

export function IrrigationConsumptionSnapshotCard({
  usage,
  average,
  savingsLabel,
  positiveSavings,
  bars,
  onOpen,
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
          <p className="mt-1 text-2xl font-semibold tracking-[-0.045em]">{formatNumber(usage)} L</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${positiveSavings ? 'bg-lime-500/14 text-lime-700 dark:text-lime-300' : 'bg-rose-500/14 text-rose-600 dark:text-rose-300'}`}>{savingsLabel}</span>
      </div>

      <div className="mt-4 flex min-h-[4rem] flex-1 flex-col" aria-hidden="true">
        <div className="flex min-h-0 flex-1 items-end gap-1.5">
          {bars.map((value, index) => (
            <span key={`${value}-${index}`} className="block min-w-0 flex-1 rounded-full bg-lime-500/25" style={{ height: `${Math.max(14, value)}%`, opacity: index === 3 ? 1 : 0.55 }} />
          ))}
        </div>
        <div className="mt-2 hidden grid-cols-7 text-center text-[8px] font-semibold text-[color:var(--ui-text-tertiary)] xl:grid">
          {['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
        </div>
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 pt-3">
        <div><p className="text-[10px] text-[color:var(--ui-text-tertiary)]">{t('irrigation.usage.averageWeek')}</p><p className="mt-0.5 text-xs font-semibold">{formatNumber(average)} L</p></div>
        <span className="text-[10px] font-semibold text-[color:var(--app-workspace-accent)]">{t('irrigation.usage.openDetail')}</span>
      </div>
    </button>
  );
}

export function IrrigationUsageCard({ usage, average, savingsLabel, positiveSavings, bars }: UsageCardProps) {
  const { t, formatNumber } = useI18n();
  const usageVsAverage = Math.max(
    0,
    Math.min(999, Math.round((usage / Math.max(average, 1)) * 100)),
  );
  return (
    <div className="h-full rounded-[1.65rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] p-4 text-[color:var(--ui-text-primary)] shadow-[var(--ui-shadow-card)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--ui-text-tertiary)]">{t('irrigation.usage.weekly')}</p>
          <p className="mt-1 text-2xl font-semibold tracking-[-0.04em]">{usageVsAverage}%</p>
          <p className="text-[10px] text-[color:var(--ui-text-muted)]">{t('irrigation.usage.ofAverage')}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${positiveSavings ? 'bg-lime-500/14 text-lime-700 dark:text-lime-300' : 'bg-rose-500/14 text-rose-600 dark:text-rose-300'}`}>
          {savingsLabel}
        </span>
      </div>
      <div className="mt-4 flex h-14 items-end gap-1">
        {bars.map((value, index) => (
          <span key={`${value}-${index}`} className="block min-w-0 flex-1 rounded-full bg-lime-500/25" style={{ height: `${Math.max(14, value)}%`, opacity: index === 3 ? 1 : 0.55 }} />
        ))}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] text-[color:var(--ui-text-tertiary)]">{t('irrigation.usage.water')}</p>
          <p className="mt-0.5 text-lg font-semibold">{usage.toLocaleString('it-IT')} L</p>
        </div>
        <p className="text-right text-[10px] text-[color:var(--ui-text-secondary)]">{t('irrigation.usage.averageWeek')}<br />{formatNumber(average)} L</p>
      </div>
    </div>
  );
}
