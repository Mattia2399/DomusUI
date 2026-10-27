import type { DevicesTranslator, DevicesTranslationKey } from '../../../i18n/devicesTranslations';
import type { ClimateActivity, ClimateMode, ClimateModel } from '../model/climate';

export const CLIMATE_MODE_KEY: Record<ClimateMode, DevicesTranslationKey> = {
  off: 'modeOff',
  heat: 'modeHeat',
  cool: 'modeCool',
  heat_cool: 'modeHeatCool',
  auto: 'modeAuto',
  dry: 'modeDry',
  fan_only: 'modeFan',
};

const ACTIVITY_KEY: Record<ClimateActivity, DevicesTranslationKey> = {
  heating: 'activityHeating',
  cooling: 'activityCooling',
  idle: 'activityIdle',
  drying: 'activityDrying',
  fan: 'activityFan',
  waiting: 'activityWaiting',
  off: 'modeOff',
};

const FAN_PILL: Record<string, string> = { auto: 'Auto', low: '1', medium: '2', mid: '2', high: '3' };
const FAN_WORD: Record<string, DevicesTranslationKey> = { auto: 'fanWordAuto', low: 'fanWordLow', medium: 'fanWordMedium', mid: 'fanWordMedium', high: 'fanWordHigh' };
const PRESET: Record<string, DevicesTranslationKey> = {
  eco: 'presetEco',
  comfort: 'presetComfort',
  boost: 'presetBoost',
  sleep: 'presetSleep',
  away: 'presetAway',
  home: 'presetHome',
  activity: 'presetActivity',
};

const capitalise = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');

/** "20,9°" or "21°", in the reader's language. */
export function degrees(value: number, locale: string) {
  const rounded = Math.round(value * 10) / 10;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: rounded % 1 === 0 ? 0 : 1 }).format(rounded)}°`;
}

export function fanPillLabel(fanMode: string) {
  return FAN_PILL[fanMode.toLowerCase()] ?? capitalise(fanMode);
}

export function fanWord(fanMode: string, dt: DevicesTranslator) {
  const key = FAN_WORD[fanMode.toLowerCase()];
  return key ? dt(key) : fanMode.replace(/_/g, ' ');
}

export function presetLabel(preset: string, dt: DevicesTranslator) {
  const key = PRESET[preset.toLowerCase()];
  return key ? dt(key) : capitalise(preset);
}

export function climateActivityWord(model: ClimateModel, dt: DevicesTranslator) {
  if (model.mode === 'heat_cool' && model.activity === 'idle') return dt('activityInRange');
  return dt(ACTIVITY_KEY[model.activity]);
}

/** "Sta riscaldando · ora 20,9°", or just what it is doing when the room temperature is unknown. */
export function climateStatus(model: ClimateModel, dt: DevicesTranslator, locale: string, roomTemperature?: number | null) {
  if (!model.available) return dt('unavailable');
  const now = model.current ?? roomTemperature ?? null;
  const word = climateActivityWord(model, dt);
  return now === null ? word : dt('statusNow', { action: word, t: degrees(now, locale) });
}

/** The big number of the card and the words above it. */
export function climateBig(model: ClimateModel, dt: DevicesTranslator, locale: string, roomHumidity?: number | null, roomTemperature?: number | null) {
  const now = model.current ?? roomTemperature ?? null;
  if (model.mode === 'off') return { caption: dt('captionRoom'), big: now === null ? '—' : degrees(now, locale) };
  if (model.mode === 'heat_cool') {
    return {
      caption: dt('captionRange'),
      big: model.low !== null && model.high !== null ? `${degrees(model.low, locale).replace('°', '')}–${degrees(model.high, locale)}` : '—',
    };
  }
  if (model.mode === 'dry') return { caption: dt('captionHumidity'), big: typeof roomHumidity === 'number' ? `${Math.round(roomHumidity)}%` : '—' };
  if (model.mode === 'fan_only') return { caption: dt('captionFan'), big: model.fanMode ? fanPillLabel(model.fanMode) : 'Auto' };
  const caption = model.mode === 'heat' ? dt('captionHeat') : model.mode === 'cool' ? dt('captionCool') : dt('captionAuto');
  return { caption, big: model.target === null ? '—' : degrees(model.target, locale) };
}

/** The line at the foot of the card. */
export function climateFoot(model: ClimateModel, dt: DevicesTranslator, roomHumidity?: number | null, swinging = false) {
  if (model.mode === 'off') return dt('footOff');
  if (model.fanMode && model.mode !== 'dry' && model.mode !== 'fan_only') {
    return swinging ? dt('footFanSwing', { fan: fanWord(model.fanMode, dt) }) : dt('footFan', { fan: fanWord(model.fanMode, dt) });
  }
  return typeof roomHumidity === 'number' ? dt('footHumidity', { pct: Math.round(roomHumidity) }) : null;
}

/** The status of a small climate card: "Spento · 20,5°", "20,5° → 21°". */
export function climateCompactStatus(model: ClimateModel, dt: DevicesTranslator, locale: string) {
  if (!model.available) return dt('unavailable');
  const now = model.current;
  if (model.mode === 'off') return now === null ? dt('modeOff') : dt('extraOff', { t: degrees(now, locale) });
  if (now !== null && model.target !== null) return dt('extraTo', { now: degrees(now, locale), target: degrees(model.target, locale) });
  return climateActivityWord(model, dt);
}
