import type { GridLayoutItem } from './model';
import { meaningfulDifferenceCategories } from './shadowInspectorSnapshot';
import type { ShadowDifferenceCategory, ShadowItemDifference } from './shadowLayoutDiagnostics';

const CELL_WIDTH = 54;
const ROW_HEIGHT = 44;
const GAP = 6;

type InspectorCanvasItem = {
  readonly diagnosticId: string;
  readonly originalId: string;
  readonly geometry: GridLayoutItem;
  readonly categories: readonly ShadowDifferenceCategory[];
};

type ShadowInspectorCanvasProps = {
  readonly side: 'legacy' | 'solver';
  readonly cols: number;
  readonly differences: readonly ShadowItemDifference[];
};

function isRenderableGeometry(item: GridLayoutItem) {
  return [item.x, item.y, item.w, item.h].every(Number.isSafeInteger) && item.w > 0 && item.h > 0;
}

function geometryText(item: GridLayoutItem) {
  return `x${item.x} y${item.y} · ${item.w}×${item.h}`;
}

function itemTone(categories: readonly ShadowDifferenceCategory[]) {
  if (categories.includes('OUT_OF_BOUNDS') || categories.includes('INVALID_GEOMETRY')) {
    return 'border-rose-300/65 bg-rose-400/20 text-rose-50';
  }
  if (categories.includes('OVERLAP')) {
    return 'border-amber-200/70 bg-amber-300/20 text-amber-50';
  }
  if (meaningfulDifferenceCategories(categories).length > 0) {
    return 'border-violet-300/55 bg-violet-400/20 text-violet-50';
  }
  return 'border-emerald-300/35 bg-emerald-400/12 text-emerald-50';
}

export function ShadowInspectorCanvas({ side, cols, differences }: ShadowInspectorCanvasProps) {
  const items: InspectorCanvasItem[] = differences.flatMap((difference) => {
    const geometry = side === 'legacy' ? difference.displayed : difference.normalized;
    return geometry ? [{
      diagnosticId: difference.diagnosticId,
      originalId: difference.originalId,
      geometry,
      categories: difference.categories,
    }] : [];
  });
  const renderable = items.filter((item) => isRenderableGeometry(item.geometry));
  const unrenderable = items.filter((item) => !isRenderableGeometry(item.geometry));
  const rows = Math.max(4, ...renderable.map((item) => Math.max(0, item.geometry.y) + item.geometry.h + 1));
  const width = cols * CELL_WIDTH + Math.max(0, cols - 1) * GAP;
  const height = rows * ROW_HEIGHT + Math.max(0, rows - 1) * GAP;

  return (
    <div className="max-w-full overflow-x-auto rounded-[1.35rem] border border-white/[0.08] bg-[#080b12]/80 p-3">
      <div
        className="relative bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)]"
        style={{
          width,
          height,
          backgroundSize: `${CELL_WIDTH + GAP}px ${ROW_HEIGHT + GAP}px`,
        }}
        data-testid={`inspector-${side}-canvas`}
        data-cols={cols}
        data-item-count={renderable.length}
      >
        {renderable.map((item) => {
          const { x, y, w, h } = item.geometry;
          return (
            <div
              key={item.diagnosticId}
              data-inspector-card={side}
              data-item-id={item.diagnosticId}
              data-x={x}
              data-y={y}
              data-w={w}
              data-h={h}
              data-categories={item.categories.join(',')}
              className={`absolute overflow-hidden rounded-xl border p-2 shadow-[0_8px_22px_rgba(0,0,0,0.22)] ${itemTone(item.categories)}`}
              style={{
                left: x * (CELL_WIDTH + GAP),
                top: y * (ROW_HEIGHT + GAP),
                width: w * CELL_WIDTH + Math.max(0, w - 1) * GAP,
                height: h * ROW_HEIGHT + Math.max(0, h - 1) * GAP,
              }}
              title={`${item.diagnosticId} · ${geometryText(item.geometry)}`}
            >
              <span className="block truncate text-[10px] font-semibold">{item.originalId}</span>
              <span className="mt-1 block font-mono text-[9px] opacity-70">{geometryText(item.geometry)}</span>
            </div>
          );
        })}
      </div>
      {unrenderable.length > 0 ? (
        <p className="mt-2 text-[10px] text-rose-200/75" data-testid={`inspector-${side}-unrenderable`}>
          {unrenderable.length} elementi non rappresentabili nel canvas; dettagli nell’elenco diagnostico.
        </p>
      ) : null}
    </div>
  );
}
