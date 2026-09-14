import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHaDashboardLayoutPersistence } from './useHaDashboardLayoutPersistence';
import {
  createNextSharedHouseConfiguration,
  createSharedHouseConfiguration,
  type DashboardLayoutConfiguration,
  type SharedHouseConfiguration,
} from '../services/dashboardConfigurationRepository';
import { DASHBOARD_LAYOUT_STORAGE_VERSION } from '../services/dashboardStorage';
import { HA_DASHBOARD_REVISION_HISTORY_KEY } from '../services/dashboardRevisionHistory';
import {
  HA_DASHBOARD_RESET_MARKER_KEY,
  completeDashboardResetMarker,
  createDashboardResetMarker,
} from '../services/dashboardReset';
import { acknowledgeAuthoritativeDashboardReset } from '../services/dashboardResetClient';

function buildDashboard(title = 'Initial'): DashboardLayoutConfiguration {
  return {
    storageVersion: DASHBOARD_LAYOUT_STORAGE_VERSION,
    sections: [{ id: 'section', kind: 'stack-grid', title, layout: { i: 'section', x: 0, y: 0, w: 4, h: 4 } }],
    widgets: [],
    widgetTypeLayoutOverrides: {},
    widgetLayoutOverrides: {},
    responsiveLayouts: {},
  };
}

function buildDocument(dashboard = buildDashboard()): SharedHouseConfiguration {
  return createSharedHouseConfiguration({
    updatedByUserId: 'owner',
    dashboard,
    security: { alarmEntityId: null, visibleSensorEntityIds: null, visibleCameraEntityIds: null },
    rooms: { customRooms: [], hiddenEntitiesByRoom: {} },
  });
}

