import { describe, expect, it } from 'vitest';
import { buildDeviceHealthSnapshots, summarizeDeviceHealth } from './deviceHealthModel';

describe('deviceHealthModel', () => {
  it('groups related entities and resolves health signals without inventing telemetry', () => {
    const devices = buildDeviceHealthSnapshots({
      connected: true,
      states: {
        'lock.front_door': {
          state: 'locked',
          rawAttributes: {
            friendly_name: 'Porta ingresso',
            __last_updated: '2026-07-30T10:00:00Z',
          },
        },
        'sensor.front_door_battery': {
          state: '14',
          numericValue: 14,
          unit: '%',
          rawAttributes: { device_class: 'battery' },
        },
        'binary_sensor.front_door_connectivity': {
          state: 'on',
          rawAttributes: { device_class: 'connectivity' },
        },
        'update.front_door_firmware': {
          state: 'on',
          rawAttributes: { friendly_name: 'Firmware serratura' },
        },
      },
      entityRegistry: [
        { entityId: 'lock.front_door', deviceId: 'front-door' },
        {
          entityId: 'sensor.front_door_battery',
          deviceId: 'front-door',
          deviceClass: 'battery',
          entityCategory: 'diagnostic',
        },
        {
          entityId: 'binary_sensor.front_door_connectivity',
          deviceId: 'front-door',
          deviceClass: 'connectivity',
          entityCategory: 'diagnostic',
        },
        { entityId: 'update.front_door_firmware', deviceId: 'front-door' },
      ],
      deviceRegistry: [
        {
          id: 'front-door',
          nameByUser: 'Porta ingresso',
          manufacturer: 'Nuki',
          model: 'Smart Lock',
          areaId: 'entry',
        },
      ],
      areas: [{ area_id: 'entry', name: 'Ingresso' }],
      widgets: [
        {
          id: 'lock-card',
          kind: 'lock',
          title: 'Porta',
          entityId: 'lock.front_door',
          status: 'Chiusa',
          isOn: false,
          layout: { i: 'lock-card', x: 0, y: 0, w: 1, h: 2 },
        },
      ],
      batteryWarningThreshold: 20,
    });

    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({
      id: 'front-door',
      name: 'Porta ingresso',
      status: 'warning',
      batteryLevel: 14,
      connectionState: 'online',
      updateAvailable: true,
      entityCount: 4,
      dashboardWidgetCount: 1,
    });
    expect(devices[0].issues.map((issue) => issue.code)).toEqual([
      'battery_low',
      'update_available',
    ]);
    expect(devices[0].signalStrength).toBeUndefined();
  });

  it('uses explicit connectivity and availability to identify unavailable devices', () => {
    const devices = buildDeviceHealthSnapshots({
      connected: true,
      states: {
        'light.porch': { state: 'unavailable' },
        'binary_sensor.porch_connectivity': {
          state: 'off',
          rawAttributes: { device_class: 'connectivity' },
        },
      },
      entityRegistry: [
        { entityId: 'light.porch', deviceId: 'porch' },
        {
          entityId: 'binary_sensor.porch_connectivity',
          deviceId: 'porch',
          deviceClass: 'connectivity',
          entityCategory: 'diagnostic',
        },
      ],
      deviceRegistry: [{ id: 'porch', name: 'Luce portico' }],
    });

    expect(devices[0].status).toBe('offline');
    expect(devices[0].issues.map((issue) => issue.code)).toContain('connectivity_off');
  });

  it('fails closed when Home Assistant is disconnected', () => {
    const devices = buildDeviceHealthSnapshots({
      connected: false,
      states: {
        'light.kitchen': { state: 'on' },
      },
      entityRegistry: [{ entityId: 'light.kitchen', deviceId: 'kitchen-light' }],
      deviceRegistry: [{ id: 'kitchen-light', name: 'Luce cucina' }],
    });

    expect(devices[0].status).toBe('unknown');
    expect(devices[0].issues).toEqual([
      expect.objectContaining({ code: 'connection_unavailable' }),
    ]);
  });

  it('summarizes each status and maintenance signal once', () => {
    const summary = summarizeDeviceHealth([
      {
        id: 'one',
        name: 'One',
        status: 'warning',
        statusLabel: 'Da controllare',
        issues: [{ code: 'battery_low', label: 'Batteria', detail: 'Bassa' }],
        entities: [],
        entityCount: 0,
        unavailableEntityCount: 0,
        batteryLevel: 10,
        updateAvailable: true,
        updateEntityIds: ['update.one'],
        dashboardWidgetCount: 0,
      },
      {
        id: 'two',
        name: 'Two',
        status: 'operational',
        statusLabel: 'Operativo',
        issues: [],
        entities: [],
        entityCount: 0,
        unavailableEntityCount: 0,
        updateAvailable: false,
        updateEntityIds: [],
        dashboardWidgetCount: 0,
      },
    ]);

    expect(summary).toMatchObject({
      total: 2,
      operational: 1,
      warning: 1,
      lowBattery: 1,
      updates: 1,
    });
  });
});
