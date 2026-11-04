import React from 'react';
import { clsx } from 'clsx';
import type { DevicesTranslator } from '../../../i18n/devicesTranslations';
import { LIGHT_HUE_PRESETS, LIGHT_TEMPERATURE_PRESETS, lightTone, type LightModel, type LightMode } from '../model/light';
import { hueToRgb, kelvinToRgb, rgbCss } from '../model/tileColor';
import { LevelBar } from './LevelBar';
import { toneTitle } from './lightText';

/*
 * The pieces a light card and the light panel are made of: the brightness
 * slider, the colour or temperature swatches, and White / Colour.
 */

/** The horizontal slider of the cards: always 46 px tall, the level is in the status, not inside. */
export function BrightnessBar({
  model,
  label,
  onChange,
  className,
  style,
}: {
  model: LightModel;
  label: string;
  onChange: (pct: number) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const pct = model.brightnessPct ?? 100;
  const shown = model.on ? pct : 0;
  return (
    <LevelBar
      value={pct}
      min={1}
      lit={model.on}
      fillPercent={shown}
      disabled={!model.available}
      onChange={onChange}
      label={label}
      valueText={`${shown}%`}
      className={className}
      style={style}
    />
  );
}

export type Swatch = { key: string; css: string; checked: boolean; label: string; pick: () => void };

export function lightSwatches(
  model: LightModel,
  dt: DevicesTranslator,
  onKelvin: (kelvin: number) => void,
  onHue: (hue: number) => void,
  options: { hueCount?: number; forceMode?: LightMode } = {},
): Swatch[] {
  if (model.caps === 'onoff' || model.caps === 'dim') return [];
  const mode = options.forceMode ?? (model.caps === 'color' ? model.mode : 'temp');
  if (mode === 'color') {
    const hues = LIGHT_HUE_PRESETS.filter((hue) => hue !== 55 && hue !== 310).slice(0, options.hueCount ?? 5);
    return hues.map((hue) => ({
      key: `h${hue}`,
      css: rgbCss(hueToRgb(hue)),
      checked: model.mode === 'color' && Math.abs(model.hue - hue) < 6,
      label: dt('hueSwatch', { hue }),
      pick: () => onHue(hue),
    }));
  }
  return LIGHT_TEMPERATURE_PRESETS.map((kelvin) => ({
    key: `k${kelvin}`,
    css: rgbCss(kelvinToRgb(kelvin)),
    checked: model.mode === 'temp' && Math.abs(model.kelvin - kelvin) < 150,
    label: dt('temperatureSwatch', { tone: toneTitle(lightTone(kelvin), dt), kelvin }),
    pick: () => onKelvin(kelvin),
  }));
}

export function SwatchRow({
  swatches,
  label,
  large = false,
  nowrap = false,
  disabled = false,
  children,
}: {
  swatches: Swatch[];
  label: string;
  large?: boolean;
  nowrap?: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  if (swatches.length === 0) return null;
  return (
    <div
      className={clsx('dv-swatches', nowrap && 'flex-nowrap gap-2', large && 'gap-1.5')}
      role="radiogroup"
      aria-label={label}
    >
      {swatches.map((swatch) =>
        large ? (
          <button
            key={swatch.key}
            type="button"
            role="radio"
            aria-checked={swatch.checked}
            aria-label={swatch.label}
            disabled={disabled}
            onClick={swatch.pick}
            className="dv-swatch-hit cursor-pointer border-0 bg-transparent p-0"
          >
            <span
              className="dv-swatch dv-swatch-lg pointer-events-none"
              aria-checked={swatch.checked}
              style={{ background: swatch.css, '--dv-swatch': swatch.css } as React.CSSProperties}
            />
          </button>
        ) : (
          <button
            key={swatch.key}
            type="button"
            role="radio"
            className="dv-swatch"
            aria-checked={swatch.checked}
            aria-label={swatch.label}
            disabled={disabled}
            onClick={swatch.pick}
            style={{ background: swatch.css, '--dv-swatch': swatch.css } as React.CSSProperties}
          />
        ),
      )}
      {children}
    </div>
  );
}
