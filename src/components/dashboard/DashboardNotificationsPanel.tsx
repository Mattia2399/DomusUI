import React from 'react';
import { Bell, Trash2 } from 'lucide-react';
import { useNotifications } from '../../context/NotificationProvider';
import DashboardSidePanel from '../ui/DashboardSidePanel';
import GlassSegmentSelect from '../ui/GlassSegmentSelect';
import { NotificationLiquidItem } from './NotificationLiquidItem';
import { useI18n } from '../../i18n/I18nProvider';

type NotificationFilter = 'all' | 'unread' | 'alert';

type DashboardNotificationsPanelProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function DashboardNotificationsPanel({
  isOpen,
  onClose,
}: DashboardNotificationsPanelProps) {
  const { t } = useI18n();
  const notificationFilters: Array<{ value: NotificationFilter; label: string }> = [
    { value: 'all', label: t('notifications.filter.all') },
    { value: 'unread', label: t('notifications.filter.unread') },
    { value: 'alert', label: t('notifications.filter.alerts') },
  ];
  const [filter, setFilter] = React.useState<NotificationFilter>('all');
  const {
    notifications,
    unreadCount,
    removeNotification,
    clearNotifications,
    markNotificationAsRead,
    markAllAsRead,
  } = useNotifications();
  const alertCount = notifications.filter((notification) => notification.type === 'alert').length;
  const visibleNotifications = notifications.filter((notification) => {
    if (filter === 'unread') return !notification.read;
    if (filter === 'alert') return notification.type === 'alert';
    return true;
  });
  const emptyTitle = notifications.length === 0
    ? t('notifications.empty.none')
    : filter === 'unread'
      ? t('notifications.empty.read')
      : filter === 'alert'
        ? t('notifications.empty.alerts')
        : t('notifications.empty.none');
  const emptyDescription = notifications.length === 0
    ? t('notifications.empty.description')
    : t('notifications.empty.filtered');
  const alertsSummary = alertCount > 0
    ? ` · ${alertCount} ${t(alertCount === 1 ? 'notifications.status.alert.one' : 'notifications.status.alert.many')}`
    : '';

  return (
    <DashboardSidePanel
      isOpen={isOpen}
      onClose={onClose}
      eyebrow={t('notifications.eyebrow')}
      title={t('notifications.title')}
      description={unreadCount > 0
        ? t('notifications.status.summary', {
            unread: unreadCount,
            readLabel: t(unreadCount === 1 ? 'notifications.status.read.one' : 'notifications.status.read.many'),
            alerts: alertsSummary,
          })
        : t('notifications.status.updated')}
      closeLabel={t('notifications.close')}
      zIndex={220}
      headerActions={
        <>
          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={markAllAsRead}
              className="liquid-glass-control h-10 rounded-full px-3 text-xs font-bold text-[color:var(--ui-text-primary)]"
            >
              {t('notifications.markAllRead')}
            </button>
          ) : null}
          {notifications.length > 0 ? (
            <button
              type="button"
              onClick={clearNotifications}
              className="glass-icon-button h-10 w-10"
              aria-label={t('notifications.clearAll')}
            >
              <Trash2 size={16} />
            </button>
          ) : null}
        </>
      }
      headerAfter={
        <GlassSegmentSelect<NotificationFilter>
          ariaLabel={t('notifications.filter.aria')}
          options={notificationFilters}
          value={filter}
          onChange={setFilter}
          optionClassName="h-auto py-2 font-bold"
        />
      }
    >
      {visibleNotifications.length === 0 ? (
        <div className="flex min-h-[18rem] flex-col items-center justify-center px-5 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass)] text-[color:var(--ui-text-secondary)]">
            <Bell size={22} />
          </span>
          <p className="mt-4 text-base font-semibold text-[color:var(--ui-text-primary)]">{emptyTitle}</p>
          <p className="mt-1 max-w-[18rem] text-sm font-medium leading-relaxed text-[color:var(--ui-text-secondary)]">
            {emptyDescription}
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {visibleNotifications.map((notification) => (
            <NotificationLiquidItem
              key={notification.id}
              notification={notification}
              onRead={markNotificationAsRead}
              onRemove={removeNotification}
            />
          ))}
        </ul>
      )}
    </DashboardSidePanel>
  );
}

export default DashboardNotificationsPanel;
