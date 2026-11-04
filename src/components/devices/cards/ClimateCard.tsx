import { Check, ChevronRight, Contrast, Droplet, Fan, Flame, Minus, Plus, Power, Snowflake, type LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';
import type { ReactNode } from 'react';
import { useDevicesTranslations, type DevicesTranslationKey } from '../../../i18n/devicesTranslations';
import { useI18n } from '../../../i18n/I18nProvider';
import { climateCanStep, climateIsOn, climateSwingToggle, type ClimateAction, type ClimateMode, type ClimateModel } from '../model/climate';
import { usePanelPreload } from '../panels/panelPreload';
import { DeviceCardShell, deviceCardSize, type DeviceCardFormat } from './DeviceCardShell';
import { climateActivityWord, climateBig, climateCompactStatus, climateFoot, climateStatus, degrees } from './climateText';
import '../theme/cardSizes.css';
import '../theme/devices.css';

/*
 * A climate device. The large card (two columns, as the main unit of a room)
 * turns the colour of its mode when on, shows the target in large type with −
 * and +, and a line about the fan or the humidity. The small card is for the
 * other units of a room: radiator valves, underfloor heating.
 *
 * On the Home grid a card takes the three sizes of the board
 * (docs/design-reference/CoreCards.dc.html): Mini U×2, the state of a room;
 * Standard U×4, the target with − and +; Expanded W×4, the target, the room
 * temperature and the quick modes.
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

const QUICK_MODES: Partial<Record<ClimateMode, DevicesTranslationKey>> = {
  off: 'modeShortOff',
  heat: 'modeShortHeat',
  cool: 'modeShortCool',
  heat_cool: 'modeShortHeatCool',
};

export type ClimateCardProps = {
  model: ClimateModel;
  /** A format of the Home grid. Without it `size` keeps the cards of a room. */
  format?: DeviceCardFormat;
  size?: 'large' | 'small';
  roomTemperature?: number | null;
  roomHumidity?: number | null;
  editing?: boolean;
  selected?: boolean;
  onAction: (action: ClimateAction) => void;
  onOpenPanel: () => void;
  onSelect?: () => void;
};

