import { Check, ChevronRight, Droplet, Lock, PersonStanding, Activity, AppWindow, Video, type LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';
import { useDevicesTranslations } from '../../../i18n/devicesTranslations';
import { LOW_BATTERY_PCT } from '../model/sensor';
import { motionNow, securityWarns, type LockCommand, type SecurityKind, type SecurityModel } from '../model/security';
import { LockRing, lockRingInk, lockRingText, useLockRing } from './LockRing';
import { securityStatus } from './securityText';
import '../theme/devices.css';

/*
 * A security device of the room. Its icon only shows: green when all is well,
 * amber when something needs a look, blue while it sees motion. A lock has the
 * two rings of the board instead, held to unlock and open; a camera shows its
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
  onLockCommand?: (command: LockCommand) => void;
  onSelect?: () => void;
};

const NO_COMMAND = () => undefined;

export function securityTone(model: SecurityModel) {
  if (securityWarns(model)) return 'warn';
  if (motionNow(model)) return 'live';
  return 'ok';
}

export function SecurityCard({ model, pictureUrl, cameraLabel, editing = false, selected = false, hiddenItem = false, onOpen, onLockCommand, onSelect }: SecurityCardProps) {
  const dt = useDevicesTranslations();
  const isLock = model.kind === 'lock';
  const ring = useLockRing(model, onLockCommand ?? NO_COMMAND, editing || !isLock);
  const ringText = isLock ? lockRingText(model, ring, dt) : null;
  const lowBattery = model.battery !== null && model.battery <= LOW_BATTERY_PCT;
  const status = ringText
    ? (() => {
        const line = ringText.short ? `${ringText.headline} · ${ringText.short}` : ringText.headline;
        return lowBattery ? dt('withBattery', { status: line, pct: Math.round(model.battery as number) }) : line;
      })()
    : securityStatus(model, dt, cameraLabel);
  const tone = securityTone(model);
  const Icon = SECURITY_ICONS[model.kind];

  return (
    <div className={clsx('dv-tile dv-security', !isLock && `is-${tone}`, editing && 'is-editing', editing && selected && 'is-selected', hiddenItem && 'is-hidden-item')}>
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
        ) : ringText ? (
          <LockRing model={model} ring={ring} label={ringText.aria} inert={editing} />
        ) : (
          <span className="dv-icon-button dv-security-icon pointer-events-none" aria-hidden="true">
            <Icon size={21} strokeWidth={2} />
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="dv-name">{model.name}</span>
          <span className={clsx('dv-status dv-security-status', isLock && lockRingInk(model, ring))}>{status}</span>
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
