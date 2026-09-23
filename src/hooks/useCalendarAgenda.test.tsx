import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCalendarAgenda } from './useCalendarAgenda';

describe('useCalendarAgenda', () => {
  const noDemoEvents: never[] = [];

  it('hydrates the agenda from the native Home Assistant push subscription', async () => {
    let push: ((payload: unknown) => void) | undefined;
    const unsubscribe = vi.fn();
    const subscribeApi = vi.fn(async (_message, callback) => {
      push = callback;
      return unsubscribe;
    });
    const { result, unmount } = renderHook(() => useCalendarAgenda({
      entityId: 'calendar.domus_ui',
      enabled: true,
      isDemo: false,
      callApi: vi.fn(),
      subscribeApi,
    }));

    await waitFor(() => expect(subscribeApi).toHaveBeenCalledTimes(1));
    act(() => push?.({
      events: [{ uid: 'event-1', summary: 'Test', start: '2026-09-24', end: '2026-09-25' }],
    }));

    expect(result.current.status).toBe('ready');
    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0]).toMatchObject({ uid: 'event-1', allDay: true });
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('keeps Demo mutations isolated from Home Assistant', async () => {
    const callApi = vi.fn();
    const subscribeApi = vi.fn();
    const { result } = renderHook(() => useCalendarAgenda({
      entityId: 'calendar.domus_ui',
      enabled: true,
      isDemo: true,
      demoEvents: noDemoEvents,
      callApi,
      subscribeApi,
    }));

    await act(async () => {
      expect(await result.current.createEvent({
        summary: 'Demo event',
        start: '2026-09-24',
        end: '2026-09-25',
        allDay: true,
      })).toBe(true);
    });

    expect(result.current.events).toHaveLength(1);
    expect(callApi).not.toHaveBeenCalled();
    expect(subscribeApi).not.toHaveBeenCalled();
  });
});
