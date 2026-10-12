import type { AppLocale } from '../../i18n/I18nProvider';
import { fallbackStateWord } from '../../i18n/entityStateFallback';
import type { HaEntityRegistryEntry } from '../../services/haRegistryPresentation';
import { translateHaState, type HaStateTranslations } from '../../services/haStateTranslations';
import type { MockEntityState } from '../../types/ha';
import type { SettingsListTone } from './SettingsList';

/** Domains whose state is the time of the last use, not a value. */
const TIMESTAMP_DOMAINS = new Set(['button', 'input_button', 'scene', 'event']);
const ACTIVE_ON_DOMAINS = new Set(['light', 'switch', 'fan', 'input_boolean', 'humidifier', 'siren', 'binary_sensor']);
const ALERT_BINARY_CLASSES = new Set(['problem', 'smoke', 'gas', 'moisture', 'carbon_monoxide', 'safety', 'tamper']);
const NUMBER = /^-?\d+(?:\.\d+)?$/;
const TIGHT_UNITS = new Set(['%', '°']);

export type EntityStateLabels = { disabled: string; unavailable: string; unknown: string };

export type FormattedEntityState = {
  text: string;
  tone: SettingsListTone;
  unavailable: boolean;
};

const normalize = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export function entityDeviceClass(entity: MockEntityState | undefined, registry?: HaEntityRegistryEntry) {
  return normalize(entity?.rawAttributes?.device_class) || registry?.deviceClass || undefined;
}

/** "3 giorni fa", "tra 2 ore", in the user's language. */
export function formatRelativeTime(timestampMs: number, locale: AppLocale, nowMs = Date.now()) {
  const seconds = Math.round((timestampMs - nowMs) / 1000);
  const steps: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(0, 'minute');
}

function humanize(state: string) {
  const text = state.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function stateTone(domain: string, state: string, deviceClass?: string): SettingsListTone {
  if (domain === 'alarm_control_panel') return state === 'triggered' ? 'danger' : state.startsWith('armed') ? 'success' : 'default';
  if (domain === 'lock') return state === 'jammed' ? 'danger' : state === 'unlocked' || state === 'open' ? 'warning' : 'default';
  if (domain === 'person' || domain === 'device_tracker') return state === 'home' ? 'success' : 'default';
  if (domain === 'binary_sensor' && state === 'on' && deviceClass && ALERT_BINARY_CLASSES.has(deviceClass)) return 'danger';
  if (ACTIVE_ON_DOMAINS.has(domain)) return state === 'on' ? 'warning' : 'default';
  if (domain === 'media_player') return state === 'playing' ? 'warning' : 'default';
  if (domain === 'cover') return state === 'open' || state === 'opening' ? 'warning' : 'default';
  if (domain === 'update') return state === 'on' ? 'warning' : 'default';
  return 'default';
}

/**
 * An entity state in words: Home Assistant's translation when there is one,
 * a number with its unit, a time as "3 days ago", or a fallback word.
 */
export function formatEntityState({
  entityId,
  entity,
  registry,
  translations,
  locale,
  labels,
  nowMs,
}: {
  entityId: string;
  entity: MockEntityState | undefined;
  registry?: HaEntityRegistryEntry;
  translations: HaStateTranslations;
  locale: AppLocale;
  labels: EntityStateLabels;
  nowMs?: number;
}): FormattedEntityState {
  if (registry?.disabledBy) return { text: labels.disabled, tone: 'default', unavailable: true };
  const state = normalize(entity?.state);
  if (!entity || state === 'unavailable') return { text: labels.unavailable, tone: 'default', unavailable: true };
  if (!state || state === 'unknown') return { text: labels.unknown, tone: 'default', unavailable: true };

  const domain = entityId.split('.', 1)[0];
  const deviceClass = entityDeviceClass(entity, registry);
  const tone = stateTone(domain, state, deviceClass);

  if (deviceClass === 'timestamp' || TIMESTAMP_DOMAINS.has(domain)) {
    const timestamp = Date.parse(state);
    if (Number.isFinite(timestamp)) return { text: formatRelativeTime(timestamp, locale, nowMs), tone, unavailable: false };
  }
  if (NUMBER.test(state)) {
    const value = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Number(state));
    const unit = entity.unit?.trim();
    const text = !unit ? value : TIGHT_UNITS.has(unit) ? `${value}${unit}` : `${value} ${unit}`;
    return { text, tone, unavailable: false };
  }
  const translated =
    translateHaState(translations, {
      domain,
      state,
      deviceClass,
      platform: registry?.platform,
      translationKey: registry?.translationKey,
    }) ?? fallbackStateWord(locale, domain, state, deviceClass);
  return { text: translated ?? humanize(state), tone, unavailable: false };
}
