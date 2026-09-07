import React from 'react';
import {
  Bell,
  PencilLine,
  Settings,
} from 'lucide-react';
import type { SidebarQuickPath } from '../../hooks/useProfileSettings';
import type { HaConnectionStatus } from '../../hooks/useHaLiveConnection';
import { useNotifications } from '../../context/NotificationProvider';
import { useI18n } from '../../i18n/I18nProvider';
import { DashboardProfileAvatar } from './DashboardProfileAvatar';
import { DashboardNotificationsPanel } from './DashboardNotificationsPanel';
import {
  getDashboardNavigationIcon,
  isDashboardNavigationEntryActive,
  PRIMARY_DASHBOARD_ROUTE_IDS,
  resolveDashboardNavigationEntries,
  TOOL_DASHBOARD_ROUTE_IDS,
} from './dashboardNavigation';

type LeftSidebarProps = {
  isEditMode: boolean;
  userAvatarUrl?: string;
  userAvatarAlt?: string;
  haStatus: HaConnectionStatus;
  quickPaths: SidebarQuickPath[];
  selectedPathId?: string | null;
  activeRoute?: string;
  isSettingsActive?: boolean;
  isEditTourActive?: boolean;
  canToggleEditMode: boolean;
  onPathClick: (entry: SidebarQuickPath) => void;
  onToggleEditMode: () => void;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  onPrefetchRoute?: (path: string) => void;
  onPrefetchEditMode?: () => void;
};

const COMPACT_SIDEBAR_MAX_WIDTH_PX = 1535;
const COMPACT_SIDEBAR_MAX_HEIGHT_PX = 760;
const SIDEBAR_ROUTE_IDS = [...PRIMARY_DASHBOARD_ROUTE_IDS, ...TOOL_DASHBOARD_ROUTE_IDS] as const;

