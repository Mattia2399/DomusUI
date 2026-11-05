import { describe, expect, it } from 'vitest';
import type { MicroWidget } from '../../../../types/dashboardModels';
import { RELATED_LOOKS } from './relatedControlRegistry';
import { relatedControlsOf, relatedOfMicroWidget } from './relatedMigration';

const micro = (extra: Partial<MicroWidget> & Pick<MicroWidget, 'type'>): MicroWidget => ({ id: 'a', entity: 'sensor.a', ...extra });

describe('every micro widget of today becomes the right control', () => {
  it.each([
    ['value_pill', {}, 'value-pill', undefined],
    ['status_glow', {}, 'glow', undefined],
    ['micro_toggle', {}, 'toggle-row', undefined],
    ['mini_ring', {}, 'mini-ring', undefined],
    ['micro_step', {}, 'stepper', undefined],
    ['micro_button', {}, 'icon-toggle', undefined],
    ['micro_button', { buttonMode: 'switch' }, 'icon-toggle', undefined],
    ['micro_button', { buttonMode: 'push' }, 'push', undefined],
    ['micro_button', { buttonMode: 'push', buttonHoldWhilePressed: false }, 'push', undefined],
    ['micro_button', { buttonMode: 'push', buttonHoldWhilePressed: true }, 'momentary', undefined],
    ['micro_button', { buttonMode: 'page', buttonPagePath: '/rooms' }, 'page', { path: '/rooms' }],
    ['micro_button', { buttonMode: 'page' }, 'page', { path: '/home' }],
    ['micro_button', { buttonMode: 'page', buttonPagePath: '  ' }, 'page', { path: '/home' }],
    ['micro_slider', {}, 'bar', { commit: 'release' }],
    ['micro_slider', { sliderSendOnRelease: true }, 'bar', { commit: 'release' }],
    ['micro_slider', { sliderSendOnRelease: false }, 'bar', { commit: 'live' }],
    ['micro_superchart', {}, 'chart-line', undefined],
    ['micro_superchart', { superChartType: 'line' }, 'chart-line', undefined],
    ['micro_superchart', { superChartType: 'area' }, 'chart-area', undefined],
    ['micro_superchart', { superChartType: 'bar' }, 'chart-bar', undefined],
  ] as const)('%s %j is %s', (type, options, look, expected) => {
    const control = relatedOfMicroWidget(micro({ type, ...options }), 0);
    expect(control.look).toBe(look);
    expect(control.options).toEqual(expected);
    expect(RELATED_LOOKS[control.look]).toBeDefined();
  });

  it('what else was saved stays a small switch, as it has always been drawn', () => {
    expect(relatedOfMicroWidget(micro({ type: 'nuovo' as MicroWidget['type'] }), 0).look).toBe('toggle-row');
  });

  it('a chart of an unknown kind stays a line', () => {
    expect(relatedOfMicroWidget(micro({ type: 'micro_superchart', superChartType: 'pie' as 'line' }), 0).look).toBe('chart-line');
  });

  it('a page button keeps even a path it will ignore: nothing saved is changed', () => {
    expect(relatedOfMicroWidget(micro({ type: 'micro_button', buttonMode: 'page', buttonPagePath: 'https://evil.example' }), 0).options).toEqual({ path: 'https://evil.example' });
  });
});

describe('what stays of it', () => {
  it('its entity, its name and its order, in Altro', () => {
    const control = relatedOfMicroWidget(micro({ id: 'x', type: 'value_pill', entity: 'sensor.b', label: ' Acqua ' }), 3);
    expect(control).toMatchObject({ id: 'micro-x', entityId: 'sensor.b', name: 'Acqua', place: 'more' });
    expect(control.order).toBe(503);
  });

  it('without a name it takes that of the entity', () => {
    expect(relatedOfMicroWidget(micro({ type: 'value_pill', label: '   ' }), 0).name).toBeUndefined();
  });

  it('none of them is left out, whatever else the card holds', () => {
    const widgets: MicroWidget[] = ['value_pill', 'status_glow', 'micro_toggle', 'mini_ring', 'micro_button', 'micro_slider', 'micro_step', 'micro_superchart'].map((type, index) => ({ id: String(index), type: type as MicroWidget['type'], entity: 'sensor.a' }));
    const declared = { id: 'r', entityId: 'sensor.r', look: 'value', place: 'main', order: 0 } as const;
    const controls = relatedControlsOf({ relatedControls: [declared], widgets });
    expect(controls).toHaveLength(9);
    expect(controls[0]).toBe(declared);
    expect(controls.slice(1).map((control) => control.place)).toEqual(Array(8).fill('more'));
    expect(new Set(controls.map((control) => control.id)).size).toBe(9);
  });

  it('what is saved is not touched, and the card stays as it is', () => {
    const widgets: MicroWidget[] = [micro({ type: 'micro_slider', sliderSendOnRelease: false, label: 'Setpoint' })];
    const before = JSON.stringify(widgets);
    relatedControlsOf({ widgets });
    expect(JSON.stringify(widgets)).toBe(before);
  });

  it('a card with nothing has nothing', () => {
    expect(relatedControlsOf({})).toEqual([]);
  });
});
