import type { DashboardGridBreakpoint } from '../../../types/widgetTypeLayout';
import type {
  GridScope,
  GridStructuralBaselineTrust,
  GridStructuralInventoryCompleteness,
} from './gridStructuralPolicy';
import {
  parseGridStructuralPolicyConfiguration,
  resolveGridStructuralPolicyConfigurationMode,
  type GridPolicyChoiceOrigin,
  type GridPolicyGeometryOrigin,
  type GridStructuralPolicyConfigurationIssueCode,
  type GridStructuralPolicyConfigurationParseResult,
  type GridStructuralPolicyModeResolution,
} from './gridStructuralPolicyConfiguration';
import type {
  GridStructuralShadowLayoutCompleteness,
  GridStructuralShadowSnapshotState,
} from './gridStructuralPolicyShadowAdapter';
import type { GridLayoutMode } from './model';

export const GRID_STRUCTURAL_POLICY_CONFIGURATION_INSPECTION_VERSION = 1 as const;

export type GridStructuralPolicySnapshotReceiptEvidence =
  | 'verified-match'
  | 'missing'
  | 'mismatch';

export type GridStructuralPolicySnapshotEvidence = Readonly<{
  state: GridStructuralShadowSnapshotState;
  coherent: boolean;
  generation: number;
  revision: number | null;
  diagnosticFingerprint: string | null;
  applicationReceipt: GridStructuralPolicySnapshotReceiptEvidence;
}>;

export type GridStructuralPolicyInventoryEvidence = Readonly<{
  completeness: GridStructuralInventoryCompleteness;
  activeCount: number;
  verifiedAbsentCount: number;
  uncertainCount: number;
  duplicateIdCount: number;
  activeWithoutGeometryCount: number;
  stackContainerCount: number;
}>;

export type GridStructuralPolicyGeometryEvidence = Readonly<{
  completeness: GridStructuralShadowLayoutCompleteness;
  baselineTrust: GridStructuralBaselineTrust;
  outOfBoundsCount: number;
  collisionCount: number;
}>;

export type GridStructuralPolicySourceGeometryEvidence = Readonly<{
  evidenceSource: 'persisted-geometry-declaration';
  declarationId: string;
  scope: GridScope;
  breakpoint: DashboardGridBreakpoint;
  completeness: 'complete' | 'incomplete';
}>;

export type GridStructuralPolicyAlgorithmRegistryEvidence = Readonly<{
  evidenceSource: 'authoritative-algorithm-registry';
  algorithmId: string;
  algorithmVersion: string;
  support: 'supported' | 'unsupported';
}>;

export type GridStructuralPolicyFingerprintEvidence = Readonly<{
  evidenceSource: 'independent-source-geometry' | 'independent-structural-inventory';
  value: string;
}>;

export type GridStructuralPolicyVersionEvidence = Readonly<{
  evidenceSource: 'persisted-structural-version';
  value: number;
}>;

/**
 * Every field describes independently classified evidence. A boolean
 * `verified` shortcut is intentionally not part of this contract.
 */
export type GridStructuralPolicyLineageEvidence = Readonly<{
  /** Evidence must be produced independently from the policy declaration before inspection. */
  sourceGeometry?: GridStructuralPolicySourceGeometryEvidence;
  /** This record is an upstream registry lookup result, not a support claim inferred here. */
  algorithmRegistry?: GridStructuralPolicyAlgorithmRegistryEvidence;
  /** Fingerprints must be recomputed by their named independent evidence sources. */
  sourceStructuralFingerprint?: GridStructuralPolicyFingerprintEvidence;
  sourceInventoryFingerprint?: GridStructuralPolicyFingerprintEvidence;
  /** This version must originate from persisted structural state, never React generation. */
  sourceStructuralVersion?: GridStructuralPolicyVersionEvidence;
}>;

