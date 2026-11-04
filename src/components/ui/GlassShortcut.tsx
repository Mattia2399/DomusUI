import React from 'react';
import clsx from 'clsx';
import { controlBlocked, controlStateAria, controlStateClass, type GlassControlState, type GlassTone } from './glassControl';
import './glassShortcut.css';

export type GlassShortcutProps = GlassControlState & {
  icon: React.ReactNode;
  label: string;
  /** `opens` shows its controls in place of the row; `acts` does its job at once; `plain` just goes, as Back. */
  kind: 'opens' | 'acts' | 'plain';
  /** Its controls are open, or what it switches is on. */
  on?: boolean;
  onPress: () => void;
  tone?: GlassTone;
  className?: string;
};

/* The round shortcut of a panel, with its name below. */
export function GlassShortcut({ icon, label, kind, on = false, onPress, tone = 'device', className, disabled, pending, error }: GlassShortcutProps) {
  const state = { disabled, pending, error };
  return (
    <button
      type="button"
      className={clsx('glass-shortcut', on && 'is-on', tone === 'device' && 'is-device', controlStateClass(state), className)}
      aria-expanded={kind === 'opens' ? on : undefined}
      aria-pressed={kind === 'acts' ? on : undefined}
      {...controlStateAria(state)}
      disabled={controlBlocked(state)}
      onClick={onPress}
    >
      <span className="glass-shortcut-circle" aria-hidden="true">
        {icon}
      </span>
      <span className="glass-shortcut-label">{label}</span>
    </button>
  );
}

export default GlassShortcut;
