import {
  DASHBOARD_GRID_BREAKPOINT_ORDER,
  type DashboardGridBreakpoint,
} from '../../../types/widgetTypeLayout';
import type { GridLayoutItem, GridLayoutMode } from './model';

export const GRID_ENGINE_DRAFT_CHANGE_SET_VERSION = 1 as const;

export type GridEngineDraftBaselineState = 'complete' | 'provisional' | 'missing';
export type GridEngineDraftGeometryOrigin = 'editor-effective' | 'draft-explicit' | 'missing';
export type GridEngineDraftOperation = 'MOVE' | 'RESIZE' | 'REORDER' | 'COMPACT' | 'UNKNOWN';
export type GridEngineDraftOperationHint = GridEngineDraftOperation | 'RUNTIME_RESIZE';

export type GridEngineDraftSourceIdentity = Readonly<{
  editSessionId: string | null;
  draftFingerprint: string;
  inventoryFingerprint: string;
  structuralGeneration: number;
  structuralRevision: number | null;
  structuralFingerprint: string | null;
}>;

export type GridEngineDraftInventoryEntry = Readonly<{
  id: string;
  title: string;
  role: 'root-widget' | 'stack-root' | 'special-section' | 'stack-child' | 'orphan-child';
  constraints?: Readonly<{
    minW?: number;
    maxW?: number;
    minH?: number;
    maxH?: number;
  }>;
}>;

export type GridEngineDraftBreakpointInput = Readonly<{
  breakpoint: DashboardGridBreakpoint;
  cols: number;
  before: readonly GridLayoutItem[] | null;
  after: readonly GridLayoutItem[] | null;
  mode: GridLayoutMode;
  origin: GridEngineDraftGeometryOrigin;
  baselineState: GridEngineDraftBaselineState;
  explicitOverride: boolean;
  operationHint?: GridEngineDraftOperationHint;
}>;

export type GridEngineDraftIssueCode =
  | 'DUPLICATE_INVENTORY_ID'
  | 'DUPLICATE_ROOT'
  | 'MISSING_ROOT'
  | 'UNKNOWN_ROOT'
  | 'STACK_CHILD_PROMOTED'
  | 'ORPHAN_CHILD_PROMOTED'
  | 'INVALID_NUMBER'
  | 'INVALID_DIMENSION'
  | 'OUT_OF_BOUNDS'
  | 'COLLISION'
  | 'MIN_CONSTRAINT_VIOLATION'
  | 'MAX_CONSTRAINT_VIOLATION'
  | 'BREAKPOINT_MISSING'
  | 'BASELINE_PROVISIONAL'
  | 'SOURCE_GEOMETRY_INCOMPLETE'
  | 'UNEXPECTED_BREAKPOINT'
  | 'RUNTIME_GEOMETRY_NOT_STRUCTURAL'
  | 'EDIT_SESSION_CHANGED'
  | 'INVENTORY_CHANGED'
  | 'DRAFT_CHANGED_CONCURRENTLY'
  | 'STRUCTURAL_SNAPSHOT_STALE'
  | 'STRUCTURAL_AUTHORITY_NOT_AVAILABLE';

export type GridEngineDraftIssue = Readonly<{
  code: GridEngineDraftIssueCode;
  classification: 'inventory' | 'geometry' | 'responsive' | 'source' | 'authority';
  message: string;
  breakpoint?: DashboardGridBreakpoint;
  rootId?: string;
  relatedRootId?: string;
}>;

export type GridEngineDraftChange = Readonly<{
  rootId: string;
  title: string;
  breakpoint: DashboardGridBreakpoint;
  before: GridLayoutItem;
  after: GridLayoutItem;
  operation: GridEngineDraftOperation;
  mode: GridLayoutMode;
  origin: GridEngineDraftGeometryOrigin;
  baselineState: GridEngineDraftBaselineState;
  explicitOverride: boolean;
  validationIssues: readonly GridEngineDraftIssueCode[];
}>;

export type GridEngineDraftChangeSet = Readonly<{
  version: typeof GRID_ENGINE_DRAFT_CHANGE_SET_VERSION;
  sourceIdentity: GridEngineDraftSourceIdentity;
  changes: readonly GridEngineDraftChange[];
  changedRootCount: number;
  affectedBreakpoints: readonly DashboardGridBreakpoint[];
  modes: readonly GridLayoutMode[];
  issues: readonly GridEngineDraftIssue[];
  applicability: Readonly<{
    geometricallyValid: boolean;
    previewable: boolean;
    sourceCompatible: boolean;
    applicableToDraft: false;
    saveToHomeAssistantAvailable: false;
    state:
      | 'no-changes'
      | 'blocked-invalid'
      | 'blocked-conflict'
      | 'blocked-incomplete-source'
      | 'blocked-no-authority';
    reasons: readonly GridEngineDraftIssueCode[];
  }>;
}>;

