import type { MockEntityState } from '../../../../types/ha';
import type { RelatedEntityFacts } from './relatedControlRegistry';

/* An entity of Home Assistant read into plain values: what the looks draw, so that none of them has to know it. */

const ACTIVE_STATES = ['on', 'open', 'opening', 'playing', 'active', 'home', 'heat', 'cool', 'cleaning', 'locked'];
/** They have no state of their own: "unknown" is their normal condition. */
const STATELESS = new Set(['button', 'input_button', 'scene', 'script']);

const numberOf = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

export type RelatedModel = Omit<RelatedEntityFacts, 'options'> & {
  entityId: string;
  domain: string;
  name: string;
  /** The entity is there and answers. */
  available: boolean;
  state: string;
  on: boolean;
  number: number | null;
  /** How full it is, from 0 to 100, when that can be said. */
  percent: number | null;
  options: readonly string[];
  attributes: Readonly<Record<string, unknown>>;
};

/** The same reading a small ring has always made of an entity. */
function percentOf(entity: MockEntityState | undefined, number: number | null, on: boolean) {
  const clamp = (value: number) => Math.max(0, Math.min(100, value));
  if (number !== null) {
    if (entity?.unit?.trim() === '%') return clamp(number);
    if (number >= 0 && number <= 1) return clamp(number * 100);
    if (number >= 0 && number <= 100) return clamp(number);
  }
  const progress = numberOf(entity?.progress);
  if (progress !== undefined) return clamp(progress >= 0 && progress <= 1 ? progress * 100 : progress);
  const brightness = numberOf(entity?.brightness);
  if (brightness !== undefined) return clamp((brightness / 255) * 100);
  return on ? 100 : 0;
}

export function relatedModelOf(entityId: string, entity: MockEntityState | undefined, name?: string): RelatedModel {
  const attributes = (entity?.rawAttributes ?? {}) as Record<string, unknown>;
  const domain = entityId.split('.')[0] ?? '';
  const state = String(entity?.state ?? '').trim();
  const lower = state.toLowerCase();
  const number = numberOf(entity?.numericValue) ?? numberOf(state) ?? null;
  const on = typeof entity?.toggleOn === 'boolean' ? entity.toggleOn : ACTIVE_STATES.includes(String(entity?.stateLabel ?? state).trim().toLowerCase());
  const answers = lower !== 'unavailable' && (lower !== 'unknown' || STATELESS.has(domain));
  const unit = typeof attributes.unit_of_measurement === 'string' ? attributes.unit_of_measurement : entity?.unit;
  return {
    entityId,
    domain,
    name: name?.trim() || (typeof attributes.friendly_name === 'string' ? attributes.friendly_name : '') || entityId,
    available: Boolean(entity) && state !== '' && answers,
    state,
    on,
    number,
    percent: percentOf(entity, number, on),
    options: Array.isArray(attributes.options) ? attributes.options.map(String) : [],
    attributes,
    min: numberOf(attributes.min),
    max: numberOf(attributes.max),
    step: numberOf(attributes.step),
    deviceClass: typeof attributes.device_class === 'string' ? attributes.device_class : undefined,
    unit,
    numeric: number !== null,
    hasDate: attributes.has_date === true,
    hasTime: attributes.has_time === true,
    password: attributes.mode === 'password',
  };
}

/** Only a path inside the app: no address of another site, and nothing a browser would read as one. */
export function isInternalPath(path: string | undefined): path is string {
  if (typeof path !== 'string') return false;
  const trimmed = path.trim();
  return /^\/(?![/\\])/.test(trimmed) && !/[\\\s]/.test(trimmed) && !/^\/[^/]*:/.test(trimmed);
}

export function formatRelatedNumber(value: number, locale: string, digits?: number) {
  return value.toLocaleString(locale, digits === undefined ? { maximumFractionDigits: 2 } : { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** The value of a reading with its unit: "56,4 °C". */
export function formatRelatedValue({ number, unit, state }: Pick<RelatedModel, 'number' | 'unit' | 'state'>, locale: string) {
  if (number === null) return state;
  const shown = formatRelatedNumber(number, locale);
  if (!unit) return shown;
  return unit === '%' || unit.startsWith('°') ? `${shown}${unit === '°C' || unit === '°F' ? '°' : unit}` : `${shown} ${unit}`;
}
