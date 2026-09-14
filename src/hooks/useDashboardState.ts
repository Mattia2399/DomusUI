import { useEffect, useMemo, useState } from 'react';
import type { MockEntityStateMap, MockWeatherForecastEntry } from '../types/ha';
import type { HaConnectionStatus } from './useHaLiveConnection';

export interface FavoriteDevice {
  id: string;
  name: string;
  status: string;
  hasSettings?: boolean;
  image: string;
  imgClass: string;
  isOn: boolean;
}

export interface DashboardStateShape {
  userName: string;
  wifiDownloadMbps: number;
  weather: {
    available: boolean;
    source: 'ha' | 'mock' | 'unavailable' | 'offline';
    location: string;
    condition: string;
    temperature: number;
    feelsLike: number;
    high: number;
    low: number;
    precipitation: number;
    precipitationAmount: number;
    pressure: number;
    dewPoint: number;
    cloudCoverage: number;
    windGustSpeed: number;
    windBearing: number | string;
    humidity: number;
    windSpeed: number;
    uvIndex: number;
    visibility: number;
    temperatureUnit?: string;
    precipitationUnit?: string;
    pressureUnit?: string;
    visibilityUnit?: string;
    windSpeedUnit?: string;
    sunrise?: string | number;
    sunset?: string | number;
    forecast: Array<{
      label: string;
      datetime?: string;
      isDaytime?: boolean;
      condition: string;
      high: number;
      low: number;
      precipitation: number;
      precipitationAmount?: number;
      precipitationProbability?: number;
      apparentTemperature?: number;
      cloudCoverage?: number;
      dewPoint?: number;
      humidity?: number;
      pressure?: number;
      uvIndex?: number;
      windBearing?: number | string;
      windGustSpeed?: number;
      windSpeed?: number;
    }>;
    rawAttributes?: Record<string, unknown>;
  };
  lamp: {
    name: string;
    isOn: boolean;
    brightness: number;
    status: string;
    hsColor: [number, number];
    colorTemp: number;
    activeTimerEnd?: number;
  };
  climate: {
    name: string;
    mode: string;
    isOn: boolean;
    status: string;
    currentTemp: number;
    targetTemp: number;
    minTemp: number;
    maxTemp: number;
    targetTempLow?: number;
    targetTempHigh?: number;
    targetTempStep?: number;
    hvacModes?: string[];
    hvacAction?: string;
    fanMode?: string;
    fanModes?: string[];
    supportedFeatures?: number;
    precision?: number;
    currentHumidity?: number;
    targetHumidity?: number;
    minHumidity?: number;
    maxHumidity?: number;
    targetHumidityStep?: number;
    presetMode?: string;
    presetModes?: string[];
    swingMode?: string;
    swingModes?: string[];
    swingHorizontalMode?: string;
    swingHorizontalModes?: string[];
    temperatureUnit?: string;
    rawAttributes?: Record<string, unknown>;
  };
  speaker: {
    isPlaying: boolean;
    status: string;
    progress: number;
    positionSeconds?: number;
    trackTitle?: string;
    trackArtist?: string;
    durationSeconds?: number;
    coverUrl?: string;
    volumeLevel?: number;
    muted?: boolean;
    supportsSeek?: boolean;
    supportsVolume?: boolean;
    supportsMute?: boolean;
    supportsVolumeStep?: boolean;
    supportsNextTrack?: boolean;
    supportsPreviousTrack?: boolean;
    supportsPower?: boolean;
    supportsShuffle?: boolean;
    supportsRepeat?: boolean;
    supportsSelectSource?: boolean;
    supportsGrouping?: boolean;
    supportsStop?: boolean;
    supportsClearPlaylist?: boolean;
    supportsSelectSoundMode?: boolean;
    supportsPlayMedia?: boolean;
    supportsBrowseMedia?: boolean;
    supportsSearchMedia?: boolean;
    supportsAnnounce?: boolean;
    supportsEnqueue?: boolean;
    shuffleEnabled?: boolean;
    repeatMode?: 'off' | 'all' | 'one';
    soundMode?: string;
    soundModeList?: string[];
    volumeStep?: number;
    rawAttributes?: Record<string, unknown>;
    outputDevices?: Array<{
      id: string;
      name: string;
      subtitle?: string;
      kind?: 'speaker' | 'tv' | 'cast';
    }>;
    selectedOutputDeviceId?: string;
    multiroomDevices?: Array<{
      id: string;
      name: string;
      subtitle?: string;
      kind?: 'speaker' | 'tv' | 'cast';
      grouped?: boolean;
    }>;
  };
  favorites: FavoriteDevice[];
  livingRoomMasterOff: boolean;
}

type DashboardWeatherForecast = DashboardStateShape['weather']['forecast'];

const FAVORITES_SEED: FavoriteDevice[] = [
  {
    id: 'thermostat',
    name: 'Thermostat',
    status: 'Opening',
    image: 'https://images.unsplash.com/photo-1585060544812-6b45742d762f?w=300&h=300&fit=crop',
    imgClass: 'mix-blend-screen opacity-80 scale-125',
    isOn: true,
  },
  {
    id: 'google-home-max',
    name: 'Google Home Max Charcoal',
    status: 'Opening',
    hasSettings: true,
    image: 'https://images.unsplash.com/photo-1543512214-318c7553f230?w=300&h=300&fit=crop',
    imgClass: 'mix-blend-screen opacity-90 object-cover rounded-xl mt-2',
    isOn: true,
  },
  {
    id: 'philips-lighting-2',
    name: 'Philips Lighting 2',
    status: 'Closed',
    hasSettings: true,
    image: 'https://images.unsplash.com/photo-1550989460-0adf9ea622e2?w=300&h=300&fit=crop',
    imgClass: 'mix-blend-screen opacity-90 scale-110',
    isOn: false,
  },
  {
    id: 'nest-cam-iq-indoor',
    name: 'Nest Cam IQ Indoor',
    status: 'Opening',
    hasSettings: true,
    image: 'https://images.unsplash.com/photo-1557322984-e689813740b2?w=300&h=300&fit=crop',
    imgClass: 'mix-blend-screen opacity-90 scale-110',
    isOn: true,
  },
  {
    id: 'google-home',
    name: 'Google Home',
    status: 'Opening',
    hasSettings: true,
    image: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=300&h=300&fit=crop',
    imgClass: 'mix-blend-screen opacity-90 scale-110',
    isOn: true,
  },
];

const SPEAKER_OUTPUT_DEVICES_SEED = [
  { id: 'living_room_speaker', name: 'Diffusore soggiorno', subtitle: 'Wi-Fi', kind: 'speaker' as const },
  { id: 'kitchen_speaker', name: 'Diffusore cucina', subtitle: 'AirPlay', kind: 'speaker' as const },
  { id: 'bedroom_tv', name: 'TV camera', subtitle: 'HDMI ARC', kind: 'tv' as const },
];

const SPEAKER_MULTIROOM_SEED = [
  { id: 'media_player.kitchen_speaker', name: 'Diffusore cucina', subtitle: 'Cucina', kind: 'speaker' as const, grouped: false },
  { id: 'media_player.bedroom_speaker', name: 'Diffusore camera', subtitle: 'Camera', kind: 'speaker' as const, grouped: false },
  { id: 'media_player.living_room_tv', name: 'TV soggiorno', subtitle: 'Soggiorno', kind: 'tv' as const, grouped: false },
];

