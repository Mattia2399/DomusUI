import {
  DASHBOARD_GRID_BREAKPOINT_ORDER,
  type DashboardGridBreakpoint,
} from '../../../types/widgetTypeLayout';
import type { GridScope } from './gridStructuralPolicy';
import type { GridLayoutMode } from './model';

export const GRID_STRUCTURAL_POLICY_CONFIGURATION_VERSION = 1 as const;
export const GRID_GENERATED_GEOMETRY_LINEAGE_VERSION = 1 as const;

/** Candidate values for a future, explicitly confirmed creation flow only. */
export const GRID_STRUCTURAL_POLICY_CREATION_CANDIDATE = Object.freeze({
  mode: 'automatic' as const,
  referenceBreakpoint: 'xl' as const,
});

export type GridPolicyChoiceOrigin =
  | 'user-explicit'
  | 'creation-default-confirmed';

export type GridPolicyGeometryOrigin =
  | 'explicit'
  | 'generated'
  | 'legacy'
  | 'diagnostic-fallback';

export type GridPolicyChoiceDeclarationV1 = Readonly<{
  declarationId: string;
  mode: GridLayoutMode;
  origin: GridPolicyChoiceOrigin;
  confirmation: 'confirmed';
}>;

export type GridPolicyDraftChoiceDeclarationV1 = Readonly<{
  declarationId: string;
  mode: GridLayoutMode;
  origin: GridPolicyChoiceOrigin;
  confirmation: 'confirmed' | 'pending';
}>;

export type GridGeneratedGeometryLineageV1 = Readonly<{
  version: typeof GRID_GENERATED_GEOMETRY_LINEAGE_VERSION;
  algorithmId: string;
  algorithmVersion: string;
  sourceBreakpoint: DashboardGridBreakpoint;
  sourceScope: GridScope;
  sourceGeometryDeclarationId: string;
  sourceStructuralFingerprint: string;
  sourceInventoryFingerprint: string;
  sourceStructuralVersion: number;
}>;

export type GridPolicyGeometryDeclarationV1 = Readonly<{
  declarationId: string;
  policyDeclarationId: string;
  breakpoint: DashboardGridBreakpoint;
  origin: GridPolicyGeometryOrigin;
  lineage?: GridGeneratedGeometryLineageV1;
}>;

export type GridPolicyBreakpointOverrideV1 = Readonly<{
  breakpoint: DashboardGridBreakpoint;
  declaration: GridPolicyChoiceDeclarationV1;
}>;

export type GridPolicyDraftBreakpointOverrideV1 = Readonly<{
  breakpoint: DashboardGridBreakpoint;
  declaration: GridPolicyDraftChoiceDeclarationV1;
}>;

export type GridStructuralPolicyConfigurationV1 = Readonly<{
  version: typeof GRID_STRUCTURAL_POLICY_CONFIGURATION_VERSION;
  scope: GridScope;
  referenceBreakpoint: DashboardGridBreakpoint;
  primary: GridPolicyChoiceDeclarationV1;
  overrides: readonly GridPolicyBreakpointOverrideV1[];
  /** Geometry declarations are metadata only; this contract carries no coordinates. */
  geometries: readonly GridPolicyGeometryDeclarationV1[];
}>;

export type GridStructuralPolicyConfigurationCandidateV1 = Readonly<{
  scope: GridScope;
  referenceBreakpoint: DashboardGridBreakpoint;
  primary: GridPolicyDraftChoiceDeclarationV1;
  overrides: readonly GridPolicyDraftBreakpointOverrideV1[];
  geometries: readonly GridPolicyGeometryDeclarationV1[];
}>;

export type GridStructuralPolicyTransitionKind =
  | 'manual-to-automatic'
  | 'automatic-to-manual'
  | 'create-breakpoint-override'
  | 'remove-breakpoint-override'
  | 'change-reference-breakpoint';

/** A draft can describe a proposed policy without making it persistable or authoritative. */
export type GridStructuralPolicyConfigurationDraftV1 = Readonly<{
  version: typeof GRID_STRUCTURAL_POLICY_CONFIGURATION_VERSION;
  state: 'draft';
  transition: GridStructuralPolicyTransitionKind;
  base: GridStructuralPolicyConfigurationV1 | null;
  candidate: GridStructuralPolicyConfigurationCandidateV1;
  confirmation: 'pending';
}>;

