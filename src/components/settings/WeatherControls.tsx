import React from 'react';
import {
  Cloud,
  CloudOff,
  CloudRain,
  Droplets,
  Eye,
  Flag,
  Gauge,
  SunMedium,
  Sunrise,
  Sunset,
  Thermometer,
  Wind,
} from 'lucide-react';
import type { DashboardStateShape } from '../../hooks/useDashboardState';
import { getWeatherVisual } from '../../utils/weatherVisual';
import { AnimatedWeatherIcon } from '../widgets/AnimatedWeatherIcon';
import { CONTEXT_PANEL_LAYOUT } from './layoutClasses';
import { useI18n } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n/translations';

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

function toFahrenheit(temp: number) {
  return temp * 1.8 + 32;
}

function toNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function toStringValue(value: unknown) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

function readFirst(attributes: Record<string, unknown> | undefined, keys: string[]) {
  if (!attributes) {
    return undefined;
  }
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(attributes, key)) {
      return attributes[key];
    }
  }
  return undefined;
}

function toDateValue(value: unknown): Date | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value > 1e12 ? value : value * 1000);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  return undefined;
}

function formatClock(value: unknown, locale: string) {
  const date = toDateValue(value);
  if (!date) {
    return '--:--';
  }
  try {
    return new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
}

function normalizeForecastLabel(
  label: string,
  datetime: string | undefined,
  isDaytime: boolean | undefined,
  index: number,
  forecastType: 'daily' | 'hourly' | 'twice_daily',
  locale: string,
  t: (key: TranslationKey, parameters?: Record<string, string | number>) => string,
) {
  if (forecastType === 'hourly') {
    if (datetime) {
      const parsed = new Date(datetime);
      if (Number.isFinite(parsed.getTime())) {
        try {
          return new Intl.DateTimeFormat(locale, { hour: '2-digit' }).format(parsed);
        } catch {
          return `${String(parsed.getHours()).padStart(2, '0')}:00`;
        }
      }
    }
    return `${String(index + 1).padStart(2, '0')}:00`;
  }

  if (forecastType === 'twice_daily') {
    if (datetime) {
      const parsed = new Date(datetime);
      if (Number.isFinite(parsed.getTime())) {
        try {
          const day = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(parsed);
          const slot = isDaytime === undefined ? '' : isDaytime ? ` ${t('controls.weather.day')}` : ` ${t('controls.weather.night')}`;
          return `${day}${slot}`;
        } catch {
          return isDaytime === false ? t('controls.weather.night') : t('controls.weather.day');
        }
      }
    }
    if (index === 0) {
      return t('controls.weather.todayDay');
    }
    return isDaytime === false ? t('controls.weather.night') : t('controls.weather.slot', { count: index + 1 });
  }

  const raw = (label ?? '').trim();
  if (raw.length > 0) {
    if (index === 0) {
      return t('controls.weather.today');
    }
    return raw.length > 4 ? raw.slice(0, 3) : raw;
  }
  if (index === 0) {
    return t('controls.weather.today');
  }
  try {
    const day = new Date();
    day.setDate(day.getDate() + index);
    return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(day);
  } catch {
    return `G${index + 1}`;
  }
}

function uvDescriptor(value: number, t: (key: TranslationKey) => string) {
  if (value <= 2) {
    return t('controls.weather.uv.low');
  }
  if (value <= 5) {
    return t('controls.weather.uv.moderate');
  }
  if (value <= 7) {
    return t('controls.weather.uv.high');
  }
  if (value <= 10) {
    return t('controls.weather.uv.veryHigh');
  }
  return t('controls.weather.uv.extreme');
}

function getPanelAtmosphere(condition: string | undefined) {
  const normalized = (condition ?? '').trim().toLowerCase();
  if (normalized.includes('sun') || normalized.includes('clear')) {
    return 'from-cyan-700/18 via-blue-900/22 to-transparent';
  }
  if (normalized.includes('partly') || normalized.includes('cloud')) {
    return 'from-blue-800/16 via-indigo-900/20 to-transparent';
  }
  if (normalized.includes('rain') || normalized.includes('pour')) {
    return 'from-slate-700/20 via-blue-950/24 to-transparent';
  }
  if (normalized.includes('thunder') || normalized.includes('lightning')) {
    return 'from-indigo-700/16 via-slate-900/24 to-transparent';
  }
  return 'from-blue-900/14 via-slate-900/18 to-transparent';
}

function WeatherMetricCard({
  icon,
  title,
  value,
  subtext,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  subtext?: string;
}) {
  return (
    <div className="dashboard-content-surface flex aspect-square flex-col justify-between rounded-[28px] p-4">
      <div className="flex items-center gap-2 text-[color:var(--ui-text-secondary)]">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--ui-fill-secondary)]">{icon}</span>
        <p className="text-[10px] uppercase tracking-[0.16em]">{title}</p>
      </div>
      <div>
        <p className="text-3xl font-semibold tracking-tight text-[color:var(--ui-text-primary)]">{value}</p>
        {subtext ? <p className="mt-1 text-xs text-[color:var(--ui-text-tertiary)]">{subtext}</p> : null}
      </div>
    </div>
  );
}

