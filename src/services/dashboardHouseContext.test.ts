import { describe, expect, it, vi } from 'vitest';
import { dashboardHouseLookups, fetchDashboardHouseContext, parseDashboardHouseContext, type DashboardHouseContext } from './dashboardHouseContext';

const context: DashboardHouseContext = {
  schemaVersion: 'domusos.dashboard.house.v1', topologyRevision: 4,
  rooms: [{ id: 'a', name: 'Sala' }, { id: 'b', name: 'Sala' }],
  devices: [{ id: 'device-1', effectiveRoomId: 'b' }],
  entities: [
    { registryId: 'registry-1', entityId: 'sensor.temperature', deviceId: 'device-1', effectiveRoomId: 'b' },
    { registryId: null, entityId: 'light.orphan', deviceId: null, effectiveRoomId: null },
  ],
};

describe('Dashboard House panel context', () => {
  it('indexes canonical room IDs even when room names repeat', () => {
    const parsed = parseDashboardHouseContext(context);
    const lookup = dashboardHouseLookups(parsed);
    expect(lookup.roomIdOf('sensor.temperature')).toBe('b');
    expect(lookup.roomNameOf('sensor.temperature')).toBe('Sala');
    expect(lookup.deviceIdOf('sensor.temperature')).toBe('device-1');
    expect(lookup.entitiesByRegistryId.get('registry-1')?.entityId).toBe('sensor.temperature');
    expect(lookup.roomIdOf('light.orphan')).toBeNull();
    expect(lookup.roomNameOf('light.orphan')).toBeUndefined();
  });

  it('accepts only the closed Dashboard projection contract', async () => {
    const callApi = vi.fn().mockResolvedValue(context);
    expect(await fetchDashboardHouseContext(callApi)).toEqual(context);
    expect(callApi).toHaveBeenCalledWith({ type: 'domusos/dashboard/get_house_context' }, { reportError: false, throwOnError: true });
    expect(() => parseDashboardHouseContext({ ...context, schemaVersion: 'domusos.house.v1' })).toThrow();
    expect(() => parseDashboardHouseContext({ ...context, entities: [{ entityId: 'sensor.x' }] })).toThrow();
  });
});
