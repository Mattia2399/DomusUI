import { useMemo, useState } from 'react';
import { CalendarDays, MapPin, Pencil, Plus, Recycle } from 'lucide-react';
import { ContextPanelHeader } from './ContextPanelHeader';
import { CONTEXT_PANEL_LAYOUT } from './layoutClasses';
import { useI18n } from '../../i18n/I18nProvider';
import type { CalendarAgendaController } from '../../hooks/useCalendarAgenda';
import {
  CALENDAR_FEATURE_CREATE_EVENT,
  CALENDAR_FEATURE_DELETE_EVENT,
  CALENDAR_FEATURE_UPDATE_EVENT,
  isIrrigationCalendarEvent,
  isWasteCalendarEvent,
  type CalendarAgendaEvent,
  type WasteTypeStyleMap,
} from '../../services/calendarClient';
import { CalendarEventForm, eventLook, initialForm, toDisplayDate, type EventFormState } from './CalendarEventForm';
import { IconBadge } from '../ui/IconBadge';
import { localIsoDay, nextSevenDays, WeekDayStrip, type WeekDayBadge } from '../ui/WeekDayStrip';

type CalendarControlsProps = {
  name: string;
  supportedFeatures: number;
  agenda: CalendarAgendaController;
  wasteTypes?: WasteTypeStyleMap;
  onConfigureWaste?: () => void;
};

export function CalendarControls({ name, supportedFeatures, agenda, wasteTypes = {}, onConfigureWaste }: CalendarControlsProps) {
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
    : weekDays.find((day) => eventsByDay.has(day.iso))?.iso ?? today;
  const activeEvents = eventsByDay.get(activeDay) ?? [];
  const dayLabel = (iso: string) => {
    if (iso === today) return t('calendar.panel.today');
    if (iso === tomorrow) return t('calendar.panel.tomorrow');
    return formatDate(new Date(`${iso}T12:00:00`), { weekday: 'long', day: 'numeric', month: 'long' });
  };
  // Only the Domus calendar publishes waste types, so they also reveal the link before any collection is due.
  const showConfigureWaste = Boolean(onConfigureWaste) && (agenda.events.some(isWasteCalendarEvent) || Object.keys(wasteTypes).length > 0);

  return (
    <div className={CONTEXT_PANEL_LAYOUT.shell}>
      <ContextPanelHeader
        title={name}
        subtitle={t('calendar.panel.subtitle')}
        icon={<CalendarDays size={21} />}
        fallbackTitle={t('calendar.panel.title')}
        iconClassName="border-emerald-300/25 bg-emerald-500/12 text-emerald-200"
      />

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
          <section className="space-y-3">
            <div className="px-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ui-text-tertiary)]">{t('calendar.panel.range')}</p>
              <h3 className="mt-1 text-lg font-semibold text-[color:var(--ui-text-primary)]">{t('calendar.panel.nextSevenDays')}</h3>
            </div>

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
              <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-xs leading-5 text-rose-100">{agenda.error}</div>
            ) : null}

            <div className="rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-4 py-3" aria-live="polite">
              <p className="text-sm font-semibold first-letter:uppercase">{dayLabel(activeDay)}</p>
              {agenda.status === 'loading' ? (
                <p className="mt-1 text-sm text-[color:var(--ui-text-secondary)]">{t('calendar.panel.loading')}</p>
              ) : activeEvents.length === 0 ? (
                <p className="mt-1 text-sm text-[color:var(--ui-text-secondary)]">{t('calendar.panel.dayEmpty')}</p>
              ) : (
                <ul className="mt-1 divide-y divide-[color:var(--ui-border)]">
                  {activeEvents.map((event) => {
                    const irrigationEvent = isIrrigationCalendarEvent(event);
                    const wasteEvent = isWasteCalendarEvent(event);
                    const editable = !irrigationEvent && !wasteEvent && (canUpdate || canDelete);
                    const start = toDisplayDate(event.start, event.allDay);
                    const look = eventLook(event, wasteTypes);
                    return (
                      <li key={event.uid}>
                        <button
                          type="button"
                          disabled={!editable}
                          onClick={() => editable && setForm(initialForm(event))}
                          className="flex w-full items-start gap-3 py-2.5 text-left disabled:cursor-default"
                        >
                          <IconBadge Icon={look.Icon} color={look.color} size={30} className="mt-0.5" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-[color:var(--ui-text-primary)]">{event.summary}</span>
                            <span className="mt-0.5 block text-[11px] text-[color:var(--ui-text-secondary)]">
                              {event.allDay ? t('calendar.event.allDay') : formatDate(start, { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {irrigationEvent ? <span className="mt-1 block text-[9px] font-semibold uppercase tracking-[0.08em] text-emerald-300">{t('calendar.event.irrigationReadOnly')}</span> : null}
                            {wasteEvent ? <span className="mt-1 block text-[9px] font-semibold uppercase tracking-[0.08em] text-[color:var(--ui-text-tertiary)]">{t('calendar.event.wasteReadOnly')}</span> : null}
                            {event.location ? <span className="mt-1 flex items-center gap-1 truncate text-[10px] text-[color:var(--ui-text-tertiary)]"><MapPin size={10} />{event.location}</span> : null}
                          </span>
                          {editable ? <Pencil size={13} className="mt-1 shrink-0 text-[color:var(--ui-text-tertiary)]" /> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {!canCreate && !canUpdate && !canDelete ? (
              <p className="rounded-xl bg-[color:var(--ui-fill-tertiary)] px-3 py-2 text-[11px] leading-4 text-[color:var(--ui-text-secondary)]">{t('calendar.panel.readOnly')}</p>
            ) : null}
            {canCreate || showConfigureWaste ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {canCreate ? (
                  <button type="button" onClick={() => setForm(initialForm())} className="liquid-glass-selection inline-flex min-h-10 flex-[1_1_10rem] items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-semibold">
                    <Plus size={16} />{t('calendar.form.new')}
                  </button>
                ) : null}
                {showConfigureWaste ? (
                  <button type="button" onClick={onConfigureWaste} className="liquid-glass-control inline-flex min-h-10 flex-[1_1_10rem] items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-semibold">
                    <Recycle size={16} />{t('calendar.event.configureWaste')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}

export default CalendarControls;
