import type { HaArea } from '../../hooks/useHaLiveConnection';

/** HOUSE configuration contract. CLM.1 has no runtime engine or persistence. */
export type ClimateControlMode = 'manual' | 'auto';
export type ClimateSeason = 'heating' | 'cooling' | 'off';
export type ClimateService = 'space_heating' | 'space_cooling' | 'domestic_hot_water';

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

/** CLM.2 wire/store document. It contains installation configuration only. */
export type ClimateReference = { primaryEntityId: string; fallbacks: string[] };
export type ClimateRelatedControlConfig = { entityId: string; type: 'select' | 'number' | 'input_number' | 'switch' | 'input_boolean' | 'sensor' | 'binary_sensor' | 'valve'; role: string };
export type ClimateBindingConfig = { primaryEntityId: string | null; relatedControls: ClimateRelatedControlConfig[] };
export type ClimateOperatingMode = 'heating' | 'cooling' | 'off';
export type ClimateZoneMode = 'follow_house' | 'off';
export type ClimateZoneConfig = { id: string; name: string; areaId: string | null; reference: ClimateReference; humidityReference?: ClimateReference; mode?: ClimateZoneMode; endpointIds: string[] };
export type ClimateEndpointRole = 'room_heater' | 'room_cooler' | 'radiator_trv' | 'zone_actuator' | 'fan' | 'dehumidifier';
export type ClimateTerminalCapabilities = { supportsHeating: boolean; supportsCooling: boolean; supportsFan: boolean; supportsDehumidification: boolean };
export type ClimateEndpointConfig = { id: string; name: string; kind: 'air_conditioner' | 'thermostatic_radiator_valve' | 'manifold_actuator' | 'fan_coil' | 'ducted_unit' | 'other'; zoneId: string; circuitId: string | null; roles: ClimateEndpointRole[]; capabilities?: ClimateTerminalCapabilities; controlTopology?: 'direct_supervisory'; entity: ClimateBindingConfig; setpointKind: 'room_temperature' | 'none' };
export type ClimateCircuitConfig = { id: string; name: string; kind: 'radiators' | 'radiant_floor' | 'radiant_ceiling' | 'fan_coil' | 'hydronic_generic'; zoneIds: string[]; endpointIds: string[]; controller: ClimateBindingConfig | null; generatorIds: string[]; capabilities?: { supportsHeating: boolean; supportsCooling: boolean }; supplySetpoint?: { setpointKind: 'circuit_supply_temperature'; entity: ClimateBindingConfig }; components?: ClimateBindingConfig; coolingConstraint?: { requiresHumidityControl: boolean; condensationProtection: 'unspecified' | 'required'; auxiliaryIds: string[] }; generatorPreferences?: { generatorId: string; role: 'preferred' | 'fallback' | 'required' }[] };
export type ClimateGeneratorConfig = { id: string; name: string; kind: 'boiler' | 'thermostove' | 'heat_pump' | 'other'; circuitIds: string[]; services: ClimateService[]; capabilities?: { supportsSpaceHeating: boolean; supportsCooling: boolean; supportsDhw: boolean }; entity: ClimateBindingConfig; setpointKind: 'none' | 'generator_water_temperature' };
export type ClimateAuxiliaryConfig = { id: string; name: string; kind: 'dehumidifier' | 'ventilation'; zoneIds: string[]; circuitIds: string[]; entity: ClimateBindingConfig };
export type ClimateEquipmentGroupConfig = { id: string; name: string; memberEndpointIds: string[]; generatorIds: string[]; sharedOperatingMode: boolean };
export type ClimateProfileConfig = { id: string; name: string; zoneTargets: Record<string, number> };
export type ClimateWeekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
export type ClimateScheduleEventConfig = { time: string; profileId: string };
export type ClimateScheduleDayConfig = { day: ClimateWeekday; events: ClimateScheduleEventConfig[] };
/** Active physical state, demand and sensor health are not stored here. */
export type ClimateHouseConfig = { version: 1; operatingMode?: ClimateOperatingMode; controlMode?: ClimateControlMode; zones: ClimateZoneConfig[]; endpoints: ClimateEndpointConfig[]; circuits: ClimateCircuitConfig[]; generators: ClimateGeneratorConfig[]; auxiliaries?: ClimateAuxiliaryConfig[]; equipmentGroups?: ClimateEquipmentGroupConfig[]; profiles: ClimateProfileConfig[]; schedules: ClimateScheduleDayConfig[]; strategy: null };
