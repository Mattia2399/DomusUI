import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import type { GridLayoutIntent, GridLayoutItem, GridLayoutMode } from './model';
import { solveLayout } from './solveLayout';

export const GRID_GESTURE_LONG_PRESS_MS = 650;
export const GRID_GESTURE_PRESS_TOLERANCE_PX = 8;
export const GRID_GESTURE_MOUSE_THRESHOLD_PX = 4;
export const GRID_GESTURE_HYSTERESIS_CELLS = 0.15;

export type GridGesturePhase = 'IDLE' | 'PRESSING' | 'DRAGGING' | 'RESIZING';

export type GridGesturePreview = {
  readonly source: readonly GridLayoutItem[];
  readonly output: readonly GridLayoutItem[];
  readonly intent: GridLayoutIntent;
  readonly mode: GridLayoutMode;
};

export type GridGestureDestination = Pick<GridLayoutItem, 'x' | 'y' | 'w' | 'h'>;

export type GridGestureState = {
  readonly phase: GridGesturePhase;
  readonly activeId: string | null;
  readonly pointerType: string | null;
  readonly preview: GridGesturePreview | null;
  readonly destination: GridGestureDestination | null;
  readonly visualOffset: Readonly<{ x: number; y: number }>;
  readonly solverCalls: number;
};

export type GridMetrics = {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly columnGap: number;
  readonly rowGap: number;
  readonly cellWidth: number;
  readonly rowHeight: number;
  readonly stepX: number;
  readonly stepY: number;
  readonly rows: number;
};

type GestureKind = 'MOVE' | 'RESIZE';

type ActiveInteraction = {
  phase: Exclude<GridGesturePhase, 'IDLE'>;
  readonly kind: GestureKind;
  readonly pointerId: number;
  readonly pointerType: string;
  readonly itemId: string;
  readonly source: GridLayoutItem[];
  readonly sourceItem: GridLayoutItem;
  readonly metrics: GridMetrics;
  readonly startClientX: number;
  readonly startClientY: number;
  lastClientX: number;
  lastClientY: number;
  readonly startWindowScrollX: number;
  readonly startWindowScrollY: number;
  readonly scrollOrigins: readonly {
    readonly element: HTMLElement;
    readonly left: number;
    readonly top: number;
  }[];
  readonly captureElement: HTMLElement;
  target: GridGestureDestination;
  preview: GridGesturePreview | null;
  solverCalls: number;
};

type UseGridGestureOptions = {
  readonly canvasRef: RefObject<HTMLDivElement | null>;
  readonly items: readonly GridLayoutItem[];
  readonly cols: number;
  readonly mode: GridLayoutMode;
  readonly rowHeight: number;
  readonly enabled?: boolean;
  readonly onActivate?: (id: string) => void;
  readonly onCommit: (preview: GridGesturePreview) => void;
  readonly onCancel?: () => void;
  readonly onError?: (error: unknown) => void;
};

