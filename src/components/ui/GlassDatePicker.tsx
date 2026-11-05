import React from 'react';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { controlBlocked, controlStateClass, type GlassControlSize, type GlassControlState } from './glassControl';
import './glassText.css';

const pad = (value: number) => String(value).padStart(2, '0');
export const isoDate = (year: number, month: number, day: number) => `${year}-${pad(month + 1)}-${pad(day)}`;

/** The weeks of a month from Monday; null for the days of the other months. */
export function monthGrid(year: number, month: number): (number | null)[] {
  const first = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array.from({ length: first }, () => null);
  for (let day = 1; day <= days; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export type GlassDatePickerProps = GlassControlState & {
  label: string;
  /** YYYY-MM-DD. */
  value: string | null | undefined;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  /** Today, in red; given from outside so that it can be checked. */
  today?: string;
  locale?: string;
  previousLabel: string;
  nextLabel: string;
  size?: GlassControlSize;
  className?: string;
};

/* A month as a grid with today in red and arrows for the months. Dates out of bounds are off. */
export function GlassDatePicker({ label, value, onChange, min, max, today, locale = 'it-IT', previousLabel, nextLabel, size = 'group', className, disabled, pending, error }: GlassDatePickerProps) {
  const state = { disabled, pending, error };
  const blocked = controlBlocked(state);
  const anchor = value ?? today ?? new Date().toISOString().slice(0, 10);
  const [shown, setShown] = React.useState(() => ({ year: Number(anchor.slice(0, 4)), month: Number(anchor.slice(5, 7)) - 1 }));
  const move = (direction: 1 | -1) => setShown(({ year, month }) => {
    const next = new Date(year, month + direction, 1);
    return { year: next.getFullYear(), month: next.getMonth() };
  });
  const names = React.useMemo(() => Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(new Date(2024, 0, 1 + index))), [locale]);
  const title = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(shown.year, shown.month, 1));
  return (
    <div role="group" aria-label={label} className={clsx('glass-date', `is-${size}`, controlStateClass(state), className)}>
      <header>
        <button type="button" aria-label={previousLabel} disabled={blocked} onClick={() => move(-1)}>
          <ChevronLeft size={18} strokeWidth={2.4} aria-hidden="true" />
        </button>
        <b aria-live="polite">{title}</b>
        <button type="button" aria-label={nextLabel} disabled={blocked} onClick={() => move(1)}>
          <ChevronRight size={18} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </header>
      <div>
        {names.map((name, index) => (
          <span key={index} aria-hidden="true">{name}</span>
        ))}
        {monthGrid(shown.year, shown.month).map((day, index) => {
          if (day === null) return <i key={index} aria-hidden="true" />;
          const iso = isoDate(shown.year, shown.month, day);
          const out = (min !== undefined && iso < min) || (max !== undefined && iso > max);
          return (
            <button
              key={iso}
              type="button"
              aria-label={new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(shown.year, shown.month, day))}
              aria-pressed={iso === value}
              disabled={blocked || out}
              className={clsx(iso === value && 'is-on', iso === today && 'is-today')}
              onClick={() => onChange(iso)}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default GlassDatePicker;
