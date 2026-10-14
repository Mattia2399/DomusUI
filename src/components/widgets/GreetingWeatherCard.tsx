import React from 'react';
import type { DashboardStateShape } from '../../hooks/useDashboardState';
import type { ForecastDensity, WeatherSecondaryInfo } from '../../types/dashboardModels';
import { GreetingCard } from './GreetingCard';
import { WeatherCard } from './WeatherCard';
import { useCardSize } from './useCardSize';
import { useI18n } from '../../i18n/I18nProvider';

type GreetingWeatherCardProps = {
  state: DashboardStateShape;
  title?: string;
  subtitle?: string;
  titleAuto?: boolean;
  subtitleAuto?: boolean;
  compact?: boolean;
  showDate?: boolean;
  isEditMode?: boolean;
  onWeatherClick?: () => void;
  weatherLayout?: 'auto' | 'card' | 'chip';
  weatherUnit?: 'C' | 'F';
  weatherSecondaryInfo?: WeatherSecondaryInfo;
  weatherForecastDensity?: ForecastDensity;
  weatherShowCondition?: boolean;
  weatherShowPrecipitation?: boolean;
  weatherShowWind?: boolean;
  weatherForecastDays?: number;
  weatherForecastType?: 'daily' | 'hourly' | 'twice_daily';
  weatherConditionOverride?: string;
};

const WEATHER_FORECAST_MIN_WIDTH = 640;

export function GreetingWeatherCard({
  state,
  title,
  subtitle,
  titleAuto = true,
  subtitleAuto = true,
  compact = false,
  showDate = false,
  isEditMode = false,
  onWeatherClick,
  weatherLayout = 'auto',
  weatherUnit = 'C',
  weatherSecondaryInfo = 'auto',
  weatherForecastDensity = 'comfortable',
  weatherShowCondition = true,
  weatherShowPrecipitation = true,
  weatherShowWind = true,
  weatherForecastDays = 4,
  weatherForecastType = 'daily',
  weatherConditionOverride,
}: GreetingWeatherCardProps) {
  const { t } = useI18n();
  const { ref: rowRef, width: rowWidth, hasSize } = useCardSize();
  // The forecast only where the greeting keeps at least 360 px beside it; the
  // chip otherwise. Decided by the card's own width, not the screen's.
  const shouldShowCard = weatherLayout === 'card' || (weatherLayout === 'auto' && hasSize && rowWidth >= WEATHER_FORECAST_MIN_WIDTH);
  const shouldShowChip = !shouldShowCard;
  const handleWeatherClick = () => {
    if (isEditMode) {
      return;
    }
    onWeatherClick?.();
  };

  return (
    <div ref={rowRef} className="h-full w-full min-h-0 min-w-0 overflow-hidden">
      <div className={`flex h-full min-h-0 min-w-0 items-center ${rowWidth >= 500 ? 'gap-5' : 'gap-3'}`}>
        <div className="min-w-0 flex-1 h-full">
          <GreetingCard
            state={state}
            title={title}
            subtitle={subtitle}
            titleAuto={titleAuto}
            subtitleAuto={subtitleAuto}
            compact={compact}
            showDate={showDate}
          />
        </div>
        {shouldShowChip ? (
          <button
            type="button"
            onClick={handleWeatherClick}
            className={`max-h-full w-auto max-w-[10rem] shrink-0 self-center overflow-hidden rounded-2xl py-1.5 pl-1.5 text-right ${
              isEditMode ? 'cursor-default' : 'cursor-pointer'
            }`}
            aria-label={t('home.weather.open')}
          >
            <WeatherCard
              weather={state.weather}
              compactHint
              denseHint
              layout="chip"
              clampTypography
              chipAlignEnd
              unit={weatherUnit}
              forecastType={weatherForecastType}
              forecastDays={weatherForecastDays}
              forecastDensity={weatherForecastDensity}
              secondaryInfo={weatherSecondaryInfo}
              showCondition={weatherShowCondition}
              showPrecipitation={weatherShowPrecipitation}
              showWind={weatherShowWind}
              conditionOverride={weatherConditionOverride}
              showAtmosphericBackground={false}
            />
          </button>
        ) : null}
        {shouldShowCard ? (
          <button
            type="button"
            onClick={handleWeatherClick}
            className={`h-full max-h-[7.5rem] w-[clamp(15rem,32%,20rem)] min-w-[15rem] max-w-[20rem] min-h-0 shrink-0 self-center overflow-hidden rounded-2xl px-2.5 py-1.5 text-left ${
              isEditMode ? 'cursor-default' : 'cursor-pointer'
            }`}
            aria-label={t('home.weather.open')}
          >
            <WeatherCard
              weather={state.weather}
              layout="card"
              denseHint
              unit={weatherUnit}
              forecastType={weatherForecastType}
              forecastDays={weatherForecastDays}
              forecastDensity={weatherForecastDensity}
              secondaryInfo={weatherSecondaryInfo}
              showCondition={weatherShowCondition}
              showPrecipitation={weatherShowPrecipitation}
              showWind={weatherShowWind}
              conditionOverride={weatherConditionOverride}
              showAtmosphericBackground={false}
            />
          </button>
        ) : null}
      </div>
    </div>
  );
}
