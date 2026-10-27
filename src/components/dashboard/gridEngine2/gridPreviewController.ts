import type { DashboardGridBreakpoint } from '../../../types/widgetTypeLayout';
import type { GridLayoutItem, GridLayoutMode } from './model';
import {
  RESPONSIVE_REFERENCE_COLS,
  commitBreakpointLayout,
  createResponsiveLabState,
  deriveResponsiveLayout,
  layoutForBreakpoint,
  originForBreakpoint,
  restoreAutomaticBreakpoint,
  type ResponsiveLabState,
} from './responsiveLayout';
import { solveLayout } from './solveLayout';

/**
 * Ephemeral lab projection of the structural policy choices. It deliberately
 * carries no V1 declarations, lineage, fingerprints, or persistence authority.
 */
export type GridPreviewPolicy = Readonly<{
  primaryMode: GridLayoutMode;
  overrides: Readonly<Partial<Record<DashboardGridBreakpoint, GridLayoutMode>>>;
}>;

type GridPreviewCore = Readonly<{
  confirmedResponsive: ResponsiveLabState;
  confirmedPolicy: GridPreviewPolicy;
  draftPolicy: GridPreviewPolicy;
  draftLayouts: Readonly<Partial<Record<DashboardGridBreakpoint, readonly GridLayoutItem[]>>>;
  syntheticMissingLayouts: Readonly<Partial<Record<DashboardGridBreakpoint, true>>>;
  confirmationRevision: number;
}>;

export type GridPreviewControllerState = Readonly<{
  initial: GridPreviewCore;
  current: GridPreviewCore;
  past: readonly GridPreviewCore[];
  future: readonly GridPreviewCore[];
  missingBreakpoints: readonly DashboardGridBreakpoint[];
  provisionalLayouts: Readonly<Partial<Record<DashboardGridBreakpoint, readonly GridLayoutItem[]>>>;
}>;

function cloneLayout(items: readonly GridLayoutItem[]) {
  return items.map((item) => ({ ...item }));
}

function cloneResponsive(state: ResponsiveLabState): ResponsiveLabState {
  return {
    seed: cloneLayout(state.seed),
    reference: cloneLayout(state.reference),
    referenceIsCustom: state.referenceIsCustom,
    custom: Object.fromEntries(
      Object.entries(state.custom).map(([breakpoint, items]) => [
        breakpoint,
        items ? cloneLayout(items) : items,
      ]),
    ),
  };
}

function clonePolicy(policy: GridPreviewPolicy): GridPreviewPolicy {
  return { primaryMode: policy.primaryMode, overrides: { ...policy.overrides } };
}

function cloneLayoutRecord(
  layouts: Readonly<Partial<Record<DashboardGridBreakpoint, readonly GridLayoutItem[]>>>,
) {
  return Object.fromEntries(
    Object.entries(layouts).map(([breakpoint, items]) => [
      breakpoint,
      items ? cloneLayout(items) : items,
    ]),
  ) as Partial<Record<DashboardGridBreakpoint, readonly GridLayoutItem[]>>;
}

function cloneCore(core: GridPreviewCore): GridPreviewCore {
  return {
    confirmedResponsive: cloneResponsive(core.confirmedResponsive),
    confirmedPolicy: clonePolicy(core.confirmedPolicy),
    draftPolicy: clonePolicy(core.draftPolicy),
    draftLayouts: cloneLayoutRecord(core.draftLayouts),
    syntheticMissingLayouts: { ...core.syntheticMissingLayouts },
    confirmationRevision: core.confirmationRevision,
  };
}

function updateCore(
  state: GridPreviewControllerState,
  update: (current: GridPreviewCore) => GridPreviewCore,
): GridPreviewControllerState {
  const current = cloneCore(state.current);
  return {
    ...state,
    current: cloneCore(update(current)),
    past: [...state.past, current],
    future: [],
  };
}

function withoutBreakpoint<T>(
  record: Readonly<Partial<Record<DashboardGridBreakpoint, T>>>,
  breakpoint: DashboardGridBreakpoint,
) {
  const next = { ...record };
  delete next[breakpoint];
  return next;
}

