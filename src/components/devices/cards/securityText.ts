import type { DevicesTranslationKey, DevicesTranslator } from '../../../i18n/devicesTranslations';
import { LOW_BATTERY_PCT } from '../model/sensor';
import { motionNow, type LockState, type SecurityKind, type SecurityModel } from '../model/security';

export const LOCK_KEY: Record<LockState, DevicesTranslationKey> = {
  locked: 'lockLocked',
  unlocked: 'lockUnlocked',
  open: 'lockOpen',
  locking: 'lockLocking',
  unlocking: 'lockUnlocking',
  opening: 'lockOpening',
  jammed: 'lockJammed',
};

export const SECURITY_KIND_KEY: Record<SecurityKind, DevicesTranslationKey> = {
  contact: 'kindContact',
  motion: 'kindMotion',
  vibration: 'kindVibration',
  leak: 'kindLeak',
  lock: 'kindLock',
  camera: 'kindCamera',
};

/** "adesso", "25 min", "2 h", "1 h 20 min". */
export function durationWord(ms: number, dt: DevicesTranslator) {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 1) return dt('timeNow');
  if (minutes < 60) return dt('timeMinutes', { n: minutes });
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest >= 5 && minutes < 600 ? dt('timeHoursMinutes', { h: hours, m: rest }) : dt('timeHours', { n: hours });
}

export function clockOf(ms: number, locale: string) {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
}

/** What the card says: "Aperta da 25 min", "Movimento adesso", "Chiusa · batteria 12%"… */
export function securityStatus(model: SecurityModel, dt: DevicesTranslator, cameraLabel?: string, now = Date.now()) {
  if (!model.available) return dt('unavailable');
  const since = model.changedAt === null ? null : now - model.changedAt;
  let status: string;
  switch (model.kind) {
    case 'contact':
      status = model.active ? (since === null ? dt('contactOpen') : dt('contactOpenFor', { time: durationWord(since, dt) })) : dt('contactClosed');
      break;
    case 'motion':
      status = motionNow(model) ? dt('motionNowWord') : since === null ? dt('motionNone') : dt('motionLast', { time: durationWord(since, dt) });
      break;
    case 'vibration':
      status = model.active ? dt('vibrationNow') : dt('vibrationNone');
      break;
    case 'leak':
      status = model.active ? dt('leakWet') : dt('leakDry');
      break;
    case 'lock':
      status = model.lock ? dt(LOCK_KEY[model.lock]) : dt('unavailable');
      break;
    default:
      status = cameraLabel ?? dt('cameraLive');
  }
  return model.battery !== null && model.battery <= LOW_BATTERY_PCT ? dt('withBattery', { status, pct: Math.round(model.battery) }) : status;
}
