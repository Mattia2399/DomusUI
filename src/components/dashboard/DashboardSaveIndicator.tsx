import { useEffect, useState } from 'react';
import { Check, RefreshCw, Save, SaveOff } from 'lucide-react';
import type { DashboardLayoutSaveStatus } from '../../hooks/useDashboardLayoutPersistence';
import { useI18n } from '../../i18n/I18nProvider';

type DashboardSaveIndicatorProps = {
  status: DashboardLayoutSaveStatus;
  embedded?: boolean;
};

const ERROR_KEYS: Record<Extract<DashboardLayoutSaveStatus, { phase: 'error' }>['code'], import('../../i18n/translations').TranslationKey> = {
  storage_unavailable: 'dashboard.save.error.storage_unavailable',
  server_unavailable: 'dashboard.save.error.server_unavailable',
  server_unauthorized: 'dashboard.save.error.server_unauthorized',
  server_unsupported: 'dashboard.save.error.server_unsupported',
  server_conflict: 'dashboard.save.error.server_conflict',
  migration_required: 'dashboard.save.error.migration_required',
  quota_exceeded: 'dashboard.save.error.quota_exceeded',
  security_error: 'dashboard.save.error.security_error',
  serialization_error: 'dashboard.save.error.serialization_error',
  unknown: 'dashboard.save.error.unknown',
};

function SaveCheckIcon() {
  return (
    <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden>
      <Save size={14} />
      <Check
        size={9}
        strokeWidth={3}
        className="absolute -bottom-0.5 -right-0.5 rounded-full bg-[color:var(--ui-surface-glass)]"
      />
    </span>
  );
}

export function DashboardSaveIndicator({ status, embedded = false }: DashboardSaveIndicatorProps) {
  const { t, formatDate } = useI18n();
  const [showSavedLabel, setShowSavedLabel] = useState(false);

  useEffect(() => {
    if (status.phase !== 'saved') {
      setShowSavedLabel(false);
      return undefined;
    }

    setShowSavedLabel(true);
    const timeoutId = window.setTimeout(() => {
      setShowSavedLabel(false);
    }, 1800);
    return () => window.clearTimeout(timeoutId);
  }, [status.phase, status.phase === 'saved' ? status.savedAt : null]);

  if (status.phase === 'idle') {
    return null;
  }

  const isSaving = status.phase === 'saving';
  const isError = status.phase === 'error';
  const isDirty = status.phase === 'dirty';
  const label = isSaving
    ? t('dashboard.save.saving')
    : isError || isDirty
      ? t('dashboard.save.dirty')
      : t('dashboard.save.saved');
  const showLabel = isSaving || isError || isDirty || showSavedLabel;

  return (
    <div
      className={`${embedded ? '' : 'liquid-glass-control shadow-xl'} pointer-events-none inline-flex min-h-9 items-center rounded-full px-3 py-1.5 text-xs font-semibold transition-[gap] duration-300 ${
        showLabel ? 'gap-2' : 'gap-0'
      } ${
        isError
          ? 'text-[color:var(--ui-danger,#ff453a)]'
          : isDirty
            ? 'text-[color:var(--ui-warning,#ff9f0a)]'
            : 'text-[color:var(--ui-text-primary)]'
      }`}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      aria-label={label}
      title={
        status.phase === 'saved'
          ? t('dashboard.save.savedAt', { time: formatDate(status.savedAt, { hour: '2-digit', minute: '2-digit' }) })
          : status.phase === 'error'
            ? t(ERROR_KEYS[status.code])
            : status.phase === 'dirty'
              ? t('dashboard.save.onExit')
            : label
      }
    >
      {isSaving ? (
        <RefreshCw size={14} className="animate-spin" aria-hidden />
      ) : isError || isDirty ? (
        <SaveOff size={14} aria-hidden />
      ) : (
        <SaveCheckIcon />
      )}
      {showLabel ? <span>{label}</span> : null}
    </div>
  );
}
