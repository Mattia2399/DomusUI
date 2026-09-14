import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import IrrigationZonesManagementPage from './IrrigationZonesManagementPage';

afterEach(() => cleanup());

const config = {
  rainSensorEnabled: true,
  blockOnRainSensorUnavailable: true,
  maximumManualDurationMin: 30,
  maxConcurrentZones: 1,
  parallelSafetyAcknowledged: false,
  rainDuringCycle: 'stop_immediately' as const,
  rainSensorEntityId: 'binary_sensor.rain',
  weatherEntityId: 'weather.home',
  humidityEntityId: 'sensor.humidity',
  outdoorTempEntityId: 'sensor.temperature',
  soilMoistureEntityId: 'sensor.soil',
  waterUsageEntityId: 'sensor.water',
  waterAverageEntityId: 'sensor.water_average',
  zones: [
    { id: 'north', name: 'Prato Nord', entityId: 'switch.north', soilMoistureEntityId: 'sensor.north_soil', iconKey: 'sprout', enabled: true },
    { id: 'south', name: 'Prato Sud', entityId: 'switch.south', soilMoistureEntityId: '', iconKey: 'leaf', enabled: false },
  ],
};

describe('IrrigationZonesManagementPage', () => {
  it('keeps structural zone actions in one protected nested page', () => {
    const onAddZone = vi.fn();
    const onRemoveZone = vi.fn();
    const onMoveZone = vi.fn();
    const onZoneChange = vi.fn();
    const onSave = vi.fn();

    render(
      <IrrigationZonesManagementPage
        config={config}
        canConfigure
        status="ready"
        hasUnsavedChanges
        sensorOptions={['sensor.north_soil']}
        zoneEntityOptions={['switch.north', 'switch.south']}
        entityStates={{
          'switch.north': { state: 'off', rawAttributes: { friendly_name: 'Prato Nord' } },
          'switch.south': { state: 'off', rawAttributes: { friendly_name: 'Prato Sud' } },
          'sensor.north_soil': { state: '45', rawAttributes: { friendly_name: 'Terreno nord' } },
        }}
        onZoneChange={onZoneChange}
        onAddZone={onAddZone}
        onRemoveZone={onRemoveZone}
        onMoveZone={onMoveZone}
        onSave={onSave}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Gestisci zone' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi zona' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sposta Prato Nord sotto' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Cicli automatici Prato Sud' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rimuovi Prato Sud' }));
    expect(screen.getByRole('heading', { name: 'Rimuovere Prato Sud?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Rimuovi zona' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Salva zone' })[0]!);

    expect(onAddZone).toHaveBeenCalledTimes(1);
    expect(onMoveZone).toHaveBeenCalledWith('north', 1);
    expect(onZoneChange).toHaveBeenCalledWith('south', 'enabled', true);
    expect(onRemoveZone).toHaveBeenCalledWith('south');
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('is fail-closed for users without management permission', () => {
    render(
      <IrrigationZonesManagementPage
        config={config}
        canConfigure={false}
        status="ready"
        hasUnsavedChanges
        sensorOptions={[]}
        zoneEntityOptions={[]}
        entityStates={{}}
        onZoneChange={vi.fn()}
        onAddZone={vi.fn()}
        onRemoveZone={vi.fn()}
        onMoveZone={vi.fn()}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText(/Solo Owner e Admin/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Aggiungi zona' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getAllByRole('button', { name: 'Salva zone' })[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it('explains which edits remain safe during an active cycle', () => {
    render(
      <IrrigationZonesManagementPage
        config={config}
        canConfigure
        status="ready"
        hasUnsavedChanges={false}
        activeSessionCount={1}
        sensorOptions={[]}
        zoneEntityOptions={[]}
        entityStates={{}}
        onZoneChange={vi.fn()}
        onAddZone={vi.fn()}
        onRemoveZone={vi.fn()}
        onMoveZone={vi.fn()}
        onSave={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText('Alcune zone stanno irrigando')).toBeTruthy();
    expect(screen.getByText(/Puoi aggiungere nuove zone/)).toBeTruthy();
  });
});
