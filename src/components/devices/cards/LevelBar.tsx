import type React from 'react';
import { clsx } from 'clsx';
import '../theme/devices.css';

/** The horizontal slider of the cards: always 46 px tall; the value is in the status, not inside. */
export function LevelBar({
  value,
  min = 0,
  max = 100,
  step = 1,
  lit,
  label,
  valueText,
  disabled = false,
  onChange,
  className,
  style,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  /** Shown filled; off shows an empty, faint fill. */
  lit: boolean;
  label: string;
  valueText: string;
  disabled?: boolean;
  onChange: (value: number) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const share = lit ? (Math.max(min, Math.min(max, value)) - min) / (max - min || 1) : 0;
  return (
    <span className={clsx('dv-slider', !lit && 'is-off', className)} style={style}>
      <span className="dv-slider-fill" aria-hidden="true" style={{ width: lit ? `max(32px, ${(share * 100).toFixed(1)}%)` : 0 }} />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
        aria-valuetext={valueText}
      />
    </span>
  );
}

export default LevelBar;
