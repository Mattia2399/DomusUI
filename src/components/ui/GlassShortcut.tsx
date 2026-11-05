import React from 'react';
import clsx from 'clsx';
import { ChevronRight } from 'lucide-react';
import { controlBlocked, controlStateAria, controlStateClass, type GlassControlState, type GlassTone } from './glassControl';
import './glassShortcut.css';

/** `control` takes the place of the protagonist; `more` opens Altro; `action` does its job at once; `plain` just goes. */
export type GlassShortcutKind = 'control' | 'more' | 'action' | 'plain';

export type GlassShortcutProps = GlassControlState & {
  icon: React.ReactNode;
  label: string;
  /** What assistive technology says, when the name alone is too short. */
  ariaLabel?: string;
  kind: GlassShortcutKind;
  /** It is on: a timer running, a light flashing. */
  on?: boolean;
  /** You are here. */
  selected?: boolean;
  onPress: () => void;
  tone?: GlassTone;
  className?: string;
};

/* The round shortcut of a panel, with its name below. */
export function GlassShortcut({ icon, label, ariaLabel, kind, on = false, selected = false, onPress, tone = 'device', className, disabled, pending, error }: GlassShortcutProps) {
  const state = { disabled, pending, error };
  return (
    <button
      type="button"
      className={clsx('glass-shortcut', on && 'is-on', selected && 'is-selected', tone === 'device' && 'is-device', controlStateClass(state), className)}
      aria-label={ariaLabel}
      aria-pressed={kind === 'action' ? on : kind === 'control' ? selected : undefined}
      aria-haspopup={kind === 'more' ? 'true' : undefined}
      {...controlStateAria(state)}
      disabled={controlBlocked(state)}
      onClick={onPress}
    >
      <span className="glass-shortcut-circle" aria-hidden="true">
        {icon}
        {kind === 'more' ? (
          <i className="glass-shortcut-opens">
            <ChevronRight size={11} strokeWidth={3} />
          </i>
        ) : null}
      </span>
      <span className="glass-shortcut-label">{label}</span>
    </button>
  );
}

export default GlassShortcut;
