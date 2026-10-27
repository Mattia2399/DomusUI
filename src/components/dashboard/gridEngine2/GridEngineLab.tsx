import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  ClipboardList,
  Check,
  FlaskConical,
  Gauge,
  Laptop,
  Maximize2,
  Move,
  RotateCcw,
  ScanLine,
  Smartphone,
  Sparkles,
  Tablet,
  Trash2,
  Undo2,
  Redo2,
  X,
} from 'lucide-react';
import {
  DASHBOARD_GRID_BREAKPOINT_ORDER,
  type DashboardGridBreakpoint,
} from '../../../types/widgetTypeLayout';
import {
  GRID_ENGINE_LAB_COLS,
  GRID_ENGINE_LAB_METRICS,
  GRID_ENGINE_LAB_SCENARIOS,
  cloneLabLayout,
  type GridEngineLabScenario,
} from './labFixtures';
import {
  GridLayoutError,
  type GridLayoutIntent,
  type GridLayoutItem,
  type GridLayoutMode,
  type GridResizeAnchor,
} from './model';
import { solveLayout } from './solveLayout';
import {
  GridGestureCanvas,
  type GridGestureRenderContext,
} from './GridGestureCanvas';
import { RglReadOnlyCanvas } from './RglReadOnlyCanvas';
import { useGridGesture, type GridGesturePreview } from './useGridGesture';
import {
  RESPONSIVE_LAB_BREAKPOINTS,
  breakpointForCanvasWidth,
  colsForBreakpoint,
  previewWidthForBreakpoint,
} from './responsiveLayout';
import {
  confirmGridPreviewInMemory,
  confirmedGridPreviewLayout,
  createGridPreviewController,
  createManualGridPreviewOverride,
  deriveSyntheticMissingGridPreview,
  displayGridPreviewLayout,
  effectiveGridPreviewMode,
  gridPreviewConfirmationRevision,
  gridPreviewLayoutOrigin,
  hasGridPreviewOverride,
  isGridPreviewBreakpointConfirmable,
  isGridPreviewBreakpointMissing,
  isGridPreviewBreakpointProvisional,
  isGridPreviewDirty,
  isSyntheticMissingGridPreview,
  primaryGridPreviewMode,
  redoGridPreview,
  removeGridPreviewOverride,
  resetGridPreviewController,
  resetGridPreviewDraft,
  restoreAutomaticGridPreviewBreakpoint,
  setGridPreviewPrimaryMode,
  stageGridPreviewLayout,
  structuralGridPreviewLayout,
  undoGridPreview,
} from './gridPreviewController';
import {
  createGridEngineDraftChangeSet,
  type GridEngineDraftOperationHint,
  type GridEngineDraftReviewContext,
} from './gridEngineDraftChangeSet';

type LabOperation = 'MOVE' | 'REORDER' | 'RESIZE';

type PreviewSnapshot = GridGesturePreview;

type GeometryChange = {
  readonly id: string;
  readonly before: GridLayoutItem;
  readonly after: GridLayoutItem;
};

const RESIZE_ANCHORS: readonly { value: GridResizeAnchor; label: string }[] = [
  { value: 'top-left', label: 'Top left' },
  { value: 'top-right', label: 'Top right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom-right', label: 'Bottom right' },
];

const RESPONSIVE_VIEW_CHOICES = [
  { label: 'Desktop', breakpoint: 'xl', icon: Laptop },
  { label: 'Tablet', breakpoint: 'md', icon: Tablet },
  { label: 'Mobile', breakpoint: 'xs', icon: Smartphone },
] as const;

function profileForBreakpoint(breakpoint: DashboardGridBreakpoint) {
  if (breakpoint === '2xl' || breakpoint === 'xl' || breakpoint === 'lg') return 'Desktop';
  if (breakpoint === 'md' || breakpoint === 'sm') return 'Tablet';
  return 'Mobile';
}

const INITIAL_LAB_SCENARIO = GRID_ENGINE_LAB_SCENARIOS[0];
function createScenarioController(scenario: GridEngineLabScenario) {
  return createGridPreviewController(scenario.items, scenario.sourceCols ?? GRID_ENGINE_LAB_COLS, {
    primaryMode: scenario.primaryMode,
    overrides: scenario.overrides,
    missingBreakpoints: scenario.missingBreakpoints,
    initialLayouts: scenario.initialLayouts,
    provisionalLayouts: scenario.provisionalLayouts,
  });
}

const INITIAL_PREVIEW_CONTROLLER = createScenarioController(INITIAL_LAB_SCENARIO);

function geometry(item: GridLayoutItem) {
  return `x${item.x} y${item.y} · ${item.w}×${item.h}`;
}

function parseGridNumber(value: string) {
  return value.trim().length === 0 ? Number.NaN : Number(value);
}

function formatSolverError(error: unknown) {
  if (error instanceof GridLayoutError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return 'Errore sconosciuto durante il calcolo del layout.';
}

function findItem(items: readonly GridLayoutItem[], id: string) {
  return items.find((item) => item.i === id);
}

function draftOperationHint(intent: GridLayoutIntent): GridEngineDraftOperationHint {
  return intent.type === 'NORMALIZE' ? 'UNKNOWN' : intent.type;
}

function solveModeLayout(
  items: readonly GridLayoutItem[],
  mode: GridLayoutMode,
  cols: number,
) {
  if (mode === 'manual') return cloneLabLayout(items);
  return solveLayout({
    items,
    cols,
    mode,
    intent: { type: 'COMPACT' },
  });
}

function listChanges(before: readonly GridLayoutItem[], after: readonly GridLayoutItem[]) {
  const previousById = new Map(before.map((item) => [item.i, item]));
  return after.reduce<GeometryChange[]>((changes, item) => {
    const previous = previousById.get(item.i);
    if (
      previous &&
      (previous.x !== item.x || previous.y !== item.y || previous.w !== item.w || previous.h !== item.h)
    ) {
      changes.push({ id: item.i, before: previous, after: item });
    }
    return changes;
  }, []);
}

function layoutOrderChanged(before: readonly GridLayoutItem[], after: readonly GridLayoutItem[]) {
  return before.map(({ i }) => i).join('|') !== after.map(({ i }) => i).join('|');
}

function geometryIssueCounts(items: readonly GridLayoutItem[], cols: number) {
  const outOfBounds = items.filter((item) => (
    item.x < 0 || item.y < 0 || item.w < 1 || item.h < 1 || item.x + item.w > cols
  )).length;
  let collisions = 0;
  for (let first = 0; first < items.length; first += 1) {
    for (let second = first + 1; second < items.length; second += 1) {
      const a = items[first];
      const b = items[second];
      if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
        collisions += 1;
      }
    }
  }
  return { outOfBounds, collisions };
}

