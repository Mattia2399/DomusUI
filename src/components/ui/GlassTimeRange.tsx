import React from 'react';
import clsx from 'clsx';
import { controlBlocked, controlStateAria, controlStateClass, type GlassControlSize, type GlassControlState } from './glassControl';
import { readTime } from './GlassTimePicker';
import './glassText.css';

const DAY = 1440;
const pad = (value: number) => String(value).padStart(2, '0');
const toMinutes = (value: string) => {
  const time = readTime(value);
  return time.hours * 60 + time.minutes;
};
const toTime = (minutes: number) => `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;

/** The parts of the day a band covers, in minutes: two parts when it goes past midnight. */
export function bandParts(from: string, to: string): [number, number][] {
  const start = toMinutes(from);
  const end = toMinutes(to);
  return start <= end ? [[start, end]] : [[0, end], [start, DAY]];
}

export type GlassTimeRangeProps = GlassControlState & {
  fromLabel: string;
  toLabel: string;
  /** HH:MM. */
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  stepMinutes?: number;
  size?: GlassControlSize;
  className?: string;
};

/* The 24 hours as a bar, with a start and an end to drag. It goes past midnight when it must. Two entities: only for the page of the tests for now. */
export function GlassTimeRange({ fromLabel, toLabel, from, to, onChange, stepMinutes = 15, size = 'group', className, disabled, pending, error }: GlassTimeRangeProps) {
  const state = { disabled, pending, error };
  const blocked = controlBlocked(state);
  return (
    <div className={clsx('glass-time-range', `is-${size}`, controlStateClass(state), className)}>
      <output>
        {from} – {to}
      </output>
      <div className="glass-time-range-track">
        {bandParts(from, to).map(([start, end]) => (
          <i key={start} aria-hidden="true" style={{ left: `${(start / DAY) * 100}%`, right: `${100 - (end / DAY) * 100}%` }} />
        ))}
        <input type="range" aria-label={fromLabel} aria-valuetext={from} {...controlStateAria(state)} min={0} max={DAY - stepMinutes} step={stepMinutes} value={toMinutes(from)} disabled={blocked} onChange={(event) => onChange(toTime(Number(event.target.value)), to)} />
        <input type="range" aria-label={toLabel} aria-valuetext={to} {...controlStateAria(state)} min={0} max={DAY - stepMinutes} step={stepMinutes} value={toMinutes(to)} disabled={blocked} onChange={(event) => onChange(from, toTime(Number(event.target.value)))} />
      </div>
      <p aria-hidden="true">
        {[0, 6, 12, 18, 24].map((hour) => (
          <span key={hour}>{hour}</span>
        ))}
      </p>
    </div>
  );
}

export default GlassTimeRange;
