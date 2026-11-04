import React from 'react';
import clsx from 'clsx';
import { controlBlocked, controlStateAria, controlStateClass, type GlassControlState, type GlassTone } from './glassControl';
import { choiceFromKey } from './glassChoice';
import './glassTiles.css';

export type GlassTileOption<T extends string> = {
  value: T;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
};

export type GlassTilesProps<T extends string> = GlassControlState & {
  options: readonly GlassTileOption<T>[];
  value: T | null | undefined;
  onChange: (value: T) => void;
  ariaLabel: string;
  tone?: GlassTone;
  className?: string;
};

/* Tiles with an icon and a name for the modes of a device, four to a row. */
export function GlassTiles<T extends string>({ options, value, onChange, ariaLabel, tone = 'device', className, disabled, pending, error }: GlassTilesProps<T>) {
  const state = { disabled, pending, error };
  const blocked = controlBlocked(state);
  const buttons = React.useRef(new Map<T, HTMLButtonElement>());
  const enabled = options.filter((option) => !option.disabled).map((option) => option.value);
  const firstStop = value && enabled.includes(value) ? value : enabled[0];

  return (
    <div className={clsx('glass-tiles-box', className)}>
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        aria-disabled={blocked || undefined}
        {...controlStateAria(state)}
        className={clsx('glass-tiles', tone === 'device' && 'is-device', controlStateClass(state))}
        onKeyDown={(event) => {
          if (blocked) return;
          const next = choiceFromKey(event.key, enabled, value);
          if (next === undefined) return;
          event.preventDefault();
          onChange(next);
          buttons.current.get(next)?.focus();
        }}
      >
        {options.map((option) => {
          const on = option.value === value;
          return (
            <button
              key={option.value}
              ref={(node) => {
                if (node) buttons.current.set(option.value, node);
                else buttons.current.delete(option.value);
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={option.value === firstStop ? 0 : -1}
              disabled={blocked || option.disabled}
              className={clsx('glass-tile', on && 'is-on')}
              onClick={() => onChange(option.value)}
            >
              <span aria-hidden="true">{option.icon}</span>
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default GlassTiles;
