import { useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CloudRain,
  Settings2,
  Sprout,
  TriangleAlert,
} from 'lucide-react';
import { useI18n } from '../../../i18n/I18nProvider';

export type IrrigationCalendarZone = {
  id: string;
  name: string;
  icon: LucideIcon;
  days: string[];
  startTimes: string[];
  durationMin: number;
  scheduleEnabled: boolean;
  available: boolean;
  running: boolean;
};

type IrrigationCalendarPageProps = {
  zones: IrrigationCalendarZone[];
  rainProtectionActive: boolean;
  rainDetected: boolean;
  onOpenProgram: (zoneId: string) => void;
  onOpenSettings?: () => void;
};

const DAY_TOKENS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function startOfWeek(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const offsetFromMonday = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - offsetFromMonday);
  return result;
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatWeekRange(days: Date[], locale: string) {
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return '';
  const firstLabel = first.toLocaleDateString(locale, { day: 'numeric', month: first.getMonth() === last.getMonth() ? undefined : 'short' });
  const lastLabel = last.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  return `${firstLabel} – ${lastLabel}`;
}

export function IrrigationCalendarPage({
  zones,
  rainProtectionActive,
  rainDetected,
  onOpenProgram,
  onOpenSettings,
}: IrrigationCalendarPageProps) {
  const { locale, t } = useI18n();
  const today = useMemo(() => new Date(), []);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState(() => dateKey(today));

  const weekDays = useMemo(() => {
    const firstDay = startOfWeek(today);
    firstDay.setDate(firstDay.getDate() + weekOffset * 7);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(firstDay);
      date.setDate(firstDay.getDate() + index);
      return date;
    });
  }, [today, weekOffset]);

  const eventsByDate = useMemo(() => {
    const result = new Map<string, Array<IrrigationCalendarZone & { time: string }>>();
    weekDays.forEach((day) => {
      const key = dateKey(day);
      const token = DAY_TOKENS[day.getDay()];
      const events = zones
        .filter((zone) => zone.days.includes(token))
        .flatMap((zone) => zone.startTimes.map((time) => ({ ...zone, time })))
        .sort((first, second) => first.time.localeCompare(second.time));
      result.set(key, events);
    });
    return result;
  }, [weekDays, zones]);

  const selectedDay = weekDays.find((day) => dateKey(day) === selectedDate) ?? weekDays[0];
  const selectedEvents = eventsByDate.get(dateKey(selectedDay)) ?? [];
  const totalWeekEvents = Array.from(eventsByDate.values()).reduce((total, events) => total + events.length, 0);
  const isCurrentWeek = weekOffset === 0;

  const changeWeek = (nextOffset: number) => {
    setWeekOffset(nextOffset);
    const nextWeekStart = startOfWeek(today);
    nextWeekStart.setDate(nextWeekStart.getDate() + nextOffset * 7);
    setSelectedDate(nextOffset === 0 ? dateKey(today) : dateKey(nextWeekStart));
  };

  return (
    <div className="space-y-4">
      <section className="rounded-[1.65rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] p-3.5 shadow-[var(--ui-shadow-card)] sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => changeWeek(weekOffset - 1)} className="liquid-glass-control flex h-10 w-10 shrink-0 items-center justify-center rounded-full" aria-label={t('irrigation.calendar.previousWeek')}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 text-center">
            <p className="truncate text-sm font-semibold capitalize">{formatWeekRange(weekDays, locale)}</p>
            <button type="button" onClick={() => changeWeek(0)} className="mt-0.5 text-[10px] font-semibold text-[color:var(--app-workspace-accent)] disabled:text-[color:var(--ui-text-tertiary)]" disabled={isCurrentWeek}>
              {isCurrentWeek ? t('irrigation.calendar.currentWeek') : t('irrigation.calendar.today')}
            </button>
          </div>
          <button type="button" onClick={() => changeWeek(weekOffset + 1)} className="liquid-glass-control flex h-10 w-10 shrink-0 items-center justify-center rounded-full" aria-label={t('irrigation.calendar.nextWeek')}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1.5" role="tablist" aria-label={t('irrigation.calendar.days')}>
          {weekDays.map((day) => {
            const key = dateKey(day);
            const selected = key === dateKey(selectedDay);
            const isToday = key === dateKey(today);
            const eventCount = eventsByDate.get(key)?.length ?? 0;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setSelectedDate(key)}
                className={`relative flex min-w-0 flex-col items-center rounded-[1rem] px-1 py-2.5 transition-colors ${selected ? 'bg-[color:var(--app-workspace-accent)] text-[#06281b] shadow-[var(--ui-shadow-control)]' : 'bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]'}`}
              >
                <span className="text-[9px] font-semibold uppercase">{day.toLocaleDateString(locale, { weekday: 'narrow' })}</span>
                <span className="mt-1 text-sm font-semibold tabular-nums">{day.getDate()}</span>
                <span className={`mt-1 h-1 w-1 rounded-full ${eventCount ? selected ? 'bg-[#06281b]' : 'bg-[color:var(--app-workspace-accent)]' : 'bg-transparent'}`} />
                {isToday ? <span className="sr-only">{t('irrigation.calendar.todayA11y')}</span> : null}
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex h-[19rem] min-h-0 flex-col rounded-[1.65rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] p-4 shadow-[var(--ui-shadow-card)] sm:h-[20rem] sm:p-5">
        <div className="shrink-0 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--ui-text-tertiary)]">{t('irrigation.calendar.programming')}</p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.035em] capitalize">
              {selectedDay.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
            </h2>
          </div>
          <span className="rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-2.5 py-1 text-[10px] font-semibold text-[color:var(--ui-text-secondary)]">{selectedEvents.length}</span>
        </div>

        {rainProtectionActive && rainDetected ? (
          <div className="mt-4 flex shrink-0 items-start gap-3 rounded-[1.2rem] border border-sky-400/20 bg-sky-400/10 p-3.5">
            <CloudRain className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />
            <div><p className="text-xs font-semibold">{t('irrigation.calendar.rainTitle')}</p><p className="mt-0.5 text-[10px] leading-4 text-[color:var(--ui-text-secondary)]">{t('irrigation.calendar.rainDescription')}</p></div>
          </div>
        ) : null}

        {selectedEvents.length ? (
          <div className="custom-scrollbar mt-4 min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]">
            {selectedEvents.map((event) => {
              const Icon = event.icon ?? Sprout;
              const blockedByRain = rainProtectionActive && rainDetected;
              const unavailable = !event.available;
              const disabled = !event.scheduleEnabled;
              const status = blockedByRain ? t('irrigation.calendar.rainPaused') : unavailable ? t('irrigation.calendar.unavailable') : disabled ? t('irrigation.calendar.disabled') : t('irrigation.calendar.scheduled');
              return (
                <button
                  key={`${event.id}-${event.time}`}
                  type="button"
                  onClick={() => onOpenProgram(event.id)}
                  className="flex w-full items-center gap-3 rounded-[1.3rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] p-3 text-left transition-transform active:scale-[0.99] sm:p-3.5"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-lime-500/12 text-lime-700 dark:text-lime-300"><Icon className="h-[1.1rem] w-[1.1rem]" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{event.name}</span>
                    <span className="mt-0.5 block truncate text-[10px] text-[color:var(--ui-text-secondary)]">{status}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold tabular-nums">{event.time}</span>
                    <span className="mt-0.5 block text-[10px] text-[color:var(--ui-text-secondary)]">{event.durationMin} min</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 flex min-h-0 flex-1 flex-col items-center justify-center rounded-[1.3rem] bg-[color:var(--ui-fill-tertiary)] px-5 text-center">
            <CalendarDays className="h-6 w-6 text-[color:var(--ui-text-tertiary)]" />
            <p className="mt-3 text-sm font-semibold">{t('irrigation.schedule.empty')}</p>
            <p className="mt-1 max-w-xs text-[11px] leading-4 text-[color:var(--ui-text-secondary)]">{t('irrigation.calendar.emptyDescription')}</p>
          </div>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-[1.4rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] p-4 shadow-[var(--ui-shadow-control)]">
          <Clock3 className="h-4 w-4 text-[color:var(--app-workspace-accent)]" />
          <p className="mt-3 text-xl font-semibold tracking-[-0.04em]">{totalWeekEvents}</p>
          <p className="mt-0.5 text-[10px] text-[color:var(--ui-text-secondary)]">{t('irrigation.calendar.cyclesWeek')}</p>
        </div>
        <button type="button" onClick={onOpenSettings} disabled={!onOpenSettings} className="rounded-[1.4rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-primary)] p-4 text-left shadow-[var(--ui-shadow-control)] disabled:opacity-55">
          {onOpenSettings ? <Settings2 className="h-4 w-4 text-[color:var(--app-workspace-accent)]" /> : <TriangleAlert className="h-4 w-4 text-amber-500" />}
          <p className="mt-3 text-sm font-semibold">{t('irrigation.calendar.manage')}</p>
          <p className="mt-0.5 text-[10px] text-[color:var(--ui-text-secondary)]">{onOpenSettings ? t('irrigation.calendar.editHint') : t('irrigation.calendar.permission')}</p>
        </button>
      </section>
    </div>
  );
}

export default IrrigationCalendarPage;
