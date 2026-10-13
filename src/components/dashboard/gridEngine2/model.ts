export type GridLayoutMode = 'automatic' | 'manual';

export type GridResizeAnchor =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

/** Geometry expressed exclusively in grid cells. */
export type GridLayoutItem = {
  readonly i: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};

export type GridMoveIntent = {
  readonly type: 'MOVE';
  readonly id: string;
  readonly x: number;
  readonly y: number;
};

/**
 * A drag insertion. Unlike MOVE, a downward REORDER can let the cards crossed
 * by the active item rise into the space it vacated.
 */
export type GridReorderIntent = {
  readonly type: 'REORDER';
  readonly id: string;
  readonly x: number;
  readonly y: number;
};

/** Vertical-only compaction with no artificial active item. */
export type GridCompactIntent = {
  readonly type: 'COMPACT';
};

/** Resolves existing collisions downward without privileging an active card. */
export type GridNormalizeIntent = {
  readonly type: 'NORMALIZE';
};

export type GridResizeIntent = {
  readonly type: 'RESIZE';
  readonly id: string;
  readonly w: number;
  readonly h: number;
  /** The corner of the current geometry that remains fixed while resizing. */
  readonly anchor: GridResizeAnchor;
};

export type GridRuntimeResizeIntent = {
  readonly type: 'RUNTIME_RESIZE';
  readonly id: string;
  readonly w: number;
  readonly h: number;
  /** The corner of the structural geometry that remains fixed. */
  readonly anchor: GridResizeAnchor;
};

export type GridLayoutIntent =
  | GridMoveIntent
  | GridReorderIntent
  | GridCompactIntent
  | GridNormalizeIntent
  | GridResizeIntent
  | GridRuntimeResizeIntent;

export type SolveLayoutInput = {
  readonly items: readonly GridLayoutItem[];
  readonly cols: number;
  readonly mode: GridLayoutMode;
  readonly intent: GridLayoutIntent;
};

export type GridLayoutErrorCode =
  | 'DUPLICATE_ID'
  | 'INVALID_ANCHOR'
  | 'INVALID_COLUMNS'
  | 'INVALID_ID'
  | 'INVALID_INTENT'
  | 'INVALID_ITEM'
  | 'INVALID_MODE'
  | 'INVALID_NUMBER'
  | 'ITEM_NOT_FOUND';

export class GridLayoutError extends Error {
  readonly code: GridLayoutErrorCode;

  constructor(code: GridLayoutErrorCode, message: string) {
    super(message);
    this.name = 'GridLayoutError';
    this.code = code;
  }
}
