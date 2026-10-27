import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toDeviceModel } from '../model/device';
import type { PlugEnergy } from '../model/plugEnergy';
import { DevicePanel } from './DevicePanel';

afterEach(cleanup);

const plug = toDeviceModel('switch.fridge', { state: 'on', rawAttributes: { friendly_name: 'Frigorifero', device_class: 'outlet' } }, { watts: 96 })!;
const day = (cost: number | null, month: number | null = 38.6): PlugEnergy => ({
  hours: Array.from({ length: 24 }, (_, hour) => (hour <= 10 ? 0.05 : null)),
  hourNow: 10,
  today: 0.55,
  month,
  cost,
});

function renderPanel(props: Partial<React.ComponentProps<typeof DevicePanel>>) {
  render(<DevicePanel model={plug} protectedPlug={false} onAction={vi.fn()} onClose={vi.fn()} {...props} />);
}

describe('the plug panel', () => {
  it('says what the plug used today and this month, and what today cost', () => {
    renderPanel({ energy: day(0.2) });
    expect(screen.getByText('Oggi')).toBeTruthy();
    expect(screen.getByText('0,55 kWh')).toBeTruthy();
    expect(screen.getByText('38,60 kWh')).toBeTruthy();
    expect(screen.getByText(/≈ 0,20\s€/)).toBeTruthy();
  });

  it('offers to set a tariff when there is none, and leaves the cost out when it cannot', () => {
    const onSetTariff = vi.fn();
    renderPanel({ energy: day(null), onSetTariff });
    fireEvent.click(screen.getByRole('button', { name: 'Imposta tariffa' }));
    expect(onSetTariff).toHaveBeenCalledTimes(1);
    cleanup();
    renderPanel({ energy: day(null, null) });
    expect(screen.queryByText('Costo oggi')).toBeNull();
    expect(screen.queryByText('Questo mese')).toBeNull();
  });

  it('shows only the power now without statistics', () => {
    renderPanel({ energy: null });
    expect(screen.getByText('96')).toBeTruthy();
    expect(screen.queryByText('Oggi')).toBeNull();
  });
});
