import React, { useEffect, useRef, useState } from 'react';
import type { HaConnectionStatus } from '../../hooks/useHaLiveConnection';
import { useI18n } from '../../i18n/I18nProvider';
import type { DashboardResetProgressReporter } from '../../services/dashboardReset';
import type { DashboardAppearance } from '../../theme/dashboardTheme';
import DeferredGlassLoader from '../ui/DeferredGlassLoader';
import SettingsManagementShell from './SettingsManagementShell';
import SettingsSectionNavigation from './SettingsSectionNavigation';
import {
  SETTINGS_MANAGEMENT_SECTIONS,
  resolveSettingsManagementSection,
  type SettingsManagementSectionId,
} from './settingsManagementRegistry';
import type {
  HouseAccessView,
  ProfileHouseMember,
} from './settingsHouseAccessModel';

const SettingsHomeAssistantSection = React.lazy(
  () => import('./SettingsHomeAssistantSection'),
);
const SettingsDataBackupSection = React.lazy(
  () => import('./SettingsDataBackupSection'),
);
const SettingsHouseAccessSection = React.lazy(
  () => import('./SettingsHouseAccessSection'),
);

export type SettingsManagementPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  presentation?: 'overlay' | 'embedded';
  initialSection?: SettingsManagementSectionId;
  userAvatarUrl?: string;
  userAvatarAlt?: string;
  userEmail?: string;
  userRoleLabel?: string;
  houseMembers?: ProfileHouseMember[];
  appearance: DashboardAppearance;
  developerMode: boolean;
  onDeveloperModeChange: (value: boolean) => void;
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
  onDownloadBackup: () => void;
  onRestoreBackup: (file: File) => Promise<void>;
  onResetAll: (reportProgress?: DashboardResetProgressReporter) => Promise<void>;
  onOpenLayoutVersions?: () => void;
};

const SETTINGS_BREAKPOINT_PX = 768;
const DEFAULT_SETTINGS_AVATAR_URL = '/icons/icon-192.png';

function resolveMembersTitle(view: HouseAccessView, t: ReturnType<typeof useI18n>['t']) {
  if (view === 'members') return t('settings.management.members');
  if (view === 'guest') return t('settings.management.guests');
  if (view === 'share') return t('settings.management.sharing');
  return '';
}

