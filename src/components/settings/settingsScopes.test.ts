import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DashboardCapability } from '../../security/dashboardAccess';
import { italianTranslations } from '../../i18n/translations';
import {
  DEVICE_APPEARANCE_ROUTE,
  DEVICE_LANGUAGE_ROUTE,
  DEVICE_POWER_ROUTE,
  resolveLegacySettingsRoute,
} from '../../navigation/settingsRoutes';
import {
  APP_OWNED_SETTINGS,
  PROFILE_ENTRIES,
  SETTINGS_ENTRIES,
  SETTINGS_SECTIONS,
  selectVisibleSettingsEntries,
  type SettingsEntryId,
} from './settingsScopes';

const entry = (id: SettingsEntryId) => SETTINGS_ENTRIES.find((candidate) => candidate.id === id)!;
const profileEntry = (id: (typeof PROFILE_ENTRIES)[number]['id']) =>
  PROFILE_ENTRIES.find((candidate) => candidate.id === id)!;

describe('settings scopes', () => {
  it('has exactly three scopes; System is a group of house settings', () => {
    const scopes = new Set(
      [...SETTINGS_ENTRIES, ...APP_OWNED_SETTINGS, ...PROFILE_ENTRIES].map((candidate) => candidate.scope),
    );
    expect([...scopes].sort()).toEqual(['device', 'house', 'profile']);
    expect(SETTINGS_SECTIONS.map(({ id, scope }) => [id, scope])).toEqual([
      ['house', 'house'],
      ['system', 'house'],
      ['device', 'device'],
    ]);
    SETTINGS_ENTRIES.forEach((candidate) => {
      const section = SETTINGS_SECTIONS.find(({ id }) => id === candidate.section)!;
      expect(candidate.scope, candidate.id).toBe(section.scope);
    });
  });

  it('classifies the house configuration as shared by the whole home', () => {
    expect(entry('waste')).toMatchObject({ scope: 'house', section: 'house', storage: 'integration_store' });
    expect(entry('dashboard')).toMatchObject({ scope: 'house', section: 'house', storage: 'ha_shared_house' });
    expect(entry('access')).toMatchObject({ scope: 'house', section: 'house', capability: 'manage_rooms' });
    expect(entry('security')).toMatchObject({ scope: 'house', owner: 'core', storage: 'ha_shared_house' });
  });

  it('keeps app-owned house configuration inside its app, not on the Settings page', () => {
    // House scope, but owned by an app with its own page, backend and Store.
    expect(APP_OWNED_SETTINGS).toEqual([
      { id: 'energy', scope: 'house', owner: 'energy', route: '/consumi/energia', storage: 'integration_store' },
      {
        id: 'irrigation',
        scope: 'house',
        owner: 'irrigation',
        route: '/appgallery/irrigation/settings',
        storage: 'integration_store',
      },
    ]);
    const landingIds: string[] = SETTINGS_ENTRIES.map(({ id }) => id);
    const landingRoutes = SETTINGS_ENTRIES.map(({ route }) => route);
    APP_OWNED_SETTINGS.forEach(({ id, route }) => {
      expect(landingIds, id).not.toContain(id);
      expect(landingRoutes, id).not.toContain(route);
      expect(route.startsWith('/settings'), id).toBe(false);
    });
  });

  it('lists only Domus core configuration, and the modules without a page of their own', () => {
    const owners = new Set(SETTINGS_ENTRIES.map(({ owner }) => owner));
    expect([...owners].sort()).toEqual(['core', 'device_power', 'waste']);
    expect(SETTINGS_ENTRIES.filter(({ owner }) => owner !== 'core').map(({ id }) => id)).toEqual(['waste', 'power']);
    // House scope alone never puts a setting in Settings › Home.
    expect(SETTINGS_ENTRIES.every(({ route }) => route.startsWith('/settings/'))).toBe(true);
  });

  it('keeps the Home Assistant connection in System, a house group', () => {
    expect(entry('connection')).toMatchObject({ scope: 'house', section: 'system', route: '/settings/connections' });
    expect(entry('system')).toMatchObject({ scope: 'house', section: 'system', storage: 'ha_runtime' });
    expect(entry('data')).toMatchObject({ scope: 'house', section: 'system', capability: 'download_backup' });
  });

  it('classifies the preferences saved in this browser as device settings', () => {
    (['appearance', 'language', 'attention', 'advanced'] as const).forEach((id) => {
      expect(entry(id), id).toMatchObject({ scope: 'device', section: 'device', storage: 'browser_local' });
    });
    expect(entry('appearance').route).toBe(DEVICE_APPEARANCE_ROUTE);
    expect(entry('language').route).toBe(DEVICE_LANGUAGE_ROUTE);
  });

  it('keeps the charger of this device in This device, saved and run by DomusOS', () => {
    expect(entry('power')).toEqual({
      id: 'power',
      scope: 'device',
      owner: 'device_power',
      section: 'device',
      route: DEVICE_POWER_ROUTE,
      administratorsOnly: true,
      storage: 'integration_store',
      titleKey: 'settings.device.power',
      descriptionKey: 'settings.device.powerSubtitle',
    });
    // Administrators only, without a capability of its own.
    expect(entry('power').capability).toBeUndefined();
    const ids = SETTINGS_ENTRIES.filter(({ section }) => section === 'device').map(({ id }) => id);
    expect(ids).toEqual(['appearance', 'language', 'power', 'attention', 'advanced']);
  });

  it('keeps only the person in the Profile', () => {
    expect(PROFILE_ENTRIES.map(({ id }) => id)).toEqual(['personal', 'activity', 'devices', 'startupPanel', 'security']);
    expect(profileEntry('devices')).toMatchObject({ route: '/settings/profile/devices', storage: 'integration_store' });
    // Personal notifications are the switches of My devices, in the profile store.
    expect(profileEntry('startupPanel')).toMatchObject({ route: null, storage: 'ha_user_data' });
    const profileRoutes = PROFILE_ENTRIES.flatMap(({ route }) => (route ? [route] : []));
    // One page: the Profile opens from the top of Settings, below its own address.
    expect(profileRoutes.every((route) => route.startsWith('/settings/profile/'))).toBe(true);
    expect(SETTINGS_ENTRIES.some(({ route }) => route.startsWith('/settings/profile'))).toBe(false);
  });

  it('gives every entry its own route and existing copy', () => {
    const routes = SETTINGS_ENTRIES.map(({ route }) => route);
    expect(new Set(routes).size).toBe(routes.length);
    SETTINGS_ENTRIES.forEach(({ id, titleKey, descriptionKey }) => {
      expect(italianTranslations[titleKey], id).toBeTruthy();
      expect(italianTranslations[descriptionKey], id).toBeTruthy();
    });
  });

  it('applies the existing capabilities and never invents new ones', () => {
    const none = (_capability: DashboardCapability) => false;
    expect(selectVisibleSettingsEntries('house', none).map(({ id }) => id)).toEqual(['floors', 'waste']);
    expect(selectVisibleSettingsEntries('system', none).map(({ id }) => id)).toEqual([
      'connection',
      'devices',
      'entities',
      'system',
    ]);
    expect(selectVisibleSettingsEntries('device', none).map(({ id }) => id)).toEqual(['appearance', 'language']);

    const all = () => true;
    expect(selectVisibleSettingsEntries('house', all).map(({ id }) => id)).toEqual([
      'dashboard',
      'floors',
      'access',
      'security',
      'waste',
    ]);
    expect(selectVisibleSettingsEntries('system', all)).toHaveLength(5);
    expect(selectVisibleSettingsEntries('device', all)).toHaveLength(4);
  });

  it('shows the administrators-only entries to administrators alone', () => {
    const all = () => true;
    expect(selectVisibleSettingsEntries('device', all, false).map(({ id }) => id)).not.toContain('power');
    expect(selectVisibleSettingsEntries('device', all, true).map(({ id }) => id)).toEqual([
      'appearance',
      'language',
      'power',
      'attention',
      'advanced',
    ]);
    expect(selectVisibleSettingsEntries('device', () => false, true).map(({ id }) => id)).toEqual([
      'appearance',
      'language',
      'power',
    ]);
  });
});

