import { describe, expect, it } from 'vitest';
import type { DashboardLayoutConfiguration } from '../../../services/dashboardConfigurationRepository';
import { DASHBOARD_GRID_BREAKPOINT_ORDER } from '../../../types/widgetTypeLayout';
import { createGridEngine2HomeConfiguration } from './gridEngine2Activation';
import { validateGridEngine2DashboardForSave } from './gridEngineSaveValidation';

function dashboard(): DashboardLayoutConfiguration {
  const xl = [
    { i: 'section.stack', x: 0, y: 0, w: 4, h: 1 },
    { i: 'root.light', x: 0, y: 1, w: 3, h: 1 },
    { i: 'root.sensor', x: 0, y: 2, w: 3, h: 1 },
  ];
  const lg = [
    { i: 'section.stack', x: 0, y: 0, w: 4, h: 1 },
    { i: 'root.light', x: 0, y: 1, w: 2, h: 1 },
    { i: 'root.sensor', x: 0, y: 2, w: 2, h: 1 },
  ];
  return {
    storageVersion: 14,
    sections: [{
      id: 'section.stack',
      kind: 'stack-grid',
      title: 'Stack',
      stackColumns: 4,
      stackColumnsMode: 'manual',
      layout: { ...xl[0] },
    }],
    widgets: [
      {
        id: 'root.light', kind: 'light', title: 'Light', entityId: 'light.test', dataSource: 'mock',
        isOn: true, status: 'on', layout: { ...xl[1] },
      },
      {
        id: 'root.sensor', kind: 'sensor', title: 'Sensor', entityId: 'sensor.test', dataSource: 'mock',
        isOn: false, status: '20', layout: { ...xl[2] },
      },
      {
        id: 'stack.child', kind: 'sensor', title: 'Child', entityId: 'sensor.child', dataSource: 'mock',
        isOn: false, status: '1', parentSectionId: 'section.stack', layout: { i: 'stack.child', x: 0, y: 0, w: 2, h: 1 },
      },
    ],
    widgetTypeLayoutOverrides: {
      light: {
        xl: { w: 3, hOff: 1, hOn: 2, autoExpand: true },
        lg: { w: 2, hOff: 1, hOn: 2, autoExpand: true },
      },
      sensor: { xl: { w: 3, h: 1 }, lg: { w: 2, h: 1 } },
    },
    widgetLayoutOverrides: {},
    responsiveLayouts: {
      root: { xl, lg },
      stacks: { 'section.stack': { xl: [{ i: 'stack.child', x: 0, y: 0, w: 2, h: 1 }] } },
    },
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function addGreeting(
  value: DashboardLayoutConfiguration,
  canonicalHeight: number,
  xlHeight: number,
) {
  value.sections.push({
    id: 'section-greeting-1',
    kind: 'greeting',
    title: 'Greeting',
    showWeather: true,
    layout: { i: 'section-greeting-1', x: 4, y: 0, w: 8, h: canonicalHeight },
  });
  value.responsiveLayouts.root!.xl!.push({
    i: 'section-greeting-1', x: 4, y: 0, w: 8, h: xlHeight,
  });
  value.responsiveLayouts.root!.lg!.push({
    i: 'section-greeting-1', x: 4, y: 0, w: 4, h: 2,
  });
}

describe('Grid Engine 2 controlled save validation', () => {
  it('accepts an XL structural move, canonical mirror, and runtime-expanded Light state', () => {
    const baseline = dashboard();
    const current = clone(baseline);
    current.responsiveLayouts.root!.xl!.find((item) => item.i === 'root.sensor')!.y = 4;
    current.widgets.find((widget) => widget.id === 'root.sensor')!.layout.y = 4;

    const result = validateGridEngine2DashboardForSave({
      dashboard: current,
      baseline,
      touchedBreakpoints: [{ breakpoint: 'xl', origin: 'explicit' }],
    });

    expect(result).toEqual({ valid: true, issues: [], touchedBreakpoints: ['xl'] });
    expect(current.responsiveLayouts.root!.xl!.find((item) => item.i === 'root.light')!.h).toBe(1);
    expect(current.widgets.find((widget) => widget.id === 'root.light')!.isOn).toBe(true);
  });

  it('accepts an unchanged historical Greeting canonical/XL difference when another card moves', () => {
    const baseline = dashboard();
    addGreeting(baseline, 2, 3);
    const current = clone(baseline);
    current.responsiveLayouts.root!.xl!.find((item) => item.i === 'root.sensor')!.y = 4;
    current.widgets.find((widget) => widget.id === 'root.sensor')!.layout.y = 4;

    const result = validateGridEngine2DashboardForSave({
      dashboard: current,
      baseline,
      touchedBreakpoints: [{ breakpoint: 'xl', origin: 'explicit' }],
    });

    expect(result).toEqual({ valid: true, issues: [], touchedBreakpoints: ['xl'] });
    expect(current.sections.find((section) => section.id === 'section-greeting-1')!.layout.h).toBe(2);
    expect(current.responsiveLayouts.root!.xl!.find((item) => item.i === 'section-greeting-1')!.h).toBe(3);
  });

  it('blocks a canonical/XL Greeting difference introduced after a coherent baseline', () => {
    const baseline = dashboard();
    addGreeting(baseline, 3, 3);
    const current = clone(baseline);
    current.sections.find((section) => section.id === 'section-greeting-1')!.layout.h = 2;
    current.responsiveLayouts.root!.xl!.find((item) => item.i === 'root.sensor')!.y = 4;
    current.widgets.find((widget) => widget.id === 'root.sensor')!.layout.y = 4;

    const result = validateGridEngine2DashboardForSave({
      dashboard: current,
      baseline,
      touchedBreakpoints: [{ breakpoint: 'xl', origin: 'explicit' }],
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'XL_CANONICAL_MISMATCH',
      breakpoint: 'xl',
      id: 'section-greeting-1',
      message: expect.stringMatching(/h=2.*XL.*h=3/),
    }));
  });

  it('still blocks a changed historical canonical/XL Greeting difference', () => {
    const baseline = dashboard();
    addGreeting(baseline, 2, 3);
    const current = clone(baseline);
    current.sections.find((section) => section.id === 'section-greeting-1')!.layout.y = 1;
    current.responsiveLayouts.root!.xl!.find((item) => item.i === 'root.sensor')!.y = 4;
    current.widgets.find((widget) => widget.id === 'root.sensor')!.layout.y = 4;

    const result = validateGridEngine2DashboardForSave({
      dashboard: current,
      baseline,
      touchedBreakpoints: [{ breakpoint: 'xl', origin: 'explicit' }],
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'XL_CANONICAL_MISMATCH',
      id: 'section-greeting-1',
    }));
  });

  it('does not treat a historical runtime Light height as a persistible section difference', () => {
    const baseline = dashboard();
    baseline.widgets.find((widget) => widget.id === 'root.light')!.layout.h = 2;
    const current = clone(baseline);
    current.responsiveLayouts.root!.xl!.find((item) => item.i === 'root.sensor')!.y = 4;
    current.widgets.find((widget) => widget.id === 'root.sensor')!.layout.y = 4;

    const result = validateGridEngine2DashboardForSave({
      dashboard: current,
      baseline,
      touchedBreakpoints: [{ breakpoint: 'xl', origin: 'explicit' }],
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'XL_CANONICAL_MISMATCH',
      id: 'root.light',
    }));
  });

  it('does not grandfather a canonical/XL difference already stored as v2 geometry', () => {
    const baseline = dashboard();
    baseline.gridMetricsVersion = 'v2';
    addGreeting(baseline, 2, 3);
    const current = clone(baseline);
    current.responsiveLayouts.root!.xl!.find((item) => item.i === 'root.sensor')!.y = 4;
    current.widgets.find((widget) => widget.id === 'root.sensor')!.layout.y = 4;

    const result = validateGridEngine2DashboardForSave({
      dashboard: current,
      baseline,
      touchedBreakpoints: [{ breakpoint: 'xl', origin: 'explicit' }],
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'XL_CANONICAL_MISMATCH',
      id: 'section-greeting-1',
    }));
  });

  it('accepts an LG-only move while XL and canonical coordinates remain unchanged', () => {
    const baseline = dashboard();
    const current = clone(baseline);
    current.responsiveLayouts.root!.lg!.find((item) => item.i === 'root.sensor')!.y = 4;

    const result = validateGridEngine2DashboardForSave({
      dashboard: current,
      baseline,
      touchedBreakpoints: [{ breakpoint: 'lg', origin: 'explicit' }],
    });

    expect(result.valid).toBe(true);
    expect(current.responsiveLayouts.root!.xl).toEqual(baseline.responsiveLayouts.root!.xl);
    expect(current.widgets.map((widget) => widget.layout)).toEqual(baseline.widgets.map((widget) => widget.layout));
  });

  it('preserves a verified historical span during MOVE instead of imposing current type defaults', () => {
    const baseline = dashboard();
    delete baseline.widgetTypeLayoutOverrides.sensor;
    baseline.responsiveLayouts.root!.xl!.find((item) => item.i === 'root.sensor')!.w = 2;
    baseline.widgets.find((widget) => widget.id === 'root.sensor')!.layout.w = 2;
    const current = clone(baseline);
    current.responsiveLayouts.root!.xl!.find((item) => item.i === 'root.sensor')!.y = 4;
    current.widgets.find((widget) => widget.id === 'root.sensor')!.layout.y = 4;

    const result = validateGridEngine2DashboardForSave({
      dashboard: current,
      baseline,
      touchedBreakpoints: [{ breakpoint: 'xl', origin: 'explicit' }],
    });

    expect(result).toEqual({ valid: true, issues: [], touchedBreakpoints: ['xl'] });
  });

  it('still blocks a historical widget span change without a corresponding resize override', () => {
    const baseline = dashboard();
    delete baseline.widgetTypeLayoutOverrides.sensor;
    baseline.responsiveLayouts.root!.xl!.find((item) => item.i === 'root.sensor')!.w = 2;
    baseline.widgets.find((widget) => widget.id === 'root.sensor')!.layout.w = 2;
    const current = clone(baseline);
    current.responsiveLayouts.root!.xl!.find((item) => item.i === 'root.sensor')!.w = 3;
    current.responsiveLayouts.root!.xl!.find((item) => item.i === 'root.sensor')!.y = 4;
    current.widgets.find((widget) => widget.id === 'root.sensor')!.layout.w = 3;
    current.widgets.find((widget) => widget.id === 'root.sensor')!.layout.y = 4;

    const result = validateGridEngine2DashboardForSave({
      dashboard: current,
      baseline,
      touchedBreakpoints: [{ breakpoint: 'xl', origin: 'explicit' }],
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'UNEXPECTED_WIDGET_SPAN',
      breakpoint: 'xl',
      id: 'root.sensor',
    }));
  });

  it('accepts a resized historical widget only when the matching override is committed', () => {
    const baseline = dashboard();
    delete baseline.widgetTypeLayoutOverrides.sensor;
    baseline.responsiveLayouts.root!.xl!.find((item) => item.i === 'root.sensor')!.w = 2;
    baseline.widgets.find((widget) => widget.id === 'root.sensor')!.layout.w = 2;
    const current = clone(baseline);
    current.responsiveLayouts.root!.xl!.find((item) => item.i === 'root.sensor')!.w = 4;
    current.responsiveLayouts.root!.xl!.find((item) => item.i === 'root.sensor')!.h = 2;
    current.responsiveLayouts.root!.xl!.find((item) => item.i === 'root.sensor')!.y = 4;
    current.widgets.find((widget) => widget.id === 'root.sensor')!.layout.w = 4;
    current.widgets.find((widget) => widget.id === 'root.sensor')!.layout.h = 2;
    current.widgets.find((widget) => widget.id === 'root.sensor')!.layout.y = 4;
    current.widgetLayoutOverrides['root.sensor'] = { xl: { w: 4, h: 2 } };

    const result = validateGridEngine2DashboardForSave({
      dashboard: current,
      baseline,
      touchedBreakpoints: [{ breakpoint: 'xl', origin: 'explicit' }],
    });

    expect(result).toEqual({ valid: true, issues: [], touchedBreakpoints: ['xl'] });
  });

  it('blocks runtime Light height, collisions, missing roots, and unknown roots', () => {
    const baseline = dashboard();
    const current = clone(baseline);
    const xl = current.responsiveLayouts.root!.xl!;
    xl.find((item) => item.i === 'root.light')!.h = 2;
    xl.find((item) => item.i === 'root.sensor')!.y = 1;
    xl.splice(0, 1, { i: 'unknown.root', x: 8, y: 0, w: 2, h: 1 });

    const result = validateGridEngine2DashboardForSave({
      dashboard: current,
      baseline,
      touchedBreakpoints: [{ breakpoint: 'xl', origin: 'explicit' }],
    });

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'INVALID_TOUCHED_LAYOUT',
      'XL_CANONICAL_MISMATCH',
    ]));
  });

  it('reports the exact breakpoint and missing inventory condition for an unverifiable geometry', () => {
    const baseline = dashboard();
    const current = clone(baseline);
    current.responsiveLayouts.root!.xl = current.responsiveLayouts.root!.xl!
      .filter((item) => item.i !== 'root.sensor');

    const result = validateGridEngine2DashboardForSave({
      dashboard: current,
      baseline,
      touchedBreakpoints: [{ breakpoint: 'xl', origin: 'explicit' }],
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'INVALID_TOUCHED_LAYOUT',
      breakpoint: 'xl',
      message: expect.stringMatching(/xl.*ROOT_ID_MISMATCH/),
    }));
  });

  it('blocks silent changes to other breakpoints and Stack children', () => {
    const baseline = dashboard();
    const current = clone(baseline);
    current.responsiveLayouts.root!.xl!.find((item) => item.i === 'root.sensor')!.y = 4;
    current.widgets.find((widget) => widget.id === 'root.sensor')!.layout.y = 4;
    current.responsiveLayouts.root!.lg!.find((item) => item.i === 'root.sensor')!.y = 5;
    current.responsiveLayouts.stacks!['section.stack']!.xl![0].y = 1;

    const result = validateGridEngine2DashboardForSave({
      dashboard: current,
      baseline,
      touchedBreakpoints: [{ breakpoint: 'xl', origin: 'explicit' }],
    });

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'UNTOUCHED_BREAKPOINT_CHANGED',
      'STACK_STRUCTURE_CHANGED',
    ]));
  });

  it('blocks a recovered or otherwise untracked geometry with no touched breakpoint evidence', () => {
    const baseline = dashboard();
    const result = validateGridEngine2DashboardForSave({
      dashboard: clone(baseline),
      baseline,
      touchedBreakpoints: [],
    });

    expect(result.valid).toBe(false);
    expect(result.issues[0]?.code).toBe('NO_TOUCHED_BREAKPOINT');
  });

  it('identifies the exact root inventory change without weakening the save block', () => {
    const baseline = dashboard();
    const current = clone(baseline);
    current.widgets = current.widgets.filter((widget) => widget.id !== 'root.sensor');
    current.widgets.push({
      id: 'root.switch', kind: 'switch', title: 'Switch', entityId: 'switch.test', dataSource: 'mock',
      isOn: false, status: 'off', layout: { i: 'root.switch', x: 0, y: 4, w: 3, h: 1 },
    });

    const result = validateGridEngine2DashboardForSave({
      dashboard: current,
      baseline,
      touchedBreakpoints: [{ breakpoint: 'xl', origin: 'explicit' }],
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'INVENTORY_CHANGED',
      message: expect.stringMatching(/aggiunti: root\.switch.*rimossi o spostati in uno Stack: root\.sensor/),
    }));
  });

  it('accepts an explicit cutover with six fresh root and Stack layouts', () => {
    const baseline = dashboard();
    const current = createGridEngine2HomeConfiguration(baseline);
    const result = validateGridEngine2DashboardForSave({
      dashboard: current,
      baseline,
      touchedBreakpoints: DASHBOARD_GRID_BREAKPOINT_ORDER.map((breakpoint) => ({
        breakpoint,
        origin: 'explicit',
      })),
    });

    expect(result).toEqual({
      valid: true,
      issues: [],
      touchedBreakpoints: DASHBOARD_GRID_BREAKPOINT_ORDER,
    });
  });

  it('blocks a cutover with an incomplete Stack projection', () => {
    const baseline = dashboard();
    const current = createGridEngine2HomeConfiguration(baseline);
    delete current.responsiveLayouts.stacks?.['section.stack']?.sm;
    const result = validateGridEngine2DashboardForSave({
      dashboard: current,
      baseline,
      touchedBreakpoints: DASHBOARD_GRID_BREAKPOINT_ORDER.map((breakpoint) => ({
        breakpoint,
        origin: 'explicit',
      })),
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'MISSING_STACK_LAYOUT',
      id: 'section.stack',
      breakpoint: 'sm',
    }));
  });
});
