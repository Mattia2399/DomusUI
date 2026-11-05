import React from 'react';
import { Lightbulb, Palette, Sparkles, Sun, SunDim, Zap } from 'lucide-react';
import { useDevicesTranslations } from '../../../../i18n/devicesTranslations';
import { useI18n } from '../../../../i18n/I18nProvider';
import { GlassChips } from '../../../ui/GlassChips';
import { GlassChoiceRows } from '../../../ui/GlassListRow';
import { GlassColorPicker } from '../../../ui/GlassColorPicker';
import { GlassColorTemperature } from '../../../ui/GlassColorTemperature';
import { GlassSegmented } from '../../../ui/GlassSegmented';
import { GlassSlider } from '../../../ui/GlassSlider';
import { GlassSwatches } from '../../../ui/GlassSwatches';
import { GlassVerticalSlider } from '../../../ui/GlassVerticalSlider';
import { toneTitle } from '../../cards/lightText';
import { LIGHT_HUE_PRESETS, lightTone, type LightAction, type LightModel } from '../../model/light';
import type { LightExtraAction } from '../../model/lightExtras';
import { hueToRgb, lightRgb, rgbCss } from '../../model/tileColor';
import type { PanelControl, PanelEntry } from '../registry';
import { PanelHeroValue } from '../shell/PanelHero';
import { accentOf, ICON } from './shared';
import { usePanelSpecTranslations } from '../../../../i18n/panelSpecTranslations';
import './light.css';

/*
 * A light: its brightness in the middle, and what it exposes of its whites, colours,
 * effects, white channel and flash as controls.
 */

export type LightPanelInput = {
  model: LightModel;
  roomName?: string;
  extras?: {
    supportsWhite?: boolean;
    supportsEffects?: boolean;
    supportsFlash?: boolean;
    effect?: string;
    effects?: string[];
  };
  onAction: (action: LightAction) => void;
  onExtraAction?: (action: LightExtraAction) => void;
};

const TONE_PRESETS = [2700, 4000, 5500];
const FLASH_MS = 1700;
const WHITES_GRADIENT = 'linear-gradient(to top, rgb(255 168 64), rgb(230 197 160), rgb(205 226 255))';
const WHITE_FILL = { background: '#ffffff' };

