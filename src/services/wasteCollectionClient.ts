export const WASTE_COLLECTION_TYPES = {
  getConfig: 'domusos/waste_collection/get_config',
  saveConfig: 'domusos/waste_collection/save_config',
  preview: 'domusos/waste_collection/preview',
  testNotification: 'domusos/waste_collection/test_notification',
} as const;

export const WASTE_CALENDAR_UID_PREFIX = 'domus-ui-waste:';

export type WasteType = {
  id: string;
  name: string;
  icon: string;
  color: string;
  aliases: string[];
};

export type WasteFixedRule = {
  id: string;
  wasteTypeId: string;
  enabled: boolean;
  weekdays: string[];
  intervalWeeks: number;
  anchorDate: string;
  startDate: string;
  endDate: string;
};

export type WasteSource = {
  id: string;
  kind: 'fixed' | 'calendar';
  name: string;
  enabled: boolean;
  entityIds: string[];
  rules: WasteFixedRule[];
};

export type WasteMapping = {
  id: string;
  sourceId: string;
  match: string;
  wasteTypeId: string;
};

export type WasteException = {
  id: string;
  date: string;
  wasteTypeId: string;
  action: 'add' | 'skip';
};

export type WasteCollectionDocument = {
  schema: 'domusos-waste-collection';
  version: 1;
  revision: number;
  updatedAt: string;
  updatedByUserId: string;
  wasteTypes: WasteType[];
  sources: WasteSource[];
  mappings: WasteMapping[];
  exceptions: WasteException[];
  notifications: {
    enabled: boolean;
    time: string;
    targets: string[];
  };
};

export type WastePreviewEvent = {
  uid: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  all_day: boolean;
};

export type WasteCollectionPreview = {
  events: WastePreviewEvent[];
  warnings: string[];
  generatedAt: string;
};

export type WasteNotificationResult = {
  sent: string[];
  failed: Array<{ target: string; error: string }>;
};

export type WasteCollectionCallApi = <T = unknown>(
  message: Record<string, unknown>,
  options?: { reportError?: boolean; throwOnError?: boolean },
) => Promise<T | null>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isWasteCollectionDocument(value: unknown): value is WasteCollectionDocument {
  return isRecord(value) && value.schema === 'domusos-waste-collection' && value.version === 1 &&
    Number.isInteger(value.revision) && Array.isArray(value.wasteTypes) &&
    Array.isArray(value.sources) && Array.isArray(value.mappings) &&
    Array.isArray(value.exceptions) && isRecord(value.notifications);
}

export function isWasteCollectionPreview(value: unknown): value is WasteCollectionPreview {
  return isRecord(value) && Array.isArray(value.events) && Array.isArray(value.warnings) &&
    typeof value.generatedAt === 'string';
}

export async function getWasteCollectionConfig(callApi: WasteCollectionCallApi) {
  const result = await callApi<WasteCollectionDocument>(
    { type: WASTE_COLLECTION_TYPES.getConfig },
    { reportError: false, throwOnError: true },
  );
  if (!isWasteCollectionDocument(result)) {
    throw new Error('Risposta raccolta rifiuti non valida.');
  }
  return result;
}

export async function saveWasteCollectionConfig(
  callApi: WasteCollectionCallApi,
  document: WasteCollectionDocument,
) {
  const result = await callApi<WasteCollectionDocument>(
    {
      type: WASTE_COLLECTION_TYPES.saveConfig,
      config: {
        wasteTypes: document.wasteTypes,
        sources: document.sources,
        mappings: document.mappings,
        exceptions: document.exceptions,
        notifications: document.notifications,
      },
      expected_revision: document.revision,
    },
    { reportError: false, throwOnError: true },
  );
  if (!isWasteCollectionDocument(result)) {
    throw new Error('Salvataggio raccolta rifiuti non confermato.');
  }
  return result;
}

export async function getWasteCollectionPreview(
  callApi: WasteCollectionCallApi,
  days = 7,
) {
  const result = await callApi<WasteCollectionPreview>(
    { type: WASTE_COLLECTION_TYPES.preview, days },
    { reportError: false, throwOnError: true },
  );
  if (!isWasteCollectionPreview(result)) {
    throw new Error('Anteprima raccolta rifiuti non valida.');
  }
  return result;
}

export async function testWasteCollectionNotification(callApi: WasteCollectionCallApi) {
  const result = await callApi<WasteNotificationResult>(
    { type: WASTE_COLLECTION_TYPES.testNotification },
    { reportError: false, throwOnError: true },
  );
  if (!isRecord(result) || !Array.isArray(result.sent) || !Array.isArray(result.failed)) {
    throw new Error('Test notifica non confermato.');
  }
  return result as WasteNotificationResult;
}
