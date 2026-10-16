import { describe, expect, it, vi } from 'vitest';
import type { GridLayoutItem } from './model';
import {
  isGridEngine2RuntimeShadowEnabled,
  isGridEngine2RuntimeShadowIdDetailsEnabled,
  isGridEngine2RuntimeShadowReconciliationEnabled,
} from './runtimeShadowFeatureFlag';
import {
  evaluateRuntimeShadowBaseline,
  type RuntimeShadowRootElement,
} from './runtimeShadowBaseline';
import { deriveRuntimeShadowOverrides } from './runtimeShadowOverrides';
import {
  analyzeRuntimeShadow,
  createRuntimeShadowInputSignature,
  type RuntimeShadowInput,
} from './runtimeShadowDiagnostics';
import { runGridEngine2RuntimeShadowMode } from './runtimeShadowMode';

const roots: RuntimeShadowRootElement[] = [
  { id: 'light', role: 'widget', kind: 'light' },
  { id: 'below', role: 'widget', kind: 'sensor' },
];
const structural: GridLayoutItem[] = [
  { i: 'light', x: 0, y: 0, w: 2, h: 1 },
  { i: 'below', x: 0, y: 1, w: 2, h: 1 },
];
const expanded: GridLayoutItem[] = [
  { i: 'light', x: 0, y: 0, w: 2, h: 2 },
  { i: 'below', x: 0, y: 2, w: 2, h: 1 },
];

function runtimeInput(overrides: Partial<RuntimeShadowInput> = {}): RuntimeShadowInput {
  return {
    breakpoint: 'xl',
    cols: 12,
    rootElements: roots,
    hasExplicitLayout: true,
    explicitLayout: structural,
    derivedLayout: structural,
    legacyRuntimeInput: structural,
    lightStates: [{ id: 'light', isOn: false }],
    ...overrides,
  };
}

function packedFixture(count: number): RuntimeShadowInput {
  const layout = Array.from({ length: count }, (_, index) => ({
    i: `root-${index}`,
    x: (index % 6) * 2,
    y: Math.floor(index / 6),
    w: 2,
    h: 1,
  }));
  return runtimeInput({
    rootElements: layout.map((item) => ({ id: item.i, role: 'widget', kind: 'sensor' })),
    explicitLayout: layout,
    derivedLayout: layout,
    legacyRuntimeInput: layout,
    lightStates: [],
  });
}

describe('Runtime Shadow feature boundary', () => {
  it('is development-only, exact and disabled by default', () => {
    expect(isGridEngine2RuntimeShadowEnabled({ DEV: true })).toBe(false);
    expect(isGridEngine2RuntimeShadowEnabled({ DEV: true, VITE_GRID_ENGINE_2_RUNTIME_SHADOW: true })).toBe(false);
    expect(isGridEngine2RuntimeShadowEnabled({ DEV: true, VITE_GRID_ENGINE_2_RUNTIME_SHADOW: 'true' })).toBe(true);
    expect(isGridEngine2RuntimeShadowEnabled({ DEV: false, VITE_GRID_ENGINE_2_RUNTIME_SHADOW: 'true' })).toBe(false);
    expect(isGridEngine2RuntimeShadowIdDetailsEnabled({
      DEV: true,
      VITE_GRID_ENGINE_2_RUNTIME_SHADOW: 'true',
      VITE_GRID_ENGINE_2_RUNTIME_SHADOW_ID_DETAILS: 'true',
    })).toBe(true);
    expect(isGridEngine2RuntimeShadowIdDetailsEnabled({
      DEV: true,
      VITE_GRID_ENGINE_2_RUNTIME_SHADOW_ID_DETAILS: 'true',
    })).toBe(false);
    expect(isGridEngine2RuntimeShadowReconciliationEnabled({
      DEV: true,
      VITE_GRID_ENGINE_2_RUNTIME_SHADOW: 'true',
      VITE_GRID_ENGINE_2_RUNTIME_SHADOW_RECONCILE: 'true',
    })).toBe(true);
    expect(isGridEngine2RuntimeShadowReconciliationEnabled({
      DEV: false,
      VITE_GRID_ENGINE_2_RUNTIME_SHADOW: 'true',
      VITE_GRID_ENGINE_2_RUNTIME_SHADOW_RECONCILE: 'true',
    })).toBe(false);
    expect(isGridEngine2RuntimeShadowReconciliationEnabled({
      DEV: true,
      VITE_GRID_ENGINE_2_RUNTIME_SHADOW_RECONCILE: 'true',
    })).toBe(false);
  });

  it('does not analyze or log while disabled', () => {
    const analyze = vi.fn();
    const logger = { info: vi.fn(), warn: vi.fn() };
    expect(runGridEngine2RuntimeShadowMode(runtimeInput(), { enabled: false, analyze, logger })).toEqual({
      status: 'disabled',
      nextSignature: null,
    });
    expect(analyze).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });
});

