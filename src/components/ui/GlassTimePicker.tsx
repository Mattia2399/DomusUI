import React from 'react';
import clsx from 'clsx';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { controlBlocked, controlStateClass, type GlassControlSize, type GlassControlState } from './glassControl';
import './glassText.css';

const pad = (value: number) => String(value).padStart(2, '0');

/** Hours and minutes from HH:MM; what cannot be read counts as midnight. */
export function readTime(value: string | null | undefined) {
  const [hours, minutes] = (value ?? '').split(':').map(Number);
  return { hours: Number.isInteger(hours) && hours >= 0 && hours < 24 ? hours : 0, minutes: Number.isInteger(minutes) && minutes >= 0 && minutes < 60 ? minutes : 0 };
}

/** The time moved by some minutes, round the clock. */
export function shiftTime(value: string | null | undefined, minutes: number) {
  const time = readTime(value);
  const total = (((time.hours * 60 + time.minutes + minutes) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

export type GlassTimePickerProps = GlassControlState & {
  label: string;
  /** HH:MM. */
  value: string | null | undefined;
  onChange: (value: string) => void;
  /** How far the minutes move: 1, 5 or 15. */
  stepMinutes?: number;
  hoursLabel: string;
  minutesLabel: string;
  moreLabel: string;
  lessLabel: string;
  size?: GlassControlSize;
  className?: string;
};

/* Hours and minutes with arrows up and down. They go round the clock. */
export function GlassTimePicker({ label, value, onChange, stepMinutes = 5, hoursLabel, minutesLabel, moreLabel, lessLabel, size = 'group', className, disabled, pending, error }: GlassTimePickerProps) {
  const state = { disabled, pending, error };
  const blocked = controlBlocked(state);
  const time = readTime(value);
  const go = (minutes: number) => {
    if (!blocked) onChange(shiftTime(value, minutes));
  };
  const column = (name: string, shown: number, amount: number) => (
    <div className="glass-time-column">
      <button type="button" aria-label={`${moreLabel}: ${name}`} disabled={blocked} onClick={() => go(amount)}>
        <ChevronUp size={size === 'hero' ? 28 : 18} strokeWidth={2.4} aria-hidden="true" />
      </button>
      <b
        role="spinbutton"
        tabIndex={blocked ? -1 : 0}
        aria-label={name}
        aria-valuenow={shown}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp') go(amount);
          else if (event.key === 'ArrowDown') go(-amount);
          else return;
          event.preventDefault();
        }}
      >
        {pad(shown)}
      </b>
      <button type="button" aria-label={`${lessLabel}: ${name}`} disabled={blocked} onClick={() => go(-amount)}>
        <ChevronDown size={size === 'hero' ? 28 : 18} strokeWidth={2.4} aria-hidden="true" />
      </button>
    </div>
  );
  return (
    <div role="group" aria-label={label} className={clsx('glass-time', `is-${size}`, controlStateClass(state), className)}>
      {column(hoursLabel, time.hours, 60)}
      <span aria-hidden="true">:</span>
      {column(minutesLabel, time.minutes, stepMinutes)}
    </div>
  );
}

export default GlassTimePicker;
