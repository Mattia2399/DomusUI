import { Clock3, Droplet, Trash2, type LucideIcon } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import type { CalendarAgendaController } from '../../hooks/useCalendarAgenda';
import {
  isIrrigationCalendarEvent,
  isWasteCalendarEvent,
  wasteTypeStyleForEvent,
  type CalendarAgendaEvent,
  type CalendarEventDraft,
  type WasteTypeStyleMap,
} from '../../services/calendarClient';
import { resolveWasteTypeIcon } from '../waste/wasteTypeIcons';

/* The form of a calendar event and the look of an event, for every calendar panel. */

export type EventFormState = {
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

export function toDisplayDate(value: string, allDay = false) {
  const source = allDay && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T12:00:00`
    : value;
  return new Date(source);
}

const EVENT_COLOR = '#a78bfa';
const IRRIGATION_COLOR = '#34d399';
const WASTE_FALLBACK_COLOR = '#f59e0b';

export function eventLook(event: CalendarAgendaEvent, wasteTypes: WasteTypeStyleMap): { color: string; Icon: LucideIcon } {
  if (isWasteCalendarEvent(event)) {
    const style = wasteTypeStyleForEvent(event, wasteTypes);
    return { color: style?.color ?? WASTE_FALLBACK_COLOR, Icon: resolveWasteTypeIcon(style?.icon) };
  }
  if (isIrrigationCalendarEvent(event)) return { color: IRRIGATION_COLOR, Icon: Droplet };
  return { color: EVENT_COLOR, Icon: Clock3 };
}

export function initialForm(event?: CalendarAgendaEvent): EventFormState {
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

export function toDraft(form: EventFormState): CalendarEventDraft | null {
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

export function CalendarEventForm({
  form,
  agenda,
  canUpdate,
  canDelete,
  onChange,
  onDone,
}: {
  form: EventFormState;
  agenda: CalendarAgendaController;
  canUpdate: boolean;
  canDelete: boolean;
  onChange: (form: EventFormState) => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const draft = toDraft(form);

  const submit = async () => {
    if (!draft) return;
    const succeeded = form.uid
      ? await agenda.updateEvent(form.uid, draft)
      : await agenda.createEvent(draft);
    if (succeeded) onDone();
  };

  return (
    <section className="context-content-surface rounded-[clamp(1.25rem,4.6vw,2rem)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ui-text-tertiary)]">
            {form.uid ? t('calendar.form.edit') : t('calendar.form.new')}
          </p>
          <h3 className="mt-1 text-base font-semibold text-[color:var(--ui-text-primary)]">{t('calendar.form.details')}</h3>
        </div>
        <button type="button" onClick={() => onDone()} className="rounded-full bg-[color:var(--ui-fill-tertiary)] px-3 py-1.5 text-xs font-semibold">
          {t('calendar.form.cancel')}
        </button>
      </div>

      <div className="mt-4 space-y-3">
        <label className="block text-xs font-semibold text-[color:var(--ui-text-secondary)]">
          {t('calendar.form.title')}
          <input className="ui-input mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm" value={form.summary} onChange={(event) => onChange({ ...form, summary: event.target.value })} />
        </label>
        <label className="flex items-center justify-between rounded-xl bg-[color:var(--ui-fill-tertiary)] px-3 py-2.5 text-xs font-semibold text-[color:var(--ui-text-secondary)]">
          {t('calendar.form.allDay')}
          <input
            type="checkbox"
            checked={form.allDay}
            onChange={(event) => {
              const allDay = event.target.checked;
              const allDayRange = toAllDayRange(form.start, form.end);
              onChange({
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
            <input type={form.allDay ? 'date' : 'datetime-local'} className="ui-input mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm" value={form.start} onChange={(event) => onChange({ ...form, start: event.target.value })} />
          </label>
          <label className="text-xs font-semibold text-[color:var(--ui-text-secondary)]">
            {t('calendar.form.end')}
            <input type={form.allDay ? 'date' : 'datetime-local'} className="ui-input mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm" value={form.end} onChange={(event) => onChange({ ...form, end: event.target.value })} />
          </label>
        </div>
        <label className="block text-xs font-semibold text-[color:var(--ui-text-secondary)]">
          {t('calendar.form.location')}
          <input className="ui-input mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm" value={form.location} onChange={(event) => onChange({ ...form, location: event.target.value })} />
        </label>
        <label className="block text-xs font-semibold text-[color:var(--ui-text-secondary)]">
          {t('calendar.form.description')}
          <textarea className="ui-input mt-1.5 min-h-20 w-full resize-none rounded-xl px-3 py-2.5 text-sm" value={form.description} onChange={(event) => onChange({ ...form, description: event.target.value })} />
        </label>
      </div>

      {form.uid && canDelete ? (
        <button type="button" disabled={agenda.busy} onClick={async () => { if (await agenda.deleteEvent(form.uid!)) onDone(); }} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2.5 text-sm font-semibold text-rose-200 disabled:opacity-50">
          <Trash2 size={15} /> {t('calendar.form.delete')}
        </button>
      ) : null}
      {!form.uid || canUpdate ? (
        <button type="button" disabled={!draft || agenda.busy} onClick={() => void submit()} className="mt-2 w-full rounded-xl bg-emerald-400 px-3 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-40">
          {agenda.busy ? t('calendar.form.saving') : t('calendar.form.save')}
        </button>
      ) : null}
    </section>
  );
}
