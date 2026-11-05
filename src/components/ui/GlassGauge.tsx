import React from 'react';
import clsx from 'clsx';
import { clampPercent, type GlassIndicatorProps, type GlassMeaning } from './glassIndicator';

export type GlassGaugeProps = GlassIndicatorProps & {
  percent: number;
  value: React.ReactNode;
  note?: React.ReactNode;
  meaning?: GlassMeaning;
  label?: string;
};

/* A whole ring with the value in the middle: what runs out or fills up. */
export function GlassGauge({ percent, value, note, meaning = 'ok', label, size = 'group', className }: GlassGaugeProps) {
  const full = clampPercent(percent);
  return (
    <div className={clsx('glass-gauge', `is-${size}`, className)}>
      <div role="img" aria-label={label}>
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="43" className="glass-gauge-track" />
          <circle cx="50" cy="50" r="43" className={`glass-stroke-${meaning}`} pathLength={100} strokeDasharray={`${full} 100`} transform="rotate(-90 50 50)" />
        </svg>
        <span>
          <b>{value}</b>
          {note ? <span>{note}</span> : null}
        </span>
      </div>
    </div>
  );
}

export default GlassGauge;
