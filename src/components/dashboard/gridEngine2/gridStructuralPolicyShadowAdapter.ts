import {
  DASHBOARD_GRID_BREAKPOINT_ORDER,
  type DashboardBreakpointLayouts,
  type DashboardGridBreakpoint,
} from '../../../types/widgetTypeLayout';
import {
  resolveGridStructuralPolicy,
  type GridPolicyDeclaration,
  type GridPolicyProvenance,
  type GridStructuralBaselineTrust,
  type GridStructuralElementKind,
  type GridStructuralInventory,
  type GridStructuralLayoutState,
  type GridStructuralPolicyResult,
  type GridStructuralPolicyStatus,
} from './gridStructuralPolicy';
import type { GridLayoutItem, GridLayoutMode } from './model';
import {
  evaluateRuntimeShadowBaseline,
  type RuntimeShadowRootElement,
} from './runtimeShadowBaseline';
import type { RuntimeShadowBaselineIdAudit } from './runtimeShadowIdAudit';
import {
  reconcileRuntimeShadowBaseline,
  type RuntimeShadowConfigurationCompleteness,
  type RuntimeShadowNestedElement,
  type RuntimeShadowReconciliationResult,
} from './runtimeShadowReconciliation';

export const GRID_STRUCTURAL_POLICY_SHADOW_REPORT_VERSION = 1 as const;

export const GRID_STRUCTURAL_POLICY_SHADOW_COLS: Readonly<Record<DashboardGridBreakpoint, number>> = {
  '2xl': 12,
  xl: 12,
  lg: 8,
  md: 6,
  sm: 4,
  xs: 2,
};

const SPECIAL_SECTION_KINDS = new Set(['greeting', 'weather', 'scenes']);

export type GridStructuralShadowContext = Readonly<{
  generation: number;
  revision: number | null;
  fingerprint: string | null;
}>;

export type GridStructuralShadowSnapshotState =
  | 'verified-home-assistant'
  | 'cache-provisional'
  | 'incoherent'
  | 'revision-pending'
  | 'transient'
  | 'unknown';

export type GridStructuralShadowDerivedLineage = Readonly<{
  context: GridStructuralShadowContext;
  algorithmVersion: string;
}>;

export type GridStructuralPolicyShadowInput = Readonly<{
  structuralContext: GridStructuralShadowContext | null;
  /** Defaults to structuralContext; explicit values protect asynchronous boundaries. */
  inventoryContext?: GridStructuralShadowContext | null;
  /** Defaults to structuralContext; explicit values protect asynchronous boundaries. */
  layoutsContext?: GridStructuralShadowContext | null;
  /** Defaults to structuralContext; legacy data is comparison-only. */
  legacyContext?: GridStructuralShadowContext | null;
  snapshotState: GridStructuralShadowSnapshotState;
  configurationCompleteness: RuntimeShadowConfigurationCompleteness;
  rootElements: readonly RuntimeShadowRootElement[];
  knownNonRootElements?: readonly RuntimeShadowNestedElement[];
  structuralLayouts?: Readonly<DashboardBreakpointLayouts>;
  baselineIdAudit: RuntimeShadowBaselineIdAudit;
  reconciliationEnabled: boolean;
  activeBreakpoint?: DashboardGridBreakpoint;
  activeReconciliation?: RuntimeShadowReconciliationResult;
  legacyLayouts?: Readonly<DashboardBreakpointLayouts>;
  /** Synthetic/forward-compatible metadata only; absent metadata is always legacy implicit. */
  policyDeclarations?: Readonly<Partial<Record<DashboardGridBreakpoint, readonly GridPolicyDeclaration[]>>>;
  /** Representable lineage only; this adapter never generates it from current HA data. */
  derivedLineage?: Readonly<Partial<Record<DashboardGridBreakpoint, GridStructuralShadowDerivedLineage>>>;
}>;

export type GridStructuralShadowLayoutCompleteness =
  | 'explicit-complete'
  | 'explicit-partial'
  | 'explicit-with-unknown-ids'
  | 'explicit-partial-with-unknown-ids'
  | 'missing';

export type GridStructuralShadowDiagnosticStatus =
  | 'available'
  | 'limited'
  | 'unavailable-inventory'
  | 'unavailable-context-mismatch'
  | 'unavailable-pending-revision';

