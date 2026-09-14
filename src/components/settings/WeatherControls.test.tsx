import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { DashboardStateShape } from '../../hooks/useDashboardState';
import { WeatherControlsPanel } from './WeatherControls';

function buildWeather(patch: Partial<DashboardStateShape['weather']> = {}): DashboardStateShape['weather'] {
  return {
    available: true,
    source: 'ha',
    location: 'Casa',
    condition: 'sunny',
    temperature: 24,
    feelsLike: 24,
    high: 27,
    low: 18,
    precipitation: 0,
    precipitationAmount: 0,
    pressure: 1018,
    dewPoint: 12,
    cloudCoverage: 5,
    windGustSpeed: 12,
    windBearing: 180,
    humidity: 45,
    windSpeed: 7,
    uvIndex: 4,
    visibility: 30,
    forecast: [],
    ...patch,
  };
}

describe('WeatherControlsPanel data truth', () => {
  afterEach(cleanup);

  it('does not synthesize modules when Home Assistant returns no supporting data', () => {
    render(<WeatherControlsPanel weather={buildWeather()} forecastDays={5} />);

    expect(screen.queryByText('Temperatura')).toBeNull();
    expect(screen.queryByText('Umidita')).toBeNull();
    expect(screen.queryByText('DETTAGLI SLOT SELEZIONATO')).toBeNull();
  });

  it('shows only environmental modules supported by real HA attributes', () => {
    render(<WeatherControlsPanel weather={buildWeather({ rawAttributes: { humidity: 47, pressure: 1016 } })} />);

    expect(screen.getByText('Umidita')).toBeTruthy();
    expect(screen.getByText('Pressione')).toBeTruthy();
    expect(screen.getByText('Umidita').closest('section')?.className).toContain('aspect-square');
    expect(screen.getByText('Pressione').closest('section')?.className).toContain('aspect-square');
    expect(screen.queryByText('Indice UV')).toBeNull();
    expect(screen.queryByText('Vento')).toBeNull();
  });

  it('uses the same three-row responsive structure for compact weather modules', () => {
    render(<WeatherControlsPanel weather={buildWeather({
      rawAttributes: { humidity: 47, pressure: 1016, uv_index: 5, wind_speed: 9 },
    })} />);

    for (const title of ['Umidita', 'Pressione', 'Indice UV', 'Vento']) {
      const module = screen.getByText(title).closest('section');
      expect(module?.className).toContain('aspect-square');
      expect(module?.className).toContain('grid-rows-[auto_minmax(0,1fr)_auto]');
    }
  });

  it('maps Home Assistant conditions to the matching atmospheric header', () => {
    const { rerender } = render(<WeatherControlsPanel weather={buildWeather({ condition: 'sunny' })} />);
    expect(screen.getByText('Soleggiato').closest('section')?.getAttribute('data-weather')).toBe('sunny');

    rerender(<WeatherControlsPanel weather={buildWeather({ condition: 'pouring' })} />);
    expect(screen.getByText('Pioggia intensa').closest('section')?.getAttribute('data-weather')).toBe('rainy');
  });

  it('explains how to configure weather when no entity is available', () => {
    render(<WeatherControlsPanel weather={buildWeather({ available: false, source: 'unavailable', location: 'Meteo non configurato', condition: 'unavailable' })} />);

    expect(screen.getByRole('heading', { name: 'Meteo non configurato' })).toBeTruthy();
    expect(screen.getByText(/weather\.\*/)).toBeTruthy();
  });
});
