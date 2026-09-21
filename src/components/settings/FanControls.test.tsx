import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FanControls } from './FanControls';

describe('FanControls', () => {
  afterEach(cleanup);

  it('uses a segmented circular speed control and segmented selectors for supported features', () => {
    const onPercentageChange = vi.fn();
    const onPresetChange = vi.fn();
    const onOscillationChange = vi.fn();
    const { container, getByRole } = render(
      <FanControls
        name="Ventilatore test"
        entity={{ state: 'on', supportedFeatures: 63, rawAttributes: {
          percentage: 50,
          speed_count: 4,
          preset_mode: 'eco',
          preset_modes: ['eco', 'breeze'],
          oscillating: false,
          direction: 'forward',
        } }}
        onPowerToggle={() => undefined}
        onPercentageChange={onPercentageChange}
        onPresetChange={onPresetChange}
        onOscillationChange={onOscillationChange}
        onDirectionChange={() => undefined}
      />,
    );

    const speed = getByRole('slider');
    expect(speed.getAttribute('data-slider-segments')).toBe('4');
    expect(container.querySelector('.fan-panel__rotor--active')).not.toBeNull();
    fireEvent.keyDown(speed, { key: 'ArrowRight' });
    expect(onPercentageChange).toHaveBeenCalledWith(75);
    fireEvent.click(getByRole('radio', { name: 'breeze' }));
    expect(onPresetChange).toHaveBeenCalledWith('breeze');
    fireEvent.click(getByRole('radio', { name: 'Attiva' }));
    expect(onOscillationChange).toHaveBeenCalledWith(true);
  });
});
