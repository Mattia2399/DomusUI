import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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

  it('sets, shows and cancels the switch-off timer', () => {
    const onSetTimer = vi.fn();
    renderPanel({ timer: null, timerNow: 0, onSetTimer });
    expect(screen.getByText(/Nessun timer attivo/)).toBeTruthy();
    const group = screen.getByRole('group', { name: 'Spegnimento automatico' });
    expect(within(group).getByRole('button', { name: 'Off' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(group).getByRole('button', { name: '30 min' }));
    expect(onSetTimer).toHaveBeenCalledWith(30);
    cleanup();

    renderPanel({ timer: { entityId: plug.entityId, minutes: 60, endsAt: 47 * 60_000 }, timerNow: 0, onSetTimer });
    expect(screen.getByText(/tra 47\smin/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '1 h' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Off' }));
    expect(onSetTimer).toHaveBeenLastCalledWith(0);
    cleanup();

    renderPanel({});
    expect(screen.queryByRole('group', { name: 'Spegnimento automatico' })).toBeNull();
  });
});
