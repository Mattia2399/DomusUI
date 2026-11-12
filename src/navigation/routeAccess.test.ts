// @vitest-environment node

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APPLICATION_ROUTE_REGISTRY, createDefaultSidebarPaths } from './applicationRoutes';
import {
  ROUTE_ACCESS_RULES,
  canOpenRoute,
  filterNavigation,
  normalizeAccessPath,
  resolveRouteAccess,
  resolveRouteAccessState,
  resolveRouteRule,
} from './routeAccess';
import { SETTINGS_ENTRIES } from '../components/settings/settingsScopes';
import { LOADING_ACCESS, accessSnapshot } from '../security/accessControl';
import { accessFor } from '../test/accessFixtures';

const SRC = resolve(process.cwd(), 'src');
const ROUTE_LITERAL = /['"`](\/(?:home|rooms|security|automations|consumi|appgallery|settings|setup)(?:\/[a-z0-9_-]*)*)['"`]/g;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return name === 'site' || name === 'test' ? [] : sourceFiles(path);
    return /\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

/** Every application address the code names, as a string literal. */
function routesNamedInTheCode(): string[] {
  const routes = new Set<string>();
  for (const file of sourceFiles(SRC)) {
    for (const [, route] of readFileSync(file, 'utf8').matchAll(ROUTE_LITERAL)) routes.add(normalizeAccessPath(route));
  }
  return [...routes].sort();
}

describe('route contract', () => {
  it('declares a rule, a capability or a reasoned exemption, for every address the code names', () => {
    const routes = routesNamedInTheCode();
    expect(routes.length).toBeGreaterThan(40);
    for (const route of routes) {
      const rule = resolveRouteRule(route);
      const named = route === rule.path || (rule.subpaths && route.startsWith(`${rule.path}/`));
      expect(named, `${route} only falls back to ${rule.path}`).toBe(true);
    }
  });

  it('exempts only the onboarding and the Settings lists, each with its reason', () => {
    const exempt = ROUTE_ACCESS_RULES.filter((rule) => rule.access.kind === 'exempt');
    expect(exempt.map((rule) => rule.path).sort()).toEqual(['/settings', '/settings/device', '/settings/home', '/setup']);
    for (const rule of exempt) {
      expect(rule.access.kind === 'exempt' && rule.access.reason.length > 30, rule.path).toBe(true);
    }
  });

  it('names each route once', () => {
    const paths = ROUTE_ACCESS_RULES.map((rule) => rule.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('protects every application page by a capability', () => {
    expect(Object.fromEntries(APPLICATION_ROUTE_REGISTRY.map((route) => [route.path, resolveRouteAccess(route.path)]))).toEqual({
      '/appgallery': { kind: 'capability', capability: 'dashboard.view' },
      '/home': { kind: 'capability', capability: 'dashboard.view' },
      '/rooms': { kind: 'capability', capability: 'rooms.view' },
      '/casa': { kind: 'capability', capability: 'dashboard.view' },
      '/automations': { kind: 'capability', capability: 'automations.view' },
      '/security': { kind: 'capability', capability: 'security.view' },
      '/consumi': { kind: 'capability', capability: 'energy.view' },
    });
  });

  it('applies the most specific rule', () => {
    expect(resolveRouteAccess('/appgallery/irrigation/zones')).toEqual({ kind: 'capability', capability: 'irrigation.view' });
    expect(resolveRouteAccess('/appgallery/irrigation/settings')).toEqual({ kind: 'capability', capability: 'irrigation.manage' });
    expect(resolveRouteAccess('/appgallery/irrigation/zones/manage')).toEqual({ kind: 'capability', capability: 'irrigation.manage' });
    expect(resolveRouteAccess('/settings/data/history')).toEqual({ kind: 'capability', capability: 'dashboard.edit' });
    expect(resolveRouteAccess('/settings/home/waste-collection')).toEqual({ kind: 'capability', capability: 'waste.manage' });
    expect(resolveRouteAccess('/settings/profile/devices?x=1#top')).toEqual({ kind: 'capability', capability: 'profile.manage' });
    expect(resolveRouteAccess('/Consumi/Energia/')).toEqual({ kind: 'capability', capability: 'energy.view' });
  });

  it('shows an unknown address as the page that renders it', () => {
    expect(resolveRouteRule('/nowhere').path).toBe('/');
    expect(resolveRouteRule('/settings/nowhere').path).toBe('/settings');
  });
});

describe('navigation contract', () => {
  it('derives every navigation entry from the same rules as its route', () => {
    const restricted = accessFor('restricted');
    for (const entry of createDefaultSidebarPaths()) {
      const access = resolveRouteAccess(entry.path);
      const expected = access.kind === 'exempt' || restricted.can(access.capability);
      expect(filterNavigation([entry], restricted.can).length === 1, entry.path).toBe(expected);
    }
  });

  it.each([
    ['admin', ['appgallery', 'home', 'rooms', 'casa', 'automation', 'security', 'consumi']],
    ['member', ['appgallery', 'home', 'rooms', 'casa', 'automation', 'security', 'consumi']],
    ['restricted', ['appgallery', 'home', 'rooms', 'casa']],
    ['wall_panel', ['appgallery', 'home', 'rooms', 'casa', 'security', 'consumi']],
    ['locked', ['appgallery', 'home', 'rooms', 'casa']],
  ] as const)('shows %s its own pages only', (role, ids) => {
    expect(filterNavigation(createDefaultSidebarPaths(), accessFor(role).can).map(({ id }) => id)).toEqual(ids);
  });

  it('shows nothing that needs a capability while the profile is unknown', () => {
    for (const access of [LOADING_ACCESS, accessSnapshot('error'), accessSnapshot('unavailable')]) {
      expect(filterNavigation(createDefaultSidebarPaths(), access.can)).toEqual([]);
    }
  });

  it('keeps every Settings entry on a capability of its own route', () => {
    for (const entry of SETTINGS_ENTRIES) expect(resolveRouteAccess(entry.route).kind, entry.id).toBe('capability');
  });
});

describe('route guard', () => {
  it('opens a page only once its capability is known', () => {
    expect(resolveRouteAccessState('/consumi', LOADING_ACCESS)).toBe('checking');
    expect(resolveRouteAccessState('/consumi', accessSnapshot('error'))).toBe('error');
    expect(resolveRouteAccessState('/consumi', accessSnapshot('unavailable'))).toBe('unavailable');
    expect(resolveRouteAccessState('/consumi', accessFor('restricted'))).toBe('denied');
    expect(resolveRouteAccessState('/consumi', accessFor('member'))).toBe('open');
    // The Settings list is always there: it shows what the account may open.
    expect(resolveRouteAccessState('/settings', LOADING_ACCESS)).toBe('open');
  });

  it('says Home Assistant is not connected instead of checking forever, granting nothing', () => {
    expect(resolveRouteAccessState('/consumi', LOADING_ACCESS, 'offline')).toBe('offline');
    expect(resolveRouteAccessState('/settings/device/appearance', LOADING_ACCESS, 'offline')).toBe('offline');
    expect(resolveRouteAccessState('/consumi', LOADING_ACCESS, 'online')).toBe('checking');
    expect(resolveRouteAccessState('/settings', LOADING_ACCESS, 'offline')).toBe('open');
  });

  it('closes an open page as soon as its capability goes away', () => {
    expect(resolveRouteAccessState('/settings/device/power', accessFor('admin'))).toBe('open');
    expect(resolveRouteAccessState('/settings/device/power', accessFor('member'))).toBe('denied');
  });

  it.each([
    ['member', ['/settings/connections', '/settings/floors', '/settings/device/power', '/settings/dashboard', '/appgallery/irrigation/settings', '/settings/advanced']],
    ['restricted', ['/consumi', '/security', '/automations', '/settings/system', '/settings/device/kiosk']],
    ['wall_panel', ['/settings/profile', '/settings/device/kiosk', '/automations', '/settings/system']],
    ['locked', ['/consumi', '/security', '/settings/device/appearance']],
  ] as const)('refuses %s the pages of other roles', (role, routes) => {
    for (const route of routes) expect(resolveRouteAccessState(route, accessFor(role)), route).toBe('denied');
  });

  it('keeps Roles and permissions to whoever manages access, apart from the people of the house', () => {
    expect(resolveRouteAccess('/settings/access/roles')).toEqual({ kind: 'capability', capability: 'access.manage' });
    expect(resolveRouteAccess('/settings/access/members')).toEqual({ kind: 'capability', capability: 'people.view' });
    expect(resolveRouteAccessState('/settings/access/roles', accessFor('member'))).toBe('denied');
    expect(resolveRouteAccessState('/settings/access/members', accessFor('member'))).toBe('open');
    expect(resolveRouteAccessState('/settings/access/roles', accessFor('admin'))).toBe('open');
    // The recovery stays reachable on the safe floor: every Home Assistant administrator keeps access.manage.
    expect(resolveRouteAccessState('/settings/access/roles', accessFor('locked', { isAdmin: true }))).toBe('open');
    expect(resolveRouteAccessState('/settings/access/roles', accessFor('locked'))).toBe('denied');
  });

  it('does not open everything to a Home Assistant administrator on the safe floor', () => {
    const lockedAdmin = accessFor('locked', { isAdmin: true });
    expect(resolveRouteAccessState('/consumi', lockedAdmin)).toBe('denied');
    expect(resolveRouteAccessState('/settings/system', lockedAdmin)).toBe('denied');
    expect(resolveRouteAccessState('/home', lockedAdmin)).toBe('open');
    expect(resolveRouteAccessState('/settings/profile', lockedAdmin)).toBe('open');
  });

  it('opens every route to an administrator of a trusted policy', () => {
    for (const rule of ROUTE_ACCESS_RULES) expect(resolveRouteAccessState(rule.path, accessFor('admin')), rule.path).toBe('open');
  });
});
