/*
 * What the Casa page shows, from real data only: the functions that are set up and that the account
 * may open, their state, and the things to look at. Pure functions, so that the page and the tests
 * share them. docs/design/app/casa.html, REGOLE-app.md §5.
 */
import type { MockEntityStateMap } from '../../types/ha';
import type { TranslationKey } from '../../i18n/translations';
import type { TranslationParameters } from '../../i18n/I18nProvider';
import type { ClimateConfigResponse } from '../../services/climateConfigClient';
import type { EnergyState } from '../../services/energyCoreClient';
import type { IrrigationCoreDocument, IrrigationCoreState } from '../../services/irrigationCoreClient';
import type { WasteCollectionDocument, WasteCollectionPreview } from '../../services/wasteCollectionClient';

export type Translate = (key: TranslationKey, parameters?: TranslationParameters) => string;

export type CasaFunctionId = 'security' | 'climate' | 'energy' | 'irrigation' | 'waste';

export type CasaFunctionDefinition = Readonly<{
  id: CasaFunctionId;
  nameKey: TranslationKey;
  /** The page of the function that exists today. */
  route: string;
  /** Where it is set up, for "Aggiungi una funzione". */
  setupRoute: string;
}>;

/** In the order of the prototype. Climate and Waste have only their Settings page today. */
export const CASA_FUNCTIONS: readonly CasaFunctionDefinition[] = [
  { id: 'security', nameKey: 'casa.fn.security', route: '/security', setupRoute: '/settings/security' },
  { id: 'climate', nameKey: 'casa.fn.climate', route: '/settings/climate', setupRoute: '/settings/climate' },
  { id: 'energy', nameKey: 'casa.fn.energy', route: '/consumi', setupRoute: '/consumi' },
  { id: 'irrigation', nameKey: 'casa.fn.irrigation', route: '/appgallery/irrigation', setupRoute: '/appgallery/irrigation' },
  { id: 'waste', nameKey: 'casa.fn.waste', route: '/settings/home/waste-collection', setupRoute: '/settings/home/waste-collection' },
];

/** What is known of a function: not yet (loading or not readable), not set up, or set up with its state. */
export type CasaFunctionStatus =
  | { kind: 'unknown' }
  | { kind: 'absent' }
  | { kind: 'ready'; text: string; warn: boolean; attention: string[] };

const UNKNOWN: CasaFunctionStatus = { kind: 'unknown' };
const ABSENT: CasaFunctionStatus = { kind: 'absent' };

/* ---------- Security, from the states of Home Assistant ---------- */

const OPENING_CLASSES = new Set(['door', 'window', 'garage_door', 'opening']);

const ALARM_STATE_KEYS: Record<string, TranslationKey> = {
  disarmed: 'security.state.disarmed',
  armed_home: 'security.state.home',
  armed_away: 'security.state.away',
  armed_night: 'security.state.night',
  armed_vacation: 'security.state.vacation',
  armed_custom_bypass: 'security.state.bypass',
  pending: 'security.state.pending',
  arming: 'security.state.arming',
  disarming: 'security.state.disarming',
  triggered: 'security.state.triggered',
  unavailable: 'security.state.unavailable',
};

const nameOf = (entityId: string, states: MockEntityStateMap) => {
  const name = states[entityId]?.rawAttributes?.friendly_name;
  return typeof name === 'string' && name.trim() ? name.trim() : entityId;
};

/** The alarm of the house: the one chosen in Sicurezza when it still exists, else the first one. */
export function resolveAlarmEntityId(states: MockEntityStateMap, chosen: string): string | null {
  if (chosen && states[chosen]) return chosen;
  return Object.keys(states).find((entityId) => entityId.startsWith('alarm_control_panel.')) ?? null;
}

/** The doors and windows open now (binary sensors of class door, window, garage door, opening). */
export function openOpenings(states: MockEntityStateMap): string[] {
  return Object.entries(states)
    .filter(([entityId, entity]) => {
      if (!entityId.startsWith('binary_sensor.') || entity.state !== 'on') return false;
      const deviceClass = entity.rawAttributes?.device_class;
      return typeof deviceClass === 'string' && OPENING_CLASSES.has(deviceClass);
    })
    .map(([entityId]) => nameOf(entityId, states))
    .sort((a, b) => a.localeCompare(b));
}

export function hasOpeningSensors(states: MockEntityStateMap): boolean {
  return Object.entries(states).some(([entityId, entity]) => {
    const deviceClass = entity.rawAttributes?.device_class;
    return entityId.startsWith('binary_sensor.') && typeof deviceClass === 'string' && OPENING_CLASSES.has(deviceClass);
  });
}

