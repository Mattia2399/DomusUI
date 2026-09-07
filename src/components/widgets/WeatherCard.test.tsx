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

describe('WeatherCard data truth', () => {
  afterEach(cleanup);

  it('shows an explicit configuration state instead of mock measurements', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
    render(<I18nProvider><WeatherCard weather={unavailableWeather} layout="card" /></I18nProvider>);

    expect(screen.getByRole('status').textContent).toContain('Meteo non configurato');
    expect(screen.getByText('Seleziona un’entità weather.*')).toBeTruthy();
  });
});
