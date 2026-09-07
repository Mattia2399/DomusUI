import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HassEntities } from 'home-assistant-js-websocket';
import { mapHassEntitiesToMock, normalizeHassUrl } from '../services/haLive';
import type { MockEntityStateMap } from '../types/ha';
import type { HaArea, HaConnectionStatus } from './useHaLiveConnection';
import {
  HA_SHARED_HOUSE_CONFIGURATION_KEY,
  parseSharedHouseConfiguration,
} from '../services/dashboardConfigurationRepository';
import {
  HA_DASHBOARD_REVISION_HISTORY_KEY,
  parseDashboardRevisionHistory,
} from '../services/dashboardRevisionHistory';
import {
  HA_DASHBOARD_RESET_MARKER_KEY,
  parseDashboardResetMarker,
} from '../services/dashboardReset';
import {
  HA_APP_CONFIGURATIONS_KEY,
  parseSharedAppConfigurationsDocument,
} from '../services/haAppConfigurationsRepository';

type HaPanelPayloadBase = {
  type: string;
};

type HaPanelContextPayload = HaPanelPayloadBase & {
  type: 'ha-panel-context';
  hassUrl?: unknown;
  user?: unknown;
  locale?: unknown;
  bridgeProtocolVersion?: unknown;
  capabilities?: unknown;
};

type HaPanelSnapshotPayload = HaPanelPayloadBase & {
  type: 'ha-panel-snapshot';
  hassUrl?: unknown;
  user?: unknown;
  locale?: unknown;
  bridgeProtocolVersion?: unknown;
  capabilities?: unknown;
  states?: unknown;
  areas?: unknown;
};

type HaPanelStateChangedPayload = HaPanelPayloadBase & {
  type: 'ha-panel-state-changed';
  entityId?: unknown;
  state?: unknown;
};

type HaPanelCallServiceResultPayload = HaPanelPayloadBase & {
  type: 'ha-panel-call-service-result';
  requestId?: unknown;
  ok?: unknown;
  error?: unknown;
};

type HaPanelCallApiResultPayload = HaPanelPayloadBase & {
  type: 'ha-panel-call-api-result';
  requestId?: unknown;
  ok?: unknown;
  error?: unknown;
  result?: unknown;
};

type PendingRequestRecord = {
  resolve: (payload: unknown) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof globalThis.setTimeout>;
};

const REQUEST_TIMEOUT_MS = 15000;
const BRIDGE_HEARTBEAT_INTERVAL_MS = 10_000;
const BRIDGE_RECONNECTING_AFTER_MS = 20_000;
const BRIDGE_OFFLINE_AFTER_MS = 40_000;
const HA_NAME_PATTERN = /^[a-z0-9_]+$/;
const HA_ENTITY_ID_PATTERN = /^[a-z0-9_]+\.[a-z0-9_]+$/;
const REQUEST_ID_PATTERN = /^ha-panel-call-(?:service|api)-\d{10,}-[a-z0-9]+$/;
const MAX_BRIDGE_STATES = 20_000;
const PANEL_BRIDGE_CAPABILITIES = new Set([
  'shared_configuration',
  'app_configurations',
  'revision_history',
  'dashboard_reset_marker',
]);

export function parsePanelBridgeCapabilities(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is string => typeof entry === 'string' && PANEL_BRIDGE_CAPABILITIES.has(entry),
  );
}

export function parsePanelLocale(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  if (
    value &&
    typeof value === 'object' &&
    typeof (value as { language?: unknown }).language === 'string' &&
    (value as { language: string }).language.trim().length > 0
  ) {
    return (value as { language: string }).language.trim();
  }
  return null;
}

export const HA_PANEL_ALLOWED_API_TYPES = new Set([
  'auth/current_user',
  'auth/list',
  'config/auth/list',
  'get_services',
  'weather/get_forecasts',
  'call_service',
  'history/history_during_period',
  'logbook/get_events',
  'config/entity_registry/list',
  'config/entity_registry/list_for_display',
  'config/entity_registry/update',
  'config/device_registry/list',
  'config/device_registry/list_for_display',
  'config/device_registry/update',
  'config/label_registry/list',
  'config/label_registry/list_for_display',
  'config/area_registry/list',
  'config/area_registry/create',
  'config/area_registry/update',
  'config/area_registry/delete',
  'config/floor_registry/list',
  'config/floor_registry/create',
  'config/floor_registry/update',
  'config/floor_registry/reorder',
  'config/floor_registry/delete',
  'frontend/get_system_data',
  'frontend/set_system_data',
]);

