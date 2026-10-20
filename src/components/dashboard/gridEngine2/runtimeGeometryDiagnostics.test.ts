import { describe, expect, it } from 'vitest';
import type { GridLayoutItem } from './model';
import {
  inspectRuntimeGeometry,
  type RuntimeGeometryInspectionInput,
  type RuntimeGeometryInspectionReport,
  type RuntimeGeometryStructuralContext,
} from './runtimeGeometryDiagnostics';
import {
  createRuntimeGeometryConsolePayload,
  finalizeRuntimeGeometryDomInspection,
  type RuntimeGeometryDomSnapshot,
} from './runtimeGeometryDomInspection';
import type { RuntimeShadowRootElement } from './runtimeShadowBaseline';

const structural: GridLayoutItem[] = [
  { i: 'light', x: 0, y: 0, w: 2, h: 1 },
  { i: 'direct', x: 0, y: 1, w: 2, h: 1 },
  { i: 'chain', x: 0, y: 2, w: 2, h: 1 },
  { i: 'other-lane', x: 2, y: 1, w: 2, h: 1 },
  { i: 'outside', x: 4, y: 5, w: 2, h: 1 },
];
const expanded: GridLayoutItem[] = [
  { ...structural[0], h: 2 },
  { ...structural[1], y: 2 },
  { ...structural[2], y: 3 },
  structural[3],
  structural[4],
];
const context: RuntimeGeometryStructuralContext = {
  generation: 1,
  revision: 103,
  fingerprint: 'dsl-v1-test',
};

function roots(layout: readonly GridLayoutItem[]): RuntimeShadowRootElement[] {
  return layout.map((item) => ({
    id: item.i,
    role: 'widget',
    kind: item.i === 'light' ? 'light' : 'sensor',
  }));
}

function input(overrides: Partial<RuntimeGeometryInspectionInput> = {}): RuntimeGeometryInspectionInput {
  return {
    breakpoint: 'xl',
    cols: 6,
    rootElements: roots(structural),
    structuralLayout: structural,
    solverCandidate: structural,
    legacyRuntimeInput: structural,
    appliedOverrideIds: [],
    baselineQuality: 'explicit-complete-candidate',
    comparisonConfidence: 'reliable',
    structuralContext: context,
    expectedStructuralContext: context,
    ...overrides,
  };
}

function expandedReport(overrides: Partial<RuntimeGeometryInspectionInput> = {}) {
  return inspectRuntimeGeometry(input({
    solverCandidate: expanded,
    legacyRuntimeInput: expanded,
    appliedOverrideIds: ['light'],
    ...overrides,
  }));
}

function element(report: RuntimeGeometryInspectionReport, id: string) {
  return report.elements.find((current) => current.id === id)!;
}

function snapshot(
  report: RuntimeGeometryInspectionReport,
  rects: Record<string, { left: number; top: number; width: number; height: number } | null>,
  overrides: Partial<RuntimeGeometryDomSnapshot> = {},
): RuntimeGeometryDomSnapshot {
  return {
    renderer: 'legacy',
    structuralContext: report.structuralContext,
    canvasRect: { left: 0, top: 0, width: 600, height: 600 },
    observedRootIds: report.elements.map(({ id }) => id),
    elements: report.elements.map(({ id }) => ({
      id,
      rect: rects[id] ?? null,
      hasRunningGeometryAnimation: false,
    })),
    acquisitionMs: 0.25,
    ...overrides,
  };
}

const geometry = {
  width: 600,
  cols: 6,
  rowHeight: 20,
  gap: [0, 0] as const,
  padding: [0, 0] as const,
};

