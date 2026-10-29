import type { LightModel } from './light';

/*
 * The colour of a light, and of its card when it is on: the light's colour
 * mixed with white, deeper as the light is brighter, but never so deep that
 * the dark text on it drops below 7:1.
 */

export type Rgb = [number, number, number];

/** Dark ink on a lit card. */
export const LIT_TILE_INK = '#1C1405';
export const MIN_LIT_TILE_LUMINANCE = 0.32;
export const MIN_LIT_TILE_CONTRAST = 7;

const KELVIN_STOPS: Array<[number, Rgb]> = [
  [2200, [255, 138, 40]],
  [2700, [255, 176, 84]],
  [4000, [255, 214, 150]],
  [6500, [170, 205, 255]],
];

export function kelvinToRgb(kelvin: number): Rgb {
  for (let index = 0; index < KELVIN_STOPS.length - 1; index += 1) {
    const [fromK, from] = KELVIN_STOPS[index];
    const [toK, to] = KELVIN_STOPS[index + 1];
    if (kelvin <= toK) {
      const f = Math.max(0, (kelvin - fromK) / (toK - fromK));
      return [0, 1, 2].map((channel) => Math.round(from[channel] + (to[channel] - from[channel]) * f)) as Rgb;
    }
  }
  return KELVIN_STOPS[KELVIN_STOPS.length - 1][1];
}

/** A hue as a lamp shows it: saturated and fairly light. */
export function hueToRgb(hue: number): Rgb {
  const saturation = 0.9;
  const lightness = 0.6;
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    const a = saturation * Math.min(lightness, 1 - lightness);
    return Math.round(255 * (lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [channel(0), channel(8), channel(4)];
}

/** The colour the light gives off now; a plain dimmer reads as warm white. */
export function lightRgb(model: LightModel): Rgb {
  if (model.caps === 'color' && model.mode === 'color') return hueToRgb(model.hue);
  if (model.caps === 'color' || model.caps === 'ct') return kelvinToRgb(model.kelvin);
  return kelvinToRgb(2700);
}

export function relativeLuminance([r, g, b]: Rgb) {
  const linear = (value: number) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function rgbToHex(rgb: Rgb) {
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

export function contrastRatio(a: Rgb, b: Rgb) {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

export const rgbCss = (rgb: Rgb, alpha?: number) =>
  alpha === undefined ? `rgb(${rgb.join(', ')})` : `rgba(${rgb.join(', ')}, ${alpha})`;

/** The background of a lit card for a light colour and a brightness (1–100). */
export function litTileRgb(light: Rgb, brightnessPct: number): Rgb {
  const ink = hexToRgb(LIT_TILE_INK);
  const mix = (amount: number) =>
    light.map((channel) => Math.round(255 * (1 - amount) + channel * amount)) as Rgb;
  let amount = 0.42 + 0.5 * (Math.max(1, Math.min(100, brightnessPct)) / 100);
  let tile = mix(amount);
  while (
    amount > 0 &&
    (relativeLuminance(tile) < MIN_LIT_TILE_LUMINANCE || contrastRatio(tile, ink) < MIN_LIT_TILE_CONTRAST)
  ) {
    amount = Math.max(0, amount - 0.04);
    tile = mix(amount);
  }
  return tile;
}

export type LitTile = { background: string; light: Rgb };

/** The look of the card of a light that is on; null when it is off or away. */
export function lightTileColor(model: LightModel): LitTile | null {
  if (!model.available || !model.on) return null;
  const light = lightRgb(model);
  const pct = model.caps === 'onoff' ? 100 : model.brightnessPct ?? 100;
  return { background: rgbCss(litTileRgb(light, pct)), light };
}
