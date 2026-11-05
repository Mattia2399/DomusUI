import React from 'react';
import clsx from 'clsx';
import { Fan } from 'lucide-react';
import { controlBlocked, controlStateAria, controlStateClass, type GlassControlSize, type GlassControlState } from './glassControl';
import './glassAdvanced.css';

export type GlassFanSpeedProps<T extends string> = GlassControlState & {
  ariaLabel: string;
  /** From the slowest up; a first "Auto" does not count as a speed. */
  options: readonly { value: T; label: React.ReactNode }[];
  value: T | null | undefined;
  onChange: (value: T) => void;
  /** The fan stands still. */
  stopped?: boolean;
  size?: GlassControlSize;
  className?: string;
};

/** How long a turn takes at this step, from 0: the faster the speed, the shorter the turn. */
export const fanTurnSeconds = (index: number, count: number) => (count <= 1 ? 1.2 : 2 - (Math.max(0, index) / (count - 1)) * 1.6);

/* The fan that turns faster with the speed, and the steps to touch. */
export function GlassFanSpeed<T extends string>({ ariaLabel, options, value, onChange, stopped = false, size = 'group', className, disabled, pending, error }: GlassFanSpeedProps<T>) {
  const state = { disabled, pending, error };
  const blocked = controlBlocked(state);
  const index = options.findIndex((option) => option.value === value);
  const move = (direction: 1 | -1) => {
    const next = options[Math.max(0, Math.min(options.length - 1, index + direction))];
    if (next && next.value !== value && !blocked) onChange(next.value);
  };
  return (
    <div className={clsx('glass-fan-speed', `is-${size}`, controlStateClass(state), className)}>
      <i className={clsx(!stopped && index >= 0 && 'is-turning')} aria-hidden="true" style={{ animationDuration: `${fanTurnSeconds(index, options.length)}s` }}>
        <Fan size={size === 'hero' ? 96 : 22} strokeWidth={size === 'hero' ? 1.6 : 2} />
      </i>
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        {...controlStateAria(state)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight' || event.key === 'ArrowUp') move(1);
          else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') move(-1);
          else return;
          event.preventDefault();
        }}
      >
        {options.map((option, position) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            tabIndex={position === Math.max(index, 0) && !blocked ? 0 : -1}
            disabled={blocked}
            className={clsx(option.value === value && 'is-on')}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default GlassFanSpeed;
