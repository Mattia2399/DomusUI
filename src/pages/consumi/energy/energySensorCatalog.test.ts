import { describe, expect, it } from 'vitest';
import type { EnergyDiscovery } from '../../../services/energyCoreClient';
import type { MockEntityStateMap } from '../../../types/ha';
import { isExternalStatistic, meterKnown, referenceCheck, sensorOptions, sensorProblem } from './energySensorCatalog';

const state = (unit: string, attributes: Record<string, unknown> = {}) =>
  ({ state: '1', unit, rawAttributes: { unit_of_measurement: unit, ...attributes } });

const STATES = {
  'sensor.pv': state('W', { device_class: 'power', state_class: 'measurement', friendly_name: 'Fotovoltaico' }),
  'sensor.pv_kwh': state('kWh', { device_class: 'energy', state_class: 'total_increasing', friendly_name: 'Fotovoltaico energia' }),
  'sensor.pv_today': state('kWh', { device_class: 'energy', friendly_name: 'Oggi' }),
  'sensor.soc': state('%', { device_class: 'battery', friendly_name: 'Batteria' }),
  'sensor.temp': state('°C', { device_class: 'temperature', friendly_name: 'Temperatura' }),
  'binary_sensor.door': state(''),
} as unknown as MockEntityStateMap;

describe('Energy sensor catalog', () => {
  it('applies the backend gates to each kind of binding', () => {
    expect(sensorProblem('energy', { unit: 'W', deviceClass: null, stateClass: 'measurement' })).toMatch(/È una potenza \(W\)/);
    expect(sensorProblem('energy', { unit: 'W', deviceClass: 'power', stateClass: null })).toMatch(/È una potenza/);
    expect(sensorProblem('energy', { unit: 'kWh', deviceClass: 'energy', stateClass: null })).toMatch(/Non è un contatore cumulativo/);
    expect(sensorProblem('energy', { unit: 'kWh', deviceClass: null, stateClass: 'total' })).toBeNull();
    expect(sensorProblem('power', { unit: 'kWh', deviceClass: null, stateClass: null })).toMatch(/non una potenza/);
    expect(sensorProblem('power', { unit: '°C', deviceClass: 'temperature', stateClass: null })).toBe('Non è un sensore di potenza');
    expect(sensorProblem('power', { unit: 'W', deviceClass: null, stateClass: 'total_increasing' })).toMatch(/cumulativo/);
    expect(sensorProblem('power', { unit: 'kW', deviceClass: 'power', stateClass: 'measurement' })).toBeNull();
    expect(sensorProblem('soc', { unit: 'W', deviceClass: null, stateClass: null })).toMatch(/in %/);
    expect(sensorProblem('soc', { unit: '%', deviceClass: 'humidity', stateClass: null })).toBe('Non è uno stato di carica');
  });

  it('lists sensors only, compatible ones first, with names from Home Assistant or the discovery', () => {
    const discovery = { candidates: { 'sensor.pv': { name: 'PV', device: { name: 'Inverter Tetto' } } } } as unknown as EnergyDiscovery;
    const options = sensorOptions(STATES, discovery, 'energy');
    expect(options.map((option) => option.id)).toEqual(['sensor.pv_kwh', 'sensor.soc', 'sensor.pv', 'sensor.pv_today', 'sensor.temp']);
    expect(options[0]).toEqual({ id: 'sensor.pv_kwh', name: 'Fotovoltaico energia', unit: 'kWh', device: null, problem: null });
    expect(options.slice(1).every((option) => option.problem)).toBe(true);
    expect(sensorOptions(STATES, discovery, 'power').find((option) => option.id === 'sensor.pv')).toMatchObject({ device: 'Inverter Tetto', problem: null });
  });

  it('checks new references only, and trusts the Recorder about meters', () => {
    const meters = { 'sensor.pv_kwh': { status: 'incompatible' }, 'opower:grid': { status: 'pending' }, 'sensor.gone': { status: 'unknown' } } as never;
    const check = referenceCheck(STATES, meters, new Set(['sensor.temp']));
    expect(check('power', 'sensor.temp')).toBeNull();
    expect(check('energy', 'sensor.pv_kwh')).toMatch(/non lo considera un contatore/);
    expect(check('energy', 'sensor.pv')).toMatch(/potenza/);
    expect(check('power', 'sensor.missing')).toBeNull();

    expect(meterKnown(STATES, meters, 'opower:grid')).toBe(true);
    expect(meterKnown(STATES, meters, 'sensor.gone')).toBe(false);
    expect(meterKnown(STATES, {}, 'sensor.pv_kwh')).toBe(true);
    expect(meterKnown(STATES, {}, 'sensor.pv_today')).toBe(false);
    expect(meterKnown(STATES, {}, 'opower:other')).toBe(false);
  });

  it('recognises external statistic ids', () => {
    expect(isExternalStatistic('opower:grid_import')).toBe(true);
    expect(isExternalStatistic('sensor.grid')).toBe(false);
    expect(isExternalStatistic('Opower:grid')).toBe(false);
    expect(isExternalStatistic('opower:_grid')).toBe(false);
  });
});
