import React from 'react';
import { ArrowLeftRight, Droplets, MoveHorizontal, SlidersHorizontal, Square, Timer } from 'lucide-react';
import { clsx } from 'clsx';
import GlassSegmentSelect from '../../ui/GlassSegmentSelect';
import GlassToggle from '../../ui/GlassToggle';
import { useI18n } from '../../../i18n/I18nProvider';
import { useDevicesTranslations, type DevicesTranslator } from '../../../i18n/devicesTranslations';
import { fanLevel, type DeviceAction, type DeviceModel } from '../model/device';
import { formatTimerDuration, minutesLeft, TIMER_PRESETS, type DeviceTimer } from '../model/deviceTimer';
import { DeviceIcon } from '../cards/DeviceCard';
import { formatDeviceStatus } from '../cards/deviceText';
import { PanelHero, PanelShell, usePanelSections, type PanelLive, type PanelSectionItem } from './PanelShell';

/*
 * The controls of a device that has more than on and off: a fan's speed and
 * modes, a cover's opening, a humidifier's target. A plug has its entry in the registry.
 * The same content wherever the panel opens. On a phone or in a column the slider,
 * or what stands in for it, has the panel to itself and the rest waits behind a row
 * of round shortcuts, as in the light panel (devices.css).
 */

type SectionClass = (key: string) => string;

export type DevicePanelProps = {
  model: DeviceModel;
  roomName?: string;
  /** The switch-off timer, when the integration runs them for this device. */
  timer?: DeviceTimer | null;
  timerNow?: number;
  onSetTimer?: (minutes: number) => void;
  /** Inside a sheet that has its own title and Close. */
  embedded?: boolean;
  live?: PanelLive;
  onAction: (action: DeviceAction) => void;
  onClose: () => void;
};

