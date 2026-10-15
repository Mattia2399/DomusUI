import type { DashboardGridBreakpoint } from '../../../types/widgetTypeLayout';
import type { GridLayoutItem } from './model';

export type RuntimeShadowRootRole = 'widget' | 'section' | 'stack';

export type RuntimeShadowRootElement = {
  readonly id: string;
  readonly role: RuntimeShadowRootRole;
  readonly kind: string;
};

export type RuntimeShadowBaselineQuality =
  | 'explicit-complete-candidate'
  | 'partial'
  | 'derived'
  | 'unreliable'
  | 'insufficient-data';

export type RuntimeShadowBaselineIssueCode =
  | 'INVALID_COLUMNS'
  | 'DUPLICATE_ROOT_ID'
  | 'INVALID_LAYOUT_ID'
  | 'DUPLICATE_LAYOUT_ID'
  | 'UNKNOWN_LAYOUT_ID'
  | 'MISSING_LAYOUT_ID'
  | 'INVALID_GEOMETRY'
  | 'OUT_OF_BOUNDS'
  | 'OVERLAP'
  | 'KNOWN_RUNTIME_CONTAMINATION'
  | 'NO_STRUCTURAL_SOURCE';

export type RuntimeShadowBaselineIssue = {
  readonly code: RuntimeShadowBaselineIssueCode;
  readonly id?: string;
};

export type RuntimeShadowBaselineInput = {
  readonly breakpoint: DashboardGridBreakpoint;
  readonly cols: number;
  readonly rootElements: readonly RuntimeShadowRootElement[];
  readonly hasExplicitLayout: boolean;
  readonly explicitLayout?: readonly GridLayoutItem[];
  readonly derivedLayout?: readonly GridLayoutItem[];
  /** Used only when the caller can positively identify a contaminated source. */
  readonly knownRuntimeContamination?: boolean;
  /** Reserved for a future persisted revision that can prove historical origin. */
  readonly historicallyVerified?: boolean;
};

export type RuntimeShadowBaselineResult = {
  readonly breakpoint: DashboardGridBreakpoint;
  readonly quality: RuntimeShadowBaselineQuality;
  readonly provenance: 'responsive-layout-root' | 'derived-grid-engine-layout' | 'none';
  readonly comparisonConfidence: 'reliable' | 'provisional' | 'unavailable';
  readonly layout: readonly GridLayoutItem[] | null;
  readonly rootElementCount: number;
  readonly issues: readonly RuntimeShadowBaselineIssue[];
  readonly limitations: readonly string[];
};

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function overlaps(first: GridLayoutItem, second: GridLayoutItem) {
  return (
    first.x < second.x + second.w &&
    first.x + first.w > second.x &&
    first.y < second.y + second.h &&
    first.y + first.h > second.y
  );
}

function cloneLayout(layout: readonly GridLayoutItem[]) {
  return layout.map((item) => ({ ...item }));
}

/**
 * Selects a structural source without falling back to the live Home model.
 * Derived layouts are classified for observability, but are never returned as
 * solver input because their spans already include current entity state.
 */
