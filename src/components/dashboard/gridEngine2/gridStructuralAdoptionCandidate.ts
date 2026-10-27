import {
  DASHBOARD_GRID_BREAKPOINT_ORDER,
  type DashboardGridBreakpoint,
} from '../../../types/widgetTypeLayout';
import type { GridEngineDraftSourceIdentity } from './gridEngineDraftChangeSet';
import type { GridLayoutItem, GridLayoutMode } from './model';

export const GRID_STRUCTURAL_ADOPTION_CANDIDATE_VERSION = 1 as const;

export type GridStructuralAdoptionSourceIdentity = GridEngineDraftSourceIdentity;
export type GridStructuralAdoptionBaselineState = 'complete' | 'provisional' | 'missing';
export type GridStructuralAdoptionGeometrySource =
  | 'editor-effective'
  | 'draft-explicit'
  | 'missing';

export type GridStructuralAdoptionInventoryEntry = Readonly<{
  id: string;
  title: string;
  kind: string;
  role: 'root-widget' | 'stack-root' | 'special-section' | 'stack-child' | 'orphan-child';
  parentId: string | null;
  constraints?: Readonly<{
    minW?: number;
    maxW?: number;
    minH?: number;
    maxH?: number;
  }>;
}>;

export type GridStructuralAdoptionBreakpointInput = Readonly<{
  breakpoint: DashboardGridBreakpoint;
  cols: number;
  baselineState: GridStructuralAdoptionBaselineState;
  geometrySource: GridStructuralAdoptionGeometrySource;
  /** The responsive grid-cell geometry actually supplied to the legacy renderer. */
  operationalGeometry: readonly GridLayoutItem[] | null;
  draftExplicitGeometry: readonly GridLayoutItem[] | null;
  persistedExplicitGeometry: readonly GridLayoutItem[] | null;
}>;

export type GridStructuralAdoptionIssueCode =
  | 'NO_BREAKPOINT_SELECTED'
  | 'DUPLICATE_BREAKPOINT'
  | 'BREAKPOINT_MISSING'
  | 'BASELINE_PROVISIONAL'
  | 'EDITOR_GEOMETRY_MISSING'
  | 'DUPLICATE_INVENTORY_ID'
  | 'MISSING_ROOT'
  | 'DUPLICATE_ROOT'
  | 'UNKNOWN_ROOT'
  | 'STACK_CHILD_PROMOTED'
  | 'ORPHAN_CHILD_PROMOTED'
  | 'ORPHAN_INVENTORY_ENTRY'
  | 'LEGACY_EXTRA_ID_PRESERVED'
  | 'INVALID_NUMBER'
  | 'INVALID_DIMENSION'
  | 'OUT_OF_BOUNDS'
  | 'MIN_CONSTRAINT_VIOLATION'
  | 'MAX_CONSTRAINT_VIOLATION'
  | 'LEGACY_SOURCE_COLLISION'
  | 'CANDIDATE_COLLISION'
  | 'CANDIDATE_SOURCE_DIVERGENCE'
  | 'LEGACY_TRANSFORMATION_OBSERVED'
  | 'RUNTIME_SPAN_UNRESOLVED'
  | 'STRUCTURAL_CONSTRAINTS_INCOMPLETE'
  | 'EDIT_SESSION_CHANGED'
  | 'INVENTORY_CHANGED'
  | 'DRAFT_CHANGED_CONCURRENTLY'
  | 'STRUCTURAL_SNAPSHOT_STALE'
  | 'STRUCTURAL_AUTHORITY_NOT_AVAILABLE'
  | 'DRAFT_APPLICATION_ADAPTER_NOT_AVAILABLE';

export type GridStructuralAdoptionIssue = Readonly<{
  code: GridStructuralAdoptionIssueCode;
  classification: 'inventory' | 'legacy-source' | 'candidate' | 'responsive' | 'runtime' | 'source' | 'authority';
  severity: 'information' | 'warning' | 'error';
  message: string;
  breakpoint?: DashboardGridBreakpoint;
  rootId?: string;
  relatedRootId?: string;
}>;

