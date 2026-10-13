import { describe, expect, it, vi } from 'vitest';
import {
  GRID_GESTURE_HYSTERESIS_CELLS,
  readGridMetrics,
  snapWithHysteresis,
} from './useGridGesture';

describe('Grid Engine laboratory gesture math', () => {
  it('keeps a destination stable while the pointer oscillates around a cell boundary', () => {
    expect(GRID_GESTURE_HYSTERESIS_CELLS).toBe(0.15);

    let current = 0;
    current = snapWithHysteresis(0.64, current, 0, 5);
    expect(current).toBe(0);
    current = snapWithHysteresis(0.66, current, 0, 5);
    expect(current).toBe(1);
    current = snapWithHysteresis(0.44, current, 0, 5);
    expect(current).toBe(1);
    current = snapWithHysteresis(0.36, current, 0, 5);
    expect(current).toBe(1);
    current = snapWithHysteresis(0.34, current, 0, 5);
    expect(current).toBe(0);
  });

  it('supports deterministic multi-cell jumps and clamps canvas boundaries', () => {
    expect(snapWithHysteresis(3.4, 0, 0, 5)).toBe(3);
    expect(snapWithHysteresis(99, 3, 0, 5)).toBe(5);
    expect(snapWithHysteresis(-99, 2, 0, 5)).toBe(0);
  });

  it('derives cell dimensions from the measured canvas and configured gaps', () => {
    const canvas = document.createElement('div');
    canvas.style.columnGap = '6px';
    canvas.style.rowGap = '6px';
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 540,
      bottom: 506,
      left: 0,
      width: 540,
      height: 506,
      toJSON: () => ({}),
    });

    expect(readGridMetrics(canvas, 6, 58)).toEqual({
      canvasWidth: 540,
      canvasHeight: 506,
      columnGap: 6,
      rowGap: 6,
      cellWidth: 85,
      rowHeight: 58,
      stepX: 91,
      stepY: 64,
      rows: 8,
    });
  });
});
