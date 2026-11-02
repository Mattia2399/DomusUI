import { useEffect, useState } from 'react';
import { parseHaDeviceRegistry, parseHaEntityRegistry, type HaEntityRegistryEntry } from '../../../services/haRegistryPresentation';
import { usePanelServices, type PanelApiCall } from './panelServicesContext';

/* What the panels read from Home Assistant beyond the states the Home already has. */

export type PanelRegistry = {
  entityAreaByEntityId: Record<string, string>;
  registryEntities: HaEntityRegistryEntry[];
};

const registries = new WeakMap<PanelApiCall, Promise<PanelRegistry | null>>();

async function fetchRegistry(callApi: PanelApiCall): Promise<PanelRegistry | null> {
  const [entityPayload, devicePayload] = await Promise.all([
    callApi({ type: 'config/entity_registry/list' }, { reportError: false }),
    callApi({ type: 'config/device_registry/list' }, { reportError: false }),
  ]);
  const registryEntities = parseHaEntityRegistry(entityPayload);
  if (registryEntities.length === 0) return null;
  const deviceArea = new Map(parseHaDeviceRegistry(devicePayload).map((device) => [device.id, device.areaId]));
  const entityAreaByEntityId: Record<string, string> = {};
  registryEntities.forEach((entry) => {
    const area = entry.areaId ?? (entry.deviceId ? deviceArea.get(entry.deviceId) : undefined);
    if (area) entityAreaByEntityId[entry.entityId] = area;
  });
  return { entityAreaByEntityId, registryEntities };
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
