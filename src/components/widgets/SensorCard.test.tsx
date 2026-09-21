import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Widget } from '../../types/dashboardModels';
import { SensorCard } from './SensorCard';

const widget: Widget = {
  id: 'sensor-card-test',
  kind: 'sensor',
  title: 'Qualità aria',
  entityId: 'sensor.air_quality',
  status: 'online',
  isOn: true,
  value: 37,
  unit: '%',
  layout: {
    i: 'sensor-card-test',
    x: 0,
    y: 0,
    w: 2,
    h: 2,
  },
};

function renderSensor(hasValue = true) {
  const value = hasValue ? 37 : undefined;
  return renderToStaticMarkup(
    <SensorCard
      widget={{ ...widget, value }}
      isSelected={false}
      value={value}
      sensorHistory={[28, 31, 35, 37]}
      isEditMode={false}
      onClick={() => undefined}
      liveEntity={
        hasValue
          ? { state: '37', numericValue: 37, unit: '%', rawAttributes: { device_class: 'humidity' } }
          : { state: 'unavailable', unit: '%', rawAttributes: { device_class: 'humidity' } }
      }
    />,
  );
}

describe('SensorCard view contract', () => {
  it('does not expose a JS-owned visual variant', () => {
    expect(renderSensor()).not.toContain('data-sensor-variant');
  });

  it('always renders the fixed slots used by container queries', () => {
    const markup = renderSensor();
    expect(markup).toContain('sensor-card__title');
    expect(markup).toContain('sensor-card__value');
    expect(markup).toContain('sensor-card__trend');
    expect(markup).toContain('sensor-card__visual');
    expect(markup).toContain('sensor-card__stats');
    expect(markup).toContain('data-sensor-group="environment"');
  });

  it('marks unavailable sensors so CSS can remove trend, visual and stats', () => {
    const markup = renderSensor(false);
    expect(markup).toContain('data-sensor-available="false"');
    expect(markup).toContain('aria-label="—"');
  });

  it('renders binary sensor states without numeric charts or statistics', () => {
    const markup = renderToStaticMarkup(
      <SensorCard
        widget={{ ...widget, entityId: 'binary_sensor.garage_door', title: 'Porta garage' }}
        isSelected={false}
        isEditMode={false}
        onClick={() => undefined}
        liveEntity={{ state: 'on', rawAttributes: { device_class: 'garage_door' } }}
      />,
    );
    expect(markup).toContain('data-binary-state="on"');
    expect(markup).toContain('Aperta');
    expect(markup).not.toContain('sensor-card__visual');
    expect(markup).not.toContain('sensor-card__stats');
  });
});

describe('SensorCard pixel reporting', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('reports the layout associated with the measured border box', async () => {
    let resizeCallback: ResizeObserverCallback | null = null;
    class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    const onDisplayMetricsChange = vi.fn();

    const { container } = render(
      <SensorCard
        widget={widget}
        isSelected={false}
        value={37}
        sensorHistory={[28, 31, 35, 37]}
        isEditMode={false}
        onClick={() => undefined}
        onDisplayMetricsChange={onDisplayMetricsChange}
      />,
    );

    const resizeTo = (width: number, height: number) => {
      act(() => {
        const callback = resizeCallback as ResizeObserverCallback | null;
        if (!callback) throw new Error('ResizeObserver callback not registered');
        callback(
          [
            {
              borderBoxSize: [{ inlineSize: width, blockSize: height }],
              contentRect: { width, height },
            } as unknown as ResizeObserverEntry,
          ],
          {} as ResizeObserver,
        );
      });
    };

    resizeTo(104, 48);
    await waitFor(() =>
      expect(onDisplayMetricsChange).toHaveBeenLastCalledWith({
        widgetId: widget.id,
        width: 104,
        height: 48,
        variant: 'mini',
      }),
    );

    resizeTo(104, 112);
    await waitFor(() =>
      expect(onDisplayMetricsChange).toHaveBeenLastCalledWith({
        widgetId: widget.id,
        width: 104,
        height: 112,
        variant: 'compact',
      }),
    );

    resizeTo(192, 112);
    await waitFor(() =>
      expect(onDisplayMetricsChange).toHaveBeenLastCalledWith({
        widgetId: widget.id,
        width: 192,
        height: 112,
        variant: 'standard',
      }),
    );

    resizeTo(296, 112);
    await waitFor(() =>
      expect(onDisplayMetricsChange).toHaveBeenLastCalledWith({
        widgetId: widget.id,
        width: 296,
        height: 112,
        variant: 'full',
      }),
    );
  });
});
