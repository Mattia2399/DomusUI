import { Crosshair, Droplets, Fan, Leaf, MoveHorizontal, MoveVertical, SlidersHorizontal } from 'lucide-react';
import { useDevicesTranslations } from '../../../../i18n/devicesTranslations';
import { useI18n } from '../../../../i18n/I18nProvider';
import { usePanelSpecTranslations } from '../../../../i18n/panelSpecTranslations';
import { GlassChips } from '../../../ui/GlassChips';
import { GlassSlider } from '../../../ui/GlassSlider';
import { GlassStepper } from '../../../ui/GlassStepper';
import { GlassTiles } from '../../../ui/GlassTiles';
import { GlassVerticalSlider } from '../../../ui/GlassVerticalSlider';
import { CLIMATE_ICONS } from '../../cards/ClimateCard';
import { CLIMATE_MODE_KEY, climateStatus, degrees, fanPillLabel, presetLabel } from '../../cards/climateText';
import { climateIsOn, climateNearestTarget, climateSwingToggle, type ClimateAction, type ClimateModel } from '../../model/climate';
import type { ClimateExtraAction, ClimateExtras } from '../../model/climateExtras';
import { CLIMATE_TINT } from '../../model/panelTint';
import type { PanelEntry, PanelItem, PanelPlace, PanelSpec } from '../registry';
import { PanelHeroValue } from '../shell/PanelHero';
import { accentOf, chipSize, ICON } from './shared';
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

const FILL = { background: 'linear-gradient(0deg, color-mix(in srgb, var(--device-accent) 72%, #000), var(--device-accent))' };

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
  const chips = (label: string, options: readonly string[], value: string | null | undefined, onPick: (option: string) => void, nameOf: (option: string) => string = (option) => option) => (place: PanelPlace) => (
    <GlassChips<string> size={chipSize(place)} ariaLabel={label} options={options.map((option) => ({ value: option, label: nameOf(option) }))} value={value} onChange={onPick} />
  );

  const shortcuts: PanelItem[] = [
    {
      key: 'modes',
      kind: 'opens',
      icon: <SlidersHorizontal {...ICON} />,
      label: dt('modes'),
      value: dt(CLIMATE_MODE_KEY[model.mode]),
      content: () => (
        <GlassTiles
          ariaLabel={dt('modes')}
          disabled={!model.available}
          options={model.modes.map((mode) => {
            const ModeIcon = CLIMATE_ICONS[mode];
            return { value: mode, label: dt(CLIMATE_MODE_KEY[mode]), icon: <ModeIcon size={20} strokeWidth={2} /> };
          })}
          value={model.mode}
          onChange={(mode) => onAction({ type: 'mode', mode })}
        />
      ),
    },
  ];
  if (on && model.fanModes.length > 0) {
    shortcuts.push({
      key: 'fan',
      kind: 'opens',
      icon: <Fan {...ICON} />,
      label: dt('fanLabel'),
      value: model.fanMode ? fanPillLabel(model.fanMode) : undefined,
      content: chips(dt('fanLabel'), model.fanModes, model.fanMode, (fanMode) => onAction({ type: 'fan', fanMode }), fanPillLabel),
    });
  }
  if (on && model.presets.length > 0) {
    const nameOf = (preset: string) => presetLabel(preset, dt);
    shortcuts.push({
      key: 'preset',
      kind: 'opens',
      icon: <Leaf {...ICON} />,
      label: dt('presetLabel'),
      value: model.preset ? nameOf(model.preset) : undefined,
      content: chips(dt('presetLabel'), model.presets, model.preset, (preset) => onAction({ type: 'preset', preset }), nameOf),
    });
  }
  if (on && swing) {
    shortcuts.push({
      key: 'swing',
      kind: 'toggle',
      icon: <MoveVertical {...ICON} />,
      label: dt('panelSwing'),
      note: sp.t('swingNote'),
      on: swing.on,
      onPress: () => onAction({ type: 'swing', swing: swing.on ? 'off' : swing.onMode }),
    });
  } else if (on && model.swingModes.length > 0) {
    // Modes that are not only on and off: each by the name the device gives it.
    shortcuts.push({
      key: 'swing',
      kind: 'opens',
      icon: <MoveVertical {...ICON} />,
      label: dt('panelSwing'),
      value: model.swing ?? undefined,
      content: chips(dt('panelSwing'), model.swingModes, model.swing, (mode) => onAction({ type: 'swing', swing: mode })),
    });
  }
  const humidity = extras?.targetHumidity;
  if (on && extras?.supportsTargetHumidity && typeof humidity === 'number' && onExtraAction) {
    shortcuts.push({
      key: 'humidity',
      kind: 'opens',
      icon: <Droplets {...ICON} />,
      label: dt('panelHumidity'),
      title: dt('humidityTarget'),
      value: `${humidity}%`,
      note: typeof roomHumidity === 'number' ? sp.t('humidityRoom', { value: Math.round(roomHumidity) }) : undefined,
      content: () => (
        <GlassSlider
          variant="bar"
          tone="device"
          commit="release"
          min={extras.minHumidity ?? 30}
          max={extras.maxHumidity ?? 99}
          step={extras.targetHumidityStep ?? 1}
          label={dt('humidityTarget')}
          value={humidity}
          valueText={`${humidity}%`}
          onValueChange={(value) => onExtraAction({ type: 'humidity', value })}
        />
      ),
    });
  }
  const louvers = extras?.horizontalSwingModes ?? [];
  if (on && extras?.supportsHorizontalSwing && louvers.length > 0 && onExtraAction) {
    const title = t('controls.climate.horizontalLouvers');
    shortcuts.push({
      key: 'louvers',
      kind: 'opens',
      icon: <MoveHorizontal {...ICON} />,
      label: dt('panelLouvers'),
      title,
      value: extras.horizontalSwing,
      content: chips(title, louvers, extras.horizontalSwing, (mode) => onExtraAction({ type: 'horizontal_swing', mode })),
    });
  }
  // With one target and a room to read: nothing to align with a range, or with no target at all.
  if (single && now !== null) {
    const target = climateNearestTarget(model, now);
    shortcuts.push({
      key: 'align',
      kind: 'action',
      icon: <Crosshair {...ICON} />,
      label: t('controls.climate.align'),
      actionLabel: sp.t('alignTo', { value: degrees(target, locale) }),
      note: sp.t('alignNote'),
      onPress: () => onAction({ type: 'target', target }),
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
    icon: <Icon size={23} strokeWidth={2} />,
    lit: on,
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
        fillStyle={FILL}
        icon={<Icon size={24} strokeWidth={2} />}
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
    shortcuts,
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
