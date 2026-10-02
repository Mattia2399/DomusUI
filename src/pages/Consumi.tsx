import React from 'react';
import { BarChart3, Battery, Bolt, Droplets, Flame, FlaskConical, MoreHorizontal, SunMedium, TowerControl } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  DEFAULT_DASHBOARD_DATA,
  type ConsumptionCardId,
  type ConsumptionDashboardData,
  type ConsumptionEntityConfig,
} from '../hooks/useConsumptionConfig';
import { AcquaDetail } from './consumi/AcquaDetail';
import { EnergiaDetailView } from './consumi/EnergiaDetail';
import { buildEnergyOverview, type EnergyOverview, type EnergyOverviewMetric, type EnergyOverviewTone } from './consumi/energy/energyOverviewModel';
import { useEnergyCore, type EnergyPageContext } from './consumi/energy/useEnergyCore';
import { GasDetail } from './consumi/GasDetail';
import { ReportDetail } from './consumi/ReportDetail';
import type { IntervalKey } from './consumi/shared';

type Props = {
  embedded?: boolean;
  suppressBrowserNavigation?: boolean;
  navigationRoute?: string;
  data?: ConsumptionDashboardData;
  config?: ConsumptionEntityConfig;
  isEditMode?: boolean;
  compactEditMode?: boolean;
  selectedCardId?: ConsumptionCardId | null;
  onSelectCard?: (cardId: ConsumptionCardId) => void;
  onDetailViewChange?: (isDetailView: boolean) => void;
  /** Home Assistant access for the Domus Energy subpage. */
  energy?: EnergyPageContext;
};

type ActiveView = 'overview' | ConsumptionCardId;

type UtilityMetric = {
  value: string;
  label: string;
};

type UtilityCardDefinition = {
  id: ConsumptionCardId;
  title: string;
  metrics: UtilityMetric[];
  icon: React.ReactNode;
  accentClassName: string;
  preview?: boolean;
};

const ENERGY_STATUS_VISUALS: Record<EnergyOverviewTone, { accent: string; dotClassName: string }> = {
  neutral: {
    accent: '#8E8E93',
    dotClassName: 'bg-[#8E8E93]',
  },
  warning: {
    accent: '#FF9F0A',
    dotClassName: 'bg-[#FF9F0A] glow-active-orange shadow-[0_0_20px_rgba(255,159,10,0.38)]',
  },
  success: {
    accent: '#32D74B',
    dotClassName: 'bg-[#32D74B] glow-active-green',
  },
  info: {
    accent: '#64D2FF',
    dotClassName: 'bg-[#64D2FF] glow-active-blue',
  },
};

const DEFAULT_CARD_TITLES: Record<ConsumptionCardId, string> = {
  electricity: 'Energia',
  water: 'Acqua',
  gas: 'Gas',
  trend: 'Report',
};

const DEFAULT_CARD_ROUTES: Record<ConsumptionCardId, string> = {
  electricity: '/consumi/energia',
  water: '/consumi/acqua',
  gas: '/consumi/gas',
  trend: '/consumi/report',
};

const FALLBACK_SEGMENT_CARD: Record<string, ConsumptionCardId> = {
  energia: 'electricity',
  elettricita: 'electricity',
  electricity: 'electricity',
  acqua: 'water',
  water: 'water',
  gas: 'gas',
  metano: 'gas',
  report: 'trend',
  trend: 'trend',
};

const DETAIL_INTERVAL_DEFAULT: Record<ConsumptionCardId, IntervalKey> = {
  electricity: '24H',
  water: '24H',
  gas: '24H',
  trend: '30G',
};

