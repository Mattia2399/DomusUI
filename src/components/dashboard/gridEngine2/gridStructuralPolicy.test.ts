import { describe, expect, it } from 'vitest';
import { DASHBOARD_GRID_BREAKPOINT_ORDER } from '../../../types/widgetTypeLayout';
import { solveGridEngineRootRuntimeLayout } from './gridEngineRootRuntimeSolver';
import {
  resolveGridStructuralPolicy,
  type GridStructuralInventory,
  type ResolveGridStructuralPolicyInput,
} from './gridStructuralPolicy';
import {
  createRealisticStructuralPolicyFixture,
  REALISTIC_ACTIVE_ROOT_IDS,
  REALISTIC_EXTRA_IDS,
  STRUCTURAL_POLICY_BREAKPOINT_COLS,
} from './gridStructuralPolicy.fixtures';
import type { GridLayoutItem } from './model';

function baseline(): GridLayoutItem[] {
  return [
    { i: 'alpha', x: 0, y: 2, w: 2, h: 1 },
    { i: 'beta', x: 0, y: 5, w: 2, h: 1 },
    { i: 'gamma', x: 2, y: 4, w: 2, h: 1 },
  ];
}

function inventory(ids: readonly string[] = ['alpha', 'beta', 'gamma']): GridStructuralInventory {
  return {
    completeness: 'verified-complete',
    items: ids.map((id, order) => ({ id, state: 'active', kind: 'widget', order })),
  };
}

function input(
  overrides: Partial<ResolveGridStructuralPolicyInput> = {},
): ResolveGridStructuralPolicyInput {
  return {
    scope: { kind: 'root' },
    breakpoint: 'lg',
    cols: 4,
    declarations: [{ source: 'test-policy', mode: 'manual', provenance: 'user-explicit' }],
    layoutState: 'explicit-complete',
    baselineTrust: 'authoritative',
    baseline: baseline(),
    inventory: inventory(),
    ...overrides,
  };
}

function geometryById(items: readonly GridLayoutItem[] | null) {
  return Object.fromEntries((items ?? []).map(({ i, x, y, w, h }) => [i, { x, y, w, h }]));
}

function hasOverlap(items: readonly GridLayoutItem[]) {
  return items.some((item, index) => items.slice(0, index).some((previous) => (
    item.x < previous.x + previous.w &&
    item.x + item.w > previous.x &&
    item.y < previous.y + previous.h &&
    item.y + item.h > previous.y
  )));
}