export type CreateGridEngineDraftChangeSetInput = Readonly<{
  sourceIdentity: GridEngineDraftSourceIdentity;
  currentSourceIdentity: GridEngineDraftSourceIdentity;
  inventory: readonly GridEngineDraftInventoryEntry[];
  breakpoints: readonly GridEngineDraftBreakpointInput[];
  authority: Readonly<{
    source: 'structural-policy-v1';
    renderingAuthority: 'not-authorized';
    reasonCodes?: readonly string[];
  }> | null;
}>;

export type GridEngineDraftReviewContext = Readonly<{
  sourceIdentity: GridEngineDraftSourceIdentity;
  currentSourceIdentity: GridEngineDraftSourceIdentity;
  inventory: readonly GridEngineDraftInventoryEntry[];
  breakpoints: Readonly<Record<DashboardGridBreakpoint, Readonly<{
    origin: GridEngineDraftGeometryOrigin;
    baselineState: GridEngineDraftBaselineState;
  }>>>;
  authority: CreateGridEngineDraftChangeSetInput['authority'];
}>;

const BREAKPOINT_INDEX = new Map(
  DASHBOARD_GRID_BREAKPOINT_ORDER.map((breakpoint, index) => [breakpoint, index]),
);

const ROOT_ROLES = new Set<GridEngineDraftInventoryEntry['role']>([
  'root-widget',
  'stack-root',
  'special-section',
]);

const GEOMETRY_ISSUES = new Set<GridEngineDraftIssueCode>([
  'DUPLICATE_INVENTORY_ID',
  'DUPLICATE_ROOT',
  'MISSING_ROOT',
  'UNKNOWN_ROOT',
  'STACK_CHILD_PROMOTED',
  'ORPHAN_CHILD_PROMOTED',
  'INVALID_NUMBER',
  'INVALID_DIMENSION',
  'OUT_OF_BOUNDS',
  'COLLISION',
  'MIN_CONSTRAINT_VIOLATION',
  'MAX_CONSTRAINT_VIOLATION',
  'RUNTIME_GEOMETRY_NOT_STRUCTURAL',
]);

const CONFLICT_ISSUES = new Set<GridEngineDraftIssueCode>([
  'EDIT_SESSION_CHANGED',
  'INVENTORY_CHANGED',
  'DRAFT_CHANGED_CONCURRENTLY',
  'STRUCTURAL_SNAPSHOT_STALE',
]);

const INCOMPLETE_SOURCE_ISSUES = new Set<GridEngineDraftIssueCode>([
  'BREAKPOINT_MISSING',
  'BASELINE_PROVISIONAL',
  'SOURCE_GEOMETRY_INCOMPLETE',
  'UNEXPECTED_BREAKPOINT',
]);

function cloneItem(item: GridLayoutItem): GridLayoutItem {
  return { i: item.i, x: item.x, y: item.y, w: item.w, h: item.h };
}

function sameGeometry(left: GridLayoutItem, right: GridLayoutItem) {
  return left.x === right.x
    && left.y === right.y
    && left.w === right.w
    && left.h === right.h;
}

function intersects(left: GridLayoutItem, right: GridLayoutItem) {
  return left.x < right.x + right.w
    && left.x + left.w > right.x
    && left.y < right.y + right.h
    && left.y + left.h > right.y;
}

function issue(
  code: GridEngineDraftIssueCode,
  classification: GridEngineDraftIssue['classification'],
  message: string,
  context: Pick<GridEngineDraftIssue, 'breakpoint' | 'rootId' | 'relatedRootId'> = {},
): GridEngineDraftIssue {
  return { code, classification, message, ...context };
}

function inferOperation(
  before: GridLayoutItem,
  after: GridLayoutItem,
  hint: GridEngineDraftOperationHint | undefined,
): GridEngineDraftOperation {
  if (before.w !== after.w || before.h !== after.h) return 'RESIZE';
  if (hint === 'MOVE' || hint === 'REORDER' || hint === 'COMPACT') return hint;
  if (hint === 'RESIZE') return 'RESIZE';
  if (before.x !== after.x || before.y !== after.y) return 'MOVE';
  return 'UNKNOWN';
}

