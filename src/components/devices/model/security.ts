import type { MockEntityState } from '../../../types/ha';
import { entityChangedAt, LOW_BATTERY_PCT } from './sensor';

/*
 * The security devices of a room: door and window contacts, motion,
 * vibration, water leaks, locks and cameras. What each is doing, whether it
 * calls for attention, the lock commands, and the state changes of the day.
 */

export type SecurityKind = 'contact' | 'motion' | 'vibration' | 'leak' | 'lock' | 'camera';
export type LockState = 'locked' | 'unlocked' | 'open' | 'locking' | 'unlocking' | 'opening' | 'jammed';

const CONTACT_CLASSES = ['door', 'window', 'opening', 'garage_door'];
const MOTION_CLASSES = ['motion', 'occupancy', 'presence'];
const LOCK_STATES: LockState[] = ['locked', 'unlocked', 'open', 'locking', 'unlocking', 'opening', 'jammed'];
const LOCK_FEATURE_OPEN = 1;

export type SecurityModel = {
  entityId: string;
  name: string;
  kind: SecurityKind;
  available: boolean;
  /** Open, moving, vibrating or wet; for a lock, not locked. */
  active: boolean;
  lock: LockState | null;
  canOpen: boolean;
  changedAt: number | null;
  battery: number | null;
};

export function securityKindOf(entityId: string, entity: MockEntityState | undefined): SecurityKind | null {
  const domain = entityId.split('.')[0];
  if (domain === 'lock') return 'lock';
  if (domain === 'camera') return 'camera';
  if (domain !== 'binary_sensor') return null;
  const deviceClass = `${entity?.rawAttributes?.device_class ?? ''}`.trim().toLowerCase();
  if (CONTACT_CLASSES.includes(deviceClass)) return 'contact';
  if (MOTION_CLASSES.includes(deviceClass)) return 'motion';
  if (deviceClass === 'vibration') return 'vibration';
  if (deviceClass === 'moisture') return 'leak';
  return null;
}

export function toSecurityModel(
  entityId: string,
  entity: MockEntityState | undefined,
  options: { battery?: number | null } = {},
): SecurityModel | null {
  const kind = securityKindOf(entityId, entity);
  if (!kind) return null;
  const state = `${entity?.state ?? ''}`.trim().toLowerCase();
  const friendly = entity?.rawAttributes?.friendly_name;
  const lock = kind === 'lock' && (LOCK_STATES as string[]).includes(state) ? (state as LockState) : null;
  const features = Number(entity?.rawAttributes?.supported_features ?? entity?.supportedFeatures ?? 0);
  return {
    entityId,
    name: typeof friendly === 'string' && friendly.trim() ? friendly.trim() : entityId.split('.')[1] ?? entityId,
    kind,
    available: Boolean(entity) && state !== 'unavailable' && state !== 'unknown' && state !== '',
    active: kind === 'lock' ? lock !== null && lock !== 'locked' && lock !== 'locking' : kind === 'camera' ? false : state === 'on',
    lock,
    canOpen: kind === 'lock' && (features & LOCK_FEATURE_OPEN) !== 0,
    changedAt: entityChangedAt(entity),
    battery: options.battery ?? null,
  };
}

/** Something to check: open, wet, a lock not locked or stuck, a device away, a battery running out. */
export function securityWarns(model: SecurityModel) {
  if (!model.available) return true;
  if (model.battery !== null && model.battery <= LOW_BATTERY_PCT) return true;
  if (model.kind === 'contact' || model.kind === 'leak') return model.active;
  if (model.kind === 'lock') return model.lock === 'unlocked' || model.lock === 'open' || model.lock === 'jammed';
  return false;
}

/** The ones that are worrying in themselves, for the room's pill and the status row. */
export function securityAlerts(model: SecurityModel) {
  return model.available && ((model.kind === 'contact' || model.kind === 'leak') ? model.active : model.kind === 'lock' && model.lock === 'jammed');
}

/** Motion seen now: the sensor says "on" while it sees it. */
export function motionNow(model: SecurityModel) {
  return model.kind === 'motion' && model.available && model.active;
}

export type LockCommand = 'lock' | 'unlock' | 'open';

export function lockServiceCall(model: SecurityModel, command: LockCommand) {
  return { domain: 'lock', service: command, data: { entity_id: model.entityId } };
}

export function applyLockCommand(model: SecurityModel, command: LockCommand): SecurityModel {
  const lock: LockState = command === 'lock' ? 'locking' : command === 'unlock' ? 'unlocking' : 'opening';
  return { ...model, lock, active: command !== 'lock' };
}

export type StateChange = { t: number; state: string };

/** The state changes of one entity from `history/history_during_period`, oldest first. */
export function parseStateHistory(payload: unknown, entityId: string): StateChange[] {
  if (!payload || typeof payload !== 'object') return [];
  const list = (payload as Record<string, unknown>)[entityId];
  if (!Array.isArray(list)) return [];
  const changes: StateChange[] = [];
  list.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const record = entry as Record<string, unknown>;
    const state = typeof (record.s ?? record.state) === 'string' ? String(record.s ?? record.state) : null;
    const raw = record.lu ?? record.lc ?? record.last_changed ?? record.last_updated;
    const t = typeof raw === 'number' ? (raw < 1e12 ? raw * 1000 : raw) : typeof raw === 'string' ? Date.parse(raw) : Number.NaN;
    if (state === null || !Number.isFinite(t)) return;
    if (changes.length > 0 && changes[changes.length - 1].state === state) return;
    changes.push({ t, state });
  });
  return changes.sort((a, b) => a.t - b.t);
}

/** Spans of a day when the state was "on", as shares of the day, for the strip of a contact. */
export function onSpans(changes: StateChange[], from: number, to: number) {
  const spans: Array<{ start: number; end: number }> = [];
  changes.forEach((change, index) => {
    if (change.state !== 'on') return;
    const end = changes[index + 1]?.t ?? to;
    const start = Math.max(from, change.t);
    if (end > start) spans.push({ start: (start - from) / (to - from), end: (Math.min(end, to) - from) / (to - from) });
  });
  return spans;
}
