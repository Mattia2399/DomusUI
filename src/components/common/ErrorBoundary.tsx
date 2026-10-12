import React from 'react';
import { useI18n } from '../../i18n/I18nProvider';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

function RuntimeErrorView({ errorMessage, onReset, onReload }: {
  errorMessage: string | null;
  onReset: () => void;
  onReload: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="apple-bg-main flex min-h-screen items-center justify-center px-4 text-slate-100">
      <div className="liquid-glass-panel w-full max-w-lg rounded-[28px] p-6">
        <div className="text-xs uppercase tracking-[0.24em] text-rose-300">{t('common.runtimeErrorEyebrow')}</div>
        <h2 className="mt-2 text-2xl font-semibold text-white">{t('common.runtimeErrorTitle')}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-300">{t('common.runtimeErrorDescription')}</p>
        {errorMessage ? <div className="liquid-glass-card mt-4 px-3 py-2 text-xs text-slate-300">{errorMessage}</div> : null}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" onClick={onReset} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-200 transition-colors hover:bg-white/[0.08]">
            {t('common.retryView')}
          </button>
          <button type="button" onClick={onReload} className="rounded-2xl border border-sky-400/30 bg-sky-400/15 px-4 py-2 text-sm font-medium text-sky-100 transition-colors hover:bg-sky-400/25">
            {t('common.reloadApp')}
          </button>
        </div>
      </div>
    </div>
  );
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: null,
    };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : 'Unexpected runtime error',
    };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo) {
    // Keep console diagnostics for local debugging.
    console.error('Unhandled UI error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetView = () => {
    this.setState({
      hasError: false,
      errorMessage: null,
    });
  };

  render() {
    if (this.state.hasError) {
      return <RuntimeErrorView errorMessage={this.state.errorMessage} onReset={this.handleResetView} onReload={this.handleReload} />;
    }

    return this.props.children;
  }
}
