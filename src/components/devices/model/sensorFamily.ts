import type { SeriesPoint } from './sensor';

/*
 * The families of the sensor card (docs/design-reference/sensori): the 62
 * kinds of sensor and the 29 kinds of yes/no sensor of Home Assistant fall
 * into 17 families, each with its own drawing. resolveSensorFamily says which
 * one an entity belongs to; resolveSensorAlert says when it leaves its normal
 * state, from the thresholds of SENSOR_ALERT_THRESHOLDS. Plain functions.
 */

export type SensorFamily =
  | 'temperature'
  | 'humidity'
  | 'air'
  | 'energy'
  | 'water'
  | 'battery'
  | 'light'
  | 'weather'
  | 'signal'
  | 'time'
  | 'state'
  | 'price'
  | 'measure'
  | 'opening'
  | 'motion'
  | 'safety'
  | 'device';

/** The device classes of each family, as on the board. */
export const SENSOR_FAMILY_CLASSES: Record<SensorFamily, readonly string[]> = {
  temperature: ['temperature', 'temperature_delta'],
  humidity: ['humidity', 'absolute_humidity', 'moisture'],
  air: [
    'aqi', 'carbon_dioxide', 'carbon_monoxide', 'pm1', 'pm25', 'pm4', 'pm10', 'volatile_organic_compounds',
    'volatile_organic_compounds_parts', 'nitrogen_dioxide', 'nitrogen_monoxide', 'nitrous_oxide', 'ozone', 'sulphur_dioxide', 'radon',
  ],
  energy: [
    'power', 'apparent_power', 'reactive_power', 'power_factor', 'current', 'voltage', 'frequency', 'energy', 'energy_storage',
    'reactive_energy', 'energy_distance',
  ],
  water: ['water', 'gas', 'volume', 'volume_storage', 'volume_flow_rate'],
  battery: ['battery'],
  light: ['illuminance', 'irradiance'],
  weather: ['wind_speed', 'wind_direction', 'speed', 'precipitation', 'precipitation_intensity', 'atmospheric_pressure', 'pressure'],
  signal: ['signal_strength', 'data_rate', 'data_size'],
  time: ['timestamp', 'date', 'duration', 'uptime'],
  state: ['enum'],
  price: ['monetary'],
  measure: ['sound_pressure', 'distance', 'area', 'weight', 'ph', 'conductivity', 'blood_glucose_concentration'],
  opening: ['door', 'window', 'garage_door', 'opening'],
  motion: ['motion', 'occupancy', 'presence', 'moving', 'vibration'],
  safety: ['smoke', 'gas', 'carbon_monoxide', 'moisture', 'heat', 'cold', 'safety', 'tamper', 'problem', 'sound'],
  device: ['connectivity', 'plug', 'power', 'running', 'battery', 'battery_charging', 'light', 'lock', 'update'],
};

const YES_NO_FAMILIES: SensorFamily[] = ['opening', 'motion', 'safety', 'device'];

/** A sensor without a device class, told by its unit. */
const UNIT_FAMILY: Array<[RegExp, SensorFamily]> = [
  [/^°[CF]$/i, 'temperature'],
  [/^(m?W|kW|kWh|Wh|MWh|VA|var|A|mA|V|Hz)$/, 'energy'],
  [/^(L|m³|ft³|gal|L\/min|m³\/h)$/, 'water'],
  [/^(lx|W\/m²)$/, 'light'],
  [/^(ppm|ppb|µg\/m³|mg\/m³)$/, 'air'],
  [/^(km\/h|hPa|mbar|mm|mm\/h|inHg)$/, 'weather'],
  [/^(dBm|Mbit\/s|kbit\/s|Gbit\/s|MB|GB|TB)$/, 'signal'],
  [/^(€|\$|£|CHF|[A-Z]{3})(\/kWh|\/m³)?$/, 'price'],
  [/^(s|min|h|d)$/, 'time'],
];

export type SensorFamilyInput = {
  entityId: string;
  deviceClass?: string | null;
  unit?: string | null;
  /** The state, to tell a word from a number when nothing else does. */
  state?: string | null;
};

const isNumeric = (value: string | null | undefined) =>
  value !== null && value !== undefined && value.trim() !== '' && Number.isFinite(Number(value.replace(',', '.')));

