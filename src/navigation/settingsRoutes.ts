/**
 * Settings routes that the dashboard shell needs before the Settings page is
 * loaded. Kept apart from the scope registry so Home only carries these few
 * strings.
 */
/** The Settings page scrolled to its This device group. */
export const DEVICE_SETTINGS_ROUTE = '/settings/device';
export const DEVICE_APPEARANCE_ROUTE = '/settings/device/appearance';
export const DEVICE_LANGUAGE_ROUTE = '/settings/device/language';

/**
 * Appearance and language were Profile pages; they are saved in this browser,
 * so they now live in Settings › This device. Old links keep working.
 */
const LEGACY_SETTINGS_ROUTE_REDIRECTS: Readonly<Record<string, string>> = {
  '/profile/themes': DEVICE_APPEARANCE_ROUTE,
  '/profile/language': DEVICE_LANGUAGE_ROUTE,
};

/** Where an old address now lives, or null when the address is current. */
export function resolveLegacySettingsRoute(route: string): string | null {
  const path = route.split(/[?#]/, 1)[0].trim().toLowerCase().replace(/\/+$/, '');
  return LEGACY_SETTINGS_ROUTE_REDIRECTS[path] ?? null;
}
