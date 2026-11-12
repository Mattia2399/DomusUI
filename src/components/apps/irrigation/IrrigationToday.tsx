import { CloudRain, Droplets, Pause, Play, Square, Sprout } from 'lucide-react';
import GlassToggle from '../../ui/GlassToggle';
import { useI18n } from '../../../i18n/I18nProvider';
import { useCan } from '../../../security/AccessControlProvider';
import type { IrrigationZoneCardModel } from './IrrigationDashboardCards';

type TodayState = 'active' | 'ready' | 'rain' | 'fault' | 'offline' | 'loading' | 'unavailable';

const TODAY_PHOTOS: Record<TodayState, string> = {
  active: new URL('../../../assets/irrigation/active.webp', import.meta.url).href,
  ready: new URL('../../../assets/irrigation/ready.webp', import.meta.url).href,
  rain: new URL('../../../assets/irrigation/rain.webp', import.meta.url).href,
  fault: new URL('../../../assets/irrigation/fault.webp', import.meta.url).href,
  offline: new URL('../../../assets/irrigation/fault.webp', import.meta.url).href,
  loading: new URL('../../../assets/irrigation/fault.webp', import.meta.url).href,
  unavailable: new URL('../../../assets/irrigation/fault.webp', import.meta.url).href,
};

type TodayHeroProps = {
  state: TodayState;
  title: string;
  description: string;
  value?: string | null;
  valueLabel?: string | null;
  masterTitle: string;
  masterIsRunning: boolean;
  masterIsStopped: boolean;
  masterIsPaused: boolean;
  commandAvailable: boolean;
  rainSensorEnabled: boolean;
  rainSensorSyncing: boolean;
  rainSensorEditable: boolean;
  onRainSensorToggle: () => void;
  onPrimaryAction: () => void;
  onStop: () => void;
};

