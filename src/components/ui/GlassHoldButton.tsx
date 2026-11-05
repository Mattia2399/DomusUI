import React from 'react';
import clsx from 'clsx';
import { controlBlocked, controlStateAria, controlStateClass, type GlassControlSize, type GlassControlState } from './glassControl';
import './glassActions.css';

export const GLASS_HOLD_MS = 1200;

export type GlassHoldButtonProps = GlassControlState & {
  label: React.ReactNode;
  /** Under the name: "Rilascia prima per annullare". */
  note?: React.ReactNode;
  /** It happens only when the bar is full. */
  onConfirm: () => void;
  /** Red for what cannot be undone and is dangerous. */
  danger?: boolean;
  /** Large, it fills the panel: a gesture is not a quick touch of a shortcut. */
  size?: GlassControlSize;
  className?: string;
};

/* "Tieni premuto per confermare": it fills while held and acts only when full. Letting go earlier cancels. */
export function GlassHoldButton({ label, note, onConfirm, danger = false, size = 'group', className, disabled, pending, error }: GlassHoldButtonProps) {
  const state = { disabled, pending, error };
  const blocked = controlBlocked(state);
  const [holding, setHolding] = React.useState(false);
  const timer = React.useRef<number | null>(null);
  const latest = React.useRef(onConfirm);
  latest.current = onConfirm;
  const cancel = React.useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  }, []);
  const start = () => {
    if (blocked || timer.current !== null) return;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setHolding(false);
      latest.current();
    }, GLASS_HOLD_MS);
  };
  React.useEffect(() => cancel, [cancel]);
  return (
    <button
      type="button"
      disabled={blocked}
      {...controlStateAria(state)}
      className={clsx('glass-hold', `is-${size}`, danger && 'is-danger', holding && 'is-holding', controlStateClass(state), className)}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(event) => event.preventDefault()}
      onBlur={cancel}
      onKeyDown={(event) => {
        if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
          event.preventDefault();
          start();
        }
      }}
      onKeyUp={(event) => {
        if (event.key === ' ' || event.key === 'Enter') cancel();
      }}
    >
      <i aria-hidden="true" style={{ animationDuration: `${GLASS_HOLD_MS}ms` }} />
      <span>
        <b>{label}</b>
        {note ? <span>{note}</span> : null}
      </span>
    </button>
  );
}

export default GlassHoldButton;
