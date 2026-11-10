import React from 'react';
import type { HaFloorEntry, RoomsApiCall } from '../../components/rooms/roomsDirectory';
import { fetchHouseTopology, projectHouseForRooms, type HouseTopology } from '../../services/houseCore';

export type RoomsTopologyStatus = 'disconnected' | 'loading' | 'ready' | 'unavailable' | 'unauthorized';

/** House is the only connected structural source. HA states remain live elsewhere. */
export function useRoomsRegistry(haConnected: boolean, onCallApi?: RoomsApiCall, enabled = true) {
  const [topology, setTopology] = React.useState<HouseTopology | null>(null);
  const [status, setStatus] = React.useState<RoomsTopologyStatus>(haConnected && enabled ? 'loading' : 'disconnected');
  const [optimisticFloors, setOptimisticFloors] = React.useState<HaFloorEntry[] | null>(null);
  const requestSeq = React.useRef(0);
  const topologyRef = React.useRef<HouseTopology | null>(null);

  const refresh = React.useCallback(async (): Promise<boolean> => {
    if (!haConnected || !enabled || !onCallApi) return false;
    const request = ++requestSeq.current;
    try {
      const next = await fetchHouseTopology(onCallApi);
      if (request !== requestSeq.current) return false;
      if (topologyRef.current?.topologyFingerprint !== next.topologyFingerprint) {
        topologyRef.current = next;
        setTopology(next);
      }
      const authoritativeFloors = projectHouseForRooms(next).floors;
      setOptimisticFloors((current) => current && current.length === authoritativeFloors.length &&
        current.every((floor, index) => floor.floor_id === authoritativeFloors[index].floor_id &&
          floor.name === authoritativeFloors[index].name && (floor.level ?? null) === (authoritativeFloors[index].level ?? null))
        ? null : current);
      setStatus('ready');
      return true;
    } catch (error) {
      if (request !== requestSeq.current) return false;
      topologyRef.current = null;
      setTopology(null);
      setOptimisticFloors(null);
      const reason = error instanceof Error ? error.message.toLowerCase() : '';
      setStatus(reason.includes('access_denied') || reason.includes('unauthorized') ? 'unauthorized' : 'unavailable');
      return false;
    }
  }, [enabled, haConnected, onCallApi]);

  React.useEffect(() => {
    if (!haConnected || !enabled || !onCallApi) {
      requestSeq.current += 1;
      topologyRef.current = null;
      setTopology(null);
      setOptimisticFloors(null);
      setStatus('disconnected');
      return undefined;
    }
    setStatus('loading');
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => {
      requestSeq.current += 1;
      window.clearInterval(timer);
    };
  }, [enabled, haConnected, onCallApi, refresh]);

  const projection = React.useMemo(() => topology ? projectHouseForRooms(topology) : null, [topology]);
  const registryEntityById = React.useMemo(
    () => new Map(projection?.registryEntities.map((entry) => [entry.entityId, entry]) ?? []),
    [projection],
  );
  const setFloors: React.Dispatch<React.SetStateAction<HaFloorEntry[]>> = React.useCallback((change) => {
    setOptimisticFloors((current) => {
      const base = current ?? (topologyRef.current ? projectHouseForRooms(topologyRef.current).floors : []);
      return typeof change === 'function' ? change(base) : change;
    });
  }, []);

  return {
    status, topology, areas: projection?.areas ?? [], floors: optimisticFloors ?? projection?.floors ?? [], setFloors,
    entityAreaByEntityId: projection?.entityAreaByEntityId ?? {}, registryEntityById,
    visibleEntityIds: projection?.visibleEntityIds ?? new Set<string>(),
    unassignedEntityIds: projection?.unassignedEntityIds ?? new Set<string>(),
    unassignedDeviceIds: projection?.unassignedDeviceIds ?? new Set<string>(),
    refresh,
  };
}
