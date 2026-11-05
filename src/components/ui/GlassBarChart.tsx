import React from 'react';
import clsx from 'clsx';
import type { GlassControlSize } from './glassControl';

export type GlassBarChartProps = {
  /** A value for each bar; null for what has not happened yet. */
  bars: readonly (number | null)[];
  /** The one that is under way: it stands out. */
  current?: number;
  title?: React.ReactNode;
  value?: React.ReactNode;
  axis?: readonly React.ReactNode[];
  label?: string;
  emptyLabel?: React.ReactNode;
  size?: GlassControlSize;
  className?: string;
};

/* Bars hour by hour: the current one full, those to come empty. */
export function GlassBarChart({ bars, current, title, value, axis, label, emptyLabel, size = 'group', className }: GlassBarChartProps) {
  const known = bars.filter((bar): bar is number => typeof bar === 'number' && Number.isFinite(bar));
  const highest = Math.max(...known.map(Math.abs), 0);
  return (
    <div className={clsx('glass-chart', `is-${size}`, className)}>
      {title || value !== undefined ? (
        <p>
          <span>{title}</span>
          {value !== undefined ? <b>{value}</b> : null}
        </p>
      ) : null}
      {known.length === 0 ? (
        <div className="glass-plot is-empty">{emptyLabel}</div>
      ) : (
        <div role="img" aria-label={label} className="glass-bars">
          {bars.map((bar, index) => (
            <i
              key={index}
              className={clsx(bar === null && 'is-future', index === current && 'is-current')}
              style={{ height: bar === null ? undefined : `${highest ? Math.max(3, (Math.abs(bar) / highest) * 100) : 3}%` }}
            />
          ))}
        </div>
      )}
      {axis ? (
        <p className="glass-chart-axis" aria-hidden="true">
          {axis.map((tick, index) => (
            <span key={index}>{tick}</span>
          ))}
        </p>
      ) : null}
    </div>
  );
}

export default GlassBarChart;
