import type { TranslationKey } from '../../i18n/translations';
import {
  DEVICE_APPEARANCE_ROUTE,
  DEVICE_KIOSK_ROUTE,
  DEVICE_LANGUAGE_ROUTE,
  DEVICE_NAVIGATION_ROUTE,
  DEVICE_POWER_ROUTE,
  DEVICE_SCREENSAVER_ROUTE,
  PROFILE_ROUTE,
} from '../../navigation/settingsRoutes';
import { HOUSE_ACCESS_ROUTE } from './settingsHouseAccessModel';

/**
 * Who a setting belongs to (docs/settings-scopes.md):
 * - `profile`: me — it changes with the person and follows them;
 * - `house`: this home — shared by every person and device;
 * - `device`: this browser, tablet or PC — another one may differ.
 *
 * "System" is a group of house settings on the Settings page, not a scope.
 * The scope never decides where a setting is edited: see `SettingsOwner`.
 */
export type SettingsScope = 'profile' | 'house' | 'device';

/**
 * The module responsible for a configuration. Domus core settings live on
 * the Settings page; an app with its own page keeps its configuration inside
 * the app, whatever its scope.
 */
export type SettingsOwner = 'core' | 'waste' | 'device_power' | 'energy' | 'irrigation';

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
  | 'browser_local'
  /** CLM.1 declares the contract but saves no configuration yet. */
  | 'not_persisted';

export type SettingsEntryId =
  | 'dashboard'
  | 'climate'
  | 'floors'
  | 'access'
  | 'security'
  | 'waste'
  | 'connection'
  | 'devices'
  | 'entities'
  | 'system'
  | 'data'
  | 'appearance'
  | 'language'
  | 'navigation'
  | 'screensaver'
  | 'kiosk'
  | 'power'
  | 'attention'
  | 'advanced';

