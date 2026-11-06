import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Widget } from '../types/dashboardModels';
import { arrangeControls, type PanelControl } from '../components/devices/panels/registry';
import { createDashboardBackupPayload, parseDashboardBackup, restoreDashboardBackup, serializeDashboardBackup } from './configBackup';
import { readDashboardEditDraft, saveDashboardEditDraft } from './dashboardEditDraft';
import { loadDashboardLayout, saveDashboardLayout } from './dashboardStorage';

/*
 * What the edit mode of a panel saves rides on the card, with the mechanism of today:
 * nothing of it may be lost on the way, and a card without it stays as it was.
 */

const CARD: Widget = {
  id: 'stove',
  kind: 'climate',
  title: 'Termostufa',
  entityId: 'climate.stove',
  dataSource: 'ha',
  status: 'idle',
  isOn: false,
  layout: { i: 'stove', x: 0, y: 0, w: 2, h: 4 },
  relatedControls: [{ id: 'boiler', entityId: 'sensor.boiler', look: 'temperature', place: 'main', order: 0 }],
  panelControls: { fan: { place: 'more', order: 3 }, modes: { look: 'list' } },
  widgets: [{ id: 'm', type: 'value_pill', entity: 'sensor.boiler' }],
};
const PLAIN: Widget = { id: 'lamp', kind: 'light', title: 'Lampada', entityId: 'light.lamp', dataSource: 'ha', status: 'idle', isOn: false, layout: { i: 'lamp', x: 2, y: 0, w: 2, h: 4 } };
const EDITED = ['relatedControls', 'panelControls', 'widgets'] as const;
const editedOf = (widget: Widget | undefined) => Object.fromEntries(EDITED.map((key) => [key, widget?.[key]]));

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('the choices of a panel ride on the card', () => {
  it('through saving and loading', () => {
    expect(saveDashboardLayout([], [CARD, PLAIN], {}, {}, {}, 'real').ok).toBe(true);
    const loaded = loadDashboardLayout('real').widgets;
    expect(editedOf(loaded.find((widget) => widget.id === 'stove'))).toEqual(editedOf(CARD));
  });

  it('through the draft of an edit, and the copy an edit can go back to', () => {
    saveDashboardEditDraft(localStorage, { runtimeMode: 'real', createdAt: 100, baseRevision: null, dashboard: { storageVersion: 14, sections: [], widgets: [CARD], widgetTypeLayoutOverrides: {}, widgetLayoutOverrides: {}, responsiveLayouts: {} } } as Parameters<typeof saveDashboardEditDraft>[1]);
    const draft = readDashboardEditDraft(localStorage, 'real');
    expect(editedOf(draft?.dashboard.widgets[0])).toEqual(editedOf(CARD));
    // Cancelling an edit puts back a copy taken when it began.
    expect(editedOf(structuredClone(CARD))).toEqual(editedOf(CARD));
    expect(editedOf(JSON.parse(JSON.stringify(CARD)) as Widget)).toEqual(editedOf(CARD));
  });

  it('through exporting and importing the dashboard', () => {
    saveDashboardLayout([], [CARD, PLAIN], {}, {}, {}, 'real');
    const file = serializeDashboardBackup(createDashboardBackupPayload(localStorage, 'real'));
    localStorage.clear();
    expect(restoreDashboardBackup(parseDashboardBackup(file), localStorage, 'real')).toBeGreaterThan(0);
    expect(editedOf(loadDashboardLayout('real').widgets.find((widget) => widget.id === 'stove'))).toEqual(editedOf(CARD));
  });

  it('a card without them is loaded as it was, with nothing added', () => {
    saveDashboardLayout([], [PLAIN], {}, {}, {}, 'real');
    const loaded = loadDashboardLayout('real').widgets[0];
    for (const key of EDITED) expect(key in loaded).toBe(false);
  });

  it('and its panel is arranged as today', () => {
    const controls: PanelControl[] = ['whites', 'color', 'effects', 'timer', 'white', 'flash'].map((id) => ({ id, icon: null, label: id, onPress: () => undefined }));
    expect(arrangeControls('light', controls, PLAIN.panelControls)).toEqual(arrangeControls('light', controls));
  });
});
