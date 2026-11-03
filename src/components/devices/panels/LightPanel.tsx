import React from 'react';
import { clsx } from 'clsx';
import { Lightbulb, Palette, Sparkles, Sun, SunDim, Thermometer, Zap } from 'lucide-react';
import { useDevicesTranslations } from '../../../i18n/devicesTranslations';
import { useI18n } from '../../../i18n/I18nProvider';
import { LIGHT_HUE_PRESETS, lightTone, type LightAction, type LightModel } from '../model/light';
import { hexToRgb, hueToRgb, lightRgb, rgbCss, rgbToHex } from '../model/tileColor';
import { LightKindSegment, lightSwatches, SwatchRow } from '../cards/LightControls';
import { toneTitle } from '../cards/lightText';
import type { LightExtraAction } from '../model/lightExtras';
import { PanelShell, PanelShortcut, type PanelLive } from './PanelShell';

/*
 * The controls of a light: a large vertical brightness slider, White / Colour
 * for the lights that do both, four whites, seven hues and a free colour.
 * The same content wherever the panel opens. On a phone or in a column the slider
 * has the panel to itself: what the light also exposes waits behind a row of round
 * shortcuts, and takes the place of the row when opened (devices.css).
 */

type SectionKey = 'color' | 'white' | 'effects' | 'flash';

function hueOfHex(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((channel) => channel / 255);
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (!delta) return 0;
  let hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  hue = Math.round(hue * 60);
  return hue < 0 ? hue + 360 : hue;
}

export type LightPanelProps = {
  model: LightModel;
  roomName?: string;
  onAction: (action: LightAction) => void;
  extras?: {
    supportsWhite?: boolean;
    supportsEffects?: boolean;
    supportsFlash?: boolean;
    effect?: string;
    effects?: string[];
  };
  onExtraAction?: (action: LightExtraAction) => void;
  /** Inside a sheet that has its own title and Close. */
  embedded?: boolean;
  live?: PanelLive;
  onClose: () => void;
};

