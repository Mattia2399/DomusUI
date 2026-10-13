import { GRID_ENGINE_COLS } from '../DashboardGrid';
import type {
  DashboardSection,
  GridItem,
  SectionKind,
  Widget,
  WidgetKind,
} from '../../../types/dashboardModels';
import {
  DASHBOARD_GRID_BREAKPOINT_ORDER,
  type DashboardGridBreakpoint,
} from '../../../types/widgetTypeLayout';
import type { GridLayoutItem } from './model';

export type ShadowRootLayoutSource = 'explicit-with-fallback' | 'legacy-derived';
export type ShadowStackLayoutSource = 'explicit' | 'structural-fallback';
export type ShadowElementRole = 'section' | 'stack-container' | 'root-widget' | 'stack-widget';

export type ShadowAdapterIssueCode =
  | 'DUPLICATE_ORIGINAL_ID'
  | 'DUPLICATE_LAYOUT_ID'
  | 'INVALID_GEOMETRY'
  | 'OUT_OF_BOUNDS'
  | 'MISSING_LAYOUT_ITEM'
  | 'UNSUPPORTED_LAYOUT_ITEM'
  | 'ORPHAN_STACK_WIDGET'
  | 'STACK_COLUMNS_UNAVAILABLE';

export type ShadowAdapterIssue = {
  readonly code: ShadowAdapterIssueCode;
  readonly scope: 'structural' | 'legacy' | 'runtime' | 'stack';
  readonly message: string;
  readonly breakpoint?: DashboardGridBreakpoint;
  readonly originalId?: string;
  readonly diagnosticId?: string;
  readonly stackId?: string;
};

export type ShadowElement = {
  readonly diagnosticId: string;
  readonly originalId: string;
  readonly role: ShadowElementRole;
  readonly sectionKind?: SectionKind;
  readonly widgetKind?: WidgetKind;
  readonly parentSectionId?: string;
  readonly structuralGeometry: GridLayoutItem;
};

export type ShadowAdaptedItem = {
  readonly diagnosticId: string;
  readonly originalId: string;
  readonly role: ShadowElementRole;
  /** Exact legacy geometry. The adapter never clamps or rounds it. */
  readonly geometry: GridLayoutItem;
  readonly solverRepresentable: boolean;
  readonly geometryValid: boolean;
  readonly outOfBounds: boolean;
};

export type ShadowRootBreakpointSnapshot = {
  readonly breakpoint: DashboardGridBreakpoint;
  readonly cols: number;
  readonly source: ShadowRootLayoutSource;
  readonly hasExplicitLayout: boolean;
  readonly explicitItemCount: number;
  readonly derivedItemCount: number;
  /** Geometry derived from the current structural Home configuration. */
  readonly items: readonly ShadowAdaptedItem[];
  readonly runtimeItems: readonly ShadowAdaptedItem[];
  /** Exact geometry currently sent to the renderer. */
  readonly displayedItems: readonly ShadowAdaptedItem[];
  readonly analyzedSource: 'runtime-displayed' | 'legacy-derived';
  readonly runtimeAvailable: boolean;
  readonly issues: readonly ShadowAdapterIssue[];
};

export type ShadowStackBreakpointSnapshot = {
  readonly breakpoint: DashboardGridBreakpoint;
  readonly source: ShadowStackLayoutSource;
  readonly hasExplicitLayout: boolean;
  readonly items: readonly ShadowAdaptedItem[];
  readonly issues: readonly ShadowAdapterIssue[];
  /** Internal Stack columns are resolved inside StackGrid and are unavailable here. */
  readonly effectiveColumns: null;
};

export type ShadowStackSnapshot = {
  readonly diagnosticId: string;
  readonly originalId: string;
  readonly kind: Extract<SectionKind, 'stack-vertical' | 'stack-horizontal' | 'stack-grid'>;
  readonly childCount: number;
  readonly breakpoints: Readonly<Record<DashboardGridBreakpoint, ShadowStackBreakpointSnapshot>>;
};

export type ShadowLayoutSnapshot = {
  readonly rootElements: readonly ShadowElement[];
  readonly stackChildren: readonly ShadowElement[];
  readonly breakpoints: Readonly<Record<DashboardGridBreakpoint, ShadowRootBreakpointSnapshot>>;
  readonly stacks: readonly ShadowStackSnapshot[];
  readonly issues: readonly ShadowAdapterIssue[];
};

