import { describe, expect, it } from 'vitest';
import type { DashboardLayoutConfiguration } from '../../services/dashboardConfigurationRepository';
import { describeLegacyStackChange, hasLegacyStacks, isLegacyStackChild } from './legacyStacks';

/*
 * Stacks are suspended: a saved one renders as it was and no save may change
 * it. Moving the whole Stack, or editing the cards around it, is still a save.
 */

function home(): DashboardLayoutConfiguration {
  return {
    storageVersion: 14,
    sections: [
      { id: 'greeting', kind: 'greeting', layout: { i: 'greeting', x: 0, y: 0, w: 12, h: 2 } },
      {
        id: 'stack',
        kind: 'stack-grid',
        title: 'Soggiorno',
        stackColumns: 4,
        stackColumnsMode: 'auto',
        layout: { i: 'stack', x: 0, y: 2, w: 4, h: 6 },
      },
    ],
    widgets: [
      {
        id: 'root.light', kind: 'light', title: 'Ingresso', entityId: 'light.ingresso', status: 'off', isOn: false,
        layout: { i: 'root.light', x: 4, y: 2, w: 2, h: 1 },
      },
      {
        id: 'stack.light', kind: 'light', title: 'Pianta', entityId: 'light.pianta', status: 'on', isOn: true,
        parentSectionId: 'stack', layout: { i: 'stack.light', x: 0, y: 0, w: 2, h: 1 },
      },
      {
        id: 'stack.sensor', kind: 'sensor', title: 'Temperatura', entityId: 'sensor.t', status: '21', isOn: false,
        parentSectionId: 'stack', layout: { i: 'stack.sensor', x: 2, y: 0, w: 2, h: 2 },
      },
    ],
    widgetTypeLayoutOverrides: {},
    widgetLayoutOverrides: {},
    responsiveLayouts: {
      root: { xl: [{ i: 'stack', x: 0, y: 2, w: 4, h: 6 }] },
      stacks: { stack: { xl: [{ i: 'stack.light', x: 0, y: 0, w: 2, h: 1 }] } },
    },
  };
}

describe('Saved Stacks while Stacks are suspended', () => {
  it('knows a Stack and the cards inside it', () => {
    const source = home();
    expect(hasLegacyStacks(source)).toBe(true);
    expect(isLegacyStackChild(source.widgets[1], source.sections)).toBe(true);
    expect(isLegacyStackChild(source.widgets[0], source.sections)).toBe(false);
  });

  it('lets a save through when only the cards around a Stack, or its place, change', () => {
    const baseline = home();
    const current = home();
    current.widgets[0] = { ...current.widgets[0], layout: { ...current.widgets[0].layout, x: 6 }, title: 'Entrata' };
    current.sections[1] = { ...current.sections[1], layout: { ...current.sections[1].layout, x: 8, y: 0 } };
    current.responsiveLayouts.root = { xl: [{ i: 'stack', x: 8, y: 0, w: 4, h: 7 }] };
    current.widgetTypeLayoutOverrides = { climate: { xl: { w: 4, h: 4 } } };
    expect(describeLegacyStackChange(baseline, current)).toBeNull();
  });

  it('blocks a save that would change a Stack, its cards or where they sit', () => {
    const changes: Array<(home: DashboardLayoutConfiguration) => void> = [
      (next) => { next.sections[1] = { ...next.sections[1], stackColumnsMode: 'manual' }; },
      (next) => { next.sections = next.sections.filter((section) => section.id !== 'stack'); },
      (next) => { next.widgets[1] = { ...next.widgets[1], layout: { ...next.widgets[1].layout, w: 4 } }; },
      (next) => { next.widgets[2] = { ...next.widgets[2], parentSectionId: undefined }; },
      (next) => { next.widgets = next.widgets.filter((widget) => widget.id !== 'stack.sensor'); },
      (next) => { next.widgetLayoutOverrides = { 'stack.light': { xl: { w: 4, hOff: 1, hOn: 2 } } }; },
      (next) => { next.responsiveLayouts.stacks = { stack: { xl: [{ i: 'stack.light', x: 2, y: 0, w: 2, h: 1 }] } }; },
      // "Apply to all" reaches the lights inside the Stack too.
      (next) => { next.widgetTypeLayoutOverrides = { light: { xl: { w: 4, hOff: 1, hOn: 2 } } }; },
    ];
    for (const change of changes) {
      const current = home();
      change(current);
      expect(describeLegacyStackChange(home(), current)).toMatch(/Stack salvato/);
    }
  });

  it('never blocks a Home without Stacks', () => {
    const plain = { ...home(), sections: [home().sections[0]], widgets: [home().widgets[0]] };
    const moved = structuredClone(plain);
    moved.widgets[0].layout.x = 8;
    expect(describeLegacyStackChange(plain, moved)).toBeNull();
  });
});
