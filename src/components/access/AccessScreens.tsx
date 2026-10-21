import React from 'react';
import { LockKeyhole, RefreshCw, ShieldAlert, ShieldQuestion, WifiOff, X } from 'lucide-react';
import { useAccessCopy } from '../../i18n/accessCopy';

type AccessNoticeKind = 'denied' | 'offline' | 'error' | 'unavailable';

const ICONS = { denied: LockKeyhole, offline: WifiOff, error: ShieldQuestion, unavailable: ShieldQuestion } as const;
const COPY = {
  denied: ['deniedTitle', 'deniedBody'],
  offline: ['offlineTitle', 'offlineBody'],
  error: ['errorTitle', 'errorBody'],
  unavailable: ['unavailableTitle', 'unavailableBody'],
} as const;

/**
 * What a route shows instead of its page when the account may not open it,
 * or when its permissions cannot be read. The Domus shell stays around it, so
 * the navigation still leads to everything that is available.
 */
export function AccessNotice({
  kind,
  onRetry,
  onGoHome,
}: {
  kind: AccessNoticeKind;
  onRetry?: () => void;
  /** Offered only when the account may open the Home. */
  onGoHome?: () => void;
}) {
  const copy = useAccessCopy();
  const Icon = ICONS[kind];
  const [titleKey, bodyKey] = COPY[kind];
  return (
    <section
      aria-labelledby="access-notice-title"
      data-access-notice={kind}
      className="flex h-full min-h-0 flex-1 items-center justify-center overflow-y-auto p-4"
    >
      <div className="dashboard-content-surface w-full max-w-md rounded-[1.5rem] p-6 text-center sm:p-8">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]">
          <Icon size={22} aria-hidden="true" />
        </span>
        <h1 id="access-notice-title" className="mt-4 text-lg font-semibold tracking-[-0.01em] text-[color:var(--ui-text-primary)]">
          {copy(titleKey)}
        </h1>
        <p className="mt-2 text-sm leading-6 text-[color:var(--ui-text-secondary)]">{copy(bodyKey)}</p>
        {onRetry || onGoHome ? (
          <div className="mt-6 flex flex-col-reverse justify-center gap-2 sm:flex-row">
            {onGoHome ? (
              <button
                type="button"
                onClick={onGoHome}
                className="liquid-glass-selection inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold"
              >
                {copy('goHome')}
              </button>
            ) : null}
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="liquid-glass-selection inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold"
              >
                <RefreshCw size={16} aria-hidden="true" />
                {copy('retry')}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** A quiet notice above the page while the policy cannot be trusted and the account is on the safe floor. */
export function AccessLockedBanner({
  isAdministrator,
  onDismiss,
}: {
  isAdministrator: boolean;
  onDismiss: () => void;
}) {
  const copy = useAccessCopy();
  return (
    <div
      role="status"
      data-access-locked-banner
      className="dashboard-content-surface flex w-full items-start gap-3 rounded-[1.25rem] px-4 py-3 text-left shadow-[0_14px_34px_var(--ui-shadow-soft)]"
    >
      <ShieldAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-amber-500" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[color:var(--ui-text-primary)]">{copy('lockedTitle')}</p>
        <p className="mt-0.5 text-xs leading-5 text-[color:var(--ui-text-secondary)]">
          {copy(isAdministrator ? 'lockedAdminBody' : 'lockedBody')}
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={copy('dismiss')}
        className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[color:var(--ui-text-secondary)] transition hover:bg-[color:var(--ui-fill-tertiary)]"
      >
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

/** In place of a Home card the account may not see: the layout keeps its shape, nothing of the card shows. */
export function AccessRestrictedCard() {
  const copy = useAccessCopy();
  return (
    <div
      data-access-restricted-card
      className="dashboard-content-surface flex h-full w-full min-h-0 min-w-0 flex-col items-center justify-center gap-2 rounded-[1.6rem] p-3 text-center"
    >
      <LockKeyhole size={18} aria-hidden="true" className="text-[color:var(--ui-text-tertiary)]" />
      <p className="text-xs font-medium text-[color:var(--ui-text-secondary)]">{copy('cardUnavailable')}</p>
    </div>
  );
}
