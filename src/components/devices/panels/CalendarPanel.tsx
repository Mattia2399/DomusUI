import { useMemo, useState } from 'react';
import { CalendarDays, Plus, Recycle, Trash2 } from 'lucide-react';
import { usePanelsTranslations } from '../../../i18n/panelsTranslations';
import { useI18n } from '../../../i18n/I18nProvider';
import type { CalendarAgendaController } from '../../../hooks/useCalendarAgenda';
import {
  CALENDAR_FEATURE_CREATE_EVENT,
  CALENDAR_FEATURE_DELETE_EVENT,
  CALENDAR_FEATURE_UPDATE_EVENT,
  isIrrigationCalendarEvent,
  isWasteCalendarEvent,
  type CalendarAgendaEvent,
  type WasteTypeStyleMap,
} from '../../../services/calendarClient';
import { CalendarEventForm, eventLook, initialForm, toDisplayDate, type EventFormState } from '../../settings/CalendarEventForm';
import { localIsoDay, nextSevenDays, WeekDayStrip, type WeekDayBadge } from '../../ui/WeekDayStrip';
import { PanelShell, type PanelLive } from './PanelShell';
import '../theme/panels.css';

/*
 * The calendar of a card: the week, the events of the chosen day, when the next
 * waste goes out, and a new event only if the entity can take one. A card holds
 * one calendar, so there is no filter of calendars to show.
 */

export type CalendarPanelProps = {
  name: string;
  supportedFeatures: number;
  agenda: CalendarAgendaController;
  wasteTypes?: WasteTypeStyleMap;
  onConfigureWaste?: () => void;
  embedded?: boolean;
  live?: PanelLive;
  onClose: () => void;
};

