import React from 'react';
import clsx from 'clsx';
import { Plus } from 'lucide-react';
import { controlBlocked, controlStateAria, controlStateClass, type GlassControlState } from './glassControl';
import { choiceFromKey } from './glassChoice';
import './glassSwatches.css';

export type GlassSwatch = {
  value: string;
  /** Any CSS colour. */
  color: string;
  label: string;
};

export type GlassSwatchesProps = GlassControlState & {
  swatches: readonly GlassSwatch[];
  value: string | null | undefined;
  onChange: (value: string) => void;
  ariaLabel: string;
  /** All on one line, however many: they share the width. */
  nowrap?: boolean;
  /** The "+" that saves the colour now, only where something saves it. */
  onAdd?: () => void;
  addLabel?: string;
  className?: string;
};

/* Round colours on an area a finger can hit, with a ring on the one chosen. */
export function GlassSwatches({ swatches, value, onChange, ariaLabel, nowrap = false, onAdd, addLabel, className, disabled, pending, error }: GlassSwatchesProps) {
  const state = { disabled, pending, error };
  const blocked = controlBlocked(state);
  const buttons = React.useRef(new Map<string, HTMLButtonElement>());
  const values = swatches.map((swatch) => swatch.value);
  const firstStop = value && values.includes(value) ? value : values[0];

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={blocked || undefined}
      {...controlStateAria(state)}
      className={clsx('glass-swatches', nowrap && 'is-nowrap', controlStateClass(state), className)}
      onKeyDown={(event) => {
        if (blocked) return;
        const next = choiceFromKey(event.key, values, value);
        if (next === undefined) return;
        event.preventDefault();
        onChange(next);
        buttons.current.get(next)?.focus();
      }}
    >
      {swatches.map((swatch) => {
        const on = swatch.value === value;
        return (
          <button
            key={swatch.value}
            ref={(node) => {
              if (node) buttons.current.set(swatch.value, node);
              else buttons.current.delete(swatch.value);
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={swatch.label}
            tabIndex={swatch.value === firstStop ? 0 : -1}
            disabled={blocked}
            className={clsx('glass-swatch', on && 'is-on')}
            onClick={() => onChange(swatch.value)}
          >
            <span style={{ background: swatch.color, color: swatch.color }} />
          </button>
        );
      })}
      {onAdd ? (
        <button type="button" className="glass-swatch glass-swatch-add" aria-label={addLabel} disabled={blocked} onClick={onAdd}>
          <span>
            <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
          </span>
        </button>
      ) : null}
    </div>
  );
}

export default GlassSwatches;
