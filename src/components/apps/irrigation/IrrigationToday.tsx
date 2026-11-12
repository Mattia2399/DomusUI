import { Check, CloudRain, Droplets, Pause, Play, Square, Sprout, TriangleAlert } from 'lucide-react';
import { useI18n } from '../../../i18n/I18nProvider';
import { useCan } from '../../../security/AccessControlProvider';
import type { IrrigationZoneCardModel } from './IrrigationDashboardCards';

type TodayState = 'active' | 'ready' | 'stopped' | 'rain' | 'fault' | 'offline' | 'loading' | 'unavailable';

const TODAY_PHOTOS: Record<TodayState, string> = {
  active: new URL('../../../assets/irrigation/active.webp', import.meta.url).href,
  ready: new URL('../../../assets/irrigation/ready.webp', import.meta.url).href,
  stopped: new URL('../../../assets/irrigation/ready.webp', import.meta.url).href,
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
  chipLabel?: string | null;
  progressPercent?: number | null;
  masterIsRunning: boolean;
  masterIsStopped: boolean;
  commandAvailable: boolean;
  onPrimaryAction: () => void;
  onStop: () => void;
};

export function IrrigationTodayHero({
  state, title, description, value, valueLabel, chipLabel, progressPercent,
  masterIsRunning, masterIsStopped, commandAvailable, onPrimaryAction, onStop,
}: TodayHeroProps) {
  const { t } = useI18n();
  const canControl = useCan('irrigation.control');
  const StateIcon = state === 'fault' || state === 'unavailable' || state === 'offline'
    ? TriangleAlert : state === 'rain' ? CloudRain : state === 'ready' ? Check : Droplets;
  const tone = state === 'fault'
    ? 'from-rose-950/10 via-rose-950/20 to-rose-950/85'
    : state === 'unavailable' || state === 'offline' || state === 'loading'
      ? 'from-slate-950/20 via-slate-950/40 to-slate-950/90'
      : state === 'rain'
        ? 'from-violet-950/10 via-violet-950/25 to-violet-950/85'
        : 'from-black/20 via-black/20 to-black/65';

  return (
      <section data-testid="irrigation-today-hero" data-state={state} role={state === 'fault' ? 'alert' : undefined} className="relative isolate flex min-h-[14.75rem] flex-col justify-between gap-5 overflow-hidden rounded-[2rem] p-[22px] text-white shadow-[0_30px_60px_-36px_rgba(0,0,0,0.6)] md:min-h-[15.75rem]">
        <img src={TODAY_PHOTOS[state]} alt="" aria-hidden="true" className="absolute inset-0 -z-20 h-full w-full scale-[1.025] object-cover blur-[3.5px]" />
        <div aria-hidden="true" className={`absolute inset-0 -z-10 bg-gradient-to-b ${tone}`} />
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full bg-white/20 px-3 text-[12px] font-semibold backdrop-blur-xl">
            <StateIcon className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
            {chipLabel || t(`irrigation.today.state.${state}`)}
          </span>
          {value ? (
            <div className="text-right">
              <p className="text-[2.75rem] font-bold leading-none tracking-[-0.045em] tabular-nums">{value}</p>
              <p className="mt-0.5 text-[12px] font-semibold text-white/85">{valueLabel}</p>
            </div>
          ) : null}
        </div>
        <div className="mt-auto">
          <h2 className="max-w-xl text-[1.75rem] font-bold leading-[1.1] tracking-[-0.025em]">{title}</h2>
          <p className="mt-1.5 max-w-xl text-[0.95rem] font-medium leading-5 text-white/90">{description}</p>
          {canControl && commandAvailable && (state === 'active' || state === 'stopped') ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {state === 'active' ? (
                <button type="button" onClick={onPrimaryAction} aria-label={masterIsRunning ? t('irrigation.action.pause') : t('irrigation.action.resume')} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-[0.95rem] font-semibold text-[#0b0b0f] shadow-sm transition-colors hover:bg-white/90">
                  {masterIsRunning ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="h-4 w-4" fill="currentColor" />}
                  {masterIsRunning ? t('irrigation.today.pause') : t('irrigation.today.resume')}
                </button>
              ) : null}
              {state === 'active' ? (
                <button type="button" onClick={onStop} aria-label={t('irrigation.action.stop')} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white/20 px-5 text-[0.95rem] font-semibold text-white backdrop-blur-xl transition-colors hover:bg-white/30">
                  <Square className="h-3.5 w-3.5" fill="currentColor" />
                  {t('irrigation.today.stop')}
                </button>
              ) : null}
              {masterIsStopped ? (
                <button type="button" onClick={onPrimaryAction} aria-label={t('irrigation.action.start')} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-[0.95rem] font-semibold text-[#0b0b0f] shadow-sm transition-colors hover:bg-white/90">
                  <Play className="h-4 w-4" fill="currentColor" />
                  {t('irrigation.today.enable')}
                </button>
              ) : null}
            </div>
          ) : null}
          {state === 'active' && progressPercent !== null && progressPercent !== undefined ? (
            <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/30" role="progressbar" aria-valuenow={Math.round(progressPercent)} aria-valuemin={0} aria-valuemax={100} aria-label={t('irrigation.today.progress')}>
              <div className="h-full rounded-full bg-white" style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }} />
            </div>
          ) : null}
        </div>
      </section>
  );
}

