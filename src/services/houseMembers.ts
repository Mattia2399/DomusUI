import type { ProfileHouseMember } from '../components/settings/settingsHouseAccessModel';
import type { MockEntityStateMap } from '../types/ha';
import { isHouseholdAccount, type HaAuthUser } from './haIdentityPresentation';

/**
 * Builds the list of house members from Home Assistant.
 *
 * A member is a Home Assistant *person* (`person.*`): the household concept
 * that carries a name, a picture and presence, with or without a login. A
 * login linked to a person (`user_id`) merges into that person. Logins with
 * no person are kept as account-only members so authorship (layout versions,
 * profile) still resolves, but the UI can tell them apart via
 * `personEntityId`. Logins Home Assistant generates for itself (Cloud, Cast,
 * Supervisor…) and disabled logins are never members.
 */

const ROLE_LABELS = { owner: 'Creatore', admin: 'Admin', member: 'Membro' } as const;

export type HouseMemberCandidate = {
  userId?: string;
  displayName?: string;
  username?: string;
  email?: string;
  entityId?: string;
};

export type BuildHouseMembersInput = {
  /** Entity states; only `person.*` entries are read. */
  states: MockEntityStateMap;
  /** Logins from `config/auth/list` (empty for non-admin viewers). */
  users: readonly HaAuthUser[];
  currentUser?: HaAuthUser;
  currentUserAvatarUrl?: string;
  resolveAvatarUrl: (candidate: string | undefined) => string | undefined;
  /** Extra filter for accounts hidden by product policy (e.g. guest aliases). */
  isHiddenCandidate?: (candidate: HouseMemberCandidate) => boolean;
};

export type HouseMemberPresence = {
  id: string;
  personEntityId: string;
  name: string;
  latitude?: number;
  longitude?: number;
  gpsAccuracy?: number;
  locationSourceEntityId?: string;
  state?: string;
  avatarUrl?: string;
  roleLabel?: string;
  isCurrent?: boolean;
  trackerEntityIds: string[];
};

export type HouseMemberLocationPoint = HouseMemberPresence & {
  latitude: number;
  longitude: number;
};

export type BuildHouseMemberLocationPointsInput = {
  members: readonly ProfileHouseMember[];
  states: MockEntityStateMap;
  resolveAvatarUrl: (candidate: string | undefined) => string | undefined;
};

