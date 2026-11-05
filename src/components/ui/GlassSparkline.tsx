import React from 'react';
import clsx from 'clsx';
import type { GlassControlSize } from './glassControl';
import { GlassChartPlot } from './GlassChartPlot';

export type GlassSparklineProps = {
  points: readonly number[];
  title?: React.ReactNode;
  value?: React.ReactNode;
  area?: boolean;
  label?: string;
  emptyLabel?: React.ReactNode;
  size?: GlassControlSize;
  className?: string;
};

/* A line with no axes and its last point, beside a value in a row. */
export function GlassSparkline({ points, title, value, area = false, label, emptyLabel, size = 'group', className }: GlassSparklineProps) {
  return (
    <div className={clsx('glass-sparkline', `is-${size}`, className)}>
      {title ? <span>{title}</span> : null}
      <GlassChartPlot points={points} area={area} label={label} emptyLabel={emptyLabel} />
      {value !== undefined ? <b>{value}</b> : null}
    </div>
  );
}

export default GlassSparkline;
