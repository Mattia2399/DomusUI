import React from 'react';
import { Droplets, Power, Square, X } from 'lucide-react';
import { clsx } from 'clsx';
import GlassSegmentSelect from '../../ui/GlassSegmentSelect';
import GlassToggle from '../../ui/GlassToggle';
import { useDevicesTranslations, type DevicesTranslator } from '../../../i18n/devicesTranslations';
import { fanLevel, isStandby, type DeviceAction, type DeviceModel } from '../model/device';
import { DeviceIcon } from '../cards/DeviceCard';
import { formatDeviceStatus } from '../cards/deviceText';

/*
 * The controls of a device that has more than on and off: the power of a
 * plug, a fan's speed and modes, a cover's opening, a humidifier's target.
 * The same content wherever the panel opens.
 */

export type DevicePanelProps = {
  model: DeviceModel;
  roomName?: string;
  protectedPlug: boolean;
  onToggleProtected?: (value: boolean) => void;
  onAction: (action: DeviceAction) => void;
  onClose: () => void;
};

function Options({ label, options, onPick }: { label: string; options: Array<{ key: string; label: string; on: boolean }>; onPick: (key: string) => void }) {
  if (options.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="dv-t2 text-[13px] font-bold">{label}</span>
      <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            className={clsx('dv-option', option.on && 'is-on')}
            aria-pressed={option.on}
            onClick={() => onPick(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function VerticalSlider({
  fill,
  fillColor,
  label,
  unit,
  bottom,
  input,
  className,
}: {
  fill: number;
  fillColor: string;
  label: string;
  unit?: string;
  bottom?: React.ReactNode;
  input: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('dv-vslider', className)}>
      <span className="dv-vslider-fill" aria-hidden="true" style={{ height: `${Math.max(0, Math.min(100, fill)).toFixed(1)}%`, background: fillColor }} />
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[18px] flex flex-col items-center">
        <span className="text-[26px] font-bold tracking-[-0.02em] tabular-nums">{label}</span>
        {unit ? <span className="dv-t2 text-xs font-semibold">{unit}</span> : null}
      </span>
      {bottom ? (
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-[18px] flex justify-center">
          {bottom}
        </span>
      ) : null}
      {input}
    </div>
  );
}

function PlugBody({ model, dt, protectedPlug, onToggleProtected }: { model: DeviceModel; dt: DevicesTranslator; protectedPlug: boolean; onToggleProtected?: (value: boolean) => void }) {
  const standby = isStandby(model);
  return (
    <>
      {model.watts !== null ? (
        <div className="dv-card flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="flex items-baseline gap-1.5">
              <span className="text-[46px] font-bold leading-none tracking-[-0.035em] tabular-nums">{model.on ? model.watts : 0}</span>
              <span className="dv-t2 text-lg font-semibold">W</span>
            </span>
            <span className="dv-t2 text-[13px] font-semibold">
              {!model.on ? dt('plugOffNoUse') : standby ? dt('standbyNote') : dt('wattsNow')}
            </span>
          </div>
          {standby ? <span className="dv-tag">{dt('standbyTag')}</span> : null}
        </div>
      ) : null}
      {onToggleProtected ? (
        <div className="dv-card flex items-center gap-3 !py-3">
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-semibold">{dt('protectedLabel')}</span>
            <span className="dv-t2 text-[13px] font-medium">{dt('protectedNote')}</span>
          </span>
          <GlassToggle checked={protectedPlug} onChange={onToggleProtected} label={dt('protectedLabel')} />
        </div>
      ) : null}
    </>
  );
}

function FanBody({ model, dt, onAction }: { model: DeviceModel; dt: DevicesTranslator; onAction: (action: DeviceAction) => void }) {
  const fan = model.fan;
  if (!fan) return null;
  const steps = fan.steps;
  const level = fanLevel(fan);
  const value = steps ? level : fan.pct;
  return (
    <div className="dv-panel-body">
      <VerticalSlider
        fill={steps ? (level / steps) * 100 : fan.pct}
        fillColor={model.on ? 'rgb(var(--dv-tone-rgb) / 0.95)' : 'var(--dv-slider-fill-off)'}
        label={!model.on ? dt('switchOff') : steps ? String(level) : `${fan.pct}%`}
        unit={model.on && steps ? dt('ofSteps', { steps }) : undefined}
        bottom={<DeviceIcon model={model} size={24} />}
        input={
          <input
            type="range"
            min={1}
            max={steps || 100}
            step={1}
            value={Math.max(1, value)}
            disabled={!model.available}
            onChange={(event) => {
              const next = Number(event.target.value);
              onAction({ type: 'fan_pct', pct: steps ? Math.round((next / steps) * 100) : next });
            }}
            aria-label={dt('speedOf', { name: model.name })}
            aria-valuetext={!model.on ? dt('switchOff') : steps ? dt('speedText', { level, steps }) : `${fan.pct}%`}
            aria-orientation="vertical"
          />
        }
      />
      <div className="dv-panel-side">
        <Options
          label={dt('modes')}
          options={fan.presets.map((preset) => ({ key: preset, label: preset, on: fan.preset === preset }))}
          onPick={(preset) => onAction({ type: 'fan_preset', preset: fan.preset === preset ? null : preset })}
        />
        {fan.oscillating !== null ? (
          <div className="dv-card flex items-center gap-3 !py-3">
            <span className="flex-1 text-[15px] font-semibold">{dt('oscillation')}</span>
            <GlassToggle
              checked={fan.oscillating}
              onChange={(oscillating) => onAction({ type: 'fan_oscillate', oscillating })}
              label={dt('oscillation')}
              disabled={!model.available}
            />
          </div>
        ) : null}
        {fan.direction !== null ? (
          <div className="flex flex-col gap-2">
            <span className="dv-t2 text-[13px] font-bold">{dt('direction')}</span>
            <GlassSegmentSelect
              className="dv-seg"
              ariaLabel={dt('direction')}
              options={[
                { value: 'forward', label: dt('summer') },
                { value: 'reverse', label: dt('winter') },
              ]}
              value={fan.direction}
              onChange={(direction) => onAction({ type: 'fan_direction', direction })}
            />
            <span className="dv-t2 text-[13px] font-medium leading-[1.4]">
              {fan.direction === 'reverse' ? dt('dirWinterNote') : dt('dirSummerNote')}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CoverBody({ model, dt, onAction }: { model: DeviceModel; dt: DevicesTranslator; onAction: (action: DeviceAction) => void }) {
  const cover = model.cover;
  if (!cover) return null;
  const position = cover.position;
  const presets: Array<[number, string]> = [
    [100, dt('coverOpen')],
    [50, dt('presetHalf')],
    [0, dt('coverClosed')],
  ];
  return (
    <div className="dv-panel-body">
      {cover.canPosition && position !== null ? (
        <div className="dv-vslider dv-cover">
          <span className="dv-cover-shut" aria-hidden="true" style={{ height: `${100 - position}%` }} />
          <span className="dv-cover-tag" aria-hidden="true">
            {position}%
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={position}
            disabled={!model.available}
            onChange={(event) => onAction({ type: 'cover_position', position: Number(event.target.value) })}
            aria-label={dt('openingOf', { name: model.name })}
            aria-valuetext={formatDeviceStatus(model, dt)}
            aria-orientation="vertical"
          />
        </div>
      ) : null}
      <div className="dv-panel-side">
        <Options
          label={dt('position')}
          options={(cover.canPosition ? presets : presets.filter(([value]) => value !== 50)).map(([value, label]) => ({
            key: String(value),
            label,
            on: !cover.moving && (position === null ? (value === 100) === model.on : position === value),
          }))}
          onPick={(key) => {
            const value = Number(key);
            if (cover.canPosition) onAction({ type: 'cover_position', position: value });
            else onAction({ type: value === 100 ? 'cover_open' : 'cover_close' });
          }}
        />
        {cover.moving && cover.canStop ? (
          <button type="button" className="dv-option is-on self-start" onClick={() => onAction({ type: 'cover_stop' })}>
            <Square size={14} strokeWidth={2.4} aria-hidden="true" className="mr-1.5 inline" />
            {dt('stop')}
          </button>
        ) : null}
        {cover.tilt !== null ? (
          <div className="flex flex-col gap-2.5">
            <span className="dv-t2 text-[13px] font-bold">{dt('tiltNow', { pct: cover.tilt })}</span>
            <span className="dv-hslider">
              <span style={{ width: `${cover.tilt}%` }} />
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={cover.tilt}
                disabled={!model.available}
                onChange={(event) => onAction({ type: 'cover_tilt', tilt: Number(event.target.value) })}
                aria-label={dt('tilt')}
                aria-valuetext={`${cover.tilt}%`}
              />
            </span>
          </div>
        ) : null}
        <span className="dv-t2 text-[13px] font-medium leading-[1.45]">
          {cover.canPosition ? dt('coverNote') : dt('coverNoteNoPosition')}
        </span>
      </div>
    </div>
  );
}

function HumidifierBody({ model, dt, onAction }: { model: DeviceModel; dt: DevicesTranslator; onAction: (action: DeviceAction) => void }) {
  const humidifier = model.humidifier;
  if (!humidifier) return null;
  const { min, max, current, target, modes, mode } = humidifier;
  const shownTarget = target ?? Math.round((min + max) / 2);
  const gap = current !== null && target !== null ? current - target : 0;
  const note = !model.on
    ? dt('humNoteOff')
    : gap > 0
      ? dt('humNoteDrying', { n: gap })
      : gap < 0
        ? dt('humNoteAdding', { n: -gap })
        : dt('humNoteReached');
  return (
    <div className="dv-panel-body">
      <VerticalSlider
        fill={((shownTarget - min) / (max - min || 1)) * 100}
        fillColor={model.on ? 'rgb(var(--dv-tone-rgb) / 0.95)' : 'var(--dv-slider-fill-off)'}
        label={`${shownTarget}%`}
        unit={dt('targetWord')}
        bottom={<Droplets size={24} strokeWidth={2} />}
        input={
          <input
            type="range"
            min={min}
            max={max}
            step={5}
            value={shownTarget}
            disabled={!model.available}
            onChange={(event) => onAction({ type: 'humidity', target: Number(event.target.value) })}
            aria-label={dt('humidityTarget')}
            aria-valuetext={`${shownTarget}%`}
            aria-orientation="vertical"
          />
        }
      />
      <div className="dv-panel-side">
        <div className="dv-card flex flex-col gap-1">
          <span className="dv-t2 text-[13px] font-bold">{dt('humidityNow')}</span>
          <span className="text-[34px] font-bold tracking-[-0.03em] tabular-nums">
            {current ?? '—'}
            <span className="dv-t2 ml-0.5 text-[17px]">%</span>
          </span>
          <span className="dv-t2 text-[13px] font-medium leading-[1.4]">{note}</span>
        </div>
        <Options
          label={dt('modes')}
          options={modes.map((entry) => ({ key: entry, label: entry, on: entry === mode }))}
          onPick={(entry) => onAction({ type: 'humidifier_mode', mode: entry })}
        />
      </div>
    </div>
  );
}

export function DevicePanel({ model, roomName, protectedPlug, onToggleProtected, onAction, onClose }: DevicePanelProps) {
  const dt = useDevicesTranslations();
  const status = formatDeviceStatus(model, dt);
  const subtitle = roomName ? `${roomName} · ${status}` : status;
  const lit = model.on && model.available;
  const isPlug = model.kind === 'outlet' || model.kind === 'switch';

  return (
    <div className={clsx('dv-panel', `dv-tone-${{ outlet: 'power', switch: 'power', virtual: 'power', fan: 'fan', cover: 'cover', humidifier: 'humid' }[model.kind]}`)}>
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 flex-none items-center justify-center rounded-full transition-[background] duration-300"
          style={
            lit
              ? { background: 'var(--dv-tone)', color: 'var(--dv-tone-ink)', boxShadow: '0 8px 22px -6px var(--dv-tone-glow)' }
              : { background: 'var(--dv-icon-off)', color: 'var(--dv-t2)' }
          }
        >
          <DeviceIcon model={model} size={23} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="m-0 truncate text-xl font-bold tracking-[-0.02em]">{model.name}</p>
          <span className="dv-t2 text-[13px] font-semibold" aria-live="polite">
            {subtitle}
          </span>
        </div>
        {model.kind !== 'cover' ? (
          <button
            type="button"
            className={clsx('dv-round', model.on && 'is-on')}
            aria-pressed={model.on}
            aria-label={dt(model.on ? 'turnOff' : 'turnOn', { name: model.name })}
            disabled={!model.available}
            onClick={() => onAction({ type: model.on ? 'turn_off' : 'turn_on' })}
          >
            <Power size={20} strokeWidth={2.2} aria-hidden="true" />
          </button>
        ) : null}
        <button type="button" className="dv-round dv-round-sm" aria-label={dt('close')} onClick={onClose}>
          <X size={15} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </div>

      {isPlug ? <PlugBody model={model} dt={dt} protectedPlug={protectedPlug} onToggleProtected={onToggleProtected} /> : null}
      {model.kind === 'fan' ? <FanBody model={model} dt={dt} onAction={onAction} /> : null}
      {model.kind === 'cover' ? <CoverBody model={model} dt={dt} onAction={onAction} /> : null}
      {model.kind === 'humidifier' ? <HumidifierBody model={model} dt={dt} onAction={onAction} /> : null}
    </div>
  );
}

export default DevicePanel;
