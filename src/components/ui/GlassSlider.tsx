import React from 'react';
import clsx from 'clsx';
import { controlBlocked, controlStateAria, controlStateClass, type GlassControlState, type GlassTone } from './glassControl';
import { useSliderValue, type SliderCommit } from './glassSliderValue';
import './glassSliderBar.css';

export type GlassSliderTone = 'accent' | 'blue' | 'cyan' | 'green' | 'orange' | 'neutral';
export type GlassSliderVariant = 'default' | 'compact' | 'overlay';

export type GlassSliderProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> & {
  variant?: GlassSliderVariant;
  tone?: GlassSliderTone;
  inputClassName?: string;
  fillClassName?: string;
  fillStyle?: React.CSSProperties;
  thumbClassName?: string;
};

/** The bar of the cards and the panels: the fill takes the whole height, with no margin and no thumb. */
export type GlassBarSliderProps = GlassControlState & {
  variant: 'bar';
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onValueChange: (value: number) => void;
  /** Whether it sends while it is dragged or once, when let go. */
  commit?: SliderCommit;
  label: string;
  valueText?: string;
  /** Fixed values with their names, which can be touched. */
  marks?: ReadonlyArray<{ value: number; label: React.ReactNode }>;
  /** The value written inside the fill, or next to it when the fill is short. */
  valueInFill?: React.ReactNode;
  size?: 'default' | 'compact';
  tone?: GlassTone;
  /** Shows the empty bar: the device is off. */
  off?: boolean;
  /** How full it looks, when it is not where the value sits between min and max. */
  fillPercent?: number;
  className?: string;
  fillClassName?: string;
  style?: React.CSSProperties;
};

/** Below this share the value does not fit inside the fill. */
const VALUE_FITS_FROM_PERCENT = 22;

const GlassBarSlider = React.forwardRef<HTMLInputElement, GlassBarSliderProps>(function GlassBarSlider(
  { value, min = 0, max = 100, step = 1, onValueChange, commit = 'live', label, valueText, marks, valueInFill, size = 'default', tone = 'neutral', off = false, fillPercent, className, fillClassName, style, disabled, pending, error },
  ref,
) {
  const state = { disabled, pending, error };
  const { shown, change, release } = useSliderValue(value, commit, onValueChange);
  const computed = ((Math.max(min, Math.min(max, shown)) - min) / (max - min || 1)) * 100;
  const percent = commit === 'release' || fillPercent === undefined ? computed : fillPercent;
  const bar = (
    <span
      className={clsx('glass-bar', size === 'compact' && 'is-compact', tone === 'device' && 'is-device', off && 'is-off', controlStateClass(state), className)}
      style={style}
    >
      <span
        className={clsx('glass-bar-fill', fillClassName)}
        aria-hidden="true"
        style={{ width: off ? 0 : `max(32px, ${Number(percent.toFixed(1))}%)` }}
      >
        {valueInFill !== undefined && percent >= VALUE_FITS_FROM_PERCENT ? <span className="glass-bar-value">{valueInFill}</span> : null}
      </span>
      {valueInFill !== undefined && percent < VALUE_FITS_FROM_PERCENT ? (
        <span className="glass-bar-value is-outside" aria-hidden="true" style={{ left: `max(32px, ${Number(percent.toFixed(1))}%)` }}>
          {valueInFill}
        </span>
      ) : null}
      <input
        ref={ref}
        type="range"
        min={min}
        max={max}
        step={step}
        value={shown}
        disabled={controlBlocked(state)}
        onChange={(event) => change(Number(event.target.value))}
        aria-label={label}
        aria-valuetext={valueText}
        {...controlStateAria(state)}
        {...release}
      />
    </span>
  );
  if (!marks || marks.length === 0) return bar;
  return (
    <span className="glass-bar-marked">
      {bar}
      <span className="glass-bar-marks" role="group" aria-label={label}>
        {marks.map((mark) => (
          <button
            key={mark.value}
            type="button"
            className={clsx('glass-bar-mark', shown === mark.value && 'is-on')}
            aria-pressed={shown === mark.value}
            disabled={controlBlocked(state)}
            onClick={() => onValueChange(mark.value)}
          >
            {mark.label}
          </button>
        ))}
      </span>
    </span>
  );
});

const FILL_TONE_CLASS: Record<GlassSliderTone, string> = {
  accent: 'bg-[color:var(--ui-accent)]',
  blue: 'bg-[color:var(--ui-accent)]',
  cyan: 'bg-[color:var(--ui-info)]',
  green: 'bg-[color:var(--ui-success)]',
  orange: 'bg-[color:var(--ui-warning)]',
  neutral: 'bg-[color:var(--ui-fill-primary)]',
};

function resolveProgress(value: GlassSliderProps['value'], min: GlassSliderProps['min'], max: GlassSliderProps['max']) {
  const numericValue = Number(value ?? min ?? 0);
  const numericMin = Number(min ?? 0);
  const numericMax = Number(max ?? 100);
  if (![numericValue, numericMin, numericMax].every(Number.isFinite) || numericMax <= numericMin) return 0;
  return Math.min(100, Math.max(0, ((numericValue - numericMin) / (numericMax - numericMin)) * 100));
}

const GlassRangeSlider = React.forwardRef<HTMLInputElement, GlassSliderProps>(function GlassRangeSlider(
  {
    variant = 'default',
    tone = 'accent',
    className,
    inputClassName,
    fillClassName,
    fillStyle,
    thumbClassName,
    value,
    min = 0,
    max = 100,
    disabled,
    ...inputProps
  },
  ref,
) {
  if (variant === 'overlay') {
    return (
      <input
        ref={ref}
        type="range"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        className={className}
        {...inputProps}
      />
    );
  }

  const compact = variant === 'compact';
  const progress = resolveProgress(value, min, max);

  return (
    <div
      className={clsx(
        'liquid-glass-control relative w-full overflow-hidden !rounded-full focus-within:ring-2 focus-within:ring-[color:var(--ui-focus-ring)]',
        compact ? 'h-7' : 'h-10',
        disabled && 'opacity-45',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={clsx('pointer-events-none absolute inset-y-0 left-0 transition-[width] duration-150', FILL_TONE_CLASS[tone], fillClassName)}
        style={{ ...fillStyle, width: `${progress}%` }}
      />
      <span
        aria-hidden="true"
        className={clsx(
          'pointer-events-none absolute top-1/2 rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.9)] transition-[left] duration-150',
          compact ? 'h-5 w-5' : 'h-8 w-8',
          thumbClassName,
        )}
        style={{ left: `clamp(0px, calc(${progress}% - ${compact ? 10 : 16}px), calc(100% - ${compact ? 20 : 32}px))`, transform: 'translateY(-50%)' }}
      />
      <input
        ref={ref}
        type="range"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        className={clsx('absolute inset-0 h-full w-full cursor-pointer touch-none opacity-0 disabled:cursor-not-allowed', inputClassName)}
        {...inputProps}
      />
    </div>
  );
});

export const GlassSlider = React.forwardRef<HTMLInputElement, GlassSliderProps | GlassBarSliderProps>(function GlassSlider(props, ref) {
  return props.variant === 'bar' ? <GlassBarSlider ref={ref} {...props} /> : <GlassRangeSlider ref={ref} {...props} />;
});

export default GlassSlider;
