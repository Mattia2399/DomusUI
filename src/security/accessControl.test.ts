// @vitest-environment node

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ACCESS_CAPABILITY_IDS,
  ACCESS_POLICY_STATES,
  ACCESS_ROLES,
  AccessProfileError,
  DEMO_ACCESS,
  LEGACY_CAPABILITY_MAP,
  LOADING_ACCESS,
  accessSnapshot,
  parseAccessSelf,
  snapshotForProfile,
  toAccessProfileError,
  type AccessCapability,
} from './accessControl';
import { HA_ADMIN_ONLY, ROLE_CAPABILITIES, accessFor, accessProfileFor, getSelfAnswer } from '../test/accessFixtures';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const MODELS = read('custom_components/domusos/access/models.py');
const USER_ID = 'a'.repeat(32);

/** Each `_capability(...)` declaration of the backend registry, with its id. */
function backendCapabilities(): { id: string; declaration: string }[] {
  const registry = MODELS.slice(MODELS.indexOf('ACCESS_CAPABILITIES: Mapping'), MODELS.indexOf('ACCESS_MANAGE = '));
  return registry
    .split('_capability(')
    .slice(1)
    .flatMap((declaration) => {
      const id = declaration.match(/^\s*"([a-z_.]+)"/)?.[1];
      return id ? [{ id, declaration }] : [];
    });
}

function backendRoles(): Record<string, string[]> {
  const block = MODELS.slice(MODELS.indexOf('SYSTEM_ROLES: Mapping'), MODELS.indexOf('def default_role'));
  return Object.fromEntries(
    [...block.matchAll(/RoleId\.([A-Z_]+): _ids\(([^)]*)\)/g)].map(([, role, ids]) => [
      role.toLowerCase(),
      [...ids.matchAll(/"([a-z_.]+)"/g)].map(([, id]) => id).sort(),
    ]),
  );
}

describe('the capability registry the frontend knows', () => {
  it('is exactly the registry of the backend', () => {
    const backend = backendCapabilities().map(({ id }) => id);
    expect(backend).toHaveLength(34);
    expect([...ACCESS_CAPABILITY_IDS].sort()).toEqual(backend.sort());
  });

  it('has the roles and the policy states of the backend', () => {
    const roles = [...MODELS.slice(MODELS.indexOf('class RoleId'), MODELS.indexOf('ASSIGNABLE_ROLES')).matchAll(/= "([a-z_]+)"/g)]
      .map(([, id]) => id);
    expect([...ACCESS_ROLES].sort()).toEqual(roles.sort());
    const states = [...MODELS.slice(MODELS.indexOf('class StoreState'), MODELS.indexOf('TRUSTED_STATES = ')).matchAll(/= "([a-z_]+)"/g)]
      .map(([, id]) => id);
    expect([...ACCESS_POLICY_STATES].sort()).toEqual(states.sort());
  });

  it('builds test profiles from the backend role table and administrator-only list', () => {
    const roles = backendRoles();
    for (const role of ['member', 'restricted', 'wall_panel', 'locked'] as const) {
      expect([...ROLE_CAPABILITIES[role]].sort(), role).toEqual(roles[role]);
    }
    const adminOnly = backendCapabilities()
      .filter(({ declaration }) => declaration.includes('requires_ha_admin=True'))
      .map(({ id }) => id);
    expect([...HA_ADMIN_ONLY].sort()).toEqual(adminOnly.sort());
  });

  it('gives the simulated Home Assistant of the e2e suites the same tables', () => {
    const e2e = createRequire(import.meta.url)(resolve(process.cwd(), 'tests/support/accessSelf.cjs')) as {
      ROLE_CAPABILITIES: Record<string, string[]>;
      HA_ADMIN_ONLY: string[];
    };
    for (const role of ACCESS_ROLES) {
      expect([...e2e.ROLE_CAPABILITIES[role]].sort(), role).toEqual([...ROLE_CAPABILITIES[role]].sort());
    }
    expect([...e2e.HA_ADMIN_ONLY].sort()).toEqual([...HA_ADMIN_ONLY].sort());
  });

  it('translates every legacy capability into a known one', () => {
    for (const capability of Object.values(LEGACY_CAPABILITY_MAP)) {
      expect(ACCESS_CAPABILITY_IDS).toContain(capability);
    }
  });
});

