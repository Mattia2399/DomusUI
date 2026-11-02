import { useEffect, useState } from 'react';
import { parseHaDeviceRegistry, parseHaEntityRegistry, type HaEntityRegistryEntry } from '../../../services/haRegistryPresentation';
import { parseStateHistory, type StateChange } from '../model/security';
import { parseHistoryPoints, type SeriesPoint } from '../model/sensor';
import { parseStatistics, statisticsQuery, type SensorPanelPeriod, type StatisticPoint } from '../model/sensorPanel';
import { usePanelServices, type PanelApiCall } from './panelServicesContext';

/* What the panels read from Home Assistant beyond the states the Home already has. */

export type PanelRegistry = {
  entityAreaByEntityId: Record<string, string>;
  registryEntities: HaEntityRegistryEntry[];
  areaNames: Record<string, string>;
};

const registries = new WeakMap<PanelApiCall, Promise<PanelRegistry | null>>();

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

function loadRegistry(callApi: PanelApiCall) {
  const known = registries.get(callApi);
  if (known) return known;
  const loading = fetchRegistry(callApi).catch(() => null);
  registries.set(callApi, loading);
  return loading;
}

/** Areas and devices of the entities; null until they arrive, or for who may not read them. */
export function useEntityRegistry() {
  const callApi = usePanelServices()?.callApi;
  const [registry, setRegistry] = useState<PanelRegistry | null>(null);

  useEffect(() => {
    if (!callApi) return undefined;
    let alive = true;
    void loadRegistry(callApi).then((snapshot) => {
      if (alive) setRegistry(snapshot);
    });
    return () => {
      alive = false;
    };
  }, [callApi]);

  return registry;
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
export function useSensorSeries(entityId: string, period: SensorPanelPeriod, fallback: SeriesPoint[]): SensorSeries {
  const callApi = usePanelServices()?.callApi;
  const [series, setSeries] = useState<SensorSeries>({ points: fallback, changes: [], rows: [], loading: Boolean(callApi), statisticsMissing: false });

  useEffect(() => {
    if (!callApi) return undefined;
    let alive = true;
    setSeries((current) => ({ ...current, loading: true }));
    const now = Date.now();
    const read = async () => {
      if (period !== '24h') {
        const rows = parseStatistics(await callApi(statisticsQuery(entityId, period, now), { reportError: false }), entityId);
        if (alive) setSeries((current) => ({ ...current, rows, loading: false, statisticsMissing: rows.length === 0 }));
        return;
      }
      const payload = await callApi({
        type: 'history/history_during_period',
        start_time: new Date(now - 24 * 3_600_000).toISOString(),
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
  }, [callApi, entityId, period]);

  return series;
}