export function LeftSidebar({
  isEditMode,
  userAvatarUrl,
  userAvatarAlt,
  haStatus,
  quickPaths,
  selectedPathId = null,
  activeRoute,
  isSettingsActive = false,
  canToggleEditMode,
  onPathClick,
  onToggleEditMode,
  onOpenProfile,
  onOpenSettings,
  onPrefetchRoute,
  onPrefetchEditMode,
}: LeftSidebarProps) {
  const { t } = useI18n();
  const [isNotificationsOpen, setIsNotificationsOpen] = React.useState(false);
  const [isCompactSidebar, setIsCompactSidebar] = React.useState(false);
  const { unreadCount } = useNotifications();

  React.useEffect(() => {
    const updateSidebarDensity = () => {
      setIsCompactSidebar(
        window.innerWidth <= COMPACT_SIDEBAR_MAX_WIDTH_PX ||
          window.innerHeight <= COMPACT_SIDEBAR_MAX_HEIGHT_PX,
      );
    };

    updateSidebarDensity();
    window.addEventListener('resize', updateSidebarDensity);
    return () => window.removeEventListener('resize', updateSidebarDensity);
  }, []);

  const badgeValue = unreadCount > 99 ? '99+' : `${unreadCount}`;
  const navigationQuickPaths = resolveDashboardNavigationEntries(quickPaths, SIDEBAR_ROUTE_IDS, t);
  const isPathEntryActive = (entry: SidebarQuickPath) =>
    isDashboardNavigationEntryActive({ entry, isEditMode, selectedPathId, activeRoute });
  const sidebarWidthClass = isCompactSidebar ? 'w-14 sm:w-[3.75rem] lg:w-[4.25rem]' : 'w-14 sm:w-16 lg:w-20';
  const sidebarPaddingClass = isCompactSidebar ? 'py-4 sm:py-5' : 'py-5 sm:py-7';
  const profileMarginClass = isCompactSidebar ? 'mb-5 sm:mb-6' : 'mb-8 sm:mb-10';
  const navGapClass = isCompactSidebar ? 'gap-2 sm:gap-3' : 'gap-4 sm:gap-6';
  const navButtonSizeClass = isCompactSidebar
    ? 'w-10 h-10 sm:w-11 sm:h-11 rounded-xl'
    : 'w-11 h-11 sm:w-12 sm:h-12 rounded-2xl';
  const iconSize = isCompactSidebar ? 19 : 21;
  const utilityIconSize = isCompactSidebar ? 18 : 20;

  return (
    <>
      <DashboardNotificationsPanel
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
      />

      <aside className={`liquid-glass-panel relative z-50 ${sidebarWidthClass} h-full min-h-0`}>
      <div className={`relative z-10 h-full min-h-0 flex flex-col items-center ${sidebarPaddingClass}`}>
        <button
          type="button"
          onPointerEnter={() => onPrefetchRoute?.('/profile')}
          onPointerDown={() => onPrefetchRoute?.('/profile')}
          onFocus={() => onPrefetchRoute?.('/profile')}
          onClick={onOpenProfile}
          className={`relative h-9 w-9 overflow-visible rounded-full sm:h-10 sm:w-10 ${profileMarginClass} focus:outline-none focus:ring-2 focus:ring-[color:var(--ui-focus-ring)]`}
          aria-label={t('navigation.profile.open')}
          title={`Home Assistant: ${haStatus}`}
        >
          <DashboardProfileAvatar
            userAvatarUrl={userAvatarUrl}
            userName={userAvatarAlt}
            haStatus={haStatus}
          />
        </button>

        <nav className={`flex min-h-0 flex-1 flex-col ${navGapClass} overflow-y-auto overscroll-contain hide-scrollbar`}>
          {navigationQuickPaths.map((entry) => {
            const Icon = getDashboardNavigationIcon(entry.icon);
            const active = isPathEntryActive(entry);
            return (
              <button
                key={entry.id}
                type="button"
                onPointerEnter={() => onPrefetchRoute?.(entry.path)}
                onPointerDown={() => onPrefetchRoute?.(entry.path)}
                onFocus={() => onPrefetchRoute?.(entry.path)}
                onClick={() => onPathClick(entry)}
                title={`${entry.label} (${entry.path})`}
                aria-current={active ? 'page' : undefined}
                className={`group ${navButtonSizeClass} flex items-center justify-center transition-colors ${
                  active
                    ? 'liquid-glass-selection text-[color:var(--ui-accent)]'
                    : 'text-[color:var(--ui-text-secondary)] hover:text-[color:var(--ui-text-primary)] hover:bg-[color:var(--ui-fill-tertiary)]'
                }`}
                aria-label={t('navigation.open', { label: entry.label })}
              >
                <Icon
                  size={iconSize}
                  strokeWidth={active ? 1.85 : 2}
                  fill={active ? 'currentColor' : 'none'}
                  className={active ? '' : 'group-hover:scale-105 transition-transform'}
                />
              </button>
            );
          })}
        </nav>

        <div className={`relative ${isCompactSidebar ? 'mb-2' : 'mb-3'}`}>
          <button
            type="button"
            data-tour-target="edit-mode"
            onPointerEnter={onPrefetchEditMode}
            onPointerDown={onPrefetchEditMode}
            onFocus={onPrefetchEditMode}
            onClick={onToggleEditMode}
            disabled={!canToggleEditMode}
            aria-label={t('navigation.edit.toggle')}
            aria-pressed={isEditMode}
            title={
              canToggleEditMode
                ? isEditMode
                  ? t('navigation.edit.exit')
                  : t('navigation.edit.enter')
                : t('navigation.edit.unavailable')
            }
            className={`${navButtonSizeClass} flex items-center justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
              isEditMode
                ? 'liquid-glass-selection text-[color:var(--ui-accent)]'
                : 'text-[color:var(--ui-text-secondary)] hover:text-[color:var(--ui-text-primary)] hover:bg-[color:var(--ui-fill-tertiary)]'
            }`}
          >
            <PencilLine size={utilityIconSize} />
          </button>
        </div>

        <div className={`relative ${isCompactSidebar ? 'mb-2' : 'mb-4'}`}>
          <button
            type="button"
            onClick={() => {
              setIsNotificationsOpen((prev) => !prev);
            }}
            className={`relative ${navButtonSizeClass} flex items-center justify-center transition-colors ${
              isNotificationsOpen
                ? 'liquid-glass-selection text-[color:var(--ui-accent)]'
                : 'text-[color:var(--ui-text-secondary)] hover:text-[color:var(--ui-text-primary)] hover:bg-[color:var(--ui-fill-tertiary)]'
            }`}
            aria-label={t('navigation.notifications.open')}
          >
            <Bell size={utilityIconSize} />
            {unreadCount > 0 ? (
              <span className="absolute -right-1 -top-1 min-w-[1.15rem] h-[1.15rem] px-1 rounded-full bg-[color:var(--ui-danger)] text-[10px] font-semibold leading-[1.15rem] text-[color:var(--ui-danger-contrast)] text-center shadow-[0_0_0_2px_var(--ui-bg-elevated)]">
                {badgeValue}
              </span>
            ) : null}
          </button>
        </div>

        <button
          type="button"
          onPointerEnter={() => onPrefetchRoute?.('/settings')}
          onPointerDown={() => onPrefetchRoute?.('/settings')}
          onFocus={() => onPrefetchRoute?.('/settings')}
          onClick={onOpenSettings}
          className={`${navButtonSizeClass} flex items-center justify-center transition-colors ${
            isSettingsActive
              ? 'liquid-glass-selection text-[color:var(--ui-accent)]'
              : 'text-[color:var(--ui-text-secondary)] hover:text-[color:var(--ui-text-primary)] hover:bg-[color:var(--ui-fill-tertiary)]'
          }`}
          aria-label={t('navigation.settings.open')}
          aria-current={isSettingsActive ? 'page' : undefined}
          title={t('navigation.settings')}
        >
          <Settings size={utilityIconSize} />
        </button>

      </div>
      </aside>
    </>
  );
}
