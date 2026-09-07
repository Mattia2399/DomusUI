import React from 'react';
import { CloudOff } from 'lucide-react';
import type { DashboardStateShape } from '../../hooks/useDashboardState';
import { getWeatherVisual } from '../../utils/weatherVisual';
import type { ForecastDensity, WeatherSecondaryInfo } from '../../types/dashboardModels';
import { AnimatedWeatherIcon } from './AnimatedWeatherIcon';
import { useCardSize } from './useCardSize';
import { useI18n } from '../../i18n/I18nProvider';

type WeatherCardProps = {
  weather: DashboardStateShape['weather'];
  compactHint?: boolean;
  denseHint?: boolean;
  layout?: 'auto' | 'card' | 'chip';
  unit?: 'C' | 'F';
  secondaryInfo?: WeatherSecondaryInfo;
  forecastDensity?: ForecastDensity;
  showCondition?: boolean;
  showPrecipitation?: boolean;
  showWind?: boolean;
  forecastDays?: number;
  forecastType?: 'daily' | 'hourly' | 'twice_daily';
  conditionOverride?: string;
  clampTypography?: boolean;
};

type WeatherDisplayMode = 'chip' | 'card';
type SecondaryInfoKey = Exclude<WeatherSecondaryInfo, 'auto'>;

function toFahrenheit(temp: number) {
  return temp * 1.8 + 32;
}

function toFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeForecastLabel(
  label: string,
  datetime: string | undefined,
  isDaytime: boolean | undefined,
  index: number,
  forecastType: 'daily' | 'hourly' | 'twice_daily',
) {
  if (forecastType === 'hourly') {
    if (datetime) {
      const parsed = new Date(datetime);
      if (Number.isFinite(parsed.getTime())) {
        try {
          return new Intl.DateTimeFormat('it-IT', { hour: '2-digit' }).format(parsed);
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
          const day = new Intl.DateTimeFormat('it-IT', { weekday: 'short' }).format(parsed);
          const slot = isDaytime === undefined ? '' : isDaytime ? ' Giorno' : ' Notte';
          return `${day}${slot}`;
        } catch {
          return isDaytime === false ? 'Notte' : 'Giorno';
        }
      }
    }
    return isDaytime === false ? 'Notte' : index === 0 ? 'Oggi Giorno' : `Slot ${index + 1}`;
  }
  const trimmed = (label ?? '').trim();
  if (trimmed.length > 0) {
    return index === 0 ? 'Oggi' : trimmed.length > 4 ? trimmed.slice(0, 3) : trimmed;
  }
  if (index === 0) {
    return 'Oggi';
  }
  try {
    const day = new Date();
    day.setDate(day.getDate() + index);
    return new Intl.DateTimeFormat('it-IT', { weekday: 'short' }).format(day);
  } catch {
    return `G${index + 1}`;
  }
}

function resolveDisplayMode(
  layout: 'auto' | 'card' | 'chip',
  hasCardSize: boolean,
  cardWidth: number,
  cardHeight: number,
  compactFallback: boolean,
) {
  if (layout === 'chip') {
    return 'chip' as WeatherDisplayMode;
  }
  if (layout === 'card') {
    return 'card' as WeatherDisplayMode;
  }
  if (!hasCardSize) {
    return compactFallback ? 'chip' : 'card';
  }

  const isNarrow = cardWidth <= 500;
  const isShort = cardHeight <= 205;
  const isVeryShort = cardHeight <= 165;
  const panoramic = cardWidth / Math.max(1, cardHeight) >= 3.2;
  if (isVeryShort || (isNarrow && isShort) || (panoramic && isShort)) {
    return 'chip';
  }
  return 'card';
}

function pickPrimaryInfo({
  requestedInfo,
  infoMap,
  autoPriority,
  rangeLabel,
}: {
  requestedInfo: WeatherSecondaryInfo;
  infoMap: Partial<Record<SecondaryInfoKey, string>>;
  autoPriority: SecondaryInfoKey[];
  rangeLabel: string;
}) {
  if (requestedInfo !== 'auto') {
    const selectedLabel = infoMap[requestedInfo];
    if (selectedLabel) {
      return selectedLabel;
    }
  }

  for (const key of autoPriority) {
    const label = infoMap[key];
    if (label) {
      return label;
    }
  }

  return rangeLabel;
}

