import { WASTE_TYPES_ATTRIBUTE } from '../../services/calendarClient';
import type { MockEntityStateMap } from '../../types/ha';
import type { HomeAttentionItem } from '../homeAttention/homeAttentionEngine';

/*
 * The quick card at the bottom of the mobile side menu: one thing chosen on
 * this device, read from the states the app already has.
 */

export const SIDEBAR_QUICK_CARD_KINDS = ['attention', 'alarm', 'lights', 'waste', 'none'] as const;
export type SidebarQuickCardKind = (typeof SIDEBAR_QUICK_CARD_KINDS)[number];

export const SIDEBAR_QUICK_CARD_STORAGE_KEY = 'ha.dashboard.sidebar.quickCard.v1';
const DEFAULT_KIND: SidebarQuickCardKind = 'attention';

export function readSidebarQuickCard(): SidebarQuickCardKind {
  try {
    const stored = window.localStorage.getItem(SIDEBAR_QUICK_CARD_STORAGE_KEY);
    return SIDEBAR_QUICK_CARD_KINDS.includes(stored as SidebarQuickCardKind) ? (stored as SidebarQuickCardKind) : DEFAULT_KIND;
  } catch {
    return DEFAULT_KIND;
  }
}

export function writeSidebarQuickCard(kind: SidebarQuickCardKind) {
  try {
    window.localStorage.setItem(SIDEBAR_QUICK_CARD_STORAGE_KEY, kind);
  } catch {
    // A per-device choice: nothing else to do when storage is unavailable.
  }
}

/** The lights that are on, the ones "turn all off" would turn off. */
export function lightsOn(states: MockEntityStateMap) {
  return Object.keys(states)
    .filter((id) => id.startsWith('light.') && states[id]?.state === 'on')
    .sort();
}

/** Components with an update waiting, as System status counts them. */
export function availableUpdateCount(states: MockEntityStateMap) {
  return Object.keys(states).filter((id) => {
    if (!id.startsWith('update.')) return false;
    const state = `${states[id]?.state ?? ''}`.toLowerCase();
    return state === 'on' || state === 'update_available' || state === 'available';
  }).length;
}

/** Security and safety items of the attention center, for the Security badge. */
export function securityAttentionCount(items: HomeAttentionItem[]) {
  return items.filter((item) => item.category === 'security' || item.category === 'safety').length;
}

export type NextWasteCollection = { summary: string; start: Date } | null;

/**
 * The next waste collection from the Domus waste calendar (the calendar
 * entity carrying the waste types), `null` when none is scheduled, and
 * `undefined` when waste collection is not set up.
 */
export function nextWasteCollection(states: MockEntityStateMap): NextWasteCollection | undefined {
  const entityId = Object.keys(states).find(
    (id) => id.startsWith('calendar.') && states[id]?.rawAttributes?.[WASTE_TYPES_ATTRIBUTE] !== undefined,
  );
  if (!entityId) return undefined;
  const attributes = states[entityId]?.rawAttributes ?? {};
  const summary = typeof attributes.message === 'string' ? attributes.message.trim() : '';
  const start = typeof attributes.start_time === 'string' ? new Date(attributes.start_time.replace(' ', 'T')) : null;
  if (!summary || !start || Number.isNaN(start.getTime())) return null;
  return { summary, start };
}

/** "oggi", "domani", "tra 3 giorni" for the day of a collection. */
export function formatCollectionDay(start: Date, locale: string, now = new Date()) {
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOfDay(start) - startOfDay(now)) / 86_400_000);
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(days, 'day');
}
