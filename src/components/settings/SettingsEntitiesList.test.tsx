import { cleanup, fireEvent, render as renderTestingLibrary, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import SettingsEntitiesList from './SettingsEntitiesList';
import type { SettingsHouseContext } from '../../services/settingsHouseContext';

const context = (rooms: SettingsHouseContext['rooms'], entities: SettingsHouseContext['entities']): SettingsHouseContext => ({
  schemaVersion: 'domusos.system.house.v1', topologyRevision: 1, rooms, entities, devices: [],
});

const render = (ui: ReactElement) => renderTestingLibrary(ui, { wrapper: I18nProvider });

afterEach(() => {
  cleanup();
  window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
});

const states = {
  'light.cucina': {
    state: 'on',
    rawAttributes: { friendly_name: 'Luce cucina' },
  },
  'sensor.temperatura': {
    state: '21.5',
    unit: '°C',
    rawAttributes: { friendly_name: 'Temperatura' },
  },
  'lock.porta': {
    state: 'unavailable',
    rawAttributes: { friendly_name: 'Porta ingresso' },
  },
};

const group = (name: string) => within(screen.getByRole('region', { name }));

describe('SettingsEntitiesList', () => {
  beforeEach(() => window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it'));

  it('groups the entities by type with their state in words', () => {
    render(<SettingsEntitiesList haStates={states} />);

    const groups = screen.getAllByRole('region').map((section) => section.querySelector('h2')?.textContent);
    expect(groups).toEqual(['Luci', 'Serrature', 'Sensori']);
    expect(group('Luci').getByRole('button', { name: /Luce cucina/ }).textContent).toContain('Acceso');
    expect(group('Sensori').getByRole('button', { name: /Temperatura/ }).textContent).toContain('21,5 °C');
    expect(group('Serrature').getByRole('button', { name: /Porta ingresso/ }).textContent).toContain('Non disponibile');
    // The technical id is in the detail, not in the list.
    expect(screen.queryByText('light.cucina')).toBeNull();
  });

  it('uses the words Home Assistant uses for the states', async () => {
    const loadStateTranslations = vi.fn(async () => ({
      'component.light.entity_component._.state.on': 'Accesa',
      'component.binary_sensor.entity_component.door.state.on': 'Aperta',
      'component.hue.entity.sensor.scene_mode.state.relax': 'Rilassante',
    }));
    render(
      <SettingsEntitiesList
        haStates={{
          ...states,
          'binary_sensor.portone': { state: 'on', rawAttributes: { friendly_name: 'Portone', device_class: 'door' } },
          'sensor.hue_scene': { state: 'relax', rawAttributes: { friendly_name: 'Scena Hue' } },
        }}
        entityRegistry={[{ entityId: 'sensor.hue_scene', platform: 'hue', translationKey: 'scene_mode' }]}
        loadStateTranslations={loadStateTranslations}
      />,
    );

    expect(loadStateTranslations).toHaveBeenCalledWith('it');
    await waitFor(() => expect(screen.getByRole('button', { name: /Luce cucina/ }).textContent).toContain('Accesa'));
    expect(screen.getByRole('button', { name: /Portone/ }).textContent).toContain('Aperta');
    expect(screen.getByRole('button', { name: /Scena Hue/ }).textContent).toContain('Rilassante');
  });

  it('filters by type with the chips and by text with the search field', () => {
    render(<SettingsEntitiesList haStates={states} />);

    const chips = within(screen.getByRole('group', { name: 'Tipi di entità' }));
    fireEvent.click(chips.getByRole('button', { name: /Sensori/ }));
    expect(screen.getAllByRole('region').map((section) => section.querySelector('h2')?.textContent)).toEqual(['Sensori']);
    fireEvent.click(chips.getByRole('button', { name: /Tutte/ }));

    fireEvent.change(screen.getByPlaceholderText('Cerca per nome, ID o stato'), {
      target: { value: 'temperatura' },
    });
    expect(screen.getByText('Temperatura')).toBeTruthy();
    expect(screen.queryByText('Luce cucina')).toBeNull();
    expect(screen.getByText('1 entità')).toBeTruthy();
  });

  it('keeps disabled entities in their own group, closed at first', () => {
    render(
      <SettingsEntitiesList
        haStates={states}
        entityRegistry={[{ entityId: 'switch.irrigazione', name: 'Irrigazione', disabledBy: 'user', areaId: 'giardino' }]}
        areas={[{ area_id: 'giardino', name: 'Giardino' }]}
        houseContext={context([{ id: 'giardino', name: 'Giardino' }], [
          { registryId: null, entityId: 'switch.irrigazione', effectiveRoomId: 'giardino' },
        ])}
      />,
    );

    expect(screen.queryByText('Irrigazione')).toBeNull();
    expect(screen.getByText('4 entità')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mostra 1 entità disattivata' }));
    const disabled = group('Disattivate').getByRole('button', { name: /Irrigazione/ });
    expect(disabled.textContent).toContain('Disabilitata');
    expect(disabled.textContent).toContain('Giardino');
  });

  it('opens a read-only detail with the device and the copyable id', async () => {
    const onOpenDevice = vi.fn();
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(
      <SettingsEntitiesList
        haStates={{
          'light.cucina': {
            state: 'on',
            rawAttributes: { friendly_name: 'Luce cucina', brightness: 180, __last_changed: new Date(Date.now() - 7_200_000).toISOString() },
          },
        }}
        entityRegistry={[{ entityId: 'light.cucina', deviceId: 'd1', platform: 'hue' }]}
        deviceRegistry={[{ id: 'd1', name: 'Hue cucina', areaId: 'cucina' }]}
        areas={[{ area_id: 'cucina', name: 'Cucina' }]}
        houseContext={context([{ id: 'cucina', name: 'Cucina' }], [
          { registryId: null, entityId: 'light.cucina', effectiveRoomId: 'cucina' },
        ])}
        onOpenDevice={onOpenDevice}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Luce cucina/ }));
    const detail = within(screen.getByRole('dialog'));
    expect(detail.getByText('light.cucina')).toBeTruthy();
    expect(detail.getByText('2 ore fa')).toBeTruthy();
    expect(detail.getByText('Cucina')).toBeTruthy();
    expect(detail.getByText('Hue')).toBeTruthy();
    // Attributes are for developers only.
    expect(detail.queryByText('brightness')).toBeNull();

    fireEvent.click(detail.getByRole('button', { name: 'Copia' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('light.cucina'));
    expect(detail.getByRole('button', { name: 'Copiato' })).toBeTruthy();

    fireEvent.click(detail.getByRole('button', { name: /Dispositivo/ }));
    expect(onOpenDevice).toHaveBeenCalledWith('d1');
  });

  it('shows the raw attributes in Developer Mode', () => {
    render(
      <SettingsEntitiesList
        haStates={{ 'light.cucina': { state: 'on', rawAttributes: { friendly_name: 'Luce cucina', brightness: 180 } } }}
        developerMode
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Luce cucina/ }));
    const detail = within(screen.getByRole('dialog'));
    expect(detail.getByText('brightness')).toBeTruthy();
    expect(detail.getByText('180')).toBeTruthy();
  });

  it('localizes filters, types and states in English', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
    render(<SettingsEntitiesList haStates={states} />);

    expect(screen.getByPlaceholderText('Search by name, ID, or status')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Lights' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Temperatura/ }).textContent).toContain('21.5 °C');
    expect(screen.getByRole('button', { name: /Porta ingresso/ }).textContent).toContain('Unavailable');
  });

  it('localizes filters, types and states in French', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'fr');
    render(<SettingsEntitiesList haStates={states} />);

    expect(screen.getByPlaceholderText('Rechercher par nom, ID ou état')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Lumières' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Luce cucina/ }).textContent).toContain('Allumé');
  });
});
