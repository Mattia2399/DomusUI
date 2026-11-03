// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { toLightModel } from './light';
import {
  contrastRatio,
  hexToRgb,
  hueToRgb,
  kelvinToRgb,
  LIT_TILE_INK,
  lightRgb,
  lightTileColor,
  litTileRgb,
  MIN_LIT_TILE_CONTRAST,
  MIN_LIT_TILE_LUMINANCE,
  relativeLuminance,
} from './tileColor';

const ink = hexToRgb(LIT_TILE_INK);

describe('the colour of a lit card', () => {
  it('keeps dark text readable on every hue, at every brightness', () => {
    for (let hue = 0; hue < 360; hue += 5) {
      for (const pct of [1, 25, 50, 75, 100]) {
        const tile = litTileRgb(hueToRgb(hue), pct);
        expect(relativeLuminance(tile)).toBeGreaterThanOrEqual(MIN_LIT_TILE_LUMINANCE);
        expect(contrastRatio(tile, ink)).toBeGreaterThanOrEqual(MIN_LIT_TILE_CONTRAST);
      }
    }
  });

  it('keeps dark text readable on every white', () => {
    for (let kelvin = 2000; kelvin <= 6500; kelvin += 100) {
      const tile = litTileRgb(kelvinToRgb(kelvin), 100);
      expect(contrastRatio(tile, ink)).toBeGreaterThanOrEqual(MIN_LIT_TILE_CONTRAST);
    }
  });

  it('is deeper when the light is brighter', () => {
    const warm = kelvinToRgb(2700);
    const dim = litTileRgb(warm, 10);
    const bright = litTileRgb(warm, 100);
    expect(relativeLuminance(bright)).toBeLessThan(relativeLuminance(dim));
  });

  it('follows the temperature stops', () => {
    expect(kelvinToRgb(2200)).toEqual([255, 138, 40]);
    expect(kelvinToRgb(6500)).toEqual([170, 205, 255]);
    expect(kelvinToRgb(9000)).toEqual([170, 205, 255]);
  });

  it('is glass when the light is off or away', () => {
    expect(lightTileColor(toLightModel('light.a', { state: 'off' }))).toBeNull();
    expect(lightTileColor(toLightModel('light.a', { state: 'unavailable' }))).toBeNull();
    const lit = lightTileColor(
      toLightModel('light.a', { state: 'on', rawAttributes: { supported_color_modes: ['hs'], color_mode: 'hs', hs_color: [265, 100], brightness: 255 } }),
    );
    expect(lit?.background).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    expect(lit?.light).toEqual(hueToRgb(265));
  });

  it('shows a pale colour as pale, going towards white with the saturation', () => {
    const colour = (saturation: number) =>
      lightRgb(toLightModel('light.a', { state: 'on', rawAttributes: { supported_color_modes: ['hs'], color_mode: 'hs', hs_color: [265, saturation] } }));
    expect(colour(100)).toEqual(hueToRgb(265));
    const pale = colour(30);
    pale.forEach((channel, index) => expect(channel).toBeGreaterThanOrEqual(hueToRgb(265)[index]));
    expect(Math.min(...pale)).toBeGreaterThan(170);
  });
});
