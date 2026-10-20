import type { DashboardGridBreakpoint } from '../../../types/widgetTypeLayout';
import type { GridLayoutItem, GridLayoutMode } from './model';
import { solveLayout } from './solveLayout';

export type GridPlacementMode = GridLayoutMode;

export type GridPolicyProvenance =
  | 'user-explicit'
  | 'generated'
  | 'legacy-implicit'
  | 'structural-fallback';

export type GridScope =
  | Readonly<{ kind: 'root' }>
  | Readonly<{ kind: 'group'; id: string }>;

export type GridStructuralLayoutState =
  | 'explicit-complete'
  | 'explicit-partial'
  | 'missing'
  | 'derived-complete'
  | 'legacy-unverified';

export type GridStructuralBaselineTrust =
  | 'authoritative'
  | 'verified-derived'
  | 'reconciled-provisional'
  | 'unverified';

export type GridStructuralInventoryCompleteness =
  | 'verified-complete'
  | 'partial'
  | 'unknown';

export type GridStructuralInventoryState =
  | 'active'
  | 'verified-absent'
  | 'uncertain'
  | 'ambiguous';

export type GridStructuralElementKind = 'widget' | 'special-section' | 'stack-container';

export type GridPolicyDeclaration = Readonly<{
  /** Identifies the metadata source; it is never interpreted as a priority. */
  source: string;
  mode: GridPlacementMode | null;
  provenance: GridPolicyProvenance;
}>;

export type GridStructuralInventoryItem = Readonly<{
  id: string;
  state: GridStructuralInventoryState;
  kind: GridStructuralElementKind;
  /** Stable structural order, independent from array arrival order. */
  order: number;
}>;

export type GridStructuralInventory = Readonly<{
  completeness: GridStructuralInventoryCompleteness;
  items: readonly GridStructuralInventoryItem[];
}>;

export type GridStructuralPolicyIssueCode =
  | 'ACTIVE_ID_WITHOUT_GEOMETRY'
  | 'AMBIGUOUS_INVENTORY_ID'
  | 'BASELINE_COLLISION'
  | 'BREAKPOINT_LAYOUT_MISSING'
  | 'CONFLICTING_MODE_METADATA'
  | 'CONFLICTING_PROVENANCE_METADATA'
  | 'DUPLICATE_INVENTORY_ID'
  | 'DUPLICATE_INVENTORY_ORDER'
  | 'DUPLICATE_LAYOUT_ID'
  | 'EXCLUDED_BASELINE_COLLISION'
  | 'EXCLUDED_ITEM_INVALID_GEOMETRY'
  | 'EXCLUDED_ITEM_OUT_OF_BOUNDS'
  | 'EXPLICIT_LAYOUT_PARTIAL'
  | 'INVALID_COLUMNS'
  | 'INVALID_GROUP_SCOPE_ID'
  | 'INVALID_INVENTORY_ID'
  | 'INVALID_INVENTORY_ORDER'
  | 'INVALID_LAYOUT_GEOMETRY'
  | 'INVALID_LAYOUT_ID'
  | 'INVALID_POLICY_SOURCE'
  | 'LAYOUT_ITEM_OUT_OF_BOUNDS'
  | 'LAYOUT_STATE_MISMATCH'
  | 'LEGACY_LAYOUT_POLICY_CONFLICT'
  | 'LEGACY_MODE_MUST_BE_UNKNOWN'
  | 'LEGACY_POLICY_PRESERVED'
  | 'MODE_NOT_DECLARED'
  | 'PROJECTION_INVALID'
  | 'RECONCILED_PROVISIONAL_NOT_AUTHORITATIVE'
  | 'SOLVER_REJECTED'
  | 'UNCERTAIN_LAYOUT_ID'
  | 'UNVERIFIED_BASELINE'
  | 'VERIFIED_ABSENT_EXCLUDED';

export type GridStructuralPolicyIssue = Readonly<{
  code: GridStructuralPolicyIssueCode;
  severity: 'info' | 'warning' | 'error';
  message: string;
  id?: string;
  index?: number;
}>;

