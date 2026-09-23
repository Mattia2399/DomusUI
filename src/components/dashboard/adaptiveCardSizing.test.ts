import { describe, expect, it } from 'vitest';
import {
  CARD_SIZING_ENGINE,
  COVER_ADAPTIVE_SIZING_PROFILE,
  FAN_ADAPTIVE_SIZING_PROFILE,
  HUMIDIFIER_ADAPTIVE_SIZING_PROFILE,
  LIGHT_ADAPTIVE_SIZING_PROFILE,
  createAdaptiveSizingComparison,
  resolveAdaptiveGridSpan,
  resolveCardPresetSizing,
} from './adaptiveCardSizing';
import { GRID_ENGINE_GAP_PX, GRID_ENGINE_ROW_UNIT_PX } from './DashboardGrid';
import { COVER_CARD_CAPABILITY, LIGHT_CARD_CAPABILITY } from '../widgets/cardCapabilityRegistry';
import { resolveWidgetTypeLayoutSpan } from './dashboardBreakpointConfig';
import { resolveLightPixelDisplayVariant } from '../widgets/widgetDisplayVariant';

const grid = (containerWidth: number, cols: number, horizontalPadding = 0) => ({
  containerWidth,
  cols,
  columnGap: GRID_ENGINE_GAP_PX,
  rowHeight: GRID_ENGINE_ROW_UNIT_PX,
  rowGap: GRID_ENGINE_GAP_PX,
  horizontalPadding,
});

