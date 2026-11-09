/**
 * What each Domus route needs (docs/access-control-frontend.md#route). The one
 * table the route guard, the navigation and the Settings list all read: a
 * route is either protected by one capability or exempt for a stated reason.
 *
 * Interface only: opening an address the account may not use shows "Not
 * available", and the backend and Home Assistant still decide every request.
 */

import type { AccessCapability, AccessSnapshot } from '../security/accessControl';
import { DEVICE_POWER_ROUTE, PROFILE_ROUTE } from './settingsRoutes';

export type RouteAccess =
  | Readonly<{ kind: 'capability'; capability: AccessCapability }>
  | Readonly<{ kind: 'exempt'; reason: string }>;

type RouteRule = Readonly<{
  /** A path, matched exactly and, with `subpaths`, with everything below it. */
  path: string;
  subpaths?: true;
  access: RouteAccess;
}>;

const needs = (capability: AccessCapability): RouteAccess => ({ kind: 'capability', capability });

const SETTINGS_LIST: RouteAccess = {
  kind: 'exempt',
  reason: 'A list of Settings: it shows only the entries the account may open, and the account card is always there.',
};

/** Every route of the application; the most specific rule wins. */
export const ROUTE_ACCESS_RULES: readonly RouteRule[] = [
  { path: '/setup', subpaths: true, access: { kind: 'exempt', reason: 'Onboarding and reconnection run before an account is known.' } },

  { path: '/', access: needs('dashboard.view') },
  { path: '/home', subpaths: true, access: needs('dashboard.view') },
  { path: '/rooms', subpaths: true, access: needs('rooms.view') },
  { path: '/security', subpaths: true, access: needs('security.view') },
  { path: '/automations', subpaths: true, access: needs('automations.view') },
  // Energy, and the water, gas and report previews that live beside it.
  { path: '/consumi', subpaths: true, access: needs('energy.view') },

  // The gallery itself and the two preview apps hold no house data of their own.
  { path: '/appgallery', access: needs('dashboard.view') },
  { path: '/appgallery/technical', subpaths: true, access: needs('dashboard.view') },
  { path: '/appgallery/pool', subpaths: true, access: needs('dashboard.view') },
  { path: '/appgallery/irrigation', subpaths: true, access: needs('irrigation.view') },
  { path: '/appgallery/irrigation/settings', subpaths: true, access: needs('irrigation.manage') },
  { path: '/appgallery/irrigation/zones/manage', subpaths: true, access: needs('irrigation.manage') },

  { path: '/settings', access: SETTINGS_LIST },
  { path: '/settings/home', access: SETTINGS_LIST },
  { path: '/settings/device', access: SETTINGS_LIST },
  { path: PROFILE_ROUTE, subpaths: true, access: needs('profile.manage') },
  { path: '/settings/dashboard', access: needs('dashboard.edit') },
  { path: '/settings/climate', access: needs('climate.view') },
  { path: '/settings/floors', subpaths: true, access: needs('house.manage') },
  { path: '/settings/access', subpaths: true, access: needs('people.view') },
  // Changing roles and personal grants is access management, not seeing the people of the house.
  { path: '/settings/access/roles', subpaths: true, access: needs('access.manage') },
  { path: '/settings/safety', access: needs('security.manage') },
  { path: '/settings/security', access: needs('security.manage') },
  { path: '/settings/home/waste-collection', access: needs('waste.manage') },
  { path: '/settings/connections', access: needs('system.manage') },
  { path: '/settings/devices', subpaths: true, access: needs('system.manage') },
  { path: '/settings/entities', subpaths: true, access: needs('system.manage') },
  { path: '/settings/system', subpaths: true, access: needs('system.view') },
  { path: '/settings/data', access: needs('backup.export') },
  // The layout versions belong to the dashboard, as today.
  { path: '/settings/data/history', access: needs('dashboard.edit') },
  { path: '/settings/device/appearance', access: needs('device.manage') },
  { path: '/settings/device/language', access: needs('device.manage') },
  { path: '/settings/device/screensaver', access: needs('device.manage') },
  { path: '/settings/device/kiosk', access: needs('device.manage') },
  { path: DEVICE_POWER_ROUTE, access: needs('device_power.manage') },
  // Today an administrator's page; whether it becomes a device preference is still open.
  { path: '/settings/attention', access: needs('dashboard.edit') },
  { path: '/settings/advanced', access: needs('developer.use') },
];

/** The path of an address, lower case, without query, hash or trailing slash. */
export function normalizeAccessPath(route: string): string {
  const path = route.split(/[?#]/, 1)[0].trim().toLowerCase().replace(/\/+$/, '');
  return path || '/';
}

/**
 * The rule of an address. An address no rule names falls to the page that
 * shows it: an unknown Settings page shows the Settings list, any other
 * unknown address the Home.
 */
export function resolveRouteRule(route: string): RouteRule {
  const path = normalizeAccessPath(route);
  let best: RouteRule | null = null;
  for (const rule of ROUTE_ACCESS_RULES) {
    const matches = path === rule.path || (rule.subpaths && path.startsWith(`${rule.path}/`));
    if (matches && (!best || rule.path.length > best.path.length)) best = rule;
  }
  if (best) return best;
  return path.startsWith('/settings/')
    ? ROUTE_ACCESS_RULES.find((rule) => rule.path === '/settings')!
    : ROUTE_ACCESS_RULES.find((rule) => rule.path === '/')!;
}

export function resolveRouteAccess(route: string): RouteAccess {
  return resolveRouteRule(route).access;
}

/** Whether the account may open this address, with `can` from Access Control. */
export function canOpenRoute(route: string, can: (capability: AccessCapability) => boolean): boolean {
  const access = resolveRouteAccess(route);
  return access.kind === 'exempt' || can(access.capability);
}

/**
 * What a route shows: its page (`open`), a wait while the account's profile
 * is asked (`checking`), "not available" (`denied`), why permissions are
 * missing (`error`, `unavailable`), or that Home Assistant is not connected
 * (`offline`: without a connection there is no account, so nothing is
 * granted). Re-evaluated on every profile, so a capability that goes away
 * replaces an open page at once.
 */
export type RouteAccessState = 'open' | 'checking' | 'offline' | 'denied' | 'error' | 'unavailable';

export function resolveRouteAccessState(
  route: string,
  access: Pick<AccessSnapshot, 'status' | 'can'>,
  connection: 'online' | 'offline' = 'online',
): RouteAccessState {
  if (canOpenRoute(route, access.can)) return 'open';
  if (access.status === 'loading') return connection === 'offline' ? 'offline' : 'checking';
  if (access.status === 'error' || access.status === 'unavailable') return access.status;
  return 'denied';
}

/** The entries of a navigation the account may open, in their order; nothing while loading. */
export function filterNavigation<T extends { path: string }>(
  entries: readonly T[],
  can: (capability: AccessCapability) => boolean,
): T[] {
  return entries.filter((entry) => canOpenRoute(entry.path, can));
}
