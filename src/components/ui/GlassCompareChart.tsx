import React from 'react';
import clsx from 'clsx';
import type { GlassControlSize } from './glassControl';

export type GlassCompareChartProps = {
  current: { label: React.ReactNode; value: number; text: React.ReactNode };
  previous: { label: React.ReactNode; value: number; text: React.ReactNode };
  /** The difference in words: "−12% rispetto a ieri". */
  difference?: React.ReactNode;
  /** Whether going up is the bad way, as for what is consumed. */
  lowerIsBetter?: boolean;
  size?: GlassControlSize;
  className?: string;
};

/** The change from one to the other in percent, or nothing when there is no base to compare with. */
export const changePercent = (current: number, previous: number) => (previous === 0 ? null : Math.round(((current - previous) / Math.abs(previous)) * 100));

/* Today against yesterday, or this week against the last, with the difference. */
export function GlassCompareChart({ current, previous, difference, lowerIsBetter = false, size = 'group', className }: GlassCompareChartProps) {
  const highest = Math.max(Math.abs(current.value), Math.abs(previous.value), 1);
  const change = changePercent(current.value, previous.value);
  const better = change === null || change === 0 ? null : change < 0 === lowerIsBetter;
  return (
    <div className={clsx('glass-compare', `is-${size}`, className)}>
      {difference ? <b className={clsx(better === true && 'is-better', better === false && 'is-worse')}>{difference}</b> : null}
      {[{ ...current, now: true }, { ...previous, now: false }].map((row, index) => (
        <div key={index} className={clsx(row.now && 'is-now')}>
          <span>{row.label}</span>
          <i aria-hidden="true">
            <i style={{ width: `${(Math.abs(row.value) / highest) * 100}%` }} />
          </i>
          <em>{row.text}</em>
        </div>
      ))}
    </div>
  );
}

export default GlassCompareChart;
