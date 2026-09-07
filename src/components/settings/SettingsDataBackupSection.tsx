import { useRef, useState, type ChangeEvent, type ComponentType } from 'react';
import {
  ChevronRight,
  Download,
  History,
  KeyRound,
  RotateCcw,
  Route,
  Smartphone,
  Upload,
} from 'lucide-react';
import { useDashboardSecurity } from '../../security/dashboardAccess';
import { useSensitiveActionGate } from '../../security/SensitiveActionGate';
import type {
  DashboardResetProgressReporter,
  DashboardResetStage,
} from '../../services/dashboardReset';
import type { DashboardAppearance } from '../../theme/dashboardTheme';
import { useI18n } from '../../i18n/I18nProvider';
import GlassLoader from '../ui/GlassLoader';
import GlassModal from '../ui/GlassModal';
import GlassToggle from '../ui/GlassToggle';

export type SettingsDataBackupSectionProps = {
  appearance: DashboardAppearance;
  developerMode: boolean;
  onDeveloperModeChange: (value: boolean) => void;
  onDownloadBackup: () => void;
  onRestoreBackup: (file: File) => Promise<void>;
  onResetAll: (reportProgress?: DashboardResetProgressReporter) => Promise<void>;
  onOpenLayoutVersions?: () => void;
  enterpriseControlsEnabled?: boolean;
  dashboardDeviceId?: string;
  dashboardCurrentUserId?: string;
  dashboardCurrentLayoutId?: string;
  dashboardCurrentLayoutSource?: 'device' | 'default' | 'none';
  dashboardCurrentUserIsMirror?: boolean;
  dashboardConfigSyncMode?: 'unknown' | 'shared' | 'user_data';
  isCurrentDeviceDetached?: boolean;
  onUnlinkCurrentDevice?: (userId: string, deviceId: string) => void;
  onRelinkCurrentDevice?: (userId: string, deviceId: string) => void;
};

type ActionFeedback = {
  tone: 'idle' | 'success' | 'error';
  text: string;
};

function normalizeError(error: unknown, fallback: string) {
  return error instanceof Error && error.message
    ? error.message
    : fallback;
}

