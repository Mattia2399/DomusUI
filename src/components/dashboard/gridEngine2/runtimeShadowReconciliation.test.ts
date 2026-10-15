import { describe, expect, it } from 'vitest';
import type { GridLayoutItem } from './model';
import {
  evaluateRuntimeShadowBaseline,
  type RuntimeShadowRootElement,
} from './runtimeShadowBaseline';
import { analyzeRuntimeShadow, type RuntimeShadowInput } from './runtimeShadowDiagnostics';
import {
  reconcileRuntimeShadowBaseline,
  type RuntimeShadowNestedElement,
  type RuntimeShadowReconciliationInput,
} from './runtimeShadowReconciliation';
import { fingerprintRuntimeShadowId } from './runtimeShadowIdAudit';

const roots: RuntimeShadowRootElement[] = [
  { id: 'light', role: 'widget', kind: 'light' },
  { id: 'below', role: 'widget', kind: 'sensor' },
];
const structural: GridLayoutItem[] = [
  { i: 'light', x: 0, y: 0, w: 2, h: 1 },
  { i: 'below', x: 0, y: 1, w: 2, h: 1 },
];
const nestedItem: GridLayoutItem = { i: 'sensor.custom_7', x: 4, y: 0, w: 2, h: 1 };
const nestedInSection: RuntimeShadowNestedElement = {
  id: nestedItem.i,
  role: 'widget',
  kind: 'sensor',
  parentRole: 'section',
};

function reconciliationInput(
  overrides: Partial<Omit<RuntimeShadowReconciliationInput, 'originalBaseline'>> = {},
): RuntimeShadowReconciliationInput {
  const input = {
    enabled: true,
    breakpoint: 'lg' as const,
    cols: 8,
    rootElements: roots,
    knownNonRootElements: [nestedInSection],
    configurationCompleteness: 'hydration-uncertain' as const,
    hasExplicitLayout: true,
    explicitLayout: [...structural, nestedItem],
    ...overrides,
  };
  return {
    ...input,
    originalBaseline: evaluateRuntimeShadowBaseline(input),
  };
}

function runtimeInput(overrides: Partial<RuntimeShadowInput> = {}): RuntimeShadowInput {
  const explicit = [...structural, nestedItem];
  return {
    breakpoint: 'lg',
    cols: 8,
    rootElements: roots,
    knownNonRootElements: [nestedInSection],
    configurationCompleteness: 'hydration-uncertain',
    reconciliationEnabled: true,
    hasExplicitLayout: true,
    explicitLayout: explicit,
    derivedLayout: structural,
    legacyRuntimeInput: structural,
    explicitRootLayouts: { lg: explicit },
    legacyRuntimeLayouts: { lg: structural },
    lightStates: [{ id: 'light', isOn: false }],
    ...overrides,
  };
}

