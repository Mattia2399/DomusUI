import { Lightbulb } from 'lucide-react';
import { clsx } from 'clsx';
import { useDevicesTranslations } from '../../../i18n/devicesTranslations';
import { lightHasPanel, lightTone, type LightAction, type LightModel } from '../model/light';
import { lightTileColor } from '../model/tileColor';
import { CardFrame, CardHead, CardIcon } from './CardFrame';
import { DeviceCardShell, deviceCardSize, type DeviceCardFormat } from './DeviceCardShell';
import { BrightnessBar, lightSwatches, SwatchRow } from './LightControls';
import { ScrollingName } from './ScrollingName';
import { formatLightStatus, toneTitle, toneWord } from './lightText';

/*
 * A light in the three sizes of the board (docs/design-reference/CoreCards.dc.html).
 * The tile takes the colour of the light while it is on.
 *
 * Mini U×2      icon, name, level and tone (the tile of a room)
 * U×3           the Mini of a lit light that grew: + the brightness slider
 * Standard U×4  the level in large type and the slider
 * Expanded W×4  the slider, White tones and colours
 */

const TONE_PRESETS = [2700, 4000, 6500];

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
  const litColour = lit ? { background: lit.background, lightRgb: lit.light.join(' ') } : null;
  const dimmable = model.caps !== 'onoff' && model.available;
  const hasPanel = lightHasPanel(model);
  const controlsLive = !editing && model.available;
  const size = deviceCardSize(format);
  const toggle = () => onAction({ type: model.on ? 'turn_off' : 'turn_on' });
  const toggleLabel = dt(model.on ? 'turnOff' : 'turnOn', { name: model.name });
  const nameNode = <ScrollingName name={model.name} still={editing} />;
  const bar = (short: boolean) =>
    dimmable ? (
      <BrightnessBar
        model={model}
        label={dt('brightnessOf', { name: model.name })}
        onChange={(pct) => onAction({ type: 'brightness', pct })}
        className={clsx(short && 'is-40')}
      />
    ) : null;
  const toggleWide = (
    <button type="button" className={clsx('dv-pill is-wide', !model.on && 'is-primary')} disabled={!controlsLive} onClick={toggle}>
      {model.on ? dt('turnOffShort') : dt('turnOnShort')}
    </button>
  );

  if (size === 'mini' || format === 'U×3') {
    return (
      <DeviceCardShell
        panelKind={hasPanel ? 'light' : null}
        format={format === 'U×3' ? 'U×3' : 'U×2'}
        name={model.name}
        nameNode={nameNode}
        status={status}
        icon={<Lightbulb size={21} strokeWidth={2} aria-hidden="true" />}
        isOn={model.on}
        available={model.available}
        lit={litColour}
        hasPanel={hasPanel}
        editing={editing}
        selected={selected}
        hiddenItem={hiddenItem}
        toggleLabel={toggleLabel}
        openLabel={dt('controlsOf', { name: model.name, status })}
        selectLabel={dt('select', { name: model.name })}
        onToggle={toggle}
        onOpenPanel={onOpenPanel}
        onSelect={onSelect}
        controls={format === 'U×3' ? (
          <>
            <span className="min-h-2.5 flex-auto" />
            {bar(false)}
          </>
        ) : null}
      />
    );
  }

  const pct = model.on ? model.brightnessPct ?? 100 : 0;
  const colourMode = model.caps === 'color' && model.mode === 'color';
  const toneLine = !model.on
    ? status
    : colourMode
      ? dt('color')
      : model.caps === 'ct' || model.caps === 'color'
        ? dt('lightToneLine', { tone: toneWord(lightTone(model.kelvin), dt) })
        : status;
  const icon = (
    <CardIcon label={toggleLabel} pressed={model.on} editing={editing} disabled={!model.available} onPress={toggle}>
      <Lightbulb size={21} strokeWidth={2} aria-hidden="true" />
    </CardIcon>
  );
  const frame = (children: React.ReactNode) => (
    <CardFrame
      panelKind={hasPanel ? 'light' : null}
      format={format}
      available={model.available}
      lit={litColour}
      editing={editing}
      selected={selected}
      hiddenItem={hiddenItem}
      openLabel={hasPanel ? dt('controlsOf', { name: model.name, status }) : toggleLabel}
      selectLabel={dt('select', { name: model.name })}
      onOpen={hasPanel ? onOpenPanel : toggle}
      onSelect={onSelect}
    >
      <div className="dv-size-body">{children}</div>
    </CardFrame>
  );

  if (size === 'standard') {
    return frame(
      <>
        <CardHead icon={icon} name={model.name} nameNode={nameNode} status={toneLine} />
        {dimmable ? (
          <span className="dv-val">
            <b>{pct}</b>
            <span>{dt('brightnessUnit')}</span>
          </span>
        ) : null}
        {dimmable ? bar(true) : toggleWide}
      </>,
    );
  }

  const tones = model.caps === 'ct' || model.caps === 'color' ? TONE_PRESETS : [];
  const colours = model.caps === 'color'
    ? lightSwatches(model, dt, () => undefined, (hue) => onAction({ type: 'hue', hue }), { hueCount: 4, forceMode: 'color' })
    : [];
  return frame(
    <>
      <CardHead
        icon={icon}
        name={model.name}
        nameNode={nameNode}
        status={status}
        oneLine
        aside={<span className="dv-pct">{model.on ? `${pct}%` : dt('switchOff')}</span>}
      />
      {dimmable ? bar(true) : toggleWide}
      {tones.length > 0 || colours.length > 0 ? (
        <div className="dv-pills">
          {tones.map((kelvin) => (
            <button
              key={kelvin}
              type="button"
              className={clsx('dv-pill', model.on && !colourMode && Math.abs(model.kelvin - kelvin) < 600 && 'is-on')}
              disabled={!controlsLive}
              onClick={() => onAction({ type: 'kelvin', kelvin })}
            >
              {toneTitle(lightTone(kelvin), dt)}
            </button>
          ))}
          {tones.length > 0 && colours.length > 0 ? <span className="dv-size-sep" aria-hidden="true" /> : null}
          <SwatchRow swatches={colours} label={dt('color')} nowrap disabled={!controlsLive} />
        </div>
      ) : null}
    </>,
  );
}

export default LightCard;
