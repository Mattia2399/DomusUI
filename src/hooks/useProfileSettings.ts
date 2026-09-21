import { useEffect, useState } from 'react';
import { loadHaLiveConfig, saveHaLiveConfig } from '../services/haLive';
import {
  DASHBOARD_BACKGROUND_PRESETS,
  normalizeDashboardBackground,
  resolveDashboardThemePreferences,
  type DashboardAppearance,
  type DashboardAppearanceMode,
  type DashboardBackgroundPreset,
} from '../theme/dashboardTheme';
import {
  createDefaultSidebarPaths,
  getApplicationRoute,
  sanitizeSidebarQuickPaths,
  SIDEBAR_PATH_ICON_KEYS,
  type SidebarQuickPath,
  type SidebarQuickPathCustomization,
} from '../navigation/applicationRoutes';
import {
  DEFAULT_CARD_SIZING_ENGINE,
  readStoredCardSizingEngine,
  writeStoredCardSizingEngine,
  type CardSizingEngine,
} from '../services/cardSizingEngine';

export {
  DASHBOARD_BACKGROUND_PRESETS,
  type DashboardAppearance,
  type DashboardAppearanceMode,
  type DashboardBackgroundPreset,
} from '../theme/dashboardTheme';
export {
  APPLICATION_ROUTE_IDS,
  APPLICATION_ROUTE_REGISTRY,
  SIDEBAR_PATH_ICON_KEYS,
  type ApplicationRouteId,
  type SidebarQuickPath,
  type SidebarQuickPathCustomization,
  type SidebarQuickPathIconKey,
} from '../navigation/applicationRoutes';

/** @deprecated Prefer DashboardAppearance. Kept while legacy consumers migrate. */
export type DashboardTheme = DashboardAppearance;
/** @deprecated Prefer DashboardAppearanceMode. Kept while legacy consumers migrate. */
export type DashboardThemeMode = DashboardAppearanceMode;

export const DASHBOARD_WALLPAPER_PRESETS = DASHBOARD_BACKGROUND_PRESETS;
/** @deprecated Prefer DashboardBackgroundPreset. Kept while legacy consumers migrate. */
export type DashboardWallpaperPreset = DashboardBackgroundPreset;
const THEME_STORAGE_KEY = 'ha.dashboard.theme';
const BACKGROUND_STORAGE_KEY = 'ha.dashboard.background';
const LEGACY_WALLPAPER_STORAGE_KEY = 'ha.dashboard.wallpaper';
const SIDEBAR_PATHS_STORAGE_KEY = 'ha.dashboard.sidebarPaths';
const DEVELOPER_MODE_STORAGE_KEY = 'ha.dashboard.developerMode';

