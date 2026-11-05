import React from 'react';
import clsx from 'clsx';
import { clampPercent, type GlassIndicatorProps, type GlassMeaning } from './glassIndicator';

/** Red below 10%, orange below 20%. */
export const batteryMeaning = (percent: number): GlassMeaning => (percent < 10 ? 'bad' : percent < 20 ? 'warn' : 'ok');

export type GlassBatteryProps = GlassIndicatorProps & {
  percent: number;
  label?: React.ReactNode;
  note?: React.ReactNode;
  charging?: boolean;
};

/* A battery that empties and changes colour. */
export function GlassBattery({ percent, label, note, charging = false, size = 'group', className }: GlassBatteryProps) {
  const full = clampPercent(percent);
  return (
    <div className={clsx('glass-battery', `is-${size}`, charging && 'is-charging', className)}>
      <i aria-hidden="true">
        <i className={`glass-fill-${batteryMeaning(full)}`} style={{ width: `${full}%` }} />
      </i>
      <span>
        <b>{Math.round(full)}%</b>
        {label ? <span>{label}</span> : null}
        {note ? <em>{note}</em> : null}
      </span>
    </div>
  );
}

export default GlassBattery;
