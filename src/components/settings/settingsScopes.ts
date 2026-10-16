import type { TranslationKey } from '../../i18n/translations';
import type { DashboardCapability } from '../../security/dashboardAccess';
import { DEVICE_APPEARANCE_ROUTE, DEVICE_LANGUAGE_ROUTE } from '../../navigation/settingsRoutes';
import { HOUSE_ACCESS_ROUTE } from './settingsHouseAccessModel';

/**
 * Who a setting belongs to (docs/settings-scopes.md):
 * - `profile`: me — it changes with the person and follows them;
 * - `house`: this home — shared by every person and device;
 * - `device`: this browser, tablet or PC — another one may differ.
 *
 * "System" is a group of house settings on the Settings page, not a scope.
 */
export type SettingsScope = 'profile' | 'house' | 'device';

/** The groups of the Settings page: Home and System are both house settings. */
export type SettingsSectionId = 'house' | 'system' | 'device';

/** Where the values of a setting are actually saved (the authority). */
export type SettingsStorage =
  /** The shared house document in Home Assistant (`premium-home.shared-house.v1`). */
  | 'ha_shared_house'
  /** A Domus integration Store (`domusos.*`) in Home Assistant. */
  | 'integration_store'
  /** Home Assistant registries: floors, areas, people, devices, entities. */
  | 'ha_registry'
  /** Home Assistant frontend data of the signed-in user. */
  | 'ha_user_data'
  /** Live Home Assistant state and services; nothing saved by Domus. */
  | 'ha_runtime'
  /** This browser's local storage. */
  | 'browser_local';

export type SettingsEntryId =
  | 'dashboard'
  | 'floors'
  | 'access'
  | 'security'
  | 'waste'
  | 'energy'
  | 'irrigation'
  | 'connection'
  | 'devices'
  | 'entities'
  | 'system'
  | 'data'
  | 'appearance'
  | 'language'
  | 'attention'
  | 'advanced';

export type SettingsEntry = Readonly<{
  id: SettingsEntryId;
  scope: Exclude<SettingsScope, 'profile'>;
  section: SettingsSectionId;
  route: string;
  /** Existing capability needed to see the entry; the page keeps its own checks. */
  capability?: DashboardCapability;
  storage: SettingsStorage;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
}>;

export type SettingsSection = Readonly<{
  id: SettingsSectionId;
  scope: Exclude<SettingsScope, 'profile'>;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
}>;

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { id: 'house', scope: 'house', titleKey: 'settings.scope.house', descriptionKey: 'settings.scope.houseDescription' },
  { id: 'system', scope: 'house', titleKey: 'settings.scope.system', descriptionKey: 'settings.scope.systemDescription' },
  { id: 'device', scope: 'device', titleKey: 'settings.scope.device', descriptionKey: 'settings.scope.deviceDescription' },
];

/**
 * Every entry of the Settings page, in display order. Moving an entry to
 * another section changes where it is shown, never where its data is saved.
 */