export function SettingsDataBackupSection({
  appearance,
  developerMode,
  onDeveloperModeChange,
  onDownloadBackup,
  onRestoreBackup,
  onResetAll,
  onOpenLayoutVersions,
  enterpriseControlsEnabled = false,
  dashboardDeviceId,
  dashboardCurrentUserId,
  dashboardCurrentLayoutId,
  dashboardCurrentLayoutSource,
  dashboardCurrentUserIsMirror = false,
  dashboardConfigSyncMode = 'unknown',
  isCurrentDeviceDetached = false,
  onUnlinkCurrentDevice,
  onRelinkCurrentDevice,
}: SettingsDataBackupSectionProps) {
  const { t } = useI18n();
  const dashboardSecurity = useDashboardSecurity();
  const sensitiveGate = useSensitiveActionGate();
  const restoreInputRef = useRef<HTMLInputElement | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isActionBusy, setIsActionBusy] = useState(false);
  const [resetStage, setResetStage] = useState<DashboardResetStage | null>(null);
  const [deviceLayoutFeedback, setDeviceLayoutFeedback] = useState<ActionFeedback>({
    tone: 'idle',
    text: '',
  });

  const isLightTheme = appearance === 'light';
  const normalizedCurrentUserId =
    typeof dashboardCurrentUserId === 'string' ? dashboardCurrentUserId.trim() : '';
  const normalizedDeviceId =
    typeof dashboardDeviceId === 'string' ? dashboardDeviceId.trim() : '';
  const canManageCurrentDeviceLayout =
    enterpriseControlsEnabled &&
    normalizedCurrentUserId.length > 0 &&
    normalizedDeviceId.length > 0 &&
    Boolean(onRelinkCurrentDevice) &&
    Boolean(onUnlinkCurrentDevice);

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
  const subduedTextClass = 'text-[color:var(--ui-text-secondary)]';
  const subtleTextClass = 'text-[color:var(--ui-text-secondary)]';
  const errorTextClass = isLightTheme ? 'text-xs text-rose-700' : 'text-xs text-rose-200';
  const buttonMotionClass =
    'transition-[filter,transform] duration-200 hover:brightness-[1.03] active:scale-[0.995] disabled:hover:brightness-100 disabled:active:scale-100';

  const renderSettingsIcon = (
    Icon: ComponentType<{ size?: number; className?: string }>,
  ) => (
    <span className={settingsIconClass}>
      <Icon size={16} />
    </span>
  );

  const handleDownloadBackup = () => {
    if (!dashboardSecurity.can('download_backup')) {
      return;
    }
    setActionError(null);
    try {
      onDownloadBackup();
    } catch (error) {
      setActionError(normalizeError(error, t('settings.connection.operationFailed')));
    }
  };

  const handleRestoreBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !dashboardSecurity.can('restore_backup')) {
      return;
    }

    const authorized = await sensitiveGate.authorize({
      action: 'restore_backup',
      capability: 'restore_backup',
      title: t('settings.backup.restorePrompt'),
      description: t('settings.backup.restoreDescription', {
        file: file.name,
        size: Math.max(1, Math.round(file.size / 1024)),
      }),
    });
    if (!authorized) {
      return;
    }

    setActionError(null);
    setIsActionBusy(true);
    try {
      await onRestoreBackup(file);
    } catch (error) {
      setActionError(normalizeError(error, t('settings.connection.operationFailed')));
    } finally {
      setIsActionBusy(false);
    }
  };

  const handleResetAll = async () => {
    if (!dashboardSecurity.can('reset_dashboard')) {
      return;
    }
    const authorized = await sensitiveGate.authorize({
      action: 'reset_dashboard',
      capability: 'reset_dashboard',
      title: t('settings.backup.resetPrompt'),
      description: t('settings.backup.resetDescription'),
      confirmationPhrase: 'RESET',
    });
    if (!authorized) {
      return;
    }

    setActionError(null);
    setIsActionBusy(true);
    setResetStage('preparing');
    try {
      await onResetAll(setResetStage);
    } catch (error) {
      setResetStage(null);
      setActionError(normalizeError(error, t('settings.connection.operationFailed')));
    } finally {
      setIsActionBusy(false);
    }
  };

  const resetProgress = resetStage === 'preparing'
    ? 8
    : resetStage === 'publishing_reset'
      ? 20
      : resetStage === 'clearing_history'
        ? 35
      : resetStage === 'clearing_shared_configuration'
        ? 52
        : resetStage === 'verifying_server'
          ? 68
          : resetStage === 'finalizing_reset'
            ? 80
          : resetStage === 'clearing_device'
            ? 91
            : 100;
  const resetCopy: Record<DashboardResetStage, { label: string; description: string }> = {
    preparing: {
      label: t('settings.backup.reset.preparing'),
      description: t('settings.backup.reset.preparingDescription'),
    },
    publishing_reset: {
      label: t('settings.backup.reset.publishing'),
      description: t('settings.backup.reset.publishingDescription'),
    },
    clearing_history: {
      label: t('settings.backup.reset.history'),
      description: t('settings.backup.reset.historyDescription'),
    },
    clearing_shared_configuration: {
      label: t('settings.backup.reset.shared'),
      description: t('settings.backup.reset.sharedDescription'),
    },
    verifying_server: {
      label: t('settings.backup.reset.verifying'),
      description: t('settings.backup.reset.verifyingDescription'),
    },
    finalizing_reset: {
      label: t('settings.backup.reset.finalizing'),
      description: t('settings.backup.reset.finalizingDescription'),
    },
    clearing_device: {
      label: t('settings.backup.reset.device'),
      description: t('settings.backup.reset.deviceDescription'),
    },
    restarting: {
      label: t('settings.backup.reset.complete'),
      description: t('settings.backup.reset.completeDescription'),
    },
  };

  const handleRelinkCurrentDeviceLayout = () => {
    if (
      !canManageCurrentDeviceLayout ||
      !onRelinkCurrentDevice ||
      !dashboardSecurity.can('edit_dashboard')
    ) {
      return;
    }
    onRelinkCurrentDevice(normalizedCurrentUserId, normalizedDeviceId);
    setDeviceLayoutFeedback({
      tone: 'success',
      text: t('settings.backup.mainLayoutApplied'),
    });
  };

  const handleUnlinkCurrentDeviceLayout = () => {
    if (
      !canManageCurrentDeviceLayout ||
      !onUnlinkCurrentDevice ||
      !dashboardSecurity.can('edit_dashboard')
    ) {
      return;
    }
    onUnlinkCurrentDevice(normalizedCurrentUserId, normalizedDeviceId);
    setDeviceLayoutFeedback({
      tone: 'success',
      text: t('settings.backup.dedicatedLayoutCreated'),
    });
  };

  return (
    <section className={sectionShellClass}>
      <p className={`text-xs leading-5 ${subduedTextClass}`}>
        {t('settings.backup.description')}
      </p>

      {enterpriseControlsEnabled ? (
        <>
          <div className={`mt-4 ${settingsGroupClass}`}>
            <div className={settingsRowClass}>
              {renderSettingsIcon(Smartphone)}
              <div className="min-w-0 flex-1">
                <p className={settingsTitleClass}>{t('settings.backup.deviceId')}</p>
              </div>
              <span className="max-w-[48%] truncate text-right text-xs font-medium text-[color:var(--ui-text-secondary)]">
                {normalizedDeviceId || t('settings.common.unavailable')}
              </span>
            </div>
            <div className={settingsDividerClass} />
            <div className={settingsRowClass}>
              {renderSettingsIcon(Download)}
              <div className="min-w-0 flex-1">
                <p className={settingsTitleClass}>{t('settings.backup.storage')}</p>
              </div>
              <span className="max-w-[48%] truncate text-right text-xs font-medium text-[color:var(--ui-text-secondary)]">
                {dashboardConfigSyncMode === 'shared'
                  ? t('settings.backup.storageShared')
                  : dashboardConfigSyncMode === 'user_data'
                    ? t('settings.backup.storagePerAccount')
                    : t('settings.backup.storageDetecting')}
              </span>
            </div>
            {dashboardCurrentLayoutId ? (
              <>
                <div className={settingsDividerClass} />
                <div className={settingsRowClass}>
                  {renderSettingsIcon(Route)}
                  <div className="min-w-0 flex-1">
                    <p className={settingsTitleClass}>{t('settings.backup.currentLayout')}</p>
                  </div>
                  <span className="max-w-[48%] truncate text-right text-xs font-medium text-[color:var(--ui-text-secondary)]">
                    {dashboardCurrentLayoutId}
                    {dashboardCurrentLayoutSource ? ` (${dashboardCurrentLayoutSource})` : ''}
                  </span>
                </div>
              </>
            ) : null}
          </div>

          <div className={`mt-4 ${settingsGroupClass}`}>
            <button
              type="button"
              onClick={handleRelinkCurrentDeviceLayout}
              disabled={!canManageCurrentDeviceLayout || isActionBusy}
              className={`${settingsRowClass} disabled:cursor-not-allowed disabled:opacity-60 ${buttonMotionClass}`}
            >
              {renderSettingsIcon(Route)}
              <div className="min-w-0 flex-1">
                <p className={settingsTitleClass}>{t('settings.backup.useMainLayout')}</p>
                <p className={settingsSubtitleClass}>{t('settings.backup.useMainLayoutDescription')}</p>
              </div>
              {!isCurrentDeviceDetached ? (
                <span
                  className={
                    isLightTheme
                      ? 'text-sm font-semibold text-blue-600'
                      : 'text-sm font-semibold text-blue-300'
                  }
                >
                  ✓
                </span>
              ) : (
                <ChevronRight size={16} className={subtleTextClass} />
              )}
            </button>
            <div className={settingsDividerClass} />
            <button
              type="button"
              onClick={handleUnlinkCurrentDeviceLayout}
              disabled={!canManageCurrentDeviceLayout || isActionBusy}
              className={`${settingsRowClass} disabled:cursor-not-allowed disabled:opacity-60 ${buttonMotionClass}`}
            >
              {renderSettingsIcon(Smartphone)}
              <div className="min-w-0 flex-1">
                <p className={settingsTitleClass}>{t('settings.backup.dedicatedLayout')}</p>
                <p className={settingsSubtitleClass}>{t('settings.backup.dedicatedLayoutDescription')}</p>
              </div>
              {isCurrentDeviceDetached ? (
                <span
                  className={
                    isLightTheme
                      ? 'text-sm font-semibold text-blue-600'
                      : 'text-sm font-semibold text-blue-300'
                  }
                >
                  ✓
                </span>
              ) : (
                <ChevronRight size={16} className={subtleTextClass} />
              )}
            </button>
            {dashboardCurrentUserIsMirror ? (
              <p className={`px-3.5 pb-3 text-[11px] ${subduedTextClass}`}>
                {t('settings.backup.mirrorLayout')}
              </p>
            ) : null}
            {deviceLayoutFeedback.text ? (
              <p
                className={`mt-2 px-3.5 pb-3 text-[11px] ${
                  deviceLayoutFeedback.tone === 'error'
                    ? 'text-rose-500'
                    : subduedTextClass
                }`}
              >
                {deviceLayoutFeedback.text}
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      {dashboardSecurity.can('developer_mode') ? (
        <div className={`mt-4 ${settingsGroupClass}`}>
          <div className={settingsRowClass}>
            {renderSettingsIcon(KeyRound)}
            <div className="min-w-0 flex-1">
              <p className={settingsTitleClass}>{t('settings.advanced.developer')}</p>
              <p className={settingsSubtitleClass}>{t('settings.backup.developerDescription')}</p>
            </div>
            <GlassToggle
              checked={developerMode}
              onChange={(nextValue) => {
                if (dashboardSecurity.can('developer_mode')) {
                  onDeveloperModeChange(nextValue);
                }
              }}
              label={t('settings.advanced.developer')}
            />
          </div>
        </div>
      ) : null}

      <div className={`mt-4 ${settingsGroupClass}`}>
        {dashboardSecurity.can('edit_dashboard') && onOpenLayoutVersions ? (
          <>
            <button
              type="button"
              onClick={onOpenLayoutVersions}
              disabled={isActionBusy}
              className={`${settingsRowClass} disabled:cursor-not-allowed disabled:opacity-60 ${buttonMotionClass}`}
            >
              {renderSettingsIcon(History)}
              <div className="min-w-0 flex-1">
                <p className={settingsTitleClass}>{t('settings.history.title')}</p>
                <p className={settingsSubtitleClass}>{t('settings.backup.lastFive')}</p>
              </div>
              <ChevronRight size={16} className={subtleTextClass} />
            </button>
            <div className={settingsDividerClass} />
          </>
        ) : null}
        {dashboardSecurity.can('download_backup') ? (
          <button
            type="button"
            onClick={handleDownloadBackup}
            disabled={isActionBusy}
            className={`${settingsRowClass} disabled:cursor-not-allowed disabled:opacity-60 ${buttonMotionClass}`}
          >
            {renderSettingsIcon(Download)}
            <div className="min-w-0 flex-1">
              <p className={settingsTitleClass}>{t('settings.backup.download')}</p>
            </div>
            <ChevronRight size={16} className={subtleTextClass} />
          </button>
        ) : null}

        {dashboardSecurity.can('restore_backup') ? (
          <>
            <div className={settingsDividerClass} />
            <button
              type="button"
              onClick={() => restoreInputRef.current?.click()}
              disabled={isActionBusy}
              className={`${settingsRowClass} disabled:cursor-not-allowed disabled:opacity-60 ${buttonMotionClass}`}
            >
              {renderSettingsIcon(Upload)}
              <div className="min-w-0 flex-1">
                <p className={settingsTitleClass}>{t('settings.backup.restoreFile')}</p>
              </div>
              <ChevronRight size={16} className={subtleTextClass} />
            </button>
          </>
        ) : null}

        {dashboardSecurity.can('reset_dashboard') ? (
          <>
            <div className={settingsDividerClass} />
            <button
              type="button"
              onClick={() => {
                void handleResetAll();
              }}
              disabled={isActionBusy}
              className={`${settingsRowClass} disabled:cursor-not-allowed disabled:opacity-60 ${buttonMotionClass}`}
            >
              {renderSettingsIcon(RotateCcw)}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-rose-500">{t('settings.backup.totalReset')}</p>
              </div>
              <ChevronRight size={16} className={subtleTextClass} />
            </button>
          </>
        ) : null}
      </div>

      <input
        ref={restoreInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(event) => {
          void handleRestoreBackup(event);
        }}
      />

      {actionError ? <p className={`mt-3 ${errorTextClass}`}>{actionError}</p> : null}

      <GlassModal
        isOpen={resetStage !== null}
        onClose={() => undefined}
        eyebrow={t('settings.backup.totalReset')}
        title={t('settings.backup.resetting')}
        description={t('settings.backup.doNotClose')}
        variant="responsive"
        size="sm"
        dismissible={false}
        showCloseButton={false}
        zIndex={300}
        backdropClassName="bg-black/78 backdrop-blur-3xl"
      >
        {resetStage ? (
          <div className="flex min-h-[15rem] flex-col items-center justify-center px-2 py-6 text-center">
            <GlassLoader
              size="lg"
              label={resetCopy[resetStage].label}
              description={resetCopy[resetStage].description}
            />
            <div
              className="mt-7 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--ui-fill-tertiary)]"
              role="progressbar"
              aria-label={t('settings.backup.resetProgress')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={resetProgress}
            >
              <div
                className="h-full rounded-full bg-[color:var(--ui-accent)] transition-[width] duration-500 ease-out"
                style={{ width: `${resetProgress}%` }}
              />
            </div>
            <p className="mt-3 text-xs font-medium text-[color:var(--ui-text-tertiary)]">
              {resetProgress}%
            </p>
          </div>
        ) : null}
      </GlassModal>
    </section>
  );
}

export default SettingsDataBackupSection;
