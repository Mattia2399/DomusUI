import { PUSH_PAGE_ATTRIBUTE, pushDirection, usePagePushTransition } from '../ui/usePagePushTransition';

/* The push between Settings pages: the hub, its pages and their details. */

/** Marks the element the push animates; spread it on each Settings page root. */
export const SETTINGS_PAGE_PROPS = { [PUSH_PAGE_ATTRIBUTE]: 'settings' } as const;

/** How deep a Settings path is: the hub is 1, its pages 2, their details 3. */
export function settingsPathDepth(path: string) {
  if (path === '/settings/home') return 1;
  return path.split('/').filter(Boolean).length;
}

/** Forward to a deeper or sibling page, back to a shallower one. */
export function settingsTransitionDirection(previous: string, next: string) {
  return pushDirection(settingsPathDepth(previous), settingsPathDepth(next));
}

export function useSettingsPageTransition(path: string) {
  usePagePushTransition('settings', path, settingsPathDepth);
}
