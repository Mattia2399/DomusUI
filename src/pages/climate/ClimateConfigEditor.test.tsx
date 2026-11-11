import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider';
import { emptyClimateConfig, type ClimateCallApi } from '../../services/climateConfigClient';
import { ClimateConfigEditor } from './ClimateConfigEditor';

afterEach(cleanup);

describe('Climate execution safety configuration', () => {
  it('shows conservative defaults and explicit ownership and freshness controls', () => {
    const config = emptyClimateConfig();
    config.zones = [{ id: 'living', name: 'Soggiorno', areaId: null,
      reference: { primaryEntityId: 'sensor.living', fallbacks: [] }, endpointIds: ['ac'] }];
    config.endpoints = [{ id: 'ac', name: 'Split', kind: 'air_conditioner', zoneId: 'living',
      circuitId: null, roles: ['room_cooler'], entity: { primaryEntityId: 'climate.ac', relatedControls: [] },
      setpointKind: 'room_temperature' }];
    const callApi: ClimateCallApi = async <T,>() => config as T;
    render(<I18nProvider forcedLocale="it"><ClimateConfigEditor initialConfig={config} revision={1}
      callApi={callApi} states={{}} registry={[]} onSaved={() => {}} onCancel={() => {}} onReload={() => {}} /></I18nProvider>);
    const arm = screen.getByRole('checkbox', { name: 'Controllo fisico Domus' }) as HTMLInputElement;
    expect(arm.checked).toBe(false);
    expect(screen.getByText(/attivare questa opzione non invia comandi/)).toBeTruthy();
    fireEvent.click(arm);
    expect(arm.checked).toBe(true);
    const freshness = screen.getByRole('combobox', { name: 'Freschezza del sensore' }) as HTMLSelectElement;
    expect(freshness.value).toBe('none');
    fireEvent.change(freshness, { target: { value: 'max_age' } });
    expect((screen.getByRole('spinbutton', { name: 'Età massima (secondi)' }) as HTMLInputElement).value).toBe('300');
    fireEvent.click(screen.getByRole('button', { name: '2. Dispositivi e ruoli' }));
    fireEvent.click(screen.getByRole('button', { name: 'Split' }));
    const ownership = screen.getByRole('combobox', { name: 'Controllo da Domus' }) as HTMLSelectElement;
    expect(ownership.value).toBe('observe_only');
    fireEvent.change(ownership, { target: { value: 'domus_supervised' } });
    expect(ownership.value).toBe('domus_supervised');
    expect(screen.getByText(/richiesta manuale/)).toBeTruthy();
  });

  it('keeps an orphaned room ID in the selector until the user changes it', async () => {
    const config = emptyClimateConfig();
    config.zones = [{ id: 'day', name: 'Zona Giorno', areaId: 'old_room',
      reference: { primaryEntityId: 'sensor.control', fallbacks: [] }, endpointIds: [] }];
    const callApi: ClimateCallApi = async <T,>() => ({ status: 'available', rooms: [
      { id: 'new_room', name: 'Soggiorno', floorId: 'ground', floorName: 'Piano terra' },
    ] }) as T;
    render(<I18nProvider forcedLocale="it"><ClimateConfigEditor initialConfig={config} revision={1}
      callApi={callApi} states={{}} registry={[]} onSaved={() => {}} onCancel={() => {}} onReload={() => {}} /></I18nProvider>);
    const selector = screen.getByRole('combobox', { name: 'Stanza House' }) as HTMLSelectElement;
    await waitFor(() => expect(selector.options.length).toBe(3));
    expect(selector.value).toBe('old_room');
    expect(screen.getByRole('option', { name: 'Stanza non disponibile' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Piano terra · Soggiorno' })).toBeTruthy();
  });
});
