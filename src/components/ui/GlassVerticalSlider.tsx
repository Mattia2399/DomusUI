import React from 'react';
import clsx from 'clsx';
import { controlBlocked, controlStateAria, controlStateClass, type GlassControlState, type GlassTone } from './glassControl';
import { useSliderValue, type SliderCommit } from './glassSliderValue';
import './glassVerticalSlider.css';

export type GlassVerticalSliderProps = GlassControlState & {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onValueChange: (value: number) => void;
  commit?: SliderCommit;
  label: string;
  valueText?: string;
  /** The compact one for a group, or the protagonist of a panel. */
  size?: 'compact' | 'hero';
  /** What it says on top: "22°". */
  display?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** At the foot of the fill. */
  icon?: React.ReactNode;
  /** The dashed line of the value now: the room at 20,5° under a target of 22°. */
  current?: { value: number; label?: React.ReactNode };
  tone?: GlassTone;
  /** Shows the empty slider: the device is off. */
  off?: boolean;
  /** How full it looks, when it is not where the value sits between min and max. */
  fillPercent?: number;
  fillStyle?: React.CSSProperties;
  /** Drawn over the fill: the shutter of a cover. */
  overlay?: React.ReactNode;
  /** A line at each of these positions, in percent: the steps of levels. */
  ticks?: readonly number[];
  /** The track is this gradient, with a white handle in place of the fill: the whites of a light. */
  gradient?: string;
  className?: string;
};

/* Above this share the fill reaches the words on top, which take the colour that reads on it. */
const COVERED_FROM_PERCENT = 82;

export function GlassVerticalSlider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onValueChange,
  commit = 'live',
  label,
  valueText,
  size = 'hero',
  display,
  subtitle,
  icon,
  current,
  tone = 'device',
  off = false,
  fillPercent,
  fillStyle,
  overlay,
  ticks,
  gradient,
  className,
  disabled,
  pending,
  error,
}: GlassVerticalSliderProps) {
  const state = { disabled, pending, error };
  const { shown, change, release } = useSliderValue(value, commit, onValueChange);
  const share = (entry: number) => ((Math.max(min, Math.min(max, entry)) - min) / (max - min || 1)) * 100;
  const percent = off ? 0 : fillPercent ?? share(shown);

  return (
    <div
      className={clsx(
        'glass-vslider',
        `is-${size}`,
        tone === 'neutral' && 'is-neutral',
        percent > COVERED_FROM_PERCENT && !gradient && 'is-covered',
        gradient && 'has-gradient',
        controlStateClass(state),
        className,
      )}
      style={gradient ? { background: gradient } : undefined}
    >
      <span className="glass-vslider-clip">
        {gradient ? (
          <span className="glass-vslider-handle" aria-hidden="true" style={{ bottom: `clamp(10px, ${Number(percent.toFixed(1))}%, calc(100% - 10px))` }} />
        ) : (
          <span className="glass-vslider-fill" aria-hidden="true" style={{ ...fillStyle, height: `${Number(percent.toFixed(1))}%` }} />
        )}
        {overlay}
        {ticks?.map((tick) => <span key={tick} className="glass-vslider-tick" aria-hidden="true" style={{ bottom: `${tick}%` }} />)}
        {current ? <span className={clsx('glass-vslider-now', share(current.value) > percent && 'is-above')} aria-hidden="true" style={{ bottom: `${Number(share(current.value).toFixed(1))}%` }} /> : null}
      </span>
      {current?.label ? (
        <em className="glass-vslider-now-pill" aria-hidden="true" style={{ bottom: `clamp(12px, ${Number(share(current.value).toFixed(1))}%, calc(100% - 12px))` }}>
          {current.label}
        </em>
      ) : null}
      {display !== undefined || subtitle !== undefined ? (
        <span className="glass-vslider-top" aria-hidden="true">
          {display !== undefined ? <b>{display}</b> : null}
          {subtitle !== undefined ? <span>{subtitle}</span> : null}
        </span>
      ) : null}
      {icon ? (
        <span className="glass-vslider-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={shown}
        disabled={controlBlocked(state)}
        onChange={(event) => change(Number(event.target.value))}
        aria-label={label}
        aria-valuetext={valueText}
        aria-orientation="vertical"
        {...controlStateAria(state)}
        {...release}
      />
    </div>
  );
}

export default GlassVerticalSlider;
