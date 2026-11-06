import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Widget } from '../../types/dashboardModels';
import type { MockEntityStateMap } from '../../types/ha';
import { ControlsTab } from './ControlsTab';
import { controlRows, entityNameOf, relatedLooksOf, type DeviceControlInfo } from './controlsModel';
import { controlAt } from './PanelPreview';
import * as registry from '../devices/panels/registry';
import { EDITOR_ICONS } from '../editor/editorIcons';
import type { PanelKit } from './panelKit';

afterEach(cleanup);

const KIT = { ...registry, EDITOR_ICONS, RelatedPreview: () => <p>anteprima del collegato</p> } as unknown as PanelKit;

const STATES: MockEntityStateMap = {
  'climate.stove': { state: 'heat', rawAttributes: { friendly_name: 'Termostufa' } },
  'sensor.boiler': { state: '56', rawAttributes: { friendly_name: 'Boiler ACS', device_class: 'temperature', unit_of_measurement: '°C' } },
  'number.power': { state: '3', rawAttributes: { friendly_name: 'Potenza fiamma', min: 1, max: 5, step: 1 } },
};
const DEVICE: DeviceControlInfo[] = [
  { id: 'modes', name: 'Modalità', looks: ['tiles', 'list'], action: false },
  { id: 'fan', name: 'Ventola', looks: ['levels'], action: false },
  { id: 'align', name: 'Allinea', looks: [], action: true },
];
const STOVE: Widget = {
  id: 'stove',
  kind: 'climate',
  title: 'Termostufa',
  entityId: 'climate.stove',
  dataSource: 'ha',
  status: 'heat',
  isOn: true,
  layout: { i: 'stove', x: 0, y: 0, w: 2, h: 4 },
  widgets: [{ id: 'pill', type: 'value_pill', entity: 'sensor.boiler' }],
};

function setup(widget: Widget = STOVE, extra: { fixed?: boolean } = {}) {
  let current = widget;
  const onUpdateWidget = vi.fn((_: string, change: (widget: Widget) => Widget) => {
    current = change(current);
    view.rerender(tab());
  });
  let selected: string | null = null;
  const onSelect = (id: string | null) => {
    selected = id;
    view.rerender(tab());
  };
  const tab = () => (
    <ControlsTab
      widget={current}
      haStates={STATES}
      haEntityIds={Object.keys(STATES)}
      kit={KIT}
      rows={controlRows(KIT, current, 'stove', DEVICE, relatedLooksOf(STATES), entityNameOf(STATES))}
      ready
      fixed={Boolean(extra.fixed)}
      selected={selected}
      onSelect={onSelect}
      onUpdateWidget={onUpdateWidget}
    />
  );
  const view = render(tab());
  return { saved: () => current, onUpdateWidget };
}

const list = (name: string) => screen.getByRole('list', { name });

