import { useEffect, useRef, type CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  BatteryCharging,
  Clock3,
  Droplets,
  FlaskConical,
  Gauge,
  Heater,
  Sparkles,
  Sun,
  Thermometer,
  Timer,
  Waves,
  Zap,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';

const POOL_PREVIEW_IMAGE = new URL('../../assets/pool-spa-preview.jpg', import.meta.url).href;
const TECHNICAL_PREVIEW_IMAGE = new URL('../../assets/technical-room-preview.jpg', import.meta.url).href;

export type ComingSoonAppDemoVariant = 'pool' | 'technical';

type DemoMetric = {
  label: string;
  value: string;
  icon: LucideIcon;
};

type DemoStatus = {
  title: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  progress: number;
};

type DemoDefinition = {
  image: string;
  imageAlt: string;
  eyebrow: string;
  headline: string;
  summary: string;
  accent: string;
  metrics: readonly DemoMetric[];
  statuses: readonly DemoStatus[];
};

const DEMO_DEFINITIONS: Record<ComingSoonAppDemoVariant, DemoDefinition> = {
  pool: {
    image: POOL_PREVIEW_IMAGE,
    imageAlt: 'Piscina moderna illuminata al tramonto',
    eyebrow: 'Piscina & Spa',
    headline: 'Acqua pronta, sempre',
    summary: 'Temperatura, filtrazione e atmosfera in un’unica esperienza.',
    accent: '#22d3ee',
    metrics: [
      { label: 'Acqua', value: '28°C', icon: Thermometer },
      { label: 'Qualità', value: 'pH 7.3', icon: FlaskConical },
      { label: 'Filtrazione', value: '6h', icon: Timer },
    ],
    statuses: [
      { title: 'Ciclo filtrazione', value: 'In funzione', detail: 'Completamento previsto alle 18:30', icon: Waves, progress: 68 },
      { title: 'Qualità acqua', value: 'Ottimale', detail: 'Valori simulati nel range ideale', icon: Droplets, progress: 86 },
      { title: 'Atmosfera Spa', value: 'Relax', detail: 'Luci e temperatura coordinate', icon: Sparkles, progress: 54 },
    ],
  },
  technical: {
    image: TECHNICAL_PREVIEW_IMAGE,
    imageAlt: 'Locale tecnico domestico moderno con impianto energetico',
    eyebrow: 'Locale tecnico',
    headline: 'L’energia lavora per te',
    summary: 'Produzione, accumulo e comfort coordinati in modo intelligente.',
    accent: '#38bdf8',
    metrics: [
      { label: 'Produzione', value: '4.8 kW', icon: Sun },
      { label: 'Batteria', value: '78%', icon: BatteryCharging },
      { label: 'Dalla rete', value: '0.7 kW', icon: Zap },
    ],
    statuses: [
      { title: 'Fotovoltaico', value: 'Produzione stabile', detail: 'Casa alimentata principalmente dal sole', icon: Sun, progress: 82 },
      { title: 'Batteria domestica', value: 'In carica', detail: 'Autonomia serale stimata: 6 ore', icon: BatteryCharging, progress: 78 },
      { title: 'Pompa di calore', value: 'Comfort', detail: 'Funzionamento efficiente e regolare', icon: Heater, progress: 64 },
    ],
  },
};

export function ComingSoonAppDemo({ variant }: { variant: ComingSoonAppDemoVariant }) {
  const { t } = useI18n();
  const baseDefinition = DEMO_DEFINITIONS[variant];
  const translationKeys = variant === 'pool'
    ? {
        metrics: ['preview.pool.m1', 'preview.pool.m2', 'preview.pool.m3'],
        titles: ['preview.pool.s1', 'preview.pool.s2', 'preview.pool.s3'],
        values: ['preview.pool.v1', 'preview.pool.v2', 'preview.pool.v3'],
        details: ['preview.pool.d1', 'preview.pool.d2', 'preview.pool.d3'],
      } as const
    : {
        metrics: ['preview.technical.m1', 'preview.technical.m2', 'preview.technical.m3'],
        titles: ['preview.technical.s1', 'preview.technical.s2', 'preview.technical.s3'],
        values: ['preview.technical.v1', 'preview.technical.v2', 'preview.technical.v3'],
        details: ['preview.technical.d1', 'preview.technical.d2', 'preview.technical.d3'],
      } as const;
  const definition: DemoDefinition = {
    ...baseDefinition,
    imageAlt: t(`preview.${variant}.alt`),
    eyebrow: t(`preview.${variant}.eyebrow`),
    headline: t(`preview.${variant}.headline`),
    summary: t(`preview.${variant}.summary`),
    metrics: baseDefinition.metrics.map((metric, index) => ({
      ...metric,
      label: t(translationKeys.metrics[index] ?? translationKeys.metrics[0]),
    })),
    statuses: baseDefinition.statuses.map((status, index) => ({
      ...status,
      title: t(translationKeys.titles[index] ?? translationKeys.titles[0]),
      value: t(translationKeys.values[index] ?? translationKeys.values[0]),
      detail: t(translationKeys.details[index] ?? translationKeys.details[0]),
    })),
  };
  const rootRef = useRef<HTMLDivElement>(null);
  const usesCollapsingHero = variant === 'pool';

  useEffect(() => {
    if (!usesCollapsingHero) return undefined;

    const root = rootRef.current;
    const scrollContainer = root?.closest('main') as HTMLElement | null;
    if (!root || !scrollContainer) return undefined;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let animationFrame = 0;
    const updateProgress = () => {
      animationFrame = 0;
      const progress = reducedMotion.matches
        ? 0
        : Math.max(0, Math.min(1, scrollContainer.scrollTop / 220));
      root.style.setProperty('--demo-scroll-progress', progress.toFixed(4));
    };
    const scheduleUpdate = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(updateProgress);
    };

    updateProgress();
    scrollContainer.addEventListener('scroll', scheduleUpdate, { passive: true });
    reducedMotion.addEventListener('change', scheduleUpdate);
    return () => {
      scrollContainer.removeEventListener('scroll', scheduleUpdate);
      reducedMotion.removeEventListener('change', scheduleUpdate);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, [usesCollapsingHero]);

  const rootStyle = {
    '--coming-soon-accent': definition.accent,
    '--demo-scroll-progress': 0,
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      data-testid={`coming-soon-demo-${variant}`}
      className="relative isolate min-h-full bg-[color:var(--ui-bg-grouped)] pb-6 md:grid md:grid-cols-1 md:gap-5 md:px-6 md:pt-6 lg:px-8 xl:grid-cols-12 xl:px-10"
      style={rootStyle}
    >
      <section
        data-testid="coming-soon-demo-hero"
        className={`${usesCollapsingHero
          ? 'sticky top-0 z-0 h-[52svh] min-h-[25rem] max-h-[28.75rem] rounded-none'
          : 'sticky top-0 z-0 h-[70svh] min-h-[30rem] max-h-[36rem] rounded-b-[2rem]'} overflow-hidden text-white [will-change:transform] md:static md:h-auto md:max-h-none md:min-h-[30rem] md:rounded-[2rem] xl:col-span-8`}
      >
        <img
          src={definition.image}
          alt={definition.imageAlt}
          className="absolute inset-0 h-full w-full object-cover object-center motion-reduce:!transform-none"
          style={usesCollapsingHero ? {
            transform: 'translate3d(0, calc(var(--demo-scroll-progress) * 18px), 0) scale(calc(1.045 - var(--demo-scroll-progress) * 0.045))',
            transformOrigin: 'center top',
          } : undefined}
        />
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.18)_0%,rgba(2,6,23,0.12)_38%,rgba(2,6,23,0.9)_100%)]" />
        {usesCollapsingHero ? (
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-black motion-reduce:hidden"
            style={{ opacity: 'calc(var(--demo-scroll-progress) * 0.5)' }}
          />
        ) : null}
        <div className="relative z-10 flex h-full min-h-[28rem] flex-col px-4 pb-12 pt-[calc(env(safe-area-inset-top)+1.25rem)] sm:p-7 lg:p-8">
          <div
            data-testid="coming-soon-demo-header"
            className="flex items-start justify-between gap-3 motion-reduce:!transform-none motion-reduce:!opacity-100"
            style={usesCollapsingHero ? {
              opacity: 'calc(1 - var(--demo-scroll-progress) * 1.15)',
              transform: 'translate3d(0, calc(var(--demo-scroll-progress) * -24px), 0)',
            } : undefined}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/25 bg-black/25 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] backdrop-blur-xl">
                  {t('preview.demo')}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/65">{t('preview.nonInteractive')}</span>
              </div>
              <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">{definition.eyebrow}</p>
              <h1 className="mt-1 max-w-xl text-[2rem] font-semibold leading-[0.98] tracking-[-0.045em] sm:text-[2.8rem]">
                {definition.headline}
              </h1>
              <p className="mt-2 max-w-md text-xs leading-5 text-white/72 sm:text-sm">{definition.summary}</p>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/22 bg-black/25 text-white backdrop-blur-xl sm:h-11 sm:w-11">
              {variant === 'pool' ? <Waves className="h-5 w-5" /> : <Gauge className="h-5 w-5" />}
            </span>
          </div>

          <div
            className={`${usesCollapsingHero ? 'hidden md:grid' : 'grid'} mt-auto grid-cols-3 gap-2 pt-8 motion-reduce:!transform-none motion-reduce:!opacity-100`}
            style={usesCollapsingHero ? {
              opacity: 'calc(1 - var(--demo-scroll-progress) * 0.72)',
              transform: 'translate3d(0, calc(var(--demo-scroll-progress) * -12px), 0)',
            } : undefined}
          >
            {definition.metrics.map((metric) => (
              <DemoMetricCard key={metric.label} metric={metric} />
            ))}
          </div>
        </div>
      </section>

      <section
        data-testid="coming-soon-demo-sheet"
        className={`${usesCollapsingHero
          ? 'sticky top-[calc(env(safe-area-inset-top)+0.5rem)] z-10 isolate -mt-28 min-h-[calc(100svh-env(safe-area-inset-top)-7.75rem)] rounded-t-[2rem] border-0 bg-transparent px-4 pb-8 pt-5 shadow-[0_-12px_34px_rgba(2,6,23,0.12)]'
          : 'relative z-10 -mt-8 min-h-[calc(100svh-5rem)] rounded-t-[2rem] border border-b-0 bg-[color:var(--ui-surface-primary)] p-4 pb-8 shadow-[0_-18px_44px_rgba(2,6,23,0.2)]'} flex flex-col border-[color:var(--ui-border)] md:static md:mt-0 md:min-h-0 md:rounded-[1.7rem] md:border md:bg-[color:var(--ui-surface-primary)] md:p-5 md:shadow-[var(--ui-shadow-card)] xl:col-span-4`}
      >
        {usesCollapsingHero ? (
          <>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-20 overflow-hidden rounded-t-[2rem] md:hidden"
              style={{
                background: 'linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--ui-bg-grouped) 62%, transparent) 8rem, var(--ui-bg-grouped) 15rem)',
              }}
            />
            <div
              data-testid="coming-soon-demo-sheet-backdrop"
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-10 rounded-t-[2rem] bg-[color:var(--ui-bg-grouped)] motion-reduce:!opacity-100 md:hidden"
              style={{ opacity: 'calc(var(--demo-scroll-progress) * 0.96)' }}
            />
          </>
        ) : null}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--ui-text-tertiary)]">{t('preview.data')}</p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.035em] text-[color:var(--ui-text-primary)]">{t('preview.overview')}</h2>
          </div>
          <span className="rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--ui-text-secondary)]">
            {t('preview.demo')}
          </span>
        </div>

        {usesCollapsingHero ? (
          <div data-testid="coming-soon-demo-mobile-metrics" className="mt-4 grid grid-cols-3 gap-2 md:hidden">
            {definition.metrics.map((metric) => (
              <DemoSheetMetricCard key={`sheet-${metric.label}`} metric={metric} />
            ))}
          </div>
        ) : null}

        <div className="mt-4 space-y-2.5">
          {definition.statuses.map((status) => (
            <DemoStatusCard key={status.title} status={status} elevated={usesCollapsingHero} />
          ))}
        </div>

        <div className="mt-auto pt-4">
          <div className="rounded-[1.25rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] p-3.5">
            <div className="flex items-center gap-2 text-[color:var(--ui-text-primary)]">
              <Clock3 className="h-4 w-4 text-[color:var(--coming-soon-accent)]" />
              <p className="text-xs font-semibold">{t('preview.comingSoon')}</p>
            </div>
            <p className="mt-1.5 text-[10px] leading-4 text-[color:var(--ui-text-secondary)]">
              {t('preview.disclaimer')}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function DemoMetricCard({ metric }: { metric: DemoMetric }) {
  const Icon = metric.icon;
  return (
    <div className="rounded-[1.15rem] border border-white/18 bg-black/28 px-2 py-3 text-center backdrop-blur-xl sm:px-3">
      <Icon className="mx-auto h-4 w-4 text-[color:var(--coming-soon-accent)]" strokeWidth={1.9} />
      <p className="mt-1 truncate text-[9px] text-white/58 sm:text-[10px]">{metric.label}</p>
      <p className="mt-0.5 truncate text-xs font-semibold text-white sm:text-sm">{metric.value}</p>
    </div>
  );
}

