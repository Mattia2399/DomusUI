import React from 'react';
import clsx from 'clsx';
import { controlBlocked, controlStateAria, controlStateClass, type GlassControlSize, type GlassControlState } from './glassControl';
import './glassValues.css';

export type GlassRangeProps = GlassControlState & {
  low: number;
  high: number;
  min: number;
  max: number;
  step?: number;
  /** The least distance between the two; they never cross. */
  minGap?: number;
  onValueChange: (low: number, high: number) => void;
  lowLabel: string;
  highLabel: string;
  format?: (value: number) => string;
  size?: GlassControlSize;
  className?: string;
};

/* Two handles for a lowest and a highest value. Each one stops where the other begins. */
export function GlassRange({ low, high, min, max, step = 1, minGap = 0, onValueChange, lowLabel, highLabel, format = String, size = 'group', className, disabled, pending, error }: GlassRangeProps) {
  const state = { disabled, pending, error };
  const blocked = controlBlocked(state);
  const share = (entry: number) => ((entry - min) / (max - min || 1)) * 100;
  return (
    <div className={clsx('glass-range', `is-${size}`, controlStateClass(state), className)}>
      <output>
        {format(low)} – {format(high)}
      </output>
      <div className="glass-range-track">
        <i aria-hidden="true" style={{ left: `${share(low)}%`, right: `${100 - share(high)}%` }} />
        <input
          type="range"
          aria-label={lowLabel}
          aria-valuetext={format(low)}
          {...controlStateAria(state)}
          min={min}
          max={max}
          step={step}
          value={low}
          disabled={blocked}
          onChange={(event) => onValueChange(Math.min(Number(event.target.value), high - minGap), high)}
        />
        <input
          type="range"
          aria-label={highLabel}
          aria-valuetext={format(high)}
          {...controlStateAria(state)}
          min={min}
          max={max}
          step={step}
          value={high}
          disabled={blocked}
          onChange={(event) => onValueChange(low, Math.max(Number(event.target.value), low + minGap))}
        />
      </div>
      <p aria-hidden="true">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </p>
    </div>
  );
}

export default GlassRange;
