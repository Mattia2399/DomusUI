import React from 'react';
import { AlertCircle, CalendarDays, Clock3, Cloud, CloudFog, CloudLightning, CloudMoon, CloudOff, CloudRain, CloudSnow, CloudSun, Droplets, Gauge, MapPin, Moon, Sun, Sunrise, Thermometer, Umbrella, Wind, type LucideIcon } from 'lucide-react';
import type { DashboardStateShape } from '../../../../hooks/useDashboardState';
import { extractForecastPayloadFromWeatherApiResponse, parseForecastEntries } from '../../../../utils/weatherForecastEntries';
import type { MockWeatherForecastEntry } from '../../../../types/ha';
import { useI18n } from '../../../../i18n/I18nProvider';
import { usePanelSpecTranslations } from '../../../../i18n/panelSpecTranslations';
import { getWeatherBackdrop, getWeatherConditionLabel } from '../../../../utils/weatherPresentation';
import { usePanelServices, type PanelApiCall } from '../panelServicesContext';
import type { PanelEntry, PanelSpec } from '../registry';
import { accentOf } from './shared';
import './weather.css';

/*
 * The weather: the temperature large, an alert if the entity has one, the next hours with
 * their chance of rain, the days on one scale, and a tile for each detail the entity gives.
 * What is behind follows the sky. Nothing here is made up: a tile with no data does not exist.
 */

type Weather = DashboardStateShape['weather'];
type Entry = Weather['forecast'][number];
type ForecastType = 'daily' | 'hourly' | 'twice_daily';

export type WeatherPanelInput = {
  weather: Weather;
  /** The entity, to ask for the hours and the days whichever the card uses. */
  entityId?: string | null;
  /** The sun is down: what the entity says says nothing about the hour. */
  isNight?: boolean;
  updatedAt?: number | null;
  unit?: 'C' | 'F';
  forecastDays?: number;
  forecastType?: ForecastType;
  conditionOverride?: string;
  showWind?: boolean;
};

export type WeatherSky = 'day' | 'cloud' | 'rain' | 'night' | 'storm' | 'snow';

export function weatherSkyOf(condition: string, isNight = false): WeatherSky {
  const backdrop = getWeatherBackdrop(condition);
  if (backdrop === 'rainy') return 'rain';
  if (backdrop === 'storm') return 'storm';
  if (backdrop === 'snowy') return 'snow';
  if (backdrop === 'night' || isNight) return 'night';
  return backdrop === 'sunny' || backdrop === 'partly-cloudy' ? 'day' : 'cloud';
}

function iconOf(condition: string, isNight = false): LucideIcon {
  const key = condition.trim().toLowerCase();
  if (key === 'clear-night') return Moon;
  if (key === 'sunny') return isNight ? Moon : Sun;
  if (key === 'partlycloudy') return isNight ? CloudMoon : CloudSun;
  if (key === 'fog') return CloudFog;
  if (key === 'windy' || key === 'windy-variant') return Wind;
  const backdrop = getWeatherBackdrop(condition);
  if (backdrop === 'rainy') return CloudRain;
  if (backdrop === 'storm') return CloudLightning;
  if (backdrop === 'snowy') return CloudSnow;
  return Cloud;
}

const asNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const firstNumber = (attributes: Record<string, unknown> | undefined, keys: string[]) => {
  for (const key of keys) {
    const value = asNumber(attributes?.[key]);
    if (value !== undefined) return value;
  }
  return undefined;
};

/** An alert, when the integration publishes one: Home Assistant has no standard for it. */
function readAlert(attributes: Record<string, unknown> | undefined) {
  const raw = attributes?.alert ?? attributes?.alerts ?? attributes?.warning ?? attributes?.warnings;
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (typeof first === 'string') return first.trim() ? { title: first.trim(), text: null } : null;
  if (!first || typeof first !== 'object') return null;
  const alert = first as Record<string, unknown>;
  const title = [alert.title, alert.headline, alert.event, alert.name].find((value) => typeof value === 'string' && value.trim()) as string | undefined;
  const text = [alert.description, alert.text, alert.message].find((value) => typeof value === 'string' && value.trim()) as string | undefined;
  return title || text ? { title: title ?? text ?? '', text: title ? text ?? null : null } : null;
}

