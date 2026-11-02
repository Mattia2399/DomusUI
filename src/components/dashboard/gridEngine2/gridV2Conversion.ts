import {
  GRID_ENGINE_2_LAYOUT_ENGINE,
  type DashboardLayoutConfiguration,
} from '../../../services/dashboardConfigurationRepository';
import type { DashboardSection, GridItem, Widget } from '../../../types/dashboardModels';
import {
  DASHBOARD_GRID_BREAKPOINT_ORDER,
  type DashboardGridBreakpoint,
} from '../../../types/widgetTypeLayout';
import { GRID_ENGINE_COLS } from '../DashboardGrid';
import {
  GRID_V2_WIDTH_CLASS_COLS,
  gridV2FormatSpan,
  parseGridV2CardFormat,
  resolveGridV2DefaultFormat,
  resolveGridV2SupportedFormats,
  type GridV2CardFormat,
  type GridV2EntityCapability,
} from '../../widgets/cardCapabilityRegistry';
import {
  assertInventory,
  GridEngine2CutoverError,
  packInReadingOrder,
  STACK_KINDS,
  widgetV2Override,
} from './homeGridEngine2Cutover';

/*
 * The explicit move of a Grid Engine 2.0 Home to the v2 metrics
 * (docs/home-cards-grid-engine-2.md §8). Loaded only when the user asks for
 * the preview, so the Home does not carry it.
 */

export type GridV2EntityCapabilityResolver = (
  widget: Widget,
) => GridV2EntityCapability;

function legacyHeightToV2Rows(height: number) {
  const safeHeight = Math.max(1, Math.round(height));
  if (safeHeight === 1) return 2;
  if (safeHeight === 2) return 3;
  if (safeHeight === 3) return 4;
  return 6;
}

const WIDTH_CLASSES = ['U', 'W', 'X'] as const;

function closestRows(
  formats: readonly GridV2CardFormat[],
  targetRows: number,
) {
  return [...formats].sort((first, second) => {
    const firstRows = parseGridV2CardFormat(first).rows;
    const secondRows = parseGridV2CardFormat(second).rows;
    return Math.abs(firstRows - targetRows) - Math.abs(secondRows - targetRows) ||
      secondRows - firstRows;
  })[0];
}

