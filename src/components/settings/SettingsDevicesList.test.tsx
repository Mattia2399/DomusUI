import { fireEvent, render as renderTestingLibrary, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import { SettingsDeviceDetail, SettingsDevicesList } from './SettingsDevicesList';

const render = (ui: ReactElement) => renderTestingLibrary(ui, { wrapper: I18nProvider });

beforeEach(() => window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it'));
afterEach(() => window.localStorage.removeItem(LANGUAGE_STORAGE_KEY));

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
};

const entityRegistry = [
  { entityId: 'light.kitchen', deviceId: 'kitchen-light' },
  {
    entityId: 'sensor.kitchen_battery',
    deviceId: 'kitchen-light',
    deviceClass: 'battery',
    entityCategory: 'diagnostic',
  },
];

const deviceRegistry = [
  {
    id: 'kitchen-light',
    nameByUser: 'Lampada cucina',
    manufacturer: 'Philips',
    areaId: 'kitchen',
  },
];

describe('SettingsDevicesList', () => {
  it('shows health-aware devices and opens the selected detail', () => {
    const onOpenDevice = vi.fn();
    render(
      <SettingsDevicesList
        connected
        haStates={states}
        entityRegistry={entityRegistry}
        deviceRegistry={deviceRegistry}
        areas={[{ area_id: 'kitchen', name: 'Cucina' }]}
        onOpenDevice={onOpenDevice}
      />,
    );

    expect(screen.getByText('Lampada cucina')).toBeTruthy();
    expect(screen.getAllByText('Da controllare').length).toBeGreaterThan(0);
    expect(screen.getByText('Batteria 18%')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Lampada cucina/ }));
    expect(onOpenDevice).toHaveBeenCalledWith('kitchen-light');
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

    fireEvent.click(screen.getByRole('button', { name: 'Apri Centro Aggiornamenti' }));
    expect(onOpenUpdates).toHaveBeenCalledOnce();
  });
});