describe('settings overview weight', () => {
  const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

  it('loads the controls of This device only when one of its pages opens', () => {
    const settingsPage = source('src/pages/SettingsDashboard.tsx');
    expect(settingsPage).toContain("import('../components/settings/DevicePreferencesSettings')");
    expect(settingsPage).not.toContain("from '../components/settings/DevicePreferencesSettings'");
    expect(settingsPage).toContain("import('../components/settings/DevicePowerSettings')");
    expect(settingsPage).not.toMatch(/from '\.\.\/(components\/settings\/DevicePowerSettings|services\/devicePowerClient|i18n\/devicePowerCopy)'/);
  });

  it('keeps the scope registry free of icons and components', () => {
    const registry = source('src/components/settings/settingsScopes.ts');
    expect(registry).not.toMatch(/from 'lucide-react'|from 'react'/);
    expect(registry).not.toMatch(/^import (?!type )[^\n]*from '\.\.\/\.\.\/i18n/m);
  });
});

describe('legacy settings routes', () => {
  it('opens Settings for the old Profile, whose pages now live below it', () => {
    expect(resolveLegacySettingsRoute('/profile')).toBe('/settings');
    expect(resolveLegacySettingsRoute('/profilo/')).toBe('/settings');
    expect(resolveLegacySettingsRoute('/profile/devices')).toBe('/settings/profile/devices');
    expect(resolveLegacySettingsRoute('/profile/security')).toBe('/settings/profile/security');
    expect(resolveLegacySettingsRoute('/profile/unknown')).toBe('/settings/profile');
  });

  it('sends the old Profile pages of appearance and language to This device', () => {
    expect(resolveLegacySettingsRoute('/profile/themes')).toBe(DEVICE_APPEARANCE_ROUTE);
    expect(resolveLegacySettingsRoute('/profile/language/')).toBe(DEVICE_LANGUAGE_ROUTE);
    expect(resolveLegacySettingsRoute('/Profile/Themes?from=bookmark')).toBe(DEVICE_APPEARANCE_ROUTE);
  });

  it('leaves current addresses alone, so a redirect can never loop', () => {
    ['/settings', '/settings/profile', '/settings/profile/devices', DEVICE_APPEARANCE_ROUTE, DEVICE_LANGUAGE_ROUTE].forEach(
      (route) => expect(resolveLegacySettingsRoute(route), route).toBeNull(),
    );
    expect(resolveLegacySettingsRoute(resolveLegacySettingsRoute('/profile/themes')!)).toBeNull();
  });
});