export type GridStructuralPolicyConfigurationIssueCode =
  | 'INPUT_NOT_OBJECT'
  | 'NON_JSON_INPUT'
  | 'UNKNOWN_FIELD'
  | 'MISSING_VERSION'
  | 'INVALID_VERSION'
  | 'UNSUPPORTED_VERSION'
  | 'MISSING_SCOPE'
  | 'INVALID_SCOPE'
  | 'INVALID_SCOPE_ID'
  | 'MISSING_REFERENCE_BREAKPOINT'
  | 'INVALID_BREAKPOINT'
  | 'MISSING_PRIMARY_DECLARATION'
  | 'INVALID_DECLARATION'
  | 'INVALID_DECLARATION_ID'
  | 'DUPLICATE_DECLARATION_ID'
  | 'MISSING_MODE'
  | 'INVALID_MODE'
  | 'MISSING_CHOICE_ORIGIN'
  | 'INVALID_CHOICE_ORIGIN'
  | 'MISSING_CONFIRMATION'
  | 'UNCONFIRMED_DECLARATION'
  | 'MISSING_OVERRIDES'
  | 'INVALID_OVERRIDES'
  | 'MISSING_OVERRIDE_BREAKPOINT'
  | 'DUPLICATE_OVERRIDE'
  | 'CONFLICTING_OVERRIDE_MODE'
  | 'CONFLICTING_CHOICE_ORIGIN'
  | 'REFERENCE_BREAKPOINT_OVERRIDE_CONFLICT'
  | 'MISSING_GEOMETRIES'
  | 'INVALID_GEOMETRIES'
  | 'MISSING_GEOMETRY_ORIGIN'
  | 'INVALID_GEOMETRY_ORIGIN'
  | 'DUPLICATE_GEOMETRY_DECLARATION'
  | 'CONFLICTING_GEOMETRY_ORIGIN'
  | 'GEOMETRY_POLICY_DECLARATION_MISMATCH'
  | 'GENERATED_LINEAGE_REQUIRED'
  | 'LINEAGE_WITH_NON_GENERATED_GEOMETRY'
  | 'INVALID_LINEAGE'
  | 'MISSING_LINEAGE_FIELD'
  | 'UNSUPPORTED_LINEAGE_VERSION'
  | 'LINEAGE_SCOPE_MISMATCH'
  | 'LINEAGE_SOURCE_BREAKPOINT_MISMATCH'
  | 'LINEAGE_SOURCE_GEOMETRY_NOT_DECLARED'
  | 'LINEAGE_SOURCE_GEOMETRY_NOT_EXPLICIT';

export type GridStructuralPolicyConfigurationIssue = Readonly<{
  code: GridStructuralPolicyConfigurationIssueCode;
  classification: 'missing' | 'invalid' | 'ambiguous' | 'unsupported';
  path: string;
  message: string;
}>;

type FailedParseStatus =
  | 'unsupported-version'
  | 'incomplete'
  | 'invalid'
  | 'ambiguous';

export type GridStructuralPolicyConfigurationParseResult =
  | Readonly<{
      status: 'legacy-absent';
      policy: null;
      issues: readonly [];
      renderingAuthority: 'not-authorized';
    }>
  | Readonly<{
      status: 'valid';
      policy: GridStructuralPolicyConfigurationV1;
      issues: readonly [];
      declarationAuthority: 'contract-valid';
      renderingAuthority: 'not-authorized';
    }>
  | Readonly<{
      status: FailedParseStatus;
      policy: null;
      issues: readonly GridStructuralPolicyConfigurationIssue[];
      unsupportedVersion?: number;
      renderingAuthority: 'not-authorized';
    }>;

export type GridStructuralPolicyResolutionLimitation =
  | 'STRUCTURAL_CONTEXT_NOT_VALIDATED'
  | 'GEOMETRY_COMPLETENESS_NOT_VALIDATED'
  | 'GEOMETRY_NOT_DECLARED'
  | 'NON_AUTHORITATIVE_GEOMETRY_ORIGIN'
  | 'GENERATED_LINEAGE_SOURCE_NOT_VERIFIED';

export type GridStructuralPolicyModeResolution = Readonly<{
  status: 'resolved' | 'scope-mismatch' | 'invalid-request';
  requestedScope: GridScope;
  breakpoint: DashboardGridBreakpoint;
  primaryMode: GridLayoutMode | null;
  appliedOverride: GridPolicyBreakpointOverrideV1 | null;
  effectiveMode: GridLayoutMode | null;
  declarationSource: 'primary' | 'breakpoint-override' | null;
  declarationId: string | null;
  choiceOrigin: GridPolicyChoiceOrigin | null;
  geometry: GridPolicyGeometryDeclarationV1 | null;
  reliability: 'declaration-valid' | 'limited' | 'unavailable';
  declarationAuthority: 'contract-valid' | 'unavailable';
  renderingAuthority: 'not-authorized';
  limitations: readonly GridStructuralPolicyResolutionLimitation[];
  issues: readonly GridStructuralPolicyConfigurationIssue[];
}>;

type MutableIssue = GridStructuralPolicyConfigurationIssue;

const BREAKPOINT_INDEX = new Map(
  DASHBOARD_GRID_BREAKPOINT_ORDER.map((breakpoint, index) => [breakpoint, index]),
);
const CHOICE_ORIGINS = new Set<GridPolicyChoiceOrigin>([
  'user-explicit',
  'creation-default-confirmed',
]);
const GEOMETRY_ORIGINS = new Set<GridPolicyGeometryOrigin>([
  'explicit',
  'generated',
  'legacy',
  'diagnostic-fallback',
]);
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

