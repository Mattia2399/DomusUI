import { describe, expect, it } from 'vitest';
import {
  createGridEngineEditorResizeOverride,
  prepareGridEngineEditorLayout,
  shouldMirrorGridEngineCanonicalSection,
} from './gridEngineEditorIntegration';

const structural = [
  { i: 'light', x: 0, y: 0, w: 2, h: 1 },
  { i: 'sensor', x: 2, y: 0, w: 2, h: 2 },
];

describe('Grid Engine 2 real editor integration', () => {
  it('keeps effective coordinates while removing runtime Light height', () => {
    const result = prepareGridEngineEditorLayout({
      effectiveLayout: [
        { i: 'light', x: 0, y: 0, w: 2, h: 2 },
        { i: 'sensor', x: 2, y: 1, w: 2, h: 2 },
      ],
      structuralLayout: structural,
      rootIds: ['light', 'sensor'],
      stackIds: new Set(),
      cols: 4,
      origin: 'legacy-derived',
    });
    expect(result).toEqual({ status: 'ready', origin: 'legacy-derived', layout: [
      { i: 'light', x: 0, y: 0, w: 2, h: 1 },
      { i: 'sensor', x: 2, y: 1, w: 2, h: 2 },
    ] });
  });

  it('rejects missing, duplicate, overlapping, and out-of-bounds roots', () => {
    const base = {
      structuralLayout: structural,
      rootIds: ['light', 'sensor'],
      stackIds: new Set<string>(),
      cols: 4,
      origin: 'explicit' as const,
    };
    expect(prepareGridEngineEditorLayout({ ...base, effectiveLayout: [structural[0]] })).toEqual({
      status: 'fallback', reason: 'ROOT_ID_MISMATCH',
    });
    expect(prepareGridEngineEditorLayout({
      ...base,
      effectiveLayout: [structural[0], { ...structural[0] }],
    })).toEqual({ status: 'fallback', reason: 'ROOT_ID_MISMATCH' });
    expect(prepareGridEngineEditorLayout({
      ...base,
      effectiveLayout: [structural[0], { ...structural[1], x: 1 }],
    })).toEqual({ status: 'fallback', reason: 'INVALID_STRUCTURAL_GEOMETRY' });
    expect(prepareGridEngineEditorLayout({
      ...base,
      effectiveLayout: [structural[0], { ...structural[1], x: 3 }],
    })).toEqual({ status: 'fallback', reason: 'INVALID_STRUCTURAL_GEOMETRY' });
  });

  it('falls back when a dynamic Stack span cannot be classified as structural', () => {
    expect(prepareGridEngineEditorLayout({
      effectiveLayout: [{ i: 'stack', x: 0, y: 0, w: 4, h: 5 }],
      structuralLayout: [{ i: 'stack', x: 0, y: 0, w: 4, h: 3 }],
      rootIds: ['stack'],
      stackIds: new Set(['stack']),
      cols: 12,
      origin: 'explicit',
    })).toEqual({ status: 'fallback', reason: 'UNSUPPORTED_DYNAMIC_STACK' });
  });

  it('uses the existing widget override shape for resize, including legacy Light expansion', () => {
    expect(createGridEngineEditorResizeOverride('sensor', 3, 4)).toEqual({ w: 3, h: 4 });
    expect(createGridEngineEditorResizeOverride('light', 3, 1)).toEqual({
      w: 3, hOff: 1, hOn: 2, autoExpand: true,
    });
    expect(createGridEngineEditorResizeOverride('light', 3, 3)).toEqual({
      w: 3, h: 3, hOff: 3, hOn: 3, autoExpand: false,
    });
    expect(createGridEngineEditorResizeOverride('light', 2, 2, undefined, undefined, 'v2')).toEqual({
      w: 2, hOff: 2, hOn: 3, autoExpand: true,
    });
    expect(createGridEngineEditorResizeOverride('light', 4, 4, undefined, undefined, 'v2')).toEqual({
      w: 4, h: 4, hOff: 4, hOn: 4, autoExpand: false,
    });
  });

  it('mirrors coherent XL geometry exactly, including the v2 Greeting height', () => {
    const greeting = { i: 'section-greeting-1', x: 0, y: 0, w: 12, h: 3 };

    expect(shouldMirrorGridEngineCanonicalSection({
      baselineCanonical: greeting,
      baselineXl: greeting,
      currentCanonical: greeting,
      currentXl: greeting,
      committedXl: greeting,
    })).toBe(true);
  });

  it('preserves only an unchanged historical canonical/XL difference', () => {
    const baselineCanonical = { i: 'section-greeting-1', x: 0, y: 0, w: 12, h: 2 };
    const baselineXl = { i: 'section-greeting-1', x: 0, y: 0, w: 12, h: 3 };

    expect(shouldMirrorGridEngineCanonicalSection({
      baselineCanonical,
      baselineXl,
      currentCanonical: baselineCanonical,
      currentXl: baselineXl,
      committedXl: baselineXl,
    })).toBe(false);
    expect(shouldMirrorGridEngineCanonicalSection({
      baselineCanonical,
      baselineXl,
      currentCanonical: baselineCanonical,
      currentXl: baselineXl,
      committedXl: { ...baselineXl, y: 4 },
    })).toBe(true);
    expect(shouldMirrorGridEngineCanonicalSection({
      baselineCanonical,
      baselineXl,
      currentCanonical: baselineCanonical,
      currentXl: { ...baselineXl, h: 4 },
      committedXl: { ...baselineXl, h: 4 },
    })).toBe(true);
    expect(shouldMirrorGridEngineCanonicalSection({
      baselineCanonical,
      baselineXl,
      currentCanonical: baselineCanonical,
      currentXl: baselineXl,
      committedXl: baselineXl,
      allowHistoricalDifference: false,
    })).toBe(true);
  });
});
