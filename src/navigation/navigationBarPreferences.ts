import { useSyncExternalStore } from 'react';
import type { ApplicationRouteId } from './applicationRoutes';

/*
 * The entries of the app bar on this device (Impostazioni › Questo dispositivo › Barra di navigazione).
 * Dashboard is always first and the photo (Profilo) always last: only the entries in between are kept,
 * in their order. The bottom bar of a phone shows the first 3, the side bar of a tablet or a desktop up
 * to 7. Saved in this browser only, out of sync and backups (configBackup.ts).
 * docs/design/app/REGOLE-app.md §3.
 */

export const NAVIGATION_BAR_STORAGE_KEY = 'ha.dashboard.navigationBar.v1';
const CHANGE_EVENT = 'domus:navigation-bar-change';

/** The entries that can stand between Dashboard and Profilo, in the order they are offered. */
export const NAVIGATION_BAR_CANDIDATES: readonly ApplicationRouteId[] = ['rooms', 'casa', 'security', 'consumi', 'automation', 'appgallery'];
/** The recommended bar: Dashboard · Stanze · Casa · Profilo. */
export const RECOMMENDED_NAVIGATION_BAR: readonly ApplicationRouteId[] = ['rooms', 'casa'];
export const PHONE_BAR_MAX = 3;
export const SIDE_BAR_MAX = 7;

/** A saved list, cleaned: known entries only, each once, at most 7; nothing usable gives the recommended one. */
export function sanitizeNavigationBar(value: unknown): ApplicationRouteId[] {
  const entries = value && typeof value === 'object' && !Array.isArray(value) ? (value as { entries?: unknown }).entries : undefined;
  if (!Array.isArray(entries)) return [...RECOMMENDED_NAVIGATION_BAR];
  const kept: ApplicationRouteId[] = [];
  for (const entry of entries) {
    if (typeof entry !== 'string') continue;
    const id = entry as ApplicationRouteId;
    if (NAVIGATION_BAR_CANDIDATES.includes(id) && !kept.includes(id)) kept.push(id);
    if (kept.length === SIDE_BAR_MAX) break;
  }
  return kept;
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

let cachedRaw: string | null | undefined;
let cachedEntries: readonly ApplicationRouteId[] = RECOMMENDED_NAVIGATION_BAR;

/** The entries between Dashboard and Profilo on this device. */
export function readNavigationBar(): readonly ApplicationRouteId[] {
  let raw: string | null = null;
  try {
    raw = storage()?.getItem(NAVIGATION_BAR_STORAGE_KEY) ?? null;
  } catch {
    raw = null;
  }
  if (raw === cachedRaw) return cachedEntries;
  cachedRaw = raw;
  if (raw === null) {
    cachedEntries = RECOMMENDED_NAVIGATION_BAR;
  } else {
    try {
      cachedEntries = sanitizeNavigationBar(JSON.parse(raw));
    } catch {
      cachedEntries = RECOMMENDED_NAVIGATION_BAR;
    }
  }
  return cachedEntries;
}

function announce() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function writeNavigationBar(entries: readonly ApplicationRouteId[]) {
  try {
    storage()?.setItem(NAVIGATION_BAR_STORAGE_KEY, JSON.stringify({ version: 1, entries: sanitizeNavigationBar({ entries }) }));
  } catch {
    // A browser that cannot save keeps the bar it shows.
  }
  announce();
}

/** Back to the recommended bar. */
export function resetNavigationBar() {
  try {
    storage()?.removeItem(NAVIGATION_BAR_STORAGE_KEY);
  } catch {
    // Nothing saved to forget.
  }
  announce();
}

function subscribe(onChange: () => void) {
  if (typeof window === 'undefined') return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === NAVIGATION_BAR_STORAGE_KEY) onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/** The entries between Dashboard and Profilo, kept in step with Settings and with the other tabs. */
export function useNavigationBar(): readonly ApplicationRouteId[] {
  return useSyncExternalStore(subscribe, readNavigationBar, () => RECOMMENDED_NAVIGATION_BAR);
}

/** The routes of a bar: Dashboard first, then the entries it has room for (3 on a phone, 7 at the side). */
export function navigationBarRoutes(entries: readonly ApplicationRouteId[], surface: 'phone' | 'side'): ApplicationRouteId[] {
  return ['home', ...entries.slice(0, surface === 'phone' ? PHONE_BAR_MAX : SIDE_BAR_MAX)];
}
