import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DashboardStateShape } from '../../hooks/useDashboardState';
import type { Widget } from '../../types/dashboardModels';
import { LightCard } from './LightCard';

const widget: Widget = {
  id: 'light-card-test',
  kind: 'light',
  title: 'Luce test',
  entityId: 'light.test',
  status: 'on',
  isOn: true,
  value: 62,
  layout: { i: 'light-card-test', x: 0, y: 0, w: 2, h: 2 },
};

const state = {
  lamp: {
    name: 'Luce test',
    isOn: true,
    brightness: 62,
    status: 'on',
    hsColor: [214, 76],
    colorTemp: 3200,
  },
} as DashboardStateShape;

describe('LightCard', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders stable slots and switches the shared slider to color mode', () => {
    const { container, getByRole } = render(
      <LightCard
        widget={widget}
        state={state}
        isSelected={false}
        isEditMode={false}
        onClick={() => undefined}
        onBrightnessChange={() => undefined}
        onColorChange={() => undefined}
        liveLightState={{ state: 'on', toggleOn: true, brightness: 62, supportedColorModes: ['brightness', 'hs'] }}
      />,
    );

    expect(container.querySelector('.light-card__controls')).not.toBeNull();
    expect(container.querySelector('.light-card__details')).not.toBeNull();
    expect(container.firstElementChild?.hasAttribute('data-light-variant')).toBe(false);
    fireEvent.click(getByRole('button', { name: 'Colore' }));
    expect(container.firstElementChild?.getAttribute('data-light-mode')).toBe('color');
    expect(getByRole('slider').getAttribute('max')).toBe('360');
  });

  it('shows the local brightness value in the subtitle while the slider is moving', () => {
    const onBrightnessChange = vi.fn();
    const { getByRole, getByText } = render(
      <LightCard
        widget={widget}
        state={state}
        isSelected={false}
        isEditMode={false}
        onClick={() => undefined}
        onBrightnessChange={onBrightnessChange}
        liveLightState={{ state: 'on', toggleOn: true, brightness: 62, supportedColorModes: ['brightness'] }}
      />,
    );

    fireEvent.change(getByRole('slider'), { target: { value: '37' } });

    expect(getByText('Accesa · 37%')).not.toBeNull();
    expect(onBrightnessChange).not.toHaveBeenCalled();
  });

  it('reports the variant derived from its measured border box', async () => {
    let resizeCallback: ResizeObserverCallback | null = null;
    class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) { resizeCallback = callback; }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    const onDisplayMetricsChange = vi.fn();
    render(
      <LightCard
        widget={widget}
        state={state}
        isSelected={false}
        isEditMode={false}
        onClick={() => undefined}
        onDisplayMetricsChange={onDisplayMetricsChange}
      />,
    );

    act(() => {
      const callback = resizeCallback as ResizeObserverCallback | null;
      if (!callback) throw new Error('ResizeObserver callback not registered');
      callback([{
        borderBoxSize: [{ inlineSize: 192, blockSize: 112 }],
        contentRect: { width: 192, height: 112 },
      } as unknown as ResizeObserverEntry], {} as ResizeObserver);
    });

    await waitFor(() => expect(onDisplayMetricsChange).toHaveBeenLastCalledWith({
      widgetId: widget.id,
      width: 192,
      height: 112,
      variant: 'standard',
    }));
  });

  it('keeps an unavailable entity selectable in edit mode without exposing device commands', () => {
    const onSelect = vi.fn();
    const onBrightnessChange = vi.fn();
    const onColorChange = vi.fn();
    const { container, getByRole } = render(
      <LightCard
        widget={widget}
        state={state}
        isSelected
        isEditMode
        onClick={onSelect}
        onBrightnessChange={onBrightnessChange}
        onColorChange={onColorChange}
        liveLightState={{
          state: 'unavailable',
          stateLabel: 'unavailable',
          supportedColorModes: ['brightness', 'hs'],
        }}
      />,
    );

    fireEvent.click(getByRole('button', { name: 'Configura Luce test' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.light-card__toggle')).toBeNull();
    expect((getByRole('slider') as HTMLInputElement).disabled).toBe(true);
    expect(onBrightnessChange).not.toHaveBeenCalled();
    expect(onColorChange).not.toHaveBeenCalled();
  });
});
