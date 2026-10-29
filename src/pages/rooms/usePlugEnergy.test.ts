import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePlugEnergy } from './usePlugEnergy';

afterEach(() => vi.useRealTimers());

const hourStart = (hour: number) => {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return date.getTime();
};

describe('usePlugEnergy', () => {
  it('reads the statistics of the meter and tells a missing tariff', async () => {
    const onCallApi = vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === 'domusos/energy/get_state') return { configured: true, tariff: null };
      if (message.period === 'hour') return { 'sensor.fridge_energy': [{ start: hourStart(0), change: 0.1 }] };
      return { 'sensor.fridge_energy': [] };
    });
    const { result } = renderHook(() => usePlugEnergy({ source: { statisticId: 'sensor.fridge_energy', kind: 'energy' }, onCallApi }));
    await waitFor(() => expect(result.current.energy).not.toBeNull());
    expect(result.current.energy?.hours[0]).toBeCloseTo(0.1);
    expect(result.current.energy?.cost).toBeNull();
    expect(result.current.tariff).toBe('missing');
    expect(onCallApi).toHaveBeenCalledWith(expect.objectContaining({ type: 'recorder/statistics_during_period', types: ['change'] }), { reportError: false });
  });

  it('shows nothing for a meter without statistics or without the integration', async () => {
    const onCallApi = vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === 'domusos/energy/get_state') throw new Error('unknown command');
      return {};
    });
    const { result } = renderHook(() => usePlugEnergy({ source: { statisticId: 'sensor.tv_power', kind: 'power' }, onCallApi }));
    await waitFor(() => expect(onCallApi).toHaveBeenCalledWith({ type: 'domusos/energy/get_state' }, { reportError: false }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current).toEqual({ energy: null, tariff: 'unknown' });
  });
});
