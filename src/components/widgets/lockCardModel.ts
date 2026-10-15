import type { Widget } from '../../types/dashboardModels';
import type { MockEntityState } from '../../types/ha';
import { translateForLocale, type AppLocale } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n/translations';
import { resolveDeviceBatteryLevel } from '../../utils/deviceTelemetry';

export type LockCardState =
  | 'locked'
  | 'unlocked'
  | 'locking'
  | 'unlocking'
  | 'opening'
  | 'open'
  | 'jammed'
  | 'unavailable'
  | 'unknown';

export type LockCardTone = 'secure' | 'open' | 'warning' | 'transition' | 'offline';
export type LockCardPrimaryAction = 'lock' | 'unlock' | 'none';
export type LockPendingAction = 'lock' | 'unlock' | 'open';
export type LockCardRingIcon = 'lock' | 'unlock' | 'door' | 'alert' | 'offline' | 'busy';
export type LockCardDoorState = 'open' | 'closed';
export type LockCardAutoLock = { enabled: boolean; delaySeconds?: number };

export type LockCardModel = {
  title: string;
  state: LockCardState;
  stateLabel: string;
  compactStateLabel: string;
  caption: string;
  hint: string;
  changedBy?: string;
  supportsOpen: boolean;
  pendingAction?: LockPendingAction;
  isLocked: boolean;
  isUnlocked: boolean;
  isOpen: boolean;
  isJammed: boolean;
  isTransitioning: boolean;
  isUnavailable: boolean;
  primaryAction: LockCardPrimaryAction;
  primaryActionLabel: string;
  primaryActionHint: string;
  secondaryActionLabel?: string;
  tone: LockCardTone;
  headline: string;
  ringIcon: LockCardRingIcon;
  solidCore: boolean;
  canOpenLatch: boolean;
  batteryLevel?: number;
  doorState?: LockCardDoorState;
  autoLock?: LockCardAutoLock;
  lastChangedMs?: number;
};

const LOCK_FEATURE_OPEN = 1;
const LOCK_PENDING_ATTRIBUTE_KEY = '__dashboard_pending_lock';

function toFiniteNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.trim().replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function toTrimmedString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function normalizeLockCardState(value: string | undefined): LockCardState {
  const normalized = (value ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  if (!normalized) return 'unknown';

  if (normalized === 'locked' || normalized === 'closed' || normalized === 'bloccata' || normalized === 'bloccato' || normalized === 'chiusa' || normalized === 'chiuso') {
    return 'locked';
  }
  if (normalized === 'unlocked' || normalized === 'sbloccata' || normalized === 'sbloccato') {
    return 'unlocked';
  }
  if (normalized === 'open' || normalized === 'opened' || normalized === 'aperta' || normalized === 'aperto') {
    return 'open';
  }
  if (normalized === 'opening' || normalized === 'apertura' || normalized === 'in_apertura') {
    return 'opening';
  }
  if (normalized === 'locking' || normalized === 'closing' || normalized === 'chiusura' || normalized === 'in_chiusura') {
    return 'locking';
  }
  if (normalized === 'unlocking' || normalized === 'in_sblocco') {
    return 'unlocking';
  }
  if (normalized === 'jammed' || normalized === 'inceppata' || normalized === 'inceppato' || normalized === 'blocked') {
    return 'jammed';
  }
  if (normalized === 'unavailable' || normalized === 'offline' || normalized === 'not_available') {
    return 'unavailable';
  }
  if (normalized.includes('sblocc')) {
    return normalized.includes('in_corso') || normalized.includes('ing') ? 'unlocking' : 'unlocked';
  }
  if (normalized.includes('apert')) {
    return normalized.includes('in_corso') || normalized.includes('ing') ? 'opening' : 'open';
  }
  if (normalized.includes('chius') || normalized.includes('blocc')) {
    return normalized.includes('in_corso') || normalized.includes('ing') ? 'locking' : 'locked';
  }
  return 'unknown';
}

export function translateLockCardState(state: LockCardState, locale: AppLocale = 'it') {
  return translateForLocale(locale, `controls.lock.state.${state}`);
}

function resolvePendingAction(value: unknown): LockPendingAction | undefined {
  return value === 'lock' || value === 'unlock' || value === 'open' ? value : undefined;
}

function resolvePendingState(action: LockPendingAction): LockCardState {
  if (action === 'lock') return 'locking';
  if (action === 'open') return 'opening';
  return 'unlocking';
}

function resolveSupportedFeatures(liveEntity: MockEntityState | undefined, rawAttributes: Record<string, unknown> | undefined) {
  if (typeof liveEntity?.supportedFeatures === 'number') {
    return liveEntity.supportedFeatures;
  }
  return toFiniteNumber(rawAttributes?.supported_features);
}

function toTimestampMs(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

const DOOR_ATTRIBUTE_KEYS = ['door_state', 'door_sensor_state_name', 'door_sensor_state', 'door_status', 'door'];
const AUTO_LOCK_FLAG_KEYS = ['auto_lock', 'autolock', 'auto_lock_enabled', 'auto_relock'];
const AUTO_LOCK_DELAY_KEYS = ['auto_relock_time', 'auto_lock_time', 'auto_relock_delay', 'auto_lock_delay'];

function resolveDoorState(rawAttributes: Record<string, unknown> | undefined): LockCardDoorState | undefined {
  for (const key of DOOR_ATTRIBUTE_KEYS) {
    const value = rawAttributes?.[key];
    if (typeof value === 'boolean') return value ? 'open' : 'closed';
    if (typeof value !== 'string') continue;
    const normalized = value.trim().toLowerCase();
    if (/(^|[^a-z])(open|opened|ajar|aperta|aperto)/.test(normalized)) return 'open';
    if (/(^|[^a-z])(closed|close|chiusa|chiuso)/.test(normalized)) return 'closed';
  }
  return undefined;
}

function toFlag(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'on' || normalized === 'true' || normalized === 'enabled') return true;
    if (normalized === 'off' || normalized === 'false' || normalized === 'disabled') return false;
  }
  return undefined;
}