describe('useHaDashboardLayoutPersistence', () => {
  afterEach(cleanup);

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('hydrates from HA and marks an edit saved only after server verification', async () => {
    let stored = buildDocument();
    let storedHistory: unknown = null;
    const callApi = vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === 'frontend/get_system_data') {
        return { value: message.key === HA_DASHBOARD_REVISION_HISTORY_KEY ? storedHistory : stored };
      }
      if (message.type === 'frontend/set_system_data') {
        if (message.key === HA_DASHBOARD_REVISION_HISTORY_KEY) storedHistory = message.value;
        else stored = message.value as SharedHouseConfiguration;
        return undefined;
      }
      return null;
    });
    const onHydrate = vi.fn();
    const { result, rerender } = renderHook(
      ({ dashboard }) => useHaDashboardLayoutPersistence({
        active: true,
        isConnected: true,
        canManage: true,
        userId: 'owner',
        callApi,
        dashboard,
        onHydrate,
        debounceMs: 5,
      }),
      { initialProps: { dashboard: buildDashboard('Local') } },
    );

    await waitFor(() => expect(result.current.loadStatus).toBe('ready'));
    const serverDashboard = buildDashboard();
    expect(onHydrate).toHaveBeenCalledWith(serverDashboard);
    rerender({ dashboard: serverDashboard });

    rerender({ dashboard: buildDashboard('Edited') });
    await waitFor(() => expect(result.current.status.phase).toBe('saved'));
    expect(stored.dashboard.sections[0]?.title).toBe('Edited');
    expect(stored.revision).toBe(2);
    expect(callApi.mock.calls.some(([message]) => message.type === 'frontend/set_system_data')).toBe(true);
  });

  it('requires an explicit migration when HA has no Domus UI document', async () => {
    const callApi = vi.fn(async (_message: Record<string, unknown>) => ({ value: null }));
    const { result } = renderHook(() => useHaDashboardLayoutPersistence({
      active: true,
      isConnected: true,
      canManage: true,
      userId: 'owner',
      callApi,
      dashboard: buildDashboard(),
      onHydrate: vi.fn(),
    }));

    await waitFor(() => expect(result.current.loadStatus).toBe('migration_required'));
    await act(async () => {
      await expect(result.current.saveNow()).resolves.toMatchObject({ ok: false, code: 'migration_required' });
    });
    expect(callApi.mock.calls.some(([message]) => message.type === 'frontend/set_system_data')).toBe(false);
  });

  it('recognizes an authoritative reset instead of migrating stale local data', async () => {
    const marker = completeDashboardResetMarker(
      createDashboardResetMarker('owner', 'reset-123456'),
    );
    const callApi = vi.fn(async (message: Record<string, unknown>) => ({
      value: message.key === HA_DASHBOARD_RESET_MARKER_KEY ? marker : null,
    }));
    const onHydrate = vi.fn();
    const onAuthoritativeReset = vi.fn();
    const { result } = renderHook(() => useHaDashboardLayoutPersistence({
      active: true,
      autoSaveEnabled: false,
      isConnected: true,
      canManage: true,
      userId: 'owner',
      callApi,
      dashboard: buildDashboard('Stale local layout'),
      onHydrate,
      onAuthoritativeReset,
    }));

    await waitFor(() => expect(onAuthoritativeReset).toHaveBeenCalledWith(marker));
    expect(onHydrate).not.toHaveBeenCalled();
    expect(result.current.serverRevision).toBeNull();
    expect(result.current.loadStatus).toBe('migration_required');
  });

  it('does not loop back to welcome after the same reset was already acknowledged', async () => {
    const marker = completeDashboardResetMarker(
      createDashboardResetMarker('owner', 'reset-acknowledged'),
    );
    acknowledgeAuthoritativeDashboardReset(window.localStorage, marker);
    const callApi = vi.fn(async (message: Record<string, unknown>) => ({
      value: message.key === HA_DASHBOARD_RESET_MARKER_KEY ? marker : null,
    }));
    const onAuthoritativeReset = vi.fn();
    const { result } = renderHook(() => useHaDashboardLayoutPersistence({
      active: true,
      isConnected: true,
      canManage: true,
      userId: 'owner',
      callApi,
      dashboard: buildDashboard('New setup'),
      onHydrate: vi.fn(),
      onAuthoritativeReset,
    }));

    await waitFor(() => expect(result.current.loadStatus).toBe('migration_required'));
    expect(onAuthoritativeReset).not.toHaveBeenCalled();
  });

  it('detects a reset from another device during a remote update check', async () => {
    let stored: SharedHouseConfiguration | null = buildDocument(buildDashboard('Version 1'));
    let marker: ReturnType<typeof completeDashboardResetMarker> | null = null;
    const callApi = vi.fn(async (message: Record<string, unknown>) => {
      if (message.key === HA_DASHBOARD_RESET_MARKER_KEY) return { value: marker };
      if (message.key === HA_DASHBOARD_REVISION_HISTORY_KEY) return { value: null };
      return { value: stored };
    });
    const onAuthoritativeReset = vi.fn();
    const { result } = renderHook(() => useHaDashboardLayoutPersistence({
      active: true,
      autoSaveEnabled: false,
      isConnected: true,
      canManage: true,
      userId: 'owner',
      callApi,
      dashboard: buildDashboard('Local'),
      onHydrate: vi.fn(),
      onAuthoritativeReset,
      remoteCheckIntervalMs: 60_000,
    }));

    await waitFor(() => expect(result.current.loadStatus).toBe('ready'));
    stored = null;
    marker = completeDashboardResetMarker(
      createDashboardResetMarker('other-owner', 'reset-654321'),
    );
    await act(async () => {
      await expect(result.current.checkForRemoteUpdate()).resolves.toBe(true);
    });
    expect(onAuthoritativeReset).toHaveBeenCalledWith(marker);
  });

  it('hydrates a limited user but never attempts an authoritative write', async () => {
    const stored = buildDocument();
    const callApi = vi.fn(async (_message: Record<string, unknown>) => ({ value: stored }));
    const onHydrate = vi.fn();
    const { result, rerender } = renderHook(
      ({ dashboard }) => useHaDashboardLayoutPersistence({
        active: true,
        isConnected: true,
        canManage: false,
        userId: 'limited',
        callApi,
        dashboard,
        onHydrate,
        debounceMs: 5,
      }),
      { initialProps: { dashboard: buildDashboard('Local') } },
    );

    await waitFor(() => expect(result.current.loadStatus).toBe('read_only'));
    expect(onHydrate).toHaveBeenCalledWith(stored.dashboard);
    rerender({ dashboard: buildDashboard('Forbidden edit') });
    await new Promise((resolve) => window.setTimeout(resolve, 15));
    expect(callApi.mock.calls.some(([message]) => message.type === 'frontend/set_system_data')).toBe(false);
  });

  it('applies a newer Home Assistant revision when the page resumes without a local draft', async () => {
    let stored = buildDocument(buildDashboard('Version 1'));
    const callApi = vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === 'frontend/get_system_data') {
        return { value: message.key === HA_DASHBOARD_REVISION_HISTORY_KEY ? null : stored };
      }
      return undefined;
    });
    const onHydrate = vi.fn();
    const { result } = renderHook(() => useHaDashboardLayoutPersistence({
      active: true,
      autoSaveEnabled: false,
      isConnected: true,
      canManage: true,
      userId: 'owner',
      callApi,
      dashboard: buildDashboard('Local'),
      onHydrate,
      remoteCheckIntervalMs: 60_000,
    }));

    await waitFor(() => expect(result.current.loadStatus).toBe('ready'));
    stored = createNextSharedHouseConfiguration(
      stored,
      { ...stored, dashboard: buildDashboard('Version 2') },
      'other-admin',
    );
    act(() => {
      window.dispatchEvent(new Event('pageshow'));
    });

    await waitFor(() => expect(result.current.serverRevision).toBe(2));
    expect(result.current.pendingRemoteUpdate).toBeNull();
    expect(result.current.lastAppliedRemoteRevision).toBe(2);
    expect(onHydrate).toHaveBeenLastCalledWith(expect.objectContaining({
      sections: [expect.objectContaining({ title: 'Version 2' })],
    }));
  });

  it('does not report its own in-flight publication as a remote update', async () => {
    let stored = buildDocument(buildDashboard('Version 1'));
    let storedHistory: unknown = null;
    let sharedWriteStarted = false;
    let releaseSharedWrite!: () => void;
    const sharedWriteGate = new Promise<void>((resolve) => {
      releaseSharedWrite = resolve;
    });
    const callApi = vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === 'frontend/get_system_data') {
        return { value: message.key === HA_DASHBOARD_REVISION_HISTORY_KEY ? storedHistory : stored };
      }
      if (message.type === 'frontend/set_system_data') {
        if (message.key === HA_DASHBOARD_REVISION_HISTORY_KEY) {
          storedHistory = message.value;
        } else {
          stored = message.value as SharedHouseConfiguration;
          sharedWriteStarted = true;
          await sharedWriteGate;
        }
      }
      return undefined;
    });
    const { result, rerender } = renderHook(
      ({ dashboard }) => useHaDashboardLayoutPersistence({
        active: true,
        autoSaveEnabled: false,
        deferRemoteUpdates: true,
        isConnected: true,
        canManage: true,
        userId: 'owner',
        callApi,
        dashboard,
        onHydrate: vi.fn(),
        remoteCheckIntervalMs: 60_000,
      }),
      { initialProps: { dashboard: buildDashboard('Local') } },
    );

    await waitFor(() => expect(result.current.loadStatus).toBe('ready'));
    rerender({ dashboard: buildDashboard('Version 1') });
    await act(async () => {
      await expect(result.current.saveNow()).resolves.toMatchObject({ ok: true });
    });
    rerender({ dashboard: buildDashboard('My published edit') });

    const savePromise = result.current.saveNow();
    await waitFor(() => expect(sharedWriteStarted).toBe(true));
    await act(async () => {
      await expect(result.current.checkForRemoteUpdate()).resolves.toBe(false);
    });
    expect(result.current.pendingRemoteUpdate).toBeNull();

    releaseSharedWrite();
    await act(async () => {
      await expect(savePromise).resolves.toMatchObject({ ok: true });
    });
    expect(result.current.serverRevision).toBe(2);
    expect(result.current.pendingRemoteUpdate).toBeNull();
  });

  it('acknowledges a publication from the same client without showing it as remote', async () => {
    let stored = buildDocument(buildDashboard('Version 1'));
    const callApi = vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === 'frontend/get_system_data') {
        return { value: message.key === HA_DASHBOARD_REVISION_HISTORY_KEY ? null : stored };
      }
      return undefined;
    });
    const onHydrate = vi.fn();
    const { result } = renderHook(() => useHaDashboardLayoutPersistence({
      active: true,
      autoSaveEnabled: false,
      deferRemoteUpdates: true,
      isConnected: true,
      canManage: true,
      userId: 'owner',
      clientId: 'desktop-client',
      callApi,
      dashboard: buildDashboard('Version 1'),
      onHydrate,
      remoteCheckIntervalMs: 60_000,
    }));

    await waitFor(() => expect(result.current.loadStatus).toBe('ready'));
    const hydrateCallsBeforeCheck = onHydrate.mock.calls.length;
    stored = createNextSharedHouseConfiguration(
      stored,
      { ...stored, dashboard: buildDashboard('Version 2') },
      'owner',
      undefined,
      { source: 'edit', originClientId: 'desktop-client' },
    );

    await act(async () => {
      await expect(result.current.checkForRemoteUpdate()).resolves.toBe(false);
    });
    expect(result.current.serverRevision).toBe(2);
    expect(result.current.pendingRemoteUpdate).toBeNull();
    expect(result.current.lastAppliedRemoteRevision).toBeNull();
    expect(onHydrate).toHaveBeenCalledTimes(hydrateCallsBeforeCheck);
  });

  it('treats a newer server revision with the same local layout as already saved', async () => {
    let stored = buildDocument(buildDashboard('Version 1'));
    const callApi = vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === 'frontend/get_system_data') {
        return { value: message.key === HA_DASHBOARD_REVISION_HISTORY_KEY ? null : stored };
      }
      return undefined;
    });
    const { result, rerender } = renderHook(
      ({ dashboard }) => useHaDashboardLayoutPersistence({
        active: true,
        autoSaveEnabled: false,
        deferRemoteUpdates: true,
        isConnected: true,
        canManage: true,
        userId: 'owner',
        clientId: 'desktop-client',
        callApi,
        dashboard,
        onHydrate: vi.fn(),
        remoteCheckIntervalMs: 60_000,
      }),
      { initialProps: { dashboard: buildDashboard('Local') } },
    );

    await waitFor(() => expect(result.current.loadStatus).toBe('ready'));
    rerender({ dashboard: buildDashboard('Version 1') });
    await act(async () => {
      await expect(result.current.saveNow()).resolves.toMatchObject({ ok: true });
    });

    const draft = buildDashboard('Published draft');
    rerender({ dashboard: draft });
    stored = createNextSharedHouseConfiguration(
      stored,
      { ...stored, dashboard: draft },
      'owner',
      undefined,
      { source: 'edit', originClientId: 'different-runtime-id' },
    );
    callApi.mockClear();

    await act(async () => {
      await expect(result.current.saveNow()).resolves.toMatchObject({ ok: true });
    });
    expect(result.current.serverRevision).toBe(2);
    expect(result.current.pendingRemoteUpdate).toBeNull();
    expect(callApi.mock.calls.some(([message]) => message.type === 'frontend/set_system_data')).toBe(false);
  });

  it('keeps a newer server revision pending while editing and blocks the stale save', async () => {
    let stored = buildDocument(buildDashboard('Version 1'));
    let storedHistory: unknown = null;
    const callApi = vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === 'frontend/get_system_data') {
        return { value: message.key === HA_DASHBOARD_REVISION_HISTORY_KEY ? storedHistory : stored };
      }
      if (message.type === 'frontend/set_system_data') {
        if (message.key === HA_DASHBOARD_REVISION_HISTORY_KEY) storedHistory = message.value;
        else stored = message.value as SharedHouseConfiguration;
      }
      return undefined;
    });
    const onHydrate = vi.fn();
    const { result, rerender } = renderHook(
      ({ dashboard, editing }) => useHaDashboardLayoutPersistence({
        active: true,
        autoSaveEnabled: false,
        deferRemoteUpdates: editing,
        isConnected: true,
        canManage: true,
        userId: 'owner',
        callApi,
        dashboard,
        onHydrate,
        remoteCheckIntervalMs: 60_000,
      }),
      { initialProps: { dashboard: buildDashboard('Local'), editing: true } },
    );

    await waitFor(() => expect(result.current.loadStatus).toBe('ready'));
    stored = createNextSharedHouseConfiguration(
      stored,
      { ...stored, dashboard: buildDashboard('Version 2') },
      'other-admin',
    );
    await act(async () => {
      await expect(result.current.checkForRemoteUpdate()).resolves.toBe(true);
    });

    expect(result.current.serverRevision).toBe(1);
    expect(result.current.pendingRemoteUpdate).toMatchObject({ revision: 2, updatedByUserId: 'other-admin' });
    rerender({ dashboard: buildDashboard('My draft'), editing: true });
    await act(async () => {
      await expect(result.current.saveNow()).resolves.toMatchObject({ ok: false, code: 'server_conflict' });
    });
    expect(stored.revision).toBe(2);

    rerender({ dashboard: buildDashboard('My draft'), editing: false });
    await waitFor(() => expect(result.current.serverRevision).toBe(2));
    expect(result.current.pendingRemoteUpdate).toBeNull();
    expect(onHydrate).toHaveBeenLastCalledWith(expect.objectContaining({
      sections: [expect.objectContaining({ title: 'Version 2' })],
    }));
  });

  it('clears a pending conflict when the local draft already matches that revision', async () => {
    let stored = buildDocument(buildDashboard('Version 1'));
    const callApi = vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === 'frontend/get_system_data') {
        return { value: message.key === HA_DASHBOARD_REVISION_HISTORY_KEY ? null : stored };
      }
      return undefined;
    });
    const { result, rerender } = renderHook(
      ({ dashboard }) => useHaDashboardLayoutPersistence({
        active: true,
        autoSaveEnabled: false,
        deferRemoteUpdates: true,
        isConnected: true,
        canManage: true,
        userId: 'owner',
        clientId: 'desktop-client',
        callApi,
        dashboard,
        onHydrate: vi.fn(),
        remoteCheckIntervalMs: 60_000,
      }),
      { initialProps: { dashboard: buildDashboard('Version 1') } },
    );

    await waitFor(() => expect(result.current.loadStatus).toBe('ready'));
    stored = createNextSharedHouseConfiguration(
      stored,
      { ...stored, dashboard: buildDashboard('Version 2') },
      'owner',
      undefined,
      { source: 'edit', originClientId: 'mobile-client' },
    );
    await act(async () => {
      await expect(result.current.checkForRemoteUpdate()).resolves.toBe(true);
    });
    expect(result.current.pendingRemoteUpdate?.revision).toBe(2);

    rerender({ dashboard: buildDashboard('Version 2') });
    await waitFor(() => expect(result.current.pendingRemoteUpdate).toBeNull());
    expect(result.current.serverRevision).toBe(2);
    expect(result.current.lastAppliedRemoteRevision).toBeNull();
  });

  it('ignores live entity fields while confirming hydration and deciding whether to save', async () => {
    const stored = buildDocument();
    const callApi = vi.fn(async (_message: Record<string, unknown>) => ({ value: stored }));
    const serverDashboard: DashboardLayoutConfiguration = {
      ...stored.dashboard,
      widgets: [{
        id: 'light-card',
        kind: 'light',
        title: 'Lampada',
        entityId: 'light.living_room',
        status: 'Spenta',
        isOn: false,
        value: 0,
        unit: '%',
        layout: { i: 'light-card', x: 0, y: 0, w: 2, h: 2 },
      }],
    };
    stored.dashboard = serverDashboard;
    const liveDashboard: DashboardLayoutConfiguration = {
      ...serverDashboard,
      widgets: [{
        ...serverDashboard.widgets[0],
        status: 'Accesa',
        isOn: true,
        value: 73,
        // Automatic Light expansion is a render normalization, not an edit.
        layout: { ...serverDashboard.widgets[0].layout, h: 4 },
      }],
    };
    const { result, rerender } = renderHook(
      ({ dashboard }) => useHaDashboardLayoutPersistence({
        active: true,
        isConnected: true,
        canManage: true,
        userId: 'owner',
        callApi,
        dashboard,
        onHydrate: vi.fn(),
        debounceMs: 5,
      }),
      { initialProps: { dashboard: buildDashboard('Local') } },
    );

    await waitFor(() => expect(result.current.loadStatus).toBe('ready'));
    rerender({ dashboard: liveDashboard });
    await act(async () => {
      await expect(result.current.saveNow()).resolves.toMatchObject({ ok: true });
    });
    expect(callApi.mock.calls.some(([message]) => message.type === 'frontend/set_system_data')).toBe(false);
  });

  it('transfers the current local layout only after an explicit initialization', async () => {
    let stored: SharedHouseConfiguration | null = null;
    let resetMarker: unknown = null;
    const callApi = vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === 'frontend/get_system_data') {
        return { value: message.key === HA_DASHBOARD_RESET_MARKER_KEY ? resetMarker : stored };
      }
      if (message.type === 'frontend/set_system_data') {
        if (message.key === HA_DASHBOARD_RESET_MARKER_KEY) resetMarker = message.value;
        else stored = message.value as SharedHouseConfiguration;
        return undefined;
      }
      return null;
    });
    const dashboard = buildDashboard('Local layout');
    const { result } = renderHook(() => useHaDashboardLayoutPersistence({
      active: true,
      isConnected: true,
      canManage: true,
      userId: 'owner',
      callApi,
      dashboard,
      onHydrate: vi.fn(),
    }));

    await waitFor(() => expect(result.current.loadStatus).toBe('migration_required'));
    await act(async () => {
      await expect(result.current.initializeFromCurrentDashboard()).resolves.toMatchObject({ ok: true });
    });
    expect(result.current.loadStatus).toBe('ready');
    expect(stored?.dashboard.sections[0]?.title).toBe('Local layout');
  });

  it('can initialize HA with an explicitly supplied dashboard', async () => {
    let stored: SharedHouseConfiguration | null = null;
    let resetMarker: unknown = null;
    const callApi = vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === 'frontend/get_system_data') {
        return { value: message.key === HA_DASHBOARD_RESET_MARKER_KEY ? resetMarker : stored };
      }
      if (message.type === 'frontend/set_system_data') {
        if (message.key === HA_DASHBOARD_RESET_MARKER_KEY) resetMarker = message.value;
        else stored = message.value as SharedHouseConfiguration;
        return undefined;
      }
      return null;
    });
    const { result } = renderHook(() => useHaDashboardLayoutPersistence({
      active: true,
      autoSaveEnabled: false,
      isConnected: true,
      canManage: true,
      userId: 'owner',
      callApi,
      dashboard: buildDashboard('Local layout'),
      onHydrate: vi.fn(),
    }));

    await waitFor(() => expect(result.current.loadStatus).toBe('migration_required'));
    await act(async () => {
      await expect(result.current.initializeDashboard(buildDashboard('Starter layout')))
        .resolves.toMatchObject({ ok: true });
    });
    expect(stored?.dashboard.sections[0]?.title).toBe('Starter layout');
  });

  it('keeps edits local until saveNow when continuous autosave is disabled', async () => {
    let stored = buildDocument();
    let storedHistory: unknown = null;
    const callApi = vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === 'frontend/get_system_data') {
        return { value: message.key === HA_DASHBOARD_REVISION_HISTORY_KEY ? storedHistory : stored };
      }
      if (message.type === 'frontend/set_system_data') {
        if (message.key === HA_DASHBOARD_REVISION_HISTORY_KEY) storedHistory = message.value;
        else stored = message.value as SharedHouseConfiguration;
        return undefined;
      }
      return null;
    });
    const { result, rerender } = renderHook(
      ({ dashboard }) => useHaDashboardLayoutPersistence({
        active: true,
        autoSaveEnabled: false,
        isConnected: true,
        canManage: true,
        userId: 'owner',
        callApi,
        dashboard,
        onHydrate: vi.fn(),
        debounceMs: 5,
      }),
      { initialProps: { dashboard: buildDashboard('Local') } },
    );

    await waitFor(() => expect(result.current.loadStatus).toBe('ready'));
    rerender({ dashboard: buildDashboard() });
    await act(async () => {
      await expect(result.current.saveNow()).resolves.toMatchObject({ ok: true });
    });
    callApi.mockClear();

    rerender({ dashboard: buildDashboard('Draft') });
    await new Promise((resolve) => window.setTimeout(resolve, 20));
    expect(callApi).not.toHaveBeenCalled();

    await act(async () => {
      await expect(result.current.saveNow()).resolves.toMatchObject({ ok: true });
    });
    expect(stored.dashboard.sections[0]?.title).toBe('Draft');
    expect(callApi.mock.calls.some(([message]) => message.type === 'frontend/set_system_data')).toBe(true);
  });

  it('persists an explicitly empty dashboard without waiting for React state', async () => {
    let stored = buildDocument(buildDashboard('Existing dashboard'));
    let storedHistory: unknown = null;
    const callApi = vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === 'frontend/get_system_data') {
        return { value: message.key === HA_DASHBOARD_REVISION_HISTORY_KEY ? storedHistory : stored };
      }
      if (message.type === 'frontend/set_system_data') {
        if (message.key === HA_DASHBOARD_REVISION_HISTORY_KEY) storedHistory = message.value;
        else stored = message.value as SharedHouseConfiguration;
        return undefined;
      }
      return null;
    });
    const { result } = renderHook(() => useHaDashboardLayoutPersistence({
      active: true,
      autoSaveEnabled: false,
      isConnected: true,
      canManage: true,
      userId: 'owner',
      callApi,
      dashboard: buildDashboard('Local dashboard'),
      onHydrate: vi.fn(),
    }));

    await waitFor(() => expect(result.current.loadStatus).toBe('ready'));
    const emptyDashboard: DashboardLayoutConfiguration = {
      ...buildDashboard(),
      sections: [],
      widgets: [],
    };

    await act(async () => {
      await expect(result.current.saveDashboard(emptyDashboard)).resolves.toMatchObject({ ok: true });
    });

    expect(stored.revision).toBe(2);
    expect(stored.dashboard.sections).toEqual([]);
    expect(stored.dashboard.widgets).toEqual([]);
  });

  it('restores an archived layout as a new increasing revision', async () => {
    let stored = buildDocument(buildDashboard('Original'));
    let storedHistory: unknown = null;
    const callApi = vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === 'frontend/get_system_data') {
        return { value: message.key === HA_DASHBOARD_REVISION_HISTORY_KEY ? storedHistory : stored };
      }
      if (message.type === 'frontend/set_system_data') {
        if (message.key === HA_DASHBOARD_REVISION_HISTORY_KEY) storedHistory = message.value;
        else stored = message.value as SharedHouseConfiguration;
      }
      return undefined;
    });
    const onHydrate = vi.fn();
    const { result, rerender } = renderHook(
      ({ dashboard }) => useHaDashboardLayoutPersistence({
        active: true,
        autoSaveEnabled: false,
        isConnected: true,
        canManage: true,
        userId: 'owner',
        callApi,
        dashboard,
        onHydrate,
      }),
      { initialProps: { dashboard: buildDashboard('Local') } },
    );

    await waitFor(() => expect(result.current.loadStatus).toBe('ready'));
    rerender({ dashboard: buildDashboard('Original') });
    await act(async () => {
      await expect(result.current.saveNow()).resolves.toMatchObject({ ok: true });
    });
    rerender({ dashboard: buildDashboard('Updated') });
    await act(async () => {
      await expect(result.current.saveNow()).resolves.toMatchObject({ ok: true });
    });
    await waitFor(() => expect(result.current.revisions.map((entry) => entry.revision)).toEqual([2, 1]));

    await act(async () => {
      await expect(result.current.restoreRevision(1)).resolves.toMatchObject({ ok: true });
    });
    expect(stored.revision).toBe(3);
    expect(stored.publication).toMatchObject({ source: 'rollback', restoredFromRevision: 1 });
    expect(stored.dashboard.sections[0]?.title).toBe('Original');
    expect(onHydrate).toHaveBeenLastCalledWith(expect.objectContaining({
      sections: [expect.objectContaining({ title: 'Original' })],
    }));

    await waitFor(() => expect(result.current.revisions.map((entry) => entry.revision)).toEqual([3, 2, 1]));
    await act(async () => {
      await expect(result.current.restoreRevision(1)).resolves.toMatchObject({ ok: true });
    });
    expect(stored.revision).toBe(4);
    expect(stored.publication).toMatchObject({ source: 'rollback', restoredFromRevision: 1 });
  });
});