describe('Runtime Shadow structural baseline', () => {
  it('1. accepts a complete explicit candidate without claiming historical proof', () => {
    const result = evaluateRuntimeShadowBaseline(runtimeInput());
    expect(result.quality).toBe('explicit-complete-candidate');
    expect(result.provenance).toBe('responsive-layout-root');
    expect(result.comparisonConfidence).toBe('provisional');
    expect(result.layout).toEqual(structural);
  });

  it('2. rejects an explicit partial layout instead of filling it', () => {
    const result = evaluateRuntimeShadowBaseline({ ...runtimeInput(), explicitLayout: structural.slice(0, 1) });
    expect(result.quality).toBe('partial');
    expect(result.layout).toBeNull();
    expect(result.issues).toContainEqual({ code: 'MISSING_LAYOUT_ID', id: 'below' });
  });

  it('3. labels a derived source and never promotes it to solver input', () => {
    const result = evaluateRuntimeShadowBaseline({
      ...runtimeInput(),
      hasExplicitLayout: false,
      explicitLayout: undefined,
      derivedLayout: structural,
    });
    expect(result.quality).toBe('derived');
    expect(result.provenance).toBe('derived-grid-engine-layout');
    expect(result.layout).toBeNull();
  });

  it('4. rejects a source with known runtime contamination', () => {
    const result = evaluateRuntimeShadowBaseline({ ...runtimeInput(), knownRuntimeContamination: true });
    expect(result.quality).toBe('unreliable');
    expect(result.issues[0].code).toBe('KNOWN_RUNTIME_CONTAMINATION');
  });

  it('5. reports insufficient data when no structural source exists', () => {
    const result = evaluateRuntimeShadowBaseline({
      ...runtimeInput(),
      hasExplicitLayout: false,
      explicitLayout: undefined,
      derivedLayout: undefined,
    });
    expect(result.quality).toBe('insufficient-data');
    expect(result.provenance).toBe('none');
  });

  it('6. reports missing and duplicate IDs', () => {
    const missing = evaluateRuntimeShadowBaseline({ ...runtimeInput(), explicitLayout: structural.slice(0, 1) });
    const duplicate = evaluateRuntimeShadowBaseline({
      ...runtimeInput(),
      explicitLayout: [...structural, { ...structural[0] }],
    });
    expect(missing.issues.map((issue) => issue.code)).toContain('MISSING_LAYOUT_ID');
    expect(duplicate.quality).toBe('unreliable');
    expect(duplicate.issues.map((issue) => issue.code)).toContain('DUPLICATE_LAYOUT_ID');
  });

  it('7. rejects invalid, out-of-bounds and overlapping geometry', () => {
    const outOfBounds = evaluateRuntimeShadowBaseline({
      ...runtimeInput(),
      explicitLayout: [{ ...structural[0], w: 13 }, structural[1]],
    });
    const overlap = evaluateRuntimeShadowBaseline({
      ...runtimeInput(),
      explicitLayout: [structural[0], { ...structural[1], y: 0 }],
    });
    expect(outOfBounds.quality).toBe('unreliable');
    expect(outOfBounds.issues.map((issue) => issue.code)).toContain('OUT_OF_BOUNDS');
    expect(overlap.issues.map((issue) => issue.code)).toContain('OVERLAP');
  });
});

