/**
 * Finds the signed-in user's Person and the presence trackers it declares.
 *
 * Only Home Assistant's own link counts: a Person whose `user_id` attribute
 * equals the user's id. Names, usernames, emails and tracker attributes are
 * never used, so a user without exactly one linked Person has no presence
 * data at all rather than someone else's.
 */

type PresenceStates = Record<string, { rawAttributes?: Record<string, unknown> } | undefined>;

export type CurrentPersonPresence = {
  personEntityId: string | null;
  /** Trackers listed by that Person, in its order, without duplicates. */
  trackerEntityIds: string[];
};

const NO_PRESENCE: CurrentPersonPresence = { personEntityId: null, trackerEntityIds: [] };

function trackerIds(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.startsWith('device_tracker.'));
}

export function resolveCurrentPersonPresence(
  states: PresenceStates,
  userId: string | null | undefined,
): CurrentPersonPresence {
  const wanted = userId?.trim();
  if (!wanted) return NO_PRESENCE;

  const linked = Object.entries(states).filter(([entityId, entity]) => {
    if (!entityId.startsWith('person.')) return false;
    const linkedUserId = entity?.rawAttributes?.user_id;
    return typeof linkedUserId === 'string' && linkedUserId.trim() === wanted;
  });
  // Two Persons claiming the same user is a Home Assistant misconfiguration:
  // show nothing rather than pick one.
  if (linked.length !== 1) return NO_PRESENCE;

  const [personEntityId, person] = linked[0];
  const attributes = person?.rawAttributes ?? {};
  const trackers = new Set([
    ...trackerIds(attributes.device_trackers),
    ...trackerIds(attributes.source),
    ...trackerIds(attributes.entity_id),
  ]);
  return { personEntityId, trackerEntityIds: Array.from(trackers) };
}
