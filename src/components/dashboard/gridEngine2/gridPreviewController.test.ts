// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { GRID_ENGINE_LAB_COLS, GRID_ENGINE_LAB_SCENARIOS } from './labFixtures';
import {
  confirmGridPreviewInMemory,
  createGridPreviewController,
  createManualGridPreviewOverride,
  deriveSyntheticMissingGridPreview,
  displayGridPreviewLayout,
  effectiveGridPreviewMode,
  gridPreviewConfirmationRevision,
  hasGridPreviewDraft,
  hasGridPreviewOverride,
  isGridPreviewBreakpointConfirmable,
  isGridPreviewBreakpointMissing,
  isGridPreviewBreakpointProvisional,
  isGridPreviewDirty,
  isSyntheticMissingGridPreview,
  redoGridPreview,
  removeGridPreviewOverride,
  resetGridPreviewController,
  resetGridPreviewDraft,
  setGridPreviewPrimaryMode,
  stageGridPreviewLayout,
  structuralGridPreviewLayout,
  undoGridPreview,
} from './gridPreviewController';
import { solveLayout } from './solveLayout';

const gaps = GRID_ENGINE_LAB_SCENARIOS.find((scenario) => scenario.id === 'manual-gaps')!;

function createGapsController() {
  return createGridPreviewController(gaps.items, GRID_ENGINE_LAB_COLS);
}

