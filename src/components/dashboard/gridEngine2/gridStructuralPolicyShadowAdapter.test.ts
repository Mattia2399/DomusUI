import { describe, expect, it, vi } from 'vitest';
import { DASHBOARD_GRID_BREAKPOINT_ORDER } from '../../../types/widgetTypeLayout';
import type { GridPolicyDeclaration } from './gridStructuralPolicy';
import {
  analyzeGridStructuralPolicyShadow,
  GRID_STRUCTURAL_POLICY_SHADOW_COLS,
} from './gridStructuralPolicyShadowAdapter';
import {
  createStructuralPolicyShadowFixture,
  layoutForRoots,
  layoutsForRoots,
  packedStructuralPolicyShadowFixture,
  SHADOW_ROOTS,
  SHADOW_STACK_CHILD,
  VERIFIED_SHADOW_CONTEXT,
} from './gridStructuralPolicyShadowAdapter.fixtures';
import { isGridEngine2RuntimeShadowEnabled } from './runtimeShadowFeatureFlag';
import type { RuntimeShadowInput } from './runtimeShadowDiagnostics';
import { analyzeRuntimeShadow, createRuntimeShadowInputSignature } from './runtimeShadowDiagnostics';
import { runGridEngine2RuntimeShadowMode } from './runtimeShadowMode';

const manualDeclaration: readonly GridPolicyDeclaration[] = [{
  source: 'synthetic-verified-policy',
  mode: 'manual',
  provenance: 'user-explicit',
}];
const automaticDeclaration: readonly GridPolicyDeclaration[] = [{
  source: 'synthetic-verified-policy',
  mode: 'automatic',
  provenance: 'generated',
}];

