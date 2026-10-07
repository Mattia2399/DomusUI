import React from 'react';
import {
  getEnergyHistory,
  toEnergyCoreError,
  type EnergyCallApi,
  type EnergyCoreError,
  type EnergyHistoryPreset,
  type EnergyHistoryResult,
} from '../../../services/energyCoreClient';

/*
 * Energy history of the Energy page, apart from the realtime projection: a
 * power change never reads the Recorder again. It is read when the page opens,
 * when the period changes and on a manual retry; there is no polling. Answers
 * stay in memory for the life of the page, per profile revision, so going back
 * to a period already seen sends nothing; nothing is stored in the browser.
 */

export type EnergyHistoryView = {
  period: EnergyHistoryPreset;
  onPeriod: (period: EnergyHistoryPreset) => void;
  /** The answer for `period`, or the previous one while `period` is loading. */
  result: EnergyHistoryResult | null;
  /** `result` belongs to `period`. */
  current: boolean;
  loading: boolean;
  error: EnergyCoreError | null;
  retry: () => void;
};

type Shown = { period: EnergyHistoryPreset; result: EnergyHistoryResult };

export function useEnergyHistory(
  callApi: EnergyCallApi | undefined,
  { enabled, revision }: { enabled: boolean; revision: number | null },
): EnergyHistoryView {
  const [period, setPeriod] = React.useState<EnergyHistoryPreset>('24h');
  const [shown, setShown] = React.useState<Shown | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<EnergyCoreError | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  const cacheRef = React.useRef(new Map<string, EnergyHistoryResult>());
  const pendingRef = React.useRef(new Map<string, Promise<EnergyHistoryResult>>());
  const revisionRef = React.useRef(revision);
  const requestRef = React.useRef(0);

  // A saved profile can change every series: answers of an older revision are dropped.
  if (revisionRef.current !== revision) {
    revisionRef.current = revision;
    cacheRef.current.clear();
  }

  React.useEffect(() => {
    if (!enabled || !callApi) return undefined;
    const key = `${revision}:${period}`;
    const cached = cacheRef.current.get(key);
    const request = ++requestRef.current;
    if (cached) {
      setShown({ period, result: cached });
      setError(null);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    setError(null);
    // The same period asked again while it is loading shares the request.
    let pending = pendingRef.current.get(key);
    if (!pending) {
      pending = getEnergyHistory(callApi, period);
      pendingRef.current.set(key, pending);
      const settle = () => pendingRef.current.delete(key);
      pending.then(settle, settle);
    }
    pending.then(
      (result) => {
        if (revisionRef.current === revision) cacheRef.current.set(key, result);
        // A slower answer for a period the user already left never replaces the current one.
        if (request !== requestRef.current) return;
        setShown({ period, result });
        setLoading(false);
      },
      (failure: unknown) => {
        if (request !== requestRef.current) return;
        setError(toEnergyCoreError(failure));
        setLoading(false);
      },
    );
    return () => {
      // Unmounted, disabled or superseded: this answer is no longer awaited.
      if (request === requestRef.current) requestRef.current += 1;
    };
  }, [attempt, callApi, enabled, period, revision]);

  const retry = React.useCallback(() => {
    cacheRef.current.delete(`${revisionRef.current}:${period}`);
    setAttempt((value) => value + 1);
  }, [period]);

  return {
    period,
    onPeriod: setPeriod,
    result: shown?.result ?? null,
    current: shown?.period === period && !loading,
    loading,
    error,
    retry,
  };
}
