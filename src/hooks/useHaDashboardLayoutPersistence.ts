import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DashboardLayoutSaveStatus } from './useDashboardLayoutPersistence';
import {
  createSharedHouseConfiguration,
  createNextSharedHouseConfiguration,
  type DashboardConfigurationCache,
  type DashboardConfigurationLoadResult,
  type DashboardLayoutConfiguration,
  type DashboardRevisionSource,
  type SharedHouseConfiguration,
} from '../services/dashboardConfigurationRepository';
import {
  createHaDashboardConfigurationRepository,
  type DashboardHaApiCaller,
} from '../services/haDashboardConfigurationRepository';
import { createLocalDashboardConfigurationCache } from '../services/localDashboardConfigurationCache';
import {
  DASHBOARD_LAYOUT_STORAGE_VERSION,
  saveDashboardLayout,
  type DashboardLayoutSaveErrorCode,
  type DashboardLayoutSaveResult,
} from '../services/dashboardStorage';
import { createDashboardStructuralFingerprint } from '../services/dashboardPersistenceProjection';
import {
  createDashboardRevisionRecord,
  type DashboardRevisionRecord,
  type DashboardRevisionHistoryStatus,
} from '../services/dashboardRevisionHistory';
import type {
  DashboardResetMarker,
  DashboardResetProgressReporter,
} from '../services/dashboardReset';
import { isAuthoritativeDashboardResetAcknowledged } from '../services/dashboardResetClient';

export type HaDashboardLayoutLoadStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'migration_required'
  | 'read_only'
  | 'offline'
  | 'unsupported'
  | 'error';

type UseHaDashboardLayoutPersistenceInput = {
  active: boolean;
  /** Loading remains active outside Edit Mode, while structural autosave does not. */
  autoSaveEnabled?: boolean;
  /** Keep a newer server revision pending while the local editor owns a draft. */
  deferRemoteUpdates?: boolean;
  isConnected: boolean;
  canManage: boolean;
  userId: string | null;
  callApi: DashboardHaApiCaller;
  dashboard: DashboardLayoutConfiguration;
  onHydrate: (dashboard: DashboardLayoutConfiguration) => void;
  onAuthoritativeReset?: (marker: DashboardResetMarker) => void;
  debounceMs?: number;
  remoteCheckIntervalMs?: number;
  /** Stable injection point for tests; production creates one id per mounted client. */
  clientId?: string;
};

export type DashboardRemoteUpdate = {
  revision: number;
  updatedAt: string;
  updatedByUserId: string;
};

function dashboardSignature(dashboard: DashboardLayoutConfiguration) {
  return createDashboardStructuralFingerprint(dashboard);
}

const DASHBOARD_CLIENT_ID_SESSION_KEY = 'premium-home.dashboard.client-id.v1';
const DEFAULT_REMOTE_CHECK_INTERVAL_MS = 120_000;

