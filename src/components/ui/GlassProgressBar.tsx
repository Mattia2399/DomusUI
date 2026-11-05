import React from 'react';
import clsx from 'clsx';
import { clampPercent, type GlassIndicatorProps, type GlassMeaning } from './glassIndicator';

export type GlassProgressBarProps = GlassIndicatorProps & {
  percent: number;
  label?: string;
  value?: React.ReactNode;
  note?: React.ReactNode;
  meaning?: GlassMeaning;
  /** Upright, for levels that rise and fall. */
  vertical?: boolean;
};

/* A thin bar with its value and a line of state; upright for levels. */
export function GlassProgressBar({ percent, label, value, note, meaning = 'info', vertical = false, size = 'group', className }: GlassProgressBarProps) {
  const full = clampPercent(percent);
  return (
    <div className={clsx('glass-progress', `is-${size}`, vertical && 'is-vertical', className)}>
      {label || value !== undefined ? (
        <p>
          <span>{label}</span>
          {value !== undefined ? <b>{value}</b> : null}
        </p>
      ) : null}
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(full)}>
        <i className={`glass-fill-${meaning}`} style={vertical ? { height: `${full}%` } : { width: `${full}%` }} />
      </div>
      {note ? <em>{note}</em> : null}
    </div>
  );
}

export default GlassProgressBar;
