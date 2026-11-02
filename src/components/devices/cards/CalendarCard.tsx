import type React from 'react';
import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { useDevicesTranslations } from '../../../i18n/devicesTranslations';
import { useI18n } from '../../../i18n/I18nProvider';
import { CardFrame, CardHead } from './CardFrame';
import { deviceCardSize, type DeviceCardFormat } from './DeviceCardShell';

/*
 * The calendar in the three sizes of the board (docs/design-reference/CoreCards.dc.html).
 *
 * Mini U×2      the next event
 * Standard U×4  today's events with their time
 * Expanded W×4  the week, and the event of the day chosen in it
 */

export type CalendarCardEvent = {
  uid: string;
  title: string;
  start: Date | null;
  end: Date | null;
  allDay: boolean;
  location?: string;
};

const COLOURS = ['#0A84FF', '#30D158', '#BF5AF2', '#FF9F0A', '#FF375F'];
const DAY_MS = 86_400_000;

const sameDay = (first: Date, second: Date) => first.toDateString() === second.toDateString();

export type CalendarCardProps = {
  name: string;
  events: CalendarCardEvent[];
  available: boolean;
  format: DeviceCardFormat;
  /** Today; the tests fix it. */
  now?: number;
  editing?: boolean;
  selected?: boolean;
  onOpen: () => void;
  onSelect?: () => void;
};

export function CalendarCard({ name, events, available, format, now = Date.now(), editing = false, selected = false, onOpen, onSelect }: CalendarCardProps) {
  const dt = useDevicesTranslations();
  const { locale } = useI18n();
  const size = deviceCardSize(format);
  const today = new Date(now);
  const [picked, setPicked] = useState(() => today.toDateString());
  const weekday = (date: Date) => new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date).replace('.', '');
  const clock = (date: Date) => new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date);
  const dated = events.filter((event) => event.start !== null).sort((first, second) => first.start!.getTime() - second.start!.getTime());
  const upcoming = dated.filter((event) => (event.end ?? event.start)!.getTime() >= now);
  const ofDay = (day: Date) => dated.filter((event) => sameDay(event.start!, day));
  const whenOf = (event: CalendarCardEvent) => {
    const start = event.start!;
    const day = sameDay(start, today) ? dt('calendarToday') : `${weekday(start)} ${start.getDate()}`;
    return event.allDay ? `${day} · ${dt('calendarAllDay')}` : `${day} · ${clock(start)}`;
  };
  const badge = (
    <span className="dv-date" aria-hidden="true">
      <span>{weekday(today)}</span>
      <b>{today.getDate()}</b>
    </span>
  );
  const frame = (children: React.ReactNode, row = false) => (
    <CardFrame
      format={format}
      available={available}
      editing={editing}
      selected={selected}
      openLabel={dt('controlsOf', { name, status: upcoming[0] ? `${upcoming[0].title}, ${whenOf(upcoming[0])}` : dt('calendarNoEvents') })}
      selectLabel={dt('select', { name })}
      onOpen={onOpen}
      onSelect={onSelect}
    >
      <div className={row ? 'dv-tile-inner items-center gap-3 px-3.5' : 'dv-size-body'}>{children}</div>
    </CardFrame>
  );

  if (size === 'mini') {
    const next = upcoming[0];
    return frame(<CardHead icon={badge} name={next ? next.title : name} status={next ? whenOf(next) : dt('calendarNoEvents')} />, true);
  }

  if (size === 'standard') {
    const todays = ofDay(today).filter((event) => (event.end ?? event.start)!.getTime() >= now);
    const shown = (todays.length > 0 ? todays : upcoming).slice(0, 3);
    return frame(
      <>
        <CardHead
          icon={badge}
          name={dt('calendarToday')}
          status={todays.length === 0 ? dt('calendarNoEvents') : todays.length === 1 ? dt('calendarOneEvent') : dt('calendarEvents', { count: todays.length })}
        />
        <span className="dv-events">
          {shown.map((event, index) => (
            <span key={event.uid} style={{ '--dv-event': COLOURS[index % COLOURS.length] } as React.CSSProperties}>
              <b>{event.allDay ? '—' : sameDay(event.start!, today) ? clock(event.start!) : weekday(event.start!)}</b>
              {event.title}
            </span>
          ))}
        </span>
      </>,
    );
  }

  const week = Array.from({ length: 7 }, (_, index) => new Date(today.getTime() + index * DAY_MS));
  const day = week.find((entry) => entry.toDateString() === picked) ?? today;
  const event = ofDay(day)[0];
  const colour = event ? COLOURS[dated.indexOf(event) % COLOURS.length] : '#8E8E93';
  return frame(
    <>
      <span className="dv-week">
        {week.map((entry) => (
          <button
            key={entry.toDateString()}
            type="button"
            aria-pressed={entry.toDateString() === day.toDateString()}
            aria-label={new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(entry)}
            disabled={editing}
            onClick={() => setPicked(entry.toDateString())}
          >
            <span>{weekday(entry)}</span>
            <b>{entry.getDate()}</b>
            <i style={{ opacity: ofDay(entry).length > 0 ? 1 : 0 }} />
          </button>
        ))}
      </span>
      <span className="dv-event-detail" style={{ '--dv-event': colour } as React.CSSProperties}>
        <i aria-hidden="true" />
        <span className="dv-size-text">
          <span className="dv-name dv-name-1">{event ? event.title : dt('calendarNoEvents')}</span>
          <span className="dv-status">
            {event
              ? event.allDay || !event.start
                ? dt('calendarAllDay')
                : event.end ? `${clock(event.start)} – ${clock(event.end)}` : clock(event.start)
              : dt('calendarFreeDay')}
          </span>
          {event?.location ? (
            <span className="dv-status flex items-center gap-1">
              <MapPin size={12} strokeWidth={2.4} aria-hidden="true" />
              {event.location}
            </span>
          ) : null}
        </span>
      </span>
    </>,
  );
}

export default CalendarCard;
