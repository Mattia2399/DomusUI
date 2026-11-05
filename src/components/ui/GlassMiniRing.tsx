import React from 'react';
import clsx from 'clsx';
import { clampPercent, type GlassIndicatorProps, type GlassMeaning } from './glassIndicator';

export type GlassMiniRingProps = GlassIndicatorProps & {
  percent: number;
  label: React.ReactNode;
  value?: React.ReactNode;
  meaning?: GlassMeaning;
};

/* A small ring to put in a row beside the text. As the protagonist, use GlassGauge. */
export function GlassMiniRing({ percent, label, value, meaning = 'ok', size = 'group', className }: GlassMiniRingProps) {
  return (
    <div className={clsx('glass-mini-ring', `is-${size}`, className)}>
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r="15" className="glass-gauge-track" />
        <circle cx="20" cy="20" r="15" className={`glass-stroke-${meaning}`} pathLength={100} strokeDasharray={`${clampPercent(percent)} 100`} transform="rotate(-90 20 20)" />
      </svg>
      <span>{label}</span>
      {value !== undefined ? <b>{value}</b> : null}
    </div>
  );
}

export default GlassMiniRing;
