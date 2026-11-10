import { describe, expect, it, vi } from 'vitest';
import { buildDeviceAreaMap, buildEntityAreaMap, parseRegistryDeviceEntries, parseRegistryEntityEntries, resolveRoomClimateReadings } from '../components/rooms/roomsDirectory';
import { compareEnvironment, fetchHouseSnapshot, fetchHouseTopology, parseHouseTopology, projectHouseForRooms, type HouseTopology } from './houseCore';

function topology(): HouseTopology {
  return {
    schemaVersion: 'domusos.house.v1', topologyRevision: 1, topologyFingerprint: 'one', generatedAt: '2026-11-10T00:00:00Z',
    floors: [{ id: 'ground', name: 'Ground', level: 0, aliases: [], order: 0 }],
    rooms: [
      { id: 'living', name: 'Living', floorId: 'ground', aliases: ['Lounge'], icon: 'mdi:sofa', picture: null, temperatureEntityId: null, humidityEntityId: null },
      { id: 'orphan-room', name: 'Orphan', floorId: 'missing-floor', aliases: [], icon: null, picture: null, temperatureEntityId: null, humidityEntityId: null },
    ],
    devices: [{ id: 'dev', name: 'Device', areaId: 'living' }, { id: 'loose', name: 'Loose', areaId: null }],
    entities: [
      { entityId: 'light.direct', registryId: 'stable-1', domain: 'light', deviceId: 'dev', explicitAreaId: 'orphan-room', effectiveAreaId: 'orphan-room', deviceClass: null },
      { entityId: 'sensor.temp', registryId: 'stable-2', domain: 'sensor', deviceId: 'dev', explicitAreaId: null, effectiveAreaId: 'living', deviceClass: 'temperature' },
      { entityId: 'light.loose', registryId: 'stable-3', domain: 'light', deviceId: 'loose', explicitAreaId: null, effectiveAreaId: null, deviceClass: null },
      { entityId: 'light.orphan', registryId: 'stable-4', domain: 'light', deviceId: 'missing-device', explicitAreaId: null, effectiveAreaId: null, deviceClass: null },
    ],
    unassigned: { deviceIds: ['loose'], entityIds: ['light.loose', 'light.orphan'] },
    issues: [{ code: 'missing_floor_reference', subjectId: 'orphan-room', referenceId: 'missing-floor' },
      { code: 'missing_device_reference', subjectId: 'light.orphan', referenceId: 'missing-device' }],
  };
}

describe('House → Rooms structural projection', () => {
  it('uses backend membership, stable IDs, floor order and explicit unassigned sets', () => {
    const house = topology();
    const projected = projectHouseForRooms(house);
    expect(projected.areas.map((area) => [area.area_id, area.floor_id])).toEqual([['living', 'ground'], ['orphan-room', 'missing-floor']]);
    expect(projected.floors.map((floor) => floor.floor_id)).toEqual(['ground']);
    expect(projected.entityAreaByEntityId).toEqual({ 'light.direct': 'orphan-room', 'sensor.temp': 'living' });
    expect(projected.unassignedEntityIds).toEqual(new Set(['light.loose', 'light.orphan']));
    expect(projected.unassignedDeviceIds).toEqual(new Set(['loose']));
    expect(house.entities[0].registryId).toBe('stable-1');
    expect(projected.registryEntities[0].registryId).toBe('stable-1');
  });

  it('matches legacy membership for the visible registry subset, including missing references', () => {
    const house = topology();
    const devices = parseRegistryDeviceEntries(house.devices.map((device) => ({ id: device.id, name: device.name, area_id: device.areaId })));
    const entities = parseRegistryEntityEntries(house.entities.map((entity) => ({ entity_id: entity.entityId, device_id: entity.deviceId, area_id: entity.explicitAreaId })));
    const legacy = buildEntityAreaMap(entities, buildDeviceAreaMap(devices));
    expect(projectHouseForRooms(house).entityAreaByEntityId).toEqual(legacy);
    const filtered = { ...house, entities: house.entities.filter((entity) => entity.entityId !== 'light.direct') };
    expect(projectHouseForRooms(filtered).visibleEntityIds.has('light.direct')).toBe(false);
  });

  it('keeps the 2025 environmental fallback and classifies shadow differences', () => {
    const house = topology();
    const states = { 'sensor.temp': { state: '21', rawAttributes: { device_class: 'temperature', unit_of_measurement: '°C' } } };
    expect(resolveRoomClimateReadings(projectHouseForRooms(house).areas[0], ['sensor.temp'], states).temperature).toBe(21);
    expect(compareEnvironment({ value: 21, sourceEntityId: 'sensor.temp' },
      { configured: false, available: false, value: null, unit: null, sourceEntityId: null, updatedAt: null, status: 'unconfigured' })).toBe('LEGACY_FALLBACK_ONLY');
    house.rooms[0].temperatureEntityId = 'sensor.temp';
    expect(resolveRoomClimateReadings(projectHouseForRooms(house).areas[0], ['sensor.temp'], states).temperature).toBe(21);
    expect(compareEnvironment({ value: 21, sourceEntityId: 'sensor.temp' },
      { configured: true, available: true, value: 21, unit: '°C', sourceEntityId: 'sensor.temp', updatedAt: null, status: 'available' })).toBe('MATCH');
  });

  it('classifies every environmental shadow outcome without changing display values', () => {
    const reading = { configured: true, available: true, value: 21, unit: '°C', sourceEntityId: 'sensor.temp', updatedAt: null, status: 'available' };
    expect(compareEnvironment({ value: undefined, sourceEntityId: null }, reading)).toBe('HOUSE_PRIMARY_ONLY');
    expect(compareEnvironment({ value: undefined, sourceEntityId: null }, { ...reading, available: false, value: null })).toBe('UNAVAILABLE');
    expect(compareEnvironment({ value: 21, sourceEntityId: 'sensor.other' }, reading)).toBe('DIFFERENT_SOURCE');
    expect(compareEnvironment({ value: 22, sourceEntityId: 'sensor.temp' }, reading)).toBe('DIFFERENT_VALUE');
  });

  it('rejects malformed topology and centralizes both House reads', async () => {
    expect(() => parseHouseTopology({ ...topology(), schemaVersion: 'unknown' })).toThrow();
    const api = vi.fn(async (message: Record<string, unknown>) => message.type === 'domusos/house/get_topology' ? topology() :
      { schemaVersion: 'domusos.house.v1', topologyFingerprint: 'one', generatedAt: 'now', rooms: [] });
    expect((await fetchHouseTopology(api)).rooms).toHaveLength(2);
    expect((await fetchHouseSnapshot(api)).rooms).toEqual([]);
    expect(api.mock.calls.map((call) => call[0].type)).toEqual(['domusos/house/get_topology', 'domusos/house/get_snapshot']);
  });
});
