import { useLayoutEffect, useRef } from 'react';

/*
 * The push between a page and its subpages, as on iPhone: a deeper page slides
 * in from the right, going back slides the shallower one in from the left. The
 * page is animated in place (Web Animations), never remounted, so nothing
 * loaded or typed is lost. With reduced motion it only fades in.
 */

export const PUSH_PAGE_ATTRIBUTE = 'data-push-page';

const PUSH_DISTANCE_PX = 44;
const PUSH_DURATION_MS = 460;
const PUSH_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';

export type PushDirection = 'forward' | 'back';

/** Forward to a deeper or sibling view, back to a shallower one. */
export function pushDirection(previousDepth: number, nextDepth: number): PushDirection {
  return nextDepth < previousDepth ? 'back' : 'forward';
}

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Runs the push on the element marked `data-push-page="<page>"`. */
export function playPagePush(page: string, direction: PushDirection) {
  if (typeof document === 'undefined') return;
  const element = document.querySelector<HTMLElement>(`[${PUSH_PAGE_ATTRIBUTE}="${page}"]`);
  if (!element || typeof element.animate !== 'function') return;
  if (prefersReducedMotion()) {
    element.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
    return;
  }
  const offset = direction === 'forward' ? PUSH_DISTANCE_PX : -PUSH_DISTANCE_PX;
  element.animate(
    [
      { transform: `translate3d(${offset}px, 0, 0)`, opacity: 0 },
      { transform: 'translate3d(0, 0, 0)', opacity: 1 },
    ],
    { duration: PUSH_DURATION_MS, easing: PUSH_EASING },
  );
}

/**
 * Pushes the page when `view` changes. `depthOf` tells how deep a view is;
 * an empty view (the page is not shown) never animates.
 */
export function usePagePushTransition(page: string, view: string, depthOf: (view: string) => number) {
  const previousViewRef = useRef(view);
  const depthOfRef = useRef(depthOf);
  depthOfRef.current = depthOf;

  useLayoutEffect(() => {
    const previous = previousViewRef.current;
    previousViewRef.current = view;
    if (!previous || !view || previous === view) return;
    playPagePush(page, pushDirection(depthOfRef.current(previous), depthOfRef.current(view)));
  }, [page, view]);
}

/** Depth of a route: one per path segment. */
export function routeDepth(path: string) {
  return path.split(/[?#]/, 1)[0].split('/').filter(Boolean).length;
}
