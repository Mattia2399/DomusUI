export type SettingsManagementSectionId = 'members' | 'ha' | 'config';
export type SettingsManagementSectionIconKey =
  | 'members'
  | 'ha'
  | 'config';

/**
 * The part of Data and backup to show: `layout` is the Dashboard page (initial
 * layout, versions, sharing), `data` is Data and backup (export, restore,
 * reset), `all` shows both.
 */
export type SettingsDataBackupScope = 'all' | 'layout' | 'data';

export type SettingsManagementSectionDefinition = {
  id: SettingsManagementSectionId;
  label: string;
  hint: string;
  icon: SettingsManagementSectionIconKey;
};

export const SETTINGS_MANAGEMENT_SECTIONS:
  readonly SettingsManagementSectionDefinition[] = [
    {
      id: 'members',
      label: 'Casa e accessi',
      hint: 'Membri, ruoli e condivisione',
      icon: 'members',
    },
    {
      id: 'ha',
      label: 'Home Assistant',
      hint: 'Connessione live', // i18n-audit-ignore: registry fallback localized by the settings shell.
      icon: 'ha',
    },
    {
      id: 'config',
      label: 'Dati e backup',
      hint: 'Backup, ripristino e reset',
      icon: 'config',
    },
  ];

export function isSettingsManagementSection(
  sectionId: string | undefined,
): sectionId is SettingsManagementSectionId {
  return SETTINGS_MANAGEMENT_SECTIONS.some(
    (section) => section.id === sectionId,
  );
}

export function resolveSettingsManagementSection(
  sectionId: string | undefined,
): SettingsManagementSectionId {
  return isSettingsManagementSection(sectionId) ? sectionId : 'members';
}
