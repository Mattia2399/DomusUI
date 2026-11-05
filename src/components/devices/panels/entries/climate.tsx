import { Crosshair, Droplets, Fan, Leaf, MoveHorizontal, MoveVertical, SlidersHorizontal } from 'lucide-react';
import { useDevicesTranslations } from '../../../../i18n/devicesTranslations';
import { useI18n } from '../../../../i18n/I18nProvider';
import { usePanelSpecTranslations } from '../../../../i18n/panelSpecTranslations';
import { GlassChips } from '../../../ui/GlassChips';
import { GlassChoiceRows } from '../../../ui/GlassListRow';
import { GlassSegmented } from '../../../ui/GlassSegmented';
import { GlassSlider } from '../../../ui/GlassSlider';
import { GlassStepper } from '../../../ui/GlassStepper';
import { GlassTiles } from '../../../ui/GlassTiles';
import { GlassVerticalSlider } from '../../../ui/GlassVerticalSlider';
import { CLIMATE_ICONS } from '../../cards/ClimateCard';
import { CLIMATE_MODE_KEY, climateStatus, degrees, fanPillLabel, presetLabel } from '../../cards/climateText';
import { climateIsOn, climateNearestTarget, climateSwingToggle, type ClimateAction, type ClimateModel } from '../../model/climate';
import type { ClimateExtraAction, ClimateExtras } from '../../model/climateExtras';
import { CLIMATE_TINT } from '../../model/panelTint';
import type { PanelControl, PanelEntry, PanelSpec } from '../registry';
import { PanelHeroValue } from '../shell/PanelHero';
import { accentOf, ICON } from './shared';
import './climate.css';

/*
 * A climate device: the target it aims at, with the room marked on it. With a range, or
 * with nothing to aim at, a card of its values takes the place of the slider.
 */

export type ClimatePanelInput = {
  model: ClimateModel;
  roomName?: string;
  roomTemperature?: number | null;
  roomHumidity?: number | null;
  extras?: ClimateExtras;
  onAction: (action: ClimateAction) => void;
  onExtraAction?: (action: ClimateExtraAction) => void;
};

/** Beyond this the tiles leave no room for their names: a list. */
const MOST_TILES = 6;

const LEVEL_ORDER = ['silent', 'quiet', 'low', 'medium_low', 'medium', 'middle', 'mid', 'medium_high', 'high', 'strong', 'turbo', 'max'];

/** The modes of a fan as steps of one scale, when they are: numbers, or the usual words. */
function fanLevelsOf(modes: readonly string[]) {
  const auto = modes.find((mode) => mode.trim().toLowerCase() === 'auto') ?? null;
  const steps = modes.filter((mode) => mode !== auto);
  if (steps.length < 2) return null;
  const rank = (mode: string) => {
    const name = mode.trim().toLowerCase();
    const number = Number(name);
    return Number.isFinite(number) && name !== '' ? number : LEVEL_ORDER.indexOf(name);
  };
  if (steps.some((mode) => rank(mode) < 0)) return null;
  return { auto, steps: [...steps].sort((first, second) => rank(first) - rank(second)) };
}

