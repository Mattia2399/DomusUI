import { useEffect, useRef, useState, type ChangeEvent, type ComponentType } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  ShieldCheck,
  Upload,
  Users,
} from 'lucide-react';
import { useDashboardSecurity } from '../../security/dashboardAccess';
import { useI18n } from '../../i18n/I18nProvider';
import {
  applyDashboardUserDataPayload,
  buildDashboardUserDataPayload,
  parseDashboardUserDataPayload,
} from '../../services/haUserConfigSync';
import {
  createDashboardRoleSharePayload,
  normalizeHouseMembers,
  parseDashboardRoleSharePayload,
  resolveDashboardShareRoleKey,
  type HouseAccessView,
  type ProfileHouseMember,
} from './settingsHouseAccessModel';

export type SettingsHouseAccessSectionProps = {
  view: HouseAccessView;
  onViewChange: (view: HouseAccessView) => void;
  houseMembers: readonly ProfileHouseMember[];
  currentUserName?: string;
  currentUserRole?: string;
};

type Feedback = {
  tone: 'idle' | 'success' | 'error';
  text: string;
};

function getMemberInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || '?'
  );
}

export function SettingsHouseAccessSection({
  view,
  onViewChange,
  houseMembers,
  currentUserName,
  currentUserRole,
}: SettingsHouseAccessSectionProps) {
  const { t } = useI18n();
  const dashboardSecurity = useDashboardSecurity();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [shareFeedback, setShareFeedback] = useState<Feedback>({
    tone: 'idle',
    text: '',
  });

  const members = normalizeHouseMembers(houseMembers);
  const visibleMembers = members.slice(0, 4);
  const hiddenMembersCount = Math.max(0, members.length - visibleMembers.length);
  const currentRoleKey = resolveDashboardShareRoleKey(currentUserRole);
  const currentRoleLabel = t(
    currentRoleKey === 'creator'
      ? 'settings.access.role.creator'
      : currentRoleKey === 'admin'
        ? 'settings.access.role.admin'
        : 'settings.access.role.member',
  );
  const canManageDashboardData = dashboardSecurity.can('edit_dashboard');

  useEffect(() => {
    if (shareFeedback.tone === 'idle' || !shareFeedback.text) {
      return undefined;
    }
    const timerId = window.setTimeout(() => {
      setShareFeedback({ tone: 'idle', text: '' });
    }, 2600);
    return () => window.clearTimeout(timerId);
  }, [shareFeedback]);

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
  const buttonMotionClass =
    'transition-[filter,transform] duration-200 hover:brightness-[1.03] active:scale-[0.995] disabled:hover:brightness-100 disabled:active:scale-100';
  const neutralButtonClass =
    'border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass-strong)] text-[color:var(--ui-text-primary)] shadow-[0_8px_18px_var(--ui-shadow)] hover:bg-[color:var(--ui-surface-glass)]';
  const accentButtonClass =
    'border-[color:rgb(var(--ui-accent-rgb)/0.55)] bg-[linear-gradient(140deg,rgb(var(--ui-accent-rgb)/0.34)_0%,rgb(var(--ui-accent-secondary-rgb)/0.24)_100%)] text-[color:var(--ui-text-primary)] shadow-[0_12px_24px_var(--ui-shadow-soft)] hover:brightness-105';

  const renderSettingsIcon = (
    Icon: ComponentType<{ size?: number; className?: string }>,
  ) => (
    <span className={settingsIconClass}>
      <Icon size={16} />
    </span>
  );

  const handleDownloadDashboardShare = () => {
    if (
      !canManageDashboardData ||
      typeof window === 'undefined' ||
      typeof document === 'undefined'
    ) {
      return;
    }
    try {
      const data = buildDashboardUserDataPayload(window.localStorage);
      const payload = createDashboardRoleSharePayload({
        roleKey: currentRoleKey,
        roleLabel: currentRoleLabel,
        createdBy: currentUserName?.trim() || undefined,
        data,
      });
      const safeTimestamp = payload.createdAt.replace(/[:.]/g, '-');
      const blob = new Blob([JSON.stringify(payload)], {
        type: 'application/json;charset=utf-8',
      });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `ha-dashboard-share-${currentRoleKey}-${safeTimestamp}.json`;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
      setShareFeedback({ tone: 'success', text: t('settings.access.exported') });
    } catch {
      setShareFeedback({
        tone: 'error',
        text: t('settings.access.exportFailed'),
      });
    }
  };

  const handleDashboardShareImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !canManageDashboardData || typeof window === 'undefined') {
      return;
    }

    try {
      const parsedSharePayload = parseDashboardRoleSharePayload(await file.text());
      if (!parsedSharePayload) {
        setShareFeedback({ tone: 'error', text: t('settings.access.invalidFile') });
        return;
      }
      if (parsedSharePayload.roleKey !== currentRoleKey) {
        setShareFeedback({
          tone: 'error',
          text: t('settings.access.roleMismatch', { fileRole: parsedSharePayload.roleLabel, currentRole: currentRoleLabel }),
        });
        return;
      }
      const parsedDashboardPayload = parseDashboardUserDataPayload(parsedSharePayload.data);
      if (!parsedDashboardPayload) {
        setShareFeedback({
          tone: 'error',
          text: t('settings.access.invalidDashboard'),
        });
        return;
      }
      const applyResult = applyDashboardUserDataPayload(
        parsedDashboardPayload,
        window.localStorage,
      );
      if (!applyResult.changed) {
        setShareFeedback({ tone: 'success', text: t('settings.access.alreadyUpdated') });
        return;
      }
      setShareFeedback({
        tone: 'success',
        text: t('settings.access.appliedReloading'),
      });
      window.setTimeout(() => window.location.reload(), 320);
    } catch {
      setShareFeedback({
        tone: 'error',
        text: t('settings.access.readFailed'),
      });
    }
  };

  const backButton = (
    <button
      type="button"
      onClick={() => onViewChange('overview')}
      className={`mb-4 inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--ui-text-secondary)] hover:text-[color:var(--ui-text-primary)] ${buttonMotionClass}`}
    >
      <ChevronLeft size={16} />
      {t('settings.management.homeAccess')}
    </button>
  );

  if (view === 'members') {
    return (
      <section className="pb-6">
        {backButton}
        <h4 className="text-base font-semibold text-[color:var(--ui-text-primary)]">
          {t('settings.access.membersTitle')}
        </h4>
        <p className={`mt-1 text-xs ${subtleTextClass}`}>
          {t('settings.access.membersDescription')}
        </p>

        {members.length > 0 ? (
          <div className={`mt-4 ${settingsGroupClass}`}>
            {members.map((member, index) => (
              <div key={member.id}>
                {index > 0 ? <div className={settingsDividerClass} /> : null}
                <div className={settingsRowClass}>
                  {member.avatarUrl ? (
                    <img
                      src={member.avatarUrl}
                      alt={`Membro ${member.name}`}
                      className="h-10 w-10 shrink-0 rounded-full border-2 border-[color:var(--ui-border-strong)] object-cover"
                    />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-[color:var(--ui-border-strong)] bg-[color:var(--ui-fill-tertiary)] text-xs font-semibold text-[color:var(--ui-text-primary)]">
                      {getMemberInitials(member.name)}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[color:var(--ui-text-primary)]">
                      {member.name}
                    </p>
                    <p className={settingsSubtitleClass}>
                      {member.isCurrent ? t('settings.access.currentAccount') : t('settings.access.registeredUser')}
                    </p>
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ui-text-secondary)]">
                    {member.roleLabel?.trim() || t('settings.access.member')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={`mt-4 ${settingsGroupClass} px-4 py-6 text-center text-xs ${subtleTextClass}`}>
            {t('settings.access.noMembers')}
          </div>
        )}
      </section>
    );
  }

  if (view === 'guest') {
    return (
      <section className="pb-6">
        {backButton}
        <div className={`${settingsGroupClass} px-5 py-6 text-center`}>
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-primary)]">
            <Clock3 size={21} />
          </span>
          <h4 className="mt-4 text-base font-semibold text-[color:var(--ui-text-primary)]">
            {t('settings.access.guestsComing')}
          </h4>
          <p className={`mx-auto mt-2 max-w-md text-xs leading-5 ${subtleTextClass}`}>
            {t('settings.access.guestsDescription')}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2 text-[11px] font-medium text-[color:var(--ui-text-secondary)]">
            <ShieldCheck size={14} />
            {t('settings.access.noSimulatedAccess')}
          </div>
        </div>
      </section>
    );
  }

  if (view === 'share') {
    return (
      <section className="pb-6">
        {backButton}
        <h4 className="text-base font-semibold text-[color:var(--ui-text-primary)]">
          {t('settings.access.sharingTitle')}
        </h4>
        <p className={`mt-2 text-xs ${subtleTextClass}`}>
          {t('settings.access.sharingDescription')}
        </p>
        <p className={`mt-2 text-[11px] ${subtleTextClass}`}>
          {t('settings.access.currentRole')}{' '}
          <span className="font-semibold text-[color:var(--ui-text-primary)]">
            {currentRoleLabel}
          </span>
        </p>

        {canManageDashboardData ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3">
              <button
                type="button"
                onClick={handleDownloadDashboardShare}
                className={`min-h-[2.75rem] rounded-xl border px-3 py-2.5 text-xs font-semibold ${buttonMotionClass} ${accentButtonClass}`}
              >
                {t('settings.access.downloadJson')}
              </button>
              <button
                type="button"
                onClick={() => importInputRef.current?.click()}
                className={`min-h-[2.75rem] rounded-xl border px-3 py-2.5 text-xs font-semibold ${buttonMotionClass} ${neutralButtonClass}`}
              >
                {t('settings.access.importJson')}
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept=".json,application/json,text/plain"
                className="hidden"
                onChange={(event) => {
                  void handleDashboardShareImport(event);
                }}
              />
            </div>
            <div className={`mt-3 rounded-xl px-3 py-2.5 text-[11px] ${subtleTextClass}`}>
              {t('settings.access.importNote')}
            </div>
          </>
        ) : (
          <div className={`mt-4 ${settingsGroupClass} px-4 py-4 text-xs ${subtleTextClass}`}>
            {t('settings.access.permissionsRequired')}
          </div>
        )}

        {shareFeedback.text ? (
          <p
            className={`mt-3 text-xs ${
              shareFeedback.tone === 'error' ? 'text-rose-500' : subtleTextClass
            }`}
          >
            {shareFeedback.text}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section className="pb-6">
      <p className={`text-xs leading-5 ${subtleTextClass}`}>
        {t('settings.access.overviewDescription')}
      </p>

      <div className={`mt-4 ${settingsGroupClass}`}>
        <button
          type="button"
          onClick={() => onViewChange('members')}
          className={`${settingsRowClass} ${buttonMotionClass}`}
        >
          {renderSettingsIcon(Users)}
          <div className="min-w-0 flex-1">
            <p className={settingsTitleClass}>{t('settings.management.members')}</p>
            <p className={settingsSubtitleClass}>
              {members.length > 0
                ? t(members.length === 1 ? 'settings.access.personAvailable' : 'settings.access.peopleAvailable', { count: members.length })
                : t('settings.access.noMembers')}
            </p>
          </div>
          {visibleMembers.length > 0 ? (
            <div className="hidden items-center sm:flex">
              {visibleMembers.map((member, index) =>
                member.avatarUrl ? (
                  <img
                    key={member.id}
                    src={member.avatarUrl}
                    alt=""
                    className={`h-8 w-8 rounded-full border-2 border-[color:var(--ui-border-strong)] object-cover ${
                      index === 0 ? '' : '-ml-2'
                    }`}
                  />
                ) : (
                  <span
                    key={member.id}
                    className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-[color:var(--ui-border-strong)] bg-[color:var(--ui-fill-tertiary)] text-[10px] font-semibold text-[color:var(--ui-text-primary)] ${
                      index === 0 ? '' : '-ml-2'
                    }`}
                  >
                    {getMemberInitials(member.name)}
                  </span>
                ),
              )}
              {hiddenMembersCount > 0 ? (
                <span className="-ml-2 flex h-8 min-w-8 items-center justify-center rounded-full border-2 border-[color:var(--ui-border-strong)] bg-[color:var(--ui-fill-tertiary)] px-1 text-[10px] font-semibold text-[color:var(--ui-text-primary)]">
                  +{hiddenMembersCount}
                </span>
              ) : null}
            </div>
          ) : null}
          <ChevronRight size={16} className={subtleTextClass} />
        </button>

        <div className={settingsDividerClass} />

        <button
          type="button"
          onClick={() => onViewChange('guest')}
          className={`${settingsRowClass} ${buttonMotionClass}`}
        >
          {renderSettingsIcon(Clock3)}
          <div className="min-w-0 flex-1">
            <p className={settingsTitleClass}>{t('settings.access.guestAccess')}</p>
            <p className={settingsSubtitleClass}>{t('settings.access.comingLater')}</p>
          </div>
          <ChevronRight size={16} className={subtleTextClass} />
        </button>

        <div className={settingsDividerClass} />

        <button
          type="button"
          onClick={() => onViewChange('share')}
          className={`${settingsRowClass} ${buttonMotionClass}`}
        >
          {renderSettingsIcon(Upload)}
          <div className="min-w-0 flex-1">
            <p className={settingsTitleClass}>{t('settings.access.shareDashboard')}</p>
            <p className={settingsSubtitleClass}>{t('settings.access.shareDashboardDescription')}</p>
          </div>
          <ChevronRight size={16} className={subtleTextClass} />
        </button>
      </div>
    </section>
  );
}

export default SettingsHouseAccessSection;