export function securityStatus(states: MockEntityStateMap, alarmEntityId: string | null, t: Translate): CasaFunctionStatus {
  if (!alarmEntityId || !states[alarmEntityId]) return ABSENT;
  const state = states[alarmEntityId].state;
  const label = t(ALARM_STATE_KEYS[state] ?? 'security.state.unknown');
  const open = openOpenings(states);
  const attention: string[] = [];
  if (state === 'triggered') attention.push(t('casa.attention.alarmTriggered'));
  if (state === 'unavailable') attention.push(t('casa.attention.alarmUnavailable'));
  open.forEach((name) => attention.push(t('casa.attention.open', { name })));
  const detail =
    open.length === 0
      ? hasOpeningSensors(states)
        ? t('casa.status.allClosed')
        : null
      : open.length === 1
        ? t('casa.status.openOne', { name: open[0] })
        : t('casa.status.openMany', { count: open.length });
  return { kind: 'ready', text: detail ? `${label} · ${detail}` : label, warn: attention.length > 0, attention };
}

/* ---------- The functions of Domus Core, from their own backend ---------- */

export function climateStatus(response: ClimateConfigResponse | null | undefined, t: Translate): CasaFunctionStatus {
  if (!response) return UNKNOWN;
  const zones = response.state === 'ready' && response.config ? response.config.zones.length : 0;
  if (zones === 0) return ABSENT;
  return { kind: 'ready', text: zones === 1 ? t('casa.status.climateOne') : t('casa.status.climateMany', { count: zones }), warn: false, attention: [] };
}

export function energyStatus(state: EnergyState | null | undefined, t: Translate, locale: string): CasaFunctionStatus {
  if (!state) return UNKNOWN;
  if (!state.configured) return ABSENT;
  const now = state.home_consumption;
  if (now && typeof now.value === 'number' && Number.isFinite(now.value) && now.unit) {
    const value = `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(now.value)} ${now.unit}`;
    return { kind: 'ready', text: t('casa.status.energyNow', { value }), warn: false, attention: [] };
  }
  return { kind: 'ready', text: t('casa.status.energyReady'), warn: false, attention: [] };
}

export function irrigationStatus(
  config: IrrigationCoreDocument | null | undefined,
  state: IrrigationCoreState | null | undefined,
  t: Translate,
): CasaFunctionStatus {
  if (!config) return UNKNOWN;
  const configured = config.zones.some((zone) => zone.entityId.trim().length > 0);
  if (!configured) return ABSENT;
  const mode = state?.mode ?? config.mode;
  if (mode === 'fault') {
    return { kind: 'ready', text: t('casa.status.irrigationFault'), warn: true, attention: [t('casa.attention.irrigationFault')] };
  }
  const running = state ? state.sessions.filter((session) => session.state === 'running' || session.state === 'opening').length : 0;
  if (running > 0) {
    const text = running === 1 ? t('casa.status.irrigationRunningOne') : t('casa.status.irrigationRunningMany', { count: running });
    return { kind: 'ready', text, warn: false, attention: [] };
  }
  const text = mode === 'paused' ? t('casa.status.irrigationPaused') : mode === 'stopped' ? t('casa.status.irrigationStopped') : t('casa.status.irrigationReady');
  return { kind: 'ready', text, warn: false, attention: [] };
}

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

/** "Oggi", "Domani" or the day of the week of a collection. */
export function collectionDay(start: string, now: Date, t: Translate, locale: string): string {
  const date = new Date(start.length <= 10 ? `${start}T00:00:00` : start);
  if (Number.isNaN(date.getTime())) return start;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (dayKey(date) === dayKey(now)) return t('casa.when.today');
  if (dayKey(date) === dayKey(tomorrow)) return t('casa.when.tomorrow');
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date);
  return weekday.charAt(0).toLocaleUpperCase(locale) + weekday.slice(1);
}

export function wasteStatus(
  config: WasteCollectionDocument | null | undefined,
  preview: WasteCollectionPreview | null | undefined,
  t: Translate,
  locale: string,
  now: Date,
): CasaFunctionStatus {
  if (!config) return UNKNOWN;
  if (config.mappings.length === 0) return ABSENT;
  const next = preview?.events
    .filter((event) => new Date(event.end.length <= 10 ? `${event.end}T23:59:59` : event.end).getTime() >= now.getTime())
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  const text = next
    ? t('casa.status.wasteNext', { when: collectionDay(next.start, now, t, locale), what: next.summary })
    : t('casa.status.wasteNone');
  return { kind: 'ready', text, warn: false, attention: [] };
}

/* ---------- The page ---------- */

/** The things to look at, from every function in view: the summary line of Casa. */
export function collectAttention(statuses: readonly CasaFunctionStatus[]): string[] {
  return statuses.flatMap((status) => (status.kind === 'ready' ? status.attention : []));
}
