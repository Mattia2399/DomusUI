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
  version: 2,
  revision: 2,
  updatedAt: '2026-10-06T10:00:00Z',
  updatedByUserId: 'owner-1',
  wasteTypes: [{ id: 'organic', name: 'Organico', icon: 'mdi:leaf', color: '#22c55e', aliases: [] }],
  sources: [],
  mappings: [],
  exceptions: [],
  notifications: { enabled: false, time: '20:00', mode: 'recipients', recipients: ['p-mattia'], legacyTargetCount: 2 },
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

  it('never sends technical targets back, only the mode and the people', async () => {
    const callApi = vi.fn(async () => ({ ...document, revision: 3 })) as unknown as WasteCollectionCallApi & ReturnType<typeof vi.fn>;

    await saveWasteCollectionConfig(callApi, document);

    const sent = (callApi.mock.calls[0][0] as { config: { notifications: unknown } }).config.notifications;
    expect(sent).toEqual({ enabled: false, time: '20:00', mode: 'recipients', recipients: ['p-mattia'] });
  });

  it('refuses a version 1 answer or notification settings it does not understand', async () => {
    for (const bad of [
      { ...document, version: 1 },
      { ...document, notifications: { enabled: true, time: '20:00', targets: ['notify.x'] } },
      { ...document, notifications: { ...document.notifications, mode: 'everyone' } },
    ]) {
      const callApi = vi.fn(async () => bad) as unknown as WasteCollectionCallApi;
      await expect(getWasteCollectionConfig(callApi)).rejects.toThrow(/non valida/i);
    }
  });

  it('rejects malformed server documents', async () => {
    const callApi = vi.fn(async () => ({ version: 1 })) as unknown as WasteCollectionCallApi;
    await expect(getWasteCollectionConfig(callApi)).rejects.toThrow(/non valida/i);
  });
});
