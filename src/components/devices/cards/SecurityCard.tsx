import { Activity, AppWindow, BatteryMedium, Check, ChevronRight, Droplet, Lock, Maximize2, PersonStanding, Video, type LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';
import { useDevicesTranslations } from '../../../i18n/devicesTranslations';
import { LOW_BATTERY_PCT } from '../model/sensor';
import { motionNow, securityWarns, type LockCommand, type SecurityKind, type SecurityModel } from '../model/security';
import { CardFrame, CardHead } from './CardFrame';
import { deviceCardSize, type DeviceCardFormat } from './DeviceCardShell';
import { LockRing, lockRingInk, lockRingText, useLockRing } from './LockRing';
import { securityStatus } from './securityText';
import '../theme/devices.css';

/*
 * A security device of the room. Its icon only shows: green when all is well,
 * amber when something needs a look, blue while it sees motion. A lock has the
 * two rings of the board instead, held to unlock and open; a camera shows its
 * picture. The body opens the detail, or the live view of a camera.
 *
 * On the Home a lock and a camera take the three sizes of the board
 * (docs/design-reference/CoreCards.dc.html): the Mini row; Standard U×4 with
 * the ring beside the state, or the picture; Expanded W×4 with the large ring,
 * or the wide picture.
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
  /** A format of the Home grid; without it, the row of a room. */
  format?: DeviceCardFormat;
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

export function SecurityCard({ model, pictureUrl, cameraLabel, editing = false, selected = false, hiddenItem = false, format, onOpen, onLockCommand, onSelect }: SecurityCardProps) {
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
  const size = format ? deviceCardSize(format) : 'mini';
  const openLabel = dt('secAria', { name: model.name, status });
  const selectLabel = dt('select', { name: model.name });
  const picture = (
    <span className="dv-camera-picture" aria-hidden="true">
      {pictureUrl ? <img src={pictureUrl} alt="" loading="lazy" /> : null}
    </span>
  );
  const live = <span className="dv-live"><i />LIVE</span>;
  const frame = (children: React.ReactNode, className?: string) => (
    <CardFrame
      format={format ?? 'U×2'}
      available={model.available}
      editing={editing}
      selected={selected}
      hiddenItem={hiddenItem}
      openLabel={openLabel}
      selectLabel={selectLabel}
      onOpen={onOpen}
      onSelect={onSelect}
      className={clsx('dv-security', className)}
    >
      {children}
    </CardFrame>
  );
  const battery = model.battery !== null ? (
    <span className={clsx('dv-pill-label flex flex-none items-center gap-1', lowBattery && '!text-[color:var(--dv-amber)]')}>
      <BatteryMedium size={14} strokeWidth={2.2} aria-hidden="true" />
      {`${Math.round(model.battery)}%`}
    </span>
  ) : null;

  if (isLock && ringText && size === 'standard') {
    return frame(
      <div className="dv-size-body">
        <CardHead name={model.name} status={securityStatus(model, dt)} aside={battery} />
        <span className="flex min-w-0 items-center gap-3">
          <LockRing model={model} ring={ring} label={ringText.aria} inert={editing} />
          <span className="flex min-w-0 flex-col gap-0.5">
            <b className={clsx('text-[22px] font-bold tracking-[-0.02em]', lockRingInk(model, ring))}>{ringText.headline}</b>
            <span className="dv-status !text-xs !font-semibold">{ringText.short}</span>
          </span>
        </span>
      </div>,
    );
  }
  if (isLock && ringText && size === 'expanded') {
    return frame(
      <div className="dv-size-body is-row items-center">
        <LockRing model={model} ring={ring} label={ringText.aria} size="lg" inert={editing} />
        <span className="dv-size-col justify-center">
          <span className="dv-size-text !flex-none">
            <span className="dv-name dv-name-1">{model.name}</span>
            <span className="dv-status">{securityStatus(model, dt)}</span>
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <b className={clsx('text-2xl font-bold tracking-[-0.02em]', lockRingInk(model, ring))}>{ringText.headline}</b>
            <span className="dv-status !whitespace-normal !text-[13px] !font-semibold">{ringText.caption}</span>
          </span>
          {battery ? <span className="flex">{battery}</span> : null}
        </span>
      </div>,
    );
  }
  if (model.kind === 'camera' && size !== 'mini') {
    return frame(
      <>
        {picture}
        <div className="dv-size-body dv-camera-caption">
          <span className="flex items-start justify-between">{live}</span>
          <span className="flex min-w-0 items-end justify-between gap-3">
            <span className="flex min-w-0 flex-col gap-px">
              <b className="dv-name dv-name-1">{model.name}</b>
              <span className="dv-status">{status}</span>
            </span>
            {size === 'expanded' ? (
              <button type="button" className="dv-np-mini" aria-label={openLabel} disabled={editing} onClick={onOpen}>
                <Maximize2 size={15} strokeWidth={2.2} aria-hidden="true" />
              </button>
            ) : null}
          </span>
        </div>
      </>,
      'dv-camera-full',
    );
  }

  return (
    <div
      className={clsx('dv-tile dv-security', !isLock && `is-${tone}`, editing && 'is-editing', editing && selected && 'is-selected', hiddenItem && 'is-hidden-item')}
      data-format={format}
    >
      <button
        type="button"
        className="dv-tile-body"
        onClick={editing ? onSelect : onOpen}
        disabled={!model.available && !editing}
        aria-pressed={editing ? selected : undefined}
        aria-label={editing ? selectLabel : openLabel}
      />
      <div className={clsx('dv-tile-inner items-center gap-3 pl-3.5', editing ? 'pr-9' : 'pr-3.5')}>
        {model.kind === 'camera' ? (
          <span className={format ? 'dv-camera-round' : 'dv-camera-thumb'} aria-hidden="true">
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
      {format && model.kind === 'camera' && !editing ? (
        <span className="dv-live is-small"><i />LIVE</span>
      ) : !editing ? (
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
