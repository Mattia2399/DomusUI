import React from 'react';
import type { MockEntityStateMap } from '../../../types/ha';
import {
  getEnergyState,
  toEnergyCoreError,
  type EnergyCallApi,
  type EnergyCoreError,
  type EnergyQuantity,
  type EnergyState,
} from '../../../services/energyCoreClient';

export type EnergyPageContext = {
  callApi: EnergyCallApi;
  mode: 'real' | 'demo';
  connected: boolean;
  canManage: boolean;
  haStates: MockEntityStateMap;
};

const REFRESH_MS = 1500;

const demoQuantity = (value: number, unit = 'W', source: 'measured' | 'derived' = 'measured'): EnergyQuantity => ({
  status: 'ok', value, unit, source, entity_ids: [], reason: null,
});

/** Clearly labelled sample used only by the isolated Demo experience. */
export const DEMO_ENERGY_STATE: EnergyState = {
  configured: true,
  load_error: false,
  available: true,
  profile_revision: 0,
  observed_at: '',
  modules: {
    grid: { status: 'online', complete: true, sign_convention: 'positive_import', quantities: { net_power: demoQuantity(-650) } },
    solar: { status: 'online', complete: true, sign_convention: null, quantities: { production_power: demoQuantity(4200) } },
    battery: {
      status: 'online',
      complete: true,
      sign_convention: 'positive_discharge',
      quantities: { state_of_charge: demoQuantity(64, '%'), net_power: demoQuantity(-1100) },
    },
  },
  absent_modules: ['home', 'wallbox'],
  offline_modules: [],
  home_consumption: demoQuantity(2450, 'W', 'derived'),
};

export function boundEntityIds(state: EnergyState | null) {
  const ids = new Set<string>();
  for (const module of Object.values(state?.modules ?? {})) {
    for (const quantity of Object.values(module?.quantities ?? {})) {
      quantity.entity_ids.forEach((id) => ids.add(id));
    }
  }
  return [...ids].sort();
}

export function useEnergyCore(context: EnergyPageContext | undefined) {
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

  if (context?.mode === 'demo') {
    return { state: DEMO_ENERGY_STATE, error: null, loading: false, live: false, demo: true, reload };
  }
  return { state: live ? state : null, error: live ? error : null, loading, live, demo: false, reload };
}
