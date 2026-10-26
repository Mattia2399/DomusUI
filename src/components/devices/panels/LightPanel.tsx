import React from 'react';
import { Lightbulb, Power, Sun, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useDevicesTranslations } from '../../../i18n/devicesTranslations';
import { LIGHT_HUE_PRESETS, lightTone, type LightAction, type LightModel } from '../model/light';
import { hexToRgb, hueToRgb, lightRgb, rgbCss, rgbToHex } from '../model/tileColor';
import { LightKindSegment, lightSwatches, SwatchRow } from '../cards/LightControls';
import { toneTitle } from '../cards/lightText';

/*
 * The controls of a light: a large vertical brightness slider, White / Colour
 * for the lights that do both, four whites, seven hues and a free colour.
 * The same content wherever the panel opens.
 */

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
  onClose: () => void;
};

export function LightPanel({ model, roomName, onAction, onClose }: LightPanelProps) {
  const dt = useDevicesTranslations();
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

  return (
    <div className="dv-panel">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 flex-none items-center justify-center rounded-full transition-[background] duration-300"
          style={
            lit
              ? { background: rgbCss(rgb), color: 'var(--dv-lit-icon-ink)', boxShadow: `0 8px 22px -6px ${rgbCss(rgb, 0.8)}` }
              : { background: 'var(--dv-icon-off)', color: 'var(--dv-t2)' }
          }
        >
          <Lightbulb size={23} strokeWidth={2} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="m-0 truncate text-xl font-bold tracking-[-0.02em]">{model.name}</p>
          <span className="dv-t2 text-[13px] font-semibold" aria-live="polite">
            {subtitle}
          </span>
        </div>
        <button
          type="button"
          className={clsx('dv-round', lit && 'is-on')}
          aria-pressed={model.on}
          aria-label={dt(model.on ? 'turnOff' : 'turnOn', { name: model.name })}
          disabled={!model.available}
          onClick={() => onAction({ type: model.on ? 'turn_off' : 'turn_on' })}
        >
          <Power size={20} strokeWidth={2.2} aria-hidden="true" />
        </button>
        <button type="button" className="dv-round dv-round-sm" aria-label={dt('close')} onClick={onClose}>
          <X size={15} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </div>

      <div className="dv-panel-body">
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
          {model.caps === 'dim' ? <span className="dv-t2 text-sm font-medium leading-[1.45]">{dt('dimOnly')}</span> : null}
        </div>
      </div>
    </div>
  );
}

export default LightPanel;
