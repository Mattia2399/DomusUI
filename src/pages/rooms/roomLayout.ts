import type { RoomTab } from '../../components/rooms/roomsDirectory';

/*
 * How the home is laid out on the Rooms page, as on the board's "Stanze e
 * sezioni": the order of the rooms in the bar, each room's look (icon and
 * floor of a local room, colour of its glow, hidden from the bar), the floors
 * of a home without Home Assistant, and the order and visibility of the
 * sections, for every room or for one. Kept in this browser; Home Assistant
 * has no place for it.
 */

export const SECTION_KEYS = ['scenes', 'climate', 'sensors', 'lights', 'switches', 'security', 'media'] as const;
export type LayoutSection = (typeof SECTION_KEYS)[number];

export type SectionLayout = { order: LayoutSection[]; hidden: Partial<Record<LayoutSection, boolean>> };
export type RoomLook = { icon?: string; glow?: number; hidden?: boolean; floor?: string | null };
export type LocalFloor = { id: string; name: string };

export type RoomLayout = {
  /** Room ids in the order of the bar; rooms not listed follow in their own order. */
  order: string[];
  looks: Record<string, RoomLook>;
  /** The floors of a home without Home Assistant (the demo, local rooms). */
  floors: LocalFloor[];
  sections: { all: SectionLayout; rooms: Record<string, SectionLayout> };
};

/** The board's six glows, first and second colour. */
export const ROOM_GLOWS: Array<[string, string]> = [
  ['#FF9F0A', '#FF375F'],
  ['#BF5AF2', '#FF9F0A'],
  ['#5E5CE6', '#0A84FF'],
  ['#64D2FF', '#30D158'],
  ['#30D158', '#64D2FF'],
  ['#FF375F', '#BF5AF2'],
];

export const DEFAULT_SECTIONS: SectionLayout = { order: [...SECTION_KEYS], hidden: {} };

export const EMPTY_LAYOUT: RoomLayout = { order: [], looks: {}, floors: [], sections: { all: DEFAULT_SECTIONS, rooms: {} } };

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

function parseSections(value: unknown): SectionLayout | null {
  if (!isRecord(value)) return null;
  const listed = Array.isArray(value.order) ? value.order.filter((key): key is LayoutSection => (SECTION_KEYS as readonly string[]).includes(key as string)) : [];
  // Every section once, a new one at the end.
  const order = [...new Set([...listed, ...SECTION_KEYS])];
  const hidden: SectionLayout['hidden'] = {};
  if (isRecord(value.hidden)) {
    SECTION_KEYS.forEach((key) => {
      if ((value.hidden as Record<string, unknown>)[key] === true) hidden[key] = true;
    });
  }
  return { order, hidden };
}

function parseLook(value: unknown): RoomLook | null {
  if (!isRecord(value)) return null;
  const look: RoomLook = {};
  if (text(value.icon)) look.icon = text(value.icon) as string;
  if (typeof value.glow === 'number' && Number.isInteger(value.glow) && value.glow >= 0 && value.glow < ROOM_GLOWS.length) look.glow = value.glow;
  if (value.hidden === true) look.hidden = true;
  if (text(value.floor)) look.floor = text(value.floor);
  return Object.keys(look).length > 0 ? look : null;
}

export function parseRoomLayout(raw: string | null): RoomLayout | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!isRecord(value)) return null;
    const looks: Record<string, RoomLook> = {};
    if (isRecord(value.looks)) {
      Object.entries(value.looks).forEach(([id, look]) => {
        const parsed = parseLook(look);
        if (parsed) looks[id] = parsed;
      });
    }
    const rooms: Record<string, SectionLayout> = {};
    const sections = isRecord(value.sections) ? value.sections : {};
    if (isRecord(sections.rooms)) {
      Object.entries(sections.rooms).forEach(([id, layout]) => {
        const parsed = parseSections(layout);
        if (parsed) rooms[id] = parsed;
      });
    }
    return {
      order: Array.isArray(value.order) ? [...new Set(value.order.filter((id): id is string => typeof id === 'string' && id.length > 0))] : [],
      looks,
      floors: Array.isArray(value.floors)
        ? value.floors.flatMap((floor) => (isRecord(floor) && text(floor.id) && text(floor.name) ? [{ id: text(floor.id) as string, name: text(floor.name) as string }] : []))
        : [],
      sections: { all: parseSections(sections.all) ?? DEFAULT_SECTIONS, rooms },
    };
  } catch {
    return null;
  }
}

/** The rooms in the order of the bar: the ones placed first, the others after, as they came. */
export function orderRooms(tabs: RoomTab[], order: string[]) {
  const rank = new Map(order.map((id, index) => [id, index]));
  return tabs
    .map((tab, index) => ({ tab, index }))
    .sort((a, b) => (rank.get(a.tab.id) ?? order.length + a.index) - (rank.get(b.tab.id) ?? order.length + b.index))
    .map(({ tab }) => tab);
}

/** The order after moving a room before or after the next one on its floor. */
export function moveRoom(ordered: RoomTab[], roomId: string, direction: -1 | 1, floorOf: (room: RoomTab) => string | null) {
  const ids = ordered.map((tab) => tab.id);
  const room = ordered.find((tab) => tab.id === roomId);
  if (!room) return ids;
  const sameFloor = ordered.filter((tab) => floorOf(tab) === floorOf(room));
  const index = sameFloor.indexOf(room);
  const other = sameFloor[index + direction];
  if (!other) return ids;
  const a = ids.indexOf(room.id);
  const b = ids.indexOf(other.id);
  [ids[a], ids[b]] = [ids[b], ids[a]];
  return ids;
}

export function sectionsFor(layout: RoomLayout, roomId: string | null | undefined) {
  return (roomId && layout.sections.rooms[roomId]) || layout.sections.all;
}

export function moveSection(sections: SectionLayout, key: LayoutSection, direction: -1 | 1): SectionLayout {
  const order = [...sections.order];
  const index = order.indexOf(key);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= order.length) return sections;
  [order[index], order[target]] = [order[target], order[index]];
  return { ...sections, order };
}

export function toggleSection(sections: SectionLayout, key: LayoutSection): SectionLayout {
  const hidden = { ...sections.hidden };
  if (hidden[key]) delete hidden[key];
  else hidden[key] = true;
  return { ...sections, hidden };
}

/** The demo's floors and where its rooms are, as on the board, until the demo is changed. */
export const DEMO_LAYOUT: RoomLayout = {
  ...EMPTY_LAYOUT,
  floors: [
    { id: 'demo-ground', name: 'Piano terra' },
    { id: 'demo-first', name: 'Primo piano' },
  ],
  looks: {
    'demo-living-room': { floor: 'demo-ground' },
    'demo-kitchen': { floor: 'demo-ground' },
    'demo-bedroom': { floor: 'demo-first' },
    'demo-bathroom': { floor: 'demo-first' },
  },
};
