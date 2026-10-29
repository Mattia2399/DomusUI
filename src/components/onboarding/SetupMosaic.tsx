import type { ReactNode } from 'react';
import {
  Blinds,
  DoorClosed,
  Droplets,
  Fan,
  Flame,
  Lamp,
  LampCeiling,
  LampFloor,
  Lightbulb,
  Minus,
  Play,
  Plug,
  Plus,
  ShieldCheck,
  Snowflake,
  Thermometer,
  Tv,
} from 'lucide-react';
import type { OnboardingTranslationKey } from '../../i18n/onboardingTranslations';
import './setupMosaic.css';

/*
 * The background of the setup intro: cards in the style of Rooms, in slanted
 * columns drifting slowly in turns. Decoration only: hidden from assistive
 * technology, never interactive, still with reduced motion. Loaded apart from
 * setup, so the first words of setup do not wait for it.
 */

type Translate = (key: OnboardingTranslationKey) => string;
type Card = (ot: Translate) => ReactNode;

const ICON = { size: 21, strokeWidth: 2, 'aria-hidden': true } as const;

function Tile({ icon, name, value, tone }: { icon: ReactNode; name: string; value: string; tone?: 'warm' | 'power' | 'secure' }) {
  return (
    <div className={`sm-card sm-tile${tone ? ` is-${tone}` : ''}`}>
      <span className="sm-ic">{icon}</span>
      <span className="sm-t">
        <b>{name}</b>
        <span>{value}</span>
      </span>
    </div>
  );
}

function Climate({ name, state, value, cool }: { name: string; state: string; value: string; cool?: boolean }) {
  return (
    <div className={`sm-card sm-climate ${cool ? 'is-cool' : 'is-heat'}`}>
      <span className="sm-row">
        <span className="sm-ic">{cool ? <Snowflake {...ICON} /> : <Flame {...ICON} />}</span>
        <span className="sm-t">
          <b>{name}</b>
          <span>{state}</span>
        </span>
      </span>
      <span className="sm-row is-end">
        <span className="sm-big">{value}</span>
        <span className="sm-row">
          <i className="sm-round"><Minus size={16} strokeWidth={2.6} aria-hidden /></i>
          <i className="sm-round"><Plus size={16} strokeWidth={2.6} aria-hidden /></i>
        </span>
      </span>
    </div>
  );
}