function trimmed(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function roleLabelFor(user: HaAuthUser) {
  return user.isOwner ? ROLE_LABELS.owner : user.isAdmin ? ROLE_LABELS.admin : ROLE_LABELS.member;
}

function finiteNumber(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function trackerEntityIds(value: unknown) {
  const candidates = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  return candidates
    .map((entry) => trimmed(entry))
    .filter((entry): entry is string => Boolean(entry?.startsWith('device_tracker.')));
}

function readValidCoordinates(entity: MockEntityStateMap[string] | undefined) {
  const attributes = entity?.rawAttributes ?? {};
  const latitude = finiteNumber(attributes.latitude);
  const longitude = finiteNumber(attributes.longitude);
  if (
    latitude === undefined ||
    longitude === undefined ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return undefined;
  }
  const gpsAccuracy = finiteNumber(attributes.gps_accuracy);
  return {
    latitude,
    longitude,
    gpsAccuracy: gpsAccuracy !== undefined && gpsAccuracy >= 0 ? gpsAccuracy : undefined,
  };
}

export function buildHouseMembers({
  states,
  users,
  currentUser,
  currentUserAvatarUrl,
  resolveAvatarUrl,
  isHiddenCandidate = () => false,
}: BuildHouseMembersInput): ProfileHouseMember[] {
  const accountsById = new Map<string, HaAuthUser>();
  for (const user of currentUser ? [...users, currentUser] : users) {
    if (!accountsById.has(user.id)) accountsById.set(user.id, user);
  }
  const eligibleAccount = (userId: string | undefined) => {
    const account = userId ? accountsById.get(userId) : undefined;
    return account && isHouseholdAccount(account) ? account : undefined;
  };

  const members: ProfileHouseMember[] = [];
  const seenIds = new Set<string>();
  const linkedUserIds = new Set<string>();
  const push = (member: ProfileHouseMember) => {
    if (seenIds.has(member.id)) return;
    seenIds.add(member.id);
    members.push(member);
  };

  // 1. People: the source of truth for who lives in the house.
  for (const [entityId, entity] of Object.entries(states)) {
    if (!entityId.startsWith('person.')) continue;
    const attributes = entity.rawAttributes ?? {};
    const slug = entityId.slice('person.'.length).replace(/[_-]+/g, ' ').trim();
    const name = trimmed(attributes.friendly_name) ?? (slug || entityId);
    const userId = trimmed(attributes.user_id);
    if (isHiddenCandidate({ userId, displayName: name, entityId })) continue;

    const account = eligibleAccount(userId);
    if (account) linkedUserIds.add(account.id);
    push({
      id: account ? `user:${account.id}` : `person:${entityId}`,
      name,
      userId: account?.id,
      personEntityId: entityId,
      hasAccount: Boolean(account),
      personEditable: attributes.editable !== false,
      avatarUrl: resolveAvatarUrl(trimmed(entity.imageUrl) ?? trimmed(attributes.entity_picture)),
      roleLabel: account ? roleLabelFor(account) : undefined,
      isCurrent: Boolean(account && currentUser && account.id === currentUser.id),
    });
  }

  // 2. Logins that no person represents: kept, but flagged as account-only.
  for (const account of accountsById.values()) {
    if (linkedUserIds.has(account.id) || !isHouseholdAccount(account)) continue;
    const isCurrent = account.id === currentUser?.id;
    if (
      isHiddenCandidate({
        userId: account.id,
        displayName: account.name,
        username: account.username,
        email: account.email,
      })
    ) {
      continue;
    }
    push({
      id: `user:${account.id}`,
      name: account.name,
      userId: account.id,
      hasAccount: true,
      avatarUrl: isCurrent ? currentUserAvatarUrl : undefined,
      roleLabel: roleLabelFor(account),
      isCurrent,
    });
  }

  return members.sort((first, second) => {
    if (first.isCurrent !== second.isCurrent) return first.isCurrent ? -1 : 1;
    return first.name.localeCompare(second.name, 'it-IT');
  });
}

/** Members backed by a Home Assistant person (what the Members card shows). */
export function selectHouseholdPeople(members: readonly ProfileHouseMember[]) {
  return members.filter((member) => Boolean(member.personEntityId));
}

/**
 * Resolves presence from the exact `person.*` entity carried by each house
 * member. A person's declared source tracker may supply coordinates when the
 * person state omits them; accounts and names are never used as joins.
 */
export function buildHouseMemberPresences({
  members,
  states,
  resolveAvatarUrl,
}: BuildHouseMemberLocationPointsInput): HouseMemberPresence[] {
  return selectHouseholdPeople(members).flatMap((member) => {
    const personEntityId = trimmed(member.personEntityId);
    if (!personEntityId?.startsWith('person.')) {
      return [];
    }

    const entity = states[personEntityId];
    if (!entity) {
      return [];
    }

    const attributes = entity.rawAttributes ?? {};
    const sourceTracker = trimmed(attributes.source);
    const linkedTrackers = new Set<string>();
    if (sourceTracker?.startsWith('device_tracker.')) {
      linkedTrackers.add(sourceTracker);
    }
    trackerEntityIds(attributes.device_trackers).forEach((trackerId) => linkedTrackers.add(trackerId));
    trackerEntityIds(attributes.entity_id).forEach((trackerId) => linkedTrackers.add(trackerId));

    const personCoordinates = readValidCoordinates(entity);
    const sourceCoordinates = !personCoordinates && sourceTracker?.startsWith('device_tracker.')
      ? readValidCoordinates(states[sourceTracker])
      : undefined;
    const coordinates = personCoordinates ?? sourceCoordinates;

    const personName = trimmed(attributes.friendly_name) ?? member.name;
    const avatarCandidate = trimmed(entity.imageUrl) ?? trimmed(attributes.entity_picture);

    return [{
      id: member.id,
      personEntityId,
      name: personName,
      latitude: coordinates?.latitude,
      longitude: coordinates?.longitude,
      gpsAccuracy: coordinates?.gpsAccuracy,
      locationSourceEntityId: coordinates
        ? personCoordinates
          ? personEntityId
          : sourceTracker
        : undefined,
      state: trimmed(entity.stateLabel) ?? trimmed(entity.state),
      avatarUrl: resolveAvatarUrl(avatarCandidate) ?? member.avatarUrl,
      roleLabel: member.roleLabel,
      isCurrent: member.isCurrent === true,
      trackerEntityIds: Array.from(linkedTrackers),
    }];
  });
}

/** Map-ready subset of the complete members presence model. */
export function buildHouseMemberLocationPoints(
  input: BuildHouseMemberLocationPointsInput,
): HouseMemberLocationPoint[] {
  return buildHouseMemberPresences(input).flatMap((member) =>
    member.latitude !== undefined && member.longitude !== undefined
      ? [{ ...member, latitude: member.latitude, longitude: member.longitude }]
      : [],
  );
}
