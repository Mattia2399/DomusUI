import type { RelatedLook, RelatedPlace } from '../../../../types/relatedControl';

/*
 * What each entity can be shown as, and what each look is. Nothing here draws:
 * the library knows nothing of Home Assistant, and this is one half of what links them.
 */

export type RelatedFamily = 'base' | 'values' | 'actions' | 'indicators' | 'charts' | 'text' | 'advanced';

export type RelatedLookInfo = {
  /** Which piece of code draws it. `base` is what the panels already load. */
  family: RelatedFamily;
  /** It acts at once from its shortcut, and has no large version. Otherwise it opens at full size. */
  action: boolean;
  /** The height it takes in a group: its placeholder keeps it, so nothing jumps. */
  groupHeight: number;
};

const look = (family: RelatedFamily, groupHeight: number, action = false): RelatedLookInfo => ({ family, groupHeight, action });

export const RELATED_LOOKS: Record<RelatedLook, RelatedLookInfo> = {
  segmented: look('base', 44),
  list: look('base', 208),
  radio: look('base', 208),
  tiles: look('base', 60),
  bar: look('base', 46),
  'bar-value': look('base', 46),
  stepper: look('base', 52),
  'toggle-row': look('base', 0, true),
  'icon-toggle': look('base', 0, true),
  push: look('base', 48, true),
  page: look('base', 52, true),
  menu: look('values', 44),
  arrows: look('values', 46),
  'number-input': look('values', 72),
  levels: look('values', 46),
  'ring-slider': look('values', 200),
  'toggle-card': look('values', 82, true),
  'led-row': look('values', 52, true),
  // A gesture cannot be a quick touch of a shortcut: they open at full size to be held.
  momentary: look('actions', 48),
  hold: look('actions', 48),
  running: look('actions', 48, true),
  result: look('actions', 48, true),
  pill: look('actions', 40, true),
  value: look('indicators', 72),
  'value-pill': look('indicators', 32),
  badge: look('indicators', 28),
  led: look('indicators', 44),
  glow: look('indicators', 64),
  gauge: look('indicators', 160),
  radial: look('indicators', 160),
  'mini-ring': look('indicators', 44),
  progress: look('indicators', 34),
  'progress-vertical': look('indicators', 190),
  battery: look('indicators', 40),
  temperature: look('indicators', 96),
  humidity: look('indicators', 76),
  level: look('indicators', 90),
  connection: look('indicators', 44),
  trend: look('indicators', 24),
  'icon-status': look('indicators', 44),
  sparkline: look('charts', 32),
  'chart-line': look('charts', 120),
  'chart-area': look('charts', 120),
  'chart-bar': look('charts', 120),
  'chart-stats': look('charts', 60),
  text: look('text', 66),
  textarea: look('text', 92),
  keypad: look('text', 260),
  date: look('text', 300),
  time: look('text', 122),
  datetime: look('text', 46),
  password: look('text', 66),
  countdown: look('advanced', 160),
};

/** What the registry needs to know of an entity. */
export type RelatedEntityFacts = {
  options?: readonly unknown[];
  min?: number;
  max?: number;
  step?: number;
  deviceClass?: string;
  unit?: string;
  numeric?: boolean;
  hasDate?: boolean;
  hasTime?: boolean;
  password?: boolean;
};

export type RelatedChoice = { looks: readonly RelatedLook[]; recommended: RelatedLook };

/** A new related control waits in Altro until the user decides otherwise. */
export const RELATED_DEFAULT_PLACE: RelatedPlace = 'more';

/** Up to this many options are buttons side by side. */
const MOST_SIDE_BY_SIDE = 4;
/** Up to this many whole values are levels. */
const MOST_LEVELS = 7;
/** Up to this many steps − and + make sense. */
const MOST_STEPS_FOR_BUTTONS = 24;

const choice = (first: RelatedLook, ...others: RelatedLook[]): RelatedChoice => ({ recommended: first, looks: [first, ...others.filter((entry) => entry !== first)] });

function selectChoice({ options = [] }: RelatedEntityFacts) {
  return options.length <= MOST_SIDE_BY_SIDE ? choice('segmented', 'menu', 'list', 'radio', 'arrows', 'tiles') : choice('menu', 'list', 'radio', 'arrows', 'tiles');
}

function numberChoice({ min, max, step = 1 }: RelatedEntityFacts) {
  const others: RelatedLook[] = ['bar-value', 'number-input', 'ring-slider', 'keypad'];
  if (min === undefined || max === undefined || !(step > 0) || !(max > min)) return choice('bar', ...others);
  const steps = (max - min) / step;
  const whole = Number.isInteger(step) && Number.isInteger(min) && Math.abs(steps - Math.round(steps)) < 1e-6;
  if (whole && steps + 1 <= MOST_LEVELS) return choice('levels', 'stepper', 'bar', 'arrows', ...others);
  if (steps <= MOST_STEPS_FOR_BUTTONS) return choice('stepper', 'bar', ...others);
  return choice('bar', 'stepper', ...others);
}

function sensorChoice({ deviceClass, unit, numeric = true }: RelatedEntityFacts) {
  if (!numeric) return choice('value', 'badge', 'glow');
  const charts: RelatedLook[] = ['sparkline', 'chart-line', 'chart-area', 'chart-bar', 'chart-stats', 'trend', 'value-pill'];
  const percent = unit === '%';
  const shares: RelatedLook[] = percent ? ['gauge', 'mini-ring', 'progress', 'progress-vertical'] : [];
  if (deviceClass === 'temperature') return choice('temperature', 'value', 'radial', ...charts);
  if (deviceClass === 'humidity') return choice('humidity', 'value', ...shares, ...charts);
  if (deviceClass === 'battery') return choice('battery', 'value', ...shares, ...charts);
  if (deviceClass === 'signal_strength') return choice('connection', 'value', ...charts);
  if (percent && !deviceClass) return choice('level', 'value', ...shares, ...charts);
  return choice('value', 'radial', ...shares, ...charts);
}

function datetimeChoice({ hasDate, hasTime }: RelatedEntityFacts) {
  if (hasDate && hasTime) return choice('datetime');
  if (hasDate) return choice('date');
  return choice('time');
}

/** The looks an entity can take, the recommended one first. */
export function relatedChoiceOf(entityId: string, facts: RelatedEntityFacts = {}): RelatedChoice {
  const domain = entityId.split('.')[0];
  switch (domain) {
    case 'select':
    case 'input_select':
      return selectChoice(facts);
    case 'number':
    case 'input_number':
      return numberChoice(facts);
    case 'switch':
    case 'input_boolean':
      return choice('toggle-row', 'icon-toggle', 'toggle-card', 'led-row', 'momentary');
    case 'sensor':
      return sensorChoice(facts);
    case 'binary_sensor':
      return choice('icon-status', 'led', 'badge', 'glow');
    case 'button':
    case 'input_button':
      return choice('push', 'hold', 'result');
    case 'script':
      return choice('running', 'push', 'hold', 'result');
    case 'scene':
      return choice('pill', 'push', 'result');
    case 'input_datetime':
      return datetimeChoice(facts);
    case 'date':
      return choice('date');
    case 'time':
      return choice('time');
    case 'datetime':
      return choice('datetime');
    case 'timer':
      return choice('countdown');
    case 'text':
    case 'input_text':
      return facts.password ? choice('password', 'text') : choice('text', 'textarea');
    default:
      return choice('value', 'value-pill', 'badge');
  }
}
