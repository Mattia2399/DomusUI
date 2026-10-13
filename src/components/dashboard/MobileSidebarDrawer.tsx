import React from 'react';
import {
  ChevronRight,
  ExternalLink,
  PencilLine,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import type { SidebarQuickPath } from '../../hooks/useProfileSettings';
import type { HaConnectionStatus } from '../../hooks/useHaLiveConnection';
import { useI18n } from '../../i18n/I18nProvider';
import { haStatusLabel } from '../settings/haStatusLabel';
import GlassModal from '../ui/GlassModal';
import {
  getDashboardNavigationIcon,
  isDashboardNavigationEntryActive,
  PRIMARY_DASHBOARD_ROUTE_IDS,
  resolveDashboardNavigationEntries,
  TOOL_DASHBOARD_ROUTE_IDS,
} from './dashboardNavigation';
import { DashboardProfileAvatar } from './DashboardProfileAvatar';

export type MobileSidebarUserRole = 'creator' | 'admin' | 'member';

const ROLE_LABEL_KEYS = {
  creator: 'settings.access.role.creator',
  admin: 'settings.access.role.admin',
  member: 'settings.access.role.member',
} as const;

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
  userRole?: MobileSidebarUserRole;
  haStatus: HaConnectionStatus;
  onPathClick: (entry: SidebarQuickPath) => void;
  onToggleEditMode: () => void;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  showHomeAssistantReturn?: boolean;
  canReturnToHomeAssistant?: boolean;
  onReturnToHomeAssistant?: () => void;
  onDisconnectHomeAssistant: () => void | Promise<void>;
  onClose: () => void;
  onPrefetchRoute?: (path: string) => void;
  onPrefetchEditMode?: () => void;
};

