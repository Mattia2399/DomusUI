import type { ProfileHouseMember } from '../components/settings/settingsHouseAccessModel';
import type { MockEntityStateMap } from '../types/ha';

/**
 * Linking a Home Assistant login to a person (`person/update` with `user_id`).
 *
 * Home Assistant stays the authority: it only accepts the update from an
 * administrator and refuses a login already linked to another person. The
 * update always resends the full person record read from `person/list`, so
 * linking never touches the name, picture or device trackers.
 */

export type HaPersonRecord = {
  id: string;
  name: string;
  userId: string | null;
  deviceTrackers: string[];
  picture: string | null;
  /** People defined in configuration.yaml cannot be changed from the UI. */
  editable: boolean;
};

function parseRecord(value: unknown, editable: boolean): HaPersonRecord | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  if (typeof source.id !== 'string' || !source.id || typeof source.name !== 'string') return null;
  return {
    id: source.id,
    name: source.name,
    userId: typeof source.user_id === 'string' && source.user_id ? source.user_id : null,
    deviceTrackers: Array.isArray(source.device_trackers)
      ? source.device_trackers.filter((entity): entity is string => typeof entity === 'string')
      : [],
    picture: typeof source.picture === 'string' && source.picture ? source.picture : null,
    editable,
  };
}

/** Parses the `person/list` response: `{ storage: [...], config: [...] }`. */
export function parsePersonList(payload: unknown): HaPersonRecord[] {
  if (!payload || typeof payload !== 'object') return [];
  const { storage, config } = payload as { storage?: unknown; config?: unknown };
  const read = (items: unknown, editable: boolean) =>
    Array.isArray(items) ? items.flatMap((item) => parseRecord(item, editable) ?? []) : [];
  return [...read(storage, true), ...read(config, false)];
}

/** The person's Home Assistant id, exposed as the `id` attribute of its entity. */
export function resolvePersonId(states: MockEntityStateMap, personEntityId: string) {
  const id = states[personEntityId]?.rawAttributes?.id;
  return typeof id === 'string' && id ? id : undefined;
}

/**
 * Resends the full person record, changing only the given fields: name,
 * login or picture. Device trackers always stay as Home Assistant has them.
 */
export function buildPersonUpdateMessage(
  person: HaPersonRecord,
  changes: { name?: string; userId?: string | null; picture?: string | null },
) {
  return {
    type: 'person/update',
    person_id: person.id,
    name: changes.name !== undefined ? changes.name.trim() : person.name,
    user_id: changes.userId !== undefined ? changes.userId : person.userId,
    device_trackers: person.deviceTrackers,
    picture: changes.picture !== undefined ? changes.picture : person.picture,
  };
}

/**
 * Creating a person (`person/create`) sets its name and, optionally, the login
 * it belongs to and a picture uploaded by Domus. Device trackers stay in
 * Home Assistant.
 */
export function buildPersonCreateMessage(name: string, userId: string | null, picture: string | null = null) {
  return {
    type: 'person/create',
    name: name.trim(),
    user_id: userId,
    device_trackers: [] as string[],
    picture,
  };
}

const normalizeName = (name: string) => name.trim().toLocaleLowerCase('it-IT');

/** An existing person with the same name, so the UI can avoid duplicates. */
export function findPersonNamed(name: string, members: readonly ProfileHouseMember[]) {
  const target = normalizeName(name);
  if (!target) return undefined;
  return members.find((member) => member.personEntityId && normalizeName(member.name) === target);
}

/**
 * People a login can be linked to: editable people without a login. A person
 * with the same name is suggested first, but never linked automatically.
 */
export function rankLinkCandidates(accountName: string, members: readonly ProfileHouseMember[]) {
  const target = normalizeName(accountName);
  return members
    .filter((member) => member.personEntityId && member.hasAccount === false && member.personEditable !== false)
    .map((member) => ({ member, sameName: normalizeName(member.name) === target }))
    .sort((first, second) =>
      first.sameName === second.sameName
        ? first.member.name.localeCompare(second.member.name, 'it-IT')
        : first.sameName
          ? -1
          : 1,
    );
}
