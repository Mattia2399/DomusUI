import type {
  DashboardGridBreakpoint,
  WidgetLayoutOverrides,
  WidgetTypeBreakpointLayoutOverride,
  WidgetTypeLayoutOverrides,
} from '../../../types/widgetTypeLayout';
import { resolveWidgetTypeLayoutSpan } from '../dashboardBreakpointConfig';
import {
  resolveGridLightRuntimeMetrics,
  type GridMetricsVersion,
} from './gridMetrics';
import type { GridLayoutItem } from './model';
import type { GridEngineRootRuntimeOverride } from './gridEngineRootRuntimeSolver';

export type GridEngineRuntimeRootElement = Readonly<{
  id: string;
  role: 'widget' | 'section' | 'stack';
  kind?: string;
}>;

export type GridEngineRuntimeLightState = Readonly<{
  id: string;
  isOn: boolean;
}>;

export type GridEngineRuntimeOverrideIssueCode =
  | 'MISSING_STRUCTURAL_ITEM'
  | 'MISSING_LIGHT_STATE'
  | 'AMBIGUOUS_LIGHT_BASELINE'
  | 'INVALID_CONFIGURED_SPAN'
  | 'UNSUPPORTED_DYNAMIC_STACK';

export type GridEngineRuntimeOverrideIssue = Readonly<{
  code: GridEngineRuntimeOverrideIssueCode;
  id: string;
}>;

export type GridEngineRuntimeOverrideInput = Readonly<{
  breakpoint: DashboardGridBreakpoint;
  cols: number;
  structuralLayout: readonly GridLayoutItem[];
  legacyRuntimeLayout: readonly GridLayoutItem[];
  rootElements: readonly GridEngineRuntimeRootElement[];
  lightStates: readonly GridEngineRuntimeLightState[];
  widgetTypeLayoutOverrides?: WidgetTypeLayoutOverrides;
  widgetLayoutOverrides?: WidgetLayoutOverrides;
  /** Defaults to legacy until a future dashboard-level metrics version is explicit. */
  metricsVersion?: GridMetricsVersion;
  /** GE2 Homes can express measured Stack spans as presentation-only overrides. */
  supportDynamicStacks?: boolean;
}>;

export type GridEngineRuntimeOverrideResult = Readonly<{
  structuralLayout: readonly GridLayoutItem[];
  overrides: readonly GridEngineRootRuntimeOverride[];
  issues: readonly GridEngineRuntimeOverrideIssue[];
  dynamicStackIds: readonly string[];
}>;

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function hasConfiguredHeight(override: WidgetTypeBreakpointLayoutOverride | undefined) {
  return override?.h !== undefined || override?.hOn !== undefined || override?.hOff !== undefined;
}

/**
 * Produces absolute runtime overrides from immutable structural coordinates.
 * It never accepts Widget.layout and never mutates or persists its input.
 */
export function deriveGridEngineRuntimeOverrides(
  input: GridEngineRuntimeOverrideInput,
): GridEngineRuntimeOverrideResult {
  const structuralById = new Map(input.structuralLayout.map((item) => [item.i, item]));
  const legacyById = new Map(input.legacyRuntimeLayout.map((item) => [item.i, item]));
  const lightStateById = new Map(input.lightStates.map((light) => [light.id, light]));
  const issues: GridEngineRuntimeOverrideIssue[] = [];
  const overrides: GridEngineRootRuntimeOverride[] = [];
  const normalizedById = new Map(input.structuralLayout.map((item) => [item.i, { ...item }]));
  const dynamicStackIds: string[] = [];

  input.rootElements.forEach((element) => {
    const structural = structuralById.get(element.id);
    if (!structural) {
      issues.push({ code: 'MISSING_STRUCTURAL_ITEM', id: element.id });
      return;
    }

    if (element.role === 'stack') {
      const legacy = legacyById.get(element.id);
      if (legacy && (legacy.w !== structural.w || legacy.h !== structural.h)) {
        dynamicStackIds.push(element.id);
        if (input.supportDynamicStacks) {
          overrides.push({ id: element.id, w: legacy.w, h: legacy.h });
        } else {
          issues.push({ code: 'UNSUPPORTED_DYNAMIC_STACK', id: element.id });
        }
      }
      return;
    }

    if (element.role !== 'widget' || element.kind !== 'light') return;
    const light = lightStateById.get(element.id);
    if (!light) {
      issues.push({ code: 'MISSING_LIGHT_STATE', id: element.id });
      return;
    }

    const typeOverride = input.widgetTypeLayoutOverrides?.light?.[input.breakpoint];
    const widgetOverride = input.widgetLayoutOverrides?.[element.id]?.[input.breakpoint];
    const legacyDefaults = resolveWidgetTypeLayoutSpan('light', input.breakpoint, {});
    const runtimeDefaults = input.metricsVersion === 'v2'
      ? resolveGridLightRuntimeMetrics('v2')
      : {
          hOff: legacyDefaults.hOff,
          hOn: legacyDefaults.hOn,
          autoExpand: legacyDefaults.autoExpand ?? true,
        };
    const configuredWidth = positiveInteger(widgetOverride?.w)
      ?? positiveInteger(typeOverride?.w)
      ?? structural.w;
    const autoExpand = widgetOverride?.autoExpand
      ?? typeOverride?.autoExpand
      ?? runtimeDefaults.autoExpand;

    if (configuredWidth > input.cols || structural.x + configuredWidth > input.cols) {
      issues.push({ code: 'INVALID_CONFIGURED_SPAN', id: element.id });
      return;
    }

    if (!autoExpand) {
      const fixedHeight = positiveInteger(widgetOverride?.h)
        ?? positiveInteger(widgetOverride?.hOff)
        ?? positiveInteger(widgetOverride?.hOn)
        ?? positiveInteger(typeOverride?.h)
        ?? positiveInteger(typeOverride?.hOff)
        ?? positiveInteger(typeOverride?.hOn)
        ?? structural.h;
      normalizedById.set(element.id, { ...structural, w: configuredWidth, h: fixedHeight });
      return;
    }

    const hasExplicitHeight = hasConfiguredHeight(widgetOverride) || hasConfiguredHeight(typeOverride);
    const offHeight = positiveInteger(widgetOverride?.hOff)
      ?? positiveInteger(widgetOverride?.h)
      ?? positiveInteger(typeOverride?.hOff)
      ?? positiveInteger(typeOverride?.h)
      ?? runtimeDefaults.hOff;
    const onHeight = positiveInteger(widgetOverride?.hOn)
      ?? positiveInteger(widgetOverride?.h)
      ?? positiveInteger(typeOverride?.hOn)
      ?? positiveInteger(typeOverride?.h)
      ?? runtimeDefaults.hOn;
    if (!offHeight || !onHeight) {
      issues.push({ code: 'INVALID_CONFIGURED_SPAN', id: element.id });
      return;
    }

    if (!hasExplicitHeight && structural.h !== offHeight) {
      issues.push({ code: 'AMBIGUOUS_LIGHT_BASELINE', id: element.id });
      return;
    }

    normalizedById.set(element.id, { ...structural, w: configuredWidth, h: offHeight });
    if (light.isOn && onHeight !== offHeight) {
      overrides.push({ id: element.id, w: configuredWidth, h: onHeight });
    }
  });

  return {
    structuralLayout: input.structuralLayout.map((item) => ({ ...normalizedById.get(item.i)! })),
    overrides,
    issues,
    dynamicStackIds,
  };
}