function formatBearing(value: string | number | undefined) {
  if (value === undefined) {
    return '--';
  }
  if (typeof value === 'number') {
    return `${Math.round(value)}\u00B0`;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : '--';
}

export function WeatherControlsPanel({
  weather,
  unit = 'C',
  forecastDays,
  forecastDensity = 'comfortable',
  forecastType = 'daily',
  conditionOverride,
  showPrecipitation = true,
  showWind = true,
}: WeatherControlsProps) {
  const { t, locale } = useI18n();
  const [selectedForecastIndex, setSelectedForecastIndex] = React.useState(0);
  const condition = conditionOverride ?? weather.condition;
  const visual = getWeatherVisual(condition);
  const panelAtmosphere = getPanelAtmosphere(condition);

  const displayTemp = unit === 'F' ? toFahrenheit(weather.temperature) : weather.temperature;
  const displayHigh = unit === 'F' ? toFahrenheit(weather.high) : weather.high;
  const displayLow = unit === 'F' ? toFahrenheit(weather.low) : weather.low;

  const attrs = weather.rawAttributes;
  const tempUnit = weather.temperatureUnit ?? (unit === 'F' ? '\u00B0F' : '\u00B0C');
  const windUnit = toStringValue(readFirst(attrs, ['wind_speed_unit'])) ?? weather.windSpeedUnit ?? 'km/h';
  const precipUnit = weather.precipitationUnit ?? 'mm';
  const pressureUnit = toStringValue(readFirst(attrs, ['pressure_unit'])) ?? weather.pressureUnit ?? 'hPa';
  const visibilityUnit = toStringValue(readFirst(attrs, ['visibility_unit'])) ?? weather.visibilityUnit ?? 'km';

  const visibilityValue = Math.max(0, toNumber(readFirst(attrs, ['visibility'])) ?? weather.visibility);
  const humidityValue = Math.max(0, Math.round(toNumber(readFirst(attrs, ['humidity'])) ?? weather.humidity));
  const uvValue = Math.max(0, Math.round(toNumber(readFirst(attrs, ['uv_index'])) ?? weather.uvIndex));
  const windValue = Math.max(0, Math.round(toNumber(readFirst(attrs, ['wind_speed'])) ?? weather.windSpeed));
  const rainProbabilityValue = Math.max(
    0,
    Math.round(toNumber(readFirst(attrs, ['precipitation_probability', 'rain_probability'])) ?? weather.precipitation),
  );
  const rainAmountValue = Math.max(0, toNumber(readFirst(attrs, ['precipitation'])) ?? weather.precipitationAmount);
  const pressureValue = Math.max(0, Math.round(toNumber(readFirst(attrs, ['pressure'])) ?? weather.pressure));
  const cloudCoverageValue = Math.max(
    0,
    Math.round(toNumber(readFirst(attrs, ['cloud_coverage'])) ?? weather.cloudCoverage),
  );
  const dewPointValue = toNumber(readFirst(attrs, ['dew_point', 'native_dew_point'])) ?? weather.dewPoint;
  const windGustValue = Math.max(
    0,
    Math.round(toNumber(readFirst(attrs, ['wind_gust_speed'])) ?? weather.windGustSpeed),
  );
  const windBearingValue = formatBearing(
    (readFirst(attrs, ['wind_bearing']) as string | number | undefined) ?? weather.windBearing,
  );
  const sunriseValue = formatClock(readFirst(attrs, ['sunrise', 'next_rising', 'next_dawn']), locale);
  const sunsetValue = formatClock(readFirst(attrs, ['sunset', 'next_setting', 'next_dusk']), locale);

  const forecastCount = Math.max(1, Math.min(8, forecastDays ?? 5));
  const forecast = weather.forecast.slice(0, forecastCount);
  const dense = forecastDensity === 'compact';

  React.useEffect(() => {
    setSelectedForecastIndex((current) => Math.min(current, Math.max(0, forecast.length - 1)));
  }, [forecast.length]);

  if (!weather.available) {
    const isOffline = weather.source === 'offline';
    return (
      <div className={CONTEXT_PANEL_LAYOUT.shell}>
        <div className={`${CONTEXT_PANEL_LAYOUT.section} flex min-h-56 flex-col items-center justify-center text-center`}>
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--ui-fill-secondary)] text-[color:var(--ui-text-secondary)]">
            <CloudOff size={26} strokeWidth={1.6} aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-[color:var(--ui-text-primary)]">
            {isOffline ? t('controls.weather.unavailable') : t('controls.weather.notConfigured')}
          </h2>
          <p className="mt-1 max-w-xs text-sm text-[color:var(--ui-text-secondary)]">
            {isOffline
              ? t('controls.weather.offlineDescription')
              : t('controls.weather.selectEntityDescription')}
          </p>
        </div>
      </div>
    );
  }

  const safeSelectedIndex = Math.min(selectedForecastIndex, Math.max(0, forecast.length - 1));
  const selectedForecast = forecast[safeSelectedIndex] ?? forecast[0];

  const formatTemp = (value: number | undefined) => {
    if (value === undefined) {
      return '--';
    }
    const converted = unit === 'F' ? toFahrenheit(value) : value;
    return `${Math.round(converted)}${tempUnit}`;
  };

  const forecastTitle =
    forecast.length === 0
      ? t('controls.weather.forecastUnavailable')
      : forecastType === 'hourly'
      ? t('controls.weather.forecastHours', { count: forecast.length })
      : forecastType === 'twice_daily'
        ? t('controls.weather.forecastSlots', { count: forecast.length })
        : t('controls.weather.forecastDays', { count: forecast.length });

  return (
    <div className={CONTEXT_PANEL_LAYOUT.shell}>
      <div className={`relative overflow-hidden ${CONTEXT_PANEL_LAYOUT.section} mb-1`}>
        <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${panelAtmosphere}`} />
        <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-sky-300/10 blur-3xl" />
        <div className="relative">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-2xl font-semibold text-[color:var(--ui-text-primary)]">{weather.location}</h2>
              <p className="mt-1 text-6xl font-thin leading-none tracking-[-0.04em] text-[color:var(--ui-text-primary)]">{`${Math.round(displayTemp)}\u00B0`}</p>
              <p className="mt-2 truncate text-sm text-[color:var(--ui-text-secondary)]">
                {`${visual.label} • H:${Math.round(displayHigh)}\u00B0 L:${Math.round(displayLow)}\u00B0`}
              </p>
            </div>
            <span className="mt-1 shrink-0 text-[color:var(--ui-text-primary)]">
              <AnimatedWeatherIcon condition={condition} size={36} />
            </span>
          </div>
        </div>
      </div>

      <div className={`${CONTEXT_PANEL_LAYOUT.sectionCompact} mb-1`}>
        <p className="mb-3 text-xs uppercase tracking-[0.16em] text-[color:var(--ui-text-tertiary)]">{forecastTitle}</p>
        {forecast.length === 0 ? (
          <p className="text-sm text-[color:var(--ui-text-secondary)]">
            {t('controls.weather.noForecast')}
          </p>
        ) : (
          <div className="flex items-start justify-between gap-2">
            {forecast.map((entry, index) => {
            const high = unit === 'F' ? toFahrenheit(entry.high) : entry.high;
            const low = unit === 'F' ? toFahrenheit(entry.low) : entry.low;
            const labelText = normalizeForecastLabel(
              entry.label,
              entry.datetime,
              entry.isDaytime,
              index,
              forecastType,
              locale,
              t,
            );
            return (
              <div key={`${entry.label}-${index}`} className="flex min-w-0 flex-1 flex-col items-center text-center">
                <button
                  type="button"
                  onClick={() => setSelectedForecastIndex(index)}
                  className={`rounded-lg px-1.5 py-0.5 transition-colors ${
                    index === safeSelectedIndex ? 'liquid-glass-selection text-[color:var(--ui-text-primary)]' : 'text-[color:var(--ui-text-secondary)] hover:bg-[color:var(--ui-fill-secondary)]'
                  } ${dense ? 'text-[10px]' : 'text-[11px]'}`}
                >
                  {labelText}
                </button>
                <span className="mt-1 text-[color:var(--ui-text-primary)]">
                  <AnimatedWeatherIcon condition={entry.condition} size={dense ? 16 : 18} />
                </span>
                <p className={`mt-1 font-semibold text-[color:var(--ui-text-primary)] ${dense ? 'text-[11px]' : 'text-xs'}`}>{`${Math.round(high)}\u00B0`}</p>
                <p className={`text-[color:var(--ui-text-tertiary)] ${dense ? 'text-[10px]' : 'text-[11px]'}`}>{`${Math.round(low)}\u00B0`}</p>
              </div>
            );
            })}
          </div>
        )}
      </div>

      <div className={`${CONTEXT_PANEL_LAYOUT.sectionCompact} mb-1`}>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--ui-text-tertiary)]">{t('controls.weather.metric.visibility')}</p>
          <div className="flex items-center gap-2 text-sm text-[color:var(--ui-text-secondary)]">
            <Eye size={15} />
            <span>{`${Math.round(visibilityValue)} ${visibilityUnit}`}</span>
          </div>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[color:var(--ui-fill-secondary)]">
          <div
            className="h-full rounded-full bg-[color:var(--ui-info)]"
            style={{ width: `${Math.min(100, (visibilityValue / 40) * 100)}%` }}
          />
        </div>
      </div>

      <div className="mb-1 grid grid-cols-2 gap-3">
        <WeatherMetricCard
          icon={<SunMedium size={15} />}
          title={t('controls.weather.metric.uv')}
          value={`${uvValue}`}
          subtext={uvDescriptor(uvValue, t)}
        />
        <WeatherMetricCard
          icon={<Droplets size={15} />}
          title={t('controls.weather.metric.humidity')}
          value={`${humidityValue}%`}
        />
        <WeatherMetricCard
          icon={<Flag size={15} />}
          title={t('controls.weather.metric.wind')}
          value={showWind ? `${windValue} ${windUnit}` : '--'}
        />
        <WeatherMetricCard
          icon={<CloudRain size={15} />}
          title={t('controls.weather.metric.rain')}
          value={showPrecipitation ? `${rainProbabilityValue}%` : '--'}
          subtext={showPrecipitation ? `${rainAmountValue.toFixed(1)} ${precipUnit}` : undefined}
        />
      </div>

      <div className="mb-1 grid grid-cols-2 gap-3">
        <WeatherMetricCard
          icon={<Gauge size={15} />}
          title={t('controls.weather.metric.pressure')}
          value={`${pressureValue} ${pressureUnit}`}
        />
        <WeatherMetricCard
          icon={<Cloud size={15} />}
          title={t('controls.weather.metric.clouds')}
          value={`${cloudCoverageValue}%`}
        />
        <WeatherMetricCard
          icon={<Thermometer size={15} />}
          title={t('controls.weather.metric.dewPoint')}
          value={formatTemp(dewPointValue)}
        />
        <WeatherMetricCard
          icon={<Wind size={15} />}
          title={t('controls.weather.metric.gusts')}
          value={`${windGustValue} ${windUnit}`}
          subtext={t('controls.weather.metric.direction', { value: windBearingValue })}
        />
      </div>

      <div className={`${CONTEXT_PANEL_LAYOUT.sectionCompact} mb-1`}>
        <p className="mb-3 text-xs uppercase tracking-[0.16em] text-[color:var(--ui-text-tertiary)]">{t('controls.weather.slotDetails')}</p>
        <div className="grid grid-cols-2 gap-3 text-xs text-[color:var(--ui-text-secondary)]">
          <div className="dashboard-content-surface rounded-2xl p-3">
            <p className="uppercase tracking-[0.16em] text-[color:var(--ui-text-tertiary)]">{t('controls.weather.apparentTemperature')}</p>
            <p className="mt-1 text-sm font-semibold text-[color:var(--ui-text-primary)]">{formatTemp(selectedForecast?.apparentTemperature)}</p>
          </div>
          <div className="dashboard-content-surface rounded-2xl p-3">
            <p className="uppercase tracking-[0.16em] text-[color:var(--ui-text-tertiary)]">{t('controls.weather.precipitation')}</p>
            <p className="mt-1 text-sm font-semibold text-[color:var(--ui-text-primary)]">
              {selectedForecast?.precipitationProbability === undefined
                ? '--'
                : `${Math.round(selectedForecast.precipitationProbability)}%`}
            </p>
            <p className="mt-1 text-[11px] text-[color:var(--ui-text-tertiary)]">
              {selectedForecast?.precipitationAmount === undefined
                ? '--'
                : `${selectedForecast.precipitationAmount.toFixed(1)} ${precipUnit}`}
            </p>
          </div>
          <div className="dashboard-content-surface rounded-2xl p-3">
            <p className="uppercase tracking-[0.16em] text-[color:var(--ui-text-tertiary)]">{t('controls.weather.dewHumidity')}</p>
            <p className="mt-1 text-sm font-semibold text-[color:var(--ui-text-primary)]">{`${formatTemp(selectedForecast?.dewPoint)} • ${selectedForecast?.humidity === undefined ? '--' : `${Math.round(selectedForecast.humidity)}%`}`}</p>
          </div>
          <div className="dashboard-content-surface rounded-2xl p-3">
            <p className="uppercase tracking-[0.16em] text-[color:var(--ui-text-tertiary)]">{t('controls.weather.pressureUv')}</p>
            <p className="mt-1 text-sm font-semibold text-[color:var(--ui-text-primary)]">{`${selectedForecast?.pressure === undefined ? '--' : `${Math.round(selectedForecast.pressure)} ${pressureUnit}`} • ${selectedForecast?.uvIndex === undefined ? '--' : `${Math.round(selectedForecast.uvIndex)}`}`}</p>
          </div>
          <div className="dashboard-content-surface rounded-2xl p-3">
            <p className="uppercase tracking-[0.16em] text-[color:var(--ui-text-tertiary)]">{t('controls.weather.metric.wind')}</p>
            <p className="mt-1 text-sm font-semibold text-[color:var(--ui-text-primary)]">{`${selectedForecast?.windSpeed === undefined ? '--' : `${Math.round(selectedForecast.windSpeed)} ${windUnit}`}`}</p>
            <p className="mt-1 text-[11px] text-[color:var(--ui-text-tertiary)]">{t('controls.weather.gustValue', { value: selectedForecast?.windGustSpeed === undefined ? '--' : `${Math.round(selectedForecast.windGustSpeed)} ${windUnit}` })}</p>
          </div>
          <div className="dashboard-content-surface rounded-2xl p-3">
            <p className="uppercase tracking-[0.16em] text-[color:var(--ui-text-tertiary)]">{t('controls.weather.directionSlot')}</p>
            <p className="mt-1 text-sm font-semibold text-[color:var(--ui-text-primary)]">{`${formatBearing(selectedForecast?.windBearing)} • ${selectedForecast?.isDaytime === undefined ? '--' : selectedForecast.isDaytime ? t('controls.weather.day') : t('controls.weather.night')}`}</p>
            <p className="mt-1 text-[11px] text-[color:var(--ui-text-tertiary)]">{t('controls.weather.cloudValue', { value: selectedForecast?.cloudCoverage === undefined ? '--' : `${Math.round(selectedForecast.cloudCoverage)}%` })}</p>
          </div>
        </div>
      </div>

      <div className={CONTEXT_PANEL_LAYOUT.sectionCompact}>
        <div className="grid grid-cols-2 gap-3">
          <div className="dashboard-content-surface rounded-2xl p-3">
            <div className="flex items-center gap-2 text-[color:var(--ui-text-secondary)]">
              <Sunrise size={15} />
              <span className="text-[10px] uppercase tracking-[0.16em]">{t('controls.weather.sunrise')}</span>
            </div>
            <p className="mt-2 text-xl font-semibold tracking-tight text-[color:var(--ui-text-primary)]">{sunriseValue}</p>
          </div>
          <div className="dashboard-content-surface rounded-2xl p-3">
            <div className="flex items-center gap-2 text-[color:var(--ui-text-secondary)]">
              <Sunset size={15} />
              <span className="text-[10px] uppercase tracking-[0.16em]">{t('controls.weather.sunset')}</span>
            </div>
            <p className="mt-2 text-xl font-semibold tracking-tight text-[color:var(--ui-text-primary)]">{sunsetValue}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export const WeatherControls = WeatherControlsPanel;

