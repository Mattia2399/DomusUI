import type { MockEntityState } from '../types/ha';
import type {
  SetupCategoryId,
  SetupJourney,
  SetupPhase,
  SetupScanSummary,
} from './setupJourney';

/*
 * What the setup screens decide, as plain functions: which screen to show,
 * how far along the path it is, and how the scan becomes a summary in words.
 */

/** The screens of setup: the steps, and the errors that interrupt them. */
export type SetupScreen =
  | 'intro'
  | 'choice'
  | 'connect'
  | 'redirect'
  | 'scan'
  | 'summary'
  | 'existing'
  | 'compose'
  | 'unreachable'
  | 'mixed'
  | 'denied'
  | 'limited'
  | 'expired';

/** An error of the connection step, found by the screen itself (never stored). */
export type SetupConnectionIssue = 'unreachable' | 'mixed' | 'denied';

const AFTER_SIGN_IN = new Set<SetupPhase>(['scan', 'summary', 'existing', 'compose']);

export function resolveSetupScreen({
  phase,
  issue,
  forceConfiguration = false,
  changingAddress = false,
  summary,
  limitedAccepted = false,
  signedOut = false,
}: {
  phase: SetupPhase;
  issue?: SetupConnectionIssue | null;
  /** The session expired: only the sign-in, with the address that was saved. */
  forceConfiguration?: boolean;
  /** On the expired screen, the person chose to change the address. */
  changingAddress?: boolean;
  summary?: SetupScanSummary;
  limitedAccepted?: boolean;
  /** No session to read the home with (it expired, or this browser lost it): the steps after the sign-in ask for it again. */
  signedOut?: boolean;
}): SetupScreen {
  if (issue) return issue;
  if (forceConfiguration) return changingAddress ? 'connect' : 'expired';
  if (signedOut && AFTER_SIGN_IN.has(phase)) return changingAddress ? 'connect' : 'expired';
  if (phase === 'done') return 'intro';
  if (phase === 'summary' && summary && !summary.canManageHa && !limitedAccepted) return 'limited';
  return phase;
}

/** The "n of 3" of a screen: connect (1), analysis (2), start (3); 0 without the bar. */
export function setupProgressStep(screen: SetupScreen): 0 | 1 | 2 | 3 {
  if (screen === 'connect' || screen === 'redirect' || screen === 'unreachable' || screen === 'mixed' || screen === 'denied') return 1;
  if (screen === 'scan' || screen === 'summary' || screen === 'limited') return 2;
  if (screen === 'existing' || screen === 'compose') return 3;
  return 0;
}

/** Where a half-way setup stopped, as the intro says it: the sign-in, the analysis or the Home. */
export function resumeStage(phase: SetupPhase): 'connect' | 'analysis' | 'start' {
  if (phase === 'connect' || phase === 'redirect') return 'connect';
  if (phase === 'scan' || phase === 'summary') return 'analysis';
  return 'start';
}

/** Whether the page could reach this address at all: an https page cannot load http (but localhost). */
export function isBlockedMixedContent(url: string, pageProtocol: string) {
  if (pageProtocol !== 'https:') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

export const SETUP_CATEGORIES: readonly SetupCategoryId[] = ['lights', 'thermostats', 'covers', 'media', 'plugs', 'security'];

const SECURITY_BINARY_CLASSES = new Set([
  'door',
  'garage_door',
  'gas',
  'lock',
  'moisture',
  'motion',
  'opening',
  'safety',
  'smoke',
  'tamper',
  'window',
]);

function categoryOf(entityId: string, entity?: MockEntityState): SetupCategoryId | null {
  const domain = entityId.split('.')[0];
  const deviceClass = `${entity?.rawAttributes?.device_class ?? ''}`.toLowerCase();
  if (domain === 'light') return 'lights';
  if (domain === 'climate') return 'thermostats';
  if (domain === 'cover') return 'covers';
  if (domain === 'media_player') return 'media';
  if (domain === 'switch' && deviceClass === 'outlet') return 'plugs';
  if (['lock', 'alarm_control_panel', 'camera', 'siren'].includes(domain)) return 'security';
  if (domain === 'binary_sensor' && SECURITY_BINARY_CLASSES.has(deviceClass)) return 'security';
  return null;
}

/** The categories of the summary, from the live states (plugs need their device class). */
export function buildSetupCategoryCounts(entries: Array<[string, MockEntityState]>) {
  return entries.reduce<Partial<Record<SetupCategoryId, number>>>((counts, [entityId, entity]) => {
    const category = categoryOf(entityId, entity);
    if (category) counts[category] = (counts[category] ?? 0) + 1;
    return counts;
  }, {});
}

/**
 * The categories to show, in their order, only those with something in them.
 * A summary stored before the categories existed is read from its domains and
 * groups; plugs cannot be told apart there and are left out.
 */
export function listSetupCategories(summary: SetupScanSummary): Array<{ id: SetupCategoryId; count: number }> {
  const groups = summary.groups ?? {};
  const counts: Partial<Record<SetupCategoryId, number>> = summary.categories ?? {
    lights: summary.domains.light ?? 0,
    thermostats: summary.domains.climate ?? 0,
    covers: summary.domains.cover ?? 0,
    media: summary.domains.media_player ?? 0,
    security: (groups.security ?? 0) + (groups.locks ?? 0) + (groups.cameras ?? 0),
  };
  return SETUP_CATEGORIES.map((id) => ({ id, count: counts[id] ?? 0 })).filter((category) => category.count > 0);
}

function registryList(payload: unknown, key: 'devices' | 'entities'): Array<Record<string, unknown>> {
  const list = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)[key]
      : null;
  return Array.isArray(list)
    ? list.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    : [];
}

export function countRegistryEntries(payload: unknown, key: 'devices' | 'entities') {
  return registryList(payload, key).length;
}

/**
 * Devices in no room: neither the device nor any of its entities has an area.
 * Services (a weather provider, an add-on) and disabled devices are not things
 * to place. Undefined when the registry does not say where devices are.
 */
export function countUnassignedDevices(devicePayload: unknown, entityPayload: unknown): number | undefined {
  const devices = registryList(devicePayload, 'devices');
  if (!devices.some((device) => 'area_id' in device)) return undefined;
  const placedByEntity = new Set(
    registryList(entityPayload, 'entities')
      .filter((entity) => typeof entity.area_id === 'string' && entity.area_id)
      .map((entity) => entity.device_id),
  );
  return devices.filter((device) => {
    if (device.entry_type === 'service' || device.disabled_by) return false;
    if (typeof device.area_id === 'string' && device.area_id) return false;
    return !placedByEntity.has(device.id);
  }).length;
}

/** Whether a journey's summary is complete enough to show (an old one may lack the counts). */
export function hasUsableSummary(summary: SetupJourney['summary']): summary is SetupScanSummary {
  if (!summary) return false;
  if (summary.entities === 0) return true;
  const groups = Object.values(summary.groups ?? {}).reduce((total, count) => total + count, 0);
  const domains = Object.values(summary.domains ?? {}).reduce((total, count) => total + count, 0);
  return groups > 0 || domains > 0;
}
