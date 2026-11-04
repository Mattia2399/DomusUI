import { clsx } from 'clsx';
import { ChevronLeft, Play, Power, Square } from 'lucide-react';
import { GlassShortcut } from '../../../ui/GlassShortcut';
import { controlBlocked, controlStateAria, controlStateClass, type GlassControlState } from '../../../ui/glassControl';

export type PanelMainAction = GlassControlState & {
  /** Power to switch on and off, Stop while a cover moves, Play for what plays. */
  kind: 'power' | 'stop' | 'play';
  on?: boolean;
  label: string;
  onPress: () => void;
};

export type PanelFooterProps = {
  /** A device with nothing to switch has none, and the footer keeps its height. */
  action?: PanelMainAction;
  back?: { label: string; onPress: () => void };
};

const ICONS = { power: Power, stop: Square, play: Play };

/*
 * The main action in the middle, within reach of a thumb, and Back at its left on the
 * screen of a shortcut. In two columns the same button moves to the header (panelShell.css).
 */
export function PanelFooter({ action, back }: PanelFooterProps) {
  const Icon = action ? ICONS[action.kind] : null;
  return (
    <div className="panel-footer">
      <span className="panel-footer-back">
        {back ? <GlassShortcut kind="plain" tone="neutral" icon={<ChevronLeft size={20} strokeWidth={2.2} />} label={back.label} onPress={back.onPress} /> : null}
      </span>
      {action && Icon ? (
        <button
          type="button"
          className={clsx('panel-footer-action', `is-${action.kind}`, action.on && 'is-on', controlStateClass(action))}
          aria-label={action.label}
          aria-pressed={action.kind === 'power' ? Boolean(action.on) : undefined}
          disabled={controlBlocked(action)}
          {...controlStateAria(action)}
          onClick={action.onPress}
        >
          <Icon size={22} strokeWidth={2.2} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

export default PanelFooter;
