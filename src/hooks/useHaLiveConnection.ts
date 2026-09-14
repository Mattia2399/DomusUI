import { useCallback, useEffect, useRef, useState } from 'react';
import {
  callService as callHaService,
  createConnection,
  createLongLivedTokenAuth,
  getAuth,
  subscribeEntities,
  type Connection,
} from 'home-assistant-js-websocket';
import type { HassEntities } from 'home-assistant-js-websocket';
import {
  clearHassAuthTokensStorage,
  loadHassAuthTokensFromStorage,
  mapHassEntitiesToMock,
  validateHassUrl,
  saveHassAuthTokensToStorage,
} from '../services/haLive';
import type { MockEntityStateMap } from '../types/ha';
import {
  classifyHaConnectionFailure,
  HA_CONNECTION_OFFLINE_DELAY_MS,
  HA_CONNECTION_WATCHDOG_INTERVAL_MS,
  HA_CONNECTION_WATCHDOG_TIMEOUT_MS,
  isHaAuthenticationFailure,
  type HaConnectionStatus,
} from '../services/haConnectionState';

export type { HaConnectionStatus } from '../services/haConnectionState';

type HaLiveConnectionOptions = {
  url: string;
  token: string;
};

export type HaArea = {
  area_id: string;
  name: string;
  aliases?: string[];
  floor_id?: string | null;
  humidity_entity_id?: string | null;
  icon?: string | null;
  picture?: string;
  temperature_entity_id?: string | null;
};

// Coalesce noisy sensor streams. A dashboard does not benefit from repainting
// the whole canvas eight times per second, especially on large HA registries.
const HA_ENTITY_UPDATE_INTERVAL_MS = 250;

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
      const area: HaArea = {
        area_id: areaId,
        name,
      };
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

