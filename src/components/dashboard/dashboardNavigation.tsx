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

export function resolveDashboardNavigationEntries(
  quickPaths: SidebarQuickPath[],
  routeIds: readonly ApplicationRouteId[],
  translate?: (key: TranslationKey) => string,
) {
  const configuredByPath = new Map(
    quickPaths.map((entry) => [normalizeDashboardNavigationPath(entry.path), entry] as const),
  );

  return routeIds.map((routeId) => {
    const fallback = getApplicationRoute(routeId);
    const configured = configuredByPath.get(normalizeDashboardNavigationPath(fallback.path));
    return {
      ...(configured ?? fallback),
      label: translate
        ? translate(DASHBOARD_NAVIGATION_TRANSLATION_KEYS[routeId])
        : configured?.label ?? DASHBOARD_NAVIGATION_LABELS[routeId] ?? fallback.label,
    };
  });
}

export function isPrimaryDashboardNavigationEntry(entry: SidebarQuickPath) {
  const primaryPaths = PRIMARY_DASHBOARD_ROUTE_IDS.map((routeId) =>
    normalizeDashboardNavigationPath(getApplicationRoute(routeId).path),
  );
  return primaryPaths.includes(normalizeDashboardNavigationPath(entry.path));
}

export function isDashboardNavigationEntryActive({
  entry,
  isEditMode,
  selectedPathId,
  activeRoute,
}: {
  entry: SidebarQuickPath;
  isEditMode: boolean;
  selectedPathId?: string | null;
  activeRoute?: string;
}) {
  if (isEditMode) return selectedPathId === entry.id;
  return activeRoute
    ? isPathActiveForLocation(entry.path, activeRoute)
    : isPathActiveForCurrentLocation(entry.path);
}

export function getDashboardNavigationIcon(icon: SidebarQuickPathIconKey) {
  return DASHBOARD_NAVIGATION_ICONS[icon] ?? LayoutGrid;
}