function createDashboardClientId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `dashboard-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function getOrCreateDashboardClientId() {
  if (typeof window === 'undefined') return createDashboardClientId();
  try {
    const existing = window.sessionStorage.getItem(DASHBOARD_CLIENT_ID_SESSION_KEY)?.trim();
    if (existing && existing.length <= 128) return existing;
    const created = createDashboardClientId();
    window.sessionStorage.setItem(DASHBOARD_CLIENT_ID_SESSION_KEY, created);
    return created;
  } catch {
    return createDashboardClientId();
  }
}

function errorResult(code: DashboardLayoutSaveErrorCode): DashboardLayoutSaveResult {
  return { ok: false, attemptedAt: Date.now(), code };
}

function errorCodeFromLoad(result: DashboardConfigurationLoadResult): DashboardLayoutSaveErrorCode {
  if (result.status === 'unauthorized') return 'server_unauthorized';
  if (result.status === 'unsupported') return 'server_unsupported';
  return 'server_unavailable';
}

function statusFromResult(result: DashboardLayoutSaveResult): DashboardLayoutSaveStatus {
  return result.ok === true
    ? { phase: 'saved', savedAt: result.savedAt }
    : { phase: 'error', attemptedAt: result.attemptedAt, code: result.code };
}

/**
 * Keeps Home Assistant as the authority for the real dashboard layout. The
 * browser copy is written only after HA has accepted and returned the same
 * document, so it remains a cache and can never produce a false “saved” state.
 */
export function useHaDashboardLayoutPersistence({
  active,
  autoSaveEnabled = true,
  deferRemoteUpdates = false,
  isConnected,
  canManage,
  userId,
  callApi,
  dashboard,
  onHydrate,
  onAuthoritativeReset,
  debounceMs = 700,
  remoteCheckIntervalMs = DEFAULT_REMOTE_CHECK_INTERVAL_MS,
  clientId,
}: UseHaDashboardLayoutPersistenceInput) {
  const clientIdRef = useRef(clientId?.trim() || getOrCreateDashboardClientId());
  const connectionRef = useRef(isConnected);
  const permissionRef = useRef(canManage);
  const callApiRef = useRef(callApi);
  const hydrateRef = useRef(onHydrate);
  const authoritativeResetRef = useRef(onAuthoritativeReset);
  const deferRemoteUpdatesRef = useRef(deferRemoteUpdates);
  connectionRef.current = isConnected;
  permissionRef.current = canManage;
  callApiRef.current = callApi;
  hydrateRef.current = onHydrate;
  authoritativeResetRef.current = onAuthoritativeReset;
  deferRemoteUpdatesRef.current = deferRemoteUpdates;

  const repository = useMemo(
    () => createHaDashboardConfigurationRepository({
      callApi: (message, options) => callApiRef.current(message, options),
      isConnected: () => connectionRef.current,
      canManageSharedConfiguration: () => permissionRef.current,
    }),
    [],
  );
  const cache = useMemo<DashboardConfigurationCache | null>(
    () => (typeof window === 'undefined' ? null : createLocalDashboardConfigurationCache(window.localStorage)),
    [],
  );
  const [loadStatus, setLoadStatus] = useState<HaDashboardLayoutLoadStatus>('idle');
  const [status, setStatus] = useState<DashboardLayoutSaveStatus>({ phase: 'idle' });
  const [serverRevision, setServerRevision] = useState<number | null>(null);
  const [publishedRevision, setPublishedRevision] = useState<DashboardRevisionRecord | null>(null);
  const [revisionHistory, setRevisionHistory] = useState<DashboardRevisionRecord[]>([]);
  const [revisionHistoryStatus, setRevisionHistoryStatus] = useState<DashboardRevisionHistoryStatus>('idle');
  const [pendingRemoteUpdate, setPendingRemoteUpdate] = useState<DashboardRemoteUpdate | null>(null);
  const [lastAppliedRemoteRevision, setLastAppliedRemoteRevision] = useState<number | null>(null);
  const documentRef = useRef<SharedHouseConfiguration | null>(null);
  const pendingRemoteDocumentRef = useRef<SharedHouseConfiguration | null>(null);
  const pendingLocalPublicationRef = useRef<{ revision: number; updatedAt: string } | null>(null);
  const dashboardRef = useRef(dashboard);
  const remoteCheckInFlightRef = useRef(false);
  const persistedSignatureRef = useRef('');
  const awaitingHydrationRef = useRef(false);
  const conflictRef = useRef(false);
  const saveChainRef = useRef<Promise<DashboardLayoutSaveResult>>(Promise.resolve(errorResult('server_unavailable')));
  const pendingSaveTimeoutRef = useRef<number | null>(null);
  const handledResetIdRef = useRef<string | null>(null);
  dashboardRef.current = dashboard;

  const handleAuthoritativeReset = useCallback((marker: DashboardResetMarker) => {
    if (handledResetIdRef.current === marker.resetId) return;
    handledResetIdRef.current = marker.resetId;
    if (pendingSaveTimeoutRef.current !== null) {
      window.clearTimeout(pendingSaveTimeoutRef.current);
      pendingSaveTimeoutRef.current = null;
    }
    cache?.clearSharedHouseConfiguration();
    documentRef.current = null;
    pendingRemoteDocumentRef.current = null;
    pendingLocalPublicationRef.current = null;
    persistedSignatureRef.current = '';
    awaitingHydrationRef.current = false;
    conflictRef.current = false;
    setServerRevision(null);
    setPublishedRevision(null);
    setRevisionHistory([]);
    setRevisionHistoryStatus('ready');
    setPendingRemoteUpdate(null);
    setLastAppliedRemoteRevision(null);
    setStatus({ phase: 'idle' });
    setLoadStatus('migration_required');
    authoritativeResetRef.current?.(marker);
  }, [cache]);

  useEffect(() => {
    if (!active) {
      setLoadStatus('idle');
      setStatus({ phase: 'idle' });
      documentRef.current = null;
      setServerRevision(null);
      setPublishedRevision(null);
      setRevisionHistory([]);
      setRevisionHistoryStatus('idle');
      setPendingRemoteUpdate(null);
      setLastAppliedRemoteRevision(null);
      pendingRemoteDocumentRef.current = null;
      pendingLocalPublicationRef.current = null;
      remoteCheckInFlightRef.current = false;
      persistedSignatureRef.current = '';
      awaitingHydrationRef.current = false;
      conflictRef.current = false;
      handledResetIdRef.current = null;
      return;
    }
    if (!isConnected || !userId) {
      setLoadStatus('offline');
      return;
    }

    let cancelled = false;
    setLoadStatus('loading');
    setStatus({ phase: 'idle' });
    void Promise.all([
      repository.loadSharedHouseConfiguration(),
      repository.loadDashboardResetMarker(),
    ]).then(([result, resetMarkerResult]) => {
      if (cancelled) return;
      if (result.status === 'found') {
        if (result.document.dashboard.storageVersion !== DASHBOARD_LAYOUT_STORAGE_VERSION) {
          setLoadStatus('error');
          setStatus(statusFromResult(errorResult('server_unsupported')));
          return;
        }
        documentRef.current = result.document;
        setServerRevision(result.document.revision);
        setPublishedRevision(createDashboardRevisionRecord(result.document));
        persistedSignatureRef.current = dashboardSignature(result.document.dashboard);
        awaitingHydrationRef.current = true;
        conflictRef.current = false;
        cache?.saveSharedHouseConfiguration(result.document);
        hydrateRef.current(result.document.dashboard);
        saveDashboardLayout(
          result.document.dashboard.sections,
          result.document.dashboard.widgets,
          result.document.dashboard.widgetTypeLayoutOverrides,
          result.document.dashboard.responsiveLayouts,
          result.document.dashboard.widgetLayoutOverrides,
          'real',
        );
        setLoadStatus(canManage ? 'ready' : 'read_only');
        if (canManage) {
          setRevisionHistoryStatus('loading');
          void repository.loadDashboardRevisionHistory().then((historyResult) => {
            if (cancelled) return;
            if (historyResult.status === 'found') {
              setRevisionHistory(historyResult.document.entries);
              setRevisionHistoryStatus('ready');
            } else if (historyResult.status === 'empty') {
              setRevisionHistory([]);
              setRevisionHistoryStatus('ready');
            } else {
              setRevisionHistory([]);
              setRevisionHistoryStatus(
                historyResult.status === 'offline' || historyResult.status === 'unsupported'
                  ? historyResult.status
                  : 'error',
              );
            }
          });
        }
        return;
      }
      documentRef.current = null;
      setServerRevision(null);
      setPublishedRevision(null);
      persistedSignatureRef.current = '';
      awaitingHydrationRef.current = false;
      if (result.status === 'empty') {
        if (resetMarkerResult.status === 'found') {
          const alreadyAcknowledged = typeof window !== 'undefined' &&
            isAuthoritativeDashboardResetAcknowledged(
              window.localStorage,
              resetMarkerResult.marker,
            );
          if (!alreadyAcknowledged) {
            handleAuthoritativeReset(resetMarkerResult.marker);
            return;
          }
        }
        if (
          resetMarkerResult.status !== 'found' &&
          resetMarkerResult.status !== 'empty' &&
          resetMarkerResult.status !== 'unsupported'
        ) {
          setLoadStatus(resetMarkerResult.status === 'offline' ? 'offline' : 'error');
          setStatus(statusFromResult(errorResult('server_unavailable')));
          return;
        }
        setLoadStatus(canManage ? 'migration_required' : 'read_only');
        if (canManage) setStatus(statusFromResult(errorResult('migration_required')));
        return;
      }
      if (result.status === 'offline') {
        const cached = cache?.loadSharedHouseConfiguration();
        if (cached?.dashboard.storageVersion === DASHBOARD_LAYOUT_STORAGE_VERSION) {
          hydrateRef.current(cached.dashboard);
        }
        setLoadStatus('offline');
        return;
      }
      setLoadStatus(result.status === 'unsupported' ? 'unsupported' : 'error');
      setStatus(statusFromResult(errorResult(errorCodeFromLoad(result))));
    });

    return () => {
      cancelled = true;
    };
  }, [active, cache, canManage, handleAuthoritativeReset, isConnected, repository, userId]);

  const applyRemoteDocument = useCallback((document: SharedHouseConfiguration) => {
    documentRef.current = document;
    setServerRevision(document.revision);
    setPublishedRevision(createDashboardRevisionRecord(document));
    persistedSignatureRef.current = dashboardSignature(document.dashboard);
    awaitingHydrationRef.current = true;
    conflictRef.current = false;
    pendingRemoteDocumentRef.current = null;
    setPendingRemoteUpdate(null);
    setLastAppliedRemoteRevision(document.revision);
    cache?.saveSharedHouseConfiguration(document);
    hydrateRef.current(document.dashboard);
    saveDashboardLayout(
      document.dashboard.sections,
      document.dashboard.widgets,
      document.dashboard.widgetTypeLayoutOverrides,
      document.dashboard.responsiveLayouts,
      document.dashboard.widgetLayoutOverrides,
      'real',
    );
    setLoadStatus(permissionRef.current ? 'ready' : 'read_only');
  }, [cache]);

  const registerPendingRemoteDocument = useCallback((document: SharedHouseConfiguration) => {
    pendingRemoteDocumentRef.current = document;
    conflictRef.current = true;
    setPendingRemoteUpdate({
      revision: document.revision,
      updatedAt: document.updatedAt,
      updatedByUserId: document.updatedByUserId,
    });
  }, []);

  const acknowledgeOwnPublication = useCallback((document: SharedHouseConfiguration) => {
    documentRef.current = document;
    setServerRevision(document.revision);
    setPublishedRevision(createDashboardRevisionRecord(document));
    persistedSignatureRef.current = dashboardSignature(document.dashboard);
    pendingRemoteDocumentRef.current = null;
    setPendingRemoteUpdate(null);
    conflictRef.current = false;
    cache?.saveSharedHouseConfiguration(document);
  }, [cache]);

  useEffect(() => {
    const pending = pendingRemoteDocumentRef.current;
    if (!pending) return;
    const isOwnPublication = pending.publication?.originClientId === clientIdRef.current;
    const isEquivalentLayout = dashboardSignature(pending.dashboard) === dashboardSignature(dashboard);
    if (isOwnPublication || isEquivalentLayout) acknowledgeOwnPublication(pending);
  }, [acknowledgeOwnPublication, dashboard]);

  const checkForRemoteUpdate = useCallback(async () => {
    if (
      !active ||
      !connectionRef.current ||
      !userId ||
      !documentRef.current ||
      remoteCheckInFlightRef.current
    ) {
      return false;
    }
    remoteCheckInFlightRef.current = true;
    try {
      const result = await repository.loadSharedHouseConfiguration();
      if (result.status === 'empty') {
        const resetMarkerResult = await repository.loadDashboardResetMarker();
        if (resetMarkerResult.status === 'found') {
          if (
            typeof window !== 'undefined' &&
            isAuthoritativeDashboardResetAcknowledged(
              window.localStorage,
              resetMarkerResult.marker,
            )
          ) {
            return false;
          }
          handleAuthoritativeReset(resetMarkerResult.marker);
          return true;
        }
        return false;
      }
      if (result.status !== 'found') return false;
      if (result.document.dashboard.storageVersion !== DASHBOARD_LAYOUT_STORAGE_VERSION) {
        setLoadStatus('error');
        setStatus(statusFromResult(errorResult('server_unsupported')));
        return false;
      }
      const currentRevision = documentRef.current?.revision ?? 0;
      if (result.document.revision <= currentRevision) return false;
      const isOwnPublication = result.document.publication?.originClientId === clientIdRef.current;
      const isEquivalentLayout = dashboardSignature(result.document.dashboard) ===
        dashboardSignature(dashboardRef.current);
      console.info('[DomusUI:persistence] remote-check:newer', {
        currentRevision,
        serverRevision: result.document.revision,
        isOwnPublication,
        isEquivalentLayout,
        deferred: deferRemoteUpdatesRef.current,
      });
      if (isOwnPublication || isEquivalentLayout) {
        acknowledgeOwnPublication(result.document);
        return false;
      }
      const pendingLocalPublication = pendingLocalPublicationRef.current;
      if (
        pendingLocalPublication &&
        result.document.revision === pendingLocalPublication.revision &&
        result.document.updatedAt === pendingLocalPublication.updatedAt
      ) {
        return false;
      }
      if (deferRemoteUpdatesRef.current) {
        registerPendingRemoteDocument(result.document);
      } else {
        applyRemoteDocument(result.document);
      }
      return true;
    } finally {
      remoteCheckInFlightRef.current = false;
    }
  }, [acknowledgeOwnPublication, active, applyRemoteDocument, handleAuthoritativeReset, registerPendingRemoteDocument, repository, userId]);

  const applyPendingRemoteUpdate = useCallback(() => {
    const pending = pendingRemoteDocumentRef.current;
    if (!pending) return false;
    applyRemoteDocument(pending);
    return true;
  }, [applyRemoteDocument]);

  useEffect(() => {
    if (
      !active ||
      !isConnected ||
      !userId ||
      (loadStatus !== 'ready' && loadStatus !== 'read_only')
    ) {
      return;
    }
    const handleFocus = () => {
      void checkForRemoteUpdate();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void checkForRemoteUpdate();
    };
    const handlePageResume = () => {
      void checkForRemoteUpdate();
    };
    const intervalId = window.setInterval(() => {
      // Layout publications are rare. Do not wake an inactive tab: the
      // visibility/pageshow/focus listeners below perform an immediate check
      // as soon as the user returns.
      if (document.hidden) return;
      void checkForRemoteUpdate();
    }, Math.max(5_000, remoteCheckIntervalMs));
    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handlePageResume);
    window.addEventListener('online', handlePageResume);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handlePageResume);
      window.removeEventListener('online', handlePageResume);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [active, checkForRemoteUpdate, isConnected, loadStatus, remoteCheckIntervalMs, userId]);

  useEffect(() => {
    if (!deferRemoteUpdates && pendingRemoteDocumentRef.current) {
      applyPendingRemoteUpdate();
    }
  }, [applyPendingRemoteUpdate, deferRemoteUpdates]);

  const persist = useCallback((
    nextDashboard: DashboardLayoutConfiguration,
    publication: { source: DashboardRevisionSource; restoredFromRevision?: number } = { source: 'edit' },
    explicit = false,
  ): Promise<DashboardLayoutSaveResult> => {
    const run = async (): Promise<DashboardLayoutSaveResult> => {
      if (!active || !connectionRef.current) {
        console.warn('[DomusUI:persistence] persist:blocked', { reason: 'connection-unavailable' });
        return errorResult('server_unavailable');
      }
      if (!permissionRef.current) {
        console.warn('[DomusUI:persistence] persist:blocked', { reason: 'permission-unavailable' });
        return errorResult('server_unauthorized');
      }
      if (conflictRef.current) {
        console.warn('[DomusUI:persistence] persist:blocked', { reason: 'unresolved-conflict' });
        return errorResult('server_conflict');
      }
      const signature = dashboardSignature(nextDashboard);
      const current = documentRef.current;
      if (awaitingHydrationRef.current) {
        if (explicit && current) {
          awaitingHydrationRef.current = false;
        } else if (signature && signature === persistedSignatureRef.current) {
          awaitingHydrationRef.current = false;
          console.info('[DomusUI:persistence] hydrate:confirmed');
        } else if (signature && current) {
          // MainBoard may immediately normalize minimum sizes and automatic card
          // expansion after applying the server document. That normalized render
          // is the local baseline, not an unsaved user edit.
          persistedSignatureRef.current = signature;
          awaitingHydrationRef.current = false;
          console.info('[DomusUI:persistence] hydrate:normalized');
          return {
            ok: true,
            savedAt: Date.parse(current.updatedAt) || Date.now(),
            storageKey: 'home_assistant:premium-home.shared-house.v1',
            bytes: new Blob([signature]).size,
          };
        } else {
          console.warn('[DomusUI:persistence] persist:blocked', { reason: 'hydration-invalid' });
          return errorResult('server_unavailable');
        }
      }
      if (!current) {
        console.warn('[DomusUI:persistence] persist:blocked', { reason: 'migration-required' });
        return errorResult('migration_required');
      }

      // An explicit rollback is itself an auditable publication, even when the
      // selected snapshot happens to be structurally identical to the current
      // dashboard. It must therefore create a new increasing revision instead
      // of being reported as a successful no-op.
      if (
        publication.source !== 'rollback' &&
        signature &&
        signature === persistedSignatureRef.current
      ) {
        return {
          ok: true,
          savedAt: Date.parse(current.updatedAt) || Date.now(),
          storageKey: 'home_assistant:premium-home.shared-house.v1',
          bytes: new Blob([signature]).size,
        };
      }

      setStatus({ phase: 'saving' });
      const latestBeforeArchive = await repository.loadSharedHouseConfiguration();
      if (latestBeforeArchive.status === 'found') {
        if (latestBeforeArchive.document.revision !== current.revision) {
          if (dashboardSignature(latestBeforeArchive.document.dashboard) === signature) {
            console.info('[DomusUI:persistence] persist:already-published', {
              localRevision: current.revision,
              serverRevision: latestBeforeArchive.document.revision,
            });
            acknowledgeOwnPublication(latestBeforeArchive.document);
            return {
              ok: true,
              savedAt: Date.parse(latestBeforeArchive.document.updatedAt) || Date.now(),
              storageKey: 'home_assistant:premium-home.shared-house.v1',
              bytes: new Blob([signature]).size,
            };
          }
          registerPendingRemoteDocument(latestBeforeArchive.document);
          return errorResult('server_conflict');
        }
      } else if (latestBeforeArchive.status === 'empty') {
        conflictRef.current = true;
        return errorResult('server_conflict');
      } else if (latestBeforeArchive.status === 'unauthorized') {
        return errorResult('server_unauthorized');
      } else if (latestBeforeArchive.status === 'unsupported') {
        return errorResult('server_unsupported');
      } else {
        return errorResult('server_unavailable');
      }
      const next = createNextSharedHouseConfiguration(
        current,
        {
          dashboard: nextDashboard,
          security: current.security,
          rooms: current.rooms,
        },
        userId ?? 'unknown',
        undefined,
        { ...publication, originClientId: clientIdRef.current },
      );
      pendingLocalPublicationRef.current = {
        revision: next.revision,
        updatedAt: next.updatedAt,
      };
      const archived = await repository.archiveDashboardRevision(current);
      if (archived.status === 'archived') {
        setRevisionHistory(archived.document.entries);
        setRevisionHistoryStatus('ready');
      } else {
        // Revision history is a recovery layer and must not make the primary
        // authoritative layout unavailable on an older bridge. The actual
        // configuration write below still performs its own fail-closed checks.
        setRevisionHistoryStatus(
          archived.status === 'offline' || archived.status === 'unsupported'
            ? archived.status
            : 'error',
        );
      }
      const result = await repository.saveSharedHouseConfiguration(next, current.revision);
      pendingLocalPublicationRef.current = null;
      if (result.status === 'saved') {
        documentRef.current = result.document;
        setServerRevision(result.document.revision);
        setPublishedRevision(createDashboardRevisionRecord(result.document));
        pendingRemoteDocumentRef.current = null;
        setPendingRemoteUpdate(null);
        conflictRef.current = false;
        persistedSignatureRef.current = dashboardSignature(result.document.dashboard);
        cache?.saveSharedHouseConfiguration(result.document);
        saveDashboardLayout(
          nextDashboard.sections,
          nextDashboard.widgets,
          nextDashboard.widgetTypeLayoutOverrides,
          nextDashboard.responsiveLayouts,
          nextDashboard.widgetLayoutOverrides,
          'real',
        );
        return {
          ok: true,
          savedAt: Date.parse(result.document.updatedAt) || Date.now(),
          storageKey: 'home_assistant:premium-home.shared-house.v1',
          bytes: new Blob([JSON.stringify(result.document)]).size,
        };
      }
      if (result.status === 'conflict') {
        conflictRef.current = true;
        if (result.current) registerPendingRemoteDocument(result.current);
        return errorResult('server_conflict');
      }
      if (result.status === 'unauthorized') return errorResult('server_unauthorized');
      if (result.status === 'unsupported') return errorResult('server_unsupported');
      return errorResult('server_unavailable');
    };

    const queued = saveChainRef.current.then(run, run);
    saveChainRef.current = queued;
    return queued.then((result) => {
      setStatus(statusFromResult(result));
      return result;
    });
  }, [acknowledgeOwnPublication, active, cache, registerPendingRemoteDocument, repository, userId]);

  const saveNow = useCallback(() => {
    if (pendingSaveTimeoutRef.current !== null) {
      window.clearTimeout(pendingSaveTimeoutRef.current);
      pendingSaveTimeoutRef.current = null;
    }
    return persist(dashboard);
  }, [dashboard, persist]);

  const saveDashboard = useCallback((nextDashboard: DashboardLayoutConfiguration) => (
    persist(nextDashboard, { source: 'edit' }, true)
  ), [persist]);

  const initializeDashboard = useCallback(async (
    nextDashboard: DashboardLayoutConfiguration,
  ): Promise<DashboardLayoutSaveResult> => {
    console.info('[DomusUI:persistence] initialize:start', {
      active,
      connected: connectionRef.current,
      canManage: permissionRef.current,
      hasUserIdentity: Boolean(userId),
      hasServerDocument: Boolean(documentRef.current),
      loadStatus,
    });
    if (!active || !connectionRef.current) {
      console.warn('[DomusUI:persistence] initialize:blocked', {
        reason: !active ? 'inactive-runtime' : 'connection-unavailable',
      });
      const result = errorResult('server_unavailable');
      setStatus(statusFromResult(result));
      return result;
    }
    if (!permissionRef.current || !userId) {
      console.warn('[DomusUI:persistence] initialize:blocked', {
        reason: !permissionRef.current ? 'permission-unavailable' : 'identity-unavailable',
      });
      const result = errorResult('server_unauthorized');
      setStatus(statusFromResult(result));
      return result;
    }
    if (documentRef.current) {
      console.info('[DomusUI:persistence] initialize:document-already-present', {
        revision: documentRef.current.revision,
      });
      return persist(nextDashboard, { source: 'migration' }, true);
    }

    setStatus({ phase: 'saving' });
    const initialDocument = createSharedHouseConfiguration({
      updatedByUserId: userId,
      publication: { source: 'migration', originClientId: clientIdRef.current },
      dashboard: nextDashboard,
      security: {
        alarmEntityId: null,
        visibleSensorEntityIds: null,
        visibleCameraEntityIds: null,
      },
      rooms: {
        customRooms: [],
        hiddenEntitiesByRoom: {},
      },
    });
    const saved = await repository.saveSharedHouseConfiguration(initialDocument, null);
    console.info('[DomusUI:persistence] initialize:repository-result', {
      status: saved.status,
      reason: saved.status === 'error' ? saved.reason ?? 'unknown' : undefined,
      revision: saved.status === 'saved' ? saved.document.revision : undefined,
    });
    if (saved.status !== 'saved') {
      const result = errorResult(
        saved.status === 'conflict'
          ? 'server_conflict'
          : saved.status === 'unauthorized'
            ? 'server_unauthorized'
            : saved.status === 'unsupported'
              ? 'server_unsupported'
              : 'server_unavailable',
      );
      if (saved.status === 'conflict') conflictRef.current = true;
      setStatus(statusFromResult(result));
      return result;
    }

    documentRef.current = saved.document;
    setServerRevision(saved.document.revision);
    setPublishedRevision(createDashboardRevisionRecord(saved.document));
    persistedSignatureRef.current = dashboardSignature(saved.document.dashboard);
    awaitingHydrationRef.current = false;
    conflictRef.current = false;
    cache?.saveSharedHouseConfiguration(saved.document);
    // The marker is only relevant while the authoritative configuration is
    // empty. Remove it after a confirmed new setup without making setup depend
    // on this best-effort cleanup.
    void repository.clearDashboardResetMarker();
    saveDashboardLayout(
      nextDashboard.sections,
      nextDashboard.widgets,
      nextDashboard.widgetTypeLayoutOverrides,
      nextDashboard.responsiveLayouts,
      nextDashboard.widgetLayoutOverrides,
      'real',
    );
    setLoadStatus('ready');
    const result: DashboardLayoutSaveResult = {
      ok: true,
      savedAt: Date.parse(saved.document.updatedAt) || Date.now(),
      storageKey: 'home_assistant:premium-home.shared-house.v1',
      bytes: new Blob([JSON.stringify(saved.document)]).size,
    };
    setStatus(statusFromResult(result));
    return result;
  }, [active, cache, loadStatus, persist, repository, userId]);

  const initializeFromCurrentDashboard = useCallback(() => (
    initializeDashboard(dashboard)
  ), [dashboard, initializeDashboard]);

  useEffect(() => {
    if (!active || !autoSaveEnabled || !canManage || loadStatus !== 'ready' || conflictRef.current) return;
    const signature = dashboardSignature(dashboard);
    if (awaitingHydrationRef.current) {
      if (signature && signature === persistedSignatureRef.current) {
        awaitingHydrationRef.current = false;
      }
      return;
    }
    if (!signature || signature === persistedSignatureRef.current) return;
    setStatus({ phase: 'saving' });
    const timeoutId = window.setTimeout(() => {
      pendingSaveTimeoutRef.current = null;
      void persist(dashboard);
    }, debounceMs);
    pendingSaveTimeoutRef.current = timeoutId;
    return () => {
      window.clearTimeout(timeoutId);
      if (pendingSaveTimeoutRef.current === timeoutId) pendingSaveTimeoutRef.current = null;
    };
  }, [active, autoSaveEnabled, canManage, dashboard, debounceMs, loadStatus, persist]);

  const refreshRevisionHistory = useCallback(async () => {
    if (!active || !connectionRef.current || !permissionRef.current) {
      setRevisionHistoryStatus(connectionRef.current ? 'error' : 'offline');
      return false;
    }
    setRevisionHistoryStatus('loading');
    const result = await repository.loadDashboardRevisionHistory();
    if (result.status === 'found') {
      setRevisionHistory(result.document.entries);
      setRevisionHistoryStatus('ready');
      return true;
    }
    if (result.status === 'empty') {
      setRevisionHistory([]);
      setRevisionHistoryStatus('ready');
      return true;
    }
    setRevisionHistoryStatus(
      result.status === 'offline' || result.status === 'unsupported'
        ? result.status
        : 'error',
    );
    return false;
  }, [active, repository]);

  const restoreRevision = useCallback(async (revision: number): Promise<DashboardLayoutSaveResult> => {
    const target = revisionHistory.find((entry) => entry.revision === revision);
    if (!target) return errorResult('server_unavailable');
    const result = await persist(target.dashboard, {
      source: 'rollback',
      restoredFromRevision: target.revision,
    });
    if (result.ok) {
      hydrateRef.current(target.dashboard);
    }
    return result;
  }, [persist, revisionHistory]);

  const resetAuthoritativeConfiguration = useCallback(async (
    reportProgress?: DashboardResetProgressReporter,
  ) => {
    if (pendingSaveTimeoutRef.current !== null) {
      window.clearTimeout(pendingSaveTimeoutRef.current);
      pendingSaveTimeoutRef.current = null;
    }
    const result = userId
      ? await repository.resetAuthoritativeConfiguration(userId, reportProgress)
      : { status: 'unauthorized' as const };
    if (result.status === 'reset') {
      cache?.clearSharedHouseConfiguration();
      documentRef.current = null;
      pendingRemoteDocumentRef.current = null;
      pendingLocalPublicationRef.current = null;
      persistedSignatureRef.current = '';
      awaitingHydrationRef.current = false;
      conflictRef.current = false;
      setServerRevision(null);
      setPublishedRevision(null);
      setRevisionHistory([]);
      setRevisionHistoryStatus('ready');
      setPendingRemoteUpdate(null);
      setLastAppliedRemoteRevision(null);
      setStatus({ phase: 'idle' });
      setLoadStatus('migration_required');
    }
    return result;
  }, [cache, repository, userId]);

  const revisions = publishedRevision
    ? [publishedRevision, ...revisionHistory.filter((entry) => entry.revision !== publishedRevision.revision)].slice(0, 5)
    : revisionHistory.slice(0, 5);

  return {
    loadStatus,
    status,
    serverRevision,
    revisions,
    revisionHistoryStatus,
    pendingRemoteUpdate,
    lastAppliedRemoteRevision,
    saveNow,
    saveDashboard,
    initializeDashboard,
    initializeFromCurrentDashboard,
    refreshRevisionHistory,
    restoreRevision,
    resetAuthoritativeConfiguration,
    checkForRemoteUpdate,
    applyPendingRemoteUpdate,
  };
}
