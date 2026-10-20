import {
  DASHBOARD_GRID_BREAKPOINT_ORDER,
  type DashboardBreakpointLayouts,
  type DashboardGridBreakpoint,
} from '../../../types/widgetTypeLayout';
import type { GridPolicyDeclaration } from './gridStructuralPolicy';
import {
  GRID_STRUCTURAL_POLICY_SHADOW_COLS,
  type GridStructuralPolicyShadowInput,
  type GridStructuralShadowContext,
  type GridStructuralShadowDerivedLineage,
  type GridStructuralShadowSnapshotState,
} from './gridStructuralPolicyShadowAdapter';
import type { GridLayoutItem } from './model';
import type { RuntimeShadowRootElement } from './runtimeShadowBaseline';
import { auditRuntimeShadowIds } from './runtimeShadowIdAudit';
import type {
  RuntimeShadowConfigurationCompleteness,
  RuntimeShadowNestedElement,
} from './runtimeShadowReconciliation';

export const VERIFIED_SHADOW_CONTEXT: GridStructuralShadowContext = {
  generation: 84,
  revision: 84,
  fingerprint: 'verified-structural-document',
};

export const SHADOW_ROOTS: readonly RuntimeShadowRootElement[] = [
  { id: 'section-greeting', role: 'section', kind: 'greeting' },
  { id: 'section-stack-grid-1', role: 'stack', kind: 'stack-grid' },
  { id: 'sensor.custom_1', role: 'widget', kind: 'sensor' },
];

export const SHADOW_STACK_CHILD: RuntimeShadowNestedElement = {
  id: 'light.custom_2',
  role: 'widget',
  kind: 'light',
  parentRole: 'stack',
};

export function layoutForRoots(
  roots: readonly RuntimeShadowRootElement[],
  breakpoint: DashboardGridBreakpoint,
): GridLayoutItem[] {
  const cols = GRID_STRUCTURAL_POLICY_SHADOW_COLS[breakpoint];
  return roots.map((root, index) => ({
    i: root.id,
    x: 0,
    y: index,
    w: Math.min(2, cols),
    h: 1,
  }));
}

export function layoutsForRoots(
  roots: readonly RuntimeShadowRootElement[] = SHADOW_ROOTS,
): DashboardBreakpointLayouts {
  return Object.fromEntries(DASHBOARD_GRID_BREAKPOINT_ORDER.map((breakpoint) => [
    breakpoint,
    layoutForRoots(roots, breakpoint),
  ]));
}

type ShadowFixtureOptions = Readonly<{
  context?: GridStructuralShadowContext | null;
  inventoryContext?: GridStructuralShadowContext | null;
  layoutsContext?: GridStructuralShadowContext | null;
  legacyContext?: GridStructuralShadowContext | null;
  snapshotState?: GridStructuralShadowSnapshotState;
  configurationCompleteness?: RuntimeShadowConfigurationCompleteness;
  rootElements?: readonly RuntimeShadowRootElement[];
  knownNonRootElements?: readonly RuntimeShadowNestedElement[];
  structuralLayouts?: Readonly<DashboardBreakpointLayouts>;
  legacyLayouts?: Readonly<DashboardBreakpointLayouts>;
  reconciliationEnabled?: boolean;
  policyDeclarations?: Readonly<Partial<Record<DashboardGridBreakpoint, readonly GridPolicyDeclaration[]>>>;
  derivedLineage?: Readonly<Partial<Record<DashboardGridBreakpoint, GridStructuralShadowDerivedLineage>>>;
}>;

export function createStructuralPolicyShadowFixture(
  options: ShadowFixtureOptions = {},
): GridStructuralPolicyShadowInput {
  const rootElements = options.rootElements ?? SHADOW_ROOTS;
  const structuralLayouts = options.structuralLayouts ?? layoutsForRoots(rootElements);
  const legacyLayouts = options.legacyLayouts ?? structuredClone(structuralLayouts);
  const knownNonRootElements = options.knownNonRootElements ?? [SHADOW_STACK_CHILD];
  return {
    structuralContext: options.context === undefined ? VERIFIED_SHADOW_CONTEXT : options.context,
    ...(options.inventoryContext === undefined ? null : { inventoryContext: options.inventoryContext }),
    ...(options.layoutsContext === undefined ? null : { layoutsContext: options.layoutsContext }),
    ...(options.legacyContext === undefined ? null : { legacyContext: options.legacyContext }),
    snapshotState: options.snapshotState ?? 'verified-home-assistant',
    configurationCompleteness: options.configurationCompleteness ?? 'verified-complete',
    rootElements,
    knownNonRootElements,
    structuralLayouts,
    baselineIdAudit: auditRuntimeShadowIds({
      rootElements,
      knownNonRootElements,
      explicitLayouts: structuralLayouts,
      rendererLayouts: legacyLayouts,
    }),
    reconciliationEnabled: options.reconciliationEnabled ?? true,
    legacyLayouts,
    ...(options.policyDeclarations ? { policyDeclarations: options.policyDeclarations } : null),
    ...(options.derivedLineage ? { derivedLineage: options.derivedLineage } : null),
  };
}

export function packedStructuralPolicyShadowFixture(count: number) {
  const roots = Array.from({ length: count }, (_, index): RuntimeShadowRootElement => ({
    id: `sensor.custom_${index}`,
    role: 'widget',
    kind: 'sensor',
  }));
  return createStructuralPolicyShadowFixture({ rootElements: roots, knownNonRootElements: [] });
}