export type InspectGridStructuralPolicyConfigurationInput = Readonly<{
  policy: unknown;
  requestedScope: GridScope;
  requestedBreakpoint: DashboardGridBreakpoint;
  structuralContext: GridStructuralPolicySnapshotEvidence;
  inventoryEvidence: GridStructuralPolicyInventoryEvidence;
  geometryEvidence: GridStructuralPolicyGeometryEvidence;
  lineageEvidence?: GridStructuralPolicyLineageEvidence;
}>;

export type GridStructuralPolicySnapshotReliability =
  | 'verified'
  | 'cache-provisional'
  | 'revision-pending'
  | 'incoherent'
  | 'unverified';

export type GridStructuralPolicyLineageStatus =
  | 'not-applicable'
  | 'verified'
  | 'unverifiable'
  | 'mismatch'
  | 'unsupported-algorithm';

export type GridStructuralPolicyDiagnosticAuthority =
  | 'none'
  | 'legacy-diagnostic'
  | 'declaration-diagnostic'
  | 'structural-diagnostic'
  | 'lineage-diagnostic';

export type GridStructuralPolicyInspectionMissingCondition =
  | 'VALID_POLICY_DECLARATION'
  | 'COMPATIBLE_REQUEST_SCOPE'
  | 'VERIFIED_STRUCTURAL_SNAPSHOT'
  | 'COMPLETE_STRUCTURAL_INVENTORY'
  | 'DECLARED_BREAKPOINT_GEOMETRY'
  | 'COMPLETE_BREAKPOINT_GEOMETRY'
  | 'GEOMETRY_WITHIN_BOUNDS'
  | 'COLLISION_FREE_GEOMETRY'
  | 'NON_PROVISIONAL_BASELINE'
  | 'PERSISTENT_SOURCE_GEOMETRY'
  | 'AUTHORITATIVE_ALGORITHM_REGISTRY'
  | 'INDEPENDENT_SOURCE_STRUCTURAL_FINGERPRINT'
  | 'INDEPENDENT_SOURCE_INVENTORY_FINGERPRINT'
  | 'PERSISTED_STRUCTURAL_VERSION';

export type GridStructuralPolicyInspectionIssueCode =
  | GridStructuralPolicyConfigurationIssueCode
  | 'POLICY_ABSENT'
  | 'REQUEST_SCOPE_MISMATCH'
  | 'REQUEST_BREAKPOINT_INVALID'
  | 'SNAPSHOT_NOT_VERIFIED'
  | 'SNAPSHOT_CACHE_PROVISIONAL'
  | 'SNAPSHOT_REVISION_PENDING'
  | 'SNAPSHOT_INCOHERENT'
  | 'SNAPSHOT_RECEIPT_MISSING'
  | 'SNAPSHOT_RECEIPT_MISMATCH'
  | 'SNAPSHOT_CONTEXT_INVALID'
  | 'INVENTORY_NOT_VERIFIED'
  | 'INVENTORY_UNCERTAIN_IDS'
  | 'INVENTORY_DUPLICATE_IDS'
  | 'ACTIVE_ELEMENTS_WITHOUT_GEOMETRY'
  | 'INVALID_EVIDENCE_COUNT'
  | 'GEOMETRY_NOT_DECLARED'
  | 'GEOMETRY_MISSING'
  | 'GEOMETRY_PARTIAL'
  | 'GEOMETRY_UNKNOWN_IDS'
  | 'GEOMETRY_OUT_OF_BOUNDS'
  | 'GEOMETRY_COLLISION'
  | 'GEOMETRY_BASELINE_UNVERIFIED'
  | 'GEOMETRY_RECONCILED_PROVISIONAL'
  | 'GEOMETRY_ORIGIN_NON_AUTHORITATIVE'
  | 'LINEAGE_DECLARATION_INVALID'
  | 'LINEAGE_EVIDENCE_MISSING'
  | 'LINEAGE_SOURCE_GEOMETRY_INCOMPLETE'
  | 'LINEAGE_SOURCE_GEOMETRY_MISMATCH'
  | 'LINEAGE_ALGORITHM_REGISTRY_UNAVAILABLE'
  | 'LINEAGE_ALGORITHM_EVIDENCE_IRRELEVANT'
  | 'LINEAGE_ALGORITHM_UNSUPPORTED'
  | 'LINEAGE_STRUCTURAL_FINGERPRINT_MISSING'
  | 'LINEAGE_STRUCTURAL_FINGERPRINT_MISMATCH'
  | 'LINEAGE_INVENTORY_FINGERPRINT_MISSING'
  | 'LINEAGE_INVENTORY_FINGERPRINT_MISMATCH'
  | 'LINEAGE_STRUCTURAL_VERSION_MISSING'
  | 'LINEAGE_STRUCTURAL_VERSION_MISMATCH'
  | 'TEMPORARY_GENERATION_NOT_LINEAGE_EVIDENCE'
  | 'DIAGNOSTIC_FINGERPRINT_NOT_LINEAGE_EVIDENCE';

