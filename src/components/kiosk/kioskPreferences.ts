import { APPLICATION_ROUTE_REGISTRY, type ApplicationRouteId } from '../../navigation/applicationRoutes';
import { createDevicePreferenceStore } from '../../services/devicePreferenceStore';

/**
 * Kiosk preferences of this browser (Settings › This device › Kiosk mode).
 * They never leave it. Kiosk only changes what Domus shows: it is not a
 * lock and never a permission (docs/device-kiosk.md).
 */
export const KIOSK_STORAGE_KEY = 'domusui.kiosk.v1';
const KIOSK_STORAGE_VERSION = 1;

/** The pages a wall panel can open on: the main pages, never Settings, Profile or ones not ready yet. */
const KIOSK_START_ROUTE_IDS: readonly ApplicationRouteId[] = ['home', 'rooms', 'security', 'consumi', 'appgallery'];
export const KIOSK_START_ROUTES: readonly string[] = APPLICATION_ROUTE_REGISTRY.filter((route) =>
  KIOSK_START_ROUTE_IDS.includes(route.id),
).map((route) => route.path);
export const DEFAULT_KIOSK_START_ROUTE = '/home';

export type KioskPreferences = Readonly<{
  enabled: boolean;
  hideNavigation: boolean;
  startRoute: string;
  preferFullscreen: boolean;
  keepScreenAwake: boolean;
}>;

/** Off until someone turns it on on this device. */
export const DEFAULT_KIOSK_PREFERENCES: KioskPreferences = Object.freeze({
  enabled: false,
  hideNavigation: true,
  startRoute: DEFAULT_KIOSK_START_ROUTE,
  preferFullscreen: true,
  keepScreenAwake: true,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Anything unreadable, of another version or not an object gives the
 * defaults, so Kiosk stays off; `enabled` is on only when it says `true`.
 * A single invalid field falls back to its own default; unknown fields are ignored.
 */
export function parseKioskPreferences(value: unknown): KioskPreferences {
  if (!isRecord(value) || value.version !== KIOSK_STORAGE_VERSION) return DEFAULT_KIOSK_PREFERENCES;
  const defaults = DEFAULT_KIOSK_PREFERENCES;
  const flag = (field: keyof KioskPreferences, fallback: boolean) =>
    typeof value[field] === 'boolean' ? (value[field] as boolean) : fallback;
  return {
    enabled: value.enabled === true,
    hideNavigation: flag('hideNavigation', defaults.hideNavigation),
    startRoute:
      typeof value.startRoute === 'string' && KIOSK_START_ROUTES.includes(value.startRoute)
        ? value.startRoute
        : defaults.startRoute,
    preferFullscreen: flag('preferFullscreen', defaults.preferFullscreen),
    keepScreenAwake: flag('keepScreenAwake', defaults.keepScreenAwake),
  };
}

export function serializeKioskPreferences(preferences: KioskPreferences): string {
  const valid = parseKioskPreferences({ ...preferences, version: KIOSK_STORAGE_VERSION });
  return JSON.stringify({ version: KIOSK_STORAGE_VERSION, ...valid });
}

const store = createDevicePreferenceStore<KioskPreferences>({
  key: KIOSK_STORAGE_KEY,
  defaults: DEFAULT_KIOSK_PREFERENCES,
  parse: parseKioskPreferences,
  serialize: serializeKioskPreferences,
});

export const readKioskPreferences = store.read;
export const saveKioskPreferences = store.save;
export const useKioskPreferences = store.use;
export const getKioskPreferences = store.get;
export const subscribeKioskPreferences = store.subscribe;
/** Forget the shared copy (tests). */
export const resetKioskPreferencesCache = store.reset;

/** The start page to open: the saved one while the person can still see it, Home otherwise. */
export function resolveKioskStartRoute(startRoute: string, availableRoutes: readonly string[]): string {
  return availableRoutes.includes(startRoute) ? startRoute : DEFAULT_KIOSK_START_ROUTE;
}
