import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PanelApiCall } from '../components/devices/panels/panelServicesContext';
import type { SettingsHouseContext } from '../services/settingsHouseContext';
import { useSettingsHouseContext } from './useSettingsHouseContext';

afterEach(cleanup);

const context = (room: string, revision: number): SettingsHouseContext => ({
  schemaVersion: 'domusos.system.house.v1', topologyRevision: revision,
  rooms: [{ id: room, name: room }], devices: [], entities: [],
});

describe('useSettingsHouseContext', () => {
  it('ignores a late older response and refreshes on focus without another poll owner', async () => {
    const pending: Array<(value: SettingsHouseContext) => void> = [];
    const callApi = vi.fn(() => new Promise<SettingsHouseContext>((resolve) => pending.push(resolve))) as unknown as PanelApiCall;
    const { result, unmount } = renderHook(() => useSettingsHouseContext(callApi, true, true));
    await waitFor(() => expect(pending).toHaveLength(1));
    act(() => window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(pending).toHaveLength(2));
    await act(async () => pending[1](context('b', 2)));
    expect(result.current?.rooms[0].id).toBe('b');
    await act(async () => pending[0](context('a', 1)));
    expect(result.current?.rooms[0].id).toBe('b');
    unmount();
    expect(callApi).toHaveBeenCalledWith(
      { type: 'domusos/system/get_house_context' }, { reportError: false, throwOnError: true },
    );
  });

  it('clears stale room membership when registry writes arrive before House confirmation', async () => {
    const pending: Array<(value: SettingsHouseContext) => void> = [];
    const callApi = vi.fn(() => new Promise<SettingsHouseContext>((resolve) => pending.push(resolve))) as unknown as PanelApiCall;
    const { result, rerender } = renderHook(({ registry }) => useSettingsHouseContext(
      callApi, true, true, registry,
    ), { initialProps: { registry: 'a' } });
    await waitFor(() => expect(pending).toHaveLength(1));
    await act(async () => pending[0](context('a', 1)));
    expect(result.current?.rooms[0].id).toBe('a');
    rerender({ registry: 'b' });
    expect(result.current).toBeNull();
    await waitFor(() => expect(pending.length).toBeGreaterThanOrEqual(2));
    await act(async () => pending.at(-1)?.(context('b', 2)));
    expect(result.current?.rooms[0].id).toBe('b');
  });
});
