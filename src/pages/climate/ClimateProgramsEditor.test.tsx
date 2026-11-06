import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider';
import { emptyClimateConfig, type ClimateCallApi, type ClimateConfigResponse } from '../../services/climateConfigClient';
import { ClimateProgramsEditor } from './ClimateProgramsEditor';

const base = () => {
  const config = emptyClimateConfig();
  config.zones = [{ id: 'living', name: 'Soggiorno', areaId: null, reference: { primaryEntityId: 'sensor.living', fallbacks: [] }, endpointIds: [] }];
  return config;
};

function setup({ canManage = true, error }: { canManage?: boolean; error?: string } = {}) {
  const config = base();
  const messages: Record<string, unknown>[] = [];
  const callApi: ClimateCallApi = async <T,>(message: Record<string, unknown>) => {
    messages.push(message);
    if (error) throw { code: error };
    return { state: 'ready', revision: 2, config: message.config } as T;
  };
  const onSaved = vi.fn<(response: ClimateConfigResponse) => void>();
  const onReload = vi.fn();
  const onDirtyChange = vi.fn();
  render(<I18nProvider forcedLocale="it"><ClimateProgramsEditor config={config} revision={1} callApi={callApi} canManage={canManage} onSaved={onSaved} onReload={onReload} onDirtyChange={onDirtyChange} /></I18nProvider>);
  return { messages, onSaved, onReload, onDirtyChange };
}

afterEach(() => { cleanup(); });

describe('Climate programs editor', () => {
  it('shows empty and read-only states without mutation controls', () => {
    setup({ canManage: false });
    expect(screen.getByText('Crea il tuo primo profilo')).toBeTruthy();
    expect(screen.getByText('Nessuna programmazione')).toBeTruthy();
    expect(screen.getByText(/Solo un amministratore/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Crea profilo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Salva programmazione' })).toBeNull();
  });

  it('edits profiles and events in a draft, blocks deleting a used profile, copies days and saves atomically', async () => {
    const { messages, onSaved } = setup();
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome nuovo profilo' }), { target: { value: 'Comfort' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crea profilo' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome profilo' }), { target: { value: 'Casa' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Soggiorno' }), { target: { value: '21' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi fascia' }));
    expect(screen.getByText('06:30')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Elimina profilo' }));
    expect(screen.getByRole('alert').textContent).toMatch(/Profilo usato/);
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi fascia' }));
    expect(screen.getByRole('alert').textContent).toMatch(/esiste già un evento/);
    fireEvent.click(screen.getByRole('button', { name: 'Modifica' }));
    fireEvent.change(screen.getByLabelText('Ora'), { target: { value: '07:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Applica' }));
    expect(screen.getByText('07:00')).toBeTruthy();
    const copySection = screen.getByText('Copia giorno', { selector: 'h5' }).parentElement!;
    fireEvent.click(within(copySection).getByRole('checkbox', { name: 'Mar' }));
    fireEvent.click(within(copySection).getByRole('button', { name: 'Copia giorno' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salva programmazione' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe('domusos/climate/save_config');
    expect(messages[0].expected_revision).toBe(1);
    const saved = messages[0].config as ReturnType<typeof base>;
    expect(saved.profiles[0]).toEqual({ id: expect.stringMatching(/^profile_/), name: 'Casa', zoneTargets: { living: 21 } });
    expect(saved.schedules.map((day) => day.day)).toEqual(['monday', 'tuesday']);
    expect(saved.schedules[1].events).toEqual([{ time: '07:00', profileId: saved.profiles[0].id }]);
  });

  it('discards unsaved changes and reports revision conflicts or access denial', async () => {
    const { messages } = setup({ error: 'conflict' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome nuovo profilo' }), { target: { value: 'Eco' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crea profilo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Annulla modifiche' }));
    expect(screen.getByText('Crea il tuo primo profilo')).toBeTruthy();
    expect(messages).toHaveLength(0);
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome nuovo profilo' }), { target: { value: 'Eco' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crea profilo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salva programmazione' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/configurazione è cambiata/));
    expect(screen.getByRole('button', { name: 'Ricarica' })).toBeTruthy();
  });

  it('shows a permission error after a denied save', async () => {
    setup({ error: 'access_denied' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome nuovo profilo' }), { target: { value: 'Eco' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crea profilo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salva programmazione' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/permesso/));
  });
});
