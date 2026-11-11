import { describe, expect, it } from 'vitest';
import type { DashboardHouseContext } from '../../services/dashboardHouseContext';
import { roomsOfLights } from './sidebarQuickCard';

const house = (rooms: Array<[string, string]>, memberships: Array<[string, string | null]>): DashboardHouseContext => ({
  schemaVersion: 'domusos.dashboard.house.v1', topologyRevision: 1,
  rooms: rooms.map(([id, name]) => ({ id, name })), devices: [],
  entities: memberships.map(([entityId, effectiveRoomId]) => ({ registryId: entityId, entityId, deviceId: null, effectiveRoomId })),
});

describe('sidebar lights room identity', () => {
  it('keeps same-name rooms separate, follows moves and renames, and drops deleted rooms', () => {
    const context = house([['a', 'Camera'], ['b', 'Camera']], [['light.one', 'a'], ['light.two', 'b']]);
    const lights = ['light.one', 'light.two'];
    expect(roomsOfLights(lights, context)).toEqual(['Camera', 'Camera']);
    context.entities[1].effectiveRoomId = 'a';
    expect(roomsOfLights(lights, context)).toEqual(['Camera']);
    context.rooms[0].name = 'Studio';
    expect(roomsOfLights(lights, context)).toEqual(['Studio']);
    context.rooms.splice(0, 1);
    expect(roomsOfLights(lights, context)).toEqual([]);
    expect(roomsOfLights(lights, null)).toEqual([]);
  });
});
