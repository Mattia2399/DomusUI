import { describe, expect, it, vi } from 'vitest';
import type { GridLayoutItem } from './model';
import {
  createRuntimeRenderDecisionConsolePayload,
  resolveGridEngineRootRuntimeRenderDecision,
  type GridEngineRootRuntimeRenderDecision,
  type GridEngineRootRuntimeRenderDecisionInput,
} from './gridEngineRootRuntimeRenderDecision';
import {
  isGridEngine2RuntimeSolverRendererEnabled,
  isGridEngine2RuntimeSolverRendererRequested,
} from './runtimeSolverRendererFeatureFlag';

const structural: GridLayoutItem[] = [
  { i: 'private-light-a', x: 0, y: 0, w: 2, h: 1 },
  { i: 'direct-a', x: 0, y: 1, w: 2, h: 1 },
  { i: 'private-light-b', x: 2, y: 0, w: 2, h: 1 },
  { i: 'direct-b', x: 2, y: 1, w: 2, h: 1 },
  { i: 'private-light-c', x: 4, y: 0, w: 2, h: 1 },
  { i: 'direct-c', x: 4, y: 1, w: 2, h: 1 },
];

const roots = structural.map((item) => ({
  id: item.i,
  role: 'widget' as const,
  kind: item.i.startsWith('private-light') ? 'light' : 'sensor',
}));

function input(
  overrides: Partial<GridEngineRootRuntimeRenderDecisionInput> = {},
): GridEngineRootRuntimeRenderDecisionInput {
  return {
    development: true,
    customRendererEnabled: true,
    runtimeSolverRendererRequested: true,
    isEditMode: false,
    gridInitialized: true,
    hasPendingAuthoritativeLayout: false,
    hasNonAuthoritativeDraft: false,
    breakpoint: 'xl',
    cols: 6,
    snapshot: {
      phase: 'complete',
      source: 'home-assistant',
      coherent: true,
      generation: 3,
      revision: 104,
      fingerprint: 'dsl-v1-test',
    },
    currentStructuralContext: {
      generation: 3,
      revision: 104,
      fingerprint: 'dsl-v1-test',
    },
    baseline: { kind: 'explicit', layout: structural },
    rootElements: roots,
    lightStates: [
      { id: 'private-light-a', isOn: false },
      { id: 'private-light-b', isOn: false },
      { id: 'private-light-c', isOn: false },
    ],
    legacyRuntimeLayout: structural,
    widgetTypeLayoutOverrides: {
      light: { xl: { hOff: 1, hOn: 2 } },
    },
    widgetLayoutOverrides: {},
    ...overrides,
  };
}

function solved(decision: GridEngineRootRuntimeRenderDecision) {
  expect(decision.kind).toBe('custom-solver');
  if (decision.kind !== 'custom-solver') throw new Error(`Expected custom-solver, received ${decision.kind}`);
  return decision;
}

function expectFallback(
  decision: GridEngineRootRuntimeRenderDecision,
  reason: string,
) {
  expect(decision).toMatchObject({ kind: 'legacy-fallback', reason });
}

