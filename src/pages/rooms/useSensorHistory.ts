import React from 'react';
import { parseHistoryPoints, type SeriesPoint } from '../../components/devices/model/sensor';
import type { RoomsApiCall } from '../../components/rooms/roomsDirectory';

/*
 * History of the sensors on screen, from Home Assistant's own history: the
 * last 24 hours for the cards, and the period chosen in a detail. Refreshed
 * every five minutes. What was read stays in memory while the app is open
 * (never stored): a room seen before shows its lines at once and refreshes
 * them quietly. The demo makes its own.
 */

const REFRESH_MS = 5 * 60_000;
/** A history read this recently is shown without asking again. */
const FRESH_MS = 60_000;

const remembered = new Map<string, { points: Record<string, SeriesPoint[]>; at: number }>();

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
  const cacheKey = `${key}|${hours}`;
  const [state, setState] = React.useState<{ key: string; points: Record<string, SeriesPoint[]>; loading: boolean }>(() => ({
    key: remembered.has(cacheKey) ? cacheKey : '',
    points: remembered.get(cacheKey)?.points ?? {},
    loading: false,
  }));

  React.useEffect(() => {
    const ids = key ? key.split(',') : [];
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
    const known = remembered.get(cacheKey);
    const load = async () => {
      setState((current) => ({
        key: cacheKey,
        points: current.key === cacheKey ? current.points : remembered.get(cacheKey)?.points ?? {},
        loading: true,
      }));
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
      const points = Object.fromEntries(ids.map((id) => [id, parseHistoryPoints(payload, id)]));
      if (payload) remembered.set(cacheKey, { points, at: Date.now() });
      setState({ key: cacheKey, points, loading: false });
    };
    if (known && Date.now() - known.at < FRESH_MS) {
      setState({ key: cacheKey, points: known.points, loading: false });
    } else {
      void load();
    }
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [cacheKey, demoSeries, hours, key, onCallApi]);

  // Until the first answer for these sensors, they are loading: also on the
  // first paint, before the effect has asked.
  const waiting = Boolean(key) && !demoSeries && Boolean(onCallApi) && state.key !== cacheKey && !remembered.has(cacheKey);
  return {
    points: state.key === cacheKey ? state.points : remembered.get(cacheKey)?.points ?? {},
    loading: state.loading || waiting,
  };
}