export type GridStructuralPolicyInspectionScope =
  | Readonly<{ kind: 'root' }>
  | Readonly<{ kind: 'group'; idSignature: string }>;

export type GridStructuralPolicyConfigurationInspectionReport = Readonly<{
  version: typeof GRID_STRUCTURAL_POLICY_CONFIGURATION_INSPECTION_VERSION;
  requestedScope: GridStructuralPolicyInspectionScope;
  requestedBreakpoint: DashboardGridBreakpoint;
  parsing: Readonly<{
    status: GridStructuralPolicyConfigurationParseResult['status'];
    unsupportedVersion: number | null;
    issueCodes: readonly GridStructuralPolicyConfigurationIssueCode[];
    policySignature: string | null;
  }>;
  declaration: Readonly<{
    primaryMode: GridLayoutMode | null;
    effectiveMode: GridLayoutMode | null;
    overrideApplied: boolean;
    declarationSource: GridStructuralPolicyModeResolution['declarationSource'];
    declarationSignature: string | null;
    choiceOrigin: GridPolicyChoiceOrigin | null;
    geometryOrigin: GridPolicyGeometryOrigin | null;
    geometryDeclarationSignature: string | null;
  }>;
  snapshot: Readonly<{
    state: GridStructuralShadowSnapshotState;
    reliability: GridStructuralPolicySnapshotReliability;
    coherent: boolean;
    generation: number | null;
    revision: number | null;
    diagnosticFingerprintAvailable: boolean;
    applicationReceipt: GridStructuralPolicySnapshotReceiptEvidence;
  }>;
  inventory: Readonly<{
    completeness: GridStructuralInventoryCompleteness;
    activeCount: number | null;
    verifiedAbsentCount: number | null;
    uncertainCount: number | null;
    duplicateIdCount: number | null;
    activeWithoutGeometryCount: number | null;
    stackContainerCount: number | null;
  }>;
  geometry: Readonly<{
    completeness: GridStructuralShadowLayoutCompleteness;
    baselineTrust: GridStructuralBaselineTrust;
    outOfBoundsCount: number | null;
    collisionCount: number | null;
  }>;
  lineage: Readonly<{
    status: GridStructuralPolicyLineageStatus;
    declared: boolean;
    independentEvidenceComplete: boolean;
  }>;
  issueCodes: readonly GridStructuralPolicyInspectionIssueCode[];
  missingConditions: readonly GridStructuralPolicyInspectionMissingCondition[];
  diagnosticAuthority: GridStructuralPolicyDiagnosticAuthority;
  renderingAuthority: 'not-authorized';
  /**
   * Hash of every preceding sanitized report field. Any change to parsing,
   * resolved declaration, classified evidence, issues, conditions, or
   * diagnostic authority changes this signature; raw IDs and fingerprints
   * are never included.
   */
  signature: string;
}>;

type InspectionIssue = GridStructuralPolicyInspectionIssueCode;
type MissingCondition = GridStructuralPolicyInspectionMissingCondition;

