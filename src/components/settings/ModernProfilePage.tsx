import { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeCheck,
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Fingerprint,
  KeyRound,
  LifeBuoy,
  Mail,
  MapPin,
  Route,
  ShieldCheck,
  Trash2,
  UserRound,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import type { HaConnectionStatus } from '../../hooks/useHaLiveConnection';
import type { DashboardRuntimeMode } from '../../security/dashboardAccess';
import type { HaFrontendPreferencesCallApi } from '../../services/haFrontendPreferences';
import { useDeviceAuth } from '../../hooks/useDeviceAuth';
import { usePersonalDevices } from '../../hooks/usePersonalDevices';
import { appendSecurityAuditEvent } from '../../services/securityAuth';
import { PROFILE_ROUTE } from '../../navigation/settingsRoutes';
import NestedPageHeader from '../ui/NestedPageHeader';
import ProfileGroup from './ProfileGroup';
import ProfileStartupPanelPreference from './ProfileStartupPanelPreference';
import type { PersonalDevicesAvailability } from './profileDevices/PersonalDevicesView';
import PersonalDevicesSkeleton from './profileDevices/PersonalDevicesSkeleton';
import type {
  ProfileMovementMapPoint,
  ProfileMovementTimelineEntry,
  ProfileSectionId,
} from './profileModels';
import type { ProfileHouseMember } from './settingsHouseAccessModel';
import { PUSH_PAGE_ATTRIBUTE, playPagePush, usePagePushTransition } from '../ui/usePagePushTransition';

// The overview, then each profile page one level below.
const profileViewDepth = (view: string) => (view === 'overview' ? 1 : 2);

// Only users who open My devices download its screens and dialogs.
const PersonalDevicesView = lazy(() => import('./profileDevices/PersonalDevicesView'));

// Appearance and language are device settings: Settings › This device.
// The Profile is the top of Settings: its pages live below `/settings/profile`.
type ProfileView = 'overview' | 'personal' | 'activity' | 'devices' | 'security';

type ModernProfilePageProps = {
  isOpen: boolean;
  onClose: () => void;
  initialSection?: ProfileSectionId;
  currentUserId?: string;
  haUserId?: string;
  userAvatarUrl?: string;
  userAvatarAlt?: string;
  userEmail?: string;
  userRoleLabel?: string;
  houseMembers?: ProfileHouseMember[];
  /** Presence trackers declared by the current user's Person; activity only. */
  presenceTrackerCount?: number;
  /** The integration offers Domus personal devices (`profile_devices_v1`). */
  profileDevicesSupported?: boolean;
  movementTimeline?: ProfileMovementTimelineEntry[];
  movementPoints?: ProfileMovementMapPoint[];
  movementUpdatedLabel?: string;
  haStatus: HaConnectionStatus;
  navigationRoute?: string;
  onNavigate?: (path: string) => void;
  runtimeMode?: DashboardRuntimeMode;
  onCallApi?: HaFrontendPreferencesCallApi;
  onNotify?: (type: 'info' | 'warning' | 'alert', message: string) => unknown;
};

type ProfileRowProps = {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  value?: string;
  onClick?: () => void;
  tone?: 'default' | 'success' | 'warning';
};

function resolveInitialView(section: ProfileSectionId | undefined): ProfileView {
  if (section === 'movements') {
    return 'activity';
  }
  if (section === 'security') {
    return 'security';
  }
  return 'overview';
}

function resolveProfileViewFromRoute(route: string | undefined): ProfileView | null {
  if (!route) {
    return null;
  }
  const path = route.split(/[?#]/, 1)[0].replace(/\/+$/, '');
  if (path === `${PROFILE_ROUTE}/personal`) return 'personal';
  if (path === `${PROFILE_ROUTE}/activity`) return 'activity';
  if (path === `${PROFILE_ROUTE}/devices`) return 'devices';
  if (path === `${PROFILE_ROUTE}/security`) return 'security';
  return path === PROFILE_ROUTE ? 'overview' : null;
}

const profilePathByView: Record<ProfileView, string> = {
  overview: PROFILE_ROUTE,
  personal: `${PROFILE_ROUTE}/personal`,
  activity: `${PROFILE_ROUTE}/activity`,
  devices: `${PROFILE_ROUTE}/devices`,
  security: `${PROFILE_ROUTE}/security`,
};

function ProfileRow({
  icon: Icon,
  title,
  subtitle,
  value,
  onClick,
  tone = 'default',
}: ProfileRowProps) {
  const content = (
    <>
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.95rem] border ${
          tone === 'success'
            ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-500'
            : tone === 'warning'
              ? 'border-amber-400/25 bg-amber-500/10 text-amber-500'
              : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]'
        }`}
      >
        <Icon size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold tracking-[-0.01em] text-[color:var(--ui-text-primary)]">
          {title}
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-[color:var(--ui-text-secondary)]">
          {subtitle}
        </span>
      </span>
      {value ? (
        <span className="max-w-[38%] truncate text-right text-xs font-semibold text-[color:var(--ui-text-secondary)]">
          {value}
        </span>
      ) : null}
      {onClick ? <ChevronRight size={17} className="shrink-0 text-[color:var(--ui-text-tertiary)]" /> : null}
    </>
  );

  const className =
    'flex min-h-[4.4rem] w-full items-center gap-3 px-4 py-3 text-left transition-colors first:rounded-t-[1.35rem] last:rounded-b-[1.35rem]';

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${className} hover:bg-[color:var(--ui-fill-tertiary)] active:bg-[color:var(--ui-fill-secondary)]`}
      >
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}

export function ModernProfilePage({
  isOpen,
  onClose,
  initialSection,
  currentUserId,
  haUserId,
  userAvatarAlt,
  userEmail,
  userRoleLabel,
  houseMembers = [],
  presenceTrackerCount = 0,
  profileDevicesSupported = false,
  movementTimeline = [],
  movementPoints = [],
  movementUpdatedLabel,
  haStatus,
  navigationRoute,
  onNavigate,
  runtimeMode = 'demo',
  onCallApi,
  onNotify,
}: ModernProfilePageProps) {
  const { t } = useI18n();
  const [view, setView] = useState<ProfileView>(
    () => resolveProfileViewFromRoute(navigationRoute) ?? resolveInitialView(initialSection),
  );
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [securityBusy, setSecurityBusy] = useState(false);
  const [securityAvailable, setSecurityAvailable] = useState(false);
  const [securityFeedback, setSecurityFeedback] = useState<{
    tone: 'success' | 'error';
    text: string;
  } | null>(null);

  const currentMember = useMemo(
    () =>
      houseMembers.find((member) => member.isCurrent) ??
      houseMembers.find((member) => member.userId && member.userId === currentUserId) ??
      houseMembers[0],
    [currentUserId, houseMembers],
  );
  const displayName = userAvatarAlt?.trim() || currentMember?.name?.trim() || t('profile.fallback.name');
  // Only a real address is shown; no placeholder text stands in for a missing email.
  const accountEmail = userEmail?.trim() || '';
  const displayEmail = accountEmail || t('profile.fallback.account');
  const displayRole = userRoleLabel?.trim() || currentMember?.roleLabel?.trim() || t('profile.fallback.role');
  const isConnected = haStatus === 'connected';
  const latestMovement = movementTimeline[0];
  // The person and its tracker report the same move: show it once, keeping the first (the person).
  const historyEntries = movementTimeline
    .filter((entry, index, all) =>
      all.findIndex((other) => other.title === entry.title && other.timestampLabel === entry.timestampLabel) === index)
    .slice(0, 12);
  const deviceAuth = useDeviceAuth({
    id: currentUserId || displayEmail,
    name: displayEmail,
    displayName,
  });
  const devicesReachable: PersonalDevicesAvailability = !profileDevicesSupported || runtimeMode !== 'real'
    ? 'unsupported'
    : isConnected && onCallApi
      ? 'ready'
      : 'offline';
  // Read when the profile opens; the overview count and the devices page share it.
  const personalDevices = usePersonalDevices({
    callApi: onCallApi,
    enabled: isOpen && devicesReachable === 'ready',
  });
  const personalDeviceCount = personalDevices.state.snapshot?.profile.personalDevices.length;
  // An older integration answers without the profile commands.
  const devicesAvailability: PersonalDevicesAvailability =
    personalDevices.state.loadError === 'unsupported' && personalDeviceCount === undefined
      ? 'unsupported'
      : devicesReachable;

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setView(resolveProfileViewFromRoute(navigationRoute) ?? resolveInitialView(initialSection));
    setSecurityFeedback(null);
  }, [initialSection, isOpen, navigationRoute]);

  useEffect(() => {
    let active = true;
    void deviceAuth.isBiometricAvailable().then((available) => {
      if (active) {
        setSecurityAvailable(available);
      }
    });
    return () => {
      active = false;
    };
  }, [deviceAuth]);

  if (!isOpen) {
    return null;
  }

  const handleBack = () => {
    if (view === 'overview') {
      onClose();
      return;
    }
    setView('overview');
    onNavigate?.(PROFILE_ROUTE);
  };

  const openView = (nextView: Exclude<ProfileView, 'overview'>) => {
    setView(nextView);
    onNavigate?.(profilePathByView[nextView]);
  };

  const handleVerifyOrEnroll = async () => {
    if (!securityAvailable || securityBusy) {
      return;
    }
    setSecurityBusy(true);
    setSecurityFeedback(null);
    const wasEnrolled = deviceAuth.isEnrolled;
    try {
      const verified = await deviceAuth.verifyOrEnroll(t('profile.deviceConfirmation.title'));
      if (!verified) {
        appendSecurityAuditEvent({
          tone: 'warning',
          message: t('profile.deviceConfirmation.failed'),
          context: t('profile.title'),
        });
        setSecurityFeedback({
          tone: 'error',
          text: t('profile.deviceConfirmation.failed'),
        });
        return;
      }
      appendSecurityAuditEvent({
        tone: 'success',
        message: wasEnrolled ? t('profile.deviceConfirmation.verified') : t('profile.deviceConfirmation.enrolled'),
        context: t('profile.title'),
      });
      setSecurityFeedback({
        tone: 'success',
        text: wasEnrolled
          ? t('profile.deviceConfirmation.verified')
          : t('profile.deviceConfirmation.enrolled'),
      });
    } finally {
      setSecurityBusy(false);
    }
  };

  const handleRemoveCredential = () => {
    if (!deviceAuth.isEnrolled) {
      return;
    }
    const confirmed = window.confirm(t('profile.deviceConfirmation.removePrompt'));
    if (!confirmed) {
      return;
    }
    deviceAuth.clearCredential();
    appendSecurityAuditEvent({
      tone: 'warning',
      message: t('profile.deviceConfirmation.removed'),
      context: t('profile.title'),
    });
    setSecurityFeedback({
      tone: 'success',
      text: t('profile.deviceConfirmation.removed'),
    });
  };

  usePagePushTransition('profile', view, profileViewDepth);
  // Opening the profile from Settings is itself a push from the page below.
  useLayoutEffect(() => {
    playPagePush('profile-root', 'forward');
  }, []);

  return (
    <div
      ref={scrollContainerRef}
      {...{ [PUSH_PAGE_ATTRIBUTE]: 'profile-root' }}
      data-testid="modern-profile-scroll"
      className="dashboard-page-scroll !p-0 text-[color:var(--ui-text-primary)]"
    >
      <NestedPageHeader
        title={
          view === 'overview'
            ? t('profile.title')
            : view === 'personal'
              ? t('profile.view.personal')
              : view === 'activity'
                ? t('profile.view.activity')
                : view === 'devices'
                  ? t('profile.view.devices')
                  : t('profile.view.security')
        }
        subtitle={displayName}
        backLabel={view === 'overview' ? t('settings.back') : t('profile.title')}
        backAriaLabel={t('profile.back')}
        onBack={handleBack}
        scrollContainerRef={scrollContainerRef}
        maxWidthClassName="max-w-[48rem]"
      />

      <main
        {...{ [PUSH_PAGE_ATTRIBUTE]: 'profile' }}
        className="mx-auto w-full max-w-[48rem] px-4 pb-[calc(env(safe-area-inset-bottom)+2.5rem)] pt-5 sm:px-6 sm:pt-7 lg:px-8"
      >
        {view === 'overview' ? (
          <div className="space-y-6">
            <ProfileGroup title={t('profile.account.group')}>
              <ProfileRow
                icon={UserRound}
                title={t('profile.personal.title')}
                subtitle={t('profile.personal.subtitle')}
                onClick={() => openView('personal')}
              />
              <ProfileRow
                icon={Route}
                title={t('profile.activity.title')}
                subtitle={latestMovement?.title ?? t('profile.activity.emptyRecent')}
                onClick={() => openView('activity')}
              />
              <ProfileRow
                icon={Bell}
                title={t('profile.devices.title')}
                subtitle={t('profile.devices.subtitle')}
                value={
                  devicesAvailability === 'unsupported'
                    ? t('profile.devices.countUnavailable')
                    : personalDeviceCount === undefined
                      ? undefined
                      : `${personalDeviceCount}`
                }
                onClick={() => openView('devices')}
              />
              <ProfileRow
                icon={ShieldCheck}
                title={t('profile.security.title')}
                subtitle={
                  deviceAuth.isEnrolled
                    ? t('profile.security.configured')
                    : t('profile.security.protect')
                }
                value={deviceAuth.isEnrolled ? t('profile.security.active') : undefined}
                onClick={() => openView('security')}
                tone={deviceAuth.isEnrolled ? 'success' : 'default'}
              />
            </ProfileGroup>

            {/* The startup panel is a Home Assistant preference of the person, so it needs Home Assistant. */}
            {runtimeMode === 'real' ? (
              <ProfileGroup title={t('profile.group.preferences')}>
                <ProfileStartupPanelPreference
                  runtimeMode={runtimeMode}
                  haStatus={haStatus}
                  haUserId={haUserId}
                  onCallApi={onCallApi}
                  onNotify={onNotify}
                />
              </ProfileGroup>
            ) : null}

            <ProfileGroup title={t('profile.group.help')}>
              <ProfileRow
                icon={LifeBuoy}
                title={t('profile.support.title')}
                subtitle={t('profile.support.subtitle')}
                onClick={() => onNavigate?.('/support')}
              />
            </ProfileGroup>

          </div>
        ) : null}

        {view === 'personal' ? (
          <div className="space-y-6">
            <ProfileGroup title={t('profile.account.group')}>
              <ProfileRow
                icon={UserRound}
                title={t('profile.account.displayName')}
                subtitle={t('profile.account.displayNameSource')}
                value={displayName}
              />
              {accountEmail ? (
                <ProfileRow
                  icon={Mail}
                  title={t('profile.account.email')}
                  subtitle={accountEmail}
                />
              ) : null}
              <ProfileRow
                icon={BadgeCheck}
                title={t('profile.account.role')}
                subtitle={t('profile.account.roleSubtitle')}
                value={displayRole}
              />
            </ProfileGroup>

            <p className="px-1 text-xs leading-5 text-[color:var(--ui-text-secondary)]">
              {t('profile.account.managedNote')}
            </p>
          </div>
        ) : null}

        {view === 'activity' ? (
          <div className="space-y-7">
            <section
              data-testid="profile-activity-summary"
              className="flex items-center gap-4 rounded-[1.4rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass-soft)] p-4 shadow-[0_16px_34px_var(--ui-shadow-soft)] backdrop-blur-2xl"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[1.1rem] border border-emerald-400/25 bg-emerald-500/10 text-emerald-500">
                <MapPin size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-[color:var(--ui-text-secondary)]">{t('profile.activity.lastPosition')}</span>
                <span className="mt-0.5 block truncate text-lg font-semibold tracking-[-0.02em]">
                  {movementPoints[0]?.zoneLabel || movementPoints[0]?.label || t('profile.status.unavailable')}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-[color:var(--ui-text-secondary)]">
                  {[
                    movementUpdatedLabel || t('profile.activity.noRecentData'),
                    presenceTrackerCount === 0
                      ? t('profile.activity.sourcesNone')
                      : presenceTrackerCount === 1
                        ? t('profile.activity.sourcesOne')
                        : t('profile.activity.sourcesMany', { count: presenceTrackerCount }),
                  ].join(' · ')}
                </span>
              </span>
            </section>

            <ProfileGroup title={t('profile.activity.history')}>
              {historyEntries.length > 0 ? (
                historyEntries.map((entry) => (
                  <ProfileRow
                    key={entry.id}
                    icon={entry.isCurrent ? MapPin : Clock3}
                    title={entry.title}
                    subtitle={entry.subtitle || entry.timestampLabel}
                    value={entry.timestampLabel}
                    tone={entry.isCurrent ? 'success' : 'default'}
                  />
                ))
              ) : (
                <div className="px-5 py-10 text-center">
                  <MapPin size={24} className="mx-auto text-[color:var(--ui-text-tertiary)]" />
                  <p className="mt-3 text-sm font-semibold">{t('profile.activity.emptyTitle')}</p>
                  <p className="mt-1 text-xs text-[color:var(--ui-text-secondary)]">
                    {t('profile.activity.emptySubtitle')}
                  </p>
                </div>
              )}
            </ProfileGroup>
          </div>
        ) : null}

        {view === 'devices' ? (
          <Suspense fallback={<PersonalDevicesSkeleton label={t('profile.devices.loading')} />}>
            <PersonalDevicesView
              controller={personalDevices}
              availability={devicesAvailability}
              callApi={onCallApi}
            />
          </Suspense>
        ) : null}

        {view === 'security' ? (
          <div className="space-y-7">
            <section className="rounded-[1.65rem] border border-[color:var(--ui-border-strong)] bg-[color:var(--ui-surface-glass)] p-5 shadow-[0_22px_50px_var(--ui-shadow-soft)] backdrop-blur-3xl sm:p-7">
              <div className="flex items-start gap-4">
                <span
                  className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.2rem] border ${
                    deviceAuth.isEnrolled
                      ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-500'
                      : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]'
                  }`}
                >
                  <Fingerprint size={25} />
                </span>
                <div className="min-w-0">
                  <p className="text-lg font-semibold tracking-[-0.025em]">{t('profile.deviceConfirmation.title')}</p>
                  <p className="mt-1 text-sm leading-6 text-[color:var(--ui-text-secondary)]">
                    {deviceAuth.isEnrolled
                      ? t('profile.deviceConfirmation.enrolledDescription')
                      : t('profile.deviceConfirmation.availableDescription')}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleVerifyOrEnroll()}
                  disabled={!securityAvailable || securityBusy}
                  className="liquid-glass-selection inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-[color:var(--ui-border-strong)] px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none"
                >
                  <KeyRound size={16} />
                  {securityBusy
                    ? t('profile.deviceConfirmation.verifying')
                    : deviceAuth.isEnrolled
                      ? t('profile.deviceConfirmation.verify')
                      : t('profile.deviceConfirmation.configure')}
                </button>
                {deviceAuth.isEnrolled ? (
                  <button
                    type="button"
                    onClick={handleRemoveCredential}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-rose-400/25 bg-rose-500/[0.07] px-5 text-sm font-semibold text-rose-500"
                  >
                    <Trash2 size={16} />
                    {t('profile.deviceConfirmation.remove')}
                  </button>
                ) : null}
              </div>

              {!securityAvailable ? (
                <p className="mt-4 text-xs leading-5 text-amber-500">
                  {t('profile.deviceConfirmation.unavailable')}
                </p>
              ) : null}

              {securityFeedback ? (
                <p
                  className={`mt-4 flex items-start gap-2 text-xs leading-5 ${
                    securityFeedback.tone === 'success' ? 'text-emerald-500' : 'text-rose-500'
                  }`}
                >
                  {securityFeedback.tone === 'success' ? (
                    <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
                  ) : (
                    <XCircle size={15} className="mt-0.5 shrink-0" />
                  )}
                  {securityFeedback.text}
                </p>
              ) : null}
            </section>

            <ProfileGroup title={t('profile.deviceConfirmation.statusGroup')}>
              <ProfileRow
                icon={Fingerprint}
                title={t('profile.deviceConfirmation.passkey')}
                subtitle={t('profile.deviceConfirmation.passkeySubtitle')}
                value={deviceAuth.isEnrolled ? t('profile.deviceConfirmation.configured') : t('profile.deviceConfirmation.notConfigured')}
                tone={deviceAuth.isEnrolled ? 'success' : 'default'}
              />
              <ProfileRow
                icon={ShieldCheck}
                title={t('profile.deviceConfirmation.authority')}
                subtitle={t('profile.deviceConfirmation.authoritySubtitle')}
                value="Home Assistant"
              />
            </ProfileGroup>
          </div>
        ) : null}
      </main>
    </div>
  );
}

export default ModernProfilePage;