export function evaluateRuntimeShadowBaseline(
  input: RuntimeShadowBaselineInput,
): RuntimeShadowBaselineResult {
  const base = {
    breakpoint: input.breakpoint,
    rootElementCount: input.rootElements.length,
  } as const;
  if (!isInteger(input.cols) || input.cols <= 0) {
    return {
      ...base,
      quality: 'unreliable',
      provenance: 'none',
      comparisonConfidence: 'unavailable',
      layout: null,
      issues: [{ code: 'INVALID_COLUMNS' }],
      limitations: [],
    };
  }

  const rootIds = new Set<string>();
  const duplicateRoot = input.rootElements.find((element) => {
    if (!element.id || rootIds.has(element.id)) return true;
    rootIds.add(element.id);
    return false;
  });
  if (duplicateRoot) {
    return {
      ...base,
      quality: 'unreliable',
      provenance: 'none',
      comparisonConfidence: 'unavailable',
      layout: null,
      issues: [{ code: 'DUPLICATE_ROOT_ID', id: duplicateRoot.id || undefined }],
      limitations: [],
    };
  }

  if (input.knownRuntimeContamination) {
    return {
      ...base,
      quality: 'unreliable',
      provenance: input.hasExplicitLayout
        ? 'responsive-layout-root'
        : input.derivedLayout
          ? 'derived-grid-engine-layout'
          : 'none',
      comparisonConfidence: 'unavailable',
      layout: null,
      issues: [{ code: 'KNOWN_RUNTIME_CONTAMINATION' }],
      limitations: ['known-runtime-contamination'],
    };
  }

  if (!input.hasExplicitLayout) {
    if (input.derivedLayout) {
      return {
        ...base,
        quality: 'derived',
        provenance: 'derived-grid-engine-layout',
        comparisonConfidence: 'unavailable',
        layout: null,
        issues: [{ code: 'NO_STRUCTURAL_SOURCE' }],
        limitations: ['derived-layout-may-contain-runtime-geometry'],
      };
    }
    return {
      ...base,
      quality: 'insufficient-data',
      provenance: 'none',
      comparisonConfidence: 'unavailable',
      layout: null,
      issues: [{ code: 'NO_STRUCTURAL_SOURCE' }],
      limitations: ['no-identifiable-structural-source'],
    };
  }

  const layout = input.explicitLayout ?? [];
  const issues: RuntimeShadowBaselineIssue[] = [];
  const layoutById = new Map<string, GridLayoutItem>();
  const validItems: GridLayoutItem[] = [];
  layout.forEach((item) => {
    if (!item || typeof item.i !== 'string' || !item.i) {
      issues.push({ code: 'INVALID_LAYOUT_ID', id: item?.i });
      return;
    }
    if (layoutById.has(item.i)) {
      issues.push({ code: 'DUPLICATE_LAYOUT_ID', id: item.i });
      return;
    }
    layoutById.set(item.i, item);
    if (!rootIds.has(item.i)) issues.push({ code: 'UNKNOWN_LAYOUT_ID', id: item.i });
    if (
      !isInteger(item.x) || !isInteger(item.y) || !isInteger(item.w) || !isInteger(item.h) ||
      item.x < 0 || item.y < 0 || item.w <= 0 || item.h <= 0
    ) {
      issues.push({ code: 'INVALID_GEOMETRY', id: item.i });
      return;
    }
    if (item.x + item.w > input.cols) {
      issues.push({ code: 'OUT_OF_BOUNDS', id: item.i });
      return;
    }
    validItems.push(item);
  });
  input.rootElements.forEach((element) => {
    if (!layoutById.has(element.id)) issues.push({ code: 'MISSING_LAYOUT_ID', id: element.id });
  });
  validItems.forEach((item, index) => {
    if (validItems.slice(0, index).some((candidate) => overlaps(item, candidate))) {
      issues.push({ code: 'OVERLAP', id: item.i });
    }
  });

  const onlyMissing = issues.length > 0 && issues.every((issue) => issue.code === 'MISSING_LAYOUT_ID');
  if (issues.length > 0) {
    return {
      ...base,
      quality: onlyMissing ? 'partial' : 'unreliable',
      provenance: 'responsive-layout-root',
      comparisonConfidence: 'unavailable',
      layout: null,
      issues,
      limitations: ['explicit-layout-is-not-complete-and-valid'],
    };
  }

  return {
    ...base,
    quality: 'explicit-complete-candidate',
    provenance: 'responsive-layout-root',
    comparisonConfidence: input.historicallyVerified ? 'reliable' : 'provisional',
    layout: cloneLayout(layout),
    issues: [],
    limitations: input.historicallyVerified ? [] : ['historical-pre-runtime-origin-unverified'],
  };
}
