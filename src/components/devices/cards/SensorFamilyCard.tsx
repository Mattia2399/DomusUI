import type React from 'react';
import { clsx } from 'clsx';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BatteryLow,
  BatteryMedium,
  CircleCheck,
  Clock,
  CloudRain,
  DoorClosed,
  DoorOpen,
  Droplet,
  Droplets,
  Euro,
  Flame,
  Footprints,
  Gauge,
  Grid2x2,
  Leaf,
  ListOrdered,
  Moon,
  Plug,
  Router,
  ShieldCheck,
  Siren,
  Sun,
  Thermometer,
  Volume2,
  Warehouse,
  Wifi,
  WifiOff,
  Wind,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useSensorFamilyTranslations, type SensorFamilyTranslator as DevicesTranslator, type SensorFamilyWordKey as DevicesTranslationKey } from '../../../i18n/sensorFamilyTranslations';
import { useI18n } from '../../../i18n/I18nProvider';
import type { MockEntityState } from '../../../types/ha';
import { entityChangedAt, seriesStats, sparkline, type SeriesPoint } from '../model/sensor';
import type { StateChange } from '../model/security';
import {
  airBand,
  batteryBand,
  isMeteredPower,
  lightSteps,
  resolveSensorAlert,
  resolveSensorFamily,
  signalBars,
  SENSOR_ALERT_THRESHOLDS as T,
  toCelsius,
  toKmh,
  toKw,
  type SensorAlert,
  type SensorFamily,
} from '../model/sensorFamily';
import {
  changeOver,
  cheapestRun,
  compassPoint,
  dayPrices,
  energySince,
  HOUR,
  hourlyIncrease,
  hourlyMeans,
  hourlyYes,
  increaseSince,
  startOfDay,
  valueAt,
  yesSpans,
} from '../model/sensorFigures';
import { CardFrame, CardHead } from './CardFrame';
import { deviceCardSize, type DeviceCardFormat } from './DeviceCardShell';
import {
  houseBatteries,
  houseConnections,
  houseDetectors,
  housePowers,
  sensorPeers,
  useSensorHouse,
  type SensorHouse,
  type SensorHouseRow,
} from './sensorHouse';
import '../theme/sensorFamilies.css';

/*
 * The sensor card of the Home in the 17 families of the board
 * (docs/design-reference/sensori/SensorCards.dc.html): Mini U×2, Standard
 * U×4 and Expanded W×4, each in its normal state and in the one of
 * resolveSensorAlert. The family comes from resolveSensorFamily; what a card
 * cannot know (the history of a yes/no, the other sensors of the house)
 * leaves its place to what it does know.
 */

export type FamilySensorModel = {
  entityId: string;
  name: string;
  family: SensorFamily;
  deviceClass: string;
  unit: string;
  value: number | null;
  /** The state as Home Assistant gives it (on/off, the word of an enum, a date). */
  state: string;
  available: boolean;
  changedAt: number | null;
  attributes: Record<string, unknown>;
  battery: number | null;
};

export function toFamilySensorModel(
  entityId: string,
  entity: MockEntityState | undefined,
  options: { name?: string; battery?: number | null; fallbackFamily?: SensorFamily } = {},
): FamilySensorModel | null {
  const attributes = (entity?.rawAttributes ?? {}) as Record<string, unknown>;
  const deviceClass = `${attributes.device_class ?? ''}`.trim().toLowerCase();
  const unit = `${attributes.unit_of_measurement ?? ''}`.trim();
  const state = `${entity?.state ?? ''}`.trim();
  const family = resolveSensorFamily({ entityId, deviceClass, unit, state }) ?? options.fallbackFamily;
  if (!family) return null;
  const lower = state.toLowerCase();
  const number = Number(state.replace(',', '.'));
  const friendly = attributes.friendly_name;
  return {
    entityId,
    name: options.name ?? (typeof friendly === 'string' && friendly.trim() ? friendly.trim() : entityId.split('.')[1] ?? entityId),
    family,
    deviceClass,
    unit,
    value: state !== '' && Number.isFinite(number) ? number : null,
    state,
    available: Boolean(entity) && lower !== '' && lower !== 'unavailable' && lower !== 'unknown',
    changedAt: entityChangedAt(entity),
    attributes,
    battery: options.battery ?? null,
  };
}

export type SensorFamilyCardProps = {
  model: FamilySensorModel;
  /** The last 24 hours, oldest first. */
  history?: SeriesPoint[];
  /** The changes of a yes/no since yesterday, oldest first. */
  changes?: StateChange[];
  format: DeviceCardFormat;
  editing?: boolean;
  selected?: boolean;
  hiddenItem?: boolean;
  /** The meter of the house in kW, for a power sensor; without it the default. */
  meterKw?: number;
  now?: number;
  onOpen: () => void;
  onSelect?: () => void;
};

type Tint = 'green' | 'amber' | 'blue' | null;
type Fill = { background: string; ink?: string; ink2?: string; loud?: boolean; all?: boolean };
type Face = {
  icon: LucideIcon;
  tint: Tint;
  fill?: Fill | null;
  mini: string;
  /** Bold capitals in the Mini, for an alarm. */
  miniShout?: boolean;
  status: string;
  body: React.ReactNode;
  title: string;
  expandedStatus: string;
  aside?: React.ReactNode;
  expandedBody: React.ReactNode;
};

const GREEN = '#30D158';
const YELLOW = '#FFD60A';
const ORANGE = '#FF9F0A';
const RED = '#FF453A';
const BLUE = '#0A84FF';
const GREY = '#8E8E93';
const BAND = [GREEN, YELLOW, ORANGE, RED];
const BATTERY_BAND = [RED, ORANGE, YELLOW, GREEN];

const FILLS = {
  hot: { background: 'linear-gradient(150deg, #E2582A, #B3370F)' },
  blue: { background: 'linear-gradient(150deg, #1E7FD1, #135A99)' },
  red: { background: 'linear-gradient(150deg, #E5342B, #A11A14)' },
  amber: { background: 'linear-gradient(150deg, #C77700, #8A5200)' },
  open: { background: 'linear-gradient(150deg, #FF9F0A, #D97A00)', ink: '#2B1A00', ink2: 'rgba(43, 26, 0, 0.75)' },
} satisfies Record<string, Fill>;

const POLLUTANT: Record<string, string> = {
  carbon_dioxide: 'CO₂',
  carbon_monoxide: 'CO',
  pm1: 'PM1',
  pm25: 'PM2.5',
  pm4: 'PM4',
  pm10: 'PM10',
  volatile_organic_compounds: 'VOC',
  volatile_organic_compounds_parts: 'VOC',
  aqi: 'AQI',
  nitrogen_dioxide: 'NO₂',
  nitrogen_monoxide: 'NO',
  nitrous_oxide: 'N₂O',
  ozone: 'O₃',
  sulphur_dioxide: 'SO₂',
  radon: 'Radon',
};

const SAFETY_WORDS: Record<string, [DevicesTranslationKey, DevicesTranslationKey, DevicesTranslationKey]> = {
  smoke: ['ssSmokeOn', 'ssSmokeOff', 'ssSmokeShout'],
  gas: ['ssGasOn', 'ssGasOff', 'ssGasShout'],
  carbon_monoxide: ['ssCoOn', 'ssCalmOff', 'ssCoShout'],
  moisture: ['ssWaterOn', 'ssWaterOff', 'ssWaterShout'],
  heat: ['ssHeatOn', 'ssCalmOff', 'ssHeatShout'],
  cold: ['ssColdOn', 'ssCalmOff', 'ssColdShout'],
  safety: ['ssSafetyOn', 'ssSafetyOff', 'ssSafetyShout'],
  tamper: ['ssTamperOn', 'ssTamperOff', 'ssTamperShout'],
  problem: ['ssProblemOn', 'ssProblemOff', 'ssProblemShout'],
  sound: ['ssSoundOn', 'ssQuiet', 'ssSoundShout'],
};

