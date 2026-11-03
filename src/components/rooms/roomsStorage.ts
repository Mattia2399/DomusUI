import type { DashboardRuntimeMode } from '../../security/dashboardAccess';
import { normalizeRoomName, ROOM_ID_CUSTOM_PREFIX, uniqueStrings } from './roomsDirectory';
import { getRoomsRuntimeStorageKey } from './roomsRuntimeKey';

/*
 * What the Rooms page remembers in this browser, per runtime (the demo keeps
 * its own copy). The formats are stored and must not change.
 */

export const CUSTOM_ROOMS_STORAGE_KEY = 'ha.dashboard.rooms.customRooms.v1';

export const ACTIVE_ROOM_STORAGE_KEY = 'ha.dashboard.rooms.activeRoomId.v1';

export const ROOM_ENTITY_VISIBILITY_STORAGE_KEY = 'ha.dashboard.rooms.hiddenEntitiesByRoom.v1';

// The devices in evidence in each room, in the order they were chosen.
export const ROOM_PINNED_ENTITIES_STORAGE_KEY = 'ha.dashboard.rooms.pinnedEntitiesByRoom.v1';

// Plugs that ask before turning off, wherever they are.

// The order of the rooms, their look, local floors and the sections of each room.
export const ROOM_LAYOUT_STORAGE_KEY = 'ha.dashboard.rooms.layout.v1';

export { getRoomsRuntimeStorageKey };

export type CustomRoomRecord = {
  id: string;
  name: string;
  createdAt: number;
};

export type HiddenRoomEntitiesByRoom = Record<string, string[]>;

export function parseCustomRooms(raw: string | null): CustomRoomRecord[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }
        const id =
          typeof (entry as { id?: unknown }).id === 'string'
            ? (entry as { id: string }).id.trim()
            : '';
        const name =
          typeof (entry as { name?: unknown }).name === 'string'
            ? normalizeRoomName((entry as { name: string }).name)
            : '';
        const createdAtRaw = (entry as { createdAt?: unknown }).createdAt;
        const createdAt =
          typeof createdAtRaw === 'number' && Number.isFinite(createdAtRaw)
            ? createdAtRaw
            : Date.now();
        if (!id || !name) {
          return null;
        }
        return {
          id: id.startsWith(ROOM_ID_CUSTOM_PREFIX) ? id : `${ROOM_ID_CUSTOM_PREFIX}${id}`,
          name,
          createdAt,
        } satisfies CustomRoomRecord;
      })
      .filter((entry): entry is CustomRoomRecord => entry !== null);
  } catch {
    return [];
  }
}

export function readStoredCustomRooms(runtimeMode: DashboardRuntimeMode) {
  if (typeof window === 'undefined') {
    return [];
  }
  return parseCustomRooms(
    window.localStorage.getItem(getRoomsRuntimeStorageKey(CUSTOM_ROOMS_STORAGE_KEY, runtimeMode)),
  );
}

export function readStoredActiveRoomId(runtimeMode: DashboardRuntimeMode) {
  if (typeof window === 'undefined') {
    return '';
  }
  const raw = window.localStorage.getItem(getRoomsRuntimeStorageKey(ACTIVE_ROOM_STORAGE_KEY, runtimeMode));
  return typeof raw === 'string' ? raw.trim() : '';
}

export function parseHiddenRoomEntitiesByRoom(raw: string | null): HiddenRoomEntitiesByRoom {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return Object.entries(parsed as Record<string, unknown>).reduce<HiddenRoomEntitiesByRoom>((acc, [roomId, value]) => {
      const normalizedRoomId = roomId.trim();
      if (!normalizedRoomId || !Array.isArray(value)) {
        return acc;
      }
      const entityIds = uniqueStrings(value.filter((entry): entry is string => typeof entry === 'string'));
      if (entityIds.length > 0) {
        acc[normalizedRoomId] = entityIds;
      }
      return acc;
    }, {});
  } catch {
    return {};
  }
}

export function readStoredHiddenRoomEntitiesByRoom(runtimeMode: DashboardRuntimeMode) {
  if (typeof window === 'undefined') {
    return {};
  }
  return parseHiddenRoomEntitiesByRoom(
    window.localStorage.getItem(getRoomsRuntimeStorageKey(ROOM_ENTITY_VISIBILITY_STORAGE_KEY, runtimeMode)),
  );
}

/** Same shape as the hidden devices: room id → entity ids, in order, without repeats. */
export type PinnedRoomEntitiesByRoom = Record<string, string[]>;

export function parsePinnedRoomEntitiesByRoom(raw: string | null): PinnedRoomEntitiesByRoom {
  return parseHiddenRoomEntitiesByRoom(raw);
}

export function readStoredPinnedRoomEntitiesByRoom(runtimeMode: DashboardRuntimeMode) {
  if (typeof window === 'undefined') {
    return {};
  }
  return parsePinnedRoomEntitiesByRoom(
    window.localStorage.getItem(getRoomsRuntimeStorageKey(ROOM_PINNED_ENTITIES_STORAGE_KEY, runtimeMode)),
  );
}

/** A list of entity ids, in order, without repeats. */
export function parseEntityIdList(raw: string | null): string[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? uniqueStrings(parsed.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)) : [];
  } catch {
    return [];
  }
}

/** The protected plugs, or null when none were ever saved here. */
