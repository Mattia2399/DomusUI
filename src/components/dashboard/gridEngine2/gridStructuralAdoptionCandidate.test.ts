// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_GRID_BREAKPOINT_ORDER,
  type DashboardGridBreakpoint,
} from '../../../types/widgetTypeLayout';
import {
  acknowledgeGridStructuralAdoptionCandidateV1,
  createGridStructuralAdoptionCandidateV1,
  invalidateGridStructuralAdoptionCandidateV1,
  validateGridStructuralAdoptionLayout,
  type CreateGridStructuralAdoptionCandidateInput,
  type GridStructuralAdoptionBreakpointInput,
  type GridStructuralAdoptionInventoryEntry,
  type GridStructuralAdoptionSourceIdentity,
} from './gridStructuralAdoptionCandidate';
import type { GridLayoutItem } from './model';
import { colsForBreakpoint } from './responsiveLayout';

const identity: GridStructuralAdoptionSourceIdentity = {
  editSessionId: 'edit-adoption-1',
  draftFingerprint: 'draft-1',
  inventoryFingerprint: 'inventory-1',
  structuralGeneration: 7,
  structuralRevision: 84,
  structuralFingerprint: 'structural-1',
};

const inventory: readonly GridStructuralAdoptionInventoryEntry[] = [
  {
    id: 'root.light', title: 'Luce', kind: 'light', role: 'root-widget', parentId: null,
    constraints: { minW: 1, maxW: 2, minH: 1, maxH: 3 },
  },
  {
    id: 'section.scenes', title: 'Scene', kind: 'scenes', role: 'special-section', parentId: null,
    constraints: { minW: 1, maxW: 12, minH: 1, maxH: 4 },
  },
  {
    id: 'section.stack', title: 'Stack', kind: 'stack-grid', role: 'stack-root', parentId: null,
    constraints: { minW: 1, maxW: 12, minH: 1, maxH: 8 },
  },
  { id: 'stack.child', title: 'Figlio', kind: 'sensor', role: 'stack-child', parentId: 'section.stack' },
];

function layout(): readonly GridLayoutItem[] {
  return [
    { i: 'root.light', x: 0, y: 0, w: 1, h: 1 },
    { i: 'section.scenes', x: 0, y: 2, w: 1, h: 1 },
    { i: 'section.stack', x: 0, y: 4, w: 1, h: 1 },
  ];
}

function breakpoint(
  name: DashboardGridBreakpoint,
  override: Partial<GridStructuralAdoptionBreakpointInput> = {},
): GridStructuralAdoptionBreakpointInput {
  return {
    breakpoint: name,
    cols: colsForBreakpoint(name),
    baselineState: 'complete',
    geometrySource: 'editor-effective',
    operationalGeometry: layout(),
    draftExplicitGeometry: layout(),
    persistedExplicitGeometry: layout(),
    ...override,
  };
}

function input(
  override: Partial<CreateGridStructuralAdoptionCandidateInput> = {},
): CreateGridStructuralAdoptionCandidateInput {
  return {
    sourceIdentity: identity,
    currentSourceIdentity: identity,
    inventory,
    legacyExtraIds: [],
    breakpoints: DASHBOARD_GRID_BREAKPOINT_ORDER.map((name) => breakpoint(name)),
    selectedBreakpoints: [...DASHBOARD_GRID_BREAKPOINT_ORDER],
    mode: 'manual',
    authority: {
      source: 'structural-policy-v1',
      renderingAuthority: 'not-authorized',
      reasonCodes: ['PREVIEW_AUTHORITY_NON_AUTHORITATIVE'],
    },
    ...override,
  };
}

function codes(result: ReturnType<typeof createGridStructuralAdoptionCandidateV1>) {
  return result.issues.map((entry) => entry.code);
}