/** What Home Assistant says of an hour or a day, as the panel reads it; without a temperature it says nothing. */
function toEntry(raw: MockWeatherForecastEntry): Entry[] {
  if (typeof raw.temperature !== 'number') return [];
  return [
    {
      label: '',
      datetime: raw.datetime,
      isDaytime: raw.isDaytime,
      condition: raw.condition ?? '',
      high: raw.temperature,
      low: raw.templow ?? raw.temperature,
      precipitation: raw.precipitationProbability ?? raw.precipitation ?? 0,
      precipitationAmount: raw.precipitation,
      precipitationProbability: raw.precipitationProbability,
      apparentTemperature: raw.apparentTemperature,
      cloudCoverage: raw.cloudCoverage,
      dewPoint: raw.dewPoint,
      humidity: raw.humidity,
      pressure: raw.pressure,
      uvIndex: raw.uvIndex,
      windBearing: raw.windBearing,
      windGustSpeed: raw.windGustSpeed,
      windSpeed: raw.windSpeed,
    },
  ];
}

async function askForecast(callApi: PanelApiCall, entityId: string, type: ForecastType) {
  const attempts: Array<Record<string, unknown>> = [
    { type: 'weather/get_forecasts', entity_ids: [entityId], forecast_type: type },
    { type: 'call_service', domain: 'weather', service: 'get_forecasts', service_data: { type }, target: { entity_id: [entityId] }, return_response: true },
  ];
  for (const message of attempts) {
    const response = await callApi<unknown>(message, { reportError: false });
    if (response === null) continue;
    const entries = parseForecastEntries(extractForecastPayloadFromWeatherApiResponse(response, entityId));
    if (entries.length > 0) return entries.flatMap(toEntry);
  }
  return [];
}

/** The hours and the days: the card has only those it was set to, so the panel asks for both. */
function useForecasts(weather: Weather, entityId: string | null | undefined, type: ForecastType) {
  const callApi = usePanelServices()?.callApi;
  const [live, setLive] = React.useState<{ hourly: Entry[]; daily: Entry[] }>({ hourly: [], daily: [] });
  React.useEffect(() => {
    if (!callApi || !entityId) return undefined;
    let stale = false;
    (['hourly', 'daily'] as const).forEach((kind) => {
      void askForecast(callApi, entityId, kind)
        .then((entries) => {
          if (!stale) setLive((current) => ({ ...current, [kind]: entries }));
        })
        .catch(() => undefined);
    });
    return () => {
      stale = true;
    };
  }, [callApi, entityId]);
  return {
    hourly: live.hourly.length > 0 ? live.hourly : type === 'hourly' ? weather.forecast : [],
    daily: live.daily.length > 0 ? live.daily : type === 'daily' ? weather.forecast : [],
  };
}

/** Only the demo, which has no entity to ask. */
function demoForecasts(weather: Weather) {
  const base = Math.round(weather.temperature);
  const now = new Date();
  const rain = [0, 0, 10, 20, 30, 50, 70, 80, 60, 20, 10, 0];
  const hourly: Entry[] = rain.map((chance, index) => {
    const date = new Date(now);
    date.setHours(now.getHours() + index, 0, 0, 0);
    return { label: '', datetime: date.toISOString(), condition: chance >= 50 ? 'rainy' : chance >= 20 ? 'cloudy' : weather.condition, high: base - Math.round(index / 3), low: base, precipitation: chance, precipitationProbability: chance };
  });
  const days: Array<[string, number, number, number]> = [[weather.condition, -6, 2, 40], ['rainy', -7, -2, 80], ['cloudy', -6, -1, 20], ['sunny', -5, 3, 0], ['sunny', -4, 4, 0], ['partlycloudy', -5, 2, 10], ['rainy', -6, -1, 60]];
  const daily: Entry[] = days.map(([condition, low, high, chance], index) => {
    const date = new Date(now);
    date.setDate(now.getDate() + index);
    return { label: '', datetime: date.toISOString(), condition, high: base + high, low: base + low, precipitation: chance, precipitationProbability: chance };
  });
  return { hourly, daily };
}

