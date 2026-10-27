import { describe, expect, it, vi } from 'vitest';
import {
  GRID_GESTURE_HYSTERESIS_CELLS,
  gridGestureDestinationIsOccupied,
  readGridMetrics,
  shouldCancelGridGestureOnLostPointerCapture,
  snapWithHysteresis,
} from './useGridGesture';
import type { GridMetricsDefinition } from './gridMetrics';

const LAB_METRICS: GridMetricsDefinition = {
  rowHeight: 58,
  horizontalGap: 6,
  verticalGap: 6,
};

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

  it('continues only a connected mouse drag when Chromium transiently drops capture', () => {
    expect(shouldCancelGridGestureOnLostPointerCapture('mouse', 1, true)).toBe(false);
    expect(shouldCancelGridGestureOnLostPointerCapture('mouse', 0, true)).toBe(true);
    expect(shouldCancelGridGestureOnLostPointerCapture('mouse', 1, false)).toBe(true);
    expect(shouldCancelGridGestureOnLostPointerCapture('touch', 1, true)).toBe(true);
  });

  it('selects REORDER only from collisions in the immutable operation snapshot', () => {
    const source = [
      { i: 'a', x: 0, y: 0, w: 2, h: 1 },
      { i: 'b', x: 0, y: 1, w: 2, h: 2 },
      { i: 'c', x: 0, y: 3, w: 2, h: 1 },
    ];
    expect(gridGestureDestinationIsOccupied(source, 'a', { x: 0, y: 1, w: 2, h: 1 })).toBe(true);
    expect(gridGestureDestinationIsOccupied(source, 'a', { x: 0, y: 2, w: 2, h: 1 })).toBe(true);
    expect(gridGestureDestinationIsOccupied(source, 'a', { x: 0, y: 3, w: 2, h: 1 })).toBe(true);
    expect(gridGestureDestinationIsOccupied(source, 'a', { x: 0, y: 4, w: 2, h: 1 })).toBe(false);
    expect(gridGestureDestinationIsOccupied(source, 'a', { x: 3, y: 1, w: 2, h: 1 })).toBe(false);
  });

  it('derives cell dimensions from the measured canvas and configured gaps', () => {
    const canvas = document.createElement('div');
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

    expect(readGridMetrics(canvas, 6, LAB_METRICS)).toEqual({
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

  it('uses independent horizontal and vertical gaps supplied by the caller', () => {
    const canvas = document.createElement('div');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 500,
      bottom: 266,
      left: 0,
      width: 500,
      height: 266,
      toJSON: () => ({}),
    });

    expect(readGridMetrics(canvas, 4, {
      rowHeight: 36,
      horizontalGap: 16,
      verticalGap: 10,
    }, [2, 4])).toMatchObject({
      columnGap: 16,
      rowGap: 10,
      cellWidth: 112,
      stepX: 128,
      stepY: 46,
      rows: 6,
    });
  });
});
