import React from 'react';
import {
  ChevronDown,
  LogOut,
  PencilLine,
  Plus,
  Settings,
} from 'lucide-react';
import type { SidebarQuickPath } from '../../hooks/useProfileSettings';
import type { HaConnectionStatus } from '../../hooks/useHaLiveConnection';
import { useI18n } from '../../i18n/I18nProvider';
import {
  getDashboardNavigationIcon,
  isDashboardNavigationEntryActive,
  PRIMARY_DASHBOARD_ROUTE_IDS,
  resolveDashboardNavigationEntries,
  TOOL_DASHBOARD_ROUTE_IDS,
} from './dashboardNavigation';
import { DashboardProfileAvatar } from './DashboardProfileAvatar';

type MobileSidebarDrawerProps = {
  isOpen: boolean;
  isEditMode: boolean;
  isEditTourActive?: boolean;
  canToggleEditMode: boolean;
  quickPaths: SidebarQuickPath[];
  selectedPathId?: string | null;
  activeRoute?: string;
  isSettingsActive?: boolean;
  userAvatarUrl?: string;
  userAvatarAlt?: string;
  userEmail?: string;
  haStatus: HaConnectionStatus;
  onPathClick: (entry: SidebarQuickPath) => void;
  onToggleEditMode: () => void;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  onDisconnectHomeAssistant: () => void | Promise<void>;
  onClose: () => void;
  onPrefetchRoute?: (path: string) => void;
  onPrefetchEditMode?: () => void;
};

