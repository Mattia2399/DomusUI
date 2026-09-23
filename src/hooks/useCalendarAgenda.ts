import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildCalendarCreateMessage,
  buildCalendarDeleteMessage,
  buildCalendarSubscribeMessage,
  buildCalendarUpdateMessage,
  parseCalendarAgendaPayload,
  type CalendarAgendaEvent,
  type CalendarEventDraft,
} from '../services/calendarClient';

type CallApi = <TResponse = unknown>(
  message: Record<string, unknown>,
  options?: { reportError?: boolean; throwOnError?: boolean },
) => Promise<TResponse | null>;

type SubscribeApi = <TEvent = unknown>(
  message: Record<string, unknown>,
  callback: (event: TEvent) => void,
) => Promise<() => void>;

export type CalendarAgendaController = {
  entityId: string;
  status: 'idle' | 'loading' | 'ready' | 'error';
  events: CalendarAgendaEvent[];
  error: string | null;
  busy: boolean;
  createEvent: (event: CalendarEventDraft) => Promise<boolean>;
  updateEvent: (uid: string, event: CalendarEventDraft) => Promise<boolean>;
  deleteEvent: (uid: string) => Promise<boolean>;
};

type UseCalendarAgendaOptions = {
  entityId: string;
  enabled: boolean;
  isDemo: boolean;
  demoEvents?: CalendarAgendaEvent[];
  callApi: CallApi;
  subscribeApi: SubscribeApi;
};

const EMPTY_CALENDAR_EVENTS: CalendarAgendaEvent[] = [];

export function useCalendarAgenda({
  entityId,
  enabled,
  isDemo,
  demoEvents = EMPTY_CALENDAR_EVENTS,
  callApi,
  subscribeApi,
}: UseCalendarAgendaOptions): CalendarAgendaController {
  const [events, setEvents] = useState<CalendarAgendaEvent[]>(demoEvents);
  const [status, setStatus] = useState<CalendarAgendaController['status']>('idle');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!enabled || !entityId) {
      setEvents([]);
      setStatus('idle');
      setError(null);
      return;
    }
    if (isDemo) {
      setEvents(demoEvents);
      setStatus('ready');
      setError(null);
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    setEvents([]);
    setStatus('loading');
    setError(null);
    void subscribeApi(buildCalendarSubscribeMessage(entityId), (payload) => {
      if (cancelled) return;
      setEvents(parseCalendarAgendaPayload(payload));
      setStatus('ready');
      setError(null);
    }).then((nextUnsubscribe) => {
      if (cancelled) {
        nextUnsubscribe();
        return;
      }
      unsubscribe = nextUnsubscribe;
    }).catch((reason) => {
      if (cancelled) return;
      setStatus('error');
      setError(reason instanceof Error ? reason.message : 'Calendar subscription failed');
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [demoEvents, enabled, entityId, isDemo, subscribeApi]);

  const runMutation = useCallback(async (
    message: Record<string, unknown>,
    demoMutation: () => void,
  ) => {
    if (!entityId || busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      if (isDemo) {
        demoMutation();
      } else {
        await callApi(message, { reportError: false, throwOnError: true });
      }
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Calendar operation failed');
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [callApi, entityId, isDemo]);

  const createEvent = useCallback((event: CalendarEventDraft) => runMutation(
    buildCalendarCreateMessage(entityId, event),
    () => setEvents((current) => [...current, { ...event, uid: `demo-${Date.now()}` }]
      .sort((first, second) => first.start.localeCompare(second.start))),
  ), [entityId, runMutation]);

  const updateEvent = useCallback((uid: string, event: CalendarEventDraft) => runMutation(
    buildCalendarUpdateMessage(entityId, uid, event),
    () => setEvents((current) => current
      .map((item) => item.uid === uid ? { ...event, uid } : item)
      .sort((first, second) => first.start.localeCompare(second.start))),
  ), [entityId, runMutation]);

  const deleteEvent = useCallback((uid: string) => runMutation(
    buildCalendarDeleteMessage(entityId, uid),
    () => setEvents((current) => current.filter((item) => item.uid !== uid)),
  ), [entityId, runMutation]);

  return useMemo(() => ({
    entityId,
    status,
    events,
    error,
    busy,
    createEvent,
    updateEvent,
    deleteEvent,
  }), [busy, createEvent, deleteEvent, entityId, error, events, status, updateEvent]);
}
