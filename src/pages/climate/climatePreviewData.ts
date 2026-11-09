import type { ClimateSystem, ClimateZone } from './climateModel';

/** Isolated design fixture. Never read from or written to Home Assistant. */
export const DEMO_CLIMATE_SYSTEM: ClimateSystem = {
  version: 1,
  controlMode: 'auto',
  season: 'heating',
  zones: [
    { id: 'living', name: 'Soggiorno', areaId: 'demo_living', referenceTemperatureEntityId: 'sensor.demo_soggiorno', target: { kind: 'room_temperature', celsius: 21 }, endpointIds: ['living-trv', 'living-ac'], profileId: 'comfort', scheduleId: 'weekday' },
    { id: 'bedroom', name: 'Camera', areaId: 'demo_bedroom', referenceTemperatureEntityId: 'sensor.demo_camera', target: { kind: 'room_temperature', celsius: 20 }, endpointIds: ['bedroom-trv', 'bedroom-ac'], profileId: 'comfort', scheduleId: 'weekday' },
    { id: 'guest', name: 'Camera ospiti', areaId: 'demo_guest', referenceTemperatureEntityId: 'sensor.demo_ospiti', target: { kind: 'room_temperature', celsius: 24 }, endpointIds: ['guest-ac'], profileId: 'eco', scheduleId: 'weekend' },
    { id: 'bath', name: 'Bagno', areaId: 'demo_bath', referenceTemperatureEntityId: 'sensor.demo_bagno', target: { kind: 'room_temperature', celsius: 22 }, endpointIds: ['bath-trv'], profileId: 'comfort', scheduleId: 'weekday' },
    { id: 'study', name: 'Studio', areaId: 'demo_study', target: { kind: 'room_temperature', celsius: 20 }, endpointIds: [], profileId: 'eco' },
  ],
  endpoints: [
    { id: 'living-trv', name: 'Valvola Soggiorno', kind: 'thermostatic_radiator_valve', zoneId: 'living', circuitId: 'radiators', capabilities: ['heat', 'off', 'room_temperature_setpoint'], entity: { primaryEntityId: 'climate.demo_valvola_soggiorno', relatedControls: [] }, setpointKind: 'room_temperature' },
    { id: 'living-ac', name: 'Climatizzatore Soggiorno', kind: 'air_conditioner', zoneId: 'living', capabilities: ['heat', 'cool', 'off', 'fan', 'swing', 'room_temperature_setpoint'], entity: { primaryEntityId: 'climate.demo_ac_soggiorno', relatedControls: [] }, setpointKind: 'room_temperature' },
    { id: 'bedroom-trv', name: 'Valvola Camera', kind: 'thermostatic_radiator_valve', zoneId: 'bedroom', circuitId: 'radiators', capabilities: ['heat', 'off', 'room_temperature_setpoint'], entity: { primaryEntityId: 'climate.demo_valvola_camera', relatedControls: [] }, setpointKind: 'room_temperature' },
    { id: 'bedroom-ac', name: 'Climatizzatore Camera', kind: 'air_conditioner', zoneId: 'bedroom', capabilities: ['heat', 'cool', 'off', 'fan', 'swing', 'room_temperature_setpoint'], entity: { primaryEntityId: 'climate.demo_ac_camera', relatedControls: [] }, setpointKind: 'room_temperature' },
    { id: 'guest-ac', name: 'Climatizzatore Ospiti', kind: 'air_conditioner', zoneId: 'guest', capabilities: ['heat', 'cool', 'off', 'fan', 'room_temperature_setpoint'], entity: { primaryEntityId: 'climate.demo_ac_ospiti', relatedControls: [] }, setpointKind: 'room_temperature' },
    { id: 'bath-trv', name: 'Valvola Bagno', kind: 'thermostatic_radiator_valve', zoneId: 'bath', circuitId: 'radiators', capabilities: ['heat', 'off', 'room_temperature_setpoint'], entity: { primaryEntityId: 'climate.demo_valvola_bagno', relatedControls: [] }, setpointKind: 'room_temperature' },
  ],
  circuits: [{ id: 'radiators', name: 'Circuito radiatori', kind: 'radiators', zoneIds: ['living', 'bedroom', 'bath'], endpointIds: ['living-trv', 'bedroom-trv', 'bath-trv'], controller: { primaryEntityId: 'climate.demo_termostato_corridoio', relatedControls: [] }, generatorIds: ['boiler', 'thermostove'] }],
  generators: [
    { id: 'boiler', name: 'Caldaia', kind: 'boiler', circuitIds: ['radiators'], services: ['space_heating'], entity: { primaryEntityId: 'climate.demo_caldaia', relatedControls: [] }, setpointKind: 'none' },
    { id: 'thermostove', name: 'Termostufa', kind: 'thermostove', circuitIds: ['radiators'], services: ['space_heating', 'domestic_hot_water'], entity: { primaryEntityId: 'climate.demo_termostufa', relatedControls: [{ entityId: 'select.demo_potenza', role: 'power' }, { entityId: 'select.demo_ventilazione', role: 'fan' }, { entityId: 'switch.demo_eco', role: 'eco' }] }, setpointKind: 'generator_water_temperature', waterTarget: { kind: 'generator_water_temperature', celsius: 65 } },
  ],
  profiles: [
    { id: 'comfort', name: 'Comfort', roomTarget: { kind: 'room_temperature', celsius: 21 } },
    { id: 'eco', name: 'Eco', roomTarget: { kind: 'room_temperature', celsius: 18 } },
    { id: 'night', name: 'Notte', roomTarget: { kind: 'room_temperature', celsius: 19 } },
    { id: 'away', name: 'Assente', roomTarget: { kind: 'room_temperature', celsius: 16 } },
  ],
  schedules: [
    { id: 'weekday', name: 'Lunedì–Venerdì', zoneId: 'living', events: [
      { weekday: 1, localTime: '06:30', action: { profileId: 'comfort' } },
      { weekday: 1, localTime: '08:30', action: { profileId: 'eco' } },
      { weekday: 1, localTime: '17:00', action: { profileId: 'comfort' } },
      { weekday: 1, localTime: '23:30', action: { profileId: 'night' } },
    ] },
    { id: 'weekend', name: 'Weekend', zoneId: 'guest', events: [
      { weekday: 6, localTime: '08:00', action: { profileId: 'comfort' } },
      { weekday: 6, localTime: '23:30', action: { profileId: 'night' } },
    ] },
  ],
  strategy: { heatingSource: 'radiators', radiatorGenerator: 'boiler' },
  overrides: [{ id: 'bath-override', zoneId: 'bath', roomTarget: { kind: 'room_temperature', celsius: 22.5 }, expires: { kind: 'at', timestamp: '23:00' } }],
};

export type DemoZoneStatus = 'satisfied' | 'heating' | 'cooling' | 'override' | 'offline';
export type DemoZoneView = Readonly<{
  zone: ClimateZone;
  status: DemoZoneStatus;
  currentCelsius?: number;
  source: 'radiator' | 'air_conditioner' | 'none';
  nextTime?: string;
}>;

const views: Record<string, Omit<DemoZoneView, 'zone'>> = {
  living: { status: 'satisfied', currentCelsius: 20.9, source: 'radiator', nextTime: '17:00' },
  bedroom: { status: 'heating', currentCelsius: 19.2, source: 'radiator', nextTime: '23:30' },
  guest: { status: 'cooling', currentCelsius: 26.4, source: 'air_conditioner', nextTime: '23:30' },
  bath: { status: 'override', currentCelsius: 21.2, source: 'radiator', nextTime: '23:00' },
  study: { status: 'offline', source: 'none' },
};

export const DEMO_ZONE_VIEWS: readonly DemoZoneView[] = DEMO_CLIMATE_SYSTEM.zones.map((zone) => ({ zone, ...views[zone.id] }));
