import type { AppLocale } from '../../i18n/I18nProvider';
import { binarySensorCopy, binarySensorStateLabels } from '../../i18n/binarySensorTranslations';

export type BinarySensorState = 'on' | 'off' | 'unknown' | 'unavailable';
export type BinarySensorTone = 'active' | 'success' | 'alert' | 'neutral' | 'muted';
export type BinarySensorIcon = 'door' | 'motion' | 'connection' | 'hazard' | 'water' | 'battery' | 'presence' | 'generic';

const CRITICAL_CLASSES = new Set(['battery', 'carbon_monoxide', 'gas', 'problem', 'safety', 'smoke', 'tamper']);
const DOOR_CLASSES = new Set(['door', 'garage_door', 'lock', 'opening', 'window']);
const MOTION_CLASSES = new Set(['motion', 'moving', 'occupancy', 'vibration']);
const CONNECTION_CLASSES = new Set(['connectivity', 'plug', 'power']);

export function resolveBinarySensorPresentation(
  rawState: string | undefined,
  rawDeviceClass: unknown,
  locale: AppLocale,
) {
  const stateValue = rawState?.trim().toLowerCase();
  const state: BinarySensorState = stateValue === 'on' || stateValue === 'off'
    ? stateValue
    : stateValue === 'unavailable' ? 'unavailable' : 'unknown';
  const deviceClass = typeof rawDeviceClass === 'string' ? rawDeviceClass.trim().toLowerCase() : '';
  const copy = binarySensorCopy[locale];
  const labels = binarySensorStateLabels[locale][deviceClass] ?? copy.fallback;
  const label = state === 'on' ? labels[0]
    : state === 'off' ? labels[1]
      : state === 'unavailable' ? copy.unavailable : copy.unknown;
  const icon: BinarySensorIcon = DOOR_CLASSES.has(deviceClass) ? 'door'
    : MOTION_CLASSES.has(deviceClass) ? 'motion'
      : CONNECTION_CLASSES.has(deviceClass) ? 'connection'
        : CRITICAL_CLASSES.has(deviceClass) ? deviceClass === 'battery' ? 'battery' : 'hazard'
          : deviceClass === 'moisture' ? 'water'
            : deviceClass === 'presence' ? 'presence' : 'generic';
  let tone: BinarySensorTone;
  if (state === 'unknown' || state === 'unavailable') {
    tone = 'muted';
  } else if (deviceClass === 'connectivity') {
    tone = state === 'on' ? 'success' : 'alert';
  } else if (CRITICAL_CLASSES.has(deviceClass)) {
    tone = state === 'on' ? 'alert' : 'success';
  } else {
    tone = state === 'on' ? 'active' : 'neutral';
  }
  return { state, label, icon, tone, available: state === 'on' || state === 'off' };
}