export const SETTINGS_ENTRIES: readonly SettingsEntry[] = [
  {
    id: 'dashboard',
    scope: 'house',
    section: 'house',
    route: '/settings/dashboard',
    capability: 'edit_dashboard',
    storage: 'ha_shared_house',
    titleKey: 'settings.dashboard.title',
    descriptionKey: 'settings.dashboard.subtitle',
  },
  {
    id: 'floors',
    scope: 'house',
    section: 'house',
    route: '/settings/floors',
    storage: 'ha_registry',
    titleKey: 'settings.home.floors',
    descriptionKey: 'settings.home.floorsSubtitle',
  },
  {
    id: 'access',
    scope: 'house',
    section: 'house',
    route: HOUSE_ACCESS_ROUTE,
    capability: 'manage_rooms',
    storage: 'ha_registry',
    titleKey: 'settings.access.title',
    descriptionKey: 'settings.access.subtitle',
  },
  {
    id: 'security',
    scope: 'house',
    section: 'house',
    route: '/settings/safety',
    capability: 'manage_security_config',
    storage: 'ha_shared_house',
    titleKey: 'settings.security.title',
    descriptionKey: 'settings.security.subtitle',
  },
  {
    id: 'waste',
    scope: 'house',
    section: 'house',
    route: '/settings/home/waste-collection',
    storage: 'integration_store',
    titleKey: 'waste.settings.title',
    descriptionKey: 'waste.settings.cardSubtitle',
  },
  {
    // The configuration of the Energy page; the page itself stays in Consumption.
    id: 'energy',
    scope: 'house',
    section: 'house',
    route: '/consumi/energia',
    capability: 'manage_energy',
    storage: 'integration_store',
    titleKey: 'settings.energy.title',
    descriptionKey: 'settings.energy.subtitle',
  },
  {
    // The configuration page of the Irrigation app, at its own address.
    id: 'irrigation',
    scope: 'house',
    section: 'house',
    route: '/appgallery/irrigation/settings',
    capability: 'edit_dashboard',
    storage: 'integration_store',
    titleKey: 'settings.irrigation.title',
    descriptionKey: 'settings.irrigation.subtitle',
  },
  {
    // In a standalone browser the address and token are kept in this browser;
    // inside Home Assistant the panel gets its connection from Home Assistant.
    id: 'connection',
    scope: 'house',
    section: 'system',
    route: '/settings/connections',
    storage: 'browser_local',
    titleKey: 'settings.connections.title',
    descriptionKey: 'settings.connections.subtitle',
  },
  {
    id: 'devices',
    scope: 'house',
    section: 'system',
    route: '/settings/devices',
    storage: 'ha_registry',
    titleKey: 'settings.devices.title',
    descriptionKey: 'settings.devices.subtitle',
  },
  {
    id: 'entities',
    scope: 'house',
    section: 'system',
    route: '/settings/entities',
    storage: 'ha_registry',
    titleKey: 'settings.entities.title',
    descriptionKey: 'settings.entities.subtitle',
  },
  {
    id: 'system',
    scope: 'house',
    section: 'system',
    route: '/settings/system',
    storage: 'ha_runtime',
    titleKey: 'settings.system.title',
    descriptionKey: 'settings.system.cardSubtitle',
  },
  {
    id: 'data',
    scope: 'house',
    section: 'system',
    route: '/settings/data',
    capability: 'download_backup',
    storage: 'ha_shared_house',
    titleKey: 'settings.data.title',
    descriptionKey: 'settings.data.subtitle',
  },
  {
    id: 'appearance',
    scope: 'device',
    section: 'device',
    route: DEVICE_APPEARANCE_ROUTE,
    storage: 'browser_local',
    titleKey: 'settings.device.appearance',
    descriptionKey: 'settings.device.appearanceSubtitle',
  },
  {
    id: 'language',
    scope: 'device',
    section: 'device',
    route: DEVICE_LANGUAGE_ROUTE,
    storage: 'browser_local',
    titleKey: 'language.selector.label',
    descriptionKey: 'settings.device.languageSubtitle',
  },
  {
    // Saved in this browser today, although only an administrator changes it.
    id: 'attention',
    scope: 'device',
    section: 'device',
    route: '/settings/attention',
    capability: 'edit_dashboard',
    storage: 'browser_local',
    titleKey: 'settings.attention.title',
    descriptionKey: 'settings.attention.subtitle',
  },
  {
    // Developer mode and card sizing never leave this device.
    id: 'advanced',
    scope: 'device',
    section: 'device',
    route: '/settings/advanced',
    capability: 'developer_mode',
    storage: 'browser_local',
    titleKey: 'settings.advanced.hubTitle',
    descriptionKey: 'settings.advanced.hubSubtitle',
  },
];

export type ProfileEntryId = 'personal' | 'activity' | 'devices' | 'startupPanel' | 'security';

export type ProfileEntry = Readonly<{
  id: ProfileEntryId;
  scope: 'profile';
  /** null when the preference is changed in place on the Profile overview. */
  route: string | null;
  storage: SettingsStorage;
}>;

/** What the Profile shows: the person, never the house or the browser. */
export const PROFILE_ENTRIES: readonly ProfileEntry[] = [
  { id: 'personal', scope: 'profile', route: '/profile/personal', storage: 'ha_registry' },
  { id: 'activity', scope: 'profile', route: '/profile/activity', storage: 'ha_runtime' },
  { id: 'devices', scope: 'profile', route: '/profile/devices', storage: 'integration_store' },
  { id: 'startupPanel', scope: 'profile', route: null, storage: 'ha_user_data' },
  // The person's own confirmation; the credential itself cannot leave this device.
  { id: 'security', scope: 'profile', route: '/profile/security', storage: 'browser_local' },
];

/** The entries of one section that the current user may open. */
export function selectVisibleSettingsEntries(
  section: SettingsSectionId,
  can: (capability: DashboardCapability) => boolean,
): SettingsEntry[] {
  return SETTINGS_ENTRIES.filter(
    (entry) => entry.section === section && (!entry.capability || can(entry.capability)),
  );
}
