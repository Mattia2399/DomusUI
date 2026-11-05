import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RelatedControl } from '../../../../types/relatedControl';
import { arrangeControls, isActionControl, MOST_IN_THE_ROW, type PanelControl } from '../registry';
import type { RelatedContextValue } from './relatedContext';
import { homeSourceOf } from './relatedHomeSource';
import { forgetRelatedState, RELATED_SEND_DELAY_MS, relatedPanelControls } from './relatedPanelControls';
import type { Widget } from '../../../../types/dashboardModels';

const STATES: RelatedContextValue['states'] = {
  'sensor.boiler': { state: '56.4', unit: '°C', rawAttributes: { friendly_name: 'Boiler ACS', device_class: 'temperature', unit_of_measurement: '°C' } },
  'number.power': { state: '3', rawAttributes: { friendly_name: 'Potenza fiamma', min: 1, max: 5, step: 1 } },
  'switch.schedule': { state: 'on', rawAttributes: { friendly_name: 'Programma orario' } },
  'sensor.pellet': { state: '40', unit: '%', rawAttributes: { friendly_name: 'Pellet', unit_of_measurement: '%' } },
  'button.clean': { state: 'unknown', rawAttributes: { friendly_name: 'Pulizia' } },
};

const STOVE: RelatedControl[] = [
  { id: 'boiler', entityId: 'sensor.boiler', look: 'temperature', place: 'more', order: 0 },
  { id: 'power', entityId: 'number.power', look: 'levels', place: 'more', order: 1 },
  { id: 'schedule', entityId: 'switch.schedule', look: 'toggle-row', place: 'more', order: 2 },
  { id: 'pellet', entityId: 'sensor.pellet', look: 'level', place: 'more', order: 3 },
];

const contextOf = (extra: Partial<RelatedContextValue> = {}): RelatedContextValue => ({ sourceOf: () => undefined, states: STATES, demo: false, commands: {}, ...extra });
const device = (id: string): PanelControl => ({ id, icon: null, label: id, onPress: () => undefined });
const build = (relatedControls: RelatedControl[], context = contextOf()) => relatedPanelControls({ relatedControls }, context, 'it-IT', () => undefined);
const named = (controls: readonly PanelControl[], id: string) => controls.find((control) => control.id === `rel:${id}`)!;

beforeEach(forgetRelatedState);
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('one list with the controls of the device', () => {
  const arrange = (deviceControls: PanelControl[], relatedControls: RelatedControl[]) => {
    const { controls, choices } = build(relatedControls);
    return arrangeControls('stove', [...deviceControls, ...controls], choices);
  };
  const ids = (list: { control: PanelControl }[]) => list.map(({ control }) => control.id);

  it('the stove of the board: its controls in the row, the related ones in Altro', () => {
    const { main, more } = arrange([device('modes'), device('fan'), device('align')], STOVE);
    expect(ids(main)).toEqual(['modes', 'fan', 'align']);
    expect(ids(more)).toEqual(['rel:boiler', 'rel:power', 'rel:schedule', 'rel:pellet']);
  });

  it('one alone in Altro goes up to the row', () => {
    const { main, more } = arrange([device('modes')], [STOVE[0]]);
    expect(ids(main)).toEqual(['modes', 'rel:boiler']);
    expect(more).toEqual([]);
  });

  it('the row holds 8, or 7 and Altro', () => {
    const many = Array.from({ length: 6 }, (_, index) => ({ ...device(`d${index}`), place: 'main' as const }));
    const two: RelatedControl[] = [{ ...STOVE[0], place: 'main' }, { ...STOVE[1], place: 'main' }];
    const full = arrange(many, two);
    expect(full.main).toHaveLength(MOST_IN_THE_ROW);
    expect(full.more).toEqual([]);
    const overflowing = arrange(many, [...two, { ...STOVE[2], place: 'main' }]);
    expect(overflowing.main).toHaveLength(MOST_IN_THE_ROW - 1);
    expect(overflowing.more).toHaveLength(2);
  });

  it('one in Altro stays there when the row is full', () => {
    const many = Array.from({ length: 8 }, (_, index) => ({ ...device(`d${index}`), place: 'main' as const }));
    const { main, more } = arrange(many, [STOVE[0]]);
    expect(main).toHaveLength(MOST_IN_THE_ROW - 1);
    expect(ids(more)).toEqual(['d7', 'rel:boiler']);
  });

  it('they keep the order they were given, after the controls of the device', () => {
    const { main } = arrange([device('modes')], [{ ...STOVE[1], place: 'main', order: 5 }, { ...STOVE[0], place: 'main', order: 2 }]);
    expect(ids(main)).toEqual(['modes', 'rel:boiler', 'rel:power']);
  });

  it('a hidden one does not stand anywhere', () => {
    const { main, more } = arrange([device('modes')], [{ ...STOVE[0], place: 'hidden' }]);
    expect(ids(main)).toEqual(['modes']);
    expect(more).toEqual([]);
  });
});

