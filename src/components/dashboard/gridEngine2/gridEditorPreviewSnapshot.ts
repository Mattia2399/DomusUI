import type { DashboardLayoutConfiguration } from '../../../services/dashboardConfigurationRepository';
import type {
  DashboardStructuralLoadPhase,
  DashboardStructuralLoadSource,
} from '../../../services/dashboardStructuralLoadSnapshot';
import { ROOT_CANVAS_COLS, type GridItem } from '../../../types/dashboardModels';
import {
  DASHBOARD_GRID_BREAKPOINT_ORDER,
  type DashboardGridBreakpoint,
} from '../../../types/widgetTypeLayout';
import type {
  GridEngineLabBreakpointStatus,
  GridEngineLabItemKind,
  GridEngineLabScenario,
} from './labFixtures';
import { colsForBreakpoint } from './responsiveLayout';

export type GridEditorPreviewSource = Readonly<{
  phase: DashboardStructuralLoadPhase;
  source: DashboardStructuralLoadSource;
  generation: number;
  revision: number | null;
  storageVersion: number | null;
  coherent: boolean;
  reason?: string;
}>;

export type GridEditorEffectiveGeometrySnapshot = Readonly<{
  breakpoint: DashboardGridBreakpoint;
  cols: number;
  gridWidth: number;
  layouts: Readonly<Partial<Record<DashboardGridBreakpoint, readonly GridItem[]>>>;
}>;

export type GridEditorPreviewBaselineKind =
  | 'verified-source-copy'
  | 'editor-draft'
  | 'local-copy'
  | 'reconciled-provisional';

export type GridEditorPreviewIssueCode =
  | 'duplicate-root-id'
  | 'canonical-id-mismatch'
  | 'invalid-canonical-geometry'
  | 'unknown-layout-id'
  | 'duplicate-layout-id'
  | 'missing-layout-id'
  | 'invalid-layout-geometry'
  | 'orphan-stack-child';

export type GridEditorPreviewIssue = Readonly<{
  code: GridEditorPreviewIssueCode;
  id: string;
  breakpoint?: DashboardGridBreakpoint;
}>;

export type GridEditorPreviewBreakpointStatus = GridEngineLabBreakpointStatus;

export type GridEditorPreviewInventoryEntry = Readonly<{
  id: string;
  title: string;
  kind: string;
  role: 'root-widget' | 'stack-root' | 'special-section' | 'stack-child' | 'orphan-child';
  parentId: string | null;
  previewRepresentation: 'direct' | 'via-parent' | 'excluded-orphan';
}>;

export type GridEditorGeometryRow = Readonly<{
  id: string;
  title: string;
  kind: string;
  role: GridEditorPreviewInventoryEntry['role'];
  parentId: string | null;
  editor: GridItem | null;
  draft: GridItem | null;
  persisted: GridItem | null;
  before: GridItem | null;
  after: GridItem | null;
  source: 'editor-effective' | 'draft-explicit' | 'missing';
  status: 'complete' | 'provisional' | 'missing';
  alignment: 'aligned' | 'different' | 'unavailable';
  mismatches: readonly string[];
}>;

export type GridEditorGeometryBreakpointAudit = Readonly<{
  breakpoint: DashboardGridBreakpoint;
  cols: number;
  source: GridEditorGeometryRow['source'];
  editorGeometryValid: boolean;
  operationalRootCount: number;
  previewRootCount: number;
  sharedIds: readonly string[];
  homeOnlyIds: readonly string[];
  previewOnlyIds: readonly string[];
  rows: readonly GridEditorGeometryRow[];
}>;