type ShadowSectionInput = Pick<DashboardSection, 'id' | 'kind' | 'layout'>;
type ShadowWidgetInput = Pick<Widget, 'id' | 'kind' | 'parentSectionId' | 'layout'>;
type ShadowBreakpointLayoutsInput = Readonly<Partial<Record<DashboardGridBreakpoint, readonly GridItem[]>>>;

export type ShadowLayoutAdapterInput = {
  readonly sections: readonly ShadowSectionInput[];
  readonly widgets: readonly ShadowWidgetInput[];
  readonly explicitResponsiveLayouts?: {
    readonly root?: ShadowBreakpointLayoutsInput;
    readonly stacks?: Readonly<Record<string, ShadowBreakpointLayoutsInput>>;
  };
  /** Layouts produced by the current legacy derivation, before runtime-only changes. */
  readonly legacyLayouts: ShadowBreakpointLayoutsInput;
  /** Effective layouts currently sent to the legacy renderer. */
  readonly runtimeLayouts?: ShadowBreakpointLayoutsInput;
};

const STACK_KINDS = new Set<SectionKind>(['stack-vertical', 'stack-horizontal', 'stack-grid']);

function compareStrings(first: string, second: string) {
  if (first === second) return 0;
  return first < second ? -1 : 1;
}

function isStackKind(kind: SectionKind): kind is ShadowStackSnapshot['kind'] {
  return STACK_KINDS.has(kind);
}

function namespacedId(namespace: 'section' | 'widget', originalId: string) {
  return `${namespace}:${originalId.length}:${originalId}`;
}

export function shadowSectionId(originalId: string) {
  return namespacedId('section', originalId);
}

export function shadowWidgetId(originalId: string, parentSectionId?: string) {
  if (!parentSectionId) return namespacedId('widget', originalId);
  return `stack:${parentSectionId.length}:${parentSectionId}:${namespacedId('widget', originalId)}`;
}

function cloneGeometry(item: GridItem, diagnosticId: string): GridLayoutItem {
  return {
    i: diagnosticId,
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
  };
}

function geometryNumbers(item: GridItem) {
  return [item.x, item.y, item.w, item.h];
}

function isSolverRepresentable(item: GridItem) {
  return geometryNumbers(item).every(
    (value) => typeof value === 'number' && Number.isFinite(value) && Number.isSafeInteger(Math.round(value)),
  );
}

function isValidGridGeometry(item: GridItem) {
  return (
    geometryNumbers(item).every((value) => Number.isSafeInteger(value)) &&
    item.x >= 0 &&
    item.y >= 0 &&
    item.w >= 1 &&
    item.h >= 1
  );
}

function isOutOfBounds(item: GridItem, cols: number | null) {
  return item.x < 0 || item.y < 0 || item.w < 1 || item.h < 1 || (cols !== null && item.x + item.w > cols);
}

function hasOwnLayout(layouts: ShadowBreakpointLayoutsInput | undefined, breakpoint: DashboardGridBreakpoint) {
  return Boolean(layouts && Object.prototype.hasOwnProperty.call(layouts, breakpoint));
}

function createRootElements(
  sections: readonly ShadowSectionInput[],
  widgets: readonly ShadowWidgetInput[],
) {
  const rootElements: ShadowElement[] = sections.map((section) => ({
    diagnosticId: shadowSectionId(section.id),
    originalId: section.id,
    role: isStackKind(section.kind) ? 'stack-container' : 'section',
    sectionKind: section.kind,
    structuralGeometry: cloneGeometry(section.layout, shadowSectionId(section.id)),
  }));
  rootElements.push(
    ...widgets
      .filter((widget) => !widget.parentSectionId)
      .map((widget) => ({
        diagnosticId: shadowWidgetId(widget.id),
        originalId: widget.id,
        role: 'root-widget' as const,
        widgetKind: widget.kind,
        structuralGeometry: cloneGeometry(widget.layout, shadowWidgetId(widget.id)),
      })),
  );
  return rootElements.sort((first, second) => compareStrings(first.diagnosticId, second.diagnosticId));
}

function buildRegistry(elements: readonly ShadowElement[]) {
  const registry = new Map<string, ShadowElement[]>();
  for (const element of elements) {
    const current = registry.get(element.originalId) ?? [];
    current.push(element);
    registry.set(element.originalId, current);
  }
  return registry;
}

