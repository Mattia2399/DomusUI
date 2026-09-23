export const CALENDAR_FEATURE_CREATE_EVENT = 1;
export const CALENDAR_FEATURE_DELETE_EVENT = 2;
export const CALENDAR_FEATURE_UPDATE_EVENT = 4;
export const IRRIGATION_CALENDAR_UID_PREFIX = 'domus-ui-irrigation:';
export const CALENDAR_UPCOMING_EVENTS_ATTRIBUTE = '__domus_ui_calendar_events';

export type CalendarAgendaEvent = {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  allDay: boolean;
};

export type CalendarEventDraft = Omit<CalendarAgendaEvent, 'uid'>;

export function isIrrigationCalendarEvent(event: Pick<CalendarAgendaEvent, 'uid'>) {
  return event.uid.startsWith(IRRIGATION_CALENDAR_UID_PREFIX);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readDateBoundary(value: unknown) {
  if (typeof value === 'string') return readText(value);
  if (!isRecord(value)) return undefined;
  return readText(value.dateTime) ?? readText(value.date);
}

function parseCalendarEvent(value: unknown, index: number): CalendarAgendaEvent | null {
  if (!isRecord(value)) return null;
  const start = readDateBoundary(value.start ?? value.dtstart);
  const end = readDateBoundary(value.end ?? value.dtend);
  const summary = readText(value.summary) ?? readText(value.message);
  if (!start || !end || !summary) return null;
  const uid = readText(value.uid) ?? `${start}-${end}-${summary}-${index}`;
  const allDay = value.all_day === true || (!start.includes('T') && !start.includes(' '));
  return {
    uid,
    summary,
    description: readText(value.description),
    location: readText(value.location),
    start,
    end,
    allDay,
  };
}

export function parseCalendarAgendaPayload(payload: unknown): CalendarAgendaEvent[] {
  const source = isRecord(payload) && Array.isArray(payload.events)
    ? payload.events
    : Array.isArray(payload)
      ? payload
      : [];
  return source
    .map(parseCalendarEvent)
    .filter((event): event is CalendarAgendaEvent => event !== null)
    .sort((first, second) => first.start.localeCompare(second.start));
}

export function buildCalendarWindow(reference = new Date()) {
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function buildCalendarSubscribeMessage(entityId: string, reference = new Date()) {
  const window = buildCalendarWindow(reference);
  return {
    type: 'calendar/event/subscribe',
    entity_id: entityId,
    start: window.start,
    end: window.end,
  };
}

function eventPayload(event: CalendarEventDraft) {
  return {
    start: event.start,
    end: event.end,
    summary: event.summary.trim(),
    ...(event.description?.trim() ? { description: event.description.trim() } : null),
    ...(event.location?.trim() ? { location: event.location.trim() } : null),
  };
}

export function buildCalendarCreateMessage(entityId: string, event: CalendarEventDraft) {
  return { type: 'calendar/event/create', entity_id: entityId, event: eventPayload(event) };
}

export function buildCalendarUpdateMessage(entityId: string, uid: string, event: CalendarEventDraft) {
  return { type: 'calendar/event/update', entity_id: entityId, uid, event: eventPayload(event) };
}

export function buildCalendarDeleteMessage(entityId: string, uid: string) {
  return { type: 'calendar/event/delete', entity_id: entityId, uid };
}