function policiesEqual(first: GridPreviewPolicy, second: GridPreviewPolicy) {
  const breakpoints = new Set([
    ...Object.keys(first.overrides),
    ...Object.keys(second.overrides),
  ] as DashboardGridBreakpoint[]);
  return first.primaryMode === second.primaryMode && [...breakpoints].every(
    (breakpoint) => first.overrides[breakpoint] === second.overrides[breakpoint],
  );
}

export function createGridPreviewController(
  items: readonly GridLayoutItem[],
  sourceCols: number,
  options: Readonly<{
    primaryMode?: GridLayoutMode;
    overrides?: Readonly<Partial<Record<DashboardGridBreakpoint, GridLayoutMode>>>;
    missingBreakpoints?: readonly DashboardGridBreakpoint[];
    initialLayouts?: Readonly<Partial<Record<DashboardGridBreakpoint, readonly GridLayoutItem[]>>>;
    provisionalLayouts?: Readonly<Partial<Record<DashboardGridBreakpoint, readonly GridLayoutItem[]>>>;
  }> = {},
): GridPreviewControllerState {
  const policy: GridPreviewPolicy = {
    primaryMode: options.primaryMode ?? 'manual',
    overrides: { ...options.overrides },
  };
  let confirmedResponsive = createResponsiveLabState(items, sourceCols);
  for (const [breakpoint, layout] of Object.entries(options.initialLayouts ?? {})) {
    if (!layout) continue;
    confirmedResponsive = commitBreakpointLayout(
      confirmedResponsive,
      breakpoint as DashboardGridBreakpoint,
      layout,
    );
  }
  const core: GridPreviewCore = {
    confirmedResponsive,
    confirmedPolicy: policy,
    draftPolicy: policy,
    draftLayouts: {},
    syntheticMissingLayouts: {},
    confirmationRevision: 0,
  };
  return {
    initial: cloneCore(core),
    current: cloneCore(core),
    past: [],
    future: [],
    missingBreakpoints: [...new Set(options.missingBreakpoints ?? [])],
    provisionalLayouts: cloneLayoutRecord(options.provisionalLayouts ?? {}),
  };
}

export function effectiveGridPreviewMode(
  state: GridPreviewControllerState,
  breakpoint: DashboardGridBreakpoint,
) {
  return state.current.draftPolicy.overrides[breakpoint]
    ?? state.current.draftPolicy.primaryMode;
}

export function primaryGridPreviewMode(state: GridPreviewControllerState) {
  return state.current.draftPolicy.primaryMode;
}

export function gridPreviewLayoutOrigin(
  state: GridPreviewControllerState,
  breakpoint: DashboardGridBreakpoint,
) {
  if (state.current.draftLayouts[breakpoint]) return 'preview' as const;
  if (isGridPreviewBreakpointMissing(state, breakpoint)) return 'missing' as const;
  if (isGridPreviewBreakpointProvisional(state, breakpoint)) return 'provisional' as const;
  return originForBreakpoint(state.current.confirmedResponsive, breakpoint);
}

export function hasGridPreviewOverride(
  state: GridPreviewControllerState,
  breakpoint: DashboardGridBreakpoint,
) {
  return state.current.draftPolicy.overrides[breakpoint] !== undefined;
}

export function isGridPreviewBreakpointMissing(
  state: GridPreviewControllerState,
  breakpoint: DashboardGridBreakpoint,
) {
  return state.missingBreakpoints.includes(breakpoint);
}

export function isGridPreviewBreakpointProvisional(
  state: GridPreviewControllerState,
  breakpoint: DashboardGridBreakpoint,
) {
  return state.provisionalLayouts[breakpoint] !== undefined;
}

export function isGridPreviewBreakpointConfirmable(
  state: GridPreviewControllerState,
  breakpoint: DashboardGridBreakpoint,
) {
  return !isGridPreviewBreakpointMissing(state, breakpoint)
    && !isGridPreviewBreakpointProvisional(state, breakpoint);
}

