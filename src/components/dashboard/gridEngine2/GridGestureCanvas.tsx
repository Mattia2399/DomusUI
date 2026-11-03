import { forwardRef, type ReactNode, type RefObject } from 'react';
import { Grip, Maximize2 } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import type { GridMetricsDefinition } from './gridMetrics';
import type { GridLayoutItem } from './model';
import type { useGridGesture } from './useGridGesture';
import type { DashboardGridBreakpoint } from '../../../types/widgetTypeLayout';

type GridGestureController = ReturnType<typeof useGridGesture>;

export type GridGestureRenderContext = Readonly<{
  item: GridLayoutItem;
  selected: boolean;
  breakpoint: DashboardGridBreakpoint;
  canvasWidth: number;
}>;

const CARD_TONES = [
  'from-cyan-400/28 to-blue-500/12 border-cyan-300/28',
  'from-violet-400/28 to-fuchsia-500/12 border-violet-300/28',
  'from-amber-300/28 to-orange-500/12 border-amber-200/28',
  'from-emerald-400/28 to-teal-500/12 border-emerald-300/28',
  'from-rose-400/28 to-pink-500/12 border-rose-300/28',
] as const;

function itemTone(id: string) {
  const hash = [...id].reduce((total, character) => total + character.charCodeAt(0), 0);
  return CARD_TONES[hash % CARD_TONES.length];
}

function geometry(item: GridLayoutItem) {
  return `x${item.x} y${item.y} · ${item.w}×${item.h}`;
}

type GridGestureCanvasProps = {
  readonly items: readonly GridLayoutItem[];
  readonly selectedId: string;
  readonly onSelect?: (id: string) => void;
  readonly testIdPrefix: string;
  readonly gesture?: GridGestureController;
  readonly gestureEnabled?: boolean;
  readonly cols: number;
  readonly canvasWidth: number;
  readonly breakpoint: DashboardGridBreakpoint;
  readonly metrics: GridMetricsDefinition;
  readonly itemKinds?: Readonly<Record<string, string>>;
  readonly renderItem?: (context: GridGestureRenderContext) => ReactNode;
};