function useClimateSpec({ model, roomName, roomTemperature, roomHumidity, extras, onAction, onExtraAction }: ClimatePanelInput): PanelSpec {
  const dt = useDevicesTranslations();
  const sp = usePanelSpecTranslations();
  const { locale, t } = useI18n();
  const on = climateIsOn(model);
  const Icon = CLIMATE_ICONS[on ? model.mode : 'off'];
  const status = climateStatus(model, dt, locale, roomTemperature);
  const now = model.current ?? roomTemperature ?? null;
  const single = on && (model.mode === 'heat' || model.mode === 'cool' || model.mode === 'auto') && model.target !== null;
  const range = on && model.mode === 'heat_cool' && model.low !== null && model.high !== null;
  const swing = climateSwingToggle(model);
  const chips = (label: string, options: readonly string[], value: string | null | undefined, onPick: (option: string) => void, nameOf: (option: string) => string = (option) => option) => (
    <GlassChips<string> size="dialog" ariaLabel={label} options={options.map((option) => ({ value: option, label: nameOf(option) }))} value={value} onChange={onPick} />
  );
  const rows = (label: string, options: readonly string[], value: string | null | undefined, onPick: (option: string) => void, nameOf: (option: string) => string = (option) => option, size: 'default' | 'hero' = 'hero') => (
    <GlassChoiceRows<string> size={size} ariaLabel={label} options={options.map((option) => ({ value: option, label: nameOf(option) }))} value={value} onChange={onPick} />
  );

  // Off is always the last choice, wherever the entity lists it.
  const modeOptions = [...model.modes].sort((first, second) => Number(first === 'off') - Number(second === 'off')).map((mode) => {
    const ModeIcon = CLIMATE_ICONS[mode];
    const keeps = (mode === 'heat' || mode === 'cool' || mode === 'auto') && model.target !== null ? sp.t('modeKeeps', { value: degrees(model.target, locale) }) : undefined;
    return { value: mode, label: dt(CLIMATE_MODE_KEY[mode]), note: keeps, icon: <ModeIcon size={24} strokeWidth={2} /> };
  });
  const controls: PanelControl[] = [
    {
      id: 'modes',
      icon: <SlidersHorizontal {...ICON} />,
      label: dt('modes'),
      value: dt(CLIMATE_MODE_KEY[model.mode]),
      looks: model.modes.length > MOST_TILES ? ['list'] : ['tiles', 'list'],
      big: (look) =>
        look === 'list' ? (
          <GlassChoiceRows size="hero" ariaLabel={dt('modes')} disabled={!model.available} options={modeOptions} value={model.mode} onChange={(mode) => onAction({ type: 'mode', mode })} />
        ) : (
          <GlassTiles size="hero" ariaLabel={dt('modes')} disabled={!model.available} options={modeOptions} value={model.mode} onChange={(mode) => onAction({ type: 'mode', mode })} />
        ),
      group:
        model.modes.length <= 3 ? (
          <GlassSegmented className="panel-seg" ariaLabel={dt('modes')} tone="device" disabled={!model.available} options={modeOptions.map(({ value, label }) => ({ value, label }))} value={model.mode} onChange={(mode) => onAction({ type: 'mode', mode })} />
        ) : (
          <GlassTiles ariaLabel={dt('modes')} disabled={!model.available} options={modeOptions} value={model.mode} onChange={(mode) => onAction({ type: 'mode', mode })} />
        ),
    },
  ];
  if (model.fanModes.length > 0) {
    const levels = fanLevelsOf(model.fanModes);
    const pickFan = (fanMode: string) => onAction({ type: 'fan', fanMode });
    const isAuto = model.fanMode !== null && model.fanMode === levels?.auto;
    const levelIndex = levels ? levels.steps.indexOf(model.fanMode ?? '') : -1;
    controls.push({
      id: 'fan',
      icon: <Fan {...ICON} />,
      label: dt('fanLabel'),
      value: model.fanMode ? fanPillLabel(model.fanMode) : undefined,
      looks: levels ? ['levels', 'list'] : ['list'],
      big: (look) =>
        look === 'levels' && levels ? (
          <>
            <GlassVerticalSlider
              label={dt('fanLabel')}
              value={Math.max(0, levelIndex) + 1}
              min={1}
              max={levels.steps.length}
              commit="release"
              tone={isAuto ? 'neutral' : 'device'}
              ticks={levels.steps.slice(1).map((_, index) => Number((((index + 1) / levels.steps.length) * 100).toFixed(1)))}
              fillPercent={isAuto ? 0 : ((Math.max(0, levelIndex) + 1) / levels.steps.length) * 100}
              display={model.fanMode ? fanPillLabel(model.fanMode) : '—'}
              subtitle={dt('fanLabel')}
              onValueChange={(value) => pickFan(levels.steps[value - 1])}
            />
            {levels.auto ? (
              <GlassChips<string> ariaLabel={sp.t('fanAutomatic')} options={[{ value: levels.auto, label: sp.t('fanAutomatic') }]} value={isAuto ? levels.auto : null} onChange={pickFan} />
            ) : null}
          </>
        ) : (
          rows(dt('fanLabel'), model.fanModes, model.fanMode, pickFan, fanPillLabel)
        ),
      group:
        levels && model.fanModes.length <= 6 ? (
          <GlassSegmented<string> className="panel-seg" ariaLabel={dt('fanLabel')} options={model.fanModes.map((mode) => ({ value: mode, label: fanPillLabel(mode) }))} value={model.fanMode ?? ''} onChange={pickFan} />
        ) : (
          chips(dt('fanLabel'), model.fanModes, model.fanMode, pickFan, fanPillLabel)
        ),
    });
  }
  if (model.presets.length > 0) {
    const nameOf = (preset: string) => presetLabel(preset, dt);
    const pickPreset = (preset: string) => onAction({ type: 'preset', preset });
    controls.push({
      id: 'preset',
      icon: <Leaf {...ICON} />,
      label: dt('presetLabel'),
      value: model.preset ? nameOf(model.preset) : undefined,
      looks: ['list'],
      big: () => rows(dt('presetLabel'), model.presets, model.preset, pickPreset, nameOf),
      group: chips(dt('presetLabel'), model.presets, model.preset, pickPreset, nameOf),
    });
  }
  // One target and a room to read: nothing to align with a range, or with no target at all.
  if (model.target !== null && model.mode !== 'heat_cool' && now !== null) {
    const target = climateNearestTarget(model, now);
    controls.push({
      id: 'align',
      icon: <Crosshair {...ICON} />,
      label: t('controls.climate.align'),
      value: sp.t('alignNow', { value: degrees(now, locale) }),
      actionLabel: sp.t('alignTo', { value: degrees(target, locale) }),
      note: sp.t('alignNote'),
      onPress: () => onAction({ type: 'target', target }),
    });
  }
  const louvers = extras?.supportsHorizontalSwing && onExtraAction ? extras.horizontalSwingModes ?? [] : [];
  if (swing && louvers.length === 0) {
    controls.push({
      id: 'swing',
      icon: <MoveVertical {...ICON} />,
      label: dt('panelSwing'),
      note: sp.t('swingNote'),
      on: swing.on,
      onPress: () => onAction({ type: 'swing', swing: swing.on ? 'off' : swing.onMode }),
    });
  } else if (model.swingModes.length > 0 || louvers.length > 0) {
    const pickVertical = (mode: string) => onAction({ type: 'swing', swing: mode });
    const pickHorizontal = (mode: string) => onExtraAction?.({ type: 'horizontal_swing', mode });
    const both = model.swingModes.length > 0 && louvers.length > 0;
    controls.push({
      id: 'swing',
      icon: <MoveVertical {...ICON} />,
      label: dt('panelSwing'),
      value: model.swing ?? extras?.horizontalSwing,
      looks: ['list'],
      big: () => (
        <div className="panel-two-lists is-big-list">
          {model.swingModes.length > 0 ? (
            <>
              {both ? <p className="glass-list-heading">{sp.t('swingVertical')}</p> : null}
              {rows(dt('panelSwing'), model.swingModes, model.swing, pickVertical, undefined, 'default')}
            </>
          ) : null}
          {louvers.length > 0 ? (
            <>
              {both ? <p className="glass-list-heading">{sp.t('swingHorizontal')}</p> : null}
              {rows(t('controls.climate.horizontalLouvers'), louvers, extras?.horizontalSwing, pickHorizontal, undefined, 'default')}
            </>
          ) : null}
        </div>
      ),
      group: (
        <>
          {model.swingModes.length > 0 ? chips(dt('panelSwing'), model.swingModes, model.swing, pickVertical) : null}
          {louvers.length > 0 ? chips(t('controls.climate.horizontalLouvers'), louvers, extras?.horizontalSwing, pickHorizontal) : null}
        </>
      ),
    });
  }
  const humidity = extras?.targetHumidity;
  if (extras?.supportsTargetHumidity && typeof humidity === 'number' && onExtraAction) {
    const min = extras.minHumidity ?? 30;
    const max = extras.maxHumidity ?? 99;
    const step = extras.targetHumidityStep ?? 1;
    const change = (value: number) => onExtraAction({ type: 'humidity', value });
    controls.push({
      id: 'humidity',
      icon: <Droplets {...ICON} />,
      label: dt('panelHumidity'),
      title: dt('humidityTarget'),
      value: `${humidity}%`,
      note: typeof roomHumidity === 'number' ? sp.t('humidityRoom', { value: Math.round(roomHumidity) }) : undefined,
      looks: ['slider'],
      big: () => (
        <GlassVerticalSlider
          label={dt('humidityTarget')}
          value={humidity}
          min={min}
          max={max}
          step={step}
          commit="release"
          display={`${humidity}%`}
          subtitle={dt('panelHumidity')}
          valueText={`${humidity}%`}
          current={typeof roomHumidity === 'number' ? { value: roomHumidity, label: dt('nowAt', { t: `${Math.round(roomHumidity)}%` }) } : undefined}
          onValueChange={change}
        />
      ),
      group: <GlassSlider variant="bar" tone="device" commit="release" min={min} max={max} step={step} label={dt('humidityTarget')} value={humidity} valueText={`${humidity}%`} onValueChange={change} />,
    });
  }

  const stepper = (which: 'low' | 'high') => {
    const low = model.low as number;
    const high = model.high as number;
    const label = which === 'high' ? dt('rangeMax') : dt('rangeMin');
    const what = label.toLocaleLowerCase(locale);
    return (
      <GlassStepper
        label={label}
        decreaseLabel={dt('lowerWhat', { what })}
        increaseLabel={dt('raiseWhat', { what })}
        value={which === 'high' ? high : low}
        min={which === 'high' ? low + model.step : model.min}
        max={which === 'high' ? model.max : high - model.step}
        step={model.step}
        format={(value) => `${label} ${degrees(value, locale)}`}
        disabled={!model.available}
        onValueChange={(value) => onAction({ type: 'range', low: which === 'low' ? value : low, high: which === 'high' ? value : high })}
      />
    );
  };

  const info = !on
    ? { big: now === null ? '—' : degrees(now, locale), caption: dt('infoRoomNow'), note: dt('infoOffNote') }
    : model.mode === 'dry'
      ? { big: typeof roomHumidity === 'number' ? `${Math.round(roomHumidity)}%` : '—', caption: dt('infoHumidityNow'), note: dt('infoDryNote') }
      : model.mode === 'fan_only'
        ? { big: model.fanMode ? fanPillLabel(model.fanMode) : 'Auto', caption: dt('infoFanSpeed'), note: dt('infoFanNote') }
        : { big: now === null ? '—' : degrees(now, locale), caption: dt('infoRoomNow'), note: dt('infoAutoNote') };

  return {
    owner: model.entityId,
    name: model.name,
    status: roomName ? `${roomName} · ${status}` : status,
    layout: model.modes.length === 2 ? 'stove' : 'climate',
    heroName: single
      ? sp.t('heroTarget', { value: degrees(model.target as number, locale) })
      : range
        ? sp.t('heroTarget', { value: `${degrees(model.low as number, locale)} – ${degrees(model.high as number, locale)}` })
        : `${info.caption} ${info.big}`,
    accent: accentOf(CLIMATE_TINT[model.mode]),
    tint: on,
    heroKind: single ? 'slider' : range ? 'data' : 'value',
    hero: single ? (
      <GlassVerticalSlider
        label={dt('targetOf', { name: model.name })}
        value={model.target as number}
        min={model.min}
        max={model.max}
        step={model.step}
        disabled={!model.available}
        display={degrees(model.target as number, locale)}
        subtitle={dt(model.mode === 'cool' ? 'captionCool' : model.mode === 'auto' ? 'captionAuto' : 'captionHeat').toLocaleLowerCase(locale)}
        valueText={degrees(model.target as number, locale)}
        current={now !== null ? { value: now, label: dt('nowAt', { t: degrees(now, locale) }) } : undefined}
        onValueChange={(target) => onAction({ type: 'target', target })}
      />
    ) : range ? (
      <div className="dv-card panel-climate-range">
        <b>
          {new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(model.low as number)}–{degrees(model.high as number, locale)}
        </b>
        <span>{sp.t('rangeOf', { value: now === null ? '—' : degrees(now, locale) })}</span>
        {stepper('high')}
        {stepper('low')}
      </div>
    ) : (
      <PanelHeroValue
        icon={<Icon size={28} strokeWidth={2} />}
        value={info.big}
        note={
          <>
            {info.caption}
            <br />
            {info.note}
          </>
        }
      />
    ),
    controls,
    action: {
      kind: 'power',
      on,
      disabled: !model.available,
      label: dt(on ? 'turnOff' : 'turnOn', { name: model.name }),
      onPress: () => onAction({ type: on ? 'turn_off' : 'turn_on' }),
    },
  };
}

export const climateEntry: PanelEntry<ClimatePanelInput> = { useSpec: useClimateSpec };
