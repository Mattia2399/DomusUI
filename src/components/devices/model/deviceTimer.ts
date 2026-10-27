import type { DevicesTranslator } from '../../../i18n/devicesTranslations';
import type { DeviceModel } from './device';

/*
 * The switch-off timers of plugs, fans and humidifiers. The integration runs
 * them and switches the device off itself; the page only shows and sets them.
 * Times are on this device's clock, corrected by the server's "now".
 */

export type DeviceTimer = {
  entityId: string;
  minutes: number;
  /** When the device switches off, in milliseconds on this device's clock. */
  endsAt: number;
};

/** The choices of the panel; 0 is no timer. */
export const TIMER_PRESETS = [0, 15, 30, 60, 120] as const;

const TIMER_DOMAINS = new Set(['switch', 'fan', 'humidifier']);

export function canHaveTimer(model: DeviceModel) {
  return model.kind !== 'cover' && model.kind !== 'virtual' && TIMER_DOMAINS.has(model.entityId.split('.')[0]);
}

/** The timers in an answer or an event of domusos/device_timers; null when it is not one. */
export function parseDeviceTimers(payload: unknown, receivedAt = Date.now()): Record<string, DeviceTimer> | null {
  if (!payload || typeof payload !== 'object') return null;
  const { now, timers } = payload as { now?: unknown; timers?: unknown };
  if (!Array.isArray(timers)) return null;
  const serverNow = typeof now === 'string' ? Date.parse(now) : NaN;
  const offset = Number.isFinite(serverNow) ? receivedAt - serverNow : 0;
  const result: Record<string, DeviceTimer> = {};
  timers.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const { entity_id: entityId, minutes, ends_at: endsAt } = entry as Record<string, unknown>;
    const end = typeof endsAt === 'string' ? Date.parse(endsAt) : NaN;
    if (typeof entityId !== 'string' || typeof minutes !== 'number' || !Number.isFinite(end)) return;
    result[entityId] = { entityId, minutes, endsAt: end + offset };
  });
  return result;
}

export function minutesLeft(timer: DeviceTimer, now: number) {
  return Math.max(1, Math.ceil((timer.endsAt - now) / 60_000));
}

/** "15 min", "1 h", "1 h 20 min". */
export function formatTimerDuration(minutes: number, dt: DevicesTranslator) {
  if (minutes < 60) return dt('durationMinutes', { n: minutes });
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? dt('durationHoursMinutes', { h: hours, m: rest }) : dt('durationHours', { n: hours });
}

/** The status of a card with its timer: "86 W · spegne tra 47 min". */
export function withTimer(status: string, timer: DeviceTimer | null | undefined, now: number, dt: DevicesTranslator) {
  if (!timer || timer.endsAt <= now) return status;
  return dt('timerCard', { status, left: formatTimerDuration(minutesLeft(timer, now), dt) });
}