export function ClimateCard({
  model,
  format,
  size = 'large',
  roomTemperature,
  roomHumidity,
  editing = false,
  selected = false,
  onAction,
  onOpenPanel,
  onSelect,
}: ClimateCardProps) {
  const dt = useDevicesTranslations();
  const { locale } = useI18n();
  const preload = usePanelPreload('climate');
  const on = climateIsOn(model);
  const Icon = CLIMATE_ICONS[on ? model.mode : 'off'];
  const powerLabel = dt(on ? 'turnOff' : 'turnOn', { name: model.name });
  const status = climateStatus(model, dt, locale, roomTemperature);
  const shape: DeviceCardFormat = format ?? (size === 'small' ? 'U×2' : 'W×4');

  if (deviceCardSize(shape) === 'mini') {
    const compact = climateCompactStatus(model, dt, locale);
    return (
      <DeviceCardShell
        panelKind="climate"
        format="U×2"
        name={model.name}
        status={compact}
        icon={<Icon size={21} strokeWidth={2} aria-hidden="true" />}
        isOn={on}
        available={model.available}
        tone={on ? `cl-${CLIMATE_TONE[model.mode]}` : null}
        hasPanel
        editing={editing}
        selected={selected}
        toggleLabel={powerLabel}
        openLabel={dt('controlsOf', { name: model.name, status: compact })}
        selectLabel={dt('select', { name: model.name })}
        onToggle={() => onAction({ type: on ? 'turn_off' : 'turn_on' })}
        onOpenPanel={onOpenPanel}
        onSelect={onSelect}
      />
    );
  }

  const { caption, big } = climateBig(model, dt, locale, roomHumidity, roomTemperature);
  const canStep = climateCanStep(model);
  const range = model.mode === 'heat_cool';
  const swing = climateSwingToggle(model);
  const foot = climateFoot(model, dt, roomHumidity, Boolean(swing?.on));
  const openLabel = dt('controlsOf', { name: model.name, status: on ? `${status}, ${caption.toLocaleLowerCase(locale)} ${big}` : status });

  if (!format) {
    return (
      <div
        {...preload}
        className={clsx('dv-tile dv-climate', `dv-cl-${CLIMATE_TONE[model.mode]}`, on && 'is-lit-climate', !model.available && 'is-unavailable')}
        data-testid="climate-card"
      >
        <button
          type="button"
          className="dv-tile-body"
          onClick={onOpenPanel}
          disabled={!model.available}
          aria-label={openLabel}
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

  const expanded = deviceCardSize(shape) === 'expanded';
  const select = () => onSelect?.();

  const steps = canStep ? (
    <span className="relative z-[1] flex flex-none gap-1.5">
      <button
        type="button"
        className={clsx('dv-step', !expanded && 'dv-step-m')}
        aria-label={dt(range ? 'lowerRange' : 'lowerTemperature', { t: big })}
        onClick={() => onAction({ type: 'step', delta: -1 })}
      >
        <Minus size={18} strokeWidth={2.6} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={clsx('dv-step', !expanded && 'dv-step-m')}
        aria-label={dt(range ? 'raiseRange' : 'raiseTemperature', { t: big })}
        onClick={() => onAction({ type: 'step', delta: 1 })}
      >
        <Plus size={18} strokeWidth={2.6} aria-hidden="true" />
      </button>
    </span>
  ) : null;

  const quickModes = (Object.keys(QUICK_MODES) as ClimateMode[]).filter((mode) => model.modes.includes(mode));
  const now = model.current ?? roomTemperature ?? null;

  return (
    <div
      {...preload}
      className={clsx(
        'dv-tile dv-climate dv-climate-format',
        `dv-cl-${CLIMATE_TONE[model.mode]}`,
        on && 'is-lit-climate',
        editing && 'is-editing',
        editing && selected && 'is-selected',
        !model.available && 'is-unavailable',
      )}
      data-format={shape}
      data-testid="climate-card"
    >
      <button
        type="button"
        className="dv-tile-body"
        onClick={editing ? select : onOpenPanel}
        disabled={!model.available && !editing}
        aria-pressed={editing ? selected : undefined}
        aria-label={editing ? dt('select', { name: model.name }) : openLabel}
      />
      <div className="dv-size-body">
        <div className="dv-size-head">
          <button
            type="button"
            className="dv-icon-button"
            onClick={editing ? select : () => onAction({ type: on ? 'turn_off' : 'turn_on' })}
            disabled={!model.available && !editing}
            aria-pressed={editing ? undefined : on}
            aria-label={editing ? undefined : powerLabel}
            aria-hidden={editing ? true : undefined}
            tabIndex={editing ? -1 : undefined}
          >
            <Icon size={21} strokeWidth={2} aria-hidden="true" />
          </button>
          <span className="dv-size-text">
            <span className={clsx('dv-name', expanded && 'dv-name-1')}>{model.name}</span>
            <span className="dv-climate-sub truncate text-[13px] font-medium">
              {!model.available ? dt('unavailable') : expanded ? status : on ? climateActivityWord(model, dt) : status}
            </span>
          </span>
          {expanded && now !== null ? (
            <span className="dv-climate-room">
              <b>{degrees(now, locale)}</b>
              <span>{typeof roomHumidity === 'number' ? `${dt('captionRoom')} · ${dt('humidityPct', { pct: Math.round(roomHumidity) })}` : dt('captionRoom')}</span>
            </span>
          ) : null}
        </div>
        <span className="dv-climate-mid">
          <span className="flex min-w-0 flex-col">
            <span className="dv-climate-sub whitespace-nowrap text-[13px] font-semibold">{caption}</span>
            <span aria-live="polite" className={clsx('whitespace-nowrap font-semibold leading-[1.02] tracking-[-0.04em] tabular-nums', expanded ? 'text-[40px]' : 'text-[36px]')}>
              {big}
            </span>
          </span>
          {steps}
        </span>
        {expanded && quickModes.length > 1 ? (
          <div className="dv-pills dv-climate-modes" role="radiogroup" aria-label={dt('climateModes')}>
            {quickModes.map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={model.mode === mode}
                className={clsx('dv-pill', model.mode === mode && 'is-on')}
                onClick={() => onAction({ type: 'mode', mode })}
              >
                {dt(QUICK_MODES[mode]!)}
              </button>
            ))}
            {foot ? <span className="dv-climate-sub ml-auto truncate text-xs font-semibold">{foot}</span> : null}
          </div>
        ) : null}
      </div>
      {editing ? (
        <span className={clsx('dv-check', selected && 'is-selected')} aria-hidden="true">
          <Check size={12} strokeWidth={3.2} />
        </span>
      ) : null}
    </div>
  );
}

export default ClimateCard;
