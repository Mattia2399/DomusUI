// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  bucketRoomEntities,
  climateGlance,
  countActiveAccessories,
  formatDegrees,
  missingSections,
  roomIconKind,
} from './roomSummary';

describe('the head of a room', () => {
  it.each([
    ['mdi:sofa', 'Qualcosa', 'sofa'],
    ['mdi:stove', 'Qualcosa', 'kitchen'],
    ['mdi:bed-king', 'Qualcosa', 'bed'],
    ['mdi:shower', 'Qualcosa', 'bath'],
    ['mdi:desk', 'Qualcosa', 'desk'],
    [null, 'Soggiorno', 'sofa'],
    [null, 'Camera da letto', 'bed'],
    [null, 'Ripostiglio', 'room'],
  ])('%s %s has the %s icon', (icon, name, kind) => {
    expect(roomIconKind(icon, name)).toBe(kind);
  });

  it('counts the accessories that are on', () => {
    const buckets = bucketRoomEntities(['light.a', 'light.b', 'switch.plug', 'fan.ceiling', 'media_player.tv', 'sensor.t']);
    const states = {
      'switch.plug': { state: 'on' },
      'fan.ceiling': { state: 'off' },
      'media_player.tv': { state: 'playing' },
    };
    expect(countActiveAccessories(buckets, states, (id) => id === 'light.a')).toBe(3);
  });

  it('reads the climate in a glance', () => {
    const buckets = bucketRoomEntities(['climate.ac']);
    expect(climateGlance(buckets, { 'climate.ac': { state: 'heat', rawAttributes: { temperature: 23 } } })).toEqual({
      mode: 'heat',
      target: 23,
      low: undefined,
      high: undefined,
    });
    expect(climateGlance(buckets, { 'climate.ac': { state: 'auto', rawAttributes: { target_temp_low: 20, target_temp_high: 24 } } })).toMatchObject({
      mode: 'heat_cool',
      low: 20,
      high: 24,
    });
    expect(climateGlance(bucketRoomEntities(['light.a']), {})).toBeNull();
  });

  it('lists what the room still lacks', () => {
    expect(missingSections(bucketRoomEntities(['light.a']))).toEqual(['climate', 'devices', 'security', 'media']);
    expect(missingSections(bucketRoomEntities(['climate.ac', 'switch.plug', 'lock.door', 'media_player.tv']))).toEqual([]);
    expect(missingSections(bucketRoomEntities(['cover.blind', 'camera.door']))).toEqual(['climate', 'media']);
  });

  it('writes degrees like the design', () => {
    expect(formatDegrees(20.94, 'it')).toBe('20,9°');
    expect(formatDegrees(23, 'it')).toBe('23°');
    expect(formatDegrees(21.5, 'en')).toBe('21.5°');
  });
});
