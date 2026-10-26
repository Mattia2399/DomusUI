// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { activeSceneOf, runSceneCalls, sceneIconOf, toSceneModel, undoSceneCall, undoSceneId } from './scene';

const scene = (entityId: string, state: string, attributes: Record<string, unknown> = {}) =>
  toSceneModel(entityId, { state, rawAttributes: attributes });

describe('a scene', () => {
  it('takes its icon from Home Assistant, or from its name', () => {
    expect(sceneIconOf('mdi:movie-open', 'Qualcosa')).toBe('film');
    expect(sceneIconOf(null, 'Buonanotte')).toBe('moon');
    expect(sceneIconOf(null, 'Concentrazione')).toBe('briefcase');
    expect(sceneIconOf(null, 'Festa')).toBe('star');
  });

  it('knows its devices, when it ran, and keeps its colour', () => {
    const relax = scene('scene.relax', '2026-10-26T18:42:00Z', { friendly_name: 'Relax', entity_id: ['light.a', 'light.b'] });
    expect(relax).toMatchObject({ name: 'Relax', icon: 'leaf', entityIds: ['light.a', 'light.b'], available: true });
    expect(relax.ranAt).toBe(Date.parse('2026-10-26T18:42:00Z'));
    expect(scene('scene.relax', 'unknown', { friendly_name: 'Relax' }).color).toBe(relax.color);
    expect(scene('scene.x', 'unknown').ranAt).toBeNull();
  });

  it('reads the last one run in the last hours as the one in place', () => {
    const now = Date.parse('2026-10-26T20:00:00Z');
    const scenes = [
      scene('scene.a', '2026-10-26T18:00:00Z'),
      scene('scene.b', '2026-10-26T19:30:00Z'),
      scene('scene.c', '2026-10-25T19:30:00Z'),
    ];
    expect(activeSceneOf(scenes, now)).toBe('scene.b');
    expect(activeSceneOf([scenes[2]], now)).toBeNull();
  });

  it('takes a snapshot before running, so it can be undone', () => {
    const relax = scene('scene.relax', 'unknown', { entity_id: ['light.a'] });
    expect(runSceneCalls(relax, 'living-room')).toEqual([
      { domain: 'scene', service: 'create', data: { scene_id: 'domus_undo_living_room', snapshot_entities: ['light.a'] } },
      { domain: 'scene', service: 'turn_on', data: { entity_id: 'scene.relax' } },
    ]);
    expect(runSceneCalls(scene('scene.empty', 'unknown'), 'r')).toHaveLength(1);
    expect(undoSceneCall('living-room')).toEqual({ domain: 'scene', service: 'turn_on', data: { entity_id: 'scene.domus_undo_living_room' } });
    expect(undoSceneId('custom:Studio')).toBe('domus_undo_custom_studio');
  });
});