describe('Grid Engine 2.0 structural policy', () => {
  it('1. preserves every manual coordinate, span, gap, and structural array position', () => {
    const source = baseline();
    const result = resolveGridStructuralPolicy(input({ baseline: source }));

    expect(result).toMatchObject({
      status: 'manual-projection',
      mode: 'manual',
      provenance: 'user-explicit',
      reliability: 'authoritative',
    });
    expect(result.projection).toEqual(source);
    expect(result.projection?.map((item) => item.i)).toEqual(['alpha', 'beta', 'gamma']);
    expect(result.projection?.[1]).toEqual({ i: 'beta', x: 0, y: 5, w: 2, h: 1 });
  });

  it('2. derives automatic geometry with the existing deterministic COMPACT operation', () => {
    const result = resolveGridStructuralPolicy(input({
      declarations: [{ source: 'test-policy', mode: 'automatic', provenance: 'user-explicit' }],
    }));

    expect(result.status).toBe('automatic-projection');
    expect(geometryById(result.projection)).toEqual({
      alpha: { x: 0, y: 0, w: 2, h: 1 },
      gamma: { x: 2, y: 0, w: 2, h: 1 },
      beta: { x: 0, y: 1, w: 2, h: 1 },
    });
    expect(result.baseline).toEqual(baseline());
  });

  it('3. preserves a legacy implicit configuration without inventing a mode', () => {
    const result = resolveGridStructuralPolicy(input({
      declarations: [{ source: 'legacy-document', mode: null, provenance: 'legacy-implicit' }],
      layoutState: 'legacy-unverified',
      baselineTrust: 'unverified',
    }));

    expect(result).toMatchObject({
      status: 'legacy-preserved',
      mode: null,
      provenance: 'legacy-implicit',
      reliability: 'diagnostic',
      projection: null,
    });
  });

  it('4. records user-explicit provenance independently from manual mode', () => {
    const result = resolveGridStructuralPolicy(input());
    expect(result.mode).toBe('manual');
    expect(result.provenance).toBe('user-explicit');
  });

  it('5. accepts verified generated provenance without equating it to one fixed mode', () => {
    const automatic = resolveGridStructuralPolicy(input({
      declarations: [{ source: 'verified-generator', mode: 'automatic', provenance: 'generated' }],
      layoutState: 'derived-complete',
      baselineTrust: 'verified-derived',
    }));
    const manual = resolveGridStructuralPolicy(input({
      declarations: [{ source: 'verified-generator', mode: 'manual', provenance: 'generated' }],
      layoutState: 'derived-complete',
      baselineTrust: 'verified-derived',
    }));

    expect(automatic).toMatchObject({ status: 'automatic-projection', reliability: 'verified-derived' });
    expect(manual).toMatchObject({ status: 'manual-projection', reliability: 'verified-derived' });
  });

  it('6. keeps a structural fallback diagnostic when its baseline is unverified', () => {
    const result = resolveGridStructuralPolicy(input({
      declarations: [{ source: 'snapshot-fallback', mode: 'manual', provenance: 'structural-fallback' }],
      baselineTrust: 'unverified',
    }));

    expect(result).toMatchObject({
      status: 'manual-projection',
      provenance: 'structural-fallback',
      reliability: 'diagnostic',
    });
    expect(result.issues.map((current) => current.code)).toContain('UNVERIFIED_BASELINE');
  });

  it('7. reports conflicting mode metadata without choosing a precedence', () => {
    const result = resolveGridStructuralPolicy(input({
      declarations: [
        { source: 'scope-policy', mode: 'manual', provenance: 'user-explicit' },
        { source: 'breakpoint-policy', mode: 'automatic', provenance: 'user-explicit' },
      ],
    }));

    expect(result.status).toBe('ambiguous');
    expect(result.mode).toBeNull();
    expect(result.issues.map((current) => current.code)).toContain('CONFLICTING_MODE_METADATA');
  });

  it('8. reports conflicting provenance without selecting an arbitrary source', () => {
    const result = resolveGridStructuralPolicy(input({
      declarations: [
        { source: 'scope-policy', mode: 'manual', provenance: 'user-explicit' },
        { source: 'fallback-policy', mode: 'manual', provenance: 'structural-fallback' },
      ],
    }));

    expect(result.status).toBe('ambiguous');
    expect(result.issues.map((current) => current.code)).toContain('CONFLICTING_PROVENANCE_METADATA');
  });

  it('9. leaves an explicit partial layout incomplete instead of filling it', () => {
    const result = resolveGridStructuralPolicy(input({
      layoutState: 'explicit-partial',
      baseline: baseline().slice(0, 2),
      inventory: inventory(),
    }));

    expect(result.status).toBe('incomplete');
    expect(result.projection).toBeNull();
    expect(result.inventory.activeWithoutGeometryIds).toEqual(['gamma']);
    expect(result.issues.map((current) => current.code)).toContain('EXPLICIT_LAYOUT_PARTIAL');
  });

  it('10. represents a missing breakpoint without deriving from another breakpoint', () => {
    const result = resolveGridStructuralPolicy(input({
      breakpoint: 'xs',
      cols: 2,
      layoutState: 'missing',
      baseline: [],
      inventory: inventory(['alpha']),
    }));

    expect(result.status).toBe('incomplete');
    expect(result.projection).toBeNull();
    expect(result.issues.map((current) => current.code)).toContain('BREAKPOINT_LAYOUT_MISSING');
  });

  it('11. excludes a verified absent ID only from the detached projection', () => {
    const source = [...baseline(), { i: 'retired', x: 2, y: 8, w: 2, h: 1 }];
    const result = resolveGridStructuralPolicy(input({ baseline: source }));

    expect(result.status).toBe('manual-projection');
    expect(result.baseline).toEqual(source);
    expect(result.projection?.map((item) => item.i)).toEqual(['alpha', 'beta', 'gamma']);
    expect(result.exclusions).toEqual([expect.objectContaining({ id: 'retired', reason: 'verified-absent' })]);
    expect(result.reliability).toBe('diagnostic');
  });

  it('12. refuses to exclude an uncertain extra ID from an authoritative projection', () => {
    const source = [...baseline(), { i: 'uncertain', x: 2, y: 8, w: 2, h: 1 }];
    const result = resolveGridStructuralPolicy(input({
      baseline: source,
      inventory: { ...inventory(), completeness: 'unknown' },
    }));

    expect(result.status).toBe('ambiguous');
    expect(result.projection).toBeNull();
    expect(result.inventory.uncertainIds).toEqual(['uncertain']);
    expect(result.exclusions).toEqual([]);
  });

  it('13. rejects duplicate structural IDs without silently normalizing them', () => {
    const result = resolveGridStructuralPolicy(input({
      baseline: [...baseline(), { ...baseline()[0]!, y: 9 }],
    }));

    expect(result.status).toBe('invalid');
    expect(result.inventory.duplicateLayoutIds).toEqual(['alpha']);
    expect(result.issues.map((current) => current.code)).toContain('DUPLICATE_LAYOUT_ID');
  });

  it('14. reports an active inventory ID with no geometry', () => {
    const result = resolveGridStructuralPolicy(input({
      inventory: inventory(['alpha', 'beta', 'gamma', 'delta']),
    }));

    expect(result.status).toBe('incomplete');
    expect(result.inventory.activeWithoutGeometryIds).toEqual(['delta']);
  });

  it('15. preserves removed geometry and recovers it when the same ID is reintroduced', () => {
    const fixture = createRealisticStructuralPolicyFixture();
    const removedInventory = {
      ...fixture.input.inventory,
      items: fixture.input.inventory.items.filter((item) => item.id !== 'widget-seven'),
    };
    const removed = resolveGridStructuralPolicy({ ...fixture.input, inventory: removedInventory });
    const reintroduced = resolveGridStructuralPolicy(fixture.input);

    expect(removed.projection?.some((item) => item.i === 'widget-seven')).toBe(false);
    expect(removed.baseline.find((item) => item.i === 'widget-seven')).toEqual(
      fixture.activeBaseline.find((item) => item.i === 'widget-seven'),
    );
    expect(reintroduced.projection?.find((item) => item.i === 'widget-seven')).toEqual(
      fixture.activeBaseline.find((item) => item.i === 'widget-seven'),
    );
  });

  it('16. preserves realistic manual gaps field by field while excluding 12 verified extras', () => {
    const fixture = createRealisticStructuralPolicyFixture();
    const result = resolveGridStructuralPolicy(fixture.input);

    expect(result.status).toBe('manual-projection');
    expect(result.inventory.activeIds).toEqual(REALISTIC_ACTIVE_ROOT_IDS);
    expect(result.inventory.verifiedAbsentIds).toEqual([...REALISTIC_EXTRA_IDS].sort());
    expect(result.exclusions).toHaveLength(12);
    fixture.activeBaseline.forEach((expected) => {
      expect(result.projection?.find((item) => item.i === expected.i)).toEqual(expected);
    });
  });

  it('17. compacts the realistic fixture deterministically without changing X, W, or H', () => {
    const fixture = createRealisticStructuralPolicyFixture();
    const result = resolveGridStructuralPolicy({
      ...fixture.input,
      declarations: [{ source: 'synthetic-breakpoint-policy', mode: 'automatic', provenance: 'user-explicit' }],
    });

    expect(result.status).toBe('automatic-projection');
    expect(result.projection?.find((item) => item.i === 'widget-light')).toMatchObject({ x: 0, y: 1, w: 2, h: 1 });
    expect(result.projection?.find((item) => item.i === 'widget-direct')).toMatchObject({ x: 0, y: 2, w: 2, h: 1 });
    expect(result.projection?.find((item) => item.i === 'widget-chain')).toMatchObject({ x: 0, y: 3, w: 2, h: 1 });
    expect(result.projection?.find((item) => item.i === 'widget-seven')).toMatchObject({ x: 2, y: 2, w: 2, h: 1 });
    expect(result.projection?.find((item) => item.i === 'widget-nine')).toMatchObject({ x: 6, y: 3, w: 2, h: 1 });
    expect(result.baseline).toEqual(fixture.input.baseline);
  });

  it('18. produces no overlap for valid manual and automatic projections', () => {
    const manual = resolveGridStructuralPolicy(input());
    const automatic = resolveGridStructuralPolicy(input({
      declarations: [{ source: 'test-policy', mode: 'automatic', provenance: 'user-explicit' }],
    }));

    expect(hasOverlap(manual.projection!)).toBe(false);
    expect(hasOverlap(automatic.projection!)).toBe(false);
  });

  it('19. never mutates policy, inventory, baseline, or nested geometry inputs', () => {
    const source = input();
    const before = structuredClone(source);
    resolveGridStructuralPolicy(source);
    expect(source).toEqual(before);
  });

  it('20. restores manual OFF -> ON -> OFF geometry in a separate runtime experiment', () => {
    const fixture = createRealisticStructuralPolicyFixture();
    const structural = resolveGridStructuralPolicy(fixture.input).projection!;
    const off = solveGridEngineRootRuntimeLayout({ structuralLayout: structural, cols: 8, overrides: [] });
    const on = solveGridEngineRootRuntimeLayout({
      structuralLayout: structural,
      cols: 8,
      overrides: [fixture.lightOnOverride],
    });
    const offAgain = solveGridEngineRootRuntimeLayout({ structuralLayout: structural, cols: 8, overrides: [] });

    expect(off.status).toBe('unchanged');
    expect(on.status).toBe('resolved');
    expect(geometryById(offAgain.layout)).toEqual(geometryById(off.layout));
    expect(geometryById(structural)).toEqual(geometryById(fixture.activeBaseline));
  });

  it('21. carries root scope without reading global state', () => {
    expect(resolveGridStructuralPolicy(input()).scope).toEqual({ kind: 'root' });
  });

  it('22. carries a synthetic future group scope without implementing Groups', () => {
    const result = resolveGridStructuralPolicy(input({ scope: { kind: 'group', id: 'synthetic-group-a' } }));
    expect(result.scope).toEqual({ kind: 'group', id: 'synthetic-group-a' });
    expect(result.status).toBe('manual-projection');
  });

  it('23. keeps two scopes independent even when they reuse the same item IDs', () => {
    const root = resolveGridStructuralPolicy(input());
    const group = resolveGridStructuralPolicy(input({
      scope: { kind: 'group', id: 'synthetic-group-b' },
      declarations: [{ source: 'group-policy', mode: 'automatic', provenance: 'generated' }],
      baselineTrust: 'verified-derived',
      layoutState: 'derived-complete',
    }));

    expect(root).toMatchObject({ status: 'manual-projection', scope: { kind: 'root' } });
    expect(group).toMatchObject({ status: 'automatic-projection', scope: { kind: 'group', id: 'synthetic-group-b' } });
    expect(root.projection).toEqual(baseline());
    expect(group.projection).not.toEqual(root.projection);
  });

  it.each(DASHBOARD_GRID_BREAKPOINT_ORDER)('24. binds an independent projection to breakpoint %s', (breakpoint) => {
    const cols = STRUCTURAL_POLICY_BREAKPOINT_COLS[breakpoint];
    const result = resolveGridStructuralPolicy(input({
      breakpoint,
      cols,
      baseline: [{ i: 'alpha', x: 0, y: 3, w: 1, h: 1 }],
      inventory: inventory(['alpha']),
    }));
    expect(result).toMatchObject({ breakpoint, cols, status: 'manual-projection' });
    expect(result.projection).toEqual([{ i: 'alpha', x: 0, y: 3, w: 1, h: 1 }]);
  });

  it('25. makes automatic geometry independent from equivalent input arrival order', () => {
    const source = baseline();
    const declarations = [{ source: 'test-policy', mode: 'automatic' as const, provenance: 'user-explicit' as const }];
    const first = resolveGridStructuralPolicy(input({ declarations, baseline: source }));
    const second = resolveGridStructuralPolicy(input({ declarations, baseline: [source[2]!, source[0]!, source[1]!] }));

    expect(first.projection).toEqual(second.projection);
  });

  it('26. rejects out-of-bounds active geometry instead of clamping it', () => {
    const result = resolveGridStructuralPolicy(input({
      baseline: [{ i: 'alpha', x: 3, y: 0, w: 2, h: 1 }],
      inventory: inventory(['alpha']),
    }));

    expect(result.status).toBe('invalid');
    expect(result.projection).toBeNull();
    expect(result.issues.map((current) => current.code)).toContain('LAYOUT_ITEM_OUT_OF_BOUNDS');
  });

  it('27. exposes initial collisions instead of silently normalizing them', () => {
    const result = resolveGridStructuralPolicy(input({
      baseline: [
        { i: 'alpha', x: 0, y: 0, w: 2, h: 1 },
        { i: 'beta', x: 1, y: 0, w: 2, h: 1 },
      ],
      inventory: inventory(['alpha', 'beta']),
      declarations: [{ source: 'test-policy', mode: 'automatic', provenance: 'user-explicit' }],
    }));

    expect(result.status).toBe('invalid');
    expect(result.issues.map((current) => current.code)).toContain('BASELINE_COLLISION');
  });

  it('28. returns byte-for-byte stable automatic projections for repeated calls', () => {
    const automatic = input({
      declarations: [{ source: 'test-policy', mode: 'automatic', provenance: 'user-explicit' }],
    });
    const first = resolveGridStructuralPolicy(automatic);
    const second = resolveGridStructuralPolicy(automatic);
    const third = resolveGridStructuralPolicy(automatic);
    expect(first).toEqual(second);
    expect(second).toEqual(third);
  });

  it('29. recognizes two special sections as active structural elements', () => {
    const result = resolveGridStructuralPolicy(createRealisticStructuralPolicyFixture().input);
    const special = result.inventory.classifications.filter((entry) => entry.kind === 'special-section');
    expect(special.map((entry) => entry.id)).toEqual(['special-activity', 'special-scenes']);
  });

  it('30. analyzes a reconciled baseline only as a diagnostic projection', () => {
    const fixture = createRealisticStructuralPolicyFixture();
    const result = resolveGridStructuralPolicy({
      ...fixture.input,
      baselineTrust: 'reconciled-provisional',
    });

    expect(result).toMatchObject({ status: 'manual-projection', reliability: 'diagnostic' });
    expect(result.issues.map((current) => current.code)).toContain('RECONCILED_PROVISIONAL_NOT_AUTHORITATIVE');
  });

  it('31. reports duplicate and ambiguous inventory metadata', () => {
    const duplicated = inventory().items;
    const result = resolveGridStructuralPolicy(input({
      inventory: {
        completeness: 'verified-complete',
        items: [
          ...duplicated,
          { ...duplicated[0]!, state: 'ambiguous' },
        ],
      },
    }));

    expect(result.status).toBe('ambiguous');
    expect(result.inventory.duplicateInventoryIds).toEqual(['alpha']);
    expect(result.issues.map((current) => current.code)).toContain('DUPLICATE_INVENTORY_ID');
  });

  it('32. does not infer a legacy mode from unrelated placement or Stack metadata', () => {
    const legacy = {
      ...input({
        declarations: [{ source: 'legacy-document', mode: null, provenance: 'legacy-implicit' }],
        layoutState: 'legacy-unverified',
        baselineTrust: 'unverified',
      }),
      placementPolicy: 'manual',
      stackColumnsMode: 'auto',
    };

    const result = resolveGridStructuralPolicy(legacy);
    expect(result).toMatchObject({ status: 'legacy-preserved', mode: null });
  });

  it('33. rejects a synthetic group scope without an ID', () => {
    const result = resolveGridStructuralPolicy(input({ scope: { kind: 'group', id: ' ' } }));
    expect(result.status).toBe('invalid');
    expect(result.issues.map((current) => current.code)).toContain('INVALID_GROUP_SCOPE_ID');
  });

  it('34. never accepts a previous runtime layout as the next structural baseline', () => {
    const structuralInput = input();
    const runtimeCompacted = geometryById(resolveGridStructuralPolicy(input({
      declarations: [{ source: 'test-policy', mode: 'automatic', provenance: 'generated' }],
    })).projection);
    const contaminated = { ...structuralInput, runtimeLayout: runtimeCompacted };
    const result = resolveGridStructuralPolicy(contaminated);

    expect(result.projection).toEqual(structuralInput.baseline);
    expect(result.baseline).toEqual(structuralInput.baseline);
  });

  it('35. keeps the realistic legacy comparison separate from structural policy geometry', () => {
    const fixture = createRealisticStructuralPolicyFixture();
    const result = resolveGridStructuralPolicy(fixture.input);

    expect(geometryById(result.projection)).not.toEqual(geometryById(fixture.legacyRuntimeLayout));
    expect(fixture.legacyRuntimeLayout.find((item) => item.i === 'widget-seven')?.y).toBe(3);
    expect(result.projection?.find((item) => item.i === 'widget-seven')?.y).toBe(7);
  });
});