export function CalendarPanel({ name, supportedFeatures, agenda, wasteTypes = {}, onConfigureWaste, embedded = false, live, onClose }: CalendarPanelProps) {
  const pt = usePanelsTranslations();
  const { locale, t, formatDate } = useI18n();
  const [form, setForm] = useState<EventFormState | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const canCreate = (supportedFeatures & CALENDAR_FEATURE_CREATE_EVENT) !== 0;
  const canUpdate = (supportedFeatures & CALENDAR_FEATURE_UPDATE_EVENT) !== 0;
  const canDelete = (supportedFeatures & CALENDAR_FEATURE_DELETE_EVENT) !== 0;
  const weekDays = nextSevenDays();
  const today = weekDays[0].iso;
  const tomorrow = weekDays[1].iso;

  const eventsByDay = useMemo(() => {
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

  const badgesByDay = new Map<string, WeekDayBadge[]>(
    [...eventsByDay].map(([day, events]) => [day, events.map((event) => ({ key: event.uid, ...eventLook(event, wasteTypes) }))]),
  );
  const activeDay = selectedDay && weekDays.some((day) => day.iso === selectedDay)
    ? selectedDay
    : today;
  const activeEvents = eventsByDay.get(activeDay) ?? [];
  const todayCount = eventsByDay.get(today)?.length ?? 0;
  const subtitle = todayCount === 0 ? pt('calSubNone') : todayCount === 1 ? pt('calSubOne') : pt('calSubMany', { n: todayCount });
  const dayLabel = (iso: string) => {
    const date = formatDate(new Date(`${iso}T12:00:00`), { weekday: 'long', day: 'numeric', month: 'long' });
    return iso === today ? `${pt('calToday')}, ${date}` : date;
  };

  const nextWaste = weekDays
    .map((day) => ({ day: day.iso, event: eventsByDay.get(day.iso)?.find(isWasteCalendarEvent) }))
    .find((entry) => entry.event);
  const wasteWhen = nextWaste
    ? nextWaste.day === today
      ? pt('calToday').toLocaleLowerCase(locale)
      : nextWaste.day === tomorrow
        ? pt('calTomorrow')
        : formatDate(new Date(`${nextWaste.day}T12:00:00`), { weekday: 'long' })
    : '';
  // Only the Domus calendar publishes waste types, so they also reveal the link before any collection is due.
  const showConfigureWaste = Boolean(onConfigureWaste) && (agenda.events.some(isWasteCalendarEvent) || Object.keys(wasteTypes).length > 0);

  return (
    <PanelShell
      icon={<CalendarDays size={23} strokeWidth={2} />}
      iconClassName="bg-[rgb(255_69_58/0.18)] text-[#ff453a]"
      name={name}
      subtitle={subtitle}
      embedded={embedded}
      live={live}
      onClose={onClose}
    >
      {form ? (
        <CalendarEventForm
          form={form}
          agenda={agenda}
          canUpdate={canUpdate}
          canDelete={canDelete}
          onChange={setForm}
          onDone={() => setForm(null)}
        />
      ) : (
        <>
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
          />

          {agenda.error ? (
            <div className="dv-banner dv-pn-banner is-red" role="alert"><span>{agenda.error}</span></div>
          ) : null}

          <div className="dv-pn-label first-letter:uppercase">{dayLabel(activeDay)}</div>
          <div className="dv-card dv-pn-rows" aria-live="polite">
            {agenda.status === 'loading' ? (
              <div className="dv-pn-row"><span className="dv-pn-rt"><span className="dv-t2">{t('calendar.panel.loading')}</span></span></div>
            ) : activeEvents.length === 0 ? (
              <div className="dv-pn-row">
                <span className="dv-pn-rt"><b>{t('calendar.panel.dayEmpty')}</b><span className="dv-t2">{pt('calFree')}</span></span>
              </div>
            ) : (
              activeEvents.map((event) => {
                const fixed = isIrrigationCalendarEvent(event) || isWasteCalendarEvent(event);
                const editable = !fixed && (canUpdate || canDelete);
                const start = toDisplayDate(event.start, event.allDay);
                const when = event.allDay ? t('calendar.event.allDay') : formatDate(start, { hour: '2-digit', minute: '2-digit' });
                const body = (
                  <>
                    <span className="dv-pn-evbar" style={{ background: eventLook(event, wasteTypes).color }} aria-hidden="true" />
                    <span className="dv-pn-rt">
                      <b>{event.summary}</b>
                      <span className="dv-t2">{[when, event.location].filter(Boolean).join(' · ')}</span>
                    </span>
                  </>
                );
                return editable ? (
                  <button key={event.uid} type="button" className="dv-pn-row dv-pn-person" onClick={() => setForm(initialForm(event))}>{body}</button>
                ) : (
                  <div key={event.uid} className="dv-pn-row">{body}</div>
                );
              })
            )}
          </div>

          {nextWaste?.event ? (
            <div className="dv-card dv-pn-rows">
              <div className="dv-pn-row">
                <span className="dv-pn-row-ic bg-[rgb(48_209_88/0.18)] text-[#30d158]" aria-hidden="true"><Trash2 size={17} strokeWidth={2.2} /></span>
                <span className="dv-pn-rt">
                  <b>{pt('calWaste', { when: wasteWhen })}</b>
                  <span className="dv-t2">{[nextWaste.event.summary, nextWaste.day === tomorrow ? pt('calWasteTonight') : null].filter(Boolean).join(' · ')}</span>
                </span>
              </div>
            </div>
          ) : null}

          {canCreate ? (
            <button type="button" className="dv-pn-big dv-pn-wide" onClick={() => setForm(initialForm())}>
              <Plus size={18} strokeWidth={2.4} aria-hidden="true" />{pt('calNew')}
            </button>
          ) : null}
          {showConfigureWaste ? (
            <button type="button" className="dv-pn-sm dv-pn-wide" onClick={onConfigureWaste}>
              <Recycle size={16} strokeWidth={2.2} aria-hidden="true" />{t('calendar.event.configureWaste')}
            </button>
          ) : null}
        </>
      )}
    </PanelShell>
  );
}

export default CalendarPanel;
