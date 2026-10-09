import { ChevronDown, MapPin, Pencil, Trash2 } from 'lucide-react';
import { useI18n } from '../../../i18n/I18nProvider';
import {
  DEVICE_STATUS_HINT,
  DEVICE_STATUS_LABEL,
  TARGET_STATUS_LABEL,
  presenceLabel,
  type PersonalDeviceRow,
} from '../../../services/profileDevicesModel';
import GlassToggle from '../../ui/GlassToggle';
import { DEVICE_KIND_ICON, DEVICE_KIND_LABEL, DEVICE_STATUS_VISUAL, TONE_CLASS } from './deviceVisuals';

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
  const { device, live, status } = row;
  const kind = live?.kind ?? 'other';
  const KindIcon = DEVICE_KIND_ICON[kind];
  const visual = DEVICE_STATUS_VISUAL[status];
  const StatusIcon = visual.icon;
  const title = row.title ?? t('profile.devices.unnamed');
  const hint = DEVICE_STATUS_HINT[status];
  const canNotify = live?.capabilities.notifications === true;
  const targetLabel = t(TARGET_STATUS_LABEL[live?.notificationTargetStatus ?? 'unsupported']);
  // The device keeps its own choice while the general switch is off.
  const notificationNote = canNotify && !generalEnabled && device.notificationsEnabled
    ? t('profile.devices.notificationsPaused')
    : targetLabel;
  const trackers = live?.presence.trackerEntityIds ?? [];

  return (
    <article
      data-testid="personal-device"
      data-device-status={status}
      aria-label={title}
      className="px-4 py-4"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.95rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]">
          <KindIcon size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-sm font-semibold tracking-[-0.01em] text-[color:var(--ui-text-primary)]">
            {title}
          </h3>
          <p className="mt-0.5 break-words text-xs leading-5 text-[color:var(--ui-text-secondary)]">
            {row.subtitle ?? t('profile.devices.source', { kind: t(DEVICE_KIND_LABEL[kind]) })}
          </p>
          <p className={`mt-1 flex items-start gap-1.5 text-xs font-semibold leading-5 ${TONE_CLASS[visual.tone]}`}>
            <StatusIcon size={14} className="mt-[3px] shrink-0" aria-hidden="true" />
            <span>{t(DEVICE_STATUS_LABEL[status])}</span>
          </p>
          {hint ? (
            <p className="mt-1 text-xs leading-5 text-[color:var(--ui-text-secondary)]">{t(hint)}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 border-t border-[color:var(--ui-separator)] pt-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[color:var(--ui-text-primary)]">{t('profile.devices.notifications')}</p>
          <p className="mt-0.5 text-xs leading-5 text-[color:var(--ui-text-secondary)]">{notificationNote}</p>
        </div>
        <GlassToggle
          checked={device.notificationsEnabled}
          onChange={onToggleNotifications}
          label={t('profile.devices.notificationsAria', { name: title })}
          disabled={locked || !canNotify}
          busy={pending}
        />
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-xs leading-5 text-[color:var(--ui-text-secondary)]">
        <MapPin size={13} className="shrink-0" aria-hidden="true" />
        <span>
          {t('profile.devices.presence.title')}: {t(presenceLabel(live))}
        </span>
      </p>

      <details className="group mt-2">
        <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 rounded-full text-xs font-semibold text-[color:var(--ui-text-secondary)] [&::-webkit-details-marker]:hidden">
          {t('profile.devices.details')}
          <ChevronDown size={14} className="transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
        </summary>
        <dl className="mt-1 grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-[auto_1fr]">
          <dt className="text-[color:var(--ui-text-tertiary)]">{t('profile.devices.details.device')}</dt>
          <dd className="break-all font-medium text-[color:var(--ui-text-secondary)]">{device.haDeviceId}</dd>
          <dt className="text-[color:var(--ui-text-tertiary)]">{t('profile.devices.details.trackers')}</dt>
          <dd className="break-all font-medium text-[color:var(--ui-text-secondary)]">
            {trackers.length > 0 ? trackers.join(', ') : t('profile.devices.details.none')}
          </dd>
          <dt className="text-[color:var(--ui-text-tertiary)]">{t('profile.devices.details.target')}</dt>
          <dd className="font-medium text-[color:var(--ui-text-secondary)]">{targetLabel}</dd>
        </dl>
      </details>

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onRename}
          disabled={locked}
          aria-label={`${t('profile.devices.rename')} ${title}`}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-3.5 text-xs font-semibold text-[color:var(--ui-text-primary)] transition hover:bg-[color:var(--ui-fill-secondary)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Pencil size={14} aria-hidden="true" />
          {t('profile.devices.rename')}
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={locked}
          aria-label={`${t('profile.devices.remove')} ${title}`}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-3.5 text-xs font-semibold text-[color:var(--ui-danger)] transition hover:bg-[color:var(--ui-fill-secondary)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Trash2 size={14} aria-hidden="true" />
          {t('profile.devices.remove')}
        </button>
      </div>
    </article>
  );
}

export default PersonalDeviceItem;
