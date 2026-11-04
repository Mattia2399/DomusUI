import type React from 'react';
import { CircleDot } from 'lucide-react';
import { clsx } from 'clsx';
import { useDevicesTranslations, type DevicesTranslationKey } from '../../../i18n/devicesTranslations';
import type { MockEntityState } from '../../../types/ha';
import { CardFrame, CardHead, CardIcon } from './CardFrame';
import { deviceCardSize, type DeviceCardFormat } from './DeviceCardShell';

/*
 * The robot vacuum in the three sizes of the board (docs/design-reference/CoreCards.dc.html).
 * While it cleans the card turns light and the robot moves on the plan.
 *
 * Mini U×2      its state; the icon starts or pauses it
 * Standard U×4  a strip of the plan and the figures of the run
 * Expanded W×4  the plan, the figures and its three commands
 */

export type VacuumState = 'cleaning' | 'paused' | 'docked' | 'returning' | 'idle' | 'error';

export type VacuumModel = {
  entityId: string;
  name: string;
  available: boolean;
  state: VacuumState;
  battery: number | null;
  /** m². */
  area: number | null;
  minutes: number | null;
  mapUrl: string | null;
};

const STATES: VacuumState[] = ['cleaning', 'paused', 'docked', 'returning', 'idle', 'error'];

const readNumber = (value: unknown) => {
  const number = typeof value === 'string' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) ? number : null;
};

export function toVacuumModel(
  entityId: string,
  entity: MockEntityState | undefined,
  extra: { name?: string; area?: number | null; minutes?: number | null; mapUrl?: string | null } = {},
): VacuumModel {
  const attributes = entity?.rawAttributes ?? {};
  const raw = `${entity?.state ?? ''}`.trim().toLowerCase();
  const friendly = typeof attributes.friendly_name === 'string' ? attributes.friendly_name : entityId;
  return {
    entityId,
    name: extra.name ?? friendly,
    available: raw !== '' && raw !== 'unavailable' && raw !== 'unknown',
    state: (STATES as string[]).includes(raw) ? (raw as VacuumState) : raw === 'on' ? 'cleaning' : 'idle',
    battery: readNumber(attributes.battery_level),
    area: extra.area ?? readNumber(attributes.cleaned_area),
    minutes: extra.minutes ?? readNumber(attributes.cleaning_time),
    mapUrl: extra.mapUrl ?? null,
  };
}

const STATE_KEY: Record<VacuumState, DevicesTranslationKey> = {
  cleaning: 'vacuumCleaning',
  paused: 'vacuumPaused',
  docked: 'vacuumDocked',
  returning: 'vacuumReturning',
  idle: 'vacuumIdle',
  error: 'vacuumError',
};

export type VacuumCardProps = {
  model: VacuumModel;
  format: DeviceCardFormat;
  editing?: boolean;
  selected?: boolean;
  onStartPause: () => void;
  onReturnToBase: () => void;
  onOpen: () => void;
  onSelect?: () => void;
};

function VacuumPlan({ model, side }: { model: VacuumModel; side: boolean }) {
  return (
    <span className={clsx('dv-vmap', side ? 'is-side' : 'is-strip')} aria-hidden="true">
      {model.mapUrl ? (
        <img src={model.mapUrl} alt="" loading="lazy" />
      ) : (
        <>
          <i className="r1" />
          <i className="r2" />
          <i className="r3" />
          <b className={clsx(model.state === 'cleaning' && 'is-moving')} />
        </>
      )}
    </span>
  );
}

export function VacuumCard({ model, format, editing = false, selected = false, onStartPause, onReturnToBase, onOpen, onSelect }: VacuumCardProps) {
  const dt = useDevicesTranslations();
  const size = deviceCardSize(format);
  const cleaning = model.state === 'cleaning';
  const live = !editing && model.available;
  const status = model.available ? dt(STATE_KEY[model.state]) : dt('unavailable');
  const icon = (
    <CardIcon
      label={cleaning ? dt('vacuumPause') : dt('vacuumStart')}
      pressed={cleaning}
      editing={editing}
      disabled={!model.available}
      onPress={onStartPause}
    >
      <CircleDot size={21} strokeWidth={2} aria-hidden="true" />
    </CardIcon>
  );
  const kpis = (
    <span className="dv-kpis">
      <span><b>{model.area !== null ? `${Math.round(model.area)} m²` : '—'}</b>{dt('vacuumCleaned')}</span>
      <span><b>{model.minutes !== null ? `${Math.round(model.minutes)} min` : '—'}</b>{dt('vacuumRunning')}</span>
      <span><b>{model.battery !== null ? `${Math.round(model.battery)}%` : '—'}</b>{dt('vacuumBattery')}</span>
    </span>
  );
  const frame = (children: React.ReactNode, layout: 'row' | 'column' | 'side') => (
    <CardFrame
      panelKind="vacuum"
      format={format}
      available={model.available}
      on={cleaning}
      tone={cleaning ? 'power' : null}
      editing={editing}
      selected={selected}
      openLabel={dt('controlsOf', { name: model.name, status })}
      selectLabel={dt('select', { name: model.name })}
      onOpen={onOpen}
      onSelect={onSelect}
    >
      <div className={layout === 'row' ? 'dv-tile-inner items-center gap-3 px-3.5' : clsx('dv-size-body', layout === 'side' && 'is-row')}>{children}</div>
    </CardFrame>
  );

  if (size === 'mini') return frame(<CardHead icon={icon} name={model.name} status={status} />, 'row');
  if (size === 'standard') {
    return frame(
      <>
        <CardHead icon={icon} name={model.name} status={status} />
        <VacuumPlan model={model} side={false} />
        {kpis}
      </>,
      'column',
    );
  }
  const commands: Array<{ key: string; label: string; on: boolean; run: () => void }> = [
    { key: 'start', label: dt('vacuumStart'), on: cleaning, run: () => { if (!cleaning) onStartPause(); } },
    { key: 'pause', label: dt('vacuumPause'), on: model.state === 'paused', run: () => { if (cleaning) onStartPause(); } },
    { key: 'dock', label: dt('vacuumDock'), on: model.state === 'docked' || model.state === 'returning', run: onReturnToBase },
  ];
  return frame(
    <>
      <VacuumPlan model={model} side />
      <span className="dv-size-col">
        <CardHead icon={icon} name={model.name} status={status} oneLine />
        {kpis}
        <span className="dv-pills !flex-nowrap">
          {commands.map((command) => (
            <button key={command.key} type="button" className={clsx('dv-pill is-grow', command.on && 'is-on')} disabled={!live} onClick={command.run}>
              {command.label}
            </button>
          ))}
        </span>
      </span>
    </>,
    'side',
  );
}

export default VacuumCard;