export type GridStructuralLayoutItemClassification = Readonly<{
  id: string;
  index: number;
  state: GridStructuralInventoryState;
  evidence:
    | 'explicit-inventory-entry'
    | 'verified-complete-inventory-omission'
    | 'inventory-not-authoritative';
  kind: GridStructuralElementKind | null;
}>;

export type GridStructuralExclusion = Readonly<{
  id: string;
  index: number;
  reason: 'verified-absent';
  evidence: GridStructuralLayoutItemClassification['evidence'];
}>;

export type GridStructuralInventoryReport = Readonly<{
  activeIds: readonly string[];
  verifiedAbsentIds: readonly string[];
  uncertainIds: readonly string[];
  ambiguousIds: readonly string[];
  activeWithoutGeometryIds: readonly string[];
  duplicateLayoutIds: readonly string[];
  duplicateInventoryIds: readonly string[];
  classifications: readonly GridStructuralLayoutItemClassification[];
}>;

export type GridStructuralPolicyStatus =
  | 'manual-projection'
  | 'automatic-projection'
  | 'legacy-preserved'
  | 'incomplete'
  | 'ambiguous'
  | 'invalid';

export type GridStructuralPolicyReliability =
  | 'authoritative'
  | 'verified-derived'
  | 'diagnostic'
  | 'unavailable';

export type GridStructuralPolicyResult = Readonly<{
  status: GridStructuralPolicyStatus;
  scope: GridScope;
  breakpoint: DashboardGridBreakpoint;
  cols: number;
  mode: GridPlacementMode | null;
  provenance: GridPolicyProvenance | null;
  layoutState: GridStructuralLayoutState;
  baselineTrust: GridStructuralBaselineTrust;
  reliability: GridStructuralPolicyReliability;
  /** Detached copy of the original structural data, including excluded IDs. */
  baseline: readonly GridLayoutItem[];
  /** Detached policy projection. It is never a new persisted baseline. */
  projection: readonly GridLayoutItem[] | null;
  exclusions: readonly GridStructuralExclusion[];
  inventory: GridStructuralInventoryReport;
  issues: readonly GridStructuralPolicyIssue[];
}>;

export type ResolveGridStructuralPolicyInput = Readonly<{
  scope: GridScope;
  breakpoint: DashboardGridBreakpoint;
  cols: number;
  declarations: readonly GridPolicyDeclaration[];
  layoutState: GridStructuralLayoutState;
  baselineTrust: GridStructuralBaselineTrust;
  baseline: readonly GridLayoutItem[];
  inventory: GridStructuralInventory;
}>;

type ResolvedPolicy = Readonly<{
  kind: 'resolved' | 'legacy' | 'incomplete' | 'ambiguous' | 'invalid';
  mode: GridPlacementMode | null;
  provenance: GridPolicyProvenance | null;
  issues: readonly GridStructuralPolicyIssue[];
}>;

type InventoryAudit = Readonly<{
  report: GridStructuralInventoryReport;
  exclusions: readonly GridStructuralExclusion[];
  excludedIndexes: ReadonlySet<number>;
  issues: readonly GridStructuralPolicyIssue[];
  ambiguous: boolean;
  incomplete: boolean;
}>;

function issue(
  code: GridStructuralPolicyIssueCode,
  severity: GridStructuralPolicyIssue['severity'],
  message: string,
  details: Pick<GridStructuralPolicyIssue, 'id' | 'index'> = {},
): GridStructuralPolicyIssue {
  return { code, severity, message, ...details };
}

function cloneLayout(layout: readonly GridLayoutItem[]) {
  return layout.map((item) => ({ ...item }));
}

function cloneScope(scope: GridScope): GridScope {
  return scope.kind === 'root' ? { kind: 'root' } : { kind: 'group', id: scope.id };
}

function compareIds(first: string, second: string) {
  if (first === second) return 0;
  return first < second ? -1 : 1;
}

function uniqueSorted(values: readonly string[]) {
  return [...new Set(values)].sort(compareIds);
}

