import type React from 'react';
import { clsx } from 'clsx';
import { GlassSlider } from '../../ui/GlassSlider';
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
  fillPercent,
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
  /** How full it looks, when it is not where the value sits between min and max. */
  fillPercent?: number;
}) {
  return (
    <GlassSlider
      variant="bar"
      className={clsx('dv-slider', !lit && 'is-off', className)}
      fillClassName="dv-slider-fill"
      style={style}
      value={value}
      min={min}
      max={max}
      step={step}
      off={!lit}
      fillPercent={fillPercent}
      disabled={disabled}
      label={label}
      valueText={valueText}
      onValueChange={onChange}
    />
  );
}

export default LevelBar;
