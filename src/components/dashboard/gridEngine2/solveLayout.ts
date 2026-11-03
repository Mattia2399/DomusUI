import {
  GridLayoutError,
  type GridLayoutIntent,
  type GridLayoutItem,
  type GridResizeAnchor,
  type SolveLayoutInput,
} from './model';

function compareIds(first: string, second: string) {
  if (first === second) return 0;
  return first < second ? -1 : 1;
}

/** Canonical ordering makes both processing and returned arrays input-order independent. */
function compareByTopLeft(first: GridLayoutItem, second: GridLayoutItem) {
  return (
    first.y - second.y ||
    first.x - second.x ||
    compareIds(first.i, second.i)
  );
}

function assertFiniteNumber(value: number, field: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new GridLayoutError('INVALID_NUMBER', `${field} must be a finite number.`);
  }

  const rounded = Math.round(value);
  if (!Number.isSafeInteger(rounded)) {
    throw new GridLayoutError('INVALID_NUMBER', `${field} is outside the safe integer range.`);
  }
  return rounded;
}

function assertId(value: string, field: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new GridLayoutError('INVALID_ID', `${field} must be a non-empty string.`);
  }
  return value;
}

function normalizeColumns(cols: number) {
  const rounded = assertFiniteNumber(cols, 'cols');
  if (cols <= 0 || rounded < 1) {
    throw new GridLayoutError('INVALID_COLUMNS', 'cols must round to a positive integer.');
  }
  return rounded;
}

function normalizeItem(source: GridLayoutItem, cols: number, index: number): GridLayoutItem {
  if (!source || typeof source !== 'object') {
    throw new GridLayoutError('INVALID_ITEM', `items[${index}] must be an object.`);
  }

  const i = assertId(source.i, `items[${index}].i`);
  const w = Math.min(cols, Math.max(1, assertFiniteNumber(source.w, `items[${index}].w`)));
  const h = Math.max(1, assertFiniteNumber(source.h, `items[${index}].h`));
  const maxX = cols - w;

  return {
    i,
    x: Math.min(maxX, Math.max(0, assertFiniteNumber(source.x, `items[${index}].x`))),
    y: Math.max(0, assertFiniteNumber(source.y, `items[${index}].y`)),
    w,
    h,
  };
}

function normalizeItems(items: readonly GridLayoutItem[], cols: number) {
  if (!Array.isArray(items)) {
    throw new GridLayoutError('INVALID_ITEM', 'items must be an array.');
  }

  const seen = new Set<string>();
  return items.map((item, index) => {
    const normalized = normalizeItem(item, cols, index);
    if (seen.has(normalized.i)) {
      throw new GridLayoutError('DUPLICATE_ID', `Duplicate item id: ${normalized.i}`);
    }
    seen.add(normalized.i);
    return normalized;
  });
}

function intersects(first: GridLayoutItem, second: GridLayoutItem) {
  return (
    first.x < second.x + second.w &&
    first.x + first.w > second.x &&
    first.y < second.y + second.h &&
    first.y + first.h > second.y
  );
}

function overlapsHorizontally(first: GridLayoutItem, second: GridLayoutItem) {
  return first.x < second.x + second.w && first.x + first.w > second.x;
}

function assertIntent(intent: GridLayoutIntent) {
  if (!intent || typeof intent !== 'object') {
    throw new GridLayoutError('INVALID_INTENT', 'intent must be an object.');
  }
  if (
    intent.type !== 'MOVE' &&
    intent.type !== 'REORDER' &&
    intent.type !== 'COMPACT' &&
    intent.type !== 'NORMALIZE' &&
    intent.type !== 'RESIZE' &&
    intent.type !== 'RUNTIME_RESIZE'
  ) {
    throw new GridLayoutError('INVALID_INTENT', 'Unsupported layout intent.');
  }
  if (intent.type !== 'COMPACT' && intent.type !== 'NORMALIZE') assertId(intent.id, 'intent.id');
  if (intent.type === 'REORDER' && intent.strategy !== undefined && intent.strategy !== 'SWAP') {
    throw new GridLayoutError('INVALID_INTENT', 'Unsupported reorder strategy.');
  }
}

function assertAnchor(anchor: GridResizeAnchor) {
  if (
    anchor !== 'top-left' &&
    anchor !== 'top-right' &&
    anchor !== 'bottom-left' &&
    anchor !== 'bottom-right'
  ) {
    throw new GridLayoutError('INVALID_ANCHOR', `Unsupported resize anchor: ${String(anchor)}`);
  }
  return anchor;
}

function applyMove(
  item: GridLayoutItem,
  intent: Extract<GridLayoutIntent, { type: 'MOVE' | 'REORDER' }>,
  cols: number,
) {
  return {
    ...item,
    x: Math.min(cols - item.w, Math.max(0, assertFiniteNumber(intent.x, 'intent.x'))),
    y: Math.max(0, assertFiniteNumber(intent.y, 'intent.y')),
  };
}

