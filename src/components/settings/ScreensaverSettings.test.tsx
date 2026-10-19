import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import {
  SCREENSAVER_STORAGE_KEY,
  onScreensaverPreviewRequest,
  resetScreensaverPreferencesCache,
  type ScreensaverPreferences,
} from '../screensaver/screensaverPreferences';
import ScreensaverSettings from './ScreensaverSettings';

const renderPage = () => render(<ScreensaverSettings />, { wrapper: I18nProvider });
const stored = () => JSON.parse(window.localStorage.getItem(SCREENSAVER_STORAGE_KEY) ?? 'null');
const screensaverSwitch = () => screen.getByRole('switch', { name: 'Screensaver' });

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
  resetScreensaverPreferencesCache();
});

afterEach(() => {
  cleanup();
  resetScreensaverPreferencesCache();
});

describe('ScreensaverSettings', () => {
  it('starts off, with nothing else to set until it is on', () => {
    renderPage();

    expect(screensaverSwitch().getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText('Mostra automaticamente lo screensaver dopo un periodo di inattività.')).toBeTruthy();
    expect(screen.queryByText('Avvia dopo')).toBeNull();
    expect(screen.getByText(/Vale solo per questo dispositivo/)).toBeTruthy();
  });

  it('turns on at once and keeps it in this browser', () => {
    renderPage();
    fireEvent.click(screensaverSwitch());

    expect(stored()).toEqual({ version: 1, enabled: true, timeoutMinutes: 5, mode: 'minimal', showDate: true });
    expect(screen.getByText('Attivo: compare dopo 5 minuti senza tocchi e sparisce al primo tocco.')).toBeTruthy();
    expect(screen.getByText('Avvia dopo')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Avvia anteprima' })).toBeTruthy();
  });

  it('offers 1 to 30 minutes and saves the choice', async () => {
    renderPage();
    fireEvent.click(screensaverSwitch());

    fireEvent.click(screen.getByRole('button', { name: /Avvia dopo/ }));
    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.textContent?.trim())).toEqual([
      '1 minuto',
      '2 minuti',
      '5 minuti',
      '10 minuti',
      '15 minuti',
      '30 minuti',
    ]);
    fireEvent.click(screen.getByRole('option', { name: '1 minuto' }));

    await waitFor(() => expect(stored().timeoutMinutes).toBe(1));
    expect(screen.getByText('Attivo: compare dopo 1 minuto senza tocchi e sparisce al primo tocco.')).toBeTruthy();
  });

  it('switches between Minimal and Ambient, and the date on or off', () => {
    renderPage();
    fireEvent.click(screensaverSwitch());
    const modes = screen.getByRole('radiogroup', { name: 'Modalità' });

    fireEvent.click(within(modes).getByRole('radio', { name: 'Ambient' }));
    expect(stored().mode).toBe('ambient');
    expect(screen.getByText('Ora sullo sfondo di Domus, attenuato.')).toBeTruthy();

    fireEvent.click(screen.getByRole('switch', { name: 'Mostra data' }));
    expect(stored().showDate).toBe(false);
  });

  it('previews what is set, without saving or changing anything', () => {
    window.localStorage.setItem(
      SCREENSAVER_STORAGE_KEY,
      JSON.stringify({ version: 1, enabled: true, timeoutMinutes: 10, mode: 'ambient', showDate: false }),
    );
    const before = window.localStorage.getItem(SCREENSAVER_STORAGE_KEY);
    const previews: ScreensaverPreferences[] = [];
    const stop = onScreensaverPreviewRequest((preferences) => previews.push(preferences));
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Avvia anteprima' }));
    stop();

    expect(previews).toEqual([{ enabled: true, timeoutMinutes: 10, mode: 'ambient', showDate: false }]);
    expect(window.localStorage.getItem(SCREENSAVER_STORAGE_KEY)).toBe(before);
  });

  it('shows what was kept after a reload', () => {
    window.localStorage.setItem(
      SCREENSAVER_STORAGE_KEY,
      JSON.stringify({ version: 1, enabled: true, timeoutMinutes: 15, mode: 'ambient', showDate: false }),
    );
    renderPage();

    expect(screensaverSwitch().getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('button', { name: /Avvia dopo/ }).textContent).toContain('15 minuti');
    expect(within(screen.getByRole('radiogroup', { name: 'Modalità' })).getByRole('radio', { name: 'Ambient' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('switch', { name: 'Mostra data' }).getAttribute('aria-checked')).toBe('false');
  });

  it('says so when this browser cannot keep the choice', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('quota');
    };
    try {
      renderPage();
      act(() => {
        fireEvent.click(screensaverSwitch());
      });
      expect(screen.getByText(/Questo browser non conserva dati locali/)).toBeTruthy();
      expect(screensaverSwitch().getAttribute('aria-checked')).toBe('true');
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
