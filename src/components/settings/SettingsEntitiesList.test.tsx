import { cleanup, fireEvent, render as renderTestingLibrary, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import SettingsEntitiesList from './SettingsEntitiesList';

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

describe('SettingsEntitiesList', () => {
  beforeEach(() => window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it'));
  it('shows every Home Assistant entity with its identifier and state', () => {
    render(<SettingsEntitiesList haStates={states} />);

    expect(screen.getByText('Luce cucina')).toBeTruthy();
    expect(screen.getByText('light.cucina')).toBeTruthy();
    expect(screen.getByText('21.5 °C')).toBeTruthy();
    expect(screen.getByText('Non disponibile')).toBeTruthy();
  });

  it('filters entities using the search field', () => {
    render(<SettingsEntitiesList haStates={states} />);

    fireEvent.change(screen.getByPlaceholderText('Cerca per nome, ID o stato'), {
      target: { value: 'temperatura' },
    });

    expect(screen.getByText('Temperatura')).toBeTruthy();
    expect(screen.queryByText('Luce cucina')).toBeNull();
    expect(screen.getByText('1 entità')).toBeTruthy();
  });

  it('includes registry entities without a live state', () => {
    render(
      <SettingsEntitiesList
        haStates={states}
        entityRegistry={[
          {
            entityId: 'switch.irrigazione',
            name: 'Irrigazione',
            disabledBy: 'user',
            areaId: 'giardino',
          },
        ]}
        areas={[{ area_id: 'giardino', name: 'Giardino' }]}
      />,
    );

    expect(screen.getByText('Irrigazione')).toBeTruthy();
    expect(screen.getByText('switch.irrigazione')).toBeTruthy();
    expect(screen.getByText('Disabilitata')).toBeTruthy();
    expect(screen.getByText('Interruttori · Giardino')).toBeTruthy();
    expect(screen.getByText('4 entità')).toBeTruthy();
  });

  it('localizes filters and Home Assistant domains in English', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
    render(<SettingsEntitiesList haStates={states} />);

    expect(screen.getByPlaceholderText('Search by name, ID, or status')).toBeTruthy();
    expect(screen.getByText('Lights')).toBeTruthy();
    expect(screen.getByText('Unavailable')).toBeTruthy();
  });

  it('localizes filters and Home Assistant domains in French', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'fr');
    render(<SettingsEntitiesList haStates={states} />);

    expect(screen.getByPlaceholderText('Rechercher par nom, ID ou état')).toBeTruthy();
    expect(screen.getByText('Lumières')).toBeTruthy();
    expect(screen.getByText('Indisponible')).toBeTruthy();
  });
});
