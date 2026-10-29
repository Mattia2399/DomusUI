import { lazy, Suspense, type CSSProperties, type ReactNode } from 'react';
import { LazyLoadErrorBoundary } from '../../components/common/LazyLoadBoundary';
import { useI18n } from '../../i18n/I18nProvider';
import { useConsumptionCopy } from '../../i18n/consumptionCopy';
import type * as ChartModule from './consumptionCharts';
import './lazyConsumptionChart.css';

/*
 * Where a Water or Gas chart goes: the space the card already reserves holds
 * the outline of the chart while the charts load, and the reload offer of the
 * other on-demand screens if they cannot (browsers keep a failed import
 * failed), so the rest of the page never waits for the chart library or
 * breaks with it. Consumption fetches the charts ahead (preloadConsumptionCharts),
 * so a detail usually opens with them already there.
 */

type Charts = typeof ChartModule;
type Render = (charts: Charts) => ReactNode;
export type ChartOutline = 'bars' | 'ring' | 'line';

const loadConsumptionCharts = () => import('./consumptionCharts');

/** Fetch the charts before a detail asks for them; a failure is left to the detail. */
export function preloadConsumptionCharts() {
  void loadConsumptionCharts().catch(() => undefined);
}

const LoadedChart = lazy(() => loadConsumptionCharts().then((charts) => ({
  default: ({ render }: { render: Render }) => <div className="lcc-enter">{render(charts)}</div>,
})));

const BAR_HEIGHTS = [46, 72, 58, 88, 64, 78, 52];

function ChartOutlineShape({ outline }: { outline: ChartOutline }) {
  if (outline === 'ring') {
    return <div className="lcc-ring"><i /></div>;
  }
  if (outline === 'line') {
    return (
      <svg className="lcc-line" viewBox="0 0 100 40" preserveAspectRatio="none">
        <path d="M2 30 C 14 24, 20 12, 32 16 S 50 32, 62 22 S 82 6, 98 12" vectorEffect="non-scaling-stroke" />
      </svg>
    );
  }
  return (
    <div className="lcc-bars">
      {BAR_HEIGHTS.map((height, index) => (
        <i
          key={index}
          className="lcc-skeleton-fill"
          style={{ height: `${height}%`, animationDelay: `${index * 90}ms` } as CSSProperties}
        />
      ))}
    </div>
  );
}

export function LazyConsumptionChart({
  children,
  outline = 'bars',
  onReload = () => window.location.reload(),
}: {
  children: Render;
  /** The shape the chart will have, drawn while it loads. */
  outline?: ChartOutline;
  onReload?: () => void;
}) {
  const { t } = useI18n();
  const { c } = useConsumptionCopy();

  return (
    <LazyLoadErrorBoundary
      failure={(
        <div
          role="alert"
          className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-2xl border border-[color:var(--ui-border)] px-4 text-center text-sm text-[color:var(--ui-text-secondary)]"
        >
          <p>{c('Grafico non caricato')}</p>
          <button
            type="button"
            onClick={onReload}
            className="glass-button inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold"
          >
            {t('route.loadError.reload')}
          </button>
        </div>
      )}
    >
      <Suspense
        fallback={(
          <div role="status" aria-label={c('Caricamento del grafico…')} className="lcc-skeleton">
            <ChartOutlineShape outline={outline} />
          </div>
        )}
      >
        <LoadedChart render={children} />
      </Suspense>
    </LazyLoadErrorBoundary>
  );
}
