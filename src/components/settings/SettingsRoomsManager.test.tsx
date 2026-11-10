import { cleanup, fireEvent, render as renderTestingLibrary, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import SettingsRoomsManager from './SettingsRoomsManager';

const render = (ui: ReactElement) => renderTestingLibrary(ui, { wrapper: I18nProvider });

beforeEach(() => window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it'));
afterEach(() => {
  cleanup();
  window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
});

function home() {
  const state = {
    areas: [
      { area_id: 'soggiorno', name: 'Soggiorno', floor_id: 'terra', aliases: [], icon: 'mdi:sofa' },
      { area_id: 'camera', name: 'Camera', floor_id: 'primo', aliases: ['notte'] },
      { area_id: 'garage', name: 'Garage', floor_id: null, aliases: [] },
    ],
    floors: [
      { floor_id: 'terra', name: 'Piano terra', level: 0, aliases: [] },
      { floor_id: 'primo', name: 'Primo piano', level: 1, aliases: [] },
    ],
  };
  const callApi = vi.fn(async (message: Record<string, unknown>) => {
    switch (message.type) {
      case 'domusos/house/get_topology':
        return {
          schemaVersion: 'domusos.house.v1', topologyRevision: 1,
          topologyFingerprint: JSON.stringify(state), generatedAt: '2026-11-10T00:00:00Z',
          floors: state.floors.map((floor, order) => ({ id: floor.floor_id, name: floor.name, level: floor.level, aliases: floor.aliases, order })),
          rooms: state.areas.map((area) => ({ id: area.area_id, name: area.name, floorId: area.floor_id, aliases: area.aliases,
            icon: 'icon' in area ? area.icon : null, picture: null, temperatureEntityId: null, humidityEntityId: null })),
          devices: [{ id: 'tv', name: 'TV', areaId: 'soggiorno' }, { id: 'lamp', name: 'Lamp', areaId: 'soggiorno' }],
          entities: [], unassigned: { deviceIds: [], entityIds: [] }, issues: [],
        };
      case 'config/area_registry/create':
        state.areas.push({ area_id: 'studio', name: String(message.name), floor_id: String(message.floor_id ?? ''), aliases: message.aliases as string[] });
        return { ...state.areas.at(-1), floor_id: message.floor_id ?? null };
      case 'config/area_registry/update':
        state.areas = state.areas.map((area) => area.area_id === message.area_id ?
          { ...area, name: String(message.name), floor_id: String(message.floor_id ?? ''), aliases: message.aliases as string[] } : area);
        return { area_id: message.area_id, name: message.name, floor_id: message.floor_id, aliases: message.aliases };
      case 'config/floor_registry/update':
        state.floors = state.floors.map((floor) => floor.floor_id === message.floor_id ?
          { ...floor, name: String(message.name), level: message.level as number, aliases: message.aliases as string[] } : floor);
        return { floor_id: message.floor_id, name: message.name, level: message.level, aliases: message.aliases };
      case 'config/floor_registry/reorder':
        state.floors.sort((a, b) => (message.floor_ids as string[]).indexOf(a.floor_id) - (message.floor_ids as string[]).indexOf(b.floor_id));
        return {};
      case 'config/floor_registry/delete':
        state.floors = state.floors.filter((floor) => floor.floor_id !== message.floor_id);
        state.areas = state.areas.map((area) => area.floor_id === message.floor_id ? { ...area, floor_id: null } : area);
        return {};
      default:
        return null;
    }
  });
  return { state, callApi };
}

const groupTitles = () => screen.getAllByRole('region').map((section) => section.querySelector('h2')?.textContent);

function renderManager(overrides: Partial<Parameters<typeof SettingsRoomsManager>[0]> = {}) {
  const { callApi } = home();
  const onRoomsChanged = vi.fn();
  render(
    <SettingsRoomsManager
      callApi={callApi as never}
      connected
      canManage
      onRoomsChanged={onRoomsChanged}
      {...overrides}
    />,
  );
  return { callApi, onRoomsChanged };
}

describe('SettingsRoomsManager', () => {
  it('lists the rooms by floor in the Home Assistant order', async () => {
    renderManager();

    await waitFor(() => expect(groupTitles()).toEqual(['Piano terra', 'Primo piano', 'Senza piano', 'Gestione']));
    expect(screen.getByRole('button', { name: /Soggiorno/ }).textContent).toContain('2 dispositivi');
    expect(screen.getByRole('button', { name: /Garage/ }).textContent).toContain('Nessun dispositivo');
  });

  it('creates a room on a floor and tells the rest of the app', async () => {
    const { callApi, onRoomsChanged } = renderManager();
    await screen.findByText('Piano terra');

    const groundFloor = within(screen.getByRole('region', { name: 'Piano terra' }));
    fireEvent.click(groundFloor.getByRole('button', { name: 'Aggiungi stanza' }));
    const sheet = within(screen.getByRole('dialog'));
    fireEvent.change(sheet.getByLabelText('Nome'), { target: { value: '  Studio ' } });
    fireEvent.change(sheet.getByLabelText('Nomi alternativi'), { target: { value: 'ufficio, studio, ufficio' } });
    fireEvent.click(sheet.getByRole('button', { name: 'Crea' }));

    await waitFor(() =>
      expect(callApi).toHaveBeenCalledWith(
        { type: 'config/area_registry/create', name: 'Studio', floor_id: 'terra', aliases: ['ufficio', 'studio'] },
        { reportError: false, throwOnError: true },
      ),
    );
    expect(await within(screen.getByRole('region', { name: 'Piano terra' })).findByText('Studio')).toBeTruthy();
    expect(onRoomsChanged).toHaveBeenCalled();
    expect(onRoomsChanged.mock.lastCall?.[0]).toEqual(
      expect.arrayContaining([expect.objectContaining({ area_id: 'studio', floor_id: 'terra' })]),
    );
  });

  it('renames a room and moves it to another floor', async () => {
    const { callApi } = renderManager();
    fireEvent.click(await screen.findByRole('button', { name: /Garage/ }));
    const sheet = within(screen.getByRole('dialog'));
    fireEvent.change(sheet.getByLabelText('Nome'), { target: { value: 'Box auto' } });
    fireEvent.click(sheet.getByRole('button', { name: 'Piano' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Piano terra' }));
    fireEvent.click(sheet.getByRole('button', { name: 'Salva' }));

    await waitFor(() =>
      expect(callApi).toHaveBeenCalledWith(
        { type: 'config/area_registry/update', area_id: 'garage', name: 'Box auto', floor_id: 'terra', aliases: [] },
        { reportError: false, throwOnError: true },
      ),
    );
    expect(await within(screen.getByRole('region', { name: 'Piano terra' })).findByText('Box auto')).toBeTruthy();
  });

  it('asks before deleting and keeps the rooms of a deleted floor', async () => {
    const { callApi } = renderManager();
    fireEvent.click(await screen.findByRole('button', { name: 'Modifica il piano Primo piano' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Elimina piano' }));

    expect(screen.getByRole('heading', { name: 'Eliminare Primo piano?' })).toBeTruthy();
    expect(callApi).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'config/floor_registry/delete' }), expect.anything());
    fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));

    await waitFor(() =>
      expect(callApi).toHaveBeenCalledWith({ type: 'config/floor_registry/delete', floor_id: 'primo' }, { reportError: false, throwOnError: true }),
    );
    await waitFor(() => expect(groupTitles()).toEqual(['Piano terra', 'Senza piano', 'Gestione']));
    expect(within(screen.getByRole('region', { name: 'Senza piano' })).getByText('Camera')).toBeTruthy();
  });

  it('reorders the floors', async () => {
    const { callApi } = renderManager();
    fireEvent.click(await screen.findByRole('button', { name: 'Modifica il piano Primo piano' }));
    const sheet = within(screen.getByRole('dialog'));
    expect(sheet.getByRole('button', { name: /Sposta giù/ }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(sheet.getByRole('button', { name: /Sposta su/ }));

    await waitFor(() =>
      expect(callApi).toHaveBeenCalledWith(
        { type: 'config/floor_registry/reorder', floor_ids: ['primo', 'terra'] },
        { reportError: false, throwOnError: true },
      ),
    );
    fireEvent.click(sheet.getByRole('button', { name: 'Annulla' }));
    await waitFor(() => expect(groupTitles().slice(0, 2)).toEqual(['Primo piano', 'Piano terra']));
  });

  it('shows Home Assistant refusing a change without losing the form', async () => {
    const { callApi } = home();
    const failing = vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === 'config/area_registry/update') throw new Error('name_in_use');
      return callApi(message);
    });
    renderManager({ callApi: failing as never });
    fireEvent.click(await screen.findByRole('button', { name: /Garage/ }));
    const sheet = within(screen.getByRole('dialog'));
    fireEvent.change(sheet.getByLabelText('Nome'), { target: { value: 'Soggiorno' } });
    fireEvent.click(sheet.getByRole('button', { name: 'Salva' }));

    expect(await sheet.findByText('Home Assistant non ha salvato la modifica.')).toBeTruthy();
    expect((sheet.getByLabelText('Nome') as HTMLInputElement).value).toBe('Soggiorno');
  });

  it('is read-only for someone who cannot manage rooms', async () => {
    renderManager({ canManage: false });

    expect(await screen.findByText('Solo un amministratore può modificare piani e stanze.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Aggiungi stanza/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Modifica il piano/ })).toBeNull();
  });
});