function hashValue(prefix: string, value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${value.length}-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort() as T[];
}

function sanitizeScope(scope: GridScope): GridStructuralPolicyInspectionScope {
  return scope.kind === 'root'
    ? { kind: 'root' }
    : { kind: 'group', idSignature: hashValue('scope', scope.id) };
}

function sameScope(first: GridScope, second: GridScope) {
  return first.kind === second.kind && (first.kind === 'root' || first.id === (second as { id: string }).id);
}

function safeCount(value: number, issues: InspectionIssue[]) {
  if (Number.isSafeInteger(value) && value >= 0) return value;
  issues.push('INVALID_EVIDENCE_COUNT');
  return null;
}

function snapshotReliability(
  evidence: GridStructuralPolicySnapshotEvidence,
  issues: InspectionIssue[],
  missing: MissingCondition[],
): GridStructuralPolicySnapshotReliability {
  const generationValid = Number.isSafeInteger(evidence.generation) && evidence.generation > 0;
  const revisionValid = evidence.revision !== null && Number.isSafeInteger(evidence.revision) && evidence.revision > 0;
  const fingerprintValid = typeof evidence.diagnosticFingerprint === 'string' &&
    evidence.diagnosticFingerprint.length > 0;
  const contextValid = generationValid && revisionValid && fingerprintValid;

  if (evidence.state === 'revision-pending') {
    issues.push('SNAPSHOT_REVISION_PENDING');
    missing.push('VERIFIED_STRUCTURAL_SNAPSHOT');
    return 'revision-pending';
  }
  if (!evidence.coherent || evidence.state === 'incoherent' || evidence.applicationReceipt === 'mismatch') {
    issues.push('SNAPSHOT_INCOHERENT');
    if (evidence.applicationReceipt === 'mismatch') issues.push('SNAPSHOT_RECEIPT_MISMATCH');
    missing.push('VERIFIED_STRUCTURAL_SNAPSHOT');
    return 'incoherent';
  }
  if (evidence.state === 'cache-provisional') {
    issues.push('SNAPSHOT_CACHE_PROVISIONAL');
    missing.push('VERIFIED_STRUCTURAL_SNAPSHOT');
    return 'cache-provisional';
  }
  if (
    evidence.state === 'verified-home-assistant' &&
    evidence.applicationReceipt === 'verified-match' &&
    contextValid
  ) return 'verified';

  issues.push('SNAPSHOT_NOT_VERIFIED');
  if (evidence.applicationReceipt === 'missing') issues.push('SNAPSHOT_RECEIPT_MISSING');
  if (!contextValid) issues.push('SNAPSHOT_CONTEXT_INVALID');
  missing.push('VERIFIED_STRUCTURAL_SNAPSHOT');
  return 'unverified';
}

function parseFailureLineageStatus(
  parsed: GridStructuralPolicyConfigurationParseResult,
): GridStructuralPolicyLineageStatus {
  return parsed.issues.some((current) =>
    current.code === 'GENERATED_LINEAGE_REQUIRED' ||
    current.code === 'INVALID_LINEAGE' ||
    current.code === 'MISSING_LINEAGE_FIELD' ||
    current.code === 'UNSUPPORTED_LINEAGE_VERSION'
  ) ? 'unverifiable' : 'not-applicable';
}

type LineageInspection = Readonly<{
  status: GridStructuralPolicyLineageStatus;
  declared: boolean;
  independentEvidenceComplete: boolean;
  issues: readonly InspectionIssue[];
  missing: readonly MissingCondition[];
}>;

