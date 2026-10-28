import type { GridItem, Widget } from '../../../types/dashboardModels';
import {
  DASHBOARD_GRID_BREAKPOINT_ORDER,
  type DashboardGridBreakpoint,
} from '../../../types/widgetTypeLayout';
import {
  GRID_ENGINE_2_LAYOUT_ENGINE,
  type DashboardLayoutConfiguration,
} from '../../../services/dashboardConfigurationRepository';
import { GRID_ENGINE_COLS } from '../DashboardGrid';
import { resolveWidgetTypeLayoutSpan } from '../dashboardBreakpointConfig';
import {
  prepareGridEngineEditorLayout,
  type GridEngineEditorGeometryOrigin,
} from './gridEngineEditorIntegration';

const STACK_KINDS = new Set(['stack-vertical', 'stack-horizontal', 'stack-grid']);

export type GridEngine2TouchedBreakpoint = Readonly<{
  breakpoint: DashboardGridBreakpoint;
  origin: GridEngineEditorGeometryOrigin;
}>;

export type GridEngine2SaveValidationIssueCode =
  | 'NO_TOUCHED_BREAKPOINT'
  | 'DUPLICATE_INVENTORY_ID'
  | 'INVENTORY_CHANGED'
  | 'ORPHAN_STACK_CHILD'
  | 'STACK_STRUCTURE_CHANGED'
  | 'MISSING_STACK_LAYOUT'
  | 'INVALID_STACK_LAYOUT'
  | 'MISSING_TOUCHED_LAYOUT'
  | 'INVALID_TOUCHED_LAYOUT'
  | 'UNEXPECTED_WIDGET_SPAN'
  | 'RUNTIME_LIGHT_GEOMETRY'
  | 'UNTOUCHED_BREAKPOINT_CHANGED'
  | 'CANONICAL_LAYOUT_CHANGED'
  | 'XL_CANONICAL_MISMATCH';

export type GridEngine2SaveValidationIssue = Readonly<{
  code: GridEngine2SaveValidationIssueCode;
  message: string;
  breakpoint?: DashboardGridBreakpoint;
  id?: string;
}>;

export type GridEngine2SaveValidationResult = Readonly<{
  valid: boolean;
  issues: readonly GridEngine2SaveValidationIssue[];
  touchedBreakpoints: readonly DashboardGridBreakpoint[];
}>;

function geometry(item: GridItem, id = item.i): GridItem {
  return { i: id, x: item.x, y: item.y, w: item.w, h: item.h };
}

function layoutFingerprint(layout: readonly GridItem[] | undefined) {
  if (!layout) return 'missing';
  return JSON.stringify(layout.map((item) => geometry(item)).sort((left, right) => left.i.localeCompare(right.i)));
}

function rootInventory(dashboard: DashboardLayoutConfiguration) {
  return [
    ...dashboard.sections.map((section) => ({ id: section.id, role: 'section' as const })),
    ...dashboard.widgets
      .filter((widget) => !widget.parentSectionId)
      .map((widget) => ({ id: widget.id, role: 'widget' as const })),
  ].sort((left, right) => left.id.localeCompare(right.id));
}

function inventoryFingerprint(dashboard: DashboardLayoutConfiguration) {
  return JSON.stringify(rootInventory(dashboard));
}

