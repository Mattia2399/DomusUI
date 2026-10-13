import { useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
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
  X,
} from 'lucide-react';
import type { DashboardGridBreakpoint } from '../../../types/widgetTypeLayout';
import {
  GRID_ENGINE_LAB_COLS,
  GRID_ENGINE_LAB_ROW_HEIGHT,
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
import { GridGestureCanvas } from './GridGestureCanvas';
import { RglReadOnlyCanvas } from './RglReadOnlyCanvas';
import { useGridGesture, type GridGesturePreview } from './useGridGesture';
import {
  RESPONSIVE_LAB_BREAKPOINTS,
  breakpointForCanvasWidth,
  colsForBreakpoint,
  commitBreakpointLayout,
  createResponsiveLabState,
  layoutForBreakpoint,
  originForBreakpoint,
  previewWidthForBreakpoint,
  restoreAutomaticBreakpoint,
} from './responsiveLayout';

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
const INITIAL_RESPONSIVE_STATE = createResponsiveLabState(
  INITIAL_LAB_SCENARIO.items,
  GRID_ENGINE_LAB_COLS,
);

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

export function GridEngineLab() {
  const initialScenario = INITIAL_LAB_SCENARIO;
  const [scenarioId, setScenarioId] = useState(initialScenario.id);
  const [responsiveState, setResponsiveState] = useState(
    () => INITIAL_RESPONSIVE_STATE,
  );
  const [canvasWidth, setCanvasWidth] = useState(previewWidthForBreakpoint('xl'));
  const [selectedId, setSelectedId] = useState(initialScenario.selectedId);
  const [mode, setMode] = useState<GridLayoutMode>('manual');
  const [operation, setOperation] = useState<LabOperation>('MOVE');
  const [moveX, setMoveX] = useState(String(initialScenario.suggestedMove.x));
  const [moveY, setMoveY] = useState(String(initialScenario.suggestedMove.y));
  const initialSelected = findItem(INITIAL_RESPONSIVE_STATE.reference, initialScenario.selectedId)!;
  const [resizeW, setResizeW] = useState(String(initialSelected.w));
  const [resizeH, setResizeH] = useState(String(initialSelected.h));
  const [anchor, setAnchor] = useState<GridResizeAnchor>('top-left');
  const [preview, setPreview] = useState<PreviewSnapshot | null>(null);
  const [committedSnapshot, setCommittedSnapshot] = useState<GridLayoutItem[] | null>(null);
  const [runtimeExpanded, setRuntimeExpanded] = useState(false);
  const [showRglExperiment, setShowRglExperiment] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);
  const gestureCanvasRef = useRef<HTMLDivElement>(null);

  const scenario = GRID_ENGINE_LAB_SCENARIOS.find((entry) => entry.id === scenarioId) ?? initialScenario;
  const activeBreakpoint = breakpointForCanvasWidth(canvasWidth);
  const activeCols = colsForBreakpoint(activeBreakpoint);
  const activeProfile = profileForBreakpoint(activeBreakpoint);
  const responsiveCalculation = useMemo(() => {
    const startedAt = performance.now();
    const layout = layoutForBreakpoint(responsiveState, activeBreakpoint);
    return { layout, durationMs: performance.now() - startedAt };
  }, [activeBreakpoint, responsiveState]);
  const structuralLayout = responsiveCalculation.layout;
  const layoutOrigin = originForBreakpoint(responsiveState, activeBreakpoint);
  const modeLayout = useMemo(
    () => committedSnapshot ?? solveModeLayout(structuralLayout, mode, activeCols),
    [activeCols, committedSnapshot, mode, structuralLayout],
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

  const syncControlsToItem = (item: GridLayoutItem, suggestedMove?: Readonly<{ x: number; y: number }>) => {
    setMoveX(String(suggestedMove?.x ?? item.x));
    setMoveY(String(suggestedMove?.y ?? item.y));
    setResizeW(String(item.w));
    setResizeH(String(item.h));
  };

  const commitPreview = (nextPreview: PreviewSnapshot) => {
    // Commit the exact validated array. committedSnapshot prevents a second
    // solver pass from changing what was visible at pointer release.
    const committed = cloneLabLayout(nextPreview.output);
    setResponsiveState((current) => commitBreakpointLayout(current, activeBreakpoint, committed));
    setCommittedSnapshot(committed);
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
    rowHeight: GRID_ENGINE_LAB_ROW_HEIGHT,
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
    ?? (runtimeExpanded ? modeLayout : structuralLayout);
  const changes = useMemo(
    () => listChanges(referenceLayout, displayLayout),
    [displayLayout, referenceLayout],
  );
  const shownError = validationError ?? runtimeCalculation.error;
  const stage = gesture.state.phase !== 'IDLE'
    ? gesture.state.phase[0] + gesture.state.phase.slice(1).toLowerCase()
    : runtimeExpanded
      ? 'Runtime preview'
      : preview
        ? 'Operation preview'
        : 'Committed';

  const clearTransientState = () => {
    gesture.cancel();
    setPreview(null);
    setRuntimeExpanded(false);
    setValidationError(null);
  };

  const loadScenario = (nextScenario: GridEngineLabScenario) => {
    const nextResponsiveState = createResponsiveLabState(nextScenario.items, GRID_ENGINE_LAB_COLS);
    const selected = findItem(
      layoutForBreakpoint(nextResponsiveState, activeBreakpoint),
      nextScenario.selectedId,
    )!;
    const suggestedMove = {
      x: Math.round(nextScenario.suggestedMove.x * activeCols / GRID_ENGINE_LAB_COLS),
      y: nextScenario.suggestedMove.y,
    };
    setScenarioId(nextScenario.id);
    setResponsiveState(nextResponsiveState);
    setCommittedSnapshot(null);
    setSelectedId(nextScenario.selectedId);
    setMode('manual');
    setOperation('MOVE');
    setAnchor('top-left');
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
    setCommittedSnapshot(null);
    setMode(nextMode);
    clearTransientState();
  };

  const handleCanvasWidthChange = (nextWidth: number) => {
    if (!Number.isFinite(nextWidth) || nextWidth < 1) return;
    const normalizedWidth = Math.min(1920, Math.max(1, Math.round(nextWidth)));
    const nextBreakpoint = breakpointForCanvasWidth(normalizedWidth);
    const nextSelected = findItem(layoutForBreakpoint(responsiveState, nextBreakpoint), selectedId);
    gesture.cancel();
    setPreview(null);
    setRuntimeExpanded(false);
    setCommittedSnapshot(null);
    setValidationError(null);
    if (nextSelected) syncControlsToItem(nextSelected);
    setCanvasWidth(normalizedWidth);
  };

  const selectBreakpoint = (breakpoint: DashboardGridBreakpoint) => {
    handleCanvasWidthChange(previewWidthForBreakpoint(breakpoint));
  };

  const handleRestoreAutomatic = () => {
    gesture.cancel();
    setResponsiveState((current) => restoreAutomaticBreakpoint(current, activeBreakpoint));
    setCommittedSnapshot(null);
    setPreview(null);
    setRuntimeExpanded(false);
    setValidationError(null);
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
    if (!preview) return;
    commitPreview(preview);
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

  const handleReset = () => loadScenario(scenario);

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
              Grid Engine 2.0 — Laboratory
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/58">
              Fixture locali, preview deterministica e commit esplicito. Nessun dato di questa sezione viene letto o salvato nella Home reale.
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
                layoutOrigin === 'custom'
                  ? 'border-amber-300/25 bg-amber-300/[0.08] text-amber-100/78'
                  : 'border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-100/72'
              }`}
            >
              {layoutOrigin === 'custom' ? 'Custom' : 'Generated'}
            </span>
            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.08] px-3 py-1.5 text-xs font-medium text-cyan-50/78">
              <span aria-live="polite">{stage}</span>
            </span>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.045] px-3 py-1.5 text-xs font-semibold text-white/72 transition-all hover:bg-white/[0.08] hover:text-white active:scale-95"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Reset fixture
            </button>
          </div>
        </header>

        <div className="flex gap-3 overflow-x-auto pb-1">
          {GRID_ENGINE_LAB_SCENARIOS.map((entry) => (
            <ScenarioButton
              key={entry.id}
              scenario={entry}
              selected={scenario.id === entry.id}
              onClick={() => loadScenario(entry)}
            />
          ))}
        </div>

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
              disabled={layoutOrigin === 'generated'}
              className="rounded-xl border border-emerald-300/20 bg-emerald-300/[0.07] px-4 py-2.5 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-300/[0.12] disabled:cursor-not-allowed disabled:opacity-35"
            >
              Ripristina layout generated
            </button>
          </div>

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
                    aria-pressed={mode === entry}
                    onClick={() => handleModeChange(entry)}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold capitalize transition-all ${
                      mode === entry ? 'bg-white/[0.11] text-white shadow-sm' : 'text-white/42 hover:text-white/72'
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
                disabled={!preview}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-300/[0.08] px-3 py-2.5 text-xs font-bold text-emerald-100 transition-all hover:bg-emerald-300/[0.13] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                Conferma
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
                  <span className="block text-xs font-semibold">Simula espansione dispositivo</span>
                  <span className="mt-1 block text-[10px] leading-4 opacity-55">RUNTIME_RESIZE +1W / +1H</span>
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
                />
              </div>
            </div>

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
              <dt className="text-white/36">Stage</dt>
              <dd className="text-right font-medium text-white/72">{stage}</dd>
              <dt className="text-white/36">Layout source</dt>
              <dd className="text-right font-medium capitalize text-white/72">{layoutOrigin}</dd>
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
              <CoordinateTable items={responsiveState.reference} label="Desktop structural · 12 col" />
              <CoordinateTable items={structuralLayout} label={`${activeBreakpoint} derived · ${activeCols} col`} />
              <CoordinateTable items={displayLayout} label="Final / preview" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default GridEngineLab;
