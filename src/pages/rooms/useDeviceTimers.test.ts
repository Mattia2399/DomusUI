import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDeviceTimers } from './useDeviceTimers';

afterEach(() => vi.useRealTimers());

const answer = (timers: Array<{ entity_id: string; minutes: number }>) => ({
  now: new Date().toISOString(),
  timers: timers.map((timer) => ({
    ...timer,
    started_at: new Date().toISOString(),
    ends_at: new Date(Date.now() + timer.minutes * 60_000).toISOString(),
  })),
});

describe('useDeviceTimers', () => {
  it('follows the integration live and sets a timer through it', async () => {
    let push: ((event: unknown) => void) | null = null;
    const onSubscribeApi = vi.fn(async (_message: Record<string, unknown>, callback: (event: never) => void) => {
      push = callback as (event: unknown) => void;
      return () => undefined;
    });
    const onCallApi = vi.fn(async (message: Record<string, unknown>) =>
      message.type === 'domusos/device_timers/set_timer' ? answer([{ entity_id: 'switch.tv', minutes: 30 }]) : null,
    );
    const { result } = renderHook(() => useDeviceTimers({ demo: false, isOn: () => true, onCallApi, onSubscribeApi }));
    await waitFor(() => expect(result.current.available).toBe(true));
    expect(onSubscribeApi).toHaveBeenCalledWith({ type: 'domusos/device_timers/subscribe' }, expect.any(Function));

    act(() => push?.(answer([{ entity_id: 'fan.cappa', minutes: 15 }])));
    expect(Object.keys(result.current.timers)).toEqual(['fan.cappa']);

    let done = false;
    await act(async () => {
      done = await result.current.setTimer('switch.tv', 30);
    });
    expect(done).toBe(true);
    expect(onCallApi).toHaveBeenCalledWith(
      { type: 'domusos/device_timers/set_timer', entity_id: 'switch.tv', minutes: 30 },
      { reportError: false },
    );
    expect(Object.keys(result.current.timers)).toEqual(['switch.tv']);
  });

  it('has no timers without the integration, and puts a refused one back', async () => {
    const onSubscribeApi = vi.fn(async () => {
      throw new Error('unknown_command');
    });
    const missing = vi.fn(async () => null);
    const { result } = renderHook(() => useDeviceTimers({ demo: false, isOn: () => true, onCallApi: missing, onSubscribeApi }));
    await waitFor(() => expect(missing).toHaveBeenCalledWith({ type: 'domusos/device_timers/get_state' }, { reportError: false }));
    expect(result.current.available).toBe(false);

    let done = true;
    await act(async () => {
      done = await result.current.setTimer('switch.tv', 15);
    });
    expect(done).toBe(false);
    expect(result.current.timers).toEqual({});
  });

  it('runs on its own in the demo: switches the device on, then off when the timer ends', async () => {
    vi.useFakeTimers();
    const on = new Set<string>();
    const onDemoSwitch = vi.fn((entityId: string, value: boolean) => {
      if (value) on.add(entityId);
      else on.delete(entityId);
    });
    const { result } = renderHook(() => useDeviceTimers({ demo: true, isOn: (entityId) => on.has(entityId), onDemoSwitch }));
    expect(result.current.available).toBe(true);
    await act(async () => {
      await result.current.setTimer('fan.cappa', 15);
    });
    expect(onDemoSwitch).toHaveBeenCalledWith('fan.cappa', true);
    act(() => {
      vi.advanceTimersByTime(15 * 60_000);
    });
    expect(onDemoSwitch).toHaveBeenLastCalledWith('fan.cappa', false);
    expect(result.current.timers).toEqual({});
  });
});
