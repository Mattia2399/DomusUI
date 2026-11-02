import {
  GRID_ENGINE_2_LAYOUT_ENGINE,
  type DashboardLayoutConfiguration,
} from '../../../services/dashboardConfigurationRepository';
import type { DashboardSection, GridItem, Widget } from '../../../types/dashboardModels';
import {
  DASHBOARD_GRID_BREAKPOINT_ORDER,
  type DashboardGridBreakpoint,
  type WidgetTypeBreakpointLayoutOverride,
} from '../../../types/widgetTypeLayout';
import { GRID_ENGINE_COLS } from '../DashboardGrid';
import { solveLayout } from './solveLayout';
import {
  gridV2FormatSpan,
  resolveGridV2DefaultFormat,
  type GridV2EntityCapability,
} from '../../widgets/cardCapabilityRegistry';

export const STACK_KINDS = new Set<DashboardSection['kind']>([
  'stack-vertical',
  'stack-horizontal',
  'stack-grid',
]);

export class GridEngine2CutoverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GridEngine2CutoverError';
  }
}

export function packInReadingOrder(
  items: readonly Readonly<{ i: string; w: number; h: number }>[],
  cols: number,
): GridItem[] {
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  const placed = items.map((source) => {
    const w = Math.min(cols, Math.max(1, Math.round(source.w)));
    const h = Math.max(1, Math.round(source.h));
    if (x > 0 && x + w > cols) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }
    const item = { i: source.i, x, y, w, h };
    x += w;
    rowHeight = Math.max(rowHeight, h);
    if (x >= cols) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }
    return item;
  });
  return solveLayout({
    items: placed,
    cols,
    mode: 'manual',
    intent: { type: 'NORMALIZE' },
  });
}

export function assertInventory(dashboard: DashboardLayoutConfiguration) {
  const seen = new Set<string>();
  const stackIds = new Set(dashboard.sections
    .filter((section) => STACK_KINDS.has(section.kind))
    .map((section) => section.id));
  for (const id of [
    ...dashboard.sections.map((section) => section.id),
    ...dashboard.widgets.map((widget) => widget.id),
  ]) {
    if (!id || seen.has(id)) {
      throw new GridEngine2CutoverError(`Inventario non valido: ID mancante o duplicato (${id || 'vuoto'}).`);
    }
    seen.add(id);
  }
  for (const widget of dashboard.widgets) {
    if (widget.parentSectionId && !stackIds.has(widget.parentSectionId)) {
      throw new GridEngine2CutoverError(
        `Inventario non valido: ${widget.id} appartiene allo Stack inesistente ${widget.parentSectionId}.`,
      );
    }
  }
}

export function isGridEngine2Home(dashboard: Pick<DashboardLayoutConfiguration, 'layoutEngine'>) {
  return dashboard.layoutEngine === GRID_ENGINE_2_LAYOUT_ENGINE;
}

export function widgetV2Override(
  widget: Widget,
  span: Readonly<{ w: number; h: number }>,
  capability: GridV2EntityCapability,
  current?: WidgetTypeBreakpointLayoutOverride,
): WidgetTypeBreakpointLayoutOverride {
  if (widget.kind !== 'light') return { w: span.w, h: span.h };
  const autoExpand = capability !== 'light-on-off' && (current?.autoExpand ?? true);
  if (!autoExpand || span.h >= 3) {
    return { w: span.w, h: span.h, hOff: span.h, hOn: span.h, autoExpand: false };
  }
  return { w: span.w, hOff: 2, hOn: 3, autoExpand: true };
}

/**
 * The per-breakpoint layout of a card added to a v2 Home: its default format
 * (§2) in every breakpoint.
 */
export function createGridV2NewWidgetOverrides(input: Readonly<{
  widget: Widget;
  entityCapability?: GridV2EntityCapability;
}>): Partial<Record<DashboardGridBreakpoint, WidgetTypeBreakpointLayoutOverride>> {
  const capability = input.entityCapability ?? 'default';
  const format = resolveGridV2DefaultFormat(input.widget.kind, capability);
  return Object.fromEntries(DASHBOARD_GRID_BREAKPOINT_ORDER.map((breakpoint) => {
    const span = gridV2FormatSpan(
      breakpoint === 'xs' && format === 'X×4' ? 'W×4' : format,
      breakpoint,
    );
    const fitted = { w: Math.max(1, Math.min(span.w, GRID_ENGINE_COLS[breakpoint])), h: span.h };
    return [breakpoint, widgetV2Override(input.widget, fitted, capability)];
  }));
}