function cn(...values: Array<string | false | null | undefined>) {
  return twMerge(clsx(values));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeRoute(route: string, fallback: string) {
  const trimmed = route.trim();
  if (!trimmed) {
    return fallback;
  }
  if (
    trimmed.startsWith('/') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('?') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://')
  ) {
    return trimmed;
  }
  return `/${trimmed}`;
}

function isConsumptionRoute(route: string) {
  try {
    const parsed = new URL(route, 'http://dashboard.local');
    const pathname = parsed.pathname.toLowerCase();
    const hash = parsed.hash.toLowerCase();
    const view = (parsed.searchParams.get('view') ?? '').trim().toLowerCase();
    const pathSegments = pathname.split('/').filter(Boolean);
    const hashNormalized = hash.replace(/^#/, '').replace(/^\//, '');
    const hashSegments = hashNormalized.split('/').filter(Boolean);
    const pathHasConsumi = pathSegments.includes('consumi');
    const hashHasConsumi = hashSegments.includes('consumi') || hashNormalized === 'consumi';

    return pathHasConsumi || hash === '#consumi' || hashHasConsumi || view === 'consumi';
  } catch {
    return false;
  }
}

function isRouteMatch(currentHref: string, route: string) {
  try {
    const current = new URL(currentHref, 'http://dashboard.local');
    const target = new URL(route, 'http://dashboard.local');
    const currentPath = current.pathname.toLowerCase();
    const targetPath = target.pathname.toLowerCase();

    if (currentPath === targetPath || currentPath.startsWith(`${targetPath}/`)) {
      return true;
    }

    const currentHash = current.hash.toLowerCase().replace(/^#/, '').replace(/^\//, '');
    const targetHash = target.hash.toLowerCase().replace(/^#/, '').replace(/^\//, '');
    return Boolean(targetHash) && (currentHash === targetHash || currentHash.startsWith(`${targetHash}/`));
  } catch {
    return false;
  }
}

function resolveOverviewRoute(href: string) {
  try {
    const parsed = new URL(href, 'http://dashboard.local');
    const pathSegments = parsed.pathname.split('/').filter(Boolean);
    const hashNormalized = parsed.hash.replace(/^#/, '').replace(/^\//, '');
    const hashSegments = hashNormalized.split('/').filter(Boolean);

    const pathIndex = pathSegments.findIndex((segment) => segment.toLowerCase() === 'consumi');
    if (pathIndex >= 0) {
      return `/${pathSegments.slice(0, pathIndex + 1).join('/')}`;
    }

    const hashIndex = hashSegments.findIndex((segment) => segment.toLowerCase() === 'consumi');
    if (hashIndex >= 0) {
      return `#/${hashSegments.slice(0, hashIndex + 1).join('/')}`;
    }
  } catch {
    return '/consumi';
  }

  return '/consumi';
}

function resolveActiveViewFromLocation(
  href: string,
  routesByCard: Record<ConsumptionCardId, string>,
): ActiveView {
  const match = (Object.entries(routesByCard) as Array<[ConsumptionCardId, string]>).find(([, route]) =>
    isRouteMatch(href, route),
  );
  if (match) {
    return match[0];
  }

  try {
    const parsed = new URL(href, 'http://dashboard.local');
    const pathSegments = parsed.pathname.toLowerCase().split('/').filter(Boolean);
    const hashNormalized = parsed.hash.toLowerCase().replace(/^#/, '').replace(/^\//, '');
    const hashSegments = hashNormalized.split('/').filter(Boolean);

    const pathIndex = pathSegments.indexOf('consumi');
    if (pathIndex >= 0) {
      const next = pathSegments[pathIndex + 1];
      return next && FALLBACK_SEGMENT_CARD[next] ? FALLBACK_SEGMENT_CARD[next] : 'overview';
    }

    const hashIndex = hashSegments.indexOf('consumi');
    if (hashIndex >= 0) {
      const next = hashSegments[hashIndex + 1];
      return next && FALLBACK_SEGMENT_CARD[next] ? FALLBACK_SEGMENT_CARD[next] : 'overview';
    }
  } catch {
    return 'overview';
  }

  return 'overview';
}

function formatDecimal(value: number, digits = 1) {
  return value.toLocaleString('it-IT', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function EnergyMetricIcon({ metric }: { metric: EnergyOverviewMetric }) {
  if (metric.key === 'grid') return <TowerControl size={20} />;
  if (metric.key === 'solar') return <SunMedium size={20} />;
  if (metric.key === 'battery') return <Battery size={20} />;
  return <Bolt size={20} />;
}

function EnergyOverviewCard({
  overview,
  statusVisual,
  compactEditMode,
  active,
  onClick,
}: {
  overview: EnergyOverview;
  statusVisual: { accent: string; dotClassName: string };
  compactEditMode: boolean;
  active: boolean;
  onClick: () => void;
}) {
  const [home, ...secondary] = overview.metrics;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Energia · ${overview.notice.label}`}
      className={cn(
        'group relative min-h-[27rem] overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#071018] p-5 text-left text-white shadow-[0_30px_80px_rgba(0,0,0,0.34)] transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20 active:translate-y-0 sm:min-h-[31rem] sm:rounded-[2.25rem] sm:p-8',
        active ? 'border-sky-300/50 shadow-[0_0_0_1px_rgba(125,211,252,0.3),0_30px_80px_rgba(0,0,0,0.34)]' : '',
      )}
    >
      {compactEditMode ? (
        <span className="pointer-events-none absolute right-4 top-4 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/35 text-white/80 backdrop-blur-xl">
          <MoreHorizontal size={17} aria-hidden="true" />
        </span>
      ) : null}

      <div className="relative z-10 flex h-full min-h-[23rem] flex-col sm:min-h-[27rem]">
        <div className="flex flex-wrap items-start justify-between gap-4 pr-10 sm:pr-0">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">Sezione principale</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">Energia</h2>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 backdrop-blur-xl">
            <span className="relative flex h-2 w-2 items-center justify-center" aria-hidden="true">
              <span className="absolute inset-0 rounded-full opacity-35 blur-[3px]" style={{ backgroundColor: statusVisual.accent }} />
              <span className={cn('relative h-1.5 w-1.5 rounded-full', statusVisual.dotClassName)} />
            </span>
            <span className="text-[9px] font-semibold uppercase tracking-[0.15em]" style={{ color: statusVisual.accent }}>
              {overview.notice.label}
            </span>
          </span>
        </div>

        <div className="mt-8 sm:mt-10">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/45">{home.label}</p>
          <p className="mt-2 text-5xl font-semibold tracking-[-0.055em] text-white sm:text-7xl">{home.value}</p>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/55">{overview.notice.text}</p>
        </div>

        <div className="mt-auto grid grid-cols-3 gap-2 border-t border-white/[0.08] pt-5 sm:gap-4 sm:pt-6">
          {secondary.map((metric) => (
            <div key={metric.key} className="min-w-0 rounded-2xl border border-white/[0.07] bg-white/[0.035] p-3 backdrop-blur-md sm:p-4">
              <span className="text-white/55"><EnergyMetricIcon metric={metric} /></span>
              <p className="mt-3 truncate text-lg font-semibold tracking-tight text-white sm:text-2xl">{metric.value}</p>
              <p className="mt-1 line-clamp-2 text-[9px] uppercase leading-relaxed tracking-[0.12em] text-white/40 sm:text-[10px]">{metric.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between text-xs font-semibold text-white/65 sm:mt-6">
          <span>Apri i flussi energetici</span>
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
            <span aria-hidden="true" className="text-base">↗</span>
          </span>
        </div>
      </div>
    </button>
  );
}

function UtilityCard({
  title,
  metrics,
  icon,
  accentClassName,
  preview = false,
  compactEditMode,
  active,
  onClick,
}: {
  title: string;
  metrics: UtilityMetric[];
  icon: React.ReactNode;
  accentClassName: string;
  preview?: boolean;
  compactEditMode: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative min-h-[10rem] cursor-pointer overflow-hidden rounded-[1.35rem] border border-white/10 bg-white/[0.06] p-4 text-left backdrop-blur-2xl sm:min-h-[12rem] sm:rounded-[1.75rem] sm:p-5 xl:min-h-0 xl:flex-1',
        'flex flex-col justify-between transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/[0.1] active:translate-y-0',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_24px_50px_rgba(0,0,0,0.3)]',
        active ? 'border-sky-300/45 bg-sky-400/12 shadow-[0_0_0_1px_rgba(125,211,252,0.32)]' : '',
      )}
    >
      <div className={cn('pointer-events-none absolute inset-0 opacity-80', accentClassName)} />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(150deg,rgba(255,255,255,0.18)_0%,rgba(255,255,255,0.04)_38%,rgba(15,23,42,0.18)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.04),rgba(2,6,23,0.28)_78%)]" />
      {compactEditMode ? (
        <span className="pointer-events-none absolute right-2 top-2 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/35 text-white/85 shadow-[0_10px_24px_rgba(0,0,0,0.28)] backdrop-blur-xl">
          <MoreHorizontal size={16} aria-hidden="true" />
        </span>
      ) : null}

      <div className="relative z-10 flex items-center gap-2 pr-12">
        <h3 className="min-w-0 truncate text-xl font-semibold tracking-tight text-white sm:text-2xl">{title}</h3>
        {preview ? (
          <span className="shrink-0 rounded-full border border-white/20 bg-black/25 px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.12em] text-white/75 sm:text-[10px]">
            Anteprima
          </span>
        ) : null}
      </div>

      <div className="relative z-10 mt-5 grid grid-cols-3 gap-2 pr-8 sm:mt-6 sm:pr-10">
        {metrics.map((metric) => (
          <div key={`${title}-${metric.label}`} className="min-w-0">
            <p className="truncate text-sm font-bold leading-none text-white sm:text-lg">{metric.value}</p>
            <p className="mt-1 line-clamp-2 text-[8px] uppercase leading-tight tracking-[0.08em] text-white/45 sm:text-[9px]">{metric.label}</p>
          </div>
        ))}
      </div>

      <div className="pointer-events-none absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white/85 shadow-[0_14px_28px_rgba(0,0,0,0.32)] [&>svg]:h-5 [&>svg]:w-5 sm:bottom-4 sm:right-4 sm:h-12 sm:w-12 sm:rounded-2xl sm:[&>svg]:h-6 sm:[&>svg]:w-6">
        {icon}
      </div>
    </button>
  );
}

export function ConsumptionDashboardPage({
  embedded,
  suppressBrowserNavigation = false,
  navigationRoute,
  data,
  config,
  isEditMode = false,
  compactEditMode = false,
  selectedCardId = null,
  onSelectCard,
  onDetailViewChange,
  energy,
}: Props) {
  const dashboardData = data ?? DEFAULT_DASHBOARD_DATA;
  const energyCore = useEnergyCore(energy);
  const energyOverview = buildEnergyOverview(energyCore);

  const cardTitles = DEFAULT_CARD_TITLES;
  const routesByCard = DEFAULT_CARD_ROUTES;

  const [activeView, setActiveView] = React.useState<ActiveView>(() => {
    if (typeof window === 'undefined') {
      return 'overview';
    }
    return resolveActiveViewFromLocation(window.location.href, routesByCard);
  });

  const [detailIntervals, setDetailIntervals] =
    React.useState<Record<ConsumptionCardId, IntervalKey>>(DETAIL_INTERVAL_DEFAULT);
  const overviewRoute = React.useMemo(() => {
    if (typeof window === 'undefined') {
      return '/consumi';
    }
    const fromLocation = resolveOverviewRoute(window.location.href);
    if (fromLocation !== '/consumi') {
      return fromLocation;
    }
    return resolveOverviewRoute(routesByCard.electricity);
  }, [routesByCard.electricity]);

  const pushRoute = React.useCallback((targetRoute: string, replace = false) => {
    if (typeof window === 'undefined' || suppressBrowserNavigation) {
      return;
    }

    const normalizedTarget = normalizeRoute(targetRoute, '/consumi');
    if (/^https?:\/\//i.test(normalizedTarget)) {
      if (normalizedTarget !== window.location.href) {
        window.location.assign(normalizedTarget);
      }
      return;
    }

    try {
      const target = new URL(normalizedTarget, window.location.origin);
      const next = `${target.pathname}${target.search}${target.hash}`;
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;

      if (next === current) {
        return;
      }
      if (replace) {
        window.history.replaceState({}, '', next);
      } else {
        window.history.pushState({}, '', next);
      }
    } catch {
      if (replace) {
        window.history.replaceState({}, '', normalizedTarget);
      } else {
        window.history.pushState({}, '', normalizedTarget);
      }
    }
  }, [suppressBrowserNavigation]);

  React.useEffect(() => {
    if (typeof window === 'undefined' || suppressBrowserNavigation) {
      return undefined;
    }

    const handlePopState = () => {
      setActiveView(resolveActiveViewFromLocation(window.location.href, routesByCard));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [routesByCard, suppressBrowserNavigation]);

  React.useEffect(() => {
    if (typeof window === 'undefined' || suppressBrowserNavigation) {
      return;
    }
    setActiveView(resolveActiveViewFromLocation(window.location.href, routesByCard));
  }, [routesByCard, suppressBrowserNavigation]);

  React.useEffect(() => {
    if (!suppressBrowserNavigation || !navigationRoute) {
      return;
    }
    setActiveView(resolveActiveViewFromLocation(navigationRoute, routesByCard));
  }, [navigationRoute, routesByCard, suppressBrowserNavigation]);

  React.useEffect(() => {
    if (!isEditMode || activeView === 'overview') {
      return;
    }
    setActiveView('overview');
    pushRoute(overviewRoute, true);
  }, [activeView, isEditMode, overviewRoute, pushRoute]);

  React.useEffect(() => {
    onDetailViewChange?.(activeView !== 'overview');
  }, [activeView, onDetailViewChange]);

  const setIntervalForCard = React.useCallback((cardId: ConsumptionCardId, value: IntervalKey) => {
    setDetailIntervals((current) => ({
      ...current,
      [cardId]: value,
    }));
  }, []);

  const handleCardClick = React.useCallback(
    (cardId: ConsumptionCardId) => {
      onSelectCard?.(cardId);
      if (isEditMode) {
        return;
      }

      const targetRoute = routesByCard[cardId];
      if (!isConsumptionRoute(targetRoute)) {
        if (suppressBrowserNavigation) {
          return;
        }
        if (typeof window !== 'undefined') {
          window.location.assign(normalizeRoute(targetRoute, '/'));
        }
        return;
      }

      setActiveView(cardId);
      pushRoute(targetRoute);
    },
    [isEditMode, onSelectCard, pushRoute, routesByCard, suppressBrowserNavigation],
  );

  const handleBackToOverview = React.useCallback(() => {
    setActiveView('overview');
    pushRoute(overviewRoute);
  }, [overviewRoute, pushRoute]);

  const efficienzaAcqua = clamp(
    Number(
      (
        100 -
        (dashboardData.waterCurrentLiters / Math.max(1, dashboardData.waterGoalLiters)) * 28.5
      ).toFixed(1),
    ),
    0,
    100,
  );
  const flussoMassimo = Math.max(1, Math.round(dashboardData.waterCurrentLiters / 16));

  const consumoGas = Number((dashboardData.gasTodayCubicMeters * 3.5).toFixed(1));
  const potenzaTermica = Number((consumoGas * 4.14).toFixed(1));
  const utilizzoGas = clamp(Number((consumoGas * 8.5).toFixed(1)), 0, 100);
  const energyStatusVisual = ENERGY_STATUS_VISUALS[energyOverview.notice.tone];

  const utilityCards = React.useMemo<UtilityCardDefinition[]>(
    () => [
      {
        id: 'water',
        title: cardTitles.water,
        metrics: [
          { value: `${Math.round(dashboardData.waterCurrentLiters)} L`, label: 'Erogazione Totale' },
          { value: `${flussoMassimo} L/m`, label: 'Flusso Massimo' },
          { value: `${formatDecimal(efficienzaAcqua)}%`, label: 'Efficienza Rete' },
        ],
        icon: <Droplets size={48} />,
        accentClassName: 'bg-cyan-400/10',
        preview: true,
      },
      {
        id: 'gas',
        title: cardTitles.gas,
        metrics: [
          { value: `${formatDecimal(consumoGas)} Sm3`, label: 'Consumo Attivo' },
          { value: `${formatDecimal(potenzaTermica)} kW`, label: 'Potenza Termica' },
          { value: `${formatDecimal(utilizzoGas)}%`, label: 'Utilizzo Medio' },
        ],
        icon: <Flame size={48} />,
        accentClassName: 'bg-orange-400/10',
        preview: true,
      },
      {
        id: 'trend',
        title: cardTitles.trend,
        metrics: [
          { value: '24', label: 'Report Attivi' },
          { value: '147', label: 'Download Totali' },
          { value: '12', label: 'Condivisi' },
        ],
        icon: <BarChart3 size={48} />,
        accentClassName: 'bg-sky-400/10',
        preview: true,
      },
    ],
    [
      cardTitles.gas,
      cardTitles.trend,
      cardTitles.water,
      consumoGas,
      dashboardData.waterCurrentLiters,
      efficienzaAcqua,
      flussoMassimo,
      potenzaTermica,
      utilizzoGas,
    ],
  );

  const detailContent = React.useMemo(() => {
    if (activeView === 'overview') {
      return null;
    }

    const interval = detailIntervals[activeView];
    const title = `Dettaglio ${cardTitles[activeView]}`;
    const onIntervalChange = (value: IntervalKey) => setIntervalForCard(activeView, value);

    if (activeView === 'electricity') {
      return <EnergiaDetailView title={title} onBack={handleBackToOverview} energy={energy} energyCore={energyCore} />;
    }
    if (activeView === 'water') {
      return (
        <AcquaDetail
          title={title}
          interval={interval}
          onIntervalChange={onIntervalChange}
          onBack={handleBackToOverview}
          dashboardData={dashboardData}
          config={config}
        />
      );
    }
    if (activeView === 'gas') {
      return (
        <GasDetail
          title={title}
          interval={interval}
          onIntervalChange={onIntervalChange}
          onBack={handleBackToOverview}
        />
      );
    }
    return (
      <ReportDetail
        title={title}
        interval={interval}
        onIntervalChange={onIntervalChange}
        onBack={handleBackToOverview}
      />
    );
  }, [activeView, cardTitles, config, dashboardData, detailIntervals, energy, energyCore, handleBackToOverview, setIntervalForCard]);

  return (
    <div className={cn('relative h-full w-full overflow-hidden text-[color:var(--ui-text-primary)]', embedded ? '' : 'min-h-screen')}>
      <div className="relative z-10 h-full min-h-0">
        {activeView === 'overview' ? (
          <div className="h-full min-h-0 overflow-y-auto px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+6.25rem)] sm:p-6 sm:pb-[calc(env(safe-area-inset-bottom)+1.5rem)] lg:p-10">
            <div className="flex min-h-full flex-col">
              <header>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="dashboard-page-title">
                    Hub Sostenibilità e Consumi
                  </h1>
                  <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-3 text-[10px] font-semibold uppercase tracking-[0.13em] text-[color:var(--ui-text-secondary)]">
                    <FlaskConical size={13} />
                    Anteprima beta
                  </span>
                </div>
                <p className="mt-2 max-w-3xl text-xs leading-relaxed text-[color:var(--ui-text-tertiary)] sm:text-sm">
                  Le misurazioni Energia arrivano esclusivamente da Domus Energy. Acqua, Gas e Report restano anteprime dove indicato.
                </p>
              </header>

              <section className="mt-5 grid gap-4 sm:mt-7 sm:gap-6 xl:grid-cols-12 xl:gap-8" aria-label="Panoramica consumi">
                <div className="xl:col-span-8">
                  <EnergyOverviewCard
                    overview={energyOverview}
                    statusVisual={energyStatusVisual}
                    compactEditMode={compactEditMode}
                    active={isEditMode && selectedCardId === 'electricity'}
                    onClick={() => handleCardClick('electricity')}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-3 sm:gap-4 xl:col-span-4 xl:flex xl:flex-col xl:gap-4">
                  {utilityCards.map((card) => (
                    <UtilityCard
                      key={card.id}
                      title={card.title}
                      metrics={card.metrics}
                      icon={card.icon}
                      accentClassName={card.accentClassName}
                      preview={card.preview}
                      compactEditMode={compactEditMode}
                      active={isEditMode && selectedCardId === card.id}
                      onClick={() => handleCardClick(card.id)}
                    />
                  ))}
                </div>
              </section>
            </div>
          </div>
        ) : (
          detailContent
        )}
      </div>
    </div>
  );
}

export default ConsumptionDashboardPage;
