import {
  BarChart3,
  Bell,
  Home,
  Lightbulb,
  MonitorSmartphone,
  Rocket,
  Settings,
  ShieldCheck,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n/translations';

export type DashboardNotification = {
  id: string;
  type?: string;
  message?: string;
  createdAt?: number;
  read?: boolean;
};

type NotificationContextId =
  | 'home-assistant'
  | 'security'
  | 'automation'
  | 'devices'
  | 'energy'
  | 'home'
  | 'system';

type NotificationContextMeta = {
  labelKey: TranslationKey | null;
  Icon: LucideIcon;
  iconClassName: string;
  orbClassName: string;
  ringClassName: string;
};

const CONTEXT_META: Record<NotificationContextId, NotificationContextMeta> = {
  'home-assistant': {
    labelKey: null,
    Icon: MonitorSmartphone,
    iconClassName: 'text-sky-500',
    orbClassName: 'border-sky-300/45 bg-sky-400/16 shadow-[0_14px_32px_rgba(14,165,233,0.22)]',
    ringClassName: 'bg-sky-400/18',
  },
  security: {
    labelKey: 'notifications.context.security',
    Icon: ShieldCheck,
    iconClassName: 'text-rose-500',
    orbClassName: 'border-rose-300/45 bg-rose-400/16 shadow-[0_14px_32px_rgba(244,63,94,0.22)]',
    ringClassName: 'bg-rose-400/18',
  },
  automation: {
    labelKey: 'notifications.context.automation',
    Icon: Rocket,
    iconClassName: 'text-violet-500',
    orbClassName: 'border-violet-300/45 bg-violet-400/16 shadow-[0_14px_32px_rgba(139,92,246,0.22)]',
    ringClassName: 'bg-violet-400/18',
  },
  devices: {
    labelKey: 'notifications.context.devices',
    Icon: Lightbulb,
    iconClassName: 'text-amber-500',
    orbClassName: 'border-amber-300/50 bg-amber-400/18 shadow-[0_14px_32px_rgba(245,158,11,0.22)]',
    ringClassName: 'bg-amber-400/18',
  },
  energy: {
    labelKey: 'notifications.context.energy',
    Icon: BarChart3,
    iconClassName: 'text-emerald-500',
    orbClassName: 'border-emerald-300/45 bg-emerald-400/16 shadow-[0_14px_32px_rgba(16,185,129,0.22)]',
    ringClassName: 'bg-emerald-400/18',
  },
  home: {
    labelKey: 'notifications.context.home',
    Icon: Home,
    iconClassName: 'text-cyan-500',
    orbClassName: 'border-cyan-300/45 bg-cyan-400/16 shadow-[0_14px_32px_rgba(6,182,212,0.2)]',
    ringClassName: 'bg-cyan-400/18',
  },
  system: {
    labelKey: 'notifications.context.system',
    Icon: Settings,
    iconClassName: 'text-slate-500',
    orbClassName: 'border-slate-300/45 bg-slate-400/16 shadow-[0_14px_32px_rgba(100,116,139,0.2)]',
    ringClassName: 'bg-slate-400/18',
  },
};

export function resolveNotificationContext(notification: DashboardNotification): NotificationContextId {
  const message = notification.message?.toLowerCase() ?? '';

  if (/home assistant|riconnession|riconness|connetti|connession|conness/.test(message)) {
    return 'home-assistant';
  }
  if (/allarme|serratur|biometric|autenticaz|passkey|pin|codice|sicurezz|auth/.test(message)) {
    return 'security';
  }
  if (/scena|scene|script|automaz|payload|json/.test(message)) {
    return 'automation';
  }
  if (/consum|energia|corrente|kwh|watt|clima|temperatur/.test(message)) {
    return 'energy';
  }
  if (/luce|luci|switch|interrutt|sensore|camera|dispositivo|entit|entity|shelly/.test(message)) {
    return 'devices';
  }
  if (/casa|stanza|room|area/.test(message)) {
    return 'home';
  }
  return 'system';
}

type NotificationLiquidItemProps = {
  notification: DashboardNotification;
  onRead?: (id: string) => void;
  onRemove?: (id: string) => void;
};

export function NotificationLiquidItem({
  notification,
  onRead,
  onRemove,
}: NotificationLiquidItemProps) {
  const { t, formatDate } = useI18n();
  const notificationId = String(notification.id);
  const context = resolveNotificationContext(notification);
  const meta = CONTEXT_META[context] ?? CONTEXT_META.system;
  const Icon = meta.Icon;
  const message = notification.message?.trim() || t('notifications.item.default');
  const timeLabel = typeof notification.createdAt === 'number' && Number.isFinite(notification.createdAt)
    ? formatDate(notification.createdAt, { hour: '2-digit', minute: '2-digit' })
    : '';
  const isRead = notification.read === true;

  return (
    <li
      className={`group relative transition-opacity ${isRead ? 'opacity-70' : 'opacity-100'}`}
    >
      <div className="relative overflow-hidden rounded-[1.35rem] border border-[color:var(--ui-border)] bg-[linear-gradient(180deg,var(--ui-surface-glass-strong),var(--ui-surface-glass-soft))] shadow-[0_10px_26px_var(--ui-shadow-soft),inset_0_1px_0_var(--ui-border)] backdrop-blur-2xl transition-[transform,border-color] duration-200 group-hover:border-[color:var(--ui-border-strong)]">
        <button
          type="button"
          onClick={() => onRead?.(notificationId)}
          className="flex min-h-[4.75rem] w-full items-center gap-3 py-3 pl-3 pr-12 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--ui-focus-ring)]"
          aria-label={`${isRead ? t('notifications.item.open') : t('notifications.item.markRead')}: ${message}`}
        >
          <span
            className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border backdrop-blur-2xl ${meta.orbClassName}`}
          >
            <span className={`absolute inset-1 rounded-full ${meta.ringClassName}`} />
            <Icon size={18} strokeWidth={2.1} className={`relative z-10 ${meta.iconClassName}`} />
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-semibold tracking-[-0.01em] text-[color:var(--ui-text-primary)]">
                {meta.labelKey ? t(meta.labelKey) : 'Home Assistant'}
              </span>
              {notification.type === 'alert' ? (
                <span className="shrink-0 rounded-full bg-[color:color-mix(in_srgb,var(--ui-danger)_14%,transparent)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[color:var(--ui-danger)]">
                  {t('notifications.item.alert')}
                </span>
              ) : null}
              {!isRead ? (
                <span className="h-2 w-2 shrink-0 rounded-full bg-[color:var(--ui-accent)] shadow-[0_0_0_3px_rgb(var(--ui-accent-rgb)/0.14)]" />
              ) : null}
              {timeLabel ? (
                <span className="ml-auto shrink-0 text-[10px] font-semibold text-[color:var(--ui-text-tertiary)]">
                  {timeLabel}
                </span>
              ) : null}
            </span>
            <span className="mt-1 line-clamp-2 text-[13px] font-medium leading-snug text-[color:var(--ui-text-secondary)]">
              {message}
            </span>
          </span>
        </button>

        {onRemove ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRemove(notificationId);
            }}
            className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-secondary)] text-[color:var(--ui-text-secondary)] shadow-[inset_0_1px_0_var(--ui-border)] backdrop-blur-xl transition-colors hover:bg-[color:var(--ui-fill-primary)] hover:text-[color:var(--ui-text-primary)]"
            aria-label={t('notifications.item.remove')}
          >
            <X size={15} />
          </button>
        ) : null}
      </div>
    </li>
  );
}
