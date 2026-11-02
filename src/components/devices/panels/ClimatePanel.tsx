import { Minus, Plus } from 'lucide-react';
import { clsx } from 'clsx';
import GlassToggle from '../../ui/GlassToggle';
import { useDevicesTranslations } from '../../../i18n/devicesTranslations';
import { useI18n } from '../../../i18n/I18nProvider';
import { climateIsOn, climateSwingToggle, type ClimateAction, type ClimateModel } from '../model/climate';
import { CLIMATE_ICONS, CLIMATE_TONE } from '../cards/ClimateCard';
import { CLIMATE_MODE_KEY, climateStatus, degrees, fanPillLabel, presetLabel } from '../cards/climateText';
import { PanelShell } from './PanelShell';

/*
 * The controls of a climate device: the target as a large vertical slider
 * with the room temperature marked on it, or the two ends of a range, or what
 * it is doing when there is nothing to aim at; the modes, the fan, the
 * profile and the swing. The same content wherever the panel opens.
 */

export type ClimatePanelProps = {
  model: ClimateModel;
  roomName?: string;
  roomTemperature?: number | null;
  roomHumidity?: number | null;
  onAction: (action: ClimateAction) => void;
  /** Inside a sheet that has its own title and Close. */
  embedded?: boolean;
  onClose: () => void;
};

