import { beforeEach, describe, expect, it } from 'vitest';
import type { DashboardLayoutConfiguration } from './dashboardConfigurationRepository';
import {
  discardDashboardEditDraft,
  getDashboardEditDraftKey,
  GRID_ENGINE_2_EXPERIMENTAL_PERSISTENCE_PROTECTION,
  readDashboardEditDraft,
  saveDashboardEditDraft,
} from './dashboardEditDraft';

const dashboard: DashboardLayoutConfiguration = {
  storageVersion: 14,
  sections: [],
  widgets: [{
    id: 'lock',
    kind: 'lock',
    title: 'Porta',
    entityId: 'lock.porta',
    status: 'Chiusa',
    isOn: true,
    value: 90,
    layout: { i: 'lock', x: 0, y: 0, w: 1, h: 2 },
    lockCode: '2580',
  } as never],
  widgetTypeLayoutOverrides: {},
  widgetLayoutOverrides: {},
  responsiveLayouts: {},
};

describe('dashboard edit draft', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('round-trips a draft without runtime values or secrets', () => {
    saveDashboardEditDraft(window.sessionStorage, {
      runtimeMode: 'real',
      createdAt: 100,
      baseRevision: 7,
      dashboard,
    });

    const raw = JSON.parse(window.sessionStorage.getItem(getDashboardEditDraftKey('real')) ?? '{}');
    expect(raw.dashboard.widgets[0].lockCode).toBeUndefined();
    expect(raw.dashboard.widgets[0].status).toBeUndefined();
    expect(raw.dashboard.widgets[0].value).toBeUndefined();
    expect(readDashboardEditDraft(window.sessionStorage, 'real')).toMatchObject({
      runtimeMode: 'real',
      createdAt: 100,
      baseRevision: 7,
      dashboard: { widgets: [{ status: 'unavailable', isOn: false }] },
    });
  });

  it('keeps demo and real drafts isolated and supports explicit removal', () => {
    saveDashboardEditDraft(window.sessionStorage, {
      runtimeMode: 'demo',
      createdAt: 200,
      baseRevision: null,
      dashboard,
    });
    expect(readDashboardEditDraft(window.sessionStorage, 'real')).toBeNull();
    expect(readDashboardEditDraft(window.sessionStorage, 'demo')).not.toBeNull();
    discardDashboardEditDraft(window.sessionStorage, 'demo');
    expect(readDashboardEditDraft(window.sessionStorage, 'demo')).toBeNull();
  });

  it('round-trips the experimental persistence guard through recovery metadata', () => {
    saveDashboardEditDraft(window.sessionStorage, {
      runtimeMode: 'real',
      createdAt: 300,
      baseRevision: 9,
      persistenceProtection: GRID_ENGINE_2_EXPERIMENTAL_PERSISTENCE_PROTECTION,
      dashboard,
    });

    expect(readDashboardEditDraft(window.sessionStorage, 'real')).toMatchObject({
      persistenceProtection: GRID_ENGINE_2_EXPERIMENTAL_PERSISTENCE_PROTECTION,
    });
  });
});
