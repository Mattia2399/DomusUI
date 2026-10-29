// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  AMBIENT_PALETTE,
  BASE_AMBIENT,
  companionOf,
  dominantGlowColor,
  hashName,
  resolveAlarmAmbient,
  resolveRoomAmbient,
} from './ambientModel';

describe('the colour of a room', () => {
  it.each([
    ['mdi:sofa', '#FF9F0A'],
    ['mdi:sofa-outline', '#FF9F0A'],
    ['mdi:bed', '#5E5CE6'],
    ['mdi:shower', '#64D2FF'],
    ['mdi:bathtub', '#64D2FF'],
    ['mdi:silverware-fork-knife', '#BF5AF2'],
    ['mdi:stove', '#BF5AF2'],
    ['mdi:desk', '#30D158'],
    ['mdi:monitor', '#30D158'],
    ['mdi:garage', '#8E8E93'],
    ['mdi:tree', '#34C7A5'],
    ['mdi:flower', '#34C7A5'],
  ])('takes %s as %s', (icon, color) => {
    expect(resolveRoomAmbient({ id: 'area', name: 'Stanza', icon }).a).toBe(color);
  });

  it.each([
    ['Soggiorno', '#FF9F0A'],
    ['Camera da letto', '#5E5CE6'],
    ['Bagno ospiti', '#64D2FF'],
    ['Kitchen', '#BF5AF2'],
    ['Ufficio', '#30D158'],
    ['Garage', '#8E8E93'],
    ['Terrazzo', '#34C7A5'],
  ])('knows %s by its name when the area has no icon', (name, color) => {
    expect(resolveRoomAmbient({ id: 'area', name }).a).toBe(color);
  });

  it('prefers the icon to the name', () => {
    expect(resolveRoomAmbient({ id: 'area', name: 'Bagno', icon: 'mdi:sofa' }).a).toBe('#FF9F0A');
  });

  it('gives any other room a stable colour from its name', () => {
    const first = resolveRoomAmbient({ id: 'one', name: 'Ripostiglio di Mattia' });
    const again = resolveRoomAmbient({ id: 'two', name: '  ripostiglio di mattia ' });
    expect(first.a).toBe(again.a);
    expect(AMBIENT_PALETTE).toContain(first.a);
    expect(hashName('Cucina')).toBe(hashName('cucina'));
    const spread = new Set(['Cucina', 'Bagno', 'Camera', 'Ingresso', 'Terrazzo', 'Cantina', 'Studio', 'Lavanderia'].map(hashName));
    expect(spread.size).toBeGreaterThan(2);
  });

  it('uses the picture colour first, and the icon when the picture could not be read', () => {
    const area = { id: 'kitchen', name: 'Cucina', icon: 'mdi:stove', picture: '/api/image/serve/x/512x512' };
    expect(resolveRoomAmbient(area, '#12a4f0').a).toBe('#12A4F0');
    expect(resolveRoomAmbient(area, null).a).toBe('#BF5AF2');
    expect(resolveRoomAmbient(area, 'not a colour').a).toBe('#BF5AF2');
  });

  it('pairs every colour with a different companion', () => {
    expect(companionOf('#FF9F0A')).toBe('#FF375F');
    expect(companionOf('#5E5CE6')).toBe('#0A84FF');
    expect(companionOf('#64D2FF')).toBe('#30D158');
    expect(companionOf('#34C7A5')).toBe('#FF9F0A');
    for (const color of [...AMBIENT_PALETTE, '#8E8E93', '#12A4F0', '#E04A3B']) {
      expect(companionOf(color).toLowerCase()).not.toBe(color.toLowerCase());
    }
    const room = resolveRoomAmbient({ id: 'area', name: 'Camera', icon: 'mdi:bed' });
    expect(room).toEqual({ a: '#5E5CE6', b: '#0A84FF', intensity: 'base' });
  });
});

describe('the colour of the alarm', () => {
  it.each([
    ['disarmed', '#3A3F4B', '#5E5CE6', false],
    ['armed_home', '#30D158', '#30D158', false],
    ['armed_away', '#0A84FF', '#0A84FF', false],
    ['armed_night', '#5E5CE6', '#5E5CE6', false],
    ['armed_vacation', '#64D2FF', '#64D2FF', false],
    ['armed_custom_bypass', '#BF5AF2', '#BF5AF2', false],
    ['pending', '#FF9F0A', '#FF9F0A', false],
    ['triggered', '#FF453A', '#FF375F', true],
    ['unavailable', '#3A3F4B', '#3A3F4B', false],
    [null, '#3A3F4B', '#3A3F4B', false],
    ['something_new', '#3A3F4B', '#3A3F4B', false],
  ])('%s is %s and %s, subtle', (state, a, b, pulse) => {
    expect(resolveAlarmAmbient(state)).toEqual({ a, b, intensity: 'subtle', pulse });
  });
});

describe('the dominant colour of a picture', () => {
  const pixels = (...colors: [number, number, number][]) => colors.flatMap(([r, g, b]) => [r, g, b, 255]);

  it('takes the most frequent hue, ignoring near black, near white and grey', () => {
    const image = pixels(
      [20, 120, 230], [30, 130, 240], [25, 125, 235],
      [5, 5, 5], [250, 250, 250], [128, 128, 128], [130, 128, 126],
      [230, 60, 40],
    );
    const color = dominantGlowColor(image) as string;
    expect(color).toMatch(/^#[0-9A-F]{6}$/);
    // A blue, brought to a glowing lightness.
    expect(Number.parseInt(color.slice(5, 7), 16)).toBeGreaterThan(Number.parseInt(color.slice(1, 3), 16));
  });

  it('gives nothing when nothing colourful is left', () => {
    expect(dominantGlowColor(pixels([0, 0, 0], [255, 255, 255], [120, 120, 120]))).toBeNull();
    expect(dominantGlowColor([])).toBeNull();
  });

  it('starts from blue and violet', () => {
    expect(BASE_AMBIENT).toEqual({ a: '#0A84FF', b: '#BF5AF2', intensity: 'base', pulse: false });
  });
});
