import type { GridLayoutItem } from './model';
import { solveLayout } from './solveLayout';

export type GridEngineRootRuntimeOverride = {
  readonly id: string;
  readonly w: number;
  readonly h: number;
};

export type GridEngineRootRuntimeSolverInput = {
  /** Authoritative geometry for one already-resolved responsive breakpoint. */
  readonly structuralLayout: readonly GridLayoutItem[];
  readonly cols: number;
  /** Absolute temporary spans. This is current state, never an event history. */
  readonly overrides?: readonly GridEngineRootRuntimeOverride[];
};

export type GridEngineRootRuntimeIssueCode =
  | 'INVALID_COLUMNS'
  | 'INVALID_STRUCTURAL_LAYOUT'
  | 'INVALID_ITEM_ID'
  | 'DUPLICATE_ITEM_ID'
  | 'INVALID_ITEM_GEOMETRY'
  | 'ITEM_OUT_OF_BOUNDS'
  | 'STRUCTURAL_OVERLAP'
  | 'INVALID_OVERRIDES'
  | 'INVALID_OVERRIDE_ID'
  | 'DUPLICATE_OVERRIDE'
  | 'UNKNOWN_OVERRIDE_ID'
  | 'INVALID_OVERRIDE_GEOMETRY'
  | 'OVERRIDE_OUT_OF_BOUNDS'
  | 'SOLVER_REJECTED'
  | 'INVALID_SOLVER_RESULT';

export type GridEngineRootRuntimeIssue = {
  readonly code: GridEngineRootRuntimeIssueCode;
  readonly message: string;
  readonly id?: string;
  readonly index?: number;
};

export type GridEngineRootRuntimeResult =
  | {
      readonly status: 'unchanged';
      readonly layout: readonly GridLayoutItem[];
      readonly appliedOverrideIds: readonly string[];
    }
  | {
      readonly status: 'resolved';
      readonly layout: readonly GridLayoutItem[];
      readonly appliedOverrideIds: readonly string[];
    }
  | {
      readonly status: 'invalid';
      /** Invalid geometry is never exposed as a renderable fallback. */
      readonly layout: null;
      readonly issues: readonly GridEngineRootRuntimeIssue[];
    };

