import type React from 'react';
import { clsx } from 'clsx';
import { Pause, Play, Plus, Power, Square, X } from 'lucide-react';
import { controlBlocked, controlStateAria, controlStateClass, type GlassControlState } from '../../../ui/glassControl';

export type PanelMainAction = GlassControlState & {
  /** Power to switch on and off, Stop while a cover moves, Play and Pause for a robot, + for a new event. */
  kind: 'power' | 'stop' | 'play' | 'pause' | 'add';
  on?: boolean;
  label: string;
  onPress: () => void;
};

export type PanelHeaderProps = {
  /** At the left. With none the place stays empty and the name stays in the middle. */
  action?: PanelMainAction;
  name: string;
  status: React.ReactNode;
  closeLabel: string;
  onClose: () => void;
};

const ICONS = { power: Power, stop: Square, play: Play, pause: Pause, add: Plus };

/* One row in every shape: the main action, the name and the state in the middle, Close. */
export function PanelHeader({ action, name, status, closeLabel, onClose }: PanelHeaderProps) {
  const Icon = action ? ICONS[action.kind] : null;
  return (
    <div className="panel-header">
      {action && Icon ? (
        <button
          type="button"
          className={clsx('panel-header-action', `is-${action.kind}`, action.on && 'is-on', controlStateClass(action))}
          aria-label={action.label}
          aria-pressed={action.kind === 'power' ? Boolean(action.on) : undefined}
          disabled={controlBlocked(action)}
          {...controlStateAria(action)}
          onClick={action.onPress}
        >
          <Icon size={20} strokeWidth={2.2} aria-hidden="true" />
        </button>
      ) : null}
      <div className="panel-header-text">
        <h2>{name}</h2>
        <span aria-live="polite">{status}</span>
      </div>
      <button type="button" className="panel-header-close" aria-label={closeLabel} onClick={onClose}>
        <X size={18} strokeWidth={2.4} aria-hidden="true" />
      </button>
    </div>
  );
}

export default PanelHeader;
