import type React from 'react';
import { Blinds, Droplets, Fan, Plug, Power, Square, ToggleRight, type LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';
import { useDevicesTranslations } from '../../../i18n/devicesTranslations';
import { deviceHasPanel, fanLevel, iconActionOf, isStandby, type DeviceAction, type DeviceModel } from '../model/device';
import { DeviceCardShell, type DeviceCardFormat } from './DeviceCardShell';
import { LevelBar } from './LevelBar';
import { deviceIconLabel, formatDeviceStatus } from './deviceText';

/*
 * A plug, switch, fan, cover or humidifier in any card format. On, the card
 * turns light and its icon takes the colour of the kind of device. The icon
 * turns it on and off (a cover opens, closes, or stops while moving); the
 * body opens the panel when there is one. From U×3 up, a fan shows its speed,
 * a cover its opening and a humidifier its target as a slider.
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

export type DeviceCardProps = {
  model: DeviceModel;
  format: DeviceCardFormat;
  protectedPlug?: boolean;
  editing?: boolean;
  selected?: boolean;
  hiddenItem?: boolean;
  onAction: (action: DeviceAction) => void;
  onOpenPanel?: () => void;
  onSelect?: () => void;
};

function DeviceLevel({ model, onAction, disabled }: { model: DeviceModel; onAction: (action: DeviceAction) => void; disabled: boolean }) {
  const dt = useDevicesTranslations();
  if (model.fan) {
    const steps = model.fan.steps;
    const level = fanLevel(model.fan);
    return (
      <LevelBar
        value={steps ? level : model.fan.pct}
        min={steps ? 1 : 1}
        max={steps || 100}
        lit={model.on}
        label={dt('speedOf', { name: model.name })}
        valueText={!model.on ? dt('switchOff') : steps ? dt('speedText', { level, steps }) : `${model.fan.pct}%`}
        disabled={disabled}
        onChange={(value) => onAction({ type: 'fan_pct', pct: steps ? Math.round((value / steps) * 100) : value })}
      />
    );
  }
  if (model.cover?.canPosition && model.cover.position !== null) {
    return (
      <LevelBar
        value={model.cover.position}
        step={5}
        lit={model.cover.position > 0}
        label={dt('openingOf', { name: model.name })}
        valueText={`${model.cover.position}%`}
        disabled={disabled}
        onChange={(position) => onAction({ type: 'cover_position', position })}
      />
    );
  }
  if (model.humidifier && model.humidifier.target !== null) {
    const { min, max, target } = model.humidifier;
    return (
      <LevelBar
        value={target}
        min={min}
        max={max}
        step={5}
        lit={model.on}
        label={dt('humidityTarget')}
        valueText={`${target}%`}
        disabled={disabled}
        onChange={(value) => onAction({ type: 'humidity', target: value })}
      />
    );
  }
  return null;
}

export function DeviceCard({
  model,
  format,
  protectedPlug = false,
  editing = false,
  selected = false,
  hiddenItem = false,
  onAction,
  onOpenPanel,
  onSelect,
}: DeviceCardProps) {
  const dt = useDevicesTranslations();
  const status = formatDeviceStatus(model, dt);
  const hasPanel = deviceHasPanel(model);
  const iconLabel = deviceIconLabel(model, dt);
  const label = protectedPlug ? dt('protectedSuffix', { label: iconLabel }) : iconLabel;
  const level = format === 'U×2' || format === 'W×2' ? null : <DeviceLevel model={model} onAction={onAction} disabled={editing || !model.available} />;
  const wideLevel = format === 'W×2' ? <DeviceLevel model={model} onAction={onAction} disabled={editing || !model.available} /> : null;

  return (
    <DeviceCardShell
      format={format}
      name={model.name}
      status={status}
      icon={<DeviceIcon model={model} />}
      isOn={model.on}
      available={model.available}
      tone={model.on && model.available ? TONES[model.kind] : null}
      statusTone={isStandby(model) ? 'standby' : null}
      hasPanel={hasPanel}
      editing={editing}
      selected={selected}
      hiddenItem={hiddenItem}
      toggleLabel={label}
      openLabel={dt('controlsOf', { name: model.name, status: protectedPlug ? dt('protectedSuffix', { label: status }) : status })}
      selectLabel={dt('select', { name: model.name })}
      onToggle={() => onAction(iconActionOf(model))}
      onOpenPanel={onOpenPanel}
      onSelect={onSelect}
      controls={
        wideLevel ? (
          <span className="w-[44%] flex-none">{wideLevel}</span>
        ) : level ? (
          <>
            <span className="min-h-2.5 flex-auto" />
            {level}
          </>
        ) : null
      }
    />
  );
}

export default DeviceCard;
