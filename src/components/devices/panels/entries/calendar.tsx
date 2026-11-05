import React from 'react';
import { CalendarDays, Trash2 } from 'lucide-react';
import type { CalendarAgendaController } from '../../../../hooks/useCalendarAgenda';
import { useI18n } from '../../../../i18n/I18nProvider';
import { usePanelSpecTranslations } from '../../../../i18n/panelSpecTranslations';
import { usePanelsTranslations } from '../../../../i18n/panelsTranslations';
import {
  CALENDAR_FEATURE_CREATE_EVENT,
  CALENDAR_FEATURE_DELETE_EVENT,
  CALENDAR_FEATURE_UPDATE_EVENT,
  isIrrigationCalendarEvent,
  isWasteCalendarEvent,
  type CalendarAgendaEvent,
  type WasteTypeStyleMap,
} from '../../../../services/calendarClient';
import { CalendarEventForm, eventLook, initialForm, toDisplayDate, type EventFormState } from '../../../settings/CalendarEventForm';
import { GlassButton } from '../../../ui/GlassButton';
import { localIsoDay, nextSevenDays, WeekDayStrip, type WeekDayBadge } from '../../../ui/WeekDayStrip';
import type { PanelEntry, PanelItem, PanelSpec } from '../registry';
import { accentOf, ICON, PanelRows } from './shared';
import './data.css';

/*
 * A calendar: the events of the chosen day in the middle, the week always in view below,
 * when the next waste goes out, and + only if the entity can take a new event.
 */

export type CalendarPanelInput = {
  name: string;
  supportedFeatures: number;
  agenda: CalendarAgendaController;
  wasteTypes?: WasteTypeStyleMap;
  onConfigureWaste?: () => void;
};

