import { useState } from 'react';
import { AlertTriangle, MoreHorizontal, Pencil, Trash2, type LucideIcon } from 'lucide-react';
import { useI18n } from '../../../i18n/I18nProvider';
import {
  DEVICE_STATUS_LABEL,
  TARGET_STATUS_LABEL,
  type PersonalDeviceRow,
} from '../../../services/profileDevicesModel';
import GlassBottomSheet from '../../ui/GlassBottomSheet';
import GlassToggle from '../../ui/GlassToggle';
import NotYourDeviceHelp from './NotYourDeviceHelp';
import {
  DEVICE_KIND_ICON,
  DEVICE_KIND_LABEL,
  DEVICE_STATUS_VISUAL,
  TONE_CLASS,
  type StatusTone,
} from './deviceVisuals';

type PersonalDeviceItemProps = {
  row: PersonalDeviceRow;
  generalEnabled: boolean;
  /** No command can be sent: offline, or another change to this device is running. */
  locked: boolean;
  pending: boolean;
  onToggleNotifications: (value: boolean) => void;
  onRename: () => void;
  onRemove: () => void;
};

const actionClass =
  'flex min-h-12 w-full items-center gap-3 rounded-[1rem] px-3 text-left text-sm font-semibold transition hover:bg-[color:var(--ui-fill-tertiary)] disabled:cursor-not-allowed disabled:opacity-45';

/**
 * One compact row per device: what it is, the one thing worth knowing about it
 * right now, and its notification switch. Rename and remove sit behind "⋯".
 */
export function PersonalDeviceItem({
  row,
  generalEnabled,
  locked,
  pending,
  onToggleNotifications,
  onRename,
  onRemove,
}: PersonalDeviceItemProps) {
  const { t } = useI18n();
  const [actionsOpen, setActionsOpen] = useState(false);
  const { device, live, status } = row;
  const kind = live?.kind ?? 'other';
  const KindIcon = DEVICE_KIND_ICON[kind];
  const title = row.title ?? t('profile.devices.unnamed');
  const canNotify = live?.capabilities.notifications === true;

  // A problem first; otherwise a pause, otherwise just which device this is.
  let line: { text: string; tone: StatusTone; icon?: LucideIcon };
  if (status !== 'active') {
    const visual = DEVICE_STATUS_VISUAL[status];
    line = { text: t(DEVICE_STATUS_LABEL[status]), tone: visual.tone, icon: visual.icon };
  } else if (!canNotify) {
    line = { text: t(TARGET_STATUS_LABEL[live?.notificationTargetStatus ?? 'unsupported']), tone: 'warning', icon: AlertTriangle };
  } else if (!generalEnabled && device.notificationsEnabled) {
    // The device keeps its own choice while the general switch is off.
    line = { text: t('profile.devices.notificationsPaused'), tone: 'muted' };
  } else {
    line = { text: row.subtitle ?? t(DEVICE_KIND_LABEL[kind]), tone: 'muted' };
  }
  const LineIcon = line.icon;

  const run = (action: () => void) => {
    setActionsOpen(false);
    action();
  };

  return (
    <article
      data-testid="personal-device"
      data-device-status={status}
      aria-label={title}
      className="flex min-h-[4.4rem] items-center gap-3 px-4 py-3"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.95rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]">
        <KindIcon size={18} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold tracking-[-0.01em] text-[color:var(--ui-text-primary)]">{title}</h3>
        <p className={`mt-0.5 flex items-start gap-1.5 text-xs leading-5 ${TONE_CLASS[line.tone]} ${line.tone === 'muted' ? '' : 'font-medium'}`}>
          {LineIcon ? <LineIcon size={13} className="mt-[3px] shrink-0" aria-hidden="true" /> : null}
          <span className="min-w-0">{line.text}</span>
        </p>
      </div>
      <GlassToggle
        checked={device.notificationsEnabled}
        onChange={onToggleNotifications}
        label={t('profile.devices.notificationsAria', { name: title })}
        disabled={locked || !canNotify}
        busy={pending}
        size="compact"
      />
      <button
        type="button"
        onClick={() => setActionsOpen(true)}
        disabled={locked}
        aria-label={t('profile.devices.actions', { name: title })}
        className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[color:var(--ui-text-secondary)] transition hover:bg-[color:var(--ui-fill-tertiary)] disabled:cursor-not-allowed disabled:opacity-45"
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>

      <GlassBottomSheet isOpen={actionsOpen} onClose={() => setActionsOpen(false)} title={title}>
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => run(onRename)}
            disabled={locked}
            aria-label={`${t('profile.devices.rename')} ${title}`}
            className={`${actionClass} text-[color:var(--ui-text-primary)]`}
          >
            <Pencil size={17} aria-hidden="true" />
            {t('profile.devices.rename')}
          </button>
          <button
            type="button"
            onClick={() => run(onRemove)}
            disabled={locked}
            aria-label={`${t('profile.devices.remove')} ${title}`}
            className={`${actionClass} text-[color:var(--ui-danger)]`}
          >
            <Trash2 size={17} aria-hidden="true" />
            {t('profile.devices.remove')}
          </button>
          <div className="mt-2 border-t border-[color:var(--ui-separator)] px-3 pt-2">
            <NotYourDeviceHelp />
          </div>
        </div>
      </GlassBottomSheet>
    </article>
  );
}

export default PersonalDeviceItem;