export function resolveSensorFamily({ entityId, deviceClass, unit, state }: SensorFamilyInput): SensorFamily | null {
  const domain = entityId.split('.')[0];
  const cls = `${deviceClass ?? ''}`.trim().toLowerCase();
  if (domain === 'binary_sensor') {
    return YES_NO_FAMILIES.find((family) => SENSOR_FAMILY_CLASSES[family].includes(cls)) ?? 'device';
  }
  if (domain !== 'sensor') return null;
  if (cls) {
    const family = (Object.keys(SENSOR_FAMILY_CLASSES) as SensorFamily[]).find(
      (key) => !YES_NO_FAMILIES.includes(key) && SENSOR_FAMILY_CLASSES[key].includes(cls),
    );
    if (family) return family;
  }
  const trimmedUnit = `${unit ?? ''}`.trim();
  if (trimmedUnit) {
    if (trimmedUnit === '%') return 'measure';
    const match = UNIT_FAMILY.find(([pattern]) => pattern.test(trimmedUnit));
    if (match) return match[1];
    return 'measure';
  }
  return isNumeric(state ?? null) ? 'measure' : 'state';
}

/*
 * The thresholds. Values are read in the unit named here; the card converts
 * °F, m/s, mph and W before comparing.
 */
export const SENSOR_ALERT_THRESHOLDS = {
  /** °C: above it fa caldo, below it fa freddo. */
  temperature: { hot: 26, cold: 16, scale: [16, 30] as [number, number] },
  /** %: the ideal band, and the edges that call for the window or the dehumidifier. */
  humidity: { ideal: [40, 60] as [number, number], humid: 65, dry: 30 },
  /** The bands of the gauge: green below the first, yellow, orange, red from the last. Orange warns, red is critical. */
  air: {
    carbon_dioxide: [800, 1000, 1500],
    carbon_monoxide: [9, 35, 100],
    pm1: [12, 35, 55],
    pm25: [12, 35, 55],
    pm4: [12, 35, 55],
    pm10: [54, 154, 254],
    volatile_organic_compounds_parts: [150, 500, 1500],
    volatile_organic_compounds: [300, 1000, 3000],
    aqi: [50, 100, 150],
    nitrogen_dioxide: [40, 100, 200],
    ozone: [100, 180, 240],
    sulphur_dioxide: [40, 125, 350],
    radon: [100, 300, 1000],
  } as Record<string, [number, number, number]>,
  /** The meter of the house: power at 90 % of it is critical. */
  energy: { meterKw: 3.3, nearLimit: 0.9 },
  /** Water or gas flowing without a pause for this long may be a leak. */
  water: { leakMinutes: 120 },
  /** %: below these a battery is to change, then flat. */
  battery: { low: 15, empty: 5, bands: [15, 30, 50] as [number, number, number] },
  /** lx (W/m² for irradiance): below it it is dark; the five steps of the light. */
  light: { dark: 10, darkIrradiance: 5, steps: [10, 100, 1000, 10000, 50000], irradianceSteps: [5, 50, 200, 500, 800] },
  /** km/h for the wind, mm/h for the rain. */
  weather: { windStrong: 50, windStorm: 75, rainHeavy: 10 },
  /** dBm: the four bars of a phone, and the edge of a weak signal; % for integrations that give one. */
  signal: { bars: [-80, -67, -50] as [number, number, number], weak: -80, weakPercent: 25 },
  /** A past end time reads as just finished for this long. */
  time: { finishedMinutes: 180 },
  /** The words of an enum that mean the cycle is over. */
  state: { done: ['finished', 'finish', 'done', 'complete', 'completed', 'end', 'ended', 'program_ended', 'programme_ended'] },
  /** A price this far above the mean of the day is dear. */
  price: { dear: 1.25 },
  /** dB: above it the room is noisy. */
  measure: { loud: 55 },
} as const;

export type SensorAlertLevel = 'notice' | 'warning' | 'critical';
export type SensorAlertReason =
  | 'hot'
  | 'cold'
  | 'humid'
  | 'dry'
  | 'airPoor'
  | 'airBad'
  | 'nearLimit'
  | 'leak'
  | 'batteryLow'
  | 'batteryEmpty'
  | 'dark'
  | 'windStrong'
  | 'rainHeavy'
  | 'signalWeak'
  | 'finished'
  | 'done'
  | 'priceHigh'
  | 'loud'
  | 'open'
  | 'motion'
  | 'detected'
  | 'offline'
  | 'update';

export type SensorAlert = { level: SensorAlertLevel; reason: SensorAlertReason; since?: number | null };