function withLightsOn(...ids: string[]) {
  const enabled = new Set(ids);
  return roots
    .filter((root) => root.kind === 'light')
    .map((root) => ({ id: root.id, isOn: enabled.has(root.id) }));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

describe('Runtime Solver Renderer feature boundary', () => {
  it('1. is disabled when both flags are off', () => {
    expect(isGridEngine2RuntimeSolverRendererEnabled({ DEV: true })).toBe(false);
  });

  it('2. does not enable the solver renderer with only the custom renderer flag', () => {
    expect(isGridEngine2RuntimeSolverRendererEnabled({
      DEV: true,
      VITE_GRID_ENGINE_2_RENDERER: 'true',
    })).toBe(false);
  });

  it('3. records a development request but requires the custom renderer to enable it', () => {
    const environment = {
      DEV: true,
      VITE_GRID_ENGINE_2_RUNTIME_SOLVER_RENDERER: 'true',
    };
    expect(isGridEngine2RuntimeSolverRendererRequested(environment)).toBe(true);
    expect(isGridEngine2RuntimeSolverRendererEnabled(environment)).toBe(false);
  });

  it('4. enables only when both exact-true flags are present in development', () => {
    expect(isGridEngine2RuntimeSolverRendererEnabled({
      DEV: true,
      VITE_GRID_ENGINE_2_RENDERER: 'true',
      VITE_GRID_ENGINE_2_RUNTIME_SOLVER_RENDERER: 'true',
    })).toBe(true);
    expect(isGridEngine2RuntimeSolverRendererEnabled({
      DEV: true,
      VITE_GRID_ENGINE_2_RENDERER: 'TRUE',
      VITE_GRID_ENGINE_2_RUNTIME_SOLVER_RENDERER: true,
    })).toBe(false);
  });

  it('5. remains disabled in production even when both strings are true', () => {
    expect(isGridEngine2RuntimeSolverRendererRequested({
      DEV: false,
      VITE_GRID_ENGINE_2_RENDERER: 'true',
      VITE_GRID_ENGINE_2_RUNTIME_SOLVER_RENDERER: 'true',
    })).toBe(false);
    expectFallback(resolveGridEngineRootRuntimeRenderDecision(input({ development: false })), 'production-disabled');
  });
});

describe('gridEngineRootRuntimeRenderDecision gates', () => {
  it('6. always selects RGL in Edit Mode', () => {
    expectFallback(resolveGridEngineRootRuntimeRenderDecision(input({ isEditMode: true })), 'edit-mode');
  });

  it('7. falls back while the grid is not initialized', () => {
    expectFallback(resolveGridEngineRootRuntimeRenderDecision(input({ gridInitialized: false })), 'grid-not-initialized');
  });

  it('8. rejects an unloaded snapshot', () => {
    expectFallback(resolveGridEngineRootRuntimeRenderDecision(input({
      snapshot: { ...input().snapshot, phase: 'loading', coherent: false },
    })), 'snapshot-not-authoritative');
  });

  it('9. rejects a local-cache snapshot', () => {
    expectFallback(resolveGridEngineRootRuntimeRenderDecision(input({
      snapshot: { ...input().snapshot, source: 'local-cache', revision: null, coherent: false },
    })), 'snapshot-not-authoritative');
  });

  it('10. accepts a complete coherent HA snapshot', () => {
    expect(resolveGridEngineRootRuntimeRenderDecision(input()).kind).toBe('custom-solver');
  });

  it('11. rejects an incoherent HA snapshot', () => {
    expectFallback(resolveGridEngineRootRuntimeRenderDecision(input({
      snapshot: { ...input().snapshot, coherent: false },
    })), 'snapshot-not-authoritative');
  });

  it('12. rejects a pending applied-layout revision', () => {
    expectFallback(resolveGridEngineRootRuntimeRenderDecision(input({
      hasPendingAuthoritativeLayout: true,
    })), 'pending-authoritative-layout');
  });

  it('13. rejects a stale structural generation', () => {
    expectFallback(resolveGridEngineRootRuntimeRenderDecision(input({
      currentStructuralContext: { ...input().currentStructuralContext, generation: 4 },
    })), 'structural-context-mismatch');
  });

  it('14. rejects a non-authoritative draft', () => {
    expectFallback(resolveGridEngineRootRuntimeRenderDecision(input({
      hasNonAuthoritativeDraft: true,
    })), 'non-authoritative-draft');
  });

  it('15. rejects an unknown breakpoint', () => {
    expectFallback(resolveGridEngineRootRuntimeRenderDecision(input({ breakpoint: 'watch' })), 'unknown-breakpoint');
  });

  it('16. rejects a breakpoint without an explicit root layout', () => {
    expectFallback(resolveGridEngineRootRuntimeRenderDecision(input({ baseline: { kind: 'missing' } })), 'missing-explicit-layout');
  });

  it('17. never promotes a reconciled-provisional baseline', () => {
    expectFallback(resolveGridEngineRootRuntimeRenderDecision(input({
      baseline: { kind: 'reconciled-provisional', layout: structural },
    })), 'reconciled-provisional-baseline');
  });

  it('18. accepts a complete explicit structural layout', () => {
    expect(solved(resolveGridEngineRootRuntimeRenderDecision(input())).layout).toEqual(structural);
  });

  it('19. rejects an extra layout ID without filtering it', () => {
    const extra = [...structural, { i: 'orphan', x: 0, y: 3, w: 2, h: 1 }];
    const decision = resolveGridEngineRootRuntimeRenderDecision(input({ baseline: { kind: 'explicit', layout: extra } }));
    expectFallback(decision, 'invalid-structural-layout');
    expect(decision.diagnostics.issueCodes).toContain('UNKNOWN_LAYOUT_ID');
  });

  it('20. rejects a missing root ID', () => {
    const decision = resolveGridEngineRootRuntimeRenderDecision(input({
      baseline: { kind: 'explicit', layout: structural.slice(0, -1) },
    }));
    expectFallback(decision, 'invalid-structural-layout');
    expect(decision.diagnostics.issueCodes).toContain('MISSING_LAYOUT_ID');
  });

  it('21. rejects duplicate IDs', () => {
    const duplicated = [...structural, { ...structural[0] }];
    expectFallback(resolveGridEngineRootRuntimeRenderDecision(input({
      baseline: { kind: 'explicit', layout: duplicated },
    })), 'invalid-structural-layout');
  });

  it('22. rejects coordinates outside the current columns', () => {
    const invalid = structural.map((item) => item.i === 'direct-c' ? { ...item, x: 5, w: 2 } : item);
    expectFallback(resolveGridEngineRootRuntimeRenderDecision(input({
      baseline: { kind: 'explicit', layout: invalid },
    })), 'invalid-structural-layout');
  });

  it('23. rejects initial collisions', () => {
    const overlapping = structural.map((item) => item.i === 'direct-a' ? { ...item, y: 0 } : item);
    expectFallback(resolveGridEngineRootRuntimeRenderDecision(input({
      baseline: { kind: 'explicit', layout: overlapping },
    })), 'invalid-structural-layout');
  });

  it('24. rejects an unsupported dynamic Stack', () => {
    const stackLayout = [
      { i: 'stack', x: 0, y: 0, w: 4, h: 2 },
      { i: 'outside', x: 0, y: 2, w: 2, h: 1 },
    ];
    expectFallback(resolveGridEngineRootRuntimeRenderDecision(input({
      baseline: { kind: 'explicit', layout: stackLayout },
      rootElements: [
        { id: 'stack', role: 'stack', kind: 'stack-grid' },
        { id: 'outside', role: 'widget', kind: 'sensor' },
      ],
      lightStates: [],
      legacyRuntimeLayout: [{ ...stackLayout[0], h: 3 }, stackLayout[1]],
    })), 'unsupported-dynamic-component');
  });

  it('25. rejects a solver error', () => {
    expectFallback(resolveGridEngineRootRuntimeRenderDecision(input(), {
      solve: () => { throw new Error('synthetic failure'); },
    }), 'solver-error');
  });

  it('26. rejects a solver invalid result', () => {
    expectFallback(resolveGridEngineRootRuntimeRenderDecision(input(), {
      solve: () => ({
        status: 'invalid', layout: null, issues: [{ code: 'SOLVER_REJECTED', message: 'synthetic' }],
      }),
    }), 'solver-invalid');
  });

  it('27. rejects invalid final geometry even if a dependency labels it resolved', () => {
    expectFallback(resolveGridEngineRootRuntimeRenderDecision(input(), {
      solve: ({ structuralLayout: layout }) => ({
        status: 'resolved',
        layout: layout.map((item) => item.i === 'direct-a' ? { ...item, x: 1 } : item),
        appliedOverrideIds: [],
      }),
    }), 'invalid-final-geometry');
  });

  it('28. preserves the existing legacy renderer when custom is off', () => {
    expect(resolveGridEngineRootRuntimeRenderDecision(input({
      customRendererEnabled: false,
      runtimeSolverRendererRequested: false,
    }))).toMatchObject({ kind: 'existing-renderer', renderer: 'legacy' });
  });

  it('29. preserves the existing custom renderer when the new flag is off', () => {
    expect(resolveGridEngineRootRuntimeRenderDecision(input({
      runtimeSolverRendererRequested: false,
    }))).toMatchObject({ kind: 'existing-renderer', renderer: 'custom' });
  });

  it('30. keeps legacy when only the Runtime Solver Renderer flag is requested', () => {
    expect(resolveGridEngineRootRuntimeRenderDecision(input({
      customRendererEnabled: false,
      runtimeSolverRendererRequested: true,
    }))).toMatchObject({ kind: 'existing-renderer', renderer: 'legacy' });
  });
});

describe('gridEngineRootRuntimeRenderDecision geometry and safety', () => {
  it('31. returns the structural geometry when there are no overrides', () => {
    const decision = solved(resolveGridEngineRootRuntimeRenderDecision(input()));
    expect(decision.layout).toEqual(structural);
    expect(decision.diagnostics.overrideCount).toBe(0);
  });

  it('32. expands one Light and resolves its direct collision', () => {
    const decision = solved(resolveGridEngineRootRuntimeRenderDecision(input({
      lightStates: withLightsOn('private-light-a'),
    })));
    expect(decision.layout.find((item) => item.i === 'private-light-a')).toMatchObject({ h: 2, y: 0 });
    expect(decision.layout.find((item) => item.i === 'direct-a')).toMatchObject({ y: 2 });
    expect(decision.diagnostics).toMatchObject({ overrideCount: 1, finalCollisionCount: 0 });
  });

  it('33. supports a valid temporary contraction', () => {
    const tall = structural.map((item) => item.i === 'private-light-a' ? { ...item, h: 2 } : item)
      .map((item) => item.i === 'direct-a' ? { ...item, y: 2 } : item);
    const decision = solved(resolveGridEngineRootRuntimeRenderDecision(input({
      baseline: { kind: 'explicit', layout: tall },
      legacyRuntimeLayout: tall,
      lightStates: withLightsOn('private-light-a'),
      widgetLayoutOverrides: {
        'private-light-a': { xl: { hOff: 2, hOn: 1 } },
      },
    })));
    expect(decision.layout.find((item) => item.i === 'private-light-a')?.h).toBe(1);
    expect(decision.layout.find((item) => item.i === 'direct-a')?.y).toBe(2);
  });

  it('34. completes OFF -> ON -> OFF without drift', () => {
    const off = solved(resolveGridEngineRootRuntimeRenderDecision(input()));
    const on = solved(resolveGridEngineRootRuntimeRenderDecision(input({
      lightStates: withLightsOn('private-light-a'),
    })));
    const offAgain = solved(resolveGridEngineRootRuntimeRenderDecision(input()));
    expect(on.layout).not.toEqual(off.layout);
    expect(offAgain.layout).toEqual(off.layout);
  });

  it('35. resolves two simultaneous Light expansions', () => {
    const decision = solved(resolveGridEngineRootRuntimeRenderDecision(input({
      lightStates: withLightsOn('private-light-a', 'private-light-b'),
    })));
    expect(decision.diagnostics.overrideCount).toBe(2);
    expect(decision.layout.filter((item) => item.i.startsWith('direct-')).map((item) => item.y)).toEqual([2, 2, 1]);
  });

  it('36. resolves three simultaneous Light expansions', () => {
    const decision = solved(resolveGridEngineRootRuntimeRenderDecision(input({
      lightStates: withLightsOn('private-light-a', 'private-light-b', 'private-light-c'),
    })));
    expect(decision.diagnostics.overrideCount).toBe(3);
    expect(decision.layout.filter((item) => item.i.startsWith('direct-')).map((item) => item.y)).toEqual([2, 2, 2]);
  });

  it('37. is independent from equivalent Light-state ordering', () => {
    const states = withLightsOn('private-light-a', 'private-light-b');
    const forward = solved(resolveGridEngineRootRuntimeRenderDecision(input({ lightStates: states })));
    const reversed = solved(resolveGridEngineRootRuntimeRenderDecision(input({ lightStates: [...states].reverse() })));
    expect(reversed.layout).toEqual(forward.layout);
  });

  it.each([
    ['2xl', 12], ['xl', 12], ['lg', 8], ['md', 6], ['sm', 4], ['xs', 2],
  ])('38. resolves independently at the %s breakpoint', (breakpoint, cols) => {
    const layout = [
      { i: 'light', x: 0, y: 0, w: 1, h: 1 },
      { i: 'below', x: 0, y: 1, w: 1, h: 1 },
    ];
    const decision = solved(resolveGridEngineRootRuntimeRenderDecision(input({
      breakpoint,
      cols,
      baseline: { kind: 'explicit', layout },
      rootElements: [
        { id: 'light', role: 'widget', kind: 'light' },
        { id: 'below', role: 'widget', kind: 'sensor' },
      ],
      lightStates: [{ id: 'light', isOn: true }],
      legacyRuntimeLayout: layout,
      widgetTypeLayoutOverrides: { light: { [breakpoint]: { w: 1, hOff: 1, hOn: 2 } } },
    })));
    expect(decision.layout.find((item) => item.i === 'below')?.y).toBe(2);
  });

  it('39. recalculates Desktop -> Tablet -> Mobile -> Desktop from each baseline', () => {
    const resolveAt = (breakpoint: string, cols: number, width: number) => {
      const layout = [
        { i: 'light', x: 0, y: 0, w: width, h: 1 },
        { i: 'below', x: 0, y: 1, w: width, h: 1 },
      ];
      return solved(resolveGridEngineRootRuntimeRenderDecision(input({
        breakpoint,
        cols,
        baseline: { kind: 'explicit', layout },
        rootElements: [
          { id: 'light', role: 'widget', kind: 'light' },
          { id: 'below', role: 'widget', kind: 'sensor' },
        ],
        lightStates: [{ id: 'light', isOn: true }],
        legacyRuntimeLayout: layout,
        widgetTypeLayoutOverrides: { light: { [breakpoint]: { w: width, hOff: 1, hOn: 2 } } },
      })));
    };
    const desktop = resolveAt('xl', 12, 2);
    const tablet = resolveAt('md', 6, 2);
    const mobile = resolveAt('xs', 2, 1);
    const desktopAgain = resolveAt('xl', 12, 2);
    expect(tablet.layout.find((item) => item.i === 'below')?.y).toBe(2);
    expect(mobile.layout.find((item) => item.i === 'light')?.w).toBe(1);
    expect(desktopAgain.layout).toEqual(desktop.layout);
  });

  it('40. returns runtime spans coherent with the validated layout', () => {
    const decision = solved(resolveGridEngineRootRuntimeRenderDecision(input({
      lightStates: withLightsOn('private-light-a'),
    })));
    decision.layout.forEach((item) => {
      expect(decision.runtimeSpans.get(item.i)).toEqual({ w: item.w, h: item.h });
    });
  });

  it('41. does not mutate the snapshot, baseline or legacy layouts', () => {
    const current = input({ lightStates: withLightsOn('private-light-a') });
    const before = structuredClone(current);
    deepFreeze(current);
    resolveGridEngineRootRuntimeRenderDecision(current);
    expect(current).toEqual(before);
  });

  it('42. never calls storage, fetch or a commit callback', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());
    const commit = vi.fn();
    resolveGridEngineRootRuntimeRenderDecision(input({ lightStates: withLightsOn('private-light-a') }));
    expect(setItem).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    setItem.mockRestore();
    fetch.mockRestore();
  });

  it('43. exposes only sanitized counts and issue codes in diagnostics', () => {
    const decision = resolveGridEngineRootRuntimeRenderDecision(input({
      lightStates: withLightsOn('private-light-a'),
    }));
    const payload = JSON.stringify(createRuntimeRenderDecisionConsolePayload(decision));
    expect(payload).not.toContain('private-light');
    expect(payload).not.toContain('access_token');
    expect(payload).not.toContain('password');
    expect(payload).not.toContain('SECRET');
  });

  it.each([21, 30])('44. resolves %i roots within a practical synchronous budget', (count) => {
    const layout = Array.from({ length: count }, (_, index) => ({
      i: `root-${index}`,
      x: (index % 3) * 2,
      y: Math.floor(index / 3),
      w: 2,
      h: 1,
    }));
    const current = input({
      baseline: { kind: 'explicit', layout },
      rootElements: layout.map((item) => ({ id: item.i, role: 'widget', kind: 'sensor' })),
      lightStates: [],
      legacyRuntimeLayout: layout,
    });
    const startedAt = performance.now();
    const first = resolveGridEngineRootRuntimeRenderDecision(current);
    const elapsed = performance.now() - startedAt;
    const second = resolveGridEngineRootRuntimeRenderDecision(current);
    expect(first).toEqual(second);
    expect(first.kind).toBe('custom-solver');
    expect(elapsed).toBeLessThan(50);
    console.info(`[runtime-render-decision perf ${count}]`, { elapsedMs: Math.round(elapsed * 100) / 100 });
  });
});
