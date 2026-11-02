import {
  GRID_ENGINE_2_LAYOUT_ENGINE,
  type DashboardLayoutConfiguration,
} from '../../../services/dashboardConfigurationRepository';
import {
  createDefaultSectionLayout,
  type DashboardSection,
  type Widget,
} from '../../../types/dashboardModels';
import {
  DASHBOARD_GRID_BREAKPOINT_ORDER,
  type DashboardGridBreakpoint,
  type WidgetTypeBreakpointLayoutOverride,
} from '../../../types/widgetTypeLayout';
import { GRID_ENGINE_COLS } from '../DashboardGrid';
import { resolveWidgetTypeLayoutSpan } from '../dashboardBreakpointConfig';
import { assertInventory, packInReadingOrder, STACK_KINDS } from './homeGridEngine2Cutover';

/*
 * The explicit activation of the Grid Engine 2.0 Home. Loaded only when the
 * user opens the activation dialog, so the Home does not carry it.
 */

function positiveInteger(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.max(1, Math.round(value))
    : undefined;
}

function widgetStructuralSpan(
  dashboard: DashboardLayoutConfiguration,
  widget: Widget,
  breakpoint: DashboardGridBreakpoint,
  cols: number,
) {
  const typeSpan = resolveWidgetTypeLayoutSpan(
    widget.kind,
    breakpoint,
    dashboard.widgetTypeLayoutOverrides,
  );
  const override: WidgetTypeBreakpointLayoutOverride | undefined =
    dashboard.widgetLayoutOverrides[widget.id]?.[breakpoint];
  const w = Math.min(cols, positiveInteger(override?.w) ?? typeSpan.w);
  if (widget.kind !== 'light') {
    return {
      w,
      h: positiveInteger(override?.h ?? override?.hOff ?? override?.hOn) ?? typeSpan.h,
    };
  }

  const autoExpand = override?.autoExpand ?? typeSpan.autoExpand ?? true;
  const fixedHeight = positiveInteger(override?.h)
    ?? positiveInteger(override?.hOff)
    ?? positiveInteger(override?.hOn)
    ?? positiveInteger(typeSpan.hOff)
    ?? typeSpan.h;
  return {
    w,
    // The saved geometry is the collapsed structural span. Expansion remains runtime-only.
    h: autoExpand
      ? positiveInteger(override?.hOff) ?? positiveInteger(override?.h) ?? positiveInteger(typeSpan.hOff) ?? 1
      : fixedHeight,
  };
}

function stackColumnCount(section: DashboardSection, rootCols: number) {
  if (section.kind === 'stack-vertical') return 1;
  return Math.min(rootCols, positiveInteger(section.stackColumns) ?? rootCols);
}

/**
 * Creates a fresh, deterministic GE2 geometry from the structural inventory.
 * No legacy x/y/w/h coordinate is read while producing the new layouts.
 */
export function createGridEngine2HomeConfiguration(
  dashboard: DashboardLayoutConfiguration,
): DashboardLayoutConfiguration {
  assertInventory(dashboard);

  const rootWidgets = dashboard.widgets.filter((widget) => !widget.parentSectionId);
  const stackLayouts: NonNullable<DashboardLayoutConfiguration['responsiveLayouts']['stacks']> = {};
  const rootLayouts: NonNullable<DashboardLayoutConfiguration['responsiveLayouts']['root']> = {};

  for (const breakpoint of DASHBOARD_GRID_BREAKPOINT_ORDER) {
    const rootCols = GRID_ENGINE_COLS[breakpoint];
    const stackHeights = new Map<string, number>();

    for (const section of dashboard.sections) {
      if (!STACK_KINDS.has(section.kind)) continue;
      const children = dashboard.widgets.filter((widget) => widget.parentSectionId === section.id);
      const stackCols = stackColumnCount(section, rootCols);
      const childLayout = packInReadingOrder(
        children.map((widget) => ({
          i: widget.id,
          ...widgetStructuralSpan(dashboard, widget, breakpoint, stackCols),
        })),
        stackCols,
      );
      stackLayouts[section.id] = {
        ...(stackLayouts[section.id] ?? {}),
        [breakpoint]: childLayout,
      };
      const contentRows = childLayout.reduce((bottom, item) => Math.max(bottom, item.y + item.h), 0);
      const headerRows = section.stackShowHeader === false ? 0 : 1;
      stackHeights.set(section.id, Math.max(1, contentRows + headerRows));
    }

    const rootItems = [
      ...dashboard.sections.map((section) => {
        const defaultLayout = createDefaultSectionLayout(section.kind, section.id, 0);
        return {
          i: section.id,
          w: Math.min(rootCols, defaultLayout.w),
          h: stackHeights.get(section.id) ?? defaultLayout.h,
        };
      }),
      ...rootWidgets.map((widget) => ({
        i: widget.id,
        ...widgetStructuralSpan(dashboard, widget, breakpoint, rootCols),
      })),
    ];
    rootLayouts[breakpoint] = packInReadingOrder(rootItems, rootCols);
  }

  const xlRootById = new Map((rootLayouts.xl ?? []).map((item) => [item.i, item]));
  const xlStackById = new Map(Object.values(stackLayouts)
    .flatMap((byBreakpoint) => byBreakpoint.xl ?? [])
    .map((item) => [item.i, item]));

  return {
    ...dashboard,
    layoutEngine: GRID_ENGINE_2_LAYOUT_ENGINE,
    sections: dashboard.sections.map((section) => ({
      ...section,
      layout: { ...(xlRootById.get(section.id) ?? section.layout), i: section.id },
    })),
    widgets: dashboard.widgets.map((widget) => ({
      ...widget,
      layout: {
        ...((widget.parentSectionId ? xlStackById : xlRootById).get(widget.id) ?? widget.layout),
        i: widget.id,
      },
    })),
    responsiveLayouts: {
      root: rootLayouts,
      stacks: stackLayouts,
    },
  };
}
