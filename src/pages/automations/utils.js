import { translateForLocale } from '../../i18n/I18nProvider';

export const STORAGE_KEY = 'ha.dashboard.automations.builder.v3';

export const TEMPLATE_EVENTS = [
  {
    id: 'e0',
    label: 'Avvio Manuale da Dashboard',
    icon: 'Play',
    description: 'Parte quando invii il trigger manuale dalla dashboard',
    keywords: 'manuale pulsante dashboard trigger',
    group: 'Manuale',
    triggerType: 'manual_event',
    isExecutable: true,
  },
  {
    id: 'e4',
    label: 'A Orario Specifico',
    icon: 'Clock3',
    description: 'Parte ogni giorno all orario scelto',
    keywords: 'orario pianificazione timer',
    group: 'Orario',
    triggerType: 'time',
    defaultTime: '19:00',
    isExecutable: true,
  },
  {
    id: 'e1',
    label: 'Evento Custom: Porta Ingresso Aperta',
    icon: 'DoorOpen',
    description: 'Scatta quando un sistema esterno invia questo evento custom',
    keywords: 'porta ingresso apertura sicurezza',
    group: 'Ingressi',
    triggerConfig: { trigger: 'event', event_type: 'ha_dashboard_porta_ingresso_aperta' },
    isExecutable: true,
  },
  {
    id: 'e2',
    label: 'Evento Custom: Movimento Salotto',
    icon: 'PersonStanding',
    description: 'Scatta quando un sistema esterno invia questo evento custom',
    keywords: 'movimento presenza salotto',
    group: 'Presenza',
    triggerConfig: { trigger: 'event', event_type: 'ha_dashboard_movimento_salotto' },
    isExecutable: true,
  },
  {
    id: 'e3',
    label: 'Tramonto',
    icon: 'Sunset',
    description: 'Scatta automaticamente al tramonto',
    keywords: 'tramonto sole sera',
    group: 'Orario',
    triggerConfig: { trigger: 'sun', event: 'sunset' },
    isExecutable: true,
  },
];

export const TEMPLATE_CONDITIONS = [
  {
    id: 'c1',
    label: 'E notte',
    icon: 'Moon',
    description: 'Valida solo durante le ore notturne',
    keywords: 'notte buio',
    group: 'Orario',
    isExecutable: false,
  },
  {
    id: 'c2',
    label: 'Nessuno e in casa',
    icon: 'Home',
    description: 'Valida solo quando la casa e vuota',
    keywords: 'assenza casa vuota',
    group: 'Presenza',
    isExecutable: false,
  },
];

export const TEMPLATE_ACTIONS = [
  {
    id: 'a1',
    label: 'Accendi Luci Salotto',
    icon: 'Lightbulb',
    description: 'Attiva le luci del salotto',
    keywords: 'luci salotto accensione',
    group: 'Illuminazione',
    isExecutable: false,
  },
  {
    id: 'a2',
    label: 'Suona Allarme',
    icon: 'Siren',
    description: 'Attiva la sirena di allarme',
    keywords: 'allarme sirena sicurezza',
    group: 'Sicurezza',
    isExecutable: false,
  },
  {
    id: 'a3',
    label: 'Imposta Clima a 22 gradi',
    icon: 'Thermometer',
    description: 'Imposta il clima a 22 gradi',
    keywords: 'clima temperatura 22',
    group: 'Clima',
    isExecutable: false,
  },
];

export const DOMAIN_ICON = {
  alarm_control_panel: 'Siren',
  automation: 'Sparkles',
  binary_sensor: 'DoorOpen',
  climate: 'Thermometer',
  cover: 'DoorOpen',
  device_tracker: 'PersonStanding',
  fan: 'Wind',
  light: 'Lightbulb',
  lock: 'Lock',
  media_player: 'Power',
  person: 'PersonStanding',
  scene: 'Sparkles',
  script: 'Sparkles',
  sensor: 'Sparkles',
  sun: 'Sunset',
  switch: 'Power',
};

