import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toDeviceModel } from '../model/device';
import { DeviceCard } from './DeviceCard';

const e = (state: string, attributes: Record<string, unknown>) => ({ state, rawAttributes: attributes });

afterEach(cleanup);

describe('the device card', () => {
  it('a plain switch commands from the body too, and has no panel', () => {
    const onAction = vi.fn();
    const onOpenPanel = vi.fn();
    const model = toDeviceModel('input_boolean.quiet', e('off', { friendly_name: 'Non disturbare' }))!;
    render(<DeviceCard model={model} format="U×2" onAction={onAction} onOpenPanel={onOpenPanel} />);
    const buttons = screen.getAllByRole('button', { name: 'Attiva Non disturbare' });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]);
    expect(onAction).toHaveBeenCalledWith({ type: 'turn_on' });
    expect(onOpenPanel).not.toHaveBeenCalled();
    expect(screen.getByText('Disattivo')).toBeTruthy();
  });

  it('a metered plug opens its panel from the body and says its power', () => {
    const onOpenPanel = vi.fn();
    const model = toDeviceModel('switch.tv', e('on', { friendly_name: 'Presa TV', device_class: 'outlet' }), { watts: 86 })!;
    render(<DeviceCard model={model} format="U×2" onAction={vi.fn()} onOpenPanel={onOpenPanel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Controlli di Presa TV, 86 W' }));
    expect(onOpenPanel).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Spegni Presa TV' })).toBeTruthy();
  });

  it('a plug with a timer says when it turns off', () => {
    const model = toDeviceModel('switch.tv', e('on', { friendly_name: 'Presa TV', device_class: 'outlet' }), { watts: 86 })!;
    const timer = { entityId: 'switch.tv', minutes: 60, endsAt: 47 * 60_000 };
    render(<DeviceCard model={model} format="U×2" timer={timer} timerNow={0} onAction={vi.fn()} onOpenPanel={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Controlli di Presa TV, 86 W · spegne tra 47 min' })).toBeTruthy();
  });

  it('a fan shows its speed as a slider from U×3', () => {
    const onAction = vi.fn();
    const model = toDeviceModel('fan.f', e('on', { friendly_name: 'Ventilatore', percentage: 66, percentage_step: 33.33 }))!;
    const { rerender } = render(<DeviceCard model={model} format="U×2" onAction={onAction} />);
    expect(screen.queryByRole('slider')).toBeNull();
    rerender(<DeviceCard model={model} format="U×3" onAction={onAction} />);
    fireEvent.change(screen.getByRole('slider', { name: 'Velocità Ventilatore' }), { target: { value: '3' } });
    expect(onAction).toHaveBeenCalledWith({ type: 'fan_pct', pct: 100 });
  });
});
