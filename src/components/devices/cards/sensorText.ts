import type { DevicesTranslationKey, DevicesTranslator } from '../../../i18n/devicesTranslations';
import { SENSOR_KINDS, sensorReading, type SensorKind, type SensorModel, type SensorWord } from '../model/sensor';

const WORD_KEY: Record<SensorWord, DevicesTranslationKey> = {
  cool: 'wordCool',
  comfort: 'wordComfort',
  warm: 'wordWarm',
  dry: 'wordDry',
  ideal: 'wordIdeal',
  aBitHigh: 'wordABitHigh',
  tooHumid: 'wordTooHumid',
  goodAir: 'wordGoodAir',
  airOut: 'wordAirOut',
  staleAir: 'wordStaleAir',
  excellent: 'wordExcellent',
  fair: 'wordFair',
  poor: 'wordPoor',
  dim: 'wordDim',
  soft: 'wordSoft',
  bright: 'wordBright',
  quiet: 'wordQuiet',
  normal: 'wordNormal',
  noisy: 'wordNoisy',
};

/** Labels of the three zones of the scale of each kind; an empty first zone has no label. */
export const ZONE_KEYS: Record<Exclude<SensorKind, 'smoke'>, Array<DevicesTranslationKey | null>> = {
  temp: ['zoneTempLow', 'zoneTempMid', 'zoneTempHigh'],
  hum: ['zoneHumLow', 'zoneHumMid', 'zoneHumHigh'],
  co2: [null, 'zoneCo2Mid', 'zoneCo2High'],
  pm: ['zonePmLow', 'zonePmMid', 'zonePmHigh'],
  lux: ['zoneLuxLow', 'zoneLuxMid', 'zoneLuxHigh'],
  noise: [null, 'zoneNoiseMid', 'zoneNoiseHigh'],
};

export const TIP_KEY: Partial<Record<SensorKind, DevicesTranslationKey>> = { hum: 'tipHum', co2: 'tipCo2', pm: 'tipPm' };

/** "21,5", "48", "910": the decimals of the kind, in the reader's language. */
export function formatSensorValue(kind: SensorKind, value: number, locale: string) {
  const decimals = kind === 'smoke' ? 0 : SENSOR_KINDS[kind].decimals;
  return new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

/** The value with its unit: "21,5°", "48%", "910 ppm". */
export function withUnit(kind: SensorKind, text: string) {
  if (kind === 'smoke') return text;
  const unit = SENSOR_KINDS[kind].unit;
  return unit === '°' || unit === '%' ? `${text}${unit}` : `${text} ${unit}`;
}

/** The big value and the line under it, on the card and in the panel. */
export function sensorFace(model: SensorModel, dt: DevicesTranslator, locale: string) {
  if (model.kind === 'smoke') {
    return model.alarm
      ? { value: dt('smokeAlarm'), unit: '', note: dt('smokeNow'), warn: true }
      : { value: dt('smokeOk'), unit: '', note: dt('smokeNone'), warn: false };
  }
  if (!model.available || model.value === null) return { value: '—', unit: '', note: dt('sensorAway'), warn: true };
  const { word, warn } = sensorReading(model);
  return {
    value: formatSensorValue(model.kind, model.value, locale),
    unit: SENSOR_KINDS[model.kind].unit,
    note: word ? dt(WORD_KEY[word]) : '',
    warn,
  };
}

export function sensorUpdated(model: SensorModel, dt: DevicesTranslator, now = Date.now()) {
  if (model.changedAt === null) return null;
  const minutes = Math.max(0, Math.round((now - model.changedAt) / 60_000));
  if (minutes < 1) return dt('updatedNow');
  if (minutes < 60) return dt('updatedMinutes', { n: minutes });
  return dt('updatedHours', { n: Math.round(minutes / 60) });
}