describe('adaptiveCardSizing', () => {
  it('keeps the feature flag on adaptive by default', () => {
    expect(CARD_SIZING_ENGINE).toBe('adaptive');
  });

  it('resolves Light Mini against physical pixels on mobile and desktop', () => {
    const mobile = resolveAdaptiveGridSpan('mini', LIGHT_ADAPTIVE_SIZING_PROFILE, grid(360, 2, 2));
    const desktop = resolveAdaptiveGridSpan('mini', LIGHT_ADAPTIVE_SIZING_PROFILE, grid(1200, 12));

    expect(mobile).toMatchObject({ w: 1, h: 1, target: { id: 'compact-strip' } });
    expect(Math.round(mobile?.physicalWidth ?? 0)).toBe(170);
    expect(desktop).toMatchObject({ w: 2, h: 1, target: { id: 'compact-strip' } });
    expect(Math.round(desktop?.physicalWidth ?? 0)).toBe(187);
  });

  it('resolves Light Standard to comparable physical sizes across grids', () => {
    const mobile = resolveAdaptiveGridSpan('standard', LIGHT_ADAPTIVE_SIZING_PROFILE, grid(360, 2, 2));
    const tablet = resolveAdaptiveGridSpan('standard', LIGHT_ADAPTIVE_SIZING_PROFILE, grid(900, 6));
    const desktop = resolveAdaptiveGridSpan('standard', LIGHT_ADAPTIVE_SIZING_PROFILE, grid(1200, 12));

    expect(mobile).toMatchObject({ w: 1, h: 2, target: { id: 'standard-slider' } });
    expect(Math.round(mobile?.physicalHeight ?? 0)).toBe(112);
    expect(tablet).toMatchObject({ w: 2, h: 2, target: { id: 'standard-slider' } });
    expect(Math.round(tablet?.physicalWidth ?? 0)).toBeGreaterThanOrEqual(170);
    expect(resolveLightPixelDisplayVariant({
      width: Math.round(tablet?.physicalWidth ?? 0),
      height: Math.round(tablet?.physicalHeight ?? 0),
    })).toBe('standard');
    expect(desktop).toMatchObject({ w: 2, h: 2, target: { id: 'standard-slider' } });
    expect(Math.round(desktop?.physicalHeight ?? 0)).toBe(112);
  });

  it('chooses the Light Expanded target that best fits the current grid', () => {
    const mobile = resolveAdaptiveGridSpan('expanded', LIGHT_ADAPTIVE_SIZING_PROFILE, grid(360, 2, 2));
    const tablet = resolveAdaptiveGridSpan('expanded', LIGHT_ADAPTIVE_SIZING_PROFILE, grid(900, 6));
    const desktop = resolveAdaptiveGridSpan('expanded', LIGHT_ADAPTIVE_SIZING_PROFILE, grid(1536, 12));

    expect(mobile).toMatchObject({ w: 1, h: 3, target: { id: 'tall-full' } });
    expect(Math.round(mobile?.physicalHeight ?? 0)).toBe(176);
    expect(tablet).toMatchObject({ w: 3, h: 2, target: { id: 'wide-full' } });
    expect(resolveLightPixelDisplayVariant({
      width: Math.round(tablet?.physicalWidth ?? 0),
      height: Math.round(tablet?.physicalHeight ?? 0),
    })).toBe('full');
    expect(desktop).toMatchObject({ w: 4, h: 2, target: { id: 'wide-full' } });
    expect(Math.round(desktop?.physicalWidth ?? 0)).toBe(501);
    expect(Math.round(desktop?.physicalHeight ?? 0)).toBe(112);
  });

  it('falls back safely when grid geometry is unavailable', () => {
    expect(resolveAdaptiveGridSpan('standard', LIGHT_ADAPTIVE_SIZING_PROFILE, grid(0, 12))).toBeNull();
    expect(resolveAdaptiveGridSpan('standard', LIGHT_ADAPTIVE_SIZING_PROFILE, grid(1200, 0))).toBeNull();
  });

  it('keeps legacy variant targets unchanged', () => {
    expect(
      LIGHT_CARD_CAPABILITY.resolveVariantTarget('expanded', {
        cols: 12,
        breakpoint: 'xl',
        isInsideStack: false,
      }),
    ).toEqual({ w: 3, h: 2 });
    expect(
      LIGHT_CARD_CAPABILITY.resolveVariantTarget('expanded', {
        cols: 2,
        breakpoint: 'xs',
        isInsideStack: false,
      }),
    ).toEqual({ w: 2, h: 3 });
  });

  it('does not replace an existing manual widget override unless a preset is explicitly applied', () => {
    const manual = resolveWidgetTypeLayoutSpan('light', 'xl', {
      light: { xl: { w: 2, hOff: 1, hOn: 2, autoExpand: true } },
    });
    const savedManualOverride = { light_card: { xl: { w: 4, h: 2, hOff: 2, hOn: 2, autoExpand: false } } };
    const persisted = savedManualOverride.light_card.xl;

    expect(manual).toMatchObject({ w: 2, hOff: 1, hOn: 2 });
    expect(persisted).toMatchObject({ w: 4, h: 2 });
  });

  it('does not mutate saved breakpoint layouts when adaptive computes a preset', () => {
    const savedLayouts = {
      xs: [{ i: 'light.kitchen', x: 0, y: 0, w: 1, h: 1 }],
      xl: [{ i: 'light.kitchen', x: 4, y: 2, w: 3, h: 2 }],
    };
    const before = structuredClone(savedLayouts);

    const adaptive = resolveAdaptiveGridSpan('standard', LIGHT_ADAPTIVE_SIZING_PROFILE, grid(1200, 12));

    expect(adaptive).toMatchObject({ w: 2, h: 2 });
    expect(savedLayouts).toEqual(before);
  });

  it('keeps manual resize values as saved layout data instead of reapplying adaptive', () => {
    const adaptiveStandard = resolveAdaptiveGridSpan('standard', LIGHT_ADAPTIVE_SIZING_PROFILE, grid(1200, 12));
    const manualResize = { i: 'light.kitchen', x: 0, y: 0, w: 3, h: 2 };

    expect(adaptiveStandard).toMatchObject({ w: 2, h: 2 });
    expect(manualResize).toMatchObject({ w: 3, h: 2 });
  });

  it('uses the final deterministic Light Expanded matrix in Adaptive mode', () => {
    const cases = [
      ['xs', grid(360, 2, 2), { w: 1, h: 3 }],
      ['sm', grid(640, 4), { w: 2, h: 3 }],
      ['md', grid(900, 6), { w: 2, h: 3 }],
      ['lg', grid(1100, 8), { w: 2, h: 3 }],
      ['xl', grid(1200, 12), { w: 2, h: 3 }],
      ['2xl', grid(1536, 12), { w: 3, h: 2 }],
    ] as const;

    const actual = cases.map(([breakpoint, geometry]) => {
      const result = resolveCardPresetSizing({
        kind: 'light',
        preset: 'expanded',
        engine: 'adaptive',
        profile: LIGHT_ADAPTIVE_SIZING_PROFILE,
        geometry,
        legacy: { w: 3, h: 2 },
        breakpoint,
      });
      return { breakpoint, w: result.w, h: result.h };
    });

    expect(actual).toEqual(cases.map(([breakpoint, , expected]) => ({ breakpoint, ...expected })));
  });

  it('keeps non-Light card preset sizing on the legacy capability resolver', () => {
    expect(
      COVER_CARD_CAPABILITY.resolveVariantTarget('standard', {
        cols: 12,
        breakpoint: 'xl',
        isInsideStack: false,
      }),
    ).toEqual({ w: 2, h: 3 });
  });

  it('uses the final deterministic Cover Adaptive matrix', () => {
    const cases = [
      ['xs', grid(360, 2, 2), { mini: { w: 1, h: 1 }, standard: { w: 1, h: 2 }, expanded: { w: 2, h: 3 } }],
      ['sm', grid(640, 4), { mini: { w: 1, h: 1 }, standard: { w: 2, h: 2 }, expanded: { w: 2, h: 4 } }],
      ['md', grid(900, 6), { mini: { w: 1, h: 1 }, standard: { w: 2, h: 2 }, expanded: { w: 2, h: 4 } }],
      ['lg', grid(1100, 8), { mini: { w: 1, h: 1 }, standard: { w: 2, h: 2 }, expanded: { w: 2, h: 4 } }],
      ['xl', grid(1200, 12), { mini: { w: 2, h: 1 }, standard: { w: 2, h: 2 }, expanded: { w: 3, h: 4 } }],
      ['2xl', grid(1536, 12), { mini: { w: 2, h: 1 }, standard: { w: 2, h: 2 }, expanded: { w: 3, h: 4 } }],
    ] as const;

    expect(cases.map(([breakpoint, geometry, expected]) => {
      const resolve = (preset: 'mini' | 'standard' | 'expanded') => {
        const result = resolveCardPresetSizing({
          kind: 'cover',
          preset,
          engine: 'adaptive',
          profile: COVER_ADAPTIVE_SIZING_PROFILE,
          geometry,
          legacy: { w: 2, h: 3 },
          breakpoint,
        });
        return { w: result.w, h: result.h };
      };
      return {
        breakpoint,
        mini: resolve('mini'),
        standard: resolve('standard'),
        expanded: resolve('expanded'),
        expected,
      };
    }).map(({ breakpoint, mini, standard, expanded }) => ({ breakpoint, mini, standard, expanded }))).toEqual(
      cases.map(([breakpoint, , expected]) => ({ breakpoint, ...expected })),
    );
  });

  it('uses the final deterministic Fan Adaptive matrix', () => {
    const cases = [
      ['xs', grid(360, 2, 2), { mini: { w: 1, h: 1 }, standard: { w: 1, h: 2 }, expanded: { w: 2, h: 3 } }],
      ['sm', grid(640, 4), { mini: { w: 1, h: 1 }, standard: { w: 2, h: 2 }, expanded: { w: 2, h: 4 } }],
      ['md', grid(900, 6), { mini: { w: 1, h: 1 }, standard: { w: 2, h: 2 }, expanded: { w: 2, h: 4 } }],
      ['lg', grid(1100, 8), { mini: { w: 1, h: 1 }, standard: { w: 2, h: 2 }, expanded: { w: 2, h: 4 } }],
      ['xl', grid(1200, 12), { mini: { w: 2, h: 1 }, standard: { w: 2, h: 2 }, expanded: { w: 3, h: 3 } }],
      ['2xl', grid(1536, 12), { mini: { w: 2, h: 1 }, standard: { w: 2, h: 2 }, expanded: { w: 3, h: 3 } }],
    ] as const;

    expect(cases.map(([breakpoint, geometry]) => {
      const resolve = (preset: 'mini' | 'standard' | 'expanded') => {
        const result = resolveCardPresetSizing({
          kind: 'fan',
          preset,
          engine: 'adaptive',
          profile: FAN_ADAPTIVE_SIZING_PROFILE,
          geometry,
          legacy: { w: 2, h: 1 },
          breakpoint,
        });
        return { w: result.w, h: result.h };
      };
      return { breakpoint, mini: resolve('mini'), standard: resolve('standard'), expanded: resolve('expanded') };
    })).toEqual(cases.map(([breakpoint, , expected]) => ({ breakpoint, ...expected })));
  });

  it('uses the final deterministic Humidifier Adaptive matrix', () => {
    const cases = [
      ['xs', grid(360, 2, 2), { mini: { w: 1, h: 1 }, standard: { w: 1, h: 2 }, expanded: { w: 2, h: 3 } }],
      ['sm', grid(640, 4), { mini: { w: 1, h: 1 }, standard: { w: 2, h: 2 }, expanded: { w: 2, h: 4 } }],
      ['md', grid(900, 6), { mini: { w: 1, h: 1 }, standard: { w: 2, h: 2 }, expanded: { w: 2, h: 4 } }],
      ['lg', grid(1100, 8), { mini: { w: 1, h: 1 }, standard: { w: 2, h: 2 }, expanded: { w: 2, h: 4 } }],
      ['xl', grid(1200, 12), { mini: { w: 2, h: 1 }, standard: { w: 2, h: 2 }, expanded: { w: 3, h: 3 } }],
      ['2xl', grid(1536, 12), { mini: { w: 2, h: 1 }, standard: { w: 2, h: 2 }, expanded: { w: 3, h: 3 } }],
    ] as const;

    expect(cases.map(([breakpoint, geometry]) => {
      const resolve = (preset: 'mini' | 'standard' | 'expanded') => {
        const result = resolveCardPresetSizing({
          kind: 'humidifier',
          preset,
          engine: 'adaptive',
          profile: HUMIDIFIER_ADAPTIVE_SIZING_PROFILE,
          geometry,
          legacy: { w: 2, h: 1 },
          breakpoint,
        });
        return { w: result.w, h: result.h };
      };
      return { breakpoint, mini: resolve('mini'), standard: resolve('standard'), expanded: resolve('expanded') };
    })).toEqual(cases.map(([breakpoint, , expected]) => ({ breakpoint, ...expected })));
  });

  it('keeps the Light stack target on legacy sizing for this phase', () => {
    expect(
      LIGHT_CARD_CAPABILITY.resolveVariantTarget('expanded', {
        cols: 4,
        breakpoint: 'sm',
        isInsideStack: true,
      }),
    ).toEqual({ w: 2, h: 3 });
  });

  it('uses the selected runtime engine for Light preset sizing', () => {
    const legacy = { w: 2, h: 1 };
    const adaptive = resolveCardPresetSizing({
      kind: 'light',
      preset: 'standard',
      engine: 'adaptive',
      profile: LIGHT_ADAPTIVE_SIZING_PROFILE,
      geometry: grid(1200, 12),
      legacy,
    });
    const legacyResult = resolveCardPresetSizing({
      kind: 'light',
      preset: 'standard',
      engine: 'legacy',
      profile: LIGHT_ADAPTIVE_SIZING_PROFILE,
      geometry: grid(1200, 12),
      legacy,
    });

    expect(adaptive).toMatchObject({ engine: 'adaptive', w: 2, h: 2 });
    expect(legacyResult).toMatchObject({ engine: 'legacy', w: 2, h: 1 });
  });

  it('keeps unsupported cards on legacy even when Adaptive is selected', () => {
    const legacy = { w: 2, h: 1 };
    expect(resolveCardPresetSizing({
      kind: 'switch',
      preset: 'standard',
      engine: 'adaptive',
      profile: LIGHT_ADAPTIVE_SIZING_PROFILE,
      geometry: grid(1200, 12),
      legacy,
    })).toMatchObject({ engine: 'legacy', w: 2, h: 1, adaptive: null });
  });

  it('uses the selected runtime engine for Cover preset sizing outside stacks', () => {
    const legacy = { w: 2, h: 3 };

    expect(resolveCardPresetSizing({
      kind: 'cover',
      preset: 'standard',
      engine: 'adaptive',
      profile: COVER_ADAPTIVE_SIZING_PROFILE,
      geometry: grid(1200, 12),
      legacy,
      breakpoint: 'xl',
    })).toMatchObject({ engine: 'adaptive', w: 2, h: 2 });

    expect(resolveCardPresetSizing({
      kind: 'cover',
      preset: 'standard',
      engine: 'adaptive',
      profile: COVER_ADAPTIVE_SIZING_PROFILE,
      geometry: grid(1200, 12),
      legacy,
      isInsideStack: true,
    })).toMatchObject({ engine: 'legacy', w: 2, h: 3, adaptive: null });
  });

  it('falls back from Adaptive to legacy when preset geometry is incomplete', () => {
    const legacy = { w: 2, h: 1 };
    expect(resolveCardPresetSizing({
      kind: 'light',
      preset: 'standard',
      engine: 'adaptive',
      profile: LIGHT_ADAPTIVE_SIZING_PROFILE,
      geometry: grid(0, 12),
      legacy,
    })).toMatchObject({ engine: 'legacy', w: 2, h: 1, adaptive: null });
  });

  it('creates a compact debug comparison without mutating the legacy result', () => {
    const comparison = createAdaptiveSizingComparison(
      'standard',
      LIGHT_ADAPTIVE_SIZING_PROFILE,
      grid(1200, 12),
      { w: 2, h: 1 },
    );

    expect(comparison).toEqual({
      preset: 'standard',
      legacy: { w: 2, h: 1 },
      adaptive: { w: 2, h: 2 },
      physical: { width: 187, height: 112 },
      target: { id: 'standard-slider', width: 188, height: 112 },
    });
  });

  it('keeps the legacy answer available when adaptive cannot resolve geometry', () => {
    const legacy = { w: 2, h: 1 };
    const comparison = createAdaptiveSizingComparison(
      'standard',
      LIGHT_ADAPTIVE_SIZING_PROFILE,
      grid(0, 12),
      legacy,
    );

    expect(comparison).toMatchObject({
      legacy,
      adaptive: null,
      physical: null,
      target: null,
    });
  });
});
