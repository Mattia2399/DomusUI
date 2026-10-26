/*
 * The second Rooms page, behind an option while it is built. Off, Rooms is
 * the page it has always been. On this device it is turned on or off with
 * `?roomsV2=on` / `?roomsV2=off` in the address, which is remembered.
 */

export const ROOMS_V2_STORAGE_KEY = 'ha.dashboard.roomsV2';
export const ROOMS_V2_DEFAULT = false;

export function normalizeRoomsV2(value: unknown): boolean | null {
  if (value === 'on' || value === '1' || value === 'true') return true;
  if (value === 'off' || value === '0' || value === 'false') return false;
  return null;
}

export function readRoomsV2Enabled(storage?: Storage, search?: string): boolean {
  const asked = search ? normalizeRoomsV2(new URLSearchParams(search).get('roomsV2')) : null;
  if (asked !== null) {
    try {
      storage?.setItem(ROOMS_V2_STORAGE_KEY, asked ? 'on' : 'off');
    } catch {
      // Storage may be unavailable; the address still decides for this visit.
    }
    return asked;
  }
  try {
    return normalizeRoomsV2(storage?.getItem(ROOMS_V2_STORAGE_KEY)) ?? ROOMS_V2_DEFAULT;
  } catch {
    return ROOMS_V2_DEFAULT;
  }
}
