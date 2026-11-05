import React from 'react';
import clsx from 'clsx';
import type { GlassControlSize } from './glassControl';
import { GlassBarChart } from './GlassBarChart';
import { GlassChips } from './GlassChips';
import { GlassLineChart } from './GlassLineChart';

export type GlassHistoryPeriod = { id: string; label: string; points: readonly number[]; note?: React.ReactNode };

export type GlassHistoryChartProps = {
  periods: readonly GlassHistoryPeriod[];
  /** The one to start from; then it is its own choice. */
  initialPeriod?: string;
  ariaLabel: string;
  title?: React.ReactNode;
  kind?: 'line' | 'bars';
  emptyLabel?: React.ReactNode;
  size?: GlassControlSize;
  className?: string;
};

/* A chart with its period to choose. */
export function GlassHistoryChart({ periods, initialPeriod, ariaLabel, title, kind = 'line', emptyLabel, size = 'group', className }: GlassHistoryChartProps) {
  const [chosen, setChosen] = React.useState(initialPeriod ?? periods[0]?.id ?? '');
  const period = periods.find((entry) => entry.id === chosen) ?? periods[0];
  const points = period?.points ?? [];
  return (
    <div className={clsx('glass-history', `is-${size}`, className)}>
      {kind === 'bars' ? (
        <GlassBarChart bars={points} title={title} value={period?.note} emptyLabel={emptyLabel} label={ariaLabel} size={size} />
      ) : (
        <GlassLineChart points={points} title={title} value={period?.note} emptyLabel={emptyLabel} label={ariaLabel} size={size} />
      )}
      <GlassChips ariaLabel={ariaLabel} options={periods.map(({ id, label }) => ({ value: id, label }))} value={period?.id ?? ''} onChange={(next) => setChosen(String(next))} />
    </div>
  );
}

export default GlassHistoryChart;