export function confirmedGridPreviewLayout(
  state: GridPreviewControllerState,
  breakpoint: DashboardGridBreakpoint,
) {
  if (isGridPreviewBreakpointMissing(state, breakpoint)) return null;
  const provisional = state.provisionalLayouts[breakpoint];
  if (provisional !== undefined) return cloneLayout(provisional);
  return layoutForBreakpoint(state.current.confirmedResponsive, breakpoint);
}

export function structuralGridPreviewLayout(
  state: GridPreviewControllerState,
  breakpoint: DashboardGridBreakpoint,
) {
  const draft = state.current.draftLayouts[breakpoint];
  if (draft) return cloneLayout(draft);
  return confirmedGridPreviewLayout(state, breakpoint);
}

export function displayGridPreviewLayout(
  state: GridPreviewControllerState,
  breakpoint: DashboardGridBreakpoint,
  cols: number,
) {
  const structural = structuralGridPreviewLayout(state, breakpoint);
  if (!structural) return null;
  const mode = effectiveGridPreviewMode(state, breakpoint);
  if (mode === 'manual') return cloneLayout(structural);
  return solveLayout({ items: structural, cols, mode, intent: { type: 'COMPACT' } });
}

export function isGridPreviewDirty(state: GridPreviewControllerState) {
  return !policiesEqual(state.current.confirmedPolicy, state.current.draftPolicy)
    || Object.keys(state.current.draftLayouts).length > 0;
}

export function hasGridPreviewDraft(
  state: GridPreviewControllerState,
  breakpoint: DashboardGridBreakpoint,
) {
  return state.current.draftLayouts[breakpoint] !== undefined;
}

export function isSyntheticMissingGridPreview(
  state: GridPreviewControllerState,
  breakpoint: DashboardGridBreakpoint,
) {
  return state.current.syntheticMissingLayouts[breakpoint] === true;
}

export function stageGridPreviewLayout(
  state: GridPreviewControllerState,
  breakpoint: DashboardGridBreakpoint,
  items: readonly GridLayoutItem[],
): GridPreviewControllerState {
  return updateCore(state, (current) => ({
    ...current,
    draftLayouts: { ...current.draftLayouts, [breakpoint]: cloneLayout(items) },
  }));
}

export function setGridPreviewPrimaryMode(
  state: GridPreviewControllerState,
  mode: GridLayoutMode,
  activeBreakpoint: DashboardGridBreakpoint,
  activeCols: number,
): GridPreviewControllerState {
  if (state.current.draftPolicy.primaryMode === mode) return state;
  const previousEffectiveMode = effectiveGridPreviewMode(state, activeBreakpoint);
  const visible = displayGridPreviewLayout(state, activeBreakpoint, activeCols);
  return updateCore(state, (current) => ({
    ...current,
    draftPolicy: { ...current.draftPolicy, primaryMode: mode },
    draftLayouts: previousEffectiveMode === 'automatic' && mode === 'manual' && visible
      ? { ...current.draftLayouts, [activeBreakpoint]: cloneLayout(visible) }
      : current.draftLayouts,
  }));
}

export function createManualGridPreviewOverride(
  state: GridPreviewControllerState,
  breakpoint: DashboardGridBreakpoint,
  cols: number,
): GridPreviewControllerState {
  if (hasGridPreviewOverride(state, breakpoint)) return state;
  const visible = displayGridPreviewLayout(state, breakpoint, cols);
  return updateCore(state, (current) => ({
    ...current,
    draftPolicy: {
      ...current.draftPolicy,
      overrides: { ...current.draftPolicy.overrides, [breakpoint]: 'manual' },
    },
    draftLayouts: visible
      ? { ...current.draftLayouts, [breakpoint]: cloneLayout(visible) }
      : current.draftLayouts,
  }));
}

export function removeGridPreviewOverride(
  state: GridPreviewControllerState,
  breakpoint: DashboardGridBreakpoint,
): GridPreviewControllerState {
  if (!hasGridPreviewOverride(state, breakpoint)) return state;
  return updateCore(state, (current) => ({
    ...current,
    draftPolicy: {
      ...current.draftPolicy,
      overrides: withoutBreakpoint(current.draftPolicy.overrides, breakpoint),
    },
    draftLayouts: withoutBreakpoint(current.draftLayouts, breakpoint),
    syntheticMissingLayouts: withoutBreakpoint(current.syntheticMissingLayouts, breakpoint),
  }));
}

