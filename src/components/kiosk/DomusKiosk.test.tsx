import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import { DomusScreensaver } from '../screensaver/DomusScreensaver';
import {
  DEFAULT_SCREENSAVER_PREFERENCES,
  resetScreensaverPreferencesCache,
  saveScreensaverPreferences,
} from '../screensaver/screensaverPreferences';
import { DomusKiosk, useKioskChrome } from './DomusKiosk';
import { KIOSK_EXIT_HOLD_MS } from './KioskRuntime';
import { startKioskPanel } from './kioskLaunch';
import {
  DEFAULT_KIOSK_PREFERENCES,
  KIOSK_STORAGE_KEY,
  getKioskPreferences,
  resetKioskPreferencesCache,
  saveKioskPreferences,
  serializeKioskPreferences,
  type KioskPreferences,
} from './kioskPreferences';
import { getKioskSession, resetKioskSession } from './kioskSession';

beforeAll(() => {
  if (typeof window.PointerEvent === 'undefined') {
    class TestPointerEvent extends MouseEvent {
      pointerType: string;
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerType = init.pointerType ?? '';
        this.pointerId = init.pointerId ?? 1;
      }
    }
    window.PointerEvent = TestPointerEvent as unknown as typeof PointerEvent;
  }
});

/** Full screen as a browser does it, with a switch for an exit made by the person. */
function installFullscreen({ refuse = false, missing = false } = {}) {
  let element: Element | null = null;
  const request = vi.fn(async () => {
    if (refuse) throw new TypeError('Permissions check failed');
    element = document.documentElement;
    document.dispatchEvent(new Event('fullscreenchange'));
  });
  const exit = vi.fn(async () => {
    element = null;
    document.dispatchEvent(new Event('fullscreenchange'));
  });
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => !missing });
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => element });
  Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: missing ? undefined : request });
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit });
  return {
    request,
    exit,
    leaveFromOutside: () => {
      element = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    },
  };
}

function installWakeLock({ missing = false } = {}) {
  const sentinels: { released: boolean; release: ReturnType<typeof vi.fn> }[] = [];
  const request = vi.fn(async () => {
    const target = new EventTarget();
    const sentinel = {
      released: false,
      release: vi.fn(async () => {
        sentinel.released = true;
        target.dispatchEvent(new Event('release'));
      }),
      addEventListener: (type: string, listener: () => void) => target.addEventListener(type, listener),
    };
    sentinels.push(sentinel);
    return sentinel;
  });
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: missing ? undefined : { request } });
  return { request, sentinels };
}

function setKiosk(change: Partial<KioskPreferences>) {
  window.localStorage.setItem(KIOSK_STORAGE_KEY, serializeKioskPreferences({ ...DEFAULT_KIOSK_PREFERENCES, ...change }));
  resetKioskPreferencesCache();
  resetKioskSession();
}

let appRoot: HTMLDivElement;
let navigate: Mock<(path: string, options?: { replace?: boolean }) => void>;

function renderDomus({ route = '/settings/device/kiosk', withScreensaver = false } = {}) {
  function ChromeProbe() {
    return <p data-testid="chrome">{useKioskChrome() ? 'kiosk' : 'navigation'}</p>;
  }
  function Domus() {
    const [current, setCurrent] = useState(route);
    // One spy for the whole visit, as the dashboard's own navigate is.
    const [go] = useState(() => vi.fn((path: string, _options?: { replace?: boolean }) => setCurrent(path)));
    navigate = go;
    return (
      <I18nProvider>
        <p data-testid="route">{current}</p>
        <ChromeProbe />
        <DomusKiosk route={current} navigate={navigate} availableStartRoutes={['/home', '/rooms']} />
        {withScreensaver ? <DomusScreensaver route={current} appearance="dark" background="neutral" /> : null}
      </I18nProvider>
    );
  }
  return render(<Domus />, { container: appRoot });
}

const chrome = () => screen.getByTestId('chrome').textContent;
const routeShown = () => screen.getByTestId('route').textContent;
const handle = () => screen.getByTestId('kiosk-exit-handle');
const exitDialog = () => screen.queryByRole('dialog', { name: 'Uscire dalla modalità Kiosk?' });
const flush = () => act(async () => {});

async function holdHandle(ms = KIOSK_EXIT_HOLD_MS) {
  fireEvent.pointerDown(handle(), { pointerType: 'touch', button: 0, clientX: 10, clientY: 800 });
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  window.localStorage.clear();
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
  window.history.replaceState(null, '', '/');
  resetKioskPreferencesCache();
  resetKioskSession();
  resetScreensaverPreferencesCache();
  appRoot = document.createElement('div');
  appRoot.id = 'root';
  document.body.appendChild(appRoot);
});

afterEach(() => {
  cleanup();
  appRoot.remove();
  vi.useRealTimers();
  for (const property of ['fullscreenEnabled', 'fullscreenElement', 'exitFullscreen'] as const) {
    Object.defineProperty(document, property, { configurable: true, value: undefined });
  }
  Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: undefined });
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined });
});

