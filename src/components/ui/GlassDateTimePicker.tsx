import React from 'react';
import clsx from 'clsx';
import type { GlassControlSize, GlassControlState } from './glassControl';
import { controlStateClass } from './glassControl';
import { GlassDatePicker, type GlassDatePickerProps } from './GlassDatePicker';
import { GlassTimePicker, type GlassTimePickerProps } from './GlassTimePicker';
import './glassText.css';

type Shared = Pick<GlassDatePickerProps, 'min' | 'max' | 'today' | 'locale' | 'previousLabel' | 'nextLabel'> & Pick<GlassTimePickerProps, 'stepMinutes' | 'hoursLabel' | 'minutesLabel' | 'moreLabel' | 'lessLabel'>;

export type GlassDateTimePickerProps = GlassControlState & Shared & {
  label: string;
  dateLabel: string;
  timeLabel: string;
  /** YYYY-MM-DD and HH:MM. */
  date: string | null | undefined;
  time: string | null | undefined;
  /** How the date is said in its pill. */
  dateText: React.ReactNode;
  onChange: (date: string, time: string) => void;
  size?: GlassControlSize;
  className?: string;
};

/* Two pills, date and time. Touching one opens its picker below; one open at a time. */
export function GlassDateTimePicker({ label, dateLabel, timeLabel, date, time, dateText, onChange, min, max, today, locale, previousLabel, nextLabel, stepMinutes, hoursLabel, minutesLabel, moreLabel, lessLabel, size = 'group', className, disabled, pending, error }: GlassDateTimePickerProps) {
  const state = { disabled, pending, error };
  const [open, setOpen] = React.useState<'date' | 'time' | null>(size === 'hero' ? 'date' : null);
  const fallbackDate = date ?? today ?? new Date().toISOString().slice(0, 10);
  const fallbackTime = time ?? '00:00';
  const pill = (which: 'date' | 'time', name: string, text: React.ReactNode) => (
    <button type="button" aria-expanded={open === which} disabled={Boolean(disabled || pending)} className={clsx(open === which && 'is-open')} onClick={() => setOpen(open === which ? null : which)}>
      <span>{name}</span>
      <b>{text}</b>
    </button>
  );
  return (
    <div role="group" aria-label={label} className={clsx('glass-datetime', `is-${size}`, controlStateClass(state), className)}>
      <div className="glass-datetime-pills">
        {pill('date', dateLabel, dateText)}
        {pill('time', timeLabel, fallbackTime)}
      </div>
      {open === 'date' ? (
        <GlassDatePicker label={dateLabel} value={date} onChange={(next) => onChange(next, fallbackTime)} min={min} max={max} today={today} locale={locale} previousLabel={previousLabel} nextLabel={nextLabel} size={size} disabled={disabled} pending={pending} />
      ) : null}
      {open === 'time' ? (
        <GlassTimePicker label={timeLabel} value={fallbackTime} onChange={(next) => onChange(fallbackDate, next)} stepMinutes={stepMinutes} hoursLabel={hoursLabel} minutesLabel={minutesLabel} moreLabel={moreLabel} lessLabel={lessLabel} size={size} disabled={disabled} pending={pending} />
      ) : null}
    </div>
  );
}

export default GlassDateTimePicker;