function inspectLineage(
  resolution: GridStructuralPolicyModeResolution | null,
  evidence: GridStructuralPolicyLineageEvidence | undefined,
  snapshot: GridStructuralPolicySnapshotEvidence,
  reliability: GridStructuralPolicySnapshotReliability,
): LineageInspection {
  const geometry = resolution?.geometry;
  if (!geometry || geometry.origin !== 'generated' || !geometry.lineage) {
    return { status: 'not-applicable', declared: false, independentEvidenceComplete: false, issues: [], missing: [] };
  }

  const lineage = geometry.lineage;
  const issues: InspectionIssue[] = [];
  const missing: MissingCondition[] = [];
  let mismatch = false;
  let unsupportedAlgorithm = false;

  if (reliability !== 'verified') {
    issues.push('LINEAGE_EVIDENCE_MISSING');
    missing.push('VERIFIED_STRUCTURAL_SNAPSHOT');
  }

  const sourceGeometry = evidence?.sourceGeometry;
  if (!sourceGeometry) {
    issues.push('LINEAGE_EVIDENCE_MISSING');
    missing.push('PERSISTENT_SOURCE_GEOMETRY');
  } else {
    if (
      sourceGeometry.declarationId !== lineage.sourceGeometryDeclarationId ||
      sourceGeometry.breakpoint !== lineage.sourceBreakpoint ||
      !sameScope(sourceGeometry.scope, lineage.sourceScope)
    ) {
      issues.push('LINEAGE_SOURCE_GEOMETRY_MISMATCH');
      mismatch = true;
    }
    if (sourceGeometry.completeness !== 'complete') {
      issues.push('LINEAGE_SOURCE_GEOMETRY_INCOMPLETE');
      missing.push('PERSISTENT_SOURCE_GEOMETRY');
    }
  }

  const registry = evidence?.algorithmRegistry;
  if (!registry) {
    issues.push('LINEAGE_ALGORITHM_REGISTRY_UNAVAILABLE');
    missing.push('AUTHORITATIVE_ALGORITHM_REGISTRY');
  } else if (
    registry.algorithmId !== lineage.algorithmId ||
    registry.algorithmVersion !== lineage.algorithmVersion
  ) {
    issues.push('LINEAGE_ALGORITHM_EVIDENCE_IRRELEVANT');
    missing.push('AUTHORITATIVE_ALGORITHM_REGISTRY');
  } else if (registry.support === 'unsupported') {
    issues.push('LINEAGE_ALGORITHM_UNSUPPORTED');
    unsupportedAlgorithm = true;
  }

  const structuralFingerprint = evidence?.sourceStructuralFingerprint;
  if (
    !structuralFingerprint ||
    structuralFingerprint.evidenceSource !== 'independent-source-geometry' ||
    structuralFingerprint.value.startsWith('dsl-v1-')
  ) {
    issues.push('LINEAGE_STRUCTURAL_FINGERPRINT_MISSING');
    missing.push('INDEPENDENT_SOURCE_STRUCTURAL_FINGERPRINT');
    if (
      structuralFingerprint?.value.startsWith('dsl-v1-') ||
      (snapshot.diagnosticFingerprint === lineage.sourceStructuralFingerprint &&
        snapshot.diagnosticFingerprint?.startsWith('dsl-v1-'))
    ) {
      issues.push('DIAGNOSTIC_FINGERPRINT_NOT_LINEAGE_EVIDENCE');
    }
  } else if (structuralFingerprint.value !== lineage.sourceStructuralFingerprint) {
    issues.push('LINEAGE_STRUCTURAL_FINGERPRINT_MISMATCH');
    mismatch = true;
  }

  const inventoryFingerprint = evidence?.sourceInventoryFingerprint;
  if (!inventoryFingerprint || inventoryFingerprint.evidenceSource !== 'independent-structural-inventory') {
    issues.push('LINEAGE_INVENTORY_FINGERPRINT_MISSING');
    missing.push('INDEPENDENT_SOURCE_INVENTORY_FINGERPRINT');
  } else if (inventoryFingerprint.value !== lineage.sourceInventoryFingerprint) {
    issues.push('LINEAGE_INVENTORY_FINGERPRINT_MISMATCH');
    mismatch = true;
  }

  const structuralVersion = evidence?.sourceStructuralVersion;
  if (!structuralVersion) {
    issues.push('LINEAGE_STRUCTURAL_VERSION_MISSING');
    missing.push('PERSISTED_STRUCTURAL_VERSION');
  } else if (structuralVersion.value !== lineage.sourceStructuralVersion) {
    issues.push('LINEAGE_STRUCTURAL_VERSION_MISMATCH');
    mismatch = true;
  }

  const complete = missing.length === 0 && !mismatch && !unsupportedAlgorithm;
  if (!complete && snapshot.generation > 0) issues.push('TEMPORARY_GENERATION_NOT_LINEAGE_EVIDENCE');
  const status: GridStructuralPolicyLineageStatus = complete
    ? 'verified'
    : missing.length > 0
      ? 'unverifiable'
      : unsupportedAlgorithm
        ? 'unsupported-algorithm'
        : mismatch
          ? 'mismatch'
          : 'unverifiable';
  return {
    status,
    declared: true,
    independentEvidenceComplete: complete,
    issues: uniqueSorted(issues),
    missing: uniqueSorted(missing),
  };
}