function stackStructureFingerprint(dashboard: DashboardLayoutConfiguration) {
  const stacks = dashboard.sections
    .filter((section) => STACK_KINDS.has(section.kind))
    .map((section) => section.id)
    .sort();
  const children = dashboard.widgets
    .filter((widget) => widget.parentSectionId)
    .map((widget) => [widget.id, widget.parentSectionId] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify({ stacks, children, responsive: dashboard.responsiveLayouts.stacks ?? {} });
}

function stackMembershipFingerprint(dashboard: DashboardLayoutConfiguration) {
  const stacks = dashboard.sections
    .filter((section) => STACK_KINDS.has(section.kind))
    .map((section) => [section.id, section.kind])
    .sort(([left], [right]) => left.localeCompare(right));
  const children = dashboard.widgets
    .filter((widget) => widget.parentSectionId)
    .map((widget) => [widget.id, widget.parentSectionId] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify({ stacks, children });
}

function intersects(first: GridItem, second: GridItem) {
  return first.x < second.x + second.w && first.x + first.w > second.x
    && first.y < second.y + second.h && first.y + first.h > second.y;
}

function canonicalRootFingerprint(dashboard: DashboardLayoutConfiguration) {
  return JSON.stringify([
    ...dashboard.sections.map((section) => geometry(section.layout, section.id)),
    ...dashboard.widgets
      .filter((widget) => !widget.parentSectionId)
      .map((widget) => geometry(widget.layout, widget.id)),
  ].sort((left, right) => left.i.localeCompare(right.i)));
}

function positiveInteger(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.max(1, Math.round(value))
    : undefined;
}

function expectedWidgetSpan(
  dashboard: DashboardLayoutConfiguration,
  widget: Widget,
  breakpoint: DashboardGridBreakpoint,
) {
  const typeSpan = resolveWidgetTypeLayoutSpan(
    widget.kind,
    breakpoint,
    dashboard.widgetTypeLayoutOverrides,
  );
  const override = dashboard.widgetLayoutOverrides[widget.id]?.[breakpoint];
  const w = positiveInteger(override?.w) ?? typeSpan.w;
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
    h: autoExpand
      ? positiveInteger(override?.hOff) ?? positiveInteger(override?.h) ?? positiveInteger(typeSpan.hOff) ?? 1
      : fixedHeight,
  };
}

function spanContractChanged(
  dashboard: DashboardLayoutConfiguration,
  baseline: DashboardLayoutConfiguration,
  widget: Widget,
  breakpoint: DashboardGridBreakpoint,
) {
  const currentWidgetOverride = dashboard.widgetLayoutOverrides[widget.id]?.[breakpoint] ?? null;
  const baselineWidgetOverride = baseline.widgetLayoutOverrides[widget.id]?.[breakpoint] ?? null;
  const currentTypeOverride = dashboard.widgetTypeLayoutOverrides[widget.kind]?.[breakpoint] ?? null;
  const baselineTypeOverride = baseline.widgetTypeLayoutOverrides[widget.kind]?.[breakpoint] ?? null;
  return JSON.stringify(currentWidgetOverride) !== JSON.stringify(baselineWidgetOverride)
    || JSON.stringify(currentTypeOverride) !== JSON.stringify(baselineTypeOverride);
}

function findDuplicateIds(dashboard: DashboardLayoutConfiguration) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of [
    ...dashboard.sections.map((section) => section.id),
    ...dashboard.widgets.map((widget) => widget.id),
  ]) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return duplicates;
}

function canonicalById(dashboard: DashboardLayoutConfiguration) {
  return new Map<string, GridItem>([
    ...dashboard.sections.map((section) => [section.id, geometry(section.layout, section.id)] as const),
    ...dashboard.widgets
      .filter((widget) => !widget.parentSectionId)
      .map((widget) => [widget.id, geometry(widget.layout, widget.id)] as const),
  ]);
}

function sameGeometry(left: GridItem | undefined, right: GridItem | undefined) {
  return Boolean(left && right) && left!.x === right!.x && left!.y === right!.y
    && left!.w === right!.w && left!.h === right!.h;
}