const CLIMATE_DEMO_MIN_TEMP = 16;
const CLIMATE_DEMO_MAX_TEMP = 30;
const CLIMATE_DEMO_TARGET_STEP = 0.5;
const CLIMATE_DEMO_MIN_HUMIDITY = 30;
const CLIMATE_DEMO_MAX_HUMIDITY = 99;
const CLIMATE_DEMO_TARGET_HUMIDITY_STEP = 1;
const CLIMATE_DEMO_SUPPORTED_FEATURES = 1023;
const CLIMATE_DEMO_HVAC_MODES = ['off', 'heat', 'cool', 'heat_cool', 'auto', 'dry', 'fan_only'] as const;
const CLIMATE_DEMO_FAN_MODES = ['auto', '1', '2', '3', '4', '5', 'quiet', 'turbo'] as const;
const CLIMATE_DEMO_PRESET_MODES = ['none', 'eco', 'comfort', 'away', 'sleep', 'boost'] as const;
const CLIMATE_DEMO_SWING_MODES = ['off', 'vertical', 'horizontal', 'both'] as const;
const CLIMATE_DEMO_SWING_HORIZONTAL_MODES = ['off', 'on'] as const;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeClimateMode(mode: string | undefined) {
  const normalized = (mode ?? '').trim().toLowerCase();
  if ((CLIMATE_DEMO_HVAC_MODES as readonly string[]).includes(normalized)) {
    return normalized;
  }
  return 'auto';
}

function deriveClimateAction(mode: string, isOn: boolean) {
  if (!isOn || mode === 'off') {
    return 'off';
  }
  if (mode === 'heat') {
    return 'heating';
  }
  if (mode === 'cool') {
    return 'cooling';
  }
  if (mode === 'dry') {
    return 'drying';
  }
  if (mode === 'fan_only') {
    return 'fan';
  }
  return 'idle';
}

function formatStatus(isOn: boolean) {
  return isOn ? 'Opening' : 'Closed';
}

const USER_NAME_STORAGE_KEY = 'ha.dashboard.userName';

function readStoredUserName() {
  if (typeof window === 'undefined') {
    return '';
  }
  const stored = window.localStorage.getItem(USER_NAME_STORAGE_KEY);
  const normalized = stored?.trim() ?? '';
  if (!normalized || normalized === 'Ahang') {
    window.localStorage.removeItem(USER_NAME_STORAGE_KEY);
    return '';
  }
  return normalized;
}

type UseDashboardStateOptions = {
  haStates?: MockEntityStateMap;
  haStatus?: HaConnectionStatus;
  allowMockFallback?: boolean;
  weatherEntityId?: string;
  weatherForecastType?: 'daily' | 'hourly' | 'twice_daily';
  haCallApi?: <TResponse = unknown>(
    message: Record<string, unknown>,
    options?: { reportError?: boolean },
  ) => Promise<TResponse | null>;
};

type ResolvedWeatherForecastType = 'daily' | 'hourly' | 'twice_daily';
type LiveWeatherForecastByType = Record<ResolvedWeatherForecastType, MockWeatherForecastEntry[] | null>;
const EMPTY_LIVE_WEATHER_FORECAST: LiveWeatherForecastByType = {
  daily: null,
  hourly: null,
  twice_daily: null,
};

function toNumberOrUndefined(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function toNumberOrStringOrUndefined(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return undefined;
    }
    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : trimmed;
  }
  return undefined;
}

