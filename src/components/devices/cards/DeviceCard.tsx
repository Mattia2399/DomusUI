import type React from 'react';
import { ArrowDown, ArrowUp, Blinds, Droplets, Fan, Minus, Plug, Plus, Power, RotateCw, Square, ToggleRight, type LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';
import { useDevicesTranslations } from '../../../i18n/devicesTranslations';
import { deviceHasPanel, fanLevel, iconActionOf, isStandby, type DeviceAction, type DeviceModel } from '../model/device';
import { CardFrame, CardHead, CardIcon } from './CardFrame';
import { DeviceCardShell, deviceCardSize, type DeviceCardFormat } from './DeviceCardShell';
import { LevelBar } from './LevelBar';
import { deviceIconLabel, formatDeviceStatus } from './deviceText';
import { withTimer, type DeviceTimer } from '../model/deviceTimer';

/*
 * A plug, switch, fan, cover or humidifier in the three sizes of the board
 * (docs/design-reference/CoreCards.dc.html). On, the card turns light and its
 * icon takes the colour of the kind of device.
 *
 * Mini U×2      icon, name and status: the tile of a room
 * Standard U×4  plug: power and a button; fan: the speeds; humidifier: the
 *               target with − and +; cover: the opening and its commands
 * Expanded W×4  the same with the slider, the modes and the switch
 */

const ICONS: Record<DeviceModel['kind'], LucideIcon> = {
  outlet: Plug,
  switch: Power,
  virtual: ToggleRight,
  fan: Fan,
  cover: Blinds,
  humidifier: Droplets,
};

/** The colour of the icon when the device is on: a token per kind. */
const TONES: Record<DeviceModel['kind'], string> = {
  outlet: 'power',
  switch: 'power',
  virtual: 'power',
  fan: 'fan',
  cover: 'cover',
  humidifier: 'humid',
};

/** How long a turn of the fan icon takes: faster as the fan is faster. */
export function fanSpinSeconds(model: DeviceModel) {
  const share = model.fan?.preset ? 0.5 : (model.fan?.pct ?? 50) / 100;
  return `${(2.6 - 2.1 * share).toFixed(2)}s`;
}

export function DeviceIcon({ model, size = 21 }: { model: DeviceModel; size?: number }) {
  const moving = model.kind === 'cover' && Boolean(model.cover?.moving && model.cover.canStop);
  const Icon = moving ? Square : ICONS[model.kind];
  const spinning = model.kind === 'fan' && model.on && model.available;
  return (
    <span className={clsx('flex', spinning && 'dv-spin')} style={spinning ? ({ '--dv-spin': fanSpinSeconds(model) } as React.CSSProperties) : undefined}>
      <Icon size={moving ? size - 4 : size} strokeWidth={2} aria-hidden="true" />
    </span>
  );
}

const wordOf = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');

export type DeviceCardProps = {
  model: DeviceModel;
  format: DeviceCardFormat;
  protectedPlug?: boolean;
  editing?: boolean;
  selected?: boolean;
  hiddenItem?: boolean;
  /** Its switch-off timer: the status says when it turns off. */
  timer?: DeviceTimer | null;
  timerNow?: number;
  onAction: (action: DeviceAction) => void;
  onOpenPanel?: () => void;
  onSelect?: () => void;
};

export function DeviceCard({
  model,
  format,
  protectedPlug = false,
  editing = false,
  selected = false,
  hiddenItem = false,
  timer = null,
  timerNow = Date.now(),
  onAction,
  onOpenPanel,
  onSelect,
}: DeviceCardProps) {
  const dt = useDevicesTranslations();
  const status = model.on ? withTimer(formatDeviceStatus(model, dt), timer, timerNow, dt) : formatDeviceStatus(model, dt);
  const hasPanel = deviceHasPanel(model);
  const iconLabel = deviceIconLabel(model, dt);
  const label = protectedPlug ? dt('protectedSuffix', { label: iconLabel }) : iconLabel;
  const openLabel = dt('controlsOf', { name: model.name, status: protectedPlug ? dt('protectedSuffix', { label: status }) : status });
  const size = deviceCardSize(format);
  const live = !editing && model.available;
  const lit = model.on && model.available;
  const iconAction = () => onAction(iconActionOf(model));

  if (size === 'mini') {
    return (
      <DeviceCardShell
        format="U×2"
        name={model.name}
        status={status}
        icon={<DeviceIcon model={model} />}
        isOn={model.on}
        available={model.available}
        tone={lit ? TONES[model.kind] : null}
        statusTone={isStandby(model) ? 'standby' : null}
        hasPanel={hasPanel}
        editing={editing}
        selected={selected}
        hiddenItem={hiddenItem}
        toggleLabel={label}
        openLabel={openLabel}
        selectLabel={dt('select', { name: model.name })}
        onToggle={iconAction}
        onOpenPanel={onOpenPanel}
        onSelect={onSelect}
      />
    );
  }

  const expanded = size === 'expanded';
  const icon = (command: boolean) => (
    <CardIcon label={label} pressed={model.on} editing={editing} disabled={!model.available} onPress={command ? iconAction : undefined}>
      <DeviceIcon model={model} />
    </CardIcon>
  );
  let head: React.ReactNode = <CardHead icon={icon(true)} name={model.name} status={status} oneLine={expanded} />;
  let body: React.ReactNode = null;

  if (model.fan) {
    const fan = model.fan;
    const level = fanLevel(fan);
    const speedBar = (
      <LevelBar
        className="is-40"
        value={fan.steps ? level : fan.pct}
        min={1}
        max={fan.steps || 100}
        lit={model.on}
        label={dt('speedOf', { name: model.name })}
        valueText={!model.on ? dt('switchOff') : fan.steps ? dt('speedText', { level, steps: fan.steps }) : `${fan.pct}%`}
        disabled={!live}
        onChange={(value) => onAction({ type: 'fan_pct', pct: fan.steps ? Math.round((value / fan.steps) * 100) : value })}
      />
    );
    if (!expanded) {
      body = fan.steps > 0 && fan.steps <= 6 ? (
        <span className="dv-size-grid is-speeds" role="radiogroup" aria-label={dt('speedOf', { name: model.name })} style={{ '--dv-cols': fan.steps } as React.CSSProperties}>
          {Array.from({ length: fan.steps }, (_, index) => index + 1).map((step) => (
            <button
              key={step}
              type="button"
              role="radio"
              aria-checked={model.on && level === step}
              disabled={!live}
              onClick={() => onAction({ type: 'fan_pct', pct: Math.round((step / fan.steps) * 100) })}
            >
              {step}
            </button>
          ))}
        </span>
      ) : speedBar;
    } else {
      head = <CardHead icon={icon(true)} name={model.name} status={status} oneLine aside={<span className="dv-pct">{model.on ? `${fan.pct}%` : '0%'}</span>} />;
      body = (
        <>
          {speedBar}
          <div className="dv-pills">
            {fan.presets.slice(0, 3).map((preset) => (
              <button key={preset} type="button" className={clsx('dv-pill', model.on && fan.preset === preset && 'is-on')} disabled={!live} onClick={() => onAction({ type: 'fan_preset', preset })}>
                {wordOf(preset)}
              </button>
            ))}
            {fan.oscillating !== null ? (
              <button type="button" className={clsx('dv-pill', model.on && fan.oscillating && 'is-on')} disabled={!live} onClick={() => onAction({ type: 'fan_oscillate', oscillating: !fan.oscillating })}>
                <RotateCw size={14} strokeWidth={2.4} aria-hidden="true" />
                {dt('oscillating')}
              </button>
            ) : null}
          </div>
        </>
      );
    }
  } else if (model.humidifier) {
    const humidifier = model.humidifier;
    const target = humidifier.target;
    const step = (delta: number) => {
      if (target === null) return;
      onAction({ type: 'humidity', target: Math.max(humidifier.min, Math.min(humidifier.max, target + delta)) });
    };
    const steps = target !== null ? (
      <span className="flex gap-1.5">
        <button type="button" className="dv-size-round" aria-label={dt('lowerHumidity')} disabled={!live} onClick={() => step(-5)}>
          <Minus size={16} strokeWidth={2.4} aria-hidden="true" />
        </button>
        <button type="button" className="dv-size-round" aria-label={dt('raiseHumidity')} disabled={!live} onClick={() => step(5)}>
          <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </span>
    ) : null;
    const now = humidifier.current;
    if (!expanded) {
      head = <CardHead icon={icon(true)} name={model.name} status={now !== null ? dt('humidityNowTarget', { pct: Math.round(now) }) : status} />;
      body = (
        <span className="flex items-end justify-between gap-3">
          <span className="dv-val"><b>{target !== null ? `${target}%` : '—'}</b></span>
          {steps}
        </span>
      );
    } else {
      body = (
        <>
          <span className="flex items-end justify-between gap-3">
            <span className="dv-val">
              <b>{target !== null ? `${target}%` : '—'}</b>
              {now !== null ? <span>{dt('humidityTargetNow', { pct: Math.round(now) })}</span> : null}
            </span>
            {steps}
          </span>
          {humidifier.modes.length > 0 ? (
            <div className="dv-pills">
              {humidifier.modes.slice(0, 4).map((mode) => (
                <button key={mode} type="button" className={clsx('dv-pill', model.on && humidifier.mode === mode && 'is-on')} disabled={!live} onClick={() => onAction({ type: 'humidifier_mode', mode })}>
                  {wordOf(mode)}
                </button>
              ))}
            </div>
          ) : null}
        </>
      );
    }
  } else if (model.cover) {
    const cover = model.cover;
    const position = cover.canPosition && cover.position !== null ? (
      <LevelBar
        className="is-40"
        value={cover.position}
        step={5}
        lit={cover.position > 0}
        label={dt('openingOf', { name: model.name })}
        valueText={`${cover.position}%`}
        disabled={!live}
        onChange={(value) => onAction({ type: 'cover_position', position: value })}
      />
    ) : null;
    const commands: Array<{ action: DeviceAction; Icon: LucideIcon; word: string; aria: string; on: boolean; can: boolean }> = [
      { action: { type: 'cover_close' }, Icon: ArrowDown, word: dt('close'), aria: dt('closeCover', { name: model.name }), on: cover.moving === 'closing', can: true },
      { action: { type: 'cover_stop' }, Icon: Square, word: dt('stop'), aria: dt('stopCover', { name: model.name }), on: false, can: cover.canStop },
      { action: { type: 'cover_open' }, Icon: ArrowUp, word: dt('openShort'), aria: dt('openCover', { name: model.name }), on: cover.moving === 'opening', can: true },
    ];
    head = expanded
      ? <CardHead icon={icon(true)} name={model.name} status={status} oneLine aside={cover.position !== null ? <span className="dv-pct">{cover.position}%</span> : undefined} />
      : <CardHead icon={icon(false)} name={model.name} status={status} />;
    body = (
      <>
        {position}
        <span className={clsx('dv-size-grid is-cover', !expanded && 'is-short')} style={{ '--dv-cols': 3 } as React.CSSProperties}>
          {commands.filter((command) => command.can).map(({ action, Icon, word, aria, on }) => (
            <button key={action.type} type="button" className={clsx(on && 'is-on')} aria-label={aria} disabled={!live} onClick={() => onAction(action)}>
              <Icon size={15} strokeWidth={2.4} aria-hidden="true" />
              {expanded ? word : null}
            </button>
          ))}
        </span>
      </>
    );
  } else {
    // A plug, switch or helper: its power when it measures it, and the switch.
    const watts = model.watts;
    const value = watts !== null && watts !== undefined ? (
      <span className="dv-val">
        <b>{Math.round(watts)}</b>
        <span>{dt('wattsNowUnit')}</span>
      </span>
    ) : (
      <span className="dv-val"><b className="!text-[26px]">{model.on ? dt('switchOn') : dt('switchOff')}</b></span>
    );
    if (!expanded) {
      head = <CardHead icon={icon(false)} name={model.name} status={status} />;
      body = (
        <>
          {value}
          <button type="button" className={clsx('dv-pill is-wide', !model.on && 'is-primary')} aria-label={label} disabled={!live} onClick={iconAction}>
            {model.on ? dt('turnOffShort') : dt('turnOnShort')}
          </button>
        </>
      );
    } else {
      head = (
        <CardHead
          icon={icon(false)}
          name={model.name}
          status={status}
          oneLine
          aside={(
            <button type="button" className="dv-size-switch" role="switch" aria-checked={model.on} aria-label={label} disabled={!live} onClick={iconAction}>
              <i />
            </button>
          )}
        />
      );
      body = value;
    }
  }

  return (
    <CardFrame
      format={format}
      available={model.available}
      on={lit}
      tone={lit ? TONES[model.kind] : null}
      editing={editing}
      selected={selected}
      hiddenItem={hiddenItem}
      openLabel={hasPanel ? openLabel : label}
      selectLabel={dt('select', { name: model.name })}
      onOpen={hasPanel ? onOpenPanel : iconAction}
      onSelect={onSelect}
    >
      <div className="dv-size-body">
        {head}
        {body}
      </div>
    </CardFrame>
  );
}

export default DeviceCard;
