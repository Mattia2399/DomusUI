import { useEffect, useMemo, useState } from 'react';
import {
  buildCalendarSubscribeMessage,
  parseCalendarAgendaPayload,
  type CalendarAgendaEvent,
} from '../services/calendarClient';
import type { MockEntityStateMap } from '../types/ha';

type SubscribeApi = <TEvent = unknown>(
  message: Record<string, unknown>,
  callback: (event: TEvent) => void,
) => Promise<() => void>;

type Options = {
  entityIds: string[];
  enabled: boolean;
  isDemo: boolean;
  demoStates: MockEntityStateMap;
  subscribeApi: SubscribeApi;
};

function demoEvents(entityId: string, states: MockEntityStateMap) {
  const attributes = states[entityId]?.rawAttributes;
  return attributes ? parseCalendarAgendaPayload({ events: [attributes] }) : [];
}

export function useCalendarCardAgendas({ entityIds, enabled, isDemo, demoStates, subscribeApi }: Options) {
  const entityKey = entityIds.join('|');
  const [eventsByEntity, setEventsByEntity] = useState<Record<string, CalendarAgendaEvent[]>>({});
  const demoEventsByEntity = useMemo(
    () => Object.fromEntries(entityIds.map((entityId) => [entityId, demoEvents(entityId, demoStates)])),
    [demoStates, entityKey],
  );

  useEffect(() => {
    if (!enabled || entityIds.length === 0 || isDemo) {
      setEventsByEntity({});
      return;
    }

    let cancelled = false;
    const unsubscribers: Array<() => void> = [];
    setEventsByEntity({});
    entityIds.forEach((entityId) => {
      void subscribeApi(buildCalendarSubscribeMessage(entityId), (payload) => {
        if (cancelled) return;
        setEventsByEntity((current) => ({ ...current, [entityId]: parseCalendarAgendaPayload(payload) }));
      }).then((unsubscribe) => {
        if (cancelled) unsubscribe();
        else unsubscribers.push(unsubscribe);
      }).catch(() => {
        if (!cancelled) setEventsByEntity((current) => ({ ...current, [entityId]: [] }));
      });
    });
    return () => {
      cancelled = true;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  // entityKey is the stable subscription identity; entityIds is derived from it by the caller.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, entityKey, isDemo, subscribeApi]);

  return isDemo && enabled ? demoEventsByEntity : eventsByEntity;
}
