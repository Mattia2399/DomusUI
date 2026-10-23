// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import {
  AccessAdminError,
  listAccounts,
  parseManagedAccount,
  removeAssignment,
  resetAccessPolicy,
  setAssignment,
  toAccessAdminError,
} from './accessAdminClient';

const MARIO = 'b'.repeat(32);
const account = (overrides: Record<string, unknown> = {}) => ({
  user_id: MARIO,
  name: 'Mario',
  is_admin: false,
  is_owner: false,
  is_active: true,
  manageable: true,
  role: 'member',
  assigned: false,
  grants: [],
  ...overrides,
});

describe('People and access client', () => {
  it('lists the accounts with the policy state and revision', async () => {
    const callApi = vi.fn(async (_message: Record<string, unknown>) => ({ state: 'ready', revision: 4, accounts: [account({ grants: ['access.control'] })] }));
    const list = await listAccounts(callApi);
    expect(callApi).toHaveBeenCalledWith({ type: 'domusos/access/list_accounts' }, { reportError: false, throwOnError: true });
    expect(list).toEqual({
      state: 'ready',
      revision: 4,
      accounts: [
        {
          userId: MARIO,
          name: 'Mario',
          isAdmin: false,
          isOwner: false,
          isActive: true,
          manageable: true,
          role: 'member',
          assigned: false,
          grants: ['access.control'],
        },
      ],
    });
  });

  it('sends only the account to change, the role, the grants and the revision', async () => {
    const callApi = vi.fn(async (_message: Record<string, unknown>) => ({ state: 'ready', revision: 5, account: account({ assigned: true }) }));
    await setAssignment(callApi, MARIO, 'member', ['security.control', 'access.control', 'access.control'], 4);
    expect(callApi).toHaveBeenCalledWith(
      {
        type: 'domusos/access/set_assignment',
        user_id: MARIO,
        role: 'member',
        grants: ['access.control', 'security.control'],
        expected_revision: 4,
      },
      { reportError: false, throwOnError: true },
    );
    const [[message]] = callApi.mock.calls as unknown as [[Record<string, unknown>]];
    for (const field of ['assigned_by', 'assigned_at', 'is_admin', 'is_owner', 'capabilities', 'policy_state']) {
      expect(message).not.toHaveProperty(field);
    }
  });

  it('sends no redundant grant for a Resident either', async () => {
    const callApi = vi.fn(async (_message: Record<string, unknown>) => ({ state: 'ready', revision: 5, account: account({ role: 'resident', assigned: true }) }));
    const saved = await setAssignment(callApi, MARIO, 'resident', ['access.control', 'security.control'], 4);
    expect(callApi.mock.calls[0][0]).toMatchObject({ role: 'resident', grants: [] });
    expect(saved.account?.role).toBe('resident');
  });

  it('sends no redundant grant for an Administrator', async () => {
    const callApi = vi.fn(async (_message: Record<string, unknown>) => ({ state: 'ready', revision: 5, account: account({ role: 'admin', assigned: true }) }));
    await setAssignment(callApi, MARIO, 'admin', ['access.control'], 4);
    expect(callApi.mock.calls[0][0]).toMatchObject({ role: 'admin', grants: [] });
  });

  it('removes an assignment instead of writing the default role', async () => {
    const callApi = vi.fn(async (_message: Record<string, unknown>) => ({ state: 'ready', revision: 6, account: account() }));
    const saved = await removeAssignment(callApi, MARIO, 5);
    expect(callApi.mock.calls[0][0]).toEqual({ type: 'domusos/access/remove_assignment', user_id: MARIO, expected_revision: 5 });
    expect(saved.account?.assigned).toBe(false);
  });

  it('resets with the recovery command and nothing else', async () => {
    const callApi = vi.fn(async (_message: Record<string, unknown>) => ({ state: 'absent', previous_state: 'corrupt', previous_revision: null, kept: [] }));
    await resetAccessPolicy(callApi);
    expect(callApi.mock.calls[0][0]).toEqual({ type: 'domusos/access/reset_policy' });
  });

  it('never shows a grant it does not know as held, and refuses malformed answers', () => {
    expect(parseManagedAccount(account({ grants: ['access.control', 'access.manage'] })).grants).toEqual(['access.control']);
    for (const broken of [null, account({ role: 'owner' }), account({ is_admin: 'yes' }), account({ grants: 'all' }), account({ user_id: '' })]) {
      expect(() => parseManagedAccount(broken)).toThrow(AccessAdminError);
    }
  });

  it.each([
    [{ code: 'revision_conflict', message: 'changed elsewhere' }, 'revision_conflict'],
    [{ code: 'unauthorized', message: 'Unauthorized' }, 'unauthorized'],
    [{ code: 'account_not_manageable', message: 'x' }, 'account_not_manageable'],
    [{ code: 'role_requires_ha_admin', message: 'x' }, 'role_requires_ha_admin'],
    [{ code: 'unknown_command', message: 'Unknown command.' }, 'unsupported'],
    [new Error('Comando non ammesso dal bridge'), 'unsupported'],
    [new Error('socket closed'), 'network'],
  ] as const)('reads %o as %s', (error, code) => {
    expect(toAccessAdminError(error).code).toBe(code);
  });
});
