import React from 'react';
import { BarChart3, Bolt, Droplets, Flame, FlaskConical, Gauge, Leaf, MoreHorizontal, Radio } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  DEFAULT_DASHBOARD_DATA,
  type ConsumptionCardId,
  type ConsumptionDashboardData,
  type ConsumptionEntityConfig,
} from '../hooks/useConsumptionConfig';
import { AcquaDetail } from './consumi/AcquaDetail';
import { EnergiaDetail } from './consumi/EnergiaDetail';
import type { EnergyPageContext } from './consumi/energy/useEnergyCore';
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
  glowClassName: string;
  accentClassName: string;
  backdropStyle: React.CSSProperties;
};

type GlobalMetricDefinition = {
  value: string;
  label: string;
  icon: React.ReactNode;
};

type SmartInsightStatus = 'critical' | 'warning' | 'success' | 'info';

type SmartInsight = {
  text: string;
  status: SmartInsightStatus;
};

type SmartInsightEnergyState = {
  currentPowerKw: number;
  autosufficiencyPct: number;
};

type SmartInsightWaterState = {
  currentLiters: number;
  goalLiters: number;
  flowLitersPerMin: number;
};

type SmartInsightGasState = {
  todayCubicMeters: number;
  thermalPowerKw: number;
  utilizationPct: number;
};

const SMART_INSIGHT_VISUALS: Record<SmartInsightStatus, { accent: string; label: string; dotClassName: string }> = {
  critical: {
    accent: '#FF3B30',
    label: 'Criticità rete',
    dotClassName: 'bg-[#FF3B30] glow-active-red animate-pulse [animation-duration:1.25s]',
  },
  warning: {
    accent: '#FF9F0A',
    label: 'Ottimizzazione',
    dotClassName: 'bg-[#FF9F0A] glow-active-orange shadow-[0_0_20px_rgba(255,159,10,0.38)]',
  },
  success: {
    accent: '#32D74B',
    label: 'Bilancio positivo',
    dotClassName: 'bg-[#32D74B] glow-active-green',
  },
  info: {
    accent: '#64D2FF',
    label: 'Anomalia acqua',
    dotClassName: 'bg-[#64D2FF] glow-active-blue',
  },
};

function resolveSmartInsight(
  energyState: SmartInsightEnergyState,
  waterState: SmartInsightWaterState,
  gasState: SmartInsightGasState,
): SmartInsight {
  if (energyState.currentPowerKw > 5) {
    return {
      text: '⚠️ Carico di rete critico. Rischio distacco contatore imminente. Valuta di spegnere i carichi pesanti.',
      status: 'critical',
    };
  }

  if (energyState.autosufficiencyPct >= 100 && energyState.currentPowerKw <= 2.5) {
    return {
      text: '☀️ Splende il sole. La casa è autosufficiente al 100%. Hai energia in eccesso da poter sfruttare per i tuoi elettrodomestici.',
      status: 'warning',
    };
  }

  const hasSustainedWaterFlow =
    waterState.flowLitersPerMin >= 18 &&
    waterState.currentLiters >= waterState.goalLiters * 0.75;
  if (hasSustainedWaterFlow) {
    return {
      text: "💧 Attenzione: rilevato un flusso d'acqua costante. Verifica che non ci siano rubinetti rimasti aperti in giardino o nei bagni.",
      status: 'info',
    };
  }

  return {
    text: '📉 Ottimo bilancio energetico. Oggi i consumi complessivi sono inferiori del 14% rispetto alla media stagionale della tua abitazione.',
    status: 'success',
  };
}

const svgDataUri = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;

const buildConsumptionCardBackdropStyle = (svg: string, tint: string): React.CSSProperties => ({
  backgroundImage: `${tint}, url("${svgDataUri(svg)}")`,
  backgroundPosition: 'center',
  backgroundSize: 'cover',
});