function uniqueInOrder(values: readonly string[]) {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function isNonEmptyId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidGeometry(item: GridLayoutItem) {
  return [item.x, item.y, item.w, item.h].every(Number.isSafeInteger) &&
    item.x >= 0 && item.y >= 0 && item.w > 0 && item.h > 0;
}

function intersects(first: GridLayoutItem, second: GridLayoutItem) {
  return first.x < second.x + second.w &&
    first.x + first.w > second.x &&
    first.y < second.y + second.h &&
    first.y + first.h > second.y;
}

function resolvePolicy(declarations: readonly GridPolicyDeclaration[]): ResolvedPolicy {
  if (declarations.length === 0) {
    return {
      kind: 'incomplete',
      mode: null,
      provenance: null,
      issues: [issue('MODE_NOT_DECLARED', 'warning', 'No authoritative grid mode metadata was supplied.')],
    };
  }

  const invalidSources = declarations
    .map((declaration, index) => ({ declaration, index }))
    .filter(({ declaration }) => !isNonEmptyId(declaration.source));
  if (invalidSources.length > 0) {
    return {
      kind: 'invalid',
      mode: null,
      provenance: null,
      issues: invalidSources.map(({ index }) => issue(
        'INVALID_POLICY_SOURCE',
        'error',
        `declarations[${index}].source must be a non-empty string.`,
        { index },
      )),
    };
  }

  const modes = new Set(declarations.map((declaration) => declaration.mode ?? 'unknown'));
  const provenances = new Set(declarations.map((declaration) => declaration.provenance));
  const conflicts: GridStructuralPolicyIssue[] = [];
  if (modes.size > 1) {
    conflicts.push(issue(
      'CONFLICTING_MODE_METADATA',
      'error',
      'Policy sources disagree about the grid placement mode.',
    ));
  }
  if (provenances.size > 1) {
    conflicts.push(issue(
      'CONFLICTING_PROVENANCE_METADATA',
      'error',
      'Policy sources disagree about configuration provenance.',
    ));
  }
  if (conflicts.length > 0) {
    return { kind: 'ambiguous', mode: null, provenance: null, issues: conflicts };
  }

  const first = declarations[0]!;
  if (first.provenance === 'legacy-implicit') {
    if (first.mode !== null) {
      return {
        kind: 'ambiguous',
        mode: null,
        provenance: first.provenance,
        issues: [issue(
          'LEGACY_MODE_MUST_BE_UNKNOWN',
          'error',
          'Legacy implicit metadata cannot invent a manual or automatic choice.',
        )],
      };
    }
    return {
      kind: 'legacy',
      mode: null,
      provenance: first.provenance,
      issues: [issue(
        'LEGACY_POLICY_PRESERVED',
        'info',
        'The effective legacy layout path remains authoritative for rendering.',
      )],
    };
  }

  if (first.mode === null) {
    return {
      kind: 'incomplete',
      mode: null,
      provenance: first.provenance,
      issues: [issue(
        'MODE_NOT_DECLARED',
        'warning',
        'The supplied provenance does not declare an authoritative placement mode.',
      )],
    };
  }

  return {
    kind: 'resolved',
    mode: first.mode,
    provenance: first.provenance,
    issues: [],
  };
}

function auditInventory(
  baseline: readonly GridLayoutItem[],
  inventory: GridStructuralInventory,
): InventoryAudit {
  const issues: GridStructuralPolicyIssue[] = [];
  const entriesById = new Map<string, Array<{ item: GridStructuralInventoryItem; index: number }>>();
  const orders = new Map<number, string[]>();

  inventory.items.forEach((item, index) => {
    if (!isNonEmptyId(item.id)) {
      issues.push(issue(
        'INVALID_INVENTORY_ID',
        'error',
        `inventory.items[${index}].id must be a non-empty string.`,
        { index },
      ));
      return;
    }
    if (!Number.isSafeInteger(item.order) || item.order < 0) {
      issues.push(issue(
        'INVALID_INVENTORY_ORDER',
        'error',
        `Inventory order for ${item.id} must be a non-negative safe integer.`,
        { id: item.id, index },
      ));
    }
    const entries = entriesById.get(item.id) ?? [];
    entries.push({ item, index });
    entriesById.set(item.id, entries);
    const orderIds = orders.get(item.order) ?? [];
    orderIds.push(item.id);
    orders.set(item.order, orderIds);
  });

  const duplicateInventoryIds = [...entriesById.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([id]) => id)
    .sort(compareIds);
  duplicateInventoryIds.forEach((id) => issues.push(issue(
    'DUPLICATE_INVENTORY_ID',
    'error',
    `Inventory ID ${id} is declared more than once.`,
    { id },
  )));
  [...orders.entries()]
    .filter(([, ids]) => uniqueSorted(ids).length > 1)
    .forEach(([order, ids]) => issues.push(issue(
      'DUPLICATE_INVENTORY_ORDER',
      'error',
      `Inventory order ${order} is shared by ${uniqueSorted(ids).join(', ')}.`,
    )));

  const layoutIndexesById = new Map<string, number[]>();
  baseline.forEach((item, index) => {
    const indexes = layoutIndexesById.get(item.i) ?? [];
    indexes.push(index);
    layoutIndexesById.set(item.i, indexes);
  });
  const duplicateLayoutIds = [...layoutIndexesById.entries()]
    .filter(([, indexes]) => indexes.length > 1)
    .map(([id]) => id)
    .sort(compareIds);
  duplicateLayoutIds.forEach((id) => issues.push(issue(
    'DUPLICATE_LAYOUT_ID',
    'error',
    `Structural layout ID ${id} is duplicated.`,
    { id },
  )));

  const classifications = baseline.map((item, index): GridStructuralLayoutItemClassification => {
    const entries = entriesById.get(item.i) ?? [];
    if (entries.length === 1) {
      return {
        id: item.i,
        index,
        state: entries[0]!.item.state,
        evidence: 'explicit-inventory-entry',
        kind: entries[0]!.item.kind,
      };
    }
    if (entries.length > 1) {
      return {
        id: item.i,
        index,
        state: 'ambiguous',
        evidence: 'explicit-inventory-entry',
        kind: null,
      };
    }
    if (inventory.completeness === 'verified-complete') {
      return {
        id: item.i,
        index,
        state: 'verified-absent',
        evidence: 'verified-complete-inventory-omission',
        kind: null,
      };
    }
    return {
      id: item.i,
      index,
      state: 'uncertain',
      evidence: 'inventory-not-authoritative',
      kind: null,
    };
  });

  const exclusions = classifications
    .filter((classification) => classification.state === 'verified-absent')
    .map((classification): GridStructuralExclusion => ({
      id: classification.id,
      index: classification.index,
      reason: 'verified-absent',
      evidence: classification.evidence,
    }));
  exclusions.forEach((exclusion) => issues.push(issue(
    'VERIFIED_ABSENT_EXCLUDED',
    'info',
    `Verified absent ID ${exclusion.id} is excluded only from the detached projection.`,
    { id: exclusion.id, index: exclusion.index },
  )));

  const uncertainIds = uniqueSorted(classifications
    .filter((classification) => classification.state === 'uncertain')
    .map((classification) => classification.id));
  uncertainIds.forEach((id) => issues.push(issue(
    'UNCERTAIN_LAYOUT_ID',
    'error',
    `Structural ID ${id} cannot be classified by the supplied inventory.`,
    { id },
  )));
  const ambiguousIds = uniqueSorted([
    ...classifications
      .filter((classification) => classification.state === 'ambiguous')
      .map((classification) => classification.id),
    ...inventory.items.filter((item) => item.state === 'ambiguous').map((item) => item.id),
  ]);
  ambiguousIds.forEach((id) => issues.push(issue(
    'AMBIGUOUS_INVENTORY_ID',
    'error',
    `Inventory classification for ${id} is ambiguous.`,
    { id },
  )));

  const layoutIds = new Set(baseline.map((item) => item.i));
  const orderedActive = inventory.items
    .filter((item) => item.state === 'active')
    .sort((first, second) => first.order - second.order || compareIds(first.id, second.id));
  const activeWithoutGeometryIds = uniqueSorted(
    orderedActive.filter((item) => !layoutIds.has(item.id)).map((item) => item.id),
  );
  activeWithoutGeometryIds.forEach((id) => issues.push(issue(
    'ACTIVE_ID_WITHOUT_GEOMETRY',
    'error',
    `Active inventory ID ${id} has no structural geometry at this breakpoint.`,
    { id },
  )));

  const report: GridStructuralInventoryReport = {
    activeIds: uniqueInOrder(orderedActive.map((item) => item.id)),
    verifiedAbsentIds: uniqueSorted(classifications
      .filter((classification) => classification.state === 'verified-absent')
      .map((classification) => classification.id)),
    uncertainIds,
    ambiguousIds,
    activeWithoutGeometryIds,
    duplicateLayoutIds,
    duplicateInventoryIds,
    classifications,
  };

  return {
    report,
    exclusions,
    excludedIndexes: new Set(exclusions.map((exclusion) => exclusion.index)),
    issues,
    ambiguous: duplicateInventoryIds.length > 0 || ambiguousIds.length > 0 || uncertainIds.length > 0 ||
      issues.some((current) =>
        current.code === 'INVALID_INVENTORY_ID' ||
        current.code === 'INVALID_INVENTORY_ORDER' ||
        current.code === 'DUPLICATE_INVENTORY_ORDER'
      ),
    incomplete: activeWithoutGeometryIds.length > 0,
  };
}

function auditBaselineGeometry(
  baseline: readonly GridLayoutItem[],
  cols: number,
  excludedIndexes: ReadonlySet<number>,
) {
  const issues: GridStructuralPolicyIssue[] = [];
  const geometricallyValid: Array<{ item: GridLayoutItem; index: number }> = [];

  baseline.forEach((item, index) => {
    const excluded = excludedIndexes.has(index);
    if (!isNonEmptyId(item.i)) {
      issues.push(issue(
        'INVALID_LAYOUT_ID',
        'error',
        `baseline[${index}].i must be a non-empty string.`,
        { index },
      ));
      return;
    }
    if (!isValidGeometry(item)) {
      issues.push(issue(
        excluded ? 'EXCLUDED_ITEM_INVALID_GEOMETRY' : 'INVALID_LAYOUT_GEOMETRY',
        excluded ? 'warning' : 'error',
        `Structural item ${item.i} must use non-negative integer coordinates and positive integer spans.`,
        { id: item.i, index },
      ));
      return;
    }
    if (item.x + item.w > cols) {
      issues.push(issue(
        excluded ? 'EXCLUDED_ITEM_OUT_OF_BOUNDS' : 'LAYOUT_ITEM_OUT_OF_BOUNDS',
        excluded ? 'warning' : 'error',
        `Structural item ${item.i} exceeds the ${cols}-column grid.`,
        { id: item.i, index },
      ));
      return;
    }
    geometricallyValid.push({ item, index });
  });

  geometricallyValid.forEach((current, currentIndex) => {
    geometricallyValid.slice(0, currentIndex).forEach((previous) => {
      if (!intersects(current.item, previous.item)) return;
      const includesExcluded = excludedIndexes.has(current.index) || excludedIndexes.has(previous.index);
      issues.push(issue(
        includesExcluded ? 'EXCLUDED_BASELINE_COLLISION' : 'BASELINE_COLLISION',
        includesExcluded ? 'warning' : 'error',
        `Structural items ${previous.item.i} and ${current.item.i} overlap in the original baseline.`,
        { id: current.item.i, index: current.index },
      ));
    });
  });

  return issues;
}

function emptyInventoryReport(): GridStructuralInventoryReport {
  return {
    activeIds: [],
    verifiedAbsentIds: [],
    uncertainIds: [],
    ambiguousIds: [],
    activeWithoutGeometryIds: [],
    duplicateLayoutIds: [],
    duplicateInventoryIds: [],
    classifications: [],
  };
}

function reliabilityFor(
  trust: GridStructuralBaselineTrust,
  hasExclusions: boolean,
): GridStructuralPolicyReliability {
  if (trust === 'authoritative' && !hasExclusions) return 'authoritative';
  if (trust === 'verified-derived' && !hasExclusions) return 'verified-derived';
  return 'diagnostic';
}

function result(
  input: ResolveGridStructuralPolicyInput,
  fields: Pick<
    GridStructuralPolicyResult,
    'status' | 'mode' | 'provenance' | 'reliability' | 'projection' | 'exclusions' | 'inventory' | 'issues'
  >,
): GridStructuralPolicyResult {
  return {
    status: fields.status,
    scope: cloneScope(input.scope),
    breakpoint: input.breakpoint,
    cols: input.cols,
    mode: fields.mode,
    provenance: fields.provenance,
    layoutState: input.layoutState,
    baselineTrust: input.baselineTrust,
    reliability: fields.reliability,
    baseline: cloneLayout(input.baseline),
    projection: fields.projection ? cloneLayout(fields.projection) : null,
    exclusions: fields.exclusions.map((exclusion) => ({ ...exclusion })),
    inventory: {
      ...fields.inventory,
      activeIds: [...fields.inventory.activeIds],
      verifiedAbsentIds: [...fields.inventory.verifiedAbsentIds],
      uncertainIds: [...fields.inventory.uncertainIds],
      ambiguousIds: [...fields.inventory.ambiguousIds],
      activeWithoutGeometryIds: [...fields.inventory.activeWithoutGeometryIds],
      duplicateLayoutIds: [...fields.inventory.duplicateLayoutIds],
      duplicateInventoryIds: [...fields.inventory.duplicateInventoryIds],
      classifications: fields.inventory.classifications.map((classification) => ({ ...classification })),
    },
    issues: fields.issues.map((current) => ({ ...current })),
  };
}

/**
 * Resolves one structural scope and breakpoint without reading runtime state.
 * No result is persisted, rendered, or accepted as input to a later call.
 */
export function resolveGridStructuralPolicy(
  input: ResolveGridStructuralPolicyInput,
): GridStructuralPolicyResult {
  const baseIssues: GridStructuralPolicyIssue[] = [];
  if (!Number.isSafeInteger(input.cols) || input.cols < 1) {
    baseIssues.push(issue('INVALID_COLUMNS', 'error', 'cols must be a positive safe integer.'));
  }
  if (input.scope.kind === 'group' && !isNonEmptyId(input.scope.id)) {
    baseIssues.push(issue(
      'INVALID_GROUP_SCOPE_ID',
      'error',
      'A synthetic group scope requires a non-empty ID.',
    ));
  }
  if (baseIssues.length > 0) {
    return result(input, {
      status: 'invalid',
      mode: null,
      provenance: null,
      reliability: 'unavailable',
      projection: null,
      exclusions: [],
      inventory: emptyInventoryReport(),
      issues: baseIssues,
    });
  }

  const policy = resolvePolicy(input.declarations);
  const inventory = auditInventory(input.baseline, input.inventory);
  const geometryIssues = auditBaselineGeometry(input.baseline, input.cols, inventory.excludedIndexes);
  const issues = [...policy.issues, ...inventory.issues, ...geometryIssues];

  if (input.layoutState === 'legacy-unverified' && policy.kind !== 'legacy') {
    issues.push(issue(
      'LEGACY_LAYOUT_POLICY_CONFLICT',
      'error',
      'A legacy-unverified layout cannot be assigned a new mode without an approved metadata authority.',
    ));
    return result(input, {
      status: 'ambiguous',
      mode: null,
      provenance: policy.provenance,
      reliability: 'unavailable',
      projection: null,
      exclusions: inventory.exclusions,
      inventory: inventory.report,
      issues,
    });
  }

  if (policy.kind === 'invalid') {
    return result(input, {
      status: 'invalid',
      mode: null,
      provenance: policy.provenance,
      reliability: 'unavailable',
      projection: null,
      exclusions: inventory.exclusions,
      inventory: inventory.report,
      issues,
    });
  }
  if (policy.kind === 'ambiguous') {
    return result(input, {
      status: 'ambiguous',
      mode: null,
      provenance: policy.provenance,
      reliability: 'unavailable',
      projection: null,
      exclusions: inventory.exclusions,
      inventory: inventory.report,
      issues,
    });
  }
  if (policy.kind === 'legacy') {
    return result(input, {
      status: 'legacy-preserved',
      mode: null,
      provenance: 'legacy-implicit',
      reliability: 'diagnostic',
      projection: null,
      exclusions: inventory.exclusions,
      inventory: inventory.report,
      issues,
    });
  }

  const hasBlockingGeometryIssue = geometryIssues.some((current) => current.severity === 'error') ||
    inventory.report.duplicateLayoutIds.length > 0;
  if (hasBlockingGeometryIssue) {
    return result(input, {
      status: 'invalid',
      mode: policy.mode,
      provenance: policy.provenance,
      reliability: 'unavailable',
      projection: null,
      exclusions: inventory.exclusions,
      inventory: inventory.report,
      issues,
    });
  }
  if (inventory.ambiguous) {
    return result(input, {
      status: 'ambiguous',
      mode: policy.mode,
      provenance: policy.provenance,
      reliability: 'unavailable',
      projection: null,
      exclusions: inventory.exclusions,
      inventory: inventory.report,
      issues,
    });
  }

  if (input.layoutState === 'missing') {
    if (input.baseline.length > 0) {
      issues.push(issue(
        'LAYOUT_STATE_MISMATCH',
        'error',
        'A missing layout state cannot contain structural geometry.',
      ));
      return result(input, {
        status: 'invalid',
        mode: policy.mode,
        provenance: policy.provenance,
        reliability: 'unavailable',
        projection: null,
        exclusions: inventory.exclusions,
        inventory: inventory.report,
        issues,
      });
    }
    issues.push(issue(
      'BREAKPOINT_LAYOUT_MISSING',
      'warning',
      'No structural layout exists for this breakpoint; responsive derivation is intentionally deferred.',
    ));
  }
  if (input.layoutState === 'explicit-partial') {
    issues.push(issue(
      'EXPLICIT_LAYOUT_PARTIAL',
      'warning',
      'The explicit breakpoint layout is partial and will not be completed implicitly.',
    ));
  }
  if (policy.kind === 'incomplete' || inventory.incomplete ||
      input.layoutState === 'missing' || input.layoutState === 'explicit-partial') {
    return result(input, {
      status: 'incomplete',
      mode: policy.mode,
      provenance: policy.provenance,
      reliability: 'unavailable',
      projection: null,
      exclusions: inventory.exclusions,
      inventory: inventory.report,
      issues,
    });
  }

  if (input.baselineTrust === 'reconciled-provisional') {
    issues.push(issue(
      'RECONCILED_PROVISIONAL_NOT_AUTHORITATIVE',
      'warning',
      'A reconciled provisional baseline is suitable only for detached diagnostics.',
    ));
  } else if (input.baselineTrust === 'unverified') {
    issues.push(issue(
      'UNVERIFIED_BASELINE',
      'warning',
      'The structural baseline has not been verified by an authoritative source.',
    ));
  }

  const activeProjection = input.baseline
    .filter((_, index) => !inventory.excludedIndexes.has(index))
    .map((item) => ({ ...item }));
  let projection: readonly GridLayoutItem[];
  if (policy.mode === 'manual') {
    projection = activeProjection;
  } else {
    try {
      projection = solveLayout({
        items: activeProjection,
        cols: input.cols,
        mode: 'automatic',
        intent: { type: 'COMPACT' },
      });
    } catch {
      issues.push(issue(
        'SOLVER_REJECTED',
        'error',
        'The existing deterministic solver rejected the structural projection.',
      ));
      return result(input, {
        status: 'invalid',
        mode: policy.mode,
        provenance: policy.provenance,
        reliability: 'unavailable',
        projection: null,
        exclusions: inventory.exclusions,
        inventory: inventory.report,
        issues,
      });
    }
  }

  const projectionIssues = auditBaselineGeometry(projection, input.cols, new Set());
  if (projectionIssues.some((current) => current.severity === 'error')) {
    issues.push(issue(
      'PROJECTION_INVALID',
      'error',
      'The derived structural projection failed geometry validation.',
    ));
    issues.push(...projectionIssues);
    return result(input, {
      status: 'invalid',
      mode: policy.mode,
      provenance: policy.provenance,
      reliability: 'unavailable',
      projection: null,
      exclusions: inventory.exclusions,
      inventory: inventory.report,
      issues,
    });
  }

  return result(input, {
    status: policy.mode === 'manual' ? 'manual-projection' : 'automatic-projection',
    mode: policy.mode,
    provenance: policy.provenance,
    reliability: reliabilityFor(input.baselineTrust, inventory.exclusions.length > 0),
    projection,
    exclusions: inventory.exclusions,
    inventory: inventory.report,
    issues,
  });
}