export type GridStructuralAdoptionRootComparison = Readonly<{
  rootId: string;
  title: string;
  kind: string;
  role: 'root-widget' | 'stack-root' | 'special-section';
  operational: GridLayoutItem | null;
  candidate: GridLayoutItem | null;
  draftExplicit: GridLayoutItem | null;
  persistedExplicit: GridLayoutItem | null;
  candidateMatchesOperational: boolean;
  draftComparison: 'aligned' | 'different' | 'missing';
  persistedComparison: 'aligned' | 'different' | 'missing';
  runtimeSpan: 'not-observed' | 'aligned-with-draft' | 'different-from-draft-unresolved';
}>;

export type GridStructuralAdoptionBreakpointCandidate = Readonly<{
  breakpoint: DashboardGridBreakpoint;
  cols: number;
  baselineState: GridStructuralAdoptionBaselineState;
  geometrySource: 'editor-effective-observation' | 'unavailable';
  provenance: Readonly<{
    persisted: 'explicit' | 'missing';
    draft: 'explicit' | 'missing';
    operational: 'legacy-renderer-effective' | 'missing';
    candidate: 'exact-operational-root-copy' | 'missing';
    responsiveFallback:
      | 'not-observed'
      | 'operational-without-explicit-layout'
      | 'not-independently-classified';
  }>;
  operationalGeometry: readonly GridLayoutItem[] | null;
  candidateGeometry: readonly GridLayoutItem[] | null;
  draftExplicitGeometry: readonly GridLayoutItem[] | null;
  persistedExplicitGeometry: readonly GridLayoutItem[] | null;
  rootComparisons: readonly GridStructuralAdoptionRootComparison[];
  preservedLegacyExtraIds: readonly string[];
  candidateMatchesOperational: boolean;
  geometryMutationCount: 0;
  compactionApplied: false;
  eligibility: 'candidate-ready' | 'candidate-with-warnings' | 'blocked-missing' | 'blocked-invalid';
  structuralVerification: 'verified' | 'incomplete' | 'blocked';
  issues: readonly GridStructuralAdoptionIssue[];
}>;

export type GridStructuralAdoptionCandidateV1 = Readonly<{
  version: typeof GRID_STRUCTURAL_ADOPTION_CANDIDATE_VERSION;
  candidateSignature: string;
  editSessionId: string | null;
  sourceIdentity: GridStructuralAdoptionSourceIdentity;
  structuralReference: Readonly<{
    generation: number;
    revision: number | null;
    fingerprint: string | null;
  }>;
  inventory: Readonly<{
    rootCount: number;
    roots: readonly GridStructuralAdoptionInventoryEntry[];
    nonRoots: readonly GridStructuralAdoptionInventoryEntry[];
    fingerprint: string;
  }>;
  modeChoice: Readonly<{
    mode: GridLayoutMode;
    source: 'explicit-user-choice';
    transformationApplied: false;
  }>;
  breakpoints: readonly GridStructuralAdoptionBreakpointCandidate[];
  responsiveCompleteness: 'complete' | 'partial-selection' | 'incomplete';
  lifecycle: 'prepared' | 'acknowledged' | 'invalidated';
  acknowledgement: Readonly<{
    status: 'not-acknowledged' | 'acknowledged';
    meaning: 'intent-only';
  }>;
  structuralVerification: Readonly<{
    status: 'verified' | 'incomplete' | 'blocked';
    reasonCodes: readonly GridStructuralAdoptionIssueCode[];
  }>;
  applicationAuthorization: Readonly<{
    status: 'not-authorized';
    renderingAuthority: 'not-authorized';
    draftApplicationAvailable: false;
    saveToHomeAssistantAvailable: false;
    reasonCodes: readonly string[];
  }>;
  preparation: Readonly<{
    geometryMutationCount: 0;
    compactionApplied: false;
    storageWrites: false;
    homeAssistantWrites: false;
  }>;
  issues: readonly GridStructuralAdoptionIssue[];
}>;

