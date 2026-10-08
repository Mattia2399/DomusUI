import type { LucideIcon } from 'lucide-react';
import { IconBadge } from './IconBadge';

export type WeekDay = {
  iso: string;
  date: Date;
};

export type WeekDayBadge = {
  key: string;
  color: string;
  Icon: LucideIcon;
};

const MAX_VISIBLE_BADGES = 3;

export function localIsoDay(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

/** Today and the six following days, each at local noon to stay clear of DST edges. */
export function nextSevenDays(reference = new Date()): WeekDay[] {
  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(reference);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + offset);
    return { iso: localIsoDay(date), date };
  });
}

/**
 * Seven day tiles marking each day's events; the selected day is highlighted
 * and its details are rendered by the caller. Wide tiles show icon badges,
 * narrow ones (side panels, phones) fall back to plain colored dots so the
 * marks never spill outside the tile.
 */
export function WeekDayStrip({
  days,
  badgesByDay,
  selectedDay,
  onSelectDay,
  ariaLabel,
  dayAccessibleName,
  locale,
}: {
  days: WeekDay[];
  badgesByDay: ReadonlyMap<string, WeekDayBadge[]>;
  selectedDay: string;
  onSelectDay: (iso: string) => void;
  ariaLabel: string;
  dayAccessibleName: (day: WeekDay) => string;
  locale: string;
}) {
  const weekdayShort = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const today = days[0]?.iso;
  return (
    <div className="grid grid-cols-7 gap-1 sm:gap-2" role="group" aria-label={ariaLabel}>
      {days.map((day) => {
        const badges = badgesByDay.get(day.iso) ?? [];
        const selected = day.iso === selectedDay;
        return (
          <button
            key={day.iso}
            type="button"
            aria-pressed={selected}
            aria-label={dayAccessibleName(day)}
            onClick={() => onSelectDay(day.iso)}
            className={`@container flex min-h-[5.25rem] min-w-0 flex-col items-center gap-1 overflow-hidden rounded-2xl px-0.5 pb-2.5 pt-2 transition-colors ${selected ? 'bg-[color:var(--ui-accent)] text-white shadow-lg' : 'bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-primary)]'}`}
          >
            <span className={`text-[10px] font-semibold uppercase tracking-wide ${selected ? 'text-white/80' : day.iso === today ? 'text-[color:var(--ui-accent)]' : 'text-[color:var(--ui-text-tertiary)]'}`}>{weekdayShort.format(day.date).replace('.', '')}</span>
            <span className="text-lg font-semibold leading-none">{day.date.getDate()}</span>
            <span aria-hidden="true" className="mt-auto hidden h-[1.125rem] max-w-full items-center justify-center -space-x-1.5 @min-[3.75rem]:flex">
              {badges.slice(0, MAX_VISIBLE_BADGES).map((badge) => (
                <IconBadge key={badge.key} Icon={badge.Icon} color={badge.color} size={18} className={selected ? 'ring-2 ring-[color:var(--ui-accent)]' : 'ring-2 ring-[color:var(--ui-bg-elevated)]'} />
              ))}
            </span>
            <span aria-hidden="true" className="mt-auto flex h-[1.125rem] max-w-full items-center justify-center gap-[3px] @min-[3.75rem]:hidden">
              {badges.slice(0, MAX_VISIBLE_BADGES).map((badge) => (
                <span key={badge.key} className={`h-2 w-2 shrink-0 rounded-full ${selected ? 'ring-[1.5px] ring-white/90' : ''}`} style={{ backgroundColor: badge.color }} />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default WeekDayStrip;
