import React from 'react';
import {
  fetchRegistrySnapshot,
  parseHaFloorList,
  type HaFloorEntry,
  type HaRegistryEntityEntry,
  type RoomsApiCall,
} from '../../components/rooms/roomsDirectory';

/*
 * Where each entity is, from the Home Assistant registry, refreshed every 30
 * seconds like the Rooms page, and the floors. Nothing without a connection.
 */
export function useRoomsRegistry(haConnected: boolean, onCallApi?: RoomsApiCall) {
  const [entityAreaByEntityId, setEntityAreaByEntityId] = React.useState<Record<string, string>>({});
  const [registryEntities, setRegistryEntities] = React.useState<HaRegistryEntityEntry[]>([]);
  const [floors, setFloors] = React.useState<HaFloorEntry[]>([]);

  const refresh = React.useCallback(async () => {
    if (!onCallApi) return;
    const snapshot = await fetchRegistrySnapshot(onCallApi);
    setEntityAreaByEntityId(snapshot.entityAreaByEntityId);
    setRegistryEntities(snapshot.registryEntities);
  }, [onCallApi]);

  React.useEffect(() => {
    if (!haConnected || !onCallApi) {
      setEntityAreaByEntityId({});
      setRegistryEntities([]);
      setFloors([]);
      return undefined;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const snapshot = await fetchRegistrySnapshot(onCallApi);
        if (cancelled) return;
        setEntityAreaByEntityId(snapshot.entityAreaByEntityId);
        setRegistryEntities(snapshot.registryEntities);
      } catch {
        if (!cancelled) {
          setEntityAreaByEntityId({});
          setRegistryEntities([]);
        }
      }
    };
    void load();
    void onCallApi({ type: 'config/floor_registry/list' }, { reportError: false })
      .then((payload) => {
        if (!cancelled) setFloors(parseHaFloorList(payload));
      })
      .catch(() => undefined);
    const interval = window.setInterval(() => void load(), 30000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [haConnected, onCallApi]);

  const registryEntityById = React.useMemo(
    () => new Map(registryEntities.map((entry) => [entry.entityId, entry])),
    [registryEntities],
  );

  return { entityAreaByEntityId, setEntityAreaByEntityId, registryEntityById, floors, setFloors, refresh };
}
