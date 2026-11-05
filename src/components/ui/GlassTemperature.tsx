import React from 'react';
import clsx from 'clsx';
import { clampPercent, type GlassIndicatorProps } from './glassIndicator';

export type GlassTemperatureProps = GlassIndicatorProps & {
  value: number;
  unit?: string;
  min: number;
  max: number;
  /** The range that is right, if there is one. */
  ideal?: readonly [number, number];
  idealLabel?: React.ReactNode;
  format?: (value: number) => string;
};

/* A temperature with its scale, the good range and the point where it is now. */
export function GlassTemperature({ value, unit = '°C', min, max, ideal, idealLabel, format = String, size = 'group', className }: GlassTemperatureProps) {
  const share = (entry: number) => clampPercent(((entry - min) / (max - min || 1)) * 100);
  return (
    <div className={clsx('glass-temperature', `is-${size}`, className)}>
      <p>
        <b>{format(value)}</b>
        <span>{unit}</span>
      </p>
      <div className="glass-temperature-scale" aria-hidden="true">
        {ideal ? <i className="glass-temperature-ideal" style={{ left: `${share(ideal[0])}%`, right: `${100 - share(ideal[1])}%` }} /> : null}
        <i className="glass-temperature-now" style={{ left: `${share(value)}%` }} />
      </div>
      <p className="glass-temperature-limits" aria-hidden="true">
        <span>{format(min)}°</span>
        {idealLabel ? <em>{idealLabel}</em> : null}
        <span>{format(max)}°</span>
      </p>
    </div>
  );
}

export default GlassTemperature;
