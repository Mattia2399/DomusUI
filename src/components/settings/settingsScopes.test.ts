import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canOpenRoute, resolveRouteAccess } from '../../navigation/routeAccess';
import { accessFor } from '../../test/accessFixtures';
import { englishTranslations, frenchTranslations, italianTranslations } from '../../i18n/translations';
import {
  DEVICE_APPEARANCE_ROUTE,
  DEVICE_KIOSK_ROUTE,
  DEVICE_LANGUAGE_ROUTE,
  DEVICE_POWER_ROUTE,
  DEVICE_SCREENSAVER_ROUTE,
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
    expect(entry('access')).toMatchObject({ scope: 'house', section: 'house' });
    expect(resolveRouteAccess(entry('access').route)).toEqual({ kind: 'capability', capability: 'people.view' });
    expect(entry('security')).toMatchObject({ scope: 'house', owner: 'core', storage: 'ha_shared_house' });
    expect(entry('climate')).toMatchObject({ scope: 'house', owner: 'core', section: 'house', route: '/settings/climate', storage: 'integration_store' });
    expect(resolveRouteAccess(entry('climate').route)).toEqual({ kind: 'capability', capability: 'climate.view' });
    expect(canOpenRoute(entry('climate').route, accessFor('admin').can)).toBe(true);
    expect(canOpenRoute(entry('climate').route, accessFor('member').can)).toBe(true);
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
    expect(entry('data')).toMatchObject({ scope: 'house', section: 'system' });
    expect(resolveRouteAccess(entry('data').route)).toEqual({ kind: 'capability', capability: 'backup.export' });
  });

  it('classifies the preferences saved in this browser as device settings', () => {
    (['appearance', 'language', 'screensaver', 'kiosk', 'attention', 'advanced'] as const).forEach((id) => {
      expect(entry(id), id).toMatchObject({ scope: 'device', section: 'device', storage: 'browser_local' });
    });
    expect(entry('appearance').route).toBe(DEVICE_APPEARANCE_ROUTE);
    expect(entry('language').route).toBe(DEVICE_LANGUAGE_ROUTE);
  });

  it('keeps the screensaver in This device, saved and run by this browser alone', () => {
    expect(entry('screensaver')).toEqual({
      id: 'screensaver',
      scope: 'device',
      owner: 'core',
      section: 'device',
      route: DEVICE_SCREENSAVER_ROUTE,
      storage: 'browser_local',
      titleKey: 'settings.device.screensaver',
      descriptionKey: 'settings.device.screensaverSubtitle',
    });
  });

  it('keeps Kiosk mode in This device, saved in this browser, a device preference', () => {
    expect(entry('kiosk')).toEqual({
      id: 'kiosk',
      scope: 'device',
      owner: 'core',
      section: 'device',
      route: DEVICE_KIOSK_ROUTE,
      storage: 'browser_local',
      titleKey: 'settings.device.kiosk',
      descriptionKey: 'settings.device.kioskSubtitle',
    });
    // A preference of this browser (device.manage), never a permission of the account.
    expect(resolveRouteAccess(DEVICE_KIOSK_ROUTE)).toEqual({ kind: 'capability', capability: 'device.manage' });
  });

  it('keeps the charger of this device in This device, saved and run by DomusOS', () => {
    expect(entry('power')).toEqual({
      id: 'power',
      scope: 'device',
      owner: 'device_power',
      section: 'device',
      route: DEVICE_POWER_ROUTE,
      storage: 'integration_store',
      titleKey: 'settings.device.power',
      descriptionKey: 'settings.device.powerSubtitle',
    });
    // Who opens it is the route's rule: device_power.manage, which Home Assistant keeps to administrators.
    expect(resolveRouteAccess(DEVICE_POWER_ROUTE)).toEqual({ kind: 'capability', capability: 'device_power.manage' });
    const ids = SETTINGS_ENTRIES.filter(({ section }) => section === 'device').map(({ id }) => id);
    expect(ids).toEqual(['appearance', 'language', 'screensaver', 'kiosk', 'power', 'attention', 'advanced']);
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

  it('lists for each role exactly the entries its capabilities open', () => {
    const visible = (role: Parameters<typeof accessFor>[0], section: 'house' | 'system' | 'device') =>
      selectVisibleSettingsEntries(section, (route) => canOpenRoute(route, accessFor(role).can)).map(({ id }) => id);
    expect(visible('admin', 'house')).toEqual(['dashboard', 'climate', 'floors', 'access', 'security', 'waste']);
    expect(visible('admin', 'system')).toEqual(['connection', 'devices', 'entities', 'system', 'data']);
    expect(visible('admin', 'device')).toEqual(['appearance', 'language', 'screensaver', 'kiosk', 'power', 'attention', 'advanced']);
    // A member: the people of the house, the system status and this device's preferences.
    expect(visible('member', 'house')).toEqual(['climate', 'access']);
    expect(visible('member', 'system')).toEqual(['system']);
    expect(visible('member', 'device')).toEqual(['appearance', 'language', 'screensaver', 'kiosk']);
    // Restricted and wall panel accounts have no Settings entry of their own.
    for (const role of ['restricted', 'locked'] as const) {
      expect([...visible(role, 'house'), ...visible(role, 'system'), ...visible(role, 'device')], role).toEqual([]);
    }
    expect(visible('wall_panel', 'house')).toEqual(['climate']);
  });

  it('never lists an entry without a route rule of its own', () => {
    for (const settingsEntry of SETTINGS_ENTRIES) {
      expect(resolveRouteAccess(settingsEntry.route).kind, settingsEntry.id).toBe('capability');
    }
  });

  it('provides the climate entry and shell copy in IT, EN and FR', () => {
    for (const catalog of [italianTranslations, englishTranslations, frenchTranslations]) {
      expect(catalog['settings.climate.title']).toBeTruthy();
      expect(catalog['settings.climate.subtitle']).toBeTruthy();
      expect(catalog['settings.climate.notConfigured']).toBeTruthy();
    }
  });
});

