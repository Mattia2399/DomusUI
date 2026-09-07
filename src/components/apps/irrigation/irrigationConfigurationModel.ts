export type IrrigationConfigurationZone = {
  id: string;
  name: string;
  entityId: string;
  soilMoistureEntityId?: string;
  [key: string]: unknown;
};

export const IRRIGATION_MINIMUM_MAX_DURATION_MIN = 5;
export const IRRIGATION_ABSOLUTE_MAX_DURATION_MIN = 60;

export type IrrigationConfigurationModel = {
  rainSensorEnabled: boolean;
  blockOnRainSensorUnavailable: boolean;
  maximumManualDurationMin: number;
  rainSensorEntityId: string;
  weatherEntityId: string;
  humidityEntityId: string;
  outdoorTempEntityId: string;
  soilMoistureEntityId: string;
  waterUsageEntityId: string;
  waterAverageEntityId: string;
  zones: IrrigationConfigurationZone[];
};

export type IrrigationEntityState = {
  state?: unknown;
  stateLabel?: unknown;
  last_changed?: unknown;
  last_updated?: unknown;
  rawAttributes?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  [key: string]: unknown;
};

export type IrrigationConfigurationField = Exclude<keyof IrrigationConfigurationModel, 'zones' | 'rainSensorEnabled' | 'blockOnRainSensorUnavailable' | 'maximumManualDurationMin'>;

export type IrrigationConfigurationIssue = {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  field?: IrrigationConfigurationField;
  zoneId?: string;
};

const UNAVAILABLE_STATES = new Set(['', 'unknown', 'unavailable']);

const FIELD_KEYWORDS: Record<IrrigationConfigurationField, readonly string[]> = {
  rainSensorEntityId: ['rain', 'pioggia', 'precipitation', 'wet', 'acqua'],
  weatherEntityId: ['home', 'casa', 'weather', 'meteo', 'forecast'],
  humidityEntityId: ['outdoor', 'esterna', 'humidity', 'umidita', 'giardino'],
  outdoorTempEntityId: ['outdoor', 'esterna', 'temperature', 'temperatura', 'giardino'],
  soilMoistureEntityId: ['soil', 'terreno', 'moisture', 'umidita', 'garden', 'giardino'],
  waterUsageEntityId: ['irrigation', 'irrigazione', 'water', 'acqua', 'usage', 'consumo'],
  waterAverageEntityId: ['irrigation', 'irrigazione', 'water', 'acqua', 'average', 'media'],
};

function entityAttributes(entity: IrrigationEntityState | null | undefined) {
  return entity?.rawAttributes ?? entity?.attributes ?? {};
}

export function formatIrrigationEntityStateLabel(value: unknown, locale = 'it') {
  const source = `${value ?? ''}`.trim();
  if (!source) return 'N/D';
  const normalized = source.replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)) return source;
  const numericValue = Number(normalized);
  if (!Number.isFinite(numericValue)) return source;
  return numericValue.toLocaleString(locale, {
    maximumFractionDigits: 2,
    useGrouping: true,
  });
}

