import React from 'react';
import { getRoomsRuntimeStorageKey, ROOM_LAYOUT_STORAGE_KEY } from '../../components/rooms/roomsStorage';
import type { DashboardRuntimeMode } from '../../security/dashboardAccess';
import { parseRoomLayout, type RoomLayout } from './roomLayout';

/*
 * The layout of the Rooms page in this browser, per runtime (the demo keeps
 * its own); written by whoever can manage rooms, like the hidden devices.
 * Until something is saved, the given one.
 */

function readLayout(runtimeMode: DashboardRuntimeMode, initial: RoomLayout) {
  if (typeof window === 'undefined') return initial;
  try {
    return parseRoomLayout(window.localStorage.getItem(getRoomsRuntimeStorageKey(ROOM_LAYOUT_STORAGE_KEY, runtimeMode))) ?? initial;
  } catch {
    return initial;
  }
}

export function useRoomLayout(runtimeMode: DashboardRuntimeMode, canManageRooms: boolean, initial: RoomLayout) {
  const [layout, setLayout] = React.useState<RoomLayout>(() => readLayout(runtimeMode, initial));
  const [layoutRuntime, setLayoutRuntime] = React.useState<DashboardRuntimeMode>(runtimeMode);
  const changed = React.useRef(false);

  React.useEffect(() => {
    if (layoutRuntime === runtimeMode) return;
    changed.current = false;
    setLayout(readLayout(runtimeMode, initial));
    setLayoutRuntime(runtimeMode);
  }, [initial, layoutRuntime, runtimeMode]);

  React.useEffect(() => {
    // The given layout is not saved until something changes it.
    if (!changed.current || !canManageRooms || layoutRuntime !== runtimeMode || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(getRoomsRuntimeStorageKey(ROOM_LAYOUT_STORAGE_KEY, runtimeMode), JSON.stringify(layout));
    } catch {
      // Storage may be full or blocked; the layout still holds for this visit.
    }
  }, [canManageRooms, layout, layoutRuntime, runtimeMode]);

  const updateLayout = React.useCallback((change: (current: RoomLayout) => RoomLayout) => {
    changed.current = true;
    setLayout(change);
  }, []);

  return { layout, updateLayout };
}
