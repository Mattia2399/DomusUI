import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HouseTopology } from '../../services/houseCore';
import { useRoomsRegistry } from './useRoomsRegistry';

afterEach(cleanup);

function topology(name: string, fingerprint: string): HouseTopology {
  return {
    schemaVersion: 'domusos.house.v1', topologyRevision: fingerprint === 'x' ? 1 : 2,
    topologyFingerprint: fingerprint, generatedAt: 'now', floors: [],
    rooms: [{ id: 'living', name, floorId: null, aliases: [], icon: null, picture: null,
      temperatureEntityId: null, humidityEntityId: null }],
    devices: [], entities: [], unassigned: { deviceIds: [], entityIds: [] }, issues: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('Rooms House source', () => {
  it('keeps the newer registry generation when an older request finishes late', async () => {
    const old = deferred<HouseTopology>();
    const current = deferred<HouseTopology>();
    const callApi = vi.fn().mockImplementationOnce(() => old.promise).mockImplementationOnce(() => current.promise);
    const { result, rerender } = renderHook(({ connected }) => useRoomsRegistry(connected, callApi), { initialProps: { connected: true } });
    await waitFor(() => expect(callApi).toHaveBeenCalledTimes(1));
    await act(async () => {
      const refresh = result.current.refresh();
      current.resolve(topology('New room', 'y'));
      await refresh;
    });
    expect(result.current.areas[0].name).toBe('New room');
    await act(async () => old.resolve(topology('Old room', 'x')));
    expect(result.current.areas[0].name).toBe('New room');
    expect(result.current.status).toBe('ready');
    rerender({ connected: false });
    expect(result.current.areas).toEqual([]);
    expect(result.current.status).toBe('disconnected');
    expect(callApi.mock.calls.every((call) => call[0].type === 'domusos/house/get_topology')).toBe(true);
  });

  it('refreshes a second client after an external registry change without a browser topology cache', async () => {
    let current = topology('Living', 'x');
    const callApi = vi.fn(async () => current);
    const a = renderHook(() => useRoomsRegistry(true, callApi));
    const b = renderHook(() => useRoomsRegistry(true, callApi));
    await waitFor(() => expect(a.result.current.areas[0]?.name).toBe('Living'));
    await waitFor(() => expect(b.result.current.areas[0]?.name).toBe('Living'));
    current = topology('Lounge', 'y');
    await act(async () => { await b.result.current.refresh(); });
    expect(b.result.current.areas[0].name).toBe('Lounge');
    expect(a.result.current.areas[0].name).toBe('Living');
    await act(async () => { await a.result.current.refresh(); });
    expect(a.result.current.areas[0].name).toBe('Lounge');
  });

  it('keeps a successful floor write overlay only until House confirms it', async () => {
    let current = topology('Living', 'x');
    const callApi = vi.fn(async () => current);
    const view = renderHook(() => useRoomsRegistry(true, callApi));
    await waitFor(() => expect(view.result.current.status).toBe('ready'));
    act(() => view.result.current.setFloors([{ floor_id: 'upper', name: 'Upper', level: null }]));
    await act(async () => { await view.result.current.refresh(); });
    expect(view.result.current.floors[0]?.name).toBe('Upper');
    current = { ...topology('Living', 'y'), floors: [{ id: 'upper', name: 'Upper', level: null, aliases: [], order: 0 }] };
    await act(async () => { await view.result.current.refresh(); });
    current = { ...topology('Living', 'z'), floors: [{ id: 'upper', name: 'Renamed externally', level: null, aliases: [], order: 0 }] };
    await act(async () => { await view.result.current.refresh(); });
    expect(view.result.current.floors[0]?.name).toBe('Renamed externally');
  });
});
