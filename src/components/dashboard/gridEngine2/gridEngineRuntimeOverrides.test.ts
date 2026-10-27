import { describe, expect, it } from 'vitest';
import { deriveGridEngineRuntimeOverrides } from './gridEngineRuntimeOverrides';

const roots = [
  { id: 'light', role: 'widget' as const, kind: 'light' },
  { id: 'below', role: 'widget' as const, kind: 'sensor' },
];

describe('Grid Engine runtime overrides', () => {
  it('keeps legacy Light defaults when no metrics version is supplied', () => {
    const structural = [
      { i: 'light', x: 0, y: 0, w: 2, h: 1 },
      { i: 'below', x: 0, y: 1, w: 2, h: 1 },
    ] as const;
    const result = deriveGridEngineRuntimeOverrides({
      breakpoint: 'xl',
      cols: 12,
      structuralLayout: structural,
      legacyRuntimeLayout: structural,
      rootElements: roots,
      lightStates: [{ id: 'light', isOn: true }],
    });

    expect(result.structuralLayout).toEqual(structural);
    expect(result.overrides).toEqual([{ id: 'light', w: 2, h: 2 }]);
    expect(structural[0]).toEqual({ i: 'light', x: 0, y: 0, w: 2, h: 1 });
  });

  it('prepares v2 Light 2-to-3 runtime spans without mutating structural input', () => {
    const structural = [
      { i: 'light', x: 0, y: 0, w: 2, h: 2 },
      { i: 'below', x: 0, y: 2, w: 2, h: 2 },
    ] as const;
    const snapshot = structuredClone(structural);
    const result = deriveGridEngineRuntimeOverrides({
      breakpoint: 'xl',
      cols: 12,
      metricsVersion: 'v2',
      structuralLayout: structural,
      legacyRuntimeLayout: structural,
      rootElements: roots,
      lightStates: [{ id: 'light', isOn: true }],
    });

    expect(result.structuralLayout).toEqual(structural);
    expect(result.overrides).toEqual([{ id: 'light', w: 2, h: 3 }]);
    expect(structural).toEqual(snapshot);
  });

  it('does not emit a structural override for an off v2 Light', () => {
    const structural = [
      { i: 'light', x: 0, y: 0, w: 2, h: 2 },
      { i: 'below', x: 0, y: 2, w: 2, h: 2 },
    ] as const;
    const result = deriveGridEngineRuntimeOverrides({
      breakpoint: 'xl',
      cols: 12,
      metricsVersion: 'v2',
      structuralLayout: structural,
      legacyRuntimeLayout: structural,
      rootElements: roots,
      lightStates: [{ id: 'light', isOn: false }],
    });

    expect(result.overrides).toEqual([]);
    expect(result.structuralLayout).toEqual(structural);
  });
});
