import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DashboardStateShape } from '../../hooks/useDashboardState';
import type { Widget } from '../../types/dashboardModels';
import { ClimateCard } from './ClimateCard';

const widget: Widget = {
  id: 'climate.test',
  kind: 'climate',
  title: 'Clima test',
  entityId: 'climate.test',
  status: 'heat',
  isOn: true,
  layout: { i: 'climate.test', x: 0, y: 0, w: 3, h: 3 },
};

const state = {
  climate: {
    name: 'Clima test',
    mode: 'heat',
    isOn: true,
    status: 'heating',
    currentTemp: 20,
    targetTemp: 22,
    minTemp: 7,
    maxTemp: 35,
    targetTempStep: 0.5,
    hvacModes: ['off', 'heat', 'cool', 'heat_cool', 'dry', 'fan_only'],
    fanModes: ['auto', 'low', 'high'],
  },
} as DashboardStateShape;

describe('ClimateCard mode-aware controls', () => {
  afterEach(() => cleanup());

  it('opens an internal mode overlay and selects a supported mode', () => {
    const onModeChange = vi.fn();
    const { getByRole, queryByRole } = render(
      <ClimateCard
        widget={widget}
        state={state}
        isSelected={false}
        isEditMode={false}
        onClick={() => undefined}
        onModeChange={onModeChange}
        liveEntity={{
          state: 'heat',
          hvacMode: 'heat',
          hvacModes: ['off', 'heat', 'cool', 'heat_cool', 'dry', 'fan_only', 'eco'],
          currentValue: 20,
          targetValue: 22,
          minTemp: 7,
          maxTemp: 35,
        }}
      />,
    );

    fireEvent.click(getByRole('button', { name: 'Modalità: Riscaldamento' }));
    expect(getByRole('dialog', { name: 'Scegli la funzionalità' })).not.toBeNull();
    fireEvent.click(getByRole('button', { name: 'Imposta modalità Raffrescamento' }));
    expect(onModeChange).toHaveBeenCalledWith('cool');
    expect(queryByRole('dialog', { name: 'Scegli la funzionalità' })).toBeNull();
  });

  it('uses humidity controls in dry mode', () => {
    const onTargetHumidityChange = vi.fn();
    const { getByRole, queryByRole } = render(
      <ClimateCard
        widget={{ ...widget, status: 'dry' }}
        state={state}
        isSelected={false}
        isEditMode={false}
        onClick={() => undefined}
        onTargetHumidityChange={onTargetHumidityChange}
        liveEntity={{
          state: 'dry',
          hvacMode: 'dry',
          currentHumidity: 54,
          targetHumidity: 60,
          minHumidity: 30,
          maxHumidity: 80,
          targetHumidityStep: 1,
          supportedFeatures: 4,
        }}
      />,
    );

    expect(queryByRole('button', { name: 'Aumenta temperatura target' })).toBeNull();
    fireEvent.click(getByRole('button', { name: 'Aumenta umidità target' }));
    expect(onTargetHumidityChange).toHaveBeenCalledWith(61);
  });

  it('uses fan status in fan-only mode and power in off mode', () => {
    const onPowerToggle = vi.fn();
    const { getByText, getByRole, rerender, queryByRole } = render(
      <ClimateCard
        widget={{ ...widget, status: 'fan_only' }}
        state={state}
        isSelected={false}
        isEditMode={false}
        onClick={() => undefined}
        liveEntity={{ state: 'fan_only', hvacMode: 'fan_only', fanMode: 'high', fanModes: ['low', 'high'] }}
      />,
    );

    expect(getByText('Velocità ventola')).not.toBeNull();
    expect(queryByRole('button', { name: 'Aumenta temperatura target' })).toBeNull();

    rerender(
      <ClimateCard
        widget={{ ...widget, status: 'off', isOn: false }}
        state={state}
        isSelected={false}
        isEditMode={false}
        onClick={() => undefined}
        onPowerToggle={onPowerToggle}
        liveEntity={{ state: 'off', hvacMode: 'off', currentValue: 20 }}
      />,
    );
    fireEvent.click(getByRole('button', { name: 'Accendi clima' }));
    expect(onPowerToggle).toHaveBeenCalledOnce();
  });

  it('uses the live mock state when the original demo card points to climate.living_room', () => {
    const livingRoomWidget: Widget = {
      ...widget,
      id: 'climate.air_conditioner',
      entityId: 'climate.living_room',
      status: 'heat',
    };
    const { getByRole, queryByRole } = render(
      <ClimateCard
        widget={livingRoomWidget}
        state={state}
        isSelected={false}
        isEditMode={false}
        onClick={() => undefined}
        onTargetHumidityChange={() => undefined}
        liveEntity={{
          state: 'dry',
          stateLabel: 'drying',
          hvacMode: 'dry',
          hvacAction: 'drying',
          currentHumidity: 48,
          targetHumidity: 60,
          minHumidity: 30,
          maxHumidity: 80,
          supportedFeatures: 4,
        }}
      />,
    );

    expect(getByRole('button', { name: 'Aumenta umidità target' })).not.toBeNull();
    expect(queryByRole('button', { name: 'Aumenta temperatura target' })).toBeNull();
  });

  it('adds fan, preset and swing controls only when the measured composition has room', () => {
    const onPresetModeChange = vi.fn();
    const onSwingModeChange = vi.fn();
    const climateEntity = {
      state: 'heat',
      hvacMode: 'heat',
      currentValue: 20.5,
      targetValue: 22,
      fanMode: 'auto',
      fanModes: ['auto', 'high'],
      presetMode: 'comfort',
      presetModes: ['comfort', 'eco'],
      swingMode: 'off',
      swingModes: ['off', 'vertical'],
      currentHumidity: 48,
    };
    const { getByRole, queryByRole, rerender } = render(
      <ClimateCard
        widget={{ ...widget, layout: { ...widget.layout, w: 2, h: 2 } }}
        state={state}
        isSelected={false}
        isEditMode={false}
        onClick={() => undefined}
        onFanModeChange={() => undefined}
        onPresetModeChange={onPresetModeChange}
        onSwingModeChange={onSwingModeChange}
        liveEntity={climateEntity}
      />,
    );

    expect(queryByRole('button', { name: 'Imposta modalità ventola Auto' })).toBeNull();
    expect(queryByRole('button', { name: 'Preset: Comfort' })).toBeNull();

    rerender(
      <ClimateCard
        widget={{ ...widget, layout: { ...widget.layout, w: 3, h: 4 } }}
        state={state}
        isSelected={false}
        isEditMode={false}
        onClick={() => undefined}
        onFanModeChange={() => undefined}
        onPresetModeChange={onPresetModeChange}
        onSwingModeChange={onSwingModeChange}
        liveEntity={climateEntity}
      />,
    );

    expect(getByRole('button', { name: 'Imposta modalità ventola Auto' })).not.toBeNull();
    fireEvent.click(getByRole('button', { name: 'Preset: Comfort' }));
    fireEvent.click(getByRole('button', { name: 'Oscillazione: Ferma' }));
    expect(onPresetModeChange).toHaveBeenCalledWith('eco');
    expect(onSwingModeChange).toHaveBeenCalledWith('vertical');
  });

  it('shows only the mode icon in the compact composition', () => {
    const { getByRole } = render(
      <ClimateCard
        widget={{ ...widget, layout: { ...widget.layout, w: 2, h: 2 } }}
        state={state}
        isSelected={false}
        isEditMode={false}
        onClick={() => undefined}
        onModeChange={() => undefined}
        liveEntity={{ state: 'heat', hvacMode: 'heat', hvacModes: ['heat', 'cool'], targetValue: 22 }}
      />,
    );

    expect(getByRole('button', { name: 'Modalità: Riscaldamento' }).textContent).toBe('');
  });
});
