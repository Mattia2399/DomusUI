import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSensorHistory } from './useSensorHistory';

const answer = (entityId: string) => ({
  [entityId]: [
    { s: '20.5', lu: 1_700_000_000 },
    { s: '21', lu: 1_700_000_600 },
  ],
});

describe('useSensorHistory', () => {
  it('says the history is loading from the first paint until it arrives', async () => {
    let reply: (value: unknown) => void = () => undefined;
    const onCallApi = vi.fn(() => new Promise((resolve) => {
      reply = resolve;
    }));
    const { result } = renderHook(() => useSensorHistory({ entityIds: ['sensor.first'], hours: 24, onCallApi }));

    expect(result.current.loading).toBe(true);
    expect(result.current.points).toEqual({});
    await act(async () => reply(answer('sensor.first')));
    expect(result.current.loading).toBe(false);
    expect(result.current.points['sensor.first']).toHaveLength(2);
  });

  it('shows a history read a moment ago at once, without asking again', async () => {
    const onCallApi = vi.fn(async () => answer('sensor.second'));
    const first = renderHook(() => useSensorHistory({ entityIds: ['sensor.second'], hours: 24, onCallApi }));
    await waitFor(() => expect(first.result.current.points['sensor.second']).toHaveLength(2));
    first.unmount();

    const again = renderHook(() => useSensorHistory({ entityIds: ['sensor.second'], hours: 24, onCallApi }));
    expect(again.result.current.loading).toBe(false);
    expect(again.result.current.points['sensor.second']).toHaveLength(2);
    expect(onCallApi).toHaveBeenCalledTimes(1);
  });

  it('does not remember an answer that did not come', async () => {
    const onCallApi = vi.fn(async () => null);
    const first = renderHook(() => useSensorHistory({ entityIds: ['sensor.third'], hours: 24, onCallApi }));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    first.unmount();

    const again = renderHook(() => useSensorHistory({ entityIds: ['sensor.third'], hours: 24, onCallApi }));
    expect(again.result.current.loading).toBe(true);
    await waitFor(() => expect(onCallApi).toHaveBeenCalledTimes(2));
  });
});
