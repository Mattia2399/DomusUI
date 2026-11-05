import React from 'react';
import clsx from 'clsx';
import { chartArea, chartLine, chartRange, chartX, chartY, finitePoints, GLASS_CHART_BOX } from './glassChart';

export type GlassChartPlotProps = {
  points: readonly number[];
  /** Fills under the line. */
  area?: boolean;
  /** The good range, in green. */
  band?: readonly [number, number];
  /** A dashed line at this value. */
  threshold?: number;
  /** A faint grid: the standard chart has it, the smallest does not. */
  grid?: boolean;
  /** Said to a screen reader in place of the drawing. */
  label?: string;
  /** Instead of a chart with nothing to draw. */
  emptyLabel?: React.ReactNode;
  className?: string;
};

/* The drawing itself, stretched to its box: a line, its last point, and the good range when there is one. */
export function GlassChartPlot({ points, area = false, band, threshold, grid = false, label, emptyLabel, className }: GlassChartPlotProps) {
  const values = finitePoints(points);
  if (values.length < 2) return <div className={clsx('glass-plot', 'is-empty', className)}>{emptyLabel}</div>;
  const range = chartRange(values, [...(band ?? []), ...(threshold !== undefined ? [threshold] : [])]);
  const last = values[values.length - 1];
  return (
    <div role="img" aria-label={label} className={clsx('glass-plot', className)}>
      <svg viewBox={`0 0 ${GLASS_CHART_BOX} ${GLASS_CHART_BOX}`} preserveAspectRatio="none" aria-hidden="true">
        {grid ? [25, 50, 75].map((y) => <line key={y} x1="0" x2={GLASS_CHART_BOX} y1={y} y2={y} className="glass-plot-grid" />) : null}
        {band ? <rect x="0" width={GLASS_CHART_BOX} y={chartY(band[1], range)} height={chartY(band[0], range) - chartY(band[1], range)} className="glass-plot-band" /> : null}
        {threshold !== undefined ? <line x1="0" x2={GLASS_CHART_BOX} y1={chartY(threshold, range)} y2={chartY(threshold, range)} className="glass-plot-threshold" /> : null}
        {area ? <path d={chartArea(values, range)} className="glass-plot-area" /> : null}
        <path d={chartLine(values, range)} className="glass-plot-line" />
      </svg>
      <i className="glass-plot-end" aria-hidden="true" style={{ left: `${chartX(values.length - 1, values.length)}%`, top: `${chartY(last, range)}%` }} />
    </div>
  );
}

export default GlassChartPlot;