export const ACTION_SERVICE = {
  automation: {
    serviceName: 'trigger',
    serviceData: (entityId) => ({ entity_id: entityId, skip_condition: false }),
  },
  climate: {
    serviceName: 'set_temperature',
    serviceData: (entityId) => ({ entity_id: entityId, temperature: 22 }),
  },
  fan: {
    serviceName: 'turn_on',
    serviceData: (entityId) => ({ entity_id: entityId }),
  },
  light: {
    serviceName: 'turn_on',
    serviceData: (entityId) => ({ entity_id: entityId }),
  },
  lock: {
    serviceName: 'unlock',
    serviceData: (entityId) => ({ entity_id: entityId }),
  },
  media_player: {
    serviceName: 'media_play_pause',
    serviceData: (entityId) => ({ entity_id: entityId }),
  },
  scene: {
    serviceName: 'turn_on',
    serviceData: (entityId) => ({ entity_id: entityId }),
  },
  script: {
    serviceName: 'turn_on',
    serviceData: (entityId) => ({ entity_id: entityId }),
  },
  switch: {
    serviceName: 'turn_on',
    serviceData: (entityId) => ({ entity_id: entityId }),
  },
};

export const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'Tutti gli stati' },
  { value: 'active', label: 'Solo attive' },
  { value: 'inactive', label: 'Solo disattivate' },
];

export const SOURCE_FILTER_OPTIONS = [
  { value: 'all', label: 'Tutto' },
  { value: 'ha', label: 'Solo HA' },
  { value: 'local', label: 'Solo Create da noi' },
];

export const SORT_OPTIONS = [
  { value: 'recent', label: 'Piu recenti' },
  { value: 'name', label: 'Nome A-Z' },
  { value: 'last_trigger', label: 'Ultimo trigger' },
];

export function toDomain(entityId) {
  return entityId.split('.')[0] ?? '';
}

export function normalizeName(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, ' ');
}

export function createHaSafeId(name) {
  const normalized = normalizeName(name)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const base = normalized || 'automazione_builder';
  return `${base}_${Date.now().toString(36)}`;
}