function validateLayout(
  layout: readonly GridLayoutItem[],
  phase: 'initiale' | 'proposta',
  breakpointInput: GridEngineDraftBreakpointInput,
  inventoryById: ReadonlyMap<string, GridEngineDraftInventoryEntry>,
  expectedRootIds: ReadonlySet<string>,
) {
  const issues: GridEngineDraftIssue[] = [];
  const seen = new Set<string>();
  const uniqueItems: GridLayoutItem[] = [];

  for (const item of layout) {
    const context = { breakpoint: breakpointInput.breakpoint, rootId: item.i };
    if (seen.has(item.i)) {
      issues.push(issue(
        'DUPLICATE_ROOT',
        'inventory',
        `Il layout ${phase} contiene piu volte il root ${item.i}.`,
        context,
      ));
      continue;
    }
    seen.add(item.i);
    uniqueItems.push(item);

    const inventoryEntry = inventoryById.get(item.i);
    if (!inventoryEntry) {
      issues.push(issue('UNKNOWN_ROOT', 'inventory', `Il root ${item.i} non appartiene all'inventario acquisito.`, context));
    } else if (inventoryEntry.role === 'stack-child') {
      issues.push(issue('STACK_CHILD_PROMOTED', 'inventory', `Il figlio Stack ${item.i} e stato promosso a root.`, context));
    } else if (inventoryEntry.role === 'orphan-child') {
      issues.push(issue('ORPHAN_CHILD_PROMOTED', 'inventory', `Il figlio orfano ${item.i} e stato promosso a root.`, context));
    }

    const values = [item.x, item.y, item.w, item.h];
    if (!values.every((value) => Number.isFinite(value) && Number.isInteger(value))) {
      issues.push(issue('INVALID_NUMBER', 'geometry', `La geometria di ${item.i} deve usare interi finiti.`, context));
    }
    if (item.w < 1 || item.h < 1) {
      issues.push(issue('INVALID_DIMENSION', 'geometry', `Le dimensioni di ${item.i} devono essere positive.`, context));
    }
    if (item.x < 0 || item.y < 0 || item.x + item.w > breakpointInput.cols) {
      issues.push(issue('OUT_OF_BOUNDS', 'geometry', `Il root ${item.i} supera i limiti di ${breakpointInput.cols} colonne.`, context));
    }

    const constraints = inventoryEntry?.constraints;
    if (
      constraints
      && ((constraints.minW !== undefined && item.w < constraints.minW)
        || (constraints.minH !== undefined && item.h < constraints.minH))
    ) {
      issues.push(issue('MIN_CONSTRAINT_VIOLATION', 'geometry', `Il root ${item.i} viola un vincolo minimo.`, context));
    }
    if (
      constraints
      && ((constraints.maxW !== undefined && item.w > constraints.maxW)
        || (constraints.maxH !== undefined && item.h > constraints.maxH))
    ) {
      issues.push(issue('MAX_CONSTRAINT_VIOLATION', 'geometry', `Il root ${item.i} viola un vincolo massimo.`, context));
    }
  }

  for (const rootId of expectedRootIds) {
    if (!seen.has(rootId)) {
      issues.push(issue(
        'MISSING_ROOT',
        'inventory',
        `Il root ${rootId} manca dal layout ${phase}.`,
        { breakpoint: breakpointInput.breakpoint, rootId },
      ));
    }
  }

  for (let first = 0; first < uniqueItems.length; first += 1) {
    for (let second = first + 1; second < uniqueItems.length; second += 1) {
      const left = uniqueItems[first];
      const right = uniqueItems[second];
      if (intersects(left, right)) {
        issues.push(issue(
          'COLLISION',
          'geometry',
          `I root ${left.i} e ${right.i} si sovrappongono nel layout ${phase}.`,
          { breakpoint: breakpointInput.breakpoint, rootId: left.i, relatedRootId: right.i },
        ));
      }
    }
  }
  return issues;
}

function validationCodesForChange(
  issues: readonly GridEngineDraftIssue[],
  breakpoint: DashboardGridBreakpoint,
  rootId: string,
) {
  return [...new Set(issues.filter((entry) => (
    entry.breakpoint === breakpoint
      && (entry.rootId === rootId || entry.relatedRootId === rootId)
  )).map((entry) => entry.code))];
}

