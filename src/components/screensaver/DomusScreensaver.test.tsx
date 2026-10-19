import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import { DomusScreensaver } from './DomusScreensaver';
import {
  DEFAULT_SCREENSAVER_PREFERENCES,
  requestScreensaverPreview,
  resetScreensaverPreferencesCache,
  saveScreensaverPreferences,
  type ScreensaverPreferences,
} from './screensaverPreferences';

const MINUTE = 60_000;

beforeAll(() => {
  // jsdom has no PointerEvent: without it pointerType and coordinates are lost.
  if (typeof window.PointerEvent === 'undefined') {
    class TestPointerEvent extends MouseEvent {
      pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerType = init.pointerType ?? '';
      }
    }
    window.PointerEvent = TestPointerEvent as unknown as typeof PointerEvent;
  }
});

function enable(change: Partial<ScreensaverPreferences> = {}) {
  saveScreensaverPreferences({ ...DEFAULT_SCREENSAVER_PREFERENCES, enabled: true, timeoutMinutes: 1, ...change });
}

/** The dashboard as the screensaver finds it: an app root with a door to unlock. */
function Dashboard({ route = '/home', children }: { route?: string; children?: ReactNode }) {
  return (
    <I18nProvider>
      {children}
      <DomusScreensaver route={route} appearance="dark" background="neutral" />
    </I18nProvider>
  );
}

let appRoot: HTMLDivElement;
const overlay = () => screen.queryByTestId('domus-screensaver');

function renderDashboard(onUnlock = vi.fn()) {
  function Page({ route, withNote = true }: { route: string; withNote?: boolean }) {
    const [note, setNote] = useState('');
    return (
      <Dashboard route={route}>
        <button type="button" onClick={onUnlock}>
          Sblocca porta
        </button>
        {withNote ? <input aria-label="Nota" value={note} onChange={(event) => setNote(event.target.value)} /> : null}
      </Dashboard>
    );
  }
  const view = render(<Page route="/home" />, { container: appRoot });
  return {
    ...view,
    onUnlock,
    setRoute: (route: string) => view.rerender(<Page route={route} />),
    removeNote: () => view.rerender(<Page route="/home" withNote={false} />),
  };
}

async function idle(ms = MINUTE) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
  resetScreensaverPreferencesCache();
  appRoot = document.createElement('div');
  appRoot.id = 'root';
  document.body.appendChild(appRoot);
});

afterEach(() => {
  cleanup();
  appRoot.remove();
  resetScreensaverPreferencesCache();
  vi.useRealTimers();
});

