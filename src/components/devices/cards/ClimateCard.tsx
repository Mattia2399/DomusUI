import { ChevronRight, Contrast, Droplet, Fan, Flame, Minus, Plus, Power, Snowflake, type LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';
import { useDevicesTranslations } from '../../../i18n/devicesTranslations';
import { useI18n } from '../../../i18n/I18nProvider';
import { climateCanStep, climateIsOn, climateSwingToggle, type ClimateAction, type ClimateMode, type ClimateModel } from '../model/climate';
import { DeviceCardShell } from './DeviceCardShell';
import { climateBig, climateCompactStatus, climateFoot, climateStatus } from './climateText';
import '../theme/devices.css';

/*
 * A climate device. The large card (two columns, as the main unit of a room)
 * turns the colour of its mode when on, shows the target in large type with −
 * and +, and a line about the fan or the humidity. The small card is for the
 * other units of a room: radiator valves, underfloor heating.
 */

export const CLIMATE_ICONS: Record<ClimateMode, LucideIcon> = {
  off: Power,
  heat: Flame,
  cool: Snowflake,
  heat_cool: Contrast,
  auto: Contrast,
  dry: Droplet,
  fan_only: Fan,
};

/** The tone of a mode: tokens of the climate cards (devices.css). */
export const CLIMATE_TONE: Record<ClimateMode, string> = {
  off: 'off',
  heat: 'heat',
  cool: 'cool',
  heat_cool: 'auto',
  auto: 'auto',
  dry: 'dry',
  fan_only: 'fan',
};

export type ClimateCardProps = {
  model: ClimateModel;
  size?: 'large' | 'small';
  roomTemperature?: number | null;
  roomHumidity?: number | null;
  onAction: (action: ClimateAction) => void;
  onOpenPanel: () => void;
};

export function ClimateCard({ model, size = 'large', roomTemperature, roomHumidity, onAction, onOpenPanel }: ClimateCardProps) {
  const dt = useDevicesTranslations();
  const { locale } = useI18n();
  const on = climateIsOn(model);
  const Icon = CLIMATE_ICONS[on ? model.mode : 'off'];
  const powerLabel = dt(on ? 'turnOff' : 'turnOn', { name: model.name });
  const status = climateStatus(model, dt, locale, roomTemperature);

  if (size === 'small') {
    const compact = climateCompactStatus(model, dt, locale);
    return (
      <DeviceCardShell
        format="U×2"
        name={model.name}
        status={compact}
        icon={<Icon size={21} strokeWidth={2} aria-hidden="true" />}
        isOn={on}
        available={model.available}
        tone={on ? `cl-${CLIMATE_TONE[model.mode]}` : null}
        hasPanel
        toggleLabel={powerLabel}
        openLabel={dt('controlsOf', { name: model.name, status: compact })}
        selectLabel={dt('select', { name: model.name })}
        onToggle={() => onAction({ type: on ? 'turn_off' : 'turn_on' })}
        onOpenPanel={onOpenPanel}
      />
    );
  }

  const { caption, big } = climateBig(model, dt, locale, roomHumidity, roomTemperature);
  const canStep = climateCanStep(model);
  const range = model.mode === 'heat_cool';
  const swing = climateSwingToggle(model);
  const foot = climateFoot(model, dt, roomHumidity, Boolean(swing?.on));

  return (
    <div
      className={clsx('dv-tile dv-climate', `dv-cl-${CLIMATE_TONE[model.mode]}`, on && 'is-lit-climate', !model.available && 'is-unavailable')}
      data-testid="climate-card"
    >
      <button
        type="button"
        className="dv-tile-body"
        onClick={onOpenPanel}
        disabled={!model.available}
        aria-label={dt('controlsOf', { name: model.name, status: on ? `${status}, ${caption.toLocaleLowerCase(locale)} ${big}` : status })}
      />
      <div className="dv-climate-top">
        <button
          type="button"
          className="dv-icon-button"
          aria-pressed={on}
          aria-label={powerLabel}
          disabled={!model.available}
          onClick={() => onAction({ type: on ? 'turn_off' : 'turn_on' })}
        >
          <Icon size={21} strokeWidth={2} aria-hidden="true" />
        </button>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[15px] font-semibold">{model.name}</span>
          <span className="dv-climate-sub truncate text-[13px] font-medium">{status}</span>
        </span>
        <span className="dv-climate-sub flex opacity-75" aria-hidden="true">
          <ChevronRight size={15} strokeWidth={2.4} />
        </span>
      </div>
      <div className="dv-climate-mid">
        <span className="flex min-w-0 flex-col">
          <span className="dv-climate-sub text-[13px] font-semibold">{caption}</span>
          <span aria-live="polite" className="whitespace-nowrap text-[44px] font-semibold leading-[1.05] tracking-[-0.04em] tabular-nums">
            {big}
          </span>
        </span>
        {canStep ? (
          <span className="relative z-[1] flex gap-2">
            <button
              type="button"
              className="dv-step"
              aria-label={dt(range ? 'lowerRange' : 'lowerTemperature', { t: big })}
              onClick={() => onAction({ type: 'step', delta: -1 })}
            >
              <Minus size={20} strokeWidth={2.4} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="dv-step"
              aria-label={dt(range ? 'raiseRange' : 'raiseTemperature', { t: big })}
              onClick={() => onAction({ type: 'step', delta: 1 })}
            >
              <Plus size={20} strokeWidth={2.4} aria-hidden="true" />
            </button>
          </span>
        ) : null}
      </div>
      <div className="dv-climate-foot">
        {foot ? <span className="dv-climate-sub truncate text-[13px] font-semibold">{foot}</span> : null}
      </div>
    </div>
  );
}

export default ClimateCard;
