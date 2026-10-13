import { describe, expect, it, vi } from 'vitest';
import { DASHBOARD_GRID_BREAKPOINT_ORDER } from '../../../types/widgetTypeLayout';
import type { ShadowLayoutAdapterInput } from './shadowLayoutAdapter';
import { analyzeShadowLayouts } from './shadowLayoutDiagnostics';
import {
  GRID_ENGINE_2_SHADOW_LOG_PREFIX,
  runGridEngine2ShadowMode,
} from './shadowMode';
import { isGridEngine2ShadowEnabled } from './shadowFeatureFlag';

function createInput(): ShadowLayoutAdapterInput {
  const root = [{ i: 'widget', x: 0, y: 0, w: 2, h: 2 }];
  const layouts = Object.fromEntries(
    DASHBOARD_GRID_BREAKPOINT_ORDER.map((breakpoint) => [breakpoint, structuredClone(root)]),
  );
  return {
    sections: [],
    widgets: [{ id: 'widget', kind: 'light', layout: { ...root[0] } }],
    explicitResponsiveLayouts: {},
    legacyLayouts: layouts,
    runtimeLayouts: structuredClone(layouts),
  };
}

describe('Grid Engine 2.0 Shadow execution boundary', () => {
  it('enables the feature only in development with the exact true value', () => {
    expect(isGridEngine2ShadowEnabled({ DEV: true, VITE_GRID_ENGINE_2_SHADOW: 'true' })).toBe(true);
    expect(isGridEngine2ShadowEnabled({ DEV: true, VITE_GRID_ENGINE_2_SHADOW: 'false' })).toBe(false);
    expect(isGridEngine2ShadowEnabled({ DEV: true })).toBe(false);
    expect(isGridEngine2ShadowEnabled({ DEV: false, VITE_GRID_ENGINE_2_SHADOW: 'true' })).toBe(false);
  });

  it('does not calculate, log, or retain a signature while disabled', () => {
    const analyze = vi.fn(analyzeShadowLayouts);
    const logger = { info: vi.fn(), warn: vi.fn() };
    const result = runGridEngine2ShadowMode(createInput(), { enabled: false, analyze, logger });

    expect(result).toEqual({ status: 'disabled', nextSignature: null });
    expect(analyze).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('analyzes and logs one compact structured report', () => {
    const logger = { info: vi.fn(), warn: vi.fn() };
    const result = runGridEngine2ShadowMode(createInput(), {
      enabled: true,
      logger,
      now: (() => {
        const values = [10, 12.345];
        return () => values.shift() ?? 12.345;
      })(),
    });

    expect(result.status).toBe('reported');
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info.mock.calls[0][0]).toBe(GRID_ENGINE_2_SHADOW_LOG_PREFIX);
    expect(logger.info.mock.calls[0][1]).toMatchObject({
      event: 'report',
      durationMs: 2.35,
      summary: { rootElementCount: 1 },
    });
    expect(logger.info.mock.calls[0][1]).not.toHaveProperty('breakpoints.xl.differences');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('skips unchanged signatures before invoking the analyzer', () => {
    const input = createInput();
    const analyze = vi.fn(analyzeShadowLayouts);
    const first = runGridEngine2ShadowMode(input, { enabled: true, analyze, logger: { info: vi.fn(), warn: vi.fn() } });
    const second = runGridEngine2ShadowMode(input, {
      enabled: true,
      previousSignature: first.nextSignature,
      analyze,
      logger: { info: vi.fn(), warn: vi.fn() },
    });

    expect(first.status).toBe('reported');
    expect(second.status).toBe('unchanged');
    expect(analyze).toHaveBeenCalledTimes(1);
  });

  it('reports async initial A and authoritative B once each, then skips an unchanged B reread', async () => {
    const initialA = createInput();
    const definitiveRoot = [{ i: 'widget', x: 0, y: 4, w: 2, h: 2 }];
    const definitiveLayouts = Object.fromEntries(
      DASHBOARD_GRID_BREAKPOINT_ORDER.map((breakpoint) => [breakpoint, structuredClone(definitiveRoot)]),
    );
    const authoritativeB: ShadowLayoutAdapterInput = {
      ...initialA,
      widgets: [{ id: 'widget', kind: 'light', layout: { ...definitiveRoot[0] } }],
      legacyLayouts: definitiveLayouts,
      runtimeLayouts: structuredClone(definitiveLayouts),
    };
    const analyze = vi.fn(analyzeShadowLayouts);
    const logger = { info: vi.fn(), warn: vi.fn() };
    let previousSignature: string | null = null;

    const runAfterLoad = async (input: ShadowLayoutAdapterInput) => {
      await Promise.resolve();
      const result = runGridEngine2ShadowMode(input, {
        enabled: true,
        previousSignature,
        analyze,
        logger,
      });
      previousSignature = result.nextSignature;
      return result;
    };

    const initial = await runAfterLoad(initialA);
    const definitive = await runAfterLoad(authoritativeB);
    const unchangedReread = await runAfterLoad(structuredClone(authoritativeB));

    expect(initial.status).toBe('reported');
    expect(definitive.status).toBe('reported');
    expect(definitive.nextSignature).not.toBe(initial.nextSignature);
    expect(unchangedReread.status).toBe('unchanged');
    expect(analyze).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenCalledTimes(2);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('contains analyzer failures and suppresses logger failures', () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(() => {
        throw new Error('logger failed');
      }),
    };
    const result = runGridEngine2ShadowMode(createInput(), {
      enabled: true,
      logger,
      analyze: () => {
        throw new Error('diagnostic failed');
      },
    });

    expect(result).toMatchObject({ status: 'failed', errorMessage: 'diagnostic failed' });
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('has no callback channel and leaves frozen dashboard inputs unchanged', () => {
    const input = createInput();
    const before = structuredClone(input);
    Object.freeze(input.sections);
    Object.freeze(input.widgets);
    Object.freeze(input.legacyLayouts);
    Object.freeze(input.runtimeLayouts);

    expect(() => runGridEngine2ShadowMode(input, {
      enabled: true,
      logger: { info: vi.fn(), warn: vi.fn() },
    })).not.toThrow();
    expect(input).toEqual(before);
    expect(Object.keys(input).some((key) => /^on[A-Z]/.test(key))).toBe(false);
  });
});