describe('Runtime Shadow absolute overrides', () => {
  it('8. keeps an OFF Light structural and emits no override', () => {
    const result = deriveRuntimeShadowOverrides({
      ...runtimeInput(),
      structuralLayout: structural,
      legacyRuntimeLayout: structural,
      lightStates: [{ id: 'light', isOn: false }],
    });
    expect(result.overrides).toEqual([]);
    expect(result.structuralLayout).toEqual(structural);
  });

  it('9. emits an absolute ON Light span', () => {
    const result = deriveRuntimeShadowOverrides({
      ...runtimeInput(),
      structuralLayout: structural,
      legacyRuntimeLayout: structural,
      lightStates: [{ id: 'light', isOn: true }],
    });
    expect(result.overrides).toEqual([{ id: 'light', w: 2, h: 2 }]);
  });

  it('keeps verified structure separate when the live Light state is not available yet', () => {
    const result = analyzeRuntimeShadow(runtimeInput({
      configurationCompleteness: 'verified-complete',
      lightStates: [],
    }));
    expect(result.baseline.quality).toBe('explicit-complete-candidate');
    expect(result.comparison).toBe('insufficient-data');
    expect(result.issueCodes).toContain('MISSING_LIGHT_STATE');
  });

  it('10. respects disabled automatic expansion', () => {
    const result = deriveRuntimeShadowOverrides({
      ...runtimeInput(),
      structuralLayout: structural,
      legacyRuntimeLayout: structural,
      lightStates: [{ id: 'light', isOn: true }],
      widgetLayoutOverrides: { light: { xl: { autoExpand: false, h: 3 } } },
    });
    expect(result.overrides).toEqual([]);
    expect(result.structuralLayout[0]).toMatchObject({ w: 2, h: 3 });
  });

  it('11. applies per-card dimensions over type dimensions', () => {
    const result = deriveRuntimeShadowOverrides({
      ...runtimeInput(),
      structuralLayout: structural,
      legacyRuntimeLayout: structural,
      lightStates: [{ id: 'light', isOn: true }],
      widgetTypeLayoutOverrides: { light: { xl: { w: 3, hOff: 1, hOn: 3 } } },
      widgetLayoutOverrides: { light: { xl: { w: 4, hOff: 1, hOn: 4 } } },
    });
    expect(result.structuralLayout[0]).toMatchObject({ w: 4, h: 1 });
    expect(result.overrides).toEqual([{ id: 'light', w: 4, h: 4 }]);
  });

  it('omits a width-only configuration from runtime overrides after making it structural', () => {
    const result = deriveRuntimeShadowOverrides({
      ...runtimeInput(),
      structuralLayout: structural,
      legacyRuntimeLayout: structural,
      lightStates: [{ id: 'light', isOn: true }],
      widgetLayoutOverrides: { light: { xl: { w: 3, hOff: 1, hOn: 1 } } },
    });
    expect(result.structuralLayout[0]).toMatchObject({ w: 3, h: 1 });
    expect(result.overrides).toEqual([]);
  });

  it('12. refuses to infer whether an unconfigured tall Light is structural or already expanded', () => {
    const tall = structural.map((item) => item.i === 'light' ? { ...item, h: 2 } : { ...item, y: 2 });
    const result = deriveRuntimeShadowOverrides({
      ...runtimeInput(),
      structuralLayout: tall,
      legacyRuntimeLayout: tall,
      lightStates: [{ id: 'light', isOn: true }],
    });
    expect(result.overrides).toEqual([]);
    expect(result.issues).toContainEqual({ code: 'AMBIGUOUS_LIGHT_BASELINE', id: 'light' });
  });

  it('13. derives multiple simultaneous Light overrides', () => {
    const layout = [
      { i: 'first', x: 0, y: 0, w: 2, h: 1 },
      { i: 'second', x: 2, y: 0, w: 2, h: 1 },
    ];
    const rootElements = layout.map((item) => ({ id: item.i, role: 'widget' as const, kind: 'light' }));
    const result = deriveRuntimeShadowOverrides({
      ...runtimeInput(), structuralLayout: layout, legacyRuntimeLayout: layout, rootElements,
      lightStates: [{ id: 'first', isOn: true }, { id: 'second', isOn: true }],
    });
    expect(result.overrides).toEqual([
      { id: 'first', w: 2, h: 2 },
      { id: 'second', w: 2, h: 2 },
    ]);
  });

  it('14. produces equivalent geometry independently of state update ordering', () => {
    const first = analyzeRuntimeShadow(runtimeInput({ lightStates: [{ id: 'light', isOn: true }], legacyRuntimeInput: expanded }));
    const second = analyzeRuntimeShadow(runtimeInput({
      rootElements: [...roots].reverse(),
      lightStates: [{ id: 'light', isOn: true }],
      legacyRuntimeInput: expanded,
    }));
    expect({ comparison: first.comparison, overrides: first.overrideCount, differences: first.differences }).toEqual({
      comparison: second.comparison,
      overrides: second.overrideCount,
      differences: second.differences,
    });
  });

  it('15. preserves a static Stack as an atomic root', () => {
    const stackLayout = [{ i: 'stack', x: 0, y: 0, w: 4, h: 3 }];
    const result = deriveRuntimeShadowOverrides({
      ...runtimeInput(), structuralLayout: stackLayout, legacyRuntimeLayout: stackLayout,
      rootElements: [{ id: 'stack', role: 'stack', kind: 'stack-grid' }], lightStates: [],
    });
    expect(result.structuralLayout).toEqual(stackLayout);
    expect(result.overrides).toEqual([]);
    expect(result.issues).toEqual([]);
  });

  it('16. marks a live Stack height with no causal source as unsupported', () => {
    const stackLayout = [{ i: 'stack', x: 0, y: 0, w: 4, h: 3 }];
    const result = deriveRuntimeShadowOverrides({
      ...runtimeInput(), structuralLayout: stackLayout,
      legacyRuntimeLayout: [{ ...stackLayout[0], h: 4 }],
      rootElements: [{ id: 'stack', role: 'stack', kind: 'stack-grid' }], lightStates: [],
    });
    expect(result.dynamicStackIds).toEqual(['stack']);
    expect(result.overrides).toEqual([]);
    expect(result.issues[0].code).toBe('UNSUPPORTED_DYNAMIC_STACK');
  });

  it('17. preserves Greeting, Weather and Scenes without special runtime inference', () => {
    const layout = ['greeting', 'weather', 'scenes'].map((i, index) => ({ i, x: index * 2, y: 0, w: 2, h: 1 }));
    const report = analyzeRuntimeShadow(runtimeInput({
      rootElements: layout.map((item) => ({ id: item.i, role: 'section', kind: item.i })),
      explicitLayout: layout,
      derivedLayout: layout,
      legacyRuntimeInput: layout,
      lightStates: [],
    }));
    expect(report.comparison).toBe('exact-match');
    expect(report.matchCount).toBe(3);
  });
});

