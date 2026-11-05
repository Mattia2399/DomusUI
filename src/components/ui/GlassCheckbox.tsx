import React from 'react';
import clsx from 'clsx';
import { Check } from 'lucide-react';
import { controlBlocked, controlStateAria, controlStateClass, type GlassControlState } from './glassControl';
import './glassValues.css';

export type GlassCheckboxProps = GlassControlState & {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: React.ReactNode;
  note?: React.ReactNode;
  /** `compact` is a tighter row. An action has no large version. */
  size?: 'compact' | 'group';
  className?: string;
};

/* A box for a choice of its own, one per row. The whole row is the control. */
export function GlassCheckbox({ checked, onChange, label, note, size = 'group', className, disabled, pending, error }: GlassCheckboxProps) {
  const state = { disabled, pending, error };
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      {...controlStateAria(state)}
      disabled={controlBlocked(state)}
      className={clsx('glass-checkbox', `is-${size}`, checked && 'is-on', controlStateClass(state), className)}
      onClick={() => onChange(!checked)}
    >
      <i aria-hidden="true">{checked ? <Check size={14} strokeWidth={3} /> : null}</i>
      <span>
        <b>{label}</b>
        {note ? <span>{note}</span> : null}
      </span>
    </button>
  );
}

export default GlassCheckbox;