type TodayFactsProps = {
  weatherLabel: string | null;
  weatherDetail: string;
  moisture: number | null;
  moistureDescription: string;
  waterLiters: number | null;
  waterPeriodLabel: string;
  formatNumber: (value: number) => string;
  onOpenSettings?: () => void;
  onOpenUsage: () => void;
};

export function IrrigationTodayFacts({ weatherLabel, weatherDetail, moisture, moistureDescription, waterLiters, waterPeriodLabel, formatNumber, onOpenSettings, onOpenUsage }: TodayFactsProps) {
  const { t } = useI18n();
  const facts = [
    {
      id: 'weather', icon: CloudRain, label: t('irrigation.today.weather'),
      value: weatherLabel,
      detail: weatherDetail,
      onOpen: onOpenSettings,
    },
    {
      id: 'soil', icon: Sprout, label: t('irrigation.today.soil'),
      value: moisture === null ? null : `${moisture}%`,
      detail: moistureDescription,
      onOpen: onOpenSettings,
    },
    {
      id: 'water', icon: Droplets, label: t('irrigation.today.water'),
      value: waterLiters === null ? null : `${formatNumber(waterLiters)} L`,
      detail: waterPeriodLabel,
      onOpen: onOpenUsage,
    },
  ];
  return (
    <div data-testid="irrigation-today-facts" className="grid grid-cols-3 gap-3">
      {facts.map(({ id, icon: Icon, label, value, detail, onOpen }) => (
        <button key={id} type="button" onClick={onOpen} disabled={!onOpen} className="liquid-glass-panel !rounded-[1.4rem] flex min-h-[6.35rem] min-w-0 flex-col gap-1 p-3.5 text-left text-[color:var(--ui-text-primary)] disabled:cursor-default">
          <span className="flex items-center gap-1.5 truncate text-[0.75rem] font-semibold text-[color:var(--ui-text-secondary)]">
            <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden="true" />{label}
          </span>
          <span className="block truncate text-[1.25rem] font-bold leading-tight tracking-[-0.02em] tabular-nums sm:text-[1.4rem]">{value ?? t('irrigation.today.unavailable')}</span>
          <span className="block truncate text-[0.7rem] font-medium text-[color:var(--ui-text-secondary)] sm:text-xs">{detail}</span>
        </button>
      ))}
    </div>
  );
}

export function IrrigationTodayZones({ zones, onOpen }: {
  zones: IrrigationZoneCardModel[];
  onOpen: () => void;
}) {
  const { t } = useI18n();
  return (
    <section data-testid="irrigation-today-zones" className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[1.4rem] font-bold tracking-[-0.02em] text-[color:var(--ui-text-primary)]">{t('irrigation.today.zonesTitle')} <span className="ml-1 text-sm font-medium text-[color:var(--ui-text-secondary)]">{zones.length}</span></h2>
        <button type="button" onClick={onOpen} className="text-sm font-semibold text-[color:var(--app-workspace-accent)]">
          {t('irrigation.today.allZones')}
        </button>
      </div>
      {zones.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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
                className={`relative flex min-h-[8.25rem] min-w-0 flex-col gap-2 rounded-[1.6rem] p-4 text-left transition-transform active:scale-[0.97] ${active ? 'bg-white text-[#0b0b0f] shadow-[0_18px_38px_-20px_rgba(0,0,0,0.55)]' : 'liquid-glass-panel !rounded-[1.6rem] text-[color:var(--ui-text-primary)]'}`}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className={`flex h-[2.6rem] w-[2.6rem] items-center justify-center rounded-full ${alert ? 'bg-rose-500/15 text-rose-600 dark:text-rose-300' : active ? 'bg-[#0E9F6E] text-white shadow-[0_8px_18px_-6px_#0E9F6E]' : 'bg-[color:var(--ui-fill-secondary)] text-[color:var(--ui-text-secondary)]'}`}>
                    <Icon className="h-[1.25rem] w-[1.25rem]" strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--ui-fill-secondary)] text-[color:var(--ui-text-primary)]" aria-hidden="true">
                    {active ? <Square className="h-3.5 w-3.5" fill="currentColor" /> : <Play className="h-3.5 w-3.5" fill="currentColor" />}
                  </span>
                </span>
                <span className="mt-auto block w-full min-w-0">
                  <span className="block truncate text-base font-semibold">{zone.name}</span>
                  <span className={`mt-1 block truncate text-xs ${active ? 'text-[#4c4c50]' : 'text-[color:var(--ui-text-secondary)]'}`}>
                    {active ? t('irrigation.today.zoneRunning', { minutes: Math.ceil(zone.manualRemainingSeconds / 60) }) : alert ? t('irrigation.zones.attention') : zone.detail}
                  </span>
                </span>
                {active && zone.progress > 0 ? <span className="absolute inset-x-4 bottom-2 h-[3px] overflow-hidden rounded-full bg-black/10"><span className="block h-full bg-[#0E9F6E]" style={{ width: `${100 - zone.progress}%` }} /></span> : null}
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