/** On word, off word, and whether on is the good state. */
const DEVICE_WORDS: Record<string, [DevicesTranslationKey, DevicesTranslationKey, boolean]> = {
  connectivity: ['ssOnline', 'ssOffline', true],
  plug: ['ssPlugOn', 'ssPlugOff', true],
  power: ['ssPowerOn', 'ssPowerOff', true],
  running: ['ssRunningOn', 'ssRunningOff', true],
  battery: ['ssBatteryLowOn', 'ssBatteryLowOff', false],
  battery_charging: ['ssChargingOn', 'ssChargingOff', true],
  light: ['ssLightOn', 'ssLightOff', true],
  lock: ['ssLockOn', 'ssLockOff', false],
  update: ['ssUpdateOn', 'ssUpdateOff', false],
};

const MOTION_WORDS: Record<string, [DevicesTranslationKey, DevicesTranslationKey]> = {
  motion: ['ssMotionOn', 'ssMotionOff'],
  occupancy: ['ssOccupied', 'ssMotionOff'],
  presence: ['ssPresent', 'ssAbsent'],
  moving: ['ssMoving', 'ssStill'],
  vibration: ['ssVibration', 'ssStill'],
};

const lower = (text: string, locale: string) => (text ? text.charAt(0).toLocaleLowerCase(locale) + text.slice(1) : text);
const upper = (text: string, locale: string) => (text ? text.charAt(0).toLocaleUpperCase(locale) + text.slice(1) : text);

/** A word of Home Assistant ("spin_cycle") as a word to read ("Spin cycle"). */
function prettify(state: string, locale: string) {
  return upper(state.replace(/_/g, ' ').trim(), locale);
}

function number(value: number, locale: string, decimals?: number) {
  const digits = decimals ?? (Math.abs(value) < 10 && !Number.isInteger(value) ? 1 : 0);
  const text = new Intl.NumberFormat(locale, { minimumFractionDigits: decimals ?? 0, maximumFractionDigits: digits }).format(value);
  return text.replace(/^-/, '−');
}

function clock(time: number, locale: string) {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(time);
}

function duration(ms: number, dt: DevicesTranslator) {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return dt('durationMinutes', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours >= 24) return dt('durationDays', { n: Math.floor(hours / 24) });
  const rest = minutes % 60;
  return rest === 0 || hours >= 3 ? dt('durationHours', { n: hours }) : dt('durationHoursMinutes', { h: hours, m: rest });
}

function Icon({ icon: Glyph, tint }: { icon: LucideIcon; tint: Tint }) {
  return (
    <span className="dv-icon-button dv-ss-ic pointer-events-none" data-tint={tint ?? undefined} aria-hidden="true">
      <Glyph size={20} strokeWidth={2.2} />
    </span>
  );
}

function Big({ value, unit, color, aside, word = false }: { value: string; unit?: string; color?: string; aside?: React.ReactNode; word?: boolean }) {
  return (
    <span className={clsx('dv-ss-big', word && 'is-word')}>
      <b style={color ? { color } : undefined}>{value}</b>
      {unit ? <span>{unit}</span> : null}
      {aside ? <em>{aside}</em> : null}
    </span>
  );
}

function Rows({ rows }: { rows: Array<{ key: string; color: string; label: string; value: string }> }) {
  return (
    <span className="dv-ss-rows">
      {rows.map((row) => (
        <span key={row.key}>
          <i style={{ background: row.color }} />
          <b>{row.label}</b>
          <em>{row.value}</em>
        </span>
      ))}
    </span>
  );
}

function Bars({ values, height, color, colors }: { values: number[]; height: number; color: string; colors?: Array<string | null> }) {
  const max = Math.max(...values, 0) || 1;
  return (
    <span className="dv-ss-bars" style={{ height }} aria-hidden="true">
      {values.map((value, index) => (
        <i key={index} style={{ height: `${Math.max(6, Math.round((value / max) * 100))}%`, background: colors?.[index] ?? color }} />
      ))}
    </span>
  );
}

function Axis({ labels }: { labels: string[] }) {
  return (
    <span className="dv-axis">
      {labels.map((label, index) => (
        <span key={index}>{label}</span>
      ))}
    </span>
  );
}