function sourceIssues(
  source: GridEngineDraftSourceIdentity,
  current: GridEngineDraftSourceIdentity,
) {
  const issues: GridEngineDraftIssue[] = [];
  if (!source.editSessionId || source.editSessionId !== current.editSessionId) {
    issues.push(issue('EDIT_SESSION_CHANGED', 'source', 'La sessione Edit Mode non coincide con quella acquisita.'));
  }
  if (source.inventoryFingerprint !== current.inventoryFingerprint) {
    issues.push(issue('INVENTORY_CHANGED', 'source', 'L inventario dell editor e cambiato durante la sessione sperimentale.'));
  }
  if (source.draftFingerprint !== current.draftFingerprint) {
    issues.push(issue('DRAFT_CHANGED_CONCURRENTLY', 'source', 'Il draft React e cambiato dopo l apertura della sessione.'));
  }
  if (
    source.structuralGeneration !== current.structuralGeneration
    || source.structuralRevision !== current.structuralRevision
    || source.structuralFingerprint !== current.structuralFingerprint
  ) {
    issues.push(issue('STRUCTURAL_SNAPSHOT_STALE', 'source', 'La snapshot strutturale di partenza non e piu corrente.'));
  }
  return issues;
}

export function createGridEngineDraftChangeSet(
  input: CreateGridEngineDraftChangeSetInput,
): GridEngineDraftChangeSet {
  const issues: GridEngineDraftIssue[] = [];
  const inventoryById = new Map<string, GridEngineDraftInventoryEntry>();
  const duplicateInventoryIds = new Set<string>();
  for (const entry of input.inventory) {
    if (inventoryById.has(entry.id)) duplicateInventoryIds.add(entry.id);
    else inventoryById.set(entry.id, entry);
  }
  for (const id of [...duplicateInventoryIds].sort()) {
    issues.push(issue('DUPLICATE_INVENTORY_ID', 'inventory', `L inventario acquisito contiene piu volte ${id}.`, { rootId: id }));
  }
  const expectedRootIds = new Set(
    input.inventory.filter((entry) => ROOT_ROLES.has(entry.role)).map((entry) => entry.id),
  );
  const changes: GridEngineDraftChange[] = [];
  const suppliedBreakpoints = new Set<DashboardGridBreakpoint>();
  const orderedBreakpoints = [...input.breakpoints].sort((left, right) => (
    (BREAKPOINT_INDEX.get(left.breakpoint) ?? Number.MAX_SAFE_INTEGER)
      - (BREAKPOINT_INDEX.get(right.breakpoint) ?? Number.MAX_SAFE_INTEGER)
  ));

  for (const breakpointInput of orderedBreakpoints) {
    if (suppliedBreakpoints.has(breakpointInput.breakpoint)) {
      issues.push(issue(
        'UNEXPECTED_BREAKPOINT',
        'responsive',
        `Il breakpoint ${breakpointInput.breakpoint} e stato fornito piu volte.`,
        { breakpoint: breakpointInput.breakpoint },
      ));
      continue;
    }
    suppliedBreakpoints.add(breakpointInput.breakpoint);

    if (breakpointInput.baselineState === 'missing' || breakpointInput.before === null) {
      issues.push(issue(
        'BREAKPOINT_MISSING',
        'responsive',
        `Il breakpoint ${breakpointInput.breakpoint} non ha una baseline strutturale.`,
        { breakpoint: breakpointInput.breakpoint },
      ));
      continue;
    }
    if (breakpointInput.baselineState === 'provisional') {
      issues.push(issue(
        'BASELINE_PROVISIONAL',
        'responsive',
        `La baseline ${breakpointInput.breakpoint} e provisional e non e promuovibile.`,
        { breakpoint: breakpointInput.breakpoint },
      ));
    }
    if (breakpointInput.origin === 'missing') {
      issues.push(issue(
        'SOURCE_GEOMETRY_INCOMPLETE',
        'responsive',
        `L origine geometrica ${breakpointInput.breakpoint} non e disponibile.`,
        { breakpoint: breakpointInput.breakpoint },
      ));
    }
    if (breakpointInput.after === null) {
      issues.push(issue(
        'SOURCE_GEOMETRY_INCOMPLETE',
        'responsive',
        `La proposta ${breakpointInput.breakpoint} non contiene geometria.`,
        { breakpoint: breakpointInput.breakpoint },
      ));
      continue;
    }
    if (breakpointInput.operationHint === 'RUNTIME_RESIZE') {
      issues.push(issue(
        'RUNTIME_GEOMETRY_NOT_STRUCTURAL',
        'geometry',
        `Una espansione runtime non puo diventare geometria strutturale in ${breakpointInput.breakpoint}.`,
        { breakpoint: breakpointInput.breakpoint },
      ));
    }

    issues.push(...validateLayout(
      breakpointInput.before,
      'initiale',
      breakpointInput,
      inventoryById,
      expectedRootIds,
    ));
    issues.push(...validateLayout(
      breakpointInput.after,
      'proposta',
      breakpointInput,
      inventoryById,
      expectedRootIds,
    ));

    const beforeById = new Map<string, GridLayoutItem>();
    for (const item of breakpointInput.before) {
      if (!beforeById.has(item.i)) beforeById.set(item.i, item);
    }
    const afterById = new Map<string, GridLayoutItem>();
    for (const item of breakpointInput.after) {
      if (!afterById.has(item.i)) afterById.set(item.i, item);
    }
    for (const rootId of [...expectedRootIds].sort()) {
      const before = beforeById.get(rootId);
      const after = afterById.get(rootId);
      if (!before || !after || sameGeometry(before, after)) continue;
      const inventoryEntry = inventoryById.get(rootId);
      changes.push({
        rootId,
        title: inventoryEntry?.title ?? rootId,
        breakpoint: breakpointInput.breakpoint,
        before: cloneItem(before),
        after: cloneItem(after),
        operation: inferOperation(before, after, breakpointInput.operationHint),
        mode: breakpointInput.mode,
        origin: breakpointInput.origin,
        baselineState: breakpointInput.baselineState,
        explicitOverride: breakpointInput.explicitOverride,
        validationIssues: [],
      });
    }
  }

  for (const breakpoint of DASHBOARD_GRID_BREAKPOINT_ORDER) {
    if (!suppliedBreakpoints.has(breakpoint)) {
      issues.push(issue(
        'UNEXPECTED_BREAKPOINT',
        'responsive',
        `Il change set non descrive il breakpoint previsto ${breakpoint}.`,
        { breakpoint },
      ));
    }
  }
  issues.push(...sourceIssues(input.sourceIdentity, input.currentSourceIdentity));
  issues.push(issue(
    'STRUCTURAL_AUTHORITY_NOT_AVAILABLE',
    'authority',
    input.authority?.renderingAuthority === 'not-authorized'
      ? 'La Structural Policy V1 non autorizza ancora il trasferimento al draft operativo.'
      : 'Non e disponibile un contratto di autorita strutturale per il trasferimento al draft.',
  ));

  const decoratedChanges = changes.map((change) => ({
    ...change,
    validationIssues: validationCodesForChange(issues, change.breakpoint, change.rootId),
  }));
  const changedRootCount = new Set(decoratedChanges.map((change) => change.rootId)).size;
  const affectedBreakpoints = DASHBOARD_GRID_BREAKPOINT_ORDER.filter((breakpoint) => (
    decoratedChanges.some((change) => change.breakpoint === breakpoint)
  ));
  const modes = (['manual', 'automatic'] as const).filter((mode) => (
    decoratedChanges.some((change) => change.mode === mode)
  ));
  const reasons = [...new Set(issues.map((entry) => entry.code))];
  const geometricallyValid = !issues.some((entry) => GEOMETRY_ISSUES.has(entry.code));
  const sourceCompatible = !issues.some((entry) => CONFLICT_ISSUES.has(entry.code));
  const hasIncompleteSource = issues.some((entry) => INCOMPLETE_SOURCE_ISSUES.has(entry.code));
  const state = decoratedChanges.length === 0
    ? 'no-changes' as const
    : !sourceCompatible
      ? 'blocked-conflict' as const
      : !geometricallyValid
        ? 'blocked-invalid' as const
        : hasIncompleteSource
          ? 'blocked-incomplete-source' as const
          : 'blocked-no-authority' as const;

  return {
    version: GRID_ENGINE_DRAFT_CHANGE_SET_VERSION,
    sourceIdentity: { ...input.sourceIdentity },
    changes: decoratedChanges,
    changedRootCount,
    affectedBreakpoints,
    modes,
    issues,
    applicability: {
      geometricallyValid,
      previewable: decoratedChanges.length > 0 && geometricallyValid,
      sourceCompatible,
      applicableToDraft: false,
      saveToHomeAssistantAvailable: false,
      state,
      reasons,
    },
  };
}