export function getIrrigationEntityMetadata(
  entityId: string,
  states: Record<string, IrrigationEntityState>,
) {
  const normalizedId = entityId.trim();
  const entity = states[normalizedId];
  const attributes = entityAttributes(entity);
  const friendlyName = typeof attributes.friendly_name === 'string' && attributes.friendly_name.trim()
    ? attributes.friendly_name.trim()
    : normalizedId.split('.').pop()?.replace(/_/g, ' ') || normalizedId;
  const state = `${entity?.state ?? ''}`.trim();
  const rawStateLabel = entity?.stateLabel ?? state;
  const unit = typeof attributes.unit_of_measurement === 'string' ? attributes.unit_of_measurement.trim() : '';
  const deviceClass = typeof attributes.device_class === 'string' ? attributes.device_class.trim().toLowerCase() : '';

  return {
    entityId: normalizedId,
    friendlyName,
    state,
    stateLabel: formatIrrigationEntityStateLabel(
      /^[-+]?(?:\d+(?:[.,]\d+)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(state)
        ? state
        : rawStateLabel,
    ),
    unit,
    deviceClass,
    exists: Boolean(entity),
    available: Boolean(entity) && !UNAVAILABLE_STATES.has(state.toLowerCase()),
  };
}

function scoreKeywordMatch(source: string, keywords: readonly string[]) {
  return keywords.reduce((score, keyword, index) => (
    source.includes(keyword) ? score + Math.max(8, 28 - index * 3) : score
  ), 0);
}

function scoreGlobalEntity(
  field: IrrigationConfigurationField,
  entityId: string,
  states: Record<string, IrrigationEntityState>,
) {
  const metadata = getIrrigationEntityMetadata(entityId, states);
  const searchable = `${entityId} ${metadata.friendlyName} ${metadata.deviceClass}`.toLowerCase();
  let score = scoreKeywordMatch(searchable, FIELD_KEYWORDS[field]);

  if (metadata.available) score += 16;
  if (field === 'rainSensorEntityId' && entityId.startsWith('binary_sensor.')) score += 35;
  if (field === 'weatherEntityId' && entityId.startsWith('weather.')) score += 60;
  if (field === 'humidityEntityId' && metadata.deviceClass === 'humidity') score += 55;
  if (field === 'outdoorTempEntityId' && metadata.deviceClass === 'temperature') score += 55;
  if (field === 'soilMoistureEntityId' && ['moisture', 'humidity'].includes(metadata.deviceClass)) score += 42;
  if (
    (field === 'waterUsageEntityId' || field === 'waterAverageEntityId') &&
    ['water', 'volume', 'water_consumption'].includes(metadata.deviceClass)
  ) score += 48;
  if (field === 'waterAverageEntityId' && /(average|media|mean)/.test(searchable)) score += 35;
  if (field === 'waterUsageEntityId' && /(total|usage|consumo|consumption)/.test(searchable)) score += 28;
  return score;
}

function scoreZoneEntity(entityId: string, states: Record<string, IrrigationEntityState>) {
  const metadata = getIrrigationEntityMetadata(entityId, states);
  const searchable = `${entityId} ${metadata.friendlyName} ${metadata.deviceClass}`.toLowerCase();
  let score = metadata.available ? 16 : 0;
  if (entityId.startsWith('valve.')) score += 70;
  if (entityId.startsWith('switch.')) score += 38;
  if (entityId.startsWith('input_boolean.')) score += 18;
  score += scoreKeywordMatch(searchable, ['irrigation', 'irrigazione', 'valve', 'valvola', 'zone', 'zona', 'sprinkler', 'garden', 'giardino', 'pump', 'pompa']);
  return score;
}

export function rankIrrigationEntityOptions(
  field: IrrigationConfigurationField | 'zoneEntityId',
  options: readonly string[],
  states: Record<string, IrrigationEntityState>,
) {
  return Array.from(new Set(options.map((entityId) => entityId.trim()).filter(Boolean)))
    .map((entityId) => ({
      entityId,
      score: field === 'zoneEntityId'
        ? scoreZoneEntity(entityId, states)
        : scoreGlobalEntity(field, entityId, states),
    }))
    .sort((first, second) => second.score - first.score || first.entityId.localeCompare(second.entityId))
    .map(({ entityId }) => entityId);
}

function bestIrrigationEntitySuggestion(
  field: IrrigationConfigurationField | 'zoneEntityId',
  options: readonly string[],
  states: Record<string, IrrigationEntityState>,
) {
  const ranked = Array.from(new Set(options.map((entityId) => entityId.trim()).filter(Boolean)))
    .map((entityId) => ({
      entityId,
      score: field === 'zoneEntityId'
        ? scoreZoneEntity(entityId, states)
        : scoreGlobalEntity(field, entityId, states),
    }))
    .sort((first, second) => second.score - first.score || first.entityId.localeCompare(second.entityId));
  const minimumScore = field === 'weatherEntityId' ? 50 : field === 'zoneEntityId' ? 58 : 42;
  return ranked[0] && ranked[0].score >= minimumScore ? ranked[0].entityId : '';
}

export function applyIrrigationEntitySuggestions(
  config: IrrigationConfigurationModel,
  optionGroups: {
    binarySensorOptions: readonly string[];
    weatherOptions: readonly string[];
    sensorOptions: readonly string[];
    zoneEntityOptions: readonly string[];
  },
  states: Record<string, IrrigationEntityState>,
): IrrigationConfigurationModel {
  const availableIds = new Set([
    ...optionGroups.binarySensorOptions,
    ...optionGroups.weatherOptions,
    ...optionGroups.sensorOptions,
    ...optionGroups.zoneEntityOptions,
  ]);
  const optionSource: Record<IrrigationConfigurationField, readonly string[]> = {
    rainSensorEntityId: optionGroups.binarySensorOptions,
    weatherEntityId: optionGroups.weatherOptions,
    humidityEntityId: optionGroups.sensorOptions,
    outdoorTempEntityId: optionGroups.sensorOptions,
    soilMoistureEntityId: optionGroups.sensorOptions,
    waterUsageEntityId: optionGroups.sensorOptions,
    waterAverageEntityId: optionGroups.sensorOptions,
  };
  const next = { ...config, zones: config.zones.map((zone) => ({ ...zone })) };

  (Object.keys(optionSource) as IrrigationConfigurationField[]).forEach((field) => {
    if (next[field] && availableIds.has(next[field])) return;
    next[field] = bestIrrigationEntitySuggestion(field, optionSource[field], states);
  });

  const rankedZones = rankIrrigationEntityOptions('zoneEntityId', optionGroups.zoneEntityOptions, states)
    .filter((entityId) => bestIrrigationEntitySuggestion('zoneEntityId', [entityId], states) === entityId);
  const usedZoneEntities = new Set(next.zones.map((zone) => zone.entityId).filter((entityId) => availableIds.has(entityId)));
  let candidateIndex = 0;
  next.zones = next.zones.map((zone) => {
    if (zone.entityId && availableIds.has(zone.entityId)) return zone;
    while (rankedZones[candidateIndex] && usedZoneEntities.has(rankedZones[candidateIndex])) candidateIndex += 1;
    const entityId = rankedZones[candidateIndex] ?? '';
    if (entityId) usedZoneEntities.add(entityId);
    candidateIndex += 1;
    return { ...zone, entityId };
  });

  return next;
}

export function validateIrrigationConfiguration(
  config: IrrigationConfigurationModel,
  states: Record<string, IrrigationEntityState>,
): IrrigationConfigurationIssue[] {
  const issues: IrrigationConfigurationIssue[] = [];
  if (
    !Number.isFinite(config.maximumManualDurationMin) ||
    config.maximumManualDurationMin < IRRIGATION_MINIMUM_MAX_DURATION_MIN ||
    config.maximumManualDurationMin > IRRIGATION_ABSOLUTE_MAX_DURATION_MIN
  ) {
    issues.push({ severity: 'error', code: 'invalid_max_duration', message: 'La durata massima deve essere compresa tra 5 e 60 minuti.' });
  }
  if (config.rainSensorEnabled && !config.rainSensorEntityId.trim()) {
    issues.push({ severity: 'error', code: 'missing_rain_sensor', field: 'rainSensorEntityId', message: 'La protezione pioggia richiede un sensore associato.' });
  }

  const expectedDomains: Record<IrrigationConfigurationField, string> = {
    rainSensorEntityId: 'binary_sensor',
    weatherEntityId: 'weather',
    humidityEntityId: 'sensor',
    outdoorTempEntityId: 'sensor',
    soilMoistureEntityId: 'sensor',
    waterUsageEntityId: 'sensor',
    waterAverageEntityId: 'sensor',
  };
  (Object.keys(expectedDomains) as IrrigationConfigurationField[]).forEach((field) => {
    const entityId = config[field].trim();
    if (entityId && !entityId.startsWith(`${expectedDomains[field]}.`)) {
      issues.push({
        severity: 'error',
        code: 'invalid_global_domain',
        field,
        message: `${entityId} non è compatibile con questo campo. È richiesta un’entità ${expectedDomains[field]}.*.`,
      });
    }
  });

  const configuredZoneEntities = new Set<string>();
  config.zones.forEach((zone, index) => {
    const entityId = zone.entityId.trim();
    if (!entityId) {
      issues.push({ severity: 'error', code: 'missing_zone_entity', zoneId: zone.id, message: `${zone.name || `Zona ${index + 1}`}: associa una valvola o uno switch.` });
      return;
    }
    if (!/^(valve|switch|input_boolean)\./.test(entityId)) {
      issues.push({ severity: 'error', code: 'invalid_zone_domain', zoneId: zone.id, message: `${zone.name || `Zona ${index + 1}`}: il dominio ${entityId.split('.')[0] || 'sconosciuto'} non può controllare una zona.` });
    }
    if (configuredZoneEntities.has(entityId)) {
      issues.push({ severity: 'error', code: 'duplicate_zone_entity', zoneId: zone.id, message: `${entityId} è associata a più zone.` });
    }
    configuredZoneEntities.add(entityId);
  });

  const selectedEntities = [
    config.rainSensorEntityId,
    config.weatherEntityId,
    config.humidityEntityId,
    config.outdoorTempEntityId,
    config.soilMoistureEntityId,
    config.waterUsageEntityId,
    config.waterAverageEntityId,
    ...config.zones.flatMap((zone) => [zone.entityId, zone.soilMoistureEntityId ?? '']),
  ].map((entityId) => entityId.trim()).filter(Boolean);

  Array.from(new Set(selectedEntities)).forEach((entityId) => {
    const metadata = getIrrigationEntityMetadata(entityId, states);
    if (!metadata.exists) {
      issues.push({ severity: 'warning', code: 'entity_missing', message: `${entityId} non è presente negli stati ricevuti da Home Assistant.` });
    } else if (!metadata.available) {
      issues.push({ severity: 'warning', code: 'entity_unavailable', message: `${metadata.friendlyName} è attualmente non disponibile.` });
    }
  });

  return issues;
}
