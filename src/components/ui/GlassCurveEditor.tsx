import React from 'react';
import clsx from 'clsx';
import { controlBlocked, controlStateClass, type GlassControlSize, type GlassControlState } from './glassControl';
import './glassAdvanced.css';

const BOX = 100;

export type GlassCurvePoint = { id: string; label: React.ReactNode; ariaLabel: string; value: number };

export type GlassCurveEditorProps = GlassControlState & {
  /** From left to right: only their height moves. */
  points: readonly GlassCurvePoint[];
  min: number;
  max: number;
  step?: number;
  onChange: (id: string, value: number) => void;
  format?: (value: number) => string;
  size?: GlassControlSize;
  className?: string;
};

/* Points to drag up and down on a grid. It takes several entities: only for the page of the tests for now. */
export function GlassCurveEditor({ points, min, max, step = 1, onChange, format = String, size = 'group', className, disabled, pending, error }: GlassCurveEditorProps) {
  const state = { disabled, pending, error };
  const blocked = controlBlocked(state);
  const span = max - min || 1;
  const share = (value: number) => ((Math.max(min, Math.min(max, value)) - min) / span) * 100;
  const x = (index: number) => (points.length <= 1 ? 50 : (index / (points.length - 1)) * 92 + 4);
  const snap = (value: number) => Math.round(Math.max(min, Math.min(max, value)) / step) * step;
  const [dragged, setDragged] = React.useState<string | null>(null);
  const drag = (event: React.PointerEvent<HTMLElement>, id: string) => {
    const plot = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!plot || plot.height === 0) return;
    onChange(id, snap(min + (1 - (event.clientY - plot.top) / plot.height) * span));
  };
  return (
    <div className={clsx('glass-curve', `is-${size}`, controlStateClass(state), className)}>
      <div className="glass-curve-plot">
        <svg viewBox={`0 0 ${BOX} ${BOX}`} preserveAspectRatio="none" aria-hidden="true">
          {[25, 50, 75].map((y) => <line key={y} x1="0" x2={BOX} y1={y} y2={y} />)}
          <polyline points={points.map((point, index) => `${x(index)},${BOX - share(point.value)}`).join(' ')} />
        </svg>
        {points.map((point, index) => (
          <button
            key={point.id}
            type="button"
            role="slider"
            aria-label={point.ariaLabel}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={point.value}
            aria-valuetext={format(point.value)}
            aria-orientation="vertical"
            disabled={blocked}
            style={{ left: `${x(index)}%`, top: `${100 - share(point.value)}%` }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture?.(event.pointerId);
              setDragged(point.id);
            }}
            onPointerMove={(event) => {
              if (dragged === point.id) drag(event, point.id);
            }}
            onPointerUp={() => setDragged(null)}
            onPointerCancel={() => setDragged(null)}
            onKeyDown={(event) => {
              const direction = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0;
              if (!direction) return;
              event.preventDefault();
              const next = snap(point.value + direction * step);
              if (next !== point.value) onChange(point.id, next);
            }}
          >
            <em aria-hidden="true">{format(point.value)}</em>
          </button>
        ))}
      </div>
      <p aria-hidden="true">
        {points.map((point) => (
          <span key={point.id}>{point.label}</span>
        ))}
      </p>
    </div>
  );
}

export default GlassCurveEditor;