export function resolvePanelBridgeHeartbeatStatus(elapsedMs: number): 'connected' | 'reconnecting' | 'offline' {
  if (elapsedMs >= BRIDGE_OFFLINE_AFTER_MS) {
    return 'offline';
  }
  if (elapsedMs >= BRIDGE_RECONNECTING_AFTER_MS) {
    return 'reconnecting';
  }
  return 'connected';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isValidPanelRequestId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 160 && REQUEST_ID_PATTERN.test(value);
}

export function validatePanelServiceRequest(
  domain: unknown,
  service: unknown,
  serviceData: unknown,
) {
  return (
    typeof domain === 'string' && HA_NAME_PATTERN.test(domain) &&
    typeof service === 'string' && HA_NAME_PATTERN.test(service) &&
    isRecord(serviceData)
  );
}

export function validatePanelApiMessage(message: unknown): message is Record<string, unknown> {
  if (!isRecord(message) || typeof message.type !== 'string' || !HA_PANEL_ALLOWED_API_TYPES.has(message.type)) {
    return false;
  }
  if (message.type === 'call_service') {
    return validatePanelServiceRequest(message.domain, message.service, message.service_data ?? {});
  }
  if (message.type === 'frontend/get_system_data') {
    return message.key === HA_SHARED_HOUSE_CONFIGURATION_KEY ||
      message.key === HA_DASHBOARD_REVISION_HISTORY_KEY ||
      message.key === HA_DASHBOARD_RESET_MARKER_KEY ||
      message.key === HA_APP_CONFIGURATIONS_KEY;
  }
  if (message.type === 'frontend/set_system_data') {
    if (message.value === null) {
      return message.key === HA_SHARED_HOUSE_CONFIGURATION_KEY ||
        message.key === HA_DASHBOARD_REVISION_HISTORY_KEY ||
        message.key === HA_DASHBOARD_RESET_MARKER_KEY ||
        message.key === HA_APP_CONFIGURATIONS_KEY;
    }
    if (message.key === HA_SHARED_HOUSE_CONFIGURATION_KEY) {
      return parseSharedHouseConfiguration(message.value) !== null;
    }
    if (message.key === HA_DASHBOARD_REVISION_HISTORY_KEY) {
      return isRecord(message.value) &&
        Array.isArray(message.value.entries) &&
        message.value.entries.length <= 4 &&
        parseDashboardRevisionHistory(message.value) !== null;
    }
    if (message.key === HA_DASHBOARD_RESET_MARKER_KEY) {
      return parseDashboardResetMarker(message.value) !== null;
    }
    if (message.key === HA_APP_CONFIGURATIONS_KEY) {
      return parseSharedAppConfigurationsDocument(message.value) !== null;
    }
    return false;
  }
  return true;
}

function toObjectMap(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }
  const entries = Object.entries(value);
  if (entries.length > MAX_BRIDGE_STATES) {
    return null;
  }
  const safeEntries = entries.filter(
    ([entityId, state]) => HA_ENTITY_ID_PATTERN.test(entityId) && isRecord(state),
  );
  return Object.fromEntries(safeEntries);
}

function parseAreaRegistryPayload(payload: unknown): HaArea[] {
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry) => {
      const areaId = typeof entry.area_id === 'string' ? entry.area_id.trim() : '';
      const name = typeof entry.name === 'string' ? entry.name.trim() : '';
      const aliases = Array.isArray(entry.aliases)
        ? entry.aliases.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : undefined;
      const floorId = typeof entry.floor_id === 'string' && entry.floor_id.trim().length > 0 ? entry.floor_id : null;
      const humidityEntityId =
        typeof entry.humidity_entity_id === 'string' && entry.humidity_entity_id.trim().length > 0
          ? entry.humidity_entity_id
          : null;
      const icon = typeof entry.icon === 'string' && entry.icon.trim().length > 0 ? entry.icon : null;
      const picture = typeof entry.picture === 'string' && entry.picture.trim().length > 0 ? entry.picture : undefined;
      const temperatureEntityId =
        typeof entry.temperature_entity_id === 'string' && entry.temperature_entity_id.trim().length > 0
          ? entry.temperature_entity_id
          : null;
      if (!areaId || !name) {
        return null;
      }
      const area: HaArea = { area_id: areaId, name };
      if (aliases && aliases.length > 0) {
        area.aliases = aliases;
      }
      area.floor_id = floorId;
      area.humidity_entity_id = humidityEntityId;
      area.icon = icon;
      if (picture) {
        area.picture = picture;
      }
      area.temperature_entity_id = temperatureEntityId;
      return area;
    })
    .filter((entry): entry is HaArea => entry !== null);
}

