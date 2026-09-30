import React, { Suspense, type ReactNode } from 'react';
import { useI18n } from '../../i18n/I18nProvider';

type LazyLoadBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
  mode?: 'page' | 'section';
  onReload?: () => void;
  resetKey?: unknown;
};

type LazyLoadErrorBoundaryProps = {
  children: ReactNode;
  failure: ReactNode;
  resetKey?: unknown;
};

type LazyLoadErrorBoundaryState = {
  failed: boolean;
};

class LazyLoadErrorBoundary extends React.Component<
  LazyLoadErrorBoundaryProps,
  LazyLoadErrorBoundaryState
> {
  state: LazyLoadErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): LazyLoadErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo) {
    console.error('Lazy-loaded UI failed:', error, errorInfo);
  }

  componentDidUpdate(previousProps: LazyLoadErrorBoundaryProps) {
    if (this.state.failed && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    return this.state.failed ? this.props.failure : this.props.children;
  }
}

function LazyLoadFailure({
  mode,
  onReload,
}: Pick<Required<LazyLoadBoundaryProps>, 'mode' | 'onReload'>) {
  const { t } = useI18n();
  return (
    <div
      className={
        mode === 'page'
          ? 'apple-bg-main flex min-h-[100dvh] items-center justify-center px-5 py-10'
          : 'flex h-full min-h-0 flex-1 items-center justify-center px-5 py-10'
      }
    >
      <section
        role="alert"
        className="liquid-glass-panel w-full max-w-lg rounded-[2rem] border border-[color:var(--ui-border)] p-7 text-center shadow-2xl"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--ui-text-tertiary)]">
          Domus UI
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[color:var(--ui-text-primary)]">
          {t('route.loadError.title')}
        </h2>
        <p className="mt-3 text-sm leading-6 text-[color:var(--ui-text-secondary)]">
          {t('route.loadError.description')}
        </p>
        <button
          type="button"
          onClick={onReload}
          className="glass-button mx-auto mt-6 inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold"
        >
          {t('route.loadError.reload')}
        </button>
      </section>
    </div>
  );
}

export function LazyLoadBoundary({
  children,
  fallback,
  mode = 'page',
  onReload = () => window.location.reload(),
  resetKey,
}: LazyLoadBoundaryProps) {
  return (
    <LazyLoadErrorBoundary
      failure={<LazyLoadFailure mode={mode} onReload={onReload} />}
      resetKey={resetKey}
    >
      <Suspense fallback={fallback}>{children}</Suspense>
    </LazyLoadErrorBoundary>
  );
}

export default LazyLoadBoundary;