function toHaErrorMessage(error: unknown) {
  if (isHaAuthenticationFailure(error)) {
    return 'Autenticazione Home Assistant non valida o revocata.';
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return 'Connessione Home Assistant fallita.';
}

export function useHaLiveConnection({ url, token }: HaLiveConnectionOptions) {
  const [status, setStatus] = useState<HaConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [haStates, setHaStates] = useState<MockEntityStateMap>({});
  const [haAreas, setHaAreas] = useState<HaArea[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const connectionRef = useRef<Connection | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const rawEntitiesRef = useRef<HassEntities>({});
  const pendingEntitiesRef = useRef<HassEntities | null>(null);
  const entityUpdateTimeoutRef = useRef<number | null>(null);
  const statusRef = useRef<HaConnectionStatus>('disconnected');
  const manualDisconnectRef = useRef(false);
  const removeConnectionListenersRef = useRef<(() => void) | null>(null);
  const offlineTimeoutRef = useRef<number | null>(null);
  const watchdogIntervalRef = useRef<number | null>(null);
  const watchdogInFlightRef = useRef(false);

  const updateStatus = useCallback((nextStatus: HaConnectionStatus) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  }, []);

  const clearOfflineTimeout = useCallback(() => {
    if (offlineTimeoutRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(offlineTimeoutRef.current);
    }
    offlineTimeoutRef.current = null;
  }, []);

  const clearWatchdog = useCallback(() => {
    if (watchdogIntervalRef.current !== null && typeof window !== 'undefined') {
      window.clearInterval(watchdogIntervalRef.current);
    }
    watchdogIntervalRef.current = null;
    watchdogInFlightRef.current = false;
  }, []);

  const clearPendingEntityUpdate = useCallback(() => {
    if (entityUpdateTimeoutRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(entityUpdateTimeoutRef.current);
    }
    entityUpdateTimeoutRef.current = null;
    pendingEntitiesRef.current = null;
  }, []);

  const publishEntitySnapshot = useCallback((entities: HassEntities, hassUrl: string) => {
    const previousRawEntities = rawEntitiesRef.current;
    const changedEntities: HassEntities = {};
    let changed = false;

    Object.entries(entities).forEach(([entityId, entity]) => {
      if (previousRawEntities[entityId] === entity) {
        return;
      }
      changedEntities[entityId] = entity;
      changed = true;
    });
    const removedEntityIds = Object.keys(previousRawEntities).filter((entityId) => !(entityId in entities));
    if (removedEntityIds.length > 0) {
      changed = true;
    }

    rawEntitiesRef.current = entities;
    if (!changed) {
      return;
    }

    setHaStates((current) => {
      const mappedChanges = mapHassEntitiesToMock(changedEntities, hassUrl, current);
      const next = { ...current, ...mappedChanges };
      removedEntityIds.forEach((entityId) => {
        delete next[entityId];
      });
      return next;
    });
    setLastUpdatedAt(Date.now());
  }, []);

  const queueEntitySnapshot = useCallback(
    (entities: HassEntities, hassUrl: string) => {
      pendingEntitiesRef.current = entities;
      if (entityUpdateTimeoutRef.current !== null) {
        return;
      }

      // Publish the initial HA snapshot immediately. Subsequent state_changed
      // bursts are coalesced so large installations cannot force a complete
      // dashboard render for every sensor event.
      if (Object.keys(rawEntitiesRef.current).length === 0) {
        const initialSnapshot = pendingEntitiesRef.current;
        pendingEntitiesRef.current = null;
        if (initialSnapshot) {
          publishEntitySnapshot(initialSnapshot, hassUrl);
        }
        return;
      }

      entityUpdateTimeoutRef.current = window.setTimeout(() => {
        entityUpdateTimeoutRef.current = null;
        const latestSnapshot = pendingEntitiesRef.current;
        pendingEntitiesRef.current = null;
        if (latestSnapshot) {
          publishEntitySnapshot(latestSnapshot, hassUrl);
        }
      }, HA_ENTITY_UPDATE_INTERVAL_MS);
    },
    [publishEntitySnapshot],
  );

  const teardownConnection = useCallback((clearSnapshots: boolean) => {
    clearOfflineTimeout();
    clearWatchdog();
    clearPendingEntityUpdate();
    removeConnectionListenersRef.current?.();
    removeConnectionListenersRef.current = null;
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    connectionRef.current?.close();
    connectionRef.current = null;
    if (clearSnapshots) {
      setHaStates({});
      setHaAreas([]);
      setLastUpdatedAt(null);
      rawEntitiesRef.current = {};
    }
  }, [clearOfflineTimeout, clearPendingEntityUpdate, clearWatchdog]);

  const scheduleOfflineState = useCallback(() => {
    clearOfflineTimeout();
    if (typeof window === 'undefined') {
      updateStatus('offline');
      return;
    }
    offlineTimeoutRef.current = window.setTimeout(() => {
      offlineTimeoutRef.current = null;
      if (statusRef.current === 'reconnecting') {
        updateStatus('offline');
        setError('Home Assistant non Ã¨ raggiungibile. I dati mostrati potrebbero non essere aggiornati.');
      }
    }, HA_CONNECTION_OFFLINE_DELAY_MS);
  }, [clearOfflineTimeout, updateStatus]);

  const markTransientDisconnection = useCallback(() => {
    if (manualDisconnectRef.current || statusRef.current === 'reauth_required') {
      return;
    }
    clearWatchdog();
    updateStatus('reconnecting');
    setError('Connessione temporaneamente interrotta. Riconnessione automatica in corso.');
    scheduleOfflineState();
  }, [clearWatchdog, scheduleOfflineState, updateStatus]);

  const startWatchdog = useCallback((connection: Connection) => {
    clearWatchdog();
    if (typeof window === 'undefined') {
      return;
    }
    watchdogIntervalRef.current = window.setInterval(() => {
      if (
        watchdogInFlightRef.current ||
        connectionRef.current !== connection ||
        statusRef.current !== 'connected'
      ) {
        return;
      }
      watchdogInFlightRef.current = true;
      let timeoutId: number | null = null;
      const timeout = new Promise<false>((resolve) => {
        timeoutId = window.setTimeout(() => resolve(false), HA_CONNECTION_WATCHDOG_TIMEOUT_MS);
      });
      void Promise.race([
        connection.ping().then(() => true, () => false),
        timeout,
      ]).then((alive) => {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
        watchdogInFlightRef.current = false;
        if (!alive && connectionRef.current === connection) {
          markTransientDisconnection();
          connection.reconnect(true);
        }
      });
    }, HA_CONNECTION_WATCHDOG_INTERVAL_MS);
  }, [clearWatchdog, markTransientDisconnection]);

  const disconnect = useCallback(() => {
    manualDisconnectRef.current = true;
    teardownConnection(true);
    updateStatus('disconnected_by_user');
    setError(null);
  }, [teardownConnection, updateStatus]);

  const connect = useCallback(async () => {
    const urlValidation = validateHassUrl(url);
    const hassUrl = urlValidation.ok ? urlValidation.url : '';
    const tokenValue = token.trim();

    if (!hassUrl) {
      setStatus('error');
      setError(urlValidation.ok === false ? urlValidation.error : 'URL Home Assistant non valido.');
      return;
    }

    manualDisconnectRef.current = false;
    teardownConnection(false);
    updateStatus('connecting');
    setError(null);

    try {
      const auth = tokenValue
        ? createLongLivedTokenAuth(hassUrl, tokenValue)
        : await getAuth({
            hassUrl,
            clientId: typeof window !== 'undefined' ? window.location.origin : null,
            saveTokens: saveHassAuthTokensToStorage,
            loadTokens: loadHassAuthTokensFromStorage,
            limitHassInstance: true,
          });
      const connection = await createConnection({ auth, setupRetry: 2 });
      if (manualDisconnectRef.current) {
        connection.close();
        return;
      }

      const handleReady = () => {
        if (connectionRef.current !== connection || manualDisconnectRef.current) {
          return;
        }
        clearOfflineTimeout();
        updateStatus('connected');
        setError(null);
        startWatchdog(connection);
      };
      const handleDisconnected = () => {
        if (connectionRef.current === connection) {
          markTransientDisconnection();
        }
      };
      const handleReconnectError = (_connection: Connection, eventData?: unknown) => {
        if (connectionRef.current !== connection) {
          return;
        }
        if (isHaAuthenticationFailure(eventData)) {
          clearOfflineTimeout();
          clearWatchdog();
          clearHassAuthTokensStorage();
          updateStatus('reauth_required');
          setError('La sessione Home Assistant non Ã¨ piÃ¹ valida. Accedi nuovamente.');
          return;
        }
        markTransientDisconnection();
      };

      connection.addEventListener('ready', handleReady);
      connection.addEventListener('disconnected', handleDisconnected);
      connection.addEventListener('reconnect-error', handleReconnectError);
      removeConnectionListenersRef.current = () => {
        connection.removeEventListener('ready', handleReady);
        connection.removeEventListener('disconnected', handleDisconnected);
        connection.removeEventListener('reconnect-error', handleReconnectError);
      };

      const unsubscribe = subscribeEntities(connection, (entities: HassEntities) => {
        queueEntitySnapshot(entities, hassUrl);
      });

      connectionRef.current = connection;
      unsubscribeRef.current = unsubscribe;
      clearOfflineTimeout();
      updateStatus('connected');
      startWatchdog(connection);

      // The entity subscription is the actual connection boundary. Registry
      // reads are optional and can be unavailable to limited HA users; they
      // must not downgrade an authenticated, working connection to an error.
      void connection
        .sendMessagePromise<unknown>({ type: 'config/area_registry/list' })
        .then((areaRegistry) => {
          if (connectionRef.current === connection) {
            setHaAreas(parseAreaRegistryPayload(areaRegistry));
          }
        })
        .catch(() => {
          if (connectionRef.current === connection) {
            setHaAreas([]);
          }
        });
    } catch (err) {
      if (manualDisconnectRef.current) {
        return;
      }
      const failureStatus = classifyHaConnectionFailure(err);
      if (!tokenValue && failureStatus === 'reauth_required') {
        clearHassAuthTokensStorage();
      }
      updateStatus(failureStatus);
      setError(toHaErrorMessage(err));
      setHaAreas([]);
    }
  }, [clearOfflineTimeout, clearWatchdog, markTransientDisconnection, queueEntitySnapshot, startWatchdog, teardownConnection, token, updateStatus, url]);

  const callService = useCallback(
    async (domain: string, service: string, serviceData: Record<string, unknown>) => {
      if (
        statusRef.current !== 'connected' ||
        !connectionRef.current ||
        !connectionRef.current.connected
      ) {
        setError('Connessione Home Assistant non disponibile.');
        return false;
      }

      try {
        await callHaService(connectionRef.current, domain, service, serviceData);
        setError(null);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Richiesta Home Assistant fallita.');
        return false;
      }
    },
    [],
  );

  const callApi = useCallback(
    async <TResponse = unknown>(
      message: Record<string, unknown>,
      options?: { reportError?: boolean; throwOnError?: boolean },
    ) => {
      if (
        statusRef.current !== 'connected' ||
        !connectionRef.current ||
        !connectionRef.current.connected
      ) {
        const connectionError = new Error('Connessione Home Assistant non disponibile.');
        if (options?.reportError !== false) {
          setError(connectionError.message);
        }
        if (options?.throwOnError) {
          throw connectionError;
        }
        return null;
      }

      try {
        const response = await connectionRef.current.sendMessagePromise<TResponse>(
          message as never,
        );
        if (options?.reportError !== false) {
          setError(null);
        }
        return response;
      } catch (err) {
        if (options?.reportError !== false) {
          setError(err instanceof Error ? err.message : 'Richiesta Home Assistant fallita.');
        }
        if (options?.throwOnError) {
          throw err;
        }
        return null;
      }
    },
    [],
  );

  const subscribeApi = useCallback(
    async <TEvent = unknown>(
      message: Record<string, unknown>,
      callback: (event: TEvent) => void,
    ) => {
      if (
        statusRef.current !== 'connected' ||
        !connectionRef.current ||
        !connectionRef.current.connected
      ) {
        throw new Error('Connessione Home Assistant non disponibile.');
      }
      return connectionRef.current.subscribeMessage(
        callback as (event: unknown) => void,
        message as never,
      );
    },
    [],
  );

  useEffect(() => () => {
    manualDisconnectRef.current = true;
    teardownConnection(false);
  }, [teardownConnection]);

  return {
    status,
    error,
    haStates,
    haAreas,
    lastUpdatedAt,
    connect,
    disconnect,
    callService,
    callApi,
    subscribeApi,
  };
}