function createRequestId(prefix: string) {
  const random = Math.random().toString(36).slice(2);
  return `${prefix}-${Date.now()}-${random}`;
}

export function useHaPanelBridgeConnection() {
  const [status, setStatus] = useState<HaConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [haStates, setHaStates] = useState<MockEntityStateMap>({});
  const [haAreas, setHaAreas] = useState<HaArea[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [isManagedByParent, setIsManagedByParent] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [bridgeProtocolVersion, setBridgeProtocolVersion] = useState<number | null>(null);
  const [bridgeCapabilities, setBridgeCapabilities] = useState<string[]>([]);
  const [locale, setLocale] = useState<string | null>(null);
  const hassUrlRef = useRef<string>(typeof window !== 'undefined' ? window.location.origin : '');
  const rawStatesRef = useRef<Record<string, unknown>>({});
  const pendingRequestsRef = useRef<Map<string, PendingRequestRecord>>(new Map());
  const lastBridgeMessageAtRef = useRef(Date.now());

  const isInIframe = useMemo(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.parent !== window;
  }, []);

  const postToParent = useCallback((payload: Record<string, unknown>) => {
    if (typeof window === 'undefined') {
      return false;
    }
    if (window.parent === window) {
      return false;
    }
    window.parent.postMessage(payload, window.location.origin);
    return true;
  }, []);

  const rejectPendingRequest = useCallback((requestId: string, reason: Error) => {
    const pending = pendingRequestsRef.current.get(requestId);
    if (!pending) {
      return;
    }
    pendingRequestsRef.current.delete(requestId);
    globalThis.clearTimeout(pending.timeoutId);
    pending.reject(reason);
  }, []);

  const resolvePendingRequest = useCallback((requestId: string, payload: unknown) => {
    const pending = pendingRequestsRef.current.get(requestId);
    if (!pending) {
      return;
    }
    pendingRequestsRef.current.delete(requestId);
    globalThis.clearTimeout(pending.timeoutId);
    pending.resolve(payload);
  }, []);

  const sendRequest = useCallback(
    <TResponse = unknown,>(
      type: 'ha-panel-call-service' | 'ha-panel-call-api',
      payload: Record<string, unknown>,
    ) => {
      if (!isInIframe || !isManagedByParent || isPaused || status !== 'connected') {
        return Promise.reject(new Error('Bridge Home Assistant non disponibile.'));
      }
      const validPayload = type === 'ha-panel-call-service'
        ? validatePanelServiceRequest(payload.domain, payload.service, payload.serviceData)
        : validatePanelApiMessage(payload.message);
      if (!validPayload) {
        return Promise.reject(new Error('Richiesta bridge Home Assistant non ammessa.'));
      }

      const requestId = createRequestId(type);
      return new Promise<TResponse>((resolve, reject) => {
        const timeoutId = globalThis.setTimeout(() => {
          rejectPendingRequest(requestId, new Error('Timeout richiesta verso Home Assistant.'));
        }, REQUEST_TIMEOUT_MS);
        pendingRequestsRef.current.set(requestId, {
          resolve: (value) => resolve(value as TResponse),
          reject,
          timeoutId,
        });

        const posted = postToParent({
          type,
          requestId,
          ...payload,
        });
        if (!posted) {
          rejectPendingRequest(requestId, new Error('Invio richiesta al pannello Home Assistant fallito.'));
        }
      });
    },
    [isInIframe, isManagedByParent, isPaused, postToParent, rejectPendingRequest, status],
  );

  const applySnapshot = useCallback((payload: HaPanelSnapshotPayload) => {
    const urlCandidate = typeof payload.hassUrl === 'string' ? normalizeHassUrl(payload.hassUrl) : '';
    if (urlCandidate) {
      hassUrlRef.current = urlCandidate;
    }

    const stateMap = toObjectMap(payload.states);
    if (stateMap) {
      rawStatesRef.current = stateMap;
      setHaStates((current) =>
        mapHassEntitiesToMock(stateMap as unknown as HassEntities, hassUrlRef.current, current),
      );
    }

    if (payload.areas !== undefined) {
      setHaAreas(parseAreaRegistryPayload(payload.areas));
    }
    setLastUpdatedAt(Date.now());
  }, []);

  const applyStateChanged = useCallback((payload: HaPanelStateChangedPayload) => {
    const entityId = typeof payload.entityId === 'string' ? payload.entityId.trim() : '';
    if (!HA_ENTITY_ID_PATTERN.test(entityId)) {
      return;
    }

    if (payload.state === null || payload.state === undefined) {
      delete rawStatesRef.current[entityId];
      setHaStates((current) => {
        if (!Object.prototype.hasOwnProperty.call(current, entityId)) {
          return current;
        }
        const next = { ...current };
        delete next[entityId];
        return next;
      });
      setLastUpdatedAt(Date.now());
      return;
    }

    if (!isRecord(payload.state)) {
      return;
    }

    rawStatesRef.current[entityId] = payload.state;
    setHaStates((current) => {
      const mapped = mapHassEntitiesToMock(
        { [entityId]: payload.state } as unknown as HassEntities,
        hassUrlRef.current,
        current,
      );
      return {
        ...current,
        ...mapped,
      };
    });
    setLastUpdatedAt(Date.now());
  }, []);

  useEffect(() => {
    if (!isInIframe || typeof window === 'undefined') {
      return;
    }

    if (!isManagedByParent) {
      setStatus('connecting');
      postToParent({ type: 'ha-panel-ready' });
      postToParent({ type: 'ha-panel-request-sync' });
    }

    const handleMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== window.parent) {
        return;
      }
      if (event.origin !== window.location.origin) {
        return;
      }
      if (!isRecord(event.data)) {
        return;
      }

      const payload = event.data as HaPanelPayloadBase;
      lastBridgeMessageAtRef.current = Date.now();

      if (payload.type === 'ha-panel-context') {
        const contextPayload = payload as HaPanelContextPayload;
        const urlCandidate =
          typeof contextPayload.hassUrl === 'string'
            ? normalizeHassUrl(contextPayload.hassUrl)
            : '';
        if (urlCandidate) {
          hassUrlRef.current = urlCandidate;
        }
        setBridgeProtocolVersion(
          Number.isSafeInteger(contextPayload.bridgeProtocolVersion) && Number(contextPayload.bridgeProtocolVersion) > 0
            ? Number(contextPayload.bridgeProtocolVersion)
            : null,
        );
        setBridgeCapabilities(parsePanelBridgeCapabilities(contextPayload.capabilities));
        setLocale(parsePanelLocale(contextPayload.locale));
        setIsManagedByParent(true);
        if (!isPaused) {
          setStatus('connecting');
        }
        setError(null);
        return;
      }

      if (payload.type === 'ha-panel-snapshot') {
        if (isPaused) {
          return;
        }
        setIsManagedByParent(true);
        const snapshotPayload = payload as HaPanelSnapshotPayload;
        setBridgeProtocolVersion(
          Number.isSafeInteger(snapshotPayload.bridgeProtocolVersion) && Number(snapshotPayload.bridgeProtocolVersion) > 0
            ? Number(snapshotPayload.bridgeProtocolVersion)
            : null,
        );
        setBridgeCapabilities(parsePanelBridgeCapabilities(snapshotPayload.capabilities));
        setLocale(parsePanelLocale(snapshotPayload.locale));
        applySnapshot(snapshotPayload);
        setStatus('connected');
        setError(null);
        return;
      }

      if (payload.type === 'ha-panel-state-changed') {
        if (isPaused) {
          return;
        }
        setIsManagedByParent(true);
        applyStateChanged(payload as HaPanelStateChangedPayload);
        setStatus('connected');
        setError(null);
        return;
      }

      if (payload.type === 'ha-panel-call-service-result') {
        const resultPayload = payload as HaPanelCallServiceResultPayload;
        const requestId = resultPayload.requestId;
        if (!isValidPanelRequestId(requestId) || !pendingRequestsRef.current.has(requestId)) {
          return;
        }
        const ok = resultPayload.ok === true;
        if (ok) {
          resolvePendingRequest(requestId, true);
        } else {
          const message =
            typeof resultPayload.error === 'string' && resultPayload.error.trim().length > 0
              ? resultPayload.error
              : 'Richiesta Home Assistant fallita.';
          rejectPendingRequest(requestId, new Error(message));
        }
        return;
      }

      if (payload.type === 'ha-panel-call-api-result') {
        const resultPayload = payload as HaPanelCallApiResultPayload;
        const requestId = resultPayload.requestId;
        if (!isValidPanelRequestId(requestId) || !pendingRequestsRef.current.has(requestId)) {
          return;
        }
        const ok = resultPayload.ok === true;
        if (ok) {
          resolvePendingRequest(requestId, resultPayload.result);
        } else {
          const message =
            typeof resultPayload.error === 'string' && resultPayload.error.trim().length > 0
              ? resultPayload.error
              : 'Richiesta Home Assistant fallita.';
          rejectPendingRequest(requestId, new Error(message));
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [
    applySnapshot,
    applyStateChanged,
    isInIframe,
    isManagedByParent,
    isPaused,
    postToParent,
    rejectPendingRequest,
    resolvePendingRequest,
  ]);

  useEffect(() => {
    if (!isInIframe || !isManagedByParent || isPaused || typeof window === 'undefined') {
      return;
    }
    const checkBridge = () => {
      const elapsed = Date.now() - lastBridgeMessageAtRef.current;
      const heartbeatStatus = resolvePanelBridgeHeartbeatStatus(elapsed);
      if (heartbeatStatus === 'offline') {
        setStatus('offline');
        setError('Il bridge Home Assistant non risponde. I controlli sono temporaneamente bloccati.');
      } else if (heartbeatStatus === 'reconnecting') {
        setStatus('reconnecting');
        setError('Riconnessione al pannello Home Assistant in corso.');
      }
      postToParent({ type: 'ha-panel-request-sync' });
    };
    const intervalId = window.setInterval(checkBridge, BRIDGE_HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [isInIframe, isManagedByParent, isPaused, postToParent]);

  useEffect(() => {
    return () => {
      pendingRequestsRef.current.forEach((pending, requestId) => {
        pendingRequestsRef.current.delete(requestId);
        globalThis.clearTimeout(pending.timeoutId);
        pending.reject(new Error('Bridge Home Assistant chiuso.'));
      });
    };
  }, []);

  const connect = useCallback(async () => {
    if (!isInIframe || !isManagedByParent) {
      setStatus('error');
      setError('Bridge Home Assistant non disponibile in questa pagina.');
      return;
    }
    setIsPaused(false);
    setStatus('connecting');
    setError(null);
    lastBridgeMessageAtRef.current = Date.now();
    postToParent({ type: 'ha-panel-request-sync' });
  }, [isInIframe, isManagedByParent, postToParent]);

  const disconnect = useCallback(() => {
    setIsPaused(true);
    setStatus('disconnected_by_user');
    setError(null);
    setHaStates({});
    setHaAreas([]);
    setLastUpdatedAt(null);
    setBridgeProtocolVersion(null);
    setBridgeCapabilities([]);
    setLocale(null);
  }, []);

  const callService = useCallback(
    async (domain: string, service: string, serviceData: Record<string, unknown>) => {
      if (!validatePanelServiceRequest(domain, service, serviceData)) {
        setError('Richiesta servizio Home Assistant non valida.');
        return false;
      }
      try {
        await sendRequest<boolean>('ha-panel-call-service', {
          domain,
          service,
          serviceData,
        });
        setError(null);
        return true;
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'Richiesta Home Assistant fallita.');
        return false;
      }
    },
    [sendRequest],
  );

  const callApi = useCallback(
    async <TResponse = unknown,>(
      message: Record<string, unknown>,
      options?: { reportError?: boolean; throwOnError?: boolean },
    ) => {
      if (!validatePanelApiMessage(message)) {
        const validationError = new Error('Tipo richiesta Home Assistant non ammesso dal bridge.');
        if (options?.reportError !== false) {
          setError(validationError.message);
        }
        if (options?.throwOnError) {
          throw validationError;
        }
        return null;
      }
      try {
        const response = await sendRequest<TResponse>('ha-panel-call-api', { message });
        if (options?.reportError !== false) {
          setError(null);
        }
        return response;
      } catch (requestError) {
        if (options?.reportError !== false) {
          setError(requestError instanceof Error ? requestError.message : 'Richiesta Home Assistant fallita.');
        }
        if (options?.throwOnError) {
          throw requestError;
        }
        return null;
      }
    },
    [sendRequest],
  );

  return {
    isManagedByParent,
    bridgeProtocolVersion,
    bridgeCapabilities,
    locale,
    supportsSharedConfiguration: bridgeCapabilities.includes('shared_configuration'),
    supportsAppConfigurations: bridgeCapabilities.includes('app_configurations'),
    hassUrl: hassUrlRef.current,
    status,
    error,
    haStates,
    haAreas,
    lastUpdatedAt,
    connect,
    disconnect,
    callService,
    callApi,
  };
}

export default useHaPanelBridgeConnection;
