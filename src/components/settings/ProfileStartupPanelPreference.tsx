import { useEffect, useRef, useState } from 'react';
import { Home, TriangleAlert, X } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import type { HaConnectionStatus } from '../../hooks/useHaLiveConnection';
import type { DashboardRuntimeMode } from '../../security/dashboardAccess';
import {
  disableDomusUiAsDefaultPanel,
  enableDomusUiAsDefaultPanel,
  getHaDefaultPanelState,
  type HaFrontendPreferencesCallApi,
} from '../../services/haFrontendPreferences';
import GlassToggle from '../ui/GlassToggle';

type ProfileStartupPanelPreferenceProps = {
  runtimeMode: DashboardRuntimeMode;
  haStatus: HaConnectionStatus;
  haUserId?: string;
  onCallApi?: HaFrontendPreferencesCallApi;
  onNotify?: (type: 'info' | 'warning' | 'alert', message: string) => unknown;
};

export function ProfileStartupPanelPreference({
  runtimeMode,
  haStatus,
  haUserId,
  onCallApi,
  onNotify,
}: ProfileStartupPanelPreferenceProps) {
  const { t } = useI18n();
  const requestVersionRef = useRef(0);
  const [checked, setChecked] = useState(false);
  const [confirmedChecked, setConfirmedChecked] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'saving' | 'error'>('loading');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const connected = haStatus === 'connected';
  const available = runtimeMode === 'real' && connected && Boolean(haUserId?.trim()) && Boolean(onCallApi);

  useEffect(() => {
    const requestVersion = ++requestVersionRef.current;
    setFeedback(null);
    if (!available || !onCallApi) {
      setChecked(false);
      setConfirmedChecked(false);
      setStatus('ready');
      return;
    }

    setStatus('loading');
    void getHaDefaultPanelState(onCallApi)
      .then((state) => {
        if (requestVersionRef.current !== requestVersion) return;
        setChecked(state.isDomusUiDefault);
        setConfirmedChecked(state.isDomusUiDefault);
        setStatus('ready');
      })
      .catch(() => {
        if (requestVersionRef.current !== requestVersion) return;
        setStatus('error');
      });
    return () => {
      if (requestVersionRef.current === requestVersion) {
        requestVersionRef.current += 1;
      }
    };
  }, [available, haUserId, onCallApi]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 4200);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  if (runtimeMode !== 'real') {
    return null;
  }

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    onNotify?.(type === 'error' ? 'alert' : 'info', message);
  };

  const handleChange = async (nextChecked: boolean) => {
    if (!available || !onCallApi || !haUserId || status === 'saving') return;
    const previousConfirmed = confirmedChecked;
    setChecked(nextChecked);
    setStatus('saving');
    try {
      const result = nextChecked
        ? await enableDomusUiAsDefaultPanel({
            callApi: onCallApi,
            storage: window.localStorage,
            userId: haUserId,
          })
        : await disableDomusUiAsDefaultPanel({
            callApi: onCallApi,
            storage: window.localStorage,
            userId: haUserId,
          });
      setChecked(result.isDomusUiDefault);
      setConfirmedChecked(result.isDomusUiDefault);
      setStatus('ready');
      showFeedback(
        'success',
        nextChecked
          ? t('profile.startup.enabled')
          : result.restoredPanel
            ? t('profile.startup.restored')
            : t('profile.startup.systemDefault'),
      );
    } catch {
      setChecked(previousConfirmed);
      setStatus('ready');
      showFeedback('error', t('profile.startup.saveError'));
    }
  };

  const description = !connected
    ? t('profile.startup.offline')
    : !haUserId || !onCallApi
      ? t('profile.startup.unavailable')
      : status === 'loading'
        ? t('profile.startup.loading')
        : status === 'saving'
          ? t('profile.startup.saving')
          : status === 'error'
            ? t('profile.startup.error')
            : t('profile.startup.description');

  return (
    <>
      <div className="flex min-h-[4.4rem] w-full items-center gap-3 px-4 py-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.95rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]">
          <Home size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold tracking-[-0.01em] text-[color:var(--ui-text-primary)]">
            {t('profile.startup.title')}
          </span>
          <span className="mt-0.5 block text-xs leading-5 text-[color:var(--ui-text-secondary)]">
            {description}
          </span>
        </span>
        <GlassToggle
          checked={checked}
          onChange={handleChange}
          disabled={!available || status === 'loading' || status === 'error'}
          busy={status === 'saving'}
          label={t('profile.startup.toggle')}
          size="compact"
          tone="accent"
        />
      </div>

      {feedback ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] z-[220] flex justify-center px-3 md:bottom-6">
          <div
            role={feedback.type === 'error' ? 'alert' : 'status'}
            aria-live={feedback.type === 'error' ? 'assertive' : 'polite'}
            className={`pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-[1.15rem] border px-4 py-3 text-sm shadow-2xl backdrop-blur-2xl ${
              feedback.type === 'error'
                ? 'border-rose-500/35 bg-rose-950/85 text-rose-50'
                : 'border-emerald-400/35 bg-neutral-950/90 text-white'
            }`}
          >
            {feedback.type === 'error' ? <TriangleAlert className="h-4 w-4 shrink-0 text-rose-300" /> : <Home className="h-4 w-4 shrink-0 text-emerald-300" />}
            <p className="min-w-0 flex-1 font-medium leading-5">{feedback.message}</p>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/75 transition-colors hover:bg-white/15 hover:text-white"
              aria-label={t('profile.startup.dismiss')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default ProfileStartupPanelPreference;
