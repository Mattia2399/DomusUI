import React from 'react';
import type { RoomsApiCall } from '../../components/rooms/roomsDirectory';
import { fetchHouseSnapshot, type HouseSnapshot, type HouseTopology } from '../../services/houseCore';
import type { MockEntityStateMap } from '../../types/ha';

/** Runtime readings come from House; the live HA map only signals when to refresh. */
export function useHouseEnvironmentSnapshot(
  connected: boolean, callApi: RoomsApiCall | undefined, topology: HouseTopology | null,
  states: MockEntityStateMap,
): HouseSnapshot | null {
  const [snapshot, setSnapshot] = React.useState<HouseSnapshot | null>(null);
  const request = React.useRef(0);
  const previousStates = React.useRef('');
  const refresh = React.useCallback(async () => {
    if (!connected || !callApi || !topology) return;
    const serial = ++request.current;
    try {
      const next = await fetchHouseSnapshot(callApi);
      if (serial === request.current && next.topologyFingerprint === topology.topologyFingerprint) setSnapshot(next);
    } catch {
      if (serial === request.current) setSnapshot(null);
    }
  }, [connected, callApi, topology]);

  React.useEffect(() => {
    request.current += 1;
    setSnapshot(null);
    previousStates.current = '';
    void refresh();
    return () => { request.current += 1; };
  }, [refresh]);

  React.useEffect(() => {
    if (!snapshot || !connected) return;
    const selected = snapshot.rooms.flatMap((room) => [room.temperature.selectedEntityId, room.humidity.selectedEntityId])
      .filter((id): id is string => Boolean(id));
    const signature = JSON.stringify(selected.map((id) => [id, states[id]?.state, states[id]?.rawAttributes?.unit_of_measurement]));
    if (previousStates.current && previousStates.current !== signature) void refresh();
    previousStates.current = signature;
  }, [connected, refresh, snapshot, states]);

  return snapshot;
}
