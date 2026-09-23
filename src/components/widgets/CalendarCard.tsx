import React, { useMemo, type CSSProperties } from 'react';
import { CalendarDays, ChevronRight, Clock3, MapPin } from 'lucide-react';
import type { Widget } from '../../types/dashboardModels';
import type { MockEntityState } from '../../types/ha';
import type { GridEngineBreakpoint } from '../dashboard/dashboardBreakpointConfig';
import type { WidgetDisplayVariant } from './widgetDisplayVariant';
import { useI18n } from '../../i18n/I18nProvider';
import { CALENDAR_UPCOMING_EVENTS_ATTRIBUTE, parseCalendarAgendaPayload } from '../../services/calendarClient';
import './CalendarCard.css';

type CalendarCardProps = {
  widget: Widget;
  entity?: MockEntityState;
  gridBreakpoint?: GridEngineBreakpoint;
  displayVariant: WidgetDisplayVariant;
  isSelected: boolean;
  isEditMode: boolean;
  onClick: () => void;
};

type CalendarCardEvent = {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  start?: Date;
  end?: Date;
  allDay: boolean;
};

function readText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readDate(value: unknown) {
  const source = readText(value);
  if (!source) return undefined;
  const result = new Date(/^\d{4}-\d{2}-\d{2}$/.test(source) ? `${source}T12:00:00` : source);
  return Number.isFinite(result.getTime()) ? result : undefined;
}

function startOfWeek(value: Date) {
  const date = new Date(value);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date;
}

function sameDay(first: Date | undefined, second: Date) {
  return Boolean(first) && first!.getFullYear() === second.getFullYear() && first!.getMonth() === second.getMonth() && first!.getDate() === second.getDate();
}

const EVENT_ACCENTS = ['#34d399', '#60a5fa', '#a78bfa', '#f59e0b', '#f472b6'] as const;

function eventAccent(event: CalendarCardEvent) {
  if (event.description?.toLowerCase().includes('domus core irrigation')) return EVENT_ACCENTS[0];
  const source = `${event.title}|${event.location ?? ''}`;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) hash = ((hash << 5) - hash + source.charCodeAt(index)) | 0;
  return EVENT_ACCENTS[Math.abs(hash) % EVENT_ACCENTS.length];
}

export function buildCalendarCardEvent(widget: Widget, entity: MockEntityState | undefined, emptyTitle: string): CalendarCardEvent {
  const attributes = entity?.rawAttributes ?? {};
  const title = readText(attributes.message) ?? readText(attributes.summary) ?? emptyTitle;
  const allDay = attributes.all_day === true;
  return {
    uid: `${widget.entityId || widget.id}:next`,
    title,
    description: readText(attributes.description),
    location: readText(attributes.location),
    start: readDate(attributes.start_time ?? attributes.start),
    end: readDate(attributes.end_time ?? attributes.end),
    allDay,
  };
}

export function buildCalendarCardEvents(widget: Widget, entity: MockEntityState | undefined, emptyTitle: string): CalendarCardEvent[] {
  const attributes = entity?.rawAttributes ?? {};
  const upcoming = parseCalendarAgendaPayload(attributes[CALENDAR_UPCOMING_EVENTS_ATTRIBUTE]);
  if (upcoming.length > 0) {
    return upcoming.map((event) => ({
      uid: event.uid,
      title: event.summary,
      description: event.description,
      location: event.location,
      start: readDate(event.start),
      end: readDate(event.end),
      allDay: event.allDay,
    }));
  }
  const next = buildCalendarCardEvent(widget, entity, emptyTitle);
  return next.start ? [next] : [];
}