describe('GridStructuralAdoptionCandidateV1', () => {
  it('builds the same candidate deterministically and mutates no geometry', () => {
    const source = input();
    const before = JSON.stringify(source);
    const first = createGridStructuralAdoptionCandidateV1(source);
    const second = createGridStructuralAdoptionCandidateV1(source);

    expect(first).toEqual(second);
    expect(first.candidateSignature).toBe(second.candidateSignature);
    expect(JSON.stringify(source)).toBe(before);
    expect(first.preparation).toEqual({
      geometryMutationCount: 0,
      compactionApplied: false,
      storageWrites: false,
      homeAssistantWrites: false,
    });
    expect(first.breakpoints.every((entry) => entry.candidateMatchesOperational)).toBe(true);
    expect(first.structuralVerification.status).toBe('verified');
    expect(first.applicationAuthorization.status).toBe('not-authorized');
    expect(first.applicationAuthorization.reasonCodes).toContain('SOURCE_LINEAGE_NOT_VERIFIED');
  });

  it('keeps the complete root inventory and excludes Stack children from active roots', () => {
    const result = createGridStructuralAdoptionCandidateV1(input());

    expect(result.inventory.rootCount).toBe(3);
    expect(result.inventory.roots.map((entry) => entry.id)).toEqual([
      'root.light', 'section.scenes', 'section.stack',
    ]);
    expect(result.inventory.nonRoots.map((entry) => entry.id)).toEqual(['stack.child']);
  });

  it('reports a missing root without inventing coordinates', () => {
    const result = createGridStructuralAdoptionCandidateV1(input({
      selectedBreakpoints: ['lg'],
      breakpoints: [breakpoint('lg', { operationalGeometry: layout().slice(0, 2) })],
    }));

    expect(codes(result)).toContain('MISSING_ROOT');
    expect(result.breakpoints[0].candidateGeometry).toHaveLength(2);
    expect(result.breakpoints[0].eligibility).toBe('blocked-invalid');
  });

  it('detects duplicate inventory identities', () => {
    const result = createGridStructuralAdoptionCandidateV1(input({
      inventory: [...inventory, { ...inventory[0] }],
    }));

    expect(codes(result)).toContain('DUPLICATE_INVENTORY_ID');
    expect(result.structuralVerification.status).toBe('blocked');
  });

  it('preserves a declared legacy extra as evidence instead of making it active', () => {
    const result = createGridStructuralAdoptionCandidateV1(input({
      selectedBreakpoints: ['xl'],
      legacyExtraIds: ['legacy.removed'],
      breakpoints: [breakpoint('xl', {
        operationalGeometry: [...layout(), { i: 'legacy.removed', x: 5, y: 8, w: 1, h: 1 }],
      })],
    }));

    expect(codes(result)).toContain('LEGACY_EXTRA_ID_PRESERVED');
    expect(result.breakpoints[0].preservedLegacyExtraIds).toEqual(['legacy.removed']);
    expect(result.breakpoints[0].candidateGeometry?.map((entry) => entry.i)).not.toContain('legacy.removed');
  });

  it('rejects unknown and duplicate active root geometry', () => {
    const result = createGridStructuralAdoptionCandidateV1(input({
      selectedBreakpoints: ['xl'],
      breakpoints: [breakpoint('xl', {
        operationalGeometry: [
          ...layout(),
          { ...layout()[0] },
          { i: 'unknown.root', x: 8, y: 8, w: 1, h: 1 },
        ],
      })],
    }));

    expect(codes(result)).toContain('DUPLICATE_ROOT');
    expect(codes(result)).toContain('UNKNOWN_ROOT');
    expect(result.breakpoints[0].eligibility).toBe('blocked-invalid');
  });

  it('rejects a Stack child promoted into operational root geometry', () => {
    const result = createGridStructuralAdoptionCandidateV1(input({
      selectedBreakpoints: ['md'],
      breakpoints: [breakpoint('md', {
        operationalGeometry: [...layout(), { i: 'stack.child', x: 1, y: 8, w: 1, h: 1 }],
      })],
    }));

    expect(codes(result)).toContain('STACK_CHILD_PROMOTED');
    expect(result.breakpoints[0].candidateGeometry?.map((entry) => entry.i)).not.toContain('stack.child');
  });

  it('recognizes an orphan without promoting it', () => {
    const orphan = { id: 'orphan', title: 'Orfano', kind: 'sensor', role: 'orphan-child' as const, parentId: 'missing' };
    const result = createGridStructuralAdoptionCandidateV1(input({ inventory: [...inventory, orphan] }));

    expect(codes(result)).toContain('ORPHAN_INVENTORY_ENTRY');
    expect(result.inventory.nonRoots).toContainEqual(orphan);
  });

  it.each([
    [{ i: 'root.light', x: Number.NaN, y: 0, w: 1, h: 1 }, 'INVALID_NUMBER'],
    [{ i: 'root.light', x: 0, y: 0, w: 0, h: 1 }, 'INVALID_DIMENSION'],
    [{ i: 'root.light', x: 2, y: 0, w: 1, h: 1 }, 'OUT_OF_BOUNDS'],
  ] as const)('reports invalid geometry %#', (badItem, expected) => {
    const bad = [badItem, ...layout().slice(1)];
    const result = createGridStructuralAdoptionCandidateV1(input({
      selectedBreakpoints: ['xs'],
      breakpoints: [breakpoint('xs', { operationalGeometry: bad })],
    }));

    expect(codes(result)).toContain(expected);
    expect(result.breakpoints[0].structuralVerification).toBe('blocked');
  });

  it('distinguishes a legacy collision from a candidate validation collision', () => {
    const colliding = [
      { i: 'root.light', x: 0, y: 0, w: 1, h: 1 },
      { i: 'section.scenes', x: 0, y: 0, w: 1, h: 1 },
      { i: 'section.stack', x: 0, y: 4, w: 1, h: 1 },
    ];
    const sourceIssues = validateGridStructuralAdoptionLayout({
      breakpoint: 'lg', cols: 8, layout: colliding, inventory, phase: 'legacy-source',
    });
    const candidateIssues = validateGridStructuralAdoptionLayout({
      breakpoint: 'lg', cols: 8, layout: colliding, inventory, phase: 'candidate',
    });

    expect(sourceIssues.map((entry) => entry.code)).toContain('LEGACY_SOURCE_COLLISION');
    expect(candidateIssues.map((entry) => entry.code)).toContain('CANDIDATE_COLLISION');
  });

  it('can classify an error introduced only in candidate construction', () => {
    const validSource = validateGridStructuralAdoptionLayout({
      breakpoint: 'lg', cols: 8, layout: layout(), inventory, phase: 'legacy-source',
    });
    const introducedCollision = layout().map((entry) => entry.i === 'section.scenes'
      ? { ...entry, x: 0, y: 0 }
      : entry);
    const candidateIssues = validateGridStructuralAdoptionLayout({
      breakpoint: 'lg', cols: 8, layout: introducedCollision, inventory, phase: 'candidate',
    });

    expect(validSource.some((entry) => entry.severity === 'error')).toBe(false);
    expect(candidateIssues.map((entry) => entry.code)).toContain('CANDIDATE_COLLISION');
  });

  it('enforces per-card min and max constraints', () => {
    const tooLarge = layout().map((entry) => entry.i === 'root.light' ? { ...entry, w: 3 } : entry);
    const result = createGridStructuralAdoptionCandidateV1(input({
      selectedBreakpoints: ['lg'],
      breakpoints: [breakpoint('lg', { operationalGeometry: tooLarge })],
    }));

    expect(codes(result)).toContain('MAX_CONSTRAINT_VIOLATION');
  });

  it('leaves a Missing breakpoint without candidate coordinates', () => {
    const result = createGridStructuralAdoptionCandidateV1(input({
      selectedBreakpoints: ['2xl'],
      breakpoints: [breakpoint('2xl', {
        baselineState: 'missing',
        draftExplicitGeometry: null,
        persistedExplicitGeometry: null,
      })],
    }));

    expect(result.breakpoints[0].candidateGeometry).toBeNull();
    expect(result.breakpoints[0].eligibility).toBe('blocked-missing');
    expect(result.breakpoints[0].provenance.responsiveFallback).toBe('operational-without-explicit-layout');
    expect(codes(result)).toContain('BREAKPOINT_MISSING');
  });

  it('keeps a Provisional baseline non-authoritative while retaining the observed candidate', () => {
    const result = createGridStructuralAdoptionCandidateV1(input({
      selectedBreakpoints: ['xl'],
      breakpoints: [breakpoint('xl', { baselineState: 'provisional' })],
    }));

    expect(result.breakpoints[0].candidateGeometry).toEqual(layout());
    expect(result.breakpoints[0].structuralVerification).toBe('incomplete');
    expect(result.applicationAuthorization.status).toBe('not-authorized');
  });

  it('records draft/Home differences and unresolved runtime spans without altering them', () => {
    const operational = layout().map((entry) => entry.i === 'root.light'
      ? { ...entry, x: 2, w: 2, h: 2 }
      : entry);
    const result = createGridStructuralAdoptionCandidateV1(input({
      selectedBreakpoints: ['lg'],
      breakpoints: [breakpoint('lg', { operationalGeometry: operational })],
    }));
    const light = result.breakpoints[0].rootComparisons.find((entry) => entry.rootId === 'root.light');

    expect(light?.draftComparison).toBe('different');
    expect(light?.runtimeSpan).toBe('different-from-draft-unresolved');
    expect(light?.candidate).toEqual(operational[0]);
    expect(codes(result)).toContain('LEGACY_TRANSFORMATION_OBSERVED');
    expect(codes(result)).toContain('RUNTIME_SPAN_UNRESOLVED');
  });

  it.each(['manual', 'automatic'] as const)('stores an explicit %s choice without compacting', (mode) => {
    const result = createGridStructuralAdoptionCandidateV1(input({ mode }));

    expect(result.modeChoice).toEqual({
      mode,
      source: 'explicit-user-choice',
      transformationApplied: false,
    });
    expect(result.preparation.compactionApplied).toBe(false);
  });

  it('acknowledges intent without granting structural authority', () => {
    const prepared = createGridStructuralAdoptionCandidateV1(input());
    const acknowledged = acknowledgeGridStructuralAdoptionCandidateV1(prepared, identity);

    expect(prepared.lifecycle).toBe('prepared');
    expect(acknowledged.lifecycle).toBe('acknowledged');
    expect(acknowledged.acknowledgement.status).toBe('acknowledged');
    expect(acknowledged.applicationAuthorization.status).toBe('not-authorized');
  });

  it.each([
    ['editSessionId', 'edit-adoption-2', 'EDIT_SESSION_CHANGED'],
    ['inventoryFingerprint', 'inventory-2', 'INVENTORY_CHANGED'],
    ['draftFingerprint', 'draft-2', 'DRAFT_CHANGED_CONCURRENTLY'],
    ['structuralGeneration', 8, 'STRUCTURAL_SNAPSHOT_STALE'],
  ] as const)('invalidates the staged candidate when %s changes', (key, value, expected) => {
    const prepared = createGridStructuralAdoptionCandidateV1(input());
    const invalidated = invalidateGridStructuralAdoptionCandidateV1(prepared, { ...identity, [key]: value });

    expect(invalidated.lifecycle).toBe('invalidated');
    expect(invalidated.acknowledgement.status).toBe('not-acknowledged');
    expect(invalidated.issues.map((entry) => entry.code)).toContain(expected);
  });
});