describe('Grid preview controller', () => {
  it('keeps manual gaps and exposes a deterministic automatic preview', () => {
    const manual = createGapsController();
    expect(structuralGridPreviewLayout(manual, 'xl')?.map(({ y }) => y)).toEqual([0, 4, 6]);
    const automatic = setGridPreviewPrimaryMode(manual, 'automatic', 'xl', 12);
    expect(displayGridPreviewLayout(automatic, 'xl', 12)?.map(({ y }) => y)).toEqual([0, 1, 2]);
    expect(isGridPreviewDirty(automatic)).toBe(true);
    expect(structuralGridPreviewLayout(manual, 'xl')?.map(({ y }) => y)).toEqual([0, 4, 6]);
  });

  it('turns automatic geometry into an editable manual draft without losing the original', () => {
    const automatic = setGridPreviewPrimaryMode(createGapsController(), 'automatic', 'xl', 12);
    const manualDraft = setGridPreviewPrimaryMode(automatic, 'manual', 'xl', 12);
    expect(effectiveGridPreviewMode(manualDraft, 'xl')).toBe('manual');
    expect(structuralGridPreviewLayout(manualDraft, 'xl')?.map(({ y }) => y)).toEqual([0, 1, 2]);
    const undone = undoGridPreview(manualDraft);
    expect(undone.current).toEqual(automatic.current);
    expect(undone.future).toHaveLength(1);
  });

  it('stages, undoes, redoes, confirms, and resets geometry only in memory', () => {
    const initial = createGapsController();
    const source = structuralGridPreviewLayout(initial, 'xl')!;
    const changed = solveLayout({
      items: source,
      cols: 12,
      mode: 'manual',
      intent: { type: 'MOVE', id: 'gap-a', x: 6, y: 2 },
    });
    const staged = stageGridPreviewLayout(initial, 'xl', changed);
    expect(hasGridPreviewDraft(staged, 'xl')).toBe(true);
    const undone = undoGridPreview(staged);
    expect(undone.current).toEqual(initial.current);
    expect(undone.future).toHaveLength(1);
    expect(structuralGridPreviewLayout(redoGridPreview(undone), 'xl')).toEqual(changed);
    const confirmed = confirmGridPreviewInMemory(staged, 'xl', 12);
    expect(hasGridPreviewDraft(confirmed, 'xl')).toBe(false);
    expect(gridPreviewConfirmationRevision(confirmed)).toBe(1);
    expect(structuralGridPreviewLayout(confirmed, 'xl')).toEqual(changed);
    expect(resetGridPreviewController(confirmed)).toEqual(initial);
  });

  it('preserves independent XS work while switching repeatedly to XL', () => {
    let state = setGridPreviewPrimaryMode(createGapsController(), 'automatic', 'xl', 12);
    state = createManualGridPreviewOverride(state, 'xs', 2);
    const xs = structuralGridPreviewLayout(state, 'xs')!;
    const changedXs = solveLayout({
      items: xs,
      cols: 2,
      mode: 'manual',
      intent: { type: 'MOVE', id: 'gap-c', x: 1, y: 8 },
    });
    state = stageGridPreviewLayout(state, 'xs', changedXs);
    const xlBefore = structuralGridPreviewLayout(state, 'xl');
    expect(effectiveGridPreviewMode(state, 'xs')).toBe('manual');
    expect(hasGridPreviewOverride(state, 'xs')).toBe(true);
    expect(structuralGridPreviewLayout(state, 'xs')).toEqual(changedXs);
    expect(structuralGridPreviewLayout(state, 'xl')).toEqual(xlBefore);
    expect(structuralGridPreviewLayout(state, 'xs')).toEqual(changedXs);
  });

  it('removes an override explicitly and keeps other breakpoints untouched', () => {
    const automatic = setGridPreviewPrimaryMode(createGapsController(), 'automatic', 'xl', 12);
    const override = createManualGridPreviewOverride(automatic, 'xs', 2);
    const removed = removeGridPreviewOverride(override, 'xs');
    expect(hasGridPreviewOverride(removed, 'xs')).toBe(false);
    expect(effectiveGridPreviewMode(removed, 'xs')).toBe('automatic');
    expect(structuralGridPreviewLayout(removed, 'xl')).toEqual(structuralGridPreviewLayout(automatic, 'xl'));
  });

  it('derives a missing breakpoint only as a non-confirmable synthetic preview', () => {
    const missing = createGridPreviewController(gaps.items, GRID_ENGINE_LAB_COLS, {
      missingBreakpoints: ['2xl'],
    });
    expect(isGridPreviewBreakpointMissing(missing, '2xl')).toBe(true);
    expect(structuralGridPreviewLayout(missing, '2xl')).toBeNull();
    const derived = deriveSyntheticMissingGridPreview(missing, '2xl', 12);
    expect(isSyntheticMissingGridPreview(derived, '2xl')).toBe(true);
    expect(structuralGridPreviewLayout(derived, '2xl')).not.toBeNull();
    expect(confirmGridPreviewInMemory(derived, '2xl', 12)).toBe(derived);
    expect(gridPreviewConfirmationRevision(derived)).toBe(0);
  });

  it('resets all unconfirmed policy and geometry changes', () => {
    const automatic = setGridPreviewPrimaryMode(createGapsController(), 'automatic', 'xl', 12);
    const override = createManualGridPreviewOverride(automatic, 'xs', 2);
    const reset = resetGridPreviewDraft(override);
    expect(isGridPreviewDirty(reset)).toBe(false);
    expect(effectiveGridPreviewMode(reset, 'xl')).toBe('manual');
    expect(hasGridPreviewOverride(reset, 'xs')).toBe(false);
  });

  it('is deterministic, immutable, and accepts frozen input', () => {
    const items = structuredClone(gaps.items);
    const frozen = Object.freeze(items.map((item) => Object.freeze(item)));
    const first = createGridPreviewController(frozen, GRID_ENGINE_LAB_COLS);
    const second = createGridPreviewController(structuredClone(items), GRID_ENGINE_LAB_COLS);
    expect(first).toEqual(second);
    expect(frozen).toEqual(items);
  });

  it('loads independent explicit breakpoint layouts without changing the source arrays', () => {
    const xl = Object.freeze([
      Object.freeze({ i: 'a', x: 0, y: 0, w: 3, h: 1 }),
      Object.freeze({ i: 'b', x: 4, y: 4, w: 2, h: 2 }),
    ]);
    const xs = Object.freeze([
      Object.freeze({ i: 'a', x: 0, y: 0, w: 1, h: 1 }),
      Object.freeze({ i: 'b', x: 1, y: 6, w: 1, h: 2 }),
    ]);
    const state = createGridPreviewController(xl, 12, {
      initialLayouts: { xl, xs },
      missingBreakpoints: ['sm'],
    });

    expect(structuralGridPreviewLayout(state, 'xl')).toEqual(xl);
    expect(structuralGridPreviewLayout(state, 'xs')).toEqual(xs);
    expect(structuralGridPreviewLayout(state, 'sm')).toBeNull();
    expect(structuralGridPreviewLayout(state, 'xs')).not.toBe(xs);
    expect(xl[1]).toEqual({ i: 'b', x: 4, y: 4, w: 2, h: 2 });
  });

  it('shows an exact provisional source layout without generating missing cards or authority', () => {
    const source = [
      { i: 'a', x: 0, y: 0, w: 3, h: 1 },
      { i: 'b', x: 4, y: 4, w: 2, h: 2 },
    ];
    const provisionalXs = Object.freeze([
      Object.freeze({ i: 'a', x: 1, y: 9, w: 1, h: 1 }),
    ]);
    const state = createGridPreviewController(source, 12, {
      provisionalLayouts: { xs: provisionalXs },
    });

    expect(isGridPreviewBreakpointMissing(state, 'xs')).toBe(false);
    expect(isGridPreviewBreakpointProvisional(state, 'xs')).toBe(true);
    expect(isGridPreviewBreakpointConfirmable(state, 'xs')).toBe(false);
    expect(structuralGridPreviewLayout(state, 'xs')).toEqual(provisionalXs);
    expect(structuralGridPreviewLayout(state, 'xs')?.map(({ i }) => i)).toEqual(['a']);
    const changed = stageGridPreviewLayout(state, 'xs', [
      { i: 'a', x: 0, y: 11, w: 1, h: 1 },
    ]);
    expect(structuralGridPreviewLayout(changed, 'xs')?.[0]?.y).toBe(11);
    expect(structuralGridPreviewLayout(changed, 'xl')).toEqual(structuralGridPreviewLayout(state, 'xl'));
    expect(structuralGridPreviewLayout(changed, 'xs')?.[0]?.y).toBe(11);
    expect(confirmGridPreviewInMemory(changed, 'xs', 2)).toBe(changed);
    expect(provisionalXs[0]).toEqual({ i: 'a', x: 1, y: 9, w: 1, h: 1 });
  });

  it('performs no HA, network, localStorage, or sessionStorage operation', () => {
    const fetch = vi.fn();
    const setItem = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('localStorage', { setItem });
    vi.stubGlobal('sessionStorage', { setItem });
    try {
      const state = createGapsController();
      confirmGridPreviewInMemory(
        stageGridPreviewLayout(state, 'xl', structuralGridPreviewLayout(state, 'xl')!),
        'xl',
        12,
      );
      expect(fetch).not.toHaveBeenCalled();
      expect(setItem).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('has no operational renderer, Home, repository, storage, or Light dependency', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/dashboard/gridEngine2/gridPreviewController.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/GridCanvas|MainBoard|GridEngineRootRenderer|RuntimeRenderDecision/u);
    expect(source).not.toMatch(/dashboardConfigurationRepository|dashboardStorage|localStorage|sessionStorage/u);
    expect(source).not.toMatch(/LightCard|StackGrid|fetch\s*\(/u);
    expect(source).not.toMatch(/contract-valid|GridStructuralPolicyConfigurationV1/u);
    expect(source).not.toMatch(/from ['"]\.\/gridStructuralPolicyConfiguration['"]/u);
  });
});
