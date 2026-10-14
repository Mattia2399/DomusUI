import { cleanup, fireEvent, render as renderTestingLibrary, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import { MobileSidebarDrawer } from './MobileSidebarDrawer';
import { SIDEBAR_QUICK_CARD_STORAGE_KEY } from './sidebarQuickCard';

const render = (ui: ReactElement) => renderTestingLibrary(ui, { wrapper: I18nProvider });

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
});
afterEach(() => cleanup());

const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
tomorrow.setHours(7, 0, 0, 0);
const pad = (value: number) => String(value).padStart(2, '0');
const tomorrowText = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())} 07:00:00`;

const states = {
  'light.soggiorno': { state: 'on', rawAttributes: { friendly_name: 'Luce soggiorno' } },
  'light.cucina': { state: 'on', rawAttributes: { friendly_name: 'Luce cucina' } },
  'light.bagno': { state: 'off', rawAttributes: { friendly_name: 'Luce bagno' } },
  'update.core': { state: 'on', rawAttributes: { friendly_name: 'Core' } },
  'update.os': { state: 'off', rawAttributes: { friendly_name: 'OS' } },
  'alarm_control_panel.casa': { state: 'armed_away', rawAttributes: { friendly_name: 'Allarme casa' } },
  'calendar.raccolta': {
    state: 'off',
    rawAttributes: { friendly_name: 'Raccolta', domus_waste_types: [], message: 'Carta e Organico', start_time: tomorrowText },
  },
};

function renderDrawer(overrides: Partial<Parameters<typeof MobileSidebarDrawer>[0]> = {}) {
  const handlers = {
    onPathClick: vi.fn(),
    onToggleEditMode: vi.fn(),
    onOpenProfile: vi.fn(),
    onOpenSettings: vi.fn(),
    onDisconnectHomeAssistant: vi.fn(),
    onClose: vi.fn(),
    onNavigate: vi.fn(),
    onCallService: vi.fn(async () => true),
  };
  render(
    <MobileSidebarDrawer
      isOpen
      isEditMode={false}
      canToggleEditMode={false}
      quickPaths={[]}
      activeRoute="/home"
      userAvatarAlt="Mattia"
      userRole="creator"
      haStatus="connected"
      states={states}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

const quickCard = () => screen.getByRole('region', { name: /Cose da controllare|Allarme|Luci accese|Raccolta rifiuti/ });

describe('MobileSidebarDrawer', () => {
  it('shows the profile on top, the home sections as tiles and the actions with counts', () => {
    renderDrawer({ areas: [{ area_id: 'living', name: 'Soggiorno' }, { area_id: 'kitchen', name: 'Cucina' }] as never });

    expect(screen.getByRole('button', { name: 'Apri profilo' }).textContent).toContain('Creatore · HA online');
    const home = screen.getByRole('region', { name: 'Casa' });
    expect(within(home).getByRole('button', { name: /^Dashboard/ }).getAttribute('aria-current')).toBe('page');
    expect(within(home).getByRole('button', { name: /^Stanze/ }).textContent).toContain('2 stanze');
    expect(within(home).getByRole('button', { name: /^Sicurezza/ }).textContent).toContain('Tutto a posto');
    expect(screen.getByRole('button', { name: /Impostazioni/ }).textContent).toContain('1 aggiornamenti disponibili');
    // Edit mode only where a page can be edited.
    expect(screen.queryByRole('button', { name: /Modalità modifica/ })).toBeNull();
  });

  it('marks edit mode as a pressed toggle where the page can be edited', () => {
    const { onToggleEditMode, onClose } = renderDrawer({ canToggleEditMode: true });

    const edit = screen.getByRole('button', { name: 'Modalità modifica' });
    expect(edit.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(edit);
    expect(onToggleEditMode).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows the things to check by default and remembers another quick card', () => {
    renderDrawer();

    expect(within(quickCard()).getByText('Tutto a posto')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cambia la scheda rapida' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Scheda rapida' })).getByRole('button', { name: 'Allarme' }));

    expect(window.localStorage.getItem(SIDEBAR_QUICK_CARD_STORAGE_KEY)).toBe('alarm');
    expect(within(quickCard()).getByText('Inserito fuori casa')).toBeTruthy();
    fireEvent.click(within(quickCard()).getByRole('button', { name: 'Apri' }));
  });

  it('turns off the lights that are on, after the confirmation', () => {
    window.localStorage.setItem(SIDEBAR_QUICK_CARD_STORAGE_KEY, 'lights');
    const { onCallService } = renderDrawer();

    expect(within(quickCard()).getByText('2 luci accese')).toBeTruthy();
    fireEvent.click(within(quickCard()).getByRole('button', { name: 'Spegni tutte' }));
    expect(screen.getByRole('heading', { name: 'Spegnere tutte le luci?' })).toBeTruthy();
    expect(onCallService).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Spegni' }));

    expect(onCallService).toHaveBeenCalledWith('light', 'turn_off', { entity_id: ['light.cucina', 'light.soggiorno'] });
  });

  it('shows the next waste collection', () => {
    window.localStorage.setItem(SIDEBAR_QUICK_CARD_STORAGE_KEY, 'waste');
    renderDrawer();

    expect(within(quickCard()).getByText('Carta e Organico')).toBeTruthy();
    expect(within(quickCard()).getByText('Prossima raccolta · Domani')).toBeTruthy();
  });

  it('can hide the quick card', () => {
    window.localStorage.setItem(SIDEBAR_QUICK_CARD_STORAGE_KEY, 'none');
    renderDrawer();

    expect(screen.queryByRole('region', { name: /Cose da controllare/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Aggiungi una scheda rapida' })).toBeTruthy();
  });

  it('asks before signing out', () => {
    const { onDisconnectHomeAssistant } = renderDrawer();

    fireEvent.click(screen.getByRole('button', { name: 'Esci' }));
    expect(screen.getByRole('heading', { name: 'Disconnettere Home Assistant?' })).toBeTruthy();
    expect(onDisconnectHomeAssistant).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getAllByRole('dialog').at(-1)!).getByRole('button', { name: 'Esci' }));
    expect(onDisconnectHomeAssistant).toHaveBeenCalledOnce();
  });
});
