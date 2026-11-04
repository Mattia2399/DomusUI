import React from 'react';
import clsx from 'clsx';
import { controlBlocked, controlStateAria, controlStateClass, type GlassControlState, type GlassTone } from './glassControl';
import { choiceFromKey } from './glassChoice';
import './glassChips.css';

export type GlassChipValue = string | number;

export type GlassChipOption<T extends GlassChipValue> = {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
};

type Common<T extends GlassChipValue> = GlassControlState & {
  options: readonly GlassChipOption<T>[];
  ariaLabel: string;
  /** `dialog` is the lower one, for the two columns of a wide panel. */
  size?: 'default' | 'dialog';
  tone?: GlassTone;
  className?: string;
};

type One<T extends GlassChipValue> = { multiple?: false; value: T | null | undefined; onChange: (value: T) => void };
type Many<T extends GlassChipValue> = { multiple: true; value: readonly T[]; onChange: (value: T[]) => void };

export type GlassChipsProps<T extends GlassChipValue> = Common<T> & (One<T> | Many<T>);

/* Pills that wrap: one choice among them, or several together. */
export function GlassChips<T extends GlassChipValue>(props: GlassChipsProps<T>) {
  const { options, ariaLabel, size = 'default', tone = 'neutral', className, disabled, pending, error } = props;
  const state = { disabled, pending, error };
  const blocked = controlBlocked(state);
  const buttons = React.useRef(new Map<T, HTMLButtonElement>());
  const enabled = options.filter((option) => !option.disabled).map((option) => option.value);

  const many = props.multiple === true ? (props as Many<T>) : null;
  const one = many ? null : (props as One<T>);
  const isOn = (value: T) => (many ? many.value.includes(value) : one?.value === value);
  const press = (value: T) => {
    if (many) many.onChange(many.value.includes(value) ? many.value.filter((entry) => entry !== value) : [...many.value, value]);
    else one?.onChange(value);
  };
  const single = !many;
  const current = one?.value;
  const firstStop = current !== null && current !== undefined && enabled.includes(current) ? current : enabled[0];

  return (
    <div
      role={single ? 'radiogroup' : 'group'}
      aria-label={ariaLabel}
      aria-disabled={blocked || undefined}
      {...controlStateAria(state)}
      className={clsx('glass-chips', size === 'dialog' && 'is-dialog', tone === 'device' && 'is-device', controlStateClass(state), className)}
      onKeyDown={(event) => {
        if (!single || blocked) return;
        const next = choiceFromKey(event.key, enabled, current);
        if (next === undefined) return;
        event.preventDefault();
        press(next);
        buttons.current.get(next)?.focus();
      }}
    >
      {options.map((option) => {
        const on = isOn(option.value);
        return (
          <button
            key={String(option.value)}
            ref={(node) => {
              if (node) buttons.current.set(option.value, node);
              else buttons.current.delete(option.value);
            }}
            type="button"
            role={single ? 'radio' : undefined}
            aria-checked={single ? on : undefined}
            aria-pressed={single ? undefined : on}
            tabIndex={single && option.value !== firstStop ? -1 : undefined}
            disabled={blocked || option.disabled}
            className={clsx('glass-chip', on && 'is-on')}
            onClick={() => press(option.value)}
          >
            {option.icon ? <span aria-hidden="true">{option.icon}</span> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export default GlassChips;