export type GridStructuralShadowLegacyComparison = Readonly<{
  status: 'available' | 'unavailable' | 'context-mismatch';
  positionDifferenceCount: number;
  sizeDifferenceCount: number;
  orderDifferenceCount: number;
  structuralOnlyCount: number;
  legacyOnlyCount: number;
}>;

export type GridStructuralPolicyShadowBreakpointReport = Readonly<{
  scope: 'root';
  breakpoint: DashboardGridBreakpoint;
  cols: number;
  hasExplicitLayout: boolean;
  layoutCompleteness: GridStructuralShadowLayoutCompleteness;
  mode: GridLayoutMode | null;
  provenance: GridPolicyProvenance | null;
  baselineQuality: GridStructuralBaselineTrust;
  policyStatus: GridStructuralPolicyStatus | 'not-evaluated';
  diagnosticStatus: GridStructuralShadowDiagnosticStatus;
  renderingAuthority: 'not-authorized';
  counts: Readonly<{
    active: number;
    widgets: number;
    specialSections: number;
    stackContainers: number;
    structuralItems: number;
    verifiedExtra: number;
    uncertain: number;
    duplicateLayoutIds: number;
    duplicateInventoryIds: number;
    activeWithoutGeometry: number;
  }>;
  issueCodes: readonly string[];
  legacyComparison: GridStructuralShadowLegacyComparison;
}>;

export type GridStructuralPolicyShadowReport = Readonly<{
  version: typeof GRID_STRUCTURAL_POLICY_SHADOW_REPORT_VERSION;
  scope: 'root';
  context: Readonly<{
    generation: number | null;
    revision: number | null;
    fingerprintSignature: string | null;
    snapshotState: GridStructuralShadowSnapshotState;
  }>;
  diagnosticStatus: GridStructuralShadowDiagnosticStatus;
  renderingAuthority: 'not-authorized';
  breakpoints: Readonly<Record<DashboardGridBreakpoint, GridStructuralPolicyShadowBreakpointReport>>;
  issueCodes: readonly string[];
  analysisMs: number;
  signature: string;
}>;

export type GridStructuralPolicyShadowAnalysis = Readonly<{
  report: GridStructuralPolicyShadowReport;
  /** Internal detached results. They are intentionally not included in Runtime Shadow logs. */
  policyResults: Readonly<Partial<Record<DashboardGridBreakpoint, GridStructuralPolicyResult>>>;
  reconciliations: Readonly<Partial<Record<DashboardGridBreakpoint, RuntimeShadowReconciliationResult>>>;
}>;

export type GridStructuralPolicyShadowOptions = Readonly<{
  /** Injected clock keeps the adapter deterministic and independently testable. */
  now?: () => number;
}>;

const LEGACY_DECLARATION: readonly GridPolicyDeclaration[] = [{
  source: 'dashboard-layout-schema',
  mode: null,
  provenance: 'legacy-implicit',
}];

function hasOwnLayout(
  layouts: Readonly<DashboardBreakpointLayouts> | undefined,
  breakpoint: DashboardGridBreakpoint,
) {
  return layouts !== undefined && Object.prototype.hasOwnProperty.call(layouts, breakpoint);
}

function contextMatches(
  expected: GridStructuralShadowContext | null,
  actual: GridStructuralShadowContext | null,
) {
  if (expected === null || actual === null) return expected === actual;
  return expected.generation === actual.generation &&
    expected.revision === actual.revision &&
    expected.fingerprint === actual.fingerprint;
}

function isCompleteContext(context: GridStructuralShadowContext | null) {
  return context !== null && Number.isSafeInteger(context.generation) && context.generation > 0 &&
    context.revision !== null && Number.isSafeInteger(context.revision) &&
    typeof context.fingerprint === 'string' && context.fingerprint.length > 0;
}