const CARD_BACKDROP_STYLES: Record<ConsumptionCardId, React.CSSProperties> = {
  electricity: buildConsumptionCardBackdropStyle(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 720">
      <g fill="none" stroke="#bbf7d0" stroke-linecap="round" stroke-linejoin="round">
        <path d="M94 478h246l62-72h174l66 72h276" stroke-opacity=".17" stroke-width="8"/>
        <path d="M132 150h356v236H132z" fill="#22c55e" fill-opacity=".07" stroke-opacity=".22" stroke-width="5"/>
        <path d="M178 198h264M178 250h264M178 302h264M220 150v236M310 150v236M400 150v236" stroke-opacity=".15" stroke-width="4"/>
        <path d="M624 126h196l-58 166h-236zM632 174h166M608 226h170M584 278h174M682 126l-76 166M756 126l-68 166" stroke-opacity=".2" stroke-width="5"/>
        <path d="M516 546c62-42 128-42 198 0s140 42 212 0" stroke-opacity=".11" stroke-width="9"/>
        <circle cx="810" cy="452" r="44" stroke-opacity=".2" stroke-width="6"/>
        <path d="M810 384v-52M810 572v-52M878 452h52M690 452h52M858 404l38-38M724 538l38-38M858 500l38 38M724 366l38 38" stroke-opacity=".16" stroke-width="6"/>
      </g>
    </svg>`,
    'radial-gradient(84% 80% at 24% 22%, rgba(74,222,128,0.2), transparent 60%), linear-gradient(135deg, rgba(16,185,129,0.15), rgba(14,165,233,0.05) 62%, rgba(2,6,23,0.02))',
  ),
  water: buildConsumptionCardBackdropStyle(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 720">
      <g fill="none" stroke="#a5f3fc" stroke-linecap="round" stroke-linejoin="round">
        <path d="M54 246c80 38 160 38 240 0s160-38 240 0 160 38 240 0 160-38 240 0" stroke-opacity=".23" stroke-width="8"/>
        <path d="M26 344c82 36 166 36 250 0s168-36 252 0 168 36 252 0 168-36 252 0" stroke-opacity=".18" stroke-width="7"/>
        <path d="M74 444c80 38 160 38 240 0s160-38 240 0 160 38 240 0 160-38 240 0" stroke-opacity=".14" stroke-width="8"/>
        <path d="M328 548h396M356 590h340M410 508v104M500 508v104M590 508v104" stroke-opacity=".11" stroke-width="5"/>
        <path d="M718 166c0 62-44 100-98 100s-98-38-98-100c0-48 62-118 98-166 36 48 98 118 98 166Z" fill="#22d3ee" fill-opacity=".08" stroke-opacity=".22" stroke-width="6"/>
        <path d="M170 164h232v94H170zM212 258v160M360 258v160" stroke-opacity=".16" stroke-width="6"/>
      </g>
    </svg>`,
    'radial-gradient(86% 88% at 68% 20%, rgba(34,211,238,0.2), transparent 58%), linear-gradient(135deg, rgba(6,182,212,0.14), rgba(59,130,246,0.05) 64%, rgba(2,6,23,0.03))',
  ),
  gas: buildConsumptionCardBackdropStyle(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 720">
      <g fill="none" stroke="#fed7aa" stroke-linecap="round" stroke-linejoin="round">
        <path d="M82 548h826M126 496h236c62 0 86-52 140-52h372" stroke-opacity=".16" stroke-width="8"/>
        <path d="M186 496v96M312 496v96M688 444v148M812 444v148" stroke-opacity=".11" stroke-width="6"/>
        <path d="M520 116c62 92-54 126 10 206 52-52 52-106 34-164 120 92 172 188 172 286 0 122-96 206-218 206s-218-84-218-206c0-116 88-192 220-328Z" fill="#fb923c" fill-opacity=".08" stroke-opacity=".21" stroke-width="7"/>
        <path d="M518 348c42 44 70 88 70 144 0 52-34 86-78 86s-78-34-78-86c0-62 42-104 86-144Z" fill="#fdba74" fill-opacity=".09" stroke-opacity=".18" stroke-width="6"/>
        <path d="M204 212h184M204 264h134M204 316h192" stroke-opacity=".14" stroke-width="7"/>
        <circle cx="804" cy="248" r="74" stroke-opacity=".16" stroke-width="6"/>
        <path d="M804 174v148M730 248h148" stroke-opacity=".12" stroke-width="6"/>
      </g>
    </svg>`,
    'radial-gradient(84% 80% at 58% 26%, rgba(251,146,60,0.2), transparent 60%), linear-gradient(135deg, rgba(249,115,22,0.15), rgba(244,63,94,0.04) 62%, rgba(2,6,23,0.03))',
  ),
  trend: buildConsumptionCardBackdropStyle(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 720">
      <g fill="none" stroke="#bae6fd" stroke-linecap="round" stroke-linejoin="round">
        <path d="M144 138h472l166 166v278H144z" fill="#38bdf8" fill-opacity=".06" stroke-opacity=".19" stroke-width="6"/>
        <path d="M616 138v166h166" stroke-opacity=".18" stroke-width="6"/>
        <path d="M218 508h536M218 438l108-86 106 54 118-144 146 100" stroke-opacity=".22" stroke-width="8"/>
        <path d="M238 248h246M238 300h208M238 352h148" stroke-opacity=".14" stroke-width="7"/>
        <rect x="250" y="474" width="42" height="34" rx="10" stroke-opacity=".14" stroke-width="5"/>
        <rect x="358" y="430" width="42" height="78" rx="10" stroke-opacity=".14" stroke-width="5"/>
        <rect x="466" y="392" width="42" height="116" rx="10" stroke-opacity=".14" stroke-width="5"/>
        <rect x="574" y="344" width="42" height="164" rx="10" stroke-opacity=".14" stroke-width="5"/>
        <path d="M114 620c130-38 260-38 390 0s260 38 390 0" stroke-opacity=".1" stroke-width="9"/>
      </g>
    </svg>`,
    'radial-gradient(84% 80% at 30% 20%, rgba(56,189,248,0.2), transparent 60%), linear-gradient(135deg, rgba(14,165,233,0.15), rgba(99,102,241,0.05) 62%, rgba(2,6,23,0.03))',
  ),
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

function formatCurrency(value: number) {
  return value.toLocaleString('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function GlobalMetric({ value, label, icon }: GlobalMetricDefinition) {
  return (
    <div className="dashboard-content-surface min-w-0 rounded-xl p-1.5 shadow-[0_12px_30px_var(--ui-shadow-soft)] sm:rounded-3xl sm:p-4">
      <div className="flex min-w-0 flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)] [&>svg]:h-3 [&>svg]:w-3 sm:h-11 sm:w-11 sm:rounded-2xl sm:[&>svg]:h-5 sm:[&>svg]:w-5">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[0.82rem] font-bold leading-tight tracking-normal text-[color:var(--ui-text-primary)] sm:text-3xl sm:tracking-tight">{value}</p>
          <p className="mt-0.5 text-[0.42rem] font-semibold uppercase leading-[1.05] tracking-[0.06em] text-[color:var(--ui-text-tertiary)] sm:text-xs sm:tracking-[0.16em]">{label}</p>
        </div>
      </div>
    </div>
  );
}

function UtilityCard({
  title,
  metrics,
  icon,
  glowClassName,
  accentClassName,
  backdropStyle,
  compactEditMode,
  active,
  onClick,
}: {
  title: string;
  metrics: UtilityMetric[];
  icon: React.ReactNode;
  glowClassName: string;
  accentClassName: string;
  backdropStyle: React.CSSProperties;
  compactEditMode: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative min-h-[12.25rem] cursor-pointer overflow-hidden rounded-[1.35rem] border border-white/10 bg-white/[0.06] p-4 text-left backdrop-blur-2xl sm:min-h-[16rem] sm:rounded-[2rem] sm:p-6 xl:h-80 xl:p-8',
        'flex flex-col justify-between transition-all duration-300 hover:scale-[1.02] hover:bg-white/[0.1] active:scale-95',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_24px_50px_rgba(0,0,0,0.3)]',
        active ? 'border-sky-300/45 bg-sky-400/12 shadow-[0_0_0_1px_rgba(125,211,252,0.32)]' : '',
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-30 saturate-125 transition-all duration-500 group-hover:scale-[1.035] group-hover:opacity-50"
        style={backdropStyle}
      />
      <div className={cn('pointer-events-none absolute inset-0 opacity-80', accentClassName)} />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(150deg,rgba(255,255,255,0.18)_0%,rgba(255,255,255,0.04)_38%,rgba(15,23,42,0.18)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.04),rgba(2,6,23,0.28)_78%)]" />
      {compactEditMode ? (
        <span className="pointer-events-none absolute right-2 top-2 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/35 text-white/85 shadow-[0_10px_24px_rgba(0,0,0,0.28)] backdrop-blur-xl">
          <MoreHorizontal size={16} aria-hidden="true" />
        </span>
      ) : null}

      <h3 className="relative z-10 truncate pr-12 text-xl font-semibold tracking-tight text-white sm:pr-0 sm:text-3xl">{title}</h3>

      <div className="relative z-10 space-y-2 pr-12 sm:space-y-4 sm:pr-0">
        {metrics.map((metric) => (
          <div key={`${title}-${metric.label}`} className="min-w-0">
            <p className="truncate text-[1.05rem] font-bold leading-none text-white sm:text-2xl">{metric.value}</p>
            <p className="mt-1 truncate text-[0.68rem] leading-tight text-white/50 sm:text-sm">{metric.label}</p>
          </div>
        ))}
      </div>

      <div className={cn('pointer-events-none absolute -bottom-8 -right-8 h-28 w-28 rounded-full blur-2xl sm:h-44 sm:w-44', glowClassName)} />
      <div className="pointer-events-none absolute bottom-3 right-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white/85 shadow-[0_14px_28px_rgba(0,0,0,0.32)] [&>svg]:h-7 [&>svg]:w-7 sm:bottom-5 sm:right-5 sm:h-24 sm:w-24 sm:rounded-3xl sm:[&>svg]:h-12 sm:[&>svg]:w-12">
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

  const potenzaAttualeKw = Number(
    (Math.max(dashboardData.solarPowerKw, dashboardData.homePowerKw) + 0.2).toFixed(1),
  );
  const autosufficienzaPct = clamp(Number((dashboardData.solarMixPct * 0.91 + 23.6).toFixed(1)), 0, 100);
  const efficienzaSistemaPct = clamp(Number((90 + (dashboardData.solarMixPct / 100) * 6.8).toFixed(1)), 0, 100);

  const energiaTotale = Number((dashboardData.homePowerKw * 4.96).toFixed(1));
  const energiaCosto = Number((energiaTotale * 0.174).toFixed(2));
  const ritornoSolare = clamp(Number((dashboardData.solarMixPct * 0.267).toFixed(1)), 0, 100);

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
  const smartInsight = React.useMemo(
    () =>
      resolveSmartInsight(
        {
          currentPowerKw: potenzaAttualeKw,
          autosufficiencyPct: autosufficienzaPct,
        },
        {
          currentLiters: dashboardData.waterCurrentLiters,
          goalLiters: dashboardData.waterGoalLiters,
          flowLitersPerMin: flussoMassimo,
        },
        {
          todayCubicMeters: dashboardData.gasTodayCubicMeters,
          thermalPowerKw: potenzaTermica,
          utilizationPct: utilizzoGas,
        },
      ),
    [
      autosufficienzaPct,
      dashboardData.gasTodayCubicMeters,
      dashboardData.waterCurrentLiters,
      dashboardData.waterGoalLiters,
      flussoMassimo,
      potenzaAttualeKw,
      potenzaTermica,
      utilizzoGas,
    ],
  );
  const smartInsightVisual = SMART_INSIGHT_VISUALS[smartInsight.status];

  const globalMetrics = React.useMemo<GlobalMetricDefinition[]>(
    () => [
      {
        value: `${formatDecimal(potenzaAttualeKw)} kW`,
        label: 'POTENZA ATTUALE',
        icon: <Bolt size={20} />,
      },
      {
        value: '50.0 Hz',
        label: 'FREQUENZA RETE',
        icon: <Radio size={20} />,
      },
      {
        value: `${formatDecimal(autosufficienzaPct)}%`,
        label: 'AUTOSUFFICIENZA',
        icon: <Leaf size={20} />,
      },
      {
        value: `${formatDecimal(efficienzaSistemaPct)}%`,
        label: 'EFFICIENZA SISTEMA',
        icon: <Gauge size={20} />,
      },
    ],
    [autosufficienzaPct, efficienzaSistemaPct, potenzaAttualeKw],
  );

  const utilityCards = React.useMemo<UtilityCardDefinition[]>(
    () => [
      {
        id: 'electricity',
        title: cardTitles.electricity,
        metrics: [
          { value: `${formatDecimal(energiaTotale)} kWh`, label: 'Totale Odierno' },
          { value: `EUR ${formatCurrency(energiaCosto)}`, label: 'Costo Stimato' },
          { value: `${formatDecimal(ritornoSolare)}%`, label: 'Ritorno Solare' },
        ],
        icon: <Bolt size={48} />,
        glowClassName: 'bg-emerald-400/45',
        accentClassName: 'bg-[radial-gradient(circle_at_22%_24%,rgba(16,185,129,0.28)_0%,transparent_62%)]',
        backdropStyle: CARD_BACKDROP_STYLES.electricity,
      },
      {
        id: 'water',
        title: cardTitles.water,
        metrics: [
          { value: `${Math.round(dashboardData.waterCurrentLiters)} L`, label: 'Erogazione Totale' },
          { value: `${flussoMassimo} L/m`, label: 'Flusso Massimo' },
          { value: `${formatDecimal(efficienzaAcqua)}%`, label: 'Efficienza Rete' },
        ],
        icon: <Droplets size={48} />,
        glowClassName: 'bg-cyan-400/45',
        accentClassName: 'bg-[radial-gradient(circle_at_20%_24%,rgba(34,211,238,0.3)_0%,transparent_60%)]',
        backdropStyle: CARD_BACKDROP_STYLES.water,
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
        glowClassName: 'bg-orange-400/45',
        accentClassName: 'bg-[radial-gradient(circle_at_24%_26%,rgba(251,146,60,0.3)_0%,transparent_62%)]',
        backdropStyle: CARD_BACKDROP_STYLES.gas,
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
        glowClassName: 'bg-sky-400/45',
        accentClassName: 'bg-[radial-gradient(circle_at_22%_24%,rgba(56,189,248,0.3)_0%,transparent_62%)]',
        backdropStyle: CARD_BACKDROP_STYLES.trend,
      },
    ],
    [
      cardTitles.electricity,
      cardTitles.gas,
      cardTitles.trend,
      cardTitles.water,
      consumoGas,
      dashboardData.waterCurrentLiters,
      efficienzaAcqua,
      energiaCosto,
      energiaTotale,
      flussoMassimo,
      potenzaTermica,
      ritornoSolare,
      utilizzoGas,
    ],
  );

  const progressTicks = React.useMemo(() => {
    const total = 40;
    const activeCount = Math.round((total * clamp(dashboardData.solarMixPct, 0, 100)) / 100);
    return Array.from({ length: total }, (_, index) => index < activeCount);
  }, [dashboardData.solarMixPct]);

  const detailContent = React.useMemo(() => {
    if (activeView === 'overview') {
      return null;
    }

    const interval = detailIntervals[activeView];
    const title = `Dettaglio ${cardTitles[activeView]}`;
    const onIntervalChange = (value: IntervalKey) => setIntervalForCard(activeView, value);

    if (activeView === 'electricity') {
      return <EnergiaDetail title={title} onBack={handleBackToOverview} energy={energy} />;
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
  }, [activeView, cardTitles, config, dashboardData, detailIntervals, energy, handleBackToOverview, setIntervalForCard]);

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
                  I valori collegati arrivano da Home Assistant; storici, confronti e dati mancanti possono essere dimostrativi.
                </p>
                <div className="mt-4 max-w-3xl" aria-live="polite">
                  <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      className="relative flex h-3 w-3 shrink-0 items-center justify-center"
                    >
                      <span
                        className="absolute inset-0 rounded-full opacity-30 blur-[3px]"
                        style={{ backgroundColor: smartInsightVisual.accent }}
                      />
                      <span
                        className={cn('relative h-1.5 w-1.5 rounded-full', smartInsightVisual.dotClassName)}
                      />
                    </span>
                    <span className="text-[0.68rem] font-semibold uppercase leading-none tracking-[0.18em] text-[color:var(--ui-text-tertiary)]">
                      Monitoraggio
                    </span>
                    <span className="h-px w-10 bg-gradient-to-r from-[color:var(--ui-separator)] to-transparent" aria-hidden="true" />
                    <span
                      className="text-[0.68rem] font-semibold uppercase leading-none tracking-[0.18em]"
                      style={{ color: smartInsightVisual.accent }}
                    >
                      {smartInsightVisual.label}
                    </span>
                  </div>
                  <p className="mt-2 max-w-[46rem] text-sm font-medium leading-relaxed text-[color:var(--ui-text-secondary)] sm:text-[0.95rem]">
                    {smartInsight.text}
                  </p>
                </div>
              </header>

              <section className="mt-4 w-full max-w-[1280px] sm:mt-7">
                <div className="dashboard-content-surface-soft rounded-full p-1 sm:p-2">
                  <div className="flex items-center gap-[3px] sm:gap-1.5">
                    {progressTicks.map((isActive, index) => (
                      <span
                        key={`tick-${index}`}
                        className={cn(
                          'h-3.5 min-w-0 flex-1 rounded-full transition-colors duration-300 sm:h-7',
                          isActive ? 'bg-[color:var(--ui-success)] shadow-[0_0_18px_color-mix(in_srgb,var(--ui-success)_46%,transparent)]' : 'bg-[color:var(--ui-fill-secondary)]',
                        )}
                      />
                    ))}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-4 gap-1 sm:mt-5 sm:gap-4">
                  {globalMetrics.map((metric) => (
                    <GlobalMetric key={metric.label} value={metric.value} label={metric.label} icon={metric.icon} />
                  ))}
                </div>
              </section>

              <section className="mt-6 pt-0 lg:mt-auto lg:pt-10">
                <div className="grid grid-cols-2 gap-3 sm:gap-6 md:grid-cols-2 xl:grid-cols-4 xl:gap-8">
                  {utilityCards.map((card) => (
                    <UtilityCard
                      key={card.id}
                      title={card.title}
                      metrics={card.metrics}
                      icon={card.icon}
                      glowClassName={card.glowClassName}
                      accentClassName={card.accentClassName}
                      backdropStyle={card.backdropStyle}
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