function DemoStatusCard({ status, elevated = false }: { status: DemoStatus; elevated?: boolean }) {
  const Icon = status.icon;
  return (
    <article className={`rounded-[1.2rem] border border-[color:var(--ui-border)] p-3 ${elevated ? 'bg-[color:var(--ui-surface-primary)] shadow-[var(--ui-shadow-control)]' : 'bg-[color:var(--ui-fill-tertiary)]'}`}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--coming-soon-accent)]" strokeWidth={1.9} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-xs font-semibold text-[color:var(--ui-text-primary)]">{status.title}</p>
            <p className="shrink-0 text-[9px] font-semibold text-[color:var(--ui-text-secondary)]">{status.value}</p>
          </div>
          <p className="mt-1 truncate text-[9px] text-[color:var(--ui-text-muted)]">{status.detail}</p>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-[color:var(--ui-fill-secondary)]">
            <span
              className="block h-full rounded-full bg-[color:var(--coming-soon-accent)] opacity-80"
              style={{ width: `${status.progress}%` }}
            />
          </div>
        </div>
      </div>
    </article>
  );
}

function DemoSheetMetricCard({ metric }: { metric: DemoMetric }) {
  const Icon = metric.icon;
  return (
    <div
      className="min-w-0 rounded-[1.1rem] border border-[color:var(--ui-border)] px-2 py-3 text-center shadow-[var(--ui-shadow-control)] backdrop-blur-2xl"
      style={{ backgroundColor: 'color-mix(in srgb, var(--ui-surface-primary) 78%, transparent)' }}
    >
      <Icon className="mx-auto h-4 w-4 text-[color:var(--coming-soon-accent)]" strokeWidth={1.9} />
      <p className="mt-1 truncate text-[9px] text-[color:var(--ui-text-muted)]">{metric.label}</p>
      <p className="mt-0.5 truncate text-xs font-semibold text-[color:var(--ui-text-primary)]">{metric.value}</p>
    </div>
  );
}

export default ComingSoonAppDemo;
