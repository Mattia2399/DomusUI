import React from 'react';
import {
  Activity,
  BatteryMedium,
  Clock,
  Droplets,
  ExternalLink,
  Gauge,
  ListChecks,
  Play,
  Power,
  SlidersHorizontal,
  Sparkles,
  Thermometer,
  Type,
  Wifi,
  Zap,
} from 'lucide-react';
import { relatedWordsOf, type RelatedWordKey, type RelatedWords } from '../../../../i18n/relatedTranslations';
import type { RelatedControl, RelatedLook } from '../../../../types/relatedControl';
import type { MockEntityState } from '../../../../types/ha';
import type { PanelControl, PanelControlChoice } from '../registry';
import type { RelatedContextValue, RelatedSource } from './relatedContext';
import { RelatedControlView } from './RelatedControlView';
import { RELATED_LOOKS } from './relatedControlRegistry';
import type { RelatedActs } from './relatedLookTypes';
import { formatRelatedNumber, formatRelatedValue, isInternalPath, relatedModelOf, type RelatedModel } from './relatedModel';

/** Their ids do not meet those of the device, and they stand after them unless the user decides. */
const RELATED_ID_PREFIX = 'rel:';
const RELATED_ORDER_AFTER_DEVICE = 1000;

/*
 * A related control as a control of the panel, so that it stands in the same list as those
 * of the device, with the same limits. This piece arrives only for a card that has them.
 */

const ICON = { size: 20, strokeWidth: 2 };
const ICONS: Record<string, React.ComponentType<typeof ICON>> = {
  temperature: Thermometer,
  humidity: Droplets,
  battery: BatteryMedium,
  signal_strength: Wifi,
  connectivity: Wifi,
  sensor: Activity,
  binary_sensor: Activity,
  number: SlidersHorizontal,
  input_number: SlidersHorizontal,
  select: ListChecks,
  input_select: ListChecks,
  switch: Power,
  input_boolean: Power,
  button: Zap,
  input_button: Zap,
  script: Play,
  scene: Sparkles,
  input_datetime: Clock,
  date: Clock,
  time: Clock,
  datetime: Clock,
  timer: Clock,
  text: Type,
  input_text: Type,
  level: Gauge,
  page: ExternalLink,
};

const KIND_OF_LOOK: Partial<Record<RelatedLook, RelatedWordKey>> = {
  segmented: 'kindChoice',
  menu: 'kindChoice',
  list: 'kindChoice',
  radio: 'kindChoice',
  arrows: 'kindChoice',
  tiles: 'kindChoice',
  bar: 'kindNumber',
  'bar-value': 'kindNumber',
  stepper: 'kindNumber',
  'number-input': 'kindNumber',
  'ring-slider': 'kindNumber',
  keypad: 'kindNumber',
  levels: 'kindLevels',
  level: 'kindLevel',
  'progress-vertical': 'kindLevel',
  'toggle-row': 'kindSwitch',
  'icon-toggle': 'kindSwitch',
  'toggle-card': 'kindSwitch',
  'led-row': 'kindSwitch',
  push: 'kindAction',
  hold: 'kindAction',
  running: 'kindAction',
  result: 'kindAction',
  pill: 'kindAction',
  momentary: 'kindHold',
  page: 'kindPage',
  sparkline: 'kindChart',
  'chart-line': 'kindChart',
  'chart-area': 'kindChart',
  'chart-bar': 'kindChart',
  'chart-stats': 'kindChart',
  text: 'kindText',
  textarea: 'kindText',
  password: 'kindText',
  date: 'kindDate',
  time: 'kindDate',
  datetime: 'kindDate',
  countdown: 'kindTimer',
};

/* What a demo has done so far, and the values waiting to be sent: both are shown at once. */
const demoStates = new Map<string, MockEntityState>();
const waitingValues = new Map<string, { value: number; timer: number }>();

/** How long a value that moves waits before it leaves, as it always has for the small controls. */
export const RELATED_SEND_DELAY_MS = 2200;

/** For tests. */
export function forgetRelatedState() {
  demoStates.clear();
  waitingValues.forEach(({ timer }) => window.clearTimeout(timer));
  waitingValues.clear();
}