const MIN_CHANCE = 20;

function useWeatherSpec({ weather, entityId, isNight = false, updatedAt, unit = 'C', forecastDays, forecastType = 'daily', conditionOverride, showWind = true }: WeatherPanelInput): PanelSpec {
  const { t, locale } = useI18n();
  const sp = usePanelSpecTranslations();
  const asked = useForecasts(weather, entityId, forecastType);
  const isMock = weather.source === 'mock';
  const { hourly, daily } = isMock ? demoForecasts(weather) : asked;

  const condition = conditionOverride ?? weather.condition;
  const Icon = iconOf(condition, isNight);
  const sky = weatherSkyOf(condition, isNight);
  const degrees = (value: number) => `${Math.round(unit === 'F' ? value * 1.8 + 32 : value)}°`;
  const base = {
    owner: 'weather',
    name: sp.t('weatherTitle'),
    icon: <Icon size={23} strokeWidth={2} />,
    lit: true,
    accent: accentOf('10 132 255'),
    tint: false,
    heroKind: 'data' as const,
    hero: null,
    shortcuts: [],
  };

  if (!weather.available) {
    const offline = weather.source === 'offline';
    return {
      ...base,
      lit: false,
      icon: <CloudOff size={23} strokeWidth={2} />,
      status: weather.location,
      free: (
        <div className="panel-weather is-empty">
          <span className="panel-weather-off" aria-hidden="true">
            <CloudOff size={26} strokeWidth={1.6} />
          </span>
          <h3>{offline ? t('controls.weather.unavailable') : t('controls.weather.notConfigured')}</h3>
          <p>{offline ? t('controls.weather.offlineDescription') : t('controls.weather.selectEntityDescription')}</p>
        </div>
      ),
    };
  }

  const attrs = weather.rawAttributes;
  const clock = (value: unknown) => {
    if ((typeof value !== 'string' && typeof value !== 'number') || value === '') return undefined;
    const date = new Date(typeof value === 'number' && value < 1e12 ? value * 1000 : value);
    return Number.isNaN(date.getTime()) ? undefined : new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date);
  };
  const today = daily[0];
  const feels = firstNumber(attrs, ['apparent_temperature', 'feels_like']) ?? hourly[0]?.apparentTemperature ?? today?.apparentTemperature ?? (isMock ? weather.feelsLike : undefined);
  const humidity = firstNumber(attrs, ['humidity', 'relative_humidity']) ?? hourly[0]?.humidity ?? (isMock ? weather.humidity : undefined);
  const dewPoint = firstNumber(attrs, ['dew_point']) ?? hourly[0]?.dewPoint ?? (isMock ? weather.dewPoint : undefined);
  const windSpeed = firstNumber(attrs, ['wind_speed', 'native_wind_speed']) ?? hourly[0]?.windSpeed ?? (isMock ? weather.windSpeed : undefined);
  const windGust = firstNumber(attrs, ['wind_gust_speed']) ?? hourly[0]?.windGustSpeed ?? (isMock ? weather.windGustSpeed : undefined);
  const windBearing = attrs?.wind_bearing ?? hourly[0]?.windBearing;
  const uv = firstNumber(attrs, ['uv_index']) ?? hourly[0]?.uvIndex ?? today?.uvIndex ?? (isMock ? weather.uvIndex : undefined);
  const pressure = firstNumber(attrs, ['pressure']) ?? hourly[0]?.pressure ?? (isMock ? weather.pressure : undefined);
  const sunrise = clock(weather.sunrise ?? attrs?.sunrise ?? attrs?.next_rising);
  const sunset = clock(weather.sunset ?? attrs?.sunset ?? attrs?.next_setting);
  const rainToday = today?.precipitationAmount;
  const alert = readAlert(attrs);

  const nowAt = Date.now();
  const hours = hourly.filter((entry) => !entry.datetime || new Date(entry.datetime).getTime() > nowAt - 3_600_000).slice(0, 12);
  const days = daily.filter((entry) => Number.isFinite(entry.high)).slice(0, Math.max(1, Math.min(7, forecastDays ?? 7)));
  const scaleLow = Math.min(...days.map((entry) => entry.low), weather.temperature);
  const scaleHigh = Math.max(...days.map((entry) => entry.high), weather.temperature);
  const scaleOf = (value: number) => ((value - scaleLow) / (scaleHigh - scaleLow || 1)) * 100;
  const hourName = new Intl.DateTimeFormat(locale, { hour: 'numeric' });
  const dayName = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const chanceOf = (entry: Entry) => entry.precipitationProbability;
  const firstRain = hours.find((entry) => (chanceOf(entry) ?? 0) >= 50 && entry.datetime);
  const summary = firstRain?.datetime ? sp.t('weatherRainFrom', { hour: hourName.format(new Date(firstRain.datetime)) }) : sp.t('weatherNextHours');

  const line = [today ? `${sp.t('weatherMax')} ${degrees(today.high)}` : null, today ? `${sp.t('weatherMin')} ${degrees(today.low)}` : null, feels !== undefined ? `${sp.t('weatherFeels').toLocaleLowerCase(locale)} ${degrees(feels)}` : null].filter(Boolean).join(' · ');

  const uvWord = uv === undefined ? '' : t(uv <= 2 ? 'controls.weather.uv.low' : uv <= 5 ? 'controls.weather.uv.moderate' : uv <= 7 ? 'controls.weather.uv.high' : uv <= 10 ? 'controls.weather.uv.veryHigh' : 'controls.weather.uv.extreme');
  const tiles: Array<{ key: string; Icon: LucideIcon; title: string; value: string; note?: string; bar?: number }> = [];
  if (feels !== undefined) tiles.push({ key: 'feels', Icon: Thermometer, title: sp.t('weatherFeels'), value: degrees(feels), note: Math.abs(feels - weather.temperature) < 1 ? sp.t('weatherFeelsSame') : undefined });
  if (humidity !== undefined) tiles.push({ key: 'humidity', Icon: Droplets, title: sp.t('weatherHumidity'), value: `${Math.round(humidity)}%`, note: dewPoint !== undefined ? sp.t('weatherDew', { value: degrees(dewPoint) }) : undefined });
  if (showWind && windSpeed !== undefined) {
    const from = typeof windBearing === 'string' || typeof windBearing === 'number' ? String(windBearing) : null;
    tiles.push({ key: 'wind', Icon: Wind, title: t('controls.weather.module.wind'), value: `${Math.round(windSpeed)} ${weather.windSpeedUnit ?? 'km/h'}`, note: [from ? sp.t('weatherWindFrom', { from: /^\d/.test(from) ? `${Math.round(Number(from))}°` : from }) : null, windGust !== undefined ? sp.t('weatherGusts', { value: Math.round(windGust) }) : null].filter(Boolean).join(' · ') || undefined });
  }
  if (uv !== undefined) tiles.push({ key: 'uv', Icon: Sun, title: t('controls.weather.module.uv'), value: String(Math.round(uv)), note: uvWord, bar: Math.min(100, (Math.max(0, uv) / 11) * 100) });
  if (sunrise && sunset) tiles.push({ key: 'sun', Icon: Sunrise, title: t('controls.weather.module.sun'), value: isNight ? sunrise : sunset, note: isNight ? sp.t('weatherSunset', { time: sunset }) : sp.t('weatherSunrise', { time: sunrise }) });
  if (typeof rainToday === 'number') tiles.push({ key: 'rain', Icon: Umbrella, title: sp.t('weatherRain'), value: `${Math.round(rainToday * 10) / 10} ${weather.precipitationUnit ?? 'mm'}`, note: sp.t('weatherRainToday') });
  if (pressure !== undefined) tiles.push({ key: 'pressure', Icon: Gauge, title: t('controls.weather.module.pressure'), value: `${Math.round(pressure)} ${weather.pressureUnit ?? 'hPa'}`, note: t(pressure < 1005 ? 'controls.weather.pressure.low' : pressure > 1025 ? 'controls.weather.pressure.high' : 'controls.weather.pressure.stable') });

  return {
    ...base,
    status: updatedAt ? sp.t('weatherUpdated', { time: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(updatedAt) }) : getWeatherConditionLabel(condition, t),
    free: (
      <div className="panel-weather" data-sky={sky}>
        <section className="panel-weather-hero">
          <p className="panel-weather-place">
            <MapPin size={13} strokeWidth={2.2} aria-hidden="true" />
            {weather.location}
          </p>
          <b className="panel-weather-temp">{degrees(weather.temperature)}</b>
          <b className="panel-weather-cond">{getWeatherConditionLabel(condition, t)}</b>
          {line ? <span>{line}</span> : null}
        </section>
        <div className="panel-weather-rest">
          {alert ? (
            <div className="panel-weather-alert" role="status">
              <AlertCircle size={18} strokeWidth={2.2} aria-hidden="true" />
              <span>
                <b>{alert.title}</b>
                {alert.text ? ` ${alert.text}` : null}
              </span>
            </div>
          ) : null}
          {hours.length > 0 ? (
            <section className="panel-weather-card" aria-label={sp.t('weatherNextHours')}>
              <h3>
                <Clock3 size={14} strokeWidth={2.2} aria-hidden="true" />
                {summary}
              </h3>
              <div className="panel-weather-hours">
                {hours.map((entry, index) => {
                  const HourIcon = iconOf(entry.condition, entry.isDaytime === false);
                  const chance = chanceOf(entry);
                  return (
                    <div key={entry.datetime ?? index} className={index === 0 ? 'is-now' : undefined}>
                      <span>{index === 0 ? sp.t('weatherNow') : entry.datetime ? hourName.format(new Date(entry.datetime)) : entry.label}</span>
                      <HourIcon size={20} strokeWidth={1.8} aria-hidden="true" />
                      <em>{chance !== undefined && chance >= MIN_CHANCE ? `${Math.round(chance)}%` : ' '}</em>
                      <b>{degrees(entry.high)}</b>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
          {days.length > 0 ? (
            <section className="panel-weather-card" aria-label={sp.t('weatherNextDays', { n: days.length })}>
              <h3>
                <CalendarDays size={14} strokeWidth={2.2} aria-hidden="true" />
                {sp.t('weatherNextDays', { n: days.length })}
              </h3>
              <div className="panel-weather-days">
                {days.map((entry, index) => {
                  const DayIcon = iconOf(entry.condition);
                  const chance = chanceOf(entry);
                  const left = scaleOf(entry.low);
                  const dot = index === 0 && weather.temperature >= entry.low && weather.temperature <= entry.high ? scaleOf(weather.temperature) : null;
                  return (
                    <div key={entry.datetime ?? index} className={index === 0 ? 'is-now' : undefined}>
                      <b>{index === 0 ? sp.t('weatherToday') : entry.datetime ? dayName.format(new Date(entry.datetime)) : entry.label}</b>
                      <span className="panel-weather-day-icon">
                        <DayIcon size={18} strokeWidth={1.8} aria-hidden="true" />
                        {chance !== undefined && chance >= MIN_CHANCE ? <em>{Math.round(chance)}%</em> : null}
                      </span>
                      <span className="panel-weather-low">{degrees(entry.low)}</span>
                      <span className="panel-weather-scale" aria-hidden="true">
                        <i style={{ left: `${left.toFixed(1)}%`, width: `${Math.max(4, scaleOf(entry.high) - left).toFixed(1)}%` }} />
                        {dot !== null ? <u style={{ left: `${dot.toFixed(1)}%` }} /> : null}
                      </span>
                      <span className="panel-weather-high">{degrees(entry.high)}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
          {tiles.length > 0 ? (
            <div className="panel-weather-tiles">
              {tiles.map((tile) => (
                <section key={tile.key} className="panel-weather-card" aria-label={tile.title}>
                  <h3 className="is-caps">
                    <tile.Icon size={13} strokeWidth={2.2} aria-hidden="true" />
                    {tile.title}
                  </h3>
                  <b>{tile.value}</b>
                  {tile.bar !== undefined ? (
                    <span className="panel-weather-uv" aria-hidden="true">
                      <u style={{ left: `${tile.bar.toFixed(1)}%` }} />
                    </span>
                  ) : null}
                  {tile.note ? <span>{tile.note}</span> : null}
                </section>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    ),
  };
}

export const weatherEntry: PanelEntry<WeatherPanelInput> = { useSpec: useWeatherSpec };