function useLightSpec({ model, roomName, extras, onAction, onExtraAction }: LightPanelInput) {
  const dt = useDevicesTranslations();
  const sp = usePanelSpecTranslations();
  const { t } = useI18n();
  const rgb = lightRgb(model);
  const pct = model.brightnessPct ?? 100;
  const isColorMode = model.caps === 'color' && model.mode === 'color';
  const lit = model.on && model.available;
  const [flashing, setFlashing] = React.useState(false);
  React.useEffect(() => {
    if (!flashing) return undefined;
    const timer = window.setTimeout(() => setFlashing(false), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [flashing]);

  const effectName = (effect: string) => {
    const key = effect.trim().toLowerCase();
    if (key === 'off' || key === 'none') return t('controls.light.noEffect');
    return sp.effect(key) ?? effect.replace(/_/g, ' ').replace(/^./, (first) => first.toLocaleUpperCase());
  };
  const effects = extras?.supportsEffects && onExtraAction ? extras.effects ?? [] : [];
  const activeEffect = extras?.effect && !['off', 'none'].includes(extras.effect.trim().toLowerCase()) ? extras.effect : null;

  const state = lit
    ? [model.caps === 'onoff' ? dt('panelOnPlain') : dt('panelOn', { pct }), activeEffect ? effectName(activeEffect).toLocaleLowerCase() : null].filter(Boolean).join(' · ')
    : model.available ? dt('off') : dt('unavailable');

  const kind = model.caps === 'color' ? (
    <GlassSegmented<LightModel['mode']>
      className="panel-seg"
      ariaLabel={dt('lightKind')}
      options={[{ value: 'temp', label: dt('white') }, { value: 'color', label: dt('color') }]}
      value={model.mode}
      onChange={(mode) => onAction({ type: 'mode', mode })}
    />
  ) : null;
  const tonePresets = TONE_PRESETS.filter((kelvin) => kelvin >= model.minKelvin && kelvin <= model.maxKelvin);
  const temperature = (
    <GlassColorTemperature
      label={dt('temperature')}
      value={model.kelvin}
      min={model.minKelvin}
      max={model.maxKelvin}
      commit="release"
      presets={tonePresets.map((kelvin) => ({ kelvin, label: toneTitle(lightTone(kelvin), dt) }))}
      presetOn={tonePresets.find((kelvin) => lightTone(kelvin) === lightTone(model.kelvin)) ?? -1}
      onValueChange={(kelvin) => onAction({ type: 'kelvin', kelvin })}
    />
  );
  const swatches = (nowrap: boolean) => (
    <GlassSwatches
      ariaLabel={dt('color')}
      nowrap={nowrap}
      swatches={LIGHT_HUE_PRESETS.map((hue) => ({ value: String(hue), color: rgbCss(hueToRgb(hue)), label: dt('hueSwatch', { hue }) }))}
      value={model.saturation >= 60 ? LIGHT_HUE_PRESETS.map(String).find((hue) => Math.abs(model.hue - Number(hue)) < 6) ?? null : null}
      onChange={(hue) => onAction({ type: 'hue', hue: Number(hue), saturation: 100 })}
    />
  );
  const disc = (
    <GlassColorPicker
      label={dt('customColor')}
      value={{ hue: model.hue, saturation: model.saturation }}
      valueText={(color) => dt('colorValue', { hue: color.hue, saturation: color.saturation })}
      // A saturation of 0 is what a light reports when it is not in a colour.
      onChange={(color) => onAction({ type: 'hue', hue: color.hue, saturation: Math.max(1, color.saturation) })}
    />
  );
  const toneValue = `${toneTitle(lightTone(model.kelvin), dt)} · ${model.kelvin} K`;

  const hasColors = model.caps === 'color';
  const hasWhites = model.caps === 'ct' || (hasColors && model.hasWhites !== false);
  const controls: PanelControl[] = [];
  if (hasWhites) {
    controls.push({
      id: 'whites',
      icon: <SunDim {...ICON} />,
      label: sp.t('whites'),
      value: isColorMode ? undefined : toneValue,
      looks: ['whites'],
      big: () => (
        <>
          <GlassVerticalSlider
            label={dt('temperature')}
            value={model.kelvin}
            min={model.minKelvin}
            max={model.maxKelvin}
            step={100}
            commit="release"
            gradient={WHITES_GRADIENT}
            display={`${model.kelvin} K`}
            subtitle={toneTitle(lightTone(model.kelvin), dt)}
            valueText={toneValue}
            disabled={!model.available}
            onValueChange={(kelvin) => onAction({ type: 'kelvin', kelvin })}
          />
          <GlassChips<number>
            ariaLabel={dt('temperature')}
            options={tonePresets.map((kelvin) => ({ value: kelvin, label: toneTitle(lightTone(kelvin), dt) }))}
            value={tonePresets.find((kelvin) => lightTone(kelvin) === lightTone(model.kelvin)) ?? null}
            onChange={(kelvin) => onAction({ type: 'kelvin', kelvin })}
          />
        </>
      ),
      // With colours too, whites and colours share one group.
      group: hasColors ? null : temperature,
    });
  }
  if (hasColors) {
    controls.push({
      id: 'color',
      icon: <Palette {...ICON} />,
      label: dt('color'),
      value: isColorMode ? undefined : toneValue,
      note: isColorMode ? sp.t('discNote') : undefined,
      looks: ['color'],
      big: () => (
        <>
          <div className="glass-disc-stage">
            <GlassColorPicker
              size="hero"
              label={dt('customColor')}
              value={{ hue: model.hue, saturation: model.saturation }}
              valueText={(color) => dt('colorValue', { hue: color.hue, saturation: color.saturation })}
              onChange={(color) => onAction({ type: 'hue', hue: color.hue, saturation: Math.max(1, color.saturation) })}
            />
          </div>
          {swatches(true)}
        </>
      ),
      group: (
        <>
          {hasWhites ? kind : null}
          {isColorMode ? (
            <div className="panel-disc-group">
              <div className="panel-disc-small">{disc}</div>
              {swatches(false)}
            </div>
          ) : (
            temperature
          )}
        </>
      ),
    });
  }
  if (effects.length > 0 && onExtraAction) {
    controls.push({
      id: 'effects',
      icon: <Sparkles {...ICON} />,
      label: t('controls.light.effects'),
      value: activeEffect ? effectName(activeEffect) : t('controls.light.noEffect'),
      lit: Boolean(activeEffect),
      looks: ['list'],
      big: () => (
        <GlassChoiceRows<string>
          size="hero"
          ariaLabel={t('controls.light.effects')}
          options={effects.map((effect) => ({ value: effect, label: effectName(effect) }))}
          value={extras?.effect}
          onChange={(effect) => onExtraAction({ type: 'effect', effect })}
        />
      ),
      group: (
        <GlassChips<string>
          size="dialog"
          ariaLabel={t('controls.light.effects')}
          options={effects.map((effect) => ({ value: effect, label: effectName(effect) }))}
          value={extras?.effect}
          onChange={(effect) => onExtraAction({ type: 'effect', effect })}
        />
      ),
    });
  }
  if (extras?.supportsWhite && onExtraAction) {
    controls.push({
      id: 'white',
      icon: <Lightbulb {...ICON} />,
      label: sp.t('ledWhite'),
      value: `${pct}%`,
      note: sp.t('ledWhiteNote'),
      looks: ['slider'],
      big: () => (
        <GlassVerticalSlider
          label={sp.t('ledWhite')}
          value={pct}
          commit="release"
          fillStyle={WHITE_FILL}
          display={`${pct}%`}
          subtitle={sp.t('ledWhite')}
          valueText={`${pct}%`}
          onValueChange={(value) => onExtraAction({ type: 'white', value })}
        />
      ),
      group: (
        <GlassSlider variant="bar" commit="release" fillClassName="panel-white-fill" label={sp.t('ledWhite')} value={pct} valueText={`${pct}%`} onValueChange={(value) => onExtraAction({ type: 'white', value })} />
      ),
    });
  }
  if (extras?.supportsFlash && onExtraAction) {
    controls.push({
      id: 'flash',
      icon: <Zap {...ICON} />,
      label: t('controls.light.flash'),
      actionLabel: flashing ? sp.t('flashing') : sp.t('flashNow'),
      note: sp.t('flashNote'),
      on: flashing,
      onPress: () => {
        setFlashing(true);
        onExtraAction({ type: 'flash', mode: 'short' });
      },
    });
  }

  const dimmable = model.caps !== 'onoff';
  return {
    owner: model.entityId,
    name: model.name,
    status: roomName ? `${roomName} · ${state}` : state,
    layout: 'light' as const,
    heroName: dimmable ? sp.t('heroBrightness', { pct }) : state,
    accent: accentOf(rgb),
    tint: lit,
    heroKind: dimmable ? ('slider' as const) : ('value' as const),
    hero: dimmable ? (
      <GlassVerticalSlider
        label={dt('brightnessOf', { name: model.name })}
        value={pct}
        min={1}
        off={!lit}
        fillPercent={lit ? pct : 0}
        disabled={!model.available}
        display={lit ? `${pct}%` : dt('off')}
        valueText={lit ? `${pct}%` : dt('off')}
        icon={<Sun size={24} strokeWidth={2} />}
        onValueChange={(value) => onAction({ type: 'brightness', pct: value })}
      />
    ) : (
      <PanelHeroValue value={state} />
    ),
    controls,
    below: model.caps === 'dim' && controls.length === 0 ? <p className="panel-screen-note">{dt('dimOnly')}</p> : undefined,
    action: {
      kind: 'power' as const,
      on: lit,
      disabled: !model.available,
      label: dt(model.on ? 'turnOff' : 'turnOn', { name: model.name }),
      onPress: () => onAction({ type: model.on ? 'turn_off' : 'turn_on' }),
    },
  };
}

export const lightEntry: PanelEntry<LightPanelInput> = { useSpec: useLightSpec };
