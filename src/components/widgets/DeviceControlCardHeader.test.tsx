import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeviceControlCardHeader } from './DeviceControlCardHeader';

describe('DeviceControlCardHeader', () => {
  afterEach(cleanup);

  it('places the primary power icon on the left and the optional mode chip on the right', () => {
    const onToggle = vi.fn();
    const onOpen = vi.fn();
    const onSecondaryClick = vi.fn();
    const { container, getByRole } = render(
      <DeviceControlCardHeader
        title="Ventilatore"
        status="Acceso · 50%"
        icon={<span>F</span>}
        onOpen={onOpen}
        openLabel="Apri controlli"
        onToggle={onToggle}
        toggleLabel="Spegni ventilatore"
        isOn
        toggleDisabled={false}
        secondaryIcon={<span>M</span>}
        secondaryLabel="Modalità"
        onSecondaryClick={onSecondaryClick}
      />,
    );

    const buttons = [...container.querySelectorAll('.device-control-card__header > button')];
    expect(buttons.map((button) => button.className)).toEqual([
      'device-control-card__toggle',
      'device-control-card__meta',
      'device-control-card__secondary',
    ]);
    fireEvent.click(getByRole('button', { name: 'Spegni ventilatore' }));
    expect(onToggle).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(getByRole('button', { name: 'Modalità' }));
    expect(onSecondaryClick).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('omits the mode chip when the entity has no second control', () => {
    const { container } = render(
      <DeviceControlCardHeader
        title="Umidificatore"
        status="Acceso"
        icon={<span>H</span>}
        onOpen={() => undefined}
        openLabel="Apri controlli"
        toggleLabel="Spegni umidificatore"
        isOn
        toggleDisabled={false}
      />,
    );
    expect(container.querySelector('[data-has-secondary="false"]')).not.toBeNull();
    expect(container.querySelector('.device-control-card__secondary')).toBeNull();
  });
});