function duplicateOriginalIdIssues(
  registry: ReadonlyMap<string, readonly ShadowElement[]>,
  scope: ShadowAdapterIssue['scope'],
  stackId?: string,
) {
  const issues: ShadowAdapterIssue[] = [];
  for (const [originalId, elements] of registry) {
    if (elements.length < 2) continue;
    issues.push({
      code: 'DUPLICATE_ORIGINAL_ID',
      scope,
      originalId,
      stackId,
      message: `Original id "${originalId}" is ambiguous across ${elements.length} elements.`,
    });
  }
  return issues;
}

type ConvertLayoutOptions = {
  readonly source: ShadowAdapterIssue['scope'];
  readonly breakpoint: DashboardGridBreakpoint;
  readonly cols: number | null;
  readonly requireEveryElement: boolean;
  readonly stackId?: string;
};

function convertLayout(
  sourceItems: readonly GridItem[],
  registry: ReadonlyMap<string, readonly ShadowElement[]>,
  options: ConvertLayoutOptions,
) {
  const issues: ShadowAdapterIssue[] = [];
  const counts = new Map<string, number>();
  for (const item of sourceItems) counts.set(item.i, (counts.get(item.i) ?? 0) + 1);

  for (const [originalId, count] of counts) {
    if (count < 2) continue;
    issues.push({
      code: 'DUPLICATE_LAYOUT_ID',
      scope: options.source,
      breakpoint: options.breakpoint,
      originalId,
      stackId: options.stackId,
      message: `Layout contains ${count} entries for "${originalId}".`,
    });
  }

  const items: ShadowAdaptedItem[] = [];
  for (const item of sourceItems) {
    if ((counts.get(item.i) ?? 0) > 1) continue;
    const candidates = registry.get(item.i) ?? [];
    if (candidates.length !== 1) {
      if (candidates.length === 0) {
        issues.push({
          code: 'UNSUPPORTED_LAYOUT_ITEM',
          scope: options.source,
          breakpoint: options.breakpoint,
          originalId: item.i,
          stackId: options.stackId,
          message: `Layout item "${item.i}" has no matching structural element.`,
        });
      }
      continue;
    }

    const element = candidates[0];
    const solverRepresentable = isSolverRepresentable(item);
    const geometryValid = isValidGridGeometry(item);
    const outOfBounds = solverRepresentable && isOutOfBounds(item, options.cols);
    if (!geometryValid) {
      issues.push({
        code: 'INVALID_GEOMETRY',
        scope: options.source,
        breakpoint: options.breakpoint,
        originalId: item.i,
        diagnosticId: element.diagnosticId,
        stackId: options.stackId,
        message: `Layout item "${item.i}" has non-integral, non-finite, or non-positive geometry.`,
      });
    }
    if (outOfBounds) {
      issues.push({
        code: 'OUT_OF_BOUNDS',
        scope: options.source,
        breakpoint: options.breakpoint,
        originalId: item.i,
        diagnosticId: element.diagnosticId,
        stackId: options.stackId,
        message: options.cols === null
          ? `Layout item "${item.i}" starts outside the non-negative grid.`
          : `Layout item "${item.i}" exceeds the ${options.cols}-column grid.`,
      });
    }
    items.push({
      diagnosticId: element.diagnosticId,
      originalId: item.i,
      role: element.role,
      geometry: cloneGeometry(item, element.diagnosticId),
      solverRepresentable,
      geometryValid,
      outOfBounds,
    });
  }

  if (options.requireEveryElement) {
    for (const [originalId, elements] of registry) {
      if (elements.length !== 1 || counts.has(originalId)) continue;
      issues.push({
        code: 'MISSING_LAYOUT_ITEM',
        scope: options.source,
        breakpoint: options.breakpoint,
        originalId,
        diagnosticId: elements[0].diagnosticId,
        stackId: options.stackId,
        message: `Structural element "${originalId}" is missing from the layout.`,
      });
    }
  }

  return {
    items: items.sort((first, second) => compareStrings(first.diagnosticId, second.diagnosticId)),
    issues,
  };
}

