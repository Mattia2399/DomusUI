import { useEffect, useState } from 'react';
import { parseHaDeviceRegistry, parseHaEntityRegistry, type HaEntityRegistryEntry } from '../../../services/haRegistryPresentation';
import { fetchDashboardHouseContext, type DashboardHouseContext } from '../../../services/dashboardHouseContext';
import { parseStateHistory, type StateChange } from '../model/security';
import { parseHistoryPoints, type SeriesPoint } from '../model/sensor';
import { parseStatistics, statisticsQuery, type SensorPanelPeriod, type StatisticPoint } from '../model/sensorPanel';
import {
  buildPlugEnergy,
  readPlugTariff,
  statisticRows,
  statisticsRequest,
  type EnergySource,
  type PlugEnergy,
  type PlugTariff,
} from '../model/plugEnergy';
import { usePanelServices, type PanelApiCall } from './panelServicesContext';

/* What the panels read from Home Assistant beyond the states the Home already has. */

export type PanelRegistry = {
  entityAreaByEntityId: Record<string, string>;
  registryEntities: HaEntityRegistryEntry[];
  areaNames: Record<string, string>;
};

/** Compatibility path for Alarm/Security only. It is not Home's room authority. */
async function fetchRegistry(callApi: PanelApiCall): Promise<PanelRegistry | null> {
  const [entityPayload, devicePayload, areaPayload] = await Promise.all([
    callApi({ type: 'config/entity_registry/list' }, { reportError: false }),
    callApi({ type: 'config/device_registry/list' }, { reportError: false }),
    callApi<Array<{ area_id?: string; name?: string }>>({ type: 'config/area_registry/list' }, { reportError: false }),
  ]);
  const registryEntities = parseHaEntityRegistry(entityPayload);
  if (registryEntities.length === 0) return null;
  const deviceArea = new Map(parseHaDeviceRegistry(devicePayload).map((device) => [device.id, device.areaId]));
  const entityAreaByEntityId: Record<string, string> = {};
  registryEntities.forEach((entry) => {
    const area = entry.areaId ?? (entry.deviceId ? deviceArea.get(entry.deviceId) : undefined);
    if (area) entityAreaByEntityId[entry.entityId] = area;
  });
  const areaNames: Record<string, string> = {};
  (Array.isArray(areaPayload) ? areaPayload : []).forEach((area) => {
    if (area.area_id && area.name) areaNames[area.area_id] = area.name;
  });
  return { entityAreaByEntityId, registryEntities, areaNames };
}

/** Only the Security compatibility path may request the legacy area map. */
export function useEntityRegistry(enabled = true) {
  const callApi = usePanelServices()?.callApi;
  const [registry, setRegistry] = useState<PanelRegistry | null>(null);

  useEffect(() => {
    if (!callApi || !enabled) {
      setRegistry(null);
      return undefined;
    }
    let alive = true;
    void fetchRegistry(callApi).catch(() => null).then((snapshot) => {
      if (alive) setRegistry(snapshot);
    });
    return () => {
      alive = false;
    };
  }, [callApi, enabled]);

  return registry;
}

const technicalEntities = new WeakMap<PanelApiCall, Promise<HaEntityRegistryEntry[]>>();

/** Technical same-device metadata; never computes room membership. */
export function usePanelTechnicalEntities() {
  const callApi = usePanelServices()?.callApi;
  const [entities, setEntities] = useState<HaEntityRegistryEntry[]>([]);
  useEffect(() => {
    if (!callApi) return undefined;
    let alive = true;
    let request = technicalEntities.get(callApi);
    if (!request) {
      request = callApi({ type: 'config/entity_registry/list' }, { reportError: false })
        .then(parseHaEntityRegistry).catch(() => []);
      technicalEntities.set(callApi, request);
    }
    void request.then((value) => { if (alive) setEntities(value); });
    return () => { alive = false; };
  }, [callApi]);
  return entities;
}

