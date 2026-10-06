import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from '../../i18n/I18nProvider';
import type { WasteCollectionCallApi, WasteCollectionDocument } from '../../services/wasteCollectionClient';
import WasteCollectionSettings from './WasteCollectionSettings';

const document: WasteCollectionDocument = {
  schema: 'domusos-waste-collection',
  version: 1,
  revision: 1,
  updatedAt: '2026-10-06T10:00:00Z',
  updatedByUserId: 'owner-1',
  wasteTypes: [
    { id: 'organic', name: 'Organico', icon: 'mdi:leaf', color: '#22c55e', aliases: [] },
    { id: 'paper', name: 'Carta', icon: 'mdi:package', color: '#3b82f6', aliases: [] },
  ],
  sources: [],
  mappings: [],
  exceptions: [],
  notifications: { enabled: false, time: '20:00', targets: [] },
};

beforeEach(() => {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'it');
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('WasteCollectionSettings', () => {
  it('renders separate rows in the seven-day preview and can add a fixed source', async () => {
    const callApi = vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === 'domusos/waste_collection/get_config') return document;
      if (message.type === 'domusos/waste_collection/preview') return {
        generatedAt: '2026-10-06T10:00:00Z',
        warnings: [],
        events: [
          { uid: 'domus-ui-waste:organic:2026-10-07', summary: 'Organico', start: '2026-10-07', end: '2026-10-08', all_day: true },
          { uid: 'domus-ui-waste:paper:2026-10-07', summary: 'Carta', start: '2026-10-07', end: '2026-10-08', all_day: true },
        ],
      };
      return document;
    }) as unknown as WasteCollectionCallApi;

    render(
      <I18nProvider>
        <WasteCollectionSettings callApi={callApi} connected canConfigure haStates={{}} />
      </I18nProvider>,
    );

    expect(await screen.findByText('Anteprima prossimi 7 giorni')).toBeTruthy();
    expect(screen.getByText('Organico')).toBeTruthy();
    expect(screen.getByText('Carta')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi calendario fisso' }));
    await waitFor(() => expect(screen.getByDisplayValue('Calendario fisso')).toBeTruthy());
  });

  it('keeps controls read-only for non administrators', async () => {
    const callApi = vi.fn(async (message: Record<string, unknown>) => typeof message.type === 'string' && message.type.endsWith('/preview')
      ? { generatedAt: '2026-10-06T10:00:00Z', warnings: [], events: [] }
      : document) as unknown as WasteCollectionCallApi;

    render(
      <I18nProvider>
        <WasteCollectionSettings callApi={callApi} connected canConfigure={false} haStates={{}} />
      </I18nProvider>,
    );

    expect(await screen.findByText(/Solo Owner e Admin/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Salva configurazione' })).toBeNull();
  });
});
