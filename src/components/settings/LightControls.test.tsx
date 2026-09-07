import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LightControlsPanel } from './LightControls';

describe('LightControlsPanel', () => {
  afterEach(cleanup);

  it('keeps brightness changes local until the interaction is committed', () => {
    const onBrightnessChange = vi.fn();
    const { container, getByRole, getByText } = render(
      <LightControlsPanel
        lamp={{
          name: 'Luce test',
          isOn: true,
          brightness: 62,
          status: 'on',
          hsColor: [214, 76],
          colorTemp: 3200,
          supportsBrightness: true,
          supportsColor: false,
          supportsColorTemp: false,
        }}
        onToggle={() => undefined}
        onBrightnessChange={onBrightnessChange}
        onColorTempChange={() => undefined}
        onColorChange={() => undefined}
        onWhiteChange={() => undefined}
        onEffectChange={() => undefined}
        onFlash={() => undefined}
      />,
    );

    const slider = getByRole('slider', { name: 'Luminosità lampada' });
    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: '37' } });

    expect(getByText('37%')).not.toBeNull();
    expect(container.querySelector('.ha-light-brightness-slider__handle')).not.toBeNull();
    expect(onBrightnessChange).not.toHaveBeenCalled();

    fireEvent.pointerUp(slider, { target: { value: '37' } });
    expect(onBrightnessChange).toHaveBeenCalledTimes(1);
    expect(onBrightnessChange).toHaveBeenCalledWith(37, undefined);
  });

  it('keeps the panel available when Home Assistant does not expose hs_color', () => {
    const { getByText } = render(
      <LightControlsPanel
        lamp={{
          name: 'Luce senza colore',
          isOn: false,
          brightness: 0,
          status: 'off',
          colorTemp: 3200,
          supportsBrightness: true,
          supportsColor: true,
          supportsColorTemp: false,
        }}
        onToggle={() => undefined}
        onBrightnessChange={() => undefined}
        onColorTempChange={() => undefined}
        onColorChange={() => undefined}
        onWhiteChange={() => undefined}
        onEffectChange={() => undefined}
        onFlash={() => undefined}
      />,
    );

    expect(getByText('Luce senza colore')).not.toBeNull();
  });
});
