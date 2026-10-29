import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import {
  DEFAULT_KIOSK_PREFERENCES,
  KIOSK_STORAGE_KEY,
  resetKioskPreferencesCache,
  serializeKioskPreferences,
} from '../kiosk/kioskPreferences';
import { onKioskLaunchRequest, resetKioskSession, updateKioskSession } from '../kiosk/kioskSession';
import KioskSettings from './KioskSettings';

const START_ROUTES = [
  { path: '/home', label: 'Home' },
  { path: '/rooms', label: 'Stanze' },
  { path: '/consumi', label: 'Consumi' },
];
const renderPage = () => render(<KioskSettings startRoutes={START_ROUTES} />, { wrapper: I18nProvider });
const stored = () => JSON.parse(window.localStorage.getItem(KIOSK_STORAGE_KEY) ?? 'null');
const kioskSwitch = () => screen.getByRole('switch', { name: 'Modalità Kiosk' });
const status = (title: string) =>
  screen.getAllByTestId('kiosk-status').find((row) => row.textContent?.startsWith(title))!.textContent;

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
  resetKioskPreferencesCache();
  resetKioskSession();
});

afterEach(() => {
  cleanup();
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: undefined });
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined });
});

describe('KioskSettings', () => {
  it('starts off and says it is not a protection', () => {
    renderPage();

    expect(kioskSwitch().getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText(/Non è una protezione/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Avvia modalità pannello' })).toBeNull();
  });

  it('turns on at once with the defaults and opens its options, without starting the panel', () => {
    const launches: number[] = [];
    const stop = onKioskLaunchRequest(() => launches.push(1));
    renderPage();
    fireEvent.click(kioskSwitch());
    stop();

    expect(stored()).toEqual({ version: 1, ...DEFAULT_KIOSK_PREFERENCES, enabled: true });
    expect(screen.getByRole('switch', { name: 'Nascondi navigazione' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('switch', { name: 'Mantieni schermo attivo' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('switch', { name: 'Schermo intero' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('button', { name: 'Avvia modalità pannello' })).toBeTruthy();
    expect(launches).toEqual([]);
  });

  it('offers as start page only the pages of the navigation, and saves the choice', async () => {
    renderPage();
    fireEvent.click(kioskSwitch());

    fireEvent.click(screen.getByRole('button', { name: /Pagina iniziale/ }));
    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.textContent?.trim())).toEqual(['Home', 'Stanze', 'Consumi']);
    fireEvent.click(screen.getByRole('option', { name: 'Stanze' }));

    await waitFor(() => expect(stored().startRoute).toBe('/rooms'));
  });

  it('shows Home when the saved start page is not in the navigation any more', () => {
    window.localStorage.setItem(
      KIOSK_STORAGE_KEY,
      serializeKioskPreferences({ ...DEFAULT_KIOSK_PREFERENCES, enabled: true, startRoute: '/security' }),
    );
    renderPage();
    expect(screen.getByRole('button', { name: /Pagina iniziale/ }).textContent).toContain('Home');
  });

  it('keeps each display choice', () => {
    renderPage();
    fireEvent.click(kioskSwitch());

    fireEvent.click(screen.getByRole('switch', { name: 'Nascondi navigazione' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Mantieni schermo attivo' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Schermo intero' }));

    expect(stored()).toMatchObject({ hideNavigation: false, keepScreenAwake: false, preferFullscreen: false });
  });

  it('shows what this browser can do before the panel starts', () => {
    // A browser with neither full screen nor a wake lock.
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false });
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined });
    window.localStorage.setItem(KIOSK_STORAGE_KEY, serializeKioskPreferences({ ...DEFAULT_KIOSK_PREFERENCES, enabled: true }));
    // Turned on in this visit: the panel has not started yet.
    updateKioskSession({ active: false });
    renderPage();

    expect(status('Schermo intero')).toContain('Non supportato dal browser');
    expect(status('Schermo sempre attivo')).toContain('Non supportato dal browser');
  });

  it('shows the real state while the panel runs', () => {
    window.localStorage.setItem(KIOSK_STORAGE_KEY, serializeKioskPreferences({ ...DEFAULT_KIOSK_PREFERENCES, enabled: true }));
    renderPage();

    act(() => updateKioskSession({ active: true, fullscreen: 'rejected', wakeLock: 'released' }));
    expect(status('Schermo intero')).toContain('Il browser ha rifiutato lo schermo intero');
    expect(status('Schermo sempre attivo')).toContain('Rilasciato');

    act(() => updateKioskSession({ fullscreen: 'active', wakeLock: 'active' }));
    expect(status('Schermo intero')).toContain('Attivo');
    expect(status('Schermo sempre attivo')).toContain('Attivo');
  });

  it('starts the panel only from its own button, and says how to leave', () => {
    window.localStorage.setItem(KIOSK_STORAGE_KEY, serializeKioskPreferences({ ...DEFAULT_KIOSK_PREFERENCES, enabled: true }));
    const launches: number[] = [];
    const stop = onKioskLaunchRequest(() => launches.push(1));
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Avvia modalità pannello' }));
    stop();

    expect(launches).toEqual([1]);
    expect(screen.getByText(/tieni premuto per 3 secondi l’angolo in basso a sinistra, oppure premi Ctrl\+Alt\+K/)).toBeTruthy();
  });
});