describe('Runtime Shadow comparison', () => {
  it('18. classifies exact geometry against legacy-runtime-input', () => {
    const report = analyzeRuntimeShadow(runtimeInput());
    expect(report.comparison).toBe('exact-match');
    expect(report.solverStatus).toBe('unchanged');
    expect(report.matchCount).toBe(2);
  });

  it('19. reports a position difference per root ID', () => {
    const report = analyzeRuntimeShadow(runtimeInput({
      legacyRuntimeInput: [structural[0], { ...structural[1], y: 2 }],
    }));
    expect(report.differences).toContainEqual(expect.objectContaining({
      id: 'below', categories: ['position-difference', 'unexpected-difference'],
    }));
  });

  it('20. reports a size difference', () => {
    const report = analyzeRuntimeShadow(runtimeInput({
      legacyRuntimeInput: [{ ...structural[0], w: 3 }, structural[1]],
    }));
    expect(report.differences.find((difference) => difference.id === 'light')?.categories).toContain('size-difference');
  });

  it('21. distinguishes an expected algorithm-only displacement', () => {
    const report = analyzeRuntimeShadow(runtimeInput({
      lightStates: [{ id: 'light', isOn: true }],
      legacyRuntimeInput: [expanded[0], { ...expanded[1], y: 3 }],
    }));
    expect(report.comparison).toBe('expected-algorithm-difference');
    expect(report.differences[0].categories).toContain('expected-algorithm-difference');
  });

  it('22. labels an unexplained difference as unexpected', () => {
    const report = analyzeRuntimeShadow(runtimeInput({
      legacyRuntimeInput: [{ ...structural[0], h: 3 }, { ...structural[1], y: 3 }],
    }));
    expect(report.comparison).toBe('unexpected-difference');
  });

  it('23. surfaces an invalid solver result instead of comparing a fallback', () => {
    const collisionLayout = [
      { i: 'light', x: 0, y: 0, w: 2, h: 1 },
      { i: 'below', x: 2, y: 0, w: 2, h: 1 },
    ];
    const report = analyzeRuntimeShadow(runtimeInput({
      explicitLayout: collisionLayout,
      derivedLayout: collisionLayout,
      legacyRuntimeInput: collisionLayout,
      lightStates: [{ id: 'light', isOn: true }],
      widgetTypeLayoutOverrides: { light: { xl: { w: 3, hOff: 1, hOn: 2 } } },
    }));
    expect(report.solverStatus).toBe('invalid');
    expect(report.comparison).toBe('solver-invalid');
  });

  it('24. keeps provisional and historically verified confidence distinct', () => {
    expect(analyzeRuntimeShadow(runtimeInput()).comparisonConfidence).toBe('provisional');
    expect(analyzeRuntimeShadow(runtimeInput({ historicallyVerifiedBaseline: true })).comparisonConfidence).toBe('reliable');
  });
});

