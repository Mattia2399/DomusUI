import React from 'react';
import { clsx } from 'clsx';
import { ArrowLeftRight, Droplets, MoveHorizontal, Power, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useI18n } from '../../../../i18n/I18nProvider';
import { useDevicesTranslations, type DevicesTranslator } from '../../../../i18n/devicesTranslations';
import { usePanelSpecTranslations } from '../../../../i18n/panelSpecTranslations';
import { GlassChips } from '../../../ui/GlassChips';
import { GlassConfirm } from '../../../ui/GlassConfirm';
import { GlassSegmented } from '../../../ui/GlassSegmented';
import { GlassSlider } from '../../../ui/GlassSlider';
import { GlassVerticalSlider } from '../../../ui/GlassVerticalSlider';
import { DeviceIcon } from '../../cards/DeviceCard';
import { formatDeviceStatus } from '../../cards/deviceText';
import { fanLevel, isStandby, type DeviceAction, type DeviceModel } from '../../model/device';
import { DEVICE_TINT } from '../../model/panelTint';
import type { DeviceTimer } from '../../model/deviceTimer';
import type { PlugEnergy } from '../../model/plugEnergy';
import type { PanelEntry, PanelItem, PanelPlace, PanelSpec } from '../registry';
import { PanelHeroValue } from '../shell/PanelHero';
import { accentOf, chipSize, ICON, useTimerItem } from './shared';
import './device.css';

/* The devices with more than on and off: a plug, a fan, a humidifier and a cover. */

export type DevicePanelInput = {
  model: DeviceModel;
  roomName?: string;
  protectedPlug?: boolean;
  onToggleProtected?: (value: boolean) => void;
  /** What a plug used today and this month, when its meter keeps statistics. */
  energy?: PlugEnergy | null;
  /** Without a tariff, the cost opens the Energy page to set one. */
  onSetTariff?: () => void;
  /** The switch-off timer, when the integration runs them for this device. */
  timer?: DeviceTimer | null;
  timerNow?: number;
  onSetTimer?: (minutes: number) => void;
  onAction: (action: DeviceAction) => void;
};