function allDeclarations(declarations: readonly GridPolicyDeclaration[]) {
  return Object.fromEntries(DASHBOARD_GRID_BREAKPOINT_ORDER.map((breakpoint) => [breakpoint, declarations]));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

function runtimeInput(): RuntimeShadowInput {
  const fixture = createStructuralPolicyShadowFixture();
  const active = fixture.structuralLayouts!.xl!;
  return {
    breakpoint: 'xl',
    cols: 12,
    rootElements: fixture.rootElements,
    knownNonRootElements: fixture.knownNonRootElements,
    hasExplicitLayout: true,
    explicitLayout: active,
    legacyRuntimeInput: active,
    explicitRootLayouts: fixture.structuralLayouts,
    legacyRuntimeLayouts: fixture.legacyLayouts,
    reconciliationEnabled: true,
    configurationCompleteness: 'verified-complete',
    structuralContext: VERIFIED_SHADOW_CONTEXT,
    lightStates: [],
  };
}

describe('Grid Structural Policy Shadow adapter: snapshot and policy authority', () => {
  it('1. accepts a complete verified HA snapshot as diagnostic input', () => {
    const report = analyzeGridStructuralPolicyShadow(createStructuralPolicyShadowFixture()).report;
    expect(report.diagnosticStatus).toBe('available');
    expect(report.context).toMatchObject({ generation: 84, revision: 84 });
    expect(report.renderingAuthority).toBe('not-authorized');
  });

  it('2. keeps a cache snapshot diagnostic and unverified', () => {
    const report = analyzeGridStructuralPolicyShadow(createStructuralPolicyShadowFixture({
      snapshotState: 'cache-provisional',
      configurationCompleteness: 'hydration-uncertain',
    })).report;
    expect(report.diagnosticStatus).toBe('limited');
    expect(report.breakpoints.xl.baselineQuality).toBe('unverified');
  });

  it('3. keeps an incoherent snapshot diagnostic and non-authoritative', () => {
    const report = analyzeGridStructuralPolicyShadow(createStructuralPolicyShadowFixture({
      snapshotState: 'incoherent',
      configurationCompleteness: 'hydration-uncertain',
    })).report;
    expect(report.breakpoints.xl).toMatchObject({
      diagnosticStatus: 'limited',
      renderingAuthority: 'not-authorized',
    });
  });

  it('4. refuses evaluation while a remote revision is pending', () => {
    const analysis = analyzeGridStructuralPolicyShadow(createStructuralPolicyShadowFixture({
      snapshotState: 'revision-pending',
    }));
    expect(analysis.report.diagnosticStatus).toBe('unavailable-pending-revision');
    expect(analysis.report.breakpoints.xl.policyStatus).toBe('not-evaluated');
    expect(analysis.policyResults.xl).toBeUndefined();
  });

  it('5. invalidates generation A when generation B becomes current', () => {
    const first = analyzeGridStructuralPolicyShadow(createStructuralPolicyShadowFixture()).report;
    const second = analyzeGridStructuralPolicyShadow(createStructuralPolicyShadowFixture({
      context: { generation: 85, revision: 85, fingerprint: 'next-document' },
    })).report;
    expect(second.signature).not.toBe(first.signature);
    expect(second.context.generation).toBe(85);
  });

  it('6. rejects a mismatch between current, inventory and layout generations', () => {
    const analysis = analyzeGridStructuralPolicyShadow(createStructuralPolicyShadowFixture({
      inventoryContext: { ...VERIFIED_SHADOW_CONTEXT, generation: 83 },
    }));
    expect(analysis.report.diagnosticStatus).toBe('unavailable-context-mismatch');
    expect(analysis.report.breakpoints.xl.issueCodes).toContain('STRUCTURAL_CONTEXT_MISMATCH');
    expect(analysis.policyResults).toEqual({});
  });

  it('7. gives an unchanged reread the same deterministic signature', () => {
    const input = createStructuralPolicyShadowFixture();
    const first = analyzeGridStructuralPolicyShadow(input).report;
    const second = analyzeGridStructuralPolicyShadow(structuredClone(input)).report;
    expect(second).toEqual(first);
  });

  it('8. treats the current HA schema as having no authoritative mode', () => {
    const report = analyzeGridStructuralPolicyShadow(createStructuralPolicyShadowFixture()).report;
    expect(report.breakpoints.xl.mode).toBeNull();
    expect(report.breakpoints.xl.provenance).toBe('legacy-implicit');
  });

  it('9. preserves legacy implicit behavior without promotion', () => {
    const report = analyzeGridStructuralPolicyShadow(createStructuralPolicyShadowFixture()).report;
    expect(DASHBOARD_GRID_BREAKPOINT_ORDER.map((breakpoint) =>
      report.breakpoints[breakpoint].policyStatus
    )).toEqual(Array(6).fill('legacy-preserved'));
  });

  it('10. resolves manual mode only from explicit synthetic metadata', () => {
    const analysis = analyzeGridStructuralPolicyShadow(createStructuralPolicyShadowFixture({
      policyDeclarations: allDeclarations(manualDeclaration),
    }));
    expect(analysis.report.breakpoints.xl).toMatchObject({ mode: 'manual', policyStatus: 'manual-projection' });
    expect(analysis.policyResults.xl?.projection).toEqual(analysis.policyResults.xl?.baseline);
  });

  it('11. resolves automatic mode only from explicit synthetic metadata', () => {
    const analysis = analyzeGridStructuralPolicyShadow(createStructuralPolicyShadowFixture({
      policyDeclarations: allDeclarations(automaticDeclaration),
      derivedLineage: { xl: { context: VERIFIED_SHADOW_CONTEXT, algorithmVersion: 'synthetic-v1' } },
    }));
    expect(analysis.report.breakpoints.xl).toMatchObject({
      mode: 'automatic',
      policyStatus: 'automatic-projection',
      baselineQuality: 'verified-derived',
    });
  });

  it('12. reports incompatible provenance metadata as ambiguous', () => {
    const conflicting = [manualDeclaration[0], {
      source: 'synthetic-second-source',
      mode: 'manual' as const,
      provenance: 'generated' as const,
    }];
    const analysis = analyzeGridStructuralPolicyShadow(createStructuralPolicyShadowFixture({
      policyDeclarations: { xl: conflicting },
    }));
    expect(analysis.report.breakpoints.xl.policyStatus).toBe('ambiguous');
    expect(analysis.report.breakpoints.xl.issueCodes).toContain('CONFLICTING_PROVENANCE_METADATA');
  });
});

describe('Grid Structural Policy Shadow adapter: six structural breakpoints', () => {
  it('13. classifies a complete explicit root layout', () => {
    expect(analyzeGridStructuralPolicyShadow(createStructuralPolicyShadowFixture()).report.breakpoints.md)
      .toMatchObject({ hasExplicitLayout: true, layoutCompleteness: 'explicit-complete' });
  });

  it('14. classifies a partial explicit root layout without completing it', () => {
    const layouts = layoutsForRoots();
    layouts.md = layouts.md!.slice(0, -1);
    const analysis = analyzeGridStructuralPolicyShadow(createStructuralPolicyShadowFixture({ structuralLayouts: layouts }));
    expect(analysis.report.breakpoints.md.layoutCompleteness).toBe('explicit-partial');
    expect(analysis.policyResults.md?.projection).toBeNull();
  });

  it('15. classifies a missing root layout without deriving a neighbor', () => {
    const layouts = layoutsForRoots();
    delete layouts.sm;
    const report = analyzeGridStructuralPolicyShadow(createStructuralPolicyShadowFixture({ structuralLayouts: layouts })).report;
    expect(report.breakpoints.sm).toMatchObject({ hasExplicitLayout: false, layoutCompleteness: 'missing' });
  });

  it('16. never invents 2xl when it is absent', () => {
    const layouts = layoutsForRoots();
    delete layouts['2xl'];
    const analysis = analyzeGridStructuralPolicyShadow(createStructuralPolicyShadowFixture({ structuralLayouts: layouts }));
    expect(analysis.report.breakpoints['2xl'].layoutCompleteness).toBe('missing');
    expect(analysis.policyResults['2xl']?.baseline).toEqual([]);
  });

  it('17. reports all six breakpoints with the approved column counts', () => {
    const report = analyzeGridStructuralPolicyShadow(createStructuralPolicyShadowFixture()).report;
    expect(Object.keys(report.breakpoints)).toEqual([...DASHBOARD_GRID_BREAKPOINT_ORDER]);
    expect(DASHBOARD_GRID_BREAKPOINT_ORDER.map((breakpoint) => report.breakpoints[breakpoint].cols))
      .toEqual([12, 12, 8, 6, 4, 2]);
    expect(GRID_STRUCTURAL_POLICY_SHADOW_COLS).toEqual({ '2xl': 12, xl: 12, lg: 8, md: 6, sm: 4, xs: 2 });
  });

  it('18. classifies an extra ID as verified absent only with complete HA evidence', () => {
    const layouts = layoutsForRoots();
    layouts.xl = [...layouts.xl!, { i: 'obsolete.private_1', x: 4, y: 8, w: 2, h: 1 }];
    const analysis = analyzeGridStructuralPolicyShadow(createStructuralPolicyShadowFixture({ structuralLayouts: layouts }));
    expect(analysis.reconciliations.xl).toMatchObject({ status: 'reconciled', classifiedAbsentCount: 1 });
    expect(analysis.report.breakpoints.xl.counts.verifiedExtra).toBe(1);
  });

  it('19. keeps an extra ID uncertain while HA hydration is not verified', () => {
    const layouts = layoutsForRoots();
    layouts.xl = [...layouts.xl!, { i: 'uncertain.private_1', x: 4, y: 8, w: 2, h: 1 }];
    const analysis = analyzeGridStructuralPolicyShadow(createStructuralPolicyShadowFixture({
      structuralLayouts: layouts,
      snapshotState: 'cache-provisional',
      configurationCompleteness: 'hydration-uncertain',
    }));
    expect(analysis.reconciliations.xl).toMatchObject({ status: 'blocked', uncertainCount: 1 });
    expect(analysis.report.breakpoints.xl.counts.uncertain).toBe(1);
  });

  it('20. reports duplicate structural IDs without exposing them', () => {
    const layouts = layoutsForRoots();
    layouts.xl = [...layouts.xl!, { ...layouts.xl![0], y: 8 }];
    const report = analyzeGridStructuralPolicyShadow(createStructuralPolicyShadowFixture({ structuralLayouts: layouts })).report;
    expect(report.breakpoints.xl.counts.duplicateLayoutIds).toBe(1);
    expect(JSON.stringify(report)).not.toContain(SHADOW_ROOTS[0].id);
  });

  it('21. reports an active root that lacks structural geometry', () => {
    const layouts = layoutsForRoots();
    layouts.xl = layouts.xl!.slice(0, -1);
    const report = analyzeGridStructuralPolicyShadow(createStructuralPolicyShadowFixture({ structuralLayouts: layouts })).report;
    expect(report.breakpoints.xl.counts.activeWithoutGeometry).toBe(1);
  });
});

describe('Grid Structural Policy Shadow adapter: root inventory and Stacks', () => {
  it('22. identifies a special section explicitly', () => {
    const report = analyzeGridStructuralPolicyShadow(createStructuralPolicyShadowFixture()).report;
    expect(report.breakpoints.xl.counts.specialSections).toBe(1);
  });

  it('23. represents a root Stack as one atomic stack-container', () => {
    const analysis = analyzeGridStructuralPolicyShadow(createStructuralPolicyShadowFixture({
      policyDeclarations: allDeclarations(manualDeclaration),
    }));
    expect(analysis.report.breakpoints.xl.counts.stackContainers).toBe(1);
    expect(analysis.policyResults.xl?.inventory.classifications).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'section-stack-grid-1', kind: 'stack-container', state: 'active' }),
    ]));
  });

  it('24. excludes a Stack child from the active root inventory', () => {
    const analysis = analyzeGridStructuralPolicyShadow(createStructuralPolicyShadowFixture());
    expect(analysis.policyResults.xl?.inventory.activeIds).not.toContain(SHADOW_STACK_CHILD.id);
    expect(analysis.report.breakpoints.xl.counts.active).toBe(3);
  });

  it('25. counts multiple root Stacks independently', () => {
    const roots = [
      ...SHADOW_ROOTS,
      { id: 'section-stack-vertical-2', role: 'stack' as const, kind: 'stack-vertical' },
    ];
    const report = analyzeGridStructuralPolicyShadow(createStructuralPolicyShadowFixture({ rootElements: roots })).report;
    expect(report.breakpoints.xl.counts.stackContainers).toBe(2);
  });

  it('26. never converts a Stack into a group scope and avoids cross-scope duplicate conflicts', () => {
    const duplicateAcrossScopes = { ...SHADOW_STACK_CHILD, id: SHADOW_ROOTS[2].id };
    const analysis = analyzeGridStructuralPolicyShadow(createStructuralPolicyShadowFixture({
      knownNonRootElements: [duplicateAcrossScopes],
      policyDeclarations: allDeclarations(manualDeclaration),
    }));
    expect(analysis.policyResults.xl?.scope).toEqual({ kind: 'root' });
    expect(analysis.policyResults.xl?.inventory.duplicateInventoryIds).toEqual([]);
  });

  it('preserves a Stack ID and geometry in a detached manual projection', () => {
    const analysis = analyzeGridStructuralPolicyShadow(createStructuralPolicyShadowFixture({
      policyDeclarations: allDeclarations(manualDeclaration),
    }));
    const stack = analysis.policyResults.xl?.projection?.find((item) => item.i === 'section-stack-grid-1');
    expect(stack).toEqual(layoutForRoots(SHADOW_ROOTS, 'xl')[1]);
  });

  it('supports a root without any Stack', () => {
    const roots = SHADOW_ROOTS.filter((root) => root.role !== 'stack');
    const report = analyzeGridStructuralPolicyShadow(createStructuralPolicyShadowFixture({ rootElements: roots })).report;
    expect(report.breakpoints.xl.counts.stackContainers).toBe(0);
  });

  it('reports an unclassifiable section instead of guessing its structural kind', () => {
    const roots = [{ id: 'unknown-section', role: 'section' as const, kind: 'custom-unknown' }];
    const report = analyzeGridStructuralPolicyShadow(createStructuralPolicyShadowFixture({ rootElements: roots })).report;
    expect(report.breakpoints.xl.issueCodes).toContain('UNCLASSIFIABLE_ROOT_ELEMENT_KIND');
  });
});

