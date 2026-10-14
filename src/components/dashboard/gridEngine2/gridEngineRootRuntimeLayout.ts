import type { GridItem } from '../../../types/dashboardModels';
import { intersects, reflowLayoutsToColumns } from '../gridEngineGeometry';

/**
 * Runtime card state can change a dynamic item's span before GridCanvas has
 * synchronized its cached per-breakpoint coordinates. The derived layout may
 * have been densely repacked after that span change, so its coordinates are
 * not a safe source of truth for the runtime renderer.
 *
 * This adapter only translates the vertical collision chain touched by the
 * dynamic item. It never changes item order or horizontal placement. Spans
 * deliberately remain owned by GridCanvas.
 */
export function alignDynamicRootPositions(
  runtimeLayout: readonly GridItem[],
  authoritativeLayout: readonly GridItem[],
  dynamicItemIds: ReadonlySet<string>,
): GridItem[] {
  if (runtimeLayout.length === 0 || dynamicItemIds.size === 0) {
    return [...runtimeLayout];
  }

  const authoritativeById = new Map(authoritativeLayout.map((item) => [item.i, item]));
  if (runtimeLayout.some((item) => !authoritativeById.has(item.i))) {
    return [...runtimeLayout];
  }

  const expansions = new Set<string>();
  const contractions = new Set<string>();
  let hasUnsupportedTransition = false;

  runtimeLayout.forEach((item) => {
    if (!dynamicItemIds.has(item.i)) return;
    const authoritative = authoritativeById.get(item.i);
    if (!authoritative || (item.w === authoritative.w && item.h === authoritative.h)) return;

    if (item.w !== authoritative.w) {
      hasUnsupportedTransition = true;
    } else if (authoritative.h > item.h) {
      expansions.add(item.i);
    } else if (authoritative.h < item.h) {
      contractions.add(item.i);
    }
  });

  if (hasUnsupportedTransition || (expansions.size === 0 && contractions.size === 0)) {
    return [...runtimeLayout];
  }

  let aligned = runtimeLayout.map((item) => ({ ...item }));

  if (contractions.size > 0) {
    const contracted = pullLocalCollisionChain(aligned, authoritativeById, contractions);
    if (!contracted) return [...runtimeLayout];
    aligned = contracted.layout;
  }

  if (expansions.size > 0) {
    const expanded = pushLocalCollisionChain(aligned, authoritativeById, expansions);
    if (!expanded) return [...runtimeLayout];
    aligned = expanded.layout;
  }

  return aligned;
}
export function stabilizeRootRuntimeCollisions(
  runtimeLayout: readonly GridItem[],
  cols: number,
): GridItem[] {
  const hasCollision = runtimeLayout.some((item, index) =>
    runtimeLayout.slice(0, index).some((previous) => intersects(item, previous)),
  );
  if (!hasCollision) return [...runtimeLayout];

  const reflowedById = new Map(
    reflowLayoutsToColumns(runtimeLayout.map((item) => ({ ...item })), cols)
      .map((item) => [item.i, item]),
  );
  return runtimeLayout.map((item) => {
    const reflowed = reflowedById.get(item.i)!;
    return { ...item, x: reflowed.x, y: reflowed.y };
  });
}

function pullLocalCollisionChain(
  baseLayout: readonly GridItem[],
  targetSpanById: ReadonlyMap<string, GridItem>,
  anchorIds: ReadonlySet<string>,
): LocalCollisionResult | null {
  const originalById = new Map(baseLayout.map((item) => [item.i, item]));
  const positionsById = new Map(baseLayout.map((item) => [item.i, { ...item }]));
  const pending = baseLayout
    .filter((item) => anchorIds.has(item.i))
    .map((item) => {
      const target = targetSpanById.get(item.i);
      return { id: item.i, shift: target ? item.h - target.h : 0 };
    });
  const movedIds = new Set<string>();
  const maxSteps = Math.max(1, baseLayout.length * baseLayout.length);
  let cursor = 0;

  while (cursor < pending.length) {
    if (cursor > maxSteps) return null;
    const { id, shift } = pending[cursor];
    cursor += 1;
    if (shift <= 0) continue;
    const blocker = originalById.get(id);
    if (!blocker) return null;
    const blockerBottom = blocker.y + blocker.h;

    for (const candidate of baseLayout) {
      if (
        anchorIds.has(candidate.i) ||
        movedIds.has(candidate.i) ||
        candidate.y !== blockerBottom ||
        !overlapsHorizontally(blocker, candidate)
      ) {
        continue;
      }
      const positioned = positionsById.get(candidate.i)!;
      positioned.y = Math.max(0, candidate.y - shift);
      movedIds.add(candidate.i);
      pending.push({ id: candidate.i, shift });
    }
  }

  const targetGeometry = baseLayout.map((item) => {
    const positioned = positionsById.get(item.i)!;
    const target = anchorIds.has(item.i) ? targetSpanById.get(item.i) : undefined;
    return {
      ...item,
      x: positioned.x,
      y: positioned.y,
      w: target?.w ?? item.w,
      h: target?.h ?? item.h,
    };
  });
  const hasCollision = targetGeometry.some((item, index) =>
    targetGeometry.slice(0, index).some((previous) => intersects(item, previous)),
  );
  if (hasCollision) return null;

  return {
    layout: baseLayout.map((item) => {
      const positioned = positionsById.get(item.i)!;
      return { ...item, x: positioned.x, y: positioned.y };
    }),
    movedIds,
  };
}
interface LocalCollisionResult {
  readonly layout: GridItem[];
  readonly movedIds: ReadonlySet<string>;
}

function overlapsHorizontally(first: GridItem, second: GridItem) {
  return first.x < second.x + second.w && first.x + first.w > second.x;
}

function pushLocalCollisionChain(
  baseLayout: readonly GridItem[],
  targetSpanById: ReadonlyMap<string, GridItem>,
  anchorIds: ReadonlySet<string>,
): LocalCollisionResult | null {
  const layout = baseLayout.map((item) => {
    const target = anchorIds.has(item.i) ? targetSpanById.get(item.i) : undefined;
    return target ? { ...item, w: target.w, h: target.h } : { ...item };
  });
  const byId = new Map(layout.map((item) => [item.i, item]));
  const pending = layout.filter((item) => anchorIds.has(item.i)).map((item) => item.i);
  const movedIds = new Set<string>();
  const maxSteps = Math.max(1, layout.length * layout.length);
  let cursor = 0;

  while (cursor < pending.length) {
    if (cursor > maxSteps) return null;
    const blocker = byId.get(pending[cursor]);
    cursor += 1;
    if (!blocker) return null;

    for (const candidate of layout) {
      if (candidate.i === blocker.i || !intersects(blocker, candidate)) continue;
      if (anchorIds.has(candidate.i) || candidate.y < blocker.y) return null;

      const nextY = blocker.y + blocker.h;
      if (candidate.y >= nextY) continue;
      candidate.y = nextY;
      movedIds.add(candidate.i);
      pending.push(candidate.i);
    }
  }

  const positionsById = new Map(layout.map((item) => [item.i, item]));
  return {
    layout: baseLayout.map((item) => {
      const positioned = positionsById.get(item.i)!;
      return { ...item, x: positioned.x, y: positioned.y };
    }),
    movedIds,
  };
}