type NonJsonInput = Readonly<{
  path: string;
  message: string;
}>;

function findNonJsonInput(
  value: unknown,
  path: string,
  activeObjects = new Set<object>(),
  depth = 0,
): NonJsonInput | null {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? null : { path, message: 'Non-finite numbers are not stable JSON values.' };
  }
  if (typeof value !== 'object') {
    return { path, message: `Values of type ${typeof value} are not JSON data.` };
  }
  if (depth > 64) {
    return { path, message: 'The policy exceeds the supported JSON nesting depth.' };
  }

  try {
    if (activeObjects.has(value)) {
      return { path, message: 'Circular references are not valid JSON data.' };
    }
    const isArrayValue = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (!isArrayValue && prototype !== Object.prototype && prototype !== null) {
      return { path, message: 'Policy objects must contain plain JSON data.' };
    }

    activeObjects.add(value);
    const keys = Reflect.ownKeys(value);
    let arrayIndexCount = 0;
    for (const key of keys) {
      if (typeof key === 'symbol') {
        activeObjects.delete(value);
        return { path, message: 'Symbol-keyed properties are not representable in JSON.' };
      }
      if (isArrayValue && key === 'length') continue;
      if (isArrayValue) {
        const index = Number(key);
        if (!Number.isSafeInteger(index) || index < 0 || String(index) !== key || index >= value.length) {
          activeObjects.delete(value);
          return { path: `${path}.${key}`, message: 'Arrays may not contain named properties.' };
        }
        arrayIndexCount += 1;
      }

      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !('value' in descriptor)) {
        activeObjects.delete(value);
        return { path: `${path}.${key}`, message: 'Policy properties must be enumerable JSON data values.' };
      }
      const nested = findNonJsonInput(descriptor.value, `${path}.${key}`, activeObjects, depth + 1);
      if (nested) {
        activeObjects.delete(value);
        return nested;
      }
    }
    if (isArrayValue && arrayIndexCount !== value.length) {
      activeObjects.delete(value);
      return { path, message: 'Sparse arrays are not accepted as policy JSON data.' };
    }
    activeObjects.delete(value);
    return null;
  } catch {
    activeObjects.delete(value);
    return { path, message: 'The policy could not be inspected as inert JSON data.' };
  }
}

function issue(
  code: GridStructuralPolicyConfigurationIssueCode,
  classification: GridStructuralPolicyConfigurationIssue['classification'],
  path: string,
  message: string,
): MutableIssue {
  return { code, classification, path, message };
}

function unknownFields(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  issues: MutableIssue[],
) {
  const allowedSet = new Set(allowed);
  Object.keys(value).forEach((key) => {
    if (!allowedSet.has(key)) {
      issues.push(issue('UNKNOWN_FIELD', 'invalid', `${path}.${key}`, 'Unknown fields are not accepted silently.'));
    }
  });
}

function isPersistentIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.trim() === value && IDENTIFIER_PATTERN.test(value);
}

function isBreakpoint(value: unknown): value is DashboardGridBreakpoint {
  return typeof value === 'string' && BREAKPOINT_INDEX.has(value as DashboardGridBreakpoint);
}

function parseBreakpoint(
  value: unknown,
  path: string,
  missingCode: 'MISSING_REFERENCE_BREAKPOINT' | 'MISSING_OVERRIDE_BREAKPOINT' | 'MISSING_LINEAGE_FIELD',
  issues: MutableIssue[],
): DashboardGridBreakpoint | null {
  if (value === undefined) {
    issues.push(issue(missingCode, 'missing', path, 'A breakpoint must be declared explicitly.'));
    return null;
  }
  if (!isBreakpoint(value)) {
    issues.push(issue('INVALID_BREAKPOINT', 'invalid', path, 'The breakpoint is not one of the six supported values.'));
    return null;
  }
  return value;
}

function parseIdentifier(
  value: unknown,
  path: string,
  missingCode: 'MISSING_LINEAGE_FIELD' | 'INVALID_DECLARATION_ID',
  issues: MutableIssue[],
): string | null {
  if (value === undefined) {
    issues.push(issue(missingCode, 'missing', path, 'A stable persistent identifier is required.'));
    return null;
  }
  if (!isPersistentIdentifier(value)) {
    issues.push(issue('INVALID_DECLARATION_ID', 'invalid', path, 'The identifier must be stable, trimmed, and non-empty.'));
    return null;
  }
  return value;
}

