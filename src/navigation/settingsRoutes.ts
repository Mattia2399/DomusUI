/**
 * Settings routes that the dashboard shell needs before the Settings page is
 * loaded. Kept apart from the scope registry so Home only carries these few
 * strings.
 */
/** The Settings page scrolled to its This device group. */
export const DEVICE_SETTINGS_ROUTE = '/settings/device';
export const DEVICE_APPEARANCE_ROUTE = '/settings/device/appearance';
export const DEVICE_LANGUAGE_ROUTE = '/settings/device/language';
export const DEVICE_POWER_ROUTE = '/settings/device/power';

/** The Profile opens from the account card at the top of Settings. */
export const PROFILE_ROUTE = '/settings/profile';

/** Whether a route is the Profile or one of its pages. */
export function isProfileSettingsRoute(route: string): boolean {
  const path = route.split(/[?#]/, 1)[0].trim().toLowerCase().replace(/\/+$/, '');
  return path === PROFILE_ROUTE || path.startsWith(`${PROFILE_ROUTE}/`);
}

/**
 * Profile and Settings are one page: `/profile` opens Settings, whose top is
 * the person, and the Profile pages live below `/settings/profile`.
 * Appearance and language were Profile pages; they are saved in this
 * browser, so they live in Settings › This device. Old links keep working.
 */
const LEGACY_SETTINGS_ROUTE_REDIRECTS: Readonly<Record<string, string>> = {
  '/profile': '/settings',
  '/profilo': '/settings',
  '/profile/personal': `${PROFILE_ROUTE}/personal`,
  '/profile/activity': `${PROFILE_ROUTE}/activity`,
  '/profile/devices': `${PROFILE_ROUTE}/devices`,
  '/profile/security': `${PROFILE_ROUTE}/security`,
  '/profile/themes': DEVICE_APPEARANCE_ROUTE,
  '/profile/language': DEVICE_LANGUAGE_ROUTE,
};

/** Where an old address now lives, or null when the address is current. */
export function resolveLegacySettingsRoute(route: string): string | null {
  const path = route.split(/[?#]/, 1)[0].trim().toLowerCase().replace(/\/+$/, '');
  if (LEGACY_SETTINGS_ROUTE_REDIRECTS[path]) return LEGACY_SETTINGS_ROUTE_REDIRECTS[path];
  // Any other old Profile page opens the Profile rather than an empty page.
  return path.startsWith('/profile/') || path.startsWith('/profilo/') ? PROFILE_ROUTE : null;
}
