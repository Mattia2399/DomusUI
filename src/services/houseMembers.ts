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

function trimmed(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function roleLabelFor(user: HaAuthUser) {
  return user.isOwner ? ROLE_LABELS.owner : user.isAdmin ? ROLE_LABELS.admin : ROLE_LABELS.member;
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
