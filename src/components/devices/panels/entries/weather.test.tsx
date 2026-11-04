import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DashboardStateShape } from '../../../../hooks/useDashboardState';
import { PanelServicesProvider } from '../panelServicesContext';
import { PanelView } from '../PanelView';
import { weatherEntry, weatherSkyOf, type WeatherPanelInput } from './weather';

afterEach(cleanup);

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

function draw(input: Partial<WeatherPanelInput> & { weather?: DashboardStateShape['weather'] } = {}) {
  function View() {
    return <PanelView spec={weatherEntry.useSpec({ weather: buildWeather(), ...input })} onClose={vi.fn()} />;
  }
  return render(<View />);
}

const hourAt = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

describe('the weather, with only what is real', () => {
  it('has the temperature large and no tile without data', () => {
    draw();
    expect(screen.getByText('24°')).toBeTruthy();
    expect(screen.getAllByText('Soleggiato').length).toBeGreaterThan(0);
    expect(screen.queryByRole('region', { name: 'Percepita' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Umidità' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Prossime ore' })).toBeNull();
    expect(screen.queryByRole('region', { name: /^Prossimi/ })).toBeNull();
  });

  it('shows only the tiles the entity gives', () => {
    draw({ weather: buildWeather({ rawAttributes: { humidity: 47, pressure: 1016 } }) });
    expect(within(screen.getByRole('region', { name: 'Umidità' })).getByText('47%')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Pressione' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Indice UV' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Vento' })).toBeNull();
  });

  it('leaves the wind out when the card says so', () => {
    draw({ weather: buildWeather({ rawAttributes: { wind_speed: 9 } }), showWind: false });
    expect(screen.queryByRole('region', { name: 'Vento' })).toBeNull();
  });

  it('has an alert only if the integration publishes one', () => {
    draw();
    expect(screen.queryByRole('status')).toBeNull();
    cleanup();
    draw({ weather: buildWeather({ rawAttributes: { alerts: [{ title: 'Allerta temporali', description: 'Fino alle 21' }] } }) });
    expect(screen.getByRole('status').textContent).toContain('Allerta temporali');
  });

  it('asks for the hours and the days, and writes the chance of rain only where it counts', async () => {
    const callApi = vi.fn(async (message: Record<string, unknown>) => {
      if (message.forecast_type === 'hourly') {
        return { 'weather.casa': { forecast: [{ datetime: hourAt(1), condition: 'cloudy', temperature: 20, precipitation_probability: 10 }, { datetime: hourAt(2), condition: 'rainy', temperature: 19, precipitation_probability: 70 }] } };
      }
      return { 'weather.casa': { forecast: [{ datetime: hourAt(0), condition: 'sunny', temperature: 26, templow: 12 }, { datetime: hourAt(24), condition: 'rainy', temperature: 14, templow: 9 }] } };
    });
    function View() {
      return <PanelView spec={weatherEntry.useSpec({ weather: buildWeather(), entityId: 'weather.casa' })} onClose={vi.fn()} />;
    }
    render(
      <PanelServicesProvider value={{ callApi: callApi as never, callService: vi.fn() }}>
        <View />
      </PanelServicesProvider>,
    );
    const hours = await screen.findByRole('region', { name: 'Prossime ore' });
    expect(within(hours).getByText('70%')).toBeTruthy();
    expect(within(hours).queryByText('10%')).toBeNull();
    await waitFor(() => expect(screen.getByRole('region', { name: 'Prossimi 2 giorni' })).toBeTruthy());
    expect(callApi).toHaveBeenCalledWith(expect.objectContaining({ type: 'weather/get_forecasts', forecast_type: 'daily' }), expect.anything());
  });

  it('puts the days on one scale', () => {
    const forecast = [
      { label: 'a', condition: 'sunny', high: 20, low: 10, precipitation: 0 },
      { label: 'b', condition: 'sunny', high: 30, low: 20, precipitation: 0 },
    ];
    const { container } = draw({ weather: buildWeather({ temperature: 15, forecast }) });
    const bars = [...container.querySelectorAll<HTMLElement>('.panel-weather-scale > i')];
    expect(bars[0].style.left).toBe('0%');
    expect(bars[0].style.width).toBe('50%');
    expect(bars[1].style.left).toBe('50%');
  });

  it('follows the sky', () => {
    expect(weatherSkyOf('sunny')).toBe('day');
    expect(weatherSkyOf('partlycloudy')).toBe('day');
    expect(weatherSkyOf('partlycloudy', true)).toBe('night');
    expect(weatherSkyOf('clear-night')).toBe('night');
    expect(weatherSkyOf('pouring')).toBe('rain');
    expect(weatherSkyOf('lightning-rainy')).toBe('storm');
    expect(weatherSkyOf('cloudy')).toBe('cloud');
  });

  it('explains how to configure the weather when there is no entity', () => {
    draw({ weather: buildWeather({ available: false, source: 'unavailable', location: 'Meteo non configurato', condition: 'unavailable' }) });
    expect(screen.getByRole('heading', { name: 'Meteo non configurato' })).toBeTruthy();
    expect(screen.getByText(/weather\.\*/)).toBeTruthy();
  });
});
