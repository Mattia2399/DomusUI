import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SCREENSAVER_PREFERENCES,
  SCREENSAVER_STORAGE_KEY,
  onScreensaverPreviewRequest,
  parseScreensaverPreferences,
  readScreensaverPreferences,
  requestScreensaverPreview,
  resetScreensaverPreferencesCache,
  saveScreensaverPreferences,
  serializeScreensaverPreferences,
  useScreensaverPreferences,
} from './screensaverPreferences';

const stored = (value: unknown) => ({
  getItem: () => (typeof value === 'string' ? value : JSON.stringify(value)),
  setItem: () => undefined,
});

beforeEach(() => {
  window.localStorage.clear();
  resetScreensaverPreferencesCache();
});

afterEach(() => {
  resetScreensaverPreferencesCache();
});

describe('screensaver preferences', () => {
  it('is off by default: 5 minutes, minimal, with the date', () => {
    expect(DEFAULT_SCREENSAVER_PREFERENCES).toEqual({ enabled: false, timeoutMinutes: 5, mode: 'minimal', showDate: true });
    expect(readScreensaverPreferences(window.localStorage)).toEqual(DEFAULT_SCREENSAVER_PREFERENCES);
    expect(readScreensaverPreferences(null)).toEqual(DEFAULT_SCREENSAVER_PREFERENCES);
  });

  it('keeps a versioned document with only its four values', () => {
    const preferences = { enabled: true, timeoutMinutes: 10, mode: 'ambient', showDate: false } as const;
    const serialized = serializeScreensaverPreferences(preferences);

    expect(JSON.parse(serialized)).toEqual({ version: 1, ...preferences });
    expect(parseScreensaverPreferences(JSON.parse(serialized))).toEqual(preferences);
  });

  it('falls back to the defaults, switched off, for anything unreadable', () => {
    for (const value of ['not json{', '[]', 'null', '"on"', { enabled: true, timeoutMinutes: 1 }, { version: 2, enabled: true }]) {
      expect(readScreensaverPreferences(stored(value)), JSON.stringify(value)).toEqual(DEFAULT_SCREENSAVER_PREFERENCES);
    }
    expect(
      readScreensaverPreferences({
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => undefined,
      }),
    ).toEqual(DEFAULT_SCREENSAVER_PREFERENCES);
  });

  it('replaces only the invalid values, and is on only when it says true', () => {
    expect(parseScreensaverPreferences({ version: 1, enabled: 'true', timeoutMinutes: 2, mode: 'ambient', showDate: false })).toEqual({
      enabled: false,
      timeoutMinutes: 2,
      mode: 'ambient',
      showDate: false,
    });
    expect(parseScreensaverPreferences({ version: 1, enabled: true, timeoutMinutes: 3, mode: 'photos', showDate: 'yes' })).toEqual({
      enabled: true,
      timeoutMinutes: 5,
      mode: 'minimal',
      showDate: true,
    });
    expect(parseScreensaverPreferences({ version: 1, enabled: true, timeoutMinutes: '1' }).timeoutMinutes).toBe(5);
    expect(parseScreensaverPreferences({ version: 1 })).toEqual(DEFAULT_SCREENSAVER_PREFERENCES);
    expect(parseScreensaverPreferences({ version: 1, enabled: true, extra: 'ignored' })).toEqual({
      ...DEFAULT_SCREENSAVER_PREFERENCES,
      enabled: true,
    });
  });

  it('accepts exactly 1, 2, 5, 10, 15 and 30 minutes', () => {
    for (const minutes of [1, 2, 5, 10, 15, 30]) {
      expect(parseScreensaverPreferences({ version: 1, timeoutMinutes: minutes }).timeoutMinutes).toBe(minutes);
    }
    for (const minutes of [0, 0.5, 3, 60, -1]) {
      expect(parseScreensaverPreferences({ version: 1, timeoutMinutes: minutes }).timeoutMinutes).toBe(5);
    }
  });

  it('saves in this browser and applies at once to every reader', () => {
    const { result } = renderHook(() => useScreensaverPreferences());
    expect(result.current.enabled).toBe(false);

    act(() => {
      expect(saveScreensaverPreferences({ ...DEFAULT_SCREENSAVER_PREFERENCES, enabled: true, timeoutMinutes: 1 })).toBe(true);
    });

    expect(result.current).toEqual({ ...DEFAULT_SCREENSAVER_PREFERENCES, enabled: true, timeoutMinutes: 1 });
    expect(JSON.parse(window.localStorage.getItem(SCREENSAVER_STORAGE_KEY)!)).toEqual({
      version: 1,
      enabled: true,
      timeoutMinutes: 1,
      mode: 'minimal',
      showDate: true,
    });
  });

  it('still applies for this visit when the browser keeps nothing', () => {
    const { result } = renderHook(() => useScreensaverPreferences());
    const failing = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    };

    act(() => {
      expect(saveScreensaverPreferences({ ...DEFAULT_SCREENSAVER_PREFERENCES, enabled: true }, failing)).toBe(false);
    });

    expect(result.current.enabled).toBe(true);
  });

  it('follows a change made in another tab of this browser', () => {
    const { result } = renderHook(() => useScreensaverPreferences());

    act(() => {
      window.localStorage.setItem(
        SCREENSAVER_STORAGE_KEY,
        JSON.stringify({ version: 1, enabled: true, timeoutMinutes: 15, mode: 'ambient', showDate: true }),
      );
      window.dispatchEvent(new StorageEvent('storage', { key: SCREENSAVER_STORAGE_KEY }));
    });

    expect(result.current).toEqual({ enabled: true, timeoutMinutes: 15, mode: 'ambient', showDate: true });
  });

  it('hands preview requests to the runtime without saving anything', () => {
    const received: unknown[] = [];
    const stop = onScreensaverPreviewRequest((preferences) => received.push(preferences));

    requestScreensaverPreview({ ...DEFAULT_SCREENSAVER_PREFERENCES, mode: 'ambient' });
    stop();
    requestScreensaverPreview(DEFAULT_SCREENSAVER_PREFERENCES);

    expect(received).toEqual([{ ...DEFAULT_SCREENSAVER_PREFERENCES, mode: 'ambient' }]);
    expect(window.localStorage.getItem(SCREENSAVER_STORAGE_KEY)).toBeNull();
  });
});
