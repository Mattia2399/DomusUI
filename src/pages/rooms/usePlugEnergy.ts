import React from 'react';
import {
  buildPlugEnergy,
  readPlugTariff,
  statisticRows,
  statisticsRequest,
  type EnergySource,
  type PlugEnergy,
  type PlugTariff,
} from '../../components/devices/model/plugEnergy';
import type { RoomsApiCall } from '../../components/rooms/roomsDirectory';

/*
 * The consumption of the plug whose panel is open, from Home Assistant's
 * statistics, and the tariff of the Energy page for its cost. Read when the
 * panel opens and every five minutes while it stays open; nothing is stored.
 */

const REFRESH_MS = 5 * 60_000;
const ENERGY_STATE = 'domusos/energy/get_state';

export type PlugEnergyState = {
  energy: PlugEnergy | null;
  /** 'missing' when the Energy page has no tariff yet; 'unknown' without the integration. */
  tariff: 'set' | 'missing' | 'unknown';
};

const EMPTY: PlugEnergyState = { energy: null, tariff: 'unknown' };

export function usePlugEnergy({
  source,
  onCallApi,
  demoEnergy,
}: {
  source: EnergySource | null;
  onCallApi?: RoomsApiCall;
  /** In the demo: the consumption of a plug, made up. */
  demoEnergy?: (statisticId: string) => PlugEnergy;
}): PlugEnergyState {
  const id = source?.statisticId ?? '';
  const kind = source?.kind ?? 'energy';
  const [state, setState] = React.useState<PlugEnergyState & { id: string }>({ ...EMPTY, id: '' });

  React.useEffect(() => {
    if (!id) return undefined;
    if (demoEnergy) {
      setState({ id, energy: demoEnergy(id), tariff: 'set' });
      return undefined;
    }
    if (!onCallApi) return undefined;
    let cancelled = false;
    const meter: EnergySource = { statisticId: id, kind };
    const load = async () => {
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      // Five-minute rows from the hour before: it may not be compiled yet.
      const recent = new Date(Math.max(midnight.getTime(), now.getTime() - 3_600_000));
      recent.setMinutes(0, 0, 0);
      const ask = (message: Record<string, unknown>) => onCallApi(message, { reportError: false }).catch(() => null);
      const [hours, fiveMinutes, days, energyState] = await Promise.all([
        ask(statisticsRequest(meter, 'hour', midnight, now)),
        ask(statisticsRequest(meter, '5minute', recent, now)),
        monthStart < midnight ? ask(statisticsRequest(meter, 'day', monthStart, midnight)) : Promise.resolve({ [id]: [] }),
        ask({ type: ENERGY_STATE }),
      ]);
      if (cancelled) return;
      const tariff: PlugTariff | null | undefined = readPlugTariff(energyState);
      const hourRows = statisticRows(hours, id);
      const fiveMinuteRows = statisticRows(fiveMinutes, id);
      // A meter without statistics shows only its power now.
      const energy =
        hours === null || (hourRows.length === 0 && fiveMinuteRows.length === 0)
          ? null
          : buildPlugEnergy({
              kind,
              hourRows,
              fiveMinuteRows,
              dayRows: days === null ? null : statisticRows(days, id),
              tariff: tariff ?? null,
              now,
            });
      setState({ id, energy, tariff: tariff ? 'set' : tariff === null ? 'missing' : 'unknown' });
    };
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [demoEnergy, id, kind, onCallApi]);

  return state.id === id ? { energy: state.energy, tariff: state.tariff } : EMPTY;
}
