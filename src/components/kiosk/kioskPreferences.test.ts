import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_KIOSK_PREFERENCES,
  KIOSK_START_ROUTES,
  KIOSK_STORAGE_KEY,
  parseKioskPreferences,
  readKioskPreferences,
  resetKioskPreferencesCache,
  resolveKioskStartRoute,
  saveKioskPreferences,
  serializeKioskPreferences,
  useKioskPreferences,
} from './kioskPreferences';

const stored = (value: unknown) => ({
  getItem: () => (typeof value === 'string' ? value : JSON.stringify(value)),
  setItem: () => undefined,
});

beforeEach(() => {
  window.localStorage.clear();
  resetKioskPreferencesCache();
});

afterEach(() => resetKioskPreferencesCache());

describe('kiosk preferences', () => {
  it('is off by default, with navigation hidden, Home, full screen and the screen kept on', () => {
    expect(DEFAULT_KIOSK_PREFERENCES).toEqual({
      enabled: false,
      hideNavigation: true,
      startRoute: '/home',
      preferFullscreen: true,
      keepScreenAwake: true,
    });
    expect(readKioskPreferences(window.localStorage)).toEqual(DEFAULT_KIOSK_PREFERENCES);
  });

  it('offers only the main pages as a start page: never Settings, Profile or pages not ready', () => {
    expect(KIOSK_START_ROUTES).toEqual(['/appgallery', '/home', '/rooms', '/security', '/consumi']);
    expect(KIOSK_START_ROUTES.some((route) => /settings|profile|automation/.test(route))).toBe(false);
  });

  it('keeps a versioned document with only its five values', () => {
    const preferences = { enabled: true, hideNavigation: false, startRoute: '/rooms', preferFullscreen: false, keepScreenAwake: true };
    const serialized = serializeKioskPreferences(preferences);

    expect(JSON.parse(serialized)).toEqual({ version: 1, ...preferences });
    expect(parseKioskPreferences(JSON.parse(serialized))).toEqual(preferences);
  });

  it('never turns Kiosk on from data it cannot trust', () => {
    for (const value of ['not json{', '[]', 'null', '"kiosk"', { enabled: true }, { version: 2, enabled: true }]) {
      expect(readKioskPreferences(stored(value)), JSON.stringify(value)).toEqual(DEFAULT_KIOSK_PREFERENCES);
    }
    expect(parseKioskPreferences({ version: 1, enabled: 'true' }).enabled).toBe(false);
    expect(parseKioskPreferences({ version: 1, enabled: 1 }).enabled).toBe(false);
  });

  it('replaces only the invalid values; an unknown start page becomes Home', () => {
    expect(
      parseKioskPreferences({
        version: 1,
        enabled: true,
        hideNavigation: 'no',
        startRoute: '/settings',
        preferFullscreen: false,
        keepScreenAwake: null,
        extra: 'ignored',
      }),
    ).toEqual({ enabled: true, hideNavigation: true, startRoute: '/home', preferFullscreen: false, keepScreenAwake: true });
    expect(parseKioskPreferences({ version: 1, startRoute: 'https://example.com' }).startRoute).toBe('/home');
    expect(parseKioskPreferences({ version: 1, startRoute: '/settings/profile' }).startRoute).toBe('/home');
  });

  it('opens on the saved page only while the person can still reach it', () => {
    expect(resolveKioskStartRoute('/rooms', ['/home', '/rooms'])).toBe('/rooms');
    expect(resolveKioskStartRoute('/security', ['/home', '/rooms'])).toBe('/home');
    expect(resolveKioskStartRoute('/home', [])).toBe('/home');
  });

  it('applies at once to every reader and follows another tab', () => {
    const { result } = renderHook(() => useKioskPreferences());

    act(() => {
      expect(saveKioskPreferences({ ...DEFAULT_KIOSK_PREFERENCES, enabled: true })).toBe(true);
    });
    expect(result.current.enabled).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(KIOSK_STORAGE_KEY)!).version).toBe(1);

    act(() => {
      window.localStorage.setItem(KIOSK_STORAGE_KEY, serializeKioskPreferences({ ...DEFAULT_KIOSK_PREFERENCES, enabled: false }));
      window.dispatchEvent(new StorageEvent('storage', { key: KIOSK_STORAGE_KEY }));
    });
    expect(result.current.enabled).toBe(false);
  });
});
