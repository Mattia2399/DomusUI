import type { ClimateHouseConfig, ClimateZoneConfig, ClimateEndpointConfig, ClimateCircuitConfig, ClimateGeneratorConfig } from './climateModel';

export function climateId(prefix: 'zone' | 'endpoint' | 'circuit' | 'generator'): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
}

export function newZone(): ClimateZoneConfig {
  return { id: climateId('zone'), name: '', areaId: null, reference: { primaryEntityId: '', fallbacks: [] }, endpointIds: [] };
}

export function newEndpoint(zoneId: string): ClimateEndpointConfig {
  return { id: climateId('endpoint'), name: '', kind: 'air_conditioner', zoneId, circuitId: null, roles: ['room_heater', 'room_cooler'], entity: { primaryEntityId: null, relatedControls: [] }, setpointKind: 'room_temperature' };
}

export function newCircuit(): ClimateCircuitConfig {
  return { id: climateId('circuit'), name: '', kind: 'radiators', zoneIds: [], endpointIds: [], controller: null, generatorIds: [] };
}

export function newGenerator(kind: 'boiler' | 'thermostove'): ClimateGeneratorConfig {
  return { id: climateId('generator'), name: '', kind, circuitIds: [], services: ['space_heating'], entity: { primaryEntityId: null, relatedControls: [] }, setpointKind: kind === 'thermostove' ? 'generator_water_temperature' : 'none' };
}

/** One owner for each link; recompute reciprocal arrays after every draft mutation. */
export function syncClimateLinks(config: ClimateHouseConfig): ClimateHouseConfig {
  const zoneIds = new Set(config.zones.map((item) => item.id));
  const circuitIds = new Set(config.circuits.map((item) => item.id));
  for (const profile of config.profiles) {
    profile.zoneTargets = Object.fromEntries(Object.entries(profile.zoneTargets).filter(([id]) => zoneIds.has(id)));
  }
  config.endpoints = config.endpoints.filter((item) => zoneIds.has(item.zoneId));
  for (const endpoint of config.endpoints) {
    if (!circuitIds.has(endpoint.circuitId ?? '')) endpoint.circuitId = null;
  }
  for (const zone of config.zones) zone.endpointIds = config.endpoints.filter((item) => item.zoneId === zone.id).map((item) => item.id);
  for (const circuit of config.circuits) {
    const linked = config.endpoints.filter((item) => item.circuitId === circuit.id);
    circuit.endpointIds = linked.map((item) => item.id);
    circuit.zoneIds = [...new Set(linked.map((item) => item.zoneId))];
    circuit.generatorIds = config.generators.filter((item) => item.circuitIds.includes(circuit.id)).map((item) => item.id);
    if (circuit.generatorPreferences) circuit.generatorPreferences = circuit.generatorPreferences.filter((item) => circuit.generatorIds.includes(item.generatorId));
  }
  for (const generator of config.generators) generator.circuitIds = generator.circuitIds.filter((id) => circuitIds.has(id));
  config.auxiliaries = config.auxiliaries?.map((item) => ({ ...item, zoneIds: item.zoneIds.filter((id) => zoneIds.has(id)), circuitIds: item.circuitIds.filter((id) => circuitIds.has(id)) })).filter((item) => item.zoneIds.length + item.circuitIds.length > 0);
  const endpointIds = new Set(config.endpoints.map((item) => item.id));
  const generatorIds = new Set(config.generators.map((item) => item.id));
  config.equipmentGroups = config.equipmentGroups?.map((item) => ({ ...item, memberEndpointIds: item.memberEndpointIds.filter((id) => endpointIds.has(id)), generatorIds: item.generatorIds.filter((id) => generatorIds.has(id)) })).filter((item) => item.memberEndpointIds.length >= 2);
  const auxiliaryIds = new Set(config.auxiliaries?.map((item) => item.id) ?? []);
  for (const circuit of config.circuits) if (circuit.coolingConstraint) circuit.coolingConstraint.auxiliaryIds = circuit.coolingConstraint.auxiliaryIds.filter((id) => auxiliaryIds.has(id));
  return config;
}
