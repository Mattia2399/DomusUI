import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import { AccessControlProvider } from '../../security/AccessControlProvider';
import { accessFor } from '../../test/accessFixtures';
import { readNavigationBar, writeNavigationBar } from '../../navigation/navigationBarPreferences';
import { NavigationBarSettingsPage } from './NavigationBarSettingsPage';

beforeEach(() => window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it'));
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function renderPage(role: Parameters<typeof accessFor>[0] = 'admin') {
  const onBack = vi.fn();
  render(
    <I18nProvider>
      <AccessControlProvider access={accessFor(role)}>
        <NavigationBarSettingsPage onBack={onBack} />
      </AccessControlProvider>
    </I18nProvider>,
  );
  return { onBack };
}

const inBar = () => screen.getByRole('region', { name: 'Nella barra' });
const toAdd = () => screen.getByRole('region', { name: 'Da aggiungere' });

describe('NavigationBarSettingsPage', () => {
  it('shows Dashboard first and Profilo last, locked, and the recommended entries between them', () => {
    const { onBack } = renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Barra di navigazione' })).toBeTruthy();
    const rows = within(inBar()).getAllByText(/^(Dashboard|Stanze|Casa|Profilo)$/).map((node) => node.textContent);
    expect(rows).toEqual(['Dashboard', 'Stanze', 'Casa', 'Profilo']);
    expect(within(inBar()).queryByRole('button', { name: /Dashboard|Profilo/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Indietro' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('adds, moves and removes entries, saving them on this device', () => {
    renderPage();
    fireEvent.click(within(toAdd()).getByRole('button', { name: 'Aggiungi Sicurezza' }));
    expect(readNavigationBar()).toEqual(['rooms', 'casa', 'security']);
    fireEvent.click(within(inBar()).getByRole('button', { name: 'Sposta su Sicurezza' }));
    expect(readNavigationBar()).toEqual(['rooms', 'security', 'casa']);
    fireEvent.click(within(inBar()).getByRole('button', { name: 'Togli Stanze' }));
    expect(readNavigationBar()).toEqual(['security', 'casa']);
  });

  it('says which entries the phone does not show, and stops at 7', () => {
    writeNavigationBar(['rooms', 'casa', 'security', 'consumi', 'automation', 'appgallery']);
    renderPage();
    expect(within(inBar()).getAllByText('Solo nella barra laterale')).toHaveLength(3);
    expect(within(toAdd()).queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText('Tutte le voci che puoi aprire sono già nella barra.')).toBeTruthy();
  });

  it('offers only what the role may open', () => {
    renderPage('restricted');
    expect(within(toAdd()).queryByRole('button', { name: /Sicurezza|Consumi|Automazioni/ })).toBeNull();
    expect(within(toAdd()).getByRole('button', { name: 'Aggiungi App Gallery' })).toBeTruthy();
  });

  it('goes back to the recommended bar', () => {
    writeNavigationBar(['security']);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Ripristina quella consigliata' }));
    expect(readNavigationBar()).toEqual(['rooms', 'casa']);
  });

  it('shows a preview of the bar as it looks today, out of reach', () => {
    renderPage();
    const preview = screen.getByTestId('bottom-bar-preview');
    expect(preview.hasAttribute('inert')).toBe(true);
    expect(preview.className).not.toContain('fixed');
  });
});