export type CreateGridStructuralAdoptionCandidateInput = Readonly<{
  sourceIdentity: GridStructuralAdoptionSourceIdentity;
  currentSourceIdentity: GridStructuralAdoptionSourceIdentity;
  inventory: readonly GridStructuralAdoptionInventoryEntry[];
  legacyExtraIds: readonly string[];
  breakpoints: readonly GridStructuralAdoptionBreakpointInput[];
  selectedBreakpoints: readonly DashboardGridBreakpoint[];
  mode: GridLayoutMode;
  authority: Readonly<{
    source: 'structural-policy-v1';
    renderingAuthority: 'not-authorized';
    reasonCodes?: readonly string[];
  }> | null;
}>;

const ROOT_ROLES = new Set<GridStructuralAdoptionInventoryEntry['role']>([
  'root-widget',
  'stack-root',
  'special-section',
]);
const BREAKPOINT_INDEX = new Map(
  DASHBOARD_GRID_BREAKPOINT_ORDER.map((breakpoint, index) => [breakpoint, index]),
);

function cloneItem(item: GridLayoutItem): GridLayoutItem {
  return { i: item.i, x: item.x, y: item.y, w: item.w, h: item.h };
}

function cloneLayout(layout: readonly GridLayoutItem[] | null) {
  return layout?.map(cloneItem) ?? null;
}

function sameGeometry(left: GridLayoutItem | null, right: GridLayoutItem | null) {
  if (!left || !right) return left === right;
  return left.i === right.i
    && left.x === right.x
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
  code: GridStructuralAdoptionIssueCode,
  classification: GridStructuralAdoptionIssue['classification'],
  severity: GridStructuralAdoptionIssue['severity'],
  message: string,
  context: Partial<Pick<GridStructuralAdoptionIssue, 'breakpoint' | 'rootId' | 'relatedRootId'>> = {},
): GridStructuralAdoptionIssue {
  return { code, classification, severity, message, ...context };
}

function mapLayout(layout: readonly GridLayoutItem[] | null) {
  const result = new Map<string, GridLayoutItem>();
  for (const item of layout ?? []) {
    if (!result.has(item.i)) result.set(item.i, cloneItem(item));
  }
  return result;
}

