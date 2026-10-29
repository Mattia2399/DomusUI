import { useEffect, useState } from 'react';

/*
 * The light or dark appearance of the device, followed live and applied to
 * the document. On its own so the startup gate (ExperienceGate) uses it
 * without the setup screens and their words, which load only with setup.
 */

export type DeviceAppearance = 'dark' | 'light';

function readDeviceAppearance(): DeviceAppearance {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark';
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function useDeviceAppearance() {
  const [appearance, setAppearance] = useState<DeviceAppearance>(readDeviceAppearance);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    const handleChange = (event: MediaQueryListEvent) => setAppearance(event.matches ? 'light' : 'dark');
    setAppearance(mediaQuery.matches ? 'light' : 'dark');
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.classList.toggle('dashboard-theme-light', appearance === 'light');
    root.classList.toggle('dashboard-theme-dark', appearance === 'dark');
    root.dataset.dashboardAppearance = appearance;
    root.style.colorScheme = appearance;
  }, [appearance]);

  return appearance;
}