export function LightPanel({ model, roomName, extras, embedded, live, onAction, onExtraAction, onClose }: LightPanelProps) {
  const dt = useDevicesTranslations();
  const { t } = useI18n();
  const rgb = lightRgb(model);
  const pct = model.brightnessPct ?? 100;
  const isColorMode = model.caps === 'color' && model.mode === 'color';
  const lit = model.on && model.available;
  const state = lit ? (model.caps === 'onoff' ? dt('panelOnPlain') : dt('panelOn', { pct })) : model.available ? dt('off') : dt('unavailable');
  const subtitle = roomName ? `${roomName} · ${state}` : state;
  const darkLabel = lit && pct > 86;
  const temps = lightSwatches(
    model,
    dt,
    (kelvin) => onAction({ type: 'kelvin', kelvin }),
    (hue) => onAction({ type: 'hue', hue }),
    { forceMode: 'temp' },
  );
  const hues = LIGHT_HUE_PRESETS.map((hue) => ({
    key: `h${hue}`,
    css: rgbCss(hueToRgb(hue)),
    checked: isColorMode && Math.abs(model.hue - hue) < 6,
    label: dt('hueSwatch', { hue }),
    pick: () => onAction({ type: 'hue', hue }),
  }));
  const showTemps = (model.caps === 'ct' || model.caps === 'color') && !isColorMode;

  const hasWhite = Boolean(extras?.supportsWhite && onExtraAction);
  const hasEffects = Boolean(extras?.supportsEffects && extras.effects && extras.effects.length > 0 && onExtraAction);
  const hasFlash = Boolean(extras?.supportsFlash && onExtraAction);
  const shortcuts: Array<{ key: SectionKey; icon: React.ReactNode; label: string }> = [
    ...(model.caps === 'color' ? [{ key: 'color' as const, icon: <Palette size={20} strokeWidth={2} />, label: dt('color') }] : []),
    ...(model.caps === 'ct' ? [{ key: 'color' as const, icon: <Thermometer size={20} strokeWidth={2} />, label: dt('temperature') }] : []),
    ...(hasWhite ? [{ key: 'white' as const, icon: <SunDim size={20} strokeWidth={2} />, label: t('controls.light.whiteChannel') }] : []),
    ...(hasEffects ? [{ key: 'effects' as const, icon: <Sparkles size={20} strokeWidth={2} />, label: t('controls.light.effects') }] : []),
    ...(hasFlash ? [{ key: 'flash' as const, icon: <Zap size={20} strokeWidth={2} />, label: t('controls.light.flash') }] : []),
  ];
  // The column of the Home changes light without closing: a screen belongs to its light.
  const [opened, setOpened] = React.useState<{ entityId: string; key: SectionKey } | null>(null);
  const section = opened?.entityId === model.entityId && shortcuts.some(({ key }) => key === opened.key) ? opened.key : null;
  const sectionClass = (key: SectionKey) => clsx('dv-panel-section', section === key && 'is-open');

  return (
    <PanelShell
      icon={<Lightbulb size={23} strokeWidth={2} />}
      iconClassName="transition-[background] duration-300"
      iconStyle={
        lit
          ? { background: rgbCss(rgb), color: 'var(--dv-lit-icon-ink)', boxShadow: `0 8px 22px -6px ${rgbCss(rgb, 0.8)}` }
          : { background: 'var(--dv-icon-off)', color: 'var(--dv-t2)' }
      }
      name={model.name}
      subtitle={subtitle}
      liveSubtitle
      power={{ on: model.on, highlighted: lit, available: model.available, name: model.name, onToggle: () => onAction({ type: model.on ? 'turn_off' : 'turn_on' }) }}
      embedded={embedded}
      live={live}
      dock={{ back: section ? { label: dt('back'), onPress: () => setOpened(null) } : undefined }}
      onClose={onClose}
    >

      <div className={clsx('dv-panel-body dv-panel-stage', section && 'has-section')}>
        {model.caps !== 'onoff' ? (
          <div className="dv-vslider">
            <span
              className="dv-vslider-fill"
              aria-hidden="true"
              style={{ height: `${lit ? pct : 0}%`, background: lit ? rgbCss(rgb, 0.95) : 'var(--dv-slider-fill-off)' }}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-[18px] text-center text-2xl font-bold tracking-[-0.02em] tabular-nums"
              style={darkLabel ? { color: 'var(--dv-lit-ink)' } : undefined}
            >
              {lit ? `${pct}%` : dt('off')}
            </span>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-[18px] flex justify-center"
              style={{ color: lit && pct > 12 ? 'var(--dv-lit-icon-ink)' : 'var(--dv-t2)' }}
            >
              <Sun size={24} strokeWidth={2} />
            </span>
            <input
              type="range"
              min={1}
              max={100}
              step={1}
              value={pct}
              disabled={!model.available}
              onChange={(event) => onAction({ type: 'brightness', pct: Number(event.target.value) })}
              aria-label={dt('brightnessOf', { name: model.name })}
              aria-valuetext={lit ? `${pct}%` : dt('off')}
              aria-orientation="vertical"
            />
          </div>
        ) : null}

        <div className="dv-panel-side">
          {model.caps === 'ct' || model.caps === 'color' ? (
            <div className={clsx(sectionClass('color'), 'gap-3.5')}>
          {model.caps === 'color' ? (
            <LightKindSegment mode={model.mode} dt={dt} disabled={!model.available} onChange={(mode) => onAction({ type: 'mode', mode })} />
          ) : null}
          {showTemps ? (
            <div className="flex flex-col gap-2">
              <span className="dv-t2 text-[13px] font-bold">
                {dt('temperatureNow', { tone: toneTitle(lightTone(model.kelvin), dt), kelvin: model.kelvin })}
              </span>
              <SwatchRow swatches={temps} label={dt('temperature')} large disabled={!model.available} />
            </div>
          ) : null}
          {isColorMode ? (
            <div className="flex flex-col gap-2">
              <span className="dv-t2 text-[13px] font-bold">{dt('color')}</span>
              <SwatchRow swatches={hues} label={dt('color')} large disabled={!model.available}>
                <label className="dv-wheel" title={dt('customColor')}>
                  <span className="sr-only">{dt('customColor')}</span>
                  <input
                    type="color"
                    value={rgbToHex(hueToRgb(model.hue))}
                    disabled={!model.available}
                    onChange={(event) => onAction({ type: 'hue', hue: hueOfHex(event.target.value) })}
                  />
                </label>
              </SwatchRow>
            </div>
          ) : null}
            </div>
          ) : null}
          {model.caps === 'dim' ? <span className="dv-panel-section dv-t2 text-sm font-medium leading-[1.45]">{dt('dimOnly')}</span> : null}
          {extras?.supportsWhite && onExtraAction ? (
            <div className={clsx(sectionClass('white'), 'gap-2')}>
              <span className="dv-t2 text-[13px] font-bold">{t('controls.light.whiteChannel')}</span>
              <span className="dv-hslider">
                <span style={{ width: `${pct}%` }} />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={pct}
                  disabled={!model.available}
                  aria-label={t('controls.light.whiteChannel')}
                  onChange={(event) => onExtraAction({ type: 'white', value: Number(event.target.value) })}
                />
              </span>
            </div>
          ) : null}
          {extras?.supportsEffects && extras.effects && extras.effects.length > 0 && onExtraAction ? (
            <div className={clsx(sectionClass('effects'), 'gap-2')}>
              <span className="dv-t2 text-[13px] font-bold">{t('controls.light.effects')}</span>
              <div className="flex flex-wrap gap-2" role="group" aria-label={t('controls.light.effects')}>
                {extras.effects.map((effect) => (
                  <button
                    key={effect}
                    type="button"
                    className={`dv-option ${extras.effect === effect ? 'is-on' : ''}`}
                    aria-pressed={extras.effect === effect}
                    disabled={!model.available}
                    onClick={() => onExtraAction({ type: 'effect', effect })}
                  >
                    {['off', 'none'].includes(effect.toLowerCase()) ? t('controls.light.noEffect') : effect}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {extras?.supportsFlash && onExtraAction ? (
            <div className={clsx(sectionClass('flash'), 'gap-2')}>
              <span className="dv-t2 text-[13px] font-bold">{t('controls.light.flash')}</span>
              <div className="flex gap-2" role="group" aria-label={t('controls.light.flash')}>
                <button type="button" className="dv-option" disabled={!model.available} onClick={() => onExtraAction({ type: 'flash', mode: 'short' })}>{t('controls.light.short')}</button>
                <button type="button" className="dv-option" disabled={!model.available} onClick={() => onExtraAction({ type: 'flash', mode: 'long' })}>{t('controls.light.long')}</button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="dv-panel-shortcuts" role="group" aria-label={dt('panelAdjust')}>
          {shortcuts.map(({ key, icon, label }) => (
            <PanelShortcut
              key={key}
              icon={icon}
              label={label}
              expanded={section === key}
              disabled={!model.available}
              onPress={() => setOpened({ entityId: model.entityId, key })}
            />
          ))}
        </div>
      </div>
    </PanelShell>
  );
}

export default LightPanel;
