import React from 'react';
import { GlassLineChart, type GlassLineChartProps } from './GlassLineChart';

export type GlassAreaChartProps = Omit<GlassLineChartProps, 'area'>;

/* The same chart with its area shaded, and the good range in green. */
export function GlassAreaChart(props: GlassAreaChartProps) {
  return <GlassLineChart {...props} area />;
}

export default GlassAreaChart;
