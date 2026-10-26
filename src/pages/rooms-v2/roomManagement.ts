import type { HaArea } from '../../hooks/useHaLiveConnection';
import type { RoomIconKind } from './roomSummary';

/*
 * Creating, changing and deleting rooms, as the first Rooms page did: Home
 * Assistant areas (name, floor, icon, picture, aliases, temperature and
 * humidity sensors) or local rooms of this browser (a name). The messages are
 * the registry commands of Home Assistant. Floors are managed in Settings.
 */

export type RoomDraft = {
  name: string;
  floorId: string;
  icon: string;
  aliases: string;
  picture: string;
  temperatureEntityId: string;
  humidityEntityId: string;
};

export const EMPTY_ROOM_DRAFT: RoomDraft = {
  name: '',
  floorId: '',
  icon: '',
  aliases: '',
  picture: '',
  temperatureEntityId: '',
  humidityEntityId: '',
};

/** The icons a room can have, with the Home Assistant icon each one sets. */
export const ROOM_ICON_CHOICES: Array<[RoomIconKind, string]> = [
  ['sofa', 'mdi:sofa'],
  ['kitchen', 'mdi:silverware-fork-knife'],
  ['bed', 'mdi:bed'],
  ['bath', 'mdi:shower'],
  ['desk', 'mdi:desk'],
  ['garage', 'mdi:garage'],
  ['garden', 'mdi:flower'],
  ['room', 'mdi:door'],
];

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/** "Studio  nord " → "Studio nord". */
export function cleanName(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

export function splitAliases(value: string) {
  return Array.from(new Set(value.split(',').map((alias) => alias.trim()).filter(Boolean)));
}

export function roomDraftOf(area: HaArea | null | undefined, name = ''): RoomDraft {
  if (!area) return { ...EMPTY_ROOM_DRAFT, name };
  return {
    name: area.name,
    floorId: area.floor_id ?? '',
    icon: area.icon ?? '',
    aliases: (area.aliases ?? []).join(', '),
    picture: area.picture ?? '',
    temperatureEntityId: area.temperature_entity_id ?? '',
    humidityEntityId: area.humidity_entity_id ?? '',
  };
}

export function parseHaArea(payload: unknown): HaArea | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  const areaId = text(record.area_id);
  const name = text(record.name);
  if (!areaId || !name) return null;
  return {
    area_id: areaId,
    name,
    aliases: Array.isArray(record.aliases) ? record.aliases.map(text).filter(Boolean) : [],
    floor_id: text(record.floor_id) || null,
    icon: text(record.icon) || null,
    picture: text(record.picture) || undefined,
    temperature_entity_id: text(record.temperature_entity_id) || null,
    humidity_entity_id: text(record.humidity_entity_id) || null,
  };
}

/** A new area leaves out what is empty; a change clears it. */
export function areaMessage(draft: RoomDraft, areaId?: string): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    name: cleanName(draft.name),
    floor_id: draft.floorId.trim() || null,
    icon: draft.icon.trim() || null,
    aliases: splitAliases(draft.aliases),
    picture: draft.picture.trim() || null,
    temperature_entity_id: draft.temperatureEntityId.trim() || null,
    humidity_entity_id: draft.humidityEntityId.trim() || null,
  };
  if (areaId) return { type: 'config/area_registry/update', area_id: areaId, ...fields };
  const created: Record<string, unknown> = { type: 'config/area_registry/create' };
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== null && !(Array.isArray(value) && value.length === 0)) created[key] = value;
  });
  return created;
}

/** The areas of Home Assistant with what was changed here and not yet read back. */
export function overlayAreas(areas: HaArea[], changed: HaArea[], deletedIds: string[]) {
  const deleted = new Set(deletedIds);
  const changedById = new Map(changed.map((area) => [area.area_id, area]));
  const known = new Set(areas.map((area) => area.area_id));
  return [
    ...areas.filter((area) => !deleted.has(area.area_id)).map((area) => changedById.get(area.area_id) ?? area),
    ...changed.filter((area) => !known.has(area.area_id) && !deleted.has(area.area_id)),
  ];
}