function parseScope(value: unknown, path: string, issues: MutableIssue[]): GridScope | null {
  if (value === undefined) {
    issues.push(issue('MISSING_SCOPE', 'missing', path, 'A scope must be declared explicitly.'));
    return null;
  }
  if (!isRecord(value)) {
    issues.push(issue('INVALID_SCOPE', 'invalid', path, 'The scope must be an object.'));
    return null;
  }
  const kind = value.kind;
  if (kind === 'root') {
    unknownFields(value, ['kind'], path, issues);
    return { kind: 'root' };
  }
  if (kind === 'group') {
    unknownFields(value, ['kind', 'id'], path, issues);
    if (!isPersistentIdentifier(value.id)) {
      issues.push(issue('INVALID_SCOPE_ID', value.id === undefined ? 'missing' : 'invalid', `${path}.id`, 'A Group scope needs a stable ID.'));
      return null;
    }
    return { kind: 'group', id: value.id };
  }
  issues.push(issue('INVALID_SCOPE', kind === undefined ? 'missing' : 'invalid', `${path}.kind`, 'Scope kind must be root or group.'));
  return null;
}

function parseChoiceDeclaration(
  value: unknown,
  path: string,
  missingCode: 'MISSING_PRIMARY_DECLARATION' | 'INVALID_DECLARATION',
  issues: MutableIssue[],
): GridPolicyChoiceDeclarationV1 | null {
  if (value === undefined) {
    issues.push(issue(missingCode, 'missing', path, 'A confirmed choice declaration is required.'));
    return null;
  }
  if (!isRecord(value)) {
    issues.push(issue('INVALID_DECLARATION', 'invalid', path, 'A choice declaration must be an object.'));
    return null;
  }
  unknownFields(value, ['declarationId', 'mode', 'origin', 'confirmation'], path, issues);
  const declarationId = parseIdentifier(value.declarationId, `${path}.declarationId`, 'INVALID_DECLARATION_ID', issues);

  let mode: GridLayoutMode | null = null;
  if (value.mode === undefined) {
    issues.push(issue('MISSING_MODE', 'missing', `${path}.mode`, 'The placement mode must be declared explicitly.'));
  } else if (value.mode === 'manual' || value.mode === 'automatic') {
    mode = value.mode;
  } else {
    issues.push(issue('INVALID_MODE', 'invalid', `${path}.mode`, 'Mode must be manual or automatic.'));
  }

  let origin: GridPolicyChoiceOrigin | null = null;
  if (value.origin === undefined) {
    issues.push(issue('MISSING_CHOICE_ORIGIN', 'missing', `${path}.origin`, 'The origin of the choice is required.'));
  } else if (typeof value.origin === 'string' && CHOICE_ORIGINS.has(value.origin as GridPolicyChoiceOrigin)) {
    origin = value.origin as GridPolicyChoiceOrigin;
  } else {
    issues.push(issue('INVALID_CHOICE_ORIGIN', 'invalid', `${path}.origin`, 'The choice origin is not supported.'));
  }

  if (value.confirmation === undefined) {
    issues.push(issue('MISSING_CONFIRMATION', 'missing', `${path}.confirmation`, 'Persistable declarations must be confirmed.'));
  } else if (value.confirmation !== 'confirmed') {
    issues.push(issue('UNCONFIRMED_DECLARATION', 'invalid', `${path}.confirmation`, 'An unconfirmed declaration belongs in a draft, not a persisted policy.'));
  }

  if (!declarationId || !mode || !origin || value.confirmation !== 'confirmed') return null;
  return { declarationId, mode, origin, confirmation: 'confirmed' };
}

