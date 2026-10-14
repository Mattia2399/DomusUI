import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GridEngineRootRenderer } from './GridEngineRootRenderer';
import { GridEngineRootRendererBoundary } from './GridEngineRootRendererBoundary';
import { GridEngineRootRendererSwitch } from './GridEngineRootRendererSwitch';
import {
  calculateGridEngineRootContainerHeight,
  calculateGridEngineRootItemPosition,
  validateGridEngineRootGeometry,
} from './gridEngineRootGeometry';
import { isGridEngine2RendererEnabled } from './rendererFeatureFlag';

const geometry = {
  width: 1200,
  cols: 12,
  rowHeight: 48,
  gap: [12, 12] as const,
  padding: [0, 14] as const,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Grid Engine 2.0 root renderer', () => {
  it('enables the independent flag only for the exact development opt-in', () => {
    expect(isGridEngine2RendererEnabled({ DEV: true, VITE_GRID_ENGINE_2_RENDERER: 'true' })).toBe(true);
    expect(isGridEngine2RendererEnabled({ DEV: true, VITE_GRID_ENGINE_2_RENDERER: 'false' })).toBe(false);
    expect(isGridEngine2RendererEnabled({ DEV: true })).toBe(false);
    expect(isGridEngine2RendererEnabled({ DEV: false, VITE_GRID_ENGINE_2_RENDERER: 'true' })).toBe(false);
  });

  it('matches the legacy rounding contract and complete container height', () => {
    const item = { i: 'root-a', x: 1, y: 2, w: 2, h: 3 };
    expect(calculateGridEngineRootItemPosition(item, geometry)).toEqual({
      left: 101,
      top: 134,
      width: 190,
      height: 168,
    });
    expect(calculateGridEngineRootContainerHeight([item], geometry)).toBe(316);

    const fractional = { ...geometry, width: 1001 };
    const first = calculateGridEngineRootItemPosition({ i: 'first', x: 0, y: 0, w: 5, h: 1 }, fractional);
    const second = calculateGridEngineRootItemPosition({ i: 'second', x: 5, y: 0, w: 7, h: 1 }, fractional);
    expect(second.left - (first.left + first.width)).toBe(fractional.gap[0]);
    expect(second.left + second.width).toBe(fractional.width);
  });

  it('renders real children once at their exact cells and preserves interaction and updates', () => {
    const onClick = vi.fn();
    const layout = [
      { i: 'greeting', x: 0, y: 0, w: 12, h: 1 },
      { i: 'stack-vertical', x: 0, y: 1, w: 4, h: 3 },
      { i: 'stack-horizontal', x: 4, y: 1, w: 4, h: 3 },
      { i: 'stack-grid', x: 8, y: 1, w: 4, h: 3 },
    ];
    function StatefulCard() {
      const [value, setValue] = useState(1);
      return <button onClick={() => { setValue((current) => current + 1); onClick(); }}>Light {value}</button>;
    }

    render(
      <GridEngineRootRenderer {...geometry} breakpoint="xl" layout={layout}>
        <div key="greeting">Greeting</div>
        <div key="stack-vertical">Vertical Stack</div>
        <div key="stack-horizontal">Horizontal Stack</div>
        <div key="stack-grid"><StatefulCard /></div>
      </GridEngineRootRenderer>,
    );

    expect(screen.getAllByText('Greeting')).toHaveLength(1);
    expect(screen.getAllByText('Vertical Stack')).toHaveLength(1);
    expect(screen.getAllByText('Horizontal Stack')).toHaveLength(1);
    const light = screen.getByRole('button', { name: 'Light 1' });
    fireEvent.click(light);
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Light 2' })).toBeDefined();
    expect(document.querySelectorAll('[data-grid-engine-root-item]')).toHaveLength(4);
  });

  it('supports 22 and 30 root items without changing their coordinates', () => {
    for (const count of [22, 30]) {
      const cols = 12;
      const layout = Array.from({ length: count }, (_, index) => ({
        i: `item-${index}`,
        x: index % cols,
        y: Math.floor(index / cols),
        w: 1,
        h: 1,
      }));
      const view = render(
        <div data-testid="root-renderer-probe">
          <GridEngineRootRenderer {...geometry} breakpoint="xl" layout={layout}>
            {layout.map((item) => <div key={item.i}>{item.i}</div>)}
          </GridEngineRootRenderer>
        </div>,
      );
      expect(view.container.querySelectorAll('[data-grid-engine-root-item]')).toHaveLength(count);
      const last = view.container.querySelector(`[data-grid-engine-root-item="item-${count - 1}"]`);
      expect(last?.getAttribute('data-grid-x')).toBe(String((count - 1) % cols));
      expect(last?.getAttribute('data-grid-y')).toBe(String(Math.floor((count - 1) / cols)));
      view.unmount();
    }
  });

  it('rejects invalid and non-representable geometry before rendering', () => {
    expect(validateGridEngineRootGeometry(
      [{ i: 'outside', x: 11, y: 0, w: 2, h: 1 }],
      geometry,
    )).toEqual({ valid: false, reason: 'layout item outside is outside the root grid' });
    expect(validateGridEngineRootGeometry(
      [{ i: 'fractional', x: 0.5, y: 0, w: 1, h: 1 }],
      geometry,
    )).toEqual({ valid: false, reason: 'layout item fractional must use integer cell coordinates' });
    expect(validateGridEngineRootGeometry(
      [
        { i: 'expanded-light', x: 0, y: 0, w: 2, h: 2 },
        { i: 'stale-neighbour', x: 0, y: 1, w: 2, h: 1 },
      ],
      geometry,
    )).toEqual({ valid: false, reason: 'root layout items must not overlap' });
  });

  it('keeps legacy for disabled or invalid input and dynamically activates the custom renderer', async () => {
    const legacyRenderer = vi.fn((children: React.ReactNode) => <div data-testid="legacy">{children}</div>);
    const child = <button key="root-a">Root A</button>;
    const { rerender } = render(
      <GridEngineRootRendererSwitch
        {...geometry}
        enabled={false}
        breakpoint="xl"
        layout={[{ i: 'root-a', x: 0, y: 0, w: 2, h: 1 }]}
        legacyRenderer={legacyRenderer}
      >
        {child}
      </GridEngineRootRendererSwitch>,
    );
    expect(screen.getByTestId('legacy')).toBeDefined();
    expect(document.querySelector('[data-grid-engine-root-renderer]')).toBeNull();

    rerender(
      <GridEngineRootRendererSwitch
        {...geometry}
        enabled
        breakpoint="xl"
        layout={[{ i: 'root-a', x: 0, y: 0, w: 2, h: 1 }]}
        legacyRenderer={legacyRenderer}
      >
        {child}
      </GridEngineRootRendererSwitch>,
    );
    await waitFor(() => expect(document.querySelector('[data-grid-engine-root-renderer]')).not.toBeNull());

    rerender(
      <GridEngineRootRendererSwitch
        {...geometry}
        enabled
        breakpoint="xl"
        layout={[{ i: 'root-a', x: 12, y: 0, w: 2, h: 1 }]}
        legacyRenderer={legacyRenderer}
      >
        {child}
      </GridEngineRootRendererSwitch>,
    );
    expect(screen.getByTestId('legacy')).toBeDefined();

    rerender(
      <GridEngineRootRendererSwitch
        {...geometry}
        enabled
        breakpoint="xl"
        layout={[
          { i: 'root-a', x: 0, y: 0, w: 2, h: 2 },
          { i: 'root-b', x: 0, y: 1, w: 2, h: 1 },
        ]}
        legacyRenderer={legacyRenderer}
      >
        {child}
      </GridEngineRootRendererSwitch>,
    );
    expect(screen.getByTestId('legacy')).toBeDefined();
  });

  it('isolates renderer failures behind the supplied legacy fallback', () => {
    const onError = vi.fn();
    function BrokenRenderer(): React.ReactNode {
      throw new Error('synthetic renderer failure');
    }
    render(
      <GridEngineRootRendererBoundary fallback={<div data-testid="legacy-error-fallback">Legacy</div>} onError={onError}>
        <BrokenRenderer />
      </GridEngineRootRendererBoundary>,
    );
    expect(screen.getByTestId('legacy-error-fallback')).toBeDefined();
    expect(onError).toHaveBeenCalledOnce();
  });
});