export type SensorAlertInput = {
  family: SensorFamily;
  deviceClass?: string | null;
  unit?: string | null;
  /** The number of a sensor, null for a word or a yes/no. */
  value: number | null;
  /** The raw state: on/off for a yes/no, the word of an enum, the date of a timestamp. */
  state: string;
  /** The last 24 hours, oldest first. */
  history?: SeriesPoint[];
  /** The mean of the day for a price, when the integration gives one. */
  dayMean?: number | null;
  /** The meter of the house in kW. */
  meterKw?: number;
  now?: number;
};

const T = SENSOR_ALERT_THRESHOLDS;

/** °F to °C, the rest as it is. */
export function toCelsius(value: number, unit?: string | null) {
  return `${unit ?? ''}`.includes('F') ? ((value - 32) * 5) / 9 : value;
}

export function toKmh(value: number, unit?: string | null) {
  switch (`${unit ?? ''}`.trim()) {
    case 'm/s':
      return value * 3.6;
    case 'mph':
      return value * 1.609;
    case 'kn':
      return value * 1.852;
    case 'ft/s':
      return value * 1.097;
    default:
      return value;
  }
}

export function toKw(value: number, unit?: string | null) {
  const trimmed = `${unit ?? ''}`.trim();
  if (trimmed === 'W') return value / 1000;
  if (trimmed === 'mW') return value / 1_000_000;
  if (trimmed === 'MW') return value * 1000;
  return value;
}

/** A sensor of the power a house draws, read against its meter. */
export function isMeteredPower(deviceClass: unknown, unit: unknown) {
  return `${deviceClass ?? ''}`.trim().toLowerCase() === 'power' || /^(m?W|kW|MW)$/.test(`${unit ?? ''}`.trim());
}

/** Which band of the gauge a reading of air sits in: 0 green, 1 yellow, 2 orange, 3 red; null without a scale. */
export function airBand(deviceClass: string | null | undefined, value: number) {
  const cuts = T.air[`${deviceClass ?? ''}`];
  if (!cuts) return null;
  return cuts.filter((cut) => value >= cut).length;
}

/** The steps of light that are on, 0 to 5. */
export function lightSteps(deviceClass: string | null | undefined, value: number) {
  const steps = deviceClass === 'irradiance' ? T.light.irradianceSteps : T.light.steps;
  return steps.filter((step) => value >= step).length;
}

/** The bars of a signal, 1 to 4. */
export function signalBars(value: number, unit?: string | null) {
  if (`${unit ?? ''}`.trim() === '%') return Math.max(1, Math.min(4, Math.ceil(value / 25)));
  return 1 + T.signal.bars.filter((cut) => value >= cut).length;
}

/** The colour band of a battery: 0 red, 1 orange, 2 yellow, 3 green. */
export function batteryBand(value: number) {
  return T.battery.bands.filter((cut) => value >= cut).length;
}

/** Since when the history has been on the wrong side of a line, or null when it is not. */
function outsideSince(history: SeriesPoint[] | undefined, outside: (value: number) => boolean) {
  if (!history || history.length === 0) return null;
  let since: number | null = null;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (!outside(history[index].v)) break;
    since = history[index].t;
  }
  return since;
}

/*
 * A meter that went up in every quarter hour of the last two hours, or a flow
 * that never stopped: water (or gas) that does not stop flowing.
 */
function flowingSince(history: SeriesPoint[] | undefined, deviceClass: string | null | undefined, now: number) {
  if (!history || history.length < 2) return null;
  const window = T.water.leakMinutes * 60_000;
  const from = now - window;
  if (history[0].t > from) return null;
  if (deviceClass === 'volume_flow_rate') {
    const recent = history.filter((point) => point.t >= from);
    if (recent.length === 0 || recent.some((point) => point.v <= 0)) return null;
    return outsideSince(history, (value) => value > 0);
  }
  const quarter = 15 * 60_000;
  const valueAt = (time: number) => {
    let found = history[0].v;
    for (const point of history) {
      if (point.t > time) break;
      found = point.v;
    }
    return found;
  };
  for (let start = from; start < now; start += quarter) {
    if (valueAt(Math.min(now, start + quarter)) <= valueAt(start)) return null;
  }
  return from;
}

const YES = (state: string) => state === 'on';