export function entityLabel(entityId, state) {
  const friendly = state?.rawAttributes?.friendly_name;
  if (typeof friendly === 'string' && friendly.trim()) {
    return friendly.trim();
  }
  const [, objectId = entityId] = entityId.split('.');
  return objectId.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function stateLabel(value, locale = 'it') {
  if (typeof value !== 'string') {
    return translateForLocale(locale, 'automations.dynamic.stateUpdated');
  }
  return value.replace(/_/g, ' ');
}

function eventGroupByDomain(domain, locale = 'it') {
  if (domain === 'sun') {
    return translateForLocale(locale, 'automations.group.time');
  }
  if (domain === 'binary_sensor' || domain === 'lock' || domain === 'cover') {
    return translateForLocale(locale, 'automations.group.entries');
  }
  return translateForLocale(locale, 'automations.group.presence');
}

function actionGroupByDomain(domain, locale = 'it') {
  if (domain === 'light' || domain === 'switch') {
    return translateForLocale(locale, 'automations.group.lighting');
  }
  if (domain === 'climate' || domain === 'fan') {
    return translateForLocale(locale, 'automations.group.climate');
  }
  if (domain === 'lock' || domain === 'automation') {
    return translateForLocale(locale, 'automations.group.security');
  }
  if (domain === 'media_player') {
    return translateForLocale(locale, 'automations.group.media');
  }
  return translateForLocale(locale, 'automations.group.scene');
}

function actionDescriptionByDomain(domain, label, locale = 'it') {
  if (domain === 'climate') {
    return translateForLocale(locale, 'automations.dynamic.climate', { label });
  }
  if (domain === 'light' || domain === 'switch') {
    return translateForLocale(locale, 'automations.dynamic.turnOn', { label });
  }
  if (domain === 'fan') {
    return translateForLocale(locale, 'automations.dynamic.start', { label });
  }
  if (domain === 'lock') {
    return translateForLocale(locale, 'automations.dynamic.unlock', { label });
  }
  if (domain === 'automation') {
    return translateForLocale(locale, 'automations.dynamic.execute', { label });
  }
  if (domain === 'media_player') {
    return translateForLocale(locale, 'automations.dynamic.play', { label });
  }
  return translateForLocale(locale, 'automations.dynamic.activate', { label });
}

export function withTemplates(haList, templates, keyPrefix, locale = 'it') {
  const mappedTemplates = templates.map((entry) => ({
    ...entry,
    id: `${keyPrefix}-${entry.id}`,
    source: 'template',
    label: translateForLocale(locale, `automations.template.${entry.id}.label`),
    description: translateForLocale(locale, `automations.template.${entry.id}.description`),
    group: translateForLocale(locale, entry.id === 'e0'
      ? 'automations.group.manual'
      : ['e4', 'e3', 'c1'].includes(entry.id)
        ? 'automations.group.time'
        : entry.id === 'e1'
          ? 'automations.group.entries'
          : ['e2', 'c2'].includes(entry.id)
            ? 'automations.group.presence'
            : entry.id === 'a1'
              ? 'automations.group.lighting'
              : entry.id === 'a2'
                ? 'automations.group.security'
                : 'automations.group.climate'),
  }));
  return haList.length > 0 ? [...haList, ...mappedTemplates] : mappedTemplates;
}

export function buildTitle(record, locale = 'it') {
  const eventText =
    record.event?.triggerType === 'time' && record.eventTime
      ? `${record.event.label} (${record.eventTime})`
      : record.event.label;
  const conditionsList = Array.isArray(record.conditions)
    ? record.conditions
    : record.condition
      ? [record.condition]
      : [];
  const conditionText =
    record.showCondition && conditionsList.length > 0
      ? translateForLocale(locale, 'automations.dynamic.onlyIf', {
          conditions: conditionsList
            .map((item) => item?.label)
            .filter((item) => typeof item === 'string' && item.trim())
            .join(translateForLocale(locale, record.conditionLogic === 'or' ? 'automations.dynamic.or' : 'automations.dynamic.and')),
        })
      : ',';
  return translateForLocale(locale, 'automations.dynamic.title', {
    event: eventText,
    condition: conditionText,
    action: record.action.label,
  });
}

export function formatDate(value, locale = 'it') {
  if (typeof value !== 'number') {
    return locale === 'fr' ? 'Jamais' : locale === 'en' ? 'Never' : 'Mai';
  }
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

function normalizeNonNegativeInteger(value, fallback = 0) {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value.trim(), 10)
        : Number.NaN;
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(0, Math.round(numeric));
}

function normalizeSavedRecord(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  if (!entry.event || !entry.action) {
    return null;
  }

  const now = Date.now();
  const record = entry;
  const normalizedConditions = Array.isArray(record.conditions)
    ? record.conditions.filter((item) => item && typeof item === 'object')
    : record.condition
      ? [record.condition]
      : [];
  return {
    id:
      typeof record.id === 'string'
        ? record.id
        : `aut-${now}-${Math.round(Math.random() * 100000)}`,
    name: typeof record.name === 'string' ? record.name : '',
    event: record.event,
    conditions: normalizedConditions,
    condition: normalizedConditions[0] ?? null,
    conditionLogic: record.conditionLogic === 'or' ? 'or' : 'and',
    action: record.action,
    showCondition:
      typeof record.showCondition === 'boolean'
        ? record.showCondition
        : normalizedConditions.length > 0,
    enabled: record.enabled !== false,
    updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : now,
    createdAt: typeof record.createdAt === 'number' ? record.createdAt : now,
    lastTriggeredAt:
      typeof record.lastTriggeredAt === 'number' ? record.lastTriggeredAt : null,
    haConfigId:
      typeof record.haConfigId === 'string' && record.haConfigId.trim()
        ? record.haConfigId.trim()
        : null,
    linkedHaEntityId:
      typeof record.linkedHaEntityId === 'string' && record.linkedHaEntityId.trim()
        ? record.linkedHaEntityId.trim()
        : null,
    autoLinkByName: record.autoLinkByName !== false,
    linkedHaState:
      typeof record.linkedHaState === 'string' ? record.linkedHaState : null,
    linkedHaLastTriggered:
      typeof record.linkedHaLastTriggered === 'number'
        ? record.linkedHaLastTriggered
        : null,
    eventTime:
      typeof record.eventTime === 'string' && record.eventTime.trim()
        ? record.eventTime.trim()
        : null,
    manualEventType:
      typeof record.manualEventType === 'string' && record.manualEventType.trim()
        ? record.manualEventType.trim()
        : null,
    eventPersistenceSeconds: normalizeNonNegativeInteger(
      record.eventPersistenceSeconds,
      0,
    ),
    conditionPersistenceSeconds: normalizeNonNegativeInteger(
      record.conditionPersistenceSeconds,
      0,
    ),
    actionDelaySeconds: normalizeNonNegativeInteger(record.actionDelaySeconds, 0),
    missingInHaSince:
      typeof record.missingInHaSince === 'number' ? record.missingInHaSince : null,
  };
}

export function readSavedAutomations() {
  if (typeof window === 'undefined') {
    return [];
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((entry) => normalizeSavedRecord(entry))
      .filter((entry) => entry !== null);
  } catch {
    return [];
  }
}

export function createHaAutomations(haStates, locale = 'it') {
  return Object.entries(haStates)
    .filter(([entityId]) => entityId.startsWith('automation.'))
    .map(([entityId, state]) => ({
      entityId,
      name: entityLabel(entityId, state),
      configId:
        typeof state?.rawAttributes?.id === 'string' && state.rawAttributes.id.trim()
          ? state.rawAttributes.id.trim()
          : null,
      state: state.state,
      lastTriggered:
        typeof state?.rawAttributes?.last_triggered === 'string'
          ? Date.parse(state.rawAttributes.last_triggered)
          : null,
    }))
    .sort((first, second) => first.name.localeCompare(second.name, locale));
}

export function createEventOptions(haStates, locale = 'it') {
  const allowedDomains = new Set([
    'binary_sensor',
    'sun',
    'person',
    'device_tracker',
    'lock',
    'cover',
  ]);

  return Object.entries(haStates)
    .filter(([entityId]) => allowedDomains.has(toDomain(entityId)))
    .map(([entityId, state]) => {
      const domain = toDomain(entityId);
      const label = entityLabel(entityId, state);
      return {
        id: `ha-event-${entityId}`,
        label,
        icon: DOMAIN_ICON[domain] ?? 'Sparkles',
        source: 'ha',
        entityId,
        domain,
        triggerType: domain === 'sun' ? 'sun' : 'state',
        isExecutable: true,
        group: eventGroupByDomain(domain, locale),
        description:
          domain === 'sun'
            ? translateForLocale(locale, 'automations.dynamic.sunset')
            : translateForLocale(locale, 'automations.dynamic.stateChange', { label, state: stateLabel(state.state, locale) }),
        keywords: `${label} ${domain} ${stateLabel(state.state, locale)}`,
        triggerConfig:
          domain === 'sun'
            ? { trigger: 'sun', event: 'sunset' }
            : { trigger: 'state', entity_id: entityId },
      };
    })
    .sort((first, second) => first.label.localeCompare(second.label, locale));
}

export function createConditionOptions(haStates, locale = 'it') {
  const allowedDomains = new Set([
    'person',
    'device_tracker',
    'sun',
    'input_boolean',
    'alarm_control_panel',
  ]);

  return Object.entries(haStates)
    .filter(([entityId]) => allowedDomains.has(toDomain(entityId)))
    .map(([entityId, state]) => {
      const domain = toDomain(entityId);
      const label = entityLabel(entityId, state);
      return {
        id: `ha-condition-${entityId}`,
        label,
        icon: DOMAIN_ICON[domain] ?? 'Sparkles',
        source: 'ha',
        entityId,
        isExecutable: true,
        group: eventGroupByDomain(domain, locale),
        description: translateForLocale(locale, 'automations.dynamic.condition', { label, state: stateLabel(state.state, locale) }),
        keywords: `${label} ${domain} ${stateLabel(state.state, locale)}`,
        expectedState: state.state,
      };
    })
    .sort((first, second) => first.label.localeCompare(second.label, locale));
}

export function createActionOptions(haStates, locale = 'it') {
  const allowedDomains = new Set(Object.keys(ACTION_SERVICE));

  return Object.entries(haStates)
    .filter(([entityId]) => allowedDomains.has(toDomain(entityId)))
    .map(([entityId, state]) => {
      const domain = toDomain(entityId);
      const serviceConfig = ACTION_SERVICE[domain];
      if (!serviceConfig) {
        return null;
      }
      const label = entityLabel(entityId, state);
      return {
        id: `ha-action-${entityId}`,
        label,
        icon: DOMAIN_ICON[domain] ?? 'Sparkles',
        source: 'ha',
        entityId,
        domain,
        isExecutable: true,
        group: actionGroupByDomain(domain, locale),
        description: actionDescriptionByDomain(domain, label, locale),
        keywords: `${label} ${domain}`,
        serviceDomain: domain,
        serviceName: serviceConfig.serviceName,
        serviceData: serviceConfig.serviceData(entityId),
      };
    })
    .filter((entry) => entry !== null)
    .sort((first, second) => first.label.localeCompare(second.label, locale));
}

function toHaTime(timeValue) {
  if (typeof timeValue !== 'string') {
    return null;
  }
  const normalized = timeValue.trim();
  if (!/^\d{2}:\d{2}$/.test(normalized) && !/^\d{2}:\d{2}:\d{2}$/.test(normalized)) {
    return null;
  }
  if (normalized.length === 5) {
    return `${normalized}:00`;
  }
  return normalized;
}

export function toHaDurationFromSeconds(secondsValue) {
  const totalSeconds =
    typeof secondsValue === 'number'
      ? Math.round(secondsValue)
      : Number.parseInt(String(secondsValue ?? '').trim(), 10);
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return null;
  }
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(
    seconds,
  ).padStart(2, '0')}`;
}

export function toHaTrigger(eventOption, context = {}) {
  const triggerPersistence = toHaDurationFromSeconds(context.persistenceSeconds ?? 0);
  if (eventOption?.triggerType === 'time') {
    const at = toHaTime(context.timeAt ?? eventOption.defaultTime ?? '19:00');
    if (!at) {
      return null;
    }
    return {
      trigger: 'time',
      at,
    };
  }

  if (eventOption?.triggerType === 'manual_event') {
    const eventType = String(context.manualEventType ?? '').trim();
    if (!eventType) {
      return null;
    }
    return {
      trigger: 'event',
      event_type: eventType,
    };
  }

  if (eventOption?.triggerConfig) {
    const baseTrigger =
      eventOption.triggerConfig && typeof eventOption.triggerConfig === 'object'
        ? { ...eventOption.triggerConfig }
        : null;
    if (!baseTrigger) {
      return null;
    }
    if (baseTrigger.trigger === 'state' && triggerPersistence) {
      return {
        ...baseTrigger,
        for: triggerPersistence,
      };
    }
    return baseTrigger;
  }
  if (eventOption?.entityId) {
    if (triggerPersistence) {
      return {
        trigger: 'state',
        entity_id: eventOption.entityId,
        for: triggerPersistence,
      };
    }
    return { trigger: 'state', entity_id: eventOption.entityId };
  }
  return null;
}

export function toHaCondition(conditionOption, context = {}) {
  if (!conditionOption?.entityId) {
    return null;
  }
  const conditionPersistence = toHaDurationFromSeconds(context.persistenceSeconds ?? 0);
  const nextCondition = {
    condition: 'state',
    entity_id: conditionOption.entityId,
    state: conditionOption.expectedState ?? 'on',
  };
  if (conditionPersistence) {
    nextCondition.for = conditionPersistence;
  }
  return nextCondition;
}

export function toHaAction(actionOption) {
  if (!actionOption?.serviceDomain || !actionOption?.serviceName) {
    return null;
  }
  const rawData =
    actionOption.serviceData && typeof actionOption.serviceData === 'object'
      ? actionOption.serviceData
      : {};
  const { entity_id: entityId, ...restData } = rawData;
  const action = {
    action: `${actionOption.serviceDomain}.${actionOption.serviceName}`,
  };
  if (entityId) {
    action.target = { entity_id: entityId };
  }
  if (Object.keys(restData).length > 0) {
    action.data = restData;
  }
  return action;
}

export function autoLinkEntityIdByName(recordName, haAutomations) {
  if (!recordName || haAutomations.length === 0) {
    return null;
  }
  const target = normalizeName(recordName);
  const match = haAutomations.find((entry) => normalizeName(entry.name) === target);
  return match?.entityId ?? null;
}

export function applySearchStatusAndSort({
  records,
  query,
  statusFilter,
  sortBy,
  getSearchText,
  getIsActive,
  getRecentTs,
  getLastTriggerTs,
  getName,
}) {
  const normalizedQuery = normalizeName(query);

  const filtered = records.filter((record) => {
    if (statusFilter === 'active' && !getIsActive(record)) {
      return false;
    }
    if (statusFilter === 'inactive' && getIsActive(record)) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }
    const text = normalizeName(getSearchText(record));
    return text.includes(normalizedQuery);
  });

  filtered.sort((first, second) => {
    if (sortBy === 'name') {
      return getName(first).localeCompare(getName(second), 'it-IT');
    }
    if (sortBy === 'last_trigger') {
      return (getLastTriggerTs(second) ?? 0) - (getLastTriggerTs(first) ?? 0);
    }
    return (getRecentTs(second) ?? 0) - (getRecentTs(first) ?? 0);
  });

  return filtered;
}
