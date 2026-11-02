import type React from 'react';
import { ShieldCheck } from 'lucide-react';
import { clsx } from 'clsx';
import { useDevicesTranslations, type DevicesTranslationKey } from '../../../i18n/devicesTranslations';
import type { MockEntityState } from '../../../types/ha';
import { CardFrame, CardHead } from './CardFrame';
import { deviceCardSize, type DeviceCardFormat } from './DeviceCardShell';

/*
 * The alarm in the three sizes of the board (docs/design-reference/CoreCards.dc.html):
 * green while armed, amber while it arms, red when it goes off.
 *
 * Mini U×2      its state; a touch opens the panel
 * Standard U×4  the state in large type and the main action
 * Expanded W×4  the modes it can be armed in
 */

export type AlarmMode = 'home' | 'away' | 'night' | 'vacation' | 'custom_bypass';
export type AlarmState =
  | 'disarmed'
  | `armed_${AlarmMode}`
  | 'arming'
  | 'pending'
  | 'disarming'
  | 'triggered';

export type AlarmModel = {
  entityId: string;
  name: string;
  available: boolean;
  state: AlarmState;
  modes: AlarmMode[];
  codeRequired: boolean;
};

const FEATURES: Array<[AlarmMode, number]> = [['home', 1], ['away', 2], ['night', 4], ['custom_bypass', 16], ['vacation', 32]];
const STATES: AlarmState[] = ['disarmed', 'armed_home', 'armed_away', 'armed_night', 'armed_vacation', 'armed_custom_bypass', 'arming', 'pending', 'disarming', 'triggered'];

export function toAlarmModel(entityId: string, entity: MockEntityState | undefined, name?: string): AlarmModel {
  const attributes = entity?.rawAttributes ?? {};
  const raw = `${entity?.state ?? ''}`.trim().toLowerCase();
  const features = Number(attributes.supported_features);
  const modes = Number.isFinite(features) && features > 0
    ? FEATURES.filter(([, bit]) => (features & bit) !== 0).map(([mode]) => mode)
    : (['home', 'away', 'night'] as AlarmMode[]);
  const friendly = typeof attributes.friendly_name === 'string' ? attributes.friendly_name : entityId;
  return {
    entityId,
    name: name ?? friendly,
    available: (STATES as string[]).includes(raw),
    state: (STATES as string[]).includes(raw) ? (raw as AlarmState) : 'disarmed',
    modes,
    codeRequired: attributes.code_arm_required === true || (typeof attributes.code_format === 'string' && attributes.code_format !== ''),
  };
}

const STATE_KEY: Record<AlarmState, DevicesTranslationKey> = {
  disarmed: 'alarmDisarmed',
  armed_home: 'alarmArmedHome',
  armed_away: 'alarmArmedAway',
  armed_night: 'alarmArmedNight',
  armed_vacation: 'alarmArmedVacation',
  armed_custom_bypass: 'alarmArmedCustom',
  arming: 'alarmArming',
  pending: 'alarmPending',
  disarming: 'alarmDisarming',
  triggered: 'alarmTriggered',
};

const MODE_KEY: Record<AlarmMode, DevicesTranslationKey> = {
  home: 'alarmModeHome',
  away: 'alarmModeAway',
  night: 'alarmModeNight',
  vacation: 'alarmModeVacation',
  custom_bypass: 'alarmModeCustom',
};

export type AlarmCardProps = {
  model: AlarmModel;
  format: DeviceCardFormat;
  editing?: boolean;
  selected?: boolean;
  onArm: (mode: AlarmMode) => void;
  onDisarm: () => void;
  onOpen: () => void;
  onSelect?: () => void;
};

export function AlarmCard({ model, format, editing = false, selected = false, onArm, onDisarm, onOpen, onSelect }: AlarmCardProps) {
  const dt = useDevicesTranslations();
  const size = deviceCardSize(format);
  const pending = model.state === 'arming' || model.state === 'pending';
  const armed = model.state.startsWith('armed_');
  const triggered = model.state === 'triggered';
  const live = !editing && model.available;
  const status = model.available ? dt(STATE_KEY[model.state]) : dt('unavailable');
  const sub = !model.available ? dt('unavailable') : triggered ? dt('alarmTriggered') : pending ? dt('alarmArmingNow') : armed ? dt('alarmAllGood') : dt('alarmReady');
  const firstMode = model.modes.includes('away') ? 'away' : model.modes[0] ?? 'away';
  const primary = pending || armed || triggered
    ? { label: pending ? dt('cancel') : dt('alarmDisarm'), run: onDisarm }
    : { label: dt('alarmArmMode', { mode: dt(MODE_KEY[firstMode]) }), run: () => onArm(firstMode) };
  const icon = (
    <span className="dv-icon-button dv-alarm-icon pointer-events-none" aria-hidden="true">
      <ShieldCheck size={21} strokeWidth={2} />
    </span>
  );
  const frame = (children: React.ReactNode, row = false) => (
    <CardFrame
      format={format}
      available={model.available}
      editing={editing}
      selected={selected}
      openLabel={dt('controlsOf', { name: model.name, status })}
      selectLabel={dt('select', { name: model.name })}
      onOpen={onOpen}
      onSelect={onSelect}
      className={clsx('dv-alarm', armed && 'is-armed', pending && 'is-pending', triggered && 'is-triggered')}
    >
      <div className={clsx(row ? 'dv-tile-inner items-center gap-3 px-3.5' : 'dv-size-body')}>{children}</div>
    </CardFrame>
  );

  if (size === 'mini') {
    return frame(<CardHead icon={icon} name={model.name} status={status} />, true);
  }
  if (size === 'standard') {
    return frame(
      <>
        <CardHead icon={icon} name={model.name} status={sub} />
        <span className="dv-val"><b className="!text-[26px] !whitespace-normal">{status}</b></span>
        <button type="button" className="dv-pill is-wide is-primary" disabled={!live} onClick={primary.run}>
          {primary.label}
        </button>
      </>,
    );
  }

  const options: Array<{ key: string; label: string; on: boolean; run: () => void }> = [
    { key: 'off', label: dt('alarmModeOff'), on: model.state === 'disarmed', run: onDisarm },
    ...model.modes.slice(0, 3).map((mode) => ({
      key: mode,
      label: dt(MODE_KEY[mode]),
      on: model.state === `armed_${mode}`,
      run: () => onArm(mode),
    })),
  ];
  return frame(
    <>
      <CardHead
        icon={icon}
        name={`${model.name} · ${status}`}
        status={sub}
        oneLine
        aside={model.codeRequired ? <span className="dv-pill-label">{dt('alarmCode')}</span> : undefined}
      />
      <span className="dv-size-grid" role="radiogroup" aria-label={dt('alarmModes')} style={{ '--dv-cols': options.length } as React.CSSProperties}>
        {options.map((option) => (
          <button key={option.key} type="button" role="radio" aria-checked={option.on} disabled={!live} onClick={option.run}>
            {option.label}
          </button>
        ))}
      </span>
    </>,
  );
}

export default AlarmCard;