describe('Grid Structural Policy Shadow adapter: safety, comparison and boundary', () => {
  it('27. retains reconciled-provisional as diagnostic baseline quality', () => {
    const layouts = layoutsForRoots();
    layouts.xl = [...layouts.xl!, { i: 'obsolete.private_2', x: 4, y: 8, w: 2, h: 1 }];
    const report = analyzeGridStructuralPolicyShadow(createStructuralPolicyShadowFixture({ structuralLayouts: layouts })).report;
    expect(report.breakpoints.xl.baselineQuality).toBe('reconciled-provisional');
    expect(report.breakpoints.xl.issueCodes).toContain('RECONCILED_PROVISIONAL_NOT_RENDER_AUTHORITY');
  });

  it('28. never promotes any diagnostic projection to rendering authority', () => {
    const report = analyzeGridStructuralPolicyShadow(createStructuralPolicyShadowFixture({
      policyDeclarations: allDeclarations(automaticDeclaration),
    })).report;
    expect(report.renderingAuthority).toBe('not-authorized');
    expect(DASHBOARD_GRID_BREAKPOINT_ORDER.every((breakpoint) =>
      report.breakpoints[breakpoint].renderingAuthority === 'not-authorized'
    )).toBe(true);
  });

  it('29. does not mutate deeply frozen inputs', () => {
    const input = deepFreeze(createStructuralPolicyShadowFixture());
    expect(() => analyzeGridStructuralPolicyShadow(input)).not.toThrow();
    expect(input.structuralLayouts?.xl).toEqual(layoutsForRoots().xl);
  });

  it('30. aggregates position, size and order differences against legacy comparison data', () => {
    const legacy = layoutsForRoots();
    legacy.xl = [
      { ...legacy.xl![1], y: 4 },
      { ...legacy.xl![0], w: 3 },
      legacy.xl![2],
    ];
    const comparison = analyzeGridStructuralPolicyShadow(createStructuralPolicyShadowFixture({ legacyLayouts: legacy }))
      .report.breakpoints.xl.legacyComparison;
    expect(comparison).toMatchObject({
      status: 'available',
      positionDifferenceCount: 1,
      sizeDifferenceCount: 1,
      orderDifferenceCount: 2,
    });
  });

  it('31. reports legacy comparison as unavailable when no legacy layout exists', () => {
    const report = analyzeGridStructuralPolicyShadow(createStructuralPolicyShadowFixture({ legacyLayouts: {} })).report;
    expect(report.breakpoints.xl.legacyComparison.status).toBe('unavailable');
  });

  it('32. reuses Runtime Shadow deduplication for equivalent analyses', () => {
    const input = runtimeInput();
    const signature = createRuntimeShadowInputSignature(input);
    const analyze = vi.fn(() => analyzeRuntimeShadow(input));
    const result = runGridEngine2RuntimeShadowMode(input, {
      enabled: true,
      previousSignature: signature,
      analyze,
    });
    expect(result.status).toBe('unchanged');
    expect(analyze).not.toHaveBeenCalled();
  });

  it('33. invalidates Runtime Shadow deduplication when the active breakpoint changes', () => {
    const input = runtimeInput();
    expect(createRuntimeShadowInputSignature({ ...input, breakpoint: 'md', cols: 6 }))
      .not.toBe(createRuntimeShadowInputSignature(input));
  });

  it('34. emits no raw IDs or sensitive HA-shaped data in the structural report', () => {
    const roots = [{ id: 'sensor.secret_device_name', role: 'widget' as const, kind: 'sensor' }];
    const report = analyzeGridStructuralPolicyShadow(createStructuralPolicyShadowFixture({ rootElements: roots })).report;
    const serialized = JSON.stringify({ report, token: undefined, password: undefined });
    expect(serialized).not.toContain('sensor.secret_device_name');
    expect(serialized).not.toContain('secret_device_name');
    expect(serialized).not.toContain('password');
  });

  it('35. leaves legacy renderer input unchanged', () => {
    const input = runtimeInput();
    const before = structuredClone(input.legacyRuntimeInput);
    analyzeRuntimeShadow(input);
    expect(input.legacyRuntimeInput).toEqual(before);
  });

  it('36. leaves custom/runtime solver candidate inputs unchanged', () => {
    const input = runtimeInput();
    const before = structuredClone(input.explicitRootLayouts);
    analyzeRuntimeShadow(input);
    expect(input.explicitRootLayouts).toEqual(before);
  });

  it('37. does not run Structural Policy analysis when Runtime Shadow is off', () => {
    const analyze = vi.fn();
    expect(runGridEngine2RuntimeShadowMode(runtimeInput(), { enabled: false, analyze })).toEqual({
      status: 'disabled',
      nextSignature: null,
    });
    expect(analyze).not.toHaveBeenCalled();
  });

  it('38. remains disabled in production even when the environment flag is true', () => {
    expect(isGridEngine2RuntimeShadowEnabled({
      DEV: false,
      VITE_GRID_ENGINE_2_RUNTIME_SHADOW: 'true',
    })).toBe(false);
  });

  it('39. performs no storage writes', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem });
    try {
      analyzeGridStructuralPolicyShadow(createStructuralPolicyShadowFixture());
      expect(setItem).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('40. performs no additional HA or network calls', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    try {
      analyzeGridStructuralPolicyShadow(createStructuralPolicyShadowFixture());
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([11, 21, 30])('keeps the pure six-breakpoint adapter bounded for %i roots', (count) => {
    const analysis = analyzeGridStructuralPolicyShadow(packedStructuralPolicyShadowFixture(count), {
      now: () => performance.now(),
    });
    expect(analysis.report.breakpoints.xl.counts.active).toBe(count);
    expect(analysis.report.analysisMs).toBeGreaterThanOrEqual(0);
    expect(analysis.report.signature).toMatch(/^gsp-shadow-/);
    console.info(`[structural-policy-shadow perf ${count}]`, {
      analysisMs: analysis.report.analysisMs,
      breakpoints: Object.keys(analysis.report.breakpoints).length,
    });
  });
});
