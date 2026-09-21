import { describe, expect, it } from 'vitest';
import { filterEntityIdsForWidgetKind } from './haRegistryPresentation';

describe('filterEntityIdsForWidgetKind', () => {
  it('offers numeric and binary sensors in the Sensor card entity selector', () => {
    const entityIds = [
      'sensor.living_room_temperature',
      'binary_sensor.garage_door',
      'switch.garden_pump',
    ];

    expect(filterEntityIdsForWidgetKind('sensor', entityIds)).toEqual([
      'sensor.living_room_temperature',
      'binary_sensor.garage_door',
    ]);
  });

  it('offers fans only to the dedicated Fan card', () => {
    const entityIds = ['switch.pump', 'input_boolean.demo', 'fan.living_room'];

    expect(filterEntityIdsForWidgetKind('switch', entityIds)).toEqual(['switch.pump', 'input_boolean.demo']);
    expect(filterEntityIdsForWidgetKind('fan', entityIds)).toEqual(['fan.living_room']);
  });

  it('offers humidifiers only to the dedicated Humidifier card', () => {
    const entityIds = ['climate.bedroom', 'humidifier.bedroom', 'sensor.bedroom_humidity'];
    expect(filterEntityIdsForWidgetKind('climate', entityIds)).toEqual(['climate.bedroom']);
    expect(filterEntityIdsForWidgetKind('humidifier', entityIds)).toEqual(['humidifier.bedroom']);
  });
});
