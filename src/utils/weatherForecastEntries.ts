import type { MockWeatherForecastEntry } from '../types/ha';

/*
 * What Home Assistant answers about a forecast, read into plain entries. Apart from the
 * dashboard state so that the panel of the weather can read it without bringing that along.
 */

export function toNumberOrUndefined(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function readFirstForecastNumber(
  source: Record<string, unknown>,
  keys: string[],
) {
  for (const key of keys) {
    const numeric = toNumberOrUndefined(source[key]);
    if (numeric !== undefined) {
      return numeric;
    }
  }
  return undefined;
}

function readFirstForecastString(
  source: Record<string, unknown>,
  keys: string[],
) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function readFirstForecastBoolean(
  source: Record<string, unknown>,
  keys: string[],
) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') {
        return true;
      }
      if (normalized === 'false') {
        return false;
      }
    }
  }
  return undefined;
}

function readFirstForecastWindBearing(
  source: Record<string, unknown>,
  keys: string[],
) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : value.trim();
    }
  }
  return undefined;
}

export function parseForecastEntries(value: unknown): MockWeatherForecastEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const entries: MockWeatherForecastEntry[] = [];
  value.forEach((item) => {
    if (!item || typeof item !== 'object') {
      return;
    }
    const raw = item as Record<string, unknown>;
    entries.push({
      datetime: readFirstForecastString(raw, ['datetime', 'date', 'time']),
      isDaytime: readFirstForecastBoolean(raw, ['is_daytime', 'isDaytime']),
      condition: readFirstForecastString(raw, ['condition', 'weather', 'state']),
      apparentTemperature: readFirstForecastNumber(raw, [
        'apparent_temperature',
        'native_apparent_temperature',
        'feels_like',
        'apparentTemperature',
      ]),
      cloudCoverage: readFirstForecastNumber(raw, ['cloud_coverage', 'cloudCoverage']),
      dewPoint: readFirstForecastNumber(raw, ['dew_point', 'native_dew_point', 'dewPoint']),
      humidity: readFirstForecastNumber(raw, ['humidity']),
      pressure: readFirstForecastNumber(raw, ['pressure']),
      temperature: readFirstForecastNumber(raw, [
        'temperature',
        'native_temperature',
        'temp',
        'max_temp',
        'temperatureMax',
        'high',
      ]),
      templow: readFirstForecastNumber(raw, [
        'templow',
        'temperature_low',
        'native_templow',
        'native_temperature_low',
        'temp_low',
        'min_temp',
        'temperatureMin',
        'low',
      ]),
      uvIndex: readFirstForecastNumber(raw, ['uv_index', 'uvIndex']),
      windBearing: readFirstForecastWindBearing(raw, ['wind_bearing', 'windBearing']),
      windGustSpeed: readFirstForecastNumber(raw, ['wind_gust_speed', 'windGustSpeed']),
      precipitation: readFirstForecastNumber(raw, [
        'precipitation',
        'precipitation_amount',
        'rain',
        'rainfall',
      ]),
      precipitationProbability: readFirstForecastNumber(raw, [
        'precipitation_probability',
        'precipitationProbability',
        'probability_of_precipitation',
        'rain_probability',
        'pop',
      ]),
      windSpeed: readFirstForecastNumber(raw, [
        'wind_speed',
        'native_wind_speed',
        'windspeed',
        'windSpeed',
      ]),
    });
  });
  return entries;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function extractForecastPayloadFromWeatherApiResponse(
  response: unknown,
  entityId: string,
): unknown {
  if (!isRecord(response)) {
    return undefined;
  }

  const directEntity = response[entityId];
  if (isRecord(directEntity) && Object.prototype.hasOwnProperty.call(directEntity, 'forecast')) {
    return directEntity.forecast;
  }

  if (Object.prototype.hasOwnProperty.call(response, 'forecast')) {
    return response.forecast;
  }

  const nestedKeys = ['service_response', 'response', 'result'] as const;
  for (const key of nestedKeys) {
    const nested = response[key];
    const extracted = extractForecastPayloadFromWeatherApiResponse(nested, entityId);
    if (extracted !== undefined) {
      return extracted;
    }
  }

  return undefined;
}
