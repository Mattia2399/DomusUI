import React from 'react';
import clsx from 'clsx';
import { controlBlocked, controlStateAria, controlStateClass, type GlassControlState } from './glassControl';
import './glassActions.css';

export type GlassButtonGroupProps = GlassControlState & {
  ariaLabel: string;
  /** From 2 to 4 commands used one after the other. */
  actions: readonly { id: string; label: React.ReactNode; ariaLabel?: string; onPress: () => void }[];
  /** An action has no large version. */
  size?: 'compact' | 'group';
  className?: string;
};

/* Commands joined in one bar. The last one used stays marked. */
export function GlassButtonGroup({ ariaLabel, actions, size = 'group', className, disabled, pending, error }: GlassButtonGroupProps) {
  const state = { disabled, pending, error };
  const [last, setLast] = React.useState<string | null>(null);
  return (
    <div role="group" aria-label={ariaLabel} {...controlStateAria(state)} className={clsx('glass-button-group', `is-${size}`, controlStateClass(state), className)}>
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          aria-label={action.ariaLabel}
          aria-pressed={last === action.id}
          disabled={controlBlocked(state)}
          className={clsx(last === action.id && 'is-on')}
          onClick={() => {
            setLast(action.id);
            action.onPress();
          }}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

export default GlassButtonGroup;
