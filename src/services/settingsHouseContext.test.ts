import { describe, expect, it, vi } from 'vitest';
import {
  demoSettingsHouseContext, fetchSettingsHouseContext, parseSettingsHouseContext,
  settingsHouseLookups, type SettingsHouseContext,
} from './settingsHouseContext';

const house: SettingsHouseContext = {
  schemaVersion: 'domusos.system.house.v1', topologyRevision: 4,
  rooms: [{ id: 'ground', name: 'Camera' }, { id: 'upper', name: 'Camera' }],
  devices: [{ id: 'device', roomId: 'ground' }, { id: 'empty', roomId: null }],
  entities: [
    { registryId: 'stable', entityId: 'light.renamed', effectiveRoomId: 'upper' },
    { registryId: 'inherited', entityId: 'sensor.inherited', effectiveRoomId: 'ground' },
    { registryId: 'unassigned', entityId: 'sensor.unassigned', effectiveRoomId: null },
  ],
};

describe('Settings House context', () => {
  it('joins by stable registry identity and keeps duplicate room names distinct', () => {
    const lookup = settingsHouseLookups(house);
    expect(lookup.entityRoomId('light.old_name', 'stable')).toBe('upper');
    expect(lookup.entityRoomId('sensor.inherited', 'inherited')).toBe('ground');
    expect(lookup.entityRoomId('sensor.unassigned', 'unassigned')).toBeNull();
    expect(lookup.deviceRoomId('device')).toBe('ground');
    expect(lookup.roomName('ground')).toBe('Camera');
    expect(lookup.roomName('upper')).toBe('Camera');
  });

  it('does not infer a room from HA registry data when House is unavailable', () => {
    const lookup = settingsHouseLookups(null);
    expect(lookup.entityRoomId('light.lamp', 'stable')).toBeNull();
    expect(lookup.deviceRoomId('device')).toBeNull();
    expect(lookup.roomName('ground')).toBeUndefined();
  });

  it('validates the narrow system API and rejects the Dashboard schema', async () => {
    const callApi = vi.fn(async () => house);
    expect(await fetchSettingsHouseContext(callApi)).toEqual(house);
    expect(callApi).toHaveBeenCalledWith(
      { type: 'domusos/system/get_house_context' }, { reportError: false, throwOnError: true },
    );
    expect(() => parseSettingsHouseContext({ ...house, schemaVersion: 'domusos.dashboard.house.v1' })).toThrow();
    expect(() => parseSettingsHouseContext({ ...house, entities: [{ entityId: 'light.lamp' }] })).toThrow();
  });

  it('keeps registry reconstruction limited to an explicit offline fixture', () => {
    const demo = demoSettingsHouseContext(
      [{ area_id: 'ground', name: 'Camera' }],
      [{ id: 'device', areaId: 'ground' }],
      [{ entityId: 'light.lamp', deviceId: 'device' }],
    );
    expect(settingsHouseLookups(demo).entityRoomId('light.lamp')).toBe('ground');
  });
});
