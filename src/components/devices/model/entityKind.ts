import type { WidgetKind } from '../../../types/dashboardModels';

/*
 * The one rule from an entity to its card: the domain says the kind. Some kinds
 * have a card today; the others are drawn and come in later steps. A kind is a
 * card, not a device: `model/device.ts` has its own DeviceKind, the variants
 * inside the device card.
 */

export type DeviceKind =
  // Cards the project has.
  | 'light' | 'switch' | 'fan' | 'humidifier' | 'climate' | 'cover' | 'lock'
  | 'alarm' | 'camera' | 'media' | 'vacuum' | 'sensor' | 'binary' | 'calendar' | 'members'
  // New cards, drawn and still to build.
  | 'water_heater' | 'valve' | 'lawn_mower' | 'siren' | 'event' | 'alert'
  | 'button' | 'script' | 'automation' | 'remote' | 'select' | 'number' | 'text'
  | 'datetime' | 'counter' | 'timer' | 'schedule' | 'update' | 'todo' | 'image'
  | 'assist' | 'location'
  // No card.
  | 'none';

/*
 * A domain missing here has no card: scene and weather have their own
 * sections; sun, notify, tts, stt, wake_word, conversation, ai_task,
 * image_processing, infrared, radio_frequency and air_quality have none.
 */
const KIND_BY_DOMAIN: Readonly<Record<string, DeviceKind>> = {
  light: 'light',
  switch: 'switch',
  input_boolean: 'switch',
  fan: 'fan',
  humidifier: 'humidifier',
  climate: 'climate',
  cover: 'cover',
  lock: 'lock',
  alarm_control_panel: 'alarm',
  camera: 'camera',
  media_player: 'media',
  vacuum: 'vacuum',
  sensor: 'sensor',
  binary_sensor: 'binary',
  calendar: 'calendar',
  person: 'members',
  water_heater: 'water_heater',
  valve: 'valve',
  lawn_mower: 'lawn_mower',
  siren: 'siren',
  event: 'event',
  alert: 'alert',
  button: 'button',
  input_button: 'button',
  script: 'script',
  automation: 'automation',
  remote: 'remote',
  select: 'select',
  input_select: 'select',
  number: 'number',
  input_number: 'number',
  text: 'text',
  input_text: 'text',
  date: 'datetime',
  time: 'datetime',
  datetime: 'datetime',
  input_datetime: 'datetime',
  counter: 'counter',
  timer: 'timer',
  schedule: 'schedule',
  update: 'update',
  todo: 'todo',
  image: 'image',
  assist_satellite: 'assist',
  device_tracker: 'location',
  zone: 'location',
  geo_location: 'location',
};

const IMPLEMENTED_KINDS: ReadonlySet<DeviceKind> = new Set<DeviceKind>([
  'light', 'switch', 'fan', 'humidifier', 'climate', 'cover', 'lock',
  'alarm', 'camera', 'media', 'vacuum', 'sensor', 'binary', 'calendar', 'members',
]);

const domainOf = (entityId: string) => entityId.split('.')[0].trim().toLowerCase();

const kindOfDomain = (domain: string): DeviceKind =>
  Object.prototype.hasOwnProperty.call(KIND_BY_DOMAIN, domain) ? KIND_BY_DOMAIN[domain] : 'none';

/*
 * A group takes the kind of its members when they share a domain: its
 * `entity_id` attribute lists them, so this needs nothing more than the group.
 * A group of groups, or one without its list, has no card.
 */
function kindOfGroup(attributes: Record<string, unknown> | undefined): DeviceKind {
  const members = attributes?.entity_id;
  if (!Array.isArray(members) || members.length === 0) return 'none';
  if (!members.every((member) => typeof member === 'string')) return 'none';
  const domains = new Set((members as string[]).map(domainOf));
  if (domains.size !== 1) return 'none';
  return kindOfDomain([...domains][0]);
}

export function resolveDeviceKind(entityId: string, attributes?: Record<string, unknown>): DeviceKind {
  const domain = domainOf(entityId);
  return domain === 'group' ? kindOfGroup(attributes) : kindOfDomain(domain);
}

/** True only for the kinds that have a card today. */
export function isKindImplemented(kind: DeviceKind) {
  return IMPLEMENTED_KINDS.has(kind);
}

/** The card kind of the Home for a kind that has one: a yes/no sensor is a sensor card. */
export function toWidgetKind(kind: DeviceKind): WidgetKind | null {
  if (kind === 'binary') return 'sensor';
  return isKindImplemented(kind) ? (kind as WidgetKind) : null;
}
