import React from 'react';
import clsx from 'clsx';
import type { GlassControlSize } from './glassControl';
import { chartLine, chartRange, finitePoints, GLASS_CHART_BOX } from './glassChart';

export type GlassChartSeries = { id: string; label: string; points: readonly number[] };

export type GlassMultiChartProps = {
  /** Two or three lines to compare. */
  series: readonly GlassChartSeries[];
  title?: React.ReactNode;
  ariaLabel: string;
  emptyLabel?: React.ReactNode;
  size?: GlassControlSize;
  className?: string;
};

/* Two or three lines with their legend; touching a name hides its line. It takes several entities: only for the page of the tests for now. */
export function GlassMultiChart({ series, title, ariaLabel, emptyLabel, size = 'group', className }: GlassMultiChartProps) {
  const [hidden, setHidden] = React.useState<readonly string[]>([]);
  const shown = series.filter((entry) => !hidden.includes(entry.id));
  const all = shown.flatMap((entry) => finitePoints(entry.points));
  const range = chartRange(all);
  return (
    <div className={clsx('glass-chart', 'is-multi', `is-${size}`, className)}>
      {title ? <p><span>{title}</span></p> : null}
      {all.length < 2 ? (
        <div className="glass-plot is-empty">{emptyLabel}</div>
      ) : (
        <div role="img" aria-label={ariaLabel} className="glass-plot">
          <svg viewBox={`0 0 ${GLASS_CHART_BOX} ${GLASS_CHART_BOX}`} preserveAspectRatio="none" aria-hidden="true">
            {[25, 50, 75].map((y) => <line key={y} x1="0" x2={GLASS_CHART_BOX} y1={y} y2={y} className="glass-plot-grid" />)}
            {series.map((entry, index) => (hidden.includes(entry.id) ? null : <path key={entry.id} d={chartLine(finitePoints(entry.points), range)} className={`glass-plot-line is-series-${index}`} />))}
          </svg>
        </div>
      )}
      <div className="glass-chart-legend">
        {series.map((entry, index) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={!hidden.includes(entry.id)}
            onClick={() => setHidden((current) => (current.includes(entry.id) ? current.filter((id) => id !== entry.id) : [...current, entry.id]))}
          >
            <i className={`is-series-${index}`} aria-hidden="true" />
            {entry.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default GlassMultiChart;