function resolveSystemTheme(): DashboardAppearance {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark';
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function resolveThemeMode(mode: DashboardAppearanceMode): DashboardAppearance {
  return mode === 'auto' ? resolveSystemTheme() : mode;
}

function readStoredThemePreferences() {
  if (typeof window === 'undefined') {
    return resolveDashboardThemePreferences(null, null);
  }
  return resolveDashboardThemePreferences(
    window.localStorage.getItem(THEME_STORAGE_KEY),
    window.localStorage.getItem(BACKGROUND_STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_WALLPAPER_STORAGE_KEY),
  );
}

function readStoredDeveloperMode(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const stored = window.localStorage.getItem(DEVELOPER_MODE_STORAGE_KEY);
  return stored === '1' || stored === 'true';
}

function readInitialCardSizingEngine(): CardSizingEngine {
  if (typeof window === 'undefined') {
    return DEFAULT_CARD_SIZING_ENGINE;
  }
  return readStoredCardSizingEngine(window.localStorage);
}

function readStoredSidebarPaths(): SidebarQuickPath[] {
  if (typeof window === 'undefined') {
    return createDefaultSidebarPaths();
  }

  const raw = window.localStorage.getItem(SIDEBAR_PATHS_STORAGE_KEY);
  if (!raw) {
    return createDefaultSidebarPaths();
  }

  try {
    return sanitizeSidebarQuickPaths(JSON.parse(raw));
  } catch {
    return createDefaultSidebarPaths();
  }
}

export function useProfileSettings() {
  const initialHaConfig = loadHaLiveConfig();
  const [initialThemePreferences] = useState(readStoredThemePreferences);
  const [appearanceMode, setAppearanceModeState] = useState<DashboardAppearanceMode>(initialThemePreferences.appearanceMode);
  const [appearance, setAppearanceState] = useState<DashboardAppearance>(() => resolveThemeMode(initialThemePreferences.appearanceMode));
  const [background, setBackgroundState] = useState<DashboardBackgroundPreset>(initialThemePreferences.background);
  const [developerMode, setDeveloperModeState] = useState<boolean>(readStoredDeveloperMode);
  const [cardSizingEngine, setCardSizingEngineState] = useState<CardSizingEngine>(readInitialCardSizingEngine);
  const [haUrl, setHaUrlState] = useState<string>(initialHaConfig.url);
  const [haToken, setHaTokenState] = useState<string>(initialHaConfig.token);
  const [haRememberToken, setHaRememberTokenState] = useState<boolean>(initialHaConfig.rememberToken);
  const [sidebarPaths, setSidebarPathsState] = useState<SidebarQuickPath[]>(readStoredSidebarPaths);

  const setAppearanceMode = (next: DashboardAppearanceMode) => {
    setAppearanceModeState(next);
    setAppearanceState(resolveThemeMode(next));
  };

  const setBackground = (next: DashboardBackgroundPreset) => {
    const normalized = normalizeDashboardBackground(next);
    if (normalized) {
      setBackgroundState(normalized);
    }
  };

  const setDeveloperMode = (next: boolean) => {
    setDeveloperModeState(Boolean(next));
  };

  const setCardSizingEngine = (next: CardSizingEngine) => {
    setCardSizingEngineState(next === 'legacy' ? 'legacy' : 'adaptive');
  };

  const setHaToken = (next: string) => {
    setHaTokenState(next);
  };

  const setHaUrl = (next: string) => {
    setHaUrlState(next);
  };

  const setHaRememberToken = (next: boolean) => {
    setHaRememberTokenState(next);
  };

  const updateSidebarPath = (id: string, patch: SidebarQuickPathCustomization) => {
    setSidebarPathsState((current) =>
      current.map((entry) => {
        if (entry.id !== id) {
          return entry;
        }
        return {
          ...entry,
          label:
            patch.label === undefined
              ? entry.label
              : patch.label.trim().length > 0
                ? patch.label.trim()
                : entry.label,
          path: entry.path,
          icon:
            patch.icon === undefined ||
            !(SIDEBAR_PATH_ICON_KEYS as readonly string[]).includes(patch.icon)
              ? entry.icon
              : patch.icon,
        };
      }),
    );
  };

  const removeSidebarPath = (id: string) => {
    setSidebarPathsState((current) => {
      const next = current.filter((entry) => entry.id !== id);
      if (next.length > 0) {
        return next;
      }
      return [getApplicationRoute('home')];
    });
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(THEME_STORAGE_KEY, appearanceMode);
  }, [appearanceMode]);

  useEffect(() => {
    if (appearanceMode !== 'auto' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    const updateSystemTheme = () => setAppearanceState(mediaQuery.matches ? 'light' : 'dark');

    updateSystemTheme();
    mediaQuery.addEventListener('change', updateSystemTheme);
    return () => mediaQuery.removeEventListener('change', updateSystemTheme);
  }, [appearanceMode]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(BACKGROUND_STORAGE_KEY, background);
    window.localStorage.removeItem(LEGACY_WALLPAPER_STORAGE_KEY);
  }, [background]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    const root = document.documentElement;
    root.classList.toggle('dashboard-theme-light', appearance === 'light');
    root.classList.toggle('dashboard-theme-dark', appearance === 'dark');
    root.dataset.dashboardAppearance = appearance;
    root.style.colorScheme = appearance;
  }, [appearance]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(DEVELOPER_MODE_STORAGE_KEY, developerMode ? '1' : '0');
  }, [developerMode]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    writeStoredCardSizingEngine(cardSizingEngine, window.localStorage);
  }, [cardSizingEngine]);

  useEffect(() => {
    saveHaLiveConfig({
      url: haUrl,
      token: haToken,
      rememberToken: haRememberToken,
    });
  }, [haRememberToken, haToken, haUrl]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(SIDEBAR_PATHS_STORAGE_KEY, JSON.stringify(sidebarPaths));
  }, [sidebarPaths]);

  return {
    appearance,
    appearanceMode,
    setAppearanceMode,
    background,
    setBackground,
    developerMode,
    setDeveloperMode,
    cardSizingEngine,
    setCardSizingEngine,
    haUrl,
    setHaUrl,
    haToken,
    setHaToken,
    haRememberToken,
    setHaRememberToken,
    sidebarPaths,
    updateSidebarPath,
    removeSidebarPath,
  };
}
