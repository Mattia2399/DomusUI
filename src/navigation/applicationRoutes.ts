export const SIDEBAR_PATH_ICON_KEYS = [
  'dashboard',
  'devices',
  'settings',
  'automation',
  'security',
  'help',
  'home',
  'rooms',
  'chart',
  'light',
  'climate',
  'media',
] as const;

export type SidebarQuickPathIconKey = (typeof SIDEBAR_PATH_ICON_KEYS)[number];

export const APPLICATION_ROUTE_IDS = [
  'appgallery',
  'home',
  'rooms',
  'automation',
  'security',
  'consumi',
] as const;

export type ApplicationRouteId = (typeof APPLICATION_ROUTE_IDS)[number];

export type SidebarQuickPath = {
  id: string;
  label: string;
  readonly path: string;
  icon: SidebarQuickPathIconKey;
};

type ApplicationRouteDefinition = Readonly<{
  id: ApplicationRouteId;
  label: string;
  path: string;
  icon: SidebarQuickPathIconKey;
}>;

export const APPLICATION_ROUTE_REGISTRY: readonly ApplicationRouteDefinition[] = [
  { id: 'appgallery', label: 'App Gallery', path: '/appgallery', icon: 'dashboard' },
  { id: 'home', label: 'Home', path: '/home', icon: 'home' },
  { id: 'rooms', label: 'Stanze', path: '/rooms', icon: 'rooms' },
  { id: 'automation', label: 'Automazioni', path: '/automations', icon: 'automation' },
  { id: 'security', label: 'Sicurezza', path: '/security', icon: 'security' },
  { id: 'consumi', label: 'Consumi', path: '/consumi', icon: 'chart' },
] as const;

const ROUTE_BY_ID = new Map(APPLICATION_ROUTE_REGISTRY.map((route) => [route.id, route] as const));
const ROUTE_BY_PATH = new Map(APPLICATION_ROUTE_REGISTRY.map((route) => [route.path, route] as const));

const LEGACY_ID_ALIASES: Readonly<Record<string, ApplicationRouteId>> = {
  dashboard: 'home',
  devices: 'appgallery',
};

const LEGACY_PATH_ALIASES: Readonly<Record<string, string>> = {
  '/example': '/home',
  '/automation': '/automations',
  '/appgalley': '/appgallery',
  '/devices': '/appgallery',
};

function normalizeRoutePath(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return '';
  }
  const withoutTrailingSlash =
    normalized.length > 1 && normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
  return LEGACY_PATH_ALIASES[withoutTrailingSlash] ?? withoutTrailingSlash;
}

function resolveRouteDefinition(idValue: unknown, pathValue: unknown) {
  const normalizedId = typeof idValue === 'string' ? idValue.trim().toLowerCase() : '';
  const aliasedId = LEGACY_ID_ALIASES[normalizedId] ?? normalizedId;
  if (APPLICATION_ROUTE_IDS.includes(aliasedId as ApplicationRouteId)) {
    return ROUTE_BY_ID.get(aliasedId as ApplicationRouteId) ?? null;
  }

  if (typeof pathValue !== 'string') {
    return null;
  }
  return ROUTE_BY_PATH.get(normalizeRoutePath(pathValue)) ?? null;
}

export function createDefaultSidebarPaths(): SidebarQuickPath[] {
  return APPLICATION_ROUTE_REGISTRY.map((route) => ({ ...route }));
}

export function resolveApplicationRoutePath(id: unknown, path?: unknown): string | null {
  if (typeof path === 'string') {
    const routeFromPath = ROUTE_BY_PATH.get(normalizeRoutePath(path));
    if (routeFromPath) {
      return routeFromPath.path;
    }
  }
  return resolveRouteDefinition(id, undefined)?.path ?? null;
}

export function getApplicationRoute(id: ApplicationRouteId): SidebarQuickPath {
  const route = ROUTE_BY_ID.get(id);
  if (!route) {
    throw new Error(`Unknown application route: ${id}`);
  }
  return { ...route };
}