function hashValue(prefix: string, value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${value.length}-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function roundDuration(duration: number) {
  return Math.round(Math.max(0, duration) * 100) / 100;
}

function uniqueSorted(values: readonly string[]) {
  return [...new Set(values)].sort();
}

function mapElementKind(element: RuntimeShadowRootElement): GridStructuralElementKind | null {
  if (element.role === 'widget') return 'widget';
  if (element.role === 'stack') return 'stack-container';
  if (element.role === 'section' && SPECIAL_SECTION_KINDS.has(element.kind)) return 'special-section';
  return null;
}

function snapshotDiagnosticStatus(
  input: GridStructuralPolicyShadowInput,
  contextsMatch: boolean,
): GridStructuralShadowDiagnosticStatus {
  if (!contextsMatch) return 'unavailable-context-mismatch';
  if (input.snapshotState === 'revision-pending') return 'unavailable-pending-revision';
  if (input.snapshotState === 'verified-home-assistant' && isCompleteContext(input.structuralContext)) {
    return 'available';
  }
  return 'limited';
}

function inventoryCompleteness(
  input: GridStructuralPolicyShadowInput,
  diagnosticStatus: GridStructuralShadowDiagnosticStatus,
): GridStructuralInventory['completeness'] {
  if (
    diagnosticStatus === 'available' &&
    input.snapshotState === 'verified-home-assistant' &&
    input.configurationCompleteness === 'verified-complete'
  ) return 'verified-complete';
  if (input.configurationCompleteness === 'hydration-uncertain') return 'partial';
  return 'unknown';
}

function createInventory(
  input: GridStructuralPolicyShadowInput,
  completeness: GridStructuralInventory['completeness'],
) {
  const issues: string[] = [];
  let unclassifiableRootCount = 0;
  const rootIds = new Set(input.rootElements.map((element) => element.id));
  const items: GridStructuralInventory['items'][number][] = [];
  input.rootElements.forEach((element, order) => {
    const kind = mapElementKind(element);
    if (!kind) {
      issues.push('UNCLASSIFIABLE_ROOT_ELEMENT_KIND');
      unclassifiableRootCount += 1;
      return;
    }
    items.push({ id: element.id, state: 'active', kind, order });
  });
  (input.knownNonRootElements ?? []).forEach((element, index) => {
    if (rootIds.has(element.id)) return;
    const kind = mapElementKind(element);
    if (!kind) {
      issues.push('UNCLASSIFIABLE_NESTED_ELEMENT_KIND');
      return;
    }
    items.push({
      id: element.id,
      state: 'verified-absent',
      kind,
      order: input.rootElements.length + index,
    });
  });
  return {
    inventory: { completeness, items } satisfies GridStructuralInventory,
    issues,
    unclassifiableRootCount,
  };
}

function layoutCompleteness(
  hasExplicitLayout: boolean,
  audit: RuntimeShadowBaselineIdAudit['breakpoints'][DashboardGridBreakpoint],
): GridStructuralShadowLayoutCompleteness {
  if (!hasExplicitLayout) return 'missing';
  const partial = audit.recognizedNotStructural.length > 0;
  const unknown = audit.structuralNotRecognized.length > 0;
  if (partial && unknown) return 'explicit-partial-with-unknown-ids';
  if (partial) return 'explicit-partial';
  if (unknown) return 'explicit-with-unknown-ids';
  return 'explicit-complete';
}

function policyLayoutState(
  completeness: GridStructuralShadowLayoutCompleteness,
  hasVerifiedDerivedLineage: boolean,
): GridStructuralLayoutState {
  if (hasVerifiedDerivedLineage) return 'derived-complete';
  if (completeness === 'missing') return 'missing';
  if (completeness === 'explicit-partial' || completeness === 'explicit-partial-with-unknown-ids') {
    return 'explicit-partial';
  }
  return 'explicit-complete';
}

function emptyLegacyComparison(
  status: GridStructuralShadowLegacyComparison['status'],
): GridStructuralShadowLegacyComparison {
  return {
    status,
    positionDifferenceCount: 0,
    sizeDifferenceCount: 0,
    orderDifferenceCount: 0,
    structuralOnlyCount: 0,
    legacyOnlyCount: 0,
  };
}

function compareLegacy(
  structural: readonly GridLayoutItem[] | null,
  legacy: readonly GridLayoutItem[] | undefined,
  contextsMatch: boolean,
): GridStructuralShadowLegacyComparison {
  if (!contextsMatch) return emptyLegacyComparison('context-mismatch');
  if (!structural || !legacy) return emptyLegacyComparison('unavailable');
  if (new Set(structural.map((item) => item.i)).size !== structural.length ||
      new Set(legacy.map((item) => item.i)).size !== legacy.length) {
    return emptyLegacyComparison('unavailable');
  }
  const structuralById = new Map(structural.map((item, index) => [item.i, { item, index }]));
  const legacyById = new Map(legacy.map((item, index) => [item.i, { item, index }]));
  let positionDifferenceCount = 0;
  let sizeDifferenceCount = 0;
  let orderDifferenceCount = 0;
  structuralById.forEach((structuralEntry, id) => {
    const legacyEntry = legacyById.get(id);
    if (!legacyEntry) return;
    if (structuralEntry.item.x !== legacyEntry.item.x || structuralEntry.item.y !== legacyEntry.item.y) {
      positionDifferenceCount += 1;
    }
    if (structuralEntry.item.w !== legacyEntry.item.w || structuralEntry.item.h !== legacyEntry.item.h) {
      sizeDifferenceCount += 1;
    }
    if (structuralEntry.index !== legacyEntry.index) orderDifferenceCount += 1;
  });
  return {
    status: 'available',
    positionDifferenceCount,
    sizeDifferenceCount,
    orderDifferenceCount,
    structuralOnlyCount: [...structuralById.keys()].filter((id) => !legacyById.has(id)).length,
    legacyOnlyCount: [...legacyById.keys()].filter((id) => !structuralById.has(id)).length,
  };
}

function baselineTrust(
  input: GridStructuralPolicyShadowInput,
  breakpoint: DashboardGridBreakpoint,
  diagnosticStatus: GridStructuralShadowDiagnosticStatus,
  reconciliation: RuntimeShadowReconciliationResult,
  hasExplicitLayout: boolean,
  declarations: readonly GridPolicyDeclaration[],
) {
  const lineage = input.derivedLineage?.[breakpoint];
  const lineageVerified = lineage !== undefined &&
    hasExplicitLayout &&
    declarations.length > 0 &&
    declarations.every((declaration) => declaration.provenance === 'generated') &&
    lineage.algorithmVersion.trim().length > 0 &&
    contextMatches(input.structuralContext, lineage.context);
  if (lineageVerified) return { trust: 'verified-derived' as const, lineageVerified, issue: null };
  if (lineage) return {
    trust: 'unverified' as const,
    lineageVerified: false,
    issue: 'DERIVED_LINEAGE_CONTEXT_MISMATCH',
  };
  if (diagnosticStatus !== 'available') return {
    trust: 'unverified' as const,
    lineageVerified: false,
    issue: null,
  };
  if (reconciliation.status === 'reconciled') return {
    trust: 'reconciled-provisional' as const,
    lineageVerified: false,
    issue: 'RECONCILED_PROVISIONAL_NOT_RENDER_AUTHORITY',
  };
  return { trust: 'authoritative' as const, lineageVerified: false, issue: null };
}

function sanitizedCounts(
  result: GridStructuralPolicyResult | undefined,
  rootElements: readonly RuntimeShadowRootElement[],
  audit: RuntimeShadowBaselineIdAudit['breakpoints'][DashboardGridBreakpoint],
  reconciliation: RuntimeShadowReconciliationResult | undefined,
  unclassifiableRootCount = 0,
) {
  return {
    active: rootElements.length,
    widgets: rootElements.filter((element) => element.role === 'widget').length,
    specialSections: rootElements.filter((element) =>
      element.role === 'section' && SPECIAL_SECTION_KINDS.has(element.kind)
    ).length,
    stackContainers: rootElements.filter((element) => element.role === 'stack').length,
    structuralItems: audit.structuralIds.itemCount,
    verifiedExtra: reconciliation
      ? reconciliation.classifiedAbsentCount + reconciliation.classifiedNestedCount
      : result?.inventory.verifiedAbsentIds.length ?? 0,
    uncertain: (reconciliation?.uncertainCount ?? result?.inventory.uncertainIds.length ?? 0) +
      unclassifiableRootCount,
    duplicateLayoutIds: audit.structuralIds.duplicates.length,
    duplicateInventoryIds: result?.inventory.duplicateInventoryIds.length ?? 0,
    activeWithoutGeometry: audit.recognizedNotStructural.length,
  };
}

function contextsFor(input: GridStructuralPolicyShadowInput) {
  const structural = input.structuralContext;
  const inventory = input.inventoryContext === undefined ? structural : input.inventoryContext;
  const layouts = input.layoutsContext === undefined ? structural : input.layoutsContext;
  const legacy = input.legacyContext === undefined ? structural : input.legacyContext;
  return {
    structural,
    inventory,
    layouts,
    legacy,
    structuralMatches: contextMatches(structural, inventory) && contextMatches(structural, layouts),
    legacyMatches: contextMatches(structural, legacy),
  };
}

function layoutSignature(layout: readonly GridLayoutItem[] | undefined) {
  return (layout ?? []).map(({ i, x, y, w, h }) => [i, x, y, w, h]);
}

function reportSignature(
  input: GridStructuralPolicyShadowInput,
  report: Omit<GridStructuralPolicyShadowReport, 'signature' | 'analysisMs'>,
) {
  const canonical = {
    report,
    roots: input.rootElements.map(({ id, role, kind }) => [id, role, kind]),
    nested: (input.knownNonRootElements ?? []).map(({ id, role, kind, parentRole }) => [
      id, role, kind, parentRole,
    ]),
    structuralLayouts: DASHBOARD_GRID_BREAKPOINT_ORDER.map((breakpoint) => [
      breakpoint,
      hasOwnLayout(input.structuralLayouts, breakpoint) ? layoutSignature(input.structuralLayouts?.[breakpoint]) : null,
    ]),
    legacyLayouts: DASHBOARD_GRID_BREAKPOINT_ORDER.map((breakpoint) => [
      breakpoint,
      hasOwnLayout(input.legacyLayouts, breakpoint) ? layoutSignature(input.legacyLayouts?.[breakpoint]) : null,
    ]),
    declarations: DASHBOARD_GRID_BREAKPOINT_ORDER.map((breakpoint) => [
      breakpoint,
      input.policyDeclarations?.[breakpoint] ?? null,
    ]),
    lineage: DASHBOARD_GRID_BREAKPOINT_ORDER.map((breakpoint) => [
      breakpoint,
      input.derivedLineage?.[breakpoint] ?? null,
    ]),
  };
  return hashValue('gsp-shadow', JSON.stringify(canonical));
}

/**
 * Adapts the already available Runtime Shadow data without reading HA, React,
 * storage, the DOM, or live/derived renderer geometry.
 */
export function analyzeGridStructuralPolicyShadow(
  input: GridStructuralPolicyShadowInput,
  options: GridStructuralPolicyShadowOptions = {},
): GridStructuralPolicyShadowAnalysis {
  const now = options.now ?? (() => 0);
  const startedAt = now();
  const contexts = contextsFor(input);
  const diagnosticStatus = snapshotDiagnosticStatus(input, contexts.structuralMatches);
  const completeness = inventoryCompleteness(input, diagnosticStatus);
  const {
    inventory,
    issues: inventoryIssues,
    unclassifiableRootCount,
  } = createInventory(input, completeness);
  const hasUnclassifiableRoot = unclassifiableRootCount > 0;
  const policyResults: Partial<Record<DashboardGridBreakpoint, GridStructuralPolicyResult>> = {};
  const reconciliations: Partial<Record<DashboardGridBreakpoint, RuntimeShadowReconciliationResult>> = {};
  const breakpointReports = {} as Record<DashboardGridBreakpoint, GridStructuralPolicyShadowBreakpointReport>;

  DASHBOARD_GRID_BREAKPOINT_ORDER.forEach((breakpoint) => {
    const cols = GRID_STRUCTURAL_POLICY_SHADOW_COLS[breakpoint];
    const hasExplicit = hasOwnLayout(input.structuralLayouts, breakpoint);
    const layout = input.structuralLayouts?.[breakpoint] ?? [];
    const audit = input.baselineIdAudit.breakpoints[breakpoint];
    const completenessState = layoutCompleteness(hasExplicit, audit);
    const issueCodes = [...inventoryIssues];

    if (!contexts.structuralMatches || diagnosticStatus === 'unavailable-pending-revision' || hasUnclassifiableRoot) {
      if (!contexts.structuralMatches) issueCodes.push('STRUCTURAL_CONTEXT_MISMATCH');
      else if (diagnosticStatus === 'unavailable-pending-revision') issueCodes.push('STRUCTURAL_REVISION_PENDING');
      breakpointReports[breakpoint] = {
        scope: 'root',
        breakpoint,
        cols,
        hasExplicitLayout: hasExplicit,
        layoutCompleteness: completenessState,
        mode: null,
        provenance: null,
        baselineQuality: 'unverified',
        policyStatus: 'not-evaluated',
        diagnosticStatus: hasUnclassifiableRoot ? 'unavailable-inventory' : diagnosticStatus,
        renderingAuthority: 'not-authorized',
        counts: sanitizedCounts(undefined, input.rootElements, audit, undefined, unclassifiableRootCount),
        issueCodes: uniqueSorted(issueCodes),
        legacyComparison: emptyLegacyComparison(contexts.legacyMatches ? 'unavailable' : 'context-mismatch'),
      };
      return;
    }

    const originalBaseline = evaluateRuntimeShadowBaseline({
      breakpoint,
      cols,
      rootElements: input.rootElements,
      hasExplicitLayout: hasExplicit,
      explicitLayout: layout,
    });
    const reconciliation = hasExplicit && input.activeBreakpoint === breakpoint && input.activeReconciliation
      ? input.activeReconciliation
      : reconcileRuntimeShadowBaseline({
          enabled: input.reconciliationEnabled,
          breakpoint,
          cols,
          rootElements: input.rootElements,
          knownNonRootElements: input.knownNonRootElements,
          configurationCompleteness: input.configurationCompleteness,
          hasExplicitLayout: hasExplicit,
          explicitLayout: layout,
          originalBaseline,
          includeRawIds: false,
        });
    reconciliations[breakpoint] = reconciliation;
    const declarations = input.policyDeclarations?.[breakpoint] ?? LEGACY_DECLARATION;
    const trust = baselineTrust(
      input,
      breakpoint,
      diagnosticStatus,
      reconciliation,
      hasExplicit,
      declarations,
    );
    if (trust.issue) issueCodes.push(trust.issue);
    const result = resolveGridStructuralPolicy({
      scope: { kind: 'root' },
      breakpoint,
      cols,
      declarations,
      layoutState: policyLayoutState(completenessState, trust.lineageVerified),
      baselineTrust: trust.trust,
      baseline: layout,
      inventory,
    });
    policyResults[breakpoint] = result;
    issueCodes.push(...result.issues.map((issue) => issue.code));
    issueCodes.push(...reconciliation.remainingIssues);
    if (diagnosticStatus === 'limited') issueCodes.push('SNAPSHOT_NOT_AUTHORITATIVE');

    const structuralForComparison = hasExplicit ? (result.projection ?? result.baseline) : null;
    breakpointReports[breakpoint] = {
      scope: 'root',
      breakpoint,
      cols,
      hasExplicitLayout: hasExplicit,
      layoutCompleteness: completenessState,
      mode: result.mode,
      provenance: result.provenance,
      baselineQuality: trust.trust,
      policyStatus: result.status,
      diagnosticStatus,
      renderingAuthority: 'not-authorized',
      counts: sanitizedCounts(result, input.rootElements, audit, reconciliation, unclassifiableRootCount),
      issueCodes: uniqueSorted(issueCodes),
      legacyComparison: compareLegacy(
        structuralForComparison,
        input.legacyLayouts?.[breakpoint],
        contexts.legacyMatches,
      ),
    };
  });

  const context = {
    generation: input.structuralContext?.generation ?? null,
    revision: input.structuralContext?.revision ?? null,
    fingerprintSignature: input.structuralContext?.fingerprint
      ? hashValue('context', input.structuralContext.fingerprint)
      : null,
    snapshotState: input.snapshotState,
  } as const;
  const reportWithoutRuntimeFields = {
    version: GRID_STRUCTURAL_POLICY_SHADOW_REPORT_VERSION,
    scope: 'root' as const,
    context,
    diagnosticStatus: hasUnclassifiableRoot ? 'unavailable-inventory' as const : diagnosticStatus,
    renderingAuthority: 'not-authorized' as const,
    breakpoints: breakpointReports,
    issueCodes: uniqueSorted(DASHBOARD_GRID_BREAKPOINT_ORDER.flatMap(
      (breakpoint) => breakpointReports[breakpoint].issueCodes,
    )),
  };
  const report: GridStructuralPolicyShadowReport = {
    ...reportWithoutRuntimeFields,
    analysisMs: roundDuration(now() - startedAt),
    signature: reportSignature(input, reportWithoutRuntimeFields),
  };
  return { report, policyResults, reconciliations };
}