export type SettingsEntry = Readonly<{
  id: SettingsEntryId;
  scope: Exclude<SettingsScope, 'profile'>;
  /** Only configurations without an app of their own appear on the Settings page. */
  owner: Extract<SettingsOwner, 'core' | 'waste' | 'device_power'>;
  section: SettingsSectionId;
  route: string;
  /** Who may open it is the route's rule (navigation/routeAccess.ts), never a list of its own. */
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
 * App-owned configuration is not listed here (`APP_OWNED_SETTINGS`).
 */
export const SETTINGS_ENTRIES: readonly SettingsEntry[] = [
  {
    id: 'dashboard',
    scope: 'house',
    owner: 'core',
    section: 'house',
    route: '/settings/dashboard',
    storage: 'ha_shared_house',
    titleKey: 'settings.dashboard.title',
    descriptionKey: 'settings.dashboard.subtitle',
  },
  {
    id: 'climate',
    scope: 'house',
    owner: 'core',
    section: 'house',
    route: '/settings/climate',
    storage: 'integration_store',
    titleKey: 'settings.climate.title',
    descriptionKey: 'settings.climate.subtitle',
  },
  {
    id: 'floors',
    scope: 'house',
    owner: 'core',
    section: 'house',
    route: '/settings/floors',
    storage: 'ha_registry',
    titleKey: 'settings.home.floors',
    descriptionKey: 'settings.home.floorsSubtitle',
  },
  {
    id: 'access',
    scope: 'house',
    owner: 'core',
    section: 'house',
    route: HOUSE_ACCESS_ROUTE,
    storage: 'ha_registry',
    titleKey: 'settings.access.title',
    descriptionKey: 'settings.access.subtitle',
  },
  {
    id: 'security',
    scope: 'house',
    owner: 'core',
    section: 'house',
    route: '/settings/safety',
    storage: 'ha_shared_house',
    titleKey: 'settings.security.title',
    descriptionKey: 'settings.security.subtitle',
  },
  {
    // A Domus module with its own backend and Store, but no page of its own:
    // this is its only configuration page, so it stays here.
    id: 'waste',
    scope: 'house',
    owner: 'waste',
    section: 'house',
    route: '/settings/home/waste-collection',
    storage: 'integration_store',
    titleKey: 'waste.settings.title',
    descriptionKey: 'waste.settings.cardSubtitle',
  },
  {
    // In a standalone browser the address and token are kept in this browser;
    // inside Home Assistant the panel gets its connection from Home Assistant.
    id: 'connection',
    scope: 'house',
    owner: 'core',
    section: 'system',
    route: '/settings/connections',
    storage: 'browser_local',
    titleKey: 'settings.connections.title',
    descriptionKey: 'settings.connections.subtitle',
  },
  {
    id: 'devices',
    scope: 'house',
    owner: 'core',
    section: 'system',
    route: '/settings/devices',
    storage: 'ha_registry',
    titleKey: 'settings.devices.title',
    descriptionKey: 'settings.devices.subtitle',
  },
  {
    id: 'entities',
    scope: 'house',
    owner: 'core',
    section: 'system',
    route: '/settings/entities',
    storage: 'ha_registry',
    titleKey: 'settings.entities.title',
    descriptionKey: 'settings.entities.subtitle',
  },
  {
    id: 'system',
    scope: 'house',
    owner: 'core',
    section: 'system',
    route: '/settings/system',
    storage: 'ha_runtime',
    titleKey: 'settings.system.title',
    descriptionKey: 'settings.system.cardSubtitle',
  },
  {
    id: 'data',
    scope: 'house',
    owner: 'core',
    section: 'system',
    route: '/settings/data',
    storage: 'ha_shared_house',
    titleKey: 'settings.data.title',
    descriptionKey: 'settings.data.subtitle',
  },
  {
    id: 'appearance',
    scope: 'device',
    owner: 'core',
    section: 'device',
    route: DEVICE_APPEARANCE_ROUTE,
    storage: 'browser_local',
    titleKey: 'settings.device.appearance',
    descriptionKey: 'settings.device.appearanceSubtitle',
  },
  {
    id: 'language',
    scope: 'device',
    owner: 'core',
    section: 'device',
    route: DEVICE_LANGUAGE_ROUTE,
    storage: 'browser_local',
    titleKey: 'language.selector.label',
    descriptionKey: 'settings.device.languageSubtitle',
  },
  {
    // The entries of the app bar, chosen on this browser only (docs/design/app/REGOLE-app.md §3).
    id: 'navigation',
    scope: 'device',
    owner: 'core',
    section: 'device',
    route: DEVICE_NAVIGATION_ROUTE,
    storage: 'browser_local',
    titleKey: 'settings.device.navigation',
    descriptionKey: 'settings.device.navigationSubtitle',
  },
  {
    // Shown and timed by this browser alone (docs/device-screensaver.md).
    id: 'screensaver',
    scope: 'device',
    owner: 'core',
    section: 'device',
    route: DEVICE_SCREENSAVER_ROUTE,
    storage: 'browser_local',
    titleKey: 'settings.device.screensaver',
    descriptionKey: 'settings.device.screensaverSubtitle',
  },
  {
    // A wall panel: the navigation of Domus hidden on this browser only.
    // Not a lock and not a permission (docs/device-kiosk.md).
    id: 'kiosk',
    scope: 'device',
    owner: 'core',
    section: 'device',
    route: DEVICE_KIOSK_ROUTE,
    storage: 'browser_local',
    titleKey: 'settings.device.kiosk',
    descriptionKey: 'settings.device.kioskSubtitle',
  },
  {
    // The charger of this device, switched by DomusOS in Home Assistant
    // (docs/device-power-management.md); the browser only names the device.
    id: 'power',
    scope: 'device',
    owner: 'device_power',
    section: 'device',
    route: DEVICE_POWER_ROUTE,
    storage: 'integration_store',
    titleKey: 'settings.device.power',
    descriptionKey: 'settings.device.powerSubtitle',
  },
  {
    // Saved in this browser today, although only an administrator changes it.
    id: 'attention',
    scope: 'device',
    owner: 'core',
    section: 'device',
    route: '/settings/attention',
    storage: 'browser_local',
    titleKey: 'settings.attention.title',
    descriptionKey: 'settings.attention.subtitle',
  },
  {
    // Developer mode and card sizing never leave this device.
    id: 'advanced',
    scope: 'device',
    owner: 'core',
    section: 'device',
    route: '/settings/advanced',
    storage: 'browser_local',
    titleKey: 'settings.advanced.hubTitle',
    descriptionKey: 'settings.advanced.hubSubtitle',
  },
];

/**
 * House configuration owned by an app: it is configured inside the app, at
 * the app's own address, and never on the Settings page.
 */
export type AppOwnedSetting = Readonly<{
  id: 'energy' | 'irrigation';
  scope: 'house';
  owner: Exclude<SettingsOwner, 'core' | 'waste'>;
  /** Where the app opens its configuration. */
  route: string;
  storage: SettingsStorage;
}>;

export const APP_OWNED_SETTINGS: readonly AppOwnedSetting[] = [
  // Reached from Consumption › Energy; the settings open inside the page.
  { id: 'energy', scope: 'house', owner: 'energy', route: '/consumi/energia', storage: 'integration_store' },
  // Reached from App Gallery › Irrigation › Settings.
  { id: 'irrigation', scope: 'house', owner: 'irrigation', route: '/appgallery/irrigation/settings', storage: 'integration_store' },
];

export type ProfileEntryId = 'personal' | 'activity' | 'devices' | 'startupPanel' | 'security';

export type ProfileEntry = Readonly<{
  id: ProfileEntryId;
  scope: 'profile';
  /** null when the preference is changed in place on the Profile overview. */
  route: string | null;
  storage: SettingsStorage;
}>;

/** What the Profile shows: the person, never the house or the browser. It opens from the top of Settings. */
export const PROFILE_ENTRIES: readonly ProfileEntry[] = [
  { id: 'personal', scope: 'profile', route: `${PROFILE_ROUTE}/personal`, storage: 'ha_registry' },
  { id: 'activity', scope: 'profile', route: `${PROFILE_ROUTE}/activity`, storage: 'ha_runtime' },
  { id: 'devices', scope: 'profile', route: `${PROFILE_ROUTE}/devices`, storage: 'integration_store' },
  { id: 'startupPanel', scope: 'profile', route: null, storage: 'ha_user_data' },
  // The person's own confirmation; the credential itself cannot leave this device.
  { id: 'security', scope: 'profile', route: `${PROFILE_ROUTE}/security`, storage: 'browser_local' },
];

/** The entries of one section that the current account may open (`canOpenRoute` of Access Control). */
export function selectVisibleSettingsEntries(
  section: SettingsSectionId,
  canOpen: (route: string) => boolean,
): SettingsEntry[] {
  return SETTINGS_ENTRIES.filter((entry) => entry.section === section && canOpen(entry.route));
}
