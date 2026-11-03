import { describe, expect, it, vi } from 'vitest';
import {
  GRID_GESTURE_HYSTERESIS_CELLS,
  GRID_GESTURE_PRESS_TOLERANCE_PX,
  GRID_GESTURE_AUTOSCROLL_MAX_PX,
  GRID_GESTURE_AUTOSCROLL_REDUCED_MAX_PX,
  gridGestureAutoScrollVelocity,
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
  it('allows normal physical-finger jitter while recognizing a long press', () => {
    expect(GRID_GESTURE_PRESS_TOLERANCE_PX).toBe(16);
  });

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

  it('continues a connected pressed pointer when Chromium transiently drops capture', () => {
    expect(shouldCancelGridGestureOnLostPointerCapture('mouse', 1, true)).toBe(false);
    expect(shouldCancelGridGestureOnLostPointerCapture('mouse', 0, true)).toBe(true);
    expect(shouldCancelGridGestureOnLostPointerCapture('mouse', 1, false)).toBe(true);
    expect(shouldCancelGridGestureOnLostPointerCapture('touch', 1, true)).toBe(false);
    expect(shouldCancelGridGestureOnLostPointerCapture('touch', 0, true)).toBe(false);
    expect(shouldCancelGridGestureOnLostPointerCapture('touch', 1, false)).toBe(true);
    expect(shouldCancelGridGestureOnLostPointerCapture('touch', 0, false)).toBe(true);
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

  it('derives progressive autoscroll velocity from the visible container edges', () => {
    const bounds = { top: 100, bottom: 700 };

    expect(gridGestureAutoScrollVelocity(400, bounds)).toBe(0);
    expect(gridGestureAutoScrollVelocity(150, bounds)).toBeLessThan(0);
    expect(gridGestureAutoScrollVelocity(110, bounds)).toBeLessThan(
      gridGestureAutoScrollVelocity(150, bounds),
    );
    expect(gridGestureAutoScrollVelocity(650, bounds)).toBeGreaterThan(0);
    expect(gridGestureAutoScrollVelocity(690, bounds)).toBeGreaterThan(
      gridGestureAutoScrollVelocity(650, bounds),
    );
    expect(gridGestureAutoScrollVelocity(800, bounds)).toBe(GRID_GESTURE_AUTOSCROLL_MAX_PX);
    expect(gridGestureAutoScrollVelocity(0, bounds)).toBe(-GRID_GESTURE_AUTOSCROLL_MAX_PX);
  });

  it('caps rather than disables autoscroll for reduced-motion users', () => {
    const bounds = { top: 100, bottom: 700 };

    expect(gridGestureAutoScrollVelocity(700, bounds, true)).toBe(
      GRID_GESTURE_AUTOSCROLL_REDUCED_MAX_PX,
    );
    expect(gridGestureAutoScrollVelocity(700, bounds, true)).toBeLessThan(
      gridGestureAutoScrollVelocity(700, bounds),
    );
  });
});
