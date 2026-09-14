import React from 'react';
import { CloudOff, Droplets, Gauge, SunMedium, Sunrise, Sunset, ThermometerSun, Wind } from 'lucide-react';
import type { DashboardStateShape } from '../../hooks/useDashboardState';
import { useI18n } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n/translations';
import { getWeatherBackdrop, getWeatherConditionLabel } from '../../utils/weatherPresentation';
import { AnimatedWeatherIcon } from '../widgets/AnimatedWeatherIcon';
import { CONTEXT_PANEL_LAYOUT } from './layoutClasses';

type WeatherControlsProps = {
  weather: DashboardStateShape['weather'];
  unit?: 'C' | 'F';
  forecastDays?: number;
  forecastDensity?: 'comfortable' | 'compact';
  forecastType?: 'daily' | 'hourly' | 'twice_daily';
  conditionOverride?: string;
  showPrecipitation?: boolean;
  showWind?: boolean;
};

type ForecastEntry = DashboardStateShape['weather']['forecast'][number];

const toFahrenheit = (value: number) => value * 1.8 + 32;

function toNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function readNumber(attributes: Record<string, unknown> | undefined, keys: string[]) {
  for (const key of keys) {
    const value = toNumber(attributes?.[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function readValue(attributes: Record<string, unknown> | undefined, keys: string[]) {
  for (const key of keys) {
    const value = attributes?.[key];
    if ((typeof value === 'string' && value.trim()) || (typeof value === 'number' && Number.isFinite(value))) return value;
  }
  return undefined;
}

function forecastNumber(forecast: ForecastEntry[], key: keyof ForecastEntry) {
  for (const entry of forecast) {
    const value = toNumber(entry[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function formatClock(value: unknown, locale: string) {
  if ((typeof value !== 'string' && typeof value !== 'number') || value === '') return undefined;
  const date = new Date(typeof value === 'number' && value < 1e12 ? value * 1000 : value);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date);
}

function forecastLabel(entry: ForecastEntry, index: number, type: WeatherControlsProps['forecastType'], locale: string) {
  if (entry.datetime) {
    const date = new Date(entry.datetime);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat(locale, type === 'hourly' ? { hour: '2-digit' } : { weekday: 'short' }).format(date);
    }
  }
  return entry.label?.trim() || String(index + 1);
}

function uvDescriptor(value: number, t: (key: TranslationKey) => string) {
  if (value <= 2) return t('controls.weather.uv.low');
  if (value <= 5) return t('controls.weather.uv.moderate');
  if (value <= 7) return t('controls.weather.uv.high');
  if (value <= 10) return t('controls.weather.uv.veryHigh');
  return t('controls.weather.uv.extreme');
}

function humidityDescriptor(value: number, t: (key: TranslationKey) => string) {
  if (value < 30) return t('controls.weather.humidity.low');
  if (value > 65) return t('controls.weather.humidity.high');
  return t('controls.weather.humidity.optimal');
}

function pressureDescriptor(value: number, t: (key: TranslationKey) => string) {
  if (value < 1005) return t('controls.weather.pressure.low');
  if (value > 1025) return t('controls.weather.pressure.high');
  return t('controls.weather.pressure.stable');
}

function bearingDegrees(value: string | number | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return 0;
  const numeric = Number.parseFloat(value);
  if (Number.isFinite(numeric)) return numeric;
  const points: Record<string, number> = {
    N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
    E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
    S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
    W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
  };
  return points[value.trim().toUpperCase()] ?? 0;
}

function bearingLabel(value: string | number | undefined) {
  if (typeof value === 'string' && value.trim() && !Number.isFinite(Number.parseFloat(value))) {
    return value.trim().toUpperCase();
  }
  if (value === undefined) return '--';
  const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const normalized = ((bearingDegrees(value) % 360) + 360) % 360;
  return labels[Math.round(normalized / 45) % labels.length];
}

function TemperatureTrend({ entries, unit, type, locale, title, granularity }: {
  entries: ForecastEntry[]; unit: 'C' | 'F'; type: WeatherControlsProps['forecastType']; locale: string; title: string; granularity: string;
}) {
  const values = entries.map((entry) => unit === 'F' ? toFahrenheit(entry.high) : entry.high);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const points = values.map((value, index) => ({
    x: entries.length === 1 ? 160 : 16 + (index / (entries.length - 1)) * 288,
    y: 54 - ((value - min) / span) * 38,
  }));
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  return (
    <section className="dashboard-content-surface col-span-2 grid aspect-[2.08/1] min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[26px] p-4" aria-label={title}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2"><ThermometerSun size={18} className="text-orange-400" /><h3 className="text-sm font-semibold">{title}</h3></div>
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ui-text-tertiary)]">{granularity}</span>
      </div>
      <div className="min-h-0 pt-2">
        <svg viewBox="0 0 320 64" preserveAspectRatio="xMidYMid meet" className="h-full min-h-0 w-full overflow-visible" aria-hidden="true">
          <defs><linearGradient id="weather-temperature-line" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#ff9f0a" /><stop offset="1" stopColor="#ffd60a" /></linearGradient></defs>
          {points.map((point, index) => <line key={`guide-${index}`} x1={point.x} x2={point.x} y1="8" y2="60" stroke="currentColor" strokeOpacity="0.09" strokeDasharray="3 4" />)}
          <path d={path} fill="none" stroke="url(#weather-temperature-line)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {points.map((point, index) => <circle key={`point-${index}`} cx={point.x} cy={point.y} r="1.8" fill="#fff" stroke="#ffb000" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />)}
        </svg>
      </div>
      <div className="grid pt-1" style={{ gridTemplateColumns: `repeat(${entries.length}, minmax(0, 1fr))` }}>
          {entries.map((entry, index) => <div key={`${entry.datetime ?? entry.label}-${index}`} className="min-w-0 text-center"><p className="truncate text-[10px] capitalize text-[color:var(--ui-text-tertiary)]">{forecastLabel(entry, index, type, locale)}</p><p className="mt-0.5 text-xs font-semibold">{Math.round(values[index])}°</p></div>)}
      </div>
    </section>
  );
}

function HumidityModule({ value, title, descriptor }: { value: number; title: string; descriptor: string }) {
  return (
    <section className="dashboard-content-surface relative isolate grid aspect-square min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[clamp(1.15rem,14cqw,1.625rem)] p-[clamp(0.65rem,8cqw,1rem)]" style={{ containerType: 'inline-size' }}>
      <div className="absolute inset-x-0 bottom-0 -z-10 bg-cyan-400/75 transition-[height] duration-500" style={{ height: `${Math.min(100, Math.max(0, value))}%` }}>
        <svg className="weather-humidity-wave absolute left-0 top-0 h-[clamp(0.55rem,7cqw,0.9rem)] w-[200%] text-cyan-400/75" viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden="true"><path d="M0 8 Q12.5 0 25 8 T50 8 T75 8 T100 8 T125 8 T150 8 T175 8 T200 8 V14 H0Z" fill="currentColor" /></svg>
        <svg className="weather-humidity-wave weather-humidity-wave-secondary absolute left-0 top-0 h-[clamp(0.45rem,6cqw,0.75rem)] w-[200%] text-cyan-300/45" viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden="true"><path d="M0 7 Q12.5 14 25 7 T50 7 T75 7 T100 7 T125 7 T150 7 T175 7 T200 7 V14 H0Z" fill="currentColor" /></svg>
      </div>
      <div className="flex min-w-0 items-center gap-[clamp(0.3rem,4cqw,0.5rem)]"><Droplets className="h-[clamp(0.9rem,11cqw,1.125rem)] w-[clamp(0.9rem,11cqw,1.125rem)] shrink-0 text-cyan-400" /><h3 className="truncate text-[clamp(0.68rem,8cqw,0.875rem)] font-semibold">{title}</h3></div>
      <div />
      <div className="min-w-0"><p className="text-[clamp(1.5rem,21cqw,2.15rem)] font-semibold leading-[0.95]">{Math.round(value)}%</p><p className="mt-[clamp(0.15rem,2cqw,0.3rem)] truncate text-[clamp(0.58rem,7cqw,0.75rem)] opacity-75">{descriptor}</p></div>
    </section>
  );
}

function PressureModule({ value, unit, title, descriptor }: { value: number; unit: string; title: string; descriptor: string }) {
  const progress = Math.min(1, Math.max(0, (value - 980) / 70));
  return (
    <section className="dashboard-content-surface grid aspect-square min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[clamp(1.15rem,14cqw,1.625rem)] p-[clamp(0.65rem,8cqw,1rem)]" style={{ containerType: 'inline-size' }}>
      <div className="flex min-w-0 items-center gap-[clamp(0.3rem,4cqw,0.5rem)]"><Gauge className="h-[clamp(0.9rem,11cqw,1.125rem)] w-[clamp(0.9rem,11cqw,1.125rem)] shrink-0 text-pink-500" /><h3 className="truncate text-[clamp(0.68rem,8cqw,0.875rem)] font-semibold">{title}</h3></div>
      <div className="relative m-auto h-[clamp(4.2rem,54cqw,5.8rem)] w-[clamp(7rem,88cqw,9.5rem)] self-center"><svg viewBox="0 0 160 92" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true"><path d="M18 78 A62 62 0 0 1 142 78" pathLength="100" fill="none" stroke="var(--ui-fill-secondary)" strokeWidth="12" strokeLinecap="round" /><path d="M18 78 A62 62 0 0 1 142 78" pathLength="100" fill="none" stroke="#ff2d75" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${progress * 100} 100`} /></svg><div className="absolute inset-x-0 top-[48%] text-center"><p className="text-[clamp(1.15rem,17cqw,1.7rem)] font-semibold leading-none">{Math.round(value)}</p><p className="mt-[2cqw] text-[clamp(0.5rem,6cqw,0.6875rem)] text-[color:var(--ui-text-tertiary)]">{unit}</p></div></div>
      <p className="truncate text-center text-[clamp(0.55rem,7cqw,0.75rem)] text-[color:var(--ui-text-secondary)]">{descriptor}</p>
    </section>
  );
}

function UvModule({ value, title, descriptor }: { value: number; title: string; descriptor: string }) {
  const position = Math.min(100, (Math.max(0, value) / 12) * 100);
  return (
    <section className="dashboard-content-surface grid aspect-square min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[clamp(1.15rem,14cqw,1.625rem)] p-[clamp(0.65rem,8cqw,1rem)]" style={{ containerType: 'inline-size' }}>
      <div className="flex min-w-0 items-center gap-[clamp(0.3rem,4cqw,0.5rem)]"><SunMedium className="h-[clamp(0.9rem,11cqw,1.125rem)] w-[clamp(0.9rem,11cqw,1.125rem)] shrink-0 text-fuchsia-500" /><h3 className="truncate text-[clamp(0.68rem,8cqw,0.875rem)] font-semibold">{title}</h3></div>
      <div className="self-center"><p className="text-[clamp(1.55rem,22cqw,2.2rem)] font-semibold leading-none">{value.toFixed(1)}</p><p className="mt-[clamp(0.15rem,2cqw,0.3rem)] truncate text-[clamp(0.58rem,7cqw,0.75rem)] text-[color:var(--ui-text-secondary)]">{descriptor}</p></div>
      <div className="relative h-[clamp(0.3rem,4cqw,0.5rem)] rounded-full bg-gradient-to-r from-green-400 via-yellow-400 to-fuchsia-500"><span className="absolute top-1/2 h-[clamp(0.65rem,8cqw,1rem)] w-[clamp(0.65rem,8cqw,1rem)] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[color:var(--ui-weather-foreground,#fff)] bg-[color:var(--ui-weather-foreground,#fff)] shadow" style={{ left: `${position}%` }} /></div>
    </section>
  );
}

function WindModule({ speed, unit, bearing, title }: { speed: number; unit: string; bearing: string | number | undefined; title: string }) {
  const degrees = bearingDegrees(bearing);
  const direction = bearingLabel(bearing);
  return (
    <section className="dashboard-content-surface grid aspect-square min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[clamp(1.15rem,14cqw,1.625rem)] p-[clamp(0.65rem,8cqw,1rem)]" style={{ containerType: 'inline-size' }}>
      <div className="flex min-w-0 items-center gap-[clamp(0.3rem,4cqw,0.5rem)]"><Wind className="h-[clamp(0.9rem,11cqw,1.125rem)] w-[clamp(0.9rem,11cqw,1.125rem)] shrink-0 text-indigo-400" /><h3 className="truncate text-[clamp(0.68rem,8cqw,0.875rem)] font-semibold">{title}</h3></div>
      <div className="relative m-auto h-[clamp(3.7rem,50cqw,5.35rem)] w-[clamp(3.7rem,50cqw,5.35rem)] self-center rounded-full border border-[color:var(--ui-separator)] text-[clamp(0.42rem,5cqw,0.5625rem)] text-[color:var(--ui-text-tertiary)]"><span className="absolute left-1/2 top-0 -translate-x-1/2">N</span><span className="absolute bottom-0 left-1/2 -translate-x-1/2">S</span><span className="absolute left-[5%] top-1/2 -translate-y-1/2">W</span><span className="absolute right-[5%] top-1/2 -translate-y-1/2">E</span>{bearing !== undefined ? <span className="absolute inset-[9%] transition-transform duration-500" style={{ transform: `rotate(${degrees}deg)` }}><span className="absolute left-1/2 top-[-0.2rem] h-[clamp(0.4rem,5cqw,0.55rem)] w-[clamp(0.4rem,5cqw,0.55rem)] -translate-x-1/2 rounded-full bg-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.7)]" /></span> : null}<span className="absolute inset-0 flex items-center justify-center text-[clamp(0.8rem,11cqw,1.1rem)] font-semibold tracking-[-0.02em] text-[color:var(--ui-text-primary)]">{direction}</span></div>
      <p className="truncate text-center text-[clamp(0.62rem,8cqw,0.875rem)] font-semibold">{Math.round(speed)} {unit}</p>
    </section>
  );
}

function SunModule({ sunrise, sunset, title }: { sunrise: string; sunset: string; title: string }) {
  return (
    <section className="dashboard-content-surface col-span-2 grid aspect-[2.08/1] min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[26px] p-4">
      <div className="flex items-center gap-2">
        <Sunrise size={18} className="text-orange-400" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>

      <div className="mx-auto flex min-h-0 w-full max-w-[22rem] items-end pt-2">
        <svg
          viewBox="0 0 320 76"
          className="block max-h-full w-full"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          <path
            d="M10 68 C90 22 230 22 310 68"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.12"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <path
            d="M10 68 C90 22 230 22 310 68"
            fill="none"
            stroke="#ff9f0a"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M10 72 H310"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.1"
            strokeWidth="1"
          />
        </svg>
      </div>
      <div className="flex items-center justify-between px-1 text-sm font-semibold">
          <span className="flex items-center gap-1.5">
            <Sunrise size={15} />
            {sunrise}
          </span>
          <span className="flex items-center gap-1.5">
            {sunset}
            <Sunset size={15} />
          </span>
      </div>
    </section>
  );
}

export function WeatherControlsPanel({ weather, unit = 'C', forecastDays, forecastType = 'daily', conditionOverride, showWind = true }: WeatherControlsProps) {
  const { t, locale } = useI18n();
  if (!weather.available) {
    const isOffline = weather.source === 'offline';
    return <div className={CONTEXT_PANEL_LAYOUT.shell}><div className={`${CONTEXT_PANEL_LAYOUT.section} flex min-h-56 flex-col items-center justify-center text-center`}><span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--ui-fill-secondary)] text-[color:var(--ui-text-secondary)]"><CloudOff size={26} strokeWidth={1.6} /></span><h2 className="mt-4 text-lg font-semibold text-[color:var(--ui-text-primary)]">{isOffline ? t('controls.weather.unavailable') : t('controls.weather.notConfigured')}</h2><p className="mt-1 max-w-xs text-sm text-[color:var(--ui-text-secondary)]">{isOffline ? t('controls.weather.offlineDescription') : t('controls.weather.selectEntityDescription')}</p></div></div>;
  }

  const attrs = weather.rawAttributes;
  const forecast = weather.forecast.slice(0, Math.max(1, Math.min(8, forecastDays ?? (forecastType === 'hourly' ? 8 : 5))));
  const isMock = weather.source === 'mock';
  const humidity = readNumber(attrs, ['humidity', 'relative_humidity']) ?? forecastNumber(forecast, 'humidity') ?? (isMock ? weather.humidity : undefined);
  const pressure = readNumber(attrs, ['pressure']) ?? forecastNumber(forecast, 'pressure') ?? (isMock ? weather.pressure : undefined);
  const uv = readNumber(attrs, ['uv_index']) ?? forecastNumber(forecast, 'uvIndex') ?? (isMock ? weather.uvIndex : undefined);
  const windSpeed = readNumber(attrs, ['wind_speed', 'native_wind_speed']) ?? forecastNumber(forecast, 'windSpeed') ?? (isMock ? weather.windSpeed : undefined);
  const windBearing = readValue(attrs, ['wind_bearing']) ?? forecast.find((entry) => entry.windBearing !== undefined)?.windBearing ?? (isMock ? weather.windBearing : undefined);
  const sunrise = formatClock(weather.sunrise ?? readValue(attrs, ['sunrise', 'next_rising', 'next_dawn']), locale);
  const sunset = formatClock(weather.sunset ?? readValue(attrs, ['sunset', 'next_setting', 'next_dusk']), locale);
  const temperatureEntries = forecast.filter((entry) => Number.isFinite(entry.high));
  const displayTemp = unit === 'F' ? toFahrenheit(weather.temperature) : weather.temperature;
  const displayCondition = conditionOverride ?? weather.condition;
  const displayConditionLabel = getWeatherConditionLabel(displayCondition, t);

  return <div className={`${CONTEXT_PANEL_LAYOUT.shell} text-[color:var(--ui-text-primary)]`}>
    <section className={`weather-condition-visual weather-condition-hero relative isolate mb-1 overflow-hidden text-[color:var(--ui-weather-foreground,#fff)] ${CONTEXT_PANEL_LAYOUT.section}`} data-weather={getWeatherBackdrop(displayCondition)}><div className="weather-condition-atmosphere" aria-hidden="true" /><div className="relative z-10 flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm opacity-70">{weather.location}</p><p className="mt-1 text-6xl font-thin leading-none tracking-[-0.05em]">{Math.round(displayTemp)}°</p><p className="mt-2 truncate text-sm opacity-75">{displayConditionLabel}</p></div><AnimatedWeatherIcon condition={displayCondition} size={42} /></div></section>
    <div className="grid grid-cols-2 gap-3">
      {temperatureEntries.length > 1 ? <TemperatureTrend entries={temperatureEntries} unit={unit} type={forecastType} locale={locale} title={t('controls.weather.module.temperature')} granularity={t(forecastType === 'hourly' ? 'controls.weather.granularity.hourly' : 'controls.weather.granularity.daily')} /> : null}
      {humidity !== undefined ? <HumidityModule value={humidity} title={t('controls.weather.module.humidity')} descriptor={humidityDescriptor(humidity, t)} /> : null}
      {pressure !== undefined ? <PressureModule value={pressure} unit={weather.pressureUnit ?? 'hPa'} title={t('controls.weather.module.pressure')} descriptor={pressureDescriptor(pressure, t)} /> : null}
      {uv !== undefined ? <UvModule value={uv} title={t('controls.weather.module.uv')} descriptor={uvDescriptor(uv, t)} /> : null}
      {showWind && windSpeed !== undefined ? <WindModule speed={windSpeed} unit={weather.windSpeedUnit ?? 'km/h'} bearing={windBearing} title={t('controls.weather.module.wind')} /> : null}
      {sunrise && sunset ? <SunModule sunrise={sunrise} sunset={sunset} title={t('controls.weather.module.sun')} /> : null}
    </div>
  </div>;
}

export const WeatherControls = WeatherControlsPanel;
