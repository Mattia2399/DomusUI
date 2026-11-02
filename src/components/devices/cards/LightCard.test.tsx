import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toLightModel } from '../model/light';
import { LightCard } from './LightCard';

const dimmable = toLightModel('light.lamp', {
  state: 'on',
  rawAttributes: { friendly_name: 'Lampada da terra', supported_color_modes: ['color_temp'], brightness: 184, color_temp_kelvin: 2700 },
});
const plain = toLightModel('light.wall', { state: 'off', rawAttributes: { friendly_name: 'Applique', supported_color_modes: ['onoff'] } });

afterEach(cleanup);

describe('the light card', () => {
  it('turns off from the icon and opens the panel from the body', () => {
    const onAction = vi.fn();
    const onOpenPanel = vi.fn();
    render(<LightCard model={dimmable} format="U×2" onAction={onAction} onOpenPanel={onOpenPanel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Spegni Lampada da terra' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'turn_off' });
    fireEvent.click(screen.getByRole('button', { name: 'Controlli di Lampada da terra, 72% · calda' }));
    expect(onOpenPanel).toHaveBeenCalledTimes(1);
  });

  it('without anything but on and off, the body commands like the icon and shows no chevron', () => {
    const onAction = vi.fn();
    const onOpenPanel = vi.fn();
    const { container } = render(<LightCard model={plain} format="U×2" onAction={onAction} onOpenPanel={onOpenPanel} />);
    const buttons = screen.getAllByRole('button', { name: 'Accendi Applique' });
    expect(buttons).toHaveLength(2);
    buttons.forEach((button) => fireEvent.click(button));
    expect(onAction).toHaveBeenCalledTimes(2);
    expect(onOpenPanel).not.toHaveBeenCalled();
    expect(container.querySelector('.dv-chevron')).toBeNull();
  });

  it('while editing, selects instead of commanding or opening', () => {
    const onAction = vi.fn();
    const onOpenPanel = vi.fn();
    const onSelect = vi.fn();
    render(<LightCard model={dimmable} format="U×2" editing onAction={onAction} onOpenPanel={onOpenPanel} onSelect={onSelect} />);
    const select = screen.getByRole('button', { name: 'Seleziona Lampada da terra' });
    fireEvent.click(select);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onAction).not.toHaveBeenCalled();
    expect(onOpenPanel).not.toHaveBeenCalled();
  });

  it('takes the three sizes of the board: the tile, then the level and slider, then the tones', () => {
    const onAction = vi.fn();
    const { container, rerender } = render(<LightCard model={dimmable} format="U×2" onAction={onAction} />);
    expect(screen.queryByRole('slider')).toBeNull();
    rerender(<LightCard model={dimmable} format="U×4" onAction={onAction} />);
    expect(screen.getByText('% luminosità')).toBeTruthy();
    fireEvent.change(screen.getByRole('slider', { name: 'Luminosità Lampada da terra' }), { target: { value: '40' } });
    expect(onAction).toHaveBeenCalledWith({ type: 'brightness', pct: 40 });
    rerender(<LightCard model={dimmable} format="W×4" onAction={onAction} />);
    const tones = Array.from(container.querySelectorAll<HTMLButtonElement>('.dv-pills .dv-pill'));
    expect(tones).toHaveLength(3);
    fireEvent.click(tones[2]);
    expect(onAction).toHaveBeenCalledWith({ type: 'kelvin', kelvin: 6500 });
    // A lit light that grew to three rows keeps the slider of the tile.
    rerender(<LightCard model={dimmable} format="U×3" onAction={onAction} />);
    expect(screen.getByRole('slider')).toBeTruthy();
  });

  it('cannot be commanded when the light is away', () => {
    const away = toLightModel('light.hood', { state: 'unavailable', rawAttributes: { friendly_name: 'Cappa' } });
    render(<LightCard model={away} format="U×2" onAction={vi.fn()} />);
    expect(screen.getByText('Non disponibile')).toBeTruthy();
    screen.getAllByRole('button').forEach((button) => expect((button as HTMLButtonElement).disabled).toBe(true));
  });
});
