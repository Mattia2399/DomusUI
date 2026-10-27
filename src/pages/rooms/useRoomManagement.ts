import React from 'react';
import {
  parseHaFloorList,
  ROOM_ID_CUSTOM_PREFIX,
  type HaFloorEntry,
  type RoomsApiCall,
  type RoomTab,
} from '../../components/rooms/roomsDirectory';
import type { CustomRoomRecord } from '../../components/rooms/roomsStorage';
import type { HaArea } from '../../hooks/useHaLiveConnection';
import { useRoomsTranslations } from '../../i18n/roomsTranslations';
import { areaMessage, cleanName, overlayAreas, parseHaArea, type RoomDraft } from './roomManagement';
import type { LocalFloor } from './roomLayout';

/*
 * The rooms and floors of the home, changed from the Rooms page: areas and
 * floors in Home Assistant when it is connected and the person may manage
 * them, local rooms and floors of this browser otherwise. What changed shows
 * at once, until Home Assistant sends the areas back.
 */

const randomId = () => Math.random().toString(36).slice(2, 10);

export function useRoomManagement({
  demo,
  haConnected,
  canManageRooms,
  onCallApi,
  haAreas,
  haFloors,
  setHaFloors,
  localFloors,
  setLocalFloors,
  setCustomRooms,
  onRoomCreated,
}: {
  demo: boolean;
  haConnected: boolean;
  canManageRooms: boolean;
  onCallApi?: RoomsApiCall;
  haAreas: HaArea[];
  haFloors: HaFloorEntry[];
  setHaFloors: React.Dispatch<React.SetStateAction<HaFloorEntry[]>>;
  localFloors: LocalFloor[];
  setLocalFloors: (change: (current: LocalFloor[]) => LocalFloor[]) => void;
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

  /** A new room, or changes to one; local rooms take only a name. The room's id once saved, else null. */
  const saveRoom = async (room: RoomTab | null, draft: RoomDraft): Promise<string | null> => {
    const name = cleanName(draft.name);
    if (!name) {
      setError(rt('roomNameRequired'));
      return null;
    }
    if (room?.source === 'custom') {
      setCustomRooms((current) => current.map((entry) => (entry.id === room.id ? { ...entry, name } : entry)));
      setError(null);
      return room.id;
    }
    if (!room && !canManageHa) {
      const id = `${ROOM_ID_CUSTOM_PREFIX}${randomId()}`;
      setCustomRooms((current) => [...current, { id, name, createdAt: Date.now() }]);
      setError(null);
      onRoomCreated(id);
      return id;
    }
    if (!canManageHa || !onCallApi) {
      setError(rt('haUnavailable'));
      return null;
    }
    let savedId: string | null = null;
    const done = await run(room ? rt('areaSaveFailed') : rt('areaCreateFailed'), async () => {
      const area = parseHaArea(await onCallApi(areaMessage(draft, room?.id)));
      if (!area) return false;
      setChangedAreas((current) => [...current.filter((entry) => entry.area_id !== area.area_id), area]);
      setDeletedAreaIds((current) => current.filter((id) => id !== area.area_id));
      if (!room) onRoomCreated(area.area_id);
      savedId = area.area_id;
      return true;
    });
    return done ? savedId : null;
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

  // Floors: Home Assistant's when it is connected, the local ones of the layout otherwise.
  const floors: LocalFloor[] = haConnected ? haFloors.map((floor) => ({ id: floor.floor_id, name: floor.name })) : localFloors;
  const canManageFloors = haConnected ? canManageHa : canManage;

  const createFloor = async (name: string) => {
    if (!haConnected) {
      setLocalFloors((current) => [...current, { id: `floor:${randomId()}`, name }]);
      return true;
    }
    if (!canManageHa || !onCallApi) return false;
    return run(rt('floorCreateFailed'), async () => {
      const floor = parseHaFloorList([await onCallApi({ type: 'config/floor_registry/create', name })])[0];
      if (!floor) return false;
      setHaFloors((current) => [...current, floor]);
      return true;
    });
  };

  const renameFloor = async (floorId: string, name: string) => {
    if (!haConnected) {
      setLocalFloors((current) => current.map((floor) => (floor.id === floorId ? { ...floor, name } : floor)));
      return true;
    }
    if (!canManageHa || !onCallApi) return false;
    return run(rt('floorSaveFailed'), async () => {
      const floor = parseHaFloorList([await onCallApi({ type: 'config/floor_registry/update', floor_id: floorId, name })])[0];
      if (!floor) return false;
      setHaFloors((current) => current.map((entry) => (entry.floor_id === floorId ? floor : entry)));
      return true;
    });
  };

  const moveFloor = async (floorId: string, direction: -1 | 1) => {
    const ids = floors.map((floor) => floor.id);
    const index = ids.indexOf(floorId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return true;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    const byId = <T,>(list: T[], idOf: (entry: T) => string) => ids.map((id) => list.find((entry) => idOf(entry) === id) as T);
    if (!haConnected) {
      setLocalFloors((current) => byId(current, (floor) => floor.id));
      return true;
    }
    if (!canManageHa || !onCallApi) return false;
    return run(rt('floorReorderFailed'), async () => {
      const result = await onCallApi({ type: 'config/floor_registry/reorder', floor_ids: ids });
      if (result === null) return false;
      setHaFloors((current) => byId(current, (floor) => floor.floor_id));
      return true;
    });
  };

  /** Only a floor without rooms goes; its rooms would otherwise be left on none. */
  const deleteFloor = async (floorId: string) => {
    if (!haConnected) {
      setLocalFloors((current) => current.filter((floor) => floor.id !== floorId));
      return true;
    }
    if (!canManageHa || !onCallApi) return false;
    return run(rt('floorDeleteFailed'), async () => {
      const result = await onCallApi({ type: 'config/floor_registry/delete', floor_id: floorId });
      if (result === null) return false;
      setHaFloors((current) => current.filter((floor) => floor.floor_id !== floorId));
      return true;
    });
  };

  return {
    areas,
    canManage,
    canManageHa,
    floors,
    canManageFloors,
    busy,
    error,
    clearError: () => setError(null),
    saveRoom,
    deleteRoom,
    createFloor,
    renameFloor,
    moveFloor,
    deleteFloor,
  };
}