export function resolveGridV2ConversionFormat(input: Readonly<{
  widget: Widget;
  breakpoint: DashboardGridBreakpoint;
  legacyWidth: number;
  legacyHeight: number;
  entityCapability?: GridV2EntityCapability;
  maxCols?: number;
  fixedLight?: boolean;
}>): GridV2CardFormat {
  const matrix = GRID_V2_WIDTH_CLASS_COLS[input.breakpoint];
  const maxCols = Math.min(matrix.cols, Math.max(1, Math.round(input.maxCols ?? matrix.cols)));
  const capability = input.entityCapability ?? 'default';
  const supported = resolveGridV2SupportedFormats(input.widget.kind, capability)
    .filter((format) => gridV2FormatSpan(format, input.breakpoint).w <= maxCols)
    .filter((format) => !(
      input.breakpoint === 'xs' &&
      format === 'X×4' &&
      resolveGridV2SupportedFormats(input.widget.kind, capability).includes('W×4')
    ));
  if (supported.length === 0) {
    return resolveGridV2DefaultFormat(input.widget.kind, capability);
  }

  // The legacy Media 2×3 composition carries controls and artwork. Its safe
  // v2 equivalent is W×4, never the superficially closer U×2.
  if (
    input.widget.kind === 'media' &&
    Math.round(input.legacyWidth) === 2 &&
    Math.round(input.legacyHeight) === 3 &&
    supported.includes('W×4')
  ) {
    return 'W×4';
  }

  const safeLegacyWidth = Math.max(1, Math.round(input.legacyWidth));
  const targetRows = legacyHeightToV2Rows(
    input.widget.kind === 'light' && !input.fixedLight ? 1 : input.legacyHeight,
  );
  const availableClasses = WIDTH_CLASSES
    .filter((widthClass, index, classes) =>
      matrix[widthClass] <= maxCols &&
      classes.findIndex((candidate) => matrix[candidate] === matrix[widthClass]) === index,
    );
  const targetClass = [...availableClasses].sort((first, second) =>
    Math.abs(matrix[first] - safeLegacyWidth) - Math.abs(matrix[second] - safeLegacyWidth) ||
      matrix[second] - matrix[first],
  )[0] ?? 'U';
  const targetRank = WIDTH_CLASSES.indexOf(targetClass);
  const formatsInClass = (widthClass: typeof WIDTH_CLASSES[number]) =>
    supported.filter((format) => parseGridV2CardFormat(format).widthClass === widthClass);
  const targetFormats = formatsInClass(targetClass);

  if (targetFormats.length > 0) {
    const targetMaxRows = Math.max(...targetFormats.map((format) => parseGridV2CardFormat(format).rows));
    if (targetMaxRows >= targetRows) return closestRows(targetFormats, targetRows) ?? targetFormats[0];
    for (let rank = targetRank + 1; rank < WIDTH_CLASSES.length; rank += 1) {
      const widerClass = WIDTH_CLASSES[rank];
      if (!availableClasses.includes(widerClass)) continue;
      const adequate = formatsInClass(widerClass)
        .filter((format) => parseGridV2CardFormat(format).rows >= targetRows);
      if (adequate.length > 0) return closestRows(adequate, targetRows) ?? adequate[0];
    }
    return [...targetFormats].sort((first, second) =>
      parseGridV2CardFormat(second).rows - parseGridV2CardFormat(first).rows,
    )[0];
  }

  // A type without the selected class first moves to the nearest wider class;
  // if none exists (for example an X-sized switch), it falls back narrower.
  for (let rank = targetRank + 1; rank < WIDTH_CLASSES.length; rank += 1) {
    const widerClass = WIDTH_CLASSES[rank];
    if (!availableClasses.includes(widerClass)) continue;
    const widerFormats = formatsInClass(widerClass);
    if (widerFormats.length > 0) return closestRows(widerFormats, targetRows) ?? widerFormats[0];
  }
  for (let rank = targetRank - 1; rank >= 0; rank -= 1) {
    const narrowerFormats = formatsInClass(WIDTH_CLASSES[rank]);
    if (narrowerFormats.length > 0) return closestRows(narrowerFormats, targetRows) ?? narrowerFormats[0];
  }
  return supported[0];
}

function readingOrder(
  ids: readonly string[],
  source: readonly GridItem[],
) {
  const sourceById = new Map(source.map((item) => [item.i, item]));
  return [...ids].sort((firstId, secondId) => {
    const first = sourceById.get(firstId);
    const second = sourceById.get(secondId);
    if (first && second) {
      return first.y - second.y || first.x - second.x || firstId.localeCompare(secondId, 'it-IT');
    }
    if (first) return -1;
    if (second) return 1;
    return ids.indexOf(firstId) - ids.indexOf(secondId);
  });
}

function sourceItemFor(
  id: string,
  source: readonly GridItem[],
  fallback: GridItem,
) {
  return source.find((item) => item.i === id) ?? fallback;
}

function sectionV2Span(
  section: DashboardSection,
  breakpoint: DashboardGridBreakpoint,
  cols: number,
  legacy: GridItem,
) {
  const matrix = GRID_V2_WIDTH_CLASS_COLS[breakpoint];
  if (section.kind === 'greeting') {
    const compactWeather = (breakpoint === 'sm' || breakpoint === 'xs') && (section.showWeather ?? false);
    return { w: cols, h: compactWeather ? 4 : 3 };
  }
  if (section.kind === 'weather') {
    return {
      w: Math.min(cols, matrix.W),
      h: section.weatherForecastType === 'hourly' ? 4 : 3,
    };
  }
  if (section.kind === 'scenes') return { w: Math.min(cols, matrix.X), h: 2 };
  const unit = matrix.U;
  const rawWidth = Math.min(cols, Math.max(unit, Math.round(legacy.w)));
  const lower = Math.max(unit, Math.floor(rawWidth / unit) * unit);
  const upper = Math.min(cols, Math.ceil(rawWidth / unit) * unit);
  const width = rawWidth - lower < upper - rawWidth ? lower : upper;
  return {
    w: width,
    h: Math.max(1, legacyHeightToV2Rows(legacy.h)),
  };
}

