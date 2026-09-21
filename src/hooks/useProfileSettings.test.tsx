// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CARD_SIZING_ENGINE_STORAGE_KEY } from '../services/cardSizingEngine';
import { useProfileSettings } from './useProfileSettings';

function installSystemAppearance(initialTheme: 'light' | 'dark') {
  let matches = initialTheme === 'light';
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mediaQuery = {
    media: '(prefers-color-scheme: light)',
    onchange: null,
    get matches() {
      return matches;
    },
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
    addListener: (listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeListener: (listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
    dispatchEvent: () => true,
  } as MediaQueryList;

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => mediaQuery),
  });

  return {
    setTheme(nextTheme: 'light' | 'dark') {
      matches = nextTheme === 'light';
      listeners.forEach((listener) => listener({ matches } as MediaQueryListEvent));
    },
  };
}

describe('useProfileSettings system defaults', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('uses the neutral background and Auto mode on a fresh light-system installation', async () => {
    installSystemAppearance('light');
    const { result } = renderHook(() => useProfileSettings());

    expect(result.current.appearanceMode).toBe('auto');
    expect(result.current.appearance).toBe('light');
    expect(result.current.background).toBe('neutral');
    await waitFor(() => expect(localStorage.getItem('ha.dashboard.theme')).toBe('auto'));
    await waitFor(() => expect(localStorage.getItem('ha.dashboard.background')).toBe('neutral'));
  });

  it('keeps the neutral background while following system appearance changes', () => {
    const appearance = installSystemAppearance('light');
    const { result } = renderHook(() => useProfileSettings());

    act(() => appearance.setTheme('dark'));

    expect(result.current.appearance).toBe('dark');
    expect(result.current.background).toBe('neutral');
  });

  it('preserves and migrates an existing explicit theme and wallpaper preference', async () => {
    localStorage.setItem('ha.dashboard.theme', 'dark');
    localStorage.setItem('ha.dashboard.wallpaper', 'sunset-amber');
    installSystemAppearance('light');
    const { result } = renderHook(() => useProfileSettings());

    expect(result.current.appearanceMode).toBe('dark');
    expect(result.current.appearance).toBe('dark');
    expect(result.current.background).toBe('sunset-amber');
    await waitFor(() => expect(localStorage.getItem('ha.dashboard.background')).toBe('sunset-amber'));
    expect(localStorage.getItem('ha.dashboard.wallpaper')).toBeNull();
  });

  it.each([
    ['total-white', 'light'],
    ['total-black', 'dark'],
  ] as const)('migrates the legacy %s background to neutral with its implied appearance', async (legacyWallpaper, appearance) => {
    localStorage.setItem('ha.dashboard.theme', 'auto');
    localStorage.setItem('ha.dashboard.wallpaper', legacyWallpaper);
    installSystemAppearance(appearance === 'light' ? 'dark' : 'light');

    const { result } = renderHook(() => useProfileSettings());

    expect(result.current.appearanceMode).toBe(appearance);
    expect(result.current.appearance).toBe(appearance);
    expect(result.current.background).toBe('neutral');
    await waitFor(() => expect(localStorage.getItem('ha.dashboard.background')).toBe('neutral'));
  });

  it('preserves an explicit appearance when migrating a contradictory legacy background', async () => {
    localStorage.setItem('ha.dashboard.theme', 'dark');
    localStorage.setItem('ha.dashboard.wallpaper', 'total-white');
    installSystemAppearance('light');

    const { result } = renderHook(() => useProfileSettings());

    expect(result.current.appearanceMode).toBe('dark');
    expect(result.current.appearance).toBe('dark');
    expect(result.current.background).toBe('neutral');
    await waitFor(() => expect(localStorage.getItem('ha.dashboard.background')).toBe('neutral'));
  });

  it('repairs persisted sidebar destinations and writes back only canonical routes', async () => {
    localStorage.setItem(
      'ha.dashboard.sidebarPaths',
      JSON.stringify([
        { id: 'security', label: 'Allarme', path: 'https://example.com', icon: 'security' },
        { id: 'unknown', label: 'Admin', path: '/admin', icon: 'settings' },
      ]),
    );
    installSystemAppearance('dark');

    const { result } = renderHook(() => useProfileSettings());

    expect(result.current.sidebarPaths).toEqual([
      { id: 'security', label: 'Allarme', path: '/security', icon: 'security' },
    ]);
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('ha.dashboard.sidebarPaths') ?? '[]')).toEqual([
        { id: 'security', label: 'Allarme', path: '/security', icon: 'security' },
      ]),
    );
  });

  it('ignores an attempted path mutation while applying presentation changes', () => {
    installSystemAppearance('dark');
    const { result } = renderHook(() => useProfileSettings());

    act(() => {
      result.current.updateSidebarPath('home', {
        label: 'Casa',
        path: 'https://example.com',
      } as never);
    });

    expect(result.current.sidebarPaths.find((entry) => entry.id === 'home')).toEqual({
      id: 'home',
      label: 'Casa',
      path: '/home',
      icon: 'home',
    });
  });

  it('defaults the local card sizing engine to Adaptive and persists it', async () => {
    installSystemAppearance('dark');

    const { result } = renderHook(() => useProfileSettings());

    expect(result.current.cardSizingEngine).toBe('adaptive');
    await waitFor(() =>
      expect(localStorage.getItem(CARD_SIZING_ENGINE_STORAGE_KEY)).toBe('adaptive'),
    );
  });

  it.each(['legacy', 'adaptive'] as const)('respects a saved %s card sizing engine', (engine) => {
    localStorage.setItem(CARD_SIZING_ENGINE_STORAGE_KEY, engine);
    installSystemAppearance('dark');

    const { result } = renderHook(() => useProfileSettings());

    expect(result.current.cardSizingEngine).toBe(engine);
  });

  it('repairs an invalid card sizing engine to Adaptive', async () => {
    localStorage.setItem(CARD_SIZING_ENGINE_STORAGE_KEY, 'broken');
    installSystemAppearance('dark');

    const { result } = renderHook(() => useProfileSettings());

    expect(result.current.cardSizingEngine).toBe('adaptive');
    await waitFor(() =>
      expect(localStorage.getItem(CARD_SIZING_ENGINE_STORAGE_KEY)).toBe('adaptive'),
    );
  });

  it('persists card sizing engine changes on this device only', async () => {
    installSystemAppearance('dark');

    const { result } = renderHook(() => useProfileSettings());

    act(() => result.current.setCardSizingEngine('legacy'));
    expect(result.current.cardSizingEngine).toBe('legacy');
    await waitFor(() =>
      expect(localStorage.getItem(CARD_SIZING_ENGINE_STORAGE_KEY)).toBe('legacy'),
    );

    act(() => result.current.setCardSizingEngine('adaptive'));
    expect(result.current.cardSizingEngine).toBe('adaptive');
    await waitFor(() =>
      expect(localStorage.getItem(CARD_SIZING_ENGINE_STORAGE_KEY)).toBe('adaptive'),
    );
  });
});
