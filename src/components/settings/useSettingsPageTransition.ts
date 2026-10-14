import { useLayoutEffect, useRef } from 'react';

/*
 * The push between Settings pages, as on iPhone: a deeper page slides in from
 * the right, going back slides in from the left. The page is animated in
 * place (Web Animations), never remounted, so nothing loaded or typed is lost.
 */

export const SETTINGS_PAGE_ATTRIBUTE = 'data-settings-page';

const PUSH_DISTANCE_PX = 44;
const PUSH_DURATION_MS = 460;
const PUSH_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';

/** How deep a Settings path is: the hub is 1, its pages 2, their details 3. */
export function settingsPathDepth(path: string) {
  if (path === '/settings/home') return 1;
  return path.split('/').filter(Boolean).length;
}

/** Forward to a deeper or sibling page, back to a shallower one. */
export function settingsTransitionDirection(previous: string, next: string): 'forward' | 'back' {
  return settingsPathDepth(next) < settingsPathDepth(previous) ? 'back' : 'forward';
}

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function useSettingsPageTransition(path: string) {
  const previousPathRef = useRef(path);

  useLayoutEffect(() => {
    const previous = previousPathRef.current;
    previousPathRef.current = path;
    if (previous === path || typeof document === 'undefined') return;
    const page = document.querySelector<HTMLElement>(`[${SETTINGS_PAGE_ATTRIBUTE}]`);
    if (!page || typeof page.animate !== 'function') return;
    if (prefersReducedMotion()) {
      page.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
      return;
    }
    const offset = settingsTransitionDirection(previous, path) === 'forward' ? PUSH_DISTANCE_PX : -PUSH_DISTANCE_PX;
    page.animate(
      [
        { transform: `translate3d(${offset}px, 0, 0)`, opacity: 0 },
        { transform: 'translate3d(0, 0, 0)', opacity: 1 },
      ],
      { duration: PUSH_DURATION_MS, easing: PUSH_EASING },
    );
  }, [path]);
}
