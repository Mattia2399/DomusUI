import { describe, expect, it, vi } from 'vitest';
import { emptyClimateConfig, type ClimateCallApi } from './climateConfigClient';
import { climateObservedKey, CLIMATE_STATE_TYPES, getClimateState, setHouseIntent, setZoneIntent } from './climateStateClient';

const response = { state: 'absent', revision: 0, configState: 'ready', configRevision: 1, preview: { house: { operatingMode: 'off', controlMode: 'manual' }, zones: [], deadbandCelsius: 0.2 } };

describe('Climate intent client', () => {
  it('uses distinct read and revisioned intent writes', async () => {
    const mock = vi.fn(async () => response);
    const callApi = mock as unknown as ClimateCallApi;
    expect(await getClimateState(callApi)).toEqual(response);
    await setHouseIntent(callApi, 'heating', 'manual', 0);
    expect(mock).toHaveBeenLastCalledWith({ type: CLIMATE_STATE_TYPES.house, operating_mode: 'heating', control_mode: 'manual', expected_revision: 0 }, { reportError: false, throwOnError: true });
    await setZoneIntent(callApi, 'living', 'follow_house', 21, 1);
    expect(mock).toHaveBeenLastCalledWith({ type: CLIMATE_STATE_TYPES.zone, zone_id: 'living', mode: 'follow_house', target_temperature: 21, expected_revision: 1 }, { reportError: false, throwOnError: true });
    await expect(getClimateState(async <T,>() => ({ revision: 0 }) as T)).rejects.toThrow();
  });

  it('refreshes only when configured climate readings change', () => {
    const config = emptyClimateConfig();
    config.zones.push({ id: 'living', name: 'Living', areaId: null, reference: { primaryEntityId: 'sensor.living_temp', fallbacks: [] }, endpointIds: [] });
    const base = { 'sensor.living_temp': { state: '19.2' }, 'sensor.other': { state: '12' } };
    expect(climateObservedKey(config, base)).toEqual(climateObservedKey(config, { ...base, 'sensor.other': { state: '30' } }));
    expect(climateObservedKey(config, base)).not.toEqual(climateObservedKey(config, { ...base, 'sensor.living_temp': { state: '21.1' } }));
  });
});
