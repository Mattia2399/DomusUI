// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DASHBOARD_GRID_BREAKPOINT_ORDER } from '../../../types/widgetTypeLayout';
import {
  inspectGridStructuralPolicyConfiguration,
  type GridStructuralPolicyLineageEvidence,
} from './gridStructuralPolicyConfigurationInspection';
import {
  createGridStructuralPolicyInspectionFixture,
  createSyntheticCompleteLineageEvidence,
  SYNTHETIC_COMPLETE_GEOMETRY,
  SYNTHETIC_VERIFIED_INVENTORY,
  SYNTHETIC_VERIFIED_SNAPSHOT,
} from './gridStructuralPolicyConfigurationInspection.fixtures';
import {
  choiceDeclaration,
  createGridStructuralPolicyConfigurationFixture,
  createGroupPolicyConfigurationFixture,
  explicitGeometry,
  manualMobileOverride,
  SYNTHETIC_GROUP_SCOPE,
  SYNTHETIC_ROOT_SCOPE,
} from './gridStructuralPolicyConfiguration.fixtures';

function inspect(
  options: Parameters<typeof createGridStructuralPolicyInspectionFixture>[0] = {},
) {
  return inspectGridStructuralPolicyConfiguration(
    createGridStructuralPolicyInspectionFixture(options),
  );
}

