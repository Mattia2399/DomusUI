import { describe, expect, it } from 'vitest';
import {
  createNextSharedHouseConfiguration,
  createSharedHouseConfiguration,
  parseSharedHouseConfiguration,
  type DashboardLayoutConfiguration,
} from './dashboardConfigurationRepository';

const dashboard: DashboardLayoutConfiguration = {
  storageVersion: 14,
  sections: [],
  widgets: [],
  widgetTypeLayoutOverrides: {},
  widgetLayoutOverrides: {},
  responsiveLayouts: {},
};

function buildDocument() {
  return createSharedHouseConfiguration({
    revision: 3,
    updatedAt: '2026-08-04T10:00:00.000Z',
    updatedByUserId: 'owner-user-id',
    dashboard,
    security: {
      alarmEntityId: 'alarm_control_panel.home',
      visibleSensorEntityIds: ['binary_sensor.front_door'],
      visibleCameraEntityIds: null,
    },
    rooms: {
      customRooms: [{ id: 'studio', name: 'Studio', createdAt: 123 }],
      hiddenEntitiesByRoom: { studio: ['light.desk'] },
    },
  });
}

describe('shared house configuration contract', () => {
  it('preserves null automatic discovery and explicit empty selections', () => {
    const parsed = parseSharedHouseConfiguration({
      ...buildDocument(),
      security: {
        alarmEntityId: '',
        visibleSensorEntityIds: [],
        visibleCameraEntityIds: null,
      },
    });

    expect(parsed?.security).toEqual({
      alarmEntityId: null,
      visibleSensorEntityIds: [],
      visibleCameraEntityIds: null,
    });
  });

  it('normalizes duplicate entity ids and invalid room entries', () => {
    const parsed = parseSharedHouseConfiguration({
      ...buildDocument(),
      security: {
        alarmEntityId: ' alarm_control_panel.home ',
        visibleSensorEntityIds: [' binary_sensor.front_door ', 'binary_sensor.front_door'],
        visibleCameraEntityIds: ['camera.garden'],
      },
      rooms: {
        customRooms: [
          { id: ' studio ', name: ' Studio ', createdAt: 123 },
          { id: '', name: 'Invalid', createdAt: 456 },
        ],
        hiddenEntitiesByRoom: {
          studio: [' light.desk ', 'light.desk'],
        },
      },
    });

    expect(parsed?.security.visibleSensorEntityIds).toEqual(['binary_sensor.front_door']);
    expect(parsed?.rooms.customRooms).toEqual([{ id: 'studio', name: 'Studio', createdAt: 123 }]);
    expect(parsed?.rooms.hiddenEntitiesByRoom).toEqual({ studio: ['light.desk'] });
  });

  it('rejects unversioned or malformed server documents', () => {
    expect(parseSharedHouseConfiguration({ dashboard })).toBeNull();
    expect(parseSharedHouseConfiguration({ ...buildDocument(), revision: 0 })).toBeNull();
    expect(parseSharedHouseConfiguration({ ...buildDocument(), dashboard: { widgets: [] } })).toBeNull();
  });

  it('accepts only the versioned Grid Engine 2.0 Home marker', () => {
    const marked = parseSharedHouseConfiguration({
      ...buildDocument(),
      dashboard: { ...dashboard, layoutEngine: 'grid-engine-2' },
    });
    const unknown = parseSharedHouseConfiguration({
      ...buildDocument(),
      dashboard: { ...dashboard, layoutEngine: 'future-engine' },
    });

    expect(marked?.dashboard.layoutEngine).toBe('grid-engine-2');
    expect(unknown?.dashboard.layoutEngine).toBeUndefined();
  });

  it('round-trips only supported grid metrics versions and keeps absence legacy', () => {
    const v2 = parseSharedHouseConfiguration({
      ...buildDocument(),
      dashboard: { ...dashboard, gridMetricsVersion: 'v2' },
    });
    const explicitLegacy = parseSharedHouseConfiguration({
      ...buildDocument(),
      dashboard: { ...dashboard, gridMetricsVersion: 'legacy' },
    });
    const unknown = parseSharedHouseConfiguration({
      ...buildDocument(),
      dashboard: { ...dashboard, gridMetricsVersion: 'future' },
    });

    expect(v2?.dashboard.gridMetricsVersion).toBe('v2');
    expect(explicitLegacy?.dashboard.gridMetricsVersion).toBe('legacy');
    expect(unknown?.dashboard.gridMetricsVersion).toBeUndefined();
    expect(parseSharedHouseConfiguration(buildDocument())?.dashboard.gridMetricsVersion).toBeUndefined();
  });

  it('increments the revision without mutating the previous document', () => {
    const current = buildDocument();
    const next = createNextSharedHouseConfiguration(
      current,
      {
        dashboard: current.dashboard,
        security: { ...current.security, visibleSensorEntityIds: [] },
        rooms: current.rooms,
      },
      'second-admin',
      '2026-08-04T10:05:00.000Z',
    );

    expect(current.revision).toBe(3);
    expect(next).toMatchObject({
      revision: 4,
      updatedByUserId: 'second-admin',
      updatedAt: '2026-08-04T10:05:00.000Z',
    });
    expect(next.security.visibleSensorEntityIds).toEqual([]);
  });

  it('preserves a valid opaque publication client id and drops malformed values', () => {
    const valid = parseSharedHouseConfiguration({
      ...buildDocument(),
      publication: { source: 'edit', originClientId: ' client-a ' },
    });
    const invalid = parseSharedHouseConfiguration({
      ...buildDocument(),
      publication: { source: 'edit', originClientId: 'x'.repeat(129) },
    });

    expect(valid?.publication).toEqual({ source: 'edit', originClientId: 'client-a' });
    expect(invalid?.publication).toEqual({ source: 'edit' });
  });
});