const IDLE_STATE: GridGestureState = {
  phase: 'IDLE',
  activeId: null,
  pointerType: null,
  preview: null,
  destination: null,
  visualOffset: { x: 0, y: 0 },
  solverCalls: 0,
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function numericStyleValue(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function readGridMetrics(canvas: HTMLDivElement, cols: number, configuredRowHeight: number): GridMetrics {
  const bounds = canvas.getBoundingClientRect();
  const styles = window.getComputedStyle(canvas);
  const columnGap = numericStyleValue(styles.columnGap);
  const rowGap = numericStyleValue(styles.rowGap);
  const safeCols = Math.max(1, Math.round(cols));
  const rowHeight = Math.max(1, configuredRowHeight);
  const cellWidth = (bounds.width - columnGap * (safeCols - 1)) / safeCols;
  const rows = Math.max(1, Math.round((bounds.height + rowGap) / (rowHeight + rowGap)));

  if (!Number.isFinite(cellWidth) || cellWidth <= 0 || bounds.height <= 0) {
    throw new Error('The grid canvas has no measurable geometry.');
  }

  return {
    canvasWidth: bounds.width,
    canvasHeight: bounds.height,
    columnGap,
    rowGap,
    cellWidth,
    rowHeight,
    stepX: cellWidth + columnGap,
    stepY: rowHeight + rowGap,
    rows,
  };
}

/**
 * A cell changes only after crossing the midpoint plus 0.15 cells. Returning
 * requires crossing the opposite threshold, preventing boundary oscillation.
 */
export function snapWithHysteresis(raw: number, current: number, minimum: number, maximum: number) {
  const upperThreshold = current + 0.5 + GRID_GESTURE_HYSTERESIS_CELLS;
  const lowerThreshold = current - 0.5 - GRID_GESTURE_HYSTERESIS_CELLS;

  if (raw >= upperThreshold) {
    return clamp(Math.round(raw - GRID_GESTURE_HYSTERESIS_CELLS), minimum, maximum);
  }
  if (raw <= lowerThreshold) {
    return clamp(Math.round(raw + GRID_GESTURE_HYSTERESIS_CELLS), minimum, maximum);
  }
  return clamp(current, minimum, maximum);
}

function sameDestination(first: GridGestureDestination, second: GridGestureDestination) {
  return first.x === second.x && first.y === second.y && first.w === second.w && first.h === second.h;
}

function cloneLayout(items: readonly GridLayoutItem[]) {
  return items.map((item) => ({ ...item }));
}

function scrollOriginsFor(element: HTMLElement) {
  const origins: { element: HTMLElement; left: number; top: number }[] = [];
  let ancestor = element.parentElement;
  while (ancestor) {
    const styles = window.getComputedStyle(ancestor);
    const canScrollX = /(auto|scroll|overlay)/.test(styles.overflowX)
      && ancestor.scrollWidth > ancestor.clientWidth;
    const canScrollY = /(auto|scroll|overlay)/.test(styles.overflowY)
      && ancestor.scrollHeight > ancestor.clientHeight;
    if (ancestor !== document.scrollingElement && (canScrollX || canScrollY)) {
      origins.push({ element: ancestor, left: ancestor.scrollLeft, top: ancestor.scrollTop });
    }
    ancestor = ancestor.parentElement;
  }
  return origins;
}

function setPointerCapture(element: HTMLElement, pointerId: number) {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Synthetic test events and already-cancelled pointers may reject capture.
  }
}

function releasePointerCapture(element: HTMLElement, pointerId: number) {
  try {
    if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
  } catch {
    // Losing capture is already handled as a safe cancellation path.
  }
}

export function useGridGesture(options: UseGridGestureOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const interactionRef = useRef<ActiveInteraction | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef<string | null>(null);
  const suppressClickTimerRef = useRef<number | null>(null);
  const [state, setState] = useState<GridGestureState>(IDLE_STATE);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const publish = useCallback((interaction: ActiveInteraction, visualOffset = { x: 0, y: 0 }) => {
    setState({
      phase: interaction.phase,
      activeId: interaction.itemId,
      pointerType: interaction.pointerType,
      preview: interaction.preview,
      destination: interaction.target,
      visualOffset,
      solverCalls: interaction.solverCalls,
    });
  }, []);

  const finish = useCallback((commit: boolean) => {
    const interaction = interactionRef.current;
    if (!interaction) return;
    clearLongPressTimer();
    interactionRef.current = null;
    releasePointerCapture(interaction.captureElement, interaction.pointerId);

    if (commit && interaction.preview) {
      suppressClickRef.current = interaction.itemId;
      if (suppressClickTimerRef.current !== null) window.clearTimeout(suppressClickTimerRef.current);
      suppressClickTimerRef.current = window.setTimeout(() => {
        suppressClickRef.current = null;
        suppressClickTimerRef.current = null;
      }, 400);
      optionsRef.current.onCommit(interaction.preview);
    } else if (interaction.phase !== 'PRESSING') {
      optionsRef.current.onCancel?.();
    }

    setState({ ...IDLE_STATE, solverCalls: interaction.solverCalls });
  }, [clearLongPressTimer]);

  const cancel = useCallback(() => finish(false), [finish]);

  const solveDestination = useCallback((interaction: ActiveInteraction, destination: GridGestureDestination) => {
    const intent: GridLayoutIntent = interaction.kind === 'MOVE'
      ? {
          type: 'REORDER',
          id: interaction.itemId,
          x: destination.x,
          y: destination.y,
        }
      : {
          type: 'RESIZE',
          id: interaction.itemId,
          w: destination.w,
          h: destination.h,
          anchor: 'top-left',
        };

    try {
      const preview: GridGesturePreview = {
        source: interaction.source,
        output: solveLayout({
          items: interaction.source,
          cols: optionsRef.current.cols,
          mode: optionsRef.current.mode,
          intent,
        }),
        intent,
        mode: optionsRef.current.mode,
      };
      interaction.target = destination;
      interaction.preview = preview;
      interaction.solverCalls += 1;
      return true;
    } catch (error) {
      optionsRef.current.onError?.(error);
      return false;
    }
  }, []);

  const pointerDelta = useCallback((interaction: ActiveInteraction, clientX: number, clientY: number) => {
    const pageDeltaX = window.scrollX - interaction.startWindowScrollX;
    const pageDeltaY = window.scrollY - interaction.startWindowScrollY;
    const containerDelta = interaction.scrollOrigins.reduce(
      (total, origin) => ({
        x: total.x + origin.element.scrollLeft - origin.left,
        y: total.y + origin.element.scrollTop - origin.top,
      }),
      { x: 0, y: 0 },
    );
    return {
      x: clientX - interaction.startClientX + pageDeltaX + containerDelta.x,
      y: clientY - interaction.startClientY + pageDeltaY + containerDelta.y,
    };
  }, []);

  const updateFromPointer = useCallback((interaction: ActiveInteraction, clientX: number, clientY: number) => {
    const delta = pointerDelta(interaction, clientX, clientY);
    const { sourceItem, metrics } = interaction;
    let destination: GridGestureDestination;
    let visualOffset = { x: 0, y: 0 };

    if (interaction.kind === 'MOVE') {
      const maxX = Math.max(0, optionsRef.current.cols - sourceItem.w);
      const maxY = Math.max(0, metrics.rows - sourceItem.h);
      const nextX = snapWithHysteresis(
        sourceItem.x + delta.x / metrics.stepX,
        interaction.target.x,
        0,
        maxX,
      );
      const nextY = snapWithHysteresis(
        sourceItem.y + delta.y / metrics.stepY,
        interaction.target.y,
        0,
        maxY,
      );
      destination = { x: nextX, y: nextY, w: sourceItem.w, h: sourceItem.h };

      const residualX = delta.x - (nextX - sourceItem.x) * metrics.stepX;
      const residualY = delta.y - (nextY - sourceItem.y) * metrics.stepY;
      const maxVisualX = metrics.stepX * 0.42;
      const maxVisualY = metrics.stepY * 0.42;
      visualOffset = {
        x: nextX === 0 && residualX < 0 || nextX === maxX && residualX > 0
          ? 0
          : clamp(residualX, -maxVisualX, maxVisualX),
        y: nextY === 0 && residualY < 0 || nextY === maxY && residualY > 0
          ? 0
          : clamp(residualY, -maxVisualY, maxVisualY),
      };
    } else {
      const maxW = Math.max(1, optionsRef.current.cols - sourceItem.x);
      const maxH = Math.max(1, metrics.rows - sourceItem.y);
      destination = {
        x: sourceItem.x,
        y: sourceItem.y,
        w: snapWithHysteresis(
          sourceItem.w + delta.x / metrics.stepX,
          interaction.target.w,
          1,
          maxW,
        ),
        h: snapWithHysteresis(
          sourceItem.h + delta.y / metrics.stepY,
          interaction.target.h,
          1,
          maxH,
        ),
      };
    }

    if (!sameDestination(destination, interaction.target)) {
      solveDestination(interaction, destination);
    }
    publish(interaction, visualOffset);
  }, [pointerDelta, publish, solveDestination]);

  const activateDrag = useCallback((interaction: ActiveInteraction, clientX: number, clientY: number) => {
    clearLongPressTimer();
    interaction.phase = 'DRAGGING';
    setPointerCapture(interaction.captureElement, interaction.pointerId);
    updateFromPointer(interaction, clientX, clientY);
  }, [clearLongPressTimer, updateFromPointer]);

  const begin = useCallback((
    kind: GestureKind,
    itemId: string,
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (optionsRef.current.enabled === false || interactionRef.current) return;
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (kind === 'MOVE' && (event.target as HTMLElement).closest('[data-grid-no-drag="true"]')) return;

    const canvas = optionsRef.current.canvasRef.current;
    const sourceItem = optionsRef.current.items.find((item) => item.i === itemId);
    if (!canvas || !sourceItem) return;

    try {
      const source = cloneLayout(optionsRef.current.items);
      const metrics = readGridMetrics(canvas, optionsRef.current.cols, optionsRef.current.rowHeight);
      const interaction: ActiveInteraction = {
        phase: kind === 'RESIZE' ? 'RESIZING' : 'PRESSING',
        kind,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        itemId,
        source,
        sourceItem: { ...sourceItem },
        metrics,
        startClientX: event.clientX,
        startClientY: event.clientY,
        lastClientX: event.clientX,
        lastClientY: event.clientY,
        startWindowScrollX: window.scrollX,
        startWindowScrollY: window.scrollY,
        scrollOrigins: scrollOriginsFor(canvas),
        captureElement: event.currentTarget,
        target: {
          x: sourceItem.x,
          y: sourceItem.y,
          w: sourceItem.w,
          h: sourceItem.h,
        },
        preview: null,
        solverCalls: 0,
      };
      interactionRef.current = interaction;
      optionsRef.current.onActivate?.(itemId);

      if (kind === 'RESIZE') {
        event.preventDefault();
        setPointerCapture(interaction.captureElement, interaction.pointerId);
        publish(interaction);
        return;
      }

      publish(interaction);
      if (event.pointerType === 'touch') {
        longPressTimerRef.current = window.setTimeout(() => {
          const current = interactionRef.current;
          if (current === interaction && current.phase === 'PRESSING') {
            activateDrag(current, current.lastClientX, current.lastClientY);
          }
        }, GRID_GESTURE_LONG_PRESS_MS);
      }
    } catch (error) {
      interactionRef.current = null;
      optionsRef.current.onError?.(error);
      setState(IDLE_STATE);
    }
  }, [activateDrag, publish]);

  const onDragPointerDown = useCallback(
    (itemId: string, event: ReactPointerEvent<HTMLElement>) => begin('MOVE', itemId, event),
    [begin],
  );
  const onResizePointerDown = useCallback(
    (itemId: string, event: ReactPointerEvent<HTMLElement>) => begin('RESIZE', itemId, event),
    [begin],
  );

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const interaction = interactionRef.current;
      if (!interaction || event.pointerId !== interaction.pointerId) return;
      interaction.lastClientX = event.clientX;
      interaction.lastClientY = event.clientY;

      if (interaction.phase === 'PRESSING') {
        const distance = Math.hypot(
          event.clientX - interaction.startClientX,
          event.clientY - interaction.startClientY,
        );
        if (interaction.pointerType === 'touch') {
          if (distance > GRID_GESTURE_PRESS_TOLERANCE_PX) finish(false);
          return;
        }
        if (distance >= GRID_GESTURE_MOUSE_THRESHOLD_PX) {
          activateDrag(interaction, event.clientX, event.clientY);
        }
        return;
      }

      event.preventDefault();
      updateFromPointer(interaction, event.clientX, event.clientY);
    };
    const handlePointerUp = (event: PointerEvent) => {
      const interaction = interactionRef.current;
      if (!interaction || event.pointerId !== interaction.pointerId) return;
      finish(interaction.phase === 'DRAGGING' || interaction.phase === 'RESIZING');
    };
    const handlePointerCancel = (event: PointerEvent) => {
      const interaction = interactionRef.current;
      if (interaction && event.pointerId === interaction.pointerId) finish(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && interactionRef.current) {
        event.preventDefault();
        finish(false);
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activateDrag, finish, updateFromPointer]);

  useEffect(() => {
    const canvas = options.canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      const interaction = interactionRef.current;
      if (!interaction) return;
      const nextWidth = canvas.getBoundingClientRect().width;
      if (Math.abs(nextWidth - interaction.metrics.canvasWidth) > 1) finish(false);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [finish, options.canvasRef]);

  useEffect(() => () => {
    clearLongPressTimer();
    if (suppressClickTimerRef.current !== null) window.clearTimeout(suppressClickTimerRef.current);
    interactionRef.current = null;
  }, [clearLongPressTimer]);

  const consumeSuppressedClick = useCallback((itemId: string) => {
    if (suppressClickRef.current !== itemId) return false;
    suppressClickRef.current = null;
    return true;
  }, []);

  const onLostPointerCapture = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const interaction = interactionRef.current;
    if (interaction && interaction.pointerId === event.pointerId) finish(false);
  }, [finish]);

  return {
    state,
    onDragPointerDown,
    onResizePointerDown,
    onLostPointerCapture,
    consumeSuppressedClick,
    cancel,
  };
}
