/**
 * Which capability a command on a Home Assistant entity needs in the Domus
 * interface (docs/access-control-capabilities.md#capability-matrix).
 *
 * Interface only: these commands go from the browser to Home Assistant, which
 * checks its own permissions and codes. Domus hides what the account may not
 * use; it cannot stop the same command sent to Home Assistant directly.
 */

import type { AccessCapability } from './accessControl';

/** Motorized entrances: a cover of these classes opens a way into the house. */
const PHYSICAL_ACCESS_COVER_CLASSES: ReadonlySet<string> = new Set(['gate', 'garage', 'door']);

export function isPhysicalAccessCover(deviceClass: unknown): boolean {
  return typeof deviceClass === 'string' && PHYSICAL_ACCESS_COVER_CLASSES.has(deviceClass.trim().toLowerCase());
}

/**
 * The capability for controlling an entity, or null when it needs nothing
 * beyond what every role that sees it already has (`devices.control` and the
 * like are not narrowed here).
 */
export function controlCapabilityForEntity(entityId: unknown, deviceClass?: unknown): AccessCapability | null {
  if (typeof entityId !== 'string') return null;
  const domain = entityId.split('.', 1)[0];
  if (domain === 'lock') return 'access.control';
  if (domain === 'alarm_control_panel') return 'security.control';
  if (domain === 'cover' && isPhysicalAccessCover(deviceClass)) return 'access.control';
  return null;
}

function deviceClassOf(state: unknown): unknown {
  if (!state || typeof state !== 'object') return undefined;
  const attributes = (state as { attributes?: unknown }).attributes;
  return attributes && typeof attributes === 'object' ? (attributes as Record<string, unknown>).device_class : undefined;
}

function targetEntityIds(serviceData: Record<string, unknown>): string[] {
  const value = serviceData.entity_id;
  if (typeof value === 'string') return value.split(',').map((id) => id.trim()).filter(Boolean);
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}

/**
 * Whether the interface may send this service: every entity it targets must be
 * one the account may control. A lock or alarm service with no entity is refused.
 */
export function entityServiceAllowed(
  domain: string,
  serviceData: Record<string, unknown>,
  states: Readonly<Record<string, unknown>>,
  can: (capability: AccessCapability) => boolean,
): boolean {
  const normalizedDomain = domain.trim().toLowerCase();
  const entityIds = targetEntityIds(serviceData);
  if (entityIds.length === 0) {
    if (normalizedDomain === 'lock') return can('access.control');
    if (normalizedDomain === 'alarm_control_panel') return can('security.control');
    return true;
  }
  return entityIds.every((entityId) => {
    const capability = controlCapabilityForEntity(entityId, deviceClassOf(states[entityId]));
    return capability === null || can(capability);
  });
}
