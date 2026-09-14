import type { TranslationKey } from '../i18n/translations';

export type WeatherBackdrop =
  | 'sunny'
  | 'night'
  | 'partly-cloudy'
  | 'cloudy'
  | 'rainy'
  | 'storm'
  | 'snowy'
  | 'windy'
  | 'neutral';

const conditionKeys: Record<string, TranslationKey> = {
  sunny: 'controls.weather.condition.sunny',
  'clear-night': 'controls.weather.condition.clearNight',
  partlycloudy: 'controls.weather.condition.partlyCloudy',
  cloudy: 'controls.weather.condition.cloudy',
  fog: 'controls.weather.condition.fog',
  rainy: 'controls.weather.condition.rainy',
  pouring: 'controls.weather.condition.pouring',
  lightning: 'controls.weather.condition.lightning',
  'lightning-rainy': 'controls.weather.condition.lightningRainy',
  snowy: 'controls.weather.condition.snowy',
  'snowy-rainy': 'controls.weather.condition.snowyRainy',
  hail: 'controls.weather.condition.hail',
  windy: 'controls.weather.condition.windy',
  'windy-variant': 'controls.weather.condition.windyVariant',
  exceptional: 'controls.weather.condition.exceptional',
};

export function getWeatherBackdrop(condition: string | undefined): WeatherBackdrop {
  switch ((condition ?? '').trim().toLowerCase()) {
    case 'sunny': return 'sunny';
    case 'clear-night': return 'night';
    case 'partlycloudy': return 'partly-cloudy';
    case 'cloudy':
    case 'fog': return 'cloudy';
    case 'rainy':
    case 'pouring': return 'rainy';
    case 'lightning':
    case 'lightning-rainy':
    case 'exceptional': return 'storm';
    case 'snowy':
    case 'snowy-rainy':
    case 'hail': return 'snowy';
    case 'windy':
    case 'windy-variant': return 'windy';
    default: return 'neutral';
  }
}

export function getWeatherConditionLabel(
  condition: string | undefined,
  translate: (key: TranslationKey) => string,
) {
  const normalized = (condition ?? '').trim().toLowerCase();
  const key = conditionKeys[normalized];
  return key ? translate(key) : condition || '';
}