function normalizeForecastType(value: UseDashboardStateOptions['weatherForecastType']) {
  if (value === 'twice_daily') {
    return 'twice_daily';
  }
  return value === 'hourly' ? 'hourly' : 'daily';
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

function parseForecastEntries(value: unknown): MockWeatherForecastEntry[] {
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

function extractForecastPayloadFromWeatherApiResponse(
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

function formatForecastLabel(
  value: string | undefined,
  isDaytime: boolean | undefined,
  index: number,
  forecastType: ResolvedWeatherForecastType,
) {
  if (!value) {
    if (forecastType === 'hourly') {
      return `${String(index + 1).padStart(2, '0')}:00`;
    }
    if (forecastType === 'twice_daily') {
      return index === 0 ? 'Oggi Giorno' : `Slot ${index + 1}`;
    }
    return index === 0 ? 'Oggi' : `Giorno ${index + 1}`;
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    if (forecastType === 'hourly') {
      return `${String(index + 1).padStart(2, '0')}:00`;
    }
    if (forecastType === 'twice_daily') {
      return index === 0 ? 'Oggi Giorno' : `Slot ${index + 1}`;
    }
    return index === 0 ? 'Oggi' : `Giorno ${index + 1}`;
  }
  if (forecastType === 'hourly') {
    try {
      return new Intl.DateTimeFormat('it-IT', { hour: '2-digit' }).format(parsed);
    } catch {
      return `${String(parsed.getHours()).padStart(2, '0')}:00`;
    }
  }
  if (forecastType === 'twice_daily') {
    try {
      const day = new Intl.DateTimeFormat('it-IT', { weekday: 'short' }).format(parsed);
      const slot = isDaytime === undefined ? '' : isDaytime ? ' Giorno' : ' Notte';
      return `${day}${slot}`;
    } catch {
      return isDaytime === false ? 'Notte' : 'Giorno';
    }
  }
  if (index === 0) {
    return 'Oggi';
  }
  try {
    return new Intl.DateTimeFormat('it-IT', { weekday: 'short' }).format(parsed);
  } catch {
    return parsed.toLocaleDateString();
  }
}

export function useDashboardState(): ReturnType<typeof useDashboardStateInternal>;
export function useDashboardState(options: UseDashboardStateOptions): ReturnType<typeof useDashboardStateInternal>;
export function useDashboardState(options?: UseDashboardStateOptions) {
  return useDashboardStateInternal(options);
}

function useDashboardStateInternal(options?: UseDashboardStateOptions) {
  const [userName, setUserNameState] = useState(readStoredUserName);
  const [lampOn, setLampOn] = useState(true);
  const [lampBrightness, setLampBrightnessState] = useState(40);
  const [lampHsColor, setLampHsColorState] = useState<[number, number]>([225, 68]);
  const [lampColorTemp, setLampColorTempState] = useState(4200);
  const [lampTimerEnd, setLampTimerEnd] = useState<number | undefined>(undefined);
  const [climateOn, setClimateOn] = useState(true);
  const [climateCurrentTemp, setClimateCurrentTemp] = useState(24);
  const [climateTargetTemp, setClimateTargetTemp] = useState(26.5);
  const [climateMode, setClimateModeState] = useState<string>('auto');
  const [climateFanMode, setClimateFanModeState] = useState<string>('auto');
  const [climateTargetHumidity, setClimateTargetHumidityState] = useState(45);
  const [climatePresetMode, setClimatePresetModeState] = useState<string>('none');
  const [climateSwingMode, setClimateSwingModeState] = useState<string>('off');
  const [climateSwingHorizontalMode, setClimateSwingHorizontalModeState] = useState<string>('off');
  const [climateTargetRange, setClimateTargetRangeState] = useState<{ low: number; high: number }>({
    low: 23,
    high: 27,
  });
  const [speakerPlaying, setSpeakerPlaying] = useState(false);
  const [speakerProgress, setSpeakerProgress] = useState(0);
  const [speakerVolume, setSpeakerVolume] = useState(72);
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const [speakerPowered, setSpeakerPowered] = useState(true);
  const [speakerShuffleEnabled, setSpeakerShuffleEnabled] = useState(false);
  const [speakerRepeatMode, setSpeakerRepeatMode] = useState<'off' | 'all' | 'one'>('off');
  const [speakerOutputDevices] = useState(() => SPEAKER_OUTPUT_DEVICES_SEED);
  const [speakerSelectedOutputDeviceId, setSpeakerSelectedOutputDeviceId] = useState(
    SPEAKER_OUTPUT_DEVICES_SEED[0]?.id ?? '',
  );
  const [speakerMultiroomDevices, setSpeakerMultiroomDevices] = useState(() => SPEAKER_MULTIROOM_SEED);
  const [favorites, setFavorites] = useState<FavoriteDevice[]>(FAVORITES_SEED);
  const haStates = options?.haStates ?? {};
  const haConnected = options?.haStatus === 'connected';
  const allowMockFallback = options?.allowMockFallback ?? options === undefined;
  const preferredWeatherEntityId = options?.weatherEntityId?.trim();
  const weatherForecastType = normalizeForecastType(options?.weatherForecastType);
  const callHaApi = options?.haCallApi;
  const [liveWeatherForecast, setLiveWeatherForecast] =
    useState<LiveWeatherForecastByType>(EMPTY_LIVE_WEATHER_FORECAST);
  const weatherEntityCandidates = useMemo(
    () => Object.keys(haStates).filter((entityId) => entityId.startsWith('weather.')),
    [haStates],
  );
  const resolvedWeatherEntityId = useMemo(() => {
    if (!haConnected || weatherEntityCandidates.length === 0) {
      return undefined;
    }
    if (
      preferredWeatherEntityId &&
      preferredWeatherEntityId.startsWith('weather.') &&
      weatherEntityCandidates.includes(preferredWeatherEntityId)
    ) {
      return preferredWeatherEntityId;
    }
    return weatherEntityCandidates[0];
  }, [haConnected, preferredWeatherEntityId, weatherEntityCandidates]);

  const toggleLamp = () => {
    setLampOn((current) => {
      const next = !current;
      if (next) {
        setLampBrightnessState((value) => (value > 0 ? value : 40));
      } else {
        setLampTimerEnd(undefined);
      }
      return next;
    });
  };

  const setUserName = (name: string) => {
    const next = name.trim();
    setUserNameState(next);
    if (typeof window !== 'undefined') {
      if (next) {
        window.localStorage.setItem(USER_NAME_STORAGE_KEY, next);
      } else {
        window.localStorage.removeItem(USER_NAME_STORAGE_KEY);
      }
    }
  };

  const adjustLampBrightness = (delta: number) => {
    setLampBrightnessState((current) => {
      const next = clamp(current + delta, 0, 100);
      setLampOn(next > 0);
      return next;
    });
  };

  const setLampBrightness = (value: number) => {
    const next = clamp(Math.round(value), 0, 100);
    setLampBrightnessState(next);
    setLampOn(next > 0);
    if (next === 0) {
      setLampTimerEnd(undefined);
    }
  };

  const setLampHsColor = (hs: [number, number]) => {
    const nextHue = clamp(Math.round(hs[0]), 0, 360);
    const nextSat = clamp(Math.round(hs[1]), 0, 100);
    setLampHsColorState([nextHue, nextSat]);
  };

  const setLampColorTemp = (kelvin: number) => {
    const next = clamp(Math.round(kelvin), 2000, 6500);
    setLampColorTempState(next);
  };

  const setLampTimer = (minutes: number) => {
    const safeMinutes = clamp(Math.round(minutes), 1, 120);
    setLampTimerEnd(Date.now() + safeMinutes * 60000);
  };

  const cancelLampTimer = () => {
    setLampTimerEnd(undefined);
  };

  const increaseClimateTarget = () => {
    setClimateTargetTemp((current) =>
      clamp(Math.round((current + CLIMATE_DEMO_TARGET_STEP) * 10) / 10, CLIMATE_DEMO_MIN_TEMP, CLIMATE_DEMO_MAX_TEMP),
    );
  };

  const decreaseClimateTarget = () => {
    setClimateTargetTemp((current) =>
      clamp(Math.round((current - CLIMATE_DEMO_TARGET_STEP) * 10) / 10, CLIMATE_DEMO_MIN_TEMP, CLIMATE_DEMO_MAX_TEMP),
    );
  };

  const autoAdjustClimate = () => {
    setClimateOn(true);
    setClimateModeState('auto');
    setClimateTargetTemp(climateCurrentTemp);
  };

  const nudgeClimateCurrent = () => {
    setClimateCurrentTemp((current) => {
      const drift = Math.random() > 0.5 ? 0.1 : -0.1;
      return clamp(Math.round((current + drift) * 10) / 10, CLIMATE_DEMO_MIN_TEMP, CLIMATE_DEMO_MAX_TEMP);
    });
  };

  const toggleClimatePower = () => {
    setClimateOn((current) => {
      const next = !current;
      setClimateModeState((prev) => {
        if (!next) {
          return 'off';
        }
        return prev === 'off' ? 'auto' : normalizeClimateMode(prev);
      });
      return next;
    });
  };

  const setClimateTarget = (value: number) => {
    const nextTarget = clamp(
      Math.round(value / CLIMATE_DEMO_TARGET_STEP) * CLIMATE_DEMO_TARGET_STEP,
      CLIMATE_DEMO_MIN_TEMP,
      CLIMATE_DEMO_MAX_TEMP,
    );
    setClimateTargetTemp(nextTarget);
    setClimateTargetRangeState((currentRange) => {
      const span = Math.max(CLIMATE_DEMO_TARGET_STEP, currentRange.high - currentRange.low);
      const halfSpan = span / 2;
      const low = clamp(
        Math.round((nextTarget - halfSpan) / CLIMATE_DEMO_TARGET_STEP) * CLIMATE_DEMO_TARGET_STEP,
        CLIMATE_DEMO_MIN_TEMP,
        CLIMATE_DEMO_MAX_TEMP,
      );
      const high = clamp(
        Math.round((nextTarget + halfSpan) / CLIMATE_DEMO_TARGET_STEP) * CLIMATE_DEMO_TARGET_STEP,
        CLIMATE_DEMO_MIN_TEMP,
        CLIMATE_DEMO_MAX_TEMP,
      );
      return {
        low: Math.min(low, high),
        high: Math.max(low, high),
      };
    });
  };

  const setClimateMode = (mode: string) => {
    const normalized = normalizeClimateMode(mode);
    setClimateModeState(normalized);
    setClimateOn(normalized !== 'off');
  };

  const setClimateFanMode = (mode: string) => {
    const normalized = mode.trim().toLowerCase();
    const fallback = climateFanMode;
    const next =
      normalized.length > 0 && (CLIMATE_DEMO_FAN_MODES as readonly string[]).includes(normalized)
        ? normalized
        : fallback;
    setClimateFanModeState(next);
  };

  const setClimateTargetHumidity = (value: number) => {
    const next = clamp(
      Math.round(value / CLIMATE_DEMO_TARGET_HUMIDITY_STEP) * CLIMATE_DEMO_TARGET_HUMIDITY_STEP,
      CLIMATE_DEMO_MIN_HUMIDITY,
      CLIMATE_DEMO_MAX_HUMIDITY,
    );
    setClimateTargetHumidityState(next);
  };

  const setClimatePresetMode = (mode: string) => {
    const normalized = mode.trim().toLowerCase();
    if ((CLIMATE_DEMO_PRESET_MODES as readonly string[]).includes(normalized)) {
      setClimatePresetModeState(normalized);
    }
  };

  const setClimateSwingMode = (mode: string) => {
    const normalized = mode.trim().toLowerCase();
    if ((CLIMATE_DEMO_SWING_MODES as readonly string[]).includes(normalized)) {
      setClimateSwingModeState(normalized);
    }
  };

  const setClimateSwingHorizontalMode = (mode: string) => {
    const normalized = mode.trim().toLowerCase();
    if ((CLIMATE_DEMO_SWING_HORIZONTAL_MODES as readonly string[]).includes(normalized)) {
      setClimateSwingHorizontalModeState(normalized);
    }
  };

  const setClimateTargetRange = (low: number, high: number) => {
    const safeLow = clamp(
      Math.round(low / CLIMATE_DEMO_TARGET_STEP) * CLIMATE_DEMO_TARGET_STEP,
      CLIMATE_DEMO_MIN_TEMP,
      CLIMATE_DEMO_MAX_TEMP,
    );
    const safeHigh = clamp(
      Math.round(high / CLIMATE_DEMO_TARGET_STEP) * CLIMATE_DEMO_TARGET_STEP,
      CLIMATE_DEMO_MIN_TEMP,
      CLIMATE_DEMO_MAX_TEMP,
    );
    const nextLow = Math.min(safeLow, safeHigh);
    const nextHigh = Math.max(safeLow, safeHigh);
    setClimateTargetRangeState({ low: nextLow, high: nextHigh });
    setClimateTargetTemp(Math.round(((nextLow + nextHigh) / 2) * 10) / 10);
  };

  const toggleSpeakerPlayback = () => {
    setSpeakerPlaying((current) => !current);
  };

  const setSpeakerProgressValue = (next: number) => {
    setSpeakerProgress(clamp(Math.round(next), 0, 100));
  };

  const setSpeakerVolumeValue = (next: number) => {
    setSpeakerVolume(clamp(Math.round(next), 0, 100));
  };

  const toggleSpeakerMute = () => {
    setSpeakerMuted((current) => !current);
  };

  const toggleSpeakerShuffle = () => {
    setSpeakerShuffleEnabled((current) => !current);
  };

  const cycleSpeakerRepeatMode = () => {
    setSpeakerRepeatMode((current) => {
      if (current === 'off') {
        return 'all';
      }
      if (current === 'all') {
        return 'one';
      }
      return 'off';
    });
  };

  const setSpeakerOutputDevice = (deviceId: string) => {
    const normalized = deviceId.trim();
    if (!normalized) {
      return;
    }
    setSpeakerSelectedOutputDeviceId(normalized);
  };

  const toggleSpeakerGroupMember = (deviceId: string, shouldJoin: boolean) => {
    const normalized = deviceId.trim();
    if (!normalized) {
      return;
    }
    setSpeakerMultiroomDevices((current) =>
      current.map((device) =>
        device.id === normalized
          ? { ...device, grouped: shouldJoin }
          : device,
      ),
    );
  };

  const previousSpeakerTrack = () => {
    setSpeakerProgress(0);
  };

  const nextSpeakerTrack = () => {
    setSpeakerProgress(0);
  };

  const toggleSpeakerPower = () => {
    setSpeakerPowered((current) => !current);
  };

  useEffect(() => {
    if (lampTimerEnd === undefined) {
      return;
    }
    const timerId = window.setInterval(() => {
      if (Date.now() < lampTimerEnd) {
        return;
      }
      setLampOn(false);
      setLampTimerEnd(undefined);
    }, 1000);
    return () => {
      window.clearInterval(timerId);
    };
  }, [lampTimerEnd]);

  useEffect(() => {
    if (!haConnected || !resolvedWeatherEntityId || !callHaApi) {
      setLiveWeatherForecast(EMPTY_LIVE_WEATHER_FORECAST);
      return;
    }

    let cancelled = false;
    const fetchLiveForecast = async () => {
      const nextByType: LiveWeatherForecastByType = {
        daily: null,
        hourly: null,
        twice_daily: null,
      };

      const fetchForecastEntriesForType = async (forecastType: ResolvedWeatherForecastType) => {
        const attempts: Array<Record<string, unknown>> = [
          {
            type: 'weather/get_forecasts',
            entity_ids: [resolvedWeatherEntityId],
            forecast_type: forecastType,
          },
          {
            type: 'weather/get_forecasts',
            entity_id: resolvedWeatherEntityId,
            forecast_type: forecastType,
          },
          {
            type: 'call_service',
            domain: 'weather',
            service: 'get_forecasts',
            service_data: { type: forecastType },
            target: { entity_id: [resolvedWeatherEntityId] },
            return_response: true,
          },
          {
            type: 'call_service',
            domain: 'weather',
            service: 'get_forecasts',
            service_data: { type: forecastType, entity_id: resolvedWeatherEntityId },
            return_response: true,
          },
        ];

        for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex += 1) {
          const message = attempts[attemptIndex];
          const response = await callHaApi<unknown>(message, { reportError: false });
          if (cancelled || response === null) {
            continue;
          }
          const rawForecast = extractForecastPayloadFromWeatherApiResponse(response, resolvedWeatherEntityId);
          const parsedEntries = parseForecastEntries(rawForecast);
          if (parsedEntries.length > 0) {
            if (import.meta.env.DEV) {
              console.debug('[weather/get_forecasts]', {
                entityId: resolvedWeatherEntityId,
                forecastType,
                attempt: attemptIndex + 1,
                entries: parsedEntries.length,
                sample:
                  Array.isArray(rawForecast) && rawForecast.length > 0
                    ? rawForecast[0]
                    : rawForecast,
              });
            }
            return parsedEntries;
          }
        }

        if (import.meta.env.DEV) {
          console.debug('[weather/get_forecasts]', {
            entityId: resolvedWeatherEntityId,
            forecastType,
            attempt: 'all_failed',
          });
        }
        return null;
      };

      await Promise.all(
        (['daily', 'hourly', 'twice_daily'] as const).map(async (forecastType) => {
          const parsedEntries = await fetchForecastEntriesForType(forecastType);
          if (cancelled) {
            return;
          }
          nextByType[forecastType] = parsedEntries && parsedEntries.length > 0 ? parsedEntries : null;
        }),
      );

      if (!cancelled) {
        setLiveWeatherForecast(nextByType);
      }
    };

    void fetchLiveForecast();
    const refreshTimer =
      typeof window !== 'undefined' ? window.setInterval(() => void fetchLiveForecast(), 10 * 60 * 1000) : undefined;

    return () => {
      cancelled = true;
      if (refreshTimer !== undefined) {
        window.clearInterval(refreshTimer);
      }
    };
  }, [callHaApi, haConnected, resolvedWeatherEntityId]);

  const toggleFavoritePower = (deviceId: string) => {
    setFavorites((current) =>
      current.map((device) => {
        if (device.id !== deviceId) {
          return device;
        }
        const nextOn = !device.isOn;
        return {
          ...device,
          isOn: nextOn,
          status: formatStatus(nextOn),
        };
      }),
    );
  };

  const state = useMemo<DashboardStateShape>(() => {
    const liveLamp = haConnected ? haStates['light.living_room_lamp'] : undefined;
    const liveClimate = haConnected ? haStates['climate.air_conditioner'] : undefined;
    const liveWifi = haConnected ? haStates['sensor.nest_wifi_download'] : undefined;
    const liveWeather = resolvedWeatherEntityId ? haStates[resolvedWeatherEntityId] : undefined;
    const hasLiveWeather = Boolean(resolvedWeatherEntityId && liveWeather);
    const useMockWeather = !hasLiveWeather && allowMockFallback;
    const weatherSource: DashboardStateShape['weather']['source'] = hasLiveWeather
      ? 'ha'
      : useMockWeather
        ? 'mock'
        : haConnected
          ? 'unavailable'
          : 'offline';
    const liveLampOn =
      typeof liveLamp?.toggleOn === 'boolean' ? liveLamp.toggleOn : undefined;
    const liveClimateOn = liveClimate?.state ? liveClimate.state !== 'off' : undefined;
    const resolvedLampOn = liveLampOn ?? lampOn;
    const resolvedClimateOn = liveClimateOn ?? climateOn;
    const lampStatus = formatStatus(resolvedLampOn);
    const lampBrightnessValue =
      typeof liveLamp?.brightness === 'number' ? liveLamp.brightness : lampBrightness;
    const lampHsValue = liveLamp?.hsColor ?? liveLamp?.hs_color ?? lampHsColor;
    const lampColorTempValue =
      typeof liveLamp?.colorTempKelvin === 'number'
        ? liveLamp.colorTempKelvin
        : liveLamp?.color_temp_kelvin ?? lampColorTemp;
    const climateCurrentValue =
      typeof liveClimate?.currentValue === 'number'
        ? liveClimate.currentValue
        : climateCurrentTemp;
    const climateTargetValue =
      typeof liveClimate?.targetValue === 'number' ? liveClimate.targetValue : climateTargetTemp;
    const climateModeValue = resolvedClimateOn
      ? normalizeClimateMode(liveClimate?.hvacMode ?? liveClimate?.state ?? climateMode)
      : 'off';
    const climateMinValue =
      typeof liveClimate?.minTemp === 'number' ? liveClimate.minTemp : CLIMATE_DEMO_MIN_TEMP;
    const climateMaxValue =
      typeof liveClimate?.maxTemp === 'number' ? liveClimate.maxTemp : CLIMATE_DEMO_MAX_TEMP;
    const rawClimateAttributes = liveClimate?.rawAttributes;
    const climateHvacAction =
      liveClimate?.hvacAction ??
      (typeof rawClimateAttributes?.hvac_action === 'string'
        ? rawClimateAttributes.hvac_action
        : undefined) ??
      deriveClimateAction(climateModeValue, resolvedClimateOn);
    const climateStatus = liveClimate?.stateLabel ?? climateHvacAction;
    const climateTargetTempLow =
      typeof liveClimate?.targetTempLow === 'number'
        ? liveClimate.targetTempLow
        : toNumberOrUndefined(rawClimateAttributes?.target_temp_low) ?? climateTargetRange.low;
    const climateTargetTempHigh =
      typeof liveClimate?.targetTempHigh === 'number'
        ? liveClimate.targetTempHigh
        : toNumberOrUndefined(rawClimateAttributes?.target_temp_high) ?? climateTargetRange.high;
    const climateTargetTempStep =
      typeof liveClimate?.targetTempStep === 'number'
        ? liveClimate.targetTempStep
        : toNumberOrUndefined(rawClimateAttributes?.target_temp_step) ?? CLIMATE_DEMO_TARGET_STEP;
    const climateHvacModes =
      Array.isArray(liveClimate?.hvacModes) && liveClimate.hvacModes.length > 0
        ? liveClimate.hvacModes
        : Array.isArray(rawClimateAttributes?.hvac_modes)
          ? rawClimateAttributes.hvac_modes.filter(
              (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
            )
          : [...CLIMATE_DEMO_HVAC_MODES];
    const climateFanModeValue =
      liveClimate?.fanMode ??
      (typeof rawClimateAttributes?.fan_mode === 'string' ? rawClimateAttributes.fan_mode : undefined) ??
      climateFanMode;
    const climateFanModes =
      Array.isArray(liveClimate?.fanModes) && liveClimate.fanModes.length > 0
        ? liveClimate.fanModes
        : Array.isArray(rawClimateAttributes?.fan_modes)
          ? rawClimateAttributes.fan_modes.filter(
              (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
            )
          : [...CLIMATE_DEMO_FAN_MODES];
    const climateSupportedFeatures =
      typeof liveClimate?.supportedFeatures === 'number'
        ? liveClimate.supportedFeatures
        : toNumberOrUndefined(rawClimateAttributes?.supported_features) ?? CLIMATE_DEMO_SUPPORTED_FEATURES;
    const climateCurrentHumidity =
      typeof liveClimate?.currentHumidity === 'number'
        ? liveClimate.currentHumidity
        : toNumberOrUndefined(rawClimateAttributes?.current_humidity) ?? 48;
    const climateTargetHumidityValue =
      typeof liveClimate?.targetHumidity === 'number'
        ? liveClimate.targetHumidity
        : toNumberOrUndefined(rawClimateAttributes?.humidity) ?? climateTargetHumidity;
    const climateMinHumidity =
      typeof liveClimate?.minHumidity === 'number'
        ? liveClimate.minHumidity
        : toNumberOrUndefined(rawClimateAttributes?.min_humidity) ?? CLIMATE_DEMO_MIN_HUMIDITY;
    const climateMaxHumidity =
      typeof liveClimate?.maxHumidity === 'number'
        ? liveClimate.maxHumidity
        : toNumberOrUndefined(rawClimateAttributes?.max_humidity) ?? CLIMATE_DEMO_MAX_HUMIDITY;
    const climateTargetHumidityStep =
      typeof liveClimate?.targetHumidityStep === 'number'
        ? liveClimate.targetHumidityStep
        : toNumberOrUndefined(rawClimateAttributes?.target_humidity_step) ?? CLIMATE_DEMO_TARGET_HUMIDITY_STEP;
    const climatePresetModeValue =
      liveClimate?.presetMode ??
      (typeof rawClimateAttributes?.preset_mode === 'string' ? rawClimateAttributes.preset_mode : undefined) ??
      climatePresetMode;
    const climatePresetModes =
      Array.isArray(liveClimate?.presetModes) && liveClimate.presetModes.length > 0
        ? liveClimate.presetModes
        : Array.isArray(rawClimateAttributes?.preset_modes)
          ? rawClimateAttributes.preset_modes.filter(
              (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
            )
          : [...CLIMATE_DEMO_PRESET_MODES];
    const climateSwingModeValue =
      liveClimate?.swingMode ??
      (typeof rawClimateAttributes?.swing_mode === 'string' ? rawClimateAttributes.swing_mode : undefined) ??
      climateSwingMode;
    const climateSwingModes =
      Array.isArray(liveClimate?.swingModes) && liveClimate.swingModes.length > 0
        ? liveClimate.swingModes
        : Array.isArray(rawClimateAttributes?.swing_modes)
          ? rawClimateAttributes.swing_modes.filter(
              (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
            )
          : [...CLIMATE_DEMO_SWING_MODES];
    const climateSwingHorizontalModeValue =
      liveClimate?.swingHorizontalMode ??
      (typeof rawClimateAttributes?.swing_horizontal_mode === 'string'
        ? rawClimateAttributes.swing_horizontal_mode
        : undefined) ??
      climateSwingHorizontalMode;
    const climateSwingHorizontalModes =
      Array.isArray(liveClimate?.swingHorizontalModes) && liveClimate.swingHorizontalModes.length > 0
        ? liveClimate.swingHorizontalModes
        : Array.isArray(rawClimateAttributes?.swing_horizontal_modes)
          ? rawClimateAttributes.swing_horizontal_modes.filter(
              (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
            )
          : [...CLIMATE_DEMO_SWING_HORIZONTAL_MODES];
    const climateRawAttributes = rawClimateAttributes ?? {
      friendly_name: 'Air Conditioner',
      hvac_mode: climateModeValue,
      hvac_action: climateHvacAction,
      hvac_modes: [...CLIMATE_DEMO_HVAC_MODES],
      fan_mode: climateFanModeValue,
      fan_modes: [...CLIMATE_DEMO_FAN_MODES],
      preset_mode: climatePresetModeValue,
      preset_modes: climatePresetModes,
      swing_mode: climateSwingModeValue,
      swing_modes: climateSwingModes,
      swing_horizontal_mode: climateSwingHorizontalModeValue,
      swing_horizontal_modes: climateSwingHorizontalModes,
      current_temperature: climateCurrentValue,
      temperature: climateTargetValue,
      target_temp_low: climateTargetTempLow,
      target_temp_high: climateTargetTempHigh,
      target_temp_step: climateTargetTempStep,
      min_temp: climateMinValue,
      max_temp: climateMaxValue,
      temperature_unit: '\u00B0C',
      current_humidity: climateCurrentHumidity,
      humidity: climateTargetHumidityValue,
      min_humidity: climateMinHumidity,
      max_humidity: climateMaxHumidity,
      target_humidity_step: climateTargetHumidityStep,
      aux_heat: false,
      supported_features: climateSupportedFeatures,
    };
    const wifiValue =
      typeof liveWifi?.numericValue === 'number' ? liveWifi.numericValue : 97;
    const weatherTemp =
      typeof liveWeather?.currentValue === 'number'
        ? liveWeather.currentValue
        : toNumberOrUndefined(liveWeather?.rawAttributes?.current_temperature) ??
          toNumberOrUndefined(liveWeather?.rawAttributes?.native_current_temperature) ??
          toNumberOrUndefined(liveWeather?.rawAttributes?.temperature) ??
          toNumberOrUndefined(liveWeather?.rawAttributes?.native_temperature) ??
          29.2;
    const weatherFeelsLike =
      toNumberOrUndefined(liveWeather?.rawAttributes?.apparent_temperature) ??
      toNumberOrUndefined(liveWeather?.rawAttributes?.native_apparent_temperature) ??
      toNumberOrUndefined(liveWeather?.rawAttributes?.feels_like) ??
      weatherTemp;
    const weatherTemperatureUnit =
      (typeof liveWeather?.unit === 'string' && liveWeather.unit.trim().length > 0
        ? liveWeather.unit
        : undefined) ??
      (typeof liveWeather?.rawAttributes?.temperature_unit === 'string'
        ? liveWeather.rawAttributes.temperature_unit
        : undefined) ??
      (typeof liveWeather?.rawAttributes?.native_temperature_unit === 'string'
        ? liveWeather.rawAttributes.native_temperature_unit
        : undefined);
    const weatherPrecipitationUnit =
      (typeof liveWeather?.rawAttributes?.precipitation_unit === 'string'
        ? liveWeather.rawAttributes.precipitation_unit
        : undefined) ?? 'mm';
    const weatherPressureUnit =
      (typeof liveWeather?.rawAttributes?.pressure_unit === 'string'
        ? liveWeather.rawAttributes.pressure_unit
        : undefined) ?? 'hPa';
    const weatherVisibilityUnit =
      (typeof liveWeather?.rawAttributes?.visibility_unit === 'string'
        ? liveWeather.rawAttributes.visibility_unit
        : undefined) ?? 'km';
    const weatherWindSpeedUnit =
      (typeof liveWeather?.rawAttributes?.wind_speed_unit === 'string'
        ? liveWeather.rawAttributes.wind_speed_unit
        : undefined) ?? 'km/h';
    const weatherForecastEntriesFromAttributes = parseForecastEntries(
      weatherForecastType === 'hourly'
        ? liveWeather?.rawAttributes?.hourly_forecast ??
            liveWeather?.rawAttributes?.forecast_hourly ??
            liveWeather?.rawAttributes?.forecast
        : weatherForecastType === 'twice_daily'
          ? liveWeather?.rawAttributes?.twice_daily_forecast ??
              liveWeather?.rawAttributes?.forecast_twice_daily ??
              liveWeather?.rawAttributes?.forecast
        : liveWeather?.rawAttributes?.forecast ??
            liveWeather?.rawAttributes?.daily_forecast ??
            liveWeather?.rawAttributes?.forecast_daily,
    );
    const weatherForecastEntries =
      liveWeatherForecast[weatherForecastType] ??
      (weatherForecastEntriesFromAttributes.length > 0 ? weatherForecastEntriesFromAttributes : liveWeather?.forecast ?? []);
    const weatherForecast: DashboardWeatherForecast = weatherForecastEntries.length
      ? weatherForecastEntries.slice(0, 12).map((entry, index) => {
          const highValue = entry.temperature ?? weatherTemp;
          const lowValue =
            weatherForecastType === 'hourly'
              ? highValue
              : entry.templow ?? entry.temperature ?? weatherTemp;
          const precipitationProbabilityValue = entry.precipitationProbability;
          const precipitationAmountValue = entry.precipitation;
          const precipitationDisplayValue =
            precipitationProbabilityValue ??
            precipitationAmountValue ??
            toNumberOrUndefined(liveWeather?.precipitation) ??
            0;
          return {
            label: formatForecastLabel(entry.datetime, entry.isDaytime, index, weatherForecastType),
            datetime: entry.datetime,
            isDaytime: entry.isDaytime,
            condition: entry.condition ?? liveWeather?.state ?? 'sunny',
            high: highValue,
            low: lowValue,
            precipitation: precipitationDisplayValue,
            precipitationAmount: precipitationAmountValue,
            precipitationProbability: precipitationProbabilityValue,
            apparentTemperature: entry.apparentTemperature,
            cloudCoverage: entry.cloudCoverage,
            dewPoint: entry.dewPoint,
            humidity: entry.humidity,
            pressure: entry.pressure,
            uvIndex: entry.uvIndex,
            windBearing: entry.windBearing,
            windGustSpeed: entry.windGustSpeed,
            windSpeed: entry.windSpeed,
          };
        })
      : !useMockWeather
        ? []
        : weatherForecastType === 'hourly'
        ? Array.from({ length: 5 }, (_, index) => {
            const baseline = Math.round(weatherTemp) + (index === 0 ? 0 : index % 2 === 0 ? 1 : -1);
            const precipitationProbability = Math.max(0, 8 + index * 3);
            return {
              label: formatForecastLabel(undefined, undefined, index, 'hourly'),
              condition: liveWeather?.state ?? 'partlycloudy',
              high: baseline,
              low: baseline,
              precipitation: precipitationProbability,
              precipitationProbability,
            };
          })
        : weatherForecastType === 'twice_daily'
          ? Array.from({ length: 4 }, (_, index) => {
              const isDaytime = index % 2 === 0;
              const baseline = Math.round(weatherTemp) + (isDaytime ? 1 : -1);
              const low = baseline - (isDaytime ? 2 : 3);
              const precipitationProbability = Math.max(0, 10 + index * 4);
              return {
                label: formatForecastLabel(undefined, isDaytime, index, 'twice_daily'),
                isDaytime,
                condition: liveWeather?.state ?? 'partlycloudy',
                high: baseline,
                low,
                precipitation: precipitationProbability,
                precipitationProbability,
              };
            })
        : Array.from({ length: 5 }, (_, index) => {
            const baseline = Math.round(weatherTemp) + (index === 0 ? 0 : index % 2 === 0 ? 1 : -1);
            const low = baseline - 4;
            const precipitationProbability = Math.max(0, 12 + index * 5);
            return {
              label: formatForecastLabel(undefined, undefined, index, 'daily'),
              condition: liveWeather?.state ?? 'partlycloudy',
              high: baseline,
              low,
              precipitation: precipitationProbability,
              precipitationProbability,
            };
          });
    const weatherHigh = weatherForecast[0]?.high ?? 31;
    const weatherLow = weatherForecast[0]?.low ?? 22;
    const weatherCondition =
      liveWeather?.state ?? weatherForecast[0]?.condition ?? (useMockWeather ? 'partlycloudy' : 'unavailable');
    const weatherLocation =
      (typeof liveWeather?.rawAttributes?.friendly_name === 'string'
        ? liveWeather.rawAttributes.friendly_name
        : undefined) ??
      (useMockWeather
        ? 'San Francisco'
        : weatherSource === 'offline'
          ? 'Home Assistant offline'
          : 'Meteo non configurato');
    const weatherPrecipitation =
      toNumberOrUndefined(liveWeather?.rawAttributes?.precipitation_probability) ??
      toNumberOrUndefined(liveWeather?.rawAttributes?.rain_probability) ??
      weatherForecast[0]?.precipitationProbability ??
      toNumberOrUndefined(liveWeather?.precipitation) ??
      weatherForecast[0]?.precipitation ??
      12;
    const weatherPrecipitationAmount =
      toNumberOrUndefined(liveWeather?.rawAttributes?.precipitation) ??
      weatherForecast[0]?.precipitationAmount ??
      weatherForecast[0]?.precipitation ??
      0;
    const weatherHumidity =
      toNumberOrUndefined(liveWeather?.humidity) ??
      toNumberOrUndefined(liveWeather?.rawAttributes?.humidity) ??
      toNumberOrUndefined(liveWeather?.rawAttributes?.relative_humidity) ??
      weatherForecast[0]?.humidity ??
      58;
    const weatherWindSpeed =
      toNumberOrUndefined(liveWeather?.windSpeed) ??
      toNumberOrUndefined(liveWeather?.rawAttributes?.wind_speed) ??
      toNumberOrUndefined(liveWeather?.rawAttributes?.native_wind_speed) ??
      weatherForecast[0]?.windSpeed ??
      14;
    const weatherWindGustSpeed =
      toNumberOrUndefined(liveWeather?.rawAttributes?.wind_gust_speed) ??
      weatherForecast[0]?.windGustSpeed ??
      weatherWindSpeed;
    const weatherWindBearing =
      toNumberOrStringOrUndefined(liveWeather?.rawAttributes?.wind_bearing) ??
      weatherForecast[0]?.windBearing ??
      '--';
    const weatherPressure =
      toNumberOrUndefined(liveWeather?.rawAttributes?.pressure) ??
      weatherForecast[0]?.pressure ??
      1019;
    const weatherDewPoint =
      toNumberOrUndefined(liveWeather?.rawAttributes?.dew_point) ??
      toNumberOrUndefined(liveWeather?.rawAttributes?.native_dew_point) ??
      weatherForecast[0]?.dewPoint ??
      weatherTemp - 2;
    const weatherCloudCoverage =
      toNumberOrUndefined(liveWeather?.rawAttributes?.cloud_coverage) ??
      weatherForecast[0]?.cloudCoverage ??
      0;
    const weatherUvIndex =
      toNumberOrUndefined(liveWeather?.rawAttributes?.uv_index) ??
      weatherForecast[0]?.uvIndex ??
      3;
    const weatherVisibility =
      toNumberOrUndefined(liveWeather?.rawAttributes?.visibility) ??
      30;
    const sunAttributes = haStates['sun.sun']?.rawAttributes;
    const mockSunrise = useMockWeather ? new Date() : undefined;
    mockSunrise?.setHours(6, 58, 0, 0);
    const mockSunset = useMockWeather ? new Date() : undefined;
    mockSunset?.setHours(20, 21, 0, 0);
    const weatherSunrise =
      sunAttributes?.next_rising ??
      liveWeather?.rawAttributes?.sunrise ??
      liveWeather?.rawAttributes?.next_rising ??
      mockSunrise?.toISOString();
    const weatherSunset =
      sunAttributes?.next_setting ??
      liveWeather?.rawAttributes?.sunset ??
      liveWeather?.rawAttributes?.next_setting ??
      mockSunset?.toISOString();

    return {
      userName,
      wifiDownloadMbps: wifiValue,
      weather: {
        available: hasLiveWeather || useMockWeather,
        source: weatherSource,
        location: weatherLocation,
        condition: weatherCondition,
        temperature: weatherTemp,
        feelsLike: weatherFeelsLike ?? weatherTemp,
        high: weatherHigh,
        low: weatherLow,
        precipitation: weatherPrecipitation,
        precipitationAmount: weatherPrecipitationAmount,
        pressure: weatherPressure,
        dewPoint: weatherDewPoint,
        cloudCoverage: weatherCloudCoverage,
        windGustSpeed: weatherWindGustSpeed,
        windBearing: weatherWindBearing,
        humidity: weatherHumidity,
        windSpeed: weatherWindSpeed,
        uvIndex: weatherUvIndex,
        visibility: weatherVisibility,
        temperatureUnit: weatherTemperatureUnit,
        precipitationUnit: weatherPrecipitationUnit,
        pressureUnit: weatherPressureUnit,
        visibilityUnit: weatherVisibilityUnit,
        windSpeedUnit: weatherWindSpeedUnit,
        sunrise: weatherSunrise as string | number | undefined,
        sunset: weatherSunset as string | number | undefined,
        forecast: weatherForecast,
        rawAttributes: liveWeather?.rawAttributes,
      },
      lamp: {
        name:
          (typeof liveLamp?.rawAttributes?.friendly_name === 'string'
            ? liveLamp.rawAttributes.friendly_name
            : undefined) ?? 'Lamp',
        isOn: resolvedLampOn,
        brightness: lampBrightnessValue,
        status: lampStatus,
        hsColor: lampHsValue,
        colorTemp: lampColorTempValue,
        activeTimerEnd: lampTimerEnd,
      },
      climate: {
        name:
          (typeof climateRawAttributes?.friendly_name === 'string'
            ? climateRawAttributes.friendly_name
            : undefined) ?? 'Air Conditioner',
        mode: String(climateModeValue || 'auto').toUpperCase(),
        isOn: resolvedClimateOn,
        status: climateStatus,
        currentTemp: climateCurrentValue,
        targetTemp: climateTargetValue,
        minTemp: climateMinValue,
        maxTemp: climateMaxValue,
        targetTempLow: climateTargetTempLow,
        targetTempHigh: climateTargetTempHigh,
        targetTempStep: climateTargetTempStep,
        hvacModes: climateHvacModes,
        hvacAction: climateHvacAction,
        fanMode: climateFanModeValue,
        fanModes: climateFanModes,
        supportedFeatures: climateSupportedFeatures,
        precision:
          typeof liveClimate?.precision === 'number'
            ? liveClimate.precision
            : toNumberOrUndefined(climateRawAttributes?.precision),
        currentHumidity: climateCurrentHumidity,
        targetHumidity: climateTargetHumidityValue,
        minHumidity: climateMinHumidity,
        maxHumidity: climateMaxHumidity,
        targetHumidityStep: climateTargetHumidityStep,
        presetMode: climatePresetModeValue,
        presetModes: climatePresetModes,
        swingMode: climateSwingModeValue,
        swingModes: climateSwingModes,
        swingHorizontalMode: climateSwingHorizontalModeValue,
        swingHorizontalModes: climateSwingHorizontalModes,
        temperatureUnit:
          liveClimate?.unit ??
          (typeof climateRawAttributes?.temperature_unit === 'string'
            ? climateRawAttributes.temperature_unit
            : '\u00B0C'),
        rawAttributes: climateRawAttributes,
      },
      speaker: {
        isPlaying: speakerPowered ? speakerPlaying : false,
        status: speakerPowered ? (speakerPlaying ? 'playing' : 'paused') : 'off',
        progress: speakerProgress,
        positionSeconds: 0,
        durationSeconds: 0,
        volumeLevel: speakerVolume,
        muted: speakerMuted,
        supportsSeek: true,
        supportsVolume: true,
        supportsMute: true,
        supportsVolumeStep: true,
        supportsNextTrack: true,
        supportsPreviousTrack: true,
        supportsPower: true,
        supportsShuffle: true,
        supportsRepeat: true,
        supportsSelectSource: true,
        supportsGrouping: true,
        supportsStop: true,
        supportsClearPlaylist: true,
        supportsSelectSoundMode: true,
        supportsPlayMedia: true,
        supportsBrowseMedia: true,
        supportsSearchMedia: true,
        supportsAnnounce: true,
        supportsEnqueue: true,
        shuffleEnabled: speakerShuffleEnabled,
        repeatMode: speakerRepeatMode,
        soundMode: 'Musica',
        soundModeList: ['Musica', 'Film', 'Notte', 'Voce'],
        volumeStep: 0.05,
        rawAttributes: {
          media_content_id: 'mock://media/lofi-focus-session',
          media_content_type: 'music',
          media_title: 'Sessione focus lo-fi',
          media_artist: 'Dashboard Studio',
          media_album_name: 'Album demo',
          app_name: 'Music Assistant',
          source: speakerSelectedOutputDeviceId,
          sound_mode: 'Musica',
          sound_mode_list: ['Musica', 'Film', 'Notte', 'Voce'],
          volume_step: 0.05,
          media_library: [
            {
              title: 'Sessione focus lo-fi',
              subtitle: 'Dashboard Studio',
              media_content_id: 'mock://media/lofi-focus-session',
              media_content_type: 'music',
            },
            {
              title: 'Playlist serale',
              subtitle: 'Playlist',
              media_content_id: 'mock://playlist/evening',
              media_content_type: 'playlist',
            },
          ],
        },
        outputDevices: speakerOutputDevices,
        selectedOutputDeviceId: speakerSelectedOutputDeviceId,
        multiroomDevices: speakerMultiroomDevices,
      },
      favorites,
      livingRoomMasterOff: !resolvedLampOn && !resolvedClimateOn,
    };
  }, [
    climateCurrentTemp,
    climateFanMode,
    climateMode,
    climateOn,
    climatePresetMode,
    climateSwingHorizontalMode,
    climateSwingMode,
    climateTargetRange,
    climateTargetHumidity,
    climateTargetTemp,
    haConnected,
    haStates,
    favorites,
    lampBrightness,
    lampColorTemp,
    lampHsColor,
    lampOn,
    lampTimerEnd,
    speakerMuted,
    speakerMultiroomDevices,
    speakerOutputDevices,
    speakerPowered,
    speakerProgress,
    speakerRepeatMode,
    speakerSelectedOutputDeviceId,
    speakerShuffleEnabled,
    speakerVolume,
    speakerPlaying,
    userName,
    resolvedWeatherEntityId,
    liveWeatherForecast,
    weatherForecastType,
    allowMockFallback,
  ]);

  return {
    state,
    actions: {
      adjustLampBrightness,
      autoAdjustClimate,
      cancelLampTimer,
      decreaseClimateTarget,
      increaseClimateTarget,
      nudgeClimateCurrent,
      setLampColorTemp,
      setLampBrightness,
      setLampHsColor,
      setLampTimer,
      setUserName,
      setClimateFanMode,
      setClimateMode,
      setClimatePresetMode,
      setClimateSwingHorizontalMode,
      setClimateSwingMode,
      setClimateTarget,
      setClimateTargetHumidity,
      setClimateTargetRange,
      toggleClimatePower,
      toggleFavoritePower,
      toggleLamp,
      nextSpeakerTrack,
      previousSpeakerTrack,
      setSpeakerProgress: setSpeakerProgressValue,
      setSpeakerVolume: setSpeakerVolumeValue,
      setSpeakerOutputDevice,
      toggleSpeakerGroupMember,
      cycleSpeakerRepeatMode,
      toggleSpeakerMute,
      toggleSpeakerShuffle,
      toggleSpeakerPower,
      toggleSpeakerPlayback,
    },
  };
}

export default useDashboardState;
