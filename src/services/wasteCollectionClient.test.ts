import { describe, expect, it, vi } from 'vitest';
import {
  WASTE_COLLECTION_TYPES,
  getWasteCollectionConfig,
  getWasteCollectionPreview,
  saveWasteCollectionConfig,
  type WasteCollectionCallApi,
  type WasteCollectionDocument,
} from './wasteCollectionClient';

const document: WasteCollectionDocument = {
  schema: 'domusos-waste-collection',
  version: 1,
  revision: 2,
  updatedAt: '2026-10-06T10:00:00Z',
  updatedByUserId: 'owner-1',
  wasteTypes: [{ id: 'organic', name: 'Organico', icon: 'mdi:leaf', color: '#22c55e', aliases: [] }],
  sources: [],
  mappings: [],
  exceptions: [],
  notifications: { enabled: false, time: '20:00', targets: [] },
};

describe('wasteCollectionClient', () => {
  it('loads and saves the server-owned document with optimistic revision', async () => {
    const callApi = vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === WASTE_COLLECTION_TYPES.getConfig) return document;
      return { ...document, revision: 3 };
    }) as unknown as WasteCollectionCallApi;

    expect(await getWasteCollectionConfig(callApi)).toEqual(document);
    expect((await saveWasteCollectionConfig(callApi, document)).revision).toBe(3);
    expect(callApi).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: WASTE_COLLECTION_TYPES.saveConfig,
        expected_revision: 2,
      }),
      { reportError: false, throwOnError: true },
    );
  });

  it('keeps separate preview rows for multiple waste types on the same day', async () => {
    const callApi = vi.fn(async () => ({
      generatedAt: '2026-10-06T10:00:00Z',
      warnings: [],
      events: [
        { uid: 'domus-ui-waste:organic:2026-10-07', summary: 'Organico', start: '2026-10-07', end: '2026-10-08', all_day: true },
        { uid: 'domus-ui-waste:paper:2026-10-07', summary: 'Carta', start: '2026-10-07', end: '2026-10-08', all_day: true },
      ],
    })) as unknown as WasteCollectionCallApi;

    const preview = await getWasteCollectionPreview(callApi);
    expect(preview.events.map((event) => event.summary)).toEqual(['Organico', 'Carta']);
  });

  it('rejects malformed server documents', async () => {
    const callApi = vi.fn(async () => ({ version: 1 })) as unknown as WasteCollectionCallApi;
    await expect(getWasteCollectionConfig(callApi)).rejects.toThrow(/non valida/i);
  });
});
