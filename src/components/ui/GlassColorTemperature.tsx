import clsx from 'clsx';
import { controlBlocked, controlStateAria, controlStateClass, type GlassControlState } from './glassControl';
import { useSliderValue, type SliderCommit } from './glassSliderValue';
import './glassColorTemperature.css';

export type GlassColorTemperatureProps = GlassControlState & {
  /** In kelvin. */
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onValueChange: (kelvin: number) => void;
  commit?: SliderCommit;
  label: string;
  valueText?: string;
  /** The quick choices below the bar: Calda, Neutra, Fredda. */
  presets?: ReadonlyArray<{ kelvin: number; label: string }>;
  /** Which of them is on, when each stands for a range of whites. Otherwise the one at the value. */
  presetOn?: number;
  className?: string;
};

type Rgb = [number, number, number];

/* From warm to cold: the same stops draw the bar and colour the handle. */
const STOPS: Rgb[] = [
  [255, 159, 69],
  [255, 214, 161],
  [255, 255, 255],
  [207, 227, 255],
  [169, 203, 255],
];
const BAR = `linear-gradient(90deg, ${STOPS.map((stop) => `rgb(${stop.join(' ')})`).join(', ')})`;

function colourAt(share: number) {
  const place = Math.max(0, Math.min(1, share)) * (STOPS.length - 1);
  const from = Math.min(STOPS.length - 2, Math.floor(place));
  const mix = place - from;
  return `rgb(${STOPS[from].map((channel, index) => Math.round(channel + (STOPS[from + 1][index] - channel) * mix)).join(' ')})`;
}

/* The whites of a light, from warm to cold, with a handle in the white chosen. */
export function GlassColorTemperature({ value, min = 2000, max = 6500, step = 100, onValueChange, commit = 'live', label, valueText, presets = [], presetOn, className, disabled, pending, error }: GlassColorTemperatureProps) {
  const state = { disabled, pending, error };
  const blocked = controlBlocked(state);
  const { shown, change, release } = useSliderValue(value, commit, onValueChange);
  const share = (Math.max(min, Math.min(max, shown)) - min) / (max - min || 1);

  return (
    <div className={clsx('glass-temperature', controlStateClass(state), className)}>
      <span className="glass-temperature-bar" style={{ background: BAR }}>
        <span
          className="glass-temperature-handle"
          aria-hidden="true"
          style={{ left: `clamp(19px, ${Number((share * 100).toFixed(1))}%, calc(100% - 19px))`, background: colourAt(share) }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={shown}
          disabled={blocked}
          onChange={(event) => change(Number(event.target.value))}
          aria-label={label}
          aria-valuetext={valueText ?? `${shown} K`}
          {...controlStateAria(state)}
          {...release}
        />
      </span>
      {presets.length > 0 ? (
        <span className="glass-temperature-presets" role="group" aria-label={label}>
          {presets.map((preset) => {
            const on = presetOn === undefined ? Math.abs(shown - preset.kelvin) < step : preset.kelvin === presetOn;
            return (
              <button key={preset.kelvin} type="button" className={clsx(on && 'is-on')} aria-pressed={on} disabled={blocked} onClick={() => onValueChange(preset.kelvin)}>
                {preset.label}
              </button>
            );
          })}
        </span>
      ) : null}
    </div>
  );
}

export default GlassColorTemperature;
