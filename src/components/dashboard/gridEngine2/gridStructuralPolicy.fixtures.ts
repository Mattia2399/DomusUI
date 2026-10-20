import type { DashboardGridBreakpoint } from '../../../types/widgetTypeLayout';
import type { GridLayoutItem } from './model';
import type {
  GridStructuralInventory,
  ResolveGridStructuralPolicyInput,
} from './gridStructuralPolicy';

export const STRUCTURAL_POLICY_BREAKPOINT_COLS: Readonly<Record<DashboardGridBreakpoint, number>> = {
  '2xl': 12,
  xl: 12,
  lg: 8,
  md: 6,
  sm: 4,
  xs: 2,
};

export const REALISTIC_ACTIVE_ROOT_IDS = [
  'special-activity',
  'special-scenes',
  'widget-light',
  'widget-direct',
  'widget-chain',
  'widget-lane',
  'widget-five',
  'widget-six',
  'widget-seven',
  'widget-eight',
  'widget-nine',
] as const;

export const REALISTIC_EXTRA_IDS = Array.from(
  { length: 12 },
  (_, index) => `obsolete-slot-${String(index + 1).padStart(2, '0')}`,
);

function activeLayout(): GridLayoutItem[] {
  return [
    { i: 'special-activity', x: 0, y: 0, w: 4, h: 1 },
    { i: 'special-scenes', x: 4, y: 0, w: 4, h: 2 },
    { i: 'widget-light', x: 0, y: 2, w: 2, h: 1 },
    { i: 'widget-lane', x: 2, y: 2, w: 2, h: 1 },
    { i: 'widget-direct', x: 0, y: 3, w: 2, h: 1 },
    { i: 'widget-five', x: 4, y: 3, w: 2, h: 1 },
    { i: 'widget-six', x: 6, y: 3, w: 2, h: 1 },
    { i: 'widget-chain', x: 0, y: 5, w: 2, h: 1 },
    { i: 'widget-seven', x: 2, y: 7, w: 2, h: 1 },
    { i: 'widget-eight', x: 4, y: 8, w: 2, h: 1 },
    { i: 'widget-nine', x: 6, y: 10, w: 2, h: 1 },
  ];
}

function extraLayout(): GridLayoutItem[] {
  return REALISTIC_EXTRA_IDS.map((id, index) => ({
    i: id,
    x: index % 2,
    y: 20 + index,
    w: 1,
    h: 1,
  }));
}

function activeInventory(): GridStructuralInventory {
  return {
    completeness: 'verified-complete',
    items: REALISTIC_ACTIVE_ROOT_IDS.map((id, order) => ({
      id,
      state: 'active' as const,
      kind: id.startsWith('special-') ? 'special-section' as const : 'widget' as const,
      order,
    })),
  };
}

function legacyRuntimeLayout(): GridLayoutItem[] {
  const targetY = new Map<string, number>([
    ['widget-light', 1],
    ['widget-lane', 1],
    ['widget-direct', 2],
    ['widget-five', 2],
    ['widget-six', 2],
    ['widget-chain', 3],
    ['widget-seven', 3],
    ['widget-eight', 4],
    ['widget-nine', 6],
  ]);
  return activeLayout().map((item) => ({ ...item, y: targetY.get(item.i) ?? item.y }));
}

export function createRealisticStructuralPolicyFixture(): Readonly<{
  input: ResolveGridStructuralPolicyInput;
  activeBaseline: readonly GridLayoutItem[];
  legacyRuntimeLayout: readonly GridLayoutItem[];
  lightOnOverride: Readonly<{ id: string; w: number; h: number }>;
}> {
  const active = activeLayout();
  const baseline = [...active, ...extraLayout()];
  return {
    input: {
      scope: { kind: 'root' },
      breakpoint: 'lg',
      cols: STRUCTURAL_POLICY_BREAKPOINT_COLS.lg,
      declarations: [{
        source: 'synthetic-breakpoint-policy',
        mode: 'manual',
        provenance: 'user-explicit',
      }],
      layoutState: 'explicit-complete',
      baselineTrust: 'authoritative',
      baseline,
      inventory: activeInventory(),
    },
    activeBaseline: active,
    legacyRuntimeLayout: legacyRuntimeLayout(),
    lightOnOverride: { id: 'widget-light', w: 2, h: 2 },
  };
}
