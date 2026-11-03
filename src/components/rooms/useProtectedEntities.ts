import React from 'react';
import type { DashboardRuntimeMode } from '../../security/dashboardAccess';
import { getRoomsRuntimeStorageKey } from './roomsRuntimeKey';

export const PROTECTED_ENTITIES_STORAGE_KEY = 'ha.dashboard.rooms.protectedEntities.v1';

function readStoredProtectedEntities(runtimeMode: DashboardRuntimeMode): string[] | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(getRoomsRuntimeStorageKey(PROTECTED_ENTITIES_STORAGE_KEY, runtimeMode));
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? Array.from(new Set(parsed.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean)))
      : [];
  } catch {
    return [];
  }
}

const PROTECTED_CHANGED_EVENT = 'domus:protected-entities';

/** Plugs that ask before turning off; written by whoever can manage rooms. Until something is saved, the given ones. */
export function useProtectedEntities(runtimeMode: DashboardRuntimeMode, canManageRooms: boolean, initial: string[] = []) {
  const [protectedIds, setProtectedIds] = React.useState<string[]>(() => readStoredProtectedEntities(runtimeMode) ?? initial);
  const [protectedRuntime, setProtectedRuntime] = React.useState<DashboardRuntimeMode>(runtimeMode);

  React.useEffect(() => {
    if (protectedRuntime === runtimeMode) return;
    setProtectedIds(readStoredProtectedEntities(runtimeMode) ?? initial);
    setProtectedRuntime(runtimeMode);
  }, [initial, protectedRuntime, runtimeMode]);

  React.useEffect(() => {
    if (!canManageRooms || protectedRuntime !== runtimeMode || typeof window === 'undefined') {
      return;
    }
    const key = getRoomsRuntimeStorageKey(PROTECTED_ENTITIES_STORAGE_KEY, runtimeMode);
    const next = JSON.stringify(protectedIds);
    const stored = window.localStorage.getItem(key);
    // An empty list with nothing saved says nothing: it must not hide the defaults of another page.
    if (stored === next || (stored === null && protectedIds.length === 0)) return;
    window.localStorage.setItem(key, next);
    window.dispatchEvent(new CustomEvent(PROTECTED_CHANGED_EVENT, { detail: { key, value: next } }));
  }, [canManageRooms, protectedIds, protectedRuntime, runtimeMode]);

  // The Home and the Rooms page keep this list each: a change in one reaches the other.
  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const key = getRoomsRuntimeStorageKey(PROTECTED_ENTITIES_STORAGE_KEY, runtimeMode);
    const follow = (event: Event) => {
      const { detail } = event as CustomEvent<{ key: string; value: string }>;
      if (detail.key !== key) return;
      setProtectedIds((current) => (JSON.stringify(current) === detail.value ? current : (JSON.parse(detail.value) as string[])));
    };
    window.addEventListener(PROTECTED_CHANGED_EVENT, follow);
    return () => window.removeEventListener(PROTECTED_CHANGED_EVENT, follow);
  }, [runtimeMode]);

  return { protectedIds, setProtectedIds };
}