/** A section of the sidebar, as on iPad: a plain title and its rows, no frame. */
function DrawerGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  const titleId = React.useId();
  return (
    <section aria-labelledby={title ? titleId : undefined}>
      {title ? (
        <h2 id={titleId} className="mb-1 px-3 text-[13px] font-semibold text-[color:var(--ui-text-secondary)]">
          {title}
        </h2>
      ) : null}
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

/** A sidebar row: a thin accent icon and its name; the current page is a filled pill. */
const DrawerRow = React.forwardRef<
  HTMLButtonElement,
  {
    icon: LucideIcon;
    label: string;
    active?: boolean;
    disabled?: boolean;
    title?: string;
    onClick: () => void;
    onPrefetch?: () => void;
    tourTarget?: string;
  }
>(function DrawerRow({ icon: Icon, label, active = false, disabled = false, title, onClick, onPrefetch, tourTarget }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      data-tour-target={tourTarget}
      onPointerEnter={onPrefetch}
      onPointerDown={onPrefetch}
      onFocus={onPrefetch}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-11 w-full min-w-0 items-center gap-3 rounded-[0.8rem] px-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
        active
          ? 'bg-[color:var(--ui-accent)] text-[color:var(--ui-accent-contrast)]'
          : 'text-[color:var(--ui-text-primary)] hover:bg-[color:var(--ui-fill-tertiary)] active:bg-[color:var(--ui-fill-secondary)]'
      }`}
    >
      <Icon
        size={20}
        strokeWidth={1.8}
        className={`shrink-0 ${active ? 'text-[color:var(--ui-accent-contrast)]' : 'text-[color:var(--ui-accent)]'}`}
        aria-hidden="true"
      />
      <span className={`min-w-0 flex-1 truncate text-[0.95rem] ${active ? 'font-semibold' : 'font-medium'}`}>{label}</span>
    </button>
  );
});

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
  userRole,
  haStatus,
  onPathClick,
  onToggleEditMode,
  onOpenProfile,
  onOpenSettings,
  showHomeAssistantReturn = false,
  canReturnToHomeAssistant = true,
  onReturnToHomeAssistant,
  onDisconnectHomeAssistant,
  onClose,
  onPrefetchRoute,
  onPrefetchEditMode,
}: MobileSidebarDrawerProps) {
  const { t } = useI18n();
  const drawerRef = React.useRef<HTMLElement | null>(null);
  const editButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = React.useState(false);
  const routeGroups = [
    { id: 'home', label: t('navigation.section.home'), entries: resolveDashboardNavigationEntries(quickPaths, PRIMARY_DASHBOARD_ROUTE_IDS, t) },
    { id: 'tools', label: t('navigation.section.tools'), entries: resolveDashboardNavigationEntries(quickPaths, TOOL_DASHBOARD_ROUTE_IDS, t) },
  ];
  const displayUserName = userAvatarAlt?.trim() || t('profile.fallback.name');
  const accountLine = [
    userRole ? t(ROLE_LABEL_KEYS[userRole]) : userEmail?.trim(),
    `Home Assistant ${haStatusLabel(haStatus, t).toLocaleLowerCase()}`,
  ]
    .filter(Boolean)
    .join(' · ');
  // Edit mode only where a page can be edited (or while it is on, or the tour shows it).
  const showEditMode = canToggleEditMode || isEditMode || isEditTourActive;

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
  const handleReturnToHomeAssistant = () => {
    if (!canReturnToHomeAssistant) return;
    onReturnToHomeAssistant?.();
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
      // The sign-out dialog handles its own keys.
      if (isLogoutConfirmOpen) return;
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
  }, [isLogoutConfirmOpen, isOpen, onClose]);

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
        className={`liquid-glass-panel fixed left-0 top-0 z-[181] flex h-[100dvh] w-[min(86vw,22rem)] max-w-[22rem] flex-col overflow-hidden rounded-none border-y-0 border-l-0 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-[calc(env(safe-area-inset-top)+1rem)] text-[color:var(--ui-text-primary)] shadow-[24px_0_70px_var(--ui-glass-shadow)] transition-transform duration-250 ease-out motion-reduce:transition-none md:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-[105%]'
        }`}
        aria-hidden={!isOpen}
      >
        <button
          type="button"
          onPointerEnter={() => onPrefetchRoute?.('/profile')}
          onPointerDown={() => onPrefetchRoute?.('/profile')}
          onFocus={() => onPrefetchRoute?.('/profile')}
          onClick={handleOpenProfile}
          aria-label={t('navigation.profile.open')}
          className="flex min-w-0 items-center gap-3 rounded-[1rem] px-2 py-2 text-left transition-colors hover:bg-[color:var(--ui-fill-tertiary)]"
        >
          <span className="relative flex h-12 w-12 shrink-0">
            <DashboardProfileAvatar userAvatarUrl={userAvatarUrl} userName={displayUserName} haStatus={haStatus} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-semibold tracking-[-0.01em] text-[color:var(--ui-text-primary)]">
              {displayUserName}
            </span>
            <span className="mt-0.5 block truncate text-xs text-[color:var(--ui-text-secondary)]">{accountLine}</span>
          </span>
          <ChevronRight size={17} className="shrink-0 text-[color:var(--ui-text-tertiary)]" aria-hidden="true" />
        </button>

        <nav
          aria-label={t('navigation.menu.main')}
          className="mt-4 min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain border-t border-[color:var(--ui-separator)] pb-2 pt-4 glass-scrollbar"
        >
          {routeGroups.map((group) => (
            <DrawerGroup key={group.id} title={group.label}>
              {group.entries.map((entry) => (
                <DrawerRow
                  key={entry.id}
                  icon={getDashboardNavigationIcon(entry.icon)}
                  label={entry.label}
                  active={isDashboardNavigationEntryActive({ entry, isEditMode, selectedPathId, activeRoute })}
                  onPrefetch={() => onPrefetchRoute?.(entry.path)}
                  onClick={() => handlePathClick(entry)}
                />
              ))}
            </DrawerGroup>
          ))}

          <DrawerGroup>
            <DrawerRow
              icon={Settings}
              label={t('navigation.settings')}
              active={isSettingsActive}
              onPrefetch={() => onPrefetchRoute?.('/settings')}
              onClick={handleOpenSettings}
            />
            {showEditMode ? (
              <DrawerRow
                ref={editButtonRef}
                tourTarget="edit-mode"
                icon={PencilLine}
                label={isEditMode ? t('navigation.edit.exit') : t('navigation.edit.enter')}
                active={isEditMode}
                disabled={!canToggleEditMode}
                onPrefetch={onPrefetchEditMode}
                onClick={handleToggleEditMode}
              />
            ) : null}
            {showHomeAssistantReturn ? (
              <DrawerRow
                icon={ExternalLink}
                label={t('navigation.homeAssistant.return')}
                disabled={!canReturnToHomeAssistant}
                title={canReturnToHomeAssistant ? t('navigation.homeAssistant.return') : t('navigation.homeAssistant.finishEditing')}
                onClick={handleReturnToHomeAssistant}
              />
            ) : null}
          </DrawerGroup>
        </nav>

        <button
          type="button"
          onClick={() => setIsLogoutConfirmOpen(true)}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-full text-sm font-semibold text-[color:var(--ui-danger)] transition-colors hover:bg-[color:var(--ui-fill-tertiary)]"
        >
          {t('navigation.logout.confirm')}
        </button>
      </aside>

      <GlassModal
        isOpen={isOpen && isLogoutConfirmOpen}
        onClose={() => setIsLogoutConfirmOpen(false)}
        title={t('navigation.logout.title')}
        description={t('navigation.logout.description')}
        variant="dialog"
        size="sm"
        zIndex={320}
        footer={(
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="liquid-glass-control inline-flex min-h-10 items-center justify-center rounded-full px-4 text-sm font-semibold"
              onClick={() => setIsLogoutConfirmOpen(false)}
            >
              {t('navigation.logout.cancel')}
            </button>
            <button
              type="button"
              className="inline-flex min-h-10 items-center justify-center rounded-full bg-[color:var(--ui-danger)] px-4 text-sm font-semibold text-[color:var(--ui-danger-contrast)]"
              onClick={handleLogoutConfirm}
            >
              {t('navigation.logout.confirm')}
            </button>
          </div>
        )}
      />
    </>
  );
}
