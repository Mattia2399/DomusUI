import type { AuthData, HassEntities } from 'home-assistant-js-websocket';
import type { MockEntityStateMap, MockWeatherForecastEntry } from '../types/ha';
import { translateMediaPlayerState } from '../utils/mediaPlayerState';
import { sanitizeDynamicUrl } from '../security/safeUrl';

import { HASS_TOKENS_KEY, saveHaLiveConfig } from './haLiveConfig';

// The saved connection lives on its own (haLiveConfig) so startup reads it
// without this module; it is re-exported here for every other caller.
export {
  HASS_TOKENS_KEY,
  clearHaLiveConfigStorage,
  defaultHaLiveConfig,
  loadHaLiveConfig,
  saveHaLiveConfig,
  type HaLiveConfig,
} from './haLiveConfig';

export type HaOAuthAuthorizeParams = {
  hassUrl: string;
  clientId: string;
  redirectUri: string;
  state: string;
};

export type HaOAuthTokenResponse = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
};

function isAuthData(value: unknown): value is AuthData {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const source = value as Record<string, unknown>;
  return (
    typeof source.hassUrl === 'string' &&
    (typeof source.clientId === 'string' || source.clientId === null) &&
    typeof source.expires === 'number' &&
    typeof source.refresh_token === 'string' &&
    typeof source.access_token === 'string' &&
    typeof source.expires_in === 'number'
  );
}

export function saveHassAuthTokensToStorage(tokens: AuthData | null) {
  if (typeof window === 'undefined') {
    return;
  }
  if (!tokens) {
    window.localStorage.removeItem(HASS_TOKENS_KEY);
    return;
  }
  window.localStorage.setItem(HASS_TOKENS_KEY, JSON.stringify(tokens));
}

export async function loadHassAuthTokensFromStorage() {
  if (typeof window === 'undefined') {
    return undefined;
  }
  const raw = window.localStorage.getItem(HASS_TOKENS_KEY);
  if (!raw) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isAuthData(parsed)) {
      window.localStorage.removeItem(HASS_TOKENS_KEY);
      return undefined;
    }
    return parsed;
  } catch {
    window.localStorage.removeItem(HASS_TOKENS_KEY);
    return undefined;
  }
}

export function clearHassAuthTokensStorage() {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(HASS_TOKENS_KEY);
}

export function persistOAuthTokensAsAuthData(params: {
  hassUrl: string;
  clientId: string;
  tokens: HaOAuthTokenResponse;
}) {
  const data: AuthData = {
    hassUrl: normalizeHassUrl(params.hassUrl),
    clientId: params.clientId,
    access_token: params.tokens.accessToken,
    refresh_token: params.tokens.refreshToken,
    expires_in: params.tokens.expiresIn,
    expires: Date.now() + params.tokens.expiresIn * 1000,
  };
  saveHassAuthTokensToStorage(data);
  return data;
}

export function persistHaOAuthSession(params: {
  hassUrl: string;
  clientId: string;
  tokens: HaOAuthTokenResponse;
}) {
  const authData = persistOAuthTokensAsAuthData(params);
  // OAuth uses HA's refreshable auth store. Keeping its short-lived access
  // token in the manual-token configuration would disable refresh handling
  // and could persist the token when "remember token" was previously enabled.
  saveHaLiveConfig({
    url: authData.hassUrl,
    token: '',
    rememberToken: false,
  });
  return authData;
}

export type HassUrlValidation =
  | { ok: true; url: string; warning?: string }
  | { ok: false; error: string };

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split('.').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

export function isLocalHassHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  return (
    normalized === 'localhost' ||
    normalized === '::1' ||
    normalized.endsWith('.local') ||
    (!normalized.includes('.') && !normalized.includes(':')) ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:') ||
    isPrivateIpv4(normalized)
  );
}

