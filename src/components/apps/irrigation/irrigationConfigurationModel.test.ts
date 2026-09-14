import { describe, expect, it } from 'vitest';
import {
  applyIrrigationEntitySuggestions,
  formatIrrigationEntityStateLabel,
  getIrrigationEntityMetadata,
  rankIrrigationEntityOptions,
  validateIrrigationConfiguration,
  type IrrigationConfigurationModel,
  type IrrigationEntityState,
} from './irrigationConfigurationModel';

const states: Record<string, IrrigationEntityState> = {
  'binary_sensor.window': { state: 'off', rawAttributes: { friendly_name: 'Finestra' } },
  'binary_sensor.garden_rain': { state: 'off', rawAttributes: { friendly_name: 'Pioggia giardino', device_class: 'moisture' } },
  'weather.home': { state: 'sunny', rawAttributes: { friendly_name: 'Meteo casa' } },
  'sensor.kitchen_temperature': { state: '22', rawAttributes: { device_class: 'temperature', unit_of_measurement: '°C' } },
  'sensor.outdoor_temperature': { state: '19', rawAttributes: { friendly_name: 'Temperatura esterna', device_class: 'temperature', unit_of_measurement: '°C' } },
  'sensor.outdoor_humidity': { state: '62', rawAttributes: { device_class: 'humidity', unit_of_measurement: '%' } },
  'sensor.garden_soil_moisture': { state: '48', rawAttributes: { device_class: 'moisture', unit_of_measurement: '%' } },
  'sensor.irrigation_water_usage': { state: '110', rawAttributes: { device_class: 'water', unit_of_measurement: 'L' } },
  'sensor.irrigation_water_average': { state: '130', rawAttributes: { device_class: 'water', unit_of_measurement: 'L' } },
  'switch.coffee': { state: 'off', rawAttributes: { friendly_name: 'Macchina caffè' } },
  'valve.garden_north': { state: 'closed', rawAttributes: { friendly_name: 'Valvola giardino nord' } },
};

const emptyConfig: IrrigationConfigurationModel = {
  rainSensorEnabled: true,
  blockOnRainSensorUnavailable: true,
  maximumManualDurationMin: 30,
  maxConcurrentZones: 1,
  parallelSafetyAcknowledged: false,
  rainDuringCycle: 'stop_immediately',
  rainSensorEntityId: '',
  weatherEntityId: '',
  humidityEntityId: '',
  outdoorTempEntityId: '',
  soilMoistureEntityId: '',
  waterUsageEntityId: '',
  waterAverageEntityId: '',
  zones: [{ id: 'north', name: 'Nord', entityId: '', soilMoistureEntityId: '' }],
};

describe('irrigation configuration intelligence', () => {
  it('ranks device class, context and availability instead of alphabetic entity ids', () => {
    expect(rankIrrigationEntityOptions(
      'outdoorTempEntityId',
      ['sensor.kitchen_temperature', 'sensor.outdoor_temperature'],
      states,
    )[0]).toBe('sensor.outdoor_temperature');
    expect(rankIrrigationEntityOptions(
      'zoneEntityId',
      ['switch.coffee', 'valve.garden_north'],
      states,
    )[0]).toBe('valve.garden_north');
  });

  it('fills missing associations without replacing a valid user choice', () => {
    const suggested = applyIrrigationEntitySuggestions(
      emptyConfig,
      {
        binarySensorOptions: ['binary_sensor.window', 'binary_sensor.garden_rain'],
        weatherOptions: ['weather.home'],
        sensorOptions: Object.keys(states).filter((entityId) => entityId.startsWith('sensor.')),
        zoneEntityOptions: ['switch.coffee', 'valve.garden_north'],
      },
      states,
    );

    expect(suggested.rainSensorEntityId).toBe('binary_sensor.garden_rain');
    expect(suggested.outdoorTempEntityId).toBe('sensor.outdoor_temperature');
    expect(suggested.zones[0]?.entityId).toBe('valve.garden_north');
  });

  it('blocks unsafe structural errors while keeping temporary availability as a warning', () => {
    const issues = validateIrrigationConfiguration({
      ...emptyConfig,
      rainSensorEntityId: 'binary_sensor.garden_rain',
      zones: [
        { id: 'north', name: 'Nord', entityId: 'valve.garden_north' },
        { id: 'south', name: 'Sud', entityId: 'valve.garden_north' },
      ],
    }, states);

    expect(issues.some((issue) => issue.code === 'duplicate_zone_entity' && issue.severity === 'error')).toBe(true);
    expect(issues.some((issue) => issue.code === 'entity_unavailable')).toBe(false);
  });

  it('rejects a house-wide manual duration above sixty minutes', () => {
    const issues = validateIrrigationConfiguration({
      ...emptyConfig,
      rainSensorEnabled: false,
      maximumManualDurationMin: 90,
      zones: [{ id: 'north', name: 'Nord', entityId: 'valve.garden_north' }],
    }, states);

    expect(issues.some((issue) => issue.code === 'invalid_max_duration')).toBe(true);
  });

  it('rounds long numeric entity states only for presentation', () => {
    expect(formatIrrigationEntityStateLabel('19.123456789')).toBe('19,12');
    expect(formatIrrigationEntityStateLabel('closed')).toBe('closed');
    expect(getIrrigationEntityMetadata('sensor.precise', {
      'sensor.precise': {
        state: '1234.5678901',
        rawAttributes: { unit_of_measurement: 'L' },
      },
    }).stateLabel).toBe('1.234,57');
  });

  it('accepts input booleans only for the isolated Demo runtime', () => {
    const demoConfig = {
      ...emptyConfig,
      rainSensorEnabled: false,
      zones: [{ ...emptyConfig.zones[0], entityId: 'input_boolean.demo_valve' }],
    };
    expect(validateIrrigationConfiguration(demoConfig, {}).some(
      (issue) => issue.code === 'invalid_zone_domain',
    )).toBe(true);
    expect(validateIrrigationConfiguration(
      demoConfig,
      {},
      { allowDemoActuators: true },
    ).some((issue) => issue.code === 'invalid_zone_domain')).toBe(false);
  });
});
