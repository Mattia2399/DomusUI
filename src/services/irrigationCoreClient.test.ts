import { describe, expect, it, vi } from 'vitest';
import type { IrrigationConfigurationModel } from '../components/apps/irrigation/irrigationConfigurationModel';
import {
  IRRIGATION_CORE_TYPES,
  type IrrigationCallApi,
  callIrrigationCoreCommand,
  fromIrrigationCoreDocument,
  getIrrigationCoreConfig,
  getIrrigationCoreState,
  saveIrrigationCoreConfig,
  toIrrigationCoreConfiguration,
} from './irrigationCoreClient';

const configuration: IrrigationConfigurationModel = {
  maximumManualDurationMin: 30,
  maxConcurrentZones: 1,
  parallelSafetyAcknowledged: false,
  rainSensorEnabled: true,
  rainSensorEntityId: 'binary_sensor.rain',
  blockOnRainSensorUnavailable: true,
  rainDuringCycle: 'stop_immediately',
  weatherEntityId: 'weather.home',
  humidityEntityId: '',
  outdoorTempEntityId: '',
  soilMoistureEntityId: '',
  waterUsageEntityId: '',
  waterAverageEntityId: '',
  zones: [{
    id: 'garden', name: 'Garden', entityId: 'valve.garden', enabled: true,
    days: ['mon'], startTimes: ['06:00'], baseDuration: 12,
    manualDurationMin: 10, iconKey: 'sprout', detail: '', soilMoistureEntityId: '',
  }],
};

const document = {
  schema: 'domusos-irrigation' as const,
  version: 1 as const,
  revision: 4,
  mode: 'enabled' as const,
  ...toIrrigationCoreConfiguration(configuration),
  legacyAutomations: [],
};

describe('Domus Core irrigation client', () => {
  it('maps the flat UI model without losing safety settings', () => {
    expect(fromIrrigationCoreDocument(document)).toEqual(configuration);
    expect(toIrrigationCoreConfiguration(configuration)).toMatchObject({
      settings: { maxConcurrentZones: 1, rainDuringCycle: 'stop_immediately' },
      zones: [expect.objectContaining({ entityId: 'valve.garden' })],
    });
  });

  it('uses the authenticated websocket contract and optimistic revision', async () => {
    const callApiMock = vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === IRRIGATION_CORE_TYPES.getConfig) return document;
      if (message.type === IRRIGATION_CORE_TYPES.saveConfig) return { ...document, revision: 5 };
      return null;
    });
    const callApi = callApiMock as unknown as IrrigationCallApi;
    await expect(getIrrigationCoreConfig(callApi)).resolves.toEqual(document);
    await expect(saveIrrigationCoreConfig(callApi, configuration, 4, true)).resolves.toMatchObject({ revision: 5 });
    expect(callApiMock).toHaveBeenLastCalledWith({
      type: IRRIGATION_CORE_TYPES.saveConfig,
      config: toIrrigationCoreConfiguration(configuration),
      expected_revision: 4,
      migrate_legacy: true,
    }, { reportError: false, throwOnError: true });
  });

  it('rejects malformed backend responses and forwards bounded commands', async () => {
    const malformed = vi.fn(async () => ({ available: true, mode: 'enabled' })) as unknown as IrrigationCallApi;
    await expect(getIrrigationCoreConfig(malformed)).rejects.toThrow('Risposta Domus Core non valida');
    await expect(getIrrigationCoreState(malformed)).rejects.toThrow('Stato Domus Core non valido');

    const callApiMock = vi.fn(async () => ({ id: 'session-1' }));
    await callIrrigationCoreCommand(callApiMock as unknown as IrrigationCallApi, IRRIGATION_CORE_TYPES.startZone, {
      zone_id: 'garden', duration_min: 10, request_id: 'request-1',
    });
    expect(callApiMock).toHaveBeenCalledWith({
      type: IRRIGATION_CORE_TYPES.startZone,
      zone_id: 'garden', duration_min: 10, request_id: 'request-1',
    }, { reportError: false, throwOnError: true });
  });
});
