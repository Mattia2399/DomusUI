import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DASHBOARD_LAYOUT_STORAGE_KEY } from './configBackup';
import { loadDashboardLayout, saveDashboardLayout } from './dashboardStorage';
import {
  LEGACY_WIDGET_SECRETS_STORAGE_KEY,
  WIDGET_SECRETS_STORAGE_KEY,
  getWidgetSecrets,
  initializeWidgetSecrets,
  setWidgetSecrets,
  setWidgetSecretsRemembered,
} from './widgetSecrets';
import type { DashboardSection, Widget } from '../types/dashboardModels';

function buildWidget(overrides: Partial<Widget>): Widget {
  return {
    id: 'alarm-1',
    kind: 'alarm',
    title: 'Allarme',
    entityId: 'alarm_control_panel.home_alarm',
    status: 'Disinserito',
    isOn: false,
    layout: { i: overrides.id ?? 'alarm-1', x: 0, y: 0, w: 2, h: 2 },
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  initializeWidgetSecrets(window.localStorage);
});

describe('dashboard storage widget secrets', () => {
  it('keeps a clean real installation empty and seeds only the explicit Demo', () => {
    const realLayout = loadDashboardLayout('real');
    const demoLayout = loadDashboardLayout('demo');

    expect(realLayout.sections).toEqual([]);
    expect(realLayout.widgets).toEqual([]);
    expect(demoLayout.sections.length).toBeGreaterThan(0);
    expect(demoLayout.widgets.length).toBeGreaterThan(0);
    expect(demoLayout.widgets.every((widget) => widget.dataSource === 'mock')).toBe(true);
  });

  it('never restores a persisted mock source inside the real runtime', () => {
    window.localStorage.setItem(
      DASHBOARD_LAYOUT_STORAGE_KEY,
      JSON.stringify({
        version: 14,
        sections: [],
        widgets: [buildWidget({ dataSource: 'mock' })],
      }),
    );

    expect(loadDashboardLayout('real').widgets[0]?.dataSource).toBe('ha');
    expect(loadDashboardLayout('demo').widgets[0]?.dataSource).toBe('mock');
  });

  it('reports a successful layout write instead of failing silently', () => {
    const result = saveDashboardLayout([], [], {}, {}, {}, 'demo');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.savedAt).toBeGreaterThan(0);
      expect(result.bytes).toBeGreaterThan(0);
      expect(window.localStorage.getItem(result.storageKey)).not.toBeNull();
    }
  });

  it('keeps an intentionally empty canvas empty after reload', () => {
    expect(saveDashboardLayout([], [], {}, {}, {}, 'demo').ok).toBe(true);

    const restored = loadDashboardLayout('demo');

    expect(restored.sections).toEqual([]);
    expect(restored.widgets).toEqual([]);
  });

  it('reports exhausted browser storage without throwing', () => {
    const setItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('Storage full', 'QuotaExceededError');
      });

    try {
      const result = saveDashboardLayout([], [], {}, {}, {}, 'demo');

      expect(result).toMatchObject({ ok: false, code: 'quota_exceeded' });
    } finally {
      setItemSpy.mockRestore();
    }
  });

  it('preserves the compact geometry of an automatic grid stack', () => {
    const section: DashboardSection = {
      id: 'stack-auto',
      kind: 'stack-grid',
      stackColumnsMode: 'auto',
      layout: { i: 'stack-auto', x: 0, y: 0, w: 1, h: 2 },
    };

    saveDashboardLayout([section], []);

    const restored = loadDashboardLayout().sections[0];
    expect(restored?.layout).toMatchObject({ w: 1, h: 2 });
  });

  it('preserves an explicit manual placement policy across reloads', () => {
    saveDashboardLayout([], [buildWidget({ placementPolicy: 'manual', isFavorite: true })]);

    const restored = loadDashboardLayout();

    expect(restored.widgets[0]?.placementPolicy).toBe('manual');
    expect(restored.widgets[0]?.parentSectionId).toBeUndefined();
  });

  it('keeps widget codes in memory by default and clears them on reload', () => {
    const widgets = [
      buildWidget({ id: 'alarm-1' }),
      buildWidget({
        id: 'lock-1',
        kind: 'lock',
        title: 'Porta',
        entityId: 'lock.front_door',
      }),
    ];
    setWidgetSecrets('alarm-1', { alarmUnlockCode: '1234', alarmLocalExtraCode: '99' });
    setWidgetSecrets('lock-1', { lockCode: '2580' });

    saveDashboardLayout([], widgets);

    const storedLayout = JSON.parse(window.localStorage.getItem(DASHBOARD_LAYOUT_STORAGE_KEY) ?? '{}');

    expect(storedLayout.widgets[0].alarmUnlockCode).toBeUndefined();
    expect(storedLayout.widgets[0].alarmLocalExtraCode).toBeUndefined();
    expect(storedLayout.widgets[1].lockCode).toBeUndefined();
    expect(window.localStorage.getItem(WIDGET_SECRETS_STORAGE_KEY)).toBeNull();
    expect(getWidgetSecrets('alarm-1')).toMatchObject({ alarmUnlockCode: '1234', alarmLocalExtraCode: '99' });

    loadDashboardLayout();
    expect(getWidgetSecrets('alarm-1')).toEqual({});
    expect(getWidgetSecrets('lock-1')).toEqual({});
  });

  it('hydrates only codes explicitly remembered on this device', () => {
    saveDashboardLayout([], [buildWidget({ id: 'alarm-remembered' })]);
    setWidgetSecrets('alarm-remembered', { alarmUnlockCode: '4321', alarmLocalExtraCode: '77' });
    setWidgetSecretsRemembered('alarm-remembered', true, window.localStorage);

    initializeWidgetSecrets(window.localStorage);

    expect(getWidgetSecrets('alarm-remembered')).toMatchObject({
      alarmUnlockCode: '4321',
      alarmLocalExtraCode: '77',
    });
  });

  it('discards legacy widget codes and removes the v1 secret archive', () => {
    window.localStorage.setItem(LEGACY_WIDGET_SECRETS_STORAGE_KEY, JSON.stringify({ widgets: { old: { lockCode: '9999' } } }));
    window.localStorage.setItem(
      DASHBOARD_LAYOUT_STORAGE_KEY,
      JSON.stringify({
        version: 14,
        sections: [],
        widgets: [
          {
            ...buildWidget({
            id: 'alarm-legacy',
            }),
            alarmUnlockCode: '4321',
            alarmLocalExtraCode: '77',
          },
        ],
      }),
    );

    const restored = loadDashboardLayout();
    const restoredWidget = restored.widgets.find((widget) => widget.id === 'alarm-legacy') as unknown as Record<string, unknown>;
    expect(restoredWidget.alarmUnlockCode).toBeUndefined();
    expect(restoredWidget.alarmLocalExtraCode).toBeUndefined();
    expect(getWidgetSecrets('alarm-legacy')).toEqual({});
    expect(window.localStorage.getItem(LEGACY_WIDGET_SECRETS_STORAGE_KEY)).toBeNull();
  });
});
