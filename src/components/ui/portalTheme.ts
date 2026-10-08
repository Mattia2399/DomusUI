const DASHBOARD_THEME_CLASSES = ['dashboard-theme-light', 'dashboard-theme-dark'] as const;
const THEME_SELECTOR = DASHBOARD_THEME_CLASSES.map((name) => `.${name}`).join(', ');

export type DashboardThemeClass = (typeof DASHBOARD_THEME_CLASSES)[number];

/**
 * Portalled overlays render under <body>, outside the element that carries the
 * dashboard theme, so they would otherwise follow the OS color scheme. This
 * returns the theme class of the closest themed ancestor of `element`.
 */
export function resolveDashboardThemeClass(element: Element | null | undefined): DashboardThemeClass | undefined {
  const host = element?.closest(THEME_SELECTOR);
  return DASHBOARD_THEME_CLASSES.find((name) => host?.classList.contains(name));
}

/** Theme for an overlay opened from the focused control, else the first themed surface. */
export function resolveOverlayThemeClass(): DashboardThemeClass | undefined {
  if (typeof document === 'undefined') return undefined;
  return resolveDashboardThemeClass(document.activeElement) ?? resolveDashboardThemeClass(document.querySelector(THEME_SELECTOR));
}