describe('Controlli', () => {
  it('one list of the device and the related controls, in the row and in Altro', () => {
    setup();
    expect(within(list('In primo piano')).getAllByRole('button', { name: /Modalità|Ventola|Allinea|Boiler/ }).length).toBeGreaterThan(0);
    expect(screen.getByText('4 di 8')).toBeTruthy();
    // The micro widget alone in Altro goes up to the row, as in the panel.
    expect(within(list('In primo piano')).getByText('Boiler ACS', { exact: false })).toBeTruthy();
  });

  it('a micro widget never touched is not written', () => {
    const { onUpdateWidget } = setup();
    fireEvent.click(screen.getByRole('button', { name: /^Modalità/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Controlli' }));
    expect(onUpdateWidget).not.toHaveBeenCalled();
  });

  it('a place chosen hides a control of the device, and the micro widgets become related controls', () => {
    const { saved } = setup();
    fireEvent.click(screen.getByRole('button', { name: /^Modalità/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'Nascosto' }));
    expect(saved().panelControls?.modes).toMatchObject({ place: 'hidden' });
    expect(saved().widgets).toBeUndefined();
    expect(saved().relatedControls).toEqual([expect.objectContaining({ id: 'micro-pill', entityId: 'sensor.boiler', look: 'value-pill' })]);
    expect(saved().layout).toEqual(STOVE.layout);
  });

  it('a look of the device, by its name', () => {
    const { saved } = setup();
    fireEvent.click(screen.getByRole('button', { name: /^Modalità/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Elenco/ }));
    expect(saved().panelControls?.modes).toMatchObject({ look: 'list' });
  });

  it('a related control: its name, its icon, and out of the panel with a confirmation', () => {
    const { saved } = setup({ ...STOVE, widgets: undefined, relatedControls: [{ id: 'boiler', entityId: 'sensor.boiler', look: 'temperature', place: 'more', order: 0 }] });
    fireEvent.click(screen.getByRole('button', { name: /^Boiler ACS/ }));
    fireEvent.click(screen.getByRole('button', { name: /Icona/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'Termometro' }));
    expect(saved().relatedControls?.[0]).toMatchObject({ icon: 'thermometer' });
    fireEvent.click(screen.getByRole('button', { name: 'Togli dal pannello' }));
    expect(saved().relatedControls).toHaveLength(1);
    fireEvent.click(screen.getAllByRole('button', { name: 'Togli dal pannello' }).at(-1)!);
    expect(saved().relatedControls).toEqual([]);
  });

  it('adding in two steps: the entity by name, then its look and place', () => {
    const { saved } = setup({ ...STOVE, widgets: undefined });
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi un controllo' }));
    fireEvent.click(screen.getByRole('button', { name: /Potenza fiamma/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Pulsanti \+ e −/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'In primo piano' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi' }));
    expect(saved().relatedControls).toEqual([expect.objectContaining({ entityId: 'number.power', look: 'stepper', place: 'main' })]);
  });

  it('Ripristina gives back the recommended controls of the device, with a confirmation', () => {
    const { saved } = setup({ ...STOVE, panelControls: { modes: { place: 'hidden', order: 0 } } });
    fireEvent.click(screen.getByRole('button', { name: 'Ripristina i controlli consigliati' }));
    expect(saved().panelControls).toBeDefined();
    fireEvent.click(screen.getAllByRole('button', { name: 'Ripristina i controlli consigliati' }).at(-1)!);
    expect(saved().panelControls).toBeUndefined();
  });

  it('the detail shows what is short to choose at once, and goes back as a page of the panel', () => {
    setup({ ...STOVE, widgets: undefined, relatedControls: [{ id: 'boiler', entityId: 'sensor.boiler', look: 'temperature', place: 'more', order: 0 }] });
    fireEvent.click(screen.getByRole('button', { name: /^Boiler ACS/ }));
    expect(screen.getByRole('heading', { name: 'Boiler ACS' })).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: 'Posto' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Valore con scala, Consigliato/ })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Nome' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sposta su' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Posizione/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Controlli' }));
    expect(screen.getByRole('list', { name: 'In primo piano' })).toBeTruthy();
  });

  it('the panels with fixed controls say so', () => {
    setup({ ...STOVE, kind: 'lock' }, { fixed: true });
    expect(screen.getByText(/controlli fissi/)).toBeTruthy();
  });
});

describe('the preview of the panel', () => {
  it('a touch on a group, a shortcut or a row of Altro finds its control by name', () => {
    const rows = controlRows(KIT, STOVE, 'stove', DEVICE, relatedLooksOf(STATES));
    document.body.innerHTML = '<section class="panel-group" aria-label="Ventola"><b>Ventola</b><span id="inside">2</span></section><nav class="panel-nav"><button aria-label="Modalità"><span id="short">x</span></button></nav>';
    expect(controlAt(document.getElementById('inside'), rows)?.id).toBe('fan');
    expect(controlAt(document.getElementById('short'), rows)?.id).toBe('modes');
    expect(controlAt(document.body, rows)).toBeUndefined();
  });
});
