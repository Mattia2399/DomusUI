// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_GRID_BREAKPOINT_ORDER,
  type DashboardGridBreakpoint,
} from '../../../types/widgetTypeLayout';
import { colsForBreakpoint } from './responsiveLayout';
import {
  createGridEngineDraftChangeSet,
  type CreateGridEngineDraftChangeSetInput,
  type GridEngineDraftBreakpointInput,
  type GridEngineDraftInventoryEntry,
  type GridEngineDraftSourceIdentity,
} from './gridEngineDraftChangeSet';
import type { GridLayoutItem } from './model';

const inventory: readonly GridEngineDraftInventoryEntry[] = [
  { id: 'a', title: 'Alpha', role: 'root-widget' },
  { id: 'b', title: 'Beta', role: 'special-section' },
  { id: 'stack-child', title: 'Stack child', role: 'stack-child' },
];

const sourceIdentity: GridEngineDraftSourceIdentity = {
  editSessionId: 'edit-42',
  draftFingerprint: 'draft-a',
  inventoryFingerprint: 'inventory-a',
  structuralGeneration: 7,
  structuralRevision: 84,
  structuralFingerprint: 'snapshot-a',
};

function baseLayout(): readonly GridLayoutItem[] {
  return [
    { i: 'a', x: 0, y: 0, w: 1, h: 1 },
    { i: 'b', x: 0, y: 3, w: 1, h: 1 },
  ];
}

function breakpointInput(
  breakpoint: DashboardGridBreakpoint,
  override: Partial<GridEngineDraftBreakpointInput> = {},
): GridEngineDraftBreakpointInput {
  return {
    breakpoint,
    cols: colsForBreakpoint(breakpoint),
    before: baseLayout(),
    after: baseLayout(),
    mode: 'manual',
    origin: 'editor-effective',
    baselineState: 'complete',
    explicitOverride: false,
    ...override,
  };
}

function allBreakpoints(
  overrides: Partial<Record<DashboardGridBreakpoint, Partial<GridEngineDraftBreakpointInput>>> = {},
) {
  return DASHBOARD_GRID_BREAKPOINT_ORDER.map((breakpoint) => (
    breakpointInput(breakpoint, overrides[breakpoint])
  ));
}

function input(
  override: Partial<CreateGridEngineDraftChangeSetInput> = {},
): CreateGridEngineDraftChangeSetInput {
  return {
    sourceIdentity,
    currentSourceIdentity: sourceIdentity,
    inventory,
    breakpoints: allBreakpoints(),
    authority: {
      source: 'structural-policy-v1',
      renderingAuthority: 'not-authorized',
      reasonCodes: ['RENDERING_AUTHORITY_NOT_GRANTED'],
    },
    ...override,
  };
}

function codes(result: ReturnType<typeof createGridEngineDraftChangeSet>) {
  return result.issues.map((entry) => entry.code);
}

