export type DashboardAppearance = 'dark' | 'light';
export type DashboardAppearanceMode = DashboardAppearance | 'auto';

export const DASHBOARD_BACKGROUND_PRESETS = [
  { id: 'neutral', label: 'Neutro', description: 'Segue automaticamente Chiaro e Scuro' },
  { id: 'home-hub', label: 'Home Hub', description: 'Glow oro su base premium' },
  { id: 'ocean-mist', label: 'Ocean Mist', description: 'Freddo azzurro con riflessi' },
  { id: 'sunset-amber', label: 'Sunset Amber', description: 'Caldo tramonto morbido' },
  { id: 'forest-glass', label: 'Forest Glass', description: 'Toni naturali e profondi' },
  { id: 'dynamic', label: 'Dinamico', description: 'Si adatta alla stanza e allo stato dell’allarme' },
] as const;

export type DashboardBackgroundPreset = (typeof DASHBOARD_BACKGROUND_PRESETS)[number]['id'];
export type LegacyDashboardBackgroundPreset = 'total-white' | 'total-black';

const DASHBOARD_BACKGROUND_IDS = new Set<string>(DASHBOARD_BACKGROUND_PRESETS.map((preset) => preset.id));

export function normalizeDashboardBackground(value: unknown): DashboardBackgroundPreset | null {
  return typeof value === 'string' && DASHBOARD_BACKGROUND_IDS.has(value)
    ? (value as DashboardBackgroundPreset)
    : null;
}

export function normalizeDashboardAppearanceMode(value: unknown): DashboardAppearanceMode {
  return value === 'auto' || value === 'light' || value === 'dark' ? value : 'auto';
}

export type DashboardThemePreferences = {
  appearanceMode: DashboardAppearanceMode;
  background: DashboardBackgroundPreset;
  migratedLegacyBackground: boolean;
};

/**
 * Converts the former Total White/Total Black wallpapers into the two-axis
 * model. An explicit Light/Dark selection remains authoritative; Auto adopts
 * the appearance that the removed wallpaper used to imply.
 */
export function resolveDashboardThemePreferences(
  storedAppearance: unknown,
  storedBackground: unknown,
): DashboardThemePreferences {
  const normalizedAppearance = normalizeDashboardAppearanceMode(storedAppearance);
  const legacyBackground = storedBackground === 'total-white' || storedBackground === 'total-black'
    ? storedBackground
    : null;

  if (legacyBackground) {
    return {
      appearanceMode:
        normalizedAppearance === 'light' || normalizedAppearance === 'dark'
          ? normalizedAppearance
          : legacyBackground === 'total-white'
            ? 'light'
            : 'dark',
      background: 'neutral',
      migratedLegacyBackground: true,
    };
  }

  return {
    appearanceMode: normalizedAppearance,
    background: normalizeDashboardBackground(storedBackground) ?? 'neutral',
    migratedLegacyBackground: false,
  };
}
