import React from 'react';
import { Bell } from 'lucide-react';
import { useNotifications } from '../../context/NotificationProvider';
import { DashboardNotificationsPanel } from './DashboardNotificationsPanel';
import { useI18n } from '../../i18n/I18nProvider';

export function XsNotificationBell() {
  const { t } = useI18n();
  const [isNotificationsOpen, setIsNotificationsOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const { unreadCount } = useNotifications();
  const badgeValue = unreadCount > 99 ? '99+' : `${unreadCount}`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsNotificationsOpen(true)}
        className="liquid-glass-control relative inline-flex h-11 w-11 items-center justify-center text-[color:var(--ui-text-primary)] transition-all hover:brightness-110 active:scale-95"
        aria-label={t('navigation.notifications.open')}
        aria-expanded={isNotificationsOpen}
      >
        <Bell size={17} />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-[1.15rem] rounded-full bg-[color:var(--ui-danger)] px-1 text-center text-[10px] font-semibold leading-[1.15rem] text-[color:var(--ui-danger-contrast)] shadow-[0_0_0_2px_var(--ui-bg-elevated)]">
            {badgeValue}
          </span>
        ) : null}
      </button>

      <DashboardNotificationsPanel
        isOpen={isNotificationsOpen}
        onClose={() => {
          setIsNotificationsOpen(false);
          window.setTimeout(() => triggerRef.current?.focus(), 0);
        }}
      />
    </>
  );
}