/** The line of the day, with the ideal band behind it when there is one. */
function Chart({ points, color, band, axis }: { points: SeriesPoint[]; color: string; band?: [number, number] | null; axis: string[] }) {
  const line = sparkline(points, 64, 4, 4);
  const values = points.map((point) => point.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const y = (value: number) => 60 - ((value - min) / (max - min || 1)) * 56;
  const top = band ? Math.max(0, Math.min(64, y(band[1]))) : 0;
  const bottom = band ? Math.max(0, Math.min(64, y(band[0]))) : 0;
  return (
    <span className="dv-ss-chart">
      <svg viewBox="0 0 100 64" preserveAspectRatio="none" aria-hidden="true">
        {band && bottom > top ? <rect x="0" y={top} width="100" height={bottom - top} fill="rgba(48, 209, 88, 0.12)" /> : null}
        {line ? (
          <>
            <polygon points={line.area} fill={color} opacity={0.16} />
            <polyline points={line.line} fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </>
        ) : null}
      </svg>
      <Axis labels={axis} />
    </span>
  );
}

function Spark({ points, color }: { points: SeriesPoint[]; color: string }) {
  const line = sparkline(points, 34, 3, 3);
  if (!line) return <span className="dv-ss-spark" />;
  return (
    <svg className="dv-ss-spark" viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={line.line} fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** The gauge of the air: four bands and a needle. */
function AirGauge({ fraction, width }: { fraction: number; width: number }) {
  const angle = Math.PI * (1 - Math.max(0, Math.min(1, fraction)));
  const x = 60 + 32 * Math.cos(angle);
  const y = 58 - 32 * Math.sin(angle);
  const arcs = [
    ['M14 58 A46 46 0 0 1 36.6 18.4', GREEN],
    ['M36.6 18.4 A46 46 0 0 1 67.2 12.6', YELLOW],
    ['M67.2 12.6 A46 46 0 0 1 92.5 25.5', ORANGE],
    ['M92.5 25.5 A46 46 0 0 1 106 58', RED],
  ];
  return (
    <svg className="dv-ss-gauge" viewBox="0 0 120 66" style={{ width }} aria-hidden="true">
      {arcs.map(([d, stroke]) => (
        <path key={d} d={d} fill="none" stroke={stroke} strokeWidth={9} />
      ))}
      <line x1="60" y1="58" x2={x.toFixed(1)} y2={y.toFixed(1)} stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" />
      <circle cx="60" cy="58" r="5" fill="currentColor" />
    </svg>
  );
}

function Compass({ size, bearing, value, unit, north }: { size: number; bearing: number | null; value: string; unit: string; north: string }) {
  return (
    <span className="dv-ss-compass" style={{ width: size, height: size }} aria-hidden="true">
      <span>{north}</span>
      {bearing !== null ? <i style={{ transform: `rotate(${bearing}deg)` }} /> : null}
      <b>
        {value}
        <em>{unit}</em>
      </b>
    </span>
  );
}

function Ring({ fraction, color, value, caption }: { fraction: number; color: string; value: string; caption: string }) {
  const length = 2 * Math.PI * 30;
  return (
    <span className="dv-ss-center">
      <span className="dv-ss-ring" aria-hidden="true">
        <svg viewBox="0 0 72 72">
          <circle cx="36" cy="36" r="30" style={{ stroke: 'var(--dv-icon-off)' }} />
          <circle cx="36" cy="36" r="30" style={{ stroke: color, strokeDasharray: length.toFixed(1), strokeDashoffset: (length * (1 - Math.max(0, Math.min(1, fraction)))).toFixed(1) }} />
        </svg>
        <span>
          <b>{value}</b>
          <em>{caption}</em>
        </span>
      </span>
    </span>
  );
}

function Timeline({ spans, color = ORANGE }: { spans: Array<{ left: number; width: number }>; color?: string }) {
  return (
    <span className="dv-timeline" aria-hidden="true">
      {spans.map((span, index) => (
        <i key={index} style={{ left: `${(span.left * 100).toFixed(2)}%`, width: `${(span.width * 100).toFixed(2)}%`, background: color }} />
      ))}
    </span>
  );
}

type Context = {
  model: FamilySensorModel;
  alert: SensorAlert | null;
  history: SeriesPoint[];
  changes: StateChange[];
  house: SensorHouse | null;
  /** The meter of the house, in kW. */
  meterKw: number;
  now: number;
  dt: DevicesTranslator;
  locale: string;
};

const DAY_AXIS = (dt: DevicesTranslator) => ['0:00', '6:00', '12:00', '18:00', dt('ssNow')];
const HOURS_AXIS = ['0:00', '6:00', '12:00', '18:00', '24:00'];

/** Value and unit as the board writes them; °C and °F become a degree sign. */
function reading(model: FamilySensorModel, locale: string, decimals?: number) {
  const value = model.value === null ? '—' : number(model.value, locale, decimals);
  const unit = model.unit === '°C' || model.unit === '°F' ? '°' : model.unit;
  return { value, unit, text: unit === '°' || unit === '%' ? `${value}${unit}` : unit ? `${value} ${unit}` : value };
}

function statsLine(c: Context, decimals?: number) {
  const stats = seriesStats(c.history);
  if (!stats) return '';
  const unit = c.model.unit === '°C' || c.model.unit === '°F' ? '°' : c.model.unit ? ` ${c.model.unit}` : '';
  const f = (value: number) => `${number(value, c.locale, decimals)}${unit}`;
  return c.dt('sensorStats', { min: f(stats.min), max: f(stats.max), avg: f(stats.avg) });
}

function trendWord(c: Context) {
  const change = changeOver(c.history, 1, c.now);
  const min = Math.max(0.2, Math.abs(c.model.value ?? 0) * 0.02);
  if (Math.abs(change) < min) return '';
  return change > 0 ? c.dt('trendRising') : c.dt('trendFalling');
}

function measureFace(c: Context, icon: LucideIcon): Face {
  const { model, dt, locale, alert } = c;
  const r = reading(model, locale);
  const sound = model.deviceClass === 'sound_pressure' && model.value !== null;
  const word = sound ? dt(model.value! < 40 ? 'ssQuiet' : model.value! < T.measure.loud ? 'ssNormal' : 'ssNoisy') : '';
  const trend = trendWord(c);
  const color = alert ? ORANGE : GREY;
  const stats = statsLine(c);
  return {
    icon,
    tint: alert ? 'amber' : null,
    mini: word ? `${r.text} · ${lower(word, locale)}` : trend ? `${r.text} · ${trend}` : r.text,
    status: word || upper(trend, locale) || dt('ssStable'),
    body: (
      <>
        <Big value={r.value} unit={r.unit} color={alert ? ORANGE : undefined} />
        <Spark points={c.history} color={color} />
      </>
    ),
    title: `${model.name} · ${r.text}`,
    expandedStatus:
      alert?.reason === 'loud'
        ? dt('ssAboveFor', { value: `${T.measure.loud} dB`, time: duration(c.now - (alert.since ?? c.now), dt) })
        : stats.replace(/ · [^·]+$/, ''),
    expandedBody: <Chart points={c.history} color={color} axis={DAY_AXIS(dt)} />,
  };
}

function temperatureFace(c: Context): Face {
  const { model, dt, locale, alert } = c;
  if (model.value === null || model.deviceClass === 'temperature_delta') return measureFace(c, Thermometer);
  const r = reading(model, locale, 1);
  const celsius = toCelsius(model.value, model.unit);
  const word = dt(
    celsius <= T.temperature.cold ? 'ssTempCold'
      : celsius < 18 ? 'ssTempCool'
        : celsius <= 24 ? 'ssTempComfort'
          : celsius < T.temperature.hot ? 'ssTempWarm' : 'ssTempHot',
  );
  const change = changeOver(c.history, 3, c.now);
  const Arrow = change > 0 ? ArrowUpRight : ArrowDownRight;
  const arrow = Math.abs(change) >= 0.2 ? (
    <span className="inline-flex items-center gap-0.5">
      <Arrow size={13} strokeWidth={2.6} aria-hidden="true" />
      {`${change > 0 ? '+' : '−'}${number(Math.abs(change), locale, 1)}°`}
    </span>
  ) : undefined;
  const [lo, hi] = T.temperature.scale;
  const knob = Math.max(0, Math.min(1, (celsius - lo) / (hi - lo)));
  const hot = alert?.reason === 'hot';
  const cold = alert?.reason === 'cold';
  const color = hot ? RED : cold ? BLUE : ORANGE;
  const since = alert?.since ? duration(c.now - alert.since, dt) : null;
  const toUnit = (value: number) => (model.unit.includes('F') ? (value * 9) / 5 + 32 : value);
  const trend = trendWord(c);
  return {
    icon: Thermometer,
    tint: alert ? null : 'amber',
    fill: hot ? FILLS.hot : cold ? FILLS.blue : null,
    mini: `${r.text} · ${alert ? lower(word, locale) : trend || lower(word, locale)}`,
    status: word,
    body: (
      <>
        <Big value={r.value} unit={r.unit} aside={arrow} />
        <span className="dv-ss-scale">
          <span className="dv-ss-track is-comfort">
            <i style={{ left: `${(knob * 100).toFixed(0)}%` }} />
          </span>
          <span className="dv-ss-lab">
            <span>{`${number(toUnit(lo), locale)}°`}</span>
            <span>{dt('ssIdeal')}</span>
            <span>{`${number(toUnit(hi), locale)}°`}</span>
          </span>
        </span>
      </>
    ),
    title: `${model.name} · ${r.text}`,
    expandedStatus: hot
      ? since ? dt('ssHotTipSince', { time: since }) : dt('ssHotTip')
      : cold ? since ? dt('ssColdTipSince', { time: since }) : dt('ssColdTip') : statsLine(c, 1),
    aside: hot || cold || (celsius >= 18 && celsius <= 24) ? (
      <span
        className="dv-ss-tag"
        style={hot ? { background: 'rgba(255, 69, 58, 0.18)', color: RED } : cold ? { background: 'rgba(10, 132, 255, 0.18)', color: BLUE } : { background: 'rgba(48, 209, 88, 0.18)', color: GREEN }}
      >
        {dt(hot ? 'ssTagHot' : cold ? 'ssTagCold' : 'ssTagIdeal')}
      </span>
    ) : undefined,
    expandedBody: <Chart points={c.history} color={color} band={[toUnit(18), toUnit(24)]} axis={DAY_AXIS(dt)} />,
  };
}

function humidityFace(c: Context): Face {
  const { model, dt, locale, alert } = c;
  if (model.value === null || model.unit !== '%') return measureFace(c, Droplet);
  const r = reading(model, locale, 0);
  const [a, b] = T.humidity.ideal;
  const v = model.value;
  const word = dt(v <= T.humidity.dry ? 'ssHumDry' : v < a ? 'ssHumLow' : v <= b ? 'ssHumIdeal' : v < T.humidity.humid ? 'ssHumHigh' : 'ssHumHumid');
  const humid = alert?.reason === 'humid';
  const change = changeOver(c.history, 6, c.now);
  const sixHours = Math.abs(change) < 3 ? 'ssStable6h' : change > 0 ? 'ssRising6h' : 'ssFalling6h';
  return {
    icon: Droplet,
    tint: null,
    fill: humid ? FILLS.blue : null,
    mini: `${r.text} · ${lower(word, locale)}`,
    status: word,
    body: (
      <>
        <Big value={r.value} unit="%" color={humid ? '#64D2FF' : undefined} />
        <span className="dv-ss-scale">
          <span className="dv-ss-track">
            <span className="dv-ss-zone" style={{ left: `${a}%`, width: `${b - a}%` }} />
            <i style={{ left: `${Math.max(0, Math.min(100, v))}%`, background: humid ? BLUE : '#5AC8FA' }} />
          </span>
          <span className="dv-ss-lab">
            <span>0%</span>
            <span>{dt('ssIdealBand', { band: `${a}–${b}%` })}</span>
            <span>100%</span>
          </span>
        </span>
      </>
    ),
    title: `${model.name} · ${r.text}`,
    expandedStatus: humid ? dt('ssHumidTip') : alert?.reason === 'dry' ? dt('ssDryTip') : dt(sixHours),
    expandedBody: <Chart points={c.history} color={humid ? BLUE : '#5AC8FA'} band={[a, b]} axis={DAY_AXIS(dt)} />,
  };
}

function airFace(c: Context): Face {
  const { model, dt, locale, alert } = c;
  const band = model.value === null ? null : airBand(model.deviceClass, model.value);
  if (band === null || model.value === null) return measureFace(c, Leaf);
  const cuts = T.air[model.deviceClass];
  const edges = [0, ...cuts, cuts[2] * 1.4];
  const within = (model.value - edges[band]) / (edges[band + 1] - edges[band] || 1);
  const fraction = (band + Math.max(0, Math.min(1, within))) / 4;
  const label = POLLUTANT[model.deviceClass] ?? model.deviceClass;
  const r = reading(model, locale, 0);
  const title = dt((['ssAirGood', 'ssAirFair', 'ssAirPoor', 'ssAirBad'] as const)[band]);
  const quality = band >= 2 ? dt('ssAirAct') : title;
  const rows = [model, ...sensorPeers(c.house, model.entityId, ['air'])].slice(0, 3).map((row) => {
    const value = (row as { value: number | null }).value;
    const rowBand = value === null ? null : airBand(row.deviceClass, value);
    return {
      key: row.entityId,
      color: rowBand === null ? GREY : BAND[rowBand],
      label: POLLUTANT[row.deviceClass] ?? row.name,
      value: value === null ? '—' : `${number(value, locale, 0)} ${row.unit}`.trim(),
    };
  });
  return {
    icon: Leaf,
    tint: alert ? 'amber' : 'green',
    mini: alert ? `${quality} · ${label} ${r.value}` : `${title} · ${label} ${r.text}`,
    status: label,
    body: (
      <span className="dv-ss-gw">
        <AirGauge fraction={fraction} width={70} />
        <span>
          <Big value={r.value} unit={r.unit} />
          <em className="dv-ss-q" style={{ color: BAND[band] }}>{quality}</em>
        </span>
      </span>
    ),
    title: `${model.name} · ${title}`,
    expandedStatus: alert
      ? dt('ssAirTip')
      : model.changedAt ? dt('ssUpdatedAgo', { time: duration(c.now - model.changedAt, dt) }) : dt('ssUpdatedNow'),
    expandedBody: (
      <span className="dv-ss-airx">
        <AirGauge fraction={fraction} width={128} />
        <Rows rows={rows} />
      </span>
    ),
  };
}

function energyFace(c: Context): Face {
  const { model, dt, locale, alert } = c;
  if (model.value === null || !isMeteredPower(model.deviceClass, model.unit)) return measureFace(c, Zap);
  const kw = toKw(model.value, model.unit);
  const kwText = number(kw, locale, kw < 10 ? 1 : 0);
  const meter = c.meterKw;
  const share = Math.min(1, kw / meter);
  const kwhPoints = c.history.map((point) => ({ t: point.t, v: toKw(point.v, model.unit) }));
  const kwh = energySince(kwhPoints, startOfDay(c.now), c.now);
  const today = kwh !== null ? `${number(kwh, locale, 1)} kWh` : null;
  const near = alert?.reason === 'nearLimit';
  const consumers = housePowers(c.house, model.entityId).filter(({ kw: value }) => value < kw).slice(0, 2);
  const rest = kw - consumers.reduce((sum, item) => sum + item.kw, 0);
  const names = consumers.map(({ row }, index) => (index === 0 ? row.name : lower(row.name, locale)));
  const meterBar = (
    <span className="dv-ss-meter" aria-hidden="true">
      <i style={{ width: `${(share * 100).toFixed(0)}%`, background: near ? RED : YELLOW }} />
    </span>
  );
  return {
    icon: Zap,
    tint: null,
    fill: near ? FILLS.red : null,
    mini: near ? `${kwText} kW · ${dt('ssNearLimit')}` : today ? `${kwText} kW · ${lower(dt('ssTodayCap', { value: today }), locale)}` : `${kwText} kW`,
    status: near ? names.length > 0 ? dt('ssAppliancesOn', { names: names.join(dt('ssAnd')) }) : dt('ssNearLimitCap') : today ? dt('ssTodayCap', { value: today }) : '',
    body: (
      <>
        <Big value={kwText} unit="kW" color={near ? RED : undefined} />
        <span className="flex flex-col gap-2">
          {meterBar}
          <span className="dv-ss-mlab">
            <span>0</span>
            <span>{dt('ssMeter', { value: `${number(meter, locale, 1)} kW` })}</span>
          </span>
        </span>
      </>
    ),
    title: `${model.name} · ${kwText} kW`,
    expandedStatus: near ? dt('ssLimitTip') : today ? dt('ssTodayCap', { value: today }) : statsLine(c),
    expandedBody: near && consumers.length > 0 ? (
      <>
        <Rows
          rows={[
            ...consumers.map(({ row, kw: value }, index) => ({ key: row.entityId, color: index === 0 ? RED : ORANGE, label: row.name, value: `${number(value, locale, 1)} kW` })),
            ...(rest > 0.05 ? [{ key: 'rest', color: GREY, label: dt('ssOthers'), value: `${number(rest, locale, 1)} kW` }] : []),
          ]}
        />
        {meterBar}
      </>
    ) : (
      <span className="flex flex-col gap-1">
        <Bars values={hourlyMeans(kwhPoints, c.now)} height={56} color={near ? 'rgba(255, 69, 58, 0.8)' : 'rgba(255, 214, 10, 0.8)'} />
        <Axis labels={DAY_AXIS(dt)} />
      </span>
    ),
  };
}

function waterFace(c: Context): Face {
  const { model, dt, locale, alert } = c;
  if (model.value === null || model.deviceClass === 'volume_storage') return measureFace(c, Droplets);
  const flow = model.deviceClass === 'volume_flow_rate';
  // A water meter in m³ reads in litres for the day.
  const litres = !flow && model.unit === 'm³' && model.deviceClass !== 'gas';
  const scale = litres ? 1000 : 1;
  const dayUnit = litres ? 'L' : model.unit;
  const increase = flow ? null : increaseSince(c.history, startOfDay(c.now), model.value);
  const today = increase === null ? null : `${number(increase * scale, locale, increase * scale < 10 ? 1 : 0)} ${dayUnit}`;
  const quarterAgo = valueAt(c.history, c.now - 15 * 60_000);
  const rate = flow ? model.value : quarterAgo === null ? 0 : ((model.value - quarterAgo) * scale) / 15;
  const flowing = rate > 0;
  const leak = alert?.reason === 'leak';
  const since = leak && alert.since ? duration(c.now - alert.since, dt) : '';
  const leaked = leak && alert.since && !flow ? increaseSince(c.history, alert.since, model.value) : null;
  const r = reading(model, locale);
  const rateUnit = flow ? model.unit : `${dayUnit}/min`;
  const bars = flow ? hourlyMeans(c.history, c.now) : hourlyIncrease(c.history, c.now);
  return {
    icon: Droplets,
    tint: leak ? 'amber' : 'blue',
    fill: leak ? FILLS.amber : null,
    mini: leak ? dt('ssFlowingFor', { time: since }) : flow ? r.text : today ? dt('ssToday', { value: today }) : r.text,
    status: leak ? dt('ssLeakCap') : dt(flowing ? 'ssFlowNow' : 'ssFlowNone'),
    body: leak ? (
      <>
        <Big value={number(rate, locale, 1)} unit={rateUnit} color={ORANGE} />
        <span className="dv-ss-warnline">{dt('ssContinuousFor', { time: since })}</span>
      </>
    ) : (
      <>
        {flow ? <Big value={r.value} unit={r.unit} /> : <Big value={today ? today.replace(` ${dayUnit}`, '') : r.value} unit={today ? dayUnit : r.unit} />}
        {flow ? <Spark points={c.history} color={BLUE} /> : (
          <span className="dv-ss-digits">
            {number(model.value, locale, 1)}
            <em>{model.unit}</em>
          </span>
        )}
      </>
    ),
    title: leak ? `${model.name} · ${dt('ssLeak')}` : today ? `${model.name} · ${dt('ssToday', { value: today })}` : `${model.name} · ${r.text}`,
    expandedStatus: leak
      ? [dt('ssContinuousFor', { time: since }), leaked !== null ? `${number(leaked * scale, locale, 0)} ${dayUnit}` : ''].filter(Boolean).join(' · ')
      : flow ? statsLine(c) : dt('ssMeterReading', { value: r.text }),
    expandedBody: (
      <span className="flex flex-col gap-1">
        <Bars values={bars} height={leak ? 44 : 56} color={leak ? 'rgba(255, 159, 10, 0.8)' : 'rgba(10, 132, 255, 0.75)'} />
        <Axis labels={DAY_AXIS(dt)} />
      </span>
    ),
  };
}

function batteryFace(c: Context): Face {
  const { model, dt, locale, alert } = c;
  if (model.value === null) return measureFace(c, BatteryMedium);
  const band = batteryBand(model.value);
  const word = dt((['ssBattChange', 'ssBattDraining', 'ssBattHalf', 'ssBattFull'] as const)[band]);
  const kind = typeof model.attributes.battery_type === 'string' ? model.attributes.battery_type : '';
  const all = houseBatteries(c.house);
  const list = (all.some((row) => row.entityId === model.entityId) ? all : [{ ...model, value: model.value } as unknown as SensorHouseRow, ...all]).filter(
    (row) => row.value !== null,
  );
  const low = list.filter((row) => (row.value ?? 100) <= T.battery.low);
  list.sort((a, b) => (low.length > 0 ? (a.value ?? 0) - (b.value ?? 0) : (b.value ?? 0) - (a.value ?? 0)));
  const lowest = Math.min(...list.map((row) => row.value ?? 100));
  return {
    icon: alert ? BatteryLow : BatteryMedium,
    tint: alert ? 'amber' : 'green',
    mini: alert ? `${number(model.value, locale, 0)}% · ${dt('ssBattChangeLower')}` : `${number(model.value, locale, 0)}%`,
    status: alert && kind ? `${word} · ${kind}` : word,
    body: (
      <>
        <Big value={number(model.value, locale, 0)} unit="%" color={band === 0 ? RED : undefined} />
        <span className="dv-ss-batt is-large" aria-hidden="true">
          <i style={{ width: `${Math.max(2, Math.min(100, model.value))}%`, background: BATTERY_BAND[band] }} />
        </span>
      </>
    ),
    title: dt('ssBattHouse'),
    expandedStatus: low.length > 0 ? dt('ssBattToChange', { count: low.length }) : dt('ssBattAllAbove', { pct: Math.floor(lowest / 10) * 10 }),
    expandedBody: (
      <Rows
        rows={list.slice(0, 4).map((row) => ({
          key: row.entityId,
          color: BATTERY_BAND[batteryBand(row.value ?? 0)],
          label: row.name,
          value: `${number(row.value ?? 0, locale, 0)}%${row.entityId === model.entityId && alert && kind ? ` · ${kind}` : ''}`,
        }))}
      />
    ),
  };
}

function lightFace(c: Context): Face {
  const { model, dt, locale, alert } = c;
  if (model.value === null) return measureFace(c, Sun);
  const steps = lightSteps(model.deviceClass, model.value);
  const word = dt((['ssLight0', 'ssLight1', 'ssLight2', 'ssLight3', 'ssLight4', 'ssLight5'] as const)[steps]);
  const r = reading(model, locale, 0);
  const dark = alert?.reason === 'dark';
  const stats = seriesStats(c.history);
  return {
    icon: dark ? Moon : Sun,
    tint: null,
    mini: `${r.text} · ${lower(word, locale)}`,
    status: word,
    body: (
      <>
        <Big value={r.value} unit={r.unit} />
        <span className="dv-ss-lvls" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((index) => (
            <i key={index} className={clsx(index < steps && 'is-on')} />
          ))}
        </span>
      </>
    ),
    title: `${model.name} · ${lower(word, locale)}`,
    expandedStatus: dark
      ? alert.since ? dt('ssDarkFor', { time: duration(c.now - alert.since, dt) }) : dt('ssDarkBelow', { value: `${T.light.dark} lx` })
      : stats ? dt('ssMaxToday', { value: `${number(stats.max, locale, 0)} ${model.unit}` }) : word,
    expandedBody: <Chart points={c.history} color={dark ? GREY : YELLOW} axis={DAY_AXIS(dt)} />,
  };
}

function weatherFace(c: Context): Face {
  const { model, dt, locale, alert } = c;
  const wind = model.deviceClass === 'wind_speed' || model.deviceClass === 'speed';
  const bearingOnly = model.deviceClass === 'wind_direction';
  if (!wind && !bearingOnly) return measureFace(c, model.deviceClass.startsWith('precipitation') ? CloudRain : Gauge);
  const peers = sensorPeers(c.house, model.entityId, ['weather']);
  const direction = bearingOnly ? model.value : peers.find((row) => row.deviceClass === 'wind_direction')?.value ?? null;
  const point = direction !== null ? compassPoint(direction) : null;
  const dir = point ? dt(`ssDir${point}` as DevicesTranslationKey) : null;
  const kmh = wind && model.value !== null ? toKmh(model.value, model.unit) : null;
  const word = kmh === null ? '' : dt(kmh < 6 ? 'ssWindCalm' : kmh < 20 ? 'ssWindLight' : kmh < 39 ? 'ssWindModerate' : kmh < T.weather.windStrong ? 'ssWindStrongWord' : 'ssWindGusts');
  const strong = alert?.reason === 'windStrong';
  const r = reading(model, locale, 0);
  const compassValue = bearingOnly ? `${r.value}°` : r.value;
  const compassUnit = bearingOnly ? (point ?? '') : model.unit;
  const rows = peers
    .filter((row) => row.deviceClass !== 'wind_direction')
    .slice(0, 3)
    .map((row) => ({
      key: row.entityId,
      color: strong && (row.deviceClass === 'wind_speed' || row.deviceClass === 'speed') ? RED : row.deviceClass.startsWith('precipitation') ? BLUE : row.deviceClass.includes('pressure') ? GREY : '#64D2FF',
      label: row.name,
      value: row.value === null ? '—' : `${number(row.value, locale)} ${row.unit}`.trim(),
    }));
  return {
    icon: Wind,
    tint: strong ? 'amber' : null,
    mini: strong ? `${r.text} · ${dt('ssWindGustsLower')}` : dir && !bearingOnly ? `${r.text} ${dt('ssFrom', { dir })}` : bearingOnly && dir ? upper(dt('ssFrom', { dir }), locale) : `${r.text} · ${lower(word, locale)}`,
    status: strong ? `${dt('ssWindGusts')} · ${dt('ssWindTip')}` : dir ? dt('ssFromCap', { dir }) : word,
    body: <span className="dv-ss-center"><Compass size={86} bearing={direction} value={compassValue} unit={compassUnit} north={dt('ssCompassN')} /></span>,
    title: model.name,
    expandedStatus: strong ? dt('ssWindGusts') : [word, dir ? dt('ssFrom', { dir }) : ''].filter(Boolean).join(' '),
    expandedBody: (
      <span className="dv-ss-airx">
        <Compass size={104} bearing={direction} value={compassValue} unit={compassUnit} north={dt('ssCompassN')} />
        {rows.length > 0 ? <Rows rows={rows} /> : <Spark points={c.history} color="#64D2FF" />}
      </span>
    ),
  };
}

function signalFace(c: Context): Face {
  const { model, dt, locale, alert } = c;
  if (model.value === null || model.deviceClass !== 'signal_strength') return measureFace(c, model.deviceClass ? Router : Wifi);
  const bars = signalBars(model.value, model.unit);
  const word = dt((['ssSig1', 'ssSig2', 'ssSig3', 'ssSig4'] as const)[bars - 1]);
  const weak = alert?.reason === 'signalWeak';
  const color = weak ? ORANGE : bars >= 3 ? GREEN : YELLOW;
  const r = reading(model, locale, 0);
  return {
    icon: Wifi,
    tint: weak ? 'amber' : null,
    mini: `${word} · ${r.text}`,
    status: weak ? `${word} · ${dt('ssSigTip')}` : word,
    body: (
      <span className="dv-ss-sigw">
        <span className="dv-ss-sig" aria-hidden="true">
          {[25, 50, 75, 100].map((height, index) => (
            <i key={height} style={{ height: `${height}%`, background: index < bars ? color : undefined }} />
          ))}
        </span>
        <Big value={r.value} unit={r.unit} color={weak ? ORANGE : undefined} />
      </span>
    ),
    title: `${model.name} · ${r.text}`,
    expandedStatus: weak ? `${word} · ${dt('ssSigTip')}` : statsLine(c, 0) || word,
    expandedBody: <Chart points={c.history} color={color} axis={DAY_AXIS(dt)} />,
  };
}

/** A duration sensor's value in milliseconds. */
function durationMs(value: number, unit: string) {
  const factor: Record<string, number> = { ms: 1, s: 1000, min: 60_000, h: HOUR, d: 24 * HOUR };
  return value * (factor[unit] ?? 1000);
}

function timeFace(c: Context): Face {
  const { model, dt, locale, alert } = c;
  if (model.deviceClass === 'duration' || model.deviceClass === 'uptime' || (model.value !== null && model.deviceClass !== 'timestamp' && model.deviceClass !== 'date')) {
    const text = model.value === null ? '—' : duration(durationMs(model.value, model.unit), dt);
    return { ...measureFace(c, Clock), mini: text, body: <><Big value={text} word /><Spark points={c.history} color={GREY} /></>, title: `${model.name} · ${text}` };
  }
  const at = Date.parse(model.state);
  if (!Number.isFinite(at)) return stateFace(c);
  const start = model.changedAt !== null && model.changedAt < at ? model.changedAt : null;
  const finished = alert?.reason === 'finished';
  const total = start !== null ? at - start : null;
  if (at > c.now) {
    const left = at - c.now;
    const minutes = Math.max(1, Math.round(left / 60_000));
    const fraction = total ? (c.now - (start ?? c.now)) / total : 0;
    return {
      icon: Clock,
      tint: 'blue',
      mini: dt('ssEndsIn', { time: duration(left, dt) }),
      status: dt('ssEndsAt', { clock: clock(at, locale) }),
      body: <Ring fraction={fraction} color={BLUE} value={minutes < 60 ? `${minutes}` : `${Math.floor(minutes / 60)}:${`${minutes % 60}`.padStart(2, '0')}`} caption={minutes < 60 ? 'min' : 'h'} />,
      title: model.name,
      expandedStatus: start !== null ? dt('ssStartedAt', { clock: clock(start, locale) }) : dt('ssEndsAt', { clock: clock(at, locale) }),
      expandedBody: (
        <span className="flex flex-col gap-1">
          <Timeline spans={[{ left: 0, width: Math.max(0.02, fraction) }]} color={BLUE} />
          <Axis labels={[start !== null ? clock(start, locale) : '', dt('ssNow'), clock(at, locale)]} />
        </span>
      ),
    };
  }
  if (finished) {
    return {
      icon: CircleCheck,
      tint: 'green',
      mini: dt('ssFinishedAt', { clock: clock(at, locale) }),
      status: dt('ssFinishedAgo', { time: duration(c.now - at, dt) }),
      body: <Ring fraction={1} color={GREEN} value={dt('ssEnd')} caption={clock(at, locale)} />,
      title: model.name,
      expandedStatus: total ? dt('ssFinishedDuration', { clock: clock(at, locale), time: duration(total, dt) }) : dt('ssFinishedAt', { clock: clock(at, locale) }),
      expandedBody: (
        <span className="flex flex-col gap-1">
          <Timeline spans={[{ left: 0, width: 1 }]} color={GREEN} />
          <Axis labels={[start !== null ? clock(start, locale) : '', '', clock(at, locale)]} />
        </span>
      ),
    };
  }
  const day = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(at);
  const ago = dt('ssAgo', { time: duration(c.now - at, dt) });
  return {
    icon: Clock,
    tint: null,
    mini: `${day} · ${clock(at, locale)}`,
    status: upper(ago, locale),
    body: <Big value={clock(at, locale)} unit={day} />,
    title: model.name,
    expandedStatus: `${day} · ${clock(at, locale)}`,
    expandedBody: <Big value={upper(ago, locale)} word />,
  };
}

function stateFace(c: Context): Face {
  const { model, dt, locale, alert } = c;
  const options = Array.isArray(model.attributes.options) ? (model.attributes.options as unknown[]).map((option) => `${option}`) : [];
  const index = options.findIndex((option) => option.toLowerCase() === model.state.toLowerCase());
  const done = alert?.reason === 'done';
  // Home Assistant often says a cycle is over in English ("finished"): say it in the language of the app.
  const word = done ? dt('ssDone') : prettify(model.state, locale) || '—';
  const steps = options.length > 1 && options.length <= 8 ? options : [];
  const since = model.changedAt !== null ? upper(dt('ssSince', { time: duration(c.now - model.changedAt, dt) }), locale) : '';
  const stepBars = steps.length > 0 ? (
    <span className="dv-ss-steps" aria-hidden="true">
      {steps.map((option, step) => (
        <i key={option} style={{ background: done ? GREEN : step <= index ? BLUE : undefined }} />
      ))}
    </span>
  ) : null;
  return {
    icon: done ? CircleCheck : ListOrdered,
    tint: done ? 'green' : 'blue',
    mini: !done && index >= 0 && steps.length > 0 ? `${word} · ${dt('ssStepOf', { n: index + 1, count: steps.length })}` : word,
    status: since || (index >= 0 && steps.length > 0 ? dt('ssStepOf', { n: index + 1, count: steps.length }) : ''),
    body: (
      <>
        <Big value={word} word />
        {stepBars}
      </>
    ),
    title: `${model.name} · ${word}`,
    expandedStatus: since,
    expandedBody: (
      <span className="flex flex-col gap-2">
        {steps.length > 0 && steps.length <= 6 ? (
          <span className="dv-ss-phases">
            {steps.map((option, step) => (
              <span key={option} className={clsx(!done && step === index ? 'is-now' : (done || step < index) && 'is-done')}>
                {prettify(option, locale)}
              </span>
            ))}
          </span>
        ) : <Big value={word} word />}
        {stepBars}
      </span>
    ),
  };
}

function priceFace(c: Context): Face {
  const { model, dt, locale, alert } = c;
  if (model.value === null || !model.unit.includes('/')) return measureFace(c, Euro);
  const forecast = dayPrices(model.attributes, c.now);
  const prices = forecast ?? hourlyMeans(c.history, c.now);
  const mean = prices.length > 0 ? prices.reduce((sum, value) => sum + value, 0) / prices.length : model.value;
  const dear = alert?.reason === 'priceHigh';
  const word = dt(model.value <= mean * 0.85 ? 'ssPriceCheap' : dear ? 'ssPriceDear' : 'ssPriceAvg');
  const r = reading(model, locale, 2);
  const hourNow = new Date(c.now).getHours();
  const cheapStart = forecast ? cheapestRun(forecast, 3, 0) : null;
  const nextCheap = forecast ? cheapestRun(forecast, 1, Math.min(23, hourNow + 1)) : null;
  const hourLabel = (hour: number) => clock(startOfDay(c.now) + hour * HOUR, locale);
  let peakEnd = hourNow;
  if (forecast) while (peakEnd < 23 && forecast[peakEnd + 1] >= mean * T.price.dear) peakEnd += 1;
  const colors = prices.map((_, hour) =>
    forecast && dear && hour === hourNow ? ORANGE : cheapStart !== null && hour >= cheapStart && hour < cheapStart + 3 ? GREEN : 'rgba(142, 142, 147, 0.55)',
  );
  return {
    icon: Euro,
    tint: dear ? 'amber' : null,
    mini: `${r.text} · ${lower(word, locale)}`,
    status: word,
    body: (
      <>
        <Big value={r.value} unit={r.unit} color={dear ? ORANGE : undefined} />
        {nextCheap !== null ? (
          <span className="dv-ss-warnline" style={dear ? undefined : { color: GREEN }}>
            {dt('ssCheapestAt', { clock: hourLabel(nextCheap) })}
          </span>
        ) : null}
      </>
    ),
    title: `${model.name} · ${r.text}`,
    expandedStatus: dear
      ? forecast ? dt('ssPeakUntil', { clock: hourLabel(peakEnd + 1) }) : dt('ssPeakNow')
      : cheapStart !== null ? dt('ssCheapWindow', { from: hourLabel(cheapStart), to: hourLabel(cheapStart + 3) })
        : dt('ssDayMean', { value: `${number(mean, locale, 2)} ${model.unit}` }),
    expandedBody: (
      <span className="flex flex-col gap-1">
        <Bars values={prices} height={56} color="rgba(142, 142, 147, 0.55)" colors={colors} />
        <Axis labels={forecast ? HOURS_AXIS : DAY_AXIS(dt)} />
      </span>
    ),
  };
}

function openingFace(c: Context): Face {
  const { model, dt, locale } = c;
  const open = model.state.toLowerCase() === 'on';
  const feminine = model.deviceClass === 'door' || model.deviceClass === 'window';
  const word = dt(open ? feminine ? 'ssOpenF' : 'ssOpenM' : feminine ? 'ssClosedF' : 'ssClosedM');
  const openWord = dt(feminine ? 'ssOpenF' : 'ssOpenM');
  const icon = model.deviceClass === 'door' ? (open ? DoorOpen : DoorClosed) : model.deviceClass === 'garage_door' ? Warehouse : Grid2x2;
  const since = model.changedAt !== null ? duration(c.now - model.changedAt, dt) : null;
  const midnight = startOfDay(c.now);
  const changes = c.changes.length > 0 ? c.changes : model.changedAt !== null ? [{ t: model.changedAt, state: open ? 'on' : 'off' }] : [];
  const spans = yesSpans(changes, midnight, c.now);
  const day = c.now - midnight || 1;
  const bar = <Timeline spans={spans.map((span) => ({ left: (span.start - midnight) / day, width: (span.end - span.start) / day }))} />;
  const total = spans.reduce((sum, span) => sum + (span.end - span.start), 0);
  const line = since ? `${word} ${dt('ssSince', { time: since })}` : word;
  return {
    icon,
    tint: open ? 'amber' : null,
    fill: open ? FILLS.open : null,
    mini: line,
    status: line,
    body: (
      <>
        <Big value={word} word color={open ? ORANGE : undefined} />
        {bar}
      </>
    ),
    title: `${model.name} · ${word}`,
    expandedStatus: open
      ? since ? upper(dt('ssSince', { time: since }), locale) : word
      : c.changes.length > 0 && spans.length > 0
        ? spans.length === 1 ? dt('ssOneOpening', { time: duration(total, dt) }) : dt('ssOpenings', { count: spans.length, time: duration(total, dt) })
        : line,
    expandedBody: (
      <span className="flex flex-col gap-1.5">
        {bar}
        <Axis labels={DAY_AXIS(dt)} />
        <Rows
          rows={[...spans].reverse().slice(0, 2).map((span) => ({
            key: `${span.start}`,
            color: ORANGE,
            label: openWord,
            value: `${span.end >= c.now - 60_000 ? dt('ssNow') : clock(span.start, locale)} · ${duration(span.end - span.start, dt)}`,
          }))}
        />
      </span>
    ),
  };
}

function motionFace(c: Context): Face {
  const { model, dt, locale } = c;
  const on = model.state.toLowerCase() === 'on';
  const [onKey, offKey] = MOTION_WORDS[model.deviceClass] ?? MOTION_WORDS.motion;
  const word = dt(on ? onKey : offKey);
  const last = model.changedAt;
  const counts = c.changes.length > 0 ? hourlyYes(c.changes, c.now) : null;
  const today = c.changes.filter((change) => change.state === 'on' && change.t >= startOfDay(c.now)).length;
  const lastOn = [...c.changes].reverse().find((change) => change.state === 'on')?.t ?? last;
  const isMotion = model.deviceClass === 'motion' || model.deviceClass === 'occupancy' || model.deviceClass === '';
  const colors = counts?.map((_, index) => (on && index === counts.length - 1 ? BLUE : null));
  return {
    icon: model.deviceClass === 'presence' || model.deviceClass === 'occupancy' ? Activity : Footprints,
    tint: on ? 'blue' : null,
    mini: on ? isMotion ? dt('ssMotionNow') : word : isMotion && last !== null ? dt('ssNobodyFor', { time: duration(c.now - last, dt) }) : word,
    status: on ? dt('ssNowCap') : lastOn !== null ? dt('ssLastAt', { clock: clock(lastOn, locale) }) : '',
    body: (
      <>
        <Big value={word} word color={on ? BLUE : undefined} />
        {on ? (
          <span className="dv-ss-pulse" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        ) : counts ? <Bars values={counts} height={26} color="rgba(10, 132, 255, 0.55)" /> : null}
      </>
    ),
    title: `${model.name} · ${word}`,
    expandedStatus: on
      ? dt('ssNowCap')
      : counts && lastOn !== null ? dt('ssPassages', { count: today, clock: clock(lastOn, locale) }) : lastOn !== null ? dt('ssLastAt', { clock: clock(lastOn, locale) }) : '',
    expandedBody: counts ? (
      <span className="flex flex-col gap-1">
        <Bars values={counts} height={56} color="rgba(10, 132, 255, 0.6)" colors={colors} />
        <Axis labels={HOURS_AXIS} />
      </span>
    ) : <Big value={word} word color={on ? BLUE : undefined} />,
  };
}

function safetyFace(c: Context): Face {
  const { model, dt, locale, alert } = c;
  const [onKey, offKey, shoutKey] = SAFETY_WORDS[model.deviceClass] ?? SAFETY_WORDS.safety;
  const alarm = alert !== null;
  const critical = alert?.level === 'critical';
  const icon = model.deviceClass === 'smoke' || model.deviceClass === 'heat' ? Flame : model.deviceClass === 'moisture' ? Droplets : alarm ? Siren : ShieldCheck;
  const detectors = houseDetectors(c.house);
  const list = detectors.some((row) => row.entityId === model.entityId) ? detectors : [{ ...model, state: model.state.toLowerCase() } as unknown as SensorHouseRow, ...detectors];
  const ringing = list.filter((row) => row.state === 'on');
  const since = model.changedAt !== null ? upper(dt('ssSince', { time: duration(c.now - model.changedAt, dt) }), locale) : '';
  const wordOf = (row: Pick<SensorHouseRow, 'deviceClass' | 'state'>) => {
    const [on, off] = SAFETY_WORDS[row.deviceClass] ?? SAFETY_WORDS.safety;
    return dt(row.state === 'on' ? on : off);
  };
  return {
    icon,
    tint: alarm ? null : 'green',
    fill: alarm ? { ...(critical ? FILLS.red : FILLS.amber), loud: critical, all: true } : null,
    mini: alarm ? dt(shoutKey) : dt('ssAllGood'),
    miniShout: alarm,
    status: alarm ? since : dt('ssAllGood'),
    body: (
      <>
        <Big value={dt(alarm ? onKey : offKey)} word color={alarm ? '#FFFFFF' : GREEN} />
        {!alarm && model.battery !== null ? (
          <span className="dv-ss-batt" aria-hidden="true">
            <i style={{ width: `${Math.max(4, Math.min(100, model.battery))}%`, background: BATTERY_BAND[batteryBand(model.battery)] }} />
          </span>
        ) : null}
      </>
    ),
    title: alarm ? model.name : dt('ssDetectors'),
    expandedStatus: alarm ? since : ringing.length > 0 ? dt('ssInAlarm', { count: ringing.length }) : dt('ssAllFine'),
    expandedBody: alarm ? <Big value={dt(onKey)} word color="#FFFFFF" /> : (
      <Rows
        rows={list.slice(0, 4).map((row) => ({ key: row.entityId, color: row.state === 'on' ? RED : GREEN, label: row.name, value: wordOf(row) }))}
      />
    ),
  };
}

function deviceFace(c: Context): Face {
  const { model, dt, locale, alert } = c;
  const on = model.state.toLowerCase() === 'on';
  const [onKey, offKey, onIsGood] = DEVICE_WORDS[model.deviceClass] ?? ['ssGenericOn', 'ssGenericOff', true];
  const word = dt(on ? onKey : offKey);
  const good = on === onIsGood;
  const connectivity = model.deviceClass === 'connectivity';
  const since = model.changedAt !== null ? duration(c.now - model.changedAt, dt) : null;
  const offline = alert?.reason === 'offline';
  const icon = connectivity ? (offline ? WifiOff : Wifi) : model.deviceClass === 'plug' || model.deviceClass === 'power' ? Plug : model.deviceClass === 'battery' ? BatteryLow : ShieldCheck;
  const links = houseConnections(c.house);
  const list = connectivity ? (links.some((row) => row.entityId === model.entityId) ? links : [{ ...model, state: model.state.toLowerCase() } as unknown as SensorHouseRow, ...links]) : [];
  list.sort((a, b) => Number(a.state === 'on') - Number(b.state === 'on'));
  const online = list.filter((row) => row.state === 'on').length;
  return {
    icon,
    tint: connectivity && good ? 'green' : alert && !offline ? 'amber' : null,
    mini: offline && since ? dt('ssOfflineFor', { time: since }) : word,
    status: since ? upper(dt('ssSince', { time: since }), locale) : '',
    body: (
      <>
        <Big value={word} word color={offline ? 'var(--dv-t3)' : good && connectivity ? GREEN : alert ? ORANGE : undefined} />
        {offline ? <span className="dv-ss-warnline">{dt('ssCheckOn')}</span> : null}
      </>
    ),
    title: connectivity ? dt('ssDevices') : `${model.name} · ${word}`,
    expandedStatus: connectivity ? dt('ssOnlineCount', { on: online, off: list.length - online }) : since ? upper(dt('ssSince', { time: since }), locale) : '',
    expandedBody: connectivity ? (
      <Rows
        rows={list.slice(0, 4).map((row) => {
          const rowSince = row.changedAt !== null ? duration(c.now - row.changedAt, dt) : null;
          return {
            key: row.entityId,
            color: row.state === 'on' ? GREEN : GREY,
            label: row.name,
            value: row.state === 'on' ? dt('ssOnline') : rowSince ? dt('ssOfflineFor', { time: rowSince }) : dt('ssOffline'),
          };
        })}
      />
    ) : <Big value={word} word color={alert ? ORANGE : undefined} />,
  };
}

const FACES: Record<SensorFamily, (c: Context) => Face> = {
  temperature: temperatureFace,
  humidity: humidityFace,
  air: airFace,
  energy: energyFace,
  water: waterFace,
  battery: batteryFace,
  light: lightFace,
  weather: weatherFace,
  signal: signalFace,
  time: timeFace,
  state: stateFace,
  price: priceFace,
  measure: (c) => measureFace(c, c.model.deviceClass === 'sound_pressure' ? Volume2 : Gauge),
  opening: openingFace,
  motion: motionFace,
  safety: safetyFace,
  device: deviceFace,
};

/** What the card reads of a sensor: its alert and its words, for the panel to say the same. */
export function describeFamilySensor(
  model: FamilySensorModel,
  options: { history: SeriesPoint[]; changes: StateChange[]; house: SensorHouse | null; meterKw?: number; now: number; dt: DevicesTranslator; locale: string },
) {
  const { history, now, meterKw = T.energy.meterKw } = options;
  const prices = model.family === 'price' ? dayPrices(model.attributes, now) : null;
  const alert = model.available
    ? resolveSensorAlert({
      family: model.family,
      deviceClass: model.deviceClass,
      unit: model.unit,
      value: model.value,
      state: model.state,
      history,
      now,
      dayMean: prices ? prices.reduce((sum, value) => sum + value, 0) / prices.length : null,
      meterKw,
    })
    : null;
  const face = model.available ? FACES[model.family]({ ...options, model, alert, meterKw }) : null;
  return { alert, face, reading: reading(model, options.locale, model.family === 'temperature' ? 1 : model.family === 'price' ? 2 : undefined) };
}

export function SensorFamilyCard({
  model,
  history = [],
  changes = [],
  format,
  editing = false,
  selected = false,
  hiddenItem = false,
  meterKw = T.energy.meterKw,
  now: nowProp,
  onOpen,
  onSelect,
}: SensorFamilyCardProps) {
  const dt = useSensorFamilyTranslations();
  const { locale } = useI18n();
  const house = useSensorHouse();
  const now = nowProp ?? Date.now();
  const size = deviceCardSize(format);
  const prices = model.family === 'price' ? dayPrices(model.attributes, now) : null;
  const alert = model.available
    ? resolveSensorAlert({
      family: model.family,
      deviceClass: model.deviceClass,
      unit: model.unit,
      value: model.value,
      state: model.state,
      history,
      now,
      dayMean: prices ? prices.reduce((sum, value) => sum + value, 0) / prices.length : null,
      meterKw,
    })
    : null;
  const face = model.available ? FACES[model.family]({ model, alert, history, changes, house, meterKw, now, dt, locale }) : null;
  const icon = face?.icon ?? Gauge;
  const fill = face?.fill && (face.fill.all || size === 'mini') ? face.fill : null;
  const status = face ? (size === 'mini' ? face.mini : size === 'standard' ? face.status : face.expandedStatus) : dt('unavailable');

  const frame = (children: React.ReactNode, row = false) => (
    <CardFrame
      format={format}
      available={model.available}
      editing={editing}
      selected={selected}
      hiddenItem={hiddenItem}
      openLabel={dt('sensorAria', { name: model.name, value: face?.mini ?? dt('unavailable'), note: '' }).replace(/[,\s]+$/, '')}
      selectLabel={dt('select', { name: model.name })}
      onOpen={onOpen}
      onSelect={onSelect}
      className={clsx('dv-sensor-family', fill && 'dv-ss-alert', fill?.loud && 'is-loud')}
      style={fill ? ({ '--dv-ss-alert': fill.background, '--dv-ss-ink': fill.ink, '--dv-ss-ink-2': fill.ink2 } as React.CSSProperties) : undefined}
      testId="sensor-family-card"
    >
      <div className={row ? 'dv-tile-inner items-center gap-3 px-3.5' : 'dv-size-body'} data-family={model.family} data-alert={alert?.reason}>
        {children}
      </div>
    </CardFrame>
  );

  const head = (name: string, line: string, extra?: { oneLine?: boolean; aside?: React.ReactNode }) => (
    <CardHead
      icon={<Icon icon={icon} tint={face?.tint ?? null} />}
      name={name}
      status={line}
      oneLine={extra?.oneLine}
      aside={extra?.aside}
      statusClassName={size === 'mini' && face?.miniShout ? 'dv-ss-shout' : undefined}
    />
  );

  if (size === 'mini' || !face) return frame(head(model.name, status), size === 'mini');
  if (size === 'standard') {
    return frame(
      <>
        {head(model.name, face.status)}
        {face.body}
      </>,
    );
  }
  return frame(
    <>
      {head(face.title, face.expandedStatus, { oneLine: true, aside: face.aside })}
      {face.expandedBody}
    </>,
  );
}

export default SensorFamilyCard;
