import React from 'react';
import type { MockEntityStateMap } from '../../../types/ha';
import {
  getEnergyState,
  toEnergyCoreError,
  type EnergyCallApi,
  type EnergyCoreError,
  type EnergyState,
} from '../../../services/energyCoreClient';

export type EnergyPageContext = {
  callApi: EnergyCallApi;
  mode: 'real' | 'demo';
  connected: boolean;
  canManage: boolean;
  haStates: MockEntityStateMap;
};

export type EnergyCoreResource = {
  state: EnergyState | null;
  error: EnergyCoreError | null;
  loading: boolean;
  live: boolean;
  reload: () => Promise<void>;
};

const REFRESH_MS = 1500;
// While a value is stale, re-read the projection now and then: an integration
// that writes the same value again refreshes it on the server without any
// state change reaching the browser.
const STALE_RECHECK_MS = 60_000;
const MIN_FRESHNESS_DELAY_MS = 5_000;

/**
 * Delay until the projection should be read again because freshness can change:
 * the first fresh value that will turn stale, or the stale recheck. Computed on
 * the server's clock (observed_at), so browser clock skew does not matter.
 */
export function freshnessDelay(state: EnergyState | null) {
  if (!state?.configured) return null;
  const now = Date.parse(state.observed_at);
  let delay = Number.POSITIVE_INFINITY;
  for (const module of Object.values(state.modules)) {
    if (module?.freshness === 'stale') delay = Math.min(delay, STALE_RECHECK_MS);
    for (const quantity of Object.values(module?.quantities ?? {})) {
      if (quantity.freshness !== 'fresh' || !quantity.reported_at || !quantity.stale_after) continue;
      delay = Math.min(delay, Date.parse(quantity.reported_at) + quantity.stale_after * 1000 - now + 1000);
    }
  }
  return Number.isFinite(delay) && !Number.isNaN(now) ? Math.max(delay, MIN_FRESHNESS_DELAY_MS) : null;
}

export function boundEntityIds(state: EnergyState | null) {
  const ids = new Set<string>();
  for (const module of Object.values(state?.modules ?? {})) {
    for (const quantity of Object.values(module?.quantities ?? {})) {
      quantity.entity_ids.forEach((id) => ids.add(id));
    }
  }
  return [...ids].sort();
}

export function useEnergyCore(context: EnergyPageContext | undefined): EnergyCoreResource {
  const live = context?.mode === 'real' && context.connected;
  const callApi = context?.callApi;
  const [state, setState] = React.useState<EnergyState | null>(null);
  const [error, setError] = React.useState<EnergyCoreError | null>(null);
  const [loading, setLoading] = React.useState(false);
  const timerRef = React.useRef<number | null>(null);
  const requestRef = React.useRef(0);

  const reload = React.useCallback(async () => {
    if (!callApi) return;
    const request = ++requestRef.current;
    setLoading(true);
    try {
      const next = await getEnergyState(callApi);
      if (request === requestRef.current) {
        setState(next);
        setError(null);
      }
    } catch (failure) {
      if (request === requestRef.current) setError(toEnergyCoreError(failure));
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [callApi]);

  React.useEffect(() => {
    if (live) void reload();
  }, [live, reload]);

  // Bound sensors already stream through the Home Assistant connection: refresh
  // the backend projection when they change, at most once per REFRESH_MS.
  const haStates = context?.haStates;
  const signature = React.useMemo(
    () => boundEntityIds(state).map((id) => `${id}=${haStates?.[id]?.state ?? ''}`).join('|'),
    [haStates, state],
  );
  const lastSignatureRef = React.useRef('');
  React.useEffect(() => {
    if (!live || !state?.configured || timerRef.current !== null) return;
    if (!lastSignatureRef.current) {
      lastSignatureRef.current = signature;
      return;
    }
    if (signature === lastSignatureRef.current) return;
    lastSignatureRef.current = signature;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void reload();
    }, REFRESH_MS);
  }, [live, reload, signature, state?.configured]);

  React.useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  // No state change announces that a value went stale: read again when it can.
  React.useEffect(() => {
    const delay = live ? freshnessDelay(state) : null;
    if (delay === null) return undefined;
    const timer = window.setTimeout(() => void reload(), delay);
    return () => window.clearTimeout(timer);
  }, [live, reload, state]);

  // Demo never reaches Consumi (the workspace is gated), so no sample exists here.
  return { state: live ? state : null, error: live ? error : null, loading, live, reload };
}
