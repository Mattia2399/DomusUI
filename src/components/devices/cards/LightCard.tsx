import type React from 'react';
import { Lightbulb } from 'lucide-react';
import { useDevicesTranslations } from '../../../i18n/devicesTranslations';
import { lightHasPanel, lightTone, type LightAction, type LightModel } from '../model/light';
import { lightTileColor } from '../model/tileColor';
import { DeviceCardShell, type DeviceCardFormat } from './DeviceCardShell';
import { BrightnessBar, LightKindSegment, lightSwatches, SwatchRow } from './LightControls';
import { formatLightStatus, toneWord } from './lightText';

/*
 * A light in any of the card formats. The card shows the light and sends
 * commands; what a command does to Home Assistant is the caller's business.
 *
 * U×2  icon, name, status            W×2  the same, slider on the right
 * U×3  + slider below                W×3  slider and swatches side by side
 * U×4  + 4 swatches above the slider W×4  slider, then a row of swatches
 * X×4  header and slider; swatches   W×6  slider, swatches, White / Colour
 *      and White / Colour beside
 */

export type LightCardProps = {
  model: LightModel;
  format: DeviceCardFormat;
  editing?: boolean;
  selected?: boolean;
  hiddenItem?: boolean;
  onAction: (action: LightAction) => void;
  onOpenPanel?: () => void;
  onSelect?: () => void;
};

export function LightCard({ model, format, editing = false, selected = false, hiddenItem = false, onAction, onOpenPanel, onSelect }: LightCardProps) {
  const dt = useDevicesTranslations();
  const status = formatLightStatus(model, dt);
  const lit = lightTileColor(model);
  const dimmable = model.caps !== 'onoff' && model.available;
  const hasPanel = lightHasPanel(model);
  const controlsLive = !editing && model.available;
  const setBrightness = (pct: number) => onAction({ type: 'brightness', pct });
  const swatches = lightSwatches(
    model,
    dt,
    (kelvin) => onAction({ type: 'kelvin', kelvin }),
    (hue) => onAction({ type: 'hue', hue }),
    { hueCount: format === 'U×4' || format === 'W×3' ? 4 : 5 },
  );
  const swatchLabel =
    model.mode === 'color' && model.caps === 'color'
      ? dt('color')
      : dt('temperatureShort', { tone: toneWord(lightTone(model.kelvin), dt) });
  const bar = (className?: string, style?: React.CSSProperties) =>
    dimmable ? (
      <BrightnessBar
        model={model}
        label={dt('brightnessOf', { name: model.name })}
        onChange={setBrightness}
        className={className}
        style={style}
      />
    ) : null;
  const swatchRow = (nowrap = false) => (
    <SwatchRow swatches={swatches} label={swatchLabel} nowrap={nowrap} disabled={!controlsLive} />
  );
  const segment =
    model.caps === 'color' ? (
      <LightKindSegment mode={model.mode} dt={dt} disabled={!controlsLive} onChange={(mode) => onAction({ type: 'mode', mode })} />
    ) : null;

  let controls: React.ReactNode = null;
  let side: React.ReactNode = null;
  switch (format) {
    case 'U×3':
      controls = (
        <>
          <span className="min-h-2.5 flex-auto" />
          {bar()}
        </>
      );
      break;
    case 'U×4':
      controls = (
        <>
          {swatches.length > 0 ? <div className="mt-3">{swatchRow(true)}</div> : null}
          <span className="min-h-2.5 flex-auto" />
          {bar()}
        </>
      );
      break;
    case 'W×2':
      controls = dimmable ? <span className="w-[44%] flex-none">{bar()}</span> : null;
      break;
    case 'W×3':
      controls = (
        <>
          <span className="min-h-2.5 flex-auto" />
          <div className="flex min-w-0 items-center gap-3">
            {bar(undefined, { flex: '1 1 0%', width: 'auto', minWidth: 0 })}
            {swatches.length > 0 ? <div className="flex-none">{swatchRow(true)}</div> : null}
          </div>
        </>
      );
      break;
    case 'W×4':
    case 'W×6':
      controls = (
        <div className="mt-2.5 flex flex-col gap-2.5">
          {bar()}
          {swatchRow()}
          {format === 'W×6' ? segment : null}
        </div>
      );
      break;
    case 'X×4':
      controls = bar();
      side =
        swatches.length > 0 ? (
          <div className="flex flex-col gap-2.5">
            <span className="dv-status !font-semibold">{swatchLabel}</span>
            {swatchRow()}
            {segment}
          </div>
        ) : null;
      break;
    default:
      break;
  }

  return (
    <DeviceCardShell
      format={format}
      name={model.name}
      status={status}
      icon={<Lightbulb size={21} strokeWidth={2} aria-hidden="true" />}
      isOn={model.on}
      available={model.available}
      lit={lit ? { background: lit.background, lightRgb: lit.light.join(' ') } : null}
      hasPanel={hasPanel}
      editing={editing}
      selected={selected}
      hiddenItem={hiddenItem}
      toggleLabel={dt(model.on ? 'turnOff' : 'turnOn', { name: model.name })}
      openLabel={dt('controlsOf', { name: model.name, status })}
      selectLabel={dt('select', { name: model.name })}
      onToggle={() => onAction({ type: model.on ? 'turn_off' : 'turn_on' })}
      onOpenPanel={onOpenPanel}
      onSelect={onSelect}
      controls={controls}
      side={side}
    />
  );
}

export default LightCard;
