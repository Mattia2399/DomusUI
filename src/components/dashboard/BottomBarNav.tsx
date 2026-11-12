import type { SidebarQuickPath } from '../../hooks/useProfileSettings';
import { useAccessControl } from '../../security/AccessControlProvider';
import type { HaConnectionStatus } from '../../services/haConnectionState';
import { useI18n } from '../../i18n/I18nProvider';
import {
  getDashboardNavigationIcon,
  isDashboardNavigationEntryActive,
  NAVIGATION_BAR_ROUTE_IDS,
  resolveDashboardNavigationEntries,
} from './dashboardNavigation';
import { DashboardProfileAvatar } from './DashboardProfileAvatar';

type BottomBarNavProps = {
  /** Steps aside with the page while the mobile side menu is open. */
  isPushedByDrawer?: boolean;
  isEditMode: boolean;
  quickPaths: SidebarQuickPath[];
  activeRoute?: string;
  isSettingsActive?: boolean;
  onPathClick: (entry: SidebarQuickPath) => void;
  onOpenSettings: () => void;
  onPrefetchRoute?: (path: string) => void;
  /** Settings opens with the person at its top, so its tab shows their photo. */
  userAvatarUrl?: string;
  userName?: string;
  haStatus?: HaConnectionStatus;
};

type BottomBarPrimaryAction = {
  entry: SidebarQuickPath;
};

export function BottomBarNav({
  isPushedByDrawer = false,
  isEditMode,
  quickPaths,
  activeRoute,
  isSettingsActive = false,
  onPathClick,
  onOpenSettings,
  onPrefetchRoute,
  userAvatarUrl,
  userName,
  haStatus = 'disconnected',
}: BottomBarNavProps) {
  const { t } = useI18n();
  const { can } = useAccessControl();
  const primaryActions = resolveDashboardNavigationEntries(
    quickPaths,
    NAVIGATION_BAR_ROUTE_IDS,
    t,
    can,
  ).map((entry) => ({ entry }) satisfies BottomBarPrimaryAction);

  const activeStates = primaryActions.map(({ entry }) =>
    isDashboardNavigationEntryActive({ entry, activeRoute }),
  );
  // The drop sits under the active destination: one of the routes, or Settings last.
  const activeIndex = isSettingsActive ? primaryActions.length : activeStates.indexOf(true);
  const tabClassName = (active: boolean) =>
    `group relative z-10 flex h-12 min-w-0 items-center justify-center rounded-full transition-[color,transform] duration-[420ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-[0.94] ${
      active
        ? 'scale-110 text-[color:var(--ui-text-primary)]'
        : 'text-[color:var(--ui-text-secondary)] hover:text-[color:var(--ui-text-primary)]'
    }`;

  return (
    <div
      data-drawer-push="bottom"
      data-drawer-open={isPushedByDrawer}
      className="mobile-drawer-push pointer-events-none fixed inset-x-0 bottom-0 z-[170] px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]"
    >
      <nav
        className="liquid-glass-navigation liquid-glass-tabbar pointer-events-auto relative mx-auto max-w-[21rem]"
        aria-label={t('navigation.main')}
      >
          <div
            className="relative grid p-1.5"
            style={{ gridTemplateColumns: `repeat(${primaryActions.length + 1}, minmax(0, 1fr))` }}
          >
            {/* A drop of glass under the active tab; it slides to the next one. */}
            <span aria-hidden="true" className="pointer-events-none absolute inset-1.5">
              <span
                data-testid="bottom-bar-drop"
                data-index={activeIndex}
                className="liquid-glass-drop absolute inset-y-0 left-0"
                style={{
                  width: `${100 / (primaryActions.length + 1)}%`,
                  transform: `translateX(${Math.max(activeIndex, 0) * 100}%)`,
                  opacity: activeIndex < 0 ? 0 : 1,
                }}
              />
            </span>

            {primaryActions.map((action, index) => {
              const entry = action.entry;
              const Icon = getDashboardNavigationIcon(entry.icon);
              const active = activeStates[index];
              return (
                <button
                  key={entry.id}
                  type="button"
                  onPointerEnter={() => onPrefetchRoute?.(entry.path)}
                  onPointerDown={() => onPrefetchRoute?.(entry.path)}
                  onFocus={() => onPrefetchRoute?.(entry.path)}
                  onClick={() => {
                    onPathClick(entry);
                  }}
                  className={tabClassName(active)}
                  aria-label={t('navigation.open', { label: entry.label })}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon size={22} strokeWidth={active ? 2.1 : 1.85} aria-hidden="true" />
                </button>
              );
            })}

            <button
              type="button"
              onPointerEnter={() => onPrefetchRoute?.('/settings')}
              onPointerDown={() => onPrefetchRoute?.('/settings')}
              onFocus={() => onPrefetchRoute?.('/settings')}
              onClick={onOpenSettings}
              className={tabClassName(isSettingsActive)}
              aria-label={t('navigation.open', { label: t('navigation.settings') })}
              aria-current={isSettingsActive ? 'page' : undefined}
            >
              {/* The photo alone, as the account tab of an iOS app; the label stays for assistive technology. */}
              <span className="flex h-8 w-8 items-center justify-center rounded-full">
                <DashboardProfileAvatar userAvatarUrl={userAvatarUrl} userName={userName} haStatus={haStatus} size="sm" />
              </span>
            </button>
          </div>
      </nav>
    </div>
  );
}
