import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import IrrigationConfigurationPage, { type IrrigationConfigurationModel } from './IrrigationConfigurationPage';

afterEach(() => cleanup());

const config: IrrigationConfigurationModel = {
  rainSensorEnabled: true,
  blockOnRainSensorUnavailable: true,
  maximumManualDurationMin: 30,
  maxConcurrentZones: 1,
  parallelSafetyAcknowledged: false,
  rainDuringCycle: 'stop_immediately',
  rainSensorEntityId: 'binary_sensor.rain',
  weatherEntityId: 'weather.home',
  humidityEntityId: 'sensor.humidity',
  outdoorTempEntityId: 'sensor.temperature',
  soilMoistureEntityId: 'sensor.soil',
  waterUsageEntityId: 'sensor.water',
  waterAverageEntityId: 'sensor.water_average',
  zones: [{ id: 'garden', name: 'Giardino', entityId: 'switch.garden', soilMoistureEntityId: 'sensor.garden_soil' }],
};

function renderPage(overrides: Partial<React.ComponentProps<typeof IrrigationConfigurationPage>> = {}) {
  const props: React.ComponentProps<typeof IrrigationConfigurationPage> = {
    config,
    canConfigure: true,
    status: 'ready',
    revision: 2,
    hasUnsavedChanges: true,
    binarySensorOptions: ['binary_sensor.rain'],
    weatherOptions: ['weather.home'],
    sensorOptions: ['sensor.humidity', 'sensor.temperature', 'sensor.soil'],
    zoneEntityOptions: ['switch.garden'],
    entityStates: {
      'binary_sensor.rain': { state: 'off', rawAttributes: { friendly_name: 'Pioggia' } },
      'weather.home': { state: 'sunny', rawAttributes: { friendly_name: 'Meteo casa' } },
      'sensor.humidity': { state: '58', rawAttributes: { device_class: 'humidity', unit_of_measurement: '%' } },
      'sensor.temperature': { state: '21', rawAttributes: { device_class: 'temperature', unit_of_measurement: '°C' } },
      'sensor.soil': { state: '44', rawAttributes: { device_class: 'moisture', unit_of_measurement: '%' } },
      'sensor.water': { state: '120', rawAttributes: { device_class: 'water', unit_of_measurement: 'L' } },
      'sensor.water_average': { state: '140', rawAttributes: { device_class: 'water', unit_of_measurement: 'L' } },
      'sensor.garden_soil': { state: '51', rawAttributes: { device_class: 'moisture', unit_of_measurement: '%' } },
      'switch.garden': { state: 'off', rawAttributes: { friendly_name: 'Giardino' } },
    },
    onFieldChange: vi.fn(),
    onApplySuggestedConfiguration: vi.fn(),
    onSave: vi.fn(),
    ...overrides,
  };
  render(<IrrigationConfigurationPage {...props} />);
  return props;
}

describe('IrrigationConfigurationPage', () => {
  it('summarizes the shared mapping and saves an explicit draft', () => {
    const props = renderPage();

    expect(screen.getByRole('heading', { name: 'Impostazioni irrigazione' })).toBeTruthy();
    expect(screen.getByText('7/7')).toBeTruthy();
    expect(screen.getAllByText('1/1').length).toBeGreaterThan(0);
    expect(screen.getByRole('slider', { name: 'Durata massima irrigazione manuale' }).getAttribute('max')).toBe('60');
    expect(screen.getByTestId('irrigation-mobile-save-dock').className).toContain('fixed');

    fireEvent.click(screen.getAllByRole('button', { name: 'Salva configurazione' })[0]);
    expect(props.onSave).toHaveBeenCalledTimes(1);
  });

  it('is read-only for a user without house-management permission', () => {
    renderPage({ canConfigure: false });

    expect(screen.getByText(/Solo Owner e Admin/)).toBeTruthy();
    expect((screen.getAllByRole('button', { name: 'Salva configurazione' })[0] as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('switch', { name: 'Blocca quando piove' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('applies ranked Home Assistant suggestions through one explicit action', () => {
    const onApplySuggestedConfiguration = vi.fn();
    renderPage({
      config: {
        ...config,
        rainSensorEntityId: '',
        weatherEntityId: '',
        zones: [{ ...config.zones[0]!, entityId: '' }],
      },
      onApplySuggestedConfiguration,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Completa sorgenti' }));
    expect(onApplySuggestedConfiguration).toHaveBeenCalledTimes(1);
    expect(onApplySuggestedConfiguration.mock.calls[0]?.[0]).toMatchObject({
      rainSensorEntityId: 'binary_sensor.rain',
      weatherEntityId: 'weather.home',
      zones: [{ entityId: '' }],
    });
  });

  it('does not save a structurally unsafe configuration', () => {
    const onSave = vi.fn();
    renderPage({
      config: {
        ...config,
        zones: [
          { ...config.zones[0]!, id: 'first' },
          { ...config.zones[0]!, id: 'second' },
        ],
      },
      onSave,
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Salva configurazione' })[0]!);
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/problemi da correggere/)).toBeTruthy();
  });

  it('changes the concurrent-zone limit with explicit stepper controls', () => {
    const onFieldChange = vi.fn();
    renderPage({
      config: {
        ...config,
        zones: [
          config.zones[0]!,
          { ...config.zones[0]!, id: 'terrace', name: 'Terrazzo', entityId: 'switch.terrace' },
        ],
      },
      zoneEntityOptions: ['switch.garden', 'switch.terrace'],
      entityStates: {
        'switch.garden': { state: 'off', rawAttributes: { friendly_name: 'Giardino' } },
        'switch.terrace': { state: 'off', rawAttributes: { friendly_name: 'Terrazzo' } },
      },
      onFieldChange,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Aumenta zone simultanee' }));
    expect(onFieldChange).toHaveBeenCalledWith('maxConcurrentZones', 2);
  });
});
