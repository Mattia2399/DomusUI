import React from 'react';
import clsx from 'clsx';
import { Droplet } from 'lucide-react';
import { clampPercent, type GlassIndicatorProps } from './glassIndicator';

export const GLASS_IDEAL_HUMIDITY = [40, 60] as const;

export type GlassHumidityProps = GlassIndicatorProps & {
  percent: number;
  status?: React.ReactNode;
  ideal?: readonly [number, number];
};

/* A drop with the value and the good range marked. */
export function GlassHumidity({ percent, status, ideal = GLASS_IDEAL_HUMIDITY, size = 'group', className }: GlassHumidityProps) {
  const full = clampPercent(percent);
  const inside = full >= ideal[0] && full <= ideal[1];
  return (
    <div className={clsx('glass-humidity', `is-${size}`, className)}>
      <p>
        <Droplet className={inside ? 'glass-mean-ok' : 'glass-mean-warn'} size={size === 'hero' ? 44 : 24} aria-hidden="true" />
        <b>{Math.round(full)}</b>
        <span>%</span>
      </p>
      {status ? <em className={inside ? 'glass-mean-ok' : 'glass-mean-warn'}>{status}</em> : null}
      <div className="glass-temperature-scale" aria-hidden="true">
        <i className="glass-temperature-ideal" style={{ left: `${ideal[0]}%`, right: `${100 - ideal[1]}%` }} />
        <i className="glass-temperature-now" style={{ left: `${full}%` }} />
      </div>
    </div>
  );
}

export default GlassHumidity;