function CoordinateTable({ items, label }: { items: readonly GridLayoutItem[]; label: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/[0.07] bg-black/15 p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/42">{label}</p>
      <div className="space-y-1 font-mono text-[11px] text-white/62">
        {items.map((item) => (
          <div key={item.i} className="flex items-center justify-between gap-3">
            <span className="truncate text-white/78">{item.i}</span>
            <span className="shrink-0">{geometry(item)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScenarioButton({
  scenario,
  selected,
  onClick,
}: {
  scenario: GridEngineLabScenario;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`min-w-[13.5rem] flex-1 rounded-2xl border p-3 text-left transition-all active:scale-[0.99] ${
        selected
          ? 'border-cyan-300/35 bg-cyan-300/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
          : 'border-white/[0.07] bg-white/[0.025] hover:border-white/15 hover:bg-white/[0.05]'
      }`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100/48">
        {scenario.eyebrow}
      </span>
      <span className="mt-1 block text-sm font-semibold text-white/88">{scenario.title}</span>
      <span className="mt-1.5 block text-xs leading-5 text-white/46">{scenario.description}</span>
    </button>
  );
}

export type GridEngineLabProps = Readonly<{
  scenarios?: readonly GridEngineLabScenario[];
  initialBreakpoint?: DashboardGridBreakpoint;
  context?: ReactNode;
  presentation?: 'laboratory' | 'editor-preview';
  renderItem?: (context: GridGestureRenderContext) => ReactNode;
  draftReview?: GridEngineDraftReviewContext;
}>;

export function GridEngineLab({
  scenarios = GRID_ENGINE_LAB_SCENARIOS,
  initialBreakpoint = 'xl',
  context,
  presentation = 'laboratory',
  renderItem,
  draftReview,
}: GridEngineLabProps = {}) {
  const scenarioList = scenarios.length > 0 ? scenarios : GRID_ENGINE_LAB_SCENARIOS;
  const initialScenario = scenarioList[0] ?? INITIAL_LAB_SCENARIO;
  const [scenarioId, setScenarioId] = useState(initialScenario.id);
  const [previewController, setPreviewController] = useState(
    () => presentation === 'laboratory' && initialScenario === INITIAL_LAB_SCENARIO
      ? INITIAL_PREVIEW_CONTROLLER
      : createScenarioController(initialScenario),
  );
  const [canvasWidth, setCanvasWidth] = useState(previewWidthForBreakpoint(initialBreakpoint));
  const [selectedId, setSelectedId] = useState(initialScenario.selectedId);
  const [operation, setOperation] = useState<LabOperation>('MOVE');
  const [moveX, setMoveX] = useState(String(initialScenario.suggestedMove.x));
  const [moveY, setMoveY] = useState(String(initialScenario.suggestedMove.y));
  const initialSelected = findItem(
    structuralGridPreviewLayout(
      presentation === 'laboratory' && initialScenario === INITIAL_LAB_SCENARIO
        ? INITIAL_PREVIEW_CONTROLLER
        : createScenarioController(initialScenario),
      initialBreakpoint,
    ) ?? [],
    initialScenario.selectedId,
  ) ?? initialScenario.items[0];
  const [resizeW, setResizeW] = useState(String(initialSelected?.w ?? 1));
  const [resizeH, setResizeH] = useState(String(initialSelected?.h ?? 1));
  const [anchor, setAnchor] = useState<GridResizeAnchor>('top-left');
  const [preview, setPreview] = useState<PreviewSnapshot | null>(null);
  const [runtimeExpanded, setRuntimeExpanded] = useState(false);
  const [showRglExperiment, setShowRglExperiment] = useState(!renderItem);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showDraftReview, setShowDraftReview] = useState(false);
  const [touchedBreakpoints, setTouchedBreakpoints] = useState<ReadonlySet<DashboardGridBreakpoint>>(
    () => new Set(),
  );
  const [operationHints, setOperationHints] = useState<Readonly<Partial<Record<
    DashboardGridBreakpoint,
    GridEngineDraftOperationHint
  >>>>({});
  const gestureCanvasRef = useRef<HTMLDivElement>(null);

  const scenario = scenarioList.find((entry) => entry.id === scenarioId) ?? initialScenario;
  const activeBreakpoint = breakpointForCanvasWidth(canvasWidth);
  const activeCols = colsForBreakpoint(activeBreakpoint);
  const activeProfile = profileForBreakpoint(activeBreakpoint);
  const mode = effectiveGridPreviewMode(previewController, activeBreakpoint);
  const primaryMode = primaryGridPreviewMode(previewController);
  const overridePresent = hasGridPreviewOverride(previewController, activeBreakpoint);
  const dirty = isGridPreviewDirty(previewController);
  const missingBreakpoint = isGridPreviewBreakpointMissing(previewController, activeBreakpoint);
  const provisionalBreakpoint = isGridPreviewBreakpointProvisional(previewController, activeBreakpoint);
  const confirmableBreakpoint = isGridPreviewBreakpointConfirmable(previewController, activeBreakpoint);
  const syntheticMissingPreview = isSyntheticMissingGridPreview(previewController, activeBreakpoint);
  const breakpointStatus = scenario.breakpointStatus?.[activeBreakpoint];
  const responsiveCalculation = useMemo(() => {
    const startedAt = performance.now();
    const layout = structuralGridPreviewLayout(previewController, activeBreakpoint) ?? [];
    return { layout, durationMs: performance.now() - startedAt };
  }, [activeBreakpoint, previewController]);
  const structuralLayout = responsiveCalculation.layout;
  const confirmedLayout = confirmedGridPreviewLayout(previewController, activeBreakpoint) ?? [];
  const layoutOrigin = gridPreviewLayoutOrigin(previewController, activeBreakpoint);
  const modeLayout = useMemo(
    () => displayGridPreviewLayout(previewController, activeBreakpoint, activeCols) ?? [],
    [activeBreakpoint, activeCols, previewController],
  );
  const automaticLayout = useMemo(
    () => solveModeLayout(structuralLayout, 'automatic', activeCols),
    [activeCols, structuralLayout],
  );
  const automaticChanges = useMemo(
    () => listChanges(structuralLayout, automaticLayout),
    [automaticLayout, structuralLayout],
  );
  const selectedItem = findItem(modeLayout, selectedId) ?? modeLayout[0];
  const initialReviewController = useMemo(() => createScenarioController(scenario), [scenario]);
  const draftChangeSet = useMemo(() => {
    if (!draftReview) return null;
    return createGridEngineDraftChangeSet({
      sourceIdentity: draftReview.sourceIdentity,
      currentSourceIdentity: draftReview.currentSourceIdentity,
      inventory: draftReview.inventory,
      authority: draftReview.authority,
      breakpoints: DASHBOARD_GRID_BREAKPOINT_ORDER.map((breakpoint) => {
        const metadata = draftReview.breakpoints[breakpoint];
        const before = confirmedGridPreviewLayout(initialReviewController, breakpoint);
        const breakpointTouched = touchedBreakpoints.has(breakpoint)
          || (breakpoint === activeBreakpoint && preview !== null);
        const after = breakpointTouched
          ? breakpoint === activeBreakpoint && preview
            ? cloneLabLayout(preview.output)
            : displayGridPreviewLayout(previewController, breakpoint, colsForBreakpoint(breakpoint))
          : before;
        return {
          breakpoint,
          cols: colsForBreakpoint(breakpoint),
          before,
          after,
          mode: effectiveGridPreviewMode(previewController, breakpoint),
          origin: metadata.origin,
          baselineState: metadata.baselineState,
          explicitOverride: hasGridPreviewOverride(previewController, breakpoint),
          operationHint: breakpoint === activeBreakpoint && preview
            ? draftOperationHint(preview.intent)
            : operationHints[breakpoint],
        };
      }),
    });
  }, [
    activeBreakpoint,
    draftReview,
    initialReviewController,
    operationHints,
    preview,
    previewController,
    touchedBreakpoints,
  ]);

  const markBreakpointTouched = (
    breakpoint: DashboardGridBreakpoint,
    operationHint?: GridEngineDraftOperationHint,
  ) => {
    setTouchedBreakpoints((current) => new Set([...current, breakpoint]));
    if (operationHint) {
      setOperationHints((current) => ({ ...current, [breakpoint]: operationHint }));
    }
  };

  const syncControlsToItem = (item: GridLayoutItem, suggestedMove?: Readonly<{ x: number; y: number }>) => {
    setMoveX(String(suggestedMove?.x ?? item.x));
    setMoveY(String(suggestedMove?.y ?? item.y));
    setResizeW(String(item.w));
    setResizeH(String(item.h));
  };

  const commitPreview = (nextPreview: PreviewSnapshot) => {
    // Stage the exact validated array. Confirmation remains an explicit,
    // in-memory lab action and never triggers another solver pass.
    const committed = cloneLabLayout(nextPreview.output);
    setPreviewController((current) => stageGridPreviewLayout(current, activeBreakpoint, committed));
    markBreakpointTouched(activeBreakpoint, draftOperationHint(nextPreview.intent));
    const activeId = 'id' in nextPreview.intent ? nextPreview.intent.id : null;
    const active = activeId ? findItem(committed, activeId) : undefined;
    if (active) syncControlsToItem(active);
    setPreview(null);
    setRuntimeExpanded(false);
    setValidationError(null);
  };

  const gesture = useGridGesture({
    canvasRef: gestureCanvasRef,
    items: modeLayout,
    cols: activeCols,
    mode,
    metrics: GRID_ENGINE_LAB_METRICS,
    enabled: !runtimeExpanded && !preview,
    onActivate: (id) => {
      const item = findItem(modeLayout, id);
      setSelectedId(id);
      if (item) syncControlsToItem(item);
      setRuntimeExpanded(false);
      setValidationError(null);
    },
    onCommit: commitPreview,
    onCancel: () => setValidationError(null),
    onError: (error) => setValidationError(formatSolverError(error)),
  });

  const runtimeCalculation = useMemo(() => {
    if (!runtimeExpanded || !selectedItem) return { layout: modeLayout, error: null as string | null };
    try {
      return {
        layout: solveLayout({
          items: modeLayout,
          cols: activeCols,
          mode,
          intent: {
            type: 'RUNTIME_RESIZE',
            id: selectedItem.i,
            w: selectedItem.w + 1,
            h: selectedItem.h + 1,
            anchor: 'top-left',
          },
        }),
        error: null as string | null,
      };
    } catch (error) {
      return { layout: modeLayout, error: formatSolverError(error) };
    }
  }, [activeCols, mode, modeLayout, runtimeExpanded, selectedItem]);

  const displayLayout = gesture.state.preview?.output
    ?? (runtimeExpanded ? runtimeCalculation.layout : preview?.output ?? modeLayout);
  const displayedSelected = findItem(displayLayout, selectedId) ?? displayLayout[0];
  const referenceLayout = gesture.state.preview?.source
    ?? preview?.source
    ?? (runtimeExpanded ? modeLayout : confirmedLayout);
  const changes = useMemo(
    () => listChanges(referenceLayout, displayLayout),
    [displayLayout, referenceLayout],
  );
  const orderChanged = useMemo(
    () => layoutOrderChanged(referenceLayout, displayLayout),
    [displayLayout, referenceLayout],
  );
  const geometryIssues = useMemo(
    () => geometryIssueCounts(displayLayout, activeCols),
    [activeCols, displayLayout],
  );
  const shownError = validationError ?? runtimeCalculation.error;
  const stage = gesture.state.phase !== 'IDLE'
    ? gesture.state.phase[0] + gesture.state.phase.slice(1).toLowerCase()
    : runtimeExpanded
      ? 'Runtime preview'
      : preview
        ? 'Operation preview'
        : dirty
          ? 'Unconfirmed preview'
          : gridPreviewConfirmationRevision(previewController) > 0
            ? 'Confirmed in lab memory'
            : 'Initial fixture';

  const clearTransientState = () => {
    gesture.cancel();
    setPreview(null);
    setRuntimeExpanded(false);
    setValidationError(null);
  };

  const loadScenario = (nextScenario: GridEngineLabScenario) => {
    const nextPreviewController = createScenarioController(nextScenario);
    const selected = findItem(
      structuralGridPreviewLayout(nextPreviewController, activeBreakpoint) ?? [],
      nextScenario.selectedId,
    ) ?? nextScenario.items[0];
    const suggestedMove = {
      x: Math.round(
        nextScenario.suggestedMove.x * activeCols / (nextScenario.sourceCols ?? GRID_ENGINE_LAB_COLS),
      ),
      y: nextScenario.suggestedMove.y,
    };
    setScenarioId(nextScenario.id);
    setPreviewController(nextPreviewController);
    setSelectedId(nextScenario.selectedId);
    setOperation('MOVE');
    setAnchor('top-left');
    setTouchedBreakpoints(new Set());
    setOperationHints({});
    setShowDraftReview(false);
    syncControlsToItem(selected, suggestedMove);
    clearTransientState();
  };

  const handleSelect = (id: string) => {
    const item = findItem(modeLayout, id);
    if (!item) return;
    setSelectedId(id);
    syncControlsToItem(item);
    clearTransientState();
  };

  const handleModeChange = (nextMode: GridLayoutMode) => {
    setPreviewController((current) => (
      setGridPreviewPrimaryMode(current, nextMode, activeBreakpoint, activeCols)
    ));
    markBreakpointTouched(activeBreakpoint, nextMode === 'automatic' ? 'COMPACT' : 'UNKNOWN');
    clearTransientState();
  };

  const handleCanvasWidthChange = (nextWidth: number) => {
    if (!Number.isFinite(nextWidth) || nextWidth < 1) return;
    const normalizedWidth = Math.min(1920, Math.max(1, Math.round(nextWidth)));
    const nextBreakpoint = breakpointForCanvasWidth(normalizedWidth);
    const nextSelected = findItem(
      structuralGridPreviewLayout(previewController, nextBreakpoint) ?? [],
      selectedId,
    );
    gesture.cancel();
    setPreview(null);
    setRuntimeExpanded(false);
    setValidationError(null);
    if (nextSelected) syncControlsToItem(nextSelected);
    setCanvasWidth(normalizedWidth);
  };

  const selectBreakpoint = (breakpoint: DashboardGridBreakpoint) => {
    handleCanvasWidthChange(previewWidthForBreakpoint(breakpoint));
  };

  const handleRestoreAutomatic = () => {
    gesture.cancel();
    setPreviewController((current) => (
      restoreAutomaticGridPreviewBreakpoint(current, activeBreakpoint)
    ));
    markBreakpointTouched(activeBreakpoint, 'COMPACT');
    setPreview(null);
    setRuntimeExpanded(false);
    setValidationError(null);
  };

  const handleCreateOverride = () => {
    setPreviewController((current) => (
      createManualGridPreviewOverride(current, activeBreakpoint, activeCols)
    ));
    markBreakpointTouched(activeBreakpoint, 'UNKNOWN');
    clearTransientState();
  };

  const handleRemoveOverride = () => {
    setPreviewController((current) => removeGridPreviewOverride(current, activeBreakpoint));
    markBreakpointTouched(activeBreakpoint, 'UNKNOWN');
    clearTransientState();
  };

  const handleDeriveMissing = () => {
    setPreviewController((current) => (
      deriveSyntheticMissingGridPreview(current, activeBreakpoint, activeCols)
    ));
    markBreakpointTouched(activeBreakpoint, 'UNKNOWN');
    clearTransientState();
  };

  const handleResetPreview = () => {
    setPreviewController((current) => resetGridPreviewDraft(current));
    setOperationHints({});
    clearTransientState();
  };

  const handleUndo = () => {
    setPreviewController((current) => undoGridPreview(current));
    setOperationHints({});
    clearTransientState();
  };

  const handleRedo = () => {
    setPreviewController((current) => redoGridPreview(current));
    setOperationHints({});
    clearTransientState();
  };

  const handleOperationChange = (nextOperation: LabOperation) => {
    setOperation(nextOperation);
    if (selectedItem) syncControlsToItem(selectedItem);
    clearTransientState();
  };

  const buildIntent = (): GridLayoutIntent => {
    if (!selectedItem) {
      return { type: 'MOVE', id: '', x: Number.NaN, y: Number.NaN };
    }
    if (operation === 'MOVE') {
      return {
        type: 'MOVE',
        id: selectedItem.i,
        x: parseGridNumber(moveX),
        y: parseGridNumber(moveY),
      };
    }
    if (operation === 'REORDER') {
      return {
        type: 'REORDER',
        id: selectedItem.i,
        x: parseGridNumber(moveX),
        y: parseGridNumber(moveY),
      };
    }
    return {
      type: 'RESIZE',
      id: selectedItem.i,
      w: parseGridNumber(resizeW),
      h: parseGridNumber(resizeH),
      anchor,
    };
  };

  const handlePreview = () => {
    gesture.cancel();
    try {
      const intent = buildIntent();
      const source = cloneLabLayout(modeLayout);
      const output = solveLayout({ items: source, cols: activeCols, mode, intent });
      setPreview({ source, output, intent, mode });
      setRuntimeExpanded(false);
      setValidationError(null);
    } catch (error) {
      setPreview(null);
      setValidationError(formatSolverError(error));
    }
  };

  const handleConfirm = () => {
    if (!confirmableBreakpoint) return;
    if (preview) {
      markBreakpointTouched(activeBreakpoint, draftOperationHint(preview.intent));
      setPreviewController((current) => {
        const staged = stageGridPreviewLayout(current, activeBreakpoint, preview.output);
        return confirmGridPreviewInMemory(staged, activeBreakpoint, activeCols);
      });
      const activeId = 'id' in preview.intent ? preview.intent.id : null;
      const active = activeId ? findItem(preview.output, activeId) : undefined;
      if (active) syncControlsToItem(active);
      setPreview(null);
    } else {
      setPreviewController((current) => confirmGridPreviewInMemory(current, activeBreakpoint, activeCols));
    }
    setRuntimeExpanded(false);
    setValidationError(null);
  };

  const handleCompactPreview = () => {
    gesture.cancel();
    try {
      const source = cloneLabLayout(modeLayout);
      const intent = { type: 'COMPACT' } as const;
      const output = solveLayout({ items: source, cols: activeCols, mode, intent });
      setPreview({ source, output, intent, mode });
      setRuntimeExpanded(false);
      setValidationError(null);
    } catch (error) {
      setPreview(null);
      setValidationError(formatSolverError(error));
    }
  };

  const setModeControlsFromScenario = () => {
    const selected = findItem(
      structuralGridPreviewLayout(createScenarioController(scenario), activeBreakpoint) ?? [],
      scenario.selectedId,
    ) ?? scenario.items[0];
    if (selected) syncControlsToItem(selected, scenario.suggestedMove);
  };

  const handleReset = () => {
    setPreviewController((current) => resetGridPreviewController(current));
    setSelectedId(scenario.selectedId);
    setModeControlsFromScenario();
    setTouchedBreakpoints(new Set());
    setOperationHints({});
    setShowDraftReview(false);
    clearTransientState();
  };

  return (
    <section
      aria-labelledby="grid-engine-lab-title"
      className="dashboard-content-surface relative overflow-hidden rounded-[2rem] border border-white/[0.08] p-4 shadow-[0_30px_90px_rgba(0,0,0,0.22)] sm:p-6 lg:p-8"
    >
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-400/[0.08] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-violet-500/[0.07] blur-3xl" />

      <div className="relative space-y-7">
        <header className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-cyan-100/62">
              <FlaskConical className="h-4 w-4" aria-hidden="true" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em]">Isolated development surface</p>
            </div>
            <h2 id="grid-engine-lab-title" className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-white sm:text-3xl">
              {presentation === 'editor-preview'
                ? 'Grid Engine 2.0 — Editor sperimentale'
                : 'Grid Engine 2.0 — Laboratory'}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/58">
              {presentation === 'editor-preview'
                ? 'Copia isolata della configurazione visualizzata. Ogni modifica resta nella finestra e non può essere applicata alla Home.'
                : 'Fixture locali, preview deterministica e commit esplicito. Nessun dato di questa sezione viene letto o salvato nella Home reale.'}
            </p>
            <p className="mt-2 text-xs leading-5 text-white/38">
              Mouse: trascina direttamente. Touch: pressione prolungata di 650 ms; la maniglia superiore offre il fallback più affidabile senza bloccare lo scroll della pagina.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/[0.08] bg-white/[0.045] px-3 py-1.5 text-xs font-medium text-white/62">
              {activeBreakpoint} · {activeCols} columns · {canvasWidth}px
            </span>
            <span
              data-testid="responsive-origin"
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                layoutOrigin === 'custom' || layoutOrigin === 'preview' || layoutOrigin === 'provisional'
                  ? 'border-amber-300/25 bg-amber-300/[0.08] text-amber-100/78'
                  : layoutOrigin === 'missing'
                    ? 'border-rose-300/25 bg-rose-300/[0.08] text-rose-100/78'
                    : 'border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-100/72'
              }`}
            >
              {layoutOrigin === 'preview'
                ? 'Preview'
                : layoutOrigin === 'custom'
                  ? 'Custom'
                  : layoutOrigin === 'provisional'
                    ? 'Provisional'
                  : layoutOrigin === 'missing'
                    ? 'Missing'
                    : 'Generated'}
            </span>
            <span
              data-testid="preview-stage"
              className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.08] px-3 py-1.5 text-xs font-medium text-cyan-50/78"
            >
              <span aria-live="polite">{stage}</span>
            </span>
            <span data-testid="effective-mode" className="rounded-full border border-violet-300/20 bg-violet-300/[0.07] px-3 py-1.5 text-xs font-medium text-violet-100/78">
              Effective: {mode}
            </span>
            <span data-testid="override-status" className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-xs font-medium text-white/58">
              Override: {overridePresent ? 'manual' : 'none'}
            </span>
            <span data-testid="draft-status" className={`rounded-full border px-3 py-1.5 text-xs font-medium ${dirty ? 'border-amber-300/25 bg-amber-300/[0.08] text-amber-100/78' : 'border-white/[0.08] bg-white/[0.035] text-white/52'}`}>
              {dirty
                ? 'Unconfirmed changes'
                : presentation === 'editor-preview'
                  ? `Snapshot isolata · r${gridPreviewConfirmationRevision(previewController)}`
                  : `Saved in lab · r${gridPreviewConfirmationRevision(previewController)}`}
            </span>
            {draftChangeSet ? (
              <button
                type="button"
                data-testid="review-draft-changes"
                aria-expanded={showDraftReview}
                onClick={() => setShowDraftReview((current) => !current)}
                className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/[0.08] px-3 py-1.5 text-xs font-semibold text-cyan-50 transition hover:bg-cyan-300/[0.13] active:scale-95"
              >
                <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
                Rivedi modifiche
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.045] px-3 py-1.5 text-xs font-semibold text-white/72 transition-all hover:bg-white/[0.08] hover:text-white active:scale-95"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {presentation === 'editor-preview' ? 'Reset anteprima' : 'Reset fixture'}
            </button>
          </div>
        </header>

        {context ? <div data-testid="grid-editor-preview-context">{context}</div> : null}

        {showDraftReview && draftChangeSet ? (
          <section
            data-testid="grid-engine-draft-review"
            aria-labelledby="grid-engine-draft-review-title"
            className="space-y-4 rounded-[1.5rem] border border-cyan-300/20 bg-cyan-300/[0.045] p-4 sm:p-5"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/55">
                  Change set V{draftChangeSet.version} · staging in memoria
                </p>
                <h3 id="grid-engine-draft-review-title" className="mt-1 text-lg font-semibold text-white/90">
                  Rivedi modifiche
                </h3>
                <p className="mt-1 text-xs leading-5 text-white/50">
                  {draftChangeSet.changedRootCount} card modificate ·{' '}
                  {draftChangeSet.affectedBreakpoints.length > 0
                    ? draftChangeSet.affectedBreakpoints.map((entry) => entry.toUpperCase()).join(', ')
                    : 'nessun breakpoint'}
                  {' · '}{draftChangeSet.modes.length > 0 ? draftChangeSet.modes.join(' / ') : 'nessuna modalità'}
                </p>
              </div>
              <span
                data-testid="draft-applicability-status"
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  draftChangeSet.applicability.state === 'no-changes'
                    ? 'border-white/[0.1] bg-white/[0.04] text-white/60'
                    : draftChangeSet.applicability.geometricallyValid
                      ? 'border-amber-300/25 bg-amber-300/[0.08] text-amber-100'
                      : 'border-rose-300/25 bg-rose-300/[0.08] text-rose-100'
                }`}
              >
                {draftChangeSet.applicability.state}
              </span>
            </div>

            <div className="grid gap-2 text-xs sm:grid-cols-3">
              <div className={`rounded-xl border p-3 ${draftChangeSet.applicability.geometricallyValid ? 'border-emerald-300/15 bg-emerald-300/[0.05]' : 'border-rose-300/20 bg-rose-300/[0.06]'}`}>
                <strong className="block text-white/82">Geometria</strong>
                <span className="mt-1 block text-white/52">
                  {draftChangeSet.applicability.geometricallyValid ? 'Valida' : 'Non valida'}
                </span>
              </div>
              <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.04] p-3">
                <strong className="block text-white/82">Preview</strong>
                <span className="mt-1 block text-white/52">
                  {draftChangeSet.applicability.previewable ? 'Visualizzabile in memoria' : 'Nessuna proposta valida'}
                </span>
              </div>
              <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-3">
                <strong className="block text-white/82">Draft editor</strong>
                <span className="mt-1 block text-amber-100/75">Applicazione bloccata</span>
              </div>
            </div>

            {draftChangeSet.changes.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
                <table className="min-w-[880px] text-left text-xs">
                  <thead className="bg-white/[0.04] text-[10px] uppercase tracking-[0.12em] text-white/45">
                    <tr>
                      <th className="px-3 py-2">Card</th>
                      <th className="px-3 py-2">Breakpoint</th>
                      <th className="px-3 py-2">Prima</th>
                      <th className="px-3 py-2">Dopo</th>
                      <th className="px-3 py-2">Operazione</th>
                      <th className="px-3 py-2">Contesto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draftChangeSet.changes.map((change) => (
                      <tr
                        key={`${change.breakpoint}:${change.rootId}`}
                        data-testid={`draft-change-${change.breakpoint}-${change.rootId}`}
                        className="border-t border-white/[0.06]"
                      >
                        <td className="px-3 py-2">
                          <strong className="block text-white/82">{change.title}</strong>
                          <code className="text-[10px] text-cyan-100/55">{change.rootId}</code>
                        </td>
                        <td className="px-3 py-2 font-semibold text-white/70">{change.breakpoint.toUpperCase()}</td>
                        <td className="px-3 py-2 font-mono text-white/58">{geometry(change.before)}</td>
                        <td className="px-3 py-2 font-mono text-cyan-50/78">{geometry(change.after)}</td>
                        <td className="px-3 py-2">{change.operation}</td>
                        <td className="px-3 py-2 text-white/48">
                          {change.mode} · {change.origin} · {change.baselineState}
                          {change.explicitOverride ? ' · override esplicito' : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p data-testid="draft-review-no-changes" className="rounded-xl border border-white/[0.07] bg-black/10 px-4 py-3 text-sm text-white/55">
                Nessuna differenza geometrica effettiva rispetto alla snapshot iniziale.
              </p>
            )}

            {draftChangeSet.issues.length > 0 ? (
              <div data-testid="draft-review-blockers" className="rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-4">
                <strong className="text-sm text-amber-50/90">Motivi e controlli preflight</strong>
                <ul className="mt-2 space-y-1 text-xs leading-5 text-amber-50/68">
                  {draftChangeSet.issues.slice(0, 8).map((entry, index) => (
                    <li key={`${entry.code}:${entry.breakpoint ?? 'global'}:${entry.rootId ?? index}`}>
                      <code className="mr-2 text-[10px] text-amber-100/80">{entry.code}</code>
                      {entry.message}
                    </li>
                  ))}
                </ul>
                {draftChangeSet.issues.length > 8 ? (
                  <p className="mt-2 text-[10px] text-amber-100/55">
                    Altri {draftChangeSet.issues.length - 8} rilievi disponibili nel change set tipizzato.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-2 text-xs md:grid-cols-3">
              <div className="rounded-xl border border-emerald-300/15 bg-emerald-300/[0.045] p-3 text-emerald-50/70">
                <strong className="block text-emerald-50/90">Conferma nella preview</strong>
                Disponibile tramite il comando locale; resta nella sessione sperimentale.
              </div>
              <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-3 text-amber-50/70">
                <strong className="block text-amber-50/90">Applica al draft dell’editor</strong>
                Non disponibile: autorità strutturale e quarantena del salvataggio non presenti.
              </div>
              <div className="rounded-xl border border-rose-300/20 bg-rose-300/[0.055] p-3 text-rose-50/70">
                <strong className="block text-rose-50/90">Salva su Home Assistant</strong>
                Non disponibile in questa fase.
              </div>
            </div>
          </section>
        ) : null}

        {scenarioList.length > 1 ? <div className="flex gap-3 overflow-x-auto pb-1">
          {scenarioList.map((entry) => (
            <ScenarioButton
              key={entry.id}
              scenario={entry}
              selected={scenario.id === entry.id}
              onClick={() => loadScenario(entry)}
            />
          ))}
        </div> : null}

        <section
          aria-labelledby="responsive-lab-title"
          className="rounded-[1.5rem] border border-white/[0.07] bg-black/15 p-4"
        >
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-cyan-100/58">
                <Gauge className="h-4 w-4" aria-hidden="true" />
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em]">Responsive builder</p>
              </div>
              <h3 id="responsive-lab-title" className="mt-1 text-sm font-semibold text-white/86">
                Viewport reale del canvas
              </h3>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-white/42">
                Ogni vista generated viene derivata direttamente dal riferimento Desktop; le viste custom restano isolate in memoria.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {RESPONSIVE_VIEW_CHOICES.map((choice) => {
                const Icon = choice.icon;
                const selected = activeProfile === choice.label;
                return (
                  <button
                    key={choice.label}
                    type="button"
                    aria-label={`Vista ${choice.label}`}
                    aria-pressed={selected}
                    onClick={() => selectBreakpoint(choice.breakpoint)}
                    className={`flex min-w-24 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition ${
                      selected
                        ? 'border-cyan-300/30 bg-cyan-300/[0.1] text-cyan-50'
                        : 'border-white/[0.07] bg-white/[0.025] text-white/48 hover:text-white/75'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {choice.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <label className="space-y-1.5 text-xs text-white/52">
              <span>Larghezza canvas</span>
              <input
                type="number"
                min="1"
                max="1920"
                inputMode="numeric"
                aria-label="Larghezza canvas"
                value={canvasWidth}
                onChange={(event) => handleCanvasWidthChange(Number(event.target.value))}
                className="w-full rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2.5 font-mono text-sm text-white outline-none transition focus:border-cyan-300/35"
              />
            </label>
            <button
              type="button"
              onClick={handleRestoreAutomatic}
              disabled={missingBreakpoint || provisionalBreakpoint || (layoutOrigin === 'generated' && !overridePresent)}
              className="rounded-xl border border-emerald-300/20 bg-emerald-300/[0.07] px-4 py-2.5 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-300/[0.12] disabled:cursor-not-allowed disabled:opacity-35"
            >
              Ripristina layout generated
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {!overridePresent ? (
              <button
                type="button"
                onClick={handleCreateOverride}
                disabled={missingBreakpoint && !syntheticMissingPreview}
                className="rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-300/[0.11] disabled:cursor-not-allowed disabled:opacity-35"
              >
                Crea override manuale {activeBreakpoint.toUpperCase()}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleRemoveOverride}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-300/20 bg-rose-300/[0.06] px-3 py-2 text-xs font-semibold text-rose-100 transition hover:bg-rose-300/[0.11]"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Elimina override preview
              </button>
            )}
            {missingBreakpoint && !syntheticMissingPreview ? (
              <button
                type="button"
                onClick={handleDeriveMissing}
                className="rounded-xl border border-amber-300/25 bg-amber-300/[0.08] px-3 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-300/[0.13]"
              >
                Deriva preview sintetica non persistita
              </button>
            ) : null}
          </div>

          {missingBreakpoint ? (
            <p data-testid="missing-breakpoint-status" className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-3 py-2 text-xs leading-5 text-amber-100/78">
              {syntheticMissingPreview
                ? 'Geometria sintetica visibile: il breakpoint resta missing e non può essere confermato.'
                : 'Geometria mancante: nessuna baseline viene inventata o promossa.'}
            </p>
          ) : null}

          {provisionalBreakpoint ? (
            <p data-testid="provisional-breakpoint-status" className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-3 py-2 text-xs leading-5 text-amber-100/78">
              Geometria provvisoria visibile: {breakpointStatus?.validItemCount ?? structuralLayout.length} root validi
              {breakpointStatus ? ` su ${breakpointStatus.itemCount} coordinate sorgente` : ''}.
              {' '}Gli ID legacy, duplicati o non validi restano esclusi; questa baseline non Ã¨ autorevole nÃ© confermabile.
            </p>
          ) : null}

          <details className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <summary className="cursor-pointer text-xs font-semibold text-white/58">Pannello avanzato · sei breakpoint reali</summary>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
              {RESPONSIVE_LAB_BREAKPOINTS.map((entry) => (
                <button
                  key={entry.breakpoint}
                  type="button"
                  aria-label={`Breakpoint ${entry.breakpoint}`}
                  aria-pressed={activeBreakpoint === entry.breakpoint}
                  onClick={() => selectBreakpoint(entry.breakpoint)}
                  className={`rounded-xl border px-3 py-2 text-left font-mono text-[10px] transition ${
                    activeBreakpoint === entry.breakpoint
                      ? 'border-violet-300/30 bg-violet-300/[0.1] text-violet-50'
                      : 'border-white/[0.06] text-white/45 hover:text-white/72'
                  }`}
                >
                  <span className="block font-semibold uppercase">{entry.breakpoint}</span>
                  <span className="mt-0.5 block">{previewWidthForBreakpoint(entry.breakpoint)}px · {entry.cols} col</span>
                </button>
              ))}
            </div>
          </details>

          <dl className="mt-4 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-5">
            <div className="rounded-xl bg-white/[0.025] p-2.5">
              <dt className="text-white/35">Profilo</dt>
              <dd data-testid="responsive-profile" className="mt-1 font-mono text-white/72">{activeProfile}</dd>
            </div>
            <div className="rounded-xl bg-white/[0.025] p-2.5">
              <dt className="text-white/35">Canvas</dt>
              <dd data-testid="responsive-canvas-width" className="mt-1 font-mono text-white/72">{canvasWidth}px</dd>
            </div>
            <div className="rounded-xl bg-white/[0.025] p-2.5">
              <dt className="text-white/35">Breakpoint</dt>
              <dd data-testid="responsive-breakpoint" className="mt-1 font-mono text-white/72">{activeBreakpoint}</dd>
            </div>
            <div className="rounded-xl bg-white/[0.025] p-2.5">
              <dt className="text-white/35">Colonne</dt>
              <dd data-testid="responsive-cols" className="mt-1 font-mono text-white/72">{activeCols}</dd>
            </div>
            <div className="rounded-xl bg-white/[0.025] p-2.5">
              <dt className="text-white/35">Derivazione</dt>
              <dd
                data-testid="responsive-derive-duration"
                data-duration-ms={responsiveCalculation.durationMs.toFixed(3)}
                className="mt-1 font-mono text-white/72"
              >
                {responsiveCalculation.durationMs.toFixed(3)} ms
              </dd>
            </div>
          </dl>
        </section>

        <div className="grid gap-4 xl:grid-cols-[20rem_minmax(0,1fr)]">
          <aside className="space-y-4 rounded-[1.5rem] border border-white/[0.07] bg-black/15 p-4">
            <div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/38">Solver mode</p>
                <span
                  data-testid="solver-mode-status"
                  className="font-mono text-[10px] uppercase text-cyan-100/62"
                >
                  {mode}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 rounded-xl border border-white/[0.07] bg-black/20 p-1">
                {(['automatic', 'manual'] as const).map((entry) => (
                  <button
                    key={entry}
                    type="button"
                    aria-pressed={primaryMode === entry}
                    onClick={() => handleModeChange(entry)}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold capitalize transition-all ${
                      primaryMode === entry ? 'bg-white/[0.11] text-white shadow-sm' : 'text-white/42 hover:text-white/72'
                    }`}
                  >
                    {entry}
                  </button>
                ))}
              </div>
              <p data-testid="mode-effect" className="mt-2 text-[10px] leading-4 text-white/42">
                {mode === 'manual'
                  ? 'Manual: gli spazi non coinvolti restano invariati.'
                  : automaticChanges.length === 0
                    ? 'Automatic · COMPACT: il layout è già compatto.'
                    : `Automatic · COMPACT: ${automaticChanges.length} geometrie ricollocate.`}
              </p>
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/38">Operation</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  aria-pressed={operation === 'MOVE'}
                  onClick={() => handleOperationChange('MOVE')}
                  className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-all ${
                    operation === 'MOVE'
                      ? 'border-cyan-300/30 bg-cyan-300/[0.09] text-cyan-50'
                      : 'border-white/[0.07] bg-white/[0.025] text-white/48 hover:text-white/75'
                  }`}
                >
                  <Move className="h-3.5 w-3.5" aria-hidden="true" />
                  Move
                </button>
                <button
                  type="button"
                  aria-pressed={operation === 'REORDER'}
                  onClick={() => handleOperationChange('REORDER')}
                  className={`flex items-center justify-center gap-2 rounded-xl border px-2 py-2.5 text-xs font-semibold transition-all ${
                    operation === 'REORDER'
                      ? 'border-cyan-300/30 bg-cyan-300/[0.09] text-cyan-50'
                      : 'border-white/[0.07] bg-white/[0.025] text-white/48 hover:text-white/75'
                  }`}
                >
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  Reorder
                </button>
                <button
                  type="button"
                  aria-pressed={operation === 'RESIZE'}
                  onClick={() => handleOperationChange('RESIZE')}
                  className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-all ${
                    operation === 'RESIZE'
                      ? 'border-cyan-300/30 bg-cyan-300/[0.09] text-cyan-50'
                      : 'border-white/[0.07] bg-white/[0.025] text-white/48 hover:text-white/75'
                  }`}
                >
                  <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Resize
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">Selected card</p>
              <p className="mt-1 truncate text-sm font-semibold text-white/86">{selectedItem?.i ?? '—'}</p>
              <p className="mt-0.5 font-mono text-[11px] text-white/46">{selectedItem ? geometry(selectedItem) : 'No geometry'}</p>
            </div>

            {operation !== 'RESIZE' ? (
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1.5 text-xs text-white/52">
                  <span>Destinazione X</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    aria-label="Destinazione X"
                    value={moveX}
                    onChange={(event) => setMoveX(event.target.value)}
                    className="w-full rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2.5 font-mono text-sm text-white outline-none transition focus:border-cyan-300/35"
                  />
                </label>
                <label className="space-y-1.5 text-xs text-white/52">
                  <span>Destinazione Y</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    aria-label="Destinazione Y"
                    value={moveY}
                    onChange={(event) => setMoveY(event.target.value)}
                    className="w-full rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2.5 font-mono text-sm text-white outline-none transition focus:border-cyan-300/35"
                  />
                </label>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1.5 text-xs text-white/52">
                    <span>Larghezza W</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      aria-label="Larghezza W"
                      value={resizeW}
                      onChange={(event) => setResizeW(event.target.value)}
                      className="w-full rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2.5 font-mono text-sm text-white outline-none transition focus:border-cyan-300/35"
                    />
                  </label>
                  <label className="space-y-1.5 text-xs text-white/52">
                    <span>Altezza H</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      aria-label="Altezza H"
                      value={resizeH}
                      onChange={(event) => setResizeH(event.target.value)}
                      className="w-full rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2.5 font-mono text-sm text-white outline-none transition focus:border-cyan-300/35"
                    />
                  </label>
                </div>
                <label className="block space-y-1.5 text-xs text-white/52">
                  <span>Resize anchor</span>
                  <select
                    aria-label="Resize anchor"
                    value={anchor}
                    onChange={(event) => setAnchor(event.target.value as GridResizeAnchor)}
                    className="w-full rounded-xl border border-white/[0.08] bg-[#11151d] px-3 py-2.5 text-sm text-white outline-none transition focus:border-cyan-300/35"
                  >
                    {RESIZE_ANCHORS.map((entry) => (
                      <option key={entry.value} value={entry.value}>{entry.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handlePreview}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-300 px-3 py-2.5 text-xs font-bold text-[#071018] transition-all hover:bg-cyan-200 active:scale-[0.98]"
              >
                <ScanLine className="h-3.5 w-3.5" aria-hidden="true" />
                Anteprima
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={(!preview && !dirty) || !confirmableBreakpoint}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-300/[0.08] px-3 py-2.5 text-xs font-bold text-emerald-100 transition-all hover:bg-emerald-300/[0.13] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                Conferma in memoria
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={handleUndo}
                disabled={previewController.past.length === 0}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] px-2 py-2 text-[11px] font-semibold text-white/58 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                Annulla
              </button>
              <button
                type="button"
                onClick={handleRedo}
                disabled={previewController.future.length === 0}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] px-2 py-2 text-[11px] font-semibold text-white/58 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Redo2 className="h-3.5 w-3.5" aria-hidden="true" />
                Ripristina
              </button>
              <button
                type="button"
                onClick={handleResetPreview}
                disabled={!dirty}
                className="rounded-xl border border-white/[0.08] px-2 py-2 text-[11px] font-semibold text-white/58 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
              >
                Reset preview
              </button>
            </div>

            <button
              type="button"
              onClick={handleCompactPreview}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-violet-300/20 bg-violet-300/[0.06] px-3 py-2.5 text-xs font-semibold text-violet-100/78 transition hover:bg-violet-300/[0.11]"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Compatta layout
            </button>

            {preview ? (
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-white/45 transition hover:bg-white/[0.04] hover:text-white/72"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Annulla anteprima
              </button>
            ) : null}

            <div className="border-t border-white/[0.07] pt-4">
              <button
                type="button"
                aria-pressed={runtimeExpanded}
                disabled={Boolean(preview) || gesture.state.phase !== 'IDLE'}
                onClick={() => {
                  setRuntimeExpanded((current) => !current);
                  setValidationError(null);
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-35 ${
                  runtimeExpanded
                    ? 'border-violet-300/30 bg-violet-300/[0.1] text-violet-50'
                    : 'border-white/[0.07] bg-white/[0.025] text-white/62 hover:bg-white/[0.05]'
                }`}
              >
                <span>
                  <span className="block text-xs font-semibold">Simula espansione Light / dispositivo</span>
                  <span data-testid="runtime-expansion-status" className="mt-1 block text-[10px] leading-4 opacity-55">RUNTIME_RESIZE +1W / +1H · baseline immutata</span>
                </span>
                <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
              </button>
            </div>
          </aside>

          <div className="min-w-0 space-y-4">
            {shownError ? (
              <div role="alert" className="rounded-xl border border-rose-300/25 bg-rose-300/[0.08] px-4 py-3 text-sm text-rose-100">
                {shownError}
              </div>
            ) : null}

            {renderItem ? (
              <div className="space-y-4">
                <div className="min-w-0 space-y-2">
                  <div className="flex items-center justify-between gap-3 px-1">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-cyan-100/48">After · card autentiche</p>
                      <h3 className="text-sm font-semibold text-white/82">Grid Engine 2.0 · visual-only</h3>
                    </div>
                    <span className="text-[10px] text-white/36">seleziona, trascina o ridimensiona</span>
                  </div>
                  <GridGestureCanvas
                    ref={gestureCanvasRef}
                    items={displayLayout}
                    selectedId={selectedId}
                    onSelect={handleSelect}
                    testIdPrefix="result"
                    gesture={gesture}
                    gestureEnabled={!runtimeExpanded && !preview}
                    cols={activeCols}
                    canvasWidth={canvasWidth}
                    breakpoint={activeBreakpoint}
                    metrics={GRID_ENGINE_LAB_METRICS}
                    itemKinds={scenario.itemKinds}
                    renderItem={renderItem}
                  />
                </div>

                <details
                  data-testid="experimental-before-diagnostics"
                  className="rounded-[1.2rem] border border-white/[0.07] bg-black/10 p-3"
                >
                  <summary className="cursor-pointer text-xs font-semibold text-white/58">
                    Diagnostica avanzata · BEFORE strutturale
                  </summary>
                  <div className="mt-3 min-w-0 space-y-2">
                    <div className="flex items-center justify-between gap-3 px-1">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-white/38">Before</p>
                        <h3 className="text-sm font-semibold text-white/82">Riferimento strutturale</h3>
                      </div>
                      <span className="text-[10px] text-white/36">read only</span>
                    </div>
                    <GridGestureCanvas
                      items={referenceLayout}
                      selectedId={selectedId}
                      testIdPrefix="reference"
                      cols={activeCols}
                      canvasWidth={canvasWidth}
                      breakpoint={activeBreakpoint}
                      metrics={GRID_ENGINE_LAB_METRICS}
                      itemKinds={scenario.itemKinds}
                    />
                  </div>
                </details>
              </div>
            ) : (
              <div className="grid gap-4 2xl:grid-cols-2">
                <div className="min-w-0 space-y-2">
                  <div className="flex items-center justify-between gap-3 px-1">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-white/38">Before</p>
                      <h3 className="text-sm font-semibold text-white/82">Riferimento strutturale</h3>
                    </div>
                    <span className="text-[10px] text-white/36">read only</span>
                  </div>
                  <GridGestureCanvas
                    items={referenceLayout}
                    selectedId={selectedId}
                    testIdPrefix="reference"
                    cols={activeCols}
                    canvasWidth={canvasWidth}
                    breakpoint={activeBreakpoint}
                    metrics={GRID_ENGINE_LAB_METRICS}
                    itemKinds={scenario.itemKinds}
                  />
                </div>

                <div className="min-w-0 space-y-2">
                  <div className="flex items-center justify-between gap-3 px-1">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-cyan-100/48">After</p>
                      <h3 className="text-sm font-semibold text-white/82">Grid Engine 2.0</h3>
                    </div>
                    <span className="text-[10px] text-white/36">click, drag or resize</span>
                  </div>
                  <GridGestureCanvas
                    ref={gestureCanvasRef}
                    items={displayLayout}
                    selectedId={selectedId}
                    onSelect={handleSelect}
                    testIdPrefix="result"
                    gesture={gesture}
                    gestureEnabled={!runtimeExpanded && !preview}
                    cols={activeCols}
                    canvasWidth={canvasWidth}
                    breakpoint={activeBreakpoint}
                    metrics={GRID_ENGINE_LAB_METRICS}
                    itemKinds={scenario.itemKinds}
                  />
                </div>
              </div>
            )}

            <div className="min-w-0 space-y-2 rounded-[1.4rem] border border-violet-300/[0.12] bg-violet-300/[0.025] p-3">
              <div className="flex flex-col gap-2 px-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-violet-100/48">Renderer experiment B</p>
                  <h3 className="text-sm font-semibold text-white/82">React Grid Layout · sola lettura controllata</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] leading-4 text-white/38">
                    drag off · resize off · compactType=null
                  </span>
                  <button
                    type="button"
                    aria-label={showRglExperiment ? 'Nascondi esperimento RGL' : 'Mostra esperimento RGL'}
                    onClick={() => setShowRglExperiment((current) => !current)}
                    className="rounded-lg border border-white/[0.08] px-2.5 py-1 text-[10px] font-semibold text-white/52 transition hover:text-white"
                  >
                    {showRglExperiment ? 'Nascondi' : 'Mostra'}
                  </button>
                </div>
              </div>
              {showRglExperiment ? (
                <RglReadOnlyCanvas items={displayLayout} cols={activeCols} width={canvasWidth} />
              ) : (
                <div
                  data-testid="rgl-experiment-disabled"
                  className="rounded-xl border border-dashed border-white/[0.08] px-4 py-6 text-center text-xs text-white/35"
                >
                  Renderer RGL escluso dalla misurazione.
                </div>
              )}
              <p className="px-1 text-[10px] leading-4 text-white/36">
                Il callback interno viene confrontato con le coordinate del solver. Nessuna coordinata emessa da RGL viene riutilizzata dal laboratorio.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="rounded-[1.4rem] border border-white/[0.07] bg-black/15 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-white/38">Debug trace</p>
                <h3 className="mt-1 text-sm font-semibold text-white/84">Calculation context</h3>
              </div>
              <div className="flex gap-2 font-mono text-[10px] text-white/52">
                <span className="rounded-full bg-white/[0.045] px-2.5 py-1">mode={mode}</span>
                <span className="rounded-full bg-white/[0.045] px-2.5 py-1">bp={activeBreakpoint}</span>
                <span className="rounded-full bg-white/[0.045] px-2.5 py-1">cols={activeCols}</span>
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
              <dt className="text-white/36">Scenario</dt>
              <dd className="text-right font-medium text-white/72">{scenario.title}</dd>
              <dt className="text-white/36">Selected</dt>
              <dd className="text-right font-mono text-white/72">{selectedItem?.i ?? '—'}</dd>
              <dt className="text-white/36">Operation</dt>
              <dd data-testid="current-operation" className="text-right font-mono text-white/72">
                {gesture.state.preview?.intent.type ?? (runtimeExpanded ? 'RUNTIME_RESIZE' : preview?.intent.type ?? operation)}
              </dd>
              <dt className="text-white/36">Mode effect</dt>
              <dd className="text-right font-mono text-white/72">
                {mode === 'automatic' ? 'COMPACT' : 'NONE'}
              </dd>
              <dt className="text-white/36">Primary / effective</dt>
              <dd className="text-right font-mono text-white/72">{primaryMode} / {mode}</dd>
              <dt className="text-white/36">Override</dt>
              <dd className="text-right font-mono text-white/72">
                {overridePresent ? activeBreakpoint : 'none'}
              </dd>
              <dt className="text-white/36">Stage</dt>
              <dd className="text-right font-medium text-white/72">{stage}</dd>
              <dt className="text-white/36">Layout source</dt>
              <dd className="text-right font-medium capitalize text-white/72">{layoutOrigin}</dd>
              <dt className="text-white/36">Validation</dt>
              <dd data-testid="preview-validation" className="text-right font-mono text-white/72">
                collisions={geometryIssues.collisions} / out={geometryIssues.outOfBounds}
              </dd>
              <dt className="text-white/36">Final selected</dt>
              <dd data-testid="final-selected-position" className="text-right font-mono text-white/72">
                {displayedSelected
                  ? `${displayedSelected.i} · x${displayedSelected.x} y${displayedSelected.y}`
                  : '—'}
              </dd>
              {preview ? (
                <>
                  <dt className="text-white/36">Preview mode</dt>
                  <dd className="text-right font-mono text-white/72">{preview.mode}</dd>
                </>
              ) : null}
            </dl>

            <div className="mt-4 border-t border-white/[0.07] pt-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/38">
                Changed elements · {changes.length}
              </p>
              <p data-testid="order-change-status" className="mt-1 text-[10px] text-white/38">
                Order: {orderChanged ? 'changed' : 'stable'} · Dimensions: {changes.filter((change) => change.before.w !== change.after.w || change.before.h !== change.after.h).length} changed
              </p>
              {changes.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {changes.map((change) => (
                    <div key={change.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white/[0.025] px-3 py-2 font-mono text-[10px] text-white/55">
                      <span className="font-semibold text-white/78">{change.id}</span>
                      <span>{geometry(change.before)}</span>
                      <ArrowRight className="h-3 w-3 text-cyan-200/50" aria-hidden="true" />
                      <span>{geometry(change.after)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-white/38">Nessuna geometria modificata.</p>
              )}
            </div>
          </div>

          <div className="rounded-[1.4rem] border border-white/[0.07] bg-black/15 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-white/38">Coordinates</p>
                <h3 className="mt-1 text-sm font-semibold text-white/84">Input / output snapshot</h3>
              </div>
              <span className="rounded-full border border-white/[0.07] px-2.5 py-1 font-mono text-[10px] text-white/42">
                deterministic
              </span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <CoordinateTable items={confirmedLayout} label={`${activeBreakpoint} confirmed in lab`} />
              <CoordinateTable items={structuralLayout} label={`${activeBreakpoint} structural preview · ${activeCols} col`} />
              <CoordinateTable items={displayLayout} label="Final / preview" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default GridEngineLab;
