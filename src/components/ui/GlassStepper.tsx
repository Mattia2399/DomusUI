import React from 'react';
import clsx from 'clsx';
import { Minus, Plus } from 'lucide-react';
import { controlBlocked, controlStateAria, controlStateClass, type GlassControlState } from './glassControl';
import './glassStepper.css';

export type GlassStepperProps = GlassControlState & {
  value: number;
  min: number;
  max: number;
  step?: number;
  onValueChange: (value: number) => void;
  label: string;
  decreaseLabel: string;
  increaseLabel: string;
  /** The value in words: "22 °C". */
  format?: (value: number) => string;
  /** Writes the two limits under the value. */
  showLimits?: boolean;
  className?: string;
};

const REPEAT_AFTER_MS = 420;
const REPEAT_EVERY_MS = 110;

/* The most precise control: − and +, and holding one down repeats it up to the limit. */
export function GlassStepper({ value, min, max, step = 1, onValueChange, label, decreaseLabel, increaseLabel, format = String, showLimits = false, className, disabled, pending, error }: GlassStepperProps) {
  const state = { disabled, pending, error };
  const blocked = controlBlocked(state);
  const latest = React.useRef({ value, onValueChange });
  React.useEffect(() => {
    latest.current = { value, onValueChange };
  });
  const repeat = React.useRef<{ wait: number | null; every: number | null }>({ wait: null, every: null });

  const stop = React.useCallback(() => {
    if (repeat.current.wait !== null) window.clearTimeout(repeat.current.wait);
    if (repeat.current.every !== null) window.clearInterval(repeat.current.every);
    repeat.current = { wait: null, every: null };
  }, []);
  React.useEffect(() => stop, [stop]);

  const move = (direction: 1 | -1) => {
    const current = latest.current.value;
    // Tenths of a degree must not drift: 20.1 + 0.1 stays 20.2.
    const next = Math.round((current + direction * step) * 1000) / 1000;
    if (next < min || next > max) {
      stop();
      return;
    }
    latest.current = { ...latest.current, value: next };
    latest.current.onValueChange(next);
  };

  const hold = (direction: 1 | -1) => ({
    onPointerDown: () => {
      if (blocked) return;
      move(direction);
      stop();
      repeat.current.wait = window.setTimeout(() => {
        repeat.current.every = window.setInterval(() => move(direction), REPEAT_EVERY_MS);
      }, REPEAT_AFTER_MS);
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    // A click from the keyboard has no finger behind it: the finger has already moved the value.
    onClick: (event: React.MouseEvent) => {
      if (event.detail === 0 && !blocked) move(direction);
    },
  });

  const atMin = value - step < min;
  const atMax = value + step > max;

  return (
    <div className={clsx('glass-stepper', controlStateClass(state), className)}>
      <button type="button" className="glass-stepper-button" aria-label={decreaseLabel} disabled={blocked || atMin} {...hold(-1)}>
        <Minus size={20} strokeWidth={2.4} aria-hidden="true" />
      </button>
      <div
        role="spinbutton"
        tabIndex={blocked ? -1 : 0}
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={format(value)}
        aria-disabled={blocked || undefined}
        {...controlStateAria(state)}
        className="glass-stepper-value"
        onKeyDown={(event) => {
          if (blocked) return;
          if (event.key === 'ArrowUp' || event.key === 'ArrowRight') move(1);
          else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') move(-1);
          else return;
          event.preventDefault();
        }}
      >
        <b>{format(value)}</b>
        {showLimits ? (
          <span>
            <span className={clsx(atMin && 'is-reached')}>{format(min)}</span>
            <span className={clsx(atMax && 'is-reached')}>{format(max)}</span>
          </span>
        ) : null}
      </div>
      <button type="button" className="glass-stepper-button" aria-label={increaseLabel} disabled={blocked || atMax} {...hold(1)}>
        <Plus size={20} strokeWidth={2.4} aria-hidden="true" />
      </button>
    </div>
  );
}

export default GlassStepper;
