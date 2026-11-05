import React from 'react';
import clsx from 'clsx';
import { controlBlocked, controlStateAria, controlStateClass, type GlassControlState } from './glassControl';
import './glassValues.css';

export type GlassLedRowProps = GlassControlState & {
  on: boolean;
  title: React.ReactNode;
  note?: React.ReactNode;
  /** What the light means when it is on. */
  tone?: 'ok' | 'warn' | 'bad';
  blink?: boolean;
  /** Without it the row is only to read, as for a sensor. */
  onChange?: (on: boolean) => void;
  /** An action has no large version. */
  size?: 'compact' | 'group';
  className?: string;
};

/* A row with a small light that comes on with the state: a yes or no worth seeing from afar. */
export function GlassLedRow({ on, title, note, tone = 'ok', blink = false, onChange, size = 'group', className, disabled, pending, error }: GlassLedRowProps) {
  const state = { disabled, pending, error };
  const body = (
    <>
      <i className={clsx('glass-led-row-light', on && `is-${tone}`, on && blink && 'is-blinking')} aria-hidden="true" />
      <span>
        <b>{title}</b>
        {note ? <span>{note}</span> : null}
      </span>
    </>
  );
  const classes = clsx('glass-led-row', `is-${size}`, controlStateClass(state), className);
  if (!onChange) return <div className={classes}>{body}</div>;
  return (
    <button type="button" role="switch" aria-checked={on} {...controlStateAria(state)} disabled={controlBlocked(state)} className={classes} onClick={() => onChange(!on)}>
      {body}
    </button>
  );
}

export default GlassLedRow;