export function SettingsManagementPanel({
  isOpen,
  onClose,
  presentation = 'overlay',
  initialSection = 'members',
  userAvatarUrl,
  userAvatarAlt,
  userEmail,
  userRoleLabel,
  houseMembers = [],
  appearance,
  developerMode,
  onDeveloperModeChange,
  haUrl,
  onUrlChange,
  haToken,
  onTokenChange,
  haRememberToken,
  onRememberTokenChange,
  haStatus,
  haError,
  haManagedByParent,
  onConnect,
  onDisconnect,
  onStartOAuth,
  isOAuthBusy,
  onDownloadBackup,
  onRestoreBackup,
  onResetAll,
  onOpenLayoutVersions,
}: SettingsManagementPanelProps) {
  const { t } = useI18n();
  const localizedSections = SETTINGS_MANAGEMENT_SECTIONS.map((section) => ({
    ...section,
    label: section.id === 'members' ? t('settings.management.homeAccess') : section.id === 'ha' ? 'Home Assistant' : t('settings.data.title'),
    hint: section.id === 'members' ? t('settings.management.homeAccessHint') : section.id === 'ha' ? t('settings.management.haHint') : t('settings.management.dataHint'),
  }));
  const resolvedInitialSection =
    resolveSettingsManagementSection(initialSection);
  const [activeSection, setActiveSection] =
    useState<SettingsManagementSectionId>(resolvedInitialSection);
  const [houseAccessView, setHouseAccessView] =
    useState<HouseAccessView>('overview');
  const [isCompactViewport, setIsCompactViewport] = useState(() =>
    typeof window === 'undefined'
      ? false
      : window.innerWidth < SETTINGS_BREAKPOINT_PX,
  );
  const [isCompactDetailOpen, setIsCompactDetailOpen] = useState(
    presentation === 'embedded',
  );
  const [avatarSrc, setAvatarSrc] = useState(
    userAvatarUrl ?? DEFAULT_SETTINGS_AVATAR_URL,
  );
  const wasOpenRef = useRef(false);

  useEffect(() => {
    setAvatarSrc(userAvatarUrl ?? DEFAULT_SETTINGS_AVATAR_URL);
  }, [userAvatarUrl]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const updateViewport = () => {
      setIsCompactViewport(window.innerWidth < SETTINGS_BREAKPOINT_PX);
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      setHouseAccessView('overview');
      setIsCompactDetailOpen(presentation === 'embedded');
      return;
    }
    if (!wasOpenRef.current) {
      setActiveSection(resolvedInitialSection);
      setHouseAccessView('overview');
      setIsCompactDetailOpen(presentation === 'embedded');
      wasOpenRef.current = true;
    }
  }, [isOpen, presentation, resolvedInitialSection]);

  if (!isOpen) {
    return null;
  }

  const activeSectionMeta =
    localizedSections.find(
      (section) => section.id === activeSection,
    ) ?? SETTINGS_MANAGEMENT_SECTIONS[0];
  const membersTitle = activeSection === 'members' ? resolveMembersTitle(houseAccessView, t) : '';
  const detailTitle = membersTitle || activeSectionMeta.label;
  const detailSubtitle = membersTitle
    ? activeSectionMeta.label
    : activeSectionMeta.hint;
  const showDetailOnCompact =
    presentation === 'embedded' || isCompactDetailOpen;
  const showMenuOnCompact =
    presentation !== 'embedded' && !isCompactDetailOpen;
  const displayName = userAvatarAlt?.trim() || t('settings.management.user');
  const displayEmail = userEmail?.trim() || t('settings.management.emailUnavailable');
  const displayRole = userRoleLabel?.trim() || t('settings.management.user');

  const handleSectionSelect = (section: SettingsManagementSectionId) => {
    setActiveSection(resolveSettingsManagementSection(section));
    setHouseAccessView('overview');
    if (isCompactViewport) {
      setIsCompactDetailOpen(true);
    }
  };

  const handleBack = () => {
    if (activeSection === 'members' && houseAccessView !== 'overview') {
      setHouseAccessView('overview');
      return;
    }
    if (isCompactDetailOpen && presentation !== 'embedded') {
      setIsCompactDetailOpen(false);
      return;
    }
    onClose();
  };

  return (
    <SettingsManagementShell
      presentation={presentation}
      isCompactViewport={isCompactViewport}
      showMenuOnCompact={showMenuOnCompact}
      showDetailOnCompact={showDetailOnCompact}
      menuTitle={t('settings.back')}
      menuSubtitle={t('settings.management.menuSubtitle')}
      detailTitle={detailTitle}
      detailSubtitle={detailSubtitle}
      displayName={displayName}
      displayEmail={displayEmail}
      displayRole={displayRole}
      avatarSrc={avatarSrc}
      avatarAlt={userAvatarAlt ?? ''}
      onAvatarError={() => setAvatarSrc(DEFAULT_SETTINGS_AVATAR_URL)}
      onBack={handleBack}
      onClose={onClose}
      navigation={
        <SettingsSectionNavigation
          sections={localizedSections}
          activeSection={activeSection}
          isCompactViewport={isCompactViewport}
          onSelect={handleSectionSelect}
        />
      }
    >
      {activeSection === 'members' ? (
        <React.Suspense
          fallback={
            <DeferredGlassLoader
              label={t('settings.management.loadingHome')}
              description={t('settings.management.loadingHomeDescription')}
            />
          }
        >
          <SettingsHouseAccessSection
            view={houseAccessView}
            onViewChange={setHouseAccessView}
            houseMembers={houseMembers}
            currentUserName={displayName}
            currentUserRole={displayRole}
          />
        </React.Suspense>
      ) : null}

      {activeSection === 'ha' ? (
        <React.Suspense
          fallback={
            <DeferredGlassLoader
              label={t('settings.management.loadingConnection')}
              description={t('settings.management.loadingConnectionDescription')}
            />
          }
        >
          <SettingsHomeAssistantSection
            appearance={appearance}
            haUrl={haUrl}
            onUrlChange={onUrlChange}
            haToken={haToken}
            onTokenChange={onTokenChange}
            haRememberToken={haRememberToken}
            onRememberTokenChange={onRememberTokenChange}
            haStatus={haStatus}
            haError={haError}
            haManagedByParent={haManagedByParent}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
            onStartOAuth={onStartOAuth}
            isOAuthBusy={isOAuthBusy}
          />
        </React.Suspense>
      ) : null}

      {activeSection === 'config' ? (
        <React.Suspense
          fallback={
            <DeferredGlassLoader
              label={t('settings.management.loadingData')}
              description={t('settings.management.loadingDataDescription')}
            />
          }
        >
          <SettingsDataBackupSection
            appearance={appearance}
            developerMode={developerMode}
            onDeveloperModeChange={onDeveloperModeChange}
            onDownloadBackup={onDownloadBackup}
            onRestoreBackup={onRestoreBackup}
            onResetAll={onResetAll}
            onOpenLayoutVersions={onOpenLayoutVersions}
          />
        </React.Suspense>
      ) : null}
    </SettingsManagementShell>
  );
}

export default SettingsManagementPanel;