export function validateHassUrl(rawUrl: string): HassUrlValidation {
  const candidate = rawUrl.trim();
  if (!candidate) {
    return { ok: false, error: 'URL Home Assistant obbligatorio.' };
  }
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, error: 'Usa un URL Home Assistant completo con http:// o https://.' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'Sono ammessi soltanto URL http o https.' };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: 'L’URL non può contenere credenziali.' };
  }
  if (parsed.search || parsed.hash) {
    return { ok: false, error: 'L’URL non può contenere query o fragment.' };
  }
  if (parsed.protocol === 'http:' && !isLocalHassHostname(parsed.hostname)) {
    return { ok: false, error: 'Per host pubblici è obbligatorio HTTPS.' };
  }
  const normalized = parsed.toString().replace(/\/+$/, '');
  return {
    ok: true,
    url: normalized,
    ...(parsed.protocol === 'http:'
      ? { warning: 'Connessione HTTP locale: il traffico non è cifrato.' }
      : null),
  };
}

export function normalizeHassUrl(url: string) {
  const validation = validateHassUrl(url);
  return validation.ok ? validation.url : '';
}

export function buildHaOAuthAuthorizeUrl({
  hassUrl,
  clientId,
  redirectUri,
  state,
}: HaOAuthAuthorizeParams) {
  const normalizedUrl = normalizeHassUrl(hassUrl);
  if (!normalizedUrl) {
    throw new Error('URL Home Assistant non valido.');
  }
  if (!clientId.trim()) {
    throw new Error('Client ID OAuth non valido.');
  }
  if (!redirectUri.trim()) {
    throw new Error('Redirect URI OAuth non valido.');
  }

  const url = new URL(`${normalizedUrl}/auth/authorize`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId.trim());
  url.searchParams.set('redirect_uri', redirectUri.trim());
  url.searchParams.set('state', state);
  return url.toString();
}

function normalizeOAuthTokenPayload(payload: unknown): HaOAuthTokenResponse {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Risposta OAuth Home Assistant non valida.');
  }

  const source = payload as Record<string, unknown>;
  const accessToken = typeof source.access_token === 'string' ? source.access_token.trim() : '';
  const refreshToken = typeof source.refresh_token === 'string' ? source.refresh_token.trim() : '';
  const expiresIn =
    typeof source.expires_in === 'number'
      ? source.expires_in
      : typeof source.expires_in === 'string'
        ? Number.parseInt(source.expires_in, 10)
        : NaN;
  const tokenType = typeof source.token_type === 'string' ? source.token_type : 'Bearer';

  if (!accessToken) {
    throw new Error('OAuth Home Assistant non ha restituito access token.');
  }
  if (!refreshToken) {
    throw new Error('OAuth Home Assistant non ha restituito refresh token.');
  }
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error('OAuth Home Assistant ha restituito expires_in non valido.');
  }

  return {
    accessToken,
    refreshToken,
    expiresIn: Math.round(expiresIn),
    tokenType,
  };
}

function parseOAuthErrorPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const source = payload as Record<string, unknown>;
  const description =
    typeof source.error_description === 'string' && source.error_description.trim().length > 0
      ? source.error_description
      : typeof source.error === 'string' && source.error.trim().length > 0
        ? source.error
        : null;
  return description;
}

