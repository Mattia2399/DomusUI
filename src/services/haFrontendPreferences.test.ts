import { describe, expect, it, vi } from 'vitest';
import {
  disableDomusUiAsDefaultPanel,
  DOMUS_UI_PANEL_PATH,
  enableDomusUiAsDefaultPanel,
  getHaDefaultPanelState,
  getPreviousDefaultPanelStorageKey,
  HaFrontendPreferencesError,
  readPreviousDefaultPanel,
  type HaFrontendPreferencesCallApi,
  type StorageLike,
} from './haFrontendPreferences';

function createStorage(initial: Record<string, string> = {}): StorageLike & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

function createApi(
  initialCore: Record<string, unknown> = {},
  panels: Record<string, unknown> = { lovelace: {}, domusos: {} },
) {
  let core = { ...initialCore };
  const callApi = vi.fn(async (message: Record<string, unknown>) => {
    if (message.type === 'frontend/get_user_data') return { value: { ...core } };
    if (message.type === 'frontend/set_user_data') {
      core = { ...(message.value as Record<string, unknown>) };
      return null;
    }
    if (message.type === 'get_panels') return panels;
    throw new Error('unexpected request');
  }) as unknown as HaFrontendPreferencesCallApi;
  return { callApi, getCore: () => core };
}

describe('haFrontendPreferences', () => {
  it('reads the current core default panel', async () => {
    const { callApi } = createApi({ default_panel: 'lovelace', vibrate: true });
    await expect(getHaDefaultPanelState(callApi)).resolves.toEqual({
      defaultPanel: 'lovelace',
      isDomusUiDefault: false,
    });
  });

  it('treats a missing core value as empty preferences', async () => {
    const callApi = vi.fn().mockResolvedValue({ value: null }) as HaFrontendPreferencesCallApi;
    await expect(getHaDefaultPanelState(callApi)).resolves.toEqual({ defaultPanel: null, isDomusUiDefault: false });
  });

  it('rejects an invalid read response', async () => {
    const callApi = vi.fn().mockResolvedValue({ data: {} }) as HaFrontendPreferencesCallApi;
    await expect(getHaDefaultPanelState(callApi)).rejects.toMatchObject({ code: 'invalid-read' });
  });

  it('enables Domus UI while preserving all other core preferences', async () => {
    const storage = createStorage();
    const { callApi, getCore } = createApi({ default_panel: 'lovelace', vibrate: true, number_format: 'language' });
    const result = await enableDomusUiAsDefaultPanel({ callApi, storage, userId: 'user-1' });

    expect(result.isDomusUiDefault).toBe(true);
    expect(getCore()).toEqual({ default_panel: DOMUS_UI_PANEL_PATH, vibrate: true, number_format: 'language' });
    expect(readPreviousDefaultPanel(storage, 'user-1')).toBe('lovelace');
  });

  it('does not overwrite the stored previous panel when already enabled', async () => {
    const key = getPreviousDefaultPanelStorageKey('user-1');
    const storage = createStorage({ [key]: 'lovelace' });
    const { callApi } = createApi({ default_panel: DOMUS_UI_PANEL_PATH });
    await enableDomusUiAsDefaultPanel({ callApi, storage, userId: 'user-1' });

    expect(storage.getItem(key)).toBe('lovelace');
    expect(vi.mocked(callApi).mock.calls.filter(([message]) => message.type === 'frontend/set_user_data')).toHaveLength(0);
  });

  it('uses a clean system-default fallback when no previous panel was selected', async () => {
    const key = getPreviousDefaultPanelStorageKey('user-1');
    const storage = createStorage({ [key]: 'stale-panel' });
    const { callApi, getCore } = createApi({ vibrate: true });
    await enableDomusUiAsDefaultPanel({ callApi, storage, userId: 'user-1' });
    expect(storage.getItem(key)).toBeNull();

    const result = await disableDomusUiAsDefaultPanel({ callApi, storage, userId: 'user-1' });
    expect(result.usedSystemDefault).toBe(true);
    expect(getCore()).toEqual({ vibrate: true });
  });

  it('restores an available previous panel and preserves other preferences', async () => {
    const key = getPreviousDefaultPanelStorageKey('user-1');
    const storage = createStorage({ [key]: 'lovelace' });
    const { callApi, getCore } = createApi({ default_panel: DOMUS_UI_PANEL_PATH, vibrate: false });
    const result = await disableDomusUiAsDefaultPanel({ callApi, storage, userId: 'user-1' });

    expect(result.restoredPanel).toBe('lovelace');
    expect(result.usedSystemDefault).toBe(false);
    expect(getCore()).toEqual({ default_panel: 'lovelace', vibrate: false });
    expect(storage.getItem(key)).toBeNull();
  });

  it('falls back to the HA system default when the previous panel is unavailable', async () => {
    const key = getPreviousDefaultPanelStorageKey('user-1');
    const storage = createStorage({ [key]: 'removed-panel' });
    const { callApi, getCore } = createApi({ default_panel: DOMUS_UI_PANEL_PATH, vibrate: true });
    const result = await disableDomusUiAsDefaultPanel({ callApi, storage, userId: 'user-1' });

    expect(result.usedSystemDefault).toBe(true);
    expect(getCore()).toEqual({ vibrate: true });
  });

  it('falls back safely when panel validation is unavailable', async () => {
    const key = getPreviousDefaultPanelStorageKey('user-1');
    const storage = createStorage({ [key]: 'lovelace' });
    const { callApi: baseApi, getCore } = createApi({ default_panel: DOMUS_UI_PANEL_PATH, vibrate: true });
    const callApi = vi.fn(async (message: Record<string, unknown>, options?: { reportError?: boolean; throwOnError?: boolean }) => {
      if (message.type === 'get_panels') throw new Error('unsupported');
      return baseApi(message, options);
    }) as unknown as HaFrontendPreferencesCallApi;

    await disableDomusUiAsDefaultPanel({ callApi, storage, userId: 'user-1' });
    expect(getCore()).toEqual({ vibrate: true });
  });

  it('scopes the previous panel by Home Assistant user', async () => {
    const storage = createStorage();
    const first = createApi({ default_panel: 'lovelace' });
    const second = createApi({ default_panel: 'energy' });
    await enableDomusUiAsDefaultPanel({ callApi: first.callApi, storage, userId: 'user-a' });
    await enableDomusUiAsDefaultPanel({ callApi: second.callApi, storage, userId: 'user-b' });

    expect(readPreviousDefaultPanel(storage, 'user-a')).toBe('lovelace');
    expect(readPreviousDefaultPanel(storage, 'user-b')).toBe('energy');
  });

  it('does not report success when HA fails or does not confirm the write', async () => {
    const storage = createStorage();
    const failedApi = vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === 'frontend/get_user_data') return { value: { default_panel: 'lovelace' } };
      throw new Error('offline');
    }) as unknown as HaFrontendPreferencesCallApi;
    await expect(enableDomusUiAsDefaultPanel({ callApi: failedApi, storage, userId: 'user-1' }))
      .rejects.toBeInstanceOf(HaFrontendPreferencesError);

    const unconfirmedApi = vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === 'frontend/get_user_data') return { value: { default_panel: 'lovelace' } };
      return null;
    }) as unknown as HaFrontendPreferencesCallApi;
    await expect(enableDomusUiAsDefaultPanel({ callApi: unconfirmedApi, storage, userId: 'user-1' }))
      .rejects.toMatchObject({ code: 'write-unconfirmed' });
  });
});
