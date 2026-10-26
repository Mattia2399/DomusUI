import React from 'react';
import type { DashboardRuntimeMode } from '../../security/dashboardAccess';
import {
  ACTIVE_ROOM_STORAGE_KEY,
  CUSTOM_ROOMS_STORAGE_KEY,
  getRoomsRuntimeStorageKey,
  readStoredActiveRoomId,
  readStoredCustomRooms,
  readStoredHiddenRoomEntitiesByRoom,
  ROOM_ENTITY_VISIBILITY_STORAGE_KEY,
  type CustomRoomRecord,
  type HiddenRoomEntitiesByRoom,
} from './roomsStorage';

/*
 * The rooms of this browser, the room on screen and the devices hidden in
 * each room, kept in step with the runtime (the demo has its own copy).
 * Only someone who can manage rooms writes the rooms and the hidden devices;
 * the room on screen is remembered for everyone.
 */
export function useRoomsStoredState(runtimeMode: DashboardRuntimeMode, canManageRooms: boolean) {
  const [customRooms, setCustomRooms] = React.useState<CustomRoomRecord[]>(() => readStoredCustomRooms(runtimeMode));
  const [hiddenRoomEntitiesByRoom, setHiddenRoomEntitiesByRoom] =
    React.useState<HiddenRoomEntitiesByRoom>(() => readStoredHiddenRoomEntitiesByRoom(runtimeMode));
  const [roomsStateRuntime, setRoomsStateRuntime] = React.useState<DashboardRuntimeMode>(runtimeMode);
  const [activeRoomId, setActiveRoomId] = React.useState<string>(() => readStoredActiveRoomId(runtimeMode));

  React.useEffect(() => {
    if (roomsStateRuntime === runtimeMode) return;
    setCustomRooms(readStoredCustomRooms(runtimeMode));
    setHiddenRoomEntitiesByRoom(readStoredHiddenRoomEntitiesByRoom(runtimeMode));
    setActiveRoomId(readStoredActiveRoomId(runtimeMode));
    setRoomsStateRuntime(runtimeMode);
  }, [roomsStateRuntime, runtimeMode]);

  React.useEffect(() => {
    if (!canManageRooms || roomsStateRuntime !== runtimeMode || typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(
      getRoomsRuntimeStorageKey(CUSTOM_ROOMS_STORAGE_KEY, runtimeMode),
      JSON.stringify(customRooms),
    );
  }, [canManageRooms, customRooms, roomsStateRuntime, runtimeMode]);

  React.useEffect(() => {
    if (!canManageRooms || roomsStateRuntime !== runtimeMode || typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(
      getRoomsRuntimeStorageKey(ROOM_ENTITY_VISIBILITY_STORAGE_KEY, runtimeMode),
      JSON.stringify(hiddenRoomEntitiesByRoom),
    );
  }, [canManageRooms, hiddenRoomEntitiesByRoom, roomsStateRuntime, runtimeMode]);

  React.useEffect(() => {
    if (roomsStateRuntime !== runtimeMode || typeof window === 'undefined') {
      return;
    }
    if (!activeRoomId) {
      window.localStorage.removeItem(getRoomsRuntimeStorageKey(ACTIVE_ROOM_STORAGE_KEY, runtimeMode));
      return;
    }
    window.localStorage.setItem(getRoomsRuntimeStorageKey(ACTIVE_ROOM_STORAGE_KEY, runtimeMode), activeRoomId);
  }, [activeRoomId, roomsStateRuntime, runtimeMode]);

  return {
    customRooms,
    setCustomRooms,
    hiddenRoomEntitiesByRoom,
    setHiddenRoomEntitiesByRoom,
    roomsStateRuntime,
    activeRoomId,
    setActiveRoomId,
  };
}
