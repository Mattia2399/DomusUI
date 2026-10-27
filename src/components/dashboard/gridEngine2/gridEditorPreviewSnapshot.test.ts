// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { DashboardLayoutConfiguration } from '../../../services/dashboardConfigurationRepository';
import { DASHBOARD_GRID_BREAKPOINT_ORDER } from '../../../types/widgetTypeLayout';
import { colsForBreakpoint } from './responsiveLayout';
import { createGridEditorPreviewModel, type GridEditorPreviewSource } from './gridEditorPreviewSnapshot';

const verifiedSource: GridEditorPreviewSource = {
  phase: 'complete',
  source: 'home-assistant',
  generation: 7,
  revision: 84,
  storageVersion: 14,
  coherent: true,
};

function completeLayouts() {
  return Object.fromEntries(DASHBOARD_GRID_BREAKPOINT_ORDER.map((breakpoint) => {
    const cols = colsForBreakpoint(breakpoint);
    return [breakpoint, [
      { i: 'special', x: 0, y: 0, w: cols, h: 1 },
      { i: 'stack', x: 0, y: 2, w: cols, h: 2 },
      { i: 'root-light', x: 0, y: 5, w: Math.min(2, cols), h: 1 },
    ]];
  }));
}

function dashboard(): DashboardLayoutConfiguration {
  return {
    storageVersion: 14,
    sections: [
      { id: 'special', kind: 'greeting', layout: { i: 'special', x: 0, y: 0, w: 12, h: 1 } },
      { id: 'stack', kind: 'stack-grid', layout: { i: 'stack', x: 0, y: 2, w: 12, h: 2 } },
    ],
    widgets: [
      {
        id: 'root-light', kind: 'light', title: 'Root', entityId: 'light.root', status: 'on', isOn: true,
        layout: { i: 'root-light', x: 0, y: 5, w: 2, h: 1 },
      },
      {
        id: 'stack-child', kind: 'sensor', title: 'Child', entityId: 'sensor.child', status: 'ok', isOn: true,
        parentSectionId: 'stack', layout: { i: 'stack-child', x: 0, y: 0, w: 2, h: 1 },
      },
    ],
    widgetTypeLayoutOverrides: {},
    widgetLayoutOverrides: {},
    responsiveLayouts: { root: completeLayouts() },
  };
}