export async function exchangeHaOAuthCode(params: {
  hassUrl: string;
  clientId: string;
  code: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}) {
  const normalizedUrl = normalizeHassUrl(params.hassUrl);
  if (!normalizedUrl) {
    throw new Error('URL Home Assistant non valido.');
  }
  const clientId = params.clientId.trim();
  const code = params.code.trim();
  if (!clientId) {
    throw new Error('Client ID OAuth mancante.');
  }
  if (!code) {
    throw new Error('Authorization code OAuth mancante.');
  }

  const tokenEndpoint = `${normalizedUrl}/auth/token`;
  const timeoutMs = Math.max(5000, params.timeoutMs ?? 15000);
  const requestAbortController = new AbortController();
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;

  const handleExternalAbort = () => {
    requestAbortController.abort();
  };
  if (params.signal) {
    if (params.signal.aborted) {
      requestAbortController.abort();
    } else {
      params.signal.addEventListener('abort', handleExternalAbort, { once: true });
    }
  }

  timeoutId = globalThis.setTimeout(() => {
    requestAbortController.abort();
  }, timeoutMs);

  let response: Response;
  try {
    response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
      }).toString(),
      signal: requestAbortController.signal,
    });
  } catch (error) {
    if (params.signal?.aborted) {
      throw new Error('Richiesta OAuth annullata.');
    }
    if (requestAbortController.signal.aborted) {
      throw new Error(
        `Timeout durante richiesta OAuth verso ${tokenEndpoint}. Verifica URL, porta, DNS e accesso esterno da browser.`,
      );
    }
    throw new Error(
      `Impossibile raggiungere ${tokenEndpoint}. Verifica connettivita, certificato HTTPS e reverse proxy.`,
    );
  } finally {
    if (timeoutId !== null) {
      globalThis.clearTimeout(timeoutId);
    }
    if (params.signal) {
      params.signal.removeEventListener('abort', handleExternalAbort);
    }
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const description = parseOAuthErrorPayload(payload);
    if (description && /invalid code/i.test(description)) {
      throw new Error(
        'Authorization code non valido o gia usato. Riavvia "Accedi con OAuth" e completa di nuovo il login.',
      );
    }
    throw new Error(description ?? `OAuth Home Assistant fallito (HTTP ${response.status}).`);
  }

  return normalizeOAuthTokenPayload(payload);
}

