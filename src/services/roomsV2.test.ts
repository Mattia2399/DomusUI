import { describe, expect, it } from 'vitest';
import { readRoomsV2Enabled, ROOMS_V2_STORAGE_KEY } from './roomsV2';

describe('the second Rooms page option', () => {
  it('is off unless asked for', () => {
    window.localStorage.clear();
    expect(readRoomsV2Enabled(window.localStorage, '')).toBe(false);
  });

  it('is turned on and off from the address, and remembered', () => {
    window.localStorage.clear();
    expect(readRoomsV2Enabled(window.localStorage, '?roomsV2=on')).toBe(true);
    expect(window.localStorage.getItem(ROOMS_V2_STORAGE_KEY)).toBe('on');
    expect(readRoomsV2Enabled(window.localStorage, '?other=1')).toBe(true);
    expect(readRoomsV2Enabled(window.localStorage, '?roomsV2=off')).toBe(false);
    expect(readRoomsV2Enabled(window.localStorage, '')).toBe(false);
  });
});