function Options({
  className,
  label,
  note,
  options,
  onPick,
}: {
  className?: string;
  label: string;
  /** Said after the label: "Spegnimento automatico · Nessun timer attivo". */
  note?: string;
  options: Array<{ key: string; label: string; on: boolean }>;
  onPick: (key: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div className={clsx('flex flex-col gap-2', className)}>
      <span className="dv-t2 text-[13px] font-bold" aria-live={note ? 'polite' : undefined}>
        {label}
        {note ? <span className="font-semibold"> · {note}</span> : null}
      </span>
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

function FanBody({ model, dt, sectionClass, hero, onAction }: { model: DeviceModel; dt: DevicesTranslator; sectionClass: SectionClass; hero: React.ReactNode; onAction: (action: DeviceAction) => void }) {
  const fan = model.fan;
  if (!fan) return null;
  const steps = fan.steps;
  const level = fanLevel(fan);
  const value = steps ? level : fan.pct;
  return (
    <>
      {fan.canSetSpeed ? (
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
      ) : hero}
      <div className="dv-panel-side">
        <Options
          className={sectionClass('modes')}
          label={dt('modes')}
          options={fan.presets.map((preset) => ({ key: preset, label: preset, on: fan.preset === preset }))}
          onPick={(preset) => onAction({ type: 'fan_preset', preset: fan.preset === preset ? null : preset })}
        />
        {fan.oscillating !== null ? (
          <div className="dv-panel-section">
            <div className="dv-card flex items-center gap-3 !py-3">
              <span className="flex-1 text-[15px] font-semibold">{dt('oscillation')}</span>
              <GlassToggle
                checked={fan.oscillating}
                onChange={(oscillating) => onAction({ type: 'fan_oscillate', oscillating })}
                label={dt('oscillation')}
                disabled={!model.available}
              />
            </div>
          </div>
        ) : null}
        {fan.direction !== null ? (
          <div className={clsx(sectionClass('direction'), 'gap-2')}>
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
    </>
  );
}

function CoverBody({ model, dt, hero, onAction }: { model: DeviceModel; dt: DevicesTranslator; hero: React.ReactNode; onAction: (action: DeviceAction) => void }) {
  const cover = model.cover;
  if (!cover) return null;
  const position = cover.position;
  const presets: Array<[number, string]> = [
    [100, dt('coverOpen')],
    [50, dt('presetHalf')],
    [0, dt('coverClosed')],
  ];
  return (
    <>
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
      ) : hero}
      <div className="dv-panel-side">
        <Options
          className="dv-panel-section is-open"
          label={dt('position')}
          options={(cover.canPosition ? presets : presets.filter(([value]) => (value === 100 && cover.canOpen) || (value === 0 && cover.canClose))).map(([value, label]) => ({
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
        {cover.tilt !== null ? (
          <div className="dv-panel-section is-open gap-2.5">
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
        <span className="dv-panel-section dv-t2 text-[13px] font-medium leading-[1.45]">
          {cover.canPosition ? dt('coverNote') : dt('coverNoteNoPosition')}
        </span>
      </div>
    </>
  );
}

function HumidifierBody({ model, dt, sectionClass, onAction }: { model: DeviceModel; dt: DevicesTranslator; sectionClass: SectionClass; onAction: (action: DeviceAction) => void }) {
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
    <>
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
        <div className={clsx(sectionClass('now'), 'dv-card gap-1')}>
          <span className="dv-t2 text-[13px] font-bold">{dt('humidityNow')}</span>
          <span className="text-[34px] font-bold tracking-[-0.03em] tabular-nums">
            {current ?? '—'}
            <span className="dv-t2 ml-0.5 text-[17px]">%</span>
          </span>
          <span className="dv-t2 text-[13px] font-medium leading-[1.4]">{note}</span>
        </div>
        <Options
          className={sectionClass('modes')}
          label={dt('modes')}
          options={modes.map((entry) => ({ key: entry, label: entry, on: entry === mode }))}
          onPick={(entry) => onAction({ type: 'humidifier_mode', mode: entry })}
        />
      </div>
    </>
  );
}

function TimerOptions({ className, timer, now, dt, onSetTimer }: { className?: string; timer: DeviceTimer | null; now: number; dt: DevicesTranslator; onSetTimer: (minutes: number) => void }) {
  const { locale } = useI18n();
  const active = timer && timer.endsAt > now ? timer : null;
  const note = active
    ? dt('timerEnds', {
        time: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(active.endsAt),
        left: formatTimerDuration(minutesLeft(active, now), dt),
      })
    : dt('timerNone');
  return (
    <Options
      className={className}
      label={dt('timerTitle')}
      note={note}
      options={TIMER_PRESETS.map((minutes) => ({
        key: String(minutes),
        label: minutes === 0 ? dt('timerOff') : formatTimerDuration(minutes, dt),
        on: minutes === 0 ? active === null : active?.minutes === minutes,
      }))}
      onPick={(key) => onSetTimer(Number(key))}
    />
  );
}

export function DevicePanel({
  model,
  roomName,
  timer = null,
  timerNow = Date.now(),
  onSetTimer,
  embedded,
  live,
  onAction,
  onClose,
}: DevicePanelProps) {
  const dt = useDevicesTranslations();
  const status = formatDeviceStatus(model, dt);
  const subtitle = roomName ? `${roomName} · ${status}` : status;
  const lit = model.on && model.available;
  const hasTimer = Boolean(onSetTimer && model.available);
  const iconStyle = lit
    ? { background: 'var(--dv-tone)', color: 'var(--dv-tone-ink)', boxShadow: '0 8px 22px -6px var(--dv-tone-glow)' }
    : { background: 'var(--dv-icon-off)', color: 'var(--dv-t2)' };
  const hero = <PanelHero label={status} />;

  const fan = model.fan;
  const icon = { size: 20, strokeWidth: 2 };
  const shortcuts: PanelSectionItem[] = [
    ...(model.kind === 'humidifier' ? [{ key: 'now', icon: <Droplets {...icon} />, label: dt('humidityNow') }] : []),
    ...((fan?.presets.length ?? 0) > 0 || (model.humidifier?.modes.length ?? 0) > 0 ? [{ key: 'modes', icon: <SlidersHorizontal {...icon} />, label: dt('modes') }] : []),
    ...(fan && fan.oscillating !== null
      ? [{ key: 'oscillate', icon: <MoveHorizontal {...icon} />, label: dt('oscillation'), pressed: fan.oscillating, run: () => onAction({ type: 'fan_oscillate', oscillating: !fan.oscillating }) }]
      : []),
    ...(fan && fan.direction !== null ? [{ key: 'direction', icon: <ArrowLeftRight {...icon} />, label: dt('direction') }] : []),
    ...(hasTimer ? [{ key: 'timer', icon: <Timer {...icon} />, label: dt('timerShort') }] : []),
  ];
  const { section, sectionClass, back, row } = usePanelSections(model.entityId, shortcuts, !model.available);

  return (
    <PanelShell
      className={`dv-tone-${{ outlet: 'power', switch: 'power', virtual: 'power', fan: 'fan', cover: 'cover', humidifier: 'humid' }[model.kind]}`}
      icon={<DeviceIcon model={model} size={23} />}
      iconClassName="transition-[background] duration-300"
      iconStyle={iconStyle}
      name={model.name}
      subtitle={subtitle}
      liveSubtitle
      power={
        model.kind !== 'cover'
          ? { on: model.on, highlighted: model.on, available: model.available, name: model.name, onToggle: () => onAction({ type: model.on ? 'turn_off' : 'turn_on' }) }
          : undefined
      }
      embedded={embedded}
      live={live}
      dock={{
        back,
        center: model.cover?.moving && model.cover.canStop ? (
          <button type="button" className="dv-round is-on" aria-label={dt('stopCover', { name: model.name })} onClick={() => onAction({ type: 'cover_stop' })}>
            <Square size={18} strokeWidth={2.4} aria-hidden="true" />
          </button>
        ) : undefined,
      }}
      onClose={onClose}
    >
      <div className={clsx('dv-panel-body dv-panel-stage', 'is-wrap', (section || model.kind === 'cover') && 'has-section')}>
        {model.kind === 'virtual' ? hero : null}
        {model.kind === 'fan' ? <FanBody model={model} dt={dt} sectionClass={sectionClass} hero={hero} onAction={onAction} /> : null}
        {model.kind === 'cover' ? <CoverBody model={model} dt={dt} hero={hero} onAction={onAction} /> : null}
        {model.kind === 'humidifier' ? <HumidifierBody model={model} dt={dt} sectionClass={sectionClass} onAction={onAction} /> : null}
        {hasTimer && onSetTimer ? <TimerOptions className={clsx(sectionClass('timer'), 'dv-panel-full')} timer={timer} now={timerNow} dt={dt} onSetTimer={onSetTimer} /> : null}
        {row}
      </div>
    </PanelShell>
  );
}

export default DevicePanel;