function actsOf(control: RelatedControl, model: RelatedModel, context: RelatedContextValue, refresh: () => void): RelatedActs {
  const { entityId, domain } = model;
  const { commands, demo } = context;
  const update = (change: Partial<MockEntityState>) => {
    const current = demoStates.get(entityId) ?? context.states[entityId] ?? { state: '' };
    demoStates.set(entityId, { ...current, ...change });
    refresh();
  };
  const call = (service: string, data: Record<string, unknown> = {}, onDomain = domain) => {
    commands.call?.(onDomain, service, { entity_id: entityId, ...data });
  };
  const setOn = (on: boolean) => {
    if (demo) update({ state: on ? 'on' : 'off', toggleOn: on });
    else if (commands.toggle) commands.toggle(entityId, on);
    else call(on ? 'turn_on' : 'turn_off');
  };
  const send = (value: number) => {
    if (demo) update({ state: String(value), numericValue: value });
    else if (commands.setValue) commands.setValue(entityId, value);
    else call('set_value', { value });
  };
  // A slider that sends while it moves and the steppers wait for the hand to stop, as they did as micro widgets.
  const waits = control.look === 'stepper' || ((control.look === 'bar' || control.look === 'bar-value') && control.options?.commit === 'live');
  return {
    setOn,
    press: () => {
      if (demo) {
        refresh();
      } else if (domain === 'button' || domain === 'input_button') {
        if (commands.toggle) commands.toggle(entityId, true);
        else call('press');
      } else if (domain === 'scene' || domain === 'script') {
        call('turn_on');
      } else {
        setOn(true);
      }
    },
    hold: setOn,
    setNumber: (value) => {
      if (!waits) {
        send(value);
        return;
      }
      const before = waitingValues.get(entityId);
      if (before) window.clearTimeout(before.timer);
      waitingValues.set(entityId, {
        value,
        timer: window.setTimeout(() => {
          waitingValues.delete(entityId);
          send(value);
          refresh();
        }, RELATED_SEND_DELAY_MS),
      });
      refresh();
    },
    setOption: (option) => {
      if (demo) update({ state: option });
      else call('select_option', { option });
    },
    setText: (text) => {
      if (demo) update({ state: text });
      else call('set_value', { value: text });
    },
    setDateTime: (date, time) => {
      const fields = { ...(date ? { date } : {}), ...(time ? { time } : {}) };
      if (demo) update({ state: [date, time].filter(Boolean).join(' ') });
      else if (domain === 'input_datetime') call('set_datetime', fields);
      else call('set_value', fields);
    },
    go: () => {
      // Whatever was saved as a path, only one inside the app is followed.
      if (control.look === 'page' && isInternalPath(control.options.path)) commands.navigate?.(control.options.path.trim());
    },
    toggleTimer: () => {
      if (demo) update({ state: model.state === 'active' ? 'paused' : 'active' });
      else call(model.state === 'active' ? 'pause' : 'start');
    },
  };
}

/** What a row says on the right. A covered text never reaches it. */
function valueOf(look: RelatedLook, model: RelatedModel, locale: string, words: RelatedWords) {
  if (look === 'page' || look === 'password') return undefined;
  if (!model.available) return words('unavailable');
  if (look === 'levels' && model.number !== null && model.max !== undefined) {
    return words('ofLevels', { value: formatRelatedNumber(model.number, locale), max: formatRelatedNumber(model.max, locale) });
  }
  if (RELATED_LOOKS[look].action && ['push', 'running', 'result', 'pill'].includes(look)) return undefined;
  if (['toggle-row', 'icon-toggle', 'toggle-card', 'led-row', 'momentary'].includes(look)) return model.on ? words('on') : words('off');
  if (model.number !== null) return formatRelatedValue(model, locale);
  if (model.state === 'on') return words('on');
  if (model.state === 'off') return words('off');
  return model.state;
}

const iconOf = (control: RelatedControl, model: RelatedModel) => {
  const Icon = (control.icon && ICONS[control.icon]) || (control.look === 'level' && ICONS.level) || (control.look === 'page' && ICONS.page) || (model.deviceClass && ICONS[model.deviceClass]) || ICONS[model.domain] || Activity;
  return <Icon {...ICON} />;
};

/** The demo has no recorder: a small invented curve around its value, only there. */
const demoHistory = (value: number) => Array.from({ length: 16 }, (_, index) => Number((value * (0.92 + 0.08 * Math.sin(index / 2))).toFixed(2)));

function panelControlOf(control: RelatedControl, context: RelatedContextValue, locale: string, words: RelatedWords, refresh: () => void): PanelControl {
  const entity = demoStates.get(control.entityId) ?? context.states[control.entityId];
  const waiting = waitingValues.get(control.entityId);
  const shown = waiting && entity ? { ...entity, state: String(waiting.value), numericValue: waiting.value } : entity;
  const model = relatedModelOf(control.entityId, shown, control.name);
  const acts = actsOf(control, model, context, refresh);
  const history = context.history?.[control.entityId] ?? (context.demo && model.number !== null ? demoHistory(model.number) : []);
  const info = RELATED_LOOKS[control.look];
  const standsAlone = control.look === 'page';
  const unavailable = !model.available && !standsAlone;
  const kind = KIND_OF_LOOK[control.look] ?? 'kindSensor';
  const view = (form: 'group' | 'hero') => <RelatedControlView control={control} model={model} form={form} acts={acts} history={history} locale={locale} words={words} />;
  const common = {
    id: `${RELATED_ID_PREFIX}${control.id}`,
    icon: iconOf(control, model),
    label: model.name,
    value: valueOf(control.look, model, locale, words),
    kindName: words(kind),
    disabled: unavailable,
    lit: model.available && model.on && kind === 'kindSwitch',
  };
  if (!info.action) return { ...common, looks: ['rows'], big: () => view('hero'), group: view('group') };
  const switches = kind === 'kindSwitch';
  const plainButton = control.look === 'push' || control.look === 'page';
  return {
    ...common,
    on: switches ? model.on : undefined,
    onPress: switches ? () => acts.setOn(!model.on) : standsAlone ? acts.go : acts.press,
    actionLabel: plainButton ? words(standsAlone ? 'open' : 'start') : undefined,
    // A look with a form of its own keeps it in its group; the others are a switch or a button.
    group: unavailable || (!plainButton && control.look !== 'toggle-row' && control.look !== 'icon-toggle') ? view('group') : undefined,
  };
}

export function relatedPanelControls(source: RelatedSource, context: RelatedContextValue, locale: string, refresh: () => void) {
  const words = relatedWordsOf(locale);
  const listed = source.relatedControls ?? [];
  const choices: Record<string, PanelControlChoice> = {};
  const controls = listed
    .filter((control) => control.place !== 'hidden')
    .map((control) => {
      choices[`${RELATED_ID_PREFIX}${control.id}`] = { place: control.place, order: RELATED_ORDER_AFTER_DEVICE + control.order };
      return panelControlOf(control, context, locale, words, refresh);
    });
  return { controls, choices };
}
