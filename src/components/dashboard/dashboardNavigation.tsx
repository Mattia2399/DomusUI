import type { AccessCapability } from '../../security/accessControl';
import { canOpenRoute } from '../../navigation/routeAccess';
import {
  BarChart3,
  DoorOpen,
  HelpCircle,
  Home,
  LayoutGrid,
  Lightbulb,
  MonitorSmartphone,
  Music2,
  Rocket,
  Settings,
  ShieldCheck,
  Thermometer,
  type LucideIcon,
} from 'lucide-react';
import {
  getApplicationRoute,
  type ApplicationRouteId,
  type SidebarQuickPath,
  type SidebarQuickPathIconKey,
} from '../../navigation/applicationRoutes';
import {
  isPathActiveForCurrentLocation,
  isPathActiveForLocation,
} from '../../utils/navigationPathMatch';
import type { TranslationKey } from '../../i18n/translations';

export const PRIMARY_DASHBOARD_ROUTE_IDS = ['home', 'rooms', 'security', 'consumi'] as const;
export const TOOL_DASHBOARD_ROUTE_IDS = ['automation', 'appgallery'] as const;

const DASHBOARD_NAVIGATION_LABELS: Partial<Record<ApplicationRouteId, string>> = {
  home: 'Dashboard',
};

const DASHBOARD_NAVIGATION_TRANSLATION_KEYS: Record<ApplicationRouteId, TranslationKey> = {
  appgallery: 'navigation.appGallery',
  home: 'navigation.dashboard',
  rooms: 'navigation.rooms',
  automation: 'navigation.automations',
  security: 'navigation.security',
  consumi: 'navigation.consumption',
};

const DASHBOARD_NAVIGATION_ICONS: Record<SidebarQuickPathIconKey, LucideIcon> = {
  dashboard: LayoutGrid,
  devices: MonitorSmartphone,
  settings: Settings,
  automation: Rocket,
  security: ShieldCheck,
  help: HelpCircle,
  home: Home,
  rooms: DoorOpen,
  chart: BarChart3,
  light: Lightbulb,
  climate: Thermometer,
  media: Music2,
};

export function normalizeDashboardNavigationPath(path: string) {
  const normalized = path.trim().toLowerCase();
  if (!normalized) return '/';
  return normalized.length > 1 && normalized.endsWith('/')
    ? normalized.slice(0, -1)
    : normalized;
}

/**
 * The entries of a navigation, in the order of `routeIds`, with the name and the icon of their route
 * (they are no longer customized). `_quickPaths` is the list the callers already hold; it is not read.
 */
export function resolveDashboardNavigationEntries(
  _quickPaths: SidebarQuickPath[],
  routeIds: readonly ApplicationRouteId[],
  translate?: (key: TranslationKey) => string,
  /** Access Control: only the pages the account may open (navigation/routeAccess.ts). */
  can?: (capability: AccessCapability) => boolean,
) {
  const allowedRouteIds = can
    ? routeIds.filter((routeId) => canOpenRoute(getApplicationRoute(routeId).path, can))
    : routeIds;

  return allowedRouteIds.map((routeId) => {
    const route = getApplicationRoute(routeId);
    return {
      ...route,
      label: translate
        ? translate(DASHBOARD_NAVIGATION_TRANSLATION_KEYS[routeId])
        : DASHBOARD_NAVIGATION_LABELS[routeId] ?? route.label,
    };
  });
}

export function isPrimaryDashboardNavigationEntry(entry: SidebarQuickPath) {
  const primaryPaths = PRIMARY_DASHBOARD_ROUTE_IDS.map((routeId) =>
    normalizeDashboardNavigationPath(getApplicationRoute(routeId).path),
  );
  return primaryPaths.includes(normalizeDashboardNavigationPath(entry.path));
}

/** The entry of the page in view: by its route only (the entries are no longer selected to be edited). */
export function isDashboardNavigationEntryActive({
  entry,
  activeRoute,
}: {
  entry: SidebarQuickPath;
  activeRoute?: string;
}) {
  return activeRoute
    ? isPathActiveForLocation(entry.path, activeRoute)
    : isPathActiveForCurrentLocation(entry.path);
}

export function getDashboardNavigationIcon(icon: SidebarQuickPathIconKey) {
  return DASHBOARD_NAVIGATION_ICONS[icon] ?? LayoutGrid;
}