function applyResize(
  item: GridLayoutItem,
  intent: Extract<GridLayoutIntent, { type: 'RESIZE' | 'RUNTIME_RESIZE' }>,
  cols: number,
) {
  const anchor = assertAnchor(intent.anchor);
  const w = Math.min(cols, Math.max(1, assertFiniteNumber(intent.w, 'intent.w')));
  const h = Math.max(1, assertFiniteNumber(intent.h, 'intent.h'));
  const keepsRight = anchor === 'top-right' || anchor === 'bottom-right';
  const keepsBottom = anchor === 'bottom-left' || anchor === 'bottom-right';
  const anchoredX = keepsRight ? item.x + item.w - w : item.x;
  const anchoredY = keepsBottom ? item.y + item.h - h : item.y;

  return {
    i: item.i,
    x: Math.min(cols - w, Math.max(0, anchoredX)),
    y: Math.max(0, anchoredY),
    w,
    h,
  };
}

function applyIntent(item: GridLayoutItem, intent: GridLayoutIntent, cols: number) {
  if (intent.type === 'MOVE' || intent.type === 'REORDER') return applyMove(item, intent, cols);
  if (intent.type === 'COMPACT' || intent.type === 'NORMALIZE') return item;
  return applyResize(item, intent, cols);
}

function placeBelowCollisions(source: GridLayoutItem, placed: readonly GridLayoutItem[]) {
  let candidate = { ...source };

  while (true) {
    const blockers = placed.filter((item) => intersects(candidate, item));
    if (blockers.length === 0) return candidate;
    candidate = {
      ...candidate,
      y: Math.max(...blockers.map((blocker) => blocker.y + blocker.h)),
    };
  }
}

/**
 * Keeps the active item fixed and processes every other item by its normalized
 * reference position. A collision can only increase Y, so displaced items keep
 * X and become obstacles for the remaining chain.
 */
function pushCollisionsDown(items: readonly GridLayoutItem[], active: GridLayoutItem) {
  const placed: GridLayoutItem[] = [active];
  const ordered = items
    .filter((item) => item.i !== active.i)
    .sort(compareByTopLeft);

  for (const source of ordered) {
    placed.push(placeBelowCollisions(source, placed));
  }

  return placed;
}

/** Resolves a projected layout in canonical reading order with no active item. */
function normalizeCollisionsDown(items: readonly GridLayoutItem[]) {
  const placed: GridLayoutItem[] = [];
  for (const source of [...items].sort(compareByTopLeft)) {
    placed.push(placeBelowCollisions(source, placed));
  }
  return placed;
}

function hasCollision(items: readonly GridLayoutItem[]) {
  return items.some((item, index) => items.slice(index + 1).some((other) => intersects(item, other)));
}

/**
 * Exchanges the origins of two cards on the same row. Dimensions remain owned
 * by their cards, so mixed-size exchanges are accepted only when both new
 * rectangles stay in bounds and remain collision-free against every third
 * card. Requiring the target's exact origin makes the decision deterministic
 * even when a large dragged rectangle overlaps multiple neighbours.
 */
function resolveDirectHorizontalSwap(
  items: readonly GridLayoutItem[],
  source: GridLayoutItem,
  active: GridLayoutItem,
  cols: number,
) {
  if (active.y !== source.y || active.x === source.x) return null;

  const targets = items.filter((item) => (
    item.i !== source.i &&
    item.x === active.x &&
    item.y === active.y
  ));
  if (targets.length !== 1) return null;

  const target = targets[0];
  const swappedActive = { ...source, x: target.x, y: target.y };
  const swappedTarget = { ...target, x: source.x, y: source.y };
  const inBounds = (item: GridLayoutItem) => (
    item.x >= 0 && item.y >= 0 && item.x + item.w <= cols
  );
  if (!inBounds(swappedActive) || !inBounds(swappedTarget)) return null;

  const swapped = items.map((item) => {
    if (item.i === source.i) return swappedActive;
    if (item.i === target.i) return swappedTarget;
    return { ...item };
  });
  return hasCollision(swapped) ? null : swapped;
}

/** Used by the gesture adapter to advertise SWAP only when the solver can honor it. */
export function canSwapGridItemsHorizontally(
  items: readonly GridLayoutItem[],
  colsInput: number,
  activeId: string,
  destination: Readonly<{ x: number; y: number }>,
) {
  const cols = normalizeColumns(colsInput);
  const normalized = normalizeItems(items, cols);
  const source = normalized.find((item) => item.i === activeId);
  if (!source) return false;
  const active = applyMove(source, {
    type: 'REORDER',
    strategy: 'SWAP',
    id: activeId,
    x: destination.x,
    y: destination.y,
  }, cols);
  return resolveDirectHorizontalSwap(normalized, source, active, cols) !== null;
}

