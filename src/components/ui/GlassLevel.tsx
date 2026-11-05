import React from 'react';
import clsx from 'clsx';
import { clampPercent, type GlassIndicatorProps, type GlassMeaning } from './glassIndicator';

export type GlassLevelProps = GlassIndicatorProps & {
  percent: number;
  /** What it is called for assistive technology, when the name stands elsewhere. */
  ariaLabel?: string;
  label?: React.ReactNode;
  note?: React.ReactNode;
  /** Under this share it says it is time to refill. */
  reorderAt?: number;
};

/* A tank that fills, with the value inside: pellet, water, salt. */
export function GlassLevel({ percent, ariaLabel, label, note, reorderAt = 20, size = 'group', className }: GlassLevelProps) {
  const full = clampPercent(percent);
  const meaning: GlassMeaning = full < reorderAt ? 'warn' : 'info';
  return (
    <div className={clsx('glass-level', `is-${size}`, className)}>
      <div className="glass-level-tank" role="meter" aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(full)}>
        <i className={`glass-fill-${meaning}`} style={{ height: `${full}%` }} />
        <b>{Math.round(full)}%</b>
      </div>
      {label || note ? (
        <span>
          {label ? <b>{label}</b> : null}
          {note ? <em>{note}</em> : null}
        </span>
      ) : null}
    </div>
  );
}

export default GlassLevel;
