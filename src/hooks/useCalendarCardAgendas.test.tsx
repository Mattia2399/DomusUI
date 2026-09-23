import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCalendarCardAgendas } from './useCalendarCardAgendas';

describe('useCalendarCardAgendas', () => {
  it('keeps every calendar card hydrated through its push subscription', async () => {
    const pushes = new Map<string, (payload: unknown) => void>();
    const subscribeApi = vi.fn(async (message: Record<string, unknown>, callback: (payload: unknown) => void) => {
      pushes.set(String(message.entity_id), callback);
      return vi.fn();
    });
    const { result } = renderHook(() => useCalendarCardAgendas({
      entityIds: ['calendar.domus_ui', 'calendar.family'],
      enabled: true,
      isDemo: false,
      demoStates: {},
      subscribeApi,
    }));

    await waitFor(() => expect(subscribeApi).toHaveBeenCalledTimes(2));
    act(() => pushes.get('calendar.family')?.({
      events: [{ uid: 'family-1', summary: 'Dinner', start: '2026-09-24T20:00:00Z', end: '2026-09-24T21:00:00Z' }],
    }));
    expect(result.current['calendar.family']).toHaveLength(1);
    expect(result.current['calendar.family'][0].summary).toBe('Dinner');
  });
});
