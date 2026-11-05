import React from 'react';
import clsx from 'clsx';
import type { GlassControlSize } from './glassControl';
import { GlassChartPlot } from './GlassChartPlot';

export type GlassLineChartProps = {
  points: readonly number[];
  title?: React.ReactNode;
  value?: React.ReactNode;
  /** Under the chart, from the first to the last: "0:00", "ora". */
  axis?: readonly React.ReactNode[];
  band?: readonly [number, number];
  threshold?: number;
  /** Fills under the line: the area chart. */
  area?: boolean;
  label?: string;
  emptyLabel?: React.ReactNode;
  size?: GlassControlSize;
  className?: string;
};

/* A value over time, with a light grid and the labels of its limits. */
export function GlassLineChart({ points, title, value, axis, band, threshold, area = false, label, emptyLabel, size = 'group', className }: GlassLineChartProps) {
  return (
    <div className={clsx('glass-chart', `is-${size}`, className)}>
      {title || value !== undefined ? (
        <p>
          <span>{title}</span>
          {value !== undefined ? <b>{value}</b> : null}
        </p>
      ) : null}
      <GlassChartPlot points={points} band={band} threshold={threshold} area={area} grid label={label} emptyLabel={emptyLabel} />
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

export default GlassLineChart;
