import './glassCharts.css';

/* The geometry of the charts: our own SVG, in a square of 100 that stretches to the box it is given. */

export const GLASS_CHART_BOX = 100;

export type ChartRange = { low: number; high: number };

/** The numbers worth drawing. */
export const finitePoints = (points: readonly number[]) => points.filter((point) => Number.isFinite(point));

/** The range of the values, a little larger so the line does not touch the edges, and never empty. */
export function chartRange(points: readonly number[], extra: readonly number[] = []): ChartRange {
  const all = [...points, ...extra];
  if (all.length === 0) return { low: 0, high: 1 };
  const low = Math.min(...all);
  const high = Math.max(...all);
  const margin = (high - low || Math.abs(high) || 1) * 0.08;
  return { low: low - margin, high: high + margin };
}

/** Where a value falls, from the top of the box. */
export const chartY = (value: number, { low, high }: ChartRange) => GLASS_CHART_BOX - ((value - low) / (high - low)) * GLASS_CHART_BOX;

/** Where the point of that index falls, from the left. */
export const chartX = (index: number, count: number) => (count <= 1 ? GLASS_CHART_BOX : (index / (count - 1)) * GLASS_CHART_BOX);

export function chartLine(points: readonly number[], range: ChartRange) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${chartX(index, points.length).toFixed(2)} ${chartY(point, range).toFixed(2)}`).join(' ');
}

/** The same line closed along the bottom. */
export function chartArea(points: readonly number[], range: ChartRange) {
  if (points.length === 0) return '';
  return `${chartLine(points, range)} L ${GLASS_CHART_BOX} ${GLASS_CHART_BOX} L 0 ${GLASS_CHART_BOX} Z`;
}
