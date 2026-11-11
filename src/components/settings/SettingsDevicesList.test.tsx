import { cleanup, fireEvent, render as renderTestingLibrary, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import { buildDeviceHealthSnapshots } from './deviceHealthModel';
import { SettingsDeviceDetail, SettingsDevicesList } from './SettingsDevicesList';
import { demoSettingsHouseContext, projectSettingsDeviceRooms } from '../../services/settingsHouseContext';

const render = (ui: ReactElement) => renderTestingLibrary(ui, { wrapper: I18nProvider });

beforeEach(() => window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it'));
afterEach(() => {
  cleanup();
  window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
});

const states = {
  'light.kitchen': {
    state: 'on',
    rawAttributes: { friendly_name: 'Luce cucina' },
  },
  'sensor.kitchen_battery': {
    state: '18',
    numericValue: 18,
    unit: '%',
    rawAttributes: { device_class: 'battery', friendly_name: 'Batteria cucina' },
  },
  'light.sofa': { state: 'off', rawAttributes: { friendly_name: 'Luce divano' } },
  'sensor.phone_battery': { state: '80', unit: '%', rawAttributes: { device_class: 'battery', friendly_name: 'Batteria iPhone' } },
};

const entityRegistry = [
  { entityId: 'light.kitchen', deviceId: 'kitchen-light' },
  {
    entityId: 'sensor.kitchen_battery',
    deviceId: 'kitchen-light',
    deviceClass: 'battery',
    entityCategory: 'diagnostic',
  },
  { entityId: 'light.sofa', deviceId: 'sofa-light' },
  { entityId: 'sensor.phone_battery', deviceId: 'phone', platform: 'mobile_app', deviceClass: 'battery' },
];

const deviceRegistry = [
  { id: 'kitchen-light', nameByUser: 'Lampada cucina', manufacturer: 'Philips', model: 'LCT015', areaId: 'kitchen' },
  { id: 'sofa-light', name: 'Lampada divano', manufacturer: 'IKEA', areaId: 'living' },
  { id: 'phone', name: 'iPhone di Mattia', manufacturer: 'Apple', model: 'iPhone 15' },
];

const areas = [
  { area_id: 'kitchen', name: 'Cucina' },
  { area_id: 'living', name: 'Soggiorno' },
];
const houseContext = demoSettingsHouseContext(areas, deviceRegistry, entityRegistry);

const groupTitles = () =>
  screen.getAllByRole('region').map((section) => section.querySelector('h2')?.textContent);

describe('SettingsDevicesList', () => {
  it('puts devices that need a look first, then one group per room', () => {
    const onOpenDevice = vi.fn();
    render(
      <SettingsDevicesList
        connected
        haStates={states}
        entityRegistry={entityRegistry}
        deviceRegistry={deviceRegistry}
        areas={areas}
        houseContext={houseContext}
        onOpenDevice={onOpenDevice}
      />,
    );

    expect(groupTitles()).toEqual(['Da controllare', 'Soggiorno', 'Senza stanza']);
    const kitchen = screen.getByRole('button', { name: /Lampada cucina/ });
    expect(kitchen.textContent).toContain('Philips · LCT015');
    expect(kitchen.textContent).toContain('Batteria 18%');
    // A device that works well has nothing on the right.
    expect(screen.getByRole('button', { name: /Lampada divano/ }).textContent).not.toContain('Operativo');

    fireEvent.click(kitchen);
    expect(onOpenDevice).toHaveBeenCalledWith('kitchen-light');
  });

  it('filters with status chips that hide the empty ones', () => {
    render(
      <SettingsDevicesList
        connected
        haStates={states}
        entityRegistry={entityRegistry}
        deviceRegistry={deviceRegistry}
        areas={areas}
        houseContext={houseContext}
        onOpenDevice={vi.fn()}
      />,
    );

    const chips = within(screen.getByRole('group', { name: 'Stato dei dispositivi' }));
    expect(chips.queryByRole('button', { name: /Non raggiungibili/ })).toBeNull();
    fireEvent.click(chips.getByRole('button', { name: /Batteria scarica/ }));
    expect(screen.getByText('1 dispositivi')).toBeTruthy();
    expect(screen.queryByText('Lampada divano')).toBeNull();
    // A filtered list is grouped by room only.
    expect(groupTitles()).toEqual(['Cucina']);
  });

  it('shows the device status, entities and information in grouped lists', () => {
    const [kitchen] = projectSettingsDeviceRooms(buildDeviceHealthSnapshots({
      connected: true,
      states,
      entityRegistry,
      deviceRegistry: [deviceRegistry[0]],
      areas,
    }), houseContext);
    render(
      <SettingsDeviceDetail
        device={{ ...kitchen, swVersion: '1.104.2', dashboardWidgetCount: 2 }}
        onOpenUpdates={vi.fn()}
        haStates={states}
        entityRegistry={entityRegistry}
        deviceRegistry={deviceRegistry}
        areas={areas}
        houseContext={houseContext}
      />,
    );

    expect(groupTitles()).toEqual(['Stato', 'Da controllare', 'Entità', 'Informazioni']);
    expect(screen.getByRole('button', { name: /Luce cucina/ }).textContent).toContain('Acceso');
    // Diagnostic entities wait behind a button.
    expect(screen.queryByText('Batteria cucina')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Mostra 1 entità diagnostica' }));
    expect(screen.getByText('Batteria cucina')).toBeTruthy();
    expect(screen.getByText('1.104.2')).toBeTruthy();
    expect(screen.getByText('2 card')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Luce cucina/ }));
    expect(within(screen.getByRole('dialog')).getByText('light.kitchen')).toBeTruthy();
  });

  it('keeps firmware actions in the system update center', () => {
    const onOpenUpdates = vi.fn();
    render(
      <SettingsDeviceDetail
        device={{
          id: 'kitchen-light',
          name: 'Lampada cucina',
          status: 'warning',
          statusLabel: 'Da controllare',
          issues: [
            {
              code: 'update_available',
              label: 'Aggiornamento disponibile',
              detail: 'È disponibile un aggiornamento firmware.',
            },
          ],
          entities: [],
          entityCount: 0,
          unavailableEntityCount: 0,
          updateAvailable: true,
          updateEntityIds: ['update.kitchen'],
          dashboardWidgetCount: 0,
        }}
        onOpenUpdates={onOpenUpdates}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Apri Centro Aggiornamenti/ }));
    expect(onOpenUpdates).toHaveBeenCalledOnce();
  });
});