function createStackSnapshots(
  sections: readonly ShadowSectionInput[],
  widgets: readonly ShadowWidgetInput[],
  explicitStacks: Readonly<Record<string, ShadowBreakpointLayoutsInput>> | undefined,
) {
  const stackSections = sections.filter(
    (section): section is ShadowSectionInput & { kind: ShadowStackSnapshot['kind'] } => isStackKind(section.kind),
  );
  const stackIds = new Set(stackSections.map((section) => section.id));
  const stackChildren: ShadowElement[] = [];
  const issues: ShadowAdapterIssue[] = [];

  for (const widget of widgets) {
    if (!widget.parentSectionId) continue;
    if (!stackIds.has(widget.parentSectionId)) {
      issues.push({
        code: 'ORPHAN_STACK_WIDGET',
        scope: 'structural',
        originalId: widget.id,
        stackId: widget.parentSectionId,
        message: `Widget "${widget.id}" references a missing or non-Stack parent "${widget.parentSectionId}".`,
      });
      continue;
    }
    stackChildren.push({
      diagnosticId: shadowWidgetId(widget.id, widget.parentSectionId),
      originalId: widget.id,
      role: 'stack-widget',
      widgetKind: widget.kind,
      parentSectionId: widget.parentSectionId,
      structuralGeometry: cloneGeometry(widget.layout, shadowWidgetId(widget.id, widget.parentSectionId)),
    });
  }

  const stacks = stackSections.map((section): ShadowStackSnapshot => {
    const children = stackChildren
      .filter((element) => element.parentSectionId === section.id)
      .sort((first, second) => compareStrings(first.diagnosticId, second.diagnosticId));
    const registry = buildRegistry(children);
    issues.push(...duplicateOriginalIdIssues(registry, 'stack', section.id));
    const explicit = explicitStacks?.[section.id];
    const breakpoints = {} as Record<DashboardGridBreakpoint, ShadowStackBreakpointSnapshot>;

    for (const breakpoint of DASHBOARD_GRID_BREAKPOINT_ORDER) {
      const hasExplicitLayout = hasOwnLayout(explicit, breakpoint);
      const sourceItems = hasExplicitLayout
        ? explicit?.[breakpoint] ?? []
        : children.map((child) => ({
            i: child.originalId,
            x: child.structuralGeometry.x,
            y: child.structuralGeometry.y,
            w: child.structuralGeometry.w,
            h: child.structuralGeometry.h,
          }));
      const converted = convertLayout(sourceItems, registry, {
        source: 'stack',
        breakpoint,
        cols: null,
        // StackGrid can fill missing explicit entries from structural geometry.
        requireEveryElement: !hasExplicitLayout,
        stackId: section.id,
      });
      const unavailable: ShadowAdapterIssue = {
        code: 'STACK_COLUMNS_UNAVAILABLE',
        scope: 'stack',
        breakpoint,
        stackId: section.id,
        originalId: section.id,
        diagnosticId: shadowSectionId(section.id),
        message: 'Effective internal Stack columns are resolved inside StackGrid; solver comparison is read-only but unavailable at this boundary.',
      };
      const breakpointIssues = [...converted.issues, unavailable];
      issues.push(...breakpointIssues);
      breakpoints[breakpoint] = {
        breakpoint,
        source: hasExplicitLayout ? 'explicit' : 'structural-fallback',
        hasExplicitLayout,
        items: converted.items,
        issues: breakpointIssues,
        effectiveColumns: null,
      };
    }

    return {
      diagnosticId: shadowSectionId(section.id),
      originalId: section.id,
      kind: section.kind,
      childCount: children.length,
      breakpoints,
    };
  });

  return {
    stacks: stacks.sort((first, second) => compareStrings(first.diagnosticId, second.diagnosticId)),
    stackChildren: stackChildren.sort((first, second) => compareStrings(first.diagnosticId, second.diagnosticId)),
    issues,
  };
}

/**
 * Pure read-only conversion from Home geometry to namespaced Grid Engine 2.0
 * inputs. It never repairs, rounds, clamps, or writes the legacy layout.
 */