export function MobileSidebarDrawer({
  isOpen,
  isEditMode,
  isEditTourActive = false,
  canToggleEditMode,
  quickPaths,
  selectedPathId = null,
  activeRoute,
  isSettingsActive = false,
  userAvatarUrl,
  userAvatarAlt,
  userEmail,
  haStatus,
  onPathClick,
  onToggleEditMode,
  onOpenProfile,
  onOpenSettings,
  onDisconnectHomeAssistant,
  onClose,
  onPrefetchRoute,
  onPrefetchEditMode,
}: MobileSidebarDrawerProps) {
  const { t } = useI18n();
  const drawerRef = React.useRef<HTMLElement | null>(null);
  const editButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);
  const [isAccountChipOpen, setIsAccountChipOpen] = React.useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = React.useState(false);
  const routeGroups = [
    { id: 'home', label: t('navigation.section.home'), entries: resolveDashboardNavigationEntries(quickPaths, PRIMARY_DASHBOARD_ROUTE_IDS, t) },
    { id: 'tools', label: t('navigation.section.tools'), entries: resolveDashboardNavigationEntries(quickPaths, TOOL_DASHBOARD_ROUTE_IDS, t) },
  ];
  const displayUserName = userAvatarAlt?.trim() || 'Utente';
  const displayUserEmail = userEmail?.trim() || 'Email non disponibile';
  const handlePathClick = (entry: SidebarQuickPath) => {
    onPathClick(entry);
    onClose();
  };

  const handleLogoutConfirm = () => {
    void onDisconnectHomeAssistant();
    setIsLogoutConfirmOpen(false);
    onClose();
  };

  const handleOpenSettings = () => {
    onOpenSettings();
    onClose();
  };

  const handleOpenProfile = () => {
    onOpenProfile();
    onClose();
  };

  const handleToggleEditMode = () => {
    if (!canToggleEditMode) {
      return;
    }
    onToggleEditMode();
    onClose();
  };

  React.useEffect(() => {
    if (!isOpen) {
      setIsAccountChipOpen(false);
      setIsLogoutConfirmOpen(false);
    }
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen || !isEditTourActive) return undefined;
    const timer = window.setTimeout(() => {
      editButtonRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [isEditTourActive, isOpen]);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => {
      drawerRef.current?.querySelector<HTMLElement>('button:not([disabled]), a[href]')?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }
      const drawer = drawerRef.current;
      if (!drawer) {
        return;
      }
      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        drawer.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [isOpen, onClose]);

  return (
    <>
      <button
        type="button"
        onClick={onClose}
        tabIndex={isOpen ? 0 : -1}
        aria-hidden={!isOpen}
        aria-label={t('navigation.menu.close')}
        className={`fixed inset-0 z-[176] bg-[color:var(--ui-scrim)] backdrop-blur-md transition-opacity duration-200 md:hidden ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('navigation.menu.main')}
        tabIndex={-1}
        inert={!isOpen}
        className={`liquid-glass-panel fixed left-0 top-0 z-[181] flex h-[100dvh] w-[min(84vw,21rem)] max-w-[21rem] flex-col overflow-hidden rounded-none border-y-0 border-l-0 px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-[calc(env(safe-area-inset-top)+1rem)] text-[color:var(--ui-text-primary)] shadow-[24px_0_70px_var(--ui-glass-shadow)] transition-transform duration-250 ease-out md:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-[105%]'
        }`}
        aria-hidden={!isOpen}
      >
        <div className="rounded-[1.35rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] p-1.5 shadow-[0_14px_34px_var(--ui-shadow-soft)]">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onPointerEnter={() => onPrefetchRoute?.('/profile')}
              onPointerDown={() => onPrefetchRoute?.('/profile')}
              onFocus={() => onPrefetchRoute?.('/profile')}
              onClick={handleOpenProfile}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-[1.05rem] p-1 text-left transition-colors hover:bg-[color:var(--ui-surface-glass-strong)]"
              aria-label={t('navigation.profile.open')}
            >
              <span className="relative flex h-10 w-10 shrink-0">
                <DashboardProfileAvatar
                  userAvatarUrl={userAvatarUrl}
                  userName={displayUserName}
                  haStatus={haStatus}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold leading-tight text-[color:var(--ui-text-primary)]">
                  {displayUserName}
                </span>
                <span className="mt-0.5 block truncate text-[10.5px] font-medium leading-tight text-[color:var(--ui-text-secondary)]">{displayUserEmail}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setIsAccountChipOpen((current) => !current)}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass-strong)] text-[color:var(--ui-text-primary)] transition-colors hover:bg-[color:var(--ui-surface-glass-soft)]"
              aria-label={isAccountChipOpen ? t('navigation.account.closeMenu') : t('navigation.account.openMenu')}
              aria-expanded={isAccountChipOpen}
            >
              <ChevronDown
                size={17}
                className={`transition-transform duration-200 ${isAccountChipOpen ? 'rotate-180' : ''}`}
              />
            </button>
          </div>

          <div
            className={`grid transition-all duration-200 ${
              isAccountChipOpen ? 'mt-2 grid-rows-[1fr] opacity-100' : 'mt-0 grid-rows-[0fr] opacity-0'
            }`}
          >
            <div className="min-h-0 overflow-hidden">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm font-semibold text-[color:var(--ui-text-primary)] transition-colors hover:bg-[color:var(--ui-surface-glass-strong)]"
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[color:rgb(var(--ui-accent-rgb)/0.14)] text-[color:rgb(var(--ui-accent-rgb)/0.98)]">
                  <Plus size={16} />
                </span>
                {t('navigation.account.add')}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5 h-px bg-[color:var(--ui-border)]" />

        <div className="mt-5 flex min-h-0 flex-1 flex-col">
          <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 glass-scrollbar">
            {routeGroups.map((group, groupIndex) => (
              <section key={group.id} className={groupIndex === 0 ? '' : 'mt-6'}>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--ui-text-secondary)]">
                  {group.label}
                </p>
                <div className="space-y-1">
                  {group.entries.map((entry) => {
                    const Icon = getDashboardNavigationIcon(entry.icon);
                    const active = isDashboardNavigationEntryActive({
                      entry,
                      isEditMode,
                      selectedPathId,
                      activeRoute,
                    });
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onPointerEnter={() => onPrefetchRoute?.(entry.path)}
                        onPointerDown={() => onPrefetchRoute?.(entry.path)}
                        onFocus={() => onPrefetchRoute?.(entry.path)}
                        onClick={() => handlePathClick(entry)}
                        className={`group relative flex w-full min-w-0 items-center gap-3 rounded-xl px-0 py-3 text-left transition-colors ${
                          active
                            ? 'text-[color:var(--ui-text-primary)]'
                            : 'text-[color:var(--ui-text-secondary)] hover:text-[color:var(--ui-text-primary)]'
                        }`}
                        aria-current={active ? 'page' : undefined}
                      >
                        <span
                          className={`absolute -left-5 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full transition-opacity ${
                            active ? 'bg-[color:rgb(var(--ui-accent-rgb)/0.9)] opacity-100' : 'opacity-0'
                          }`}
                          aria-hidden
                        />
                        <span
                          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
                            active
                              ? 'text-[color:rgb(var(--ui-accent-rgb)/0.98)]'
                              : 'text-[color:var(--ui-text-secondary)] group-hover:text-[color:var(--ui-text-primary)]'
                          }`}
                        >
                          <Icon size={19} strokeWidth={active ? 1.85 : 2} />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[0.95rem] font-semibold">{entry.label}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </nav>

          <div className="mt-5 border-t border-[color:var(--ui-border)] pt-4">
            {isLogoutConfirmOpen ? (
              <div className="mb-3 rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass)] p-3 shadow-[0_14px_36px_var(--ui-shadow-soft)]">
                <p className="text-sm font-semibold text-[color:var(--ui-text-primary)]">{t('navigation.logout.title')}</p>
                <p className="mt-1 text-xs font-medium text-[color:var(--ui-text-secondary)]">
                  {t('navigation.logout.description')}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIsLogoutConfirmOpen(false)}
                    className="rounded-xl border border-[color:var(--ui-border)] px-3 py-2 text-xs font-bold text-[color:var(--ui-text-primary)] transition-colors hover:bg-[color:var(--ui-surface-glass-strong)]"
                  >
                    {t('navigation.logout.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={handleLogoutConfirm}
                    className="rounded-xl bg-[color:var(--ui-danger)] px-3 py-2 text-xs font-bold text-[color:var(--ui-danger-contrast)] shadow-[0_10px_22px_color-mix(in_srgb,var(--ui-danger)_28%,transparent)] transition-colors hover:brightness-110"
                  >
                    {t('navigation.logout.confirm')}
                  </button>
                </div>
              </div>
            ) : null}
            <button
              ref={editButtonRef}
              type="button"
              data-tour-target="edit-mode"
              onPointerEnter={onPrefetchEditMode}
              onPointerDown={onPrefetchEditMode}
              onFocus={onPrefetchEditMode}
              onClick={handleToggleEditMode}
              disabled={!canToggleEditMode}
              className={`mb-2 flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                isEditMode
                  ? 'border-[color:rgb(var(--ui-accent-rgb)/0.42)] bg-[color:rgb(var(--ui-accent-rgb)/0.18)] text-[color:var(--ui-text-primary)]'
                  : 'border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass)] text-[color:var(--ui-text-primary)] hover:bg-[color:var(--ui-surface-glass-strong)]'
              }`}
            >
              <PencilLine size={17} />
              {isEditMode ? t('navigation.edit.exit') : t('navigation.edit.enter')}
            </button>
            <button
              type="button"
              onPointerEnter={() => onPrefetchRoute?.('/settings')}
              onPointerDown={() => onPrefetchRoute?.('/settings')}
              onFocus={() => onPrefetchRoute?.('/settings')}
              onClick={handleOpenSettings}
              className={`mb-2 flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold transition-colors ${
                isSettingsActive
                  ? 'border-[color:rgb(var(--ui-accent-rgb)/0.42)] bg-[color:rgb(var(--ui-accent-rgb)/0.18)] text-[color:var(--ui-text-primary)]'
                  : 'border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass)] text-[color:var(--ui-text-primary)] hover:bg-[color:var(--ui-surface-glass-strong)]'
              }`}
              aria-current={isSettingsActive ? 'page' : undefined}
            >
              <Settings size={17} />
              {t('navigation.settings')}
            </button>
            <button
              type="button"
              onClick={() => setIsLogoutConfirmOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/28 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-500 transition-colors hover:bg-red-500/16"
            >
              <LogOut size={17} />
              Log out
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