function parseLineage(
  value: unknown,
  path: string,
  issues: MutableIssue[],
): GridGeneratedGeometryLineageV1 | null {
  if (!isRecord(value)) {
    issues.push(issue('INVALID_LINEAGE', 'invalid', path, 'Generated geometry lineage must be an object.'));
    return null;
  }
  unknownFields(value, [
    'version',
    'algorithmId',
    'algorithmVersion',
    'sourceBreakpoint',
    'sourceScope',
    'sourceGeometryDeclarationId',
    'sourceStructuralFingerprint',
    'sourceInventoryFingerprint',
    'sourceStructuralVersion',
  ], path, issues);

  if (value.version === undefined) {
    issues.push(issue('MISSING_LINEAGE_FIELD', 'missing', `${path}.version`, 'Lineage version is required.'));
  } else if (value.version !== GRID_GENERATED_GEOMETRY_LINEAGE_VERSION) {
    issues.push(issue('UNSUPPORTED_LINEAGE_VERSION', 'unsupported', `${path}.version`, 'The lineage version is not supported.'));
  }
  const algorithmId = parseIdentifier(value.algorithmId, `${path}.algorithmId`, 'MISSING_LINEAGE_FIELD', issues);
  const algorithmVersion = parseIdentifier(value.algorithmVersion, `${path}.algorithmVersion`, 'MISSING_LINEAGE_FIELD', issues);
  const sourceBreakpoint = parseBreakpoint(value.sourceBreakpoint, `${path}.sourceBreakpoint`, 'MISSING_LINEAGE_FIELD', issues);
  const sourceScope = parseScope(value.sourceScope, `${path}.sourceScope`, issues);
  const sourceGeometryDeclarationId = parseIdentifier(
    value.sourceGeometryDeclarationId,
    `${path}.sourceGeometryDeclarationId`,
    'MISSING_LINEAGE_FIELD',
    issues,
  );
  const sourceStructuralFingerprint = parseIdentifier(
    value.sourceStructuralFingerprint,
    `${path}.sourceStructuralFingerprint`,
    'MISSING_LINEAGE_FIELD',
    issues,
  );
  const sourceInventoryFingerprint = parseIdentifier(
    value.sourceInventoryFingerprint,
    `${path}.sourceInventoryFingerprint`,
    'MISSING_LINEAGE_FIELD',
    issues,
  );
  let sourceStructuralVersion: number | null = null;
  if (value.sourceStructuralVersion === undefined) {
    issues.push(issue('MISSING_LINEAGE_FIELD', 'missing', `${path}.sourceStructuralVersion`, 'The persisted structural version is required.'));
  } else if (!Number.isSafeInteger(value.sourceStructuralVersion) || Number(value.sourceStructuralVersion) < 1) {
    issues.push(issue('INVALID_LINEAGE', 'invalid', `${path}.sourceStructuralVersion`, 'The structural version must be a positive integer.'));
  } else {
    sourceStructuralVersion = Number(value.sourceStructuralVersion);
  }

  if (
    value.version !== GRID_GENERATED_GEOMETRY_LINEAGE_VERSION ||
    !algorithmId ||
    !algorithmVersion ||
    !sourceBreakpoint ||
    !sourceScope ||
    !sourceGeometryDeclarationId ||
    !sourceStructuralFingerprint ||
    !sourceInventoryFingerprint ||
    sourceStructuralVersion === null
  ) return null;

  return {
    version: GRID_GENERATED_GEOMETRY_LINEAGE_VERSION,
    algorithmId,
    algorithmVersion,
    sourceBreakpoint,
    sourceScope,
    sourceGeometryDeclarationId,
    sourceStructuralFingerprint,
    sourceInventoryFingerprint,
    sourceStructuralVersion,
  };
}

function parseOverrides(value: unknown, issues: MutableIssue[]): GridPolicyBreakpointOverrideV1[] {
  if (value === undefined) {
    issues.push(issue('MISSING_OVERRIDES', 'missing', 'policy.overrides', 'Overrides must be declared explicitly, even when empty.'));
    return [];
  }
  if (!Array.isArray(value)) {
    issues.push(issue('INVALID_OVERRIDES', 'invalid', 'policy.overrides', 'Overrides must be an array.'));
    return [];
  }
  return value.flatMap((entry, index) => {
    const path = `policy.overrides[${index}]`;
    if (!isRecord(entry)) {
      issues.push(issue('INVALID_OVERRIDES', 'invalid', path, 'Each override must be an object.'));
      return [];
    }
    unknownFields(entry, ['breakpoint', 'declaration'], path, issues);
    const breakpoint = parseBreakpoint(entry.breakpoint, `${path}.breakpoint`, 'MISSING_OVERRIDE_BREAKPOINT', issues);
    const declaration = parseChoiceDeclaration(entry.declaration, `${path}.declaration`, 'INVALID_DECLARATION', issues);
    return breakpoint && declaration ? [{ breakpoint, declaration }] : [];
  });
}

function parseGeometries(value: unknown, issues: MutableIssue[]): GridPolicyGeometryDeclarationV1[] {
  if (value === undefined) {
    issues.push(issue('MISSING_GEOMETRIES', 'missing', 'policy.geometries', 'Geometry declarations must be explicit, even when empty.'));
    return [];
  }
  if (!Array.isArray(value)) {
    issues.push(issue('INVALID_GEOMETRIES', 'invalid', 'policy.geometries', 'Geometry declarations must be an array.'));
    return [];
  }
  return value.flatMap((entry, index) => {
    const path = `policy.geometries[${index}]`;
    if (!isRecord(entry)) {
      issues.push(issue('INVALID_GEOMETRIES', 'invalid', path, 'Each geometry declaration must be an object.'));
      return [];
    }
    unknownFields(entry, ['declarationId', 'policyDeclarationId', 'breakpoint', 'origin', 'lineage'], path, issues);
    const declarationId = parseIdentifier(entry.declarationId, `${path}.declarationId`, 'INVALID_DECLARATION_ID', issues);
    const policyDeclarationId = parseIdentifier(
      entry.policyDeclarationId,
      `${path}.policyDeclarationId`,
      'INVALID_DECLARATION_ID',
      issues,
    );
    const breakpoint = parseBreakpoint(entry.breakpoint, `${path}.breakpoint`, 'MISSING_OVERRIDE_BREAKPOINT', issues);

    let origin: GridPolicyGeometryOrigin | null = null;
    if (entry.origin === undefined) {
      issues.push(issue('MISSING_GEOMETRY_ORIGIN', 'missing', `${path}.origin`, 'Geometry origin is required.'));
    } else if (typeof entry.origin === 'string' && GEOMETRY_ORIGINS.has(entry.origin as GridPolicyGeometryOrigin)) {
      origin = entry.origin as GridPolicyGeometryOrigin;
    } else {
      issues.push(issue('INVALID_GEOMETRY_ORIGIN', 'invalid', `${path}.origin`, 'Geometry origin is not supported.'));
    }

    let lineage: GridGeneratedGeometryLineageV1 | undefined;
    if (origin === 'generated') {
      if (entry.lineage === undefined) {
        issues.push(issue('GENERATED_LINEAGE_REQUIRED', 'missing', `${path}.lineage`, 'Generated geometry requires persistent lineage.'));
      } else {
        lineage = parseLineage(entry.lineage, `${path}.lineage`, issues) ?? undefined;
      }
    } else if (origin && entry.lineage !== undefined) {
      issues.push(issue(
        'LINEAGE_WITH_NON_GENERATED_GEOMETRY',
        'ambiguous',
        `${path}.lineage`,
        'Only generated geometry may declare generator lineage.',
      ));
    }

    if (!declarationId || !policyDeclarationId || !breakpoint || !origin) return [];
    if (origin === 'generated' && !lineage) return [];
    return [{
      declarationId,
      policyDeclarationId,
      breakpoint,
      origin,
      ...(lineage ? { lineage } : null),
    }];
  });
}

