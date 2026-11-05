import React from 'react';
import clsx from 'clsx';
import { controlStateAria, controlStateClass, type GlassControlState } from './glassControl';
import './glassActions.css';

export type GlassRunButtonProps = Pick<GlassControlState, 'disabled' | 'error'> & {
  label: React.ReactNode;
  /** While it runs it cannot be pressed again. */
  running: boolean;
  runningLabel?: React.ReactNode;
  /** How far it has got, from 0 to 100, when that is known: a bar instead of a wheel. */
  progress?: number;
  onPress: () => void;
  /** An action has no large version. */
  size?: 'compact' | 'group';
  className?: string;
};

/* A command that takes time: it shows it is running and stays busy until the end. */
export function GlassRunButton({ label, running, runningLabel, progress, onPress, size = 'group', className, disabled, error }: GlassRunButtonProps) {
  const state = { disabled, pending: running, error };
  const known = running && typeof progress === 'number';
  return (
    <button
      type="button"
      disabled={Boolean(disabled) || running}
      {...controlStateAria(state)}
      className={clsx('glass-run', `is-${size}`, running && 'is-running', disabled && 'glass-is-disabled', error && 'glass-is-error', className)}
      onClick={onPress}
    >
      {known ? <i className="glass-run-bar" aria-hidden="true" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /> : null}
      {running && !known ? <i className="glass-run-wheel" aria-hidden="true" /> : null}
      <b>{running ? runningLabel ?? label : label}</b>
    </button>
  );
}

export default GlassRunButton;
