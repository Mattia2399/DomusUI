import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { DashboardStateShape } from '../../hooks/useDashboardState';
import { WeatherCard } from './WeatherCard';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';

const unavailableWeather: DashboardStateShape['weather'] = {
  available: false,
  source: 'unavailable',
  location: 'Meteo non configurato',
  condition: 'unavailable',
  temperature: 0,
  feelsLike: 0,
  high: 0,
  low: 0,
  precipitation: 0,
  precipitationAmount: 0,
  pressure: 0,
  dewPoint: 0,
  cloudCoverage: 0,
  windGustSpeed: 0,
  windBearing: '--',
  humidity: 0,
  windSpeed: 0,
  uvIndex: 0,
  visibility: 0,
  forecast: [],
};

const availableWeather: DashboardStateShape['weather'] = {
  ...unavailableWeather,
  available: true,
  source: 'mock',
  location: 'Casa',
  condition: 'pouring',
  temperature: 18,
  high: 20,
  low: 14,
};

describe('WeatherCard data truth', () => {
  afterEach(cleanup);

  it('shows an explicit configuration state instead of mock measurements', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
    render(<I18nProvider><WeatherCard weather={unavailableWeather} layout="card" /></I18nProvider>);

    expect(screen.getByRole('status').textContent).toContain('Meteo non configurato');
    expect(screen.getByText('Seleziona un’entità weather.*')).toBeTruthy();
  });

  it('shares the translated atmospheric presentation used by the weather panel', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
    render(<I18nProvider><WeatherCard weather={availableWeather} layout="card" secondaryInfo="condition" /></I18nProvider>);

    const surface = screen.getByText('Pioggia intensa').closest('[data-weather]');
    expect(surface?.getAttribute('data-weather')).toBe('rainy');
    expect(surface?.className).toContain('weather-condition-card');
  });
});