function scopeKey(scope: GridScope) {
  return scope.kind === 'root' ? 'root' : `group:${scope.id}`;
}

function sameScope(first: GridScope, second: GridScope) {
  return scopeKey(first) === scopeKey(second);
}

function validateSemantics(
  scope: GridScope,
  referenceBreakpoint: DashboardGridBreakpoint,
  primary: GridPolicyChoiceDeclarationV1,
  overrides: readonly GridPolicyBreakpointOverrideV1[],
  geometries: readonly GridPolicyGeometryDeclarationV1[],
  issues: MutableIssue[],
) {
  const overrideByBreakpoint = new Map<DashboardGridBreakpoint, GridPolicyBreakpointOverrideV1>();
  const declarationIds = new Map<string, string>();
  declarationIds.set(primary.declarationId, 'policy.primary');

  overrides.forEach((override, index) => {
    const path = `policy.overrides[${index}]`;
    const previous = overrideByBreakpoint.get(override.breakpoint);
    if (previous) {
      issues.push(issue('DUPLICATE_OVERRIDE', 'ambiguous', `${path}.breakpoint`, 'A breakpoint cannot have multiple overrides.'));
      if (previous.declaration.mode !== override.declaration.mode) {
        issues.push(issue('CONFLICTING_OVERRIDE_MODE', 'ambiguous', `${path}.declaration.mode`, 'Override declarations disagree about mode.'));
      }
      if (previous.declaration.origin !== override.declaration.origin) {
        issues.push(issue('CONFLICTING_CHOICE_ORIGIN', 'ambiguous', `${path}.declaration.origin`, 'Override declarations disagree about choice origin.'));
      }
    } else {
      overrideByBreakpoint.set(override.breakpoint, override);
    }
    if (override.breakpoint === referenceBreakpoint) {
      issues.push(issue(
        'REFERENCE_BREAKPOINT_OVERRIDE_CONFLICT',
        'ambiguous',
        `${path}.breakpoint`,
        'The reference breakpoint is governed by the primary declaration.',
      ));
    }
    const previousDeclarationPath = declarationIds.get(override.declaration.declarationId);
    if (previousDeclarationPath) {
      issues.push(issue('DUPLICATE_DECLARATION_ID', 'ambiguous', `${path}.declaration.declarationId`, `Declaration ID already used at ${previousDeclarationPath}.`));
    } else {
      declarationIds.set(override.declaration.declarationId, `${path}.declaration`);
    }
  });

  const geometryByBreakpoint = new Map<DashboardGridBreakpoint, GridPolicyGeometryDeclarationV1>();
  const geometryById = new Map<string, GridPolicyGeometryDeclarationV1>();
  geometries.forEach((geometry, index) => {
    const path = `policy.geometries[${index}]`;
    const previous = geometryByBreakpoint.get(geometry.breakpoint);
    if (previous) {
      issues.push(issue('DUPLICATE_GEOMETRY_DECLARATION', 'ambiguous', `${path}.breakpoint`, 'A breakpoint cannot have multiple geometry declarations.'));
      if (previous.origin !== geometry.origin) {
        issues.push(issue('CONFLICTING_GEOMETRY_ORIGIN', 'ambiguous', `${path}.origin`, 'Geometry declarations disagree about origin.'));
      }
    } else {
      geometryByBreakpoint.set(geometry.breakpoint, geometry);
    }
    if (geometryById.has(geometry.declarationId)) {
      issues.push(issue('DUPLICATE_DECLARATION_ID', 'ambiguous', `${path}.declarationId`, 'Geometry declaration IDs must be unique.'));
    } else {
      geometryById.set(geometry.declarationId, geometry);
    }
    const expectedPolicyDeclarationId = overrideByBreakpoint.get(geometry.breakpoint)?.declaration.declarationId ??
      primary.declarationId;
    if (geometry.policyDeclarationId !== expectedPolicyDeclarationId) {
      issues.push(issue(
        'GEOMETRY_POLICY_DECLARATION_MISMATCH',
        'ambiguous',
        `${path}.policyDeclarationId`,
        'Geometry must reference the effective choice declaration for its breakpoint.',
      ));
    }
  });

  geometries.forEach((geometry, index) => {
    if (geometry.origin !== 'generated' || !geometry.lineage) return;
    const path = `policy.geometries[${index}].lineage`;
    if (!sameScope(geometry.lineage.sourceScope, scope)) {
      issues.push(issue('LINEAGE_SCOPE_MISMATCH', 'ambiguous', `${path}.sourceScope`, 'Cross-scope derivation is not declared by version 1.'));
    }
    if (geometry.lineage.sourceBreakpoint !== referenceBreakpoint) {
      issues.push(issue(
        'LINEAGE_SOURCE_BREAKPOINT_MISMATCH',
        'ambiguous',
        `${path}.sourceBreakpoint`,
        'Generated geometry must identify the configured reference breakpoint.',
      ));
    }
    const source = geometryById.get(geometry.lineage.sourceGeometryDeclarationId);
    if (!source || source.breakpoint !== geometry.lineage.sourceBreakpoint) {
      issues.push(issue(
        'LINEAGE_SOURCE_GEOMETRY_NOT_DECLARED',
        'missing',
        `${path}.sourceGeometryDeclarationId`,
        'The persistent source geometry declaration is missing.',
      ));
    } else if (source.origin !== 'explicit') {
      issues.push(issue(
        'LINEAGE_SOURCE_GEOMETRY_NOT_EXPLICIT',
        'ambiguous',
        `${path}.sourceGeometryDeclarationId`,
        'Version 1 does not permit generated or runtime geometry as a derivation source.',
      ));
    }
  });
}