describe('DomusKiosk', () => {
  it('leaves Domus as it is while Kiosk is off', () => {
    installFullscreen();
    renderDomus();
    expect(chrome()).toBe('navigation');
    expect(screen.queryByTestId('kiosk-exit-handle')).toBeNull();
  });

  it('only saves the choice when turned on; the panel starts with its own button', async () => {
    const fullscreen = installFullscreen();
    const wakeLock = installWakeLock();
    renderDomus();

    act(() => saveKioskPreferences({ ...DEFAULT_KIOSK_PREFERENCES, enabled: true, startRoute: '/rooms' }));
    expect(chrome()).toBe('navigation');
    expect(fullscreen.request).not.toHaveBeenCalled();

    act(() => startKioskPanel());
    await flush();

    expect(chrome()).toBe('kiosk');
    expect(routeShown()).toBe('/rooms');
    expect(fullscreen.request).toHaveBeenCalledTimes(1);
    expect(wakeLock.request).toHaveBeenCalledWith('screen');
    expect(getKioskSession()).toMatchObject({ active: true, fullscreen: 'active', wakeLock: 'active' });
  });

  it('starts by itself when Domus opens on a Kiosk device, on its start page, without asking for full screen', async () => {
    const fullscreen = installFullscreen();
    const wakeLock = installWakeLock();
    setKiosk({ enabled: true, startRoute: '/rooms' });
    renderDomus({ route: '/settings' });
    await flush();

    expect(chrome()).toBe('kiosk');
    expect(navigate).toHaveBeenCalledWith('/rooms', { replace: true });
    expect(routeShown()).toBe('/rooms');
    // Full screen needs a tap: after a reload it is not assumed.
    expect(fullscreen.request).not.toHaveBeenCalled();
    expect(wakeLock.request).toHaveBeenCalledTimes(1);
  });

  it('opens Home when the saved start page is no longer reachable, and once only', async () => {
    setKiosk({ enabled: true, startRoute: '/security' });
    const view = renderDomus({ route: '/rooms' });
    await flush();
    expect(routeShown()).toBe('/home');
    expect(navigate).toHaveBeenCalledTimes(1);

    view.rerender(<></>);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('leaves a sign-in return address alone', async () => {
    window.history.replaceState(null, '', '/home?ha_oauth_callback=1');
    setKiosk({ enabled: true, startRoute: '/rooms' });
    renderDomus({ route: '/home?ha_oauth_callback=1' });
    await flush();

    expect(navigate).not.toHaveBeenCalled();
    expect(chrome()).toBe('kiosk');
  });

  it('stays on when the person leaves full screen, and can go back to it', async () => {
    const fullscreen = installFullscreen();
    installWakeLock();
    setKiosk({ enabled: true });
    renderDomus({ route: '/home' });
    act(() => startKioskPanel());
    await flush();

    act(() => fullscreen.leaveFromOutside());
    expect(chrome()).toBe('kiosk');
    expect(getKioskSession().fullscreen).toBe('inactive');
    // Never asked again without a tap.
    expect(fullscreen.request).toHaveBeenCalledTimes(1);

    await holdHandle();
    fireEvent.click(screen.getByRole('button', { name: 'Torna a schermo intero' }));
    await flush();
    expect(fullscreen.request).toHaveBeenCalledTimes(2);
    expect(getKioskSession().fullscreen).toBe('active');
  });

  it('works when full screen is refused', async () => {
    installFullscreen({ refuse: true });
    setKiosk({ enabled: true });
    renderDomus({ route: '/home' });
    act(() => startKioskPanel());
    await flush();
    expect(chrome()).toBe('kiosk');
    expect(getKioskSession().fullscreen).toBe('rejected');
  });

  it('works without any full screen API', async () => {
    installFullscreen({ missing: true });
    setKiosk({ enabled: true });
    renderDomus({ route: '/home' });
    act(() => startKioskPanel());
    await flush();
    expect(chrome()).toBe('kiosk');
    expect(getKioskSession().fullscreen).toBe('unsupported');
  });

  it('works without a wake lock', async () => {
    installFullscreen();
    installWakeLock({ missing: true });
    setKiosk({ enabled: true });
    renderDomus({ route: '/home' });
    await flush();

    expect(chrome()).toBe('kiosk');
    expect(getKioskSession().wakeLock).toBe('unsupported');
  });

  it('does nothing on a tap or a moving finger; held for three seconds it asks', async () => {
    setKiosk({ enabled: true });
    renderDomus({ route: '/home' });
    await flush();

    fireEvent.pointerDown(handle(), { pointerType: 'touch', button: 0, clientX: 10, clientY: 800 });
    await act(async () => {
      vi.advanceTimersByTime(800);
    });
    fireEvent.pointerUp(handle(), { pointerType: 'touch' });
    fireEvent.click(handle(), { detail: 1 });
    await act(async () => {
      vi.advanceTimersByTime(KIOSK_EXIT_HOLD_MS);
    });
    expect(exitDialog()).toBeNull();

    fireEvent.pointerDown(handle(), { pointerType: 'touch', button: 0, clientX: 10, clientY: 800 });
    fireEvent.pointerMove(handle(), { pointerType: 'touch', clientX: 10, clientY: 740 });
    await act(async () => {
      vi.advanceTimersByTime(KIOSK_EXIT_HOLD_MS);
    });
    expect(exitDialog()).toBeNull();

    await holdHandle();
    expect(exitDialog()).not.toBeNull();
  });

  it('stays in Kiosk on Cancel', async () => {
    setKiosk({ enabled: true });
    renderDomus({ route: '/home' });
    await flush();
    await holdHandle();

    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));
    await flush();
    expect(chrome()).toBe('kiosk');
    expect(getKioskPreferences().enabled).toBe(true);
  });

  it('on Leave brings the navigation back, lets the screen sleep, leaves full screen and keeps the page', async () => {
    const fullscreen = installFullscreen();
    const wakeLock = installWakeLock();
    saveScreensaverPreferences({ ...DEFAULT_SCREENSAVER_PREFERENCES, enabled: true, timeoutMinutes: 10 });
    setKiosk({ enabled: true });
    renderDomus({ route: '/home' });
    act(() => startKioskPanel());
    await flush();
    act(() => navigate('/rooms/kitchen'));

    await holdHandle();
    fireEvent.click(screen.getByRole('button', { name: 'Esci' }));
    await flush();

    expect(chrome()).toBe('navigation');
    expect(getKioskPreferences().enabled).toBe(false);
    expect(fullscreen.exit).toHaveBeenCalledTimes(1);
    expect(wakeLock.sentinels[0].released).toBe(true);
    expect(routeShown()).toBe('/rooms/kitchen');
    expect(screen.queryByTestId('kiosk-exit-handle')).toBeNull();
    // The screensaver choices are left alone.
    expect(JSON.parse(window.localStorage.getItem('domusui.screensaver.v1')!).timeoutMinutes).toBe(10);
  });

  it('opens the question with Ctrl+Alt+K or a key on the handle, and takes no other key', async () => {
    setKiosk({ enabled: true });
    renderDomus({ route: '/home' });
    await flush();

    for (const key of [{ key: 'Escape' }, { key: 'F5' }, { key: 'Tab' }, { key: 'Backspace' }, { key: 'k', code: 'KeyK', ctrlKey: true }]) {
      expect(fireEvent.keyDown(window, key), key.key).toBe(true);
    }
    expect(exitDialog()).toBeNull();

    expect(fireEvent.keyDown(window, { key: 'k', code: 'KeyK', ctrlKey: true, altKey: true })).toBe(false);
    expect(exitDialog()).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));
    await flush();

    // Enter or Space on the focused handle send a click without a pointer.
    fireEvent.click(handle(), { detail: 0 });
    expect(exitDialog()).not.toBeNull();
  });

  it('ends at once when another tab turns Kiosk off, without touching that tab', async () => {
    const fullscreen = installFullscreen();
    setKiosk({ enabled: true });
    renderDomus({ route: '/home' });
    act(() => startKioskPanel());
    await flush();

    act(() => {
      window.localStorage.setItem(KIOSK_STORAGE_KEY, serializeKioskPreferences(DEFAULT_KIOSK_PREFERENCES));
      window.dispatchEvent(new StorageEvent('storage', { key: KIOSK_STORAGE_KEY }));
    });
    await flush();

    expect(chrome()).toBe('navigation');
    expect(fullscreen.exit).toHaveBeenCalledTimes(1);
  });

  it('lives with the screensaver: idle shows it, a tap wakes it and the panel is still there', async () => {
    installFullscreen();
    installWakeLock();
    saveScreensaverPreferences({ ...DEFAULT_SCREENSAVER_PREFERENCES, enabled: true, timeoutMinutes: 1 });
    setKiosk({ enabled: true });
    renderDomus({ route: '/home', withScreensaver: true });
    await flush();
    expect(getKioskSession().wakeLock).toBe('active');

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    const overlay = screen.getByTestId('domus-screensaver');

    // The Kiosk shortcut only wakes the screensaver while it shows.
    fireEvent.keyDown(overlay, { key: 'k', code: 'KeyK', ctrlKey: true, altKey: true });
    fireEvent.keyUp(overlay, { key: 'k', code: 'KeyK', ctrlKey: true, altKey: true });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.queryByTestId('domus-screensaver')).toBeNull();
    expect(exitDialog()).toBeNull();
    expect(chrome()).toBe('kiosk');
    expect(routeShown()).toBe('/home');
    expect(getKioskSession()).toMatchObject({ active: true, wakeLock: 'active' });
  });
});