describe('runtime per-element geometry diagnostics', () => {
  it('1. compares identical structural, solver and legacy geometry', () => {
    const report = inspectRuntimeGeometry(input());
    expect(report.status).toBe('available');
    expect(report.elements).toHaveLength(5);
    expect(report.elements.every((current) => current.solverClassification === 'unchanged')).toBe(true);
    expect(report.elements.every((current) => current.structuralToSolver.deltaY === 0)).toBe(true);
  });

  it('2. records an expanded Light as an explicit runtime override', () => {
    const report = expandedReport();
    expect(element(report, 'light')).toMatchObject({
      solverClassification: 'runtime-override',
      evidenceQuality: 'demonstrated',
      structuralToSolver: { deltaX: 0, deltaY: 0, deltaW: 0, deltaH: 1 },
    });
  });

  it('3. demonstrates a direct collision with the added occupied area', () => {
    const direct = element(expandedReport(), 'direct');
    expect(direct.solverClassification).toBe('direct-collision');
    expect(direct.directCollisionWith).toEqual(['light']);
    expect(direct.structuralToSolver.deltaY).toBe(1);
    expect(direct.evidenceQuality).toBe('demonstrated');
  });

  it('4. keeps propagated movement at collision-chain-candidate confidence', () => {
    const chain = element(expandedReport(), 'chain');
    expect(chain.solverClassification).toBe('collision-chain-candidate');
    expect(chain.chainCandidateFrom).toEqual(['direct']);
    expect(chain.evidenceQuality).toBe('plausible');
  });

  it('5. leaves a card outside the collision chain unchanged', () => {
    expect(element(expandedReport(), 'outside')).toMatchObject({
      solverClassification: 'unchanged',
      structuralToSolver: { deltaX: 0, deltaY: 0, deltaW: 0, deltaH: 0 },
    });
  });

  it('6. leaves an independent horizontal lane unchanged', () => {
    expect(element(expandedReport(), 'other-lane').solverClassification).toBe('unchanged');
  });

  it('7. isolates two position differences in a 21-root fixture', () => {
    const layout = [
      ...structural.slice(0, 3),
      ...Array.from({ length: 18 }, (_, index) => ({
        i: `independent-${index}`,
        x: 2 + (index % 2) * 2,
        y: 4 + Math.floor(index / 2),
        w: 2,
        h: 1,
      })),
    ];
    const solver = layout.map((item) => item.i === 'light'
      ? { ...item, h: 2 }
      : item.i === 'direct'
        ? { ...item, y: 2 }
        : item.i === 'chain'
          ? { ...item, y: 3 }
          : item);
    const legacy = solver.map((item) => item.i === 'direct'
      ? { ...item, y: 3 }
      : item.i === 'chain'
        ? { ...item, y: 2 }
        : item);
    const report = inspectRuntimeGeometry(input({
      rootElements: roots(layout), structuralLayout: layout, solverCandidate: solver,
      legacyRuntimeInput: legacy, appliedOverrideIds: ['light'],
    }));
    expect(report.elementCount).toBe(21);
    expect(report.solverLegacyDifferenceCount).toBe(2);
    expect(report.elements.filter((current) => current.solverToLegacy.deltaY !== 0).map((current) => current.id)).toEqual([
      'chain', 'direct',
    ]);
  });

  it('8. exposes size deltas without relabeling them as collisions', () => {
    const legacy = structural.map((item) => item.i === 'outside' ? { ...item, w: 1 } : item);
    const report = inspectRuntimeGeometry(input({ legacyRuntimeInput: legacy }));
    expect(element(report, 'outside')).toMatchObject({
      solverToLegacy: { deltaW: -1 },
      legacyClassification: 'unexplained-runtime-difference',
    });
  });

  it('9. reports root ordering independently from geometry', () => {
    const report = inspectRuntimeGeometry(input({ legacyRuntimeInput: [...structural].reverse() }));
    expect(element(report, 'light').solverToLegacy.deltaIndex).toBe(4);
    expect(element(report, 'light').legacyClassification).toBe('order-difference');
    expect(report.solverLegacyDifferenceCount).toBe(4);
  });

  it('10. evaluates rectangles with different widths', () => {
    const initial = [
      { i: 'light', x: 0, y: 0, w: 2, h: 1 },
      { i: 'wide', x: 1, y: 1, w: 4, h: 1 },
    ];
    const candidate = [{ ...initial[0], w: 3, h: 2 }, { ...initial[1], y: 2 }];
    const report = inspectRuntimeGeometry(input({
      rootElements: roots(initial), structuralLayout: initial, solverCandidate: candidate,
      legacyRuntimeInput: candidate, appliedOverrideIds: ['light'],
    }));
    expect(element(report, 'wide').solverClassification).toBe('direct-collision');
  });

  it('11. detects a partial column intersection', () => {
    const initial = [
      { i: 'light', x: 0, y: 0, w: 2, h: 1 },
      { i: 'partial', x: 2, y: 1, w: 2, h: 1 },
    ];
    const candidate = [{ ...initial[0], w: 3, h: 2 }, { ...initial[1], y: 2 }];
    const report = inspectRuntimeGeometry(input({
      rootElements: roots(initial), structuralLayout: initial, solverCandidate: candidate,
      legacyRuntimeInput: candidate, appliedOverrideIds: ['light'],
    }));
    expect(element(report, 'partial').directCollisionWith).toEqual(['light']);
  });

  it('12. attributes simultaneous expansions to every direct trigger', () => {
    const initial = [
      { i: 'first', x: 0, y: 0, w: 2, h: 1 },
      { i: 'second', x: 2, y: 0, w: 2, h: 1 },
      { i: 'wide', x: 0, y: 1, w: 4, h: 1 },
    ];
    const candidate = [
      { ...initial[0], h: 2 }, { ...initial[1], h: 2 }, { ...initial[2], y: 2 },
    ];
    const report = inspectRuntimeGeometry(input({
      cols: 4, rootElements: roots(initial), structuralLayout: initial, solverCandidate: candidate,
      legacyRuntimeInput: candidate, appliedOverrideIds: ['second', 'first'],
    }));
    expect(element(report, 'wide').directCollisionWith).toEqual(['first', 'second']);
  });

  it('13. is independent of applied override order', () => {
    const first = expandedReport({ appliedOverrideIds: ['light'] });
    const second = expandedReport({ appliedOverrideIds: [...['light']].reverse() });
    expect({ ...first, timings: undefined }).toEqual({ ...second, timings: undefined });
  });

  it('14. returns exactly to the structural report after OFF -> ON -> OFF', () => {
    const off = inspectRuntimeGeometry(input());
    const on = expandedReport();
    const offAgain = inspectRuntimeGeometry(input());
    expect(on.changedBySolverCount).toBe(3);
    expect({ ...offAgain, timings: undefined }).toEqual({ ...off, timings: undefined });
  });

  it('15. labels an upward-only legacy delta as a compaction candidate', () => {
    const legacy = expanded.map((item) => item.i === 'outside' ? { ...item, y: 4 } : item);
    const report = expandedReport({ legacyRuntimeInput: legacy });
    expect(element(report, 'outside').legacyClassification).toBe('legacy-compaction-candidate');
    expect(element(report, 'outside').solverToLegacy.deltaY).toBe(-1);
  });

  it('16. labels movement with no geometric cause as unexplained', () => {
    const candidate = structural.map((item) => item.i === 'outside' ? { ...item, y: 7 } : item);
    const report = inspectRuntimeGeometry(input({ solverCandidate: candidate, legacyRuntimeInput: candidate }));
    expect(element(report, 'outside')).toMatchObject({
      solverClassification: 'unexplained-movement', evidenceQuality: 'unknown',
    });
  });

  it('17. never upgrades reconstructed propagation to demonstrated causality', () => {
    const chain = element(expandedReport(), 'chain');
    expect(chain.solverClassification).toBe('collision-chain-candidate');
    expect(chain.reasons).toContain('final-displacement-is-compatible-with-collision-propagation');
    expect(chain.reasons.join(' ')).not.toMatch(/necessary|minimal/i);
  });

  it('18. refuses invalid initial geometry', () => {
    const invalid = structural.map((item) => item.i === 'direct' ? { ...item, y: 0 } : item);
    const report = inspectRuntimeGeometry(input({ structuralLayout: invalid }));
    expect(report).toMatchObject({ status: 'unavailable', issueCodes: ['INVALID_INITIAL_GEOMETRY'] });
  });

  it('19. propagates a reconciled-provisional baseline limitation', () => {
    const report = inspectRuntimeGeometry(input({
      baselineQuality: 'reconciled-provisional', comparisonConfidence: 'provisional',
    }));
    expect(report.comparisonConfidence).toBe('provisional');
    expect(report.limitations).toContain('reconciled-provisional-baseline');
  });

  it('20. refuses a different structural revision or generation', () => {
    const report = inspectRuntimeGeometry(input({
      expectedStructuralContext: { ...context, generation: 2, revision: 104 },
    }));
    expect(report).toMatchObject({ status: 'unavailable', issueCodes: ['STRUCTURAL_CONTEXT_MISMATCH'] });
  });

  it('21. refuses missing IDs instead of aligning by array index', () => {
    const report = inspectRuntimeGeometry(input({ solverCandidate: structural.slice(0, -1) }));
    expect(report).toMatchObject({ status: 'unavailable', issueCodes: ['MISSING_GEOMETRY_ID'] });
  });

  it('22. marks an unsupported dynamic Stack as insufficient evidence', () => {
    const report = inspectRuntimeGeometry(input({
      rootElements: roots(structural).map((root) => root.id === 'outside'
        ? { ...root, role: 'stack', kind: 'stack-grid' }
        : root),
      unsupportedDynamicRootIds: ['outside'],
    }));
    expect(element(report, 'outside')).toMatchObject({
      solverClassification: 'insufficient-evidence', evidenceQuality: 'unknown',
    });
  });

  it('23. refuses a derived breakpoint baseline', () => {
    const report = inspectRuntimeGeometry(input({ baselineProvenance: 'derived-grid-engine-layout' }));
    expect(report).toMatchObject({ status: 'unavailable', issueCodes: ['DERIVED_BASELINE_UNSUPPORTED'] });
  });

  it('24. represents unavailable DOM geometry explicitly', () => {
    const report = inspectRuntimeGeometry(input());
    const missing = snapshot(report, {});
    const dom = finalizeRuntimeGeometryDomInspection({ comparison: report, first: missing, second: missing, geometry });
    expect(dom.status).toBe('unavailable');
    expect(dom.unavailableCount).toBe(5);
    expect(dom.elements[0].reason).toBe('root-container-not-observable');
  });

  it('25. reports stable bounding boxes with no root overlap', () => {
    const report = inspectRuntimeGeometry(input());
    const rects = Object.fromEntries(report.elements.map((current, index) => [
      current.id, { left: index * 100, top: 0, width: 90, height: 20 },
    ]));
    const observed = snapshot(report, rects);
    const dom = finalizeRuntimeGeometryDomInspection({ comparison: report, first: observed, second: observed, geometry });
    expect(dom.status).toBe('stable');
    expect(dom.overlapPairs).toEqual([]);
  });

  it('26. converts legacy cells to pixels before calculating DOM deltas', () => {
    const report = inspectRuntimeGeometry(input());
    const rects = Object.fromEntries(report.elements.map((current) => [
      current.id,
      {
        left: current.legacyRuntimeInput.x * 100,
        top: current.legacyRuntimeInput.y * 20,
        width: current.legacyRuntimeInput.w * 100,
        height: current.legacyRuntimeInput.h * 20,
      },
    ]));
    const observed = snapshot(report, rects);
    const dom = finalizeRuntimeGeometryDomInspection({ comparison: report, first: observed, second: observed, geometry });
    expect(dom.elements.every((current) => current.legacyInputToObservedPixels?.deltaX === 0)).toBe(true);
    expect(dom.elements.every((current) => current.legacyInputToObservedPixels?.deltaH === 0)).toBe(true);
  });

  it('27. applies pixel tolerance and marks a larger inter-frame delta transient', () => {
    const report = inspectRuntimeGeometry(input());
    const baseRects = Object.fromEntries(report.elements.map((current) => [
      current.id, { left: current.structural.x * 100, top: current.structural.y * 20, width: current.structural.w * 100, height: 20 },
    ]));
    const within = structuredClone(baseRects);
    within.light.left += 0.8;
    const stable = finalizeRuntimeGeometryDomInspection({
      comparison: report, first: snapshot(report, baseRects), second: snapshot(report, within), geometry,
    });
    expect(stable.elements.find((current) => current.id === 'light')?.status).toBe('stable');
    const beyond = structuredClone(baseRects);
    beyond.light.left += 1.2;
    const transient = finalizeRuntimeGeometryDomInspection({
      comparison: report, first: snapshot(report, baseRects), second: snapshot(report, beyond), geometry,
    });
    expect(transient.elements.find((current) => current.id === 'light')?.status).toBe('measurement-transient');
  });

  it('28. does not mutate any geometry input', () => {
    const current = input({ solverCandidate: expanded, legacyRuntimeInput: expanded, appliedOverrideIds: ['light'] });
    const before = structuredClone(current);
    inspectRuntimeGeometry(current);
    expect(current).toEqual(before);
  });

  it('29. sanitizes IDs and excludes unrelated sensitive data from console payloads', () => {
    const privateLayout = structural.map((item, index) => ({ ...item, i: `private.entity-${index}` }));
    const report = inspectRuntimeGeometry(input({
      rootElements: roots(privateLayout), structuralLayout: privateLayout,
      solverCandidate: privateLayout, legacyRuntimeInput: privateLayout,
    }));
    const rects = Object.fromEntries(report.elements.map((current, index) => [
      current.id, { left: index * 100, top: 0, width: 90, height: 20 },
    ]));
    const observed = snapshot(report, rects);
    const dom = finalizeRuntimeGeometryDomInspection({ comparison: report, first: observed, second: observed, geometry });
    const payload = JSON.stringify(createRuntimeGeometryConsolePayload(report, dom, 'safe-signature'));
    expect(payload).toContain('idFingerprint');
    expect(payload).not.toContain('private.entity');
    expect(payload).not.toContain('access_token');
    expect(payload).not.toContain('SECRET');
  });

  it('30. analyzes 22 roots and records separate phase timings', () => {
    const layout = Array.from({ length: 22 }, (_, index) => ({
      i: `root-${index}`, x: (index % 3) * 2, y: Math.floor(index / 3), w: 2, h: 1,
    }));
    const report = inspectRuntimeGeometry(input({
      rootElements: roots(layout), structuralLayout: layout,
      solverCandidate: layout, legacyRuntimeInput: layout,
    }));
    expect(report.elementCount).toBe(22);
    expect(element(report, 'root-21').structural).toMatchObject(layout[21]);
    expect(report.timings).toEqual(expect.objectContaining({
      differenceAnalysisMs: expect.any(Number), collisionAnalysisMs: expect.any(Number), totalMs: expect.any(Number),
    }));
    console.info('[runtime-geometry perf 22]', report.timings);
  });

  it('31. analyzes 30 roots without losing per-element geometry', () => {
    const layout = Array.from({ length: 30 }, (_, index) => ({
      i: `root-${index}`, x: (index % 3) * 2, y: Math.floor(index / 3), w: 2, h: 1,
    }));
    const report = inspectRuntimeGeometry(input({
      rootElements: roots(layout), structuralLayout: layout,
      solverCandidate: layout, legacyRuntimeInput: layout,
    }));
    expect(report.elementCount).toBe(30);
    expect(report.elements.every((current) => current.solverClassification === 'unchanged')).toBe(true);
    expect(report.elements.map((current) => current.structural.i).sort()).toEqual(layout.map((current) => current.i).sort());
    console.info('[runtime-geometry perf 30]', report.timings);
  });
});
