import React from 'react';
import clsx from 'clsx';
import type { GlassIndicatorProps, GlassMeaning } from './glassIndicator';

export type GlassValueDisplayProps = GlassIndicatorProps & {
  value: React.ReactNode;
  unit?: React.ReactNode;
  status?: React.ReactNode;
  meaning?: GlassMeaning;
};

/* A large value with its unit and a line of state: the plainest way to show a sensor. */
export function GlassValueDisplay({ value, unit, status, meaning = 'off', size = 'group', className }: GlassValueDisplayProps) {
  return (
    <div className={clsx('glass-value-display', `is-${size}`, className)}>
      <p>
        <b>{value}</b>
        {unit ? <span>{unit}</span> : null}
      </p>
      {status ? <em className={`glass-mean-${meaning}`}>{status}</em> : null}
    </div>
  );
}

export default GlassValueDisplay;
