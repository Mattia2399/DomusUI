import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Widget } from '../../types/dashboardModels';
import { FanCard } from './FanCard';
import { FAN_FEATURE } from './fanModel';

const widget: Widget = {
  id: 'fan-card-test',
  kind: 'fan',
  title: 'Soggiorno',
  entityId: 'fan.living_room',
  status: 'off',
  isOn: false,
  layout: { i: 'fan-card-test', x: 0, y: 0, w: 2, h: 1 },
};

describe('Fan card', () => {
  afterEach(cleanup);

  it('shows a speed slider only when HA exposes speed control and a percentage', () => {
    const markup = renderToStaticMarkup(
      <FanCard
        widget={widget}
        entity={{ state: 'on', supportedFeatures: 63, rawAttributes: { percentage: 50, speed_count: 4 } }}
        isSelected={false}
        isEditMode={false}
        onOpen={() => undefined}
        onPowerToggle={() => undefined}
        onPercentageChange={() => undefined}
      />,
    );
    expect(markup).toContain('type="range"');
    expect(markup).toContain('50%');
    expect(markup).toContain('data-fan-state="on"');
    expect(markup).toContain('data-fan-control-mode="speed"');
    expect(markup).not.toContain('data-fan-variant');
    expect(markup).toContain('data-segmented="true"');
    expect(markup).toContain('--card-value-segments:4');
  });

  it('keeps unsupported functions and controls out of the card', () => {
    const markup = renderToStaticMarkup(
      <FanCard
        widget={widget}
        entity={{ state: 'off', supportedFeatures: FAN_FEATURE.TURN_ON | FAN_FEATURE.TURN_OFF }}
        isSelected={false}
        isEditMode={false}
        onOpen={() => undefined}
        onPowerToggle={() => undefined}
      />,
    );
    expect(markup).not.toContain('type="range"');
    expect(markup).toContain('data-fan-state="off"');
    expect(markup).not.toContain('device-control-card__secondary');
  });

  it('switches card controls with the right chip and sends commands without opening the panel', () => {
    const onOpen = vi.fn();
    const onPowerToggle = vi.fn();
    const onPresetChange = vi.fn();
    const onOscillationChange = vi.fn();
    const { getByRole, container } = render(
      <FanCard
        widget={widget}
        entity={{ state: 'on', supportedFeatures: 63, rawAttributes: {
          percentage: 50,
          speed_count: 4,
          preset_mode: 'eco',
          preset_modes: ['eco', 'breeze'],
          oscillating: false,
          direction: 'forward',
        } }}
        isSelected={false}
        isEditMode={false}
        onOpen={onOpen}
        onPowerToggle={onPowerToggle}
        onPercentageChange={() => undefined}
        onPresetChange={onPresetChange}
        onOscillationChange={onOscillationChange}
        onDirectionChange={() => undefined}
      />,
    );

    expect(container.querySelector('.device-control-card__toggle')).not.toBeNull();
    fireEvent.click(getByRole('button', { name: 'Spegni ventilatore' }));
    expect(onPowerToggle).toHaveBeenCalledOnce();
    fireEvent.click(getByRole('button', { name: 'Modalità' }));
    expect(onOpen).not.toHaveBeenCalled();
    expect(getByRole('radiogroup', { name: 'Modalità' })).not.toBeNull();
    expect(container.querySelector('.card-control-track--segments')).not.toBeNull();
    expect(container.querySelector('.card-value-slider')).not.toBeNull();
    fireEvent.click(getByRole('radio', { name: 'breeze' }));
    expect(onPresetChange).toHaveBeenCalledWith('breeze');
    fireEvent.click(getByRole('button', { name: 'Oscillazione' }));
    fireEvent.click(getByRole('radio', { name: 'Attiva' }));
    expect(onOscillationChange).toHaveBeenCalledWith(true);
  });
});