describe('editor Grid Engine preview snapshot', () => {
  it('projects roots, Stack containers, special sections, and explicit layouts from an immutable copy', () => {
    const source = dashboard();
    const before = structuredClone(source);
    const model = createGridEditorPreviewModel({ dashboard: source, source: verifiedSource, hasUnsavedEdits: false });

    expect(model.baseline).toMatchObject({
      kind: 'verified-source-copy',
      geometry: 'complete',
      previewAuthority: 'non-authoritative',
    });
    expect(model.inventory).toEqual({
      rootElementCount: 3,
      rootWidgetCount: 1,
      stackContainerCount: 1,
      stackChildCount: 1,
      specialSectionCount: 1,
      orphanStackChildCount: 0,
    });
    expect(model.scenario?.items.map((item) => item.i)).toEqual(['special', 'stack', 'root-light']);
    expect(model.scenario?.itemKinds).toEqual({
      special: 'special-section',
      stack: 'stack-root',
      'root-light': 'light',
    });
    expect(model.scenario?.initialLayouts?.xs).toEqual(source.responsiveLayouts.root?.xs);
    expect(model.runtimeDimensionsIncluded).toBe(false);
    expect(model.groupsSupported).toBe(false);
    expect(source).toEqual(before);
  });

  it('keeps valid root geometry visible when legacy IDs make a breakpoint provisional', () => {
    const source = dashboard();
    source.responsiveLayouts.root!.xs = [
      { i: 'special', x: 0, y: 0, w: 2, h: 1 },
      { i: 'stack', x: 0, y: 2, w: 2, h: 2 },
      { i: 'root-light', x: 0, y: 5, w: 2, h: 1 },
      { i: 'legacy.deleted', x: 0, y: 2, w: 2, h: 1 },
    ];
    delete source.responsiveLayouts.root!.sm;
    const model = createGridEditorPreviewModel({
      dashboard: source,
      source: { ...verifiedSource, phase: 'refreshing', coherent: false, reason: 'awaiting-react-commit' },
      hasUnsavedEdits: false,
    });

    expect(model.baseline.kind).toBe('reconciled-provisional');
    expect(model.baseline.geometry).toBe('incomplete');
    expect(model.breakpointStatus.xs).toMatchObject({
      state: 'incomplete',
      itemCount: 4,
      validItemCount: 3,
      unknownIds: ['legacy.deleted'],
      missingIds: [],
    });
    expect(model.breakpointStatus.sm.state).toBe('missing');
    expect(model.unknownLegacyIds).toEqual(['legacy.deleted']);
    expect(model.scenario?.missingBreakpoints).toContain('sm');
    expect(model.scenario?.missingBreakpoints).not.toContain('xs');
    expect(model.scenario?.initialLayouts?.xs).toBeUndefined();
    expect(model.scenario?.provisionalLayouts?.xs).toEqual([
      { i: 'special', x: 0, y: 0, w: 2, h: 1 },
      { i: 'stack', x: 0, y: 2, w: 2, h: 2 },
      { i: 'root-light', x: 0, y: 5, w: 2, h: 1 },
    ]);
    expect(model.geometryAudit.breakpoints.xs.rows[0]).toMatchObject({
      source: 'draft-explicit',
      status: 'provisional',
      alignment: 'unavailable',
    });
    expect(model.geometryAudit.breakpoints.sm.rows[0]).toMatchObject({
      source: 'missing',
      status: 'missing',
    });
  });

  it('uses the effective editor/RGL geometry for BEFORE while retaining draft and HA coordinates', () => {
    const persisted = dashboard();
    const draft = structuredClone(persisted);
    draft.responsiveLayouts.root!.xs = [
      { i: 'special', x: 0, y: 4, w: 2, h: 1 },
      { i: 'stack', x: 0, y: 7, w: 2, h: 2 },
      { i: 'root-light', x: 0, y: 12, w: 2, h: 1 },
    ];
    const effectiveXs = [
      { i: 'special', x: 0, y: 0, w: 2, h: 1 },
      { i: 'stack', x: 0, y: 1, w: 2, h: 2 },
      { i: 'root-light', x: 0, y: 3, w: 2, h: 2 },
    ];

    const model = createGridEditorPreviewModel({
      dashboard: draft,
      persistedDashboard: persisted,
      editorGeometry: {
        breakpoint: 'xs',
        cols: 2,
        gridWidth: 360,
        layouts: { xs: effectiveXs },
      },
      source: verifiedSource,
      hasUnsavedEdits: true,
    });

    expect(model.scenario?.initialLayouts?.xs).toEqual(effectiveXs);
    expect(model.geometryAudit).toMatchObject({
      editorCaptureAvailable: true,
      capturedBreakpoint: 'xs',
      capturedGridWidth: 360,
      persistedSnapshotAvailable: true,
    });
    expect(model.runtimeDimensionsIncluded).toBe(false);
    expect(model.runtimeGridSpansIncluded).toBe(true);
    const light = model.geometryAudit.breakpoints.xs.rows.find((row) => row.id === 'root-light');
    expect(light).toMatchObject({
      source: 'editor-effective',
      editor: { i: 'root-light', x: 0, y: 3, w: 2, h: 2 },
      draft: { i: 'root-light', x: 0, y: 12, w: 2, h: 1 },
      persisted: { i: 'root-light', x: 0, y: 5, w: 2, h: 1 },
      before: { i: 'root-light', x: 0, y: 3, w: 2, h: 2 },
      after: { i: 'root-light', x: 0, y: 3, w: 2, h: 2 },
      status: 'complete',
      alignment: 'aligned',
      mismatches: ['draft/editor', 'HA/draft'],
    });
    expect(draft.responsiveLayouts.root!.xs![2].y).toBe(12);
    expect(persisted.responsiveLayouts.root!.xs![2].y).toBe(5);
  });

  it('identifies a root New alarm and a Stack child without inventing either relationship', () => {
    const source = dashboard();
    source.widgets.push(
      {
        id: 'alarm.custom_12', kind: 'alarm', title: 'New alarm', entityId: 'alarm_control_panel.home',
        status: 'NON DISPONIBILE', isOn: false, layout: { i: 'alarm.custom_12', x: 2, y: 5, w: 2, h: 1 },
      },
      {
        id: 'alarm.custom_13', kind: 'alarm', title: 'Nested alarm', entityId: 'alarm_control_panel.garage',
        status: 'NON DISPONIBILE', isOn: false, parentSectionId: 'stack',
        layout: { i: 'alarm.custom_13', x: 0, y: 1, w: 2, h: 1 },
      },
    );
    for (const breakpoint of DASHBOARD_GRID_BREAKPOINT_ORDER) {
      const cols = colsForBreakpoint(breakpoint);
      source.responsiveLayouts.root![breakpoint]!.push({
        i: 'alarm.custom_12', x: 0, y: 8, w: Math.min(2, cols), h: 1,
      });
    }

    const model = createGridEditorPreviewModel({
      dashboard: source,
      source: verifiedSource,
      hasUnsavedEdits: true,
    });

    expect(model.scenario?.items.map((item) => item.i)).toContain('alarm.custom_12');
    expect(model.scenario?.items.map((item) => item.i)).not.toContain('alarm.custom_13');
    expect(model.inventoryEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'alarm.custom_12', title: 'New alarm', kind: 'alarm', role: 'root-widget',
        parentId: null, previewRepresentation: 'direct',
      }),
      expect.objectContaining({
        id: 'alarm.custom_13', title: 'Nested alarm', kind: 'alarm', role: 'stack-child',
        parentId: 'stack', previewRepresentation: 'via-parent',
      }),
    ]));
  });

  it('filters duplicate and invalid entries without inventing missing root geometry', () => {
    const source = dashboard();
    source.responsiveLayouts.root!.lg = [
      { i: 'special', x: 1, y: 7, w: 3, h: 1 },
      { i: 'special', x: 2, y: 9, w: 3, h: 1 },
      { i: 'stack', x: 7, y: 2, w: 2, h: 2 },
    ];
    const model = createGridEditorPreviewModel({
      dashboard: source,
      source: verifiedSource,
      hasUnsavedEdits: false,
    });

    expect(model.breakpointStatus.lg).toMatchObject({
      state: 'incomplete',
      validItemCount: 1,
      missingIds: ['root-light'],
      invalidIds: ['stack'],
    });
    expect(model.scenario?.provisionalLayouts?.lg).toEqual([
      { i: 'special', x: 1, y: 7, w: 3, h: 1 },
    ]);
  });

  it('marks an unsaved editor state as a draft even when the source snapshot is verified', () => {
    const model = createGridEditorPreviewModel({ dashboard: dashboard(), source: verifiedSource, hasUnsavedEdits: true });
    expect(model.baseline.kind).toBe('editor-draft');
    expect(model.baseline.previewAuthority).toBe('non-authoritative');
  });

  it('does not touch HA, network, localStorage, or sessionStorage', () => {
    const fetch = vi.fn();
    const setItem = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('localStorage', { setItem });
    vi.stubGlobal('sessionStorage', { setItem });
    try {
      createGridEditorPreviewModel({ dashboard: dashboard(), source: verifiedSource, hasUnsavedEdits: false });
      expect(fetch).not.toHaveBeenCalled();
      expect(setItem).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('contains no repository, persistence, fingerprint, lineage, or renderer dependency', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/dashboard/gridEngine2/gridEditorPreviewSnapshot.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/\bsave\w*\s*\(|setItem\s*\(|callApi\s*\(|fetch\s*\(/u);
    expect(source).not.toMatch(/fingerprint|lineage|PolicyConfigurationV1/u);
    expect(source).not.toMatch(/GridCanvas|MainBoard|GridEngineRootRenderer|RuntimeRenderDecision/u);
  });
});
