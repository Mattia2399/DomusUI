import { Check, ChevronRight, Droplet, Lock, LockOpen, PersonStanding, Activity, AppWindow, Video, type LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';
import { useDevicesTranslations } from '../../../i18n/devicesTranslations';
import { motionNow, securityWarns, type SecurityKind, type SecurityModel } from '../model/security';
import { securityStatus } from './securityText';
import '../theme/devices.css';

/*
 * A security device of the room. Its icon only shows: green when all is well,
 * amber when something needs a look, blue while it sees motion. A lock's icon
 * is a button that locks it (unlocking asks first); a camera shows its
 * picture. The body opens the detail, or the live view of a camera.
 */

export const SECURITY_ICONS: Record<SecurityKind, LucideIcon> = {
  contact: AppWindow,
  motion: PersonStanding,
  vibration: Activity,
  leak: Droplet,
  lock: Lock,
  camera: Video,
};

export type SecurityCardProps = {
  model: SecurityModel;
  /** The picture of a camera, already resolved; a camera without one shows an empty frame. */
  pictureUrl?: string | null;
  cameraLabel?: string;
  editing?: boolean;
  selected?: boolean;
  hiddenItem?: boolean;
  onOpen: () => void;
  onLock?: () => void;
  onUnlock?: () => void;
  onSelect?: () => void;
};

export function securityTone(model: SecurityModel) {
  if (securityWarns(model)) return 'warn';
  if (motionNow(model)) return 'live';
  return 'ok';
}

export function SecurityCard({ model, pictureUrl, cameraLabel, editing = false, selected = false, hiddenItem = false, onOpen, onLock, onUnlock, onSelect }: SecurityCardProps) {
  const dt = useDevicesTranslations();
  const status = securityStatus(model, dt, cameraLabel);
  const tone = securityTone(model);
  const locked = model.lock === 'locked' || model.lock === 'locking';
  const Icon = model.kind === 'lock' && !locked ? LockOpen : SECURITY_ICONS[model.kind];

  return (
    <div className={clsx('dv-tile dv-security', `is-${tone}`, editing && 'is-editing', editing && selected && 'is-selected', hiddenItem && 'is-hidden-item')}>
      <button
        type="button"
        className="dv-tile-body"
        onClick={editing ? onSelect : onOpen}
        disabled={!model.available && !editing}
        aria-pressed={editing ? selected : undefined}
        aria-label={editing ? dt('select', { name: model.name }) : dt('secAria', { name: model.name, status })}
      />
      <div className={clsx('dv-tile-inner items-center gap-3 pl-3.5', editing ? 'pr-9' : 'pr-3.5')}>
        {model.kind === 'camera' ? (
          <span className="dv-camera-thumb" aria-hidden="true">
            {pictureUrl ? <img src={pictureUrl} alt="" loading="lazy" /> : null}
          </span>
        ) : model.kind === 'lock' ? (
          <button
            type="button"
            className="dv-icon-button dv-security-icon"
            disabled={!model.available || model.lock === 'jammed'}
            aria-label={locked ? dt('unlockAria', { name: model.name }) : dt('lockAria', { name: model.name })}
            tabIndex={editing ? -1 : undefined}
            aria-hidden={editing ? true : undefined}
            onClick={() => (locked ? onUnlock?.() : onLock?.())}
          >
            <Icon size={21} strokeWidth={2} aria-hidden="true" />
          </button>
        ) : (
          <span className="dv-icon-button dv-security-icon pointer-events-none" aria-hidden="true">
            <Icon size={21} strokeWidth={2} />
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="dv-name">{model.name}</span>
          <span className="dv-status dv-security-status">{status}</span>
        </span>
      </div>
      {!editing ? (
        <span className="dv-chevron" aria-hidden="true">
          <ChevronRight size={13} strokeWidth={2.4} />
        </span>
      ) : (
        <span className={clsx('dv-check', selected && 'is-selected')} aria-hidden="true">
          <Check size={12} strokeWidth={3.2} />
        </span>
      )}
    </div>
  );
}

export default SecurityCard;
