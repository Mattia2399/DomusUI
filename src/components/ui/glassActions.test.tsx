import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GlassButtonGroup } from './GlassButtonGroup';
import { GLASS_HOLD_MS, GlassHoldButton } from './GlassHoldButton';
import { GlassMomentaryButton } from './GlassMomentaryButton';
import { GLASS_RESULT_MS, GlassResultButton } from './GlassResultButton';
import { GlassRunButton } from './GlassRunButton';
import { GlassStatusPill } from './GlassStatusPill';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('GlassButtonGroup', () => {
  it('runs a command and keeps the last one marked', () => {
    const up = vi.fn();
    render(<GlassButtonGroup ariaLabel="Comandi" actions={[{ id: 'up', label: 'Su', onPress: up }, { id: 'down', label: 'Giù', onPress: () => undefined }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Su' }));
    expect(up).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Su' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Giù' }));
    expect(screen.getByRole('button', { name: 'Su' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('blocks every command while it waits', () => {
    render(<GlassButtonGroup ariaLabel="C" actions={[{ id: 'a', label: 'A', onPress: () => undefined }]} pending />);
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('group').getAttribute('aria-busy')).toBe('true');
  });
});

describe('GlassHoldButton', () => {
  const holdButton = (onConfirm = vi.fn()) => {
    render(<GlassHoldButton label="Apri il cancello" onConfirm={onConfirm} />);
    return { button: screen.getByRole('button'), onConfirm };
  };

  it('acts only after the whole time', () => {
    const { button, onConfirm } = holdButton();
    fireEvent.pointerDown(button);
    act(() => void vi.advanceTimersByTime(GLASS_HOLD_MS - 1));
    expect(onConfirm).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(GLASS_HOLD_MS).toBe(1200);
  });

  it.each(['pointerUp', 'pointerLeave', 'pointerCancel', 'blur'] as const)('cancels on %s', (event) => {
    const { button, onConfirm } = holdButton();
    fireEvent.pointerDown(button);
    fireEvent[event](button);
    act(() => void vi.advanceTimersByTime(GLASS_HOLD_MS * 2));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('works from the keyboard, and letting go cancels', () => {
    const { button, onConfirm } = holdButton();
    fireEvent.keyDown(button, { key: ' ' });
    fireEvent.keyUp(button, { key: ' ' });
    act(() => void vi.advanceTimersByTime(GLASS_HOLD_MS * 2));
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.keyDown(button, { key: 'Enter', repeat: true });
    act(() => void vi.advanceTimersByTime(GLASS_HOLD_MS));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('never acts when it is left on the page and goes', () => {
    const onConfirm = vi.fn();
    const { unmount } = render(<GlassHoldButton label="X" onConfirm={onConfirm} />);
    fireEvent.pointerDown(screen.getByRole('button'));
    unmount();
    act(() => void vi.advanceTimersByTime(GLASS_HOLD_MS * 2));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('GlassMomentaryButton', () => {
  const momentary = (onPress = vi.fn()) => {
    const view = render(<GlassMomentaryButton label="Campanello" onPress={onPress} />);
    return { ...view, button: screen.getByRole('button'), onPress };
  };

  it('is on while held and off when let go', () => {
    const { button, onPress } = momentary();
    fireEvent.pointerDown(button);
    expect(onPress.mock.calls).toEqual([[true]]);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    fireEvent.pointerUp(window);
    expect(onPress.mock.calls).toEqual([[true], [false]]);
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it.each(['pointerCancel', 'blur'] as const)('lets go when the finger is taken away: %s', (event) => {
    const { button, onPress } = momentary();
    fireEvent.pointerDown(button);
    fireEvent[event](window);
    expect(onPress).toHaveBeenLastCalledWith(false);
  });

  it('lets go when the page goes away while held', () => {
    const { button, onPress, unmount } = momentary();
    fireEvent.pointerDown(button);
    unmount();
    expect(onPress).toHaveBeenLastCalledWith(false);
  });

  it('still lets go when it becomes busy while held', () => {
    const onPress = vi.fn();
    const { rerender } = render(<GlassMomentaryButton label="C" onPress={onPress} />);
    fireEvent.pointerDown(screen.getByRole('button'));
    rerender(<GlassMomentaryButton label="C" onPress={onPress} pending />);
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.pointerUp(window);
    expect(onPress).toHaveBeenLastCalledWith(false);
  });

  it('works from the keyboard and does not repeat', () => {
    const { button, onPress } = momentary();
    fireEvent.keyDown(button, { key: ' ' });
    fireEvent.keyDown(button, { key: ' ', repeat: true });
    fireEvent.keyUp(button, { key: ' ' });
    expect(onPress.mock.calls).toEqual([[true], [false]]);
  });

  it('starts nothing while disabled', () => {
    const onPress = vi.fn();
    render(<GlassMomentaryButton label="C" onPress={onPress} disabled />);
    fireEvent.pointerDown(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('GlassRunButton', () => {
  it('cannot be pressed again while it runs and shows how far it got', () => {
    const onPress = vi.fn();
    const { rerender, container } = render(<GlassRunButton label="Pulizia" running={false} onPress={onPress} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
    rerender(<GlassRunButton label="Pulizia" runningLabel="In corso" running onPress={onPress} />);
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('button').getAttribute('aria-busy')).toBe('true');
    expect(screen.getByText('In corso')).toBeTruthy();
    expect(container.querySelector('.glass-run-wheel')).toBeTruthy();
    rerender(<GlassRunButton label="Pulizia" running progress={140} onPress={onPress} />);
    expect(container.querySelector<HTMLElement>('.glass-run-bar')!.style.width).toBe('100%');
  });
});

describe('GlassResultButton', () => {
  const settle = () => act(async () => void (await vi.advanceTimersByTimeAsync(0)));

  it('turns green for 2 seconds and goes back', async () => {
    render(<GlassResultButton label="Attiva" successLabel="Fatto" onPress={() => Promise.resolve(true)} />);
    fireEvent.click(screen.getByRole('button'));
    await settle();
    expect(screen.getByText('Fatto')).toBeTruthy();
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
    act(() => void vi.advanceTimersByTime(GLASS_RESULT_MS));
    expect(screen.getByText('Attiva')).toBeTruthy();
    expect(GLASS_RESULT_MS).toBe(2000);
  });

  it('turns red with the reason, also when the promise is rejected', async () => {
    const { rerender } = render(<GlassResultButton label="A" successLabel="F" onPress={() => Promise.resolve('La luce non risponde')} />);
    fireEvent.click(screen.getByRole('button'));
    await settle();
    expect(screen.getByText('La luce non risponde').closest('button')?.className).toContain('is-failed');
    act(() => void vi.advanceTimersByTime(GLASS_RESULT_MS));
    rerender(<GlassResultButton label="A" successLabel="F" onPress={() => Promise.reject(new Error('rotto'))} />);
    fireEvent.click(screen.getByRole('button'));
    await settle();
    expect(screen.getByText(/rotto/)).toBeTruthy();
  });
});

describe('GlassStatusPill', () => {
  it('runs on touch and says whether it is active', () => {
    const onPress = vi.fn();
    render(<GlassStatusPill label="Relax" status="attiva" active onPress={onPress} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('attiva')).toBeTruthy();
  });
});

describe('forms', () => {
  it.each(['compact', 'group'] as const)('the actions have the form %s', (size) => {
    const { container } = render(
      <>
        <GlassButtonGroup ariaLabel="G" actions={[]} size={size} />
        <GlassHoldButton label="H" onConfirm={() => undefined} size={size} />
        <GlassMomentaryButton label="M" onPress={() => undefined} size={size} />
        <GlassRunButton label="R" running={false} onPress={() => undefined} size={size} />
        <GlassResultButton label="E" successLabel="S" onPress={() => Promise.resolve(true)} size={size} />
      </>,
    );
    expect(container.querySelectorAll(`.is-${size}`)).toHaveLength(5);
  });
});