export type GridEditorPreviewModel = Readonly<{
  baseline: Readonly<{
    kind: GridEditorPreviewBaselineKind;
    geometry: 'complete' | 'incomplete';
    previewAuthority: 'non-authoritative';
    source: GridEditorPreviewSource;
  }>;
  inventory: Readonly<{
    rootElementCount: number;
    rootWidgetCount: number;
    stackContainerCount: number;
    stackChildCount: number;
    specialSectionCount: number;
    orphanStackChildCount: number;
  }>;
  inventoryEntries: readonly GridEditorPreviewInventoryEntry[];
  geometryAudit: Readonly<{
    editorCaptureAvailable: boolean;
    capturedBreakpoint: DashboardGridBreakpoint | null;
    capturedGridWidth: number | null;
    persistedSnapshotAvailable: boolean;
    breakpoints: Readonly<Record<DashboardGridBreakpoint, GridEditorGeometryBreakpointAudit>>;
  }>;
  breakpointStatus: Readonly<Record<DashboardGridBreakpoint, GridEditorPreviewBreakpointStatus>>;
  issues: readonly GridEditorPreviewIssue[];
  unknownLegacyIds: readonly string[];
  runtimeDimensionsIncluded: false;
  runtimeGridSpansIncluded: boolean;
  groupsSupported: false;
  scenario: GridEngineLabScenario | null;
}>;

export type CreateGridEditorPreviewModelInput = Readonly<{
  dashboard: Readonly<DashboardLayoutConfiguration>;
  persistedDashboard?: Readonly<DashboardLayoutConfiguration> | null;
  editorGeometry?: GridEditorEffectiveGeometrySnapshot | null;
  source: GridEditorPreviewSource;
  hasUnsavedEdits: boolean;
}>;

const STACK_KINDS = new Set(['stack-vertical', 'stack-horizontal', 'stack-grid']);

function cloneGridItem(item: GridItem, id = item.i): GridItem {
  return { i: id, x: item.x, y: item.y, w: item.w, h: item.h };
}

function isValidGeometry(item: GridItem, cols: number) {
  return [item.x, item.y, item.w, item.h].every(Number.isInteger)
    && item.x >= 0
    && item.y >= 0
    && item.w >= 1
    && item.h >= 1
    && item.x + item.w <= cols;
}

function sameGeometry(left: GridItem | null, right: GridItem | null) {
  if (!left || !right) return left === right;
  return left.i === right.i
    && left.x === right.x
    && left.y === right.y
    && left.w === right.w
    && left.h === right.h;
}

function itemMap(layout: readonly GridItem[] | undefined) {
  const result = new Map<string, GridItem>();
  for (const item of layout ?? []) {
    if (!result.has(item.i)) result.set(item.i, cloneGridItem(item));
  }
  return result;
}

function analyzeEffectiveEditorLayout(
  sourceLayout: readonly GridItem[] | undefined,
  rootIds: ReadonlySet<string>,
  cols: number,
) {
  if (!sourceLayout) return { valid: false, items: [] as GridItem[] };
  const seen = new Set<string>();
  const items: GridItem[] = [];
  let valid = true;
  for (const sourceItem of sourceLayout) {
    if (seen.has(sourceItem.i) || !rootIds.has(sourceItem.i) || !isValidGeometry(sourceItem, cols)) {
      valid = false;
      continue;
    }
    seen.add(sourceItem.i);
    items.push(cloneGridItem(sourceItem));
  }
  if (seen.size !== rootIds.size || items.length !== rootIds.size) valid = false;
  return { valid, items };
}

function baselineKind(input: CreateGridEditorPreviewModelInput): GridEditorPreviewBaselineKind {
  if (input.hasUnsavedEdits) return 'editor-draft';
  if (
    input.source.source === 'home-assistant'
    && input.source.phase === 'complete'
    && input.source.coherent
    && input.source.revision !== null
  ) {
    return 'verified-source-copy';
  }
  if (input.source.source === 'local-cache') return 'local-copy';
  return 'reconciled-provisional';
}

