/**
 * People and access: the administration commands of Domus Access Control.
 *
 * The page only asks; the backend decides (active Home Assistant
 * administrator with access.manage) and answers with the account as saved,
 * which becomes the page's truth. Who acts is the connection's account:
 * nothing here sends it.
 */

import { ACCESS_POLICY_STATES, type AccessPolicyState } from '../security/accessControl';

export const ASSIGNABLE_ROLES = ['admin', 'resident', 'member', 'restricted', 'wall_panel'] as const;
/** Roles that already hold both personal grants: nothing redundant is sent or stored. */
export const ROLES_WITH_PERSONAL_GRANTS: readonly AssignableRole[] = ['admin', 'resident'];
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

/** The only capabilities an account can receive on top of its role (V1). */
export const PERSONAL_GRANTS = ['access.control', 'security.control'] as const;
export type PersonalGrant = (typeof PERSONAL_GRANTS)[number];

export type ManagedAccount = Readonly<{
  userId: string;
  name: string;
  isAdmin: boolean;
  isOwner: boolean;
  isActive: boolean;
  /** Active, and the policy can be trusted: role and grants can change. */
  manageable: boolean;
  /** `locked` while the policy cannot be trusted. */
  role: AssignableRole | 'locked';
  /** An explicit assignment; otherwise the default role (administrator or member). */
  assigned: boolean;
  grants: readonly PersonalGrant[];
}>;

export type AccessPolicySummary = Readonly<{ state: AccessPolicyState; revision: number }>;

export type AccountsList = AccessPolicySummary & Readonly<{ accounts: readonly ManagedAccount[] }>;

export type SavedAccount = AccessPolicySummary & Readonly<{ account: ManagedAccount | null }>;

export const ACCESS_ADMIN_ERROR_CODES = [
  'revision_conflict',
  'access_denied',
  'unauthorized',
  'unknown_account',
  'account_not_manageable',
  'role_requires_ha_admin',
  'invalid_assignment',
  'access_store_untrusted',
  'save_failed',
  'reset_failed',
  'access_unavailable',
  'unsupported',
  'invalid_response',
  'network',
] as const;

export type AccessAdminErrorCode = (typeof ACCESS_ADMIN_ERROR_CODES)[number];

export class AccessAdminError extends Error {
  constructor(public readonly code: AccessAdminErrorCode) {
    super(code);
    this.name = 'AccessAdminError';
  }
}

export type AccessAdminCallApi = (
  message: Record<string, unknown>,
  options?: { reportError?: boolean; throwOnError?: boolean },
) => Promise<unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function invalid(): never {
  throw new AccessAdminError('invalid_response');
}

function parseSummary(value: Record<string, unknown>): AccessPolicySummary {
  const state = value.state;
  const revision = value.revision;
  if (typeof state !== 'string' || !(ACCESS_POLICY_STATES as readonly string[]).includes(state)) return invalid();
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 0) return invalid();
  return { state: state as AccessPolicyState, revision };
}

export function parseManagedAccount(value: unknown): ManagedAccount {
  if (!isRecord(value)) return invalid();
  const { user_id: userId, name, role, grants } = value;
  if (typeof userId !== 'string' || !userId || typeof name !== 'string') return invalid();
  for (const flag of ['is_admin', 'is_owner', 'is_active', 'manageable', 'assigned']) {
    if (typeof value[flag] !== 'boolean') return invalid();
  }
  if (typeof role !== 'string' || ![...ASSIGNABLE_ROLES, 'locked'].includes(role)) return invalid();
  if (!Array.isArray(grants)) return invalid();
  return {
    userId,
    name,
    isAdmin: value.is_admin as boolean,
    isOwner: value.is_owner as boolean,
    isActive: value.is_active as boolean,
    manageable: value.manageable as boolean,
    role: role as ManagedAccount['role'],
    assigned: value.assigned as boolean,
    // A grant this page does not know is never shown as held.
    grants: grants.filter((grant): grant is PersonalGrant => (PERSONAL_GRANTS as readonly unknown[]).includes(grant)),
  };
}

export function toAccessAdminError(error: unknown): AccessAdminError {
  if (error instanceof AccessAdminError) return error;
  const message = isRecord(error) && typeof error.message === 'string' ? error.message : String(error ?? '');
  const code = isRecord(error) && typeof error.code === 'string' ? error.code : message.match(/\[([a-z_]+)\]\s*$/)?.[1] ?? '';
  if ((ACCESS_ADMIN_ERROR_CODES as readonly string[]).includes(code)) return new AccessAdminError(code as AccessAdminErrorCode);
  if (code === 'unknown_command' || code === 'invalid_format' || /non ammess[oa]/i.test(message)) {
    return new AccessAdminError('unsupported');
  }
  return new AccessAdminError('network');
}

async function call<T>(callApi: AccessAdminCallApi, message: Record<string, unknown>, parse: (value: unknown) => T) {
  let result: unknown;
  try {
    result = await callApi(message, { reportError: false, throwOnError: true });
  } catch (error) {
    throw toAccessAdminError(error);
  }
  return parse(result);
}

export function listAccounts(callApi: AccessAdminCallApi): Promise<AccountsList> {
  return call(callApi, { type: 'domusos/access/list_accounts' }, (value) => {
    if (!isRecord(value) || !Array.isArray(value.accounts)) return invalid();
    return { ...parseSummary(value), accounts: value.accounts.map(parseManagedAccount) };
  });
}

function parseSaved(value: unknown): SavedAccount {
  if (!isRecord(value)) return invalid();
  return { ...parseSummary(value), account: value.account === null ? null : parseManagedAccount(value.account) };
}

/** Role and grants in one write, only if the policy is still at `expectedRevision`. */
export function setAssignment(
  callApi: AccessAdminCallApi,
  userId: string,
  role: AssignableRole,
  grants: readonly PersonalGrant[],
  expectedRevision: number,
) {
  return call(
    callApi,
    {
      type: 'domusos/access/set_assignment',
      user_id: userId,
      role,
      // An Administrator or a Resident already holds both: nothing redundant is sent.
      grants: ROLES_WITH_PERSONAL_GRANTS.includes(role) ? [] : [...new Set(grants)].sort(),
      expected_revision: expectedRevision,
    },
    parseSaved,
  );
}

/** Back to the default role: the assignment is removed, nothing "member" is written in its place. */
export function removeAssignment(callApi: AccessAdminCallApi, userId: string, expectedRevision: number) {
  return call(callApi, { type: 'domusos/access/remove_assignment', user_id: userId, expected_revision: expectedRevision }, parseSaved);
}

/** The recovery of P2.1.2: every account back to its default role; the previous policy is kept aside. */
export function resetAccessPolicy(callApi: AccessAdminCallApi) {
  return call(callApi, { type: 'domusos/access/reset_policy' }, (value) => {
    if (!isRecord(value) || typeof value.state !== 'string') return invalid();
    return { state: value.state };
  });
}