function failedResult(
  status: FailedParseStatus,
  issues: readonly GridStructuralPolicyConfigurationIssue[],
  unsupportedVersion?: number,
): GridStructuralPolicyConfigurationParseResult {
  return {
    status,
    policy: null,
    issues,
    ...(unsupportedVersion === undefined ? null : { unsupportedVersion }),
    renderingAuthority: 'not-authorized',
  };
}

function statusForIssues(issues: readonly GridStructuralPolicyConfigurationIssue[]): FailedParseStatus {
  if (issues.some((current) => current.classification === 'unsupported')) return 'unsupported-version';
  if (issues.some((current) => current.classification === 'invalid')) return 'invalid';
  if (issues.some((current) => current.classification === 'ambiguous')) return 'ambiguous';
  return 'incomplete';
}

/**
 * Parses only the policy field. Passing undefined or null means that the field
 * is absent from a valid legacy dashboard; unrelated dashboard fields are never
 * inspected as policy evidence.
 */
export function parseGridStructuralPolicyConfiguration(
  input: unknown,
): GridStructuralPolicyConfigurationParseResult {
  if (input === undefined || input === null) {
    return {
      status: 'legacy-absent',
      policy: null,
      issues: [],
      renderingAuthority: 'not-authorized',
    };
  }
  const nonJsonInput = findNonJsonInput(input, 'policy');
  if (nonJsonInput) {
    return failedResult('invalid', [
      issue('NON_JSON_INPUT', 'invalid', nonJsonInput.path, nonJsonInput.message),
    ]);
  }
  if (!isRecord(input)) {
    return failedResult('invalid', [issue('INPUT_NOT_OBJECT', 'invalid', 'policy', 'Policy must be an object.')]);
  }
  if (input.version === undefined) {
    return failedResult('incomplete', [issue('MISSING_VERSION', 'missing', 'policy.version', 'Policy version is required.')]);
  }
  if (!Number.isSafeInteger(input.version) || Number(input.version) < 1) {
    return failedResult('invalid', [issue('INVALID_VERSION', 'invalid', 'policy.version', 'Policy version must be a positive integer.')]);
  }
  if (input.version !== GRID_STRUCTURAL_POLICY_CONFIGURATION_VERSION) {
    return failedResult(
      'unsupported-version',
      [issue('UNSUPPORTED_VERSION', 'unsupported', 'policy.version', 'This policy version is not supported.')],
      Number(input.version),
    );
  }

  const issues: MutableIssue[] = [];
  unknownFields(input, ['version', 'scope', 'referenceBreakpoint', 'primary', 'overrides', 'geometries'], 'policy', issues);
  const scope = parseScope(input.scope, 'policy.scope', issues);
  const referenceBreakpoint = parseBreakpoint(
    input.referenceBreakpoint,
    'policy.referenceBreakpoint',
    'MISSING_REFERENCE_BREAKPOINT',
    issues,
  );
  const primary = parseChoiceDeclaration(input.primary, 'policy.primary', 'MISSING_PRIMARY_DECLARATION', issues);
  const overrides = parseOverrides(input.overrides, issues);
  const geometries = parseGeometries(input.geometries, issues);

  if (scope && referenceBreakpoint && primary) {
    validateSemantics(scope, referenceBreakpoint, primary, overrides, geometries, issues);
  }
  if (issues.length > 0 || !scope || !referenceBreakpoint || !primary) {
    return failedResult(statusForIssues(issues), issues);
  }

  const byBreakpoint = (first: { breakpoint: DashboardGridBreakpoint }, second: { breakpoint: DashboardGridBreakpoint }) =>
    BREAKPOINT_INDEX.get(first.breakpoint)! - BREAKPOINT_INDEX.get(second.breakpoint)!;
  const policy: GridStructuralPolicyConfigurationV1 = {
    version: GRID_STRUCTURAL_POLICY_CONFIGURATION_VERSION,
    scope,
    referenceBreakpoint,
    primary,
    overrides: [...overrides].sort(byBreakpoint),
    geometries: [...geometries].sort(byBreakpoint),
  };
  return {
    status: 'valid',
    policy,
    issues: [],
    declarationAuthority: 'contract-valid',
    renderingAuthority: 'not-authorized',
  };
}