describe('Runtime Shadow diagnostic reconciliation', () => {
  it('1. never excludes a widget that is still an exact current root', () => {
    const result = reconcileRuntimeShadowBaseline(reconciliationInput({ explicitLayout: structural }));
    expect(result.status).toBe('not-needed');
    expect(result.excludedFromDiagnosticProjectionCount).toBe(0);
    expect(result.projectedLayout).toBeNull();
  });

  it('2. excludes an existing widget nested in a section only from the diagnostic projection', () => {
    const result = reconcileRuntimeShadowBaseline(reconciliationInput());
    expect(result.status).toBe('reconciled');
    expect(result.classifications[0]).toMatchObject({
      classification: 'EXISTING_NESTED_WIDGET',
      evidence: 'exact-current-nested-widget',
      parentRole: 'section',
      safeForDiagnosticProjection: true,
    });
    expect(result.projectedLayout).toEqual(structural);
  });

  it('3. applies the same diagnostic-only rule to a widget nested in a Stack', () => {
    const stackChild = { ...nestedInSection, parentRole: 'stack' as const };
    const result = reconcileRuntimeShadowBaseline(reconciliationInput({ knownNonRootElements: [stackChild] }));
    expect(result.status).toBe('reconciled');
    expect(result.classifications[0].parentRole).toBe('stack');
  });

  it('4. classifies absence only when configuration completeness is explicitly verified', () => {
    const result = reconcileRuntimeShadowBaseline(reconciliationInput({
      knownNonRootElements: [],
      configurationCompleteness: 'verified-complete',
    }));
    expect(result.status).toBe('reconciled');
    expect(result.classifications[0]).toMatchObject({
      classification: 'ABSENT_FROM_CURRENT_CONFIG',
      evidence: 'verified-complete-configuration-absence',
    });
  });

  it('5. blocks absence-based reconciliation while HA hydration is uncertain', () => {
    const result = reconcileRuntimeShadowBaseline(reconciliationInput({ knownNonRootElements: [] }));
    expect(result.status).toBe('blocked');
    expect(result.classifications[0].classification).toBe('HYDRATION_UNCERTAIN');
    expect(result.projectedLayout).toBeNull();
  });

  it('6. blocks an unknown ID when there is no completeness evidence', () => {
    const result = reconcileRuntimeShadowBaseline(reconciliationInput({
      knownNonRootElements: [],
      configurationCompleteness: 'unknown',
    }));
    expect(result.status).toBe('blocked');
    expect(result.classifications[0].classification).toBe('UNKNOWN');
  });

  it('7. never excludes an ID that differs from a current element only by normalization', () => {
    const result = reconcileRuntimeShadowBaseline(reconciliationInput({
      rootElements: [{ id: 'Light', role: 'widget', kind: 'light' }, roots[1]],
      knownNonRootElements: [],
      explicitLayout: [{ ...structural[0], i: ' light ' }, structural[1]],
      configurationCompleteness: 'verified-complete',
    }));
    expect(result.status).toBe('blocked');
    expect(result.classifications[0]).toMatchObject({
      classification: 'EXISTING_ROOT_MISMATCH',
      evidence: 'normalized-current-element-match',
      safeForDiagnosticProjection: false,
    });
  });

  it('8. reconciles two independently proven extra IDs in one breakpoint', () => {
    const second = { i: 'sensor.custom_8', x: 6, y: 0, w: 2, h: 1 };
    const result = reconcileRuntimeShadowBaseline(reconciliationInput({
      explicitLayout: [...structural, nestedItem, second],
      knownNonRootElements: [
        nestedInSection,
        { id: second.i, role: 'widget', kind: 'sensor', parentRole: 'stack' },
      ],
    }));
    expect(result.status).toBe('reconciled');
    expect(result.extraIdsCount).toBe(2);
    expect(result.excludedFromDiagnosticProjectionCount).toBe(2);
  });

  it('9. gives the same extra ID a stable fingerprint across breakpoints', () => {
    const lg = reconcileRuntimeShadowBaseline(reconciliationInput({ breakpoint: 'lg', cols: 8 }));
    const md = reconcileRuntimeShadowBaseline(reconciliationInput({ breakpoint: 'md', cols: 6 }));
    expect(lg.classifications[0].fingerprint).toBe(md.classifications[0].fingerprint);
    expect(lg.classifications[0].fingerprint).toBe(fingerprintRuntimeShadowId(nestedItem.i));
  });

  it('10. leaves a valid layout unchanged and creates no projection', () => {
    const result = reconcileRuntimeShadowBaseline(reconciliationInput({ explicitLayout: structural }));
    expect(result).toMatchObject({ status: 'not-needed', reason: 'original-baseline-valid' });
    expect(result.projectedLayout).toBeNull();
  });

  it('11. blocks reconciliation when a current root is missing after exclusion', () => {
    const result = reconcileRuntimeShadowBaseline(reconciliationInput({
      explicitLayout: [structural[0], nestedItem],
    }));
    expect(result.status).toBe('blocked');
    expect(result.reason).toBe('projected-baseline-invalid');
    expect(result.remainingIssues).toContain('MISSING_LAYOUT_ID');
  });

  it('12. blocks an initially overlapping projected layout', () => {
    const result = reconcileRuntimeShadowBaseline(reconciliationInput({
      explicitLayout: [structural[0], { ...structural[1], y: 0 }, nestedItem],
    }));
    expect(result.status).toBe('blocked');
    expect(result.remainingIssues).toContain('OVERLAP');
  });

  it('13. blocks projected geometry outside the active grid', () => {
    const result = reconcileRuntimeShadowBaseline(reconciliationInput({
      explicitLayout: [{ ...structural[0], x: 7, w: 2 }, structural[1], nestedItem],
    }));
    expect(result.status).toBe('blocked');
    expect(result.remainingIssues).toContain('OUT_OF_BOUNDS');
  });

  it('14. blocks duplicate IDs that remain in the projected layout', () => {
    const result = reconcileRuntimeShadowBaseline(reconciliationInput({
      explicitLayout: [structural[0], { ...structural[0] }, structural[1], nestedItem],
    }));
    expect(result.status).toBe('blocked');
    expect(result.remainingIssues).toContain('DUPLICATE_LAYOUT_ID');
  });

  it('15. leaves the original invalid diagnosis untouched while the flag is off', () => {
    const result = reconcileRuntimeShadowBaseline(reconciliationInput({ enabled: false }));
    expect(result.status).toBe('disabled');
    expect(result.originalIssues).toContain('UNKNOWN_LAYOUT_ID');
    expect(result.excludedFromDiagnosticProjectionCount).toBe(0);
  });

  it('16. allows the projection only when the reconciliation flag is on', () => {
    expect(reconcileRuntimeShadowBaseline(reconciliationInput({ enabled: true })).status).toBe('reconciled');
  });

  it('17. never mutates the original baseline or source geometry', () => {
    const input = reconciliationInput();
    const before = structuredClone(input);
    reconcileRuntimeShadowBaseline(input);
    expect(input).toEqual(before);
  });

  it('18. preserves every coordinate of retained roots', () => {
    const result = reconcileRuntimeShadowBaseline(reconciliationInput());
    expect(result.projectedLayout).toEqual(structural);
    expect(result.projectedLayout?.[1]).toEqual({ i: 'below', x: 0, y: 1, w: 2, h: 1 });
  });

  it('19. preserves gaps and performs no compaction', () => {
    const sparse = [structural[0], { ...structural[1], y: 7 }];
    const result = reconcileRuntimeShadowBaseline(reconciliationInput({ explicitLayout: [...sparse, nestedItem] }));
    expect(result.projectedLayout?.map((item) => item.y)).toEqual([0, 7]);
  });

  it('20. never creates or completes elements', () => {
    const result = reconcileRuntimeShadowBaseline(reconciliationInput());
    expect(result.projectedLayout?.map((item) => item.i)).toEqual(['light', 'below']);
    expect(result.projectedLayout).toHaveLength(2);
  });

  it('21. retains every original reference in the caller-owned layout', () => {
    const explicitLayout = [...structural, nestedItem];
    const input = reconciliationInput({ explicitLayout });
    reconcileRuntimeShadowBaseline(input);
    expect(explicitLayout.map((item) => item.i)).toEqual(['light', 'below', 'sensor.custom_7']);
  });

  it('22. always labels a reconciled baseline provisional', () => {
    const result = reconcileRuntimeShadowBaseline(reconciliationInput());
    expect(result.reconciledBaselineQuality).toBe('reconciled-provisional');
    expect(result.comparisonConfidence).toBe('provisional');
  });

  it('23. keeps an already valid XS baseline on the original path', () => {
    const result = reconcileRuntimeShadowBaseline(reconciliationInput({
      breakpoint: 'xs',
      cols: 2,
      explicitLayout: structural,
    }));
    expect(result.status).toBe('not-needed');
    expect(result.reconciledBaselineQuality).toBeNull();
  });

  it('24. handles the LG/MD two-extra pattern without hardcoded fingerprints', () => {
    const extras = [nestedItem, { i: 'light.custom_9', x: 6, y: 0, w: 2, h: 1 }];
    const children: RuntimeShadowNestedElement[] = extras.map((item, index) => ({
      id: item.i,
      role: 'widget',
      kind: index === 0 ? 'sensor' : 'light',
      parentRole: index === 0 ? 'section' : 'stack',
    }));
    for (const [breakpoint, cols] of [['lg', 8], ['md', 6]] as const) {
      const result = reconcileRuntimeShadowBaseline(reconciliationInput({
        breakpoint,
        cols,
        explicitLayout: [...structural, ...extras.map((item) => ({ ...item, x: Math.min(item.x, cols - item.w) }))],
        knownNonRootElements: children,
      }));
      expect(result.extraIdsCount).toBe(2);
      expect(result.status).toBe('reconciled');
    }
  });

  it('25. handles the XL/SM one-extra pattern through the same generic rule', () => {
    for (const [breakpoint, cols] of [['xl', 12], ['sm', 4]] as const) {
      const result = reconcileRuntimeShadowBaseline(reconciliationInput({
        breakpoint,
        cols,
        explicitLayout: [...structural, { ...nestedItem, x: Math.min(nestedItem.x, cols - nestedItem.w) }],
      }));
      expect(result.extraIdsCount).toBe(1);
      expect(result.status).toBe('reconciled');
    }
  });

  it('26. never promotes 2XL without an explicit structural layout', () => {
    const result = reconcileRuntimeShadowBaseline(reconciliationInput({
      breakpoint: '2xl',
      cols: 12,
      hasExplicitLayout: false,
      explicitLayout: undefined,
    }));
    expect(result.status).toBe('blocked');
    expect(result.reason).toBe('no-explicit-structural-layout');
    expect(result.reconciledBaselineQuality).toBeNull();
  });

  it('27. runs Light override extraction and the solver after safe reconciliation', () => {
    const expanded = [
      { ...structural[0], h: 2 },
      { ...structural[1], y: 2 },
    ];
    const report = analyzeRuntimeShadow(runtimeInput({
      lightStates: [{ id: 'light', isOn: true }],
      legacyRuntimeInput: expanded,
      legacyRuntimeLayouts: { lg: expanded },
    }));
    expect(report.reconciliation.status).toBe('reconciled');
    expect(report.reconciliation.originalIssues).toContain('UNKNOWN_LAYOUT_ID');
    expect(report.overrideCount).toBe(1);
    expect(report.solverStatus).toBe('resolved');
    expect(report.comparison).toBe('exact-match');
    expect(report.comparisonConfidence).toBe('provisional');
  });

  it('28. expands and contracts through independent projections without geometric drift', () => {
    const expanded = [{ ...structural[0], h: 2 }, { ...structural[1], y: 2 }];
    const off = analyzeRuntimeShadow(runtimeInput());
    const on = analyzeRuntimeShadow(runtimeInput({
      lightStates: [{ id: 'light', isOn: true }],
      legacyRuntimeInput: expanded,
    }));
    const offAgain = analyzeRuntimeShadow(runtimeInput());
    expect(off.comparison).toBe('exact-match');
    expect(on.comparison).toBe('exact-match');
    expect(offAgain.differences).toEqual(off.differences);
    expect(offAgain.reconciliation.projectedLayout).toEqual(structural);
  });

  it('29. ignores unrelated HA state and invokes no external access', () => {
    const input = {
      ...runtimeInput(),
      haState: { access_token: 'DO-NOT-READ', attributes: { password: 'SECRET' } },
      callApi: () => { throw new Error('must not be called'); },
    } as RuntimeShadowInput;
    expect(() => analyzeRuntimeShadow(input)).not.toThrow();
  });

  it('30. preserves the original Runtime Shadow result when no reconciliation is needed', () => {
    const report = analyzeRuntimeShadow(runtimeInput({
      explicitLayout: structural,
      explicitRootLayouts: { lg: structural },
    }));
    expect(report.reconciliation.status).toBe('not-needed');
    expect(report.baseline.quality).toBe('explicit-complete-candidate');
    expect(report.solverStatus).toBe('unchanged');
    expect(report.comparison).toBe('exact-match');
  });
});
