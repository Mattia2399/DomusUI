import React from 'react';
import clsx from 'clsx';
import { controlBlocked, controlStateAria, controlStateClass, type GlassControlSize, type GlassControlState } from './glassControl';
import './glassAdvanced.css';

/** A point inside the circle: what goes past the edge stays on the edge. */
export function insideCircle(x: number, y: number) {
  const distance = Math.hypot(x, y);
  return distance <= 1 ? { x, y } : { x: x / distance, y: y / distance };
}

export type GlassJoystickProps = GlassControlState & {
  label: string;
  /** From -1 to 1 on both axes. */
  onMove: (x: number, y: number) => void;
  /** It went back to the centre. */
  onRelease: () => void;
  status?: React.ReactNode;
  size?: GlassControlSize;
  className?: string;
};

const KEY_STEP = 0.5;

/* A knob to drag on two axes, which goes back to the centre when let go. Only for services that accept continuous movement. */
export function GlassJoystick({ label, onMove, onRelease, status, size = 'group', className, disabled, pending, error }: GlassJoystickProps) {
  const state = { disabled, pending, error };
  const blocked = controlBlocked(state);
  const [knob, setKnob] = React.useState<{ x: number; y: number } | null>(null);
  const dragging = React.useRef(false);
  const fromEvent = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return insideCircle(((event.clientX - box.left) / box.width) * 2 - 1, ((event.clientY - box.top) / box.height) * 2 - 1);
  };
  const go = (point: { x: number; y: number }) => {
    setKnob(point);
    onMove(point.x, point.y);
  };
  const release = () => {
    if (!dragging.current) return;
    dragging.current = false;
    setKnob(null);
    onRelease();
  };
  return (
    <div className={clsx('glass-joystick', `is-${size}`, knob && 'is-moving', controlStateClass(state), className)}>
      <div
        role="application"
        tabIndex={blocked ? -1 : 0}
        aria-label={label}
        aria-disabled={blocked || undefined}
        {...controlStateAria(state)}
        onPointerDown={(event) => {
          if (blocked) return;
          event.currentTarget.setPointerCapture?.(event.pointerId);
          dragging.current = true;
          go(fromEvent(event));
        }}
        onPointerMove={(event) => {
          if (dragging.current) go(fromEvent(event));
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
        onBlur={release}
        onKeyDown={(event) => {
          if (blocked || event.repeat) return;
          const moves: Record<string, [number, number]> = { ArrowUp: [0, -KEY_STEP], ArrowDown: [0, KEY_STEP], ArrowLeft: [-KEY_STEP, 0], ArrowRight: [KEY_STEP, 0] };
          const move = moves[event.key];
          if (!move) return;
          event.preventDefault();
          dragging.current = true;
          go({ x: move[0], y: move[1] });
        }}
        onKeyUp={(event) => {
          if (event.key.startsWith('Arrow')) release();
        }}
      >
        <i aria-hidden="true" style={knob ? { left: `${50 + knob.x * 50}%`, top: `${50 + knob.y * 50}%` } : undefined} />
      </div>
      {status ? <p aria-live="polite">{status}</p> : null}
    </div>
  );
}

export default GlassJoystick;