/**
 * Directional insertion for a downward drag in the same horizontal lane.
 * Only cards actually crossed by the active rectangle participate. They keep
 * X and relative top-to-bottom order while filling the vacancy from its old Y.
 *
 * If mixed geometry cannot fit before each participant's original Y without
 * touching the fixed destination or an unrelated card, this returns null and
 * the caller uses the deterministic push-down strategy instead.
 */
function insertDownward(
  items: readonly GridLayoutItem[],
  source: GridLayoutItem,
  active: GridLayoutItem,
) {
  if (active.y <= source.y || !overlapsHorizontally(source, active)) return null;

  const destinationIsOccupied = items.some(
    (item) => item.i !== source.i && intersects(item, active),
  );
  if (!destinationIsOccupied) return null;

  const crossed = items
    .filter((item) => (
      item.i !== source.i &&
      overlapsHorizontally(item, active) &&
      item.y < active.y + active.h &&
      item.y + item.h > source.y
    ))
    .sort(compareByTopLeft);
  if (crossed.length === 0) return null;

  const crossedIds = new Set(crossed.map((item) => item.i));
  const fixed = items
    .filter((item) => item.i !== source.i && !crossedIds.has(item.i))
    .map((item) => ({ ...item }));
  const shifted: GridLayoutItem[] = [];
  let nextY = source.y;

  for (const item of crossed) {
    let candidate = { ...item, y: nextY };
    const obstacles = [active, ...fixed, ...shifted];

    while (obstacles.some((obstacle) => intersects(candidate, obstacle))) {
      candidate = { ...candidate, y: candidate.y + 1 };
      if (candidate.y > item.y) return null;
    }

    shifted.push(candidate);
    nextY = candidate.y + candidate.h;
  }

  const inserted = [active, ...fixed, ...shifted];
  return hasCollision(inserted) ? null : inserted;
}

/**
 * Vertical-only compaction. Items retain X and fall toward row zero until the
 * nearest already-fixed obstacle. The active item is inserted as an immutable
 * obstacle first, so compaction can never undo the requested operation.
 */
function compactVertically(items: readonly GridLayoutItem[], activeId: string) {
  const active = items.find((item) => item.i === activeId)!;
  const placed: GridLayoutItem[] = [active];
  const ordered = items
    .filter((item) => item.i !== activeId)
    .sort(compareByTopLeft);

  for (const source of ordered) {
    const floor = placed.reduce((targetY, obstacle) => {
      const obstacleBottom = obstacle.y + obstacle.h;
      if (!overlapsHorizontally(source, obstacle) || obstacleBottom > source.y) {
        return targetY;
      }
      return Math.max(targetY, obstacleBottom);
    }, 0);

    placed.push({ ...source, y: floor });
  }

  return placed;
}

/** Packs upward only. X, W and H never change and no card is privileged. */
function compactAllVertically(items: readonly GridLayoutItem[]) {
  const placed: GridLayoutItem[] = [];

  for (const source of [...items].sort(compareByTopLeft)) {
    let candidate = { ...source, y: 0 };
    while (true) {
      const blockers = placed.filter((item) => intersects(candidate, item));
      if (blockers.length === 0) break;
      candidate = {
        ...candidate,
        y: Math.max(...blockers.map((blocker) => blocker.y + blocker.h)),
      };
    }
    placed.push(candidate);
  }

  return placed;
}

/**
 * Pure deterministic geometry solver. The returned order is canonical rather
 * than inherited from the caller, making equal layouts byte-for-byte stable.
 */
export function solveLayout(input: SolveLayoutInput): GridLayoutItem[] {
  const cols = normalizeColumns(input.cols);
  if (input.mode !== 'automatic' && input.mode !== 'manual') {
    throw new GridLayoutError('INVALID_MODE', `Unsupported layout mode: ${String(input.mode)}`);
  }
  assertIntent(input.intent);

  const normalized = normalizeItems(input.items, cols);
  const intent = input.intent;
  if (intent.type === 'COMPACT') {
    return compactAllVertically(normalized).sort(compareByTopLeft);
  }
  if (intent.type === 'NORMALIZE') {
    return normalizeCollisionsDown(normalized).sort(compareByTopLeft);
  }

  const activeSource = normalized.find((item) => item.i === intent.id);
  if (!activeSource) {
    throw new GridLayoutError('ITEM_NOT_FOUND', `Unknown item id: ${intent.id}`);
  }

  const active = applyIntent(activeSource, intent, cols);
  if (input.mode === 'automatic' && intent.type === 'REORDER' && intent.strategy === 'SWAP') {
    const swapped = resolveDirectHorizontalSwap(normalized, activeSource, active, cols);
    if (swapped) return swapped.sort(compareByTopLeft);
  }
  const reordered = intent.type === 'REORDER'
    ? insertDownward(normalized, activeSource, active)
    : null;
  const collisionFree = reordered ?? pushCollisionsDown(normalized, active);
  const solved = input.mode === 'automatic'
    ? compactVertically(collisionFree, active.i)
    : collisionFree;

  return solved.sort(compareByTopLeft);
}
