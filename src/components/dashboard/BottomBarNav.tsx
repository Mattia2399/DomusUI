import { Settings } from 'lucide-react';
import type { SidebarQuickPath } from '../../hooks/useProfileSettings';
import { useI18n } from '../../i18n/I18nProvider';
import {
  getDashboardNavigationIcon,
  isDashboardNavigationEntryActive,
  PRIMARY_DASHBOARD_ROUTE_IDS,
  resolveDashboardNavigationEntries,
} from './dashboardNavigation';

type BottomBarNavProps = {
  isEditMode: boolean;
  quickPaths: SidebarQuickPath[];
  selectedPathId?: string | null;
  activeRoute?: string;
  isSettingsActive?: boolean;
  onPathClick: (entry: SidebarQuickPath) => void;
  onOpenSettings: () => void;
  onPrefetchRoute?: (path: string) => void;
};

type BottomBarPrimaryAction = {
  entry: SidebarQuickPath;
};

export function BottomBarNav({
  isEditMode,
  quickPaths,
  selectedPathId = null,
  activeRoute,
  isSettingsActive = false,
  onPathClick,
  onOpenSettings,
  onPrefetchRoute,
}: BottomBarNavProps) {
  const { t } = useI18n();
  const primaryActions = resolveDashboardNavigationEntries(
    quickPaths,
    PRIMARY_DASHBOARD_ROUTE_IDS,
    t,
  ).map((entry) => ({ entry }) satisfies BottomBarPrimaryAction);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[170] px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
      <nav
        className="liquid-glass-navigation pointer-events-auto relative mx-auto max-w-xl"
        aria-label={t('navigation.main')}
      >
          <div className="relative grid grid-cols-5 gap-1 p-1.5">
            {primaryActions.map((action) => {
              const entry = action.entry;
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
                  onClick={() => {
                    onPathClick(entry);
                  }}
                  className={`group relative flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-[0.95rem] px-1 py-1.5 transition-[background-color,color,transform,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.96] ${
                    active
                      ? 'liquid-glass-selection text-[color:var(--ui-accent)]'
                      : 'text-[color:var(--ui-text-secondary)] hover:bg-[color:var(--ui-fill-tertiary)] hover:text-[color:var(--ui-text-primary)]'
                  }`}
                  aria-label={t('navigation.open', { label: entry.label })}
                  aria-current={active ? 'page' : undefined}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-lg transition-all ${
                      active ? 'bg-transparent' : 'bg-transparent group-hover:bg-[color:var(--ui-fill-tertiary)]'
                    }`}
                  >
                    <Icon
                      size={16}
                      strokeWidth={active ? 1.85 : 2}
                      fill={active ? 'currentColor' : 'none'}
                      className={active ? '' : 'group-hover:scale-105 transition-transform'}
                    />
                  </span>
                  <span className={`max-w-full truncate text-[9.5px] leading-none tracking-[0.01em] ${active ? 'font-semibold' : 'font-medium'}`}>
                    {entry.label}
                  </span>
                </button>
              );
            })}

            <button
              type="button"
              onPointerEnter={() => onPrefetchRoute?.('/settings')}
              onPointerDown={() => onPrefetchRoute?.('/settings')}
              onFocus={() => onPrefetchRoute?.('/settings')}
              onClick={onOpenSettings}
              className={`group relative flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-[0.95rem] px-1 py-1.5 transition-[background-color,color,transform,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.96] ${
                isSettingsActive
                  ? 'liquid-glass-selection text-[color:var(--ui-accent)]'
                  : 'text-[color:var(--ui-text-secondary)] hover:bg-[color:var(--ui-fill-tertiary)] hover:text-[color:var(--ui-text-primary)]'
              }`}
              aria-label={t('navigation.open', { label: t('navigation.settings') })}
              aria-current={isSettingsActive ? 'page' : undefined}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-transparent transition-all group-hover:bg-[color:var(--ui-fill-tertiary)]">
                <Settings size={16} strokeWidth={isSettingsActive ? 1.85 : 2} className="transition-transform group-hover:scale-105" />
              </span>
              <span className="max-w-full truncate text-[9.5px] font-medium leading-none tracking-[0.01em]">{t('navigation.settings')}</span>
            </button>
          </div>
      </nav>
    </div>
  );
}
