// @vitest-environment jsdom

import React from 'react';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PanelServicesProvider, type PanelServices } from './panelServicesContext';
import { usePanelPlugEnergy } from './panelData';

afterEach(cleanup);

describe('the Home plug energy reader', () => {
  it('builds the graph only from recorder statistics and the configured tariff', async () => {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    const callApi = vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === 'domusos/energy/get_state') {
        return { tariff: { scheme: 'single', price: 0.25 } };
      }
      if (message.type === 'recorder/statistics_during_period') {
        const period = message.period;
        return {
          'sensor.fridge_energy': [{ start: now.getTime(), change: period === '5minute' ? 0.05 : period === 'day' ? 1 : 0.5 }],
        };
      }
      return null;
    });
    const services: PanelServices = { callApi: callApi as PanelServices['callApi'], callService: vi.fn() };
    const wrapper = ({ children }: { children: React.ReactNode }) => <PanelServicesProvider value={services}>{children}</PanelServicesProvider>;
    const { result } = renderHook(() => usePanelPlugEnergy({ statisticId: 'sensor.fridge_energy', kind: 'energy' }), { wrapper });

    await waitFor(() => expect(result.current.energy).not.toBeNull());
    expect(result.current.tariff).toBe('set');
    expect(result.current.energy?.today).toBeCloseTo(0.5);
    expect(result.current.energy?.cost).toBeCloseTo(0.125);
    expect(callApi).toHaveBeenCalledWith(expect.objectContaining({ type: 'recorder/statistics_during_period', period: 'hour' }), { reportError: false });
    expect(callApi).toHaveBeenCalledWith({ type: 'domusos/energy/get_state' }, { reportError: false });
  });

  it('does not contact HA without an actual meter', () => {
    const callApi = vi.fn();
    const services: PanelServices = { callApi: callApi as PanelServices['callApi'], callService: vi.fn() };
    const wrapper = ({ children }: { children: React.ReactNode }) => <PanelServicesProvider value={services}>{children}</PanelServicesProvider>;
    const { result } = renderHook(() => usePanelPlugEnergy(null), { wrapper });
    expect(result.current).toEqual({ energy: null, tariff: 'unknown' });
    expect(callApi).not.toHaveBeenCalled();
  });
});