function stableHash(value: unknown) {
  const serialized = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `adoption-v1-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function sourceIdentityIssues(
  source: GridStructuralAdoptionSourceIdentity,
  current: GridStructuralAdoptionSourceIdentity,
) {
  const result: GridStructuralAdoptionIssue[] = [];
  if (!source.editSessionId || source.editSessionId !== current.editSessionId) {
    result.push(issue('EDIT_SESSION_CHANGED', 'source', 'error', 'La sessione Edit Mode non coincide con quella acquisita.'));
  }
  if (source.inventoryFingerprint !== current.inventoryFingerprint) {
    result.push(issue('INVENTORY_CHANGED', 'source', 'error', 'L inventario sorgente e cambiato.'));
  }
  if (source.draftFingerprint !== current.draftFingerprint) {
    result.push(issue('DRAFT_CHANGED_CONCURRENTLY', 'source', 'error', 'Il draft sorgente e cambiato.'));
  }
  if (
    source.structuralGeneration !== current.structuralGeneration
    || source.structuralRevision !== current.structuralRevision
    || source.structuralFingerprint !== current.structuralFingerprint
  ) {
    result.push(issue('STRUCTURAL_SNAPSHOT_STALE', 'source', 'error', 'La snapshot strutturale sorgente non e piu corrente.'));
  }
  return result;
}

type LayoutValidationPhase = 'legacy-source' | 'candidate';

export function validateGridStructuralAdoptionLayout(input: Readonly<{
  breakpoint: DashboardGridBreakpoint;
  cols: number;
  layout: readonly GridLayoutItem[];
  inventory: readonly GridStructuralAdoptionInventoryEntry[];
  legacyExtraIds?: readonly string[];
  phase: LayoutValidationPhase;
}>) {
  const result: GridStructuralAdoptionIssue[] = [];
  const inventoryById = new Map(input.inventory.map((entry) => [entry.id, entry]));
  const roots = input.inventory.filter((entry) => ROOT_ROLES.has(entry.role));
  const expectedRootIds = new Set(roots.map((entry) => entry.id));
  const extras = new Set(input.legacyExtraIds ?? []);
  const seen = new Set<string>();
  const active: GridLayoutItem[] = [];
  const collisionCode = input.phase === 'legacy-source'
    ? 'LEGACY_SOURCE_COLLISION' as const
    : 'CANDIDATE_COLLISION' as const;
  const classification = input.phase;

  for (const item of input.layout) {
    const entry = inventoryById.get(item.i);
    if (seen.has(item.i)) {
      result.push(issue('DUPLICATE_ROOT', classification, 'error', `Il layout contiene piu volte ${item.i}.`, {
        breakpoint: input.breakpoint,
        rootId: item.i,
      }));
      continue;
    }
    seen.add(item.i);
    if (!entry) {
      result.push(issue(
        extras.has(item.i) ? 'LEGACY_EXTRA_ID_PRESERVED' : 'UNKNOWN_ROOT',
        extras.has(item.i) ? 'inventory' : classification,
        extras.has(item.i) ? 'information' : 'error',
        extras.has(item.i)
          ? `L ID legacy extra ${item.i} resta conservato come evidenza e non diventa un root attivo.`
          : `Il layout contiene il root sconosciuto ${item.i}.`,
        { breakpoint: input.breakpoint, rootId: item.i },
      ));
      continue;
    }
    if (entry.role === 'stack-child') {
      result.push(issue('STACK_CHILD_PROMOTED', classification, 'error', `Il figlio Stack ${item.i} non puo diventare un root.`, {
        breakpoint: input.breakpoint,
        rootId: item.i,
      }));
      continue;
    }
    if (entry.role === 'orphan-child') {
      result.push(issue('ORPHAN_CHILD_PROMOTED', classification, 'error', `L orfano ${item.i} non puo diventare un root.`, {
        breakpoint: input.breakpoint,
        rootId: item.i,
      }));
      continue;
    }
    active.push(item);
    const geometry = [item.x, item.y, item.w, item.h];
    if (!geometry.every(Number.isFinite) || !geometry.every(Number.isInteger)) {
      result.push(issue('INVALID_NUMBER', classification, 'error', `La geometria di ${item.i} non usa interi finiti.`, {
        breakpoint: input.breakpoint,
        rootId: item.i,
      }));
      continue;
    }
    if (item.x < 0 || item.y < 0 || item.w <= 0 || item.h <= 0) {
      result.push(issue('INVALID_DIMENSION', classification, 'error', `La geometria di ${item.i} ha coordinate o dimensioni non valide.`, {
        breakpoint: input.breakpoint,
        rootId: item.i,
      }));
    }
    if (item.x + item.w > input.cols) {
      result.push(issue('OUT_OF_BOUNDS', classification, 'error', `Il root ${item.i} supera le ${input.cols} colonne.`, {
        breakpoint: input.breakpoint,
        rootId: item.i,
      }));
    }
    const constraints = entry.constraints;
    if (constraints?.minW !== undefined && item.w < constraints.minW
      || constraints?.minH !== undefined && item.h < constraints.minH) {
      result.push(issue('MIN_CONSTRAINT_VIOLATION', classification, 'error', `Il root ${item.i} viola un vincolo minimo.`, {
        breakpoint: input.breakpoint,
        rootId: item.i,
      }));
    }
    if (constraints?.maxW !== undefined && item.w > constraints.maxW
      || constraints?.maxH !== undefined && item.h > constraints.maxH) {
      result.push(issue('MAX_CONSTRAINT_VIOLATION', classification, 'error', `Il root ${item.i} viola un vincolo massimo.`, {
        breakpoint: input.breakpoint,
        rootId: item.i,
      }));
    }
  }
  for (const rootId of expectedRootIds) {
    if (!seen.has(rootId)) {
      result.push(issue('MISSING_ROOT', classification, 'error', `Il root ${rootId} non ha geometria.`, {
        breakpoint: input.breakpoint,
        rootId,
      }));
    }
  }
  for (let first = 0; first < active.length; first += 1) {
    for (let second = first + 1; second < active.length; second += 1) {
      if (intersects(active[first], active[second])) {
        result.push(issue(collisionCode, classification, 'error', `I root ${active[first].i} e ${active[second].i} collidono.`, {
          breakpoint: input.breakpoint,
          rootId: active[first].i,
          relatedRootId: active[second].i,
        }));
      }
    }
  }
  return result;
}

function compareLayout(
  source: readonly GridLayoutItem[],
  candidate: readonly GridLayoutItem[],
  breakpoint: DashboardGridBreakpoint,
) {
  const sourceMap = mapLayout(source);
  const candidateMap = mapLayout(candidate);
  const ids = new Set([...sourceMap.keys(), ...candidateMap.keys()]);
  return [...ids].flatMap((rootId) => sameGeometry(
    sourceMap.get(rootId) ?? null,
    candidateMap.get(rootId) ?? null,
  ) ? [] : [issue(
    'CANDIDATE_SOURCE_DIVERGENCE',
    'candidate',
    'error',
    `La costruzione del candidato ha modificato ${rootId}.`,
    { breakpoint, rootId },
  )]);
}

function prepareBreakpoint(
  input: GridStructuralAdoptionBreakpointInput,
  inventory: readonly GridStructuralAdoptionInventoryEntry[],
  legacyExtraIds: readonly string[],
): GridStructuralAdoptionBreakpointCandidate {
  const issues: GridStructuralAdoptionIssue[] = [];
  const roots = inventory.filter((entry) => ROOT_ROLES.has(entry.role));
  const rootIds = new Set(roots.map((entry) => entry.id));
  const operational = cloneLayout(input.operationalGeometry);
  const draft = cloneLayout(input.draftExplicitGeometry);
  const persisted = cloneLayout(input.persistedExplicitGeometry);
  const preservedLegacyExtraIds = [...new Set((operational ?? [])
    .filter((item) => legacyExtraIds.includes(item.i))
    .map((item) => item.i))].sort();

  if (input.baselineState === 'missing') {
    issues.push(issue('BREAKPOINT_MISSING', 'responsive', 'warning', `Il breakpoint ${input.breakpoint} resta Missing.`, {
      breakpoint: input.breakpoint,
    }));
  } else if (input.baselineState === 'provisional') {
    issues.push(issue('BASELINE_PROVISIONAL', 'responsive', 'warning', `La baseline ${input.breakpoint} resta Provisional e non autorevole.`, {
      breakpoint: input.breakpoint,
    }));
  }
  if (!operational || input.geometrySource !== 'editor-effective') {
    issues.push(issue('EDITOR_GEOMETRY_MISSING', 'legacy-source', 'error', `La geometria effettiva dell editor non e disponibile per ${input.breakpoint}.`, {
      breakpoint: input.breakpoint,
    }));
  }

  if (operational) {
    issues.push(...validateGridStructuralAdoptionLayout({
      breakpoint: input.breakpoint,
      cols: input.cols,
      layout: operational,
      inventory,
      legacyExtraIds,
      phase: 'legacy-source',
    }));
  }

  const candidateGeometry = input.baselineState === 'missing' || !operational
    ? null
    : operational.filter((item) => rootIds.has(item.i)).map(cloneItem);
  if (candidateGeometry) {
    issues.push(...validateGridStructuralAdoptionLayout({
      breakpoint: input.breakpoint,
      cols: input.cols,
      layout: candidateGeometry,
      inventory,
      phase: 'candidate',
    }));
    issues.push(...compareLayout(
      operational.filter((item) => rootIds.has(item.i)),
      candidateGeometry,
      input.breakpoint,
    ));
  }

  const operationalMap = mapLayout(operational);
  const candidateMap = mapLayout(candidateGeometry);
  const draftMap = mapLayout(draft);
  const persistedMap = mapLayout(persisted);
  const rootComparisons = roots.map<GridStructuralAdoptionRootComparison>((entry) => {
    const operationalItem = operationalMap.get(entry.id) ?? null;
    const candidateItem = candidateMap.get(entry.id) ?? null;
    const draftItem = draftMap.get(entry.id) ?? null;
    const persistedItem = persistedMap.get(entry.id) ?? null;
    const runtimeSensitive = entry.kind === 'light' || entry.role === 'stack-root';
    const runtimeDiffers = runtimeSensitive && Boolean(operationalItem && draftItem)
      && (operationalItem?.w !== draftItem?.w || operationalItem?.h !== draftItem?.h);
    if (runtimeDiffers) {
      issues.push(issue('RUNTIME_SPAN_UNRESOLVED', 'runtime', 'warning', `Lo span runtime di ${entry.id} differisce dal draft e non viene dichiarato strutturale.`, {
        breakpoint: input.breakpoint,
        rootId: entry.id,
      }));
    }
    return {
      rootId: entry.id,
      title: entry.title,
      kind: entry.kind,
      role: entry.role as GridStructuralAdoptionRootComparison['role'],
      operational: operationalItem,
      candidate: candidateItem,
      draftExplicit: draftItem,
      persistedExplicit: persistedItem,
      candidateMatchesOperational: sameGeometry(operationalItem, candidateItem),
      draftComparison: !draftItem ? 'missing' : sameGeometry(operationalItem, draftItem) ? 'aligned' : 'different',
      persistedComparison: !persistedItem ? 'missing' : sameGeometry(operationalItem, persistedItem) ? 'aligned' : 'different',
      runtimeSpan: !runtimeSensitive || !operationalItem || !draftItem
        ? 'not-observed'
        : runtimeDiffers ? 'different-from-draft-unresolved' : 'aligned-with-draft',
    };
  });
  if (rootComparisons.some((entry) => entry.draftComparison === 'different')) {
    issues.push(issue('LEGACY_TRANSFORMATION_OBSERVED', 'legacy-source', 'information', `La geometria operativa ${input.breakpoint} differisce dal layout draft esplicito.`, {
      breakpoint: input.breakpoint,
    }));
  }

  const errors = issues.some((entry) => entry.severity === 'error');
  const incomplete = input.baselineState !== 'complete'
    || issues.some((entry) => entry.severity === 'warning');
  const structuralVerification = errors ? 'blocked' : incomplete ? 'incomplete' : 'verified';
  const eligibility = input.baselineState === 'missing'
    ? 'blocked-missing'
    : errors ? 'blocked-invalid'
      : incomplete ? 'candidate-with-warnings' : 'candidate-ready';
  const candidateMatchesOperational = Boolean(candidateGeometry)
    && rootComparisons.every((entry) => entry.candidateMatchesOperational);

  return {
    breakpoint: input.breakpoint,
    cols: input.cols,
    baselineState: input.baselineState,
    geometrySource: operational && input.geometrySource === 'editor-effective'
      ? 'editor-effective-observation' as const
      : 'unavailable' as const,
    provenance: {
      persisted: persisted ? 'explicit' as const : 'missing' as const,
      draft: draft ? 'explicit' as const : 'missing' as const,
      operational: operational ? 'legacy-renderer-effective' as const : 'missing' as const,
      candidate: candidateGeometry ? 'exact-operational-root-copy' as const : 'missing' as const,
      responsiveFallback: !draft && operational
        ? 'operational-without-explicit-layout' as const
        : operational && rootComparisons.some((entry) => entry.draftComparison === 'different')
          ? 'not-independently-classified' as const
          : 'not-observed' as const,
    },
    operationalGeometry: operational,
    candidateGeometry,
    draftExplicitGeometry: draft,
    persistedExplicitGeometry: persisted,
    rootComparisons,
    preservedLegacyExtraIds,
    candidateMatchesOperational,
    geometryMutationCount: 0 as const,
    compactionApplied: false as const,
    eligibility,
    structuralVerification,
    issues,
  };
}

export function createGridStructuralAdoptionCandidateV1(
  input: CreateGridStructuralAdoptionCandidateInput,
): GridStructuralAdoptionCandidateV1 {
  const issues: GridStructuralAdoptionIssue[] = [];
  const inventoryIds = new Set<string>();
  for (const entry of input.inventory) {
    if (inventoryIds.has(entry.id)) {
      issues.push(issue('DUPLICATE_INVENTORY_ID', 'inventory', 'error', `L inventario contiene piu volte ${entry.id}.`, { rootId: entry.id }));
    }
    inventoryIds.add(entry.id);
    if (entry.role === 'orphan-child') {
      issues.push(issue('ORPHAN_INVENTORY_ENTRY', 'inventory', 'warning', `L elemento orfano ${entry.id} resta inventariato ma escluso dai root.`, { rootId: entry.id }));
    }
  }
  const roots = input.inventory.filter((entry) => ROOT_ROLES.has(entry.role));
  if (roots.some((entry) => !entry.constraints)) {
    issues.push(issue('STRUCTURAL_CONSTRAINTS_INCOMPLETE', 'inventory', 'warning', 'I vincoli specifici di tutti i root non sono disponibili; valgono soltanto i limiti della griglia.'));
  }

  const selected = new Set(input.selectedBreakpoints);
  if (selected.size === 0) {
    issues.push(issue('NO_BREAKPOINT_SELECTED', 'responsive', 'error', 'Selezionare almeno un breakpoint.'));
  }
  const breakpointByName = new Map<DashboardGridBreakpoint, GridStructuralAdoptionBreakpointInput>();
  for (const breakpoint of input.breakpoints) {
    if (breakpointByName.has(breakpoint.breakpoint)) {
      issues.push(issue('DUPLICATE_BREAKPOINT', 'responsive', 'error', `Il breakpoint ${breakpoint.breakpoint} e duplicato.`, {
        breakpoint: breakpoint.breakpoint,
      }));
    } else {
      breakpointByName.set(breakpoint.breakpoint, breakpoint);
    }
  }
  const breakpoints = DASHBOARD_GRID_BREAKPOINT_ORDER
    .filter((breakpoint) => selected.has(breakpoint))
    .flatMap((breakpoint) => {
      const source = breakpointByName.get(breakpoint);
      if (!source) {
        issues.push(issue('BREAKPOINT_MISSING', 'responsive', 'warning', `Il breakpoint selezionato ${breakpoint} non e descritto dalla sorgente.`, { breakpoint }));
        return [];
      }
      return [prepareBreakpoint(source, input.inventory, input.legacyExtraIds)];
    });
  issues.push(...breakpoints.flatMap((breakpoint) => breakpoint.issues));
  issues.push(...sourceIdentityIssues(input.sourceIdentity, input.currentSourceIdentity));
  issues.push(issue('STRUCTURAL_AUTHORITY_NOT_AVAILABLE', 'authority', 'warning', 'La Structural Policy non autorizza il trasferimento al draft.'));
  issues.push(issue('DRAFT_APPLICATION_ADAPTER_NOT_AVAILABLE', 'authority', 'warning', 'L adapter transazionale verso il draft non esiste in questa fase.'));

  const sourceInvalid = issues.some((entry) => [
    'EDIT_SESSION_CHANGED',
    'INVENTORY_CHANGED',
    'DRAFT_CHANGED_CONCURRENTLY',
    'STRUCTURAL_SNAPSHOT_STALE',
  ].includes(entry.code));
  const structuralIssues = issues.filter((entry) => entry.classification !== 'authority');
  const blocked = structuralIssues.some((entry) => entry.severity === 'error');
  const incomplete = structuralIssues.some((entry) => entry.severity === 'warning');
  const structuralStatus = blocked ? 'blocked' : incomplete ? 'incomplete' : 'verified';
  const reasonCodes = [...new Set(structuralIssues
    .filter((entry) => entry.severity !== 'information')
    .map((entry) => entry.code))];
  const allResponsiveSupplied = DASHBOARD_GRID_BREAKPOINT_ORDER.every((breakpoint) => (
    selected.has(breakpoint)
      && breakpointByName.get(breakpoint)?.baselineState === 'complete'
  ));
  const responsiveCompleteness = selected.size < DASHBOARD_GRID_BREAKPOINT_ORDER.length
    ? 'partial-selection' as const
    : allResponsiveSupplied ? 'complete' as const : 'incomplete' as const;
  const authorityReasons = [
    ...(input.authority?.reasonCodes ?? []),
    'SOURCE_LINEAGE_NOT_VERIFIED',
    'STRUCTURAL_AUTHORITY_NOT_AVAILABLE',
    'DRAFT_APPLICATION_ADAPTER_NOT_AVAILABLE',
  ];
  const signaturePayload = {
    version: GRID_STRUCTURAL_ADOPTION_CANDIDATE_VERSION,
    sourceIdentity: input.sourceIdentity,
    inventory: input.inventory,
    legacyExtraIds: [...new Set(input.legacyExtraIds)].sort(),
    mode: input.mode,
    breakpoints,
  };

  return {
    version: GRID_STRUCTURAL_ADOPTION_CANDIDATE_VERSION,
    candidateSignature: stableHash(signaturePayload),
    editSessionId: input.sourceIdentity.editSessionId,
    sourceIdentity: { ...input.sourceIdentity },
    structuralReference: {
      generation: input.sourceIdentity.structuralGeneration,
      revision: input.sourceIdentity.structuralRevision,
      fingerprint: input.sourceIdentity.structuralFingerprint,
    },
    inventory: {
      rootCount: roots.length,
      roots: roots.map((entry) => ({ ...entry, constraints: entry.constraints ? { ...entry.constraints } : undefined })),
      nonRoots: input.inventory.filter((entry) => !ROOT_ROLES.has(entry.role)).map((entry) => ({ ...entry })),
      fingerprint: input.sourceIdentity.inventoryFingerprint,
    },
    modeChoice: {
      mode: input.mode,
      source: 'explicit-user-choice',
      transformationApplied: false,
    },
    breakpoints,
    responsiveCompleteness,
    lifecycle: sourceInvalid ? 'invalidated' : 'prepared',
    acknowledgement: { status: 'not-acknowledged', meaning: 'intent-only' },
    structuralVerification: { status: structuralStatus, reasonCodes },
    applicationAuthorization: {
      status: 'not-authorized',
      renderingAuthority: 'not-authorized',
      draftApplicationAvailable: false,
      saveToHomeAssistantAvailable: false,
      reasonCodes: [...new Set(authorityReasons)],
    },
    preparation: {
      geometryMutationCount: 0,
      compactionApplied: false,
      storageWrites: false,
      homeAssistantWrites: false,
    },
    issues,
  };
}

export function invalidateGridStructuralAdoptionCandidateV1(
  candidate: GridStructuralAdoptionCandidateV1,
  currentSourceIdentity: GridStructuralAdoptionSourceIdentity,
): GridStructuralAdoptionCandidateV1 {
  const invalidationIssues = sourceIdentityIssues(candidate.sourceIdentity, currentSourceIdentity);
  if (invalidationIssues.length === 0 || candidate.lifecycle === 'invalidated') return candidate;
  const issues = [...candidate.issues, ...invalidationIssues];
  return {
    ...candidate,
    lifecycle: 'invalidated',
    acknowledgement: { status: 'not-acknowledged', meaning: 'intent-only' },
    structuralVerification: {
      status: 'blocked',
      reasonCodes: [...new Set([
        ...candidate.structuralVerification.reasonCodes,
        ...invalidationIssues.map((entry) => entry.code),
      ])],
    },
    issues,
  };
}

export function acknowledgeGridStructuralAdoptionCandidateV1(
  candidate: GridStructuralAdoptionCandidateV1,
  currentSourceIdentity: GridStructuralAdoptionSourceIdentity,
): GridStructuralAdoptionCandidateV1 {
  const checked = invalidateGridStructuralAdoptionCandidateV1(candidate, currentSourceIdentity);
  if (checked.lifecycle === 'invalidated') return checked;
  return {
    ...checked,
    lifecycle: 'acknowledged',
    acknowledgement: { status: 'acknowledged', meaning: 'intent-only' },
  };
}
