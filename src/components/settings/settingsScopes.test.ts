import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DashboardCapability } from '../../security/dashboardAccess';
import { italianTranslations } from '../../i18n/translations';
import {
  DEVICE_APPEARANCE_ROUTE,
  DEVICE_LANGUAGE_ROUTE,
  resolveLegacySettingsRoute,
} from '../../navigation/settingsRoutes';
import {
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
    const scopes = new Set([...SETTINGS_ENTRIES, ...PROFILE_ENTRIES].map((candidate) => candidate.scope));
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
    expect(entry('energy')).toMatchObject({ scope: 'house', section: 'house', route: '/consumi/energia' });
    expect(entry('irrigation')).toMatchObject({
      scope: 'house',
      section: 'house',
      route: '/appgallery/irrigation/settings',
    });
    expect(entry('access')).toMatchObject({ scope: 'house', section: 'house', capability: 'manage_rooms' });
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

  it('keeps only the person in the Profile', () => {
    expect(PROFILE_ENTRIES.map(({ id }) => id)).toEqual(['personal', 'activity', 'devices', 'startupPanel', 'security']);
    expect(profileEntry('devices')).toMatchObject({ route: '/profile/devices', storage: 'integration_store' });
    // Personal notifications are the switches of My devices, in the profile store.
    expect(profileEntry('startupPanel')).toMatchObject({ route: null, storage: 'ha_user_data' });
    const profileRoutes = PROFILE_ENTRIES.flatMap(({ route }) => (route ? [route] : []));
    expect(profileRoutes.every((route) => route.startsWith('/profile/'))).toBe(true);
    expect(SETTINGS_ENTRIES.some(({ route }) => route.startsWith('/profile'))).toBe(false);
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
    expect(selectVisibleSettingsEntries('house', all)).toHaveLength(7);
    expect(selectVisibleSettingsEntries('system', all)).toHaveLength(5);
    expect(selectVisibleSettingsEntries('device', all)).toHaveLength(4);
  });
});

describe('settings overview weight', () => {
  const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

  it('loads the controls of This device only when one of its pages opens', () => {
    const settingsPage = source('src/pages/SettingsDashboard.tsx');
    expect(settingsPage).toContain("import('../components/settings/DevicePreferencesSettings')");
    expect(settingsPage).not.toContain("from '../components/settings/DevicePreferencesSettings'");
  });

  it('keeps the scope registry free of icons and components', () => {
    const registry = source('src/components/settings/settingsScopes.ts');
    expect(registry).not.toMatch(/from 'lucide-react'|from 'react'/);
    expect(registry).not.toMatch(/^import (?!type )[^\n]*from '\.\.\/\.\.\/i18n/m);
  });
});

describe('legacy settings routes', () => {
  it('sends the old Profile pages of appearance and language to This device', () => {
    expect(resolveLegacySettingsRoute('/profile/themes')).toBe(DEVICE_APPEARANCE_ROUTE);
    expect(resolveLegacySettingsRoute('/profile/language/')).toBe(DEVICE_LANGUAGE_ROUTE);
    expect(resolveLegacySettingsRoute('/Profile/Themes?from=bookmark')).toBe(DEVICE_APPEARANCE_ROUTE);
  });

  it('leaves current addresses alone, so a redirect can never loop', () => {
    ['/profile', '/profile/devices', '/profile/security', '/settings', DEVICE_APPEARANCE_ROUTE, DEVICE_LANGUAGE_ROUTE].forEach(
      (route) => expect(resolveLegacySettingsRoute(route), route).toBeNull(),
    );
    expect(resolveLegacySettingsRoute(resolveLegacySettingsRoute('/profile/themes')!)).toBeNull();
  });
});
