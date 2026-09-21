import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HumidifierControls } from './HumidifierControls';

describe('HumidifierControls', () => {
  afterEach(cleanup);

  it('keeps the humidity ring and switches modes through the shared segmented selector', () => {
    const onModeChange = vi.fn();
    const { getByRole } = render(
      <HumidifierControls
        name="Umidificatore test"
        entity={{ state: 'on', supportedFeatures: 1, rawAttributes: {
          humidity: 50,
          current_humidity: 42,
          mode: 'auto',
          available_modes: ['auto', 'silent'],
        } }}
        onPowerToggle={() => undefined}
        onTargetHumidityChange={() => undefined}
        onModeChange={onModeChange}
      />,
    );

    expect(getByRole('slider')).not.toBeNull();
    expect(getByRole('radiogroup')).not.toBeNull();
    fireEvent.click(getByRole('radio', { name: 'silent' }));
    expect(onModeChange).toHaveBeenCalledWith('silent');
  });
});
