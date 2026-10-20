import { describe, expect, it } from 'vitest';
import { DASHBOARD_GRID_BREAKPOINT_ORDER } from '../../../types/widgetTypeLayout';
import {
  GRID_STRUCTURAL_POLICY_CONFIGURATION_VERSION,
  GRID_STRUCTURAL_POLICY_CREATION_CANDIDATE,
  parseGridStructuralPolicyConfiguration,
  resolveGridStructuralPolicyConfigurationMode,
  type GridStructuralPolicyConfigurationDraftV1,
  type GridStructuralPolicyConfigurationV1,
} from './gridStructuralPolicyConfiguration';
import {
  choiceDeclaration,
  createGridStructuralPolicyConfigurationFixture,
  createGroupPolicyConfigurationFixture,
  explicitGeometry,
  generatedGeometry,
  manualMobileOverride,
  SYNTHETIC_GROUP_SCOPE,
  SYNTHETIC_ROOT_SCOPE,
} from './gridStructuralPolicyConfiguration.fixtures';

function parseValid(input: unknown) {
  const result = parseGridStructuralPolicyConfiguration(input);
  expect(result.status).toBe('valid');
  if (result.status !== 'valid') throw new Error(`Expected a valid policy, received ${result.status}`);
  return result;
}

function issueCodes(input: unknown) {
  return parseGridStructuralPolicyConfiguration(input).issues.map((current) => current.code);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

describe('Grid Structural Policy configuration: versioning and legacy boundary', () => {
  it('1. treats an absent policy as a valid legacy absence without inventing a mode', () => {
    expect(parseGridStructuralPolicyConfiguration(undefined)).toEqual({
      status: 'legacy-absent',
      policy: null,
      issues: [],
      renderingAuthority: 'not-authorized',
    });
    expect(parseGridStructuralPolicyConfiguration(null).status).toBe('legacy-absent');
  });

  it('2. keeps an existing dashboard without a policy on the legacy path', () => {
    const legacyDashboard: Record<string, unknown> = {
      widgets: [],
      responsiveLayouts: { root: { xl: [] } },
    };
    expect(parseGridStructuralPolicyConfiguration(legacyDashboard.gridStructuralPolicy)).toMatchObject({
      status: 'legacy-absent',
      policy: null,
    });
  });

  it('3. accepts version 1 exactly', () => {
    expect(parseValid(createGridStructuralPolicyConfigurationFixture()).policy.version)
      .toBe(GRID_STRUCTURAL_POLICY_CONFIGURATION_VERSION);
  });

  it('4. rejects a future version without interpreting it as version 1', () => {
    expect(parseGridStructuralPolicyConfiguration({
      ...createGridStructuralPolicyConfigurationFixture(),
      version: 2,
    })).toMatchObject({
      status: 'unsupported-version',
      policy: null,
      unsupportedVersion: 2,
    });
  });

  it('5. reports a present policy without a version as incomplete', () => {
    const { version: _version, ...withoutVersion } = createGridStructuralPolicyConfigurationFixture();
    expect(parseGridStructuralPolicyConfiguration(withoutVersion).status).toBe('incomplete');
  });

  it('6. does not apply creation candidates to an absent legacy policy', () => {
    expect(GRID_STRUCTURAL_POLICY_CREATION_CANDIDATE).toEqual({
      mode: 'automatic',
      referenceBreakpoint: 'xl',
    });
    expect(parseGridStructuralPolicyConfiguration(undefined).policy).toBeNull();
  });
});

describe('Grid Structural Policy configuration: choices and breakpoints', () => {
  it('7. parses a manual root policy', () => {
    const policy = createGridStructuralPolicyConfigurationFixture({
      primary: choiceDeclaration('choice.root', 'manual'),
      geometries: [explicitGeometry('xl')],
    });
    expect(parseValid(policy).policy.primary).toMatchObject({ mode: 'manual', origin: 'user-explicit' });
  });

  it('8. parses an automatic root policy', () => {
    expect(parseValid(createGridStructuralPolicyConfigurationFixture()).policy.primary.mode).toBe('automatic');
  });

  it('9. preserves xl as an explicit reference breakpoint', () => {
    expect(parseValid(createGridStructuralPolicyConfigurationFixture()).policy.referenceBreakpoint).toBe('xl');
  });

  it.each(DASHBOARD_GRID_BREAKPOINT_ORDER)('10. resolves policy independently for breakpoint %s', (breakpoint) => {
    const policy = parseValid(createGridStructuralPolicyConfigurationFixture()).policy;
    const resolution = resolveGridStructuralPolicyConfigurationMode(policy, SYNTHETIC_ROOT_SCOPE, breakpoint);
    expect(resolution).toMatchObject({ status: 'resolved', breakpoint, effectiveMode: 'automatic' });
  });

  it('11. applies an explicit manual Mobile override', () => {
    const mobile = manualMobileOverride();
    const policy = createGridStructuralPolicyConfigurationFixture({
      overrides: [mobile],
      geometries: [
        explicitGeometry('xl'),
        explicitGeometry('xs', mobile.declaration.declarationId, 'geometry.xs.explicit'),
      ],
    });
    const parsed = parseValid(policy).policy;
    expect(resolveGridStructuralPolicyConfigurationMode(parsed, SYNTHETIC_ROOT_SCOPE, 'xs')).toMatchObject({
      effectiveMode: 'manual',
      declarationSource: 'breakpoint-override',
      choiceOrigin: 'user-explicit',
    });
  });

  it('12. represents a synthetic automatic breakpoint override', () => {
    const automaticOverride = {
      breakpoint: 'sm' as const,
      declaration: choiceDeclaration('choice.root.sm', 'automatic'),
    };
    const policy = createGridStructuralPolicyConfigurationFixture({
      primary: choiceDeclaration('choice.root', 'manual'),
      overrides: [automaticOverride],
      geometries: [explicitGeometry('xl')],
    });
    const resolution = resolveGridStructuralPolicyConfigurationMode(parseValid(policy).policy, SYNTHETIC_ROOT_SCOPE, 'sm');
    expect(resolution).toMatchObject({ effectiveMode: 'automatic', declarationSource: 'breakpoint-override' });
  });

  it('13. uses the primary declaration when a breakpoint has no override', () => {
    const policy = parseValid(createGridStructuralPolicyConfigurationFixture({
      overrides: [manualMobileOverride()],
      geometries: [explicitGeometry('xl')],
    })).policy;
    expect(resolveGridStructuralPolicyConfigurationMode(policy, SYNTHETIC_ROOT_SCOPE, 'lg')).toMatchObject({
      appliedOverride: null,
      effectiveMode: 'automatic',
      declarationSource: 'primary',
    });
  });

  it('14. reports a repeated override as ambiguous', () => {
    const first = manualMobileOverride();
    const duplicate = {
      breakpoint: 'xs' as const,
      declaration: choiceDeclaration('choice.root.xs.duplicate', 'manual'),
    };
    const result = parseGridStructuralPolicyConfiguration(createGridStructuralPolicyConfigurationFixture({
      overrides: [first, duplicate],
      geometries: [explicitGeometry('xl')],
    }));
    expect(result.status).toBe('ambiguous');
    expect(result.issues.map((current) => current.code)).toContain('DUPLICATE_OVERRIDE');
  });

  it('15. reports contradictory override modes', () => {
    const result = parseGridStructuralPolicyConfiguration(createGridStructuralPolicyConfigurationFixture({
      overrides: [
        manualMobileOverride(),
        { breakpoint: 'xs', declaration: choiceDeclaration('choice.root.xs.auto', 'automatic') },
      ],
      geometries: [explicitGeometry('xl')],
    }));
    expect(result.status).toBe('ambiguous');
    expect(result.issues.map((current) => current.code)).toContain('CONFLICTING_OVERRIDE_MODE');
  });

  it('16. reports an override without a breakpoint as incomplete', () => {
    const policy = createGridStructuralPolicyConfigurationFixture() as unknown as Record<string, unknown>;
    const raw = structuredClone(policy) as Record<string, unknown>;
    raw.overrides = [{ declaration: choiceDeclaration('choice.missing-breakpoint', 'manual') }];
    expect(parseGridStructuralPolicyConfiguration(raw).status).toBe('incomplete');
    expect(issueCodes(raw)).toContain('MISSING_OVERRIDE_BREAKPOINT');
  });

  it('17. refuses an override on the reference breakpoint', () => {
    const result = parseGridStructuralPolicyConfiguration(createGridStructuralPolicyConfigurationFixture({
      overrides: [{ breakpoint: 'xl', declaration: choiceDeclaration('choice.root.xl', 'manual') }],
      geometries: [],
    }));
    expect(result.status).toBe('ambiguous');
    expect(result.issues.map((current) => current.code)).toContain('REFERENCE_BREAKPOINT_OVERRIDE_CONFLICT');
  });
});

describe('Grid Structural Policy configuration: choice, geometry and authority', () => {
  it('18. distinguishes an explicit user choice from a creation default', () => {
    const explicit = parseValid(createGridStructuralPolicyConfigurationFixture()).policy.primary;
    const created = parseValid(createGridStructuralPolicyConfigurationFixture({
      primary: choiceDeclaration('choice.root', 'automatic', 'creation-default-confirmed'),
    })).policy.primary;
    expect(explicit.origin).toBe('user-explicit');
    expect(created.origin).toBe('creation-default-confirmed');
  });

  it('19. accepts a confirmed creation default without calling it user-explicit', () => {
    const policy = createGridStructuralPolicyConfigurationFixture({
      primary: choiceDeclaration('choice.root', 'automatic', 'creation-default-confirmed'),
    });
    expect(parseValid(policy).policy.primary).toMatchObject({
      mode: 'automatic',
      origin: 'creation-default-confirmed',
      confirmation: 'confirmed',
    });
  });

  it('20. rejects a missing choice origin', () => {
    const raw = structuredClone(createGridStructuralPolicyConfigurationFixture()) as Record<string, unknown>;
    delete (raw.primary as Record<string, unknown>).origin;
    expect(parseGridStructuralPolicyConfiguration(raw).status).toBe('incomplete');
    expect(issueCodes(raw)).toContain('MISSING_CHOICE_ORIGIN');
  });

  it('21. detects conflicting choice origins on duplicate declarations', () => {
    const result = parseGridStructuralPolicyConfiguration(createGridStructuralPolicyConfigurationFixture({
      overrides: [
        manualMobileOverride(),
        {
          breakpoint: 'xs',
          declaration: choiceDeclaration('choice.root.xs.created', 'manual', 'creation-default-confirmed'),
        },
      ],
      geometries: [explicitGeometry('xl')],
    }));
    expect(result.status).toBe('ambiguous');
    expect(result.issues.map((current) => current.code)).toContain('CONFLICTING_CHOICE_ORIGIN');
  });

  it('22. keeps geometry origin separate from placement mode', () => {
    const policy = parseValid(createGridStructuralPolicyConfigurationFixture({
      primary: choiceDeclaration('choice.root', 'automatic'),
      geometries: [explicitGeometry('xl')],
    })).policy;
    expect(policy.primary.mode).toBe('automatic');
    expect(policy.geometries[0]?.origin).toBe('explicit');
  });

  it('23. represents generated geometry with separate lineage', () => {
    const policy = parseValid(createGridStructuralPolicyConfigurationFixture()).policy;
    expect(policy.geometries.find((entry) => entry.breakpoint === 'xs')).toMatchObject({
      origin: 'generated',
      lineage: { algorithmId: 'grid-engine2-responsive', sourceBreakpoint: 'xl' },
    });
  });

  it('24. never turns a contract-valid policy into rendering authority', () => {
    const parsed = parseValid(createGridStructuralPolicyConfigurationFixture());
    const resolved = resolveGridStructuralPolicyConfigurationMode(parsed.policy, SYNTHETIC_ROOT_SCOPE, 'xl');
    expect(parsed.renderingAuthority).toBe('not-authorized');
    expect(resolved.renderingAuthority).toBe('not-authorized');
    expect(resolved.limitations).toContain('STRUCTURAL_CONTEXT_NOT_VALIDATED');
    expect(resolved.limitations).toContain('GEOMETRY_COMPLETENESS_NOT_VALIDATED');
  });

  it('25. resolves policy without claiming that an undeclared geometry is complete', () => {
    const policy = parseValid(createGridStructuralPolicyConfigurationFixture({ geometries: [] })).policy;
    expect(resolveGridStructuralPolicyConfigurationMode(policy, SYNTHETIC_ROOT_SCOPE, 'md')).toMatchObject({
      status: 'resolved',
      effectiveMode: 'automatic',
      geometry: null,
      reliability: 'limited',
      renderingAuthority: 'not-authorized',
    });
  });
});

describe('Grid Structural Policy configuration: persistent generated lineage', () => {
  it('26. accepts complete persistent lineage', () => {
    const lineage = parseValid(createGridStructuralPolicyConfigurationFixture()).policy.geometries
      .find((entry) => entry.breakpoint === 'lg')?.lineage;
    expect(lineage).toMatchObject({
      version: 1,
      algorithmVersion: '1.0.0',
      sourceStructuralFingerprint: 'structure-v1-a1b2c3',
      sourceInventoryFingerprint: 'inventory-v1-d4e5f6',
      sourceStructuralVersion: 14,
    });
  });

  it('27. reports incomplete lineage', () => {
    const raw = structuredClone(createGridStructuralPolicyConfigurationFixture()) as Record<string, unknown>;
    const geometries = raw.geometries as Array<Record<string, unknown>>;
    delete (geometries[1]?.lineage as Record<string, unknown>).sourceInventoryFingerprint;
    expect(parseGridStructuralPolicyConfiguration(raw).status).toBe('incomplete');
    expect(issueCodes(raw)).toContain('MISSING_LINEAGE_FIELD');
  });

  it('28. requires the source structural fingerprint', () => {
    const raw = structuredClone(createGridStructuralPolicyConfigurationFixture()) as Record<string, unknown>;
    const geometries = raw.geometries as Array<Record<string, unknown>>;
    delete (geometries[1]?.lineage as Record<string, unknown>).sourceStructuralFingerprint;
    expect(parseGridStructuralPolicyConfiguration(raw).status).toBe('incomplete');
  });

  it('29. requires an algorithm version', () => {
    const raw = structuredClone(createGridStructuralPolicyConfigurationFixture()) as Record<string, unknown>;
    const geometries = raw.geometries as Array<Record<string, unknown>>;
    delete (geometries[1]?.lineage as Record<string, unknown>).algorithmVersion;
    expect(parseGridStructuralPolicyConfiguration(raw).status).toBe('incomplete');
  });

  it('30. does not accept a temporary runtime generation as lineage identity', () => {
    const raw = structuredClone(createGridStructuralPolicyConfigurationFixture()) as Record<string, unknown>;
    const geometries = raw.geometries as Array<Record<string, unknown>>;
    const lineage = geometries[1]?.lineage as Record<string, unknown>;
    delete lineage.sourceStructuralFingerprint;
    delete lineage.sourceInventoryFingerprint;
    delete lineage.sourceGeometryDeclarationId;
    lineage.generation = 84;
    const result = parseGridStructuralPolicyConfiguration(raw);
    expect(result.status).not.toBe('valid');
    expect(result.issues.map((current) => current.code)).toContain('UNKNOWN_FIELD');
  });

  it('31. refuses lineage on explicit geometry', () => {
    const source = explicitGeometry('xl') as Record<string, unknown>;
    source.lineage = generatedGeometry('xs').lineage;
    const result = parseGridStructuralPolicyConfiguration(createGridStructuralPolicyConfigurationFixture({
      geometries: [source as unknown as ReturnType<typeof explicitGeometry>],
    }));
    expect(result.status).toBe('ambiguous');
    expect(result.issues.map((current) => current.code)).toContain('LINEAGE_WITH_NON_GENERATED_GEOMETRY');
  });

  it('32. rejects cross-scope lineage rather than introducing inheritance', () => {
    const generated = generatedGeometry('xs', { scope: SYNTHETIC_GROUP_SCOPE });
    const result = parseGridStructuralPolicyConfiguration(createGridStructuralPolicyConfigurationFixture({
      geometries: [explicitGeometry('xl'), generated],
    }));
    expect(result.status).toBe('ambiguous');
    expect(result.issues.map((current) => current.code)).toContain('LINEAGE_SCOPE_MISMATCH');
  });

  it('33. rejects a generated lineage sourced from the wrong breakpoint', () => {
    const result = parseGridStructuralPolicyConfiguration(createGridStructuralPolicyConfigurationFixture({
      geometries: [explicitGeometry('xl'), generatedGeometry('xs', { sourceBreakpoint: 'lg' })],
    }));
    expect(result.status).toBe('ambiguous');
    expect(result.issues.map((current) => current.code)).toContain('LINEAGE_SOURCE_BREAKPOINT_MISMATCH');
  });
});

describe('Grid Structural Policy configuration: scopes and deterministic resolution', () => {
  it('34. supports root scope', () => {
    expect(parseValid(createGridStructuralPolicyConfigurationFixture()).policy.scope).toEqual({ kind: 'root' });
  });

  it('35. represents a synthetic future Group scope without implementing Groups', () => {
    const policy = parseValid(createGroupPolicyConfigurationFixture()).policy;
    expect(policy.scope).toEqual(SYNTHETIC_GROUP_SCOPE);
    expect(resolveGridStructuralPolicyConfigurationMode(policy, SYNTHETIC_GROUP_SCOPE, 'xs').status).toBe('resolved');
  });

  it('36. rejects invalid Group scope identifiers', () => {
    const policy = createGroupPolicyConfigurationFixture() as unknown as Record<string, unknown>;
    const raw = structuredClone(policy) as Record<string, unknown>;
    raw.scope = { kind: 'group', id: ' ' };
    expect(parseGridStructuralPolicyConfiguration(raw).status).toBe('invalid');
    expect(issueCodes(raw)).toContain('INVALID_SCOPE_ID');
  });

  it('37. keeps root and Group policies independent', () => {
    const root = parseValid(createGridStructuralPolicyConfigurationFixture()).policy;
    const group = parseValid(createGroupPolicyConfigurationFixture()).policy;
    expect(resolveGridStructuralPolicyConfigurationMode(root, SYNTHETIC_GROUP_SCOPE, 'xl').status)
      .toBe('scope-mismatch');
    expect(resolveGridStructuralPolicyConfigurationMode(group, SYNTHETIC_ROOT_SCOPE, 'xl').status)
      .toBe('scope-mismatch');
  });

  it('38. parses deterministically', () => {
    const input = createGridStructuralPolicyConfigurationFixture();
    expect(parseGridStructuralPolicyConfiguration(structuredClone(input)))
      .toEqual(parseGridStructuralPolicyConfiguration(structuredClone(input)));
  });

  it('39. resolves deterministically', () => {
    const policy = parseValid(createGridStructuralPolicyConfigurationFixture()).policy;
    const first = resolveGridStructuralPolicyConfigurationMode(policy, SYNTHETIC_ROOT_SCOPE, 'sm');
    const second = resolveGridStructuralPolicyConfigurationMode(policy, SYNTHETIC_ROOT_SCOPE, 'sm');
    expect(second).toEqual(first);
  });
});

describe('Grid Structural Policy configuration: immutability and unsafe inference barriers', () => {
  it('40. accepts deeply frozen inputs', () => {
    const input = deepFreeze(createGridStructuralPolicyConfigurationFixture());
    expect(() => parseGridStructuralPolicyConfiguration(input)).not.toThrow();
    expect(parseGridStructuralPolicyConfiguration(input).status).toBe('valid');
  });

  it('41. never mutates its input', () => {
    const input = createGridStructuralPolicyConfigurationFixture();
    const before = structuredClone(input);
    parseGridStructuralPolicyConfiguration(input);
    expect(input).toEqual(before);
  });

  it('42. does not infer policy from coordinates', () => {
    const coordinateOnly = { x: 0, y: 0, w: 2, h: 1 };
    expect(parseGridStructuralPolicyConfiguration(coordinateOnly).status).toBe('incomplete');
  });

  it('43. does not infer mode from placementPolicy', () => {
    expect(parseGridStructuralPolicyConfiguration({ placementPolicy: 'manual' }).status).toBe('incomplete');
  });

  it('44. does not infer mode from stackColumnsMode', () => {
    expect(parseGridStructuralPolicyConfiguration({ stackColumnsMode: 'auto' }).status).toBe('incomplete');
  });

  it('45. rejects an unknown mode', () => {
    const raw = structuredClone(createGridStructuralPolicyConfigurationFixture()) as Record<string, unknown>;
    (raw.primary as Record<string, unknown>).mode = 'compact';
    expect(parseGridStructuralPolicyConfiguration(raw).status).toBe('invalid');
    expect(issueCodes(raw)).toContain('INVALID_MODE');
  });

  it('46. does not promote an unconfirmed declaration', () => {
    const raw = structuredClone(createGridStructuralPolicyConfigurationFixture()) as Record<string, unknown>;
    (raw.primary as Record<string, unknown>).confirmation = 'pending';
    expect(parseGridStructuralPolicyConfiguration(raw)).toMatchObject({
      status: 'invalid',
      policy: null,
      renderingAuthority: 'not-authorized',
    });
  });

  it('47. represents an unconfirmed transition outside the persisted configuration type', () => {
    const base = createGridStructuralPolicyConfigurationFixture();
    const draft: GridStructuralPolicyConfigurationDraftV1 = {
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
    expect(draft.confirmation).toBe('pending');
    expect(parseGridStructuralPolicyConfiguration(draft).status).toBe('invalid');
  });

  it('48. never accepts runtime geometry as a structural baseline', () => {
    const raw = {
      ...createGridStructuralPolicyConfigurationFixture(),
      runtimeLayout: [{ i: 'light.expanded', x: 0, y: 0, w: 4, h: 4 }],
    };
    const result = parseGridStructuralPolicyConfiguration(raw);
    expect(result.status).toBe('invalid');
    expect(result.issues.map((current) => current.code)).toContain('UNKNOWN_FIELD');
  });

  it('49. rejects unknown and malformed policy data without coercion', () => {
    const malformed = {
      version: 1,
      scope: 'root',
      referenceBreakpoint: 12,
      primary: [],
      overrides: {},
      geometries: 'generated',
    };
    expect(parseGridStructuralPolicyConfiguration(malformed)).toMatchObject({
      status: 'invalid',
      policy: null,
    });
  });

  it('50. rejects geometry linked to the wrong policy declaration', () => {
    const result = parseGridStructuralPolicyConfiguration(createGridStructuralPolicyConfigurationFixture({
      geometries: [explicitGeometry('xl', 'choice.somewhere-else')],
    }));
    expect(result.status).toBe('ambiguous');
    expect(result.issues.map((current) => current.code)).toContain('GEOMETRY_POLICY_DECLARATION_MISMATCH');
  });

  it('51. rejects non-JSON policy data without invoking accessors or dropping hidden values', () => {
    const circular = createGridStructuralPolicyConfigurationFixture() as Record<string, unknown>;
    circular.circular = circular;

    const symbolProperty = createGridStructuralPolicyConfigurationFixture() as Record<PropertyKey, unknown>;
    symbolProperty[Symbol('hidden')] = true;

    const hiddenProperty = createGridStructuralPolicyConfigurationFixture() as Record<string, unknown>;
    Object.defineProperty(hiddenProperty, 'hidden', { value: true, enumerable: false });

    const accessor = createGridStructuralPolicyConfigurationFixture() as Record<string, unknown>;
    Object.defineProperty(accessor, 'unsafe', {
      enumerable: true,
      get: () => {
        throw new Error('accessor must not run');
      },
    });

    const nonFinite = createGridStructuralPolicyConfigurationFixture() as Record<string, unknown>;
    nonFinite.extra = Number.POSITIVE_INFINITY;

    [circular, symbolProperty, hiddenProperty, accessor, nonFinite].forEach((input) => {
      expect(() => parseGridStructuralPolicyConfiguration(input)).not.toThrow();
      expect(parseGridStructuralPolicyConfiguration(input)).toMatchObject({
        status: 'invalid',
        policy: null,
        issues: [{ code: 'NON_JSON_INPUT' }],
        renderingAuthority: 'not-authorized',
      });
    });
  });
});
