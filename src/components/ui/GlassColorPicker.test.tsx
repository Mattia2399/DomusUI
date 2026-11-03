import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GlassColorPicker, type HueSaturation } from './GlassColorPicker';
import { COLOR_DISC_REACH, colorAtPoint, pointOfColor } from './glassColorPickerGeometry';

const WIDTH = 200;

function setup(props: { disabled?: boolean } = {}) {
  const onChange = vi.fn();
  function Host() {
    const [value, setValue] = useState<HueSaturation>({ hue: 90, saturation: 50 });
    return (
      <GlassColorPicker
        label="Colore"
        value={value}
        valueText={({ hue, saturation }) => `${hue} ${saturation}`}
        disabled={props.disabled}
        onChange={(next) => {
          onChange(next);
          setValue(next);
        }}
      />
    );
  }
  render(<Host />);
  const picker = screen.getByRole('slider', { name: 'Colore' });
  picker.getBoundingClientRect = () => ({ left: 0, top: 0, width: WIDTH, height: WIDTH, right: WIDTH, bottom: WIDTH, x: 0, y: 0, toJSON: () => ({}) });
  return { onChange, picker };
}

// jsdom has no PointerEvent: without it a pointer event loses its coordinates.
class TestPointerEvent extends MouseEvent {
  pointerId: number;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('PointerEvent', TestPointerEvent);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the geometry of the colour disc', () => {
  const reach = WIDTH * COLOR_DISC_REACH;

  it('has white at the centre, and the hues around it clockwise from the top', () => {
    expect(colorAtPoint(100, 100, WIDTH).saturation).toBe(0);
    expect(colorAtPoint(100, 100 - reach, WIDTH)).toEqual({ hue: 0, saturation: 100 });
    expect(colorAtPoint(100 + reach, 100, WIDTH)).toEqual({ hue: 90, saturation: 100 });
    expect(colorAtPoint(100, 100 + reach, WIDTH)).toEqual({ hue: 180, saturation: 100 });
    expect(colorAtPoint(100 - reach, 100, WIDTH)).toEqual({ hue: 270, saturation: 100 });
  });

  it('stops the saturation at the edge when the finger goes past it', () => {
    expect(colorAtPoint(100 + reach * 3, 100, WIDTH)).toEqual({ hue: 90, saturation: 100 });
  });

  it('finds a colour where the finger chose it', () => {
    const colour = { hue: 217, saturation: 64 };
    const { left, top } = pointOfColor(colour);
    expect(colorAtPoint((left / 100) * WIDTH, (top / 100) * WIDTH, WIDTH)).toEqual(colour);
  });
});

describe('GlassColorPicker', () => {
  it('sends the colour under the finger', () => {
    const { onChange, picker } = setup();
    fireEvent.pointerDown(picker, { pointerId: 1, clientX: 100 + WIDTH * COLOR_DISC_REACH, clientY: 100 });
    fireEvent.pointerUp(picker, { pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith({ hue: 90, saturation: 100 });
  });

  it('does not flood the device while dragging, and always sends the last colour', () => {
    const { onChange, picker } = setup();
    fireEvent.pointerDown(picker, { pointerId: 1, clientX: 100, clientY: 20 });
    expect(onChange).toHaveBeenCalledTimes(1);
    for (let x = 100; x < 110; x += 1) fireEvent.pointerMove(picker, { pointerId: 1, clientX: x, clientY: 20 });
    expect(onChange).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(130);
    });
    expect(onChange).toHaveBeenCalledTimes(2);
    fireEvent.pointerMove(picker, { pointerId: 1, clientX: 180, clientY: 100 });
    fireEvent.pointerUp(picker, { pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith(colorAtPoint(180, 100, WIDTH));
  });

  it('ignores the finger once it has lifted', () => {
    const { onChange, picker } = setup();
    fireEvent.pointerDown(picker, { pointerId: 1, clientX: 100, clientY: 20 });
    fireEvent.pointerUp(picker, { pointerId: 1 });
    const calls = onChange.mock.calls.length;
    fireEvent.pointerMove(picker, { pointerId: 1, clientX: 180, clientY: 100 });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onChange).toHaveBeenCalledTimes(calls);
  });

  it('answers to the arrows: left and right the hue, up and down the saturation', () => {
    const { onChange, picker } = setup();
    fireEvent.keyDown(picker, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith({ hue: 95, saturation: 50 });
    act(() => {
      vi.advanceTimersByTime(130);
    });
    fireEvent.keyDown(picker, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenLastCalledWith({ hue: 95, saturation: 55 });
    expect(picker.getAttribute('aria-valuetext')).toBe('95 55');
  });

  it('does nothing when disabled', () => {
    const { onChange, picker } = setup({ disabled: true });
    fireEvent.pointerDown(picker, { pointerId: 1, clientX: 100, clientY: 20 });
    fireEvent.keyDown(picker, { key: 'ArrowRight' });
    expect(onChange).not.toHaveBeenCalled();
    expect(picker.getAttribute('tabindex')).toBe('-1');
  });

  it('shows the value it is given once the device has had time to answer', () => {
    const { picker } = setup();
    fireEvent.pointerDown(picker, { pointerId: 1, clientX: 100, clientY: 20 });
    fireEvent.pointerUp(picker, { pointerId: 1 });
    act(() => {
      vi.advanceTimersByTime(2100);
    });
    expect(picker.getAttribute('aria-valuenow')).toBe('0');
  });
});
