import { useSyncExternalStore } from 'react';
import type { FullscreenStatus, WakeLockStatus } from './kioskDisplay';
import { getKioskPreferences } from './kioskPreferences';

/*
 * What Kiosk is doing in this tab now. Nothing here is stored or shared with
 * other tabs: only the preferences are.
 *
 * `active` is the panel experience. Turning Kiosk on in Settings only saves
 * it; the panel starts with "Start panel mode", or by itself when Domus
 * opens on a device where Kiosk is on.
 */
export type KioskSession = Readonly<{
  active: boolean;
  fullscreen: FullscreenStatus;
  wakeLock: WakeLockStatus;
}>;

let session: KioskSession | null = null;
const listeners = new Set<() => void>();

function current(): KioskSession {
  if (session === null) {
    session = { active: getKioskPreferences().enabled, fullscreen: 'inactive', wakeLock: 'inactive' };
  }
  return session;
}

export function updateKioskSession(change: Partial<KioskSession>) {
  const previous = current();
  const next = { ...previous, ...change };
  if (next.active === previous.active && next.fullscreen === previous.fullscreen && next.wakeLock === previous.wakeLock) {
    return;
  }
  session = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const SERVER_SESSION: KioskSession = { active: false, fullscreen: 'inactive', wakeLock: 'inactive' };

export function useKioskSession(): KioskSession {
  return useSyncExternalStore(subscribe, current, () => SERVER_SESSION);
}

export function getKioskSession(): KioskSession {
  return current();
}

/** Forget this tab's session (tests). */
export function resetKioskSession() {
  session = null;
}

// "Start panel mode" in Settings: handled by the runtime inside the same tap,
// so the browser still accepts the full-screen request.
type LaunchListener = () => void;
const launchListeners = new Set<LaunchListener>();

export function requestKioskLaunch() {
  launchListeners.forEach((listener) => listener());
}

export function onKioskLaunchRequest(listener: LaunchListener) {
  launchListeners.add(listener);
  return () => {
    launchListeners.delete(listener);
  };
}
