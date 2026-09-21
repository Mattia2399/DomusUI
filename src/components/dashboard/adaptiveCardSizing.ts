import {
  DEFAULT_CARD_SIZING_ENGINE,
  supportsAdaptiveSizing,
  type CardSizingEngine,
} from '../../services/cardSizingEngine';
import type { CardLayoutVariant } from '../widgets/cardCapabilityRegistry';
import type { WidgetKind } from '../../types/dashboardModels';

export type { CardSizingEngine };

/**
 * Card Sizing V2 is deliberately scoped as a preset resolver, not as a
 * continuous responsive layout engine.
 *
 * Today it is used only when the builder needs to materialize a Light Card
 * preset into a saved grid span. Existing saved w/h values, breakpoint
 * layouts, manual resizes, refreshes and reconnects must keep using the
 * persisted layout. The final visual disclosure remains owned by the card CSS
 * container queries.
 *
 * Immediate rollback: switch this constant back to 'legacy'.
 */
export const CARD_SIZING_ENGINE: CardSizingEngine = DEFAULT_CARD_SIZING_ENGINE;

export type AdaptiveSizeTarget = {
  id: string;
  width: number;
  height: number;
};

export type AdaptiveCardSizingProfile = Readonly<
  Record<CardLayoutVariant, { targets: readonly AdaptiveSizeTarget[] }>
>;

export const LIGHT_ADAPTIVE_SIZING_PROFILE: AdaptiveCardSizingProfile = {
  mini: {
    targets: [{ id: 'compact-strip', width: 170, height: 48 }],
  },
  standard: {
    targets: [{ id: 'standard-slider', width: 188, height: 112 }],
  },
  expanded: {
    targets: [
      { id: 'wide-full', width: 420, height: 112 },
      { id: 'tall-full', width: 176, height: 176 },
    ],
  },
};

export type AdaptiveGridGeometry = {
  containerWidth: number;
  cols: number;
  columnGap: number;
  rowHeight: number;
  rowGap: number;
  horizontalPadding?: number;
  maxCols?: number;
};

export type AdaptiveGridSpan = {
  w: number;
  h: number;
  target: AdaptiveSizeTarget;
  physicalWidth: number;
  physicalHeight: number;
  error: number;
};

export function resolveGridColumnWidth({
  containerWidth,
  cols,
  columnGap,
  horizontalPadding = 0,
}: Pick<AdaptiveGridGeometry, 'containerWidth' | 'cols' | 'columnGap' | 'horizontalPadding'>) {
  if (
    !Number.isFinite(containerWidth) ||
    !Number.isFinite(cols) ||
    !Number.isFinite(columnGap) ||
    containerWidth <= 0 ||
    cols <= 0
  ) {
    return null;
  }
  const safeCols = Math.max(1, Math.round(cols));
  const safeGap = Math.max(0, columnGap);
  const safePadding = Math.max(0, horizontalPadding ?? 0);
  const widthWithoutPadding = containerWidth - safePadding * 2;
  const widthWithoutGaps = widthWithoutPadding - safeGap * Math.max(0, safeCols - 1);
  if (!Number.isFinite(widthWithoutGaps) || widthWithoutGaps <= 0) {
    return null;
  }
  return widthWithoutGaps / safeCols;
}

function spanWidth(w: number, columnWidth: number, gap: number) {
  return columnWidth * w + gap * Math.max(0, w - 1);
}

function spanHeight(h: number, rowHeight: number, gap: number) {
  return rowHeight * h + gap * Math.max(0, h - 1);
}

export function resolveAdaptiveGridSpan(
  preset: CardLayoutVariant,
  profile: AdaptiveCardSizingProfile,
  geometry: AdaptiveGridGeometry,
): AdaptiveGridSpan | null {
  const targets = profile[preset]?.targets ?? [];
  if (targets.length === 0) return null;
  if (
    !Number.isFinite(geometry.containerWidth) ||
    !Number.isFinite(geometry.cols) ||
    !Number.isFinite(geometry.columnGap) ||
    !Number.isFinite(geometry.rowHeight) ||
    !Number.isFinite(geometry.rowGap) ||
    geometry.containerWidth <= 0 ||
    geometry.cols <= 0 ||
    geometry.rowHeight <= 0
  ) {
    return null;
  }

  const safeCols = Math.max(1, Math.round(geometry.cols));
  const maxCols = Math.max(1, Math.min(safeCols, Math.round(geometry.maxCols ?? safeCols)));
  const columnGap = Math.max(0, geometry.columnGap);
  const rowGap = Math.max(0, geometry.rowGap);
  const rowHeight = Math.max(1, geometry.rowHeight);
  const columnWidth = resolveGridColumnWidth({
    containerWidth: geometry.containerWidth,
    cols: safeCols,
    columnGap,
    horizontalPadding: geometry.horizontalPadding ?? 0,
  });
  if (columnWidth === null) return null;

  let best: AdaptiveGridSpan | null = null;
  for (const target of targets) {
    for (let w = 1; w <= maxCols; w += 1) {
      const physicalWidth = spanWidth(w, columnWidth, columnGap);
      const estimatedH = Math.max(1, Math.round((target.height + rowGap) / (rowHeight + rowGap)));
      for (const h of [estimatedH - 1, estimatedH, estimatedH + 1]) {
        if (h < 1) continue;
        const physicalHeight = spanHeight(h, rowHeight, rowGap);
        const rawWidthError = Math.abs(physicalWidth - target.width) / Math.max(target.width, 1);
        const rawHeightError = Math.abs(physicalHeight - target.height) / Math.max(target.height, 1);
        const widthError = physicalWidth < target.width ? rawWidthError * 2 : rawWidthError;
        const heightError = physicalHeight < target.height ? rawHeightError * 2 : rawHeightError;
        const error = widthError + heightError;
        if (!best || error < best.error) {
          best = { w, h, target, physicalWidth, physicalHeight, error };
        }
      }
    }
  }

  return best;
}

export function createAdaptiveSizingComparison(
  preset: CardLayoutVariant,
  profile: AdaptiveCardSizingProfile,
  geometry: AdaptiveGridGeometry,
  legacy: { w: number; h: number },
) {
  const adaptive = resolveAdaptiveGridSpan(preset, profile, geometry);
  return {
    preset,
    legacy,
    adaptive: adaptive ? { w: adaptive.w, h: adaptive.h } : null,
    physical: adaptive
      ? { width: Math.round(adaptive.physicalWidth), height: Math.round(adaptive.physicalHeight) }
      : null,
    target: adaptive ? adaptive.target : null,
  };
}

export function resolveCardPresetSizing({
  kind,
  preset,
  engine,
  profile,
  geometry,
  legacy,
  isInsideStack = false,
}: {
  kind: WidgetKind;
  preset: CardLayoutVariant;
  engine: CardSizingEngine;
  profile: AdaptiveCardSizingProfile;
  geometry: AdaptiveGridGeometry;
  legacy: { w: number; h: number };
  isInsideStack?: boolean;
}) {
  if (
    engine !== 'adaptive' ||
    !supportsAdaptiveSizing(kind) ||
    isInsideStack
  ) {
    return { ...legacy, engine: 'legacy' as const, adaptive: null };
  }
  const adaptive = resolveAdaptiveGridSpan(preset, profile, geometry);
  if (!adaptive) {
    return { ...legacy, engine: 'legacy' as const, adaptive: null };
  }
  return { w: adaptive.w, h: adaptive.h, engine: 'adaptive' as const, adaptive };
}