describe('settings overview weight', () => {
  const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

  it('loads the controls of This device only when one of its pages opens', () => {
    const settingsPage = source('src/pages/SettingsDashboard.tsx');
    expect(settingsPage).toContain("import('../components/settings/DevicePreferencesSettings')");
    expect(settingsPage).not.toContain("from '../components/settings/DevicePreferencesSettings'");
    expect(settingsPage).toContain("import('../components/settings/DevicePowerSettings')");
    expect(settingsPage).toContain("import('../components/settings/ScreensaverSettings')");
    expect(settingsPage).toContain("import('../components/settings/KioskSettings')");
    expect(settingsPage).not.toContain("from '../components/settings/KioskSettings'");
    expect(settingsPage).not.toContain("from '../components/settings/ScreensaverSettings'");
    expect(settingsPage).not.toMatch(/from '\.\.\/(components\/settings\/DevicePowerSettings|services\/devicePowerClient|i18n\/devicePowerCopy)'/);
  });

  it('keeps the scope registry free of icons and components', () => {
    const registry = source('src/components/settings/settingsScopes.ts');
    expect(registry).not.toMatch(/from 'lucide-react'|from 'react'/);
    expect(registry).not.toMatch(/^import (?!type )[^\n]*from '\.\.\/\.\.\/i18n/m);
  });

  it('loads the climate shell on request without a service-call path', () => {
    const settingsPage = source('src/pages/SettingsDashboard.tsx');
    const shell = source('src/pages/climate/ClimateSettingsShell.tsx');
    expect(settingsPage).toContain("React.lazy(() => import('./climate/ClimateSettingsShell'))");
    expect(settingsPage).not.toContain("from './climate/ClimateSettingsShell'");
    expect(shell).not.toMatch(/onCallService|callService|set_temperature|set_hvac_mode/);
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