describe('a row of Altro', () => {
  it('has name, kind and value as on the board', () => {
    const { controls } = build(STOVE);
    const said = controls.map((control) => [control.label, control.kindName, control.value]);
    expect(said).toEqual([
      ['Boiler ACS', 'Sensore', '56,4°'],
      ['Potenza fiamma', 'Livelli', '3 di 5'],
      ['Programma orario', 'Interruttore', 'Acceso'],
      ['Pellet', 'Livello', '40%'],
    ]);
  });

  it('its own name comes before that of the entity', () => {
    expect(build([{ ...STOVE[0], name: 'Acqua' }]).controls[0].label).toBe('Acqua');
  });

  it('an entity that is gone stays, says so and cannot be touched', () => {
    const { controls } = build([{ id: 'x', entityId: 'sensor.gone', look: 'value', place: 'more', order: 0 }]);
    expect(controls[0]).toMatchObject({ label: 'sensor.gone', value: 'Non disponibile', disabled: true });
  });

  it('a covered text never shows its value', () => {
    const { controls } = build([{ id: 'x', entityId: 'text.a', look: 'password', place: 'more', order: 0 }], contextOf({ states: { 'text.a': { state: 'segreta' } } }));
    expect(controls[0].value).toBeUndefined();
  });

  it('an action acts at once; the others open at full size', () => {
    const { controls } = build(STOVE);
    expect(isActionControl(named(controls, 'schedule'))).toBe(true);
    expect(isActionControl(named(controls, 'power'))).toBe(false);
    expect(isActionControl(named(controls, 'boiler'))).toBe(false);
  });
});

describe('the commands are those of today', () => {
  const press = (control: PanelControl) => {
    if (isActionControl(control)) control.onPress();
  };

  it('a switch goes through the toggle of the page', () => {
    const toggle = vi.fn();
    press(named(build(STOVE, contextOf({ commands: { toggle } })).controls, 'schedule'));
    expect(toggle).toHaveBeenCalledWith('switch.schedule', false);
  });

  it('without one, it goes through the service', () => {
    const call = vi.fn();
    press(named(build(STOVE, contextOf({ commands: { call } })).controls, 'schedule'));
    expect(call).toHaveBeenCalledWith('switch', 'turn_off', { entity_id: 'switch.schedule' });
  });

  it('a button is pressed', () => {
    const call = vi.fn();
    press(build([{ id: 'c', entityId: 'button.clean', look: 'push', place: 'more', order: 0 }], contextOf({ commands: { call } })).controls[0]);
    expect(call).toHaveBeenCalledWith('button', 'press', { entity_id: 'button.clean' });
  });

  it('a page button goes only inside the app', () => {
    const navigate = vi.fn();
    const page = (path: string) => build([{ id: 'p', entityId: '', look: 'page', options: { path }, place: 'more', order: 0 }], contextOf({ commands: { navigate } })).controls[0];
    press(page('/rooms'));
    expect(navigate).toHaveBeenCalledWith('/rooms');
    navigate.mockClear();
    press(page('https://evil.example'));
    press(page('//evil.example'));
    press(page('javascript:alert(1)'));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('a slider that sends while it moves waits for the hand to stop', async () => {
    vi.useFakeTimers();
    const setValue = vi.fn();
    const control: RelatedControl = { id: 's', entityId: 'number.power', look: 'bar', options: { commit: 'live' }, place: 'main', order: 0 };
    const { controls } = build([control], contextOf({ commands: { setValue } }));
    const big = controls[0];
    if (isActionControl(big)) throw new Error('a slider opens at full size');
    render(<div>{big.group}</div>);
    const slider = await vi.waitFor(() => screen.getByRole('slider'));
    fireEvent.change(slider, { target: { value: '2' } });
    fireEvent.change(slider, { target: { value: '4' } });
    expect(setValue).not.toHaveBeenCalled();
    vi.advanceTimersByTime(RELATED_SEND_DELAY_MS);
    expect(setValue).toHaveBeenCalledTimes(1);
    expect(setValue).toHaveBeenCalledWith('number.power', 4);
  });
});

describe('in the demo', () => {
  it('nothing leaves the page, and what changes shows', () => {
    const toggle = vi.fn();
    const call = vi.fn();
    const refresh = vi.fn();
    const context = contextOf({ demo: true, commands: { toggle, call } });
    const first = relatedPanelControls({ relatedControls: STOVE }, context, 'it-IT', refresh);
    const schedule = named(first.controls, 'schedule');
    if (isActionControl(schedule)) schedule.onPress();
    expect(toggle).not.toHaveBeenCalled();
    expect(call).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
    expect(named(relatedPanelControls({ relatedControls: STOVE }, context, 'it-IT', refresh).controls, 'schedule').value).toBe('Spento');
  });
});

describe('where the Rooms read from', () => {
  const card = (id: string, entityId: string, order: number) => ({ id, entityId, relatedControls: [{ ...STOVE[0], order }] }) as unknown as Widget;

  it('the first card of the Home with that entity', () => {
    const widgets = [card('a', 'climate.other', 0), card('b', 'climate.stove', 1), card('c', 'climate.stove', 2)];
    expect(homeSourceOf(widgets, 'climate.stove')).toBe(widgets[1]);
  });

  it('no card, no related controls', () => {
    expect(homeSourceOf([card('a', 'climate.other', 0)], 'climate.stove')).toBeUndefined();
    expect(homeSourceOf(undefined, 'climate.stove')).toBeUndefined();
  });
});

describe('a look nobody asked for stays away', () => {
  it('a panel without related controls has none', () => {
    expect(build([]).controls).toEqual([]);
  });
});

void React;
