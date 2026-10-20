import { lazy, Suspense, type ReactNode } from 'react';
import { LazyLoadErrorBoundary } from '../../components/common/LazyLoadBoundary';
import { useI18n } from '../../i18n/I18nProvider';
import { useConsumptionCopy } from '../../i18n/consumptionCopy';
import type * as ChartModule from './consumptionCharts';

/*
 * Where a Water or Gas chart goes: the space the card already reserves holds
 * a placeholder while the charts load, and the reload offer of the other
 * on-demand screens if they cannot (browsers keep a failed import failed),
 * so the rest of the page never waits for the chart library or breaks with it.
 */

type Charts = typeof ChartModule;
type Render = (charts: Charts) => ReactNode;

const LoadedChart = lazy(() => import('./consumptionCharts').then((charts) => ({
  default: ({ render }: { render: Render }) => <>{render(charts)}</>,
})));

export function LazyConsumptionChart({
  children,
  onReload = () => window.location.reload(),
}: {
  children: Render;
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
          <div
            role="status"
            aria-label={c('Caricamento del grafico…')}
            className="h-full w-full rounded-2xl bg-[color:var(--ui-fill-tertiary)] motion-safe:animate-pulse"
          />
        )}
      >
        <LoadedChart render={children} />
      </Suspense>
    </LazyLoadErrorBoundary>
  );
}
