import { useState, type ComponentType } from 'react';
import {
  ChevronRight,
  Eye,
  EyeOff,
  KeyRound,
  Link2,
  RotateCcw,
} from 'lucide-react';
import type { HaConnectionStatus } from '../../hooks/useHaLiveConnection';
import { useI18n } from '../../i18n/I18nProvider';
import { validateHassUrl } from '../../services/haLive';
import type { DashboardAppearance } from '../../theme/dashboardTheme';
import GlassToggle from '../ui/GlassToggle';

export type SettingsHomeAssistantSectionProps = {
  appearance: DashboardAppearance;
  haUrl: string;
  onUrlChange: (value: string) => void;
  haToken: string;
  onTokenChange: (value: string) => void;
  haRememberToken: boolean;
  onRememberTokenChange: (value: boolean) => void;
  haStatus: HaConnectionStatus;
  haError: string | null;
  haManagedByParent?: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onStartOAuth: () => Promise<void>;
  isOAuthBusy: boolean;
};

export function SettingsHomeAssistantSection({
  appearance,
  haUrl,
  onUrlChange,
  haToken,
  onTokenChange,
  haRememberToken,
  onRememberTokenChange,
  haStatus,
  haError,
  haManagedByParent = false,
  onConnect,
  onDisconnect,
  onStartOAuth,
  isOAuthBusy,
}: SettingsHomeAssistantSectionProps) {
  const { locale, t } = useI18n();
  const [showToken, setShowToken] = useState(false);
  const [manualTokenDraft, setManualTokenDraft] = useState('');
  const [haActionError, setHaActionError] = useState<string | null>(null);

  const isConnecting = haStatus === 'connecting';
  const isConnected = haStatus === 'connected';
  const isRememberedTokenStored =
    haRememberToken && haToken.trim().length > 0 && manualTokenDraft.length === 0;
  const haUrlValidation = haUrl.trim() ? validateHassUrl(haUrl) : null;
  const canStartOAuth = !haManagedByParent && haUrl.trim().length > 0;
  const canConnect =
    !haManagedByParent && haUrl.trim().length > 0 && haToken.trim().length > 0;
  const haErrorMessage = haActionError ?? (haError
    ? (locale === 'it' ? haError : t('settings.connection.operationFailed'))
    : '');
  const validationError = haUrlValidation?.ok === false
    ? t(haUrlValidation.error.includes('obbligatorio')
      ? 'settings.connection.urlRequired'
      : haUrlValidation.error.includes('completo')
        ? 'settings.connection.urlComplete'
        : haUrlValidation.error.includes('http o https')
          ? 'settings.connection.urlProtocol'
          : haUrlValidation.error.includes('credenziali')
            ? 'settings.connection.urlCredentials'
            : haUrlValidation.error.includes('query')
              ? 'settings.connection.urlQuery'
              : 'settings.connection.urlHttps')
    : '';
  const errorTextClass = appearance === 'light' ? 'text-rose-700' : 'text-rose-200';

  const sectionShellClass = 'pb-6';
  const settingsGroupClass =
    'overflow-hidden rounded-[1.35rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass-soft)] shadow-[0_14px_34px_var(--ui-shadow-soft),inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-2xl';
  const settingsRowClass =
    'flex min-h-[3.45rem] w-full items-center gap-3 px-3.5 py-3 text-left sm:px-4';
  const settingsDividerClass = 'border-t border-[color:var(--ui-separator)]';
  const settingsIconClass =
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]';
  const settingsTitleClass = 'text-sm font-medium text-[color:var(--ui-text-primary)]';
  const settingsSubtitleClass =
    'mt-0.5 text-[11px] leading-snug text-[color:var(--ui-text-secondary)]';
  const subtleTextClass = 'text-[color:var(--ui-text-secondary)]';
  const infoCardClass =
    'rounded-2xl px-0 py-2 text-xs text-[color:var(--ui-text-secondary)]';
  const buttonMotionClass =
    'transition-[filter,transform] duration-200 hover:brightness-[1.03] active:scale-[0.995] disabled:hover:brightness-100 disabled:active:scale-100';
  const touchMotionClass = 'transition-all duration-200 active:scale-[0.99]';
  const iconButtonClass =
    'text-[color:var(--ui-text-secondary)] hover:text-[color:var(--ui-text-primary)]';
  const clearButtonClass =
    'text-[color:var(--ui-text-secondary)] hover:text-[color:var(--ui-text-primary)]';

  const renderSettingsIcon = (
    Icon: ComponentType<{ size?: number; className?: string }>,
  ) => (
    <span className={settingsIconClass}>
      <Icon size={16} />
    </span>
  );

  const handleStartOAuth = async () => {
    setHaActionError(null);
    try {
      await onStartOAuth();
    } catch (error) {
      setHaActionError(locale === 'it' && error instanceof Error && error.message
        ? error.message
        : t('settings.connection.operationFailed'));
    }
  };

  const handleClearToken = () => {
    setManualTokenDraft('');
    setShowToken(false);
    onTokenChange('');
    onRememberTokenChange(false);
  };

  return (
    <section className={sectionShellClass}>
      <div className={settingsGroupClass}>
        <label className={settingsRowClass}>
          {renderSettingsIcon(Link2)}
          <div className="min-w-0 flex-1">
            <span className={settingsTitleClass}>URL</span>
            <input
              value={haUrl}
              onChange={(event) => onUrlChange(event.target.value)}
              placeholder="http://homeassistant.local:8123"
              disabled={haManagedByParent}
              className="mt-1 w-full bg-transparent text-sm text-[color:var(--ui-text-secondary)] outline-none placeholder:text-[color:var(--ui-text-secondary)]/70"
            />
            {haUrlValidation?.ok && haUrlValidation.warning ? (
              <span className="mt-1 block text-[11px] text-amber-500/85">
                {t('settings.connection.localHttpWarning')}
              </span>
            ) : null}
            {haUrlValidation?.ok === false ? (
              <span className="mt-1 block text-[11px] text-rose-500/85">
                {validationError}
              </span>
            ) : null}
          </div>
        </label>

        <div className={settingsDividerClass} />

        <label className={settingsRowClass}>
          {renderSettingsIcon(KeyRound)}
          <div className="min-w-0 flex-1">
            <span className={settingsTitleClass}>Token</span>
            <input
              type={showToken ? 'text' : 'password'}
              value={isRememberedTokenStored ? '' : manualTokenDraft || haToken}
              onChange={(event) => {
                setManualTokenDraft(event.target.value);
                onTokenChange(event.target.value);
              }}
              placeholder={
                isRememberedTokenStored
                  ? t('settings.connection.tokenSavedPlaceholder')
                  : t('settings.connection.tokenPlaceholder')
              }
              disabled={haManagedByParent}
              className="mt-1 w-full bg-transparent text-sm text-[color:var(--ui-text-secondary)] outline-none placeholder:text-[color:var(--ui-text-secondary)]/70"
            />
          </div>
          {isRememberedTokenStored ? (
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-600">
              {t('dashboard.save.saved')}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setShowToken((current) => !current)}
              className={`${touchMotionClass} ${iconButtonClass}`}
              aria-label={showToken ? t('settings.connection.hideToken') : t('settings.connection.showToken')}
            >
              {showToken ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          )}
        </label>

        <div className={settingsDividerClass} />

        <div className={settingsRowClass}>
          {renderSettingsIcon(Eye)}
          <div className="min-w-0 flex-1">
            <p className={settingsTitleClass}>{t('settings.connection.rememberToken')}</p>
            <p className={settingsSubtitleClass}>
              {t('settings.connection.rememberTokenDescription')}
            </p>
          </div>
          <GlassToggle
            checked={haRememberToken}
            onChange={onRememberTokenChange}
            disabled={haManagedByParent}
            label={t('settings.connection.rememberToken')}
          />
          <button
            type="button"
            onClick={handleClearToken}
            disabled={haManagedByParent}
            className={`text-xs font-semibold ${buttonMotionClass} ${clearButtonClass}`}
          >
            {t('settings.connection.clear')}
          </button>
        </div>
      </div>

      <div className={`mt-4 ${settingsGroupClass}`}>
        {haManagedByParent ? (
          <div className={settingsRowClass}>
            {renderSettingsIcon(Link2)}
            <p className={`text-xs ${subtleTextClass}`}>
              {t('settings.connection.managedByPanel')}
            </p>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={handleStartOAuth}
              disabled={isOAuthBusy || !canStartOAuth}
              className={`${settingsRowClass} disabled:cursor-not-allowed disabled:opacity-60 ${buttonMotionClass}`}
            >
              {renderSettingsIcon(KeyRound)}
              <div className="min-w-0 flex-1">
                <p className={settingsTitleClass}>
                  {isOAuthBusy ? t('settings.connection.oauthBusy') : t('settings.connection.oauthLogin')}
                </p>
              </div>
              <ChevronRight size={16} className={subtleTextClass} />
            </button>

            <div className={settingsDividerClass} />

            {isConnected ? (
              <button
                type="button"
                onClick={onDisconnect}
                className={`${settingsRowClass} ${buttonMotionClass}`}
              >
                {renderSettingsIcon(RotateCcw)}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-rose-500">{t('settings.connection.disconnect')}</p>
                </div>
              </button>
            ) : (
              <button
                type="button"
                onClick={onConnect}
                disabled={isConnecting || !canConnect}
                className={`${settingsRowClass} disabled:cursor-not-allowed disabled:opacity-60 ${buttonMotionClass}`}
              >
                {renderSettingsIcon(Link2)}
                <div className="min-w-0 flex-1">
                  <p className={settingsTitleClass}>
                    {isConnecting ? t('settings.connection.connecting') : t('settings.connection.connect')}
                  </p>
                </div>
                <ChevronRight size={16} className={subtleTextClass} />
              </button>
            )}
          </>
        )}
      </div>

      <p className={`mt-3 text-xs ${subtleTextClass}`}>
        {t('settings.connection.statusNote', { status: haStatus })}
      </p>

      {!haManagedByParent && haToken.trim().length > 0 ? (
        <div className={`mt-3 ${infoCardClass}`}>
          {t('settings.connection.tokenSecurityNote')}
        </div>
      ) : null}

      {haErrorMessage ? (
        <p className={`mt-2 text-xs ${errorTextClass}`}>{haErrorMessage}</p>
      ) : null}
    </section>
  );
}

export default SettingsHomeAssistantSection;
