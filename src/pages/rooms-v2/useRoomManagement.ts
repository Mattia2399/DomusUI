import React from 'react';
import { ROOM_ID_CUSTOM_PREFIX, type RoomsApiCall, type RoomTab } from '../../components/rooms/roomsDirectory';
import type { CustomRoomRecord } from '../../components/rooms/roomsStorage';
import type { HaArea } from '../../hooks/useHaLiveConnection';
import { useRoomsTranslations } from '../../i18n/roomsTranslations';
import { areaMessage, cleanName, overlayAreas, parseHaArea, type RoomDraft } from './roomManagement';

/*
 * The rooms of the home, changed from the Rooms page: areas in Home
 * Assistant when it is connected and the person may manage them, local rooms
 * of this browser otherwise. What changed shows at once, until Home Assistant
 * sends the areas back. Floors are managed in Settings.
 */

const randomId = () => Math.random().toString(36).slice(2, 10);

export function useRoomManagement({
  demo,
  haConnected,
  canManageRooms,
  onCallApi,
  haAreas,
  setCustomRooms,
  onRoomCreated,
}: {
  demo: boolean;
  haConnected: boolean;
  canManageRooms: boolean;
  onCallApi?: RoomsApiCall;
  haAreas: HaArea[];
  setCustomRooms: React.Dispatch<React.SetStateAction<CustomRoomRecord[]>>;
  onRoomCreated: (roomId: string) => void;
}) {
  const rt = useRoomsTranslations();
  const [changedAreas, setChangedAreas] = React.useState<HaArea[]>([]);
  const [deletedAreaIds, setDeletedAreaIds] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // The demo keeps its own local rooms; Home Assistant only when connected and allowed.
  const canManage = canManageRooms || demo;
  const canManageHa = !demo && canManageRooms && haConnected && Boolean(onCallApi);
  const areas = React.useMemo(
    () => (haConnected ? overlayAreas(haAreas, changedAreas, deletedAreaIds) : []),
    [changedAreas, deletedAreaIds, haAreas, haConnected],
  );

  /** Runs one change; false, with the message shown, when it fails. */
  const run = async (failure: string, change: () => Promise<boolean>) => {
    setBusy(true);
    setError(null);
    try {
      const done = await change();
      if (!done) setError(failure);
      return done;
    } catch {
      setError(failure);
      return false;
    } finally {
      setBusy(false);
    }
  };

  /** A new room, or changes to one; local rooms take only a name. */
  const saveRoom = async (room: RoomTab | null, draft: RoomDraft) => {
    const name = cleanName(draft.name);
    if (!name) {
      setError(rt('roomNameRequired'));
      return false;
    }
    if (room?.source === 'custom') {
      setCustomRooms((current) => current.map((entry) => (entry.id === room.id ? { ...entry, name } : entry)));
      setError(null);
      return true;
    }
    if (!room && !canManageHa) {
      const id = `${ROOM_ID_CUSTOM_PREFIX}${randomId()}`;
      setCustomRooms((current) => [...current, { id, name, createdAt: Date.now() }]);
      setError(null);
      onRoomCreated(id);
      return true;
    }
    if (!canManageHa || !onCallApi) {
      setError(rt('haUnavailable'));
      return false;
    }
    return run(room ? rt('areaSaveFailed') : rt('areaCreateFailed'), async () => {
      const area = parseHaArea(await onCallApi(areaMessage(draft, room?.id)));
      if (!area) return false;
      setChangedAreas((current) => [...current.filter((entry) => entry.area_id !== area.area_id), area]);
      setDeletedAreaIds((current) => current.filter((id) => id !== area.area_id));
      if (!room) onRoomCreated(area.area_id);
      return true;
    });
  };

  const deleteRoom = async (room: RoomTab) => {
    if (room.source === 'custom') {
      setCustomRooms((current) => current.filter((entry) => entry.id !== room.id));
      return true;
    }
    if (!canManageHa || !onCallApi) {
      setError(rt('haUnavailable'));
      return false;
    }
    return run(rt('areaDeleteFailed'), async () => {
      const result = await onCallApi({ type: 'config/area_registry/delete', area_id: room.id });
      if (result === null) return false;
      setDeletedAreaIds((current) => Array.from(new Set([...current, room.id])));
      setChangedAreas((current) => current.filter((area) => area.area_id !== room.id));
      return true;
    });
  };

  return {
    areas,
    canManage,
    canManageHa,
    busy,
    error,
    clearError: () => setError(null),
    saveRoom,
    deleteRoom,
  };
}
