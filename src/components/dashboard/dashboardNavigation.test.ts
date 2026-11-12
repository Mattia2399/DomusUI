import { describe, expect, it } from 'vitest';
import type { SidebarQuickPath } from '../../navigation/applicationRoutes';
import {
  isDashboardNavigationEntryActive,
  isPrimaryDashboardNavigationEntry,
  PRIMARY_DASHBOARD_ROUTE_IDS,
  resolveDashboardNavigationEntries,
} from './dashboardNavigation';

describe('dashboardNavigation', () => {
  it('uses one canonical primary route set on every navigation surface', () => {
    const entries = resolveDashboardNavigationEntries([], PRIMARY_DASHBOARD_ROUTE_IDS);

    expect(entries.map(({ id, path, label }) => ({ id, path, label }))).toEqual([
      { id: 'home', path: '/home', label: 'Dashboard' },
      { id: 'rooms', path: '/rooms', label: 'Stanze' },
      { id: 'security', path: '/security', label: 'Sicurezza' },
      { id: 'consumi', path: '/consumi', label: 'Consumi' },
    ]);
  });

  it('gives every entry the name and the icon of its route, whatever list it is given', () => {
    const old: SidebarQuickPath[] = [
      { id: 'home', path: '/home', label: 'La mia casa', icon: 'light' },
    ];

    const [home] = resolveDashboardNavigationEntries(old, ['home']);
    expect(home).toMatchObject({ id: 'home', path: '/home', label: 'Dashboard', icon: 'home' });
  });

  it('marks the entry of the page in view, by its route only', () => {
    const [rooms] = resolveDashboardNavigationEntries([], ['rooms']);
    expect(isDashboardNavigationEntryActive({ entry: rooms, activeRoute: '/rooms' })).toBe(true);
    expect(isDashboardNavigationEntryActive({ entry: rooms, activeRoute: '/home' })).toBe(false);
  });

  it('separates primary routes from drawer-only tools', () => {
    const [home] = resolveDashboardNavigationEntries([], ['home']);
    const [automation] = resolveDashboardNavigationEntries([], ['automation']);
    expect(isPrimaryDashboardNavigationEntry(home)).toBe(true);
    expect(isPrimaryDashboardNavigationEntry(automation)).toBe(false);
  });
});
