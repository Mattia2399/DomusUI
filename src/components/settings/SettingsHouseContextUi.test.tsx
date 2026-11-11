import { cleanup, fireEvent, render as renderTestingLibrary, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import type { SettingsHouseContext } from '../../services/settingsHouseContext';
import { projectSettingsDeviceRooms } from '../../services/settingsHouseContext';
import SettingsEntitiesList from './SettingsEntitiesList';
import { SettingsDevicesList } from './SettingsDevicesList';
import { buildDeviceHealthSnapshots } from './deviceHealthModel';

beforeEach(() => window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it'));
afterEach(() => { cleanup(); window.localStorage.removeItem(LANGUAGE_STORAGE_KEY); });

const rooms = [{ id: 'a', name: 'Camera' }, { id: 'b', name: 'Camera' }];
const context = (entityRoom: string | null, deviceRoom: string | null = 'a'): SettingsHouseContext => ({
  schemaVersion: 'domusos.system.house.v1', topologyRevision: 1, rooms,
  devices: [{ id: 'd1', roomId: deviceRoom }, { id: 'empty', roomId: null }],
  entities: [
    { registryId: 'stable', entityId: 'light.renamed', effectiveRoomId: entityRoom },
    { registryId: 'disabled', entityId: 'sensor.disabled', effectiveRoomId: null },
  ],
});

const inventory = [
  { registryId: 'stable', entityId: 'light.renamed', deviceId: 'd1', areaId: 'ha-wrong', name: 'Lampada' },
  { registryId: 'disabled', entityId: 'sensor.disabled', disabledBy: 'user', name: 'Disattivata' },
  { registryId: 'hidden', entityId: 'sensor.hidden', hiddenBy: 'user', name: 'Nascosta' },
  { registryId: 'diagnostic', entityId: 'sensor.diagnostic', entityCategory: 'diagnostic', name: 'Diagnostica' },
];
const devices = [{ id: 'd1', name: 'Lampada', areaId: 'ha-wrong' }, { id: 'empty', name: 'Vuoto', areaId: 'ha-wrong' }];
const haAreas = [{ area_id: 'ha-wrong', name: 'Etichetta HA errata' }];
const render = (ui: React.ReactElement) => renderTestingLibrary(ui, { wrapper: I18nProvider });

describe('Settings room context read authority', () => {
  it('keeps administrative entities while House confirms override, inheritance, rename and delete', () => {
    const props = { haStates: { 'sensor.runtime': { state: '42' } }, entityRegistry: inventory,
      deviceRegistry: devices, areas: haAreas };
    const view = render(<SettingsEntitiesList {...props} houseContext={context('a')} />);
    expect(screen.getByRole('button', { name: /Lampada/ }).textContent).toContain('Camera');
    expect(screen.getByRole('button', { name: /Nascosta/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Diagnostica/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Runtime/ })).toBeTruthy();
    expect(screen.queryByText('Etichetta HA errata')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Mostra 1/ }));
    expect(screen.getByRole('button', { name: /Disattivata/ })).toBeTruthy();

    // HA has already written B, but the UI waits for the House projection.
    view.rerender(<SettingsEntitiesList {...props} houseContext={context('a')} />);
    expect(screen.getByRole('button', { name: /Lampada/ }).textContent).toContain('Camera');
    const renamed = { ...context('b'), rooms: [{ id: 'a', name: 'Camera' }, { id: 'b', name: 'Studio nuovo' }] };
    view.rerender(<SettingsEntitiesList {...props} houseContext={renamed} />);
    expect(screen.getByRole('button', { name: /Lampada/ }).textContent).toContain('Studio nuovo');
    view.rerender(<SettingsEntitiesList {...props} houseContext={context('a')} />);
    expect(screen.getByRole('button', { name: /Lampada/ }).textContent).toContain('Camera');
    view.rerender(<SettingsEntitiesList {...props} houseContext={{ ...context('b'), rooms: [{ id: 'a', name: 'Camera' }] }} />);
    expect(screen.getByRole('button', { name: /Lampada/ }).textContent).not.toContain('Studio nuovo');
  });

  it('preserves device inventory and health while House owns room move and absence', () => {
    const base = { connected: true, states: {}, entityRegistry: inventory, deviceRegistry: devices, areas: haAreas };
    const first = projectSettingsDeviceRooms(buildDeviceHealthSnapshots(base), context('a'));
    const moved = projectSettingsDeviceRooms(buildDeviceHealthSnapshots(base), context('b', 'b'));
    expect(first).toHaveLength(2);
    expect(first.find((item) => item.id === 'empty')).toMatchObject({ areaId: undefined, status: 'unknown' });
    expect(moved.find((item) => item.id === 'd1')).toMatchObject({ areaId: 'b', areaName: 'Camera' });
    expect(moved.find((item) => item.id === 'd1')?.status).toBe(first.find((item) => item.id === 'd1')?.status);
    const unavailable = projectSettingsDeviceRooms(buildDeviceHealthSnapshots(base), null);
    expect(unavailable).toHaveLength(2);
    expect(unavailable[0]).toMatchObject({ areaId: undefined, roomContextUnavailable: true });

    render(<SettingsDevicesList connected haStates={{}} entityRegistry={inventory}
      deviceRegistry={devices} areas={haAreas} houseContext={null} onOpenDevice={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Vuoto/ })).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Non disponibile' })).getByRole('button', { name: /Vuoto/ })).toBeTruthy();
    expect(screen.queryByText('Etichetta HA errata')).toBeNull();
  });
});