function generatedInspection(
  lineageEvidence?: GridStructuralPolicyLineageEvidence,
) {
  return inspect({
    requestedBreakpoint: 'xs',
    ...(lineageEvidence ? { lineageEvidence } : null),
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

function mutablePolicy() {
  return structuredClone(
    createGridStructuralPolicyConfigurationFixture(),
  ) as Record<string, unknown>;
}

describe('Structural Policy Configuration Inspector: parsing and resolution', () => {
  it('1. preserves undefined as a legacy absence without applying defaults', () => {
    const report = inspect({ policy: undefined });
    expect(report).toMatchObject({
      parsing: { status: 'legacy-absent', policySignature: null },
      declaration: { primaryMode: null, effectiveMode: null },
      renderingAuthority: 'not-authorized',
    });
    expect(report.issueCodes).toContain('POLICY_ABSENT');
  });

  it('2. preserves null as a legacy absence without applying defaults', () => {
    const report = inspect({ policy: null });
    expect(report.parsing.status).toBe('legacy-absent');
    expect(report.declaration.effectiveMode).toBeNull();
  });

  it('3. resolves a valid manual root declaration', () => {
    const report = inspect({
      policy: createGridStructuralPolicyConfigurationFixture({
        primary: choiceDeclaration('choice.root', 'manual'),
        geometries: [explicitGeometry('xl')],
      }),
    });
    expect(report.declaration).toMatchObject({
      primaryMode: 'manual',
      effectiveMode: 'manual',
      declarationSource: 'primary',
    });
  });

  it('4. resolves a valid automatic root declaration', () => {
    expect(inspect().declaration).toMatchObject({
      primaryMode: 'automatic',
      effectiveMode: 'automatic',
    });
  });

  it('5. applies an explicit Mobile override', () => {
    const mobile = manualMobileOverride();
    const report = inspect({
      requestedBreakpoint: 'xs',
      policy: createGridStructuralPolicyConfigurationFixture({
        overrides: [mobile],
        geometries: [
          explicitGeometry('xl'),
          explicitGeometry('xs', mobile.declaration.declarationId, 'geometry.xs.explicit'),
        ],
      }),
    });
    expect(report.declaration).toMatchObject({
      effectiveMode: 'manual',
      overrideApplied: true,
      declarationSource: 'breakpoint-override',
    });
  });

  it('6. keeps the primary declaration at a breakpoint without an override', () => {
    const report = inspect({
      requestedBreakpoint: 'lg',
      policy: createGridStructuralPolicyConfigurationFixture({
        overrides: [manualMobileOverride()],
        geometries: [explicitGeometry('xl')],
      }),
    });
    expect(report.declaration).toMatchObject({
      effectiveMode: 'automatic',
      overrideApplied: false,
      declarationSource: 'primary',
    });
  });

  it.each(DASHBOARD_GRID_BREAKPOINT_ORDER)(
    '7. resolves the existing typed breakpoint %s without deriving geometry',
    (breakpoint) => {
      const report = inspect({ requestedBreakpoint: breakpoint });
      expect(report.requestedBreakpoint).toBe(breakpoint);
      expect(report.declaration.effectiveMode).toBe('automatic');
      expect(report.declaration.geometryOrigin).toBe(breakpoint === 'xl' ? 'explicit' : 'generated');
    },
  );

  it('8. supports a synthetic Group scope without implementing Groups', () => {
    const report = inspect({
      policy: createGroupPolicyConfigurationFixture(),
      requestedScope: SYNTHETIC_GROUP_SCOPE,
      requestedBreakpoint: 'xs',
    });
    expect(report.parsing.status).toBe('valid');
    expect(report.requestedScope).toMatchObject({ kind: 'group' });
    expect(report.requestedScope).not.toHaveProperty('id');
    expect(report.declaration.effectiveMode).toBe('automatic');
  });

  it('9. reports an incompatible scope without inventing a resolution', () => {
    const report = inspect({ requestedScope: SYNTHETIC_GROUP_SCOPE });
    expect(report.issueCodes).toContain('REQUEST_SCOPE_MISMATCH');
    expect(report.missingConditions).toContain('COMPATIBLE_REQUEST_SCOPE');
    expect(report.declaration.effectiveMode).toBeNull();
  });

  it('10. preserves an unknown future version as unsupported', () => {
    const report = inspect({
      policy: { ...createGridStructuralPolicyConfigurationFixture(), version: 2 },
    });
    expect(report.parsing).toMatchObject({
      status: 'unsupported-version',
      unsupportedVersion: 2,
    });
    expect(report.declaration.effectiveMode).toBeNull();
  });

  it('11. reports an incomplete policy', () => {
    const policy = mutablePolicy();
    delete policy.version;
    expect(inspect({ policy }).parsing.status).toBe('incomplete');
  });

  it('12. reports an invalid policy', () => {
    const policy = mutablePolicy();
    (policy.primary as Record<string, unknown>).mode = 'compact';
    const report = inspect({ policy });
    expect(report.parsing.status).toBe('invalid');
    expect(report.parsing.issueCodes).toContain('INVALID_MODE');
  });

  it('13. reports an ambiguous policy', () => {
    const first = manualMobileOverride();
    const report = inspect({
      policy: createGridStructuralPolicyConfigurationFixture({
        overrides: [
          first,
          { breakpoint: 'xs', declaration: choiceDeclaration('choice.root.xs.two', 'automatic') },
        ],
        geometries: [explicitGeometry('xl')],
      }),
    });
    expect(report.parsing.status).toBe('ambiguous');
    expect(report.parsing.issueCodes).toContain('DUPLICATE_OVERRIDE');
  });

  it('14. does not confirm or promote a pending draft', () => {
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

  it('15. preserves the user-explicit choice origin', () => {
    expect(inspect().declaration.choiceOrigin).toBe('user-explicit');
  });

  it('16. preserves the creation-default-confirmed choice origin', () => {
    const report = inspect({
      policy: createGridStructuralPolicyConfigurationFixture({
        primary: choiceDeclaration('choice.root', 'automatic', 'creation-default-confirmed'),
      }),
    });
    expect(report.declaration.choiceOrigin).toBe('creation-default-confirmed');
  });
});

describe('Structural Policy Configuration Inspector: geometry and lineage', () => {
  it('17. reports explicit geometry independently from the selected mode', () => {
    const report = inspect();
    expect(report.declaration.geometryOrigin).toBe('explicit');
    expect(report.geometry.completeness).toBe('explicit-complete');
  });

  it('18. reports generated geometry without treating it as generated output', () => {
    const report = generatedInspection();
    expect(report.declaration.geometryOrigin).toBe('generated');
    expect(report.lineage.status).toBe('unverifiable');
  });

  it('19. makes lineage not applicable to explicit geometry', () => {
    expect(inspect().lineage).toEqual({
      status: 'not-applicable',
      declared: false,
      independentEvidenceComplete: false,
    });
  });

  it('20. keeps formally valid generated lineage unverifiable without independent evidence', () => {
    const report = generatedInspection();
    expect(report.lineage).toMatchObject({
      status: 'unverifiable',
      declared: true,
      independentEvidenceComplete: false,
    });
    expect(report.missingConditions).toEqual(expect.arrayContaining([
      'PERSISTENT_SOURCE_GEOMETRY',
      'AUTHORITATIVE_ALGORITHM_REGISTRY',
      'INDEPENDENT_SOURCE_STRUCTURAL_FINGERPRINT',
      'INDEPENDENT_SOURCE_INVENTORY_FINGERPRINT',
      'PERSISTED_STRUCTURAL_VERSION',
    ]));
  });

  it('21. exposes an incomplete declared fingerprint as unverifiable lineage', () => {
    const policy = mutablePolicy();
    const geometries = policy.geometries as Array<Record<string, unknown>>;
    delete (geometries[5]?.lineage as Record<string, unknown>).sourceStructuralFingerprint;
    const report = inspect({ policy, requestedBreakpoint: 'xs' });
    expect(report.parsing.status).toBe('incomplete');
    expect(report.lineage.status).toBe('unverifiable');
    expect(report.issueCodes).toContain('LINEAGE_DECLARATION_INVALID');
  });

  it('22. exposes a missing declared algorithm version as unverifiable lineage', () => {
    const policy = mutablePolicy();
    const geometries = policy.geometries as Array<Record<string, unknown>>;
    delete (geometries[5]?.lineage as Record<string, unknown>).algorithmVersion;
    const report = inspect({ policy, requestedBreakpoint: 'xs' });
    expect(report.parsing.status).toBe('incomplete');
    expect(report.lineage.status).toBe('unverifiable');
  });

  it('23. reports mismatch only from independently classified evidence', () => {
    const evidence = createSyntheticCompleteLineageEvidence();
    const report = generatedInspection({
      ...evidence,
      sourceInventoryFingerprint: {
        evidenceSource: 'independent-structural-inventory',
        value: 'inventory-v1-independently-observed-mismatch',
      },
    });
    expect(report.lineage.status).toBe('mismatch');
    expect(report.issueCodes).toContain('LINEAGE_INVENTORY_FINGERPRINT_MISMATCH');
  });

  it('24. distinguishes an exact authoritative unsupported-algorithm result', () => {
    const evidence = createSyntheticCompleteLineageEvidence();
    const report = generatedInspection({
      ...evidence,
      algorithmRegistry: {
        evidenceSource: 'authoritative-algorithm-registry',
        algorithmId: 'grid-engine2-responsive',
        algorithmVersion: '1.0.0',
        support: 'unsupported',
      },
    });
    expect(report.lineage.status).toBe('unsupported-algorithm');
    expect(report.issueCodes).toContain('LINEAGE_ALGORITHM_UNSUPPORTED');
  });

  it('25. treats an absent authoritative algorithm registry as unverifiable', () => {
    const { algorithmRegistry: _registry, ...evidence } = createSyntheticCompleteLineageEvidence();
    const report = generatedInspection(evidence);
    expect(report.lineage.status).toBe('unverifiable');
    expect(report.issueCodes).toContain('LINEAGE_ALGORITHM_REGISTRY_UNAVAILABLE');
  });

  it('26. rejects an irrelevant registry entry instead of inferring support', () => {
    const evidence = createSyntheticCompleteLineageEvidence();
    const report = generatedInspection({
      ...evidence,
      algorithmRegistry: {
        evidenceSource: 'authoritative-algorithm-registry',
        algorithmId: 'another-algorithm',
        algorithmVersion: '1.0.0',
        support: 'supported',
      },
    });
    expect(report.lineage.status).toBe('unverifiable');
    expect(report.issueCodes).toContain('LINEAGE_ALGORITHM_EVIDENCE_IRRELEVANT');
  });

  it('27. never accepts the React generation as lineage evidence', () => {
    const report = generatedInspection();
    expect(report.snapshot.generation).toBe(7);
    expect(report.issueCodes).toContain('TEMPORARY_GENERATION_NOT_LINEAGE_EVIDENCE');
    expect(report.lineage.status).toBe('unverifiable');
  });

  it('28. never accepts a matching dsl-v1 diagnostic fingerprint as independent evidence', () => {
    const policy = mutablePolicy();
    const geometries = policy.geometries as Array<Record<string, unknown>>;
    (geometries[5]?.lineage as Record<string, unknown>).sourceStructuralFingerprint = 'dsl-v1-matching';
    const complete = createSyntheticCompleteLineageEvidence();
    const { sourceStructuralFingerprint: _structural, ...withoutStructural } = complete;
    const report = inspect({
      policy,
      requestedBreakpoint: 'xs',
      structuralContext: {
        ...SYNTHETIC_VERIFIED_SNAPSHOT,
        diagnosticFingerprint: 'dsl-v1-matching',
      },
      lineageEvidence: withoutStructural,
    });
    expect(report.issueCodes).toContain('DIAGNOSTIC_FINGERPRINT_NOT_LINEAGE_EVIDENCE');
    expect(report.lineage.status).toBe('unverifiable');
  });

  it('28a. rejects dsl-v1 even when a caller labels it as independent geometry evidence', () => {
    const policy = mutablePolicy();
    const geometries = policy.geometries as Array<Record<string, unknown>>;
    (geometries[5]?.lineage as Record<string, unknown>).sourceStructuralFingerprint = 'dsl-v1-matching';
    const evidence = createSyntheticCompleteLineageEvidence();
    const report = inspect({
      policy,
      requestedBreakpoint: 'xs',
      lineageEvidence: {
        ...evidence,
        sourceStructuralFingerprint: {
          evidenceSource: 'independent-source-geometry',
          value: 'dsl-v1-matching',
        },
      },
    });
    expect(report.lineage.status).toBe('unverifiable');
    expect(report.issueCodes).toContain('DIAGNOSTIC_FINGERPRINT_NOT_LINEAGE_EVIDENCE');
  });

  it('29. can verify every declared lineage field only from complete typed evidence', () => {
    const report = generatedInspection(createSyntheticCompleteLineageEvidence());
    expect(report.lineage).toEqual({
      status: 'verified',
      declared: true,
      independentEvidenceComplete: true,
    });
    expect(report.diagnosticAuthority).toBe('lineage-diagnostic');
    expect(report.renderingAuthority).toBe('not-authorized');
  });

  it('30. requires complete persistent source geometry', () => {
    const evidence = createSyntheticCompleteLineageEvidence();
    const report = generatedInspection({
      ...evidence,
      sourceGeometry: evidence.sourceGeometry && {
        ...evidence.sourceGeometry,
        completeness: 'incomplete',
      },
    });
    expect(report.lineage.status).toBe('unverifiable');
    expect(report.issueCodes).toContain('LINEAGE_SOURCE_GEOMETRY_INCOMPLETE');
  });

  it('31. detects a source geometry mismatch from persisted evidence', () => {
    const evidence = createSyntheticCompleteLineageEvidence();
    const report = generatedInspection({
      ...evidence,
      sourceGeometry: evidence.sourceGeometry && {
        ...evidence.sourceGeometry,
        declarationId: 'geometry.independent.other',
      },
    });
    expect(report.lineage.status).toBe('mismatch');
    expect(report.issueCodes).toContain('LINEAGE_SOURCE_GEOMETRY_MISMATCH');
  });

  it('32. detects an independently observed structural-version mismatch', () => {
    const evidence = createSyntheticCompleteLineageEvidence();
    const report = generatedInspection({
      ...evidence,
      sourceStructuralVersion: {
        evidenceSource: 'persisted-structural-version',
        value: 15,
      },
    });
    expect(report.lineage.status).toBe('mismatch');
    expect(report.issueCodes).toContain('LINEAGE_STRUCTURAL_VERSION_MISMATCH');
  });

  it('32a. refuses complete lineage evidence when the structural snapshot is not verified', () => {
    const report = inspect({
      requestedBreakpoint: 'xs',
      structuralContext: { ...SYNTHETIC_VERIFIED_SNAPSHOT, state: 'cache-provisional' },
      lineageEvidence: createSyntheticCompleteLineageEvidence(),
    });
    expect(report.lineage.status).toBe('unverifiable');
    expect(report.missingConditions).toContain('VERIFIED_STRUCTURAL_SNAPSHOT');
  });
});

describe('Structural Policy Configuration Inspector: structural evidence', () => {
  it('33. recognizes a complete verified Home Assistant snapshot context', () => {
    expect(inspect().snapshot).toMatchObject({
      state: 'verified-home-assistant',
      reliability: 'verified',
      coherent: true,
      applicationReceipt: 'verified-match',
    });
  });

  it('34. preserves a cache snapshot as provisional', () => {
    const report = inspect({
      structuralContext: { ...SYNTHETIC_VERIFIED_SNAPSHOT, state: 'cache-provisional' },
    });
    expect(report.snapshot.reliability).toBe('cache-provisional');
    expect(report.issueCodes).toContain('SNAPSHOT_CACHE_PROVISIONAL');
  });

  it('35. preserves a revision-pending snapshot', () => {
    const report = inspect({
      structuralContext: {
        ...SYNTHETIC_VERIFIED_SNAPSHOT,
        state: 'revision-pending',
        revision: null,
        applicationReceipt: 'missing',
      },
    });
    expect(report.snapshot.reliability).toBe('revision-pending');
    expect(report.issueCodes).toContain('SNAPSHOT_REVISION_PENDING');
  });

  it('36. preserves an incoherent snapshot without authority promotion', () => {
    const report = inspect({
      structuralContext: {
        ...SYNTHETIC_VERIFIED_SNAPSHOT,
        state: 'incoherent',
        coherent: false,
        applicationReceipt: 'mismatch',
      },
    });
    expect(report.snapshot.reliability).toBe('incoherent');
    expect(report.issueCodes).toEqual(expect.arrayContaining([
      'SNAPSHOT_INCOHERENT',
      'SNAPSHOT_RECEIPT_MISMATCH',
    ]));
  });

  it('37. accepts an explicit complete geometry classification', () => {
    expect(inspect().geometry).toMatchObject({
      completeness: 'explicit-complete',
      baselineTrust: 'authoritative',
      outOfBoundsCount: 0,
      collisionCount: 0,
    });
  });

  it.each([
    'explicit-partial',
    'explicit-partial-with-unknown-ids',
  ] as const)('38. reports the partial layout classification %s', (completeness) => {
    const report = inspect({
      geometryEvidence: { ...SYNTHETIC_COMPLETE_GEOMETRY, completeness },
    });
    expect(report.issueCodes).toContain('GEOMETRY_PARTIAL');
    expect(report.missingConditions).toContain('COMPLETE_BREAKPOINT_GEOMETRY');
  });

  it('39. reports a missing layout without generating one', () => {
    const report = inspect({
      geometryEvidence: { ...SYNTHETIC_COMPLETE_GEOMETRY, completeness: 'missing' },
    });
    expect(report.issueCodes).toContain('GEOMETRY_MISSING');
    expect(report.geometry.completeness).toBe('missing');
  });

  it('40. preserves verified extra IDs as a separate inventory count', () => {
    const report = inspect({
      inventoryEvidence: { ...SYNTHETIC_VERIFIED_INVENTORY, verifiedAbsentCount: 2 },
    });
    expect(report.inventory.verifiedAbsentCount).toBe(2);
    expect(report.issueCodes).not.toContain('INVENTORY_NOT_VERIFIED');
  });

  it('41. reports uncertain IDs without reclassifying the inventory', () => {
    const report = inspect({
      inventoryEvidence: {
        ...SYNTHETIC_VERIFIED_INVENTORY,
        completeness: 'partial',
        uncertainCount: 1,
      },
    });
    expect(report.issueCodes).toContain('INVENTORY_UNCERTAIN_IDS');
    expect(report.missingConditions).toContain('COMPLETE_STRUCTURAL_INVENTORY');
  });

  it('42. reports duplicated IDs', () => {
    const report = inspect({
      inventoryEvidence: { ...SYNTHETIC_VERIFIED_INVENTORY, duplicateIdCount: 1 },
    });
    expect(report.issueCodes).toContain('INVENTORY_DUPLICATE_IDS');
  });

  it('43. distinguishes active root elements without geometry', () => {
    const report = inspect({
      inventoryEvidence: { ...SYNTHETIC_VERIFIED_INVENTORY, activeWithoutGeometryCount: 1 },
    });
    expect(report.issueCodes).toContain('ACTIVE_ELEMENTS_WITHOUT_GEOMETRY');
  });

  it('44. keeps a resolvable root choice separate from an undeclared breakpoint geometry', () => {
    const report = inspect({
      policy: createGridStructuralPolicyConfigurationFixture({ geometries: [] }),
      requestedBreakpoint: 'md',
      geometryEvidence: { ...SYNTHETIC_COMPLETE_GEOMETRY, completeness: 'missing' },
    });
    expect(report.declaration.effectiveMode).toBe('automatic');
    expect(report.declaration.geometryOrigin).toBeNull();
    expect(report.issueCodes).toContain('GEOMETRY_NOT_DECLARED');
    expect(report.missingConditions).toContain('DECLARED_BREAKPOINT_GEOMETRY');
  });

  it('45. preserves a reconciled-provisional baseline as non-authoritative', () => {
    const report = inspect({
      geometryEvidence: {
        ...SYNTHETIC_COMPLETE_GEOMETRY,
        baselineTrust: 'reconciled-provisional',
      },
    });
    expect(report.issueCodes).toContain('GEOMETRY_RECONCILED_PROVISIONAL');
    expect(report.missingConditions).toContain('NON_PROVISIONAL_BASELINE');
    expect(report.diagnosticAuthority).toBe('declaration-diagnostic');
  });

  it('46. treats a Stack container as an already-classified atomic inventory item', () => {
    const report = inspect({
      inventoryEvidence: { ...SYNTHETIC_VERIFIED_INVENTORY, stackContainerCount: 2 },
    });
    expect(report.inventory.stackContainerCount).toBe(2);
    expect(report.inventory.activeCount).toBe(3);
  });

  it('47. reports out-of-bounds and colliding geometry independently', () => {
    const report = inspect({
      geometryEvidence: {
        ...SYNTHETIC_COMPLETE_GEOMETRY,
        outOfBoundsCount: 2,
        collisionCount: 1,
      },
    });
    expect(report.issueCodes).toEqual(expect.arrayContaining([
      'GEOMETRY_OUT_OF_BOUNDS',
      'GEOMETRY_COLLISION',
    ]));
    expect(report.missingConditions).toEqual(expect.arrayContaining([
      'GEOMETRY_WITHIN_BOUNDS',
      'COLLISION_FREE_GEOMETRY',
    ]));
  });

  it('48. sanitizes invalid evidence counts instead of coercing them', () => {
    const report = inspect({
      inventoryEvidence: { ...SYNTHETIC_VERIFIED_INVENTORY, activeCount: -1 },
      geometryEvidence: { ...SYNTHETIC_COMPLETE_GEOMETRY, collisionCount: Number.NaN },
    });
    expect(report.inventory.activeCount).toBeNull();
    expect(report.geometry.collisionCount).toBeNull();
    expect(report.issueCodes).toContain('INVALID_EVIDENCE_COUNT');
  });
});

describe('Structural Policy Configuration Inspector: purity and safety', () => {
  it('49. accepts deeply frozen synthetic inputs', () => {
    const input = deepFreeze(createGridStructuralPolicyInspectionFixture({
      requestedBreakpoint: 'xs',
      lineageEvidence: createSyntheticCompleteLineageEvidence(),
    }));
    expect(() => inspectGridStructuralPolicyConfiguration(input)).not.toThrow();
  });

  it('50. never mutates policy or evidence inputs', () => {
    const input = createGridStructuralPolicyInspectionFixture({
      requestedBreakpoint: 'xs',
      lineageEvidence: createSyntheticCompleteLineageEvidence(),
    });
    const before = structuredClone(input);
    inspectGridStructuralPolicyConfiguration(input);
    expect(input).toEqual(before);
  });

  it('51. is deterministic for equivalent detached inputs', () => {
    const input = createGridStructuralPolicyInspectionFixture({
      requestedBreakpoint: 'xs',
      lineageEvidence: createSyntheticCompleteLineageEvidence(),
    });
    const first = inspectGridStructuralPolicyConfiguration(structuredClone(input));
    const second = inspectGridStructuralPolicyConfiguration(structuredClone(input));
    expect(second).toEqual(first);
  });

  it('52. changes its sanitized signature when meaningful diagnostics change', () => {
    const automatic = inspect();
    const manual = inspect({
      policy: createGridStructuralPolicyConfigurationFixture({
        primary: choiceDeclaration('choice.root', 'manual'),
        geometries: [explicitGeometry('xl')],
      }),
    });
    const uncertain = inspect({
      inventoryEvidence: { ...SYNTHETIC_VERIFIED_INVENTORY, uncertainCount: 1 },
    });
    expect(manual.signature).not.toBe(automatic.signature);
    expect(uncertain.signature).not.toBe(automatic.signature);
  });

  it('53. emits only sanitized signatures for raw IDs and fingerprints', () => {
    const secretScope = { kind: 'group' as const, id: 'group.secret-kitchen-name' };
    const policy = createGroupPolicyConfigurationFixture();
    const raw = structuredClone(policy) as Record<string, unknown>;
    raw.scope = secretScope;
    (raw.primary as Record<string, unknown>).declarationId = 'choice.secret-device-name';
    raw.geometries = [];
    const report = inspect({
      policy: raw,
      requestedScope: secretScope,
      structuralContext: {
        ...SYNTHETIC_VERIFIED_SNAPSHOT,
        diagnosticFingerprint: 'dsl-v1-sensitive-fingerprint-payload',
      },
    });
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain(secretScope.id);
    expect(serialized).not.toContain('choice.secret-device-name');
    expect(serialized).not.toContain('dsl-v1-sensitive-fingerprint-payload');
    expect(serialized).not.toContain('kitchen');
  });

  it('54. denies rendering authority in every parse and evidence condition', () => {
    const reports = [
      inspect(),
      inspect({ policy: undefined }),
      inspect({ policy: { version: 2 } }),
      generatedInspection(createSyntheticCompleteLineageEvidence()),
      inspect({
        structuralContext: { ...SYNTHETIC_VERIFIED_SNAPSHOT, state: 'cache-provisional' },
      }),
    ];
    expect(reports.every((report) => report.renderingAuthority === 'not-authorized')).toBe(true);
  });

  it('55. has no Home Assistant, network, storage, solver, or responsive-generation calls', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'src/components/dashboard/gridEngine2/gridStructuralPolicyConfigurationInspection.ts',
      ),
      'utf8',
    );
    expect(source).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket)\s*\(/u);
    expect(source).not.toMatch(/\b(localStorage|sessionStorage|indexedDB)\b/u);
    expect(source).not.toContain("from './solveLayout'");
    expect(source).not.toContain("from './gridEngineRootRuntimeSolver'");
    expect(source).not.toContain('deriveResponsive');
    expect(source).not.toContain('hass.callWS');
    expect(source).not.toContain('hass.callService');
  });

  it('56. has no React, DOM, operational Runtime Shadow, repository, or storage dependency', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'src/components/dashboard/gridEngine2/gridStructuralPolicyConfigurationInspection.ts',
      ),
      'utf8',
    );
    expect(source).not.toMatch(/from ['"]react/u);
    expect(source).not.toMatch(/from ['"]\.\/runtimeShadow/u);
    expect(source).not.toMatch(/dashboard(ConfigurationRepository|Storage)/u);
    expect(source).not.toMatch(/\b(document|window)\b/u);
  });

  it('57. remains disconnected from GridCanvas, MainBoard, and Runtime Shadow', () => {
    const operationalSources = [
      'src/components/dashboard/GridCanvas.tsx',
      'src/components/dashboard/MainBoard.tsx',
      'src/components/dashboard/gridEngine2/runtimeShadowDiagnostics.ts',
    ].map((path) => readFileSync(resolve(process.cwd(), path), 'utf8'));
    operationalSources.forEach((source) => {
      expect(source).not.toContain('gridStructuralPolicyConfigurationInspection');
      expect(source).not.toContain('inspectGridStructuralPolicyConfiguration');
    });
  });

  it('58. uses the existing parser and resolver as the only policy interpretation boundary', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'src/components/dashboard/gridEngine2/gridStructuralPolicyConfigurationInspection.ts',
      ),
      'utf8',
    );
    expect(source).toContain('parseGridStructuralPolicyConfiguration(input.policy)');
    expect(source).toContain('resolveGridStructuralPolicyConfigurationMode(');
    expect(source).not.toContain('resolveGridStructuralPolicy({');
  });

  it('59. never leaks raw source lineage values in its report', () => {
    const evidence = createSyntheticCompleteLineageEvidence();
    const report = generatedInspection(evidence);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain(evidence.sourceGeometry?.declarationId);
    expect(serialized).not.toContain(evidence.sourceStructuralFingerprint?.value);
    expect(serialized).not.toContain(evidence.sourceInventoryFingerprint?.value);
  });

  it('60. exposes a versioned report and a deterministic diagnostic signature', () => {
    const report = inspect();
    expect(report.version).toBe(1);
    expect(report.signature).toMatch(/^policy-inspection-\d+-[0-9a-f]{8}$/u);
  });

  it('61. does not expose coordinates or generated layouts', () => {
    const report = inspect();
    const serialized = JSON.stringify(report);
    expect(report).not.toHaveProperty('layout');
    expect(report).not.toHaveProperty('coordinates');
    expect(serialized).not.toMatch(/"(x|y|w|h)":/u);
  });

  it('62. preserves root scope without inventing an identifier', () => {
    expect(inspect({ requestedScope: SYNTHETIC_ROOT_SCOPE }).requestedScope).toEqual({ kind: 'root' });
  });
});
