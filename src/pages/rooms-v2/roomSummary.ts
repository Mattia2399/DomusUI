import { bucketEntityId, createEmptyBuckets, toNumber, type RoomEntityBuckets } from '../../components/rooms/roomsDirectory';
import type { MockEntityState } from '../../types/ha';

/*
 * What the head of a room says about it: its icon, how many accessories are
 * on, the climate in a few words, and which kinds of accessory it still lacks.
 */

export type RoomIconKind = 'sofa' | 'kitchen' | 'bed' | 'bath' | 'desk' | 'garage' | 'garden' | 'washer' | 'tv' | 'book' | 'room';

const ICONS: Array<[RegExp, RoomIconKind]> = [
  [/washing|washer|laundry|lavanderia|buanderie/i, 'washer'],
  [/television|cinema|theater|theatre/i, 'tv'],
  [/book|library|libreria|biblioteca|biblioth/i, 'book'],
  [/sofa|couch|tv|soggiorno|salotto|living|salon/i, 'sofa'],
  [/silverware|stove|fridge|pot|chef|cucina|kitchen|cuisine/i, 'kitchen'],
  [/bed|camera|letto|bedroom|chambre/i, 'bed'],
  [/shower|bath|toilet|bagno|salle de bain/i, 'bath'],
  [/desk|monitor|laptop|office|studio|ufficio|bureau/i, 'desk'],
  [/garage|car/i, 'garage'],
  [/tree|flower|grass|garden|giardino|terrazz|balcon|jardin|terrasse/i, 'garden'],
];

/** The room's own icon decides; a room without one is known by its name. */
export function roomIconKind(icon: string | null | undefined, name: string): RoomIconKind {
  const fromIcon = icon ? ICONS.find(([pattern]) => pattern.test(icon.replace(/^mdi:/, '')))?.[1] : undefined;
  return fromIcon ?? ICONS.find(([pattern]) => pattern.test(name))?.[1] ?? 'room';
}

export function bucketRoomEntities(entityIds: string[]): RoomEntityBuckets {
  const buckets = createEmptyBuckets();
  entityIds.forEach((entityId) => bucketEntityId(entityId, buckets));
  return buckets;
}

const isOn = (state: MockEntityState | undefined) => `${state?.state ?? ''}`.toLowerCase() === 'on';
const isPlaying = (state: MockEntityState | undefined) => `${state?.state ?? ''}`.toLowerCase() === 'playing';

/** Lights, switches and fans that are on, and players that are playing. */
export function countActiveAccessories(
  buckets: RoomEntityBuckets,
  states: Record<string, MockEntityState | undefined>,
  lightIsOn: (entityId: string) => boolean,
) {
  return (
    buckets.lights.filter(lightIsOn).length +
    buckets.switches.filter((entityId) => isOn(states[entityId])).length +
    buckets.medias.filter((entityId) => isPlaying(states[entityId])).length
  );
}

export function anyMediaPlaying(buckets: RoomEntityBuckets, states: Record<string, MockEntityState | undefined>) {
  return buckets.medias.some((entityId) => isPlaying(states[entityId]));
}

export type ClimateMode = 'off' | 'heat' | 'cool' | 'heat_cool' | 'dry' | 'fan_only';
export type ClimateGlance = { mode: ClimateMode; target?: number; low?: number; high?: number };

const MODES: ClimateMode[] = ['off', 'heat', 'cool', 'heat_cool', 'dry', 'fan_only'];

/** The first climate device of the room, in a glance; an auto mode reads as a range. */
export function climateGlance(buckets: RoomEntityBuckets, states: Record<string, MockEntityState | undefined>): ClimateGlance | null {
  const entityId = buckets.climates.find((id) => id.startsWith('climate.'));
  if (!entityId) return null;
  const state = states[entityId];
  const raw = `${state?.hvacMode ?? state?.state ?? ''}`.toLowerCase();
  const mode: ClimateMode = raw === 'auto' ? 'heat_cool' : MODES.includes(raw as ClimateMode) ? (raw as ClimateMode) : 'off';
  const attributes = state?.rawAttributes ?? {};
  return {
    mode,
    target: toNumber(attributes.temperature) ?? toNumber(state?.targetValue),
    low: toNumber(attributes.target_temp_low),
    high: toNumber(attributes.target_temp_high),
  };
}

export type MissingSection = 'climate' | 'devices' | 'security' | 'media';

/** The kinds of accessory the room has none of yet, in the order the page shows them. */
export function missingSections(buckets: RoomEntityBuckets): MissingSection[] {
  const missing: MissingSection[] = [];
  // Humidifiers sit with the climate entities in the buckets, but they are devices.
  const humidifiers = buckets.climates.filter((entityId) => entityId.startsWith('humidifier.'));
  if (buckets.climates.length === humidifiers.length) missing.push('climate');
  if (buckets.switches.length === 0 && buckets.covers.length === 0 && humidifiers.length === 0) missing.push('devices');
  if (buckets.locks.length === 0 && buckets.cameras.length === 0) missing.push('security');
  if (buckets.medias.length === 0) missing.push('media');
  return missing;
}

/** "20,9°" in Italian, "20.9°" in English; whole degrees without decimals. */
export function formatDegrees(value: number, locale: string) {
  const rounded = Math.round(value * 10) / 10;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: rounded % 1 === 0 ? 0 : 1 }).format(rounded)}°`;
}
