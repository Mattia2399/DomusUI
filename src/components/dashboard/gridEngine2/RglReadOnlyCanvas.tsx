import { useCallback, useMemo, useState } from 'react';
import GridLayout, { type Layout } from 'react-grid-layout/legacy';
import type { GridLayoutItem } from './model';
import { GRID_ENGINE_LAB_GAP, GRID_ENGINE_LAB_ROW_HEIGHT } from './labFixtures';

type RglReadOnlyCanvasProps = {
  readonly items: readonly GridLayoutItem[];
  readonly cols: number;
  readonly width: number;
};

function geometrySignature(items: readonly GridLayoutItem[]) {
  return [...items]
    .sort((first, second) => (first.i === second.i ? 0 : first.i < second.i ? -1 : 1))
    .map(({ i, x, y, w, h }) => `${i}:${x},${y},${w},${h}`)
    .join('|');
}

export function RglReadOnlyCanvas({ items, cols, width }: RglReadOnlyCanvasProps) {
  const requested = useMemo<Layout>(
    () => items.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })),
    [items],
  );
  const requestedSignature = useMemo(() => geometrySignature(items), [items]);
  const context = `${width}:${cols}:${requestedSignature}`;
  const [observation, setObservation] = useState<{
    readonly context: string;
    readonly items: readonly GridLayoutItem[];
  } | null>(null);
  const [layoutEvents, setLayoutEvents] = useState(0);

  const handleLayoutChange = useCallback((layout: Layout) => {
    const geometry = layout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
    setObservation({ context, items: geometry });
    setLayoutEvents((current) => current + 1);
  }, [context]);

  const observed = observation?.context === context ? observation.items : null;
  const observedSignature = observed ? geometrySignature(observed) : '';
  const fidelity = observed === null ? 'pending' : observedSignature === requestedSignature ? 'exact' : 'changed';

  return (
    <div
      data-testid="rgl-experiment"
      data-rgl-fidelity={fidelity}
      data-rgl-layout-events={layoutEvents}
      data-requested-layout={requestedSignature}
      data-observed-layout={observedSignature}
      className="overflow-x-auto rounded-[1.35rem] border border-white/[0.08] bg-[#080b12]/72 p-2"
    >
      <div className="mb-2 flex items-center justify-between gap-3 px-1 text-[10px]">
        <span className="text-white/38">Coordinate solver → renderer</span>
        <span
          data-testid="rgl-fidelity-label"
          aria-live="polite"
          className={fidelity === 'exact' ? 'text-emerald-200/75' : fidelity === 'changed' ? 'text-rose-200/80' : 'text-white/45'}
        >
          {fidelity === 'exact' ? 'Exact' : fidelity === 'changed' ? 'Changed' : 'Pending'}
        </span>
      </div>
      <GridLayout
        key={context}
        width={width}
        cols={cols}
        rowHeight={GRID_ENGINE_LAB_ROW_HEIGHT}
        margin={[GRID_ENGINE_LAB_GAP, GRID_ENGINE_LAB_GAP]}
        containerPadding={[0, 0]}
        layout={requested}
        compactType={null}
        preventCollision
        allowOverlap={false}
        isDraggable={false}
        isResizable={false}
        useCSSTransforms
        autoSize
        onLayoutChange={handleLayoutChange}
        className="relative"
        style={{ width }}
      >
        {items.map((item) => (
          <div
            key={item.i}
            data-testid={`rgl-card-${item.i}`}
            className="overflow-hidden rounded-xl border border-violet-300/20 bg-gradient-to-br from-violet-400/20 to-blue-500/10 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]"
          >
            <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-white/82">
              {item.i}
            </span>
            <span className="mt-1 block font-mono text-[9px] text-white/45">
              x{item.x} y{item.y} · {item.w}×{item.h}
            </span>
          </div>
        ))}
      </GridLayout>
    </div>
  );
}
