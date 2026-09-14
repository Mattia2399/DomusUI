export const DOMUS_UI_PANEL_PATH = 'domusos';
export const HA_FRONTEND_CORE_USER_DATA_KEY = 'core';
export const PREVIOUS_DEFAULT_PANEL_STORAGE_PREFIX = 'domusui.previous-default-panel.v1';

export type HaFrontendPreferencesCallApi = <T = unknown>(
  message: Record<string, unknown>,
  options?: { reportError?: boolean; throwOnError?: boolean },
) => Promise<T | null>;

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type HaDefaultPanelState = {
  defaultPanel: string | null;
  isDomusUiDefault: boolean;
};

export type HaDefaultPanelMutationResult = HaDefaultPanelState & {
  restoredPanel: string | null;
  usedSystemDefault: boolean;
};

export class HaFrontendPreferencesError extends Error {
  constructor(
    public readonly code:
      | 'missing-user'
      | 'read-failed'
      | 'invalid-read'
      | 'write-failed'
      | 'write-unconfirmed',
    message: string,
  ) {
    super(message);
    this.name = 'HaFrontendPreferencesError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeUserId(userId: string): string {
  const normalized = userId.trim();
  if (!normalized) {
    throw new HaFrontendPreferencesError('missing-user', 'Home Assistant user identity is unavailable.');
  }
  return normalized;
}

export function isValidPanelPath(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,127}$/i.test(value.trim());
}

export function getPreviousDefaultPanelStorageKey(userId: string): string {
  return `${PREVIOUS_DEFAULT_PANEL_STORAGE_PREFIX}:${encodeURIComponent(normalizeUserId(userId))}`;
}

export function readPreviousDefaultPanel(storage: StorageLike, userId: string): string | null {
  const candidate = storage.getItem(getPreviousDefaultPanelStorageKey(userId));
  return isValidPanelPath(candidate) ? candidate.trim() : null;
}

async function readCorePreferences(
  callApi: HaFrontendPreferencesCallApi,
): Promise<Record<string, unknown>> {
  let response: unknown;
  try {
    response = await callApi(
      { type: 'frontend/get_user_data', key: HA_FRONTEND_CORE_USER_DATA_KEY },
      { reportError: false, throwOnError: true },
    );
  } catch (error) {
    throw new HaFrontendPreferencesError(
      'read-failed',
      error instanceof Error ? error.message : 'Unable to read Home Assistant frontend preferences.',
    );
  }

  if (!isRecord(response) || !Object.prototype.hasOwnProperty.call(response, 'value')) {
    throw new HaFrontendPreferencesError('invalid-read', 'Home Assistant returned an invalid preferences response.');
  }
  if (response.value === null || response.value === undefined) {
    return {};
  }
  if (!isRecord(response.value)) {
    throw new HaFrontendPreferencesError('invalid-read', 'Home Assistant returned invalid core preferences.');
  }
  return { ...response.value };
}

function resolveDefaultPanel(preferences: Record<string, unknown>): string | null {
  return isValidPanelPath(preferences.default_panel) ? preferences.default_panel.trim() : null;
}

export async function getHaDefaultPanelState(
  callApi: HaFrontendPreferencesCallApi,
): Promise<HaDefaultPanelState> {
  const preferences = await readCorePreferences(callApi);
  const defaultPanel = resolveDefaultPanel(preferences);
  return {
    defaultPanel,
    isDomusUiDefault: defaultPanel === DOMUS_UI_PANEL_PATH,
  };
}

async function writeAndVerify(
  callApi: HaFrontendPreferencesCallApi,
  preferences: Record<string, unknown>,
  expectedPanel: string | null,
): Promise<HaDefaultPanelState> {
  try {
    await callApi(
      {
        type: 'frontend/set_user_data',
        key: HA_FRONTEND_CORE_USER_DATA_KEY,
        value: preferences,
      },
      { reportError: false, throwOnError: true },
    );
  } catch (error) {
    throw new HaFrontendPreferencesError(
      'write-failed',
      error instanceof Error ? error.message : 'Unable to save Home Assistant frontend preferences.',
    );
  }

  const confirmed = await getHaDefaultPanelState(callApi);
  if (confirmed.defaultPanel !== expectedPanel) {
    throw new HaFrontendPreferencesError(
      'write-unconfirmed',
      'Home Assistant did not confirm the startup panel preference.',
    );
  }
  return confirmed;
}

export async function enableDomusUiAsDefaultPanel({
  callApi,
  storage,
  userId,
}: {
  callApi: HaFrontendPreferencesCallApi;
  storage: StorageLike;
  userId: string;
}): Promise<HaDefaultPanelMutationResult> {
  const normalizedUserId = normalizeUserId(userId);
  const preferences = await readCorePreferences(callApi);
  const currentPanel = resolveDefaultPanel(preferences);

  if (currentPanel === DOMUS_UI_PANEL_PATH) {
    return { defaultPanel: currentPanel, isDomusUiDefault: true, restoredPanel: null, usedSystemDefault: false };
  }

  if (currentPanel) {
    storage.setItem(getPreviousDefaultPanelStorageKey(normalizedUserId), currentPanel);
  } else {
    storage.removeItem(getPreviousDefaultPanelStorageKey(normalizedUserId));
  }

  const confirmed = await writeAndVerify(
    callApi,
    { ...preferences, default_panel: DOMUS_UI_PANEL_PATH },
    DOMUS_UI_PANEL_PATH,
  );
  return { ...confirmed, restoredPanel: null, usedSystemDefault: false };
}

async function getAvailablePanelPaths(callApi: HaFrontendPreferencesCallApi): Promise<Set<string> | null> {
  try {
    const response = await callApi<unknown>(
      { type: 'get_panels' },
      { reportError: false, throwOnError: true },
    );
    if (!isRecord(response)) return null;
    return new Set(Object.keys(response).filter(isValidPanelPath));
  } catch {
    return null;
  }
}

export async function disableDomusUiAsDefaultPanel({
  callApi,
  storage,
  userId,
}: {
  callApi: HaFrontendPreferencesCallApi;
  storage: StorageLike;
  userId: string;
}): Promise<HaDefaultPanelMutationResult> {
  const normalizedUserId = normalizeUserId(userId);
  const storageKey = getPreviousDefaultPanelStorageKey(normalizedUserId);
  const preferences = await readCorePreferences(callApi);
  const currentPanel = resolveDefaultPanel(preferences);

  if (currentPanel !== DOMUS_UI_PANEL_PATH) {
    return { defaultPanel: currentPanel, isDomusUiDefault: false, restoredPanel: null, usedSystemDefault: false };
  }

  const previousPanel = readPreviousDefaultPanel(storage, normalizedUserId);
  const availablePanels = previousPanel ? await getAvailablePanelPaths(callApi) : null;
  const canRestorePrevious = Boolean(previousPanel && availablePanels?.has(previousPanel));
  const nextPreferences = { ...preferences };
  let expectedPanel: string | null = null;

  if (canRestorePrevious && previousPanel) {
    nextPreferences.default_panel = previousPanel;
    expectedPanel = previousPanel;
  } else {
    delete nextPreferences.default_panel;
  }

  const confirmed = await writeAndVerify(callApi, nextPreferences, expectedPanel);
  storage.removeItem(storageKey);
  return {
    ...confirmed,
    restoredPanel: expectedPanel,
    usedSystemDefault: expectedPanel === null,
  };
}