export function deriveSyntheticMissingGridPreview(
  state: GridPreviewControllerState,
  breakpoint: DashboardGridBreakpoint,
  cols: number,
): GridPreviewControllerState {
  if (!isGridPreviewBreakpointMissing(state, breakpoint)) return state;
  const derived = deriveResponsiveLayout(
    state.current.confirmedResponsive.reference,
    RESPONSIVE_REFERENCE_COLS,
    cols,
  );
  return updateCore(state, (current) => ({
    ...current,
    draftLayouts: { ...current.draftLayouts, [breakpoint]: derived },
    syntheticMissingLayouts: { ...current.syntheticMissingLayouts, [breakpoint]: true },
  }));
}

export function confirmGridPreviewInMemory(
  state: GridPreviewControllerState,
  breakpoint: DashboardGridBreakpoint,
  cols: number,
): GridPreviewControllerState {
  if (!isGridPreviewBreakpointConfirmable(state, breakpoint)) return state;
  const visible = displayGridPreviewLayout(state, breakpoint, cols);
  if (!visible) return state;
  return updateCore(state, (current) => ({
    ...current,
    confirmedResponsive: commitBreakpointLayout(current.confirmedResponsive, breakpoint, visible),
    confirmedPolicy: clonePolicy(current.draftPolicy),
    draftLayouts: withoutBreakpoint(current.draftLayouts, breakpoint),
    syntheticMissingLayouts: withoutBreakpoint(current.syntheticMissingLayouts, breakpoint),
    confirmationRevision: current.confirmationRevision + 1,
  }));
}

export function resetGridPreviewDraft(state: GridPreviewControllerState) {
  if (!isGridPreviewDirty(state)) return state;
  return updateCore(state, (current) => ({
    ...current,
    draftPolicy: clonePolicy(current.confirmedPolicy),
    draftLayouts: {},
    syntheticMissingLayouts: {},
  }));
}

export function restoreAutomaticGridPreviewBreakpoint(
  state: GridPreviewControllerState,
  breakpoint: DashboardGridBreakpoint,
): GridPreviewControllerState {
  return updateCore(state, (current) => {
    const confirmedOverrides = withoutBreakpoint(current.confirmedPolicy.overrides, breakpoint);
    const draftOverrides = withoutBreakpoint(current.draftPolicy.overrides, breakpoint);
    return {
      ...current,
      confirmedResponsive: restoreAutomaticBreakpoint(current.confirmedResponsive, breakpoint),
      confirmedPolicy: { ...current.confirmedPolicy, overrides: confirmedOverrides },
      draftPolicy: { ...current.draftPolicy, overrides: draftOverrides },
      draftLayouts: withoutBreakpoint(current.draftLayouts, breakpoint),
      syntheticMissingLayouts: withoutBreakpoint(current.syntheticMissingLayouts, breakpoint),
      confirmationRevision: current.confirmationRevision + 1,
    };
  });
}

export function undoGridPreview(state: GridPreviewControllerState): GridPreviewControllerState {
  const previous = state.past.at(-1);
  if (!previous) return state;
  return {
    ...state,
    current: cloneCore(previous),
    past: state.past.slice(0, -1),
    future: [cloneCore(state.current), ...state.future],
  };
}

export function redoGridPreview(state: GridPreviewControllerState): GridPreviewControllerState {
  const next = state.future[0];
  if (!next) return state;
  return {
    ...state,
    current: cloneCore(next),
    past: [...state.past, cloneCore(state.current)],
    future: state.future.slice(1),
  };
}

export function resetGridPreviewController(state: GridPreviewControllerState): GridPreviewControllerState {
  return {
    ...state,
    current: cloneCore(state.initial),
    past: [],
    future: [],
  };
}

export function gridPreviewConfirmationRevision(state: GridPreviewControllerState) {
  return state.current.confirmationRevision;
}
