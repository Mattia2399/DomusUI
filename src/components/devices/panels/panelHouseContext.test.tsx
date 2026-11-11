// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dashboardHouseLookups } from '../../../services/dashboardHouseContext';
import { usePanelHouseContext } from './panelData';
import { PanelServicesProvider, type PanelApiCall } from './panelServicesContext';

const snapshot = (room: string, revision: number) => ({
  schemaVersion: 'domusos.dashboard.house.v1', topologyRevision: revision,
  rooms: [{ id: room, name: room === 'a' ? 'Sala' : 'Studio' }], devices: [],
  entities: [{ registryId: 'sensor-1', entityId: 'sensor.temperature', deviceId: null, effectiveRoomId: room }],
});

function Probe() {
  const house = usePanelHouseContext();
  return <span data-testid="room">{dashboardHouseLookups(house).roomIdOf('sensor.temperature') ?? 'none'}</span>;
}

afterEach(cleanup);

describe('panel House membership refresh', () => {
  it('updates an open panel after a move and ignores an older response', async () => {
    let resolveOld: ((value: unknown) => void) | undefined;
    let reads = 0;
    const callApi = vi.fn(async () => {
      reads += 1;
      if (reads === 1) return snapshot('a', 1);
      if (reads === 2) return new Promise<unknown>((resolve) => { resolveOld = resolve; });
      return snapshot('b', 3);
    }) as PanelApiCall;
    render(<PanelServicesProvider value={{ callApi, callService: vi.fn(), houseConnected: true }}><Probe /></PanelServicesProvider>);
    await waitFor(() => expect(screen.getByTestId('room').textContent).toBe('a'));
    act(() => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(resolveOld).toBeTypeOf('function'));
    act(() => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(screen.getByTestId('room').textContent).toBe('b'));
    await act(async () => { resolveOld?.(snapshot('a', 2)); });
    expect(screen.getByTestId('room').textContent).toBe('b');
  });

  it('clears the old room on disconnect and reads afresh on reconnect', async () => {
    const callApi = vi.fn().mockResolvedValueOnce(snapshot('a', 1)).mockResolvedValue(snapshot('b', 2)) as PanelApiCall;
    const renderProbe = (connected: boolean) =>
      <PanelServicesProvider value={{ callApi, callService: vi.fn(), houseConnected: connected }}><Probe /></PanelServicesProvider>;
    const page = render(renderProbe(true));
    await waitFor(() => expect(screen.getByTestId('room').textContent).toBe('a'));
    page.rerender(renderProbe(false));
    expect(screen.getByTestId('room').textContent).toBe('none');
    page.rerender(renderProbe(true));
    await waitFor(() => expect(screen.getByTestId('room').textContent).toBe('b'));
  });
});
