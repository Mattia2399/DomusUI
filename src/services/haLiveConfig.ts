/*
 * The saved Home Assistant connection of this browser and the key of its
 * sign-in tokens. On its own so the startup path (setup journey, runtime
 * mode) reads them without the rest of haLive, which loads with the
 * dashboard. haLive re-exports everything here.
 */

const STORAGE_KEY = 'ha-external-dashboard:ha-live:v1';
export const HASS_TOKENS_KEY = 'hass_auth_tokens';

export interface HaLiveConfig {
  url: string;
  token: string;
  rememberToken: boolean;
}

export const defaultHaLiveConfig: HaLiveConfig = {
  url: 'http://homeassistant.local:8123',
  token: '',
  rememberToken: false,
};

/** Whether this browser saved a connection at all (loadHaLiveConfig falls back to a default address). */
export function hasSavedHaLiveConfig() {
  return typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY) !== null;
}

export function loadHaLiveConfig(): HaLiveConfig {
  if (typeof window === 'undefined') {
    return defaultHaLiveConfig;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return defaultHaLiveConfig;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<HaLiveConfig>;
    return {
      url: parsed.url ?? defaultHaLiveConfig.url,
      token: parsed.token ?? '',
      rememberToken: parsed.rememberToken ?? false,
    };
  } catch {
    return defaultHaLiveConfig;
  }
}

export function saveHaLiveConfig(config: HaLiveConfig) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      url: config.url,
      token: config.rememberToken ? config.token : '',
      rememberToken: config.rememberToken,
    }),
  );
}

export function clearHaLiveConfigStorage() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
}
