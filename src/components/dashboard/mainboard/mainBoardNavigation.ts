export function createOAuthNonce() {
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');
  }
  return `${Date.now()}-${Math.round(Math.random() * 1_000_000_000)}`;
}

function isEmbeddedDashboardRuntime() {
  if (typeof window === 'undefined') return false;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  const url = new URL(window.location.href);
  const mode = (
    url.searchParams.get('dashboard_mode') ??
    url.searchParams.get('navigation_mode') ??
    ''
  ).toLowerCase();
  return mode === 'embedded' || mode === 'iframe' || url.searchParams.get('embedded') === '1';
}

export function shouldUseBrowserRouteNavigation() {
  if (typeof window === 'undefined' || isEmbeddedDashboardRuntime()) return false;
  const pathname = window.location.pathname.toLowerCase();
  const lastSegment = pathname.split('/').filter(Boolean).at(-1) ?? '';
  if (/\.[a-z0-9]+$/i.test(lastSegment)) return false;
  return !(
    pathname.startsWith('/local/') ||
    pathname.startsWith('/hacsfiles/') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/panel_iframe/')
  );
}

export function isExternalNavigationTarget(path: string) {
  const target = path.trim().toLowerCase();
  return target.startsWith('http://') || target.startsWith('https://');
}

export function normalizeNavigationPathname(path: string) {
  const target = path.trim();
  if (!target) return '';
  try {
    const parsed = new URL(target, 'http://dashboard.local');
    const pathname = parsed.pathname.trim().toLowerCase();
    if (!pathname) return '/';
    const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
    return normalized === '/' ? normalized : normalized.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export function isNavigationPathnameAllowed(pathname: string, allowedPathnames: Set<string>) {
  if (!pathname) return false;
  if (allowedPathnames.size === 0) return true;
  for (const allowedPathname of allowedPathnames) {
    if (!allowedPathname) continue;
    if (allowedPathname === '/') return true;
    if (pathname === allowedPathname || pathname.startsWith(`${allowedPathname}/`)) return true;
  }
  return false;
}

type ParsedNavigationTarget = {
  pathname: string;
  hash: string;
  view: string;
  pathSegments: string[];
  hashNormalized: string;
  hashSegments: string[];
};

function parseNavigationTarget(path: string): ParsedNavigationTarget | null {
  const target = path.trim();
  if (!target) return null;
  try {
    const parsed = new URL(target, 'http://dashboard.local');
    const pathname = parsed.pathname.toLowerCase();
    const hash = parsed.hash.toLowerCase();
    const view = (parsed.searchParams.get('view') ?? '').trim().toLowerCase();
    const pathSegments = pathname.split('/').filter(Boolean);
    const hashNormalized = hash.replace(/^#/, '').replace(/^\//, '');
    return {
      pathname,
      hash,
      view,
      pathSegments,
      hashNormalized,
      hashSegments: hashNormalized.split('/').filter(Boolean),
    };
  } catch {
    return null;
  }
}

const DASHBOARD_NAVIGATION_ROOTS = new Set([
  'appgallery',
  'appgalley',
  'automations',
  'automation',
  'consumi',
  'home',
  'impostazioni',
  'profile',
  'profilo',
  'rooms',
  'security',
  'settings',
  'support',
]);

function hasSimpleRoute(
  target: ParsedNavigationTarget,
  pathNames: readonly string[],
  hashNames: readonly string[] = pathNames,
  viewNames: readonly string[] = pathNames,
) {
  const pathRoot = target.pathSegments.find((segment) => DASHBOARD_NAVIGATION_ROOTS.has(segment));
  const hashRoot = target.hashSegments.find((segment) => DASHBOARD_NAVIGATION_ROOTS.has(segment));
  return (
    (pathRoot !== undefined && pathNames.includes(pathRoot)) ||
    (hashRoot !== undefined && hashNames.includes(hashRoot)) ||
    viewNames.includes(target.view)
  );
}

function hasNestedDashboardRoute(segments: readonly string[]) {
  const rootIndex = segments.findIndex((segment) => DASHBOARD_NAVIGATION_ROOTS.has(segment));
  return rootIndex >= 0 && Boolean(segments[rootIndex + 1]);
}

/**
 * Identifies detail pages opened below a main dashboard destination.
 * It supports both browser routes and hash-based routes used by embedded installs.
 */
export function isNestedDashboardNavigationTarget(path: string) {
  const target = parseNavigationTarget(path);
  if (!target) return false;

  if (hasSimpleRoute(target, ['support'])) {
    return true;
  }

  if (
    hasNestedDashboardRoute(target.pathSegments) ||
    hasNestedDashboardRoute(target.hashSegments)
  ) {
    return true;
  }

  return Array.from(DASHBOARD_NAVIGATION_ROOTS).some(
    (root) => target.view.startsWith(`${root}-`) || target.view.startsWith(`${root}/`),
  );
}

export function isConsumptionNavigationTarget(path: string) {
  const target = parseNavigationTarget(path);
  return target ? hasSimpleRoute(target, ['consumi']) : false;
}

export function isConsumptionDetailNavigationTarget(path: string) {
  const target = parseNavigationTarget(path);
  if (!target) return false;
  const detailSegments = new Set([
    'energia',
    'elettricita',
    'electricity',
    'acqua',
    'water',
    'gas',
    'metano',
    'report',
    'trend',
  ]);
  const pathIndex = target.pathSegments.indexOf('consumi');
  const hashIndex = target.hashSegments.indexOf('consumi');
  return (
    (pathIndex >= 0 && detailSegments.has(target.pathSegments[pathIndex + 1] ?? '')) ||
    (hashIndex >= 0 && detailSegments.has(target.hashSegments[hashIndex + 1] ?? '')) ||
    target.view.startsWith('consumi-') ||
    target.view.startsWith('consumption-')
  );
}

function resolveFromLocation(resolver: (path: string) => boolean) {
  return typeof window !== 'undefined' && resolver(window.location.href);
}

export function resolveConsumptionFromLocation() {
  return resolveFromLocation(isConsumptionNavigationTarget);
}

export function resolveConsumptionDetailFromLocation() {
  return resolveFromLocation(isConsumptionDetailNavigationTarget);
}

export function isHomeNavigationTarget(path: string) {
  const target = parseNavigationTarget(path);
  return target ? hasSimpleRoute(target, ['home']) : false;
}

export function isAutomationNavigationTarget(path: string) {
  const target = parseNavigationTarget(path);
  return target
    ? hasSimpleRoute(target, ['automations', 'automation'])
    : false;
}

export function resolveAutomationFromLocation() {
  return resolveFromLocation(isAutomationNavigationTarget);
}

export function isAppGalleryNavigationTarget(path: string) {
  const target = parseNavigationTarget(path);
  return target
    ? hasSimpleRoute(target, ['appgallery', 'appgalley'])
    : false;
}

export function resolveAppGalleryFromLocation() {
  return resolveFromLocation(isAppGalleryNavigationTarget);
}

export function isRoomsNavigationTarget(path: string) {
  const target = parseNavigationTarget(path);
  return target ? hasSimpleRoute(target, ['rooms']) : false;
}

export function resolveRoomsFromLocation() {
  return resolveFromLocation(isRoomsNavigationTarget);
}

export function isSecurityNavigationTarget(path: string) {
  const target = parseNavigationTarget(path);
  return target ? hasSimpleRoute(target, ['security']) : false;
}

export function resolveSecurityFromLocation() {
  return resolveFromLocation(isSecurityNavigationTarget);
}

export function isSecurityCamerasNavigationTarget(path: string) {
  const target = parseNavigationTarget(path);
  if (!target) return false;
  const pathHasSecurity = target.pathSegments.includes('security');
  const pathHasCameras =
    target.pathSegments.includes('cameras') || target.pathSegments.includes('telecamere');
  const hashHasSecurity = target.hashSegments.includes('security');
  const hashHasCameras =
    target.hashSegments.includes('cameras') || target.hashSegments.includes('telecamere');
  return (
    (pathHasSecurity && pathHasCameras) ||
    target.hash === '#security/cameras' ||
    target.hash === '#security/telecamere' ||
    (hashHasSecurity && hashHasCameras) ||
    target.view === 'security-cameras' ||
    target.view === 'security-telecamere'
  );
}

export function resolveSecurityCamerasFromLocation() {
  return resolveFromLocation(isSecurityCamerasNavigationTarget);
}

export function isProfileNavigationTarget(path: string) {
  const target = parseNavigationTarget(path);
  return target
    ? hasSimpleRoute(target, ['profile', 'profilo'])
    : false;
}

export function resolveProfileFromLocation() {
  return resolveFromLocation(isProfileNavigationTarget);
}

export function isSettingsNavigationTarget(path: string) {
  const target = parseNavigationTarget(path);
  return target
    ? hasSimpleRoute(target, ['settings', 'impostazioni', 'support'])
    : false;
}

export function resolveSettingsFromLocation() {
  return resolveFromLocation(isSettingsNavigationTarget);
}

export function resolveEditAvailabilityFromLocation() {
  if (typeof window === 'undefined') return false;
  const current = window.location.href;
  return (
    isHomeNavigationTarget(current) ||
    isAppGalleryNavigationTarget(current) ||
    isSecurityNavigationTarget(current)
  );
}
