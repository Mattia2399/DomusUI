import React, { useMemo, useState } from 'react';
import { CalendarDays, Clock3, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { ContextPanelHeader } from './ContextPanelHeader';
import { CONTEXT_PANEL_LAYOUT } from './layoutClasses';
import { useI18n } from '../../i18n/I18nProvider';
import type { CalendarAgendaController } from '../../hooks/useCalendarAgenda';
import {
  CALENDAR_FEATURE_CREATE_EVENT,
  CALENDAR_FEATURE_DELETE_EVENT,
  CALENDAR_FEATURE_UPDATE_EVENT,
  isIrrigationCalendarEvent,
  type CalendarAgendaEvent,
  type CalendarEventDraft,
} from '../../services/calendarClient';

type CalendarControlsProps = {
  name: string;
  supportedFeatures: number;
  agenda: CalendarAgendaController;
};

type EventFormState = {
  uid?: string;
  summary: string;
  description: string;
  location: string;
  start: string;
  end: string;
  allDay: boolean;
};

function toLocalDateTimeInput(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toDisplayDate(value: string, allDay = false) {
  const source = allDay && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T12:00:00`
    : value;
  return new Date(source);
}

function initialForm(event?: CalendarAgendaEvent): EventFormState {
  if (event) {
    return {
      uid: event.uid,
      summary: event.summary,
      description: event.description ?? '',
      location: event.location ?? '',
      start: event.allDay ? event.start.slice(0, 10) : toLocalDateTimeInput(event.start),
      end: event.allDay ? event.end.slice(0, 10) : toLocalDateTimeInput(event.end),
      allDay: event.allDay,
    };
  }
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    summary: '',
    description: '',
    location: '',
    start: toLocalDateTimeInput(start.toISOString()),
    end: toLocalDateTimeInput(end.toISOString()),
    allDay: false,
  };
}

function toDraft(form: EventFormState): CalendarEventDraft | null {
  const summary = form.summary.trim();
  if (!summary || !form.start || !form.end) return null;
  const start = form.allDay ? form.start : new Date(form.start).toISOString();
  const end = form.allDay ? form.end : new Date(form.end).toISOString();
  if (end <= start) return null;
  return {
    summary,
    description: form.description.trim() || undefined,
    location: form.location.trim() || undefined,
    start,
    end,
    allDay: form.allDay,
  };
}

function toAllDayRange(startValue: string, endValue: string) {
  const start = startValue.slice(0, 10);
  let end = endValue.slice(0, 10);
  if (!start) return { start, end };
  if (!end || end <= start) {
    const nextDay = new Date(`${start}T12:00:00`);
    nextDay.setDate(nextDay.getDate() + 1);
    end = toLocalDateTimeInput(nextDay.toISOString()).slice(0, 10);
  }
  return { start, end };
}

export function CalendarControls({ name, supportedFeatures, agenda }: CalendarControlsProps) {
  const { t, formatDate } = useI18n();
  const [form, setForm] = useState<EventFormState | null>(null);
  const canCreate = (supportedFeatures & CALENDAR_FEATURE_CREATE_EVENT) !== 0;
  const canUpdate = (supportedFeatures & CALENDAR_FEATURE_UPDATE_EVENT) !== 0;
  const canDelete = (supportedFeatures & CALENDAR_FEATURE_DELETE_EVENT) !== 0;
  const draft = form ? toDraft(form) : null;
  const groupedEvents = useMemo(() => {
    const groups = new Map<string, CalendarAgendaEvent[]>();
    agenda.events.forEach((event) => {
      const date = toDisplayDate(event.start, event.allDay);
      const key = Number.isFinite(date.getTime()) ? date.toDateString() : event.start.slice(0, 10);
      groups.set(key, [...(groups.get(key) ?? []), event]);
    });
    return [...groups.entries()];
  }, [agenda.events]);

  const submit = async () => {
    if (!form || !draft) return;
    const succeeded = form.uid
      ? await agenda.updateEvent(form.uid, draft)
      : await agenda.createEvent(draft);
    if (succeeded) setForm(null);
  };

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
        <section className="context-content-surface rounded-[clamp(1.25rem,4.6vw,2rem)] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ui-text-tertiary)]">
                {form.uid ? t('calendar.form.edit') : t('calendar.form.new')}
              </p>
              <h3 className="mt-1 text-base font-semibold text-[color:var(--ui-text-primary)]">{t('calendar.form.details')}</h3>
            </div>
            <button type="button" onClick={() => setForm(null)} className="rounded-full bg-[color:var(--ui-fill-tertiary)] px-3 py-1.5 text-xs font-semibold">
              {t('calendar.form.cancel')}
            </button>
          </div>

          <div className="mt-4 space-y-3">
            <label className="block text-xs font-semibold text-[color:var(--ui-text-secondary)]">
              {t('calendar.form.title')}
              <input className="ui-input mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm" value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} />
            </label>
            <label className="flex items-center justify-between rounded-xl bg-[color:var(--ui-fill-tertiary)] px-3 py-2.5 text-xs font-semibold text-[color:var(--ui-text-secondary)]">
              {t('calendar.form.allDay')}
              <input
                type="checkbox"
                checked={form.allDay}
                onChange={(event) => {
                  const allDay = event.target.checked;
                  const allDayRange = toAllDayRange(form.start, form.end);
                  setForm({
                    ...form,
                    allDay,
                    start: allDay ? allDayRange.start : `${form.start.slice(0, 10)}T09:00`,
                    end: allDay ? allDayRange.end : `${form.end.slice(0, 10)}T10:00`,
                  });
                }}
              />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-[color:var(--ui-text-secondary)]">
                {t('calendar.form.start')}
                <input type={form.allDay ? 'date' : 'datetime-local'} className="ui-input mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm" value={form.start} onChange={(event) => setForm({ ...form, start: event.target.value })} />
              </label>
              <label className="text-xs font-semibold text-[color:var(--ui-text-secondary)]">
                {t('calendar.form.end')}
                <input type={form.allDay ? 'date' : 'datetime-local'} className="ui-input mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm" value={form.end} onChange={(event) => setForm({ ...form, end: event.target.value })} />
              </label>
            </div>
            <label className="block text-xs font-semibold text-[color:var(--ui-text-secondary)]">
              {t('calendar.form.location')}
              <input className="ui-input mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} />
            </label>
            <label className="block text-xs font-semibold text-[color:var(--ui-text-secondary)]">
              {t('calendar.form.description')}
              <textarea className="ui-input mt-1.5 min-h-20 w-full resize-none rounded-xl px-3 py-2.5 text-sm" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </label>
          </div>

          {form.uid && canDelete ? (
            <button type="button" disabled={agenda.busy} onClick={async () => { if (await agenda.deleteEvent(form.uid!)) setForm(null); }} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2.5 text-sm font-semibold text-rose-200 disabled:opacity-50">
              <Trash2 size={15} /> {t('calendar.form.delete')}
            </button>
          ) : null}
          {!form.uid || canUpdate ? (
            <button type="button" disabled={!draft || agenda.busy} onClick={() => void submit()} className="mt-2 w-full rounded-xl bg-emerald-400 px-3 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-40">
              {agenda.busy ? t('calendar.form.saving') : t('calendar.form.save')}
            </button>
          ) : null}
        </section>
      ) : (
        <>
          <section className="context-content-surface rounded-[clamp(1.25rem,4.6vw,2rem)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ui-text-tertiary)]">{t('calendar.panel.range')}</p>
                <h3 className="mt-1 text-lg font-semibold text-[color:var(--ui-text-primary)]">{t('calendar.panel.nextSevenDays')}</h3>
              </div>
              {canCreate ? (
                <button type="button" onClick={() => setForm(initialForm())} className="glass-icon-button h-10 w-10" aria-label={t('calendar.form.new')}>
                  <Plus size={18} />
                </button>
              ) : null}
            </div>
            {!canCreate && !canUpdate && !canDelete ? (
              <p className="mt-3 rounded-xl bg-[color:var(--ui-fill-tertiary)] px-3 py-2 text-[11px] leading-4 text-[color:var(--ui-text-secondary)]">{t('calendar.panel.readOnly')}</p>
            ) : null}
          </section>

          {agenda.status === 'loading' ? (
            <div className="context-content-surface rounded-2xl p-4 text-sm text-[color:var(--ui-text-secondary)]">{t('calendar.panel.loading')}</div>
          ) : null}
          {agenda.error ? (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-xs leading-5 text-rose-100">{agenda.error}</div>
          ) : null}
          {agenda.status !== 'loading' && groupedEvents.length === 0 ? (
            <div className="context-content-surface rounded-2xl p-5 text-center">
              <CalendarDays className="mx-auto text-[color:var(--ui-text-tertiary)]" size={28} />
              <p className="mt-2 text-sm font-semibold">{t('calendar.panel.empty')}</p>
              <p className="mt-1 text-xs text-[color:var(--ui-text-secondary)]">{t('calendar.panel.emptyDescription')}</p>
            </div>
          ) : null}

          {groupedEvents.map(([dayKey, events]) => {
            const day = toDisplayDate(events[0].start, events[0].allDay);
            return (
              <section key={dayKey} className="context-content-surface rounded-2xl p-3.5">
                <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--ui-text-tertiary)]">
                  {formatDate(day, { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
                <div className="mt-2 space-y-2">
                  {events.map((event) => {
                    const irrigationEvent = isIrrigationCalendarEvent(event);
                    const editable = !irrigationEvent && (canUpdate || canDelete);
                    const start = toDisplayDate(event.start, event.allDay);
                    return (
                      <button
                        key={event.uid}
                        type="button"
                        disabled={!editable}
                        onClick={() => editable && setForm(initialForm(event))}
                        className="flex w-full items-start gap-3 rounded-xl bg-[color:var(--ui-fill-tertiary)] px-3 py-3 text-left disabled:cursor-default"
                      >
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-400/12 text-emerald-300">
                          <Clock3 size={15} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-[color:var(--ui-text-primary)]">{event.summary}</span>
                          <span className="mt-0.5 block text-[10px] text-[color:var(--ui-text-secondary)]">
                            {event.allDay ? t('calendar.event.allDay') : formatDate(start, { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {irrigationEvent ? <span className="mt-1 block text-[9px] font-semibold uppercase tracking-[0.08em] text-emerald-300">{t('calendar.event.irrigationReadOnly')}</span> : null}
                          {event.location ? <span className="mt-1 flex items-center gap-1 truncate text-[10px] text-[color:var(--ui-text-tertiary)]"><MapPin size={10} />{event.location}</span> : null}
                        </span>
                        {editable ? <Pencil size={13} className="mt-1 shrink-0 text-[color:var(--ui-text-tertiary)]" /> : null}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

export default CalendarControls;
