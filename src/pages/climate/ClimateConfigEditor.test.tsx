import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
      callApi={callApi} areas={[]} states={{}} registry={[]} onSaved={() => {}} onCancel={() => {}} onReload={() => {}} /></I18nProvider>);
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
    expect(screen.getByText(/Oggi non invia comandi/)).toBeTruthy();
  });
});
