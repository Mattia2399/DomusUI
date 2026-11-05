import React from 'react';
import clsx from 'clsx';
import type { GlassControlSize } from './glassControl';

export type GlassStatsProps = {
  /** Three numbers: lowest, highest and average, or today, month and cost. */
  items: readonly { label: React.ReactNode; value: React.ReactNode }[];
  title?: React.ReactNode;
  size?: GlassControlSize;
  className?: string;
};

/* Three numbers in their boxes. */
export function GlassStats({ items, title, size = 'group', className }: GlassStatsProps) {
  return (
    <div className={clsx('glass-stats', `is-${size}`, className)}>
      {title ? <p>{title}</p> : null}
      <dl>
        {items.map((item, index) => (
          <div key={index}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default GlassStats;
