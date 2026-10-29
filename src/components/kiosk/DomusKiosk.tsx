import React, { useCallback, useEffect, useRef } from 'react';
import { LazyLoadErrorBoundary } from '../common/LazyLoadBoundary';
import { resolveKioskStartRoute, useKioskPreferences } from './kioskPreferences';
import { getKioskSession, onKioskLaunchRequest, updateKioskSession, useKioskSession } from './kioskSession';

/*
 * Kiosk mode of this device, as the dashboard sees it: mounted once, and
 * deliberately small. It knows whether the panel is on, opens the start
 * page, and loads the running panel (KioskRuntime: full screen, wake lock,
 * the way out) only on a device where Kiosk is turned on. The navigation is
 * hidden by the dashboard itself (useKioskChrome).
 */
const loadRuntime = () => import('./KioskRuntime');
const KioskRuntime = React.lazy(loadRuntime);

type KioskNavigate = (path: string, options?: { replace?: boolean }) => void;

type DomusKioskProps = {
  /** The current address. */
  route: string;
  navigate: KioskNavigate;
  /** The start pages the person can open now. */
  availableStartRoutes: readonly string[];
  /** False while the account's access profile is still unknown: the start page waits for it. */
  startRoutesKnown?: boolean;
};

/** Whether the dashboard hides its navigation now. */
export function useKioskChrome(): boolean {
  const preferences = useKioskPreferences();
  const session = useKioskSession();
  return session.active && preferences.enabled && preferences.hideNavigation;
}

function routePath(route: string) {
  try {
    return new URL(route, 'http://domus.local').pathname.replace(/\/+$/, '') || '/';
  } catch {
    return route;
  }
}

/** An address Domus needs while starting (sign-in return): never replaced by the start page. */
function isTechnicalLocation() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.has('ha_oauth_callback') || params.has('auth_callback') || (params.has('code') && params.has('state'));
}

export function DomusKiosk({ route, navigate, availableStartRoutes, startRoutesKnown = true }: DomusKioskProps) {
  const preferences = useKioskPreferences();
  const session = useKioskSession();
  const latest = useRef({ preferences, route, navigate, availableStartRoutes });
  latest.current = { preferences, route, navigate, availableStartRoutes };
  const { enabled } = preferences;
  const active = session.active && enabled;

  const openStartPage = useCallback((replace: boolean) => {
    const { preferences: current, route: currentRoute, navigate: go, availableStartRoutes: routes } = latest.current;
    const startRoute = resolveKioskStartRoute(current.startRoute, routes);
    if (routePath(currentRoute) !== startRoute) go(startRoute, { replace });
  }, []);

  // Turned off here, in Settings or in another tab: the panel ends at once.
  // Ready ahead of "Start panel mode" as soon as Kiosk is on.
  useEffect(() => {
    if (enabled) void loadRuntime();
    else if (getKioskSession().active) updateKioskSession({ active: false });
  }, [enabled]);

  // Opening Domus on a Kiosk device starts on its start page, once, as soon as
  // the pages this account may open are known.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current || !startRoutesKnown) return;
    startedRef.current = true;
    if (getKioskSession().active && !isTechnicalLocation()) openStartPage(true);
  }, [openStartPage, startRoutesKnown]);

  useEffect(
    () =>
      onKioskLaunchRequest(() => {
        updateKioskSession({ active: true });
        openStartPage(false);
      }),
    [openStartPage],
  );

  // If the running panel cannot load, the navigation stays hidden and the dashboard works on.
  return active ? (
    <LazyLoadErrorBoundary failure={null}>
      <React.Suspense fallback={null}>
        <KioskRuntime />
      </React.Suspense>
    </LazyLoadErrorBoundary>
  ) : null;
}

export default DomusKiosk;