export const GridGestureCanvas = forwardRef<HTMLDivElement, GridGestureCanvasProps>(
  function GridGestureCanvas(
    {
      items,
      selectedId,
      onSelect,
      testIdPrefix,
      gesture,
      gestureEnabled = false,
      cols,
      canvasWidth,
      breakpoint,
      metrics,
      itemKinds,
      renderItem,
    },
    forwardedRef,
  ) {
    const reduceMotion = useReducedMotion();
    const gestureState = gesture?.state;
    const isGestureCanvas = Boolean(gesture && onSelect);
    const rows = Math.max(8, ...items.map((item) => item.y + item.h + 1));
    // Geometry changes must not reorder the captured DOM node during a drag.
    // CSS Grid owns the visual placement; a stable ID order owns reconciliation.
    const renderItems = [...items].sort((first, second) => (
      first.i === second.i ? 0 : first.i < second.i ? -1 : 1
    ));
    const gridStyle = {
      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      gridTemplateRows: `repeat(${rows}, ${metrics.rowHeight}px)`,
      columnGap: `${metrics.horizontalGap}px`,
      rowGap: `${metrics.verticalGap}px`,
      width: `${canvasWidth}px`,
    };

    return (
      <div className="overflow-x-auto rounded-[1.35rem] border border-white/[0.08] bg-[#080b12]/72 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div
          ref={forwardedRef}
          className="relative grid"
          style={gridStyle}
          data-testid={`${testIdPrefix}-canvas`}
          data-gesture-state={gestureState?.phase ?? 'IDLE'}
          data-solver-calls={gestureState?.solverCalls ?? 0}
          data-breakpoint={breakpoint}
          data-cols={cols}
          data-canvas-width={canvasWidth}
        >
          <div className="pointer-events-none absolute inset-0 grid" style={gridStyle} aria-hidden="true">
            {Array.from({ length: rows * cols }, (_, index) => (
              <div
                key={index}
                className="rounded-lg border border-white/[0.035] bg-white/[0.018]"
              />
            ))}
          </div>

          {isGestureCanvas && gestureState?.destination && gestureState.phase !== 'IDLE' ? (
            <div
              aria-hidden="true"
              data-testid="gesture-destination"
              className="pointer-events-none relative z-[5] rounded-xl border border-dashed border-cyan-200/65 bg-cyan-300/[0.07] shadow-[0_0_28px_rgba(103,232,249,0.13)] motion-reduce:transition-none"
              style={{
                gridColumn: `${gestureState.destination.x + 1} / span ${gestureState.destination.w}`,
                gridRow: `${gestureState.destination.y + 1} / span ${gestureState.destination.h}`,
              }}
            />
          ) : null}

          {renderItems.map((item) => {
            const itemKind = itemKinds?.[item.i] ?? 'widget';
            const isSelected = selectedId === item.i;
            const isActive = gestureState?.activeId === item.i && gestureState.phase !== 'IDLE';
            const isPressing = isActive && gestureState.phase === 'PRESSING';
            const isDragging = isActive && gestureState.phase === 'DRAGGING';
            const isResizing = isActive && gestureState.phase === 'RESIZING';
            const style = {
              gridColumn: `${item.x + 1} / span ${item.w}`,
              gridRow: `${item.y + 1} / span ${item.h}`,
            };
            const dataProps = {
              'data-testid': `${testIdPrefix}-card-${item.i}`,
              'data-x': String(item.x),
              'data-y': String(item.y),
              'data-w': String(item.w),
              'data-h': String(item.h),
              'data-item-kind': itemKind,
            };
            const renderedItem = renderItem?.({
              item,
              selected: isSelected,
              breakpoint,
              canvasWidth,
            });
            const cardContent = (
              <>
                <span className="truncate text-[11px] font-semibold uppercase tracking-[0.09em] text-white/92">
                  {item.i}
                </span>
                <span className="mt-1 text-[10px] font-medium text-white/58">{geometry(item)}</span>
                <span className="mt-1 w-fit rounded-full border border-white/10 bg-black/20 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.1em] text-white/48">
                  {itemKind === 'stack-root' ? 'Stack root' : itemKind.replace('-', ' ')}
                </span>
                {isPressing ? (
                  <span className="mt-auto pt-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-amber-100/75">
                    Hold…
                  </span>
                ) : null}
                {isDragging || isResizing ? (
                  <span className="mt-auto pt-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-cyan-100/78">
                    {isResizing ? 'Resizing' : 'Dragging'}
                  </span>
                ) : null}
              </>
            );

            return (
              <motion.div
                key={item.i}
                layout={!reduceMotion && isGestureCanvas}
                transition={{
                  layout: reduceMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 430, damping: 38, mass: 0.72 },
                }}
                className={`relative z-10 min-h-0 min-w-0 ${isActive ? 'z-20' : ''}`}
                style={style}
                {...dataProps}
              >
                {renderedItem ? (
                  <div
                    role={onSelect ? 'button' : undefined}
                    tabIndex={onSelect ? 0 : undefined}
                    aria-label={onSelect ? `Seleziona ${item.i}` : undefined}
                    title={gestureEnabled ? 'Click per selezionare, trascina con il mouse o tieni premuto su touch' : undefined}
                    data-testid={`experimental-real-card-${item.i}`}
                    data-grid-safe-visual-only="true"
                    className={[
                      'absolute inset-0 min-h-0 min-w-0 overflow-hidden rounded-xl text-left',
                      'transition-[filter,box-shadow,opacity] duration-200 motion-reduce:transition-none',
                      isSelected ? 'ring-2 ring-cyan-300/85 ring-offset-2 ring-offset-[#080b12]' : '',
                      isPressing ? 'brightness-110 ring-2 ring-amber-200/75' : '',
                      isDragging || isResizing ? 'brightness-110 shadow-[0_18px_42px_rgba(0,0,0,0.3),0_0_0_1px_rgba(103,232,249,0.28)]' : '',
                      gestureEnabled ? 'cursor-grab active:cursor-grabbing' : onSelect ? 'cursor-pointer' : '',
                    ].join(' ')}
                    style={{
                      touchAction: 'pan-y',
                      transform: isDragging
                        ? `translate3d(${gestureState?.visualOffset.x ?? 0}px, ${gestureState?.visualOffset.y ?? 0}px, 0)`
                        : undefined,
                    }}
                    onPointerDown={(event) => {
                      if (event.pointerType === 'touch') return;
                      if (gestureEnabled) gesture?.onDragPointerDown(item.i, event);
                    }}
                    onLostPointerCapture={gesture?.onLostPointerCapture}
                    onClick={(event) => {
                      if (!onSelect) return;
                      if (gesture?.consumeSuppressedClick(item.i)) {
                        event.preventDefault();
                        return;
                      }
                      onSelect(item.i);
                    }}
                    onKeyDown={(event) => {
                      if (!onSelect || (event.key !== 'Enter' && event.key !== ' ')) return;
                      event.preventDefault();
                      onSelect(item.i);
                    }}
                  >
                    <div
                      inert
                      aria-hidden="true"
                      data-testid={`experimental-real-card-content-${item.i}`}
                      className="pointer-events-none h-full w-full select-none"
                    >
                      {renderedItem}
                    </div>
                    <span className="pointer-events-none absolute bottom-1 left-1 z-20 max-w-[calc(100%-0.5rem)] truncate rounded-full border border-black/15 bg-black/55 px-2 py-0.5 font-mono text-[8px] text-white/72 backdrop-blur-md">
                      {item.i} · {geometry(item)}
                    </span>
                  </div>
                ) : onSelect ? (
                  <button
                    type="button"
                    className={[
                      'absolute inset-0 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-gradient-to-br p-2 text-left',
                      'shadow-[0_12px_30px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.09)]',
                      'transition-[filter,box-shadow,opacity] duration-200 motion-reduce:transition-none',
                      itemTone(item.i),
                      isSelected ? 'ring-2 ring-cyan-300/75 ring-offset-2 ring-offset-[#080b12]' : '',
                      isPressing ? 'brightness-110 ring-2 ring-amber-200/75' : '',
                      isDragging || isResizing ? 'brightness-110 shadow-[0_18px_42px_rgba(0,0,0,0.3),0_0_0_1px_rgba(103,232,249,0.28)]' : '',
                      gestureEnabled ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
                    ].join(' ')}
                    style={{
                      touchAction: 'pan-y',
                      transform: isDragging
                        ? `translate3d(${gestureState.visualOffset.x}px, ${gestureState.visualOffset.y}px, 0)`
                        : undefined,
                    }}
                    onPointerDown={(event) => {
                      if (event.pointerType === 'touch') return;
                      if (gestureEnabled) gesture?.onDragPointerDown(item.i, event);
                    }}
                    onLostPointerCapture={gesture?.onLostPointerCapture}
                    onClick={(event) => {
                      if (gesture?.consumeSuppressedClick(item.i)) {
                        event.preventDefault();
                        return;
                      }
                      onSelect(item.i);
                    }}
                    aria-label={`Seleziona ${item.i}`}
                    title={gestureEnabled ? 'Click per selezionare, trascina con il mouse o tieni premuto su touch' : undefined}
                  >
                    {cardContent}
                  </button>
                ) : (
                  <div
                    className={`absolute inset-0 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-gradient-to-br p-2 text-left shadow-[0_12px_30px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.09)] ${itemTone(item.i)} ${isSelected ? 'ring-2 ring-cyan-300/75 ring-offset-2 ring-offset-[#080b12]' : ''}`}
                  >
                    {cardContent}
                  </div>
                )}

                {isGestureCanvas && isSelected && gestureEnabled ? (
                  <>
                    <button
                      type="button"
                      aria-label={`Trascina ${item.i}`}
                      title="Maniglia drag touch: pressione prolungata"
                      className="absolute right-1 top-1 z-30 flex h-7 w-7 touch-none items-center justify-center rounded-lg border border-white/10 bg-black/45 text-white/60 shadow-sm backdrop-blur-md transition hover:bg-black/65 hover:text-white motion-reduce:transition-none"
                      style={{ touchAction: 'none' }}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        gesture.onDragPointerDown(item.i, event);
                      }}
                      onLostPointerCapture={gesture.onLostPointerCapture}
                    >
                      <Grip className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      data-grid-no-drag="true"
                      aria-label={`Ridimensiona ${item.i}`}
                      title="Ridimensiona dall'angolo inferiore destro"
                      className="absolute -bottom-1 -right-1 z-30 flex h-8 w-8 touch-none items-center justify-center rounded-xl border border-cyan-200/35 bg-[#10232a]/95 text-cyan-100 shadow-[0_8px_22px_rgba(0,0,0,0.3)] transition hover:scale-105 hover:bg-[#15313a] motion-reduce:transition-none"
                      style={{ touchAction: 'none' }}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        gesture.onResizePointerDown(item.i, event);
                      }}
                      onLostPointerCapture={gesture.onLostPointerCapture}
                    >
                      <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </>
                ) : null}
              </motion.div>
            );
          })}
        </div>
      </div>
    );
  },
);

GridGestureCanvas.displayName = 'GridGestureCanvas';

export type GridGestureCanvasRef = RefObject<HTMLDivElement | null>;
