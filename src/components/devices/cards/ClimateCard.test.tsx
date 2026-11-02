// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClimateModel } from '../model/climate';
import { DEVICE_CARD_FORMATS } from './DeviceCardShell';
import { ClimateCard } from './ClimateCard';

afterEach(cleanup);

const heating: ClimateModel = {
  entityId: 'climate.living',
  name: 'Clima Soggiorno',
  available: true,
  mode: 'heat',
  modes: ['off', 'heat', 'cool', 'heat_cool'],
  activity: 'heating',
  current: 20.5,
  target: 22,
  low: null,
  high: null,
  min: 7,
  max: 35,
  step: 0.5,
  fanModes: [],
  fanMode: null,
  swingModes: [],
  swing: null,
  presets: [],
  preset: null,
};

describe('ClimateCard on the Home grid', () => {
  it('keeps the room cards unchanged when no format is given', () => {
    const { container } = render(<ClimateCard model={heating} onAction={vi.fn()} onOpenPanel={vi.fn()} />);
    const card = container.querySelector('[data-testid="climate-card"]');
    expect(card?.getAttribute('data-format')).toBeNull();
    expect(card?.classList.contains('dv-climate-format')).toBe(false);
  });

  it('draws the three sizes: the tile, the target with − and +, then the modes', () => {
    const shapes = { 'U×2': [0, false], 'U×4': [2, false], 'W×4': [2, true] } as const;
    for (const [format, [steps, modes]] of Object.entries(shapes)) {
      const { container, unmount } = render(
        <ClimateCard model={heating} format={format as keyof typeof shapes} onAction={vi.fn()} onOpenPanel={vi.fn()} />,
      );
      expect(screen.queryAllByRole('button', { name: /temperatura/i }).length, format).toBe(steps);
      expect(Boolean(screen.queryByRole('radiogroup')), format).toBe(modes);
      if (format !== 'U×2') {
        expect(container.querySelector('[data-testid="climate-card"]')?.getAttribute('data-format')).toBe(format);
      }
      unmount();
    }
  });

  it('turns the quick modes and the steps into climate actions', () => {
    const onAction = vi.fn();
    render(<ClimateCard model={heating} format="W×6" onAction={onAction} onOpenPanel={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Freddo' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'mode', mode: 'cool' });
    expect(screen.getByRole('radio', { name: 'Caldo' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getAllByRole('button', { name: /alza/i })[0]);
    expect(onAction).toHaveBeenCalledWith({ type: 'step', delta: 1 });
  });

  it('selects instead of opening while the Home is being edited', () => {
    const onOpenPanel = vi.fn();
    const onSelect = vi.fn();
    const onAction = vi.fn();
    const { container } = render(
      <ClimateCard model={heating} format="W×4" editing selected onAction={onAction} onOpenPanel={onOpenPanel} onSelect={onSelect} />,
    );
    fireEvent.click(container.querySelector('.dv-tile-body')!);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onOpenPanel).not.toHaveBeenCalled();
    expect(container.querySelector('.dv-check.is-selected')).not.toBeNull();
  });
});
