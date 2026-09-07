import React from 'react';
import type { DashboardStateShape } from '../../hooks/useDashboardState';
import type { ForecastDensity, WeatherSecondaryInfo } from '../../types/dashboardModels';
import { GreetingCard } from './GreetingCard';
import { WeatherCard } from './WeatherCard';
import { useI18n } from '../../i18n/I18nProvider';

type GreetingWeatherCardProps = {
  state: DashboardStateShape;
  title?: string;
  subtitle?: string;
  titleAuto?: boolean;
  subtitleAuto?: boolean;
  compact?: boolean;
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

export function GreetingWeatherCard({
  state,
  title,
  subtitle,
  titleAuto = true,
  subtitleAuto = true,
  compact = false,
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
  const shouldShowChip = weatherLayout !== 'card';
  const shouldShowCard = weatherLayout !== 'chip';
  const handleWeatherClick = () => {
    if (isEditMode) {
      return;
    }
    onWeatherClick?.();
  };

  return (
    <div className="h-full w-full min-h-0 min-w-0 overflow-hidden">
      <div className="flex h-full min-h-0 min-w-0 items-center gap-3">
        <div className="min-w-0 flex-1 h-full">
          <GreetingCard
            state={state}
            title={title}
            subtitle={subtitle}
            titleAuto={titleAuto}
            subtitleAuto={subtitleAuto}
            compact={compact}
            clampTitle
          />
        </div>
        {shouldShowChip ? (
          <button
            type="button"
            onClick={handleWeatherClick}
            className={`h-full w-[clamp(9rem,30%,14rem)] min-w-[9rem] max-w-[14rem] min-h-0 min-w-0 overflow-hidden rounded-2xl px-3 py-2 text-left ${
              weatherLayout === 'auto' ? 'min-[996px]:hidden' : ''
            } ${isEditMode ? 'cursor-default' : 'cursor-pointer'}`}
            aria-label={t('home.weather.open')}
          >
            <WeatherCard
              weather={state.weather}
              compactHint
              denseHint
              layout="chip"
              clampTypography
              unit={weatherUnit}
              forecastType={weatherForecastType}
              forecastDays={weatherForecastDays}
              forecastDensity={weatherForecastDensity}
              secondaryInfo={weatherSecondaryInfo}
              showCondition={weatherShowCondition}
              showPrecipitation={weatherShowPrecipitation}
              showWind={weatherShowWind}
              conditionOverride={weatherConditionOverride}
            />
          </button>
        ) : null}
        {shouldShowCard ? (
          <button
            type="button"
            onClick={handleWeatherClick}
            className={`h-full w-[clamp(15rem,36%,20rem)] min-w-[15rem] max-w-[20rem] min-h-0 min-w-0 overflow-hidden rounded-2xl px-2.5 py-1.5 text-left ${
              weatherLayout === 'auto' ? 'hidden min-[996px]:block' : ''
            } ${isEditMode ? 'cursor-default' : 'cursor-pointer'}`}
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
            />
          </button>
        ) : null}
      </div>
    </div>
  );
}
