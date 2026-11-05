import React from 'react';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { controlBlocked, controlStateAria, controlStateClass, type GlassControlSize, type GlassControlState } from './glassControl';
import './glassValues.css';

export type GlassArrowsProps<T extends string> = GlassControlState & {
  ariaLabel: string;
  previousLabel: string;
  nextLabel: string;
  options: readonly { value: T; label: React.ReactNode }[];
  value: T | null | undefined;
  onChange: (value: T) => void;
  size?: GlassControlSize;
  className?: string;
};

/* The least space a choice can take: arrows to walk through the options. They stop at the ends. */
export function GlassArrows<T extends string>({ ariaLabel, previousLabel, nextLabel, options, value, onChange, size = 'group', className, disabled, pending, error }: GlassArrowsProps<T>) {
  const state = { disabled, pending, error };
  const blocked = controlBlocked(state);
  const index = options.findIndex((option) => option.value === value);
  const go = (direction: 1 | -1) => {
    const next = options[Math.max(index, direction === 1 ? -1 : 0) + direction];
    if (next && !blocked) onChange(next.value);
  };
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      tabIndex={blocked ? -1 : 0}
      {...controlStateAria(state)}
      className={clsx('glass-arrows', `is-${size}`, controlStateClass(state), className)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') go(1);
        else if (event.key === 'ArrowLeft') go(-1);
        else return;
        event.preventDefault();
      }}
    >
      <button type="button" tabIndex={-1} aria-label={previousLabel} disabled={blocked || index <= 0} onClick={() => go(-1)}>
        <ChevronLeft size={size === 'hero' ? 28 : 18} strokeWidth={2.4} aria-hidden="true" />
      </button>
      <output aria-live="polite">{options[index]?.label ?? '–'}</output>
      <button type="button" tabIndex={-1} aria-label={nextLabel} disabled={blocked || index >= options.length - 1} onClick={() => go(1)}>
        <ChevronRight size={size === 'hero' ? 28 : 18} strokeWidth={2.4} aria-hidden="true" />
      </button>
    </div>
  );
}

export default GlassArrows;
