import React from 'react';
import clsx from 'clsx';
import { controlBlocked, controlStateAria, controlStateClass, type GlassControlSize, type GlassControlState } from './glassControl';
import './glassValues.css';

export type GlassLevelsProps = GlassControlState & {
  ariaLabel: string;
  /** From the lowest up. */
  levels: readonly { value: number; label: React.ReactNode }[];
  value: number | null | undefined;
  onChange: (value: number) => void;
  size?: GlassControlSize;
  className?: string;
};

/* Levels as blocks: touch one or run a finger over them. As the protagonist they stand in a column, the lowest at the bottom. */
export function GlassLevels({ ariaLabel, levels, value, onChange, size = 'group', className, disabled, pending, error }: GlassLevelsProps) {
  const state = { disabled, pending, error };
  const blocked = controlBlocked(state);
  const index = levels.findIndex((level) => level.value === value);
  const pick = (next: number) => {
    if (!blocked && next !== value) onChange(next);
  };
  const walk = (direction: 1 | -1) => {
    const next = levels[Math.max(0, Math.min(levels.length - 1, index + direction))];
    if (next) pick(next.value);
  };
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      {...controlStateAria(state)}
      className={clsx('glass-levels', `is-${size}`, controlStateClass(state), className)}
      onPointerMove={(event) => {
        if (event.buttons === 0) return;
        const under = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-glass-level]');
        if (under && event.currentTarget.contains(under)) pick(Number(under.dataset.glassLevel));
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowUp') walk(1);
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') walk(-1);
        else return;
        event.preventDefault();
      }}
    >
      {levels.map((level, position) => (
        <button
          key={level.value}
          type="button"
          role="radio"
          aria-checked={level.value === value}
          tabIndex={position === Math.max(index, 0) && !blocked ? 0 : -1}
          disabled={blocked}
          data-glass-level={level.value}
          className={clsx(position <= index && 'is-reached', level.value === value && 'is-on')}
          onClick={() => pick(level.value)}
        >
          {level.label}
        </button>
      ))}
    </div>
  );
}

export default GlassLevels;