export function CalendarCard({ widget, entity, gridBreakpoint, displayVariant, isSelected, isEditMode, onClick }: CalendarCardProps) {
  const { t, formatDate } = useI18n();
  const events = useMemo(() => buildCalendarCardEvents(widget, entity, t('calendar.card.empty')), [entity, t, widget]);
  const event = events[0] ?? buildCalendarCardEvent(widget, entity, t('calendar.card.empty'));
  const unavailable = entity?.state === 'unavailable' || entity?.state === 'unknown';
  const hasEvent = Boolean(event.start) && !unavailable;
  const mini = displayVariant === 'mini' || displayVariant === 'compact';
  const expanded = displayVariant === 'full';
  const radiusClass = mini ? 'rounded-[1.2rem]' : 'rounded-[1.45rem]';
  const compactMiniBar = mini && gridBreakpoint !== undefined && gridBreakpoint !== 'xs' && hasEvent;
  const eventCapacity = Math.max(1, Math.min(events.length, Math.max(1, Math.round(widget.layout.h) - 2)));
  const visibleEvents = events.slice(0, eventCapacity);
  const anchor = event.start ?? new Date();
  const anchorYear = anchor.getFullYear();
  const anchorMonth = anchor.getMonth();
  const anchorDate = anchor.getDate();
  const week = useMemo(() => {
    const first = startOfWeek(new Date(anchorYear, anchorMonth, anchorDate, 12));
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(first);
      day.setDate(first.getDate() + index);
      return day;
    });
  }, [anchorDate, anchorMonth, anchorYear]);
  const timeLabel = event.start
    ? event.allDay ? t('calendar.event.allDay') : formatDate(event.start, { hour: '2-digit', minute: '2-digit' })
    : t('calendar.card.noUpcoming');
  const calendarStyle = { '--calendar-event-accent': eventAccent(event) } as CSSProperties;
  const eventTimeLabel = (item: CalendarCardEvent) => item.start
    ? item.allDay ? t('calendar.event.allDay') : formatDate(item.start, { hour: '2-digit', minute: '2-digit' })
    : t('calendar.card.noUpcoming');

  return (
    <div data-card-variant={displayVariant} style={calendarStyle} className={`calendar-card relative h-full w-full min-h-0 min-w-0 overflow-hidden ${radiusClass} ${isSelected ? 'selection-corners' : ''}`}>
      <div className={`liquid-glass-card flex h-full min-h-0 flex-col overflow-hidden ${radiusClass} ${mini ? 'px-3 py-1.5' : 'p-3'}`}>
        {mini ? (
          <div className={`calendar-card__mini flex h-full min-w-0 items-center gap-2.5 ${compactMiniBar ? 'calendar-card__mini--bar' : ''}`}>
            {compactMiniBar ? <span className="calendar-card__mini-accent" aria-hidden="true" /> : null}
            {!compactMiniBar ? <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300"><CalendarDays size={17} /></span> : null}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-[color:var(--ui-text-primary)]">{unavailable ? t('calendar.card.unavailable') : event.title}</span>
              <span className="block truncate text-[10px] text-[color:var(--ui-text-secondary)]">{event.start ? `${formatDate(event.start, { weekday: 'short', day: 'numeric' })} · ${timeLabel}` : timeLabel}</span>
            </span>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 px-1">
              <p className="truncate text-sm font-semibold capitalize text-[color:var(--ui-text-secondary)]">{formatDate(anchor, { month: 'long' })}</p>
              {expanded ? <span className="flex h-7 items-center gap-1 rounded-full bg-[color:var(--ui-fill-tertiary)] px-2 text-[9px] font-bold uppercase tracking-[0.1em] text-[color:var(--ui-text-secondary)]"><CalendarDays size={11} />{t('calendar.card.agenda')}</span> : null}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-0.5 rounded-2xl bg-[color:var(--ui-fill-tertiary)] p-2">
              {week.map((day) => {
                const active = sameDay(event.start, day);
                return <div key={day.toISOString()} className="flex min-w-0 flex-col items-center gap-0.5">
                  <span className="text-[8px] font-semibold uppercase text-[color:var(--ui-text-tertiary)]">{formatDate(day, { weekday: 'narrow' })}</span>
                  <span className={`flex aspect-square w-full max-w-6 items-center justify-center rounded-full text-[11px] font-semibold ${active ? 'bg-[color:var(--ui-text-primary)] text-[color:var(--ui-surface-primary)]' : 'text-[color:var(--ui-text-secondary)]'}`}>{day.getDate()}</span>
                  <span className={`h-1 w-1 rounded-full ${active ? 'bg-emerald-400' : 'bg-transparent'}`} />
                </div>;
              })}
            </div>
            <div className="calendar-card__events mt-2 flex min-h-0 flex-1 flex-col gap-2">
              {hasEvent ? visibleEvents.map((item) => {
                const itemTimeLabel = eventTimeLabel(item);
                const itemStyle = { '--calendar-event-accent': eventAccent(item) } as CSSProperties;
                return <div key={item.uid} style={itemStyle} className="calendar-card__event-row flex min-h-0 flex-1 items-center gap-2.5 rounded-2xl bg-[color:var(--ui-fill-tertiary)] px-3 py-2">
                  <span className="calendar-card__event-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-full"><Clock3 size={14} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-[color:var(--ui-text-primary)]">{item.title}</span>
                    <span className="mt-0.5 flex items-center gap-1 truncate text-[9px] text-[color:var(--ui-text-secondary)]">{item.location ? <MapPin size={9} className="shrink-0" /> : null}{item.location ? `${itemTimeLabel} · ${item.location}` : itemTimeLabel}</span>
                    {expanded && eventCapacity === 1 && item.description ? <span className="mt-1 block truncate text-[9px] text-[color:var(--ui-text-tertiary)]">{item.description}</span> : null}
                  </span>
                  <ChevronRight size={15} className="shrink-0 text-[color:var(--ui-text-tertiary)]" />
                </div>;
              }) : <div className="calendar-card__event-row calendar-card__event-row--empty flex min-h-0 flex-1 items-center px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-center text-xs font-semibold text-[color:var(--ui-text-tertiary)]">{unavailable ? t('calendar.card.unavailable') : timeLabel}</span>
              </div>}
            </div>
          </>
        )}
      </div>
      <button type="button" onClick={(clickEvent) => { clickEvent.stopPropagation(); onClick(); }} className={`widget-card-handle absolute inset-0 z-10 ${radiusClass} ${isEditMode ? 'cursor-grab' : 'cursor-pointer'}`} aria-label={t('calendar.card.open', { name: widget.title })} />
    </div>
  );
}

export default CalendarCard;