function resolveAutoLock(rawAttributes: Record<string, unknown> | undefined): LockCardAutoLock | undefined {
  const delay = AUTO_LOCK_DELAY_KEYS.map((key) => toFiniteNumber(rawAttributes?.[key])).find((value) => value !== undefined);
  const flag = AUTO_LOCK_FLAG_KEYS.map((key) => toFlag(rawAttributes?.[key])).find((value) => value !== undefined);
  if (flag === false) return { enabled: false };
  if (delay !== undefined && delay > 0) return { enabled: true, delaySeconds: Math.round(delay) };
  if (flag === true) return { enabled: true };
  return undefined;
}

function resolveRingIcon(state: LockCardState): LockCardRingIcon {
  if (state === 'locking' || state === 'unlocking' || state === 'opening') return 'busy';
  if (state === 'locked') return 'lock';
  if (state === 'open') return 'door';
  if (state === 'jammed') return 'alert';
  if (state === 'unavailable' || state === 'unknown') return 'offline';
  return 'unlock';
}

function resolveCaption(state: LockCardState, supportsOpen: boolean, locale: AppLocale) {
  if (state === 'locked' && supportsOpen) {
    return translateForLocale(locale, 'card.lock.caption.lockedWithLatch');
  }
  return translateForLocale(locale, `card.lock.caption.${state}`);
}

function resolveTone(state: LockCardState): LockCardTone {
  if (state === 'locked') return 'secure';
  if (state === 'jammed') return 'warning';
  if (state === 'locking' || state === 'unlocking' || state === 'opening') return 'transition';
  if (state === 'unavailable' || state === 'unknown') return 'offline';
  return 'open';
}