export function createGridEditorPreviewModel(
  input: CreateGridEditorPreviewModelInput,
): GridEditorPreviewModel {
  const issues: GridEditorPreviewIssue[] = [];
  const stackSections = input.dashboard.sections.filter((section) => STACK_KINDS.has(section.kind));
  const stackIds = new Set(stackSections.map((section) => section.id));
  const rootWidgets = input.dashboard.widgets.filter((widget) => !widget.parentSectionId);
  const stackChildren = input.dashboard.widgets.filter(
    (widget) => widget.parentSectionId && stackIds.has(widget.parentSectionId),
  );
  const orphanStackChildren = input.dashboard.widgets.filter(
    (widget) => widget.parentSectionId && !stackIds.has(widget.parentSectionId),
  );
  for (const widget of orphanStackChildren) {
    issues.push({ code: 'orphan-stack-child', id: widget.id });
  }

  const rootEntries = [
    ...input.dashboard.sections.map((section) => ({
      id: section.id,
      title: section.title?.trim() || section.kind,
      rawKind: section.kind,
      layout: section.layout,
      role: (STACK_KINDS.has(section.kind) ? 'stack-root' : 'special-section') as
        | 'stack-root'
        | 'special-section',
      kind: (STACK_KINDS.has(section.kind) ? 'stack-root' : 'special-section') as GridEngineLabItemKind,
    })),
    ...rootWidgets.map((widget) => ({
      id: widget.id,
      title: widget.title?.trim() || widget.id,
      rawKind: widget.kind,
      layout: widget.layout,
      role: 'root-widget' as const,
      kind: (widget.kind === 'light' ? 'light' : 'widget') as GridEngineLabItemKind,
    })),
  ];
  const inventoryEntries: GridEditorPreviewInventoryEntry[] = [
    ...rootEntries.map((entry) => ({
      id: entry.id,
      title: entry.title,
      kind: entry.rawKind,
      role: entry.role,
      parentId: null,
      previewRepresentation: 'direct' as const,
    })),
    ...stackChildren.map((widget) => ({
      id: widget.id,
      title: widget.title?.trim() || widget.id,
      kind: widget.kind,
      role: 'stack-child' as const,
      parentId: widget.parentSectionId ?? null,
      previewRepresentation: 'via-parent' as const,
    })),
    ...orphanStackChildren.map((widget) => ({
      id: widget.id,
      title: widget.title?.trim() || widget.id,
      kind: widget.kind,
      role: 'orphan-child' as const,
      parentId: widget.parentSectionId ?? null,
      previewRepresentation: 'excluded-orphan' as const,
    })),
  ];
  const rootIdCounts = new Map<string, number>();
  for (const entry of rootEntries) rootIdCounts.set(entry.id, (rootIdCounts.get(entry.id) ?? 0) + 1);
  for (const [id, count] of rootIdCounts) {
    if (count > 1) issues.push({ code: 'duplicate-root-id', id });
  }
  const rootIds = new Set(rootEntries.map((entry) => entry.id));
  const itemKinds: Record<string, GridEngineLabItemKind> = {};
  const canonicalItems = rootEntries.flatMap((entry) => {
    itemKinds[entry.id] = entry.kind;
    if (entry.layout.i !== entry.id) {
      issues.push({ code: 'canonical-id-mismatch', id: entry.id });
    }
    const item = cloneGridItem(entry.layout, entry.id);
    if (!isValidGeometry(item, ROOT_CANVAS_COLS)) {
      issues.push({ code: 'invalid-canonical-geometry', id: entry.id });
      return [];
    }
    return [item];
  });

  const initialLayouts: Partial<Record<DashboardGridBreakpoint, readonly GridItem[]>> = {};
  const provisionalLayouts: Partial<Record<DashboardGridBreakpoint, readonly GridItem[]>> = {};
  const breakpointStatus = {} as Record<DashboardGridBreakpoint, GridEditorPreviewBreakpointStatus>;
  const geometryBreakpoints = {} as Record<DashboardGridBreakpoint, GridEditorGeometryBreakpointAudit>;
  const unknownLegacyIds = new Set<string>();
  const missingBreakpoints: DashboardGridBreakpoint[] = [];

  for (const breakpoint of DASHBOARD_GRID_BREAKPOINT_ORDER) {
    const cols = colsForBreakpoint(breakpoint);
    const sourceLayout = input.dashboard.responsiveLayouts.root?.[breakpoint];
    const editorAnalysis = analyzeEffectiveEditorLayout(
      input.editorGeometry?.layouts[breakpoint],
      rootIds,
      cols,
    );
    const editorMap = itemMap(input.editorGeometry?.layouts[breakpoint]);
    const draftMap = itemMap(sourceLayout);
    const persistedMap = itemMap(input.persistedDashboard?.responsiveLayouts.root?.[breakpoint]);
    const operationalIds = new Set(
      (input.editorGeometry?.layouts[breakpoint] ?? []).map((item) => item.i),
    );
    const homeOnlyIds = [...operationalIds].filter((id) => !rootIds.has(id));
    const previewOnlyIds = [...rootIds].filter((id) => !operationalIds.has(id));

    let knownItems: GridItem[] = [];
    let displayItems: GridItem[] = [];
    let geometrySource: GridEditorGeometryRow['source'] = 'missing';
    let layoutStatus: GridEditorGeometryRow['status'] = 'missing';
    if (!sourceLayout) {
      breakpointStatus[breakpoint] = {
        breakpoint,
        cols,
        state: 'missing',
        itemCount: 0,
        validItemCount: 0,
        missingIds: [...rootIds],
        unknownIds: [],
        invalidIds: [],
      };
      missingBreakpoints.push(breakpoint);
    } else {
      const seen = new Set<string>();
      const duplicateIds = new Set<string>();
      const unknownIds = new Set<string>();
      const invalidIds = new Set<string>();
      for (const sourceItem of sourceLayout) {
        if (seen.has(sourceItem.i)) {
          duplicateIds.add(sourceItem.i);
          continue;
        }
        seen.add(sourceItem.i);
        if (!rootIds.has(sourceItem.i)) {
          unknownIds.add(sourceItem.i);
          unknownLegacyIds.add(sourceItem.i);
          continue;
        }
        const item = cloneGridItem(sourceItem);
        if (!isValidGeometry(item, cols)) {
          invalidIds.add(item.i);
          continue;
        }
        knownItems.push(item);
      }
      const missingIds = [...rootIds].filter((id) => !seen.has(id));
      for (const id of unknownIds) issues.push({ code: 'unknown-layout-id', id, breakpoint });
      for (const id of duplicateIds) issues.push({ code: 'duplicate-layout-id', id, breakpoint });
      for (const id of missingIds) issues.push({ code: 'missing-layout-id', id, breakpoint });
      for (const id of invalidIds) issues.push({ code: 'invalid-layout-geometry', id, breakpoint });

      const complete = unknownIds.size === 0
        && duplicateIds.size === 0
        && missingIds.length === 0
        && invalidIds.size === 0
        && knownItems.length === rootIds.size;
      breakpointStatus[breakpoint] = {
        breakpoint,
        cols,
        state: complete ? 'complete' : 'incomplete',
        itemCount: sourceLayout.length,
        validItemCount: knownItems.length,
        missingIds,
        unknownIds: [...unknownIds],
        invalidIds: [...invalidIds],
      };
      layoutStatus = complete ? 'complete' : 'provisional';
      displayItems = editorAnalysis.valid ? editorAnalysis.items : knownItems;
      geometrySource = editorAnalysis.valid ? 'editor-effective' : 'draft-explicit';
      if (complete) initialLayouts[breakpoint] = displayItems.map((item) => cloneGridItem(item));
      else provisionalLayouts[breakpoint] = displayItems.map((item) => cloneGridItem(item));
    }

    const beforeMap = itemMap(displayItems);
    const rows = rootEntries.map<GridEditorGeometryRow>((entry) => {
      const editor = editorMap.get(entry.id) ?? null;
      const draft = draftMap.get(entry.id) ?? null;
      const persisted = persistedMap.get(entry.id) ?? null;
      const before = beforeMap.get(entry.id) ?? null;
      const after = before ? cloneGridItem(before) : null;
      const mismatches: string[] = [];
      if (!sameGeometry(draft, editor)) mismatches.push('draft/editor');
      if (!sameGeometry(persisted, draft)) mismatches.push('HA/draft');
      if (!sameGeometry(editor, before)) mismatches.push('editor/BEFORE');
      return {
        id: entry.id,
        title: entry.title,
        kind: entry.rawKind,
        role: entry.role,
        parentId: null,
        editor,
        draft,
        persisted,
        before,
        after,
        source: geometrySource,
        status: layoutStatus,
        alignment: !editor || !before
          ? 'unavailable'
          : sameGeometry(editor, before) ? 'aligned' : 'different',
        mismatches,
      };
    });
    geometryBreakpoints[breakpoint] = {
      breakpoint,
      cols,
      source: geometrySource,
      editorGeometryValid: editorAnalysis.valid,
      operationalRootCount: operationalIds.size,
      previewRootCount: beforeMap.size,
      sharedIds: [...rootIds].filter((id) => operationalIds.has(id) && beforeMap.has(id)),
      homeOnlyIds,
      previewOnlyIds,
      rows,
    };
  }

  const canonicalUsable = rootEntries.length > 0
    && canonicalItems.length === rootEntries.length
    && rootIds.size === rootEntries.length;
  const geometryComplete = canonicalUsable && DASHBOARD_GRID_BREAKPOINT_ORDER.every(
    (breakpoint) => breakpointStatus[breakpoint].state === 'complete',
  );
  const selected = canonicalItems.find((item) => itemKinds[item.i] === 'light') ?? canonicalItems[0];
  const sourceKind = baselineKind(input);
  const scenario: GridEngineLabScenario | null = selected && canonicalUsable
    ? {
        id: 'editor-snapshot',
        title: 'Configurazione visualizzata',
        eyebrow: 'Editor DEV',
        description: 'Snapshot strutturale isolata: nessuna operazione può raggiungere la Home.',
        items: canonicalItems.map((item) => cloneGridItem(item)),
        sourceCols: ROOT_CANVAS_COLS,
        initialLayouts,
        provisionalLayouts,
        breakpointStatus,
        selectedId: selected.i,
        suggestedMove: { x: selected.x, y: selected.y },
        itemKinds,
        primaryMode: 'manual',
        missingBreakpoints,
      }
    : null;

  return {
    baseline: {
      kind: sourceKind,
      geometry: geometryComplete ? 'complete' : 'incomplete',
      previewAuthority: 'non-authoritative',
      source: { ...input.source },
    },
    inventory: {
      rootElementCount: rootEntries.length,
      rootWidgetCount: rootWidgets.length,
      stackContainerCount: stackSections.length,
      stackChildCount: stackChildren.length,
      specialSectionCount: input.dashboard.sections.length - stackSections.length,
      orphanStackChildCount: orphanStackChildren.length,
    },
    inventoryEntries,
    geometryAudit: {
      editorCaptureAvailable: Boolean(input.editorGeometry),
      capturedBreakpoint: input.editorGeometry?.breakpoint ?? null,
      capturedGridWidth: input.editorGeometry?.gridWidth ?? null,
      persistedSnapshotAvailable: Boolean(input.persistedDashboard),
      breakpoints: geometryBreakpoints,
    },
    breakpointStatus,
    issues,
    unknownLegacyIds: [...unknownLegacyIds],
    runtimeDimensionsIncluded: false,
    runtimeGridSpansIncluded: Boolean(input.editorGeometry),
    groupsSupported: false,
    scenario,
  };
}