export function resolveSensorAlert(input: SensorAlertInput): SensorAlert | null {
  const { family, value, history } = input;
  const cls = `${input.deviceClass ?? ''}`.trim().toLowerCase();
  const state = `${input.state ?? ''}`.trim().toLowerCase();
  const now = input.now ?? Date.now();

  switch (family) {
    case 'temperature': {
      if (value === null || cls === 'temperature_delta') return null;
      const celsius = toCelsius(value, input.unit);
      const toC = (v: number) => toCelsius(v, input.unit);
      if (celsius >= T.temperature.hot) {
        return { level: 'warning', reason: 'hot', since: outsideSince(history, (v) => toC(v) >= T.temperature.hot) };
      }
      if (celsius <= T.temperature.cold) {
        return { level: 'warning', reason: 'cold', since: outsideSince(history, (v) => toC(v) <= T.temperature.cold) };
      }
      return null;
    }
    case 'humidity': {
      if (value === null || cls !== 'humidity') return null;
      if (value >= T.humidity.humid) return { level: 'warning', reason: 'humid', since: outsideSince(history, (v) => v >= T.humidity.humid) };
      if (value <= T.humidity.dry) return { level: 'warning', reason: 'dry', since: outsideSince(history, (v) => v <= T.humidity.dry) };
      return null;
    }
    case 'air': {
      if (value === null) return null;
      const band = airBand(cls, value);
      if (band === null || band < 2) return null;
      return { level: band >= 3 ? 'critical' : 'warning', reason: band >= 3 ? 'airBad' : 'airPoor' };
    }
    case 'energy': {
      if (value === null || !isMeteredPower(cls, input.unit)) return null;
      const share = toKw(value, input.unit) / (input.meterKw ?? T.energy.meterKw);
      return share >= T.energy.nearLimit ? { level: 'critical', reason: 'nearLimit' } : null;
    }
    case 'water': {
      const since = flowingSince(history, cls, now);
      return since !== null ? { level: 'warning', reason: 'leak', since } : null;
    }
    case 'battery': {
      if (value === null) return null;
      if (value <= T.battery.empty) return { level: 'critical', reason: 'batteryEmpty' };
      if (value <= T.battery.low) return { level: 'warning', reason: 'batteryLow' };
      return null;
    }
    case 'light': {
      if (value === null) return null;
      const dark = cls === 'irradiance' ? T.light.darkIrradiance : T.light.dark;
      return value < dark ? { level: 'notice', reason: 'dark', since: outsideSince(history, (v) => v < dark) } : null;
    }
    case 'weather': {
      if (value === null) return null;
      if (cls === 'wind_speed' || cls === 'speed') {
        const kmh = toKmh(value, input.unit);
        if (kmh >= T.weather.windStorm) return { level: 'critical', reason: 'windStrong' };
        if (kmh >= T.weather.windStrong) return { level: 'warning', reason: 'windStrong' };
      }
      if (cls === 'precipitation_intensity' && value >= T.weather.rainHeavy) return { level: 'warning', reason: 'rainHeavy' };
      return null;
    }
    case 'signal': {
      if (value === null || cls !== 'signal_strength') return null;
      const weak = `${input.unit ?? ''}`.trim() === '%' ? value < T.signal.weakPercent : value < T.signal.weak;
      return weak ? { level: 'warning', reason: 'signalWeak' } : null;
    }
    case 'time': {
      if (cls !== 'timestamp') return null;
      const at = Date.parse(input.state);
      if (!Number.isFinite(at) || at > now || now - at > T.time.finishedMinutes * 60_000) return null;
      return { level: 'notice', reason: 'finished', since: at };
    }
    case 'state':
      return (T.state.done as readonly string[]).includes(state) ? { level: 'notice', reason: 'done' } : null;
    case 'price': {
      if (value === null) return null;
      const mean = input.dayMean ?? (history && history.length >= 6 ? history.reduce((sum, point) => sum + point.v, 0) / history.length : null);
      return mean !== null && mean > 0 && value >= mean * T.price.dear ? { level: 'warning', reason: 'priceHigh' } : null;
    }
    case 'measure':
      return cls === 'sound_pressure' && value !== null && value >= T.measure.loud
        ? { level: 'warning', reason: 'loud', since: outsideSince(history, (v) => v >= T.measure.loud) }
        : null;
    case 'opening':
      return YES(state) ? { level: 'notice', reason: 'open' } : null;
    case 'motion':
      return YES(state) ? { level: 'notice', reason: 'motion' } : null;
    case 'safety':
      if (!YES(state)) return null;
      return cls === 'tamper' || cls === 'problem' ? { level: 'warning', reason: 'detected' } : { level: 'critical', reason: 'detected' };
    case 'device':
      if (cls === 'connectivity') return state === 'off' ? { level: 'warning', reason: 'offline' } : null;
      if (cls === 'battery') return YES(state) ? { level: 'warning', reason: 'batteryLow' } : null;
      if (cls === 'update') return YES(state) ? { level: 'notice', reason: 'update' } : null;
      return null;
  }
}