export function buildLockCardModel(
  widget: Pick<Widget, 'title' | 'status'>,
  liveEntity?: MockEntityState,
  locale: AppLocale = 'it',
): LockCardModel {
  const rawAttributes = liveEntity?.rawAttributes;
  const pendingAction = resolvePendingAction(rawAttributes?.[LOCK_PENDING_ATTRIBUTE_KEY]);
  const entityState = normalizeLockCardState(
    toTrimmedString(liveEntity?.state) ??
      toTrimmedString(liveEntity?.stateLabel) ??
      widget.status,
  );
  const state = pendingAction ? resolvePendingState(pendingAction) : entityState;
  const supportedFeatures = resolveSupportedFeatures(liveEntity, rawAttributes);
  const supportsOpen = typeof supportedFeatures === 'number' && (supportedFeatures & LOCK_FEATURE_OPEN) !== 0;
  const stateLabel = translateLockCardState(state, locale);
  const isTransitioning = state === 'locking' || state === 'unlocking' || state === 'opening';
  const isLocked = state === 'locked' || state === 'locking';
  const isOpen = state === 'open' || state === 'opening';
  const isUnlocked = state === 'unlocked' || isOpen;
  const isJammed = state === 'jammed';
  const isUnavailable = state === 'unavailable' || state === 'unknown';
  const primaryAction: LockCardPrimaryAction =
    isTransitioning || isJammed || isUnavailable
      ? 'none'
      : isLocked
        ? 'unlock'
        : 'lock';
  const changedBy = toTrimmedString(rawAttributes?.changed_by);
  const caption = resolveCaption(state, supportsOpen, locale);

  return {
    title: widget.title || toTrimmedString(rawAttributes?.friendly_name) || translateForLocale(locale, 'controls.lock.title'),
    state,
    stateLabel,
    compactStateLabel: state === 'locked' ? translateForLocale(locale, 'card.lock.protected') : stateLabel,
    caption,
    hint:
      primaryAction === 'unlock'
        ? translateForLocale(locale, 'card.lock.holdUnlock')
        : primaryAction === 'lock'
          ? translateForLocale(locale, 'card.lock.tapLock')
          : caption,
    changedBy,
    supportsOpen,
    pendingAction,
    isLocked,
    isUnlocked,
    isOpen,
    isJammed,
    isTransitioning,
    isUnavailable,
    primaryAction,
    primaryActionLabel:
      primaryAction === 'unlock'
        ? translateForLocale(locale, 'card.lock.unlock')
        : primaryAction === 'lock'
          ? translateForLocale(locale, 'card.lock.lock')
          : translateForLocale(locale, 'card.sensor.unavailableShort'),
    primaryActionHint:
      primaryAction === 'unlock'
        ? translateForLocale(locale, 'card.lock.confirmationRequired')
        : primaryAction === 'lock'
          ? translateForLocale(locale, 'card.lock.quickLock')
          : caption,
    secondaryActionLabel: supportsOpen ? translateForLocale(locale, 'card.lock.openLatch') : undefined,
    tone: resolveTone(state),
    headline: translateForLocale(locale, `card.lock.headline.${state}`),
    ringIcon: resolveRingIcon(state),
    solidCore: state === 'locked' || state === 'jammed',
    canOpenLatch: supportsOpen && (state === 'locked' || state === 'unlocked'),
    batteryLevel: resolveDeviceBatteryLevel(liveEntity),
    doorState: resolveDoorState(rawAttributes),
    autoLock: resolveAutoLock(rawAttributes),
    lastChangedMs: toTimestampMs(rawAttributes?.__last_changed),
  };
}

export type LockRingCopyInput = {
  stage: 'idle' | 'unlock' | 'bridge' | 'open';
  isPressing: boolean;
  isNudging: boolean;
};

export type LockRingCopy = {
  caption: string;
  shortCaption: string;
  isHighlighted: boolean;
  ringLabel: string;
};

