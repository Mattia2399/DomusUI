import React from 'react';
import { Activity, Clock3, Sparkles, Workflow } from 'lucide-react';
import FeatureAvailabilityPage from '../components/ui/FeatureAvailabilityPage';
import AiComposerPanel from './automations/AiComposerPanel';
import BuilderPanel from './automations/BuilderPanel';
import HaAutomationsPanel from './automations/HaAutomationsPanel';
import SavedAutomationsPanel from './automations/SavedAutomationsPanel';
import SearchControls from './automations/SearchControls';
import SelectionModal from './automations/SelectionModal';
import {
  STORAGE_KEY,
  TEMPLATE_ACTIONS,
  TEMPLATE_CONDITIONS,
  TEMPLATE_EVENTS,
  applySearchStatusAndSort,
  buildTitle,
  createActionOptions,
  createConditionOptions,
  createEventOptions,
  createHaAutomations,
  createHaSafeId,
  readSavedAutomations,
  toHaDurationFromSeconds,
  toHaAction,
  toHaCondition,
  toHaTrigger,
  withTemplates,
} from './automations/utils';
import { loadHassAuthTokensFromStorage, normalizeHassUrl } from '../services/haLive';
import { useI18n } from '../i18n/I18nProvider';

function toErrorMessage(error, fallback) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return fallback;
}

function isValidTimeValue(value) {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value.trim());
}

const HA_MISSING_GRACE_MS = 60_000;
export const AUTOMATIONS_WORKSPACE_AVAILABLE = false;

function AutomationsComingSoon() {
  const { t } = useI18n();
  return (
    <FeatureAvailabilityPage
      title={t('automations.title')}
      headline={t('automations.comingSoon.headline')}
      description={t('automations.comingSoon.description')}
      icon={Workflow}
    />
  );
}

export function AutomationsBuilder(props) {
  if (!AUTOMATIONS_WORKSPACE_AVAILABLE) {
    return <AutomationsComingSoon />;
  }
  return <AutomationsWorkspace {...props} />;
}

async function readHaErrorResponse(response) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (payload && typeof payload === 'object') {
    const source = payload;
    if (typeof source.message === 'string' && source.message.trim()) {
      return source.message.trim();
    }
    if (typeof source.error === 'string' && source.error.trim()) {
      return source.error.trim();
    }
  }

  return `HTTP ${response.status}`;
}

