import React from 'react';
import clsx from 'clsx';
import { controlBlocked, controlStateAria, controlStateClass, type GlassControlState } from './glassControl';
import './glassActions.css';

export type GlassStatusPillProps = GlassControlState & {
  label: React.ReactNode;
  /** A short state: "attiva". */
  status?: React.ReactNode;
  icon?: React.ReactNode;
  /** In the colour of the device. */
  active?: boolean;
  onPress: () => void;
  className?: string;
};

/* A pill with icon, name and short state: scenes and scripts at hand in little space. An action, always compact. */
export function GlassStatusPill({ label, status, icon, active = false, onPress, className, disabled, pending, error }: GlassStatusPillProps) {
  const state = { disabled, pending, error };
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={controlBlocked(state)}
      {...controlStateAria(state)}
      className={clsx('glass-status-pill', active && 'is-on', controlStateClass(state), className)}
      onClick={onPress}
    >
      {icon ? <i aria-hidden="true">{icon}</i> : null}
      <b>{label}</b>
      {status ? <span>{status}</span> : null}
    </button>
  );
}

export default GlassStatusPill;