/**
 * Converts only the in-memory editor configuration. Inventory and non-layout
 * widget/section fields are retained verbatim; persistence remains the normal
 * Edit Mode save transaction.
 */
export function createGridV2DashboardConfiguration(
  dashboard: DashboardLayoutConfiguration,
  resolveEntityCapability: GridV2EntityCapabilityResolver = () => 'default',
): DashboardLayoutConfiguration {
  assertInventory(dashboard);
  if (dashboard.layoutEngine !== GRID_ENGINE_2_LAYOUT_ENGINE) {
    throw new GridEngine2CutoverError('Il layout v2 richiede una Home Grid Engine 2.0 attiva.');
  }
  // Saved Stacks are suspended (legacyStacks.ts): converting would rewrite them.
  if (dashboard.sections.some((section) => STACK_KINDS.has(section.kind))) {
    throw new GridEngine2CutoverError('La Home contiene Stack salvati: il layout v2 non li converte.');
  }

  const rootLayouts: NonNullable<DashboardLayoutConfiguration['responsiveLayouts']['root']> = {};
  const widgetLayoutOverrides = structuredClone(dashboard.widgetLayoutOverrides);
  const rootWidgets = dashboard.widgets.filter((widget) => !widget.parentSectionId);
  const widgetById = new Map(dashboard.widgets.map((widget) => [widget.id, widget]));

  for (const breakpoint of DASHBOARD_GRID_BREAKPOINT_ORDER) {
    const cols = GRID_ENGINE_COLS[breakpoint];
    const legacyRoot = dashboard.responsiveLayouts.root?.[breakpoint] ?? [
      ...dashboard.sections.map((section) => section.layout),
      ...rootWidgets.map((widget) => widget.layout),
    ];
    const rootIds = readingOrder(
      [...dashboard.sections.map((section) => section.id), ...rootWidgets.map((widget) => widget.id)],
      legacyRoot,
    );
    const rootItems = rootIds.map((id) => {
      const section = dashboard.sections.find((entry) => entry.id === id);
      if (section) {
        const legacy = sourceItemFor(id, legacyRoot, section.layout);
        return { i: id, ...sectionV2Span(section, breakpoint, cols, legacy) };
      }
      const widget = widgetById.get(id)!;
      const legacy = sourceItemFor(id, legacyRoot, widget.layout);
      const capability = resolveEntityCapability(widget);
      const format = resolveGridV2ConversionFormat({
        widget,
        breakpoint,
        legacyWidth: legacy.w,
        legacyHeight: legacy.h,
        entityCapability: capability,
        fixedLight: dashboard.widgetLayoutOverrides[id]?.[breakpoint]?.autoExpand === false,
      });
      const span = gridV2FormatSpan(format, breakpoint);
      widgetLayoutOverrides[id] = {
        ...(widgetLayoutOverrides[id] ?? {}),
        [breakpoint]: widgetV2Override(
          widget,
          span,
          capability,
          dashboard.widgetLayoutOverrides[id]?.[breakpoint],
        ),
      };
      return { i: id, ...span };
    });
    rootLayouts[breakpoint] = packInReadingOrder(rootItems, cols);
  }

  const xlRootById = new Map((rootLayouts.xl ?? []).map((item) => [item.i, item]));
  return {
    ...dashboard,
    gridMetricsVersion: 'v2',
    sections: dashboard.sections.map((section) => ({
      ...section,
      layout: { ...(xlRootById.get(section.id) ?? section.layout), i: section.id },
    })),
    widgets: dashboard.widgets.map((widget) => ({
      ...widget,
      layout: {
        ...(xlRootById.get(widget.id) ?? widget.layout),
        i: widget.id,
      },
    })),
    widgetLayoutOverrides,
    responsiveLayouts: { ...dashboard.responsiveLayouts, root: rootLayouts },
  };
}