const cards: Record<string, Card> = {
  cool: (ot) => <Climate cool name={ot('mosaic.bedroom')} state={ot('mosaic.cooling')} value="19°" />,
  heat: (ot) => <Climate name={ot('mosaic.livingClimate')} state={ot('mosaic.heating')} value="23°" />,
  alarm: (ot) => <Tile tone="secure" icon={<ShieldCheck {...ICON} />} name={ot('mosaic.alarm')} value={ot('mosaic.disarmed')} />,
  camera: (ot) => (
    <div className="sm-card sm-camera">
      <span className="sm-live"><i />LIVE</span>
      <span className="sm-t">
        <b>{ot('mosaic.entrance')}</b>
        <span>{ot('mosaic.motion')}</span>
      </span>
    </div>
  ),
  fan: (ot) => <Tile tone="power" icon={<Fan {...ICON} />} name={ot('mosaic.fan')} value={ot('mosaic.speed')} />,
  spots: (ot) => <Tile icon={<Lightbulb {...ICON} />} name={ot('mosaic.spots')} value={ot('mosaic.offMany')} />,
  temperature: (ot) => <Tile icon={<Thermometer {...ICON} />} name={ot('mosaic.temperature')} value={ot('mosaic.temperatureValue')} />,
  floorLamp: (ot) => <Tile tone="warm" icon={<LampFloor {...ICON} />} name={ot('mosaic.floorLamp')} value={ot('mosaic.floorLampValue')} />,
  music: (ot) => (
    <div className="sm-card sm-media">
      <span className="sm-row">
        <span className="sm-art"><Play size={20} aria-hidden /></span>
        <span className="sm-t">
          <b>Blinding Lights</b>
          <span>{`The Weeknd · ${ot('mosaic.livingRoom')}`}</span>
        </span>
      </span>
      <span className="sm-progress"><i /></span>
    </div>
  ),
  plug: (ot) => <Tile tone="power" icon={<Plug {...ICON} />} name={ot('mosaic.tvPlug')} value="28 W" />,
  scenes: (ot) => (
    <div className="sm-card sm-scenes">
      {[ot('mosaic.relax'), ot('mosaic.movie'), ot('mosaic.night')].map((scene, index) => (
        <span key={scene} className={index === 0 ? 'is-on' : undefined}>{scene}</span>
      ))}
    </div>
  ),
  window: (ot) => <Tile tone="secure" icon={<DoorClosed {...ICON} />} name={ot('mosaic.window')} value={ot('mosaic.closed')} />,
  garage: (ot) => (
    <div className="sm-card sm-lock">
      <svg viewBox="0 0 80 80" aria-hidden>
        <circle cx="40" cy="40" r="34" />
        <circle cx="40" cy="40" r="34" className="is-lit" />
      </svg>
      <span className="sm-t">
        <b>{ot('mosaic.garageLock')}</b>
        <span>{ot('mosaic.closed')}</span>
      </span>
    </div>
  ),
  door: (ot) => <Tile tone="secure" icon={<DoorClosed {...ICON} />} name={ot('mosaic.frontDoor')} value={ot('mosaic.closed')} />,
  strip: (ot) => <Tile tone="warm" icon={<Lightbulb {...ICON} />} name={ot('mosaic.ledStrip')} value={ot('mosaic.ledStripValue')} />,
  energy: (ot) => (
    <div className="sm-card sm-energy">
      <span className="sm-t">
        <span>{ot('mosaic.energyToday')}</span>
        <b>{ot('mosaic.energyValue')}</b>
      </span>
      <span className="sm-bars">
        {[38, 52, 30, 70, 46, 88, 60, 74].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}
      </span>
    </div>
  ),
  bedside: (ot) => <Tile tone="warm" icon={<Lamp {...ICON} />} name={ot('mosaic.bedside')} value={ot('mosaic.bedsideValue')} />,
  humidity: (ot) => <Tile icon={<Droplets {...ICON} />} name={ot('mosaic.humidity')} value="48%" />,
  blind: (ot) => <Tile icon={<Blinds {...ICON} />} name={ot('mosaic.blind')} value={ot('mosaic.blindValue')} />,
  tv: (ot) => <Tile icon={<Tv {...ICON} />} name={ot('mosaic.tv')} value={ot('mosaic.offOne')} />,
  kitchen: (ot) => <Tile icon={<Lightbulb {...ICON} />} name={ot('mosaic.kitchen')} value={ot('mosaic.offMany')} />,
  chandelier: (ot) => <Tile tone="warm" icon={<LampCeiling {...ICON} />} name={ot('mosaic.chandelier')} value={ot('mosaic.chandelierValue')} />,
};

// Each column shows its cards four times: drifting by half its height loops without a seam
// and the slanted column still covers the whole screen.
const COLUMNS = [
  ['cool', 'alarm', 'camera', 'fan'],
  ['spots', 'temperature', 'floorLamp', 'heat'],
  ['floorLamp', 'heat', 'spots', 'temperature'],
  ['music', 'plug', 'scenes', 'window'],
  ['garage', 'door', 'strip', 'energy'],
  ['camera', 'fan', 'cool', 'alarm'],
  ['bedside', 'humidity', 'blind', 'tv'],
  ['energy', 'kitchen', 'music', 'chandelier'],
  ['humidity', 'blind', 'tv', 'bedside'],
  ['scenes', 'window', 'music', 'plug'],
  ['door', 'strip', 'energy', 'garage'],
];

export function SetupMosaic({ ot }: { ot: Translate }) {
  return (
    <div className="sm-mosaic" aria-hidden="true" inert>
      {COLUMNS.map((column, index) => (
        <div
          key={index}
          className="sm-col"
          style={{ animationDelay: `${-index * 11}s`, animationDirection: index % 2 ? 'reverse' : 'normal' }}
        >
          {[...column, ...column, ...column, ...column].map((id, position) => <div key={position}>{cards[id](ot)}</div>)}
        </div>
      ))}
    </div>
  );
}

export default SetupMosaic;
