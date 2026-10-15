import type {
  DashboardGridBreakpoint,
  WidgetLayoutOverrides,
  WidgetTypeBreakpointLayoutOverride,
  WidgetTypeLayoutOverrides,
} from '../../../types/widgetTypeLayout';
import { resolveWidgetTypeLayoutSpan } from '../dashboardBreakpointConfig';
import type { GridLayoutItem } from './model';
import type { GridEngineRootRuntimeOverride } from './gridEngineRootRuntimeSolver';
import type { RuntimeShadowRootElement } from './runtimeShadowBaseline';

export type RuntimeShadowLightState = {
  readonly id: string;
  readonly isOn: boolean;
};

export type RuntimeShadowOverrideIssueCode =
  | 'MISSING_STRUCTURAL_ITEM'
  | 'MISSING_LIGHT_STATE'
  | 'AMBIGUOUS_LIGHT_BASELINE'
  | 'INVALID_CONFIGURED_SPAN'
  | 'UNSUPPORTED_DYNAMIC_STACK';

export type RuntimeShadowOverrideIssue = {
  readonly code: RuntimeShadowOverrideIssueCode;
  readonly id: string;
};

export type RuntimeShadowOverrideInput = {
  readonly breakpoint: DashboardGridBreakpoint;
  readonly cols: number;
  readonly structuralLayout: readonly GridLayoutItem[];
  readonly legacyRuntimeLayout: readonly GridLayoutItem[];
  readonly rootElements: readonly RuntimeShadowRootElement[];
  readonly lightStates: readonly RuntimeShadowLightState[];
  readonly widgetTypeLayoutOverrides?: WidgetTypeLayoutOverrides;
  readonly widgetLayoutOverrides?: WidgetLayoutOverrides;
};

export type RuntimeShadowOverrideResult = {
  readonly structuralLayout: readonly GridLayoutItem[];
  readonly overrides: readonly GridEngineRootRuntimeOverride[];
  readonly issues: readonly RuntimeShadowOverrideIssue[];
  readonly dynamicStackIds: readonly string[];
};

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function hasConfiguredHeight(override: WidgetTypeBreakpointLayoutOverride | undefined) {
  return override?.h !== undefined || override?.hOn !== undefined || override?.hOff !== undefined;
}

/**
 * Produces absolute overrides from stable IDs, the active breakpoint and the
 * current Light state. It deliberately never accepts Widget.layout: that
 * field is mutated by the legacy runtime lifecycle and is not a baseline.
 */
export function deriveRuntimeShadowOverrides(
  input: RuntimeShadowOverrideInput,
): RuntimeShadowOverrideResult {
  const structuralById = new Map(input.structuralLayout.map((item) => [item.i, item]));
  const legacyById = new Map(input.legacyRuntimeLayout.map((item) => [item.i, item]));
  const lightStateById = new Map(input.lightStates.map((light) => [light.id, light]));
  const issues: RuntimeShadowOverrideIssue[] = [];
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
        // A size delta is evidence of a dynamic Stack, not enough information
        // to reconstruct its causal child measurement as an absolute override.
        dynamicStackIds.push(element.id);
        issues.push({ code: 'UNSUPPORTED_DYNAMIC_STACK', id: element.id });
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
    const defaults = resolveWidgetTypeLayoutSpan('light', input.breakpoint, {});
    const configuredWidth = positiveInteger(widgetOverride?.w)
      ?? positiveInteger(typeOverride?.w)
      ?? structural.w;
    const autoExpand = widgetOverride?.autoExpand ?? typeOverride?.autoExpand ?? true;

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
      ?? defaults.hOff;
    const onHeight = positiveInteger(widgetOverride?.hOn)
      ?? positiveInteger(widgetOverride?.h)
      ?? positiveInteger(typeOverride?.hOn)
      ?? positiveInteger(typeOverride?.h)
      ?? defaults.hOn;
    if (!offHeight || !onHeight) {
      issues.push({ code: 'INVALID_CONFIGURED_SPAN', id: element.id });
      return;
    }

    // A tall explicit item with no height contract could be a user-authored
    // fixed card or an already-expanded persisted runtime value. Refuse to
    // guess which one it is.
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
