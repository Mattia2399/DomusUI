import { describe, expect, it } from 'vitest';
import {
  createGridEngineEditorResizeOverride,
  prepareGridEngineEditorLayout,
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
  });
});