function resolutionFailure(
  status: 'scope-mismatch' | 'invalid-request',
  policy: GridStructuralPolicyConfigurationV1,
  requestedScope: GridScope,
  breakpoint: DashboardGridBreakpoint,
  issueEntry: GridStructuralPolicyConfigurationIssue,
): GridStructuralPolicyModeResolution {
  return {
    status,
    requestedScope,
    breakpoint,
    primaryMode: policy.primary.mode,
    appliedOverride: null,
    effectiveMode: null,
    declarationSource: null,
    declarationId: null,
    choiceOrigin: null,
    geometry: null,
    reliability: 'unavailable',
    declarationAuthority: 'unavailable',
    renderingAuthority: 'not-authorized',
    limitations: ['STRUCTURAL_CONTEXT_NOT_VALIDATED', 'GEOMETRY_COMPLETENESS_NOT_VALIDATED'],
    issues: [issueEntry],
  };
}

/** Resolves declarations only. It never reads, creates, validates, or mutates coordinates. */
export function resolveGridStructuralPolicyConfigurationMode(
  policy: GridStructuralPolicyConfigurationV1,
  requestedScope: GridScope,
  breakpoint: DashboardGridBreakpoint,
): GridStructuralPolicyModeResolution {
  if (!isBreakpoint(breakpoint)) {
    return resolutionFailure(
      'invalid-request',
      policy,
      requestedScope,
      breakpoint,
      issue('INVALID_BREAKPOINT', 'invalid', 'request.breakpoint', 'The requested breakpoint is invalid.'),
    );
  }
  if (!sameScope(policy.scope, requestedScope)) {
    return resolutionFailure(
      'scope-mismatch',
      policy,
      requestedScope,
      breakpoint,
      issue('INVALID_SCOPE', 'invalid', 'request.scope', 'The requested scope is not governed by this policy.'),
    );
  }

  const appliedOverride = policy.overrides.find((entry) => entry.breakpoint === breakpoint) ?? null;
  const declaration = appliedOverride?.declaration ?? policy.primary;
  const geometry = policy.geometries.find((entry) => entry.breakpoint === breakpoint) ?? null;
  const limitations: GridStructuralPolicyResolutionLimitation[] = [
    'STRUCTURAL_CONTEXT_NOT_VALIDATED',
    'GEOMETRY_COMPLETENESS_NOT_VALIDATED',
  ];
  if (!geometry) limitations.push('GEOMETRY_NOT_DECLARED');
  if (geometry?.origin === 'legacy' || geometry?.origin === 'diagnostic-fallback') {
    limitations.push('NON_AUTHORITATIVE_GEOMETRY_ORIGIN');
  }
  if (geometry?.origin === 'generated') limitations.push('GENERATED_LINEAGE_SOURCE_NOT_VERIFIED');
  const limited = !geometry || geometry.origin !== 'explicit';

  return {
    status: 'resolved',
    requestedScope,
    breakpoint,
    primaryMode: policy.primary.mode,
    appliedOverride,
    effectiveMode: declaration.mode,
    declarationSource: appliedOverride ? 'breakpoint-override' : 'primary',
    declarationId: declaration.declarationId,
    choiceOrigin: declaration.origin,
    geometry,
    reliability: limited ? 'limited' : 'declaration-valid',
    declarationAuthority: 'contract-valid',
    renderingAuthority: 'not-authorized',
    limitations,
    issues: [],
  };
}
