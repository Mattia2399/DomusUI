import React from 'react';
import { parseHistoryPoints, type SeriesPoint } from '../../components/devices/model/sensor';
import type { RoomsApiCall } from '../../components/rooms/roomsDirectory';

/*
 * History of the sensors on screen, from Home Assistant's own history: the
 * last 24 hours for the cards, and the period chosen in a detail. Refreshed
 * every five minutes; nothing is stored. The demo makes its own.
 */

const REFRESH_MS = 5 * 60_000;

export function useSensorHistory({
  entityIds,
  hours,
  onCallApi,
  demoSeries,
}: {
  entityIds: string[];
  hours: number;
  onCallApi?: RoomsApiCall;
  /** In the demo: the series of a sensor, made up. */
  demoSeries?: (entityId: string, hours: number) => SeriesPoint[];
}) {
  const key = [...entityIds].sort().join(',');
  const [state, setState] = React.useState<{ key: string; points: Record<string, SeriesPoint[]>; loading: boolean }>({
    key: '',
    points: {},
    loading: false,
  });

  React.useEffect(() => {
    const ids = key ? key.split(',') : [];
    const cacheKey = `${key}|${hours}`;
    if (ids.length === 0) {
      setState({ key: cacheKey, points: {}, loading: false });
      return undefined;
    }
    if (demoSeries) {
      setState({ key: cacheKey, points: Object.fromEntries(ids.map((id) => [id, demoSeries(id, hours)])), loading: false });
      return undefined;
    }
    if (!onCallApi) return undefined;
    let cancelled = false;
    const load = async () => {
      setState((current) => ({ key: cacheKey, points: current.key === cacheKey ? current.points : {}, loading: true }));
      const end = new Date();
      const start = new Date(end.getTime() - hours * 3_600_000);
      const payload = await onCallApi(
        {
          type: 'history/history_during_period',
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          entity_ids: ids,
          include_start_time_state: true,
          significant_changes_only: false,
          minimal_response: true,
          no_attributes: true,
        },
        { reportError: false },
      ).catch(() => null);
      if (cancelled) return;
      setState({ key: cacheKey, points: Object.fromEntries(ids.map((id) => [id, parseHistoryPoints(payload, id)])), loading: false });
    };
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [demoSeries, hours, key, onCallApi]);

  return state;
}
