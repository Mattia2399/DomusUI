import { describe, expect, it } from 'vitest';
import type { Widget } from '../../types/dashboardModels';
import type { RelatedControl } from '../../types/relatedControl';
import { arrangeControls, PANEL_CONTROLS } from '../devices/panels/registry';
import { controlRows, controlSections, newRelatedControl, relatedWithLook, rowsFromSections, writeRows, type DeviceControlInfo } from './controlsModel';

const KIT = { arrangeControls, PANEL_CONTROLS };
const STOVE_DEVICE: DeviceControlInfo[] = [
  { id: 'modes', name: 'Modalità', looks: ['tiles', 'list'], action: false },
  { id: 'fan', name: 'Ventola', looks: ['levels', 'list'], action: false },
  { id: 'align', name: 'Allinea', looks: [], action: true },
  { id: 'preset', name: 'Preset', looks: ['list'], action: false },
];
const RELATED: RelatedControl[] = [{ id: 'boiler', entityId: 'sensor.boiler', look: 'temperature', place: 'more', order: 0 }];
const card = (extra: Partial<Widget> = {}): Widget => ({ id: 'stove', kind: 'climate', title: 'Termostufa', entityId: 'climate.stove', dataSource: 'ha', status: 'heat', isOn: true, layout: { i: 'stove', x: 0, y: 0, w: 2, h: 4 }, ...extra });
const looks = () => ['temperature', 'value'];
const ids = (rows: readonly { id: string }[]) => rows.map((row) => row.id);

describe('the controls of a card in one list', () => {
  it('those of the device in their recommended order, the related ones after', () => {
    const rows = controlRows(KIT, card({ relatedControls: RELATED }), 'stove', STOVE_DEVICE, looks);
    expect(ids(rows)).toEqual(['modes', 'fan', 'align', 'preset', 'rel:boiler']);
    expect(rows.find((row) => row.id === 'preset')?.place).toBe('more');
    expect(rows.find((row) => row.id === 'align')?.look).toBe('action');
  });

  it('the micro widgets are read as related controls, without being written', () => {
    const widget = card({ widgets: [{ id: 'pill', type: 'value_pill', entity: 'sensor.boiler' }] });
    const rows = controlRows(KIT, widget, 'stove', STOVE_DEVICE, looks);
    expect(rows.at(-1)).toMatchObject({ id: 'rel:micro-pill', source: 'related', look: 'value-pill', place: 'more' });
    expect(widget.relatedControls).toBeUndefined();
  });

  it('the choices of the user decide place, look and one order for both', () => {
    const widget = card({
      relatedControls: [{ ...RELATED[0], place: 'main', order: 0 }],
      panelControls: { modes: { place: 'hidden', order: 3 }, fan: { look: 'list', order: 1 }, align: { order: 2 }, preset: { place: 'main', order: 4 } },
    });
    const rows = controlRows(KIT, widget, 'stove', STOVE_DEVICE, looks);
    expect(ids(rows)).toEqual(['rel:boiler', 'fan', 'align', 'modes', 'preset']);
    expect(rows.find((row) => row.id === 'fan')?.look).toBe('list');
    expect(controlSections(KIT, rows).hidden.map((row) => row.id)).toEqual(['modes']);
  });

  it('written back: the choices of the device, the related controls, and no more micro widgets', () => {
    const widget = card({ widgets: [{ id: 'pill', type: 'value_pill', entity: 'sensor.boiler' }] });
    const rows = controlRows(KIT, widget, 'stove', STOVE_DEVICE, looks);
    const written = writeRows(rows.map((row) => (row.id === 'modes' ? { ...row, look: 'list' } : row)));
    expect(written.panelControls).toEqual({
      modes: { place: 'main', look: 'list', order: 0 },
      fan: { place: 'main', look: 'levels', order: 1 },
      align: { place: 'main', order: 2 },
      preset: { place: 'more', look: 'list', order: 3 },
    });
    expect(written.relatedControls).toEqual([{ id: 'micro-pill', entityId: 'sensor.boiler', look: 'value-pill', place: 'more', order: 4 }]);
    expect(written.widgets).toBeUndefined();
    // Read again, the card is the same.
    expect(ids(controlRows(KIT, { ...widget, ...written }, 'stove', STOVE_DEVICE, looks))).toEqual(ids(rows));
  });

  it('the sections follow the limits of the panel', () => {
    const many: DeviceControlInfo[] = Array.from({ length: 9 }, (_, index) => ({ id: `d${index}`, name: `D${index}`, looks: [], action: true, place: 'main' }));
    const sections = controlSections(KIT, controlRows(KIT, card(), undefined, many, looks));
    expect(sections.main).toHaveLength(7);
    expect(sections.more).toHaveLength(2);
    const back = rowsFromSections(sections.main, sections.more, sections.hidden);
    expect(back.slice(7).every((row) => row.place === 'more')).toBe(true);
  });

  it('a new look keeps what it needs', () => {
    const slider = { id: 's', entityId: 'number.x', look: 'bar', options: { commit: 'live' }, place: 'more', order: 0 } as RelatedControl;
    expect(relatedWithLook(slider, 'bar-value')).toMatchObject({ look: 'bar-value', options: { commit: 'live' } });
    expect(relatedWithLook(slider, 'stepper')).not.toHaveProperty('options');
    expect(relatedWithLook({ ...slider, look: 'stepper', options: undefined } as RelatedControl, 'bar')).toMatchObject({ options: { commit: 'release' } });
    expect(newRelatedControl('sensor.x', 'chart-line', { place: 'main', name: 'Curva' }, 'n1')).toEqual({ id: 'n1', entityId: 'sensor.x', look: 'chart-line', place: 'main', order: 0, name: 'Curva' });
  });
});
