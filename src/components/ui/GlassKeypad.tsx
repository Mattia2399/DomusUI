import React from 'react';
import clsx from 'clsx';
import { Delete } from 'lucide-react';
import { controlBlocked, controlStateClass, type GlassControlSize, type GlassControlState } from './glassControl';
import './glassText.css';

export type GlassKeypadProps = GlassControlState & {
  label: string;
  /** What it starts from. */
  value?: string;
  onSubmit: (value: string) => void;
  unit?: React.ReactNode;
  /** Covers what is typed, for a code. */
  masked?: boolean;
  maxLength?: number;
  deleteLabel: string;
  confirmLabel: string;
  size?: GlassControlSize;
  className?: string;
};

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/* Large keys to enter a number or a code without the keyboard of the phone. */
export function GlassKeypad({ label, value = '', onSubmit, unit, masked = false, maxLength = 8, deleteLabel, confirmLabel, size = 'group', className, disabled, pending, error }: GlassKeypadProps) {
  const state = { disabled, pending, error };
  const blocked = controlBlocked(state);
  const [typed, setTyped] = React.useState(value);
  React.useEffect(() => setTyped(value), [value]);
  const press = (digit: string) => {
    if (!blocked) setTyped((current) => (current.length < maxLength ? current + digit : current));
  };
  return (
    <div
      role="group"
      aria-label={label}
      className={clsx('glass-keypad', `is-${size}`, controlStateClass(state), className)}
      onKeyDown={(event) => {
        if (/^\d$/.test(event.key)) press(event.key);
        else if (event.key === 'Backspace') setTyped((current) => current.slice(0, -1));
        else return;
        event.preventDefault();
      }}
    >
      <output aria-live={masked ? 'off' : 'polite'}>
        <b>{masked ? '•'.repeat(typed.length) : typed || '–'}</b>
        {unit ? <span>{unit}</span> : null}
      </output>
      <div>
        {DIGITS.map((digit) => (
          <button key={digit} type="button" disabled={blocked} onClick={() => press(digit)}>
            {digit}
          </button>
        ))}
        <button type="button" aria-label={deleteLabel} disabled={blocked || !typed} onClick={() => setTyped((current) => current.slice(0, -1))}>
          <Delete size={20} aria-hidden="true" />
        </button>
        <button type="button" disabled={blocked} onClick={() => press('0')}>
          0
        </button>
        <button type="button" className="is-confirm" disabled={blocked || !typed} onClick={() => onSubmit(typed)}>
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}

export default GlassKeypad;
