import type { LucideIcon } from 'lucide-react';
import { useCan } from '../../../security/AccessControlProvider';
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
  Settings,
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
  masterIsPaused: boolean;
  temperature: number | null;
  humidity: number | null;
  rainProbability?: number;
  rainStatusLabel: string;
  rainSummaryTitle: string;
  rainSummaryDescription: string;
  rainSensorEnabled: boolean;
  rainSensorSyncing: boolean;
  rainSensorEditable?: boolean;
  onRainSensorToggle: () => void;
  onPrimaryAction: () => void;
  onStop: () => void;
};

export function IrrigationHero({
  masterTitle,
  masterIsRunning,
  masterIsStopped,
  masterIsPaused,
  temperature,
  humidity,
  rainProbability,
  rainStatusLabel,
  rainSummaryTitle,
  rainSummaryDescription,
  rainSensorEnabled,
  rainSensorSyncing,
  rainSensorEditable = true,
  onRainSensorToggle,
  onPrimaryAction,
  onStop,
}: IrrigationHeroProps) {
  // irrigation.control: without it the state shows and no command is offered.
  const canControl = useCan('irrigation.control');
  const { t } = useI18n();
  return (
    <div
      data-testid="irrigation-progressive-hero"
      className="relative flex h-[40svh] min-h-[20.5rem] max-h-[22.5rem] flex-col overflow-hidden rounded-none text-white md:h-auto md:max-h-none md:min-h-[28rem] md:rounded-[2rem]"
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
            <p className="text-[2.55rem] font-light leading-none tracking-[-0.06em] sm:text-5xl">{temperature === null ? 'N/D' : `${temperature.toFixed(0)}°`}</p>
            <p className="mt-1 text-[11px] font-medium text-white/75">{rainStatusLabel}</p>
          </div>
        </div>

        <div className="mt-auto hidden pt-5 md:block">
          <div className="grid grid-cols-3 gap-2">
            <HeroMetric icon={Thermometer} label={t('irrigation.metric.temperature')} value={temperature === null ? 'N/D' : `${temperature.toFixed(1)}°C`} />
            <HeroMetric icon={Droplets} label={t('irrigation.metric.humidity')} value={humidity === null ? 'N/D' : `${humidity}%`} />
            <HeroMetric icon={CloudRain} label={t('irrigation.metric.rain')} value={rainProbability === undefined ? 'N/D' : `${rainProbability}%`} />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[1.5rem] border border-white/18 bg-black/28 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-2xl sm:p-4">
          <div className="order-1 min-w-0 flex-1 px-1">
            <p className="truncate text-sm font-semibold">{masterTitle}</p>
            <p className="mt-0.5 truncate text-[10px] text-white/60">
              {masterIsRunning
                ? t('irrigation.manual.running')
                : masterIsPaused
                  ? t('irrigation.manual.paused')
                  : masterIsStopped
                    ? t('irrigation.manual.stopped')
                    : t('irrigation.manual.ready')}
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
              disabled={!rainSensorEditable}
              busy={rainSensorSyncing}
              size="compact"
            />
          </div>
          {canControl && !masterIsStopped ? (
            <button
              type="button"
              onClick={onStop}
              className="order-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-rose-200/30 bg-rose-500/75 text-white shadow-[0_8px_22px_rgba(190,24,93,0.3)] transition-transform active:scale-95"
              aria-label={t('irrigation.action.stop')}
            >
              <Square className="h-4 w-4" fill="currentColor" />
            </button>
          ) : null}
          {canControl ? (
          <button
            type="button"
            onClick={onPrimaryAction}
            aria-pressed={masterIsRunning}
            className="order-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-lime-100/40 bg-lime-300 text-[#16320d] shadow-[0_8px_24px_rgba(163,230,53,0.3)] transition-transform active:scale-95"
            aria-label={masterIsRunning ? t('irrigation.action.pause') : masterIsPaused ? t('irrigation.action.resume') : t('irrigation.action.start')}
          >
            {masterIsRunning ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="ml-0.5 h-4 w-4" fill="currentColor" />}
          </button>
          ) : null}
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
  masterIsPaused,
  temperature,
  humidity,
  rainProbability,
  rainSensorEnabled,
  rainSensorSyncing,
  rainSensorEditable = true,
  onRainSensorToggle,
  onPrimaryAction,
  onStop,
  onConfigure,
}: IrrigationHeroProps & { onConfigure?: () => void }) {
  // irrigation.control: without it the state shows and no command is offered.
  const canControl = useCan('irrigation.control');
  const { t } = useI18n();
  return (
    <div data-testid="irrigation-mobile-overview" className="space-y-3 md:hidden">
      <section className="rounded-[1.55rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] p-4 text-[color:var(--ui-text-primary)] shadow-[var(--ui-shadow-card)]">
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--ui-text-tertiary)]">{t('irrigation.system')}</p>
          {onConfigure ? (
            <button type="button" onClick={onConfigure} className="liquid-glass-control flex h-8 w-8 shrink-0 items-center justify-center rounded-full" aria-label={t('irrigation.configure')}>
              <Settings className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <div className="mt-1.5 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="mt-1 truncate text-lg font-semibold tracking-[-0.03em]">{masterTitle}</h2>
            <p className="mt-0.5 truncate text-[10px] text-[color:var(--ui-text-secondary)]">
              {masterIsRunning
                ? t('irrigation.manual.running')
                : masterIsPaused
                  ? t('irrigation.manual.paused')
                  : masterIsStopped
                    ? t('irrigation.manual.stopped')
                  : t('irrigation.manual.ready')}
            </p>
          </div>
          <div className="flex shrink-0 translate-y-1 items-center gap-2">
            {canControl && !masterIsStopped ? (
              <button
                type="button"
                onClick={onStop}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-rose-400/25 bg-rose-500/85 text-white shadow-[0_8px_22px_rgba(190,24,93,0.2)] transition-transform active:scale-95"
                aria-label={t('irrigation.action.stop')}
              >
                <Square className="h-4 w-4" fill="currentColor" />
              </button>
            ) : null}
            {canControl ? (
            <button
              type="button"
              onClick={onPrimaryAction}
              aria-pressed={masterIsRunning}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-lime-500/30 bg-lime-400 text-[#16320d] shadow-[0_8px_24px_rgba(132,204,22,0.24)] transition-transform active:scale-95"
              aria-label={masterIsRunning ? t('irrigation.action.pause') : masterIsPaused ? t('irrigation.action.resume') : t('irrigation.action.start')}
            >
              {masterIsRunning ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="ml-0.5 h-4 w-4" fill="currentColor" />}
            </button>
            ) : null}
          </div>
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
            disabled={!rainSensorEditable}
            busy={rainSensorSyncing}
            size="compact"
          />
        </div>
      </section>

      <div className="grid grid-cols-3 gap-2">
        <SheetMetric icon={Thermometer} label={t('irrigation.metric.temperature')} value={temperature === null ? 'N/D' : `${temperature.toFixed(1)}°C`} />
        <SheetMetric icon={Droplets} label={t('irrigation.metric.humidity')} value={humidity === null ? 'N/D' : `${humidity}%`} />
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
  value: number | null;
  description: string;
};

export function IrrigationMoistureCard({ value, description }: MoistureCardProps) {
  const { t } = useI18n();
  const tone = value === null ? 'var(--ui-text-tertiary)' : value < 35 ? '#f59e0b' : value > 70 ? '#22c55e' : '#84cc16';
  const gaugeValue = value ?? 0;
  return (
    <div className="flex h-full items-center gap-4 rounded-[1.65rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] p-4 text-[color:var(--ui-text-primary)] shadow-[var(--ui-shadow-card)] sm:p-5">
      <div
        className="relative flex h-[5.25rem] w-[5.25rem] shrink-0 items-center justify-center rounded-full"
        style={{ background: `conic-gradient(${tone} ${gaugeValue * 3.6}deg, var(--ui-fill-secondary) 0deg)` }}
      >
        <span className="absolute inset-[7px] rounded-full bg-[color:var(--ui-surface-primary)]" />
        <span className="relative text-lg font-semibold tracking-[-0.04em]">{value === null ? 'N/D' : `${value}%`}</span>
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--ui-text-tertiary)]">{t('irrigation.soil.health')}</p>
        <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em]">{t('irrigation.soil.optimal')}</h2>
        <p className="mt-1 line-clamp-2 text-xs leading-4 text-[color:var(--ui-text-secondary)]">{description}</p>
      </div>
    </div>
  );
}
