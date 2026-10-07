import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EnergyCallApi, EnergyHistoryPreset, EnergyHistoryResult } from '../../../services/energyCoreClient';
import { dayStarts, historyResult, hourStarts, monthStarts, series } from './energyHistory.fixtures';
import { useEnergyHistory } from './useEnergyHistory';

afterEach(() => {
  vi.useRealTimers();
});

/** One distinct document per preset, shaped as the backend answers it. */
const DOCUMENTS: Record<EnergyHistoryPreset, EnergyHistoryResult> = {
  '24h': historyResult({ starts: hourStarts(24), series: { grid_import: series(hourStarts(24), Array.from({ length: 24 }, () => 0.5)) } }),
  '7d': historyResult({ bucket: 'day', starts: dayStarts(7), series: { grid_import: series(dayStarts(7), [1, 2, 3, 4, 5, 6, 7]) } }),
  '30d': historyResult({ bucket: 'day', starts: dayStarts(30, '2026-09-06'), series: { grid_import: series(dayStarts(30, '2026-09-06'), Array.from({ length: 30 }, () => 9)) } }),
  '12m': historyResult({ bucket: 'month', starts: monthStarts(), series: { grid_import: series(monthStarts(), Array.from({ length: 12 }, () => 200)) } }),
};

type Pending = { range: EnergyHistoryPreset; resolve: (value: unknown) => void; reject: (error: unknown) => void };

/** A websocket whose answers the test releases one by one, in any order. */
function deferredApi() {
  const pending: Pending[] = [];
  const callApi = vi.fn((message: Record<string, unknown>) => new Promise((resolve, reject) => {
    pending.push({ range: message.range as EnergyHistoryPreset, resolve, reject });
  })) as unknown as EnergyCallApi & ReturnType<typeof vi.fn>;
  const answer = async (range: EnergyHistoryPreset, value: unknown = DOCUMENTS[range]) => {
    const index = pending.findIndex((item) => item.range === range);
    const [item] = pending.splice(index, 1);
    await act(async () => item.resolve(value));
  };
  const fail = async (range: EnergyHistoryPreset, error: unknown) => {
    const index = pending.findIndex((item) => item.range === range);
    const [item] = pending.splice(index, 1);
    await act(async () => item.reject(error));
  };
  return { callApi, answer, fail, pending };
}

const immediateApi = () => vi.fn(async (message: Record<string, unknown>) => DOCUMENTS[message.range as EnergyHistoryPreset]) as unknown as EnergyCallApi & ReturnType<typeof vi.fn>;

const ranges = (callApi: ReturnType<typeof vi.fn>) => callApi.mock.calls.map(([message]) => (message as { range: string }).range);

describe('useEnergyHistory', () => {
  it('reads 24 hours first, through get_history only', async () => {
    const callApi = immediateApi();
    const { result } = renderHook(() => useEnergyHistory(callApi, { enabled: true, revision: 1 }));

    await waitFor(() => expect(result.current.current).toBe(true));
    expect(result.current.period).toBe('24h');
    expect(result.current.result).toEqual(DOCUMENTS['24h']);
    expect(callApi).toHaveBeenCalledWith({ type: 'domusos/energy/get_history', range: '24h' }, { reportError: false, throwOnError: true });
  });

  it.each(['7d', '30d', '12m'] as const)('asks the backend for the %s preset as it is', async (period) => {
    const callApi = immediateApi();
    const { result } = renderHook(() => useEnergyHistory(callApi, { enabled: true, revision: 1 }));
    await waitFor(() => expect(result.current.current).toBe(true));

    act(() => result.current.onPeriod(period));

    await waitFor(() => expect(result.current.result).toEqual(DOCUMENTS[period]));
    expect(ranges(callApi)).toEqual(['24h', period]);
    expect(result.current.result?.range.bucket).toBe(period === '12m' ? 'month' : 'day');
  });

  it('sends nothing until the page can read it', () => {
    const callApi = immediateApi();
    renderHook(() => useEnergyHistory(callApi, { enabled: false, revision: 1 }));
    renderHook(() => useEnergyHistory(undefined, { enabled: true, revision: 1 }));

    expect(callApi).not.toHaveBeenCalled();
  });

  it('never lets a slow answer replace the period chosen last', async () => {
    const api = deferredApi();
    const { result } = renderHook(() => useEnergyHistory(api.callApi, { enabled: true, revision: 1 }));

    act(() => result.current.onPeriod('7d'));
    act(() => result.current.onPeriod('30d'));
    await api.answer('30d');
    expect(result.current.result).toEqual(DOCUMENTS['30d']);
    await api.answer('7d');
    await api.answer('24h');

    expect(result.current.period).toBe('30d');
    expect(result.current.result).toEqual(DOCUMENTS['30d']);
    expect(result.current.current).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it('keeps the previous chart while the next period loads', async () => {
    const api = deferredApi();
    const { result } = renderHook(() => useEnergyHistory(api.callApi, { enabled: true, revision: 1 }));
    await api.answer('24h');

    act(() => result.current.onPeriod('7d'));

    expect(result.current.result).toEqual(DOCUMENTS['24h']);
    expect(result.current.current).toBe(false);
    expect(result.current.loading).toBe(true);
    await api.answer('7d');
    expect(result.current.result).toEqual(DOCUMENTS['7d']);
  });

  it('keeps answers in memory for the page and reads again after a profile change', async () => {
    const callApi = immediateApi();
    const { result, rerender } = renderHook(({ revision }) => useEnergyHistory(callApi, { enabled: true, revision }), { initialProps: { revision: 1 } });
    await waitFor(() => expect(result.current.current).toBe(true));

    act(() => result.current.onPeriod('7d'));
    await waitFor(() => expect(result.current.result).toEqual(DOCUMENTS['7d']));
    act(() => result.current.onPeriod('24h'));
    await waitFor(() => expect(result.current.result).toEqual(DOCUMENTS['24h']));
    expect(ranges(callApi)).toEqual(['24h', '7d']);

    rerender({ revision: 2 });
    await waitFor(() => expect(ranges(callApi)).toEqual(['24h', '7d', '24h']));
  });

  it('reports a failure and reads again on retry', async () => {
    const api = deferredApi();
    const { result } = renderHook(() => useEnergyHistory(api.callApi, { enabled: true, revision: 1 }));

    await api.fail('24h', { code: 'recorder_unavailable', message: 'starting' });
    expect(result.current.error?.code).toBe('recorder_unavailable');
    expect(result.current.loading).toBe(false);

    act(() => result.current.retry());
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    await api.answer('24h');
    expect(result.current.result).toEqual(DOCUMENTS['24h']);
    expect(api.callApi).toHaveBeenCalledTimes(2);
  });

  it('rejects an answer that is not a history document', async () => {
    const api = deferredApi();
    const { result } = renderHook(() => useEnergyHistory(api.callApi, { enabled: true, revision: 1 }));

    await api.answer('24h', { configured: true });

    expect(result.current.error?.code).toBe('invalid_response');
    expect(result.current.result).toBeNull();
  });

  it('never polls and ignores an answer after the page is closed', async () => {
    vi.useFakeTimers();
    const api = deferredApi();
    const { unmount } = renderHook(() => useEnergyHistory(api.callApi, { enabled: true, revision: 1 }));
    await act(async () => {
      vi.advanceTimersByTime(60 * 60_000);
    });
    expect(api.callApi).toHaveBeenCalledTimes(1);

    unmount();
    await api.answer('24h');
    expect(api.callApi).toHaveBeenCalledTimes(1);
  });
});
