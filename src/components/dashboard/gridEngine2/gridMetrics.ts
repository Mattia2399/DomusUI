export type GridMetricsVersion = 'legacy' | 'v2';

export type GridMetricsDefinition = Readonly<{
  rowHeight: number;
  horizontalGap: number;
  verticalGap: number;
}>;

export type VersionedGridMetrics = GridMetricsDefinition & Readonly<{
  version: GridMetricsVersion;
}>;

export type GridLightRuntimeMetrics = Readonly<{
  hOff: number;
  hOn: number;
  autoExpand: true;
}>;

export const DEFAULT_GRID_METRICS_VERSION: GridMetricsVersion = 'legacy';

export const LEGACY_GRID_METRICS: VersionedGridMetrics = Object.freeze({
  version: 'legacy',
  rowHeight: 48,
  horizontalGap: 16,
  verticalGap: 16,
});

export const GRID_V2_METRICS: VersionedGridMetrics = Object.freeze({
  version: 'v2',
  rowHeight: 36,
  horizontalGap: 16,
  verticalGap: 10,
});

const GRID_METRICS_BY_VERSION: Readonly<Record<GridMetricsVersion, VersionedGridMetrics>> = {
  legacy: LEGACY_GRID_METRICS,
  v2: GRID_V2_METRICS,
};

const GRID_LIGHT_RUNTIME_METRICS_BY_VERSION: Readonly<
  Record<GridMetricsVersion, GridLightRuntimeMetrics>
> = {
  legacy: Object.freeze({ hOff: 1, hOn: 2, autoExpand: true }),
  v2: Object.freeze({ hOff: 2, hOn: 3, autoExpand: true }),
};

/** Missing versions intentionally retain the existing Home geometry. */
export function resolveGridMetrics(
  version: GridMetricsVersion | null | undefined = DEFAULT_GRID_METRICS_VERSION,
): VersionedGridMetrics {
  return GRID_METRICS_BY_VERSION[version ?? DEFAULT_GRID_METRICS_VERSION];
}

export function resolveGridLightRuntimeMetrics(
  version: GridMetricsVersion | null | undefined = DEFAULT_GRID_METRICS_VERSION,
): GridLightRuntimeMetrics {
  return GRID_LIGHT_RUNTIME_METRICS_BY_VERSION[version ?? DEFAULT_GRID_METRICS_VERSION];
}

export function calculateGridRowsHeight(
  rows: number,
  metrics: GridMetricsDefinition,
) {
  if (!Number.isSafeInteger(rows) || rows < 1) {
    throw new RangeError('rows must be a positive safe integer.');
  }
  return rows * metrics.rowHeight + (rows - 1) * metrics.verticalGap;
}