function toStringOrUndefined(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function toNumberOrUndefined(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().replace(',', '.');
    const isStrictNumeric = /^[-+]?\d+(?:\.\d+)?$/.test(normalized);
    if (!isStrictNumeric) {
      return undefined;
    }

    const parsed = Number.parseFloat(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function toPercentFromBrightness(value: unknown) {
  const brightness = toNumberOrUndefined(value);
  if (brightness === undefined) {
    return undefined;
  }

  // Home Assistant brightness is usually 0..255.
  if (brightness > 1 && brightness <= 255) {
    return Math.max(0, Math.min(100, Math.round((brightness / 255) * 100)));
  }

  return Math.max(0, Math.min(100, Math.round(brightness)));
}

function resolveEntityPicture(hassUrl: string, picture: string | undefined) {
  if (!picture) {
    return undefined;
  }

  const normalizedHassUrl = normalizeHassUrl(hassUrl);
  if (!normalizedHassUrl) return undefined;
  return sanitizeDynamicUrl(picture, 'image', {
    baseUrl: `${normalizedHassUrl}/`,
    allowedOrigins: [normalizedHassUrl],
  });
}

function toForecastEntries(value: unknown): MockWeatherForecastEntry[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const entries: MockWeatherForecastEntry[] = [];
  value.forEach((item) => {
    if (!item || typeof item !== 'object') {
      return;
    }

    const raw = item as Record<string, unknown>;
    const readString = (keys: string[]) => {
      for (const key of keys) {
        const candidate = raw[key];
        if (typeof candidate === 'string' && candidate.trim().length > 0) {
          return candidate;
        }
      }
      return undefined;
    };
    const readNumber = (keys: string[]) => {
      for (const key of keys) {
        const numeric = toNumberOrUndefined(raw[key]);
        if (numeric !== undefined) {
          return numeric;
        }
      }
      return undefined;
    };
    const readBoolean = (keys: string[]) => {
      for (const key of keys) {
        const candidate = raw[key];
        if (typeof candidate === 'boolean') {
          return candidate;
        }
        if (typeof candidate === 'string') {
          const normalized = candidate.trim().toLowerCase();
          if (normalized === 'true') {
            return true;
          }
          if (normalized === 'false') {
            return false;
          }
        }
      }
      return undefined;
    };
    const readWindBearing = (keys: string[]) => {
      for (const key of keys) {
        const candidate = raw[key];
        if (typeof candidate === 'number' && Number.isFinite(candidate)) {
          return candidate;
        }
        if (typeof candidate === 'string' && candidate.trim().length > 0) {
          const parsed = Number.parseFloat(candidate);
          return Number.isFinite(parsed) ? parsed : candidate.trim();
        }
      }
      return undefined;
    };
    entries.push({
      datetime: readString(['datetime', 'date', 'time']),
      isDaytime: readBoolean(['is_daytime', 'isDaytime']),
      condition: readString(['condition', 'weather', 'state']),
      apparentTemperature: readNumber([
        'apparent_temperature',
        'native_apparent_temperature',
        'feels_like',
        'apparentTemperature',
      ]),
      cloudCoverage: readNumber(['cloud_coverage', 'cloudCoverage']),
      dewPoint: readNumber(['dew_point', 'native_dew_point', 'dewPoint']),
      humidity: readNumber(['humidity']),
      pressure: readNumber(['pressure']),
      temperature: readNumber([
        'temperature',
        'native_temperature',
        'temp',
        'max_temp',
        'temperatureMax',
        'high',
      ]),
      templow: readNumber([
        'templow',
        'temperature_low',
        'native_templow',
        'native_temperature_low',
        'temp_low',
        'min_temp',
        'temperatureMin',
        'low',
      ]),
      uvIndex: readNumber(['uv_index', 'uvIndex']),
      windBearing: readWindBearing(['wind_bearing', 'windBearing']),
      windGustSpeed: readNumber(['wind_gust_speed', 'windGustSpeed']),
      precipitation: readNumber([
        'precipitation',
        'precipitation_amount',
        'rain',
        'rainfall',
      ]),
      precipitationProbability: readNumber([
        'precipitation_probability',
        'precipitationProbability',
        'probability_of_precipitation',
        'rain_probability',
        'pop',
      ]),
      windSpeed: readNumber([
        'wind_speed',
        'native_wind_speed',
        'windspeed',
        'windSpeed',
      ]),
    });
  });

  return entries.length > 0 ? entries : undefined;
}

function toStringArrayOrUndefined(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const entries = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);

  return entries.length > 0 ? entries : undefined;
}

function toPercentFromUnitRange(value: unknown) {
  const numericValue = toNumberOrUndefined(value);
  if (numericValue === undefined) {
    return undefined;
  }

  if (numericValue >= 0 && numericValue <= 1) {
    return Math.max(0, Math.min(100, Math.round(numericValue * 100)));
  }

  return Math.max(0, Math.min(100, Math.round(numericValue)));
}

function toNumberTuple2(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length < 2) {
    return undefined;
  }
  const first = toNumberOrUndefined(value[0]);
  const second = toNumberOrUndefined(value[1]);
  if (first === undefined || second === undefined) {
    return undefined;
  }
  return [first, second];
}

function toNumberTuple3(value: unknown): [number, number, number] | undefined {
  if (!Array.isArray(value) || value.length < 3) {
    return undefined;
  }
  const first = toNumberOrUndefined(value[0]);
  const second = toNumberOrUndefined(value[1]);
  const third = toNumberOrUndefined(value[2]);
  if (first === undefined || second === undefined || third === undefined) {
    return undefined;
  }
  return [first, second, third];
}

function toNumberTuple4(value: unknown): [number, number, number, number] | undefined {
  if (!Array.isArray(value) || value.length < 4) {
    return undefined;
  }
  const first = toNumberOrUndefined(value[0]);
  const second = toNumberOrUndefined(value[1]);
  const third = toNumberOrUndefined(value[2]);
  const fourth = toNumberOrUndefined(value[3]);
  if (first === undefined || second === undefined || third === undefined || fourth === undefined) {
    return undefined;
  }
  return [first, second, third, fourth];
}

function toNumberTuple5(value: unknown): [number, number, number, number, number] | undefined {
  if (!Array.isArray(value) || value.length < 5) {
    return undefined;
  }
  const first = toNumberOrUndefined(value[0]);
  const second = toNumberOrUndefined(value[1]);
  const third = toNumberOrUndefined(value[2]);
  const fourth = toNumberOrUndefined(value[3]);
  const fifth = toNumberOrUndefined(value[4]);
  if (
    first === undefined ||
    second === undefined ||
    third === undefined ||
    fourth === undefined ||
    fifth === undefined
  ) {
    return undefined;
  }
  return [first, second, third, fourth, fifth];
}

function toTimestampMsOrUndefined(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value > 1e12 ? value : value * 1000);
  }
  if (typeof value === 'string') {
    const parsedDate = Date.parse(value);
    if (Number.isFinite(parsedDate)) {
      return parsedDate;
    }
    const numeric = Number.parseFloat(value);
    if (Number.isFinite(numeric)) {
      return Math.round(numeric > 1e12 ? numeric : numeric * 1000);
    }
  }
  return undefined;
}

