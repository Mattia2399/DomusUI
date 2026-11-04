import React from 'react';
import { clsx } from 'clsx';
import { Power, ShieldCheck } from 'lucide-react';
import { useI18n } from '../../../../i18n/I18nProvider';
import { useDevicesTranslations, type DevicesTranslator } from '../../../../i18n/devicesTranslations';
import { usePanelSpecTranslations } from '../../../../i18n/panelSpecTranslations';
import { GlassConfirm } from '../../../ui/GlassConfirm';
import { DeviceIcon } from '../../cards/DeviceCard';
import { formatDeviceStatus } from '../../cards/deviceText';
import { isStandby, type DeviceAction, type DeviceModel } from '../../model/device';
import { DEVICE_TINT } from '../../model/panelTint';
import type { DeviceTimer } from '../../model/deviceTimer';
import type { PlugEnergy } from '../../model/plugEnergy';
import type { PanelEntry, PanelItem, PanelSpec } from '../registry';
import { PanelHeroValue } from '../shell/PanelHero';
import { accentOf, ICON, useTimerItem } from './shared';

/* The devices with more than on and off: a plug and its consumption. */

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
