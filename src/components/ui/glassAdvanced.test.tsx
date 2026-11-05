import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatRemaining, GlassCountdown } from './GlassCountdown';
import { GlassCurveEditor } from './GlassCurveEditor';
import { fanTurnSeconds, GlassFanSpeed } from './GlassFanSpeed';
import { GlassJoystick, insideCircle } from './GlassJoystick';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const SPEEDS = [
  { value: 'auto', label: 'Auto' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
];

describe('GlassJoystick', () => {
  it('keeps the knob inside the circle', () => {
    expect(insideCircle(0.5, 0)).toEqual({ x: 0.5, y: 0 });
    const edge = insideCircle(3, 4);
    expect(edge.x).toBeCloseTo(0.6);
    expect(edge.y).toBeCloseTo(0.8);
  });

  it('moves with the keys and goes back to the centre', () => {
    const onMove = vi.fn();
    const onRelease = vi.fn();
    render(<GlassJoystick label="Brandeggio" onMove={onMove} onRelease={onRelease} />);
    const pad = screen.getByRole('application', { name: 'Brandeggio' });
    fireEvent.keyDown(pad, { key: 'ArrowUp' });
    expect(onMove).toHaveBeenCalledWith(0, -0.5);
    fireEvent.keyDown(pad, { key: 'ArrowUp', repeat: true });
    expect(onMove).toHaveBeenCalledTimes(1);
    fireEvent.keyUp(pad, { key: 'ArrowUp' });
    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it('stops when the finger goes, and only once', () => {
    const onRelease = vi.fn();
    render(<GlassJoystick label="B" onMove={() => undefined} onRelease={onRelease} />);
    const pad = screen.getByRole('application');
    fireEvent.pointerDown(pad, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(pad);
    fireEvent.pointerCancel(pad);
    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it('does not move while disabled', () => {
    const onMove = vi.fn();
    render(<GlassJoystick label="B" onMove={onMove} onRelease={() => undefined} disabled />);
    const pad = screen.getByRole('application');
    fireEvent.pointerDown(pad, { clientX: 10, clientY: 10 });
    fireEvent.keyDown(pad, { key: 'ArrowUp' });
    expect(onMove).not.toHaveBeenCalled();
  });
});

describe('GlassCurveEditor', () => {
  const POINTS = [
    { id: 'a', label: '−10°', ariaLabel: 'A −10°', value: 68 },
    { id: 'b', label: '20°', ariaLabel: 'A 20°', value: 80 },
  ];

  it('moves one point by the step, within its limits', () => {
    const onChange = vi.fn();
    render(<GlassCurveEditor points={POINTS} min={30} max={80} step={2} onChange={onChange} format={(value) => `${value}°`} />);
    fireEvent.keyDown(screen.getByRole('slider', { name: 'A −10°' }), { key: 'ArrowUp' });
    expect(onChange).toHaveBeenCalledWith('a', 70);
    fireEvent.keyDown(screen.getByRole('slider', { name: 'A 20°' }), { key: 'ArrowUp' });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('slider', { name: 'A −10°' }).getAttribute('aria-valuetext')).toBe('68°');
  });
});

describe('GlassCountdown', () => {
  it('writes the time left, never below zero', () => {
    expect(formatRemaining(246)).toBe('4:06');
    expect(formatRemaining(3661)).toBe('1:01:01');
    expect(formatRemaining(-5)).toBe('0:00');
    expect(formatRemaining(0.2)).toBe('0:01');
  });

  it('counts down by itself and stops at zero', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-05T10:00:00Z'));
    render(<GlassCountdown finishesAt={Date.now() + 3000} total={60} label="Timer" />);
    expect(screen.getByRole('timer', { name: 'Timer' }).textContent).toContain('0:03');
    act(() => void vi.advanceTimersByTime(2000));
    expect(screen.getByRole('timer').textContent).toContain('0:01');
    act(() => void vi.advanceTimersByTime(5000));
    expect(screen.getByRole('timer').textContent).toContain('0:00');
  });

  it('when paused it stays still and the touch resumes it', () => {
    const onToggle = vi.fn();
    render(<GlassCountdown remaining={246} total={600} label="Pausa" onToggle={onToggle} note="in pausa" />);
    fireEvent.click(screen.getByRole('button', { name: 'Pausa' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(screen.getByText('4:06')).toBeTruthy();
  });
});

describe('GlassFanSpeed', () => {
  it('turns faster with the speed', () => {
    expect(fanTurnSeconds(2, 3)).toBeLessThan(fanTurnSeconds(1, 3));
    expect(fanTurnSeconds(0, 1)).toBe(1.2);
  });

  it('chooses by touch and walks with the keys', () => {
    const onChange = vi.fn();
    render(<GlassFanSpeed ariaLabel="Ventola" options={SPEEDS} value="1" onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: '2' }));
    expect(onChange).toHaveBeenCalledWith('2');
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('auto');
  });

  it('stands still when it is off', () => {
    const { container } = render(<GlassFanSpeed ariaLabel="V" options={SPEEDS} value="1" onChange={() => undefined} stopped />);
    expect(container.querySelector('.is-turning')).toBeNull();
  });
});

describe('every one has the three forms', () => {
  it.each(['compact', 'group', 'hero'] as const)('%s', (size) => {
    const { container } = render(
      <>
        <GlassJoystick label="J" onMove={() => undefined} onRelease={() => undefined} size={size} />
        <GlassCurveEditor points={[]} min={0} max={1} onChange={() => undefined} size={size} />
        <GlassCountdown remaining={1} total={2} label="C" size={size} />
        <GlassFanSpeed ariaLabel="F" options={SPEEDS} value="1" onChange={() => undefined} size={size} />
      </>,
    );
    expect(container.querySelectorAll(`.is-${size}`)).toHaveLength(4);
  });
});