describe('Runtime Shadow lifecycle, safety and performance', () => {
  it('25. creates a stable signature and deduplicates equivalent inputs', () => {
    const input = runtimeInput();
    const signature = createRuntimeShadowInputSignature(input);
    expect(createRuntimeShadowInputSignature({ ...input, rootElements: [...roots].reverse() })).toBe(signature);
    const analyze = vi.fn(() => analyzeRuntimeShadow(input));
    const result = runGridEngine2RuntimeShadowMode(input, { enabled: true, previousSignature: signature, analyze });
    expect(result.status).toBe('unchanged');
    expect(analyze).not.toHaveBeenCalled();
  });

  it('26. recognizes OFF -> ON -> OFF as meaningful, reversible input', () => {
    const off = createRuntimeShadowInputSignature(runtimeInput());
    const on = createRuntimeShadowInputSignature(runtimeInput({
      lightStates: [{ id: 'light', isOn: true }], legacyRuntimeInput: expanded,
    }));
    const offAgain = createRuntimeShadowInputSignature(runtimeInput());
    expect(on).not.toBe(off);
    expect(offAgain).toBe(off);
  });

  it('27. invalidates the signature when the active breakpoint changes', () => {
    const xl = createRuntimeShadowInputSignature(runtimeInput());
    const md = createRuntimeShadowInputSignature(runtimeInput({ breakpoint: 'md', cols: 6 }));
    expect(md).not.toBe(xl);
  });

  it('invalidates the signature for a new authoritative structural generation', () => {
    const first = runtimeInput({
      structuralContext: { generation: 1, revision: 84, fingerprint: 'dsl-v1-safe' },
    });
    const second = runtimeInput({
      structuralContext: { generation: 2, revision: 85, fingerprint: 'dsl-v1-safe-next' },
    });
    expect(createRuntimeShadowInputSignature(second)).not.toBe(createRuntimeShadowInputSignature(first));
    expect(analyzeRuntimeShadow(second).structuralContext).toEqual(second.structuralContext);
  });

  it('28. never mutates any diagnostic input', () => {
    const input = runtimeInput({
      widgetLayoutOverrides: { light: { xl: { hOn: 4, hOff: 1 } } },
    });
    const before = structuredClone(input);
    analyzeRuntimeShadow(input);
    expect(input).toEqual(before);
  });

  it('29. omits full HA state and sensitive extra input from compact logs', () => {
    const logger = { info: vi.fn(), warn: vi.fn() };
    const input = {
      ...runtimeInput(),
      explicitRootLayouts: { xl: [...structural, { i: 'private.entity_identifier', x: 4, y: 0, w: 2, h: 1 }] },
      legacyRuntimeLayouts: { xl: structural },
      haState: { access_token: 'DO-NOT-LOG', attributes: { password: 'SECRET' } },
    } as RuntimeShadowInput;
    runGridEngine2RuntimeShadowMode(input, { enabled: true, logger });
    const logged = JSON.stringify(logger.info.mock.calls);
    expect(logged).toContain('[DomusUI:grid-engine2:runtime-shadow]');
    expect(logged).not.toContain('DO-NOT-LOG');
    expect(logged).not.toContain('SECRET');
    expect(logged).not.toContain('access_token');
    expect(logged).not.toContain('private.entity_identifier');
    expect(logged).toContain('fingerprint');
  });

  it('keeps raw ID details behind the explicit development option', () => {
    const logger = { info: vi.fn(), warn: vi.fn() };
    runGridEngine2RuntimeShadowMode(runtimeInput({
      explicitRootLayouts: { xl: [...structural, { i: 'local-debug-id', x: 4, y: 0, w: 2, h: 1 }] },
      legacyRuntimeLayouts: { xl: structural },
      includeRawIdDetails: true,
    }), { enabled: true, logger });
    expect(JSON.stringify(logger.info.mock.calls)).toContain('local-debug-id');
  });

  it('logs reconciliation classifications by fingerprint without projected raw IDs', () => {
    const logger = { info: vi.fn(), warn: vi.fn() };
    const privateNestedId = 'sensor.private_nested_room';
    const explicit = [...structural, { i: privateNestedId, x: 4, y: 0, w: 2, h: 1 }];
    runGridEngine2RuntimeShadowMode(runtimeInput({
      hasExplicitLayout: true,
      explicitLayout: explicit,
      explicitRootLayouts: { xl: explicit },
      legacyRuntimeLayouts: { xl: structural },
      knownNonRootElements: [{
        id: privateNestedId,
        role: 'widget',
        kind: 'sensor',
        parentRole: 'stack',
      }],
      reconciliationEnabled: true,
      configurationCompleteness: 'hydration-uncertain',
    }), { enabled: true, logger });
    const logged = JSON.stringify(logger.info.mock.calls);
    expect(logged).toContain('EXISTING_NESTED_WIDGET');
    expect(logged).toContain('reconciled-provisional');
    expect(logged).not.toContain(privateNestedId);
  });

  it('30. analyzes a 22-root fixture and records all four stages', () => {
    const report = analyzeRuntimeShadow(packedFixture(22));
    expect(report.rootElementCount).toBe(22);
    expect(report.matchCount).toBe(22);
    expect(Object.keys(report.timings)).toEqual(['baselineMs', 'overridesMs', 'solverMs', 'comparisonMs', 'totalMs']);
    console.info('[runtime-shadow perf 22]', report.timings);
  });

  it('31. analyzes a 30-root fixture and records all four stages', () => {
    const report = analyzeRuntimeShadow(packedFixture(30));
    expect(report.rootElementCount).toBe(30);
    expect(report.matchCount).toBe(30);
    expect(report.timings.totalMs).toBeGreaterThanOrEqual(0);
    console.info('[runtime-shadow perf 30]', report.timings);
  });

  it('32. runs as pure data code without a renderer, storage or persistence adapter', () => {
    const input = packedFixture(22);
    const first = analyzeRuntimeShadow(input);
    const second = analyzeRuntimeShadow(structuredClone(input));
    expect({ ...first, timings: undefined }).toEqual({ ...second, timings: undefined });
    expect(first.comparison).toBe('exact-match');
  });
});