export function WeatherCard({
  weather,
  compactHint = false,
  denseHint = false,
  layout = 'auto',
  unit = 'C',
  secondaryInfo = 'auto',
  forecastDensity = 'comfortable',
  showCondition = true,
  showPrecipitation = true,
  showWind = true,
  forecastDays = 4,
  forecastType = 'daily',
  conditionOverride,
  clampTypography = false,
}: WeatherCardProps) {
  const { t } = useI18n();
  const { ref: cardRef, density: cardDensity, width: cardWidth, height: cardHeight, hasSize: hasCardSize } = useCardSize({
    tinyWidth: 270,
    tinyHeight: 165,
    compactWidth: 480,
    compactHeight: 250,
  });
  const compactFallback = compactHint || denseHint;
  const mode = resolveDisplayMode(layout, hasCardSize, cardWidth, cardHeight, compactFallback);
  const isTinyCard = hasCardSize && (cardDensity === 'tiny' || cardHeight <= 150 || cardWidth <= 300);
  const isCompactCard = !isTinyCard && hasCardSize && (cardDensity === 'compact' || cardHeight <= 220 || cardWidth <= 460);

  const condition = conditionOverride ?? weather.condition;

  if (!weather.available) {
    const isOffline = weather.source === 'offline';
    return (
      <div
        ref={cardRef}
        className="flex h-full w-full min-h-0 min-w-0 items-center justify-center gap-2.5 overflow-hidden text-[color:var(--ui-text-secondary)]"
        role="status"
      >
        <CloudOff size={mode === 'chip' ? 24 : 30} strokeWidth={1.6} aria-hidden="true" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[color:var(--ui-text-primary)]">
            {isOffline ? t('controls.weather.unavailable') : t('controls.weather.notConfigured')}
          </p>
          {mode === 'card' ? (
            <p className="mt-0.5 truncate text-xs text-[color:var(--ui-text-tertiary)]">
              {isOffline ? t('controls.weather.offline') : t('controls.weather.selectEntity')}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  const visual = getWeatherVisual(condition);
  const displayTemp = unit === 'F' ? toFahrenheit(weather.temperature) : weather.temperature;
  const displayHigh = unit === 'F' ? toFahrenheit(weather.high) : weather.high;
  const displayLow = unit === 'F' ? toFahrenheit(weather.low) : weather.low;
  const displayDewPoint = unit === 'F' ? toFahrenheit(weather.dewPoint) : weather.dewPoint;
  const temperature = Math.round(displayTemp);
  const pressureUnit = weather.pressureUnit ?? 'hPa';
  const visibilityUnit = weather.visibilityUnit ?? 'km';
  const windUnit = weather.windSpeedUnit ?? 'km/h';
  const rangeLabel = `H:${Math.round(displayHigh)}\u00B0 L:${Math.round(displayLow)}\u00B0`;
  const compactForecast = forecastDensity === 'compact';

  const precipitationValue = toFiniteNumber(weather.precipitation);
  const windValue = toFiniteNumber(weather.windSpeed);
  const humidityValue = toFiniteNumber(weather.humidity);
  const pressureValue = toFiniteNumber(weather.pressure);
  const visibilityValue = toFiniteNumber(weather.visibility);
  const uvValue = toFiniteNumber(weather.uvIndex);
  const cloudCoverageValue = toFiniteNumber(weather.cloudCoverage);
  const dewPointValue = toFiniteNumber(weather.dewPoint);

  const infoMap: Partial<Record<SecondaryInfoKey, string>> = {
    precipitation:
      showPrecipitation && precipitationValue !== undefined
        ? t('controls.weather.rain', { value: Math.round(Math.max(0, precipitationValue)) })
        : undefined,
    wind:
      showWind && windValue !== undefined
        ? t('controls.weather.wind', { value: Math.round(Math.max(0, windValue)), unit: windUnit })
        : undefined,
    humidity: humidityValue !== undefined ? t('controls.weather.humidity', { value: Math.round(Math.max(0, humidityValue)) }) : undefined,
    pressure:
      pressureValue !== undefined
        ? t('controls.weather.pressure', { value: Math.round(Math.max(0, pressureValue)), unit: pressureUnit })
        : undefined,
    visibility:
      visibilityValue !== undefined
        ? t('controls.weather.visibility', { value: Math.max(0, visibilityValue).toFixed(visibilityValue < 10 ? 1 : 0), unit: visibilityUnit })
        : undefined,
    uv_index: uvValue !== undefined ? t('controls.weather.uv', { value: Math.round(Math.max(0, uvValue)) }) : undefined,
    cloud_coverage:
      cloudCoverageValue !== undefined
        ? t('controls.weather.clouds', { value: Math.round(Math.max(0, cloudCoverageValue)) })
        : undefined,
    dew_point: dewPointValue !== undefined ? t('controls.weather.dewPoint', { value: Math.round(displayDewPoint) }) : undefined,
    condition: showCondition && visual.label.trim().length > 0 ? visual.label : undefined,
    range: rangeLabel,
  };

  const autoPriority: SecondaryInfoKey[] = [
    'precipitation',
    'wind',
    'humidity',
    'condition',
    'range',
    'pressure',
    'uv_index',
    'visibility',
    'cloud_coverage',
    'dew_point',
  ];
  const primaryInfo = pickPrimaryInfo({
    requestedInfo: secondaryInfo,
    infoMap,
    autoPriority,
    rangeLabel,
  });

  const safeForecastDays = Math.max(1, Math.min(8, forecastDays));
  const forecastEntries = weather.forecast.slice(0, safeForecastDays);

  const requestedForecastCount = Math.min(forecastEntries.length, safeForecastDays);
  const dailySlotMinWidth = compactForecast ? (isTinyCard ? 50 : 54) : isTinyCard ? 54 : isCompactCard ? 58 : 62;
  const genericSlotMinWidth = compactForecast ? (isTinyCard ? 56 : 60) : isTinyCard ? 62 : isCompactCard ? 66 : 72;
  const forecastGapPx = compactForecast ? 4 : 6;
  const dailyWidthCapacity = hasCardSize
    ? Math.max(2, Math.min(5, Math.floor((cardWidth + forecastGapPx) / (dailySlotMinWidth + forecastGapPx))))
    : 4;
  const genericWidthCapacity = hasCardSize
    ? Math.max(2, Math.min(6, Math.floor((cardWidth + forecastGapPx) / (genericSlotMinWidth + forecastGapPx))))
    : 3;
  const dailyHeightCapacity = !hasCardSize ? 5 : cardHeight <= 138 ? 3 : cardHeight <= 150 ? 4 : 5;
  const genericRowCapacity = !hasCardSize ? 2 : cardHeight <= 170 ? 1 : cardHeight <= 235 ? 2 : 3;

  const forecastVisibleCount =
    mode === 'card' && forecastType === 'daily'
      ? Math.max(1, Math.min(requestedForecastCount, dailyWidthCapacity, dailyHeightCapacity))
      : Math.max(1, Math.min(requestedForecastCount, genericWidthCapacity * genericRowCapacity));
  const visibleForecast = forecastEntries.slice(0, forecastVisibleCount);
  const forecastColumnCount =
    mode === 'card' && forecastType === 'daily'
      ? Math.max(2, Math.min(forecastVisibleCount, dailyWidthCapacity))
      : Math.max(2, Math.min(forecastVisibleCount, genericWidthCapacity));

  const infoClampStyle: React.CSSProperties = {
    display: '-webkit-box',
    WebkitLineClamp: 1,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  };
  const forecastUnavailable = forecastEntries.length === 0;

  if (mode === 'chip') {
    const chipTempClass = isTinyCard ? 'text-[1.84rem]' : isCompactCard ? 'text-[2.08rem]' : 'text-[2.3rem]';
    const chipInfoClass = isTinyCard ? 'text-[0.8rem]' : isCompactCard ? 'text-[0.88rem]' : 'text-[0.96rem]';
    const chipIconSize = clampTypography
      ? ('clamp(1.6rem, 2.8vw, 3.25rem)' as const)
      : isTinyCard
        ? 40
        : isCompactCard
          ? 46
          : 52;
    const chipGapClass = isTinyCard ? 'gap-2' : 'gap-3';
    const chipTempStyle: React.CSSProperties | undefined = clampTypography
      ? { fontSize: 'clamp(1.35rem,2.45vw,2.3rem)' }
      : undefined;
    const chipInfoStyle: React.CSSProperties = clampTypography
      ? {
          ...infoClampStyle,
          fontSize: 'clamp(0.72rem,1.15vw,0.96rem)',
        }
      : infoClampStyle;
    const chipContentAlignClass = clampTypography ? 'items-end min-[996px]:items-start' : '';
    const chipRowAlignClass = clampTypography ? 'justify-end min-[996px]:justify-start' : '';
    const chipTextAlignClass = clampTypography ? 'text-right min-[996px]:text-left' : '';
    return (
      <div ref={cardRef} className={`relative h-full w-full min-h-0 min-w-0 overflow-hidden flex items-center ${chipGapClass}`}>
        <div className={`min-w-0 flex w-full flex-col justify-center ${chipContentAlignClass}`}>
          <div className={`min-w-0 flex items-center gap-2 ${chipRowAlignClass}`}>
            <p
              className={`${chipTempClass} shrink-0 leading-none font-semibold tracking-tight text-[color:var(--ui-text-primary)] drop-shadow-[0_2px_7px_var(--ui-shadow-soft)]`}
              style={chipTempStyle}
            >
              {`${temperature}\u00B0`}
            </p>
            <span className="shrink-0 leading-none text-[color:var(--ui-text-disabled)]">|</span>
            <span className="shrink-0 text-[color:var(--ui-text-primary)] leading-none">
              <AnimatedWeatherIcon condition={condition} size={chipIconSize} />
            </span>
          </div>
          <div className="min-w-0 flex flex-col">
            <p className={`${chipInfoClass} mt-1 min-w-0 leading-tight font-medium text-[color:var(--ui-text-secondary)] ${chipTextAlignClass}`} style={chipInfoStyle}>
              {primaryInfo}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const useCompactCardLayout = denseHint || (hasCardSize && cardHeight <= 132);
  if (useCompactCardLayout) {
    const compactForecastEntries = forecastEntries.slice(0, safeForecastDays);
    const compactForecastCount = Math.max(1, compactForecastEntries.length);
    const compactHeaderIconSize = isTinyCard ? 24 : isCompactCard ? 26 : 28;
    const compactForecastIconSize = compactForecastCount >= 7 ? 8 : compactForecastCount >= 5 ? 9 : 10;
    const compactForecastTodayIconSize = compactForecastIconSize + 2;
    const compactDayLabelClass = compactForecastCount >= 7 ? 'text-[7px]' : compactForecastCount >= 5 ? 'text-[8px]' : 'text-[9px]';
    const compactDayTempClass = compactForecastCount >= 7 ? 'text-[8px]' : compactForecastCount >= 5 ? 'text-[9px]' : 'text-[10px]';
    const compactTodayLabelClass = compactForecastCount >= 7 ? 'text-[8px]' : compactForecastCount >= 5 ? 'text-[9px]' : 'text-[10px]';
    const compactTodayTempClass = compactForecastCount >= 7 ? 'text-[10px]' : compactForecastCount >= 5 ? 'text-[11px]' : 'text-[12px]';
    const compactHeaderInfoStyle: React.CSSProperties = {
      ...infoClampStyle,
      fontSize: 'clamp(0.62rem,0.95vw,0.82rem)',
    };

    return (
      <div ref={cardRef} className="relative h-full w-full min-h-0 min-w-0 overflow-hidden flex flex-col justify-between gap-1">
        <div className="min-w-0 flex items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-1.5">
            <p
              className="shrink-0 leading-none font-semibold tracking-tight text-[color:var(--ui-text-primary)] drop-shadow-[0_2px_7px_var(--ui-shadow-soft)]"
              style={{ fontSize: 'clamp(1.05rem,1.85vw,1.5rem)' }}
            >
              {`${temperature}\u00B0`}
            </p>
            <span className="shrink-0 leading-none text-[color:var(--ui-text-disabled)]">|</span>
            <span className="shrink-0 text-[color:var(--ui-text-primary)] leading-none">
              <AnimatedWeatherIcon condition={condition} size={compactHeaderIconSize} />
            </span>
          </div>
          <p className="min-w-0 text-right leading-tight font-medium text-[color:var(--ui-text-secondary)]" style={compactHeaderInfoStyle}>
            {primaryInfo}
          </p>
        </div>

        {forecastUnavailable ? (
          <p className="truncate text-[10px] font-medium text-[color:var(--ui-text-tertiary)]">
            Previsioni non disponibili
          </p>
        ) : (
          <div
            className={`grid min-w-0 items-end ${compactForecastCount >= 7 ? 'gap-x-0.5' : 'gap-x-1'} gap-y-0.5`}
            style={{ gridTemplateColumns: `repeat(${compactForecastCount}, minmax(0, 1fr))` }}
          >
            {compactForecastEntries.map((entry, index) => {
              const high = unit === 'F' ? toFahrenheit(entry.high) : entry.high;
              const isToday = index === 0;
              return (
                <div
                  key={`${entry.label}-${index}`}
                  className={`min-w-0 flex flex-col items-center rounded-md ${
                    isToday ? 'bg-[color:var(--ui-fill-tertiary)] px-1 py-0.5' : 'py-0.5'
                  }`}
                >
                  <p
                    className={`max-w-full truncate leading-none font-medium uppercase tracking-[0.02em] ${
                      isToday ? `${compactTodayLabelClass} text-[color:var(--ui-text-primary)]` : `${compactDayLabelClass} text-[color:var(--ui-text-tertiary)]`
                    }`}
                  >
                    {normalizeForecastLabel(entry.label, entry.datetime, entry.isDaytime, index, forecastType)}
                  </p>
                  <div className={`mt-0.5 flex items-center ${isToday ? 'gap-1' : 'gap-0.5'}`}>
                    <span className="shrink-0 text-[color:var(--ui-text-primary)] leading-none">
                      <AnimatedWeatherIcon
                        condition={entry.condition}
                        size={isToday ? compactForecastTodayIconSize : compactForecastIconSize}
                      />
                    </span>
                    <p
                      className={`shrink-0 leading-none font-semibold ${
                        isToday ? `${compactTodayTempClass} text-[color:var(--ui-text-primary)]` : `${compactDayTempClass} text-[color:var(--ui-text-secondary)]`
                      }`}
                    >
                      {`${Math.round(high)}\u00B0`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const cardTempClass = isTinyCard ? 'text-[2.05rem]' : isCompactCard ? 'text-[2.35rem]' : 'text-[2.7rem]';
  const cardInfoClass = isTinyCard ? 'text-[0.82rem]' : isCompactCard ? 'text-[0.9rem]' : 'text-[0.98rem]';
  const headerIconSize = isTinyCard ? 46 : isCompactCard ? 54 : 62;
  const tightForecast = mode === 'card' && forecastType === 'daily' && forecastVisibleCount >= 5;
  const forecastLabelClass = tightForecast
    ? isTinyCard
      ? 'text-[8px]'
      : 'text-[9px]'
    : compactForecast
      ? isTinyCard
        ? 'text-[9px]'
        : isCompactCard
          ? 'text-[10px]'
          : 'text-[11px]'
      : isTinyCard
        ? 'text-[10px]'
        : isCompactCard
          ? 'text-[11px]'
          : 'text-xs';
  const forecastHighClass = tightForecast
    ? isTinyCard
      ? 'text-[8px]'
      : 'text-[9px]'
    : compactForecast
      ? isTinyCard
        ? 'text-[9px]'
        : isCompactCard
          ? 'text-[10px]'
          : 'text-[11px]'
      : isTinyCard
        ? 'text-[10px]'
        : isCompactCard
          ? 'text-[11px]'
          : 'text-xs';
  const forecastLowClass = tightForecast
    ? isTinyCard
      ? 'text-[7px]'
      : 'text-[8px]'
    : compactForecast
      ? isTinyCard
        ? 'text-[8px]'
        : isCompactCard
          ? 'text-[9px]'
          : 'text-[10px]'
      : isTinyCard
        ? 'text-[9px]'
        : isCompactCard
          ? 'text-[10px]'
          : 'text-[11px]';
  const forecastIconSize = tightForecast
    ? isTinyCard
      ? 9
      : 11
    : compactForecast
      ? isTinyCard
        ? 11
        : isCompactCard
          ? 13
          : 15
      : isTinyCard
        ? 12
        : isCompactCard
          ? 14
          : 16;
  const forecastGapXClass = tightForecast
    ? 'gap-x-0.5'
    : compactForecast
      ? isTinyCard
        ? 'gap-x-1'
        : 'gap-x-1.5'
      : isTinyCard
        ? 'gap-x-1.5'
        : 'gap-x-2.5';
  const forecastGapYClass = tightForecast
    ? 'gap-y-1'
    : compactForecast
      ? isTinyCard
        ? 'gap-y-1'
        : 'gap-y-1.5'
      : isTinyCard
        ? 'gap-y-1.5'
        : 'gap-y-2';
  const headerGapClass = isTinyCard ? 'gap-2' : 'gap-3';
  const forecastMarginTopClass = compactForecast ? 'mt-1.5' : 'mt-2';

  return (
    <div ref={cardRef} className="relative h-full w-full min-h-0 min-w-0 overflow-hidden flex flex-col justify-between">
      <div className={`min-w-0 flex items-center ${headerGapClass}`}>
        <div className="min-w-0 flex flex-col">
          <p className={`${cardTempClass} shrink-0 leading-none font-semibold tracking-tight text-[color:var(--ui-text-primary)] drop-shadow-[0_2px_7px_var(--ui-shadow-soft)]`}>
            {`${temperature}\u00B0`}
          </p>
          <p className={`${cardInfoClass} mt-1 min-w-0 leading-tight font-medium text-[color:var(--ui-text-secondary)]`} style={infoClampStyle}>
            {primaryInfo}
          </p>
        </div>
        <span className="shrink-0 text-[color:var(--ui-text-primary)]">
          <AnimatedWeatherIcon condition={condition} size={headerIconSize} />
        </span>
      </div>

      {forecastUnavailable ? (
        <p className={`${forecastMarginTopClass} text-xs font-medium text-[color:var(--ui-text-tertiary)]`}>
          Previsioni non disponibili
        </p>
      ) : (
        <div
          className={`${forecastMarginTopClass} grid min-w-0 ${forecastGapXClass} ${forecastGapYClass}`}
          style={{ gridTemplateColumns: `repeat(${forecastColumnCount}, minmax(0, 1fr))` }}
        >
          {visibleForecast.map((entry, index) => {
            const high = unit === 'F' ? toFahrenheit(entry.high) : entry.high;
            const low = unit === 'F' ? toFahrenheit(entry.low) : entry.low;
            return (
              <div key={`${entry.label}-${index}`} className="min-w-0 flex flex-1 flex-col items-center text-center">
                <p className={`${forecastLabelClass} font-medium text-[color:var(--ui-text-secondary)]`}>
                  {normalizeForecastLabel(entry.label, entry.datetime, entry.isDaytime, index, forecastType)}
                </p>
                <span className="mt-1 text-[color:var(--ui-text-primary)]">
                  <AnimatedWeatherIcon condition={entry.condition} size={forecastIconSize} />
                </span>
                <p className={`mt-1 font-semibold text-[color:var(--ui-text-primary)] ${forecastHighClass}`}>{`${Math.round(high)}\u00B0`}</p>
                <p className={`${forecastLowClass} text-[color:var(--ui-text-tertiary)]`}>{`${Math.round(low)}\u00B0`}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
