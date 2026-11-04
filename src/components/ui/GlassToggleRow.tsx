import React from 'react';
import clsx from 'clsx';
import { controlBlocked, controlStateAria, controlStateClass, type GlassControlState } from './glassControl';
import './glassToggleRow.css';

export type GlassToggleRowProps = GlassControlState & {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
};

/* A yes or no as a whole row: icon, title, explanation and the switch. The whole row is the control. */
export function GlassToggleRow({ checked, onChange, title, description, icon, className, disabled, pending, error }: GlassToggleRowProps) {
  const state = { disabled, pending, error };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      {...controlStateAria(state)}
      disabled={controlBlocked(state)}
      className={clsx('glass-toggle-row', controlStateClass(state), className)}
      onClick={() => onChange(!checked)}
    >
      {icon ? (
        <span className={clsx('glass-toggle-row-icon', checked && 'is-on')} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="glass-toggle-row-text">
        <b>{title}</b>
        {description ? <span>{description}</span> : null}
      </span>
      <span className={clsx('ios-glass-switch', checked && 'ios-glass-switch-on')} aria-hidden="true">
        <span className={clsx('ios-glass-switch-thumb', checked ? 'translate-x-5' : 'translate-x-0')} />
      </span>
    </button>
  );
}

export default GlassToggleRow;