function policySignature(parsed: GridStructuralPolicyConfigurationParseResult) {
  if (parsed.status === 'legacy-absent') return null;
  if (parsed.status === 'valid') return hashValue('policy-v1', JSON.stringify(parsed.policy));
  return hashValue('policy-result', JSON.stringify({
    status: parsed.status,
    unsupportedVersion: parsed.unsupportedVersion ?? null,
    issueCodes: uniqueSorted(parsed.issues.map((current) => current.code)),
  }));
}

function diagnosticAuthority(
  parsed: GridStructuralPolicyConfigurationParseResult,
  resolution: GridStructuralPolicyModeResolution | null,
  snapshot: GridStructuralPolicySnapshotReliability,
  geometryHealthy: boolean,
  inventoryHealthy: boolean,
  lineage: GridStructuralPolicyLineageStatus,
): GridStructuralPolicyDiagnosticAuthority {
  if (parsed.status === 'legacy-absent') return 'legacy-diagnostic';
  if (parsed.status !== 'valid' || resolution?.status !== 'resolved') return 'none';
  if (snapshot !== 'verified' || !geometryHealthy || !inventoryHealthy) return 'declaration-diagnostic';
  if (resolution.geometry?.origin === 'generated') {
    return lineage === 'verified' ? 'lineage-diagnostic' : 'declaration-diagnostic';
  }
  return resolution.geometry?.origin === 'explicit'
    ? 'structural-diagnostic'
    : 'declaration-diagnostic';
}

/**
 * Inspects a policy declaration and already-classified structural evidence.
 * It never loads, generates, normalizes, solves, renders, or persists geometry.
 */