export function adaptHomeLayoutsForShadow(input: ShadowLayoutAdapterInput): ShadowLayoutSnapshot {
  const rootElements = createRootElements(input.sections, input.widgets);
  const rootRegistry = buildRegistry(rootElements);
  const issues = duplicateOriginalIdIssues(rootRegistry, 'structural');
  const breakpoints = {} as Record<DashboardGridBreakpoint, ShadowRootBreakpointSnapshot>;

  for (const breakpoint of DASHBOARD_GRID_BREAKPOINT_ORDER) {
    const cols = GRID_ENGINE_COLS[breakpoint];
    const hasExplicitLayout = hasOwnLayout(input.explicitResponsiveLayouts?.root, breakpoint);
    const explicitIds = new Set(
      (input.explicitResponsiveLayouts?.root?.[breakpoint] ?? []).map((item) => item.i),
    );
    const legacy = convertLayout(input.legacyLayouts[breakpoint] ?? [], rootRegistry, {
      source: 'legacy',
      breakpoint,
      cols,
      requireEveryElement: true,
    });
    const runtimeAvailable = hasOwnLayout(input.runtimeLayouts, breakpoint);
    const runtime = runtimeAvailable
      ? convertLayout(input.runtimeLayouts?.[breakpoint] ?? [], rootRegistry, {
          source: 'runtime',
          breakpoint,
          cols,
          requireEveryElement: true,
        })
      : { items: [] as ShadowAdaptedItem[], issues: [] as ShadowAdapterIssue[] };
    const breakpointIssues = [...legacy.issues, ...runtime.issues];
    issues.push(...breakpointIssues);
    breakpoints[breakpoint] = {
      breakpoint,
      cols,
      source: hasExplicitLayout ? 'explicit-with-fallback' : 'legacy-derived',
      hasExplicitLayout,
      explicitItemCount: legacy.items.filter((item) => explicitIds.has(item.originalId)).length,
      derivedItemCount: legacy.items.filter((item) => !explicitIds.has(item.originalId)).length,
      items: legacy.items,
      runtimeItems: runtime.items,
      displayedItems: runtimeAvailable ? runtime.items : legacy.items,
      analyzedSource: runtimeAvailable ? 'runtime-displayed' : 'legacy-derived',
      runtimeAvailable,
      issues: breakpointIssues,
    };
  }

  const stackSnapshots = createStackSnapshots(
    input.sections,
    input.widgets,
    input.explicitResponsiveLayouts?.stacks,
  );
  issues.push(...stackSnapshots.issues);

  return {
    rootElements,
    stackChildren: stackSnapshots.stackChildren,
    breakpoints,
    stacks: stackSnapshots.stacks,
    issues,
  };
}

function geometrySignature(item: GridItem) {
  return `${item.i.length}:${item.i}@${String(item.x)},${String(item.y)},${String(item.w)},${String(item.h)}`;
}

function layoutsSignature(layouts: ShadowBreakpointLayoutsInput | undefined) {
  return DASHBOARD_GRID_BREAKPOINT_ORDER.map((breakpoint) => {
    const items = [...(layouts?.[breakpoint] ?? [])]
      .map((item) => geometrySignature(item))
      .sort(compareStrings)
      .join(';');
    const explicit = hasOwnLayout(layouts, breakpoint) ? '1' : '0';
    return `${breakpoint}:${explicit}:${items}`;
  }).join('|');
}

/** Cheap stable signature used to suppress duplicate analyses and log spam. */
export function createShadowInputSignature(input: ShadowLayoutAdapterInput) {
  const sections = [...input.sections]
    .map((section) => `${section.kind}:${geometrySignature({ ...section.layout, i: section.id })}`)
    .sort(compareStrings)
    .join('|');
  const widgets = [...input.widgets]
    .map((widget) => `${widget.kind}:${widget.parentSectionId ?? 'root'}:${geometrySignature({ ...widget.layout, i: widget.id })}`)
    .sort(compareStrings)
    .join('|');
  const stacks = Object.entries(input.explicitResponsiveLayouts?.stacks ?? {})
    .map(([stackId, layouts]) => `${stackId.length}:${stackId}:${layoutsSignature(layouts)}`)
    .sort(compareStrings)
    .join('|');
  return [
    `sections=${sections}`,
    `widgets=${widgets}`,
    `explicitRoot=${layoutsSignature(input.explicitResponsiveLayouts?.root)}`,
    `explicitStacks=${stacks}`,
    `legacy=${layoutsSignature(input.legacyLayouts)}`,
    `runtime=${layoutsSignature(input.runtimeLayouts)}`,
  ].join('||');
}