function PlugEnergyView({ energy, dt, onSetTariff }: { energy: PlugEnergy; dt: DevicesTranslator; onSetTariff?: () => void }) {
  const { locale } = useI18n();
  const peak = Math.max(0, ...energy.hours.map((value) => value ?? 0));
  const kwh = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const euro = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' });
  return (
    <>
      <div className="panel-hero-chart flex flex-col gap-1.5" aria-hidden="true">
        <div className="dv-bars">
          {energy.hours.map((value, hour) => (
            <span
              key={hour}
              className={clsx(hour === energy.hourNow && 'is-now', hour > energy.hourNow && 'is-later')}
              style={{ height: `${hour > energy.hourNow ? 4 : Math.max(8, peak > 0 ? Math.round(((value ?? 0) / peak) * 100) : 0)}%` }}
            />
          ))}
        </div>
        <div className="dv-bars-axis">
          {['00', '06', '12', '18', '24'].map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      </div>
      <div className="dv-stats">
        <div>
          <span>{dt('energyToday')}</span>
          <strong>{kwh.format(energy.today)} kWh</strong>
        </div>
        {energy.month !== null ? (
          <div>
            <span>{dt('energyMonth')}</span>
            <strong>{kwh.format(energy.month)} kWh</strong>
          </div>
        ) : null}
        {energy.cost !== null ? (
          <div>
            <span>{dt('energyCost')}</span>
            <strong>≈ {euro.format(energy.cost)}</strong>
          </div>
        ) : onSetTariff ? (
          <div>
            <span>{dt('energyCost')}</span>
            <button type="button" onClick={onSetTariff}>
              {dt('setTariff')}
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}

/** What every device has: its name, its state, its icon and its colour. */
function deviceBase(model: DeviceModel, roomName: string | undefined, dt: DevicesTranslator) {
  const status = formatDeviceStatus(model, dt);
  const lit = model.on && model.available;
  return {
    owner: model.entityId,
    name: model.name,
    status: roomName ? `${roomName} · ${status}` : status,
    icon: <DeviceIcon model={model} size={23} />,
    lit,
    accent: accentOf(DEVICE_TINT[model.kind]),
    tint: lit,
  };
}

function usePlugSpec({ model, roomName, protectedPlug = false, onToggleProtected, energy, onSetTariff, timer, timerNow, onSetTimer, onAction }: DevicePanelInput): PanelSpec {
  const dt = useDevicesTranslations();
  const sp = usePanelSpecTranslations();
  const timerItems = useTimerItem(timer, timerNow, onSetTimer);
  const [asking, setAsking] = React.useState(false);
  const standby = isStandby(model);
  const hasMeter = model.watts !== null;
  const shortcuts: PanelItem[] = [
    ...(onToggleProtected
      ? [{
          key: 'protect',
          kind: 'toggle' as const,
          icon: <ShieldCheck {...ICON} />,
          label: dt('protectedLabel'),
          note: sp.t('protectedNote'),
          on: protectedPlug,
          onPress: () => onToggleProtected(!protectedPlug),
        }]
      : []),
    ...timerItems,
  ];
  return {
    ...deviceBase(model, roomName, dt),
    heroKind: hasMeter || energy ? 'data' : 'value',
    hero: hasMeter || energy ? (
      <div className="dv-card flex flex-col gap-3.5">
        {hasMeter ? (
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="flex items-baseline gap-1.5">
                <span className="text-[46px] font-bold leading-none tracking-[-0.035em] tabular-nums">{model.on ? model.watts : 0}</span>
                <span className="dv-t2 text-lg font-semibold">W</span>
              </span>
              <span className="dv-t2 text-[13px] font-semibold">{!model.on ? dt('plugOffNoUse') : standby ? dt('standbyNote') : dt('wattsNow')}</span>
            </div>
            {standby ? <span className="dv-tag">{dt('standbyTag')}</span> : null}
          </div>
        ) : null}
        {energy ? <PlugEnergyView energy={energy} dt={dt} onSetTariff={onSetTariff} /> : null}
      </div>
    ) : (
      <PanelHeroValue icon={<Power size={28} strokeWidth={2} />} value={formatDeviceStatus(model, dt)} />
    ),
    shortcuts,
    confirm: asking ? (
      <GlassConfirm
        asking
        label={dt('turnOffShort')}
        question={
          <>
            <b>{sp.t('protectedTitle', { name: model.name })}</b>
            <br />
            <span className="panel-screen-note">{sp.t('protectedAsk')}</span>
          </>
        }
        confirmLabel={dt('turnOffShort')}
        cancelLabel={dt('cancel')}
        onCancel={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false);
          onAction({ type: 'turn_off' });
        }}
      />
    ) : undefined,
    action: {
      kind: 'power',
      on: model.on,
      disabled: !model.available,
      label: dt(model.on ? 'turnOff' : 'turnOn', { name: model.name }),
      onPress: () => {
        if (model.on && protectedPlug) setAsking(true);
        else onAction({ type: model.on ? 'turn_off' : 'turn_on' });
      },
    },
  };
}

export const plugEntry: PanelEntry<DevicePanelInput> = { useSpec: usePlugSpec };

function powerOf(model: DeviceModel, dt: DevicesTranslator, onAction: (action: DeviceAction) => void): PanelSpec['action'] {
  return {
    kind: 'power',
    on: model.on,
    disabled: !model.available,
    label: dt(model.on ? 'turnOff' : 'turnOn', { name: model.name }),
    onPress: () => onAction({ type: model.on ? 'turn_off' : 'turn_on' }),
  };
}

function useFanSpec({ model, roomName, timer, timerNow, onSetTimer, onAction }: DevicePanelInput): PanelSpec {
  const dt = useDevicesTranslations();
  const sp = usePanelSpecTranslations();
  const { locale } = useI18n();
  const timerItems = useTimerItem(timer, timerNow, onSetTimer);
  const fan = model.fan;
  const shortcuts: PanelItem[] = [];
  if (fan && fan.presets.length > 0) {
    shortcuts.push({
      key: 'modes',
      kind: 'opens',
      icon: <SlidersHorizontal {...ICON} />,
      label: dt('modes'),
      value: fan.preset ?? undefined,
      content: (place) => (
        <GlassChips<string>
          size={chipSize(place)}
          ariaLabel={dt('modes')}
          options={fan.presets.map((preset) => ({ value: preset, label: preset }))}
          value={fan.preset}
          onChange={(preset) => onAction({ type: 'fan_preset', preset: fan.preset === preset ? null : preset })}
        />
      ),
    });
  }
  if (fan && fan.oscillating !== null) {
    shortcuts.push({
      key: 'oscillate',
      kind: 'toggle',
      icon: <MoveHorizontal {...ICON} />,
      label: dt('oscillation'),
      note: sp.t('oscillationNote'),
      on: fan.oscillating,
      onPress: () => onAction({ type: 'fan_oscillate', oscillating: !fan.oscillating }),
    });
  }
  if (fan && fan.direction !== null) {
    const direction = fan.direction;
    shortcuts.push({
      key: 'direction',
      kind: 'opens',
      icon: <ArrowLeftRight {...ICON} />,
      label: dt('direction'),
      value: sp.t(direction === 'reverse' ? 'dirReverse' : 'dirNormal').toLocaleLowerCase(locale),
      note: sp.t('dirNote'),
      content: () => (
        <GlassSegmented<'forward' | 'reverse'>
          className="panel-seg"
          ariaLabel={dt('direction')}
          options={[
            { value: 'forward', label: sp.t('dirNormal') },
            { value: 'reverse', label: sp.t('dirReverse') },
          ]}
          value={direction}
          onChange={(next) => onAction({ type: 'fan_direction', direction: next })}
        />
      ),
    });
  }
  shortcuts.push(...timerItems);

  const steps = fan?.steps ?? 0;
  const level = fan ? fanLevel(fan) : 0;
  const pct = fan?.pct ?? 0;
  const said = model.on ? (steps ? dt('speedText', { level, steps }) : `${pct}%`) : dt('switchOff');
  return {
    ...deviceBase(model, roomName, dt),
    heroKind: fan?.canSetSpeed ? 'slider' : 'value',
    hero: fan?.canSetSpeed ? (
      <GlassVerticalSlider
        label={dt('speedOf', { name: model.name })}
        value={Math.max(1, steps ? level : pct)}
        min={1}
        max={steps || 100}
        off={!model.on}
        fillPercent={steps ? (level / steps) * 100 : pct}
        disabled={!model.available}
        display={model.on ? `${pct}%` : dt('switchOff')}
        subtitle={model.on && steps ? dt('speedText', { level, steps }).toLocaleLowerCase(locale) : undefined}
        valueText={said}
        icon={<DeviceIcon model={model} size={24} />}
        onValueChange={(next) => onAction({ type: 'fan_pct', pct: steps ? Math.round((next / steps) * 100) : next })}
      />
    ) : (
      <PanelHeroValue icon={<DeviceIcon model={model} size={28} />} value={formatDeviceStatus(model, dt)} />
    ),
    shortcuts,
    action: powerOf(model, dt, onAction),
  };
}

export const fanEntry: PanelEntry<DevicePanelInput> = { useSpec: useFanSpec };

function PanelRows({ rows }: { rows: ReadonlyArray<readonly [string, string]> }) {
  return (
    <div className="panel-rows">
      {rows.map(([label, value]) => (
        <div key={label} className="panel-row">
          <span>{label}</span>
          <b>{value}</b>
        </div>
      ))}
    </div>
  );
}

function useHumidifierSpec({ model, roomName, timer, timerNow, onSetTimer, onAction }: DevicePanelInput): PanelSpec {
  const dt = useDevicesTranslations();
  const sp = usePanelSpecTranslations();
  const timerItems = useTimerItem(timer, timerNow, onSetTimer);
  const humidifier = model.humidifier;
  const min = humidifier?.min ?? 30;
  const max = humidifier?.max ?? 70;
  const current = humidifier?.current ?? null;
  const target = humidifier?.target ?? Math.round((min + max) / 2);
  const shortcuts: PanelItem[] = [];
  if (current !== null) {
    shortcuts.push({
      key: 'now',
      kind: 'opens',
      icon: <Droplets {...ICON} />,
      label: dt('panelHumidity'),
      title: dt('humidityNow'),
      value: `${current}%`,
      content: () => (
        <PanelRows
          rows={[
            [sp.t('inRoom'), `${current}%`],
            [sp.t('target'), `${target}%`],
          ]}
        />
      ),
    });
  }
  if (humidifier && humidifier.modes.length > 0) {
    shortcuts.push({
      key: 'modes',
      kind: 'opens',
      icon: <SlidersHorizontal {...ICON} />,
      label: dt('modes'),
      value: humidifier.mode ?? undefined,
      content: (place) => (
        <GlassChips<string>
          size={chipSize(place)}
          ariaLabel={dt('modes')}
          options={humidifier.modes.map((mode) => ({ value: mode, label: mode }))}
          value={humidifier.mode}
          onChange={(mode) => onAction({ type: 'humidifier_mode', mode })}
        />
      ),
    });
  }
  shortcuts.push(...timerItems);
  return {
    ...deviceBase(model, roomName, dt),
    heroKind: 'slider',
    hero: (
      <GlassVerticalSlider
        label={dt('humidityTarget')}
        value={target}
        min={min}
        max={max}
        step={5}
        off={!model.on}
        disabled={!model.available}
        display={`${target}%`}
        subtitle={dt('targetWord')}
        valueText={`${target}%`}
        current={current !== null ? { value: current, label: dt('nowAt', { t: `${current}%` }) } : undefined}
        icon={<Droplets size={24} strokeWidth={2} />}
        onValueChange={(next) => onAction({ type: 'humidity', target: next })}
      />
    ),
    shortcuts,
    action: powerOf(model, dt, onAction),
  };
}

export const humidifierEntry: PanelEntry<DevicePanelInput> = { useSpec: useHumidifierSpec };

function useCoverSpec({ model, roomName, onAction }: DevicePanelInput): PanelSpec {
  const dt = useDevicesTranslations();
  const sp = usePanelSpecTranslations();
  const cover = model.cover;
  const position = cover?.position ?? null;
  const canPosition = Boolean(cover?.canPosition && position !== null);
  const presets = (
    [
      [100, dt('coverOpen')],
      [50, dt('presetHalf')],
      [0, dt('coverClosed')],
    ] as const
  ).filter(([value]) => cover?.canPosition || (value === 100 && cover?.canOpen) || (value === 0 && cover?.canClose));
  const isAt = (value: number) => (position === null ? (value === 100) === model.on : position === value);
  const onValue = cover?.moving ? null : presets.find(([value]) => isAt(value))?.[0];
  const pick = (place: PanelPlace) => (
    <GlassChips<string>
      size={chipSize(place)}
      ariaLabel={dt('position')}
      options={presets.map(([value, label]) => ({ value: String(value), label }))}
      value={onValue === null || onValue === undefined ? null : String(onValue)}
      onChange={(key) => {
        const value = Number(key);
        if (cover?.canPosition) onAction({ type: 'cover_position', position: value });
        else onAction({ type: value === 100 ? 'cover_open' : 'cover_close' });
      }}
    />
  );
  const tilt = cover?.tilt ?? null;
  const tiltBar = (className?: string) =>
    tilt === null ? null : (
      <GlassSlider
        variant="bar"
        tone="device"
        size="compact"
        commit="release"
        className={className}
        step={5}
        label={dt('tilt')}
        value={tilt}
        valueText={`${tilt}%`}
        disabled={!model.available}
        onValueChange={(value) => onAction({ type: 'cover_tilt', tilt: value })}
      />
    );
  const groups: PanelItem[] = [
    { key: 'position', kind: 'opens', icon: <SlidersHorizontal {...ICON} />, label: dt('position'), value: position !== null ? `${position}%` : undefined, content: pick },
    ...(tilt !== null
      ? [{ key: 'tilt', kind: 'opens' as const, icon: <MoveHorizontal {...ICON} />, label: dt('tilt'), value: `${tilt}%`, content: () => tiltBar() }]
      : []),
  ];
  const moving = Boolean(cover?.moving && cover.canStop);
  const canAct = model.on ? cover?.canClose : cover?.canOpen;
  return {
    ...deviceBase(model, roomName, dt),
    heroKind: canPosition ? 'cover' : 'value',
    hero: canPosition ? (
      <GlassVerticalSlider
        className="dv-cover"
        label={dt('openingOf', { name: model.name })}
        value={position as number}
        step={5}
        fillPercent={0}
        disabled={!model.available}
        valueText={formatDeviceStatus(model, dt)}
        overlay={
          <>
            <span className="dv-cover-shut" aria-hidden="true" style={{ height: `${100 - (position as number)}%` }} />
            <span className="dv-cover-tag" aria-hidden="true">
              {position}%
            </span>
          </>
        }
        onValueChange={(value) => onAction({ type: 'cover_position', position: value })}
      />
    ) : (
      <PanelHeroValue icon={<DeviceIcon model={model} size={28} />} value={formatDeviceStatus(model, dt)} />
    ),
    shortcuts: [],
    always: (
      <>
        <p className="panel-cover-title">{dt('position')}</p>
        {pick('zone')}
        {tilt !== null ? (
          <>
            <p className="panel-cover-title is-soft">{dt('tiltNow', { pct: tilt })}</p>
            {tiltBar('panel-cover-bar')}
          </>
        ) : null}
      </>
    ),
    groups,
    action: moving
      ? { kind: 'stop', label: dt('stopCover', { name: model.name }), onPress: () => onAction({ type: 'cover_stop' }) }
      : canAct
        ? {
            kind: 'power',
            on: model.on,
            disabled: !model.available,
            label: sp.t(model.on ? 'closeNow' : 'openNow', { name: model.name }),
            onPress: () => onAction({ type: model.on ? 'cover_close' : 'cover_open' }),
          }
        : undefined,
  };
}

export const coverEntry: PanelEntry<DevicePanelInput> = { useSpec: useCoverSpec };
