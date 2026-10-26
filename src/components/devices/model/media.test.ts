import { describe, expect, it } from 'vitest';
import {
  applyMediaAction,
  formatMediaTime,
  mediaConfirmed,
  mediaKindOf,
  mediaPositionNow,
  mediaServiceCall,
  pickRoomPlayer,
  toMediaModel,
} from './media';

const NOW = Date.parse('2026-10-26T20:00:00Z');

const tv = toMediaModel('media_player.living_tv', {
  state: 'playing',
  rawAttributes: {
    friendly_name: 'TV Soggiorno',
    device_class: 'tv',
    supported_features: 1 | 2 | 4 | 8 | 16 | 32 | 128 | 256 | 2048 | 65536,
    media_title: 'Il viaggio di ritorno',
    media_series_title: 'Stagione 2',
    app_name: 'Netflix',
    media_duration: 2820,
    media_position: 1200,
    media_position_updated_at: '2026-10-26T19:59:50Z',
    volume_level: 0.42,
    source: 'Netflix',
    source_list: ['Netflix', 'HDMI 1'],
    sound_mode: 'Film',
    sound_mode_list: ['Standard', 'Film'],
  },
});

describe('media players', () => {
  it('reads what a player is playing and what it supports', () => {
    expect(tv).toMatchObject({
      name: 'TV Soggiorno',
      kind: 'tv',
      on: true,
      playing: true,
      title: 'Il viaggio di ritorno',
      artist: 'Stagione 2',
      app: 'Netflix',
      volume: 42,
      sources: ['Netflix', 'HDMI 1'],
      soundModes: ['Standard', 'Film'],
    });
    expect(tv.supports).toMatchObject({ seek: true, volume: true, source: true, soundMode: true, shuffle: false, group: false });
  });

  it('tells a television from a speaker', () => {
    expect(mediaKindOf('media_player.kitchen', { state: 'off', rawAttributes: { device_class: 'speaker' } })).toBe('speaker');
    expect(mediaKindOf('media_player.samsung_tv', { state: 'off', rawAttributes: {} })).toBe('tv');
    expect(mediaKindOf('media_player.sonos', { state: 'off', rawAttributes: {} })).toBe('speaker');
  });

  it('moves the position on while it plays, up to the end', () => {
    expect(mediaPositionNow(tv, NOW)).toBe(1210);
    expect(mediaPositionNow({ ...tv, state: 'paused' }, NOW)).toBe(1200);
    expect(mediaPositionNow(tv, NOW + 3_600_000)).toBe(2820);
    expect(formatMediaTime(1210)).toBe('20:10');
    expect(formatMediaTime(3727)).toBe('1:02:07');
  });

  it('shows the room the player chosen, else one playing, else one on', () => {
    const off = { ...tv, entityId: 'media_player.off', on: false, playing: false };
    const on = { ...tv, entityId: 'media_player.on', playing: false };
    expect(pickRoomPlayer([off, on, tv], null)?.entityId).toBe('media_player.living_tv');
    expect(pickRoomPlayer([off, on], null)?.entityId).toBe('media_player.on');
    expect(pickRoomPlayer([off, on, tv], 'media_player.off')?.entityId).toBe('media_player.off');
    expect(pickRoomPlayer([], null)).toBeNull();
  });

  it('pauses where it is and plays on from there', () => {
    const paused = applyMediaAction(tv, { type: 'play_pause' }, NOW);
    expect(paused).toMatchObject({ playing: false, state: 'paused', position: 1210, positionAt: NOW });
    expect(mediaServiceCall(tv, { type: 'play_pause' })).toEqual({
      domain: 'media_player',
      service: 'media_play_pause',
      data: { entity_id: 'media_player.living_tv' },
    });
    const off = applyMediaAction(tv, { type: 'power', on: false }, NOW);
    expect(mediaServiceCall(off, { type: 'play_pause' }).service).toBe('turn_on');
  });

  it('calls the services of Home Assistant', () => {
    expect(mediaServiceCall(tv, { type: 'volume', level: 55 }).data).toEqual({ entity_id: 'media_player.living_tv', volume_level: 0.55 });
    expect(mediaServiceCall(tv, { type: 'seek', position: 300.4 }).data).toMatchObject({ seek_position: 300 });
    expect(mediaServiceCall(tv, { type: 'source', source: 'HDMI 1' }).service).toBe('select_source');
    expect(mediaServiceCall(tv, { type: 'repeat', repeat: 'one' }).data).toMatchObject({ repeat: 'one' });
    expect(mediaServiceCall(tv, { type: 'group', member: 'media_player.kitchen', joined: true })).toEqual({
      domain: 'media_player',
      service: 'join',
      data: { entity_id: 'media_player.living_tv', group_members: ['media_player.kitchen'] },
    });
    expect(mediaServiceCall(tv, { type: 'group', member: 'media_player.kitchen', joined: false })).toEqual({
      domain: 'media_player',
      service: 'unjoin',
      data: { entity_id: 'media_player.kitchen' },
    });
  });

  it('keeps the group with the leader first', () => {
    const grouped = applyMediaAction(tv, { type: 'group', member: 'media_player.kitchen', joined: true });
    expect(grouped.groupMembers).toEqual(['media_player.living_tv', 'media_player.kitchen']);
    expect(applyMediaAction(grouped, { type: 'group', member: 'media_player.kitchen', joined: false }).groupMembers).toEqual([]);
  });

  it('waits for Home Assistant to reach the position asked', () => {
    const sought = applyMediaAction(tv, { type: 'seek', position: 100 }, NOW);
    expect(mediaConfirmed(tv, sought, NOW)).toBe(false);
    expect(mediaConfirmed({ ...tv, position: 100, positionAt: NOW }, sought, NOW)).toBe(true);
  });
});