describe('the get_self answer', () => {
  it('reads a profile field by field', () => {
    const profile = parseAccessSelf(getSelfAnswer(accessProfileFor('member', { userId: USER_ID, grants: ['access.control'] })), USER_ID);
    expect(profile.role).toBe('member');
    expect(profile.grants).toEqual(['access.control']);
    expect(profile.capabilities.has('access.control')).toBe(true);
    expect(profile.capabilities.has('energy.manage')).toBe(false);
    expect(profile.policyState).toBe('absent');
    expect(profile.revision).toBe(0);
    expect(profile.isAdmin).toBe(false);
  });

  it('refuses the profile of another account than the one the interface shows', () => {
    const answer = getSelfAnswer(accessProfileFor('admin', { userId: 'b'.repeat(32) }));
    expect(() => parseAccessSelf(answer, USER_ID)).toThrow(new AccessProfileError('other_account'));
  });

  it.each([
    ['nothing', null],
    ['a list', []],
    ['no access', { principal: { user_id: USER_ID, is_admin: true, is_owner: false } }],
    ['an unknown role', { ...getSelfAnswer(accessProfileFor('admin', { userId: USER_ID })), access: { ...getSelfAnswer(accessProfileFor('admin')).access, role: 'owner' } }],
    ['an unknown state', { ...getSelfAnswer(accessProfileFor('admin', { userId: USER_ID })), access: { ...getSelfAnswer(accessProfileFor('admin')).access, state: 'fine' } }],
    ['capabilities that are no list', { ...getSelfAnswer(accessProfileFor('admin', { userId: USER_ID })), access: { ...getSelfAnswer(accessProfileFor('admin')).access, capabilities: 'all' } }],
    ['a negative revision', { ...getSelfAnswer(accessProfileFor('admin', { userId: USER_ID })), access: { ...getSelfAnswer(accessProfileFor('admin')).access, revision: -1 } }],
    ['an administrator flag that is no boolean', { ...getSelfAnswer(accessProfileFor('admin', { userId: USER_ID })), principal: { user_id: USER_ID, is_admin: 'yes', is_owner: false } }],
  ])('turns %s into an error, never a profile', (_label, answer) => {
    expect(() => parseAccessSelf(answer, USER_ID)).toThrow(AccessProfileError);
  });

  it('drops capability names it does not know instead of granting them', () => {
    const answer = getSelfAnswer(accessProfileFor('member', { userId: USER_ID }));
    (answer.access.capabilities as string[]).push('everything', 'admin', 'energy.manage.all');
    const profile = parseAccessSelf(answer, USER_ID);
    expect([...profile.capabilities].every((capability) => ACCESS_CAPABILITY_IDS.includes(capability))).toBe(true);
    expect(profile.capabilities.size).toBe(ROLE_CAPABILITIES.member.length);
  });

  it.each([
    [{ code: 'unknown_command', message: 'Unknown command.' }, 'unavailable'],
    [{ code: 'access_unavailable', message: 'Domus access control is not running' }, 'unavailable'],
    [new Error('Comando non ammesso dal bridge'), 'unavailable'],
    [new Error('Domus access control failed [unknown_error]'), 'network'],
    [{ code: 'access_denied', message: 'This account has no access to Domus' }, 'network'],
    [new Error('timeout'), 'network'],
  ] as const)('reads %o as %s', (error, kind) => {
    expect(toAccessProfileError(error).kind).toBe(kind);
  });
});

describe('can', () => {
  const significant: AccessCapability[] = [
    'dashboard.view', 'energy.view', 'energy.manage', 'security.view', 'security.control', 'access.control',
    'ha_frontend.open', 'device.manage', 'profile.manage', 'system.view', 'access.manage',
  ];
  const expected: Record<string, AccessCapability[]> = {
    admin: significant,
    member: ['dashboard.view', 'energy.view', 'security.view', 'device.manage', 'profile.manage', 'system.view'],
    restricted: ['dashboard.view', 'profile.manage'],
    wall_panel: ['dashboard.view', 'energy.view', 'security.view'],
    locked: ['dashboard.view', 'profile.manage'],
  };

  it.each(Object.keys(expected))('gives %s exactly its role', (role) => {
    const access = accessFor(role as keyof typeof ROLE_CAPABILITIES, { isAdmin: role === 'admin' });
    expect(significant.filter((capability) => access.can(capability))).toEqual(expected[role]);
  });

  it('gives a locked Home Assistant administrator the recovery and nothing else of an administrator', () => {
    const access = accessFor('locked', { isAdmin: true });
    expect(access.status).toBe('locked');
    expect(access.can('access.manage')).toBe(true);
    expect(access.can('energy.manage')).toBe(false);
    expect(access.can('ha_frontend.open')).toBe(false);
    expect(access.can('system.manage')).toBe(false);
  });

  it('adds a personal grant, never an administrator capability to a non administrator', () => {
    const access = accessFor('member', { grants: ['security.control', 'access.control'] });
    expect(access.can('security.control') && access.can('access.control')).toBe(true);
    expect(accessFor('member', { grants: ['energy.manage'] }).can('energy.manage')).toBe(false);
  });

  it('grants nothing while loading, after an error or without access control', () => {
    for (const access of [LOADING_ACCESS, accessSnapshot('error'), accessSnapshot('unavailable')]) {
      expect(access.profile).toBeNull();
      expect(ACCESS_CAPABILITY_IDS.some((capability) => access.can(capability))).toBe(false);
    }
  });

  it('is false for a name it does not know', () => {
    expect(accessFor('admin').can('everything' as unknown as AccessCapability)).toBe(false);
  });

  it('marks a profile of an untrusted policy as locked', () => {
    expect(snapshotForProfile(accessProfileFor('locked')).status).toBe('locked');
    expect(snapshotForProfile(accessProfileFor('member')).status).toBe('ready');
  });

  it('shows the demo every surface but Home Assistant', () => {
    expect(DEMO_ACCESS.can('energy.view') && DEMO_ACCESS.can('security.control')).toBe(true);
    expect(DEMO_ACCESS.can('ha_frontend.open')).toBe(false);
  });

  it('looks capabilities up in a set, not in a list', () => {
    const access = accessFor('admin');
    const started = performance.now();
    for (let index = 0; index < 100_000; index += 1) access.can('energy.view');
    expect(performance.now() - started).toBeLessThan(500);
    expect(access.profile?.capabilities).toBeInstanceOf(Set);
  });
});
