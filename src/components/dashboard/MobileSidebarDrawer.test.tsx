import { cleanup, fireEvent, render as renderTestingLibrary, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import { MobileSidebarDrawer } from './MobileSidebarDrawer';
import { SIDEBAR_QUICK_CARD_STORAGE_KEY } from './sidebarQuickCard';

const { energyState } = vi.hoisted(() => ({
  energyState: {
    configured: true,
    home_consumption: { status: 'ok', value: 1800, unit: 'W' },
    modules: {
      solar: { quantities: { production_power: { status: 'ok', value: 1200, unit: 'W' } } },
      grid: { quantities: { net_power: { status: 'ok', value: 600, unit: 'W' } } },
    },
  },
}));
vi.mock('../../services/energyCoreClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/energyCoreClient')>()),
  getEnergyState: vi.fn(async () => energyState),
}));

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

const quickCard = () => screen.getByRole('region', { name: /Cose da controllare|Allarme|Luci accese|Scenari|Energia ora|Raccolta rifiuti/ });

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

  it('shows the rooms with a light on and turns them off after the confirmation', () => {
    window.localStorage.setItem(SIDEBAR_QUICK_CARD_STORAGE_KEY, 'lights');
    const { onCallService } = renderDrawer({
      entityRegistry: [
        { entityId: 'light.cucina', areaId: 'kitchen' },
        { entityId: 'light.soggiorno', deviceId: 'lamp' },
      ],
      deviceRegistry: [{ id: 'lamp', areaId: 'living' }],
      areas: [{ area_id: 'kitchen', name: 'Cucina' }, { area_id: 'living', name: 'Soggiorno' }] as never,
    });

    const card = quickCard();
    expect(card.textContent).toContain('2luci accese');
    expect(within(card).getByText('in 2 stanze')).toBeTruthy();
    expect(within(card).getByText('Cucina')).toBeTruthy();
    expect(within(card).getByText('Soggiorno')).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: 'Spegni tutte' }));
    expect(within(quickCard()).getByText('Spegnere tutte le luci?')).toBeTruthy();
    expect(onCallService).not.toHaveBeenCalled();
    fireEvent.click(within(quickCard()).getByRole('button', { name: 'Spegni' }));

    expect(onCallService).toHaveBeenCalledWith('light', 'turn_off', { entity_id: ['light.cucina', 'light.soggiorno'] });
  });

  it('runs a scene of the Home scenes card', () => {
    window.localStorage.setItem(SIDEBAR_QUICK_CARD_STORAGE_KEY, 'scenes');
    const onRunScene = vi.fn();
    renderDrawer({ scenes: [{ id: 'night', label: 'Notte', icon: null }, { id: 'movie', label: 'Cinema', icon: null }], onRunScene });

    fireEvent.click(within(quickCard()).getByRole('button', { name: 'Avvia Notte' }));
    expect(onRunScene).toHaveBeenCalledWith('night');
  });

  it('shows the energy now from the energy core', async () => {
    window.localStorage.setItem(SIDEBAR_QUICK_CARD_STORAGE_KEY, 'energy');
    renderDrawer({ energyCallApi: vi.fn() as never });

    expect(await within(quickCard()).findByText('67% dal sole')).toBeTruthy();
    expect(within(quickCard()).getByText('1,8')).toBeTruthy();
    expect(within(quickCard()).getByText('1,2 kW')).toBeTruthy();
    expect(within(quickCard()).getByText('600 W')).toBeTruthy();
  });

  it('previews every quick card in the gallery and marks the one in use', () => {
    renderDrawer();

    fireEvent.click(screen.getByRole('button', { name: 'Cambia la scheda rapida' }));
    const gallery = screen.getByRole('dialog', { name: 'Scheda rapida' });
    expect(within(gallery).getByRole('button', { name: 'Cose da controllare' }).getAttribute('aria-pressed')).toBe('true');
    for (const name of ['Luci accese', 'Scenari', 'Allarme', 'Energia ora', 'Raccolta rifiuti', 'Nessuna scheda']) {
      expect(within(gallery).getByRole('button', { name })).toBeTruthy();
    }
  });

  it('shows the next waste collection', () => {
    window.localStorage.setItem(SIDEBAR_QUICK_CARD_STORAGE_KEY, 'waste');
    renderDrawer();

    expect(within(quickCard()).getByText('Carta e Organico')).toBeTruthy();
    expect(within(quickCard()).getByText('Domani')).toBeTruthy();
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
