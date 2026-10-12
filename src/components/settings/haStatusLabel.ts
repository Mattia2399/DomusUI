import type { HaConnectionStatus } from '../../hooks/useHaLiveConnection';
import type { useI18n } from '../../i18n/I18nProvider';

/** The Home Assistant connection status in the user's words. */
export function haStatusLabel(status: HaConnectionStatus, t: ReturnType<typeof useI18n>['t']) {
  if (status === 'connected') {
    return t('settings.status.online');
  }
  if (status === 'connecting') {
    return t('settings.status.connecting');
  }
  if (status === 'reconnecting') {
    return t('settings.status.reconnecting');
  }
  if (status === 'reauth_required') {
    return t('settings.status.reauth');
  }
  if (status === 'disconnected_by_user') {
    return t('settings.status.disconnected');
  }
  if (status === 'error') {
    return t('settings.status.error');
  }
  return t('settings.status.offline');
}
