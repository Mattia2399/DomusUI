import React from 'react';
import clsx from 'clsx';
import { controlBlocked, controlStateAria, controlStateClass, type GlassControlSize, type GlassControlState } from './glassControl';
import './glassValues.css';

export type GlassRingSliderProps = GlassControlState & {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onValueChange: (value: number) => void;
  /** Send the value while it moves, or only when it is let go. */
  commit?: 'live' | 'release';
  format?: (value: number) => string;
  note?: React.ReactNode;
  size?: GlassControlSize;
  className?: string;
};

const ARC = 270;
const START = 135;
const RADIUS = 84;
const SIZE = 200;

/** Where a point falls along the arc, from 0 to 1. Past the ends it goes to the nearer one. */
export function shareOnArc(x: number, y: number) {
  const degrees = (Math.atan2(y, x) * 180) / Math.PI;
  const along = (degrees - START + 720) % 360;
  if (along <= ARC) return along / ARC;
  return along - ARC < (360 - ARC) / 2 ? 1 : 0;
}

const pointAt = (share: number) => {
  const radians = ((START + share * ARC) * Math.PI) / 180;
  return { x: SIZE / 2 + RADIUS * Math.cos(radians), y: SIZE / 2 + RADIUS * Math.sin(radians) };
};

const arcPath = (() => {
  const from = pointAt(0);
  const to = pointAt(1);
  return `M ${from.x} ${from.y} A ${RADIUS} ${RADIUS} 0 1 1 ${to.x} ${to.y}`;
})();

/* An arc of 270 degrees with its handle and the value in the middle. */
export function GlassRingSlider({ label, value, min, max, step = 1, onValueChange, commit = 'live', format = String, note, size = 'group', className, disabled, pending, error }: GlassRingSliderProps) {
  const state = { disabled, pending, error };
  const blocked = controlBlocked(state);
  const [dragged, setDragged] = React.useState<number | null>(null);
  const shown = dragged ?? value;
  const span = max - min || 1;
  const share = Math.max(0, Math.min(1, (shown - min) / span));
  const handle = pointAt(share);
  const snap = (entry: number) => Math.round(Math.max(min, Math.min(max, entry)) / step) * step;
  const fromEvent = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return snap(min + shareOnArc(event.clientX - box.left - box.width / 2, event.clientY - box.top - box.height / 2) * span);
  };
  const change = (next: number) => {
    setDragged(next);
    if (commit === 'live' && next !== value) onValueChange(next);
  };
  return (
    <div className={clsx('glass-ring-slider', `is-${size}`, controlStateClass(state), className)}>
      <div
        role="slider"
        tabIndex={blocked ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={shown}
        aria-valuetext={format(shown)}
        aria-disabled={blocked || undefined}
        {...controlStateAria(state)}
        onPointerDown={(event) => {
          if (blocked) return;
          event.currentTarget.setPointerCapture?.(event.pointerId);
          change(fromEvent(event));
        }}
        onPointerMove={(event) => {
          if (dragged !== null) change(fromEvent(event));
        }}
        onPointerUp={() => {
          if (dragged !== null && commit === 'release' && dragged !== value) onValueChange(dragged);
          setDragged(null);
        }}
        onPointerCancel={() => setDragged(null)}
        onKeyDown={(event) => {
          if (blocked) return;
          const direction = event.key === 'ArrowUp' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowDown' || event.key === 'ArrowLeft' ? -1 : 0;
          if (!direction) return;
          event.preventDefault();
          const next = snap(value + direction * step);
          if (next !== value) onValueChange(next);
        }}
      >
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
          <path d={arcPath} className="glass-ring-slider-track" />
          <path d={arcPath} className="glass-ring-slider-fill" pathLength={100} strokeDasharray={`${share * 100} 100`} />
          <circle cx={handle.x} cy={handle.y} r={12} className="glass-ring-slider-handle" />
        </svg>
        <span className="glass-ring-slider-text">
          <b>{format(shown)}</b>
          {note ? <span>{note}</span> : null}
        </span>
      </div>
    </div>
  );
}

export default GlassRingSlider;