describe('GridEngineDraftChangeSet', () => {
  it('emits no fictitious change for unchanged geometry', () => {
    const result = createGridEngineDraftChangeSet(input());

    expect(result.changes).toEqual([]);
    expect(result.changedRootCount).toBe(0);
    expect(result.affectedBreakpoints).toEqual([]);
    expect(result.applicability.state).toBe('no-changes');
    expect(result.applicability.applicableToDraft).toBe(false);
  });

  it('describes one MOVE with stable identity and complete metadata', () => {
    const result = createGridEngineDraftChangeSet(input({
      breakpoints: allBreakpoints({
        lg: {
          after: [
            { i: 'a', x: 2, y: 0, w: 1, h: 1 },
            { i: 'b', x: 0, y: 3, w: 1, h: 1 },
          ],
          operationHint: 'MOVE',
        },
      }),
    }));

    expect(result.changes).toEqual([expect.objectContaining({
      rootId: 'a',
      title: 'Alpha',
      breakpoint: 'lg',
      operation: 'MOVE',
      mode: 'manual',
      origin: 'editor-effective',
      baselineState: 'complete',
      explicitOverride: false,
      before: { i: 'a', x: 0, y: 0, w: 1, h: 1 },
      after: { i: 'a', x: 2, y: 0, w: 1, h: 1 },
    })]);
    expect(result.changedRootCount).toBe(1);
    expect(result.affectedBreakpoints).toEqual(['lg']);
    expect(result.applicability.state).toBe('blocked-no-authority');
  });

  it('infers RESIZE from dimensions even when a different hint is supplied', () => {
    const result = createGridEngineDraftChangeSet(input({
      breakpoints: allBreakpoints({
        xl: {
          after: [
            { i: 'a', x: 0, y: 0, w: 2, h: 2 },
            { i: 'b', x: 0, y: 3, w: 1, h: 1 },
          ],
          operationHint: 'MOVE',
        },
      }),
    }));

    expect(result.changes[0].operation).toBe('RESIZE');
  });

  it.each([
    ['REORDER', 'REORDER'],
    ['COMPACT', 'COMPACT'],
  ] as const)('preserves a determinable %s operation', (hint, expected) => {
    const result = createGridEngineDraftChangeSet(input({
      breakpoints: allBreakpoints({
        md: {
          after: [
            { i: 'a', x: 0, y: 2, w: 1, h: 1 },
            { i: 'b', x: 0, y: 0, w: 1, h: 1 },
          ],
          operationHint: hint,
        },
      }),
    }));

    expect(result.changes.map((entry) => entry.operation)).toEqual([expected, expected]);
  });

  it('reports multiple cards and breakpoints without leaking a change into XL from XS', () => {
    const result = createGridEngineDraftChangeSet(input({
      breakpoints: allBreakpoints({
        lg: {
          after: [
            { i: 'a', x: 2, y: 0, w: 1, h: 1 },
            { i: 'b', x: 1, y: 3, w: 1, h: 1 },
          ],
        },
        xs: {
          after: [
            { i: 'a', x: 1, y: 0, w: 1, h: 1 },
            { i: 'b', x: 0, y: 3, w: 1, h: 1 },
          ],
          explicitOverride: true,
        },
      }),
    }));

    expect(result.changedRootCount).toBe(2);
    expect(result.affectedBreakpoints).toEqual(['lg', 'xs']);
    expect(result.changes.filter((entry) => entry.breakpoint === 'xl')).toEqual([]);
    expect(result.changes.find((entry) => entry.breakpoint === 'xs')).toMatchObject({
      rootId: 'a',
      explicitOverride: true,
    });
  });

  it('is deterministic, preserves IDs, and does not mutate input arrays', () => {
    const before = baseLayout().map((entry) => ({ ...entry }));
    const after = [
      { i: 'b', x: 1, y: 3, w: 1, h: 1 },
      { i: 'a', x: 2, y: 0, w: 1, h: 1 },
    ];
    const original = structuredClone({ before, after });
    const candidate = input({
      breakpoints: allBreakpoints({ lg: { before, after } }),
    });

    const first = createGridEngineDraftChangeSet(candidate);
    const second = createGridEngineDraftChangeSet(candidate);
    expect(first).toEqual(second);
    expect(first.changes.map((entry) => entry.rootId)).toEqual(['a', 'b']);
    expect({ before, after }).toEqual(original);
  });

  it('blocks colliding and out-of-bounds proposed geometry', () => {
    const collision = createGridEngineDraftChangeSet(input({
      breakpoints: allBreakpoints({
        lg: { after: [{ i: 'a', x: 0, y: 0, w: 1, h: 1 }, { i: 'b', x: 0, y: 0, w: 1, h: 1 }] },
      }),
    }));
    const outOfBounds = createGridEngineDraftChangeSet(input({
      breakpoints: allBreakpoints({
        xs: { after: [{ i: 'a', x: 2, y: 0, w: 1, h: 1 }, { i: 'b', x: 0, y: 3, w: 1, h: 1 }] },
      }),
    }));

    expect(codes(collision)).toContain('COLLISION');
    expect(collision.applicability.state).toBe('blocked-invalid');
    expect(codes(outOfBounds)).toContain('OUT_OF_BOUNDS');
    expect(outOfBounds.applicability.geometricallyValid).toBe(false);
  });

  it('blocks non-finite, non-integer, non-positive, minimum, and maximum violations', () => {
    const constrainedInventory: readonly GridEngineDraftInventoryEntry[] = [
      { id: 'a', title: 'Alpha', role: 'root-widget', constraints: { minW: 1, maxH: 2 } },
      inventory[1],
      inventory[2],
    ];
    const result = createGridEngineDraftChangeSet(input({
      inventory: constrainedInventory,
      breakpoints: allBreakpoints({
        lg: {
          after: [
            { i: 'a', x: Number.NaN, y: 0.5, w: 0, h: 3 },
            { i: 'b', x: 0, y: 3, w: 1, h: 1 },
          ],
        },
      }),
    }));

    expect(codes(result)).toEqual(expect.arrayContaining([
      'INVALID_NUMBER',
      'INVALID_DIMENSION',
      'MIN_CONSTRAINT_VIOLATION',
      'MAX_CONSTRAINT_VIOLATION',
    ]));
  });

  it('detects missing, duplicate, unknown, and promoted Stack-child roots', () => {
    const result = createGridEngineDraftChangeSet(input({
      breakpoints: allBreakpoints({
        lg: {
          after: [
            { i: 'a', x: 0, y: 0, w: 1, h: 1 },
            { i: 'a', x: 1, y: 0, w: 1, h: 1 },
            { i: 'unknown', x: 2, y: 0, w: 1, h: 1 },
            { i: 'stack-child', x: 3, y: 0, w: 1, h: 1 },
          ],
        },
      }),
    }));

    expect(codes(result)).toEqual(expect.arrayContaining([
      'DUPLICATE_ROOT',
      'MISSING_ROOT',
      'UNKNOWN_ROOT',
      'STACK_CHILD_PROMOTED',
    ]));
  });

  it('keeps missing and provisional breakpoints preview-only', () => {
    const result = createGridEngineDraftChangeSet(input({
      breakpoints: allBreakpoints({
        sm: { before: null, baselineState: 'missing', origin: 'missing' },
        xs: {
          baselineState: 'provisional',
          after: [
            { i: 'a', x: 1, y: 0, w: 1, h: 1 },
            { i: 'b', x: 0, y: 3, w: 1, h: 1 },
          ],
        },
      }),
    }));

    expect(codes(result)).toEqual(expect.arrayContaining(['BREAKPOINT_MISSING', 'BASELINE_PROVISIONAL']));
    expect(result.changes.some((entry) => entry.breakpoint === 'sm')).toBe(false);
    expect(result.applicability.state).toBe('blocked-incomplete-source');
    expect(result.applicability.previewable).toBe(true);
  });

  it('never promotes a runtime Light expansion to structural geometry', () => {
    const result = createGridEngineDraftChangeSet(input({
      breakpoints: allBreakpoints({
        lg: {
          after: [{ i: 'a', x: 0, y: 0, w: 2, h: 2 }, { i: 'b', x: 0, y: 3, w: 1, h: 1 }],
          operationHint: 'RUNTIME_RESIZE',
        },
      }),
    }));

    expect(codes(result)).toContain('RUNTIME_GEOMETRY_NOT_STRUCTURAL');
    expect(result.applicability.state).toBe('blocked-invalid');
  });

  it('blocks concurrent editor changes and a changed edit session', () => {
    const result = createGridEngineDraftChangeSet(input({
      currentSourceIdentity: {
        ...sourceIdentity,
        editSessionId: 'edit-43',
        draftFingerprint: 'draft-b',
        inventoryFingerprint: 'inventory-b',
      },
      breakpoints: allBreakpoints({
        lg: { after: [{ i: 'a', x: 2, y: 0, w: 1, h: 1 }, { i: 'b', x: 0, y: 3, w: 1, h: 1 }] },
      }),
    }));

    expect(codes(result)).toEqual(expect.arrayContaining([
      'EDIT_SESSION_CHANGED',
      'INVENTORY_CHANGED',
      'DRAFT_CHANGED_CONCURRENTLY',
    ]));
    expect(result.applicability.state).toBe('blocked-conflict');
    expect(result.applicability.sourceCompatible).toBe(false);
  });

  it('blocks a stale structural generation, revision, or fingerprint', () => {
    const result = createGridEngineDraftChangeSet(input({
      currentSourceIdentity: {
        ...sourceIdentity,
        structuralGeneration: 8,
        structuralRevision: 85,
        structuralFingerprint: 'snapshot-b',
      },
      breakpoints: allBreakpoints({
        lg: { after: [{ i: 'a', x: 2, y: 0, w: 1, h: 1 }, { i: 'b', x: 0, y: 3, w: 1, h: 1 }] },
      }),
    }));

    expect(codes(result)).toContain('STRUCTURAL_SNAPSHOT_STALE');
    expect(result.applicability.state).toBe('blocked-conflict');
  });

  it('uses the existing not-authorized state and exposes no draft or HA application path', () => {
    const result = createGridEngineDraftChangeSet(input({
      authority: null,
      breakpoints: allBreakpoints({
        lg: { after: [{ i: 'a', x: 2, y: 0, w: 1, h: 1 }, { i: 'b', x: 0, y: 3, w: 1, h: 1 }] },
      }),
    }));

    expect(codes(result)).toContain('STRUCTURAL_AUTHORITY_NOT_AVAILABLE');
    expect(result.applicability).toMatchObject({
      state: 'blocked-no-authority',
      applicableToDraft: false,
      saveToHomeAssistantAvailable: false,
    });
  });

  it('keeps the calculator independent from React, HA clients, repositories, and browser storage', () => {
    const source = readFileSync(resolve(
      process.cwd(),
      'src/components/dashboard/gridEngine2/gridEngineDraftChangeSet.ts',
    ), 'utf8');

    expect(source).not.toMatch(/from ['"]react/);
    expect(source).not.toContain('home-assistant-js-websocket');
    expect(source).not.toContain('dashboardConfigurationRepository');
    expect(source).not.toContain('localStorage');
    expect(source).not.toContain('sessionStorage');
    expect(source).not.toContain('fetch(');
  });
});
