// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLiftGuard } from './useLiftGuard';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Sheet({ onPress, openId = 'card' }: { onPress: () => void; openId?: string | null }) {
  useLiftGuard(openId);
  return <button type="button" onClick={onPress}>Modalità</button>;
}

describe('the finger that opened a panel', () => {
  it('does not press what lies under it when it lifts', () => {
    const onPress = vi.fn();
    render(<Sheet onPress={onPress} />);
    const control = screen.getByRole('button', { name: 'Modalità' });
    fireEvent.pointerUp(control);
    fireEvent.click(control);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('holds back only that one click', () => {
    const onPress = vi.fn();
    render(<Sheet onPress={onPress} />);
    const control = screen.getByRole('button', { name: 'Modalità' });
    fireEvent.pointerUp(control);
    fireEvent.click(control);
    fireEvent.click(control);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('lets through a new touch on the panel', () => {
    const onPress = vi.fn();
    render(<Sheet onPress={onPress} />);
    const control = screen.getByRole('button', { name: 'Modalità' });
    fireEvent.pointerDown(control);
    fireEvent.pointerUp(control);
    fireEvent.click(control);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('lets through the keyboard, which has no finger to lift', () => {
    const onPress = vi.fn();
    render(<Sheet onPress={onPress} />);
    fireEvent.click(screen.getByRole('button', { name: 'Modalità' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('gives up when no click follows the lift', () => {
    vi.useFakeTimers();
    const onPress = vi.fn();
    render(<Sheet onPress={onPress} />);
    const control = screen.getByRole('button', { name: 'Modalità' });
    fireEvent.pointerUp(control);
    vi.advanceTimersByTime(800);
    fireEvent.click(control);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is off while no panel is open, and stops when it closes', () => {
    const onPress = vi.fn();
    const { rerender } = render(<Sheet onPress={onPress} openId={null} />);
    const control = screen.getByRole('button', { name: 'Modalità' });
    fireEvent.pointerUp(control);
    fireEvent.click(control);
    expect(onPress).toHaveBeenCalledTimes(1);
    rerender(<Sheet onPress={onPress} openId="card" />);
    rerender(<Sheet onPress={onPress} openId={null} />);
    fireEvent.pointerUp(control);
    fireEvent.click(control);
    expect(onPress).toHaveBeenCalledTimes(2);
  });
});
