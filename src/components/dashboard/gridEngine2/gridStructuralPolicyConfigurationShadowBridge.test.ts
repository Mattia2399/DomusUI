// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { DASHBOARD_GRID_BREAKPOINT_ORDER } from '../../../types/widgetTypeLayout';
import {
  analyzeGridStructuralPolicyConfigurationShadowBridge,
  createGridStructuralPolicyConfigurationShadowSignature,
} from './gridStructuralPolicyConfigurationShadowBridge';
import { createGridStructuralPolicyConfigurationShadowBridgeFixture } from './gridStructuralPolicyConfigurationShadowBridge.fixtures';
import { createSyntheticCompleteLineageEvidence } from './gridStructuralPolicyConfigurationInspection.fixtures';
import {
  choiceDeclaration,
  createGridStructuralPolicyConfigurationFixture,
  explicitGeometry,
  manualMobileOverride,
} from './gridStructuralPolicyConfiguration.fixtures';
import {
  layoutsForRoots,
  SHADOW_ROOTS,
  VERIFIED_SHADOW_CONTEXT,
} from './gridStructuralPolicyShadowAdapter.fixtures';

function inspect(
  options: Parameters<typeof createGridStructuralPolicyConfigurationShadowBridgeFixture>[0] = {},
) {
  return analyzeGridStructuralPolicyConfigurationShadowBridge(
    createGridStructuralPolicyConfigurationShadowBridgeFixture(options),
  );
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

describe('Structural Policy Configuration Shadow bridge: declarations', () => {
  it('1. keeps the real current schema explicitly legacy-absent', () => {
    const report = inspect();
    expect(report).toMatchObject({
      parsing: { status: 'legacy-absent' },
      declaration: { primaryMode: null, effectiveMode: null },
      lineage: { status: 'not-applicable' },
      renderingAuthority: 'not-authorized',
    });
  });

  it('2. resolves a synthetic manual declaration without changing geometry', () => {
    const policy = createGridStructuralPolicyConfigurationFixture({
      primary: choiceDeclaration('choice.root', 'manual'),
      geometries: [explicitGeometry('xl')],
    });
    const report = inspect({ policy });
    expect(report.declaration).toMatchObject({
      primaryMode: 'manual',
      effectiveMode: 'manual',
      geometryOrigin: 'explicit',
    });
  });

  it('3. resolves a synthetic automatic declaration', () => {
    expect(inspect({ policy: createGridStructuralPolicyConfigurationFixture() }).declaration)
      .toMatchObject({ primaryMode: 'automatic', effectiveMode: 'automatic' });
  });

  it('4. applies a synthetic XS override only at XS', () => {
    const override = manualMobileOverride();
    const policy = createGridStructuralPolicyConfigurationFixture({
      overrides: [override],
      geometries: [
        explicitGeometry('xl'),
        explicitGeometry('xs', override.declaration.declarationId, 'geometry.xs.explicit'),
      ],
    });
    expect(inspect({ policy, requestedBreakpoint: 'xs' }).declaration).toMatchObject({
      effectiveMode: 'manual',
      overrideApplied: true,
    });
    expect(inspect({ policy, requestedBreakpoint: 'sm' }).declaration).toMatchObject({
      effectiveMode: 'automatic',
      overrideApplied: false,
    });
  });

  it('5. preserves an unsupported future version', () => {
    const report = inspect({
      policy: { ...createGridStructuralPolicyConfigurationFixture(), version: 2 },
    });
    expect(report.parsing).toMatchObject({ status: 'unsupported-version', unsupportedVersion: 2 });
  });

  it('6. preserves a malformed declaration as invalid', () => {
    const policy = structuredClone(createGridStructuralPolicyConfigurationFixture()) as Record<string, unknown>;
    (policy.primary as Record<string, unknown>).mode = 'compact';
    expect(inspect({ policy }).parsing).toMatchObject({
      status: 'invalid',
      issueCodes: expect.arrayContaining(['INVALID_MODE']),
    });
  });

  it('7. never promotes a pending draft', () => {
    const base = createGridStructuralPolicyConfigurationFixture();
    const draft = {
      version: 1,
      state: 'draft',
      transition: 'automatic-to-manual',
      base,
      candidate: {
        scope: base.scope,
        referenceBreakpoint: base.referenceBreakpoint,
        primary: { ...base.primary, mode: 'manual', confirmation: 'pending' },
        overrides: [],
        geometries: base.geometries,
      },
      confirmation: 'pending',
    };
    expect(inspect({ policy: draft })).toMatchObject({
      parsing: { status: 'invalid' },
      declaration: { effectiveMode: null },
    });
  });
});

describe('Structural Policy Configuration Shadow bridge: classified evidence', () => {
  it('8. leaves generated lineage unverifiable when Runtime Shadow has no independent evidence', () => {
    const report = inspect({
      policy: createGridStructuralPolicyConfigurationFixture(),
      requestedBreakpoint: 'xs',
    });
    expect(report.lineage.status).toBe('unverifiable');
    expect(report.missingConditions).toContain('AUTHORITATIVE_ALGORITHM_REGISTRY');
  });

  it('9. preserves a demonstrable mismatch supplied by independent synthetic evidence', () => {
    const evidence = createSyntheticCompleteLineageEvidence();
    const report = inspect({
      policy: createGridStructuralPolicyConfigurationFixture(),
      requestedBreakpoint: 'xs',
      lineageEvidence: {
        ...evidence,
        sourceInventoryFingerprint: {
          evidenceSource: 'independent-structural-inventory',
          value: 'inventory-v1-independent-mismatch',
        },
      },
    });
    expect(report.lineage.status).toBe('mismatch');
    expect(report.issueCodes).toContain('LINEAGE_INVENTORY_FINGERPRINT_MISMATCH');
  });

  it('10. maps a verified HA snapshot and receipt without exposing its raw fingerprint', () => {
    const report = inspect();
    expect(report.snapshot).toMatchObject({
      state: 'verified-home-assistant',
      reliability: 'verified',
      generation: 84,
      revision: 84,
      applicationReceipt: 'verified-match',
    });
    expect(JSON.stringify(report)).not.toContain(VERIFIED_SHADOW_CONTEXT.fingerprint);
  });

  it('11. keeps a cache snapshot provisional', () => {
    const report = inspect({
      shadow: {
        snapshotState: 'cache-provisional',
        configurationCompleteness: 'hydration-uncertain',
      },
      snapshotCoherent: true,
    });
    expect(report.snapshot.reliability).toBe('cache-provisional');
    expect(report.inventory.completeness).toBe('partial');
  });

  it('12. refuses authority when the application receipt is absent', () => {
    const report = inspect({ applicationReceipt: 'missing' });
    expect(report.snapshot.reliability).toBe('unverified');
    expect(report.issueCodes).toContain('SNAPSHOT_RECEIPT_MISSING');
  });

  it('13. preserves a pending revision', () => {
    const report = inspect({
      shadow: {
        context: { generation: 85, revision: null, fingerprint: 'dsl-v1-pending' },
        snapshotState: 'revision-pending',
        configurationCompleteness: 'hydration-uncertain',
      },
      snapshotCoherent: false,
    });
    expect(report.snapshot.reliability).toBe('revision-pending');
    expect(report.issueCodes).toContain('SNAPSHOT_REVISION_PENDING');
  });

  it('14. invalidates diagnostics when generation A becomes B', () => {
    const first = inspect();
    const second = inspect({
      shadow: { context: { generation: 85, revision: 85, fingerprint: 'dsl-v1-next' } },
    });
    expect(second.snapshot.generation).toBe(85);
    expect(second.signature).not.toBe(first.signature);
  });

  it.each(DASHBOARD_GRID_BREAKPOINT_ORDER)(
    '15. maps already-classified evidence for breakpoint %s',
    (requestedBreakpoint) => {
      const report = inspect({ requestedBreakpoint });
      expect(report.requestedBreakpoint).toBe(requestedBreakpoint);
      expect(report.geometry.completeness).toBe('explicit-complete');
    },
  );

  it('16. keeps a missing 2XL layout missing', () => {
    const layouts = layoutsForRoots();
    delete layouts['2xl'];
    const report = inspect({
      requestedBreakpoint: '2xl',
      shadow: { structuralLayouts: layouts },
    });
    expect(report.geometry.completeness).toBe('missing');
    expect(report.issueCodes).toContain('GEOMETRY_MISSING');
  });

  it('17. reuses the verified-extra count from reconciliation', () => {
    const layouts = layoutsForRoots();
    layouts.xl = [...layouts.xl!, { i: 'obsolete.synthetic', x: 4, y: 8, w: 2, h: 1 }];
    const report = inspect({ shadow: { structuralLayouts: layouts } });
    expect(report.inventory.verifiedAbsentCount).toBe(1);
  });

  it('18. reuses uncertain-ID classification during hydration', () => {
    const layouts = layoutsForRoots();
    layouts.xl = [...layouts.xl!, { i: 'uncertain.synthetic', x: 4, y: 8, w: 2, h: 1 }];
    const report = inspect({
      shadow: {
        structuralLayouts: layouts,
        snapshotState: 'cache-provisional',
        configurationCompleteness: 'hydration-uncertain',
      },
    });
    expect(report.inventory.uncertainCount).toBe(1);
    expect(report.issueCodes).toContain('INVENTORY_UNCERTAIN_IDS');
  });

  it('19. never promotes a reconciled-provisional baseline', () => {
    const layouts = layoutsForRoots();
    layouts.xl = [...layouts.xl!, { i: 'obsolete.synthetic', x: 4, y: 8, w: 2, h: 1 }];
    const report = inspect({ shadow: { structuralLayouts: layouts } });
    expect(report.geometry.baselineTrust).toBe('reconciled-provisional');
    expect(report.issueCodes).toContain('GEOMETRY_RECONCILED_PROVISIONAL');
  });

  it('20. keeps a root Stack atomic', () => {
    const report = inspect();
    expect(report.inventory.stackContainerCount).toBe(1);
    expect(report.inventory.activeCount).toBe(SHADOW_ROOTS.length);
  });

  it('21. maps structural out-of-bounds and collision findings without invoking a solver', () => {
    const outOfBoundsLayouts = layoutsForRoots();
    outOfBoundsLayouts.xl = [
      { ...outOfBoundsLayouts.xl![0], x: 11, w: 2 },
      ...outOfBoundsLayouts.xl!.slice(1),
    ];
    const collisionLayouts = layoutsForRoots();
    collisionLayouts.xl = [
      collisionLayouts.xl![0],
      { ...collisionLayouts.xl![1], y: 0 },
      ...collisionLayouts.xl!.slice(2),
    ];
    expect(inspect({ shadow: { structuralLayouts: outOfBoundsLayouts } }).geometry.outOfBoundsCount).toBe(1);
    expect(inspect({ shadow: { structuralLayouts: collisionLayouts } }).geometry.collisionCount).toBe(1);
  });
});

describe('Structural Policy Configuration Shadow bridge: lifecycle and safety', () => {
  it('22. creates deterministic fragments for equivalent valid declarations', () => {
    const policy = createGridStructuralPolicyConfigurationFixture();
    expect(createGridStructuralPolicyConfigurationShadowSignature(structuredClone(policy)))
      .toBe(createGridStructuralPolicyConfigurationShadowSignature(policy));
  });

  it('23. distinguishes meaningful V1 choices with identical coordinates', () => {
    const automatic = createGridStructuralPolicyConfigurationFixture();
    const manual = createGridStructuralPolicyConfigurationFixture({
      primary: choiceDeclaration('choice.root', 'manual'),
    });
    expect(createGridStructuralPolicyConfigurationShadowSignature(manual))
      .not.toBe(createGridStructuralPolicyConfigurationShadowSignature(automatic));
  });

  it('24. documents conservative deduplication for malformed payloads', () => {
    const first = { version: 1, primary: { mode: 'bad-a' } };
    const second = { version: 1, primary: { mode: 'bad-b' } };
    expect(createGridStructuralPolicyConfigurationShadowSignature(first))
      .toBe(createGridStructuralPolicyConfigurationShadowSignature(second));
  });

  it('25. is deterministic and never mutates input evidence', () => {
    const input = createGridStructuralPolicyConfigurationShadowBridgeFixture({
      policy: createGridStructuralPolicyConfigurationFixture(),
      requestedBreakpoint: 'xs',
    });
    const before = structuredClone(input);
    const first = analyzeGridStructuralPolicyConfigurationShadowBridge(input);
    const second = analyzeGridStructuralPolicyConfigurationShadowBridge(structuredClone(input));
    expect(second).toEqual(first);
    expect(input).toEqual(before);
  });

  it('26. accepts deeply frozen evidence', () => {
    const input = deepFreeze(createGridStructuralPolicyConfigurationShadowBridgeFixture());
    expect(() => analyzeGridStructuralPolicyConfigurationShadowBridge(input)).not.toThrow();
  });

  it('27. sanitizes raw IDs, diagnostic fingerprints, and policy declaration IDs', () => {
    const policy = createGridStructuralPolicyConfigurationFixture({
      primary: choiceDeclaration('choice.private-kitchen-name'),
      geometries: [explicitGeometry('xl', 'choice.private-kitchen-name', 'geometry.private-kitchen-name')],
    });
    const report = inspect({ policy });
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('private-kitchen-name');
    expect(serialized).not.toContain(VERIFIED_SHADOW_CONTEXT.fingerprint);
    SHADOW_ROOTS.forEach((root) => expect(serialized).not.toContain(root.id));
  });

  it('28. denies rendering authority in legacy, valid, invalid, and verified-lineage branches', () => {
    const reports = [
      inspect(),
      inspect({ policy: createGridStructuralPolicyConfigurationFixture() }),
      inspect({ policy: { version: 1 } }),
      inspect({
        policy: createGridStructuralPolicyConfigurationFixture(),
        requestedBreakpoint: 'xs',
        lineageEvidence: createSyntheticCompleteLineageEvidence(),
      }),
    ];
    expect(reports.every((report) => report.renderingAuthority === 'not-authorized')).toBe(true);
  });

  it('29. performs no HA, network, storage, or persistence operation', () => {
    const fetch = vi.fn();
    const setItem = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('localStorage', { setItem });
    try {
      inspect();
      expect(fetch).not.toHaveBeenCalled();
      expect(setItem).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('30. has no solver, renderer, React, DOM, HA, or storage import', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'src/components/dashboard/gridEngine2/gridStructuralPolicyConfigurationShadowBridge.ts',
      ),
      'utf8',
    );
    expect(source).not.toMatch(/from ['"]react/u);
    expect(source).not.toMatch(/solveLayout|gridEngineRootRuntimeSolver|GridCanvas|MainBoard/u);
    expect(source).not.toMatch(/dashboardConfigurationRepository|dashboardStorage/u);
    expect(source).not.toMatch(/\b(document|window|fetch|localStorage|sessionStorage)\b/u);
  });
});
