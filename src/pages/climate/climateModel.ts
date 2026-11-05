import type { HaArea } from '../../hooks/useHaLiveConnection';

/** HOUSE configuration contract. CLM.1 has no runtime engine or persistence. */
export type ClimateControlMode = 'manual' | 'auto';
export type ClimateSeason = 'heating' | 'cooling' | 'off';
export type ClimateService = 'space_heating' | 'domestic_hot_water';

/** A room target can only be placed on a zone or a room-temperature endpoint. */
export type RoomTemperatureTarget = Readonly<{ kind: 'room_temperature'; celsius: number }>;
/** Hydronic generator setpoints have a different type and are never zone targets. */
export type GeneratorWaterTarget = Readonly<{ kind: 'generator_water_temperature'; celsius: number }>;

/** References the existing Home Assistant area registry; no second room tree. */
export type ClimateZone = Readonly<{
  id: string;
  name: string;
  areaId: HaArea['area_id'];
  referenceTemperatureEntityId?: string;
  target?: RoomTemperatureTarget;
  endpointIds: readonly string[];
  profileId?: string;
  scheduleId?: string;
}>;

export type ClimateEndpointCapability =
  | 'heat' | 'cool' | 'off' | 'fan' | 'swing' | 'room_temperature_setpoint';

/** Primary climate entity and its optional secondary controls form one logical device. */
export type ClimateEntityBinding = Readonly<{
  primaryEntityId: string;
  relatedControls: readonly Readonly<{ entityId: string; role: string }>[];
}>;

export type ClimateEndpoint = Readonly<{
  id: string;
  name: string;
  kind: 'air_conditioner' | 'thermostatic_radiator_valve' | 'other';
  zoneId: string;
  circuitId?: string;
  capabilities: readonly ClimateEndpointCapability[];
  entity: ClimateEntityBinding;
  setpointKind?: 'room_temperature';
}>;

/** A controller can request heat for a circuit without becoming a house master. */
export type ClimateCircuit = Readonly<{
  id: string;
  name: string;
  kind: 'radiators' | 'other';
  zoneIds: readonly string[];
  endpointIds: readonly string[];
  controller?: ClimateEntityBinding;
  generatorIds: readonly string[];
}>;

export type ClimateGenerator = Readonly<{
  id: string;
  name: string;
  kind: 'boiler' | 'thermostove' | 'other';
  circuitIds: readonly string[];
  services: readonly ClimateService[];
  entity: ClimateEntityBinding;
}> & (
  | Readonly<{ setpointKind: 'generator_water_temperature'; waterTarget?: GeneratorWaterTarget }>
  | Readonly<{ setpointKind: 'none'; waterTarget?: never }>
);

/** User-defined names such as Comfort, Eco, Night and Away are examples only. */
export type ClimateProfile = Readonly<{
  id: string;
  name: string;
  roomTarget: RoomTemperatureTarget;
}>;

export type ClimateSchedule = Readonly<{
  id: string;
  name: string;
  zoneId: string;
  events: readonly Readonly<{
    weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
    localTime: string;
    action: { profileId: string } | { roomTarget: RoomTemperatureTarget };
  }>[];
}>;

/** Preference only; no source selection is performed in CLM.1. */
export type ClimateStrategy = Readonly<{
  heatingSource: 'radiators' | 'air_conditioners' | 'automatic';
  radiatorGenerator: 'boiler' | 'thermostove' | 'automatic';
}>;

/** Future temporary intent; never applied or timed by CLM.1. */
export type ClimateOverride = Readonly<{
  id: string;
  zoneId: string;
  roomTarget: RoomTemperatureTarget;
  expires: { kind: 'at'; timestamp: string } | { kind: 'next_schedule_event' };
}>;

export type ClimateSystem = Readonly<{
  version: 1;
  controlMode: ClimateControlMode;
  season: ClimateSeason;
  zones: readonly ClimateZone[];
  endpoints: readonly ClimateEndpoint[];
  circuits: readonly ClimateCircuit[];
  generators: readonly ClimateGenerator[];
  profiles: readonly ClimateProfile[];
  schedules: readonly ClimateSchedule[];
  strategy?: ClimateStrategy;
  overrides?: readonly ClimateOverride[];
}>;
