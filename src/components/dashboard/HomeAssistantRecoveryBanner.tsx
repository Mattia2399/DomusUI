import { CloudOff, KeyRound, LogIn, RefreshCw, WifiOff } from 'lucide-react';
import type { HaConnectionStatus } from '../../services/haConnectionState';
import GlassButton from '../ui/GlassButton';
import GlassModal from '../ui/GlassModal';
import { useI18n } from '../../i18n/I18nProvider';

type HomeAssistantRecoveryBannerProps = {
  status: HaConnectionStatus;
  error?: string | null;
  isRetrying?: boolean;
  lastUpdatedAt?: number | null;
  onRetry: () => void;
  onReconnect: () => void;
};

export function HomeAssistantRecoveryBanner({
  status,
  error,
  isRetrying = false,
  lastUpdatedAt,
  onRetry,
  onReconnect,
}: HomeAssistantRecoveryBannerProps) {
  const { formatDate, t } = useI18n();
  const needsAuthentication = status === 'reauth_required';
  const isOffline = status === 'offline';
  const isReconnecting = status === 'reconnecting';
  const title = needsAuthentication
    ? t('home.connection.expiredTitle')
    : isOffline
      ? t('home.connection.offlineTitle')
      : isReconnecting
        ? t('home.connection.reconnectingTitle')
        : t('home.connection.interruptedTitle');
  const fallbackMessage = needsAuthentication
    ? t('home.connection.expiredDescription')
    : isOffline
      ? t('home.connection.offlineDescription')
      : isReconnecting
        ? t('home.connection.reconnectingDescription')
        : t('home.connection.interruptedDescription');
  const lastUpdateLabel = lastUpdatedAt
    ? formatDate(lastUpdatedAt, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;
  const StatusIcon = needsAuthentication ? KeyRound : isOffline ? CloudOff : WifiOff;
  const showRetry = !needsAuthentication;
  const showReconnect = needsAuthentication || status === 'error';

  if (needsAuthentication) {
    return (
      <GlassModal
        isOpen
        onClose={() => {}}
        dismissible={false}
        showCloseButton={false}
        size="sm"
        eyebrow={t('home.connection.protected')}
        title={t('home.connection.loginAgain')}
        description={t('home.connection.reauthDescription')}
        backdropClassName="!bg-black/55 !backdrop-blur-3xl"
        footer={(
          <GlassButton size="md" variant="primary" onClick={onReconnect} className="w-full justify-center">
            <LogIn size={16} />
            {t('home.connection.loginAgain')}
          </GlassButton>
        )}
      >
        <div className="onboarding-notice onboarding-notice-danger">
          <span className="onboarding-notice-icon"><KeyRound size={17} /></span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[color:var(--ui-text-primary)]">{t('home.connection.expired')}</div>
            <p className="mt-1 text-sm leading-6 text-[color:var(--ui-text-secondary)]">
              {t('home.connection.blocked')}
            </p>
          </div>
        </div>
      </GlassModal>
    );
  }

  return (
    <section
      role="alert"
      aria-live="assertive"
      className="liquid-glass-navigation fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] z-[230] mx-auto max-w-xl p-3.5 text-[color:var(--ui-text-primary)] sm:p-4 md:bottom-auto md:top-5"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-rose-300/24 bg-rose-500/12 text-rose-300">
          <StatusIcon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-[color:var(--ui-text-primary)]">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-[color:var(--ui-text-secondary)]">
            {error?.trim() || fallbackMessage}
          </p>
          {lastUpdateLabel && !needsAuthentication ? (
            <p className="mt-1 text-[10px] font-medium text-[color:var(--ui-text-disabled)]">
              {t('home.connection.lastUpdate', { time: lastUpdateLabel })}
            </p>
          ) : null}
        </div>
      </div>
      <div className={`mt-3 grid gap-2 ${showRetry && showReconnect ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {showRetry ? (
          <GlassButton size="sm" onClick={onRetry} disabled={isRetrying || isReconnecting} className="w-full justify-center">
            <RefreshCw size={14} className={isRetrying || isReconnecting ? 'animate-spin' : ''} />
            {isRetrying || isReconnecting ? t('home.connection.retrying') : t('home.connection.retry')}
          </GlassButton>
        ) : null}
        {showReconnect ? (
          <GlassButton size="sm" variant="primary" onClick={onReconnect} className="w-full justify-center">
            <LogIn size={14} />
            {t('home.connection.loginAgain')}
          </GlassButton>
        ) : null}
      </div>
    </section>
  );
}

export default HomeAssistantRecoveryBanner;
