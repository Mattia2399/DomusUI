import React from 'react';
import clsx from 'clsx';
import { controlBlocked, controlStateAria, controlStateClass, type GlassControlState } from './glassControl';
import './glassValues.css';

export type GlassToggleCardProps = GlassControlState & {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: React.ReactNode;
  /** What it says while on and off; both are read together with the title. */
  status: React.ReactNode;
  icon?: React.ReactNode;
  /** An action has no large version. */
  size?: 'compact' | 'group';
  className?: string;
};

/* A small card in the panel: icon, name and state. On, it turns light like the cards of the Home. */
export function GlassToggleCard({ checked, onChange, title, status, icon, size = 'group', className, disabled, pending, error }: GlassToggleCardProps) {
  const state = { disabled, pending, error };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      {...controlStateAria(state)}
      disabled={controlBlocked(state)}
      className={clsx('glass-toggle-card', `is-${size}`, checked && 'is-on', controlStateClass(state), className)}
      onClick={() => onChange(!checked)}
    >
      {icon ? <i aria-hidden="true">{icon}</i> : null}
      <span>
        <b>{title}</b>
        <span>{status}</span>
      </span>
    </button>
  );
}

export default GlassToggleCard;
