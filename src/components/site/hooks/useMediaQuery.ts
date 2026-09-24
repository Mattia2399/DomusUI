import { useSyncExternalStore } from 'react';

/** Subscribes to a CSS media query. Falls back to `serverValue` without matchMedia. */
export function useMediaQuery(query: string, serverValue = false) {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined;
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () =>
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia(query).matches
        : serverValue,
    () => serverValue,
  );
}

/** Desktop-class layout: wide enough for pinned multi-column scenes. */
export const useIsWide = () => useMediaQuery('(min-width: 1024px)', true);

/** Fine pointer that can hover (mouse / trackpad): enables pointer parallax. */
export const useFinePointer = () => useMediaQuery('(hover: hover) and (pointer: fine)', true);
