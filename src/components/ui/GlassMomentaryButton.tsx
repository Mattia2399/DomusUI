import React from 'react';
import clsx from 'clsx';
import { controlBlocked, controlStateAria, controlStateClass, type GlassControlSize, type GlassControlState } from './glassControl';
import './glassActions.css';

export type GlassMomentaryButtonProps = GlassControlState & {
  label: React.ReactNode;
  /** What it is called, when its words say only what to do. */
  ariaLabel?: string;
  note?: React.ReactNode;
  icon?: React.ReactNode;
  /** True when it is pressed, false when it is let go. */
  onPress: (pressed: boolean) => void;
  /** Large, it fills the panel: a gesture is not a quick touch of a shortcut. */
  size?: GlassControlSize;
  className?: string;
};

/*
 * "Premi e tieni": on while it is held, off when it is let go. Whatever takes the
 * finger away counts as letting go, so nothing stays on by mistake.
 */
export function GlassMomentaryButton({ label, ariaLabel, note, icon, onPress, size = 'group', className, disabled, pending, error }: GlassMomentaryButtonProps) {
  const state = { disabled, pending, error };
  const [pressed, setPressed] = React.useState(false);
  const held = React.useRef(false);
  const latest = React.useRef(onPress);
  latest.current = onPress;
  const release = React.useCallback(() => {
    if (!held.current) return;
    held.current = false;
    setPressed(false);
    latest.current(false);
  }, []);
  const press = () => {
    if (held.current || controlBlocked(state)) return;
    held.current = true;
    setPressed(true);
    latest.current(true);
  };
  React.useEffect(() => {
    if (!pressed) return undefined;
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      window.removeEventListener('blur', release);
    };
  }, [pressed, release]);
  React.useEffect(() => release, [release]);
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      // Not `disabled` while held: a disabled button would swallow the release.
      disabled={controlBlocked(state) && !pressed}
      aria-pressed={pressed}
      {...controlStateAria(state)}
      className={clsx('glass-momentary', `is-${size}`, pressed && 'is-on', controlStateClass(state), className)}
      onPointerDown={press}
      onContextMenu={(event) => event.preventDefault()}
      onBlur={release}
      onKeyDown={(event) => {
        if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
          event.preventDefault();
          press();
        }
      }}
      onKeyUp={(event) => {
        if (event.key === ' ' || event.key === 'Enter') release();
      }}
    >
      {icon ? <i aria-hidden="true">{icon}</i> : null}
      <span>
        <b>{label}</b>
        {note ? <span>{note}</span> : null}
      </span>
    </button>
  );
}

export default GlassMomentaryButton;
