import { describe, expect, it } from 'vitest';
import { RELATED_DEFAULT_PLACE, RELATED_LOOKS, relatedChoiceOf } from './relatedControlRegistry';

const options = (count: number) => Array.from({ length: count }, (_, index) => `o${index}`);

describe('the looks of each entity', () => {
  it('a select: up to 4 options side by side, then a menu', () => {
    for (const domain of ['select', 'input_select']) {
      expect(relatedChoiceOf(`${domain}.a`, { options: options(4) }).recommended).toBe('segmented');
      const five = relatedChoiceOf(`${domain}.a`, { options: options(5) });
      expect(five.recommended).toBe('menu');
      expect(five.looks).not.toContain('segmented');
      expect(five.looks).toEqual(expect.arrayContaining(['list', 'arrows', 'tiles']));
    }
  });

  it('a number: few whole values are levels', () => {
    expect(relatedChoiceOf('number.a', { min: 1, max: 5, step: 1 }).recommended).toBe('levels');
    expect(relatedChoiceOf('input_number.a', { min: 1, max: 7, step: 1 }).recommended).toBe('levels');
    expect(relatedChoiceOf('number.a', { min: 1, max: 8, step: 1 }).recommended).toBe('stepper');
  });

  it('a number with a decimal step is not levels, however few the values', () => {
    const decimal = relatedChoiceOf('number.a', { min: 1, max: 3, step: 0.5 });
    expect(decimal.recommended).toBe('stepper');
    expect(decimal.looks).not.toContain('levels');
  });

  it('a number: a narrow range is − and +, a wide one a bar', () => {
    expect(relatedChoiceOf('number.a', { min: 50, max: 74, step: 1 }).recommended).toBe('stepper');
    expect(relatedChoiceOf('number.a', { min: 50, max: 75, step: 0.5 }).recommended).toBe('bar');
    expect(relatedChoiceOf('number.a', { min: 0, max: 100, step: 1 }).recommended).toBe('bar');
    expect(relatedChoiceOf('number.a', { min: 0, max: 100, step: 1 }).looks).toEqual(expect.arrayContaining(['bar-value', 'number-input', 'ring-slider']));
  });

  it('a number that does not say its limits is a bar', () => {
    expect(relatedChoiceOf('number.a').recommended).toBe('bar');
    expect(relatedChoiceOf('number.a', { min: 5, max: 5 }).recommended).toBe('bar');
    expect(relatedChoiceOf('number.a', { min: 0, max: 5, step: 0 }).recommended).toBe('bar');
  });

  it('a yes or no is a row with a switch', () => {
    for (const domain of ['switch', 'input_boolean']) {
      const choice = relatedChoiceOf(`${domain}.a`);
      expect(choice.recommended).toBe('toggle-row');
      expect(choice.looks).toEqual(expect.arrayContaining(['icon-toggle', 'toggle-card', 'led-row']));
    }
  });

  it('a sensor goes by what it measures', () => {
    expect(relatedChoiceOf('sensor.a', { deviceClass: 'temperature', unit: '°C' }).recommended).toBe('temperature');
    expect(relatedChoiceOf('sensor.a', { deviceClass: 'humidity', unit: '%' }).recommended).toBe('humidity');
    expect(relatedChoiceOf('sensor.a', { unit: '%' }).recommended).toBe('level');
    expect(relatedChoiceOf('sensor.a', { deviceClass: 'signal_strength', unit: 'dBm' }).recommended).toBe('connection');
    expect(relatedChoiceOf('sensor.a', { deviceClass: 'battery', unit: '%' }).recommended).toBe('battery');
    expect(relatedChoiceOf('sensor.a', { deviceClass: 'power', unit: 'W' }).recommended).toBe('value');
    expect(relatedChoiceOf('sensor.a', { numeric: false }).recommended).toBe('value');
    expect(relatedChoiceOf('sensor.a', { numeric: false }).looks).not.toContain('chart-line');
  });

  it('a yes or no to read is an icon of state', () => {
    const choice = relatedChoiceOf('binary_sensor.a');
    expect(choice.recommended).toBe('icon-status');
    expect(choice.looks).toEqual(expect.arrayContaining(['led', 'badge']));
  });

  it('actions: a button, a script with its progress, a scene as a pill', () => {
    expect(relatedChoiceOf('button.a').recommended).toBe('push');
    expect(relatedChoiceOf('input_button.a').recommended).toBe('push');
    expect(relatedChoiceOf('script.a').recommended).toBe('running');
    expect(relatedChoiceOf('scene.a').recommended).toBe('pill');
  });

  it('dates and times', () => {
    expect(relatedChoiceOf('input_datetime.a').recommended).toBe('time');
    expect(relatedChoiceOf('input_datetime.a', { hasDate: true, hasTime: true }).recommended).toBe('datetime');
    expect(relatedChoiceOf('input_datetime.a', { hasDate: true }).recommended).toBe('date');
    expect(relatedChoiceOf('timer.a').recommended).toBe('countdown');
    expect(relatedChoiceOf('date.a').recommended).toBe('date');
    expect(relatedChoiceOf('time.a').recommended).toBe('time');
    expect(relatedChoiceOf('datetime.a').recommended).toBe('datetime');
  });

  it('text, covered when the entity says so', () => {
    expect(relatedChoiceOf('text.a').recommended).toBe('text');
    expect(relatedChoiceOf('input_text.a', { password: true }).recommended).toBe('password');
  });

  it('what it does not know is a plain value', () => {
    expect(relatedChoiceOf('weird.a').recommended).toBe('value');
  });

  it('the recommended one is always the first, and none is repeated', () => {
    for (const [entity, facts] of [['select.a', { options: options(3) }], ['number.a', { min: 1, max: 5, step: 1 }], ['sensor.a', { unit: '%' }], ['script.a', {}]] as const) {
      const { looks, recommended } = relatedChoiceOf(entity, facts);
      expect(looks[0]).toBe(recommended);
      expect(new Set(looks).size).toBe(looks.length);
    }
  });

  it('a new one waits in Altro', () => {
    expect(RELATED_DEFAULT_PLACE).toBe('more');
  });
});

describe('what each look is', () => {
  const ACTIONS = ['toggle-row', 'icon-toggle', 'toggle-card', 'led-row', 'push', 'page', 'running', 'result', 'pill'];

  it('these act at once, all the others have a large version', () => {
    const actions = Object.entries(RELATED_LOOKS).filter(([, info]) => info.action).map(([look]) => look);
    expect(actions.sort()).toEqual([...ACTIONS].sort());
  });

  it('a gesture opens at full size, so that it can be held', () => {
    expect(RELATED_LOOKS.momentary.action).toBe(false);
    expect(RELATED_LOOKS.hold.action).toBe(false);
  });

  it('every look the registry offers is known', () => {
    for (const [entity, facts] of [['select.a', { options: options(9) }], ['number.a', {}], ['switch.a', {}], ['sensor.a', { unit: '%' }], ['binary_sensor.a', {}], ['button.a', {}], ['script.a', {}], ['scene.a', {}], ['timer.a', {}], ['text.a', {}]] as const) {
      for (const look of relatedChoiceOf(entity, facts).looks) expect(RELATED_LOOKS[look]).toBeDefined();
    }
  });
});