/** House owns every normal panel room relationship; polling is bounded recovery. */
export function usePanelHouseContext(enabled = true): DashboardHouseContext | null {
  const services = usePanelServices();
  const callApi = services?.callApi;
  const connected = enabled && (services?.houseConnected ?? Boolean(callApi));
  const [snapshot, setSnapshot] = useState<{ callApi: PanelApiCall; value: DashboardHouseContext } | null>(null);
  useEffect(() => {
    if (!callApi || !connected) {
      setSnapshot(null);
      return undefined;
    }
    setSnapshot(null);
    let active = true;
    let request = 0;
    const refresh = async () => {
      const serial = ++request;
      try {
        const next = await fetchDashboardHouseContext(callApi);
        if (!active || serial !== request) return;
        setSnapshot((current) => current?.callApi === callApi && current.value.topologyRevision === next.topologyRevision &&
          JSON.stringify(current.value) === JSON.stringify(next) ? current : { callApi, value: next });
      } catch {
        if (active && serial === request) setSnapshot(null);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    const onFocus = () => void refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      request += 1;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [callApi, connected]);
  return connected && snapshot?.callApi === callApi ? snapshot.value : null;
}

export type SensorSeries = {
  points: SeriesPoint[];
  changes: StateChange[];
  rows: StatisticPoint[];
  loading: boolean;
  /** The recorder has nothing for this sensor: only the last 24 hours can be read. */
  statisticsMissing: boolean;
};

/** The history of the last 24 hours, or the statistics of a longer period. */
export function useSensorSeries(
  entityId: string,
  period: SensorPanelPeriod,
  fallback: SeriesPoint[],
  options: { historyPeriods?: boolean } = {},
): SensorSeries {
  const callApi = usePanelServices()?.callApi;
  const [series, setSeries] = useState<SensorSeries>({ points: fallback, changes: [], rows: [], loading: Boolean(callApi), statisticsMissing: false });

  useEffect(() => {
    if (!callApi) return undefined;
    let alive = true;
    setSeries((current) => ({ ...current, loading: true }));
    const now = Date.now();
    const read = async () => {
      if (period !== '24h' && !options.historyPeriods) {
        const rows = parseStatistics(await callApi(statisticsQuery(entityId, period, now), { reportError: false }), entityId);
        if (alive) setSeries((current) => ({ ...current, rows, loading: false, statisticsMissing: rows.length === 0 }));
        return;
      }
      const historyDays = period === '7d' ? 7 : 1;
      const payload = await callApi({
        type: 'history/history_during_period',
        start_time: new Date(now - historyDays * 24 * 3_600_000).toISOString(),
        end_time: new Date(now).toISOString(),
        entity_ids: [entityId],
        include_start_time_state: true,
        significant_changes_only: false,
        minimal_response: true,
        no_attributes: true,
      }, { reportError: false });
      if (!alive) return;
      const points = parseHistoryPoints(payload, entityId);
      setSeries((current) => ({
        ...current,
        points: points.length > 0 ? points : fallback,
        changes: parseStateHistory(payload, entityId),
        rows: [],
        loading: false,
      }));
    };
    void read().catch(() => {
      if (alive) setSeries((current) => ({ ...current, loading: false }));
    });
    return () => {
      alive = false;
    };
    // The fallback is a copy of what the card already had: it does not ask again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callApi, entityId, options.historyPeriods, period]);

  // What a page already had stands in until, or instead of, what Home Assistant says.
  return callApi && series.points.length > 0 ? series : { ...series, points: fallback };
}

/** The state changes of a lock. It is read-only and starts only for a real id. */
export function useSecurityHistory(entityId: string | null) {
  const callApi = usePanelServices()?.callApi;
  const [history, setHistory] = useState<StateChange[]>([]);
  useEffect(() => {
    if (!callApi || !entityId) {
      setHistory([]);
      return undefined;
    }
    let alive = true;
    const now = Date.now();
    void callApi({
      type: 'history/history_during_period',
      start_time: new Date(now - 24 * 3_600_000).toISOString(),
      end_time: new Date(now).toISOString(),
      entity_ids: [entityId],
      include_start_time_state: true,
      significant_changes_only: false,
      minimal_response: true,
      no_attributes: true,
    }, { reportError: false }).then((payload) => {
      if (alive) setHistory(parseStateHistory(payload, entityId));
    }).catch(() => {
      if (alive) setHistory([]);
    });
    return () => { alive = false; };
  }, [callApi, entityId]);
  return history;
}

export type PanelPlugEnergyState = { energy: PlugEnergy | null; tariff: 'set' | 'missing' | 'unknown' };
const EMPTY_ENERGY: PanelPlugEnergyState = { energy: null, tariff: 'unknown' };

/** Actual recorder statistics for a Home plug; nothing is synthesized or stored. */
export function usePanelPlugEnergy(source: EnergySource | null): PanelPlugEnergyState {
  const callApi = usePanelServices()?.callApi;
  const id = source?.statisticId ?? '';
  const kind = source?.kind ?? 'energy';
  const [state, setState] = useState<PanelPlugEnergyState & { id: string }>({ ...EMPTY_ENERGY, id: '' });
  useEffect(() => {
    if (!callApi || !id) return undefined;
    let alive = true;
    const load = async () => {
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const recent = new Date(Math.max(midnight.getTime(), now.getTime() - 3_600_000));
      recent.setMinutes(0, 0, 0);
      const meter: EnergySource = { statisticId: id, kind };
      const ask = (message: Record<string, unknown>) => callApi(message, { reportError: false }).catch(() => null);
      const [hours, fiveMinutes, days, energyState] = await Promise.all([
        ask(statisticsRequest(meter, 'hour', midnight, now)),
        ask(statisticsRequest(meter, '5minute', recent, now)),
        monthStart < midnight ? ask(statisticsRequest(meter, 'day', monthStart, midnight)) : Promise.resolve({ [id]: [] }),
        ask({ type: 'domusos/energy/get_state' }),
      ]);
      if (!alive) return;
      const tariff: PlugTariff | null | undefined = readPlugTariff(energyState);
      const hourRows = statisticRows(hours, id);
      const recentRows = statisticRows(fiveMinutes, id);
      const energy = hours === null || (hourRows.length === 0 && recentRows.length === 0)
        ? null
        : buildPlugEnergy({
            kind,
            hourRows,
            fiveMinuteRows: recentRows,
            dayRows: days === null ? null : statisticRows(days, id),
            tariff: tariff ?? null,
            now,
          });
      setState({ id, energy, tariff: tariff ? 'set' : tariff === null ? 'missing' : 'unknown' });
    };
    void load();
    const timer = window.setInterval(() => void load(), 5 * 60_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [callApi, id, kind]);
  return state.id === id ? { energy: state.energy, tariff: state.tariff } : EMPTY_ENERGY;
}
