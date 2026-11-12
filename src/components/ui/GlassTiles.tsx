import React from 'react';
import clsx from 'clsx';
import { Check } from 'lucide-react';
import { controlBlocked, controlStateAria, controlStateClass, type GlassControlState, type GlassTone } from './glassControl';
import { choiceFromKey } from './glassChoice';
import './glassTiles.css';

export type GlassTileOption<T extends string> = {
  value: T;
  label: string;
  icon: React.ReactNode;
  /** One line of explanation, in the large version. */
  note?: React.ReactNode;
  disabled?: boolean;
};

export type GlassTilesProps<T extends string> = GlassControlState & {
  options: readonly GlassTileOption<T>[];
  value: T | null | undefined;
  onChange: (value: T) => void;
  ariaLabel: string;
  /**
   * `hero` fills the space it is given: tall tiles that share its height.
   * `choice`: one glass tile per line, as the modes in a sheet (docs/design/app/sicurezza.html .mode).
   */
  size?: 'default' | 'hero' | 'choice';
  tone?: GlassTone;
  className?: string;
};

/* Tiles with an icon and a name for the modes of a device, four to a row; or, large, sharing all the height there is. */
export function GlassTiles<T extends string>({ options, value, onChange, ariaLabel, size = 'default', tone = 'device', className, disabled, pending, error }: GlassTilesProps<T>) {
  const state = { disabled, pending, error };
  const blocked = controlBlocked(state);
  const buttons = React.useRef(new Map<T, HTMLButtonElement>());
  const enabled = options.filter((option) => !option.disabled).map((option) => option.value);
  const firstStop = value && enabled.includes(value) ? value : enabled[0];
  const wide = size !== 'default';

  return (
    <div className={clsx('glass-tiles-box', size === 'hero' && 'is-hero', className)}>
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        aria-disabled={blocked || undefined}
        {...controlStateAria(state)}
        className={clsx('glass-tiles', wide && `is-${size}`, size === 'hero' && options.length > 3 && 'is-two-wide', tone === 'device' && 'is-device', controlStateClass(state))}
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
              <span className="glass-tile-icon" aria-hidden="true">{option.icon}</span>
              <span className="glass-tile-name">{option.label}</span>
              {wide && option.note ? <span className="glass-tile-note">{option.note}</span> : null}
              {wide && on ? <Check className="glass-tile-check" size={20} strokeWidth={2.6} aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default GlassTiles;
