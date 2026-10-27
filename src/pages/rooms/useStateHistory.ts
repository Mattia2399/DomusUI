import React from 'react';
import { parseStateHistory, type StateChange } from '../../components/devices/model/security';
import type { RoomsApiCall } from '../../components/rooms/roomsDirectory';

/*
 * The state changes of the last day of one device, for the detail of a
 * security device, from Home Assistant's own history. Read again when the
 * device changes; nothing is stored. The demo makes its own.
 */

const DAY_MS = 24 * 3_600_000;

export function useStateHistory({
  entityId,
  changedAt,
  onCallApi,
  demoHistory,
}: {
  entityId: string | null;
  /** When the device last changed: a new change reads the history again. */
  changedAt?: number | null;
  onCallApi?: RoomsApiCall;
  /** In the demo: the day of a device, made up. */
  demoHistory?: (entityId: string) => StateChange[];
}) {
  const [state, setState] = React.useState<{ entityId: string | null; changes: StateChange[] }>({ entityId: null, changes: [] });

  React.useEffect(() => {
    if (!entityId) {
      setState({ entityId: null, changes: [] });
      return undefined;
    }
    if (demoHistory) {
      setState({ entityId, changes: demoHistory(entityId) });
      return undefined;
    }
    if (!onCallApi) return undefined;
    let cancelled = false;
    const end = new Date();
    void onCallApi(
      {
        type: 'history/history_during_period',
        start_time: new Date(end.getTime() - DAY_MS).toISOString(),
        end_time: end.toISOString(),
        entity_ids: [entityId],
        include_start_time_state: true,
        significant_changes_only: false,
        minimal_response: true,
        no_attributes: true,
      },
      { reportError: false },
    )
      .catch(() => null)
      .then((payload) => {
        if (!cancelled) setState({ entityId, changes: parseStateHistory(payload, entityId) });
      });
    return () => {
      cancelled = true;
    };
  }, [changedAt, demoHistory, entityId, onCallApi]);

  return state.entityId === entityId ? state.changes : [];
}