function AutomationsWorkspace({
  haStates = {},
  haStatus = 'disconnected',
  haUrl = '',
  haToken = '',
  onCallService,
}) {
  const { t, locale } = useI18n();
  const [event, setEvent] = React.useState(null);
  const [action, setAction] = React.useState(null);
  const [conditions, setConditions] = React.useState([]);
  const [conditionLogic, setConditionLogic] = React.useState('and');
  const [showCondition, setShowCondition] = React.useState(false);
  const [conditionMenuIndex, setConditionMenuIndex] = React.useState(null);
  const [activeMenu, setActiveMenu] = React.useState(null);
  const [automationName, setAutomationName] = React.useState('');
  const [eventTime, setEventTime] = React.useState('19:00');
  const [eventPersistenceSeconds, setEventPersistenceSeconds] = React.useState(0);
  const [conditionPersistenceSeconds, setConditionPersistenceSeconds] = React.useState(0);
  const [actionDelaySeconds, setActionDelaySeconds] = React.useState(0);
  const [editingId, setEditingId] = React.useState(null);
  const [builderError, setBuilderError] = React.useState(null);
  const [isSaving, setIsSaving] = React.useState(false);

  const [savedAutomations, setSavedAutomations] = React.useState(readSavedAutomations);
  const [runningId, setRunningId] = React.useState(null);
  const [runningHaId, setRunningHaId] = React.useState(null);
  const [deletingId, setDeletingId] = React.useState(null);

  const [searchQuery, setSearchQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [sourceFilter, setSourceFilter] = React.useState('all');
  const [sortBy, setSortBy] = React.useState('recent');

  const connected = haStatus === 'connected';
  const hasHaSnapshot = connected && Object.keys(haStates).length > 0;
  const canSave = Boolean(
    event &&
      action &&
      action.serviceDomain &&
      action.serviceName &&
      connected &&
      !isSaving &&
      (!showCondition || conditions.length > 0) &&
      (event.triggerType !== 'time' || isValidTimeValue(eventTime)),
  );

  const haAutomations = React.useMemo(() => createHaAutomations(haStates, locale), [haStates, locale]);

  const eventOptions = React.useMemo(
    () => withTemplates(createEventOptions(haStates, locale), TEMPLATE_EVENTS, 'tpl-event', locale),
    [haStates, locale],
  );
  const conditionOptions = React.useMemo(
    () => withTemplates(createConditionOptions(haStates, locale), TEMPLATE_CONDITIONS, 'tpl-condition', locale),
    [haStates, locale],
  );
  const actionOptions = React.useMemo(
    () => withTemplates(createActionOptions(haStates, locale), TEMPLATE_ACTIONS, 'tpl-action', locale),
    [haStates, locale],
  );

  const menuMap = React.useMemo(
    () => ({
      event: { title: t('automations.menu.event'), options: eventOptions },
      condition: {
        title: t('automations.menu.condition'),
        options: conditionOptions.filter((entry) => entry.isExecutable !== false),
      },
      action: {
        title: t('automations.menu.action'),
        options: actionOptions.filter((entry) => entry.isExecutable !== false),
      },
    }),
    [actionOptions, conditionOptions, eventOptions, t],
  );

  const activeMenuData = activeMenu ? menuMap[activeMenu] : null;

  const filteredHaAutomations = React.useMemo(
    () =>
      applySearchStatusAndSort({
        records: haAutomations,
        query: searchQuery,
        statusFilter,
        sortBy,
        getSearchText: (entry) => `${entry.name} ${entry.entityId} ${entry.configId ?? ''}`,
        getIsActive: (entry) => entry.state === 'on',
        getRecentTs: (entry) => entry.lastTriggered ?? 0,
        getLastTriggerTs: (entry) => entry.lastTriggered ?? 0,
        getName: (entry) => entry.name,
      }),
    [haAutomations, searchQuery, sortBy, statusFilter],
  );

  const filteredSavedAutomations = React.useMemo(
    () =>
      applySearchStatusAndSort({
        records: savedAutomations,
        query: searchQuery,
        statusFilter,
        sortBy,
        getSearchText: (entry) =>
          `${entry.name} ${entry.event?.label ?? ''} ${(Array.isArray(entry.conditions) ? entry.conditions : []).map((item) => item?.label ?? '').join(' ')} ${entry.condition?.label ?? ''} ${entry.action?.label ?? ''} ${entry.linkedHaEntityId ?? ''} ${entry.haConfigId ?? ''} ${entry.eventTime ?? ''} ${entry.manualEventType ?? ''}`,
        getIsActive: (entry) => Boolean(entry.enabled),
        getRecentTs: (entry) => entry.updatedAt ?? 0,
        getLastTriggerTs: (entry) => entry.lastTriggeredAt ?? entry.linkedHaLastTriggered ?? 0,
        getName: (entry) => entry.name ?? buildTitle(entry, locale),
      }),
    [locale, savedAutomations, searchQuery, sortBy, statusFilter],
  );

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(savedAutomations));
  }, [savedAutomations]);

  React.useEffect(() => {
    if (!activeMenu || typeof window === 'undefined') {
      return;
    }
    const onKeyDown = (eventKey) => {
      if (eventKey.key === 'Escape') {
        setActiveMenu(null);
        setConditionMenuIndex(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeMenu]);

  React.useEffect(() => {
    const byEntityId = new Map(haAutomations.map((entry) => [entry.entityId, entry]));
    const byConfigId = new Map(
      haAutomations
        .filter((entry) => typeof entry.configId === 'string' && entry.configId)
        .map((entry) => [entry.configId, entry]),
    );
    const now = Date.now();

    setSavedAutomations((current) => {
      let changed = false;
      const next = current
        .map((record) => {
        const linkedByConfig =
          record.haConfigId && byConfigId.has(record.haConfigId)
            ? byConfigId.get(record.haConfigId) ?? null
            : null;
        const linkedByEntity =
          record.linkedHaEntityId && byEntityId.has(record.linkedHaEntityId)
            ? byEntityId.get(record.linkedHaEntityId) ?? null
            : null;
        const linked = linkedByConfig ?? linkedByEntity;
        let nextLinkedId = record.linkedHaEntityId;
        let nextLinkedState = record.linkedHaState;
        let nextLinkedLastTriggered = record.linkedHaLastTriggered;
        let nextEnabled = record.enabled;
        let nextMissingInHaSince = record.missingInHaSince ?? null;

        if (linked) {
          nextLinkedId = linked.entityId;
          nextLinkedState = linked.state;
          nextLinkedLastTriggered = linked.lastTriggered;
          nextEnabled = linked.state === 'on';
          nextMissingInHaSince = null;
        } else if (hasHaSnapshot && record.haConfigId) {
          const missingSince = record.missingInHaSince ?? now;
          if (now - missingSince >= HA_MISSING_GRACE_MS) {
            changed = true;
            return null;
          }
          nextLinkedId = null;
          nextLinkedState = null;
          nextLinkedLastTriggered = null;
          nextMissingInHaSince = missingSince;
        }

        const hasChanges =
          record.linkedHaEntityId !== nextLinkedId ||
          record.linkedHaState !== nextLinkedState ||
          record.linkedHaLastTriggered !== nextLinkedLastTriggered ||
          record.enabled !== nextEnabled ||
          (record.missingInHaSince ?? null) !== nextMissingInHaSince;

        if (!hasChanges) {
          return record;
        }

        changed = true;
        return {
          ...record,
          linkedHaEntityId: nextLinkedId,
          linkedHaState: nextLinkedState,
          linkedHaLastTriggered: nextLinkedLastTriggered,
          enabled: nextEnabled,
          missingInHaSince: nextMissingInHaSince,
        };
      })
        .filter((record) => record !== null);
      return changed ? next : current;
    });
  }, [haAutomations, hasHaSnapshot]);

  const resetBuilder = React.useCallback(() => {
    setEvent(null);
    setAction(null);
    setConditions([]);
    setConditionLogic('and');
    setShowCondition(false);
    setConditionMenuIndex(null);
    setAutomationName('');
    setEventTime('19:00');
    setEventPersistenceSeconds(0);
    setConditionPersistenceSeconds(0);
    setActionDelaySeconds(0);
    setEditingId(null);
    setBuilderError(null);
    setActiveMenu(null);
  }, []);

  React.useEffect(() => {
    if (!editingId) {
      return;
    }
    const stillExists = savedAutomations.some((record) => record.id === editingId);
    if (!stillExists) {
      resetBuilder();
    }
  }, [editingId, resetBuilder, savedAutomations]);

  const selectMenuItem = React.useCallback(
    (item) => {
      if (activeMenu === 'event') {
        setEvent(item);
        if (item.triggerType === 'time') {
          setEventTime(item.defaultTime ?? '19:00');
        }
        const supportsPersistence =
          item?.triggerType === 'state' || item?.triggerConfig?.trigger === 'state';
        if (!supportsPersistence) {
          setEventPersistenceSeconds(0);
        }
      } else if (activeMenu === 'condition') {
        setConditions((current) => {
          if (conditionMenuIndex === null || conditionMenuIndex < 0) {
            return [...current, item];
          }
          if (conditionMenuIndex >= current.length) {
            return [...current, item];
          }
          const next = [...current];
          next[conditionMenuIndex] = item;
          return next;
        });
        setShowCondition(true);
        setConditionMenuIndex(null);
      } else if (activeMenu === 'action') {
        setAction(item);
      }
      setBuilderError(null);
      setActiveMenu(null);
    },
    [activeMenu, conditionMenuIndex],
  );

  const openConditionMenuAt = React.useCallback((index) => {
    setConditionMenuIndex(index);
    setActiveMenu('condition');
  }, []);

  const addCondition = React.useCallback(() => {
    setShowCondition(true);
    setConditionMenuIndex(null);
    setActiveMenu('condition');
  }, []);

  const removeConditionAt = React.useCallback((index) => {
    setConditions((current) => {
      const next = current.filter((_, itemIndex) => itemIndex !== index);
      if (next.length === 0) {
        setShowCondition(false);
        setConditionPersistenceSeconds(0);
      }
      return next;
    });
  }, []);

  const clearConditions = React.useCallback(() => {
    setConditions([]);
    setConditionLogic('and');
    setConditionPersistenceSeconds(0);
    setShowCondition(false);
    setConditionMenuIndex(null);
  }, []);

  const resolveHaApiContext = React.useCallback(async () => {
    const directUrl = normalizeHassUrl(haUrl);
    const directToken = haToken.trim();
    const storedTokens = directToken ? undefined : await loadHassAuthTokensFromStorage();
    const oauthUrl = normalizeHassUrl(storedTokens?.hassUrl ?? '');
    const oauthToken =
      typeof storedTokens?.access_token === 'string' ? storedTokens.access_token.trim() : '';
    const baseUrl = directUrl || oauthUrl;
    const token = directToken || oauthToken;

    if (!baseUrl) {
      throw new Error(t('automations.error.urlMissing'));
    }
    if (!token) {
      throw new Error(t('automations.error.tokenMissing'));
    }
    return { baseUrl, token };
  }, [haToken, haUrl, t]);

  const saveAutomationConfigOnHa = React.useCallback(
    async (configId, payload) => {
      const { baseUrl, token } = await resolveHaApiContext();
      const response = await fetch(
        `${baseUrl}/api/config/automation/config/${encodeURIComponent(configId)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorMessage = await readHaErrorResponse(response);
        throw new Error(t('automations.error.saveFailed', { error: errorMessage }));
      }
    },
    [resolveHaApiContext, t],
  );

  const deleteAutomationConfigOnHa = React.useCallback(
    async (configId) => {
      const { baseUrl, token } = await resolveHaApiContext();
      const response = await fetch(
        `${baseUrl}/api/config/automation/config/${encodeURIComponent(configId)}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        const errorMessage = await readHaErrorResponse(response);
        throw new Error(t('automations.error.deleteFailed', { error: errorMessage }));
      }
    },
    [resolveHaApiContext, t],
  );

  const fireManualEventOnHa = React.useCallback(
    async (eventType, eventData = {}) => {
      const { baseUrl, token } = await resolveHaApiContext();
      const response = await fetch(
        `${baseUrl}/api/events/${encodeURIComponent(eventType)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(eventData),
        },
      );

      if (!response.ok) {
        const errorMessage = await readHaErrorResponse(response);
        throw new Error(t('automations.error.manualFailed', { error: errorMessage }));
      }
    },
    [resolveHaApiContext, t],
  );

  const saveAutomation = React.useCallback(async () => {
    if (!event || !action || isSaving) {
      return;
    }

    const actionConfig = toHaAction(action);

    if (showCondition && conditions.length === 0) {
      setBuilderError(t('automations.error.addCondition'));
      return;
    }
    if (!actionConfig) {
      setBuilderError(t('automations.error.invalidAction'));
      return;
    }

    const now = Date.now();
    const currentRecord =
      editingId && savedAutomations.length > 0
        ? savedAutomations.find((record) => record.id === editingId) ?? null
        : null;

    const normalizedEventPersistence = Math.max(
      0,
      Number.parseInt(String(eventPersistenceSeconds ?? 0), 10) || 0,
    );
    const normalizedConditionPersistence = Math.max(
      0,
      Number.parseInt(String(conditionPersistenceSeconds ?? 0), 10) || 0,
    );
    const normalizedActionDelay = Math.max(
      0,
      Number.parseInt(String(actionDelaySeconds ?? 0), 10) || 0,
    );

    const effectiveEventTime =
      event.triggerType === 'time'
        ? eventTime.trim() || event.defaultTime || '19:00'
        : null;

    if (event.triggerType === 'time' && !isValidTimeValue(effectiveEventTime)) {
      setBuilderError(t('automations.error.invalidTime'));
      return;
    }

    const title =
      automationName.trim() ||
      buildTitle({
        event,
        eventTime: effectiveEventTime,
        conditions,
        conditionLogic,
        action,
        showCondition,
      }, locale);
    const haConfigId = currentRecord?.haConfigId ?? createHaSafeId(title);
    const manualEventType =
      event.triggerType === 'manual_event'
        ? currentRecord?.manualEventType ?? `ha_dashboard_manual_${haConfigId}`
        : null;
    const trigger = toHaTrigger(event, {
      timeAt: effectiveEventTime ?? undefined,
      manualEventType: manualEventType ?? undefined,
      persistenceSeconds: normalizedEventPersistence,
    });

    if (!trigger) {
      setBuilderError(t('automations.error.invalidEvent'));
      return;
    }

    const selectedConditions = showCondition ? conditions : [];
    const effectiveConditionPersistence = showCondition
      ? normalizedConditionPersistence
      : 0;
    const mappedConditions = selectedConditions.map((item) =>
      toHaCondition(item, { persistenceSeconds: effectiveConditionPersistence }),
    );
    if (showCondition && mappedConditions.some((item) => !item)) {
      setBuilderError(t('automations.error.invalidConditions'));
      return;
    }

    const payloadConditions = !showCondition
      ? []
      : conditionLogic === 'or'
        ? [{ condition: 'or', conditions: mappedConditions }]
        : mappedConditions;

    const actionSequence = [];
    const delayDuration = toHaDurationFromSeconds(normalizedActionDelay);
    if (delayDuration) {
      actionSequence.push({ delay: delayDuration });
    }
    actionSequence.push(actionConfig);

    const payload = {
      id: haConfigId,
      alias: title,
      description: 'Creata da dashboard builder',
      trigger: [trigger],
      condition: payloadConditions,
      action: actionSequence,
      mode: 'single',
    };

    setIsSaving(true);
    setBuilderError(null);

    try {
      await saveAutomationConfigOnHa(haConfigId, payload);
      if (connected && onCallService) {
        void onCallService('automation', 'reload', {});
      }

      const linked =
        haAutomations.find((entry) => entry.configId === haConfigId) ??
        (currentRecord?.linkedHaEntityId
          ? haAutomations.find((entry) => entry.entityId === currentRecord.linkedHaEntityId) ?? null
          : null);

      const nextRecord = {
        id: editingId ?? `aut-${now}-${Math.round(Math.random() * 10000)}`,
        name: title,
        event,
        conditions: showCondition ? conditions : [],
        condition: showCondition ? conditions[0] ?? null : null,
        conditionLogic,
        action,
        showCondition,
        enabled: linked ? linked.state === 'on' : currentRecord?.enabled ?? true,
        updatedAt: now,
        createdAt: currentRecord?.createdAt ?? now,
        lastTriggeredAt: currentRecord?.lastTriggeredAt ?? null,
        eventTime: effectiveEventTime,
        eventPersistenceSeconds: normalizedEventPersistence,
        conditionPersistenceSeconds: effectiveConditionPersistence,
        actionDelaySeconds: normalizedActionDelay,
        manualEventType,
        missingInHaSince: null,
        haConfigId,
        linkedHaEntityId: linked?.entityId ?? currentRecord?.linkedHaEntityId ?? null,
        autoLinkByName: false,
        linkedHaState: linked?.state ?? currentRecord?.linkedHaState ?? null,
        linkedHaLastTriggered: linked?.lastTriggered ?? currentRecord?.linkedHaLastTriggered ?? null,
      };

      if (editingId) {
        setSavedAutomations((current) =>
          current.map((record) => (record.id === editingId ? nextRecord : record)),
        );
      } else {
        setSavedAutomations((current) => [nextRecord, ...current]);
      }

      resetBuilder();
    } catch (error) {
      setBuilderError(toErrorMessage(error, t('automations.error.cannotSave')));
    } finally {
      setIsSaving(false);
    }
  }, [
    action,
    actionDelaySeconds,
    automationName,
    conditionLogic,
    conditionPersistenceSeconds,
    conditions,
    connected,
    editingId,
    event,
    eventPersistenceSeconds,
    eventTime,
    haAutomations,
    isSaving,
    locale,
    onCallService,
    resetBuilder,
    saveAutomationConfigOnHa,
    savedAutomations,
    showCondition,
    t,
  ]);

  const editAutomation = React.useCallback((record) => {
    setEditingId(record.id);
    setAutomationName(record.name ?? '');
    setEvent(record.event ?? null);
    setEventTime(record.eventTime ?? record.event?.defaultTime ?? '19:00');
    const nextConditions = Array.isArray(record.conditions)
      ? record.conditions.filter((item) => item && typeof item === 'object')
      : record.condition
        ? [record.condition]
        : [];
    setConditions(nextConditions);
    setConditionLogic(record.conditionLogic === 'or' ? 'or' : 'and');
    setShowCondition(nextConditions.length > 0);
    setConditionPersistenceSeconds(
      Math.max(0, Number.parseInt(String(record.conditionPersistenceSeconds ?? 0), 10) || 0),
    );
    setEventPersistenceSeconds(
      Math.max(0, Number.parseInt(String(record.eventPersistenceSeconds ?? 0), 10) || 0),
    );
    setActionDelaySeconds(
      Math.max(0, Number.parseInt(String(record.actionDelaySeconds ?? 0), 10) || 0),
    );
    setConditionMenuIndex(null);
    setAction(record.action ?? null);
    setBuilderError(null);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const deleteAutomation = React.useCallback(
    async (automationId) => {
      const target = savedAutomations.find((record) => record.id === automationId);
      if (!target) {
        return;
      }

      setBuilderError(null);
      setDeletingId(automationId);

      try {
        if (target.haConfigId) {
          await deleteAutomationConfigOnHa(target.haConfigId);
          if (connected && onCallService) {
            void onCallService('automation', 'reload', {});
          }
        }

        setSavedAutomations((current) =>
          current.filter((record) => record.id !== automationId),
        );
        if (editingId === automationId) {
          resetBuilder();
        }
      } catch (error) {
        setBuilderError(toErrorMessage(error, t('automations.error.cannotDelete')));
      } finally {
        setDeletingId(null);
      }
    },
    [
      connected,
      deleteAutomationConfigOnHa,
      editingId,
      onCallService,
      resetBuilder,
      savedAutomations,
      t,
    ],
  );

  const toggleSavedAutomation = React.useCallback(
    async (record) => {
      if (!connected || !onCallService || !record.linkedHaEntityId) {
        return;
      }

      const nextEnabled = !record.enabled;
      setSavedAutomations((current) =>
        current.map((entry) =>
          entry.id === record.id
            ? { ...entry, enabled: nextEnabled, updatedAt: Date.now() }
            : entry,
        ),
      );

      const ok = await onCallService(
        'automation',
        nextEnabled ? 'turn_on' : 'turn_off',
        { entity_id: record.linkedHaEntityId },
      );

      if (!ok) {
        setSavedAutomations((current) =>
          current.map((entry) =>
            entry.id === record.id ? { ...entry, enabled: record.enabled } : entry,
          ),
        );
      }
    },
    [connected, onCallService],
  );

  const runSavedAutomation = React.useCallback(
    async (record) => {
      if (!connected) {
        return;
      }

      setRunningId(record.id);
      try {
        let ok = false;
        let resolvedEntityId = record.linkedHaEntityId ?? null;

        if (record.event?.triggerType === 'manual_event') {
          if (!record.manualEventType) {
            setBuilderError(t('automations.error.manualMissing'));
            return;
          }
          await fireManualEventOnHa(record.manualEventType, {
            source: 'ha_dashboard_builder',
            automation_id: record.haConfigId ?? undefined,
          });
          ok = true;
        } else {
          if (!onCallService) {
            return;
          }
          resolvedEntityId =
            resolvedEntityId ??
            (record.haConfigId
              ? haAutomations.find((entry) => entry.configId === record.haConfigId)?.entityId ??
                null
              : null);

          if (!resolvedEntityId) {
            setBuilderError(t('automations.error.entitySync'));
            return;
          }

          ok = await onCallService('automation', 'trigger', {
            entity_id: resolvedEntityId,
            skip_condition: false,
          });
        }

        if (ok) {
          setSavedAutomations((current) =>
            current.map((entry) =>
              entry.id === record.id
                ? {
                    ...entry,
                    linkedHaEntityId: resolvedEntityId,
                    lastTriggeredAt: Date.now(),
                    missingInHaSince: null,
                  }
                : entry,
            ),
          );
        }
      } catch (error) {
        setBuilderError(toErrorMessage(error, t('automations.error.cannotRun')));
      } finally {
        setRunningId(null);
      }
    },
    [connected, fireManualEventOnHa, haAutomations, onCallService, t],
  );

  const triggerHaAutomation = React.useCallback(
    async (entityId) => {
      if (!connected || !onCallService) {
        return;
      }
      setRunningHaId(`trigger-${entityId}`);
      await onCallService('automation', 'trigger', {
        entity_id: entityId,
        skip_condition: false,
      });
      setRunningHaId(null);
    },
    [connected, onCallService],
  );

  const toggleHaAutomation = React.useCallback(
    async (entityId, currentState) => {
      if (!connected || !onCallService) {
        return;
      }
      const serviceName = currentState === 'on' ? 'turn_off' : 'turn_on';
      setRunningHaId(`toggle-${entityId}`);
      await onCallService('automation', serviceName, { entity_id: entityId });
      setRunningHaId(null);
    },
    [connected, onCallService],
  );

  const showHaPanel = sourceFilter === 'all' || sourceFilter === 'ha';
  const showLocalPanel = sourceFilter === 'all' || sourceFilter === 'local';
  const savedCount = savedAutomations.length;
  const savedActiveCount = savedAutomations.filter((entry) => entry.enabled).length;
  const scheduledCount = savedAutomations.filter(
    (entry) => entry.event?.triggerType === 'time',
  ).length;
  const haCount = haAutomations.length;
  const haActiveCount = haAutomations.filter((entry) => entry.state === 'on').length;
  const narrativePreview = React.useMemo(() => {
    const eventText = event
      ? event.triggerType === 'time' && isValidTimeValue(eventTime)
        ? t('automations.narrative.eventAt', { event: event.label, time: eventTime })
        : event.label
      : t('automations.builder.selectEvent');

    const eventPersistenceText =
      eventPersistenceSeconds > 0 ? t('automations.narrative.persistence', { seconds: eventPersistenceSeconds }) : '';

    const selectedConditions = showCondition ? conditions : [];
    const conditionText =
      showCondition && selectedConditions.length > 0
        ? t('automations.narrative.onlyIf', { conditions: `${selectedConditions
            .map((item) => item?.label ?? t('automations.builder.selectCondition'))
            .join(t(conditionLogic === 'or' ? 'automations.dynamic.or' : 'automations.dynamic.and'))}${
            conditionPersistenceSeconds > 0
              ? t('automations.narrative.validFor', { seconds: conditionPersistenceSeconds })
              : ''
          }` })
        : '';

    const actionText = action ? action.label : t('automations.builder.selectAction');
    const delayText = actionDelaySeconds > 0 ? t('automations.narrative.after', { seconds: actionDelaySeconds }) : '';

    return t('automations.narrative.full', {
      event: eventText,
      persistence: eventPersistenceText,
      condition: conditionText,
      delay: delayText,
      action: actionText,
    });
  }, [
    action,
    actionDelaySeconds,
    conditionLogic,
    conditionPersistenceSeconds,
    conditions,
    event,
    eventPersistenceSeconds,
    eventTime,
    showCondition,
    t,
  ]);

  return (
    <div className="dashboard-page-scroll">
      <div className="dashboard-page-content dashboard-page-content-wide gap-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="dashboard-page-title">
              {t('automations.title')}
            </h1>
            <p className="dashboard-page-subtitle">
              {t('automations.workspace.subtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              resetBuilder();
              if (typeof window !== 'undefined') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
            className="rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-5 py-2 text-sm text-[color:var(--ui-text-secondary)] transition-colors hover:bg-[color:var(--ui-fill-secondary)] hover:text-[color:var(--ui-text-primary)]"
          >
            {t('automations.workspace.new')}
          </button>
        </header>

        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.24fr)_minmax(420px,0.76fr)]">
          <div className="space-y-6">
            <section className="rounded-[2rem] border border-emerald-300/20 bg-emerald-400/[0.04] p-2 backdrop-blur-sm">
              <BuilderPanel
                automationName={automationName}
                onAutomationNameChange={(value) => {
                  setAutomationName(value);
                  setBuilderError(null);
                }}
                event={event}
                eventTime={eventTime}
                onEventTimeChange={(value) => {
                  setEventTime(value);
                  setBuilderError(null);
                }}
                conditions={conditions}
                conditionLogic={conditionLogic}
                onConditionLogicChange={(value) => setConditionLogic(value === 'or' ? 'or' : 'and')}
                onOpenConditionMenuAt={openConditionMenuAt}
                onAddCondition={addCondition}
                onRemoveCondition={removeConditionAt}
                onClearConditions={clearConditions}
                action={action}
                showCondition={showCondition}
                onOpenEventMenu={() => setActiveMenu('event')}
                onOpenActionMenu={() => setActiveMenu('action')}
                onShowCondition={addCondition}
                eventPersistenceSeconds={eventPersistenceSeconds}
                onEventPersistenceSecondsChange={(value) => {
                  setEventPersistenceSeconds(value);
                  setBuilderError(null);
                }}
                conditionPersistenceSeconds={conditionPersistenceSeconds}
                onConditionPersistenceSecondsChange={(value) => {
                  setConditionPersistenceSeconds(value);
                  setBuilderError(null);
                }}
                actionDelaySeconds={actionDelaySeconds}
                onActionDelaySecondsChange={(value) => {
                  setActionDelaySeconds(value);
                  setBuilderError(null);
                }}
                canSave={canSave}
                onSave={saveAutomation}
                onReset={resetBuilder}
                editingId={editingId}
                onCancelEdit={resetBuilder}
                connected={connected}
                isSaving={isSaving}
                saveError={builderError}
                narrativePreview={narrativePreview}
              />
            </section>

            <AiComposerPanel />
          </div>

          <aside className="space-y-4 xl:sticky xl:top-4">
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
              <div className="rounded-[1.6rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] p-4 backdrop-blur-2xl">
                <div className="flex items-center justify-between">
                  <Activity size={16} className="text-[color:var(--ui-success)]" />
                  <span className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--ui-text-tertiary)]">
                    {t('automations.workspace.createdHere')}
                  </span>
                </div>
                <p className="mt-2 text-2xl font-semibold text-[color:var(--ui-text-primary)]">{savedActiveCount}/{savedCount}</p>
                <p className="mt-1 text-xs text-[color:var(--ui-text-tertiary)]">{t('automations.workspace.activeNow')}</p>
              </div>
              <div className="rounded-[1.6rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] p-4 backdrop-blur-2xl">
                <div className="flex items-center justify-between">
                  <Sparkles size={16} className="text-[color:var(--ui-info)]" />
                  <span className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--ui-text-tertiary)]">
                    Home Assistant
                  </span>
                </div>
                <p className="mt-2 text-2xl font-semibold text-[color:var(--ui-text-primary)]">{haActiveCount}/{haCount}</p>
                <p className="mt-1 text-xs text-[color:var(--ui-text-tertiary)]">{t('automations.workspace.haActive')}</p>
              </div>
              <div className="rounded-[1.6rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] p-4 backdrop-blur-2xl">
                <div className="flex items-center justify-between">
                  <Clock3 size={16} className="text-[color:var(--ui-warning)]" />
                  <span className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--ui-text-tertiary)]">
                    {t('automations.workspace.scheduled')}
                  </span>
                </div>
                <p className="mt-2 text-2xl font-semibold text-[color:var(--ui-text-primary)]">{scheduledCount}</p>
                <p className="mt-1 text-xs text-[color:var(--ui-text-tertiary)]">{t('automations.workspace.timed')}</p>
              </div>
            </section>

            <section className="space-y-4 rounded-[2rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] p-4 backdrop-blur-2xl">
              <div className="px-2">
                <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--ui-text-tertiary)]">
                  {t('automations.workspace.archive')}
                </h2>
                <p className="mt-1 text-sm text-[color:var(--ui-text-tertiary)]">
                  {t('automations.workspace.archiveDescription')}
                </p>
              </div>

              <SearchControls
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
                sortBy={sortBy}
                onSortByChange={setSortBy}
                sourceFilter={sourceFilter}
                onSourceFilterChange={setSourceFilter}
              />

              <div className="grid max-h-[68vh] grid-cols-1 gap-4 overflow-y-auto pr-1">
                {showLocalPanel ? (
                  <SavedAutomationsPanel
                    records={filteredSavedAutomations}
                    connected={connected}
                    runningId={runningId}
                    deletingId={deletingId}
                    onToggle={toggleSavedAutomation}
                    onEdit={editAutomation}
                    onDelete={deleteAutomation}
                    onRun={runSavedAutomation}
                  />
                ) : null}

                {showHaPanel ? (
                  <HaAutomationsPanel
                    records={filteredHaAutomations}
                    connected={connected}
                    runningHaId={runningHaId}
                    onTrigger={triggerHaAutomation}
                    onToggle={toggleHaAutomation}
                  />
                ) : null}
              </div>
            </section>
          </aside>
        </div>
      </div>

      <SelectionModal
        isOpen={Boolean(activeMenuData)}
        kind={activeMenu}
        title={activeMenuData?.title ?? ''}
        options={activeMenuData?.options ?? []}
        connected={connected}
        onSelect={selectMenuItem}
        onClose={() => {
          setActiveMenu(null);
          setConditionMenuIndex(null);
        }}
      />
    </div>
  );
}

export default AutomationsBuilder;
