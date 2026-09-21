import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Widget } from '../../types/dashboardModels';
import { HumidifierCard } from './HumidifierCard';

const widget: Widget = {
  id: 'humidifier-card-test',
  kind: 'humidifier',
  title: 'Camera',
  entityId: 'humidifier.bedroom',
  status: 'on',
  isOn: true,
  layout: { i: 'humidifier-card-test', x: 0, y: 0, w: 3, h: 3 },
};

describe('Humidifier card', () => {
  afterEach(cleanup);

  it('shows target and current humidity from Home Assistant', () => {
    const markup = renderToStaticMarkup(
      <HumidifierCard
        widget={widget}
        entity={{ state: 'on', supportedFeatures: 1, rawAttributes: { humidity: 50, current_humidity: 43, action: 'humidifying', available_modes: ['auto'], mode: 'auto' } }}
        isSelected={false}
        isEditMode={false}
        onOpen={() => undefined}
        onPowerToggle={() => undefined}
        onTargetHumidityChange={() => undefined}
      />,
    );
    expect(markup).toContain('50%');
    expect(markup).toContain('43%');
    expect(markup).toContain('data-humidifier-state="on"');
    expect(markup).toContain('type="range"');
    expect(markup).toContain('card-value-slider__marker');
    expect(markup).toContain('43%');
  });

  it('does not expose humidity controls for an unavailable entity', () => {
    const markup = renderToStaticMarkup(
      <HumidifierCard widget={widget} entity={{ state: 'unavailable' }} isSelected={false} isEditMode={false} onOpen={() => undefined} />,
    );
    expect(markup).toContain('data-humidifier-state="unavailable"');
    expect(markup).not.toContain('type="range"');
    expect(markup).not.toContain('device-control-card__secondary');
  });

  it('shows the target slider in the same compact standard size as a light card', () => {
    const markup = renderToStaticMarkup(
      <HumidifierCard
        widget={{ ...widget, layout: { ...widget.layout, w: 2, h: 1 } }}
        entity={{ state: 'on', supportedFeatures: 1, rawAttributes: { humidity: 50, current_humidity: 43 } }}
        isSelected={false}
        isEditMode={false}
        onOpen={() => undefined}
        onPowerToggle={() => undefined}
        onTargetHumidityChange={() => undefined}
      />,
    );
    expect(markup).toContain('data-humidifier-control-mode="humidity"');
    expect(markup).not.toContain('data-humidifier-variant');
    expect(markup).toContain('type="range"');
    expect(markup).toContain('50%');
    expect(markup).toContain('card-value-slider__marker');
    expect(markup).toContain('humidifier-card__values');
  });

  it('switches from humidity to mode in the card and invokes the HA mode command', () => {
    const onOpen = vi.fn();
    const onModeChange = vi.fn();
    const { container, getByRole } = render(
      <HumidifierCard
        widget={{ ...widget, layout: { ...widget.layout, w: 2, h: 1 } }}
        entity={{ state: 'on', supportedFeatures: 1, rawAttributes: {
          humidity: 50,
          current_humidity: 43,
          mode: 'auto',
          available_modes: ['auto', 'silent'],
        } }}
        isSelected={false}
        isEditMode={false}
        onOpen={onOpen}
        onPowerToggle={() => undefined}
        onTargetHumidityChange={() => undefined}
        onModeChange={onModeChange}
      />,
    );

    expect(getByRole('slider', { name: 'Umidità obiettivo' })).not.toBeNull();
    fireEvent.click(getByRole('button', { name: 'Modalità' }));
    expect(onOpen).not.toHaveBeenCalled();
    expect(getByRole('radiogroup', { name: 'Modalità' })).not.toBeNull();
    expect(container.querySelector('.card-control-track--segments')).not.toBeNull();
    expect(container.querySelector('.card-value-slider')).not.toBeNull();
    fireEvent.click(getByRole('radio', { name: 'silent' }));
    expect(onModeChange).toHaveBeenCalledWith('silent');
    fireEvent.click(getByRole('button', { name: 'Umidità obiettivo' }));
    expect(getByRole('slider', { name: 'Umidità obiettivo' })).not.toBeNull();
  });

  it('labels a target as a target when the current reading is missing', () => {
    const markup = renderToStaticMarkup(
      <HumidifierCard
        widget={widget}
        entity={{ state: 'on', supportedFeatures: 0, rawAttributes: { humidity: 50, device_class: 'dehumidifier' } }}
        isSelected={false} isEditMode={false} onOpen={() => undefined}
      />,
    );
    expect(markup).toContain('Target 50%');
    expect(markup).toContain('data-humidifier-device="dehumidifier"');
    expect(markup).toContain('lucide-droplet-off');
    expect(markup).toContain('Spegni deumidificatore');
    expect(markup).not.toContain('Umidità attuale non disponibile');
  });
});