export function inspectGridStructuralPolicyConfiguration(
  input: InspectGridStructuralPolicyConfigurationInput,
): GridStructuralPolicyConfigurationInspectionReport {
  const issues: InspectionIssue[] = [];
  const missing: MissingCondition[] = [];
  const parsed = parseGridStructuralPolicyConfiguration(input.policy);
  issues.push(...parsed.issues.map((current) => current.code));

  let resolution: GridStructuralPolicyModeResolution | null = null;
  if (parsed.status === 'valid') {
    resolution = resolveGridStructuralPolicyConfigurationMode(
      parsed.policy,
      input.requestedScope,
      input.requestedBreakpoint,
    );
    if (resolution.status === 'scope-mismatch') {
      issues.push('REQUEST_SCOPE_MISMATCH');
      missing.push('COMPATIBLE_REQUEST_SCOPE');
    } else if (resolution.status === 'invalid-request') {
      issues.push('REQUEST_BREAKPOINT_INVALID');
      missing.push('VALID_POLICY_DECLARATION');
    }
  } else if (parsed.status === 'legacy-absent') {
    issues.push('POLICY_ABSENT');
  } else {
    missing.push('VALID_POLICY_DECLARATION');
  }

  const reliability = snapshotReliability(input.structuralContext, issues, missing);
  const inventory = {
    completeness: input.inventoryEvidence.completeness,
    activeCount: safeCount(input.inventoryEvidence.activeCount, issues),
    verifiedAbsentCount: safeCount(input.inventoryEvidence.verifiedAbsentCount, issues),
    uncertainCount: safeCount(input.inventoryEvidence.uncertainCount, issues),
    duplicateIdCount: safeCount(input.inventoryEvidence.duplicateIdCount, issues),
    activeWithoutGeometryCount: safeCount(input.inventoryEvidence.activeWithoutGeometryCount, issues),
    stackContainerCount: safeCount(input.inventoryEvidence.stackContainerCount, issues),
  };
  const inventoryHealthy = inventory.completeness === 'verified-complete' &&
    inventory.uncertainCount === 0 && inventory.duplicateIdCount === 0 &&
    inventory.activeWithoutGeometryCount === 0 && !issues.includes('INVALID_EVIDENCE_COUNT');
  if (inventory.completeness !== 'verified-complete') issues.push('INVENTORY_NOT_VERIFIED');
  if (inventory.uncertainCount !== null && inventory.uncertainCount > 0) issues.push('INVENTORY_UNCERTAIN_IDS');
  if (inventory.duplicateIdCount !== null && inventory.duplicateIdCount > 0) issues.push('INVENTORY_DUPLICATE_IDS');
  if (inventory.activeWithoutGeometryCount !== null && inventory.activeWithoutGeometryCount > 0) {
    issues.push('ACTIVE_ELEMENTS_WITHOUT_GEOMETRY');
  }
  if (!inventoryHealthy) missing.push('COMPLETE_STRUCTURAL_INVENTORY');

  const geometry = {
    completeness: input.geometryEvidence.completeness,
    baselineTrust: input.geometryEvidence.baselineTrust,
    outOfBoundsCount: safeCount(input.geometryEvidence.outOfBoundsCount, issues),
    collisionCount: safeCount(input.geometryEvidence.collisionCount, issues),
  };
  const completeGeometry = geometry.completeness === 'explicit-complete';
  if (geometry.completeness === 'missing') issues.push('GEOMETRY_MISSING');
  if (geometry.completeness === 'explicit-partial' ||
      geometry.completeness === 'explicit-partial-with-unknown-ids') issues.push('GEOMETRY_PARTIAL');
  if (geometry.completeness === 'explicit-with-unknown-ids' ||
      geometry.completeness === 'explicit-partial-with-unknown-ids') issues.push('GEOMETRY_UNKNOWN_IDS');
  if (!completeGeometry) missing.push('COMPLETE_BREAKPOINT_GEOMETRY');
  if (geometry.outOfBoundsCount !== null && geometry.outOfBoundsCount > 0) {
    issues.push('GEOMETRY_OUT_OF_BOUNDS');
    missing.push('GEOMETRY_WITHIN_BOUNDS');
  }
  if (geometry.collisionCount !== null && geometry.collisionCount > 0) {
    issues.push('GEOMETRY_COLLISION');
    missing.push('COLLISION_FREE_GEOMETRY');
  }
  if (geometry.baselineTrust === 'reconciled-provisional') {
    issues.push('GEOMETRY_RECONCILED_PROVISIONAL');
    missing.push('NON_PROVISIONAL_BASELINE');
  } else if (geometry.baselineTrust === 'unverified') {
    issues.push('GEOMETRY_BASELINE_UNVERIFIED');
    missing.push('NON_PROVISIONAL_BASELINE');
  }

  const resolvedGeometry = resolution?.geometry ?? null;
  if (parsed.status === 'valid' && resolution?.status === 'resolved' && !resolvedGeometry) {
    issues.push('GEOMETRY_NOT_DECLARED');
    missing.push('DECLARED_BREAKPOINT_GEOMETRY');
  }
  if (resolvedGeometry?.origin === 'legacy' || resolvedGeometry?.origin === 'diagnostic-fallback') {
    issues.push('GEOMETRY_ORIGIN_NON_AUTHORITATIVE');
  }

  const lineage = resolution
    ? inspectLineage(resolution, input.lineageEvidence, input.structuralContext, reliability)
    : {
        status: parseFailureLineageStatus(parsed),
        declared: false,
        independentEvidenceComplete: false,
        issues: parsed.status === 'valid' ? [] : parsed.issues.some((current) =>
          current.code === 'GENERATED_LINEAGE_REQUIRED' ||
          current.code === 'INVALID_LINEAGE' ||
          current.code === 'MISSING_LINEAGE_FIELD' ||
          current.code === 'UNSUPPORTED_LINEAGE_VERSION'
        ) ? ['LINEAGE_DECLARATION_INVALID' as const] : [],
        missing: [],
      };
  issues.push(...lineage.issues);
  missing.push(...lineage.missing);

  const geometryHealthy = resolvedGeometry !== null && completeGeometry &&
    geometry.outOfBoundsCount === 0 && geometry.collisionCount === 0 &&
    geometry.baselineTrust !== 'reconciled-provisional' && geometry.baselineTrust !== 'unverified' &&
    resolvedGeometry.origin !== 'legacy' && resolvedGeometry.origin !== 'diagnostic-fallback';

  const declaration = {
    primaryMode: parsed.status === 'valid' ? parsed.policy.primary.mode : null,
    effectiveMode: resolution?.effectiveMode ?? null,
    overrideApplied: resolution?.appliedOverride !== null && resolution?.appliedOverride !== undefined,
    declarationSource: resolution?.declarationSource ?? null,
    declarationSignature: resolution?.declarationId
      ? hashValue('declaration', resolution.declarationId)
      : null,
    choiceOrigin: resolution?.choiceOrigin ?? null,
    geometryOrigin: resolvedGeometry?.origin ?? null,
    geometryDeclarationSignature: resolvedGeometry
      ? hashValue('geometry', resolvedGeometry.declarationId)
      : null,
  };
  const reportWithoutSignature = {
    version: GRID_STRUCTURAL_POLICY_CONFIGURATION_INSPECTION_VERSION,
    requestedScope: sanitizeScope(input.requestedScope),
    requestedBreakpoint: input.requestedBreakpoint,
    parsing: {
      status: parsed.status,
      unsupportedVersion: parsed.status === 'unsupported-version'
        ? parsed.unsupportedVersion ?? null
        : null,
      issueCodes: uniqueSorted(parsed.issues.map((current) => current.code)),
      policySignature: policySignature(parsed),
    },
    declaration,
    snapshot: {
      state: input.structuralContext.state,
      reliability,
      coherent: input.structuralContext.coherent,
      generation: Number.isSafeInteger(input.structuralContext.generation) && input.structuralContext.generation >= 0
        ? input.structuralContext.generation
        : null,
      revision: input.structuralContext.revision !== null &&
          Number.isSafeInteger(input.structuralContext.revision) && input.structuralContext.revision > 0
        ? input.structuralContext.revision
        : null,
      diagnosticFingerprintAvailable: typeof input.structuralContext.diagnosticFingerprint === 'string' &&
        input.structuralContext.diagnosticFingerprint.length > 0,
      applicationReceipt: input.structuralContext.applicationReceipt,
    },
    inventory,
    geometry,
    lineage: {
      status: lineage.status,
      declared: lineage.declared,
      independentEvidenceComplete: lineage.independentEvidenceComplete,
    },
    issueCodes: uniqueSorted(issues),
    missingConditions: uniqueSorted(missing),
    diagnosticAuthority: diagnosticAuthority(
      parsed,
      resolution,
      reliability,
      geometryHealthy,
      inventoryHealthy,
      lineage.status,
    ),
    renderingAuthority: 'not-authorized' as const,
  };
  return {
    ...reportWithoutSignature,
    signature: hashValue('policy-inspection', JSON.stringify(reportWithoutSignature)),
  };
}