export function mapHassEntitiesToMock(
  entities: HassEntities,
  hassUrl: string,
  previousStates?: MockEntityStateMap,
): MockEntityStateMap {
  const nextStates: MockEntityStateMap = {};

  Object.entries(entities).forEach(([entityId, entity]) => {
    const domain = entityId.split('.')[0];
    const attributes = entity.attributes as Record<string, unknown>;
    const entityMeta = entity as {
      last_changed?: string;
      last_updated?: string;
    };
    const rawAttributes = {
      ...attributes,
      __entity_id: entityId,
      __last_changed: entityMeta.last_changed,
      __last_updated: entityMeta.last_updated,
    } as Record<string, unknown>;
    const friendlyName = toStringOrUndefined(rawAttributes.friendly_name);
    const mediaTitle = toStringOrUndefined(attributes.media_title);
    const mediaArtist = toStringOrUndefined(attributes.media_artist);
    const mediaAlbumArtist = toStringOrUndefined(attributes.media_album_artist);
    const mediaAlbumName = toStringOrUndefined(attributes.media_album_name);
    const mediaChannel = toStringOrUndefined(attributes.media_channel);
    const mediaContentId = toStringOrUndefined(attributes.media_content_id);
    const mediaContentType = toStringOrUndefined(attributes.media_content_type);
    const mediaEpisode = toStringOrUndefined(attributes.media_episode);
    const mediaImageHash = toStringOrUndefined(attributes.media_image_hash);
    const mediaImageRemotelyAccessible =
      typeof attributes.media_image_remotely_accessible === 'boolean'
        ? attributes.media_image_remotely_accessible
        : undefined;
    const mediaImageUrl = resolveEntityPicture(hassUrl, toStringOrUndefined(attributes.media_image_url));
    const mediaImageLocalUrl = resolveEntityPicture(hassUrl, toStringOrUndefined(attributes.entity_picture_local));
    const mediaPlaylist = toStringOrUndefined(attributes.media_playlist);
    const mediaSeason = toStringOrUndefined(attributes.media_season);
    const mediaSeriesTitle = toStringOrUndefined(attributes.media_series_title);
    const mediaTrack = toNumberOrUndefined(attributes.media_track);
    const appId = toStringOrUndefined(attributes.app_id);
    const appName = toStringOrUndefined(attributes.app_name);
    const source = toStringOrUndefined(attributes.source);
    const sourceList = toStringArrayOrUndefined(attributes.source_list);
    const soundMode = toStringOrUndefined(attributes.sound_mode);
    const soundModeList = toStringArrayOrUndefined(attributes.sound_mode_list);
    const groupMembers = toStringArrayOrUndefined(attributes.group_members);
    const mediaDeviceClass = toStringOrUndefined(attributes.device_class);
    const unitOfMeasurement = toStringOrUndefined(attributes.unit_of_measurement);
    const weatherTemperatureUnit =
      toStringOrUndefined(attributes.temperature_unit) ??
      toStringOrUndefined(attributes.native_temperature_unit);
    const picture = toStringOrUndefined(attributes.entity_picture);
    const numericValue = toNumberOrUndefined(entity.state);

    const weatherTemperature =
      toNumberOrUndefined(attributes.current_temperature) ??
      toNumberOrUndefined(attributes.native_current_temperature) ??
      toNumberOrUndefined(attributes.temperature) ??
      toNumberOrUndefined(attributes.native_temperature);
    const weatherPrecipitation =
      toNumberOrUndefined(attributes.precipitation_probability) ??
      toNumberOrUndefined(attributes.precipitation) ??
      toNumberOrUndefined(attributes.rain_probability);
    const weatherWindSpeed =
      toNumberOrUndefined(attributes.wind_speed) ??
      toNumberOrUndefined(attributes.native_wind_speed);
    const weatherHumidity =
      toNumberOrUndefined(attributes.humidity) ??
      toNumberOrUndefined(attributes.relative_humidity);
    const weatherForecast =
      toForecastEntries(attributes.forecast) ??
      toForecastEntries(attributes.daily_forecast) ??
      toForecastEntries(attributes.hourly_forecast) ??
      toForecastEntries(attributes.forecast_daily) ??
      toForecastEntries(attributes.forecast_hourly);
    const currentTemperature =
      domain === 'weather'
        ? weatherTemperature
        : toNumberOrUndefined(attributes.current_temperature);
    const targetTemperature =
      domain === 'climate'
        ? toNumberOrUndefined(attributes.temperature) ??
          toNumberOrUndefined(attributes.target_temperature) ??
          toNumberOrUndefined(attributes.target_temp) ??
          toNumberOrUndefined(attributes.setpoint)
        : undefined;
    const unit = unitOfMeasurement ?? (domain === 'weather' ? weatherTemperatureUnit : undefined);
    const brightness = toPercentFromBrightness(attributes.brightness);
    const mediaPosition = toNumberOrUndefined(attributes.media_position);
    const mediaDuration = toNumberOrUndefined(attributes.media_duration);
    const previousMediaState = previousStates?.[entityId];
    const explicitMediaPositionUpdatedAt = toTimestampMsOrUndefined(attributes.media_position_updated_at);
    const mediaPositionUpdatedAt =
      explicitMediaPositionUpdatedAt ??
      (mediaPosition === undefined
        ? undefined
        : previousMediaState?.mediaPosition === mediaPosition && previousMediaState.mediaPositionUpdatedAt !== undefined
          ? previousMediaState.mediaPositionUpdatedAt
          : Date.now());
    const hvacMode = toStringOrUndefined(attributes.hvac_mode);
    const hvacModes = toStringArrayOrUndefined(attributes.hvac_modes);
    const hvacAction = toStringOrUndefined(attributes.hvac_action);
    const minTemp = toNumberOrUndefined(attributes.min_temp);
    const maxTemp = toNumberOrUndefined(attributes.max_temp);
    const targetTempStep = toNumberOrUndefined(attributes.target_temp_step);
    const targetTempLow = toNumberOrUndefined(attributes.target_temp_low);
    const targetTempHigh = toNumberOrUndefined(attributes.target_temp_high);
    const precision = toNumberOrUndefined(attributes.precision);
    const currentHumidity = toNumberOrUndefined(attributes.current_humidity);
    const targetHumidity = toNumberOrUndefined(attributes.humidity);
    const minHumidity = toNumberOrUndefined(attributes.min_humidity);
    const maxHumidity = toNumberOrUndefined(attributes.max_humidity);
    const targetHumidityStep = toNumberOrUndefined(attributes.target_humidity_step);
    const presetMode = toStringOrUndefined(attributes.preset_mode);
    const presetModes = toStringArrayOrUndefined(attributes.preset_modes);
    const swingMode = toStringOrUndefined(attributes.swing_mode);
    const swingModes = toStringArrayOrUndefined(attributes.swing_modes);
    const swingHorizontalMode = toStringOrUndefined(attributes.swing_horizontal_mode);
    const swingHorizontalModes = toStringArrayOrUndefined(attributes.swing_horizontal_modes);
    const fanMode = toStringOrUndefined(attributes.fan_mode);
    const fanModes = toStringArrayOrUndefined(attributes.fan_modes);
    const volumeLevel = toPercentFromUnitRange(attributes.volume_level);
    const mediaMuted = typeof attributes.is_volume_muted === 'boolean' ? attributes.is_volume_muted : undefined;
    const volumeStep = toNumberOrUndefined(attributes.volume_step);
    const supportedFeatures = toNumberOrUndefined(attributes.supported_features);
    const colorMode = toStringOrUndefined(attributes.color_mode);
    const supportedColorModes = toStringArrayOrUndefined(attributes.supported_color_modes);
    const hsColor = toNumberTuple2(attributes.hs_color);
    const rgbColor = toNumberTuple3(attributes.rgb_color);
    const rgbwColor = toNumberTuple4(attributes.rgbw_color);
    const rgbwwColor = toNumberTuple5(attributes.rgbww_color);
    const xyColor = toNumberTuple2(attributes.xy_color);
    const colorTempKelvin = toNumberOrUndefined(attributes.color_temp_kelvin);
    const minColorTempKelvin = toNumberOrUndefined(attributes.min_color_temp_kelvin);
    const maxColorTempKelvin = toNumberOrUndefined(attributes.max_color_temp_kelvin);
    const effect = toStringOrUndefined(attributes.effect);
    const effectList = toStringArrayOrUndefined(attributes.effect_list);
    const progress =
      mediaPosition !== undefined && mediaDuration !== undefined && mediaDuration > 0
        ? Math.max(0, Math.min(100, Math.round((mediaPosition / mediaDuration) * 100)))
        : undefined;

    const isOnOffEntity = entity.state === 'on' || entity.state === 'off';
    const toggleOn = isOnOffEntity ? entity.state === 'on' : undefined;
    const stateLabel = domain === 'media_player' ? translateMediaPlayerState(entity.state) : hvacAction ?? entity.state;

    const mediaSecondary = mediaTitle ? `${mediaTitle}${mediaArtist ? ` - ${mediaArtist}` : ''}` : undefined;
    const fallbackSecondary = friendlyName ?? (unit ? `${entity.state} ${unit}` : undefined);

    nextStates[entityId] = {
      state: entity.state,
      secondary: mediaSecondary ?? fallbackSecondary,
      numericValue,
      imageUrl: resolveEntityPicture(hassUrl, picture),
      supportedFeatures: supportedFeatures !== undefined ? Math.round(supportedFeatures) : undefined,
      rawAttributes,
      unit,
      targetValue: targetTemperature,
      currentValue: currentTemperature,
      brightness,
      toggleOn,
      progress,
      stateLabel,
      nowPlaying: mediaTitle,
      mediaTitle,
      mediaArtist,
      mediaAlbumArtist,
      mediaAlbumName,
      mediaChannel,
      mediaContentId,
      mediaContentType,
      mediaPosition,
      mediaDuration,
      mediaPositionUpdatedAt,
      mediaEpisode,
      mediaImageHash,
      mediaImageRemotelyAccessible,
      mediaImageUrl,
      mediaImageLocalUrl,
      mediaPlaylist,
      mediaSeason,
      mediaSeriesTitle,
      mediaTrack,
      appId,
      appName,
      source,
      sourceList,
      soundMode,
      soundModeList,
      groupMembers,
      mediaDeviceClass,
      forecast: domain === 'weather' ? weatherForecast : undefined,
      precipitation: domain === 'weather' ? weatherPrecipitation : undefined,
      windSpeed: domain === 'weather' ? weatherWindSpeed : undefined,
      humidity: domain === 'weather' ? weatherHumidity : undefined,
      hvacMode,
      hvacModes,
      hvacAction,
      minTemp,
      maxTemp,
      targetTempStep,
      targetTempLow,
      targetTempHigh,
      precision,
      currentHumidity,
      targetHumidity,
      minHumidity,
      maxHumidity,
      targetHumidityStep,
      presetMode,
      presetModes,
      swingMode,
      swingModes,
      swingHorizontalMode,
      swingHorizontalModes,
      fanMode,
      fanModes,
      volumeLevel,
      mediaMuted,
      volumeStep,
      colorMode,
      supportedColorModes,
      hsColor,
      rgbColor,
      rgbwColor,
      rgbwwColor,
      xyColor,
      colorTempKelvin,
      minColorTempKelvin,
      maxColorTempKelvin,
      effect,
      effectList,
      color_mode: colorMode,
      supported_color_modes: supportedColorModes,
      hs_color: hsColor,
      rgb_color: rgbColor,
      rgbw_color: rgbwColor,
      rgbww_color: rgbwwColor,
      xy_color: xyColor,
      color_temp_kelvin: colorTempKelvin,
      min_color_temp_kelvin: minColorTempKelvin,
      max_color_temp_kelvin: maxColorTempKelvin,
      effect_list: effectList,
    };
  });

  return nextStates;
}
