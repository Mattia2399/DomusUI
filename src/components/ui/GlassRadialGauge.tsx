import React from 'react';
import clsx from 'clsx';
import { clampPercent, type GlassIndicatorProps, type GlassMeaning } from './glassIndicator';

export type GlassGaugeZone = { from: number; to: number; meaning: GlassMeaning };

export type GlassRadialGaugeProps = GlassIndicatorProps & {
  value: number;
  min: number;
  max: number;
  /** The good band and the dangerous one, in the same unit as the value. */
  zones?: readonly GlassGaugeZone[];
  display: React.ReactNode;
  note?: React.ReactNode;
  label?: string;
};

const ARC = 240;
const START = 150;
const RADIUS = 42;

const point = (share: number) => {
  const radians = ((START + (share / 100) * ARC) * Math.PI) / 180;
  return { x: 50 + RADIUS * Math.cos(radians), y: 50 + RADIUS * Math.sin(radians) };
};
const arc = (from: number, to: number) => {
  const start = point(from);
  const end = point(to);
  const large = ((to - from) / 100) * ARC > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 ${large} 1 ${end.x} ${end.y}`;
};

/* An arc of 240 degrees with coloured bands and a pointer, for values with a good range and a dangerous one. */
export function GlassRadialGauge({ value, min, max, zones = [], display, note, label, size = 'group', className }: GlassRadialGaugeProps) {
  const share = (entry: number) => clampPercent(((entry - min) / (max - min || 1)) * 100);
  const needle = point(share(value));
  return (
    <div className={clsx('glass-gauge', 'is-radial', `is-${size}`, className)}>
      <div role="img" aria-label={label}>
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <path d={arc(0, 100)} className="glass-gauge-track" />
          {zones.map((zone) => (
            <path key={`${zone.from}-${zone.to}`} d={arc(share(zone.from), share(zone.to))} className={`glass-stroke-${zone.meaning} is-zone`} />
          ))}
          <circle cx={needle.x} cy={needle.y} r="5" className="glass-gauge-needle" />
        </svg>
        <span>
          <b>{display}</b>
          {note ? <span>{note}</span> : null}
        </span>
      </div>
    </div>
  );
}

export default GlassRadialGauge;