export function IrrigationTodayHero({
  state, title, description, value, valueLabel, masterTitle,
  masterIsRunning, masterIsStopped, masterIsPaused, commandAvailable,
  rainSensorEnabled, rainSensorSyncing, rainSensorEditable,
  onRainSensorToggle, onPrimaryAction, onStop,
}: TodayHeroProps) {
  const { t } = useI18n();
  const canControl = useCan('irrigation.control');
  const tone = state === 'fault'
    ? 'from-rose-950/10 via-rose-950/30 to-rose-950/90'
    : state === 'unavailable' || state === 'offline' || state === 'loading'
      ? 'from-slate-950/20 via-slate-950/50 to-slate-950/95'
    : state === 'rain'
      ? 'from-violet-950/10 via-violet-950/35 to-violet-950/90'
      : 'from-emerald-950/5 via-emerald-950/25 to-[#071d16]/95';

  return (
    <div className="space-y-3">
      <section data-testid="irrigation-today-hero" data-state={state} role={state === 'fault' ? 'alert' : undefined} className="relative isolate flex min-h-[19rem] flex-col overflow-hidden rounded-[1.8rem] border border-white/20 text-white shadow-[var(--ui-shadow-card)] sm:min-h-[22rem] xl:min-h-[25rem]">
        <img src={TODAY_PHOTOS[state]} alt="" aria-hidden="true" className="absolute inset-0 -z-20 h-full w-full scale-[1.025] object-cover blur-[3px]" />
        <div aria-hidden="true" className={`absolute inset-0 -z-10 bg-gradient-to-b ${tone}`} />
        <div className="flex items-start justify-between gap-3 p-5 sm:p-7">
          <div className="rounded-full border border-white/25 bg-black/25 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] backdrop-blur-xl">
            {t(`irrigation.today.state.${state}`)}
          </div>
          {value ? (
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/75">{valueLabel}</p>
              <p className="mt-0.5 text-[2.3rem] font-light leading-none tracking-[-0.06em] sm:text-[3rem]">{value}</p>
            </div>
          ) : null}
        </div>
        <div className="mt-auto p-5 pt-12 sm:p-7 sm:pt-16">
          <h2 className="max-w-xl text-[1.8rem] font-semibold leading-[1.05] tracking-[-0.045em] sm:text-[2.25rem]">{title}</h2>
          <p className="mt-2 max-w-xl text-sm leading-5 text-white/85">{description}</p>
          {canControl && commandAvailable && (state === 'active' || state === 'ready') ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {!masterIsStopped ? (
                <button type="button" onClick={onPrimaryAction} aria-label={masterIsRunning ? t('irrigation.action.pause') : t('irrigation.action.resume')} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/30 bg-white/90 px-4 text-xs font-semibold text-[#123a2b] shadow-sm transition-colors hover:bg-white">
                  {masterIsRunning ? <Pause className="h-3.5 w-3.5" fill="currentColor" /> : <Play className="h-3.5 w-3.5" fill="currentColor" />}
                  {masterIsRunning ? t(state === 'active' ? 'irrigation.today.pause' : 'irrigation.today.pauseSchedule') : t('irrigation.today.resume')}
                </button>
              ) : null}
              {(state === 'active' || masterIsPaused) && !masterIsStopped ? (
                <button type="button" onClick={onStop} aria-label={t('irrigation.action.stop')} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/30 bg-black/35 px-4 text-xs font-semibold text-white backdrop-blur-xl transition-colors hover:bg-black/50">
                  <Square className="h-3.5 w-3.5" fill="currentColor" />
                  {t('irrigation.today.stop')}
                </button>
              ) : null}
              {masterIsStopped ? (
                <button type="button" onClick={onPrimaryAction} aria-label={t('irrigation.action.start')} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/30 bg-white/90 px-4 text-xs font-semibold text-[#123a2b] shadow-sm transition-colors hover:bg-white">
                  <Play className="h-3.5 w-3.5" fill="currentColor" />
                  {t('irrigation.today.enable')}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
      {(state === 'active' || state === 'ready' || state === 'rain' || state === 'fault') ? <div className="flex items-center justify-between gap-3 rounded-[1.3rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] px-4 py-3 text-[color:var(--ui-text-primary)] shadow-[var(--ui-shadow-card)] backdrop-blur-xl">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">{masterTitle}</p>
          <p className="mt-0.5 truncate text-[10px] text-[color:var(--ui-text-secondary)]">
            {t('irrigation.rain.protection')} · {rainSensorEnabled ? t('irrigation.rain.active') : t('irrigation.rain.disabled')}
          </p>
        </div>
        <GlassToggle checked={rainSensorEnabled} label={t('irrigation.rain.toggle')} onChange={onRainSensorToggle} disabled={!rainSensorEditable} busy={rainSensorSyncing} size="compact" />
      </div> : null}
    </div>
  );
}

type TodayFactsProps = {
  temperature: number | null;
  humidity: number | null;
  rainProbability?: number;
  rainStatusLabel: string;
  moisture: number | null;
  moistureDescription: string;
  waterLiters: number | null;
  formatNumber: (value: number) => string;
};

export function IrrigationTodayFacts({ temperature, humidity, rainProbability, rainStatusLabel, moisture, moistureDescription, waterLiters, formatNumber }: TodayFactsProps) {
  const { t } = useI18n();
  const facts = [
    {
      id: 'weather', icon: CloudRain, label: t('irrigation.today.weather'),
      value: temperature === null ? null : `${Math.round(temperature)}°`,
      detail: [rainStatusLabel, humidity === null ? null : `${t('irrigation.metric.humidity')} ${humidity}%`, rainProbability === undefined ? null : t('irrigation.today.rainChance', { probability: rainProbability })].filter(Boolean).join(' · ') || t('irrigation.today.noForecast'),
    },
    {
      id: 'soil', icon: Sprout, label: t('irrigation.today.soil'),
      value: moisture === null ? null : `${moisture}%`,
      detail: moistureDescription,
    },
    {
      id: 'water', icon: Droplets, label: t('irrigation.today.water'),
      value: waterLiters === null ? null : `${formatNumber(waterLiters)} L`,
      detail: t('irrigation.usage.week'),
    },
  ];
  return (
    <div data-testid="irrigation-today-facts" className="grid grid-cols-3 gap-2 sm:gap-3">
      {facts.map(({ id, icon: Icon, label, value, detail }) => (
        <div key={id} className="min-w-0 rounded-[1.3rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] p-3 text-[color:var(--ui-text-primary)] shadow-[var(--ui-shadow-card)] backdrop-blur-xl sm:p-4">
          <Icon className="h-[1.15rem] w-[1.15rem] text-[#0E9F6E] dark:text-[#34D399]" strokeWidth={1.8} aria-hidden="true" />
          <p className="mt-3 truncate text-[10px] font-medium text-[color:var(--ui-text-secondary)] sm:text-xs">{label}</p>
          <p className="mt-0.5 truncate text-lg font-semibold tracking-[-0.04em] sm:text-[1.4rem]">{value ?? t('irrigation.today.unavailable')}</p>
          <p className="mt-1 hidden truncate text-[10px] text-[color:var(--ui-text-tertiary)] sm:block">{detail}</p>
        </div>
      ))}
    </div>
  );
}

export function IrrigationTodayZones({ zones, nextCycleLabel, onOpen }: {
  zones: IrrigationZoneCardModel[];
  nextCycleLabel: string;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  return (
    <section data-testid="irrigation-today-zones" className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-[-0.035em] text-[color:var(--ui-text-primary)]">{t('irrigation.zones.title')}</h2>
          <p className="mt-0.5 truncate text-xs text-[color:var(--ui-text-secondary)]">{t('irrigation.zones.next')}: {nextCycleLabel}</p>
        </div>
        <button type="button" onClick={onOpen} className="liquid-glass-control min-h-9 shrink-0 rounded-full px-3 text-xs font-semibold text-[color:var(--app-workspace-accent)]">
          {t('irrigation.today.allZones')}
        </button>
      </div>
      {zones.length ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {zones.slice(0, 4).map((zone) => {
            const Icon = zone.icon;
            const active = zone.isManualActive && zone.manualSessionState === 'running';
            const alert = zone.status === 'alert';
            return (
              <button
                key={zone.id}
                type="button"
                onClick={onOpen}
                aria-label={t('irrigation.today.openZone', { name: zone.name })}
                className={`flex min-h-[8.75rem] min-w-0 flex-col rounded-[1.35rem] border p-3.5 text-left shadow-[var(--ui-shadow-card)] transition-transform active:scale-[0.98] ${active ? 'border-white/80 bg-white text-[#173d2e]' : 'border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] text-[color:var(--ui-text-primary)] backdrop-blur-xl'}`}
              >
                <span className={`flex h-9 w-9 items-center justify-center rounded-[0.8rem] ${alert ? 'bg-rose-500/15 text-rose-600 dark:text-rose-300' : active ? 'bg-[#0E9F6E]/12 text-[#0E9F6E]' : 'bg-emerald-500/10 text-[#0E9F6E] dark:text-[#34D399]'}`}>
                  <Icon className="h-[1.1rem] w-[1.1rem]" strokeWidth={1.8} />
                </span>
                <span className="mt-auto block w-full min-w-0 pt-3">
                  <span className="block truncate text-sm font-semibold">{zone.name}</span>
                  <span className={`mt-0.5 block truncate text-[10px] ${active ? 'text-[#456457]' : 'text-[color:var(--ui-text-secondary)]'}`}>
                    {active ? t('irrigation.zones.running') : alert ? t('irrigation.zones.attention') : zone.detail}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[1.35rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] p-5 text-sm text-[color:var(--ui-text-secondary)] shadow-[var(--ui-shadow-card)]">
          {t('irrigation.today.noZones')}
        </div>
      )}
    </section>
  );
}