describe('DomusScreensaver', () => {
  it('never appears while it is off, which is the default', async () => {
    renderDashboard();
    await idle(60 * MINUTE);
    expect(overlay()).toBeNull();
  });

  it('appears after the chosen time without activity, whatever page is open', async () => {
    enable();
    renderDashboard();

    await idle(MINUTE - 1_000);
    expect(overlay()).toBeNull();
    await idle(1_000);
    expect(overlay()).not.toBeNull();
    expect(overlay()!.getAttribute('data-source')).toBe('idle');
    expect(overlay()!.getAttribute('aria-label')).toBe('Screensaver');
  });

  it('waits again after any activity', async () => {
    enable();
    renderDashboard();

    await idle(50_000);
    fireEvent.keyDown(screen.getByLabelText('Nota'), { key: 'a' });
    await idle(50_000);
    expect(overlay()).toBeNull();
    await idle(10_000);
    expect(overlay()).not.toBeNull();
  });

  it('counts a navigation as activity', async () => {
    enable();
    const view = renderDashboard();

    await idle(50_000);
    view.setRoute('/settings');
    await idle(50_000);
    expect(overlay()).toBeNull();
    await idle(10_000);
    expect(overlay()).not.toBeNull();
  });

  it('starts the countdown again when the configuration changes', async () => {
    enable({ timeoutMinutes: 2 });
    renderDashboard();

    await idle(90_000);
    // A shorter time does not use the old start: it counts from the change.
    act(() => enable({ timeoutMinutes: 1 }));
    await idle(50_000);
    expect(overlay()).toBeNull();
    await idle(10_000);
    expect(overlay()).not.toBeNull();
  });

  it('does not appear while the page is hidden, nor straight after coming back', async () => {
    enable();
    renderDashboard();
    const visibility = vi.spyOn(document, 'visibilityState', 'get');

    await idle(30_000);
    visibility.mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await idle(30 * MINUTE);
    expect(overlay()).toBeNull();

    visibility.mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await idle(59_000);
    expect(overlay()).toBeNull();
    await idle(1_000);
    expect(overlay()).not.toBeNull();
    visibility.mockRestore();
  });

  it('keeps the first tap: the door below is not unlocked', async () => {
    enable();
    const { onUnlock } = renderDashboard();
    await idle();
    const surface = overlay()!;

    // The tap lands where the button is: the overlay covers it.
    fireEvent.pointerDown(surface, { pointerType: 'touch' });
    fireEvent.touchStart(surface);
    fireEvent.pointerUp(surface, { pointerType: 'touch' });
    fireEvent.touchEnd(surface);
    fireEvent.mouseDown(surface);
    fireEvent.mouseUp(surface);
    fireEvent.click(surface);
    await idle(100);

    expect(overlay()).toBeNull();
    // A late click the browser still sends after the touch is kept too.
    fireEvent.click(screen.getByRole('button', { name: 'Sblocca porta' }));
    expect(onUnlock).not.toHaveBeenCalled();

    // Afterwards the page works as before.
    await idle(500);
    fireEvent.click(screen.getByRole('button', { name: 'Sblocca porta' }));
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it('leaves an open dialog below open: its outside-tap and Escape handlers never hear the wake', async () => {
    enable();
    renderDashboard();
    // What a dialog library listens to on the document, in both phases.
    const dialogHeard = vi.fn();
    const types = ['pointerdown', 'mousedown', 'touchstart', 'click', 'keydown', 'keyup'];
    types.forEach((type) => {
      document.addEventListener(type, dialogHeard, true);
      document.addEventListener(type, dialogHeard);
    });
    await idle();

    fireEvent.keyDown(overlay()!, { key: 'Escape' });
    fireEvent.keyUp(overlay()!, { key: 'Escape' });
    await idle(100);
    expect(overlay()).toBeNull();

    await idle();
    fireEvent.pointerDown(overlay()!, { pointerType: 'touch' });
    fireEvent.touchStart(overlay()!);
    fireEvent.mouseDown(overlay()!);
    fireEvent.pointerUp(overlay()!, { pointerType: 'touch' });
    fireEvent.click(overlay()!);
    await idle(100);
    expect(overlay()).toBeNull();

    expect(dialogHeard).not.toHaveBeenCalled();
    types.forEach((type) => {
      document.removeEventListener(type, dialogHeard, true);
      document.removeEventListener(type, dialogHeard);
    });
  });

  it('wakes with a mouse click without clicking what is below', async () => {
    enable();
    const { onUnlock } = renderDashboard();
    await idle();

    fireEvent.pointerDown(overlay()!, { pointerType: 'mouse' });
    fireEvent.mouseDown(overlay()!);
    fireEvent.pointerUp(overlay()!, { pointerType: 'mouse' });
    fireEvent.mouseUp(overlay()!);
    fireEvent.click(overlay()!);
    await idle(100);

    expect(overlay()).toBeNull();
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it('wakes with a key, a wheel or a real mouse movement, not a nudge', async () => {
    enable();
    renderDashboard();

    await idle();
    fireEvent.keyDown(overlay()!, { key: 'Enter' });
    fireEvent.keyUp(overlay()!, { key: 'Enter' });
    await idle(100);
    expect(overlay()).toBeNull();

    await idle();
    fireEvent.wheel(overlay()!);
    await idle(300);
    expect(overlay()).toBeNull();

    await idle();
    fireEvent.pointerMove(overlay()!, { pointerType: 'mouse', clientX: 100, clientY: 100 });
    fireEvent.pointerMove(overlay()!, { pointerType: 'mouse', clientX: 104, clientY: 103 });
    await idle(300);
    expect(overlay()).not.toBeNull();
    fireEvent.pointerMove(overlay()!, { pointerType: 'mouse', clientX: 140, clientY: 120 });
    await idle(300);
    expect(overlay()).toBeNull();
  });

  it('closes at once when it is turned off while showing', async () => {
    enable();
    renderDashboard();
    await idle();
    expect(overlay()).not.toBeNull();

    act(() => saveScreensaverPreferences({ ...DEFAULT_SCREENSAVER_PREFERENCES, enabled: false }));

    expect(overlay()).toBeNull();
  });

  it('keeps the page below out of reach and gives the focus back afterwards', async () => {
    enable();
    renderDashboard();
    const note = screen.getByLabelText('Nota');
    note.focus();
    // Focus alone is not activity for ever: the screensaver still comes.
    await idle();

    expect(appRoot.inert).toBe(true);
    expect(document.activeElement).toBe(overlay());
    fireEvent.keyDown(overlay()!, { key: 'Tab' });
    fireEvent.keyUp(overlay()!, { key: 'Tab' });
    await idle(100);

    expect(overlay()).toBeNull();
    expect(appRoot.inert).toBe(false);
    expect(appRoot.hasAttribute('inert')).toBe(false);
    expect(appRoot.getAttribute('aria-hidden')).toBeNull();
    expect(document.activeElement).toBe(note);
  });

  it('survives a focused element that is gone at wake time', async () => {
    enable();
    const view = renderDashboard();
    screen.getByLabelText('Nota').focus();
    await idle();
    view.removeNote();

    fireEvent.pointerDown(overlay()!, { pointerType: 'mouse' });
    fireEvent.pointerUp(overlay()!, { pointerType: 'mouse' });
    await idle(100);

    expect(overlay()).toBeNull();
  });

  it('shows a preview at once, with its own settings, and leaves the countdown alone', async () => {
    enable({ timeoutMinutes: 2 });
    renderDashboard();
    await idle(MINUTE);

    act(() => requestScreensaverPreview({ ...DEFAULT_SCREENSAVER_PREFERENCES, enabled: true, mode: 'ambient' }));
    expect(overlay()!.getAttribute('data-source')).toBe('preview');
    expect(overlay()!.getAttribute('data-mode')).toBe('ambient');

    fireEvent.keyDown(overlay()!, { key: 'Escape' });
    fireEvent.keyUp(overlay()!, { key: 'Escape' });
    await idle(100);
    expect(overlay()).toBeNull();

    // The key that closed the preview is activity: two minutes from it.
    await idle(2 * MINUTE - 200);
    expect(overlay()).toBeNull();
    await idle(200);
    expect(overlay()!.getAttribute('data-source')).toBe('idle');
  });

  it('can be previewed while still off', async () => {
    renderDashboard();
    act(() => requestScreensaverPreview(DEFAULT_SCREENSAVER_PREFERENCES));
    expect(overlay()!.getAttribute('data-source')).toBe('preview');
  });

  it('removes every listener when the dashboard goes away', async () => {
    enable();
    const remove = vi.spyOn(window, 'removeEventListener');
    const view = renderDashboard();
    view.unmount();

    const removed = remove.mock.calls.map(([type]) => type);
    for (const type of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'focusin', 'focus']) {
      expect(removed, type).toContain(type);
    }
    await idle(10 * MINUTE);
    expect(overlay()).toBeNull();
    remove.mockRestore();
  });
});