// The words under the ring follow the press: what a press does now, then what
// holding on does, and a nudge when a hold was released too early.
export function resolveLockRingCopy(model: LockCardModel, input: LockRingCopyInput, locale: AppLocale = 'it'): LockRingCopy {
  const tr = (key: TranslationKey, parameters?: Record<string, string | number>) => translateForLocale(locale, key, parameters);
  const name = model.title;
  const canHoldOpen = model.canOpenLatch;
  const keepHolding = input.isPressing && (input.stage === 'bridge' || input.stage === 'open');
  let caption: string;
  let shortCaption: string;
  let ringLabel: string;

  switch (model.state) {
    case 'locked':
      caption = tr(canHoldOpen ? 'card.lock.ring.holdUnlockLatch' : 'card.lock.ring.holdUnlock');
      shortCaption = tr('card.lock.ring.short.hold');
      ringLabel = tr(canHoldOpen ? 'card.lock.ring.aria.holdUnlockLatch' : 'card.lock.ring.aria.holdUnlock', { name });
      break;
    case 'unlocked':
      caption = tr(canHoldOpen ? 'card.lock.ring.tapLockHoldOpen' : 'card.lock.ring.tapLock');
      shortCaption = tr(canHoldOpen ? 'card.lock.ring.short.holdOpen' : 'card.lock.ring.short.tapLock');
      ringLabel = tr(canHoldOpen ? 'card.lock.ring.aria.tapLockHoldOpen' : 'card.lock.ring.aria.tapLock', { name });
      break;
    case 'open':
      caption = tr('card.lock.ring.open');
      shortCaption = tr('card.lock.ring.short.open');
      ringLabel = tr('card.lock.ring.aria.tapLock', { name });
      break;
    case 'opening':
      caption = tr('card.lock.ring.opening');
      shortCaption = tr('card.lock.ring.short.waiting');
      ringLabel = tr('card.lock.ring.aria.status', { name, state: model.stateLabel });
      break;
    case 'locking':
    case 'unlocking':
      caption = tr('card.lock.ring.waiting');
      shortCaption = tr('card.lock.ring.short.waiting');
      ringLabel = tr('card.lock.ring.aria.status', { name, state: model.stateLabel });
      break;
    case 'jammed':
      caption = tr('card.lock.ring.jammed');
      shortCaption = tr('card.lock.ring.short.jammed');
      ringLabel = tr('card.lock.ring.aria.retry', { name });
      break;
    default:
      caption = tr('card.lock.ring.unavailable');
      shortCaption = tr('card.lock.ring.short.unavailable');
      ringLabel = tr('card.lock.ring.aria.status', { name, state: model.stateLabel });
  }

  const isNudged = input.isNudging && model.state === 'locked';
  if (isNudged) {
    caption = tr('card.lock.ring.nudge');
    shortCaption = tr('card.lock.ring.short.nudge');
  }
  if (keepHolding) {
    caption = tr('card.lock.ring.keepHolding');
    shortCaption = tr('card.lock.ring.short.keepHolding');
  }

  return { caption, shortCaption, isHighlighted: keepHolding || isNudged, ringLabel };
}

export function formatLockRelativeTime(timestampMs: number, locale: AppLocale, nowMs = Date.now()) {
  const seconds = Math.round((timestampMs - nowMs) / 1000);
  const steps: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return translateForLocale(locale, 'card.lock.justNow');
}

// The last change the entity reports, as one line of activity.
export function resolveLockLastActivity(model: LockCardModel, locale: AppLocale = 'it', nowMs = Date.now()) {
  const actor = model.changedBy;
  const key = model.state === 'locked'
    ? 'card.lock.activity.locked'
    : model.state === 'unlocked'
      ? 'card.lock.activity.unlocked'
      : model.state === 'open'
        ? 'card.lock.activity.open'
        : undefined;
  const text = actor && key ? translateForLocale(locale, key, { actor }) : model.stateLabel;
  const time = typeof model.lastChangedMs === 'number' ? formatLockRelativeTime(model.lastChangedMs, locale, nowMs) : undefined;
  return { text, time };
}

export type LockCardLayout = 'row' | 'compact' | 'tile' | 'wide' | 'tall' | 'panorama';

// The card draws the composition its real box can hold, whatever size name the
// grid gave it: one row (h1), compact (h2), a tile (one column by three rows),
// the ring beside the state (three rows, wide), and the two expanded shapes.
export function resolveLockCardLayout(width: number, height: number): LockCardLayout {
  const safeWidth = Math.max(0, Number.isFinite(width) ? width : 0);
  const safeHeight = Math.max(0, Number.isFinite(height) ? height : 0);
  if (safeHeight < 80) return 'row';
  if (safeHeight < 150) return 'compact';
  if (safeHeight < 230) return safeWidth >= 280 ? 'wide' : 'tile';
  return safeWidth >= safeHeight * 1.6 ? 'panorama' : 'tall';
}
