import React from 'react';
import './glassRing.css';

export type GlassRingProps = {
  /** How much of the ring is full, from 0 to 100. */
  percent: number;
  /** In the middle, large. */
  value: React.ReactNode;
  note?: React.ReactNode;
};

/* A large ring that takes the space it is given and stays round: the time left on a timer. */
export function GlassRing({ percent, value, note }: GlassRingProps) {
  const full = Math.max(0, Math.min(100, percent));
  return (
    <div className="glass-ring-stage">
      <div className="glass-ring">
        <i aria-hidden="true" style={{ background: `conic-gradient(var(--device-accent) ${full}%, var(--control-track) 0)` }} />
        <span className="glass-ring-text" aria-live="polite">
          <b>{value}</b>
          {note ? <span>{note}</span> : null}
        </span>
      </div>
    </div>
  );
}

export default GlassRing;