function cloneLayout(items: readonly GridLayoutItem[]): GridLayoutItem[] {
  return items.map((item) => ({ ...item }));
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function isNonEmptyId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function intersects(first: GridLayoutItem, second: GridLayoutItem) {
  return (
    first.x < second.x + second.w &&
    first.x + first.w > second.x &&
    first.y < second.y + second.h &&
    first.y + first.h > second.y
  );
}

function compareIds(first: string, second: string) {
  if (first === second) return 0;
  return first < second ? -1 : 1;
}

function validateStructuralLayout(
  structuralLayout: readonly GridLayoutItem[],
  cols: number,
): GridEngineRootRuntimeIssue[] {
  if (!Array.isArray(structuralLayout)) {
    return [{
      code: 'INVALID_STRUCTURAL_LAYOUT',
      message: 'structuralLayout must be an array.',
    }];
  }

  const issues: GridEngineRootRuntimeIssue[] = [];
  const validItems: Array<{ readonly item: GridLayoutItem; readonly index: number }> = [];
  const firstIndexById = new Map<string, number>();

  structuralLayout.forEach((item, index) => {
    if (!item || typeof item !== 'object') {
      issues.push({
        code: 'INVALID_STRUCTURAL_LAYOUT',
        message: `structuralLayout[${index}] must be an object.`,
        index,
      });
      return;
    }

    if (!isNonEmptyId(item.i)) {
      issues.push({
        code: 'INVALID_ITEM_ID',
        message: `structuralLayout[${index}].i must be a non-empty string.`,
        index,
      });
    } else if (firstIndexById.has(item.i)) {
      issues.push({
        code: 'DUPLICATE_ITEM_ID',
        message: `Structural item ID ${item.i} is duplicated.`,
        id: item.i,
        index,
      });
    } else {
      firstIndexById.set(item.i, index);
    }

    const geometry = [item.x, item.y, item.w, item.h];
    if (!geometry.every(isSafeInteger) || item.x < 0 || item.y < 0 || item.w <= 0 || item.h <= 0) {
      issues.push({
        code: 'INVALID_ITEM_GEOMETRY',
        message: `Structural item ${isNonEmptyId(item.i) ? item.i : index} must use non-negative integer coordinates and positive integer spans.`,
        id: isNonEmptyId(item.i) ? item.i : undefined,
        index,
      });
      return;
    }

    if (item.x + item.w > cols) {
      issues.push({
        code: 'ITEM_OUT_OF_BOUNDS',
        message: `Structural item ${item.i} exceeds the ${cols}-column grid.`,
        id: item.i,
        index,
      });
      return;
    }

    validItems.push({ item, index });
  });

  validItems.forEach(({ item, index }, validIndex) => {
    const previous = validItems.slice(0, validIndex).find(({ item: candidate }) => intersects(item, candidate));
    if (!previous) return;
    issues.push({
      code: 'STRUCTURAL_OVERLAP',
      message: `Structural items ${previous.item.i} and ${item.i} overlap.`,
      id: item.i,
      index,
    });
  });

  return issues;
}

function validateOverrides(
  overrides: readonly GridEngineRootRuntimeOverride[],
  structuralById: ReadonlyMap<string, GridLayoutItem>,
  cols: number,
): GridEngineRootRuntimeIssue[] {
  if (!Array.isArray(overrides)) {
    return [{
      code: 'INVALID_OVERRIDES',
      message: 'overrides must be an array.',
    }];
  }

  const issues: GridEngineRootRuntimeIssue[] = [];
  const firstOverrideById = new Map<string, GridEngineRootRuntimeOverride>();

  overrides.forEach((override, index) => {
    if (!override || typeof override !== 'object') {
      issues.push({
        code: 'INVALID_OVERRIDES',
        message: `overrides[${index}] must be an object.`,
        index,
      });
      return;
    }

    if (!isNonEmptyId(override.id)) {
      issues.push({
        code: 'INVALID_OVERRIDE_ID',
        message: `overrides[${index}].id must be a non-empty string.`,
        index,
      });
      return;
    }

    const previous = firstOverrideById.get(override.id);
    if (previous) {
      const contradictory = previous.w !== override.w || previous.h !== override.h;
      issues.push({
        code: 'DUPLICATE_OVERRIDE',
        message: contradictory
          ? `Runtime override ${override.id} has contradictory requested spans.`
          : `Runtime override ${override.id} is duplicated.`,
        id: override.id,
        index,
      });
      return;
    }
    firstOverrideById.set(override.id, override);

    const structural = structuralById.get(override.id);
    if (!structural) {
      issues.push({
        code: 'UNKNOWN_OVERRIDE_ID',
        message: `Runtime override refers to unknown item ${override.id}.`,
        id: override.id,
        index,
      });
    }

    if (!isSafeInteger(override.w) || !isSafeInteger(override.h) || override.w <= 0 || override.h <= 0) {
      issues.push({
        code: 'INVALID_OVERRIDE_GEOMETRY',
        message: `Runtime override ${override.id} must use positive integer spans.`,
        id: override.id,
        index,
      });
      return;
    }

    if (override.w > cols || (structural && structural.x + override.w > cols)) {
      issues.push({
        code: 'OVERRIDE_OUT_OF_BOUNDS',
        message: `Runtime override ${override.id} exceeds the ${cols}-column grid at its structural X coordinate.`,
        id: override.id,
        index,
      });
    }
  });

  return issues;
}

function validateSolvedLayout(
  structuralLayout: readonly GridLayoutItem[],
  solved: readonly GridLayoutItem[],
  overridesById: ReadonlyMap<string, GridEngineRootRuntimeOverride>,
  cols: number,
): GridEngineRootRuntimeIssue[] {
  if (solved.length !== structuralLayout.length) {
    return [{
      code: 'INVALID_SOLVER_RESULT',
      message: 'The runtime solver changed the number of root items.',
    }];
  }

  const issues: GridEngineRootRuntimeIssue[] = [];
  const solvedById = new Map(solved.map((item) => [item.i, item]));

  structuralLayout.forEach((structural, index) => {
    const item = solvedById.get(structural.i);
    if (!item) {
      issues.push({
        code: 'INVALID_SOLVER_RESULT',
        message: `The runtime solver omitted item ${structural.i}.`,
        id: structural.i,
        index,
      });
      return;
    }

    const override = overridesById.get(structural.i);
    const expectedW = override?.w ?? structural.w;
    const expectedH = override?.h ?? structural.h;
    if (
      item.x !== structural.x ||
      item.w !== expectedW ||
      item.h !== expectedH ||
      !isSafeInteger(item.y) ||
      item.y < 0 ||
      item.x + item.w > cols
    ) {
      issues.push({
        code: 'INVALID_SOLVER_RESULT',
        message: `The runtime solver returned unsupported geometry for item ${structural.i}.`,
        id: structural.i,
        index,
      });
    }
  });

  solved.forEach((item, index) => {
    const previous = solved.slice(0, index).find((candidate) => intersects(item, candidate));
    if (!previous) return;
    issues.push({
      code: 'INVALID_SOLVER_RESULT',
      message: `The runtime solver left items ${previous.i} and ${item.i} overlapping.`,
      id: item.i,
      index,
    });
  });

  return issues;
}

/**
 * Resolves temporary root spans from one immutable structural reference.
 *
 * Runtime requests are sorted by structural reading order, then applied with
 * the existing solver's manual RUNTIME_RESIZE operation. Every call starts
 * from `structuralLayout`; no previous runtime result is accepted as input.
 */
export function solveGridEngineRootRuntimeLayout(
  input: GridEngineRootRuntimeSolverInput,
): GridEngineRootRuntimeResult {
  if (!isSafeInteger(input.cols) || input.cols <= 0) {
    return {
      status: 'invalid',
      layout: null,
      issues: [{
        code: 'INVALID_COLUMNS',
        message: 'cols must be a positive safe integer.',
      }],
    };
  }

  const structuralIssues = validateStructuralLayout(input.structuralLayout, input.cols);
  if (structuralIssues.length > 0) {
    return { status: 'invalid', layout: null, issues: structuralIssues };
  }

  const structuralLayout = cloneLayout(input.structuralLayout);
  const overrides = input.overrides ?? [];
  const structuralById = new Map(structuralLayout.map((item) => [item.i, item]));
  const overrideIssues = validateOverrides(overrides, structuralById, input.cols);
  if (overrideIssues.length > 0) {
    return { status: 'invalid', layout: null, issues: overrideIssues };
  }

  const effectiveOverrides = overrides
    .filter((override) => {
      const structural = structuralById.get(override.id)!;
      return override.w !== structural.w || override.h !== structural.h;
    })
    .map((override) => ({ ...override }))
    .sort((first, second) => {
      const firstItem = structuralById.get(first.id)!;
      const secondItem = structuralById.get(second.id)!;
      return (
        firstItem.y - secondItem.y ||
        firstItem.x - secondItem.x ||
        compareIds(first.id, second.id)
      );
    });

  if (effectiveOverrides.length === 0) {
    return { status: 'unchanged', layout: structuralLayout, appliedOverrideIds: [] };
  }

  let runtimeLayout = structuralLayout;
  try {
    effectiveOverrides.forEach((override) => {
      runtimeLayout = solveLayout({
        items: runtimeLayout,
        cols: input.cols,
        mode: 'manual',
        intent: {
          type: 'RUNTIME_RESIZE',
          id: override.id,
          w: override.w,
          h: override.h,
          anchor: 'top-left',
        },
      });
    });
  } catch (error) {
    return {
      status: 'invalid',
      layout: null,
      issues: [{
        code: 'SOLVER_REJECTED',
        message: error instanceof Error ? error.message : 'The runtime solver rejected the request.',
      }],
    };
  }

  const overridesById = new Map(effectiveOverrides.map((override) => [override.id, override]));
  const resultIssues = validateSolvedLayout(structuralLayout, runtimeLayout, overridesById, input.cols);
  if (resultIssues.length > 0) {
    return { status: 'invalid', layout: null, issues: resultIssues };
  }

  const runtimeById = new Map(runtimeLayout.map((item) => [item.i, item]));
  const orderedLayout = structuralLayout.map((item) => ({ ...runtimeById.get(item.i)! }));
  return {
    status: 'resolved',
    layout: orderedLayout,
    appliedOverrideIds: effectiveOverrides.map((override) => override.id),
  };
}
