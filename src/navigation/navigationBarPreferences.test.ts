import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { isBackupExcludedStorageKey } from '../services/configBackup';
import {
  NAVIGATION_BAR_STORAGE_KEY,
  navigationBarRoutes,
  readNavigationBar,
  RECOMMENDED_NAVIGATION_BAR,
  resetNavigationBar,
  sanitizeNavigationBar,
  useNavigationBar,
  writeNavigationBar,
} from './navigationBarPreferences';

afterEach(() => window.localStorage.clear());

describe('the entries of the bar on this device', () => {
  it('starts from the recommended bar: Dashboard · Stanze · Casa · Profilo', () => {
    expect(readNavigationBar()).toEqual(['rooms', 'casa']);
    expect(navigationBarRoutes(readNavigationBar(), 'phone')).toEqual(['home', 'rooms', 'casa']);
  });

  it('keeps known entries only, each once, at most 7; Dashboard is never among them', () => {
    expect(sanitizeNavigationBar({ entries: ['casa', 'home', 'casa', 'nowhere', 7, 'security'] })).toEqual(['casa', 'security']);
    expect(sanitizeNavigationBar('broken')).toEqual([...RECOMMENDED_NAVIGATION_BAR]);
    expect(sanitizeNavigationBar({ entries: [] })).toEqual([]);
  });

  it('shows the first 3 on a phone and up to 7 at the side', () => {
    const entries = ['rooms', 'casa', 'security', 'consumi', 'automation'] as const;
    expect(navigationBarRoutes(entries, 'phone')).toEqual(['home', 'rooms', 'casa', 'security']);
    expect(navigationBarRoutes(entries, 'side')).toEqual(['home', ...entries]);
  });

  it('saves, tells the bars at once, and goes back to the recommended one', () => {
    const { result } = renderHook(() => useNavigationBar());
    act(() => writeNavigationBar(['security', 'rooms']));
    expect(result.current).toEqual(['security', 'rooms']);
    expect(JSON.parse(window.localStorage.getItem(NAVIGATION_BAR_STORAGE_KEY)!)).toEqual({ version: 1, entries: ['security', 'rooms'] });
    act(() => resetNavigationBar());
    expect(result.current).toEqual(['rooms', 'casa']);
    expect(window.localStorage.getItem(NAVIGATION_BAR_STORAGE_KEY)).toBeNull();
  });

  it('stays on this device: out of sync and backups', () => {
    expect(isBackupExcludedStorageKey(NAVIGATION_BAR_STORAGE_KEY)).toBe(true);
    expect(isBackupExcludedStorageKey('ha.dashboard.sidebarPaths')).toBe(true);
  });
});
