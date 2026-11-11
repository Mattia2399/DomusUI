import { parseWasteTypeStyles, WASTE_TYPES_ATTRIBUTE } from '../../services/calendarClient';
import type { EnergyCallApi, EnergyQuantity } from '../../services/energyCoreClient';
import type { HaDeviceRegistryEntry, HaEntityRegistryEntry } from '../../services/haRegistryPresentation';
import type { MockEntityStateMap } from '../../types/ha';
import type { HomeAttentionItem } from '../homeAttention/homeAttentionEngine';
import type { DashboardHouseContext } from '../../services/dashboardHouseContext';

/*
 * The quick card at the bottom of the mobile side menu: one thing chosen on
 * this device, read from the states the app already has.
 */

export const SIDEBAR_QUICK_CARD_KINDS = ['attention', 'alarm', 'lights', 'scenes', 'energy', 'waste', 'none'] as const;
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

export type WasteCollectionType = { name: string; color: string };
export type NextWasteCollection = { summary: string; start: Date; types: WasteCollectionType[] } | null;

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
  // The types collected that day: the configured ones the summary names.
  const lowered = summary.toLocaleLowerCase();
  const types = Object.values(parseWasteTypeStyles(attributes[WASTE_TYPES_ATTRIBUTE]))
    .filter((type) => lowered.includes(type.name.toLocaleLowerCase()))
    .map((type) => ({ name: type.name, color: type.color }));
  return { summary, start, types };
}

/** "oggi", "domani", "tra 3 giorni" for the day of a collection. */
export function formatCollectionDay(start: Date, locale: string, now = new Date()) {
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOfDay(start) - startOfDay(now)) / 86_400_000);
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(days, 'day');
}

/** "giovedì 15 ottobre" for the day of a collection. */
export function formatCollectionDate(start: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(start);
}

/** Group live lights by canonical room ID; names are only display labels. */
export function roomsOfLights(
  lightIds: string[],
  houseContext: DashboardHouseContext | null | undefined,
  demo?: { entityRegistry: HaEntityRegistryEntry[]; deviceRegistry: HaDeviceRegistryEntry[]; areas: { area_id: string; name: string }[] },
) {
  const roomOf = new Map(houseContext?.entities.map((entry) => [entry.entityId, entry.effectiveRoomId] as const) ?? []);
  const names = new Map(houseContext?.rooms.map((room) => [room.id, room.name] as const) ?? []);
  if (houseContext === undefined && demo) {
    const deviceRoom = new Map(demo.deviceRegistry.map((device) => [device.id, device.areaId] as const));
    demo.entityRegistry.forEach((entry) => roomOf.set(entry.entityId, entry.areaId ?? (entry.deviceId ? deviceRoom.get(entry.deviceId) : undefined) ?? null));
    demo.areas.forEach((area) => names.set(area.area_id, area.name));
  }
  const counts = new Map<string, number>();
  for (const id of lightIds) {
    const roomId = roomOf.get(id);
    if (roomId && names.has(roomId)) counts.set(roomId, (counts.get(roomId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([roomId]) => names.get(roomId) ?? roomId);
}

export type EnergyNow = { homeW: number; solarW: number | null; gridW: number | null };

const watts = (quantity: EnergyQuantity | null | undefined) => {
  if (!quantity || quantity.status !== 'ok' || typeof quantity.value !== 'number') return null;
  return quantity.unit.trim().toLowerCase() === 'kw' ? quantity.value * 1000 : quantity.value;
};

/**
 * The home consumption now, with the solar production and the grid flow
 * (positive when drawing), from the Domus energy core. `null` when energy is
 * not set up or the home consumption is unknown. The client loads on demand,
 * so the menu does not carry the energy code until this card is shown.
 */
export async function readEnergyNow(callApi: EnergyCallApi): Promise<EnergyNow | null> {
  const { getEnergyState } = await import('../../services/energyCoreClient');
  const state = await getEnergyState(callApi);
  const homeW = state.configured ? watts(state.home_consumption) : null;
  if (homeW === null) return null;
  return {
    homeW,
    solarW: watts(state.modules.solar?.quantities.production_power),
    gridW: watts(state.modules.grid?.quantities.net_power),
  };
}

/** "850 W", "1,8 kW". */
export function formatPowerShort(value: number, locale: string) {
  const abs = Math.abs(value);
  if (abs < 1000) return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(abs)} W`;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(abs / 1000)} kW`;
}