function useCalendarSpec({ name, supportedFeatures, agenda, wasteTypes = {}, onConfigureWaste }: CalendarPanelInput): PanelSpec {
  const pt = usePanelsTranslations();
  const sp = usePanelSpecTranslations();
  const { locale, t, formatDate } = useI18n();
  const [form, setForm] = React.useState<EventFormState | null>(null);
  const [selectedDay, setSelectedDay] = React.useState<string | null>(null);
  const canCreate = (supportedFeatures & CALENDAR_FEATURE_CREATE_EVENT) !== 0;
  const canUpdate = (supportedFeatures & CALENDAR_FEATURE_UPDATE_EVENT) !== 0;
  const canDelete = (supportedFeatures & CALENDAR_FEATURE_DELETE_EVENT) !== 0;
  const weekDays = nextSevenDays();
  const today = weekDays[0].iso;
  const tomorrow = weekDays[1].iso;

  const eventsByDay = React.useMemo(() => {
    const groups = new Map<string, CalendarAgendaEvent[]>();
    agenda.events.forEach((event) => {
      const date = toDisplayDate(event.start, event.allDay);
      const startDay = Number.isFinite(date.getTime()) ? localIsoDay(date) : event.start.slice(0, 10);
      // Events already running when the window opens belong to today.
      const key = startDay < today ? today : startDay;
      groups.set(key, [...(groups.get(key) ?? []), event]);
    });
    return groups;
  }, [agenda.events, today]);

  const badgesByDay = new Map<string, WeekDayBadge[]>([...eventsByDay].map(([day, events]) => [day, events.map((event) => ({ key: event.uid, ...eventLook(event, wasteTypes) }))]));
  const activeDay = selectedDay && weekDays.some((day) => day.iso === selectedDay) ? selectedDay : today;
  const activeEvents = eventsByDay.get(activeDay) ?? [];
  const todayCount = eventsByDay.get(today)?.length ?? 0;
  const status = todayCount === 0 ? pt('calSubNone') : todayCount === 1 ? pt('calSubOne') : pt('calSubMany', { n: todayCount });
  const dayLabel = (iso: string) => {
    const date = formatDate(new Date(`${iso}T12:00:00`), { weekday: 'long', day: 'numeric', month: 'long' });
    return iso === today ? `${pt('calToday')}, ${date}` : date;
  };

  const nextWaste = weekDays.map((day) => ({ day: day.iso, event: eventsByDay.get(day.iso)?.find(isWasteCalendarEvent) })).find((entry) => entry.event);
  const wasteWhen = nextWaste
    ? nextWaste.day === today
      ? pt('calToday').toLocaleLowerCase(locale)
      : nextWaste.day === tomorrow
        ? pt('calTomorrow')
        : formatDate(new Date(`${nextWaste.day}T12:00:00`), { weekday: 'long' })
    : '';
  const wasteWhat = nextWaste?.event ? [nextWaste.event.summary, nextWaste.day === tomorrow ? pt('calWasteTonight') : null].filter(Boolean).join(' · ') : '';
  // Only the Domus calendar publishes waste types, so they also reveal the link before any collection is due.
  const showConfigureWaste = Boolean(onConfigureWaste) && (agenda.events.some(isWasteCalendarEvent) || Object.keys(wasteTypes).length > 0);

  const week = (
    <div className="panel-calendar-week">
    <WeekDayStrip
      days={weekDays}
      badgesByDay={badgesByDay}
      selectedDay={activeDay}
      onSelectDay={setSelectedDay}
      ariaLabel={t('calendar.panel.nextSevenDays')}
      dayAccessibleName={({ iso }) => {
        const events = eventsByDay.get(iso) ?? [];
        return `${dayLabel(iso)}: ${events.length > 0 ? events.map((event) => event.summary).join(', ') : t('calendar.panel.empty')}`;
      }}
      locale={locale}
      selectedClassName="bg-[#ff453a] text-white shadow-lg"
    />
    </div>
  );

  const eventRow = (event: CalendarAgendaEvent) => {
    const fixed = isIrrigationCalendarEvent(event) || isWasteCalendarEvent(event);
    const editable = !fixed && (canUpdate || canDelete);
    const start = toDisplayDate(event.start, event.allDay);
    const end = toDisplayDate(event.end, event.allDay);
    const clockOf = (date: Date) => formatDate(date, { hour: '2-digit', minute: '2-digit' });
    const when = event.allDay ? t('calendar.event.allDay') : Number.isFinite(end.getTime()) && end.getTime() > start.getTime() ? `${clockOf(start)} – ${clockOf(end)}` : clockOf(start);
    const body = (
      <>
        <i style={{ background: eventLook(event, wasteTypes).color }} aria-hidden="true" />
        <span>
          <b>{event.summary}</b>
          <span>{[when, event.location].filter(Boolean).join(' · ')}</span>
        </span>
      </>
    );
    return editable ? (
      <button key={event.uid} type="button" className="panel-event" onClick={() => setForm(initialForm(event))}>
        {body}
      </button>
    ) : (
      <div key={event.uid} className="panel-event">
        {body}
      </div>
    );
  };

  const groups: PanelItem[] = [{ key: 'week', kind: 'opens', icon: <CalendarDays {...ICON} />, label: sp.t('week'), content: () => week }];
  if (nextWaste?.event) {
    groups.push({ key: 'waste', kind: 'opens', icon: <Trash2 {...ICON} />, label: pt('calWaste', { when: wasteWhen }), content: () => <PanelRows rows={[[wasteWhat, wasteWhen]]} /> });
  }

  return {
    owner: name,
    name,
    status,
    icon: <CalendarDays size={23} strokeWidth={2} />,
    lit: true,
    accent: accentOf('255 69 58'),
    tint: true,
    heroKind: 'data',
    free: form ? <CalendarEventForm form={form} agenda={agenda} canUpdate={canUpdate} canDelete={canDelete} onChange={setForm} onDone={() => setForm(null)} /> : undefined,
    hero: (
      <div className="dv-card panel-calendar">
        {agenda.error ? (
          <p className="panel-calendar-error" role="alert">
            {agenda.error}
          </p>
        ) : null}
        <p className="panel-calendar-day">{dayLabel(activeDay)}</p>
        <div className="panel-calendar-events" aria-live="polite">
          {agenda.status === 'loading' ? (
            <p className="panel-screen-note">{t('calendar.panel.loading')}</p>
          ) : activeEvents.length === 0 ? (
            <div className="panel-event">
              <span>
                <b>{t('calendar.panel.dayEmpty')}</b>
                <span>{pt('calFree')}</span>
              </span>
            </div>
          ) : (
            activeEvents.map(eventRow)
          )}
        </div>
        {showConfigureWaste ? (
          <GlassButton variant="soft" className="panel-group-action panel-calendar-waste" onClick={onConfigureWaste}>
            {t('calendar.event.configureWaste')}
          </GlassButton>
        ) : null}
      </div>
    ),
    shortcuts: [],
    always: (
      <>
        <p className="panel-screen-title">
          <b>{sp.t('week')}</b>
        </p>
        {week}
        {nextWaste?.event ? (
          <p className="panel-screen-note">
            {pt('calWaste', { when: wasteWhen })} · {wasteWhat}
          </p>
        ) : null}
      </>
    ),
    groups,
    action: canCreate && !form ? { kind: 'add', label: pt('calNew'), onPress: () => setForm(initialForm()) } : undefined,
  };
}

export const calendarEntry: PanelEntry<CalendarPanelInput> = { useSpec: useCalendarSpec };