export function ClimatePanel({ model, roomName, roomTemperature, roomHumidity, embedded, onAction, onClose }: ClimatePanelProps) {
  const dt = useDevicesTranslations();
  const { locale } = useI18n();
  const on = climateIsOn(model);
  const tone = CLIMATE_TONE[model.mode];
  const Icon = CLIMATE_ICONS[on ? model.mode : 'off'];
  const status = climateStatus(model, dt, locale, roomTemperature);
  const subtitle = roomName ? `${roomName} · ${status}` : status;
  const now = model.current ?? roomTemperature ?? null;
  const single = on && (model.mode === 'heat' || model.mode === 'cool' || model.mode === 'auto') && model.target !== null;
  const range = on && model.mode === 'heat_cool' && model.low !== null && model.high !== null;
  const share = (value: number) => Math.max(0, Math.min(100, ((value - model.min) / (model.max - model.min || 1)) * 100));
  const swing = climateSwingToggle(model);

  const rangeRow = (which: 'high' | 'low') => {
    const value = (which === 'high' ? model.high : model.low) as number;
    const label = which === 'high' ? dt('rangeMax') : dt('rangeMin');
    const lowest = which === 'low' ? model.min : (model.low as number) + 1;
    const highest = which === 'low' ? (model.high as number) - 1 : model.max;
    const move = (delta: number) => {
      const next = Math.round((value + delta * model.step) * 10) / 10;
      if (next < lowest || next > highest) return;
      onAction(which === 'high' ? { type: 'range', low: model.low as number, high: next } : { type: 'range', low: next, high: model.high as number });
    };
    return (
      <div key={which} className="flex min-h-[76px] items-center gap-3">
        <span className="flex flex-1 flex-col">
          <span className="dv-t2 text-[13px] font-bold">{label}</span>
          <span className="text-[32px] font-bold tracking-[-0.03em] tabular-nums">{degrees(value, locale)}</span>
        </span>
        <button
          type="button"
          className="dv-step dv-step-strong"
          aria-label={dt('lowerWhat', { what: label.toLocaleLowerCase(locale) })}
          aria-disabled={value - model.step < lowest}
          onClick={() => move(-1)}
        >
          <Minus size={18} strokeWidth={2.4} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="dv-step dv-step-strong"
          aria-label={dt('raiseWhat', { what: label.toLocaleLowerCase(locale) })}
          aria-disabled={value + model.step > highest}
          onClick={() => move(1)}
        >
          <Plus size={18} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </div>
    );
  };

  const info = (() => {
    if (!on) return { big: now === null ? '—' : degrees(now, locale), caption: dt('infoRoomNow'), note: dt('infoOffNote') };
    if (model.mode === 'dry') {
      return { big: typeof roomHumidity === 'number' ? `${Math.round(roomHumidity)}%` : '—', caption: dt('infoHumidityNow'), note: dt('infoDryNote') };
    }
    if (model.mode === 'fan_only') return { big: model.fanMode ? fanPillLabel(model.fanMode) : 'Auto', caption: dt('infoFanSpeed'), note: dt('infoFanNote') };
    return { big: now === null ? '—' : degrees(now, locale), caption: dt('infoRoomNow'), note: dt('infoAutoNote') };
  })();

  return (
    <PanelShell
      className={`dv-cl-${tone}`}
      icon={<Icon size={23} strokeWidth={2} />}
      iconClassName="transition-[background] duration-300"
      iconStyle={
        on
          ? { background: 'var(--cl-solid)', color: '#ffffff', boxShadow: '0 8px 22px -6px rgb(var(--cl-rgb) / 0.8)' }
          : { background: 'var(--dv-icon-off)', color: 'var(--dv-t2)' }
      }
      name={model.name}
      subtitle={subtitle}
      liveSubtitle
      power={{ on, highlighted: on, available: model.available, name: model.name, onToggle: () => onAction({ type: on ? 'turn_off' : 'turn_on' }) }}
      embedded={embedded}
      onClose={onClose}
    >

      <div className="dv-panel-body">
        {single ? (
          <div className="dv-vslider">
            <span
              className="dv-vslider-fill"
              aria-hidden="true"
              style={{ height: `${share(model.target as number).toFixed(1)}%`, background: 'linear-gradient(0deg, var(--cl-solid), rgb(var(--cl-rgb) / 0.95))' }}
            />
            {now !== null ? (
              <span className="dv-climate-now" aria-hidden="true" style={{ bottom: `${share(now).toFixed(1)}%` }}>
                <span>{dt('nowAt', { t: degrees(now, locale) })}</span>
              </span>
            ) : null}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-[18px] flex flex-col items-center"
              style={share(model.target as number) > 82 ? { color: '#ffffff' } : undefined}
            >
              <span className="text-[30px] font-bold tracking-[-0.03em] tabular-nums">{degrees(model.target as number, locale)}</span>
              <span className="text-xs font-semibold opacity-70">{dt(model.mode === 'cool' ? 'captionCool' : model.mode === 'auto' ? 'captionAuto' : 'captionHeat').toLocaleLowerCase(locale)}</span>
            </span>
            <input
              type="range"
              min={model.min}
              max={model.max}
              step={model.step}
              value={model.target as number}
              disabled={!model.available}
              onChange={(event) => onAction({ type: 'target', target: Number(event.target.value) })}
              aria-label={dt('targetOf', { name: model.name })}
              aria-valuetext={degrees(model.target as number, locale)}
              aria-orientation="vertical"
            />
          </div>
        ) : range ? (
          <div className="dv-card dv-climate-side flex flex-col gap-1.5">
            {rangeRow('high')}
            {rangeRow('low')}
            <span className="dv-t2 text-[13px] font-medium leading-[1.4]">
              {dt('rangeNote', {
                low: degrees(model.low as number, locale),
                high: degrees(model.high as number, locale),
                now: now === null ? '—' : degrees(now, locale),
              })}
            </span>
          </div>
        ) : (
          <div className="dv-card dv-climate-side flex flex-col items-center justify-center gap-1.5 text-center">
            <span className="text-[44px] font-bold tracking-[-0.04em] tabular-nums">{info.big}</span>
            <span className="dv-t2 text-[13px] font-bold">{info.caption}</span>
            <span className="dv-t2 text-[13px] font-medium leading-[1.4]">{info.note}</span>
          </div>
        )}

        <div className="dv-panel-side">
          <div className="flex flex-col gap-2">
            <span className="dv-t2 text-[13px] font-bold">{dt('modes')}</span>
            <div
              role="radiogroup"
              aria-label={dt('modes')}
              className={clsx('grid gap-2', model.modes.length > 2 ? 'grid-cols-3' : 'grid-cols-2')}
            >
              {model.modes.map((mode) => {
                const ModeIcon = CLIMATE_ICONS[mode];
                const selected = model.mode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={!model.available}
                    className={clsx('dv-climate-mode', `dv-cl-${CLIMATE_TONE[mode]}`, selected && 'is-on')}
                    onClick={() => onAction({ type: 'mode', mode })}
                  >
                    <ModeIcon size={20} strokeWidth={2} aria-hidden="true" />
                    <span>{dt(CLIMATE_MODE_KEY[mode])}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {on && model.fanModes.length > 0 ? (
            <div className="flex flex-col gap-2">
              <span className="dv-t2 text-[13px] font-bold">{dt('fanLabel')}</span>
              <div className="flex flex-wrap gap-2" role="group" aria-label={dt('fanLabel')}>
                {model.fanModes.map((fanMode) => (
                  <button
                    key={fanMode}
                    type="button"
                    className={clsx('dv-option', model.fanMode === fanMode && 'is-on')}
                    aria-pressed={model.fanMode === fanMode}
                    onClick={() => onAction({ type: 'fan', fanMode })}
                  >
                    {fanPillLabel(fanMode)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {on && model.presets.length > 0 ? (
            <div className="flex flex-col gap-2">
              <span className="dv-t2 text-[13px] font-bold">{dt('presetLabel')}</span>
              <div className="flex flex-wrap gap-2" role="group" aria-label={dt('presetLabel')}>
                {model.presets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={clsx('dv-option', model.preset === preset && 'is-on')}
                    aria-pressed={model.preset === preset}
                    onClick={() => onAction({ type: 'preset', preset })}
                  >
                    {presetLabel(preset, dt)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {on && swing ? (
            <div className="dv-card flex items-center gap-3 !py-3">
              <span className="flex-1 text-[15px] font-semibold">{dt('swingLabel')}</span>
              <GlassToggle
                checked={swing.on}
                onChange={(value) => onAction({ type: 'swing', swing: value ? swing.onMode : 'off' })}
                label={dt('swingLabel')}
              />
            </div>
          ) : null}
        </div>
      </div>
    </PanelShell>
  );
}

export default ClimatePanel;
