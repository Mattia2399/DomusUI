import type { DevicesTranslator } from '../../../i18n/devicesTranslations';
import { lightStatusOf, type LightModel, type LightTone } from '../model/light';

const TONE_KEY = {
  candle: 'toneCandle',
  warm: 'toneWarm',
  neutral: 'toneNeutral',
  cool: 'toneCool',
} as const;

const TONE_TITLE_KEY = {
  candle: 'toneCandleTitle',
  warm: 'toneWarmTitle',
  neutral: 'toneNeutralTitle',
  cool: 'toneCoolTitle',
} as const;

export function toneTitle(tone: LightTone, dt: DevicesTranslator) {
  return dt(TONE_TITLE_KEY[tone]);
}

export function toneWord(tone: LightTone, dt: DevicesTranslator) {
  return dt(TONE_KEY[tone]);
}

/** "72% · calda", "40% · colore", "Accesa", "Spenta", "Non disponibile". */
export function formatLightStatus(model: LightModel, dt: DevicesTranslator) {
  const status = lightStatusOf(model);
  if (status.kind === 'unavailable') return dt('unavailable');
  if (status.kind === 'off') return dt('off');
  if (status.kind === 'on') return dt('on');
  if (status.detail === null) return dt('level', { pct: status.pct });
  const tone = status.detail === 'color' ? dt('toneColor') : toneWord(status.detail, dt);
  return dt('levelTone', { pct: status.pct, tone });
}