export function validateGridEngine2DashboardForSave(input: Readonly<{
  dashboard: DashboardLayoutConfiguration;
  baseline: DashboardLayoutConfiguration;
  touchedBreakpoints: readonly GridEngine2TouchedBreakpoint[];
}>): GridEngine2SaveValidationResult {
  const issues: GridEngine2SaveValidationIssue[] = [];
  const isFinalGridEngine2Home = input.dashboard.layoutEngine === GRID_ENGINE_2_LAYOUT_ENGINE;
  const touchedByBreakpoint = new Map(input.touchedBreakpoints.map((entry) => [entry.breakpoint, entry]));
  const touchedBreakpoints = DASHBOARD_GRID_BREAKPOINT_ORDER.filter((breakpoint) => touchedByBreakpoint.has(breakpoint));
  if (touchedBreakpoints.length === 0) {
    issues.push({ code: 'NO_TOUCHED_BREAKPOINT', message: 'Nessun breakpoint Grid Engine risulta modificato.' });
  }

  for (const id of findDuplicateIds(input.dashboard)) {
    issues.push({ code: 'DUPLICATE_INVENTORY_ID', id, message: `L'inventario contiene più volte ${id}.` });
  }
  if (inventoryFingerprint(input.dashboard) !== inventoryFingerprint(input.baseline)) {
    issues.push({ code: 'INVENTORY_CHANGED', message: 'L’inventario root è cambiato durante la sessione Grid Engine.' });
  }

  const stackIds = new Set(input.dashboard.sections
    .filter((section) => STACK_KINDS.has(section.kind))
    .map((section) => section.id));
  for (const widget of input.dashboard.widgets) {
    if (widget.parentSectionId && !stackIds.has(widget.parentSectionId)) {
      issues.push({
        code: 'ORPHAN_STACK_CHILD',
        id: widget.id,
        message: `Il widget ${widget.id} non appartiene a uno Stack root valido.`,
      });
    }
  }
  const stackStructureChanged = isFinalGridEngine2Home
    ? stackMembershipFingerprint(input.dashboard) !== stackMembershipFingerprint(input.baseline)
    : stackStructureFingerprint(input.dashboard) !== stackStructureFingerprint(input.baseline);
  if (stackStructureChanged) {
    issues.push({
      code: 'STACK_STRUCTURE_CHANGED',
      message: isFinalGridEngine2Home
        ? 'La composizione degli Stack è cambiata durante l’attivazione della nuova Home.'
        : 'Struttura o geometria interna degli Stack cambiata nella sessione Grid Engine.',
    });
  }

  if (
    isFinalGridEngine2Home &&
    input.baseline.layoutEngine !== GRID_ENGINE_2_LAYOUT_ENGINE &&
    touchedBreakpoints.length !== DASHBOARD_GRID_BREAKPOINT_ORDER.length
  ) {
    issues.push({
      code: 'MISSING_TOUCHED_LAYOUT',
      message: 'L’attivazione iniziale della Home 2.0 deve generare e verificare tutti i sei breakpoint.',
    });
  }

  if (isFinalGridEngine2Home) {
    for (const section of input.dashboard.sections.filter((entry) => STACK_KINDS.has(entry.kind))) {
      const childIds = input.dashboard.widgets
        .filter((widget) => widget.parentSectionId === section.id)
        .map((widget) => widget.id);
      for (const breakpoint of DASHBOARD_GRID_BREAKPOINT_ORDER) {
        const layout = input.dashboard.responsiveLayouts.stacks?.[section.id]?.[breakpoint];
        if (!layout) {
          issues.push({
            code: 'MISSING_STACK_LAYOUT',
            breakpoint,
            id: section.id,
            message: `Lo Stack ${section.id} non contiene il layout ${breakpoint}.`,
          });
          continue;
        }
        const ids = layout.map((item) => item.i);
        const exactInventory = ids.length === childIds.length
          && new Set(ids).size === ids.length
          && childIds.every((id) => ids.includes(id));
        const stackCols = section.kind === 'stack-vertical'
          ? 1
          : Math.min(GRID_ENGINE_COLS[breakpoint], positiveInteger(section.stackColumns) ?? GRID_ENGINE_COLS[breakpoint]);
        const invalidGeometry = layout.some((item, index) =>
          !Number.isSafeInteger(item.x) || !Number.isSafeInteger(item.y)
          || !Number.isSafeInteger(item.w) || !Number.isSafeInteger(item.h)
          || item.x < 0 || item.y < 0 || item.w < 1 || item.h < 1
          || item.x + item.w > stackCols
          || layout.slice(0, index).some((previous) => intersects(item, previous)),
        );
        if (!exactInventory || invalidGeometry) {
          issues.push({
            code: 'INVALID_STACK_LAYOUT',
            breakpoint,
            id: section.id,
            message: `La geometria interna ${breakpoint} dello Stack ${section.id} non è valida.`,
          });
        }
      }
    }
  }

  const rootIds = rootInventory(input.dashboard).map((entry) => entry.id);
  const rootWidgets = input.dashboard.widgets.filter((widget) => !widget.parentSectionId);
  for (const breakpoint of DASHBOARD_GRID_BREAKPOINT_ORDER) {
    const currentLayout = input.dashboard.responsiveLayouts.root?.[breakpoint];
    const baselineLayout = input.baseline.responsiveLayouts.root?.[breakpoint];
    const touch = touchedByBreakpoint.get(breakpoint);
    if (!touch) {
      if (layoutFingerprint(currentLayout) !== layoutFingerprint(baselineLayout)) {
        issues.push({
          code: 'UNTOUCHED_BREAKPOINT_CHANGED',
          breakpoint,
          message: `Il breakpoint ${breakpoint} è cambiato senza una commit Grid Engine corrispondente.`,
        });
      }
      continue;
    }
    if (!currentLayout) {
      issues.push({
        code: 'MISSING_TOUCHED_LAYOUT',
        breakpoint,
        message: `Il breakpoint ${breakpoint} non contiene una geometria strutturale esplicita.`,
      });
      continue;
    }
    const prepared = prepareGridEngineEditorLayout({
      effectiveLayout: currentLayout,
      structuralLayout: currentLayout,
      rootIds,
      stackIds,
      cols: GRID_ENGINE_COLS[breakpoint],
      origin: touch.origin,
    });
    if (prepared.status !== 'ready') {
      issues.push({
        code: 'INVALID_TOUCHED_LAYOUT',
        breakpoint,
        message: `La geometria ${breakpoint} non è persistibile: ${prepared.reason}.`,
      });
      continue;
    }
    const layoutById = new Map(currentLayout.map((item) => [item.i, item]));
    const baselineLayoutById = new Map((baselineLayout ?? []).map((item) => [item.i, item]));
    for (const widget of rootWidgets) {
      const item = layoutById.get(widget.id);
      if (!item) continue;
      const baselineItem = baselineLayoutById.get(widget.id);
      const preserveVerifiedLegacySpan = !isFinalGridEngine2Home && widget.kind !== 'light'
        && baselineItem !== undefined
        && !spanContractChanged(input.dashboard, input.baseline, widget, breakpoint);
      const expected = preserveVerifiedLegacySpan
        ? { w: baselineItem.w, h: baselineItem.h }
        : expectedWidgetSpan(input.dashboard, widget, breakpoint);
      if (item.w !== expected.w || item.h !== expected.h) {
        issues.push({
          code: widget.kind === 'light' && item.h !== expected.h
            ? 'RUNTIME_LIGHT_GEOMETRY'
            : 'UNEXPECTED_WIDGET_SPAN',
          breakpoint,
          id: widget.id,
          message: widget.kind === 'light'
            ? `La Light ${widget.id} contiene una dimensione runtime non strutturale nel breakpoint ${breakpoint}.`
            : preserveVerifiedLegacySpan
              ? `Il widget ${widget.id} cambia dimensione nel breakpoint ${breakpoint} senza un resize o un override verificabile.`
              : `Il widget ${widget.id} non rispetta le dimensioni configurate per il breakpoint ${breakpoint}.`,
        });
      }
    }
  }

  if (touchedByBreakpoint.has('xl')) {
    const canonical = canonicalById(input.dashboard);
    const xl = new Map((input.dashboard.responsiveLayouts.root?.xl ?? []).map((item) => [item.i, item]));
    for (const id of rootIds) {
      if (!sameGeometry(canonical.get(id), xl.get(id))) {
        issues.push({
          code: 'XL_CANONICAL_MISMATCH',
          breakpoint: 'xl',
          id,
          message: `La geometria canonica di ${id} non coincide con XL.`,
        });
      }
    }
  } else if (canonicalRootFingerprint(input.dashboard) !== canonicalRootFingerprint(input.baseline)) {
    issues.push({
      code: 'CANONICAL_LAYOUT_CHANGED',
      message: 'Le coordinate canoniche sono cambiate senza una commit XL.',
    });
  }

  return { valid: issues.length === 0, issues, touchedBreakpoints };
}
