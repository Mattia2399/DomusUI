import type {
  CameraDeviceInfo,
  CameraHistoryEntry,
  CameraPtzDirection,
  CameraRelatedEntityCategory,
  CameraRelatedEntityInfo,
} from '../../settings/deviceContextTypes';
import type { HaDeviceRegistryEntry, HaEntityRegistryEntry } from '../../../services/haRegistryPresentation';
import type { MockEntityState, MockEntityStateMap } from '../../../types/ha';
import {
  isRecordObject,
  normalizeLookupToken,
  normalizeLower,
  resolveRelativeHaUrl,
  toBoolean,
  toFiniteNumber,
  toHistoryTimestampMs,
  toTimestampMs,
  toTrimmedString,
} from './mainBoardValueUtils';

const CAMERA_OFFLINE_STATES = new Set([
  'off',
  'offline',
  'idle',
  'unavailable',
  'unknown',
  'error',
  'problem',
  'disconnected',
]);
export const CAMERA_PTZ_SERVICE_CANDIDATES = [
  { domain: 'onvif', service: 'ptz' },
  { domain: 'camera', service: 'onvif_ptz' },
  { domain: 'camera', service: 'ptz' },
] as const;
export const CAMERA_PTZ_DIRECTION_VECTORS: Record<
  CameraPtzDirection,
  { pan: number; tilt: number; movement: string }
> = {
  up: { pan: 0, tilt: 1, movement: 'up' },
  down: { pan: 0, tilt: -1, movement: 'down' },
  left: { pan: -1, tilt: 0, movement: 'left' },
  right: { pan: 1, tilt: 0, movement: 'right' },
  up_left: { pan: -1, tilt: 1, movement: 'up_left' },
  up_right: { pan: 1, tilt: 1, movement: 'up_right' },
  down_left: { pan: -1, tilt: -1, movement: 'down_left' },
  down_right: { pan: 1, tilt: -1, movement: 'down_right' },
};
const CAMERA_MOTION_KEYWORDS = [
  'motion',
  'movimento',
  'pir',
  'person',
  'persona',
  'human',
  'vehicle',
  'auto',
  'car',
] as const;
const CAMERA_SOUND_KEYWORDS = ['sound', 'audio', 'suono', 'noise'] as const;
const CAMERA_IMAGE_KEYWORDS = [
  'image',
  'immagine',
  'snapshot',
  'thumbnail',
  'ultima immagine',
  'last image',
] as const;

export type HaServiceRegistry = Record<string, Record<string, Record<string, unknown>>>;

export type CameraPtzServiceTarget = {
  domain: string;
  service: string;
  fields: Set<string>;
};

export type CameraPtzButtonMap = Partial<Record<CameraPtzDirection, string>>;

type CameraDerivedActivity = {
  eventLog: Array<Record<string, unknown>>;
  motionDetected?: boolean;
  soundDetected?: boolean;
  lastMotionDetected?: string;
  lastSoundDetected?: string;
  lastImageUrl?: string;
};

export function normalizeCameraState(value: string | undefined) {
  const normalized = (value ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  return normalized || 'unknown';
}

export function isCameraOfflineState(value: string | undefined) {
  return CAMERA_OFFLINE_STATES.has(normalizeCameraState(value));
}

function findHaServiceEntry(
  serviceRegistry: HaServiceRegistry | null | undefined,
  domain: string,
  service: string,
) {
  if (!serviceRegistry || typeof serviceRegistry !== 'object') {
    return null;
  }
  const domainEntry =
    serviceRegistry[domain] ??
    Object.entries(serviceRegistry).find(([key]) => key.trim().toLowerCase() === domain)?.[1];
  if (!domainEntry || typeof domainEntry !== 'object') {
    return null;
  }
  const typedDomainEntry = domainEntry as Record<string, unknown>;
  const serviceEntry =
    typedDomainEntry[service] ??
    Object.entries(typedDomainEntry).find(([key]) => key.trim().toLowerCase() === service)?.[1];
  return serviceEntry && typeof serviceEntry === 'object' ? (serviceEntry as Record<string, unknown>) : null;
}

export function resolveCameraPtzServiceTarget(
  serviceRegistry: HaServiceRegistry | null | undefined,
): CameraPtzServiceTarget | null {
  for (const candidate of CAMERA_PTZ_SERVICE_CANDIDATES) {
    const serviceEntry = findHaServiceEntry(serviceRegistry, candidate.domain, candidate.service);
    if (!serviceEntry) {
      continue;
    }
    const rawFields = serviceEntry.fields;
    const fieldNames = rawFields && typeof rawFields === 'object' ? Object.keys(rawFields) : [];
    return {
      domain: candidate.domain,
      service: candidate.service,
      fields: new Set(fieldNames.map((field) => field.trim().toLowerCase())),
    };
  }
  return null;
}

function resolveCameraPtzHint(rawAttributes: Record<string, unknown> | undefined) {
  if (!rawAttributes) {
    return undefined;
  }
  const explicitKeys = [
    'supports_ptz',
    'ptz_supported',
    'ptz_support',
    'ptz_enabled',
    'can_pan_tilt',
    'can_pan_tilt_zoom',
  ];
  for (const key of explicitKeys) {
    const parsed = toBoolean(rawAttributes[key]);
    if (parsed !== undefined) {
      return parsed;
    }
  }
  const stringCandidates = [
    toTrimmedString(rawAttributes.supported_features),
    toTrimmedString(rawAttributes.capabilities),
    toTrimmedString(rawAttributes.features),
  ];
  if (stringCandidates.some((value) => (value ?? '').toLowerCase().includes('ptz'))) {
    return true;
  }
  for (const source of [
    rawAttributes.features,
    rawAttributes.capabilities,
    rawAttributes.supported_features_list,
    rawAttributes.supported_capabilities,
  ]) {
    if (Array.isArray(source) && source.some((entry) => (toTrimmedString(entry) ?? '').toLowerCase().includes('ptz'))) {
      return true;
    }
  }
  if (Array.isArray(rawAttributes.ptz_presets) && rawAttributes.ptz_presets.length > 0) {
    return true;
  }
  if (rawAttributes.ptz && typeof rawAttributes.ptz === 'object') {
    return true;
  }
  return Object.keys(rawAttributes).some((key) => key.trim().toLowerCase().includes('ptz')) || undefined;
}

export function resolveCameraSupportsPtz(
  entityId: string | undefined,
  rawAttributes: Record<string, unknown> | undefined,
  serviceRegistry: HaServiceRegistry | null | undefined,
) {
  const explicitHint = resolveCameraPtzHint(rawAttributes);
  if (explicitHint !== undefined) {
    return explicitHint;
  }
  const serviceTarget = resolveCameraPtzServiceTarget(serviceRegistry);
  if (!serviceTarget) {
    return false;
  }
  const normalizedEntityId = (entityId ?? '').trim().toLowerCase();
  if (!normalizedEntityId.startsWith('camera.')) {
    return false;
  }
  if (serviceTarget.domain === 'camera') {
    return true;
  }
  return [
    toTrimmedString(rawAttributes?.integration),
    toTrimmedString(rawAttributes?.platform),
    toTrimmedString(rawAttributes?.attribution),
    toTrimmedString(rawAttributes?.manufacturer),
    toTrimmedString(rawAttributes?.model),
    normalizedEntityId,
  ].some((value) => (value ?? '').toLowerCase().includes('onvif'));
}

function extractEntityObjectId(entityId: string | undefined) {
  const value = (entityId ?? '').trim().toLowerCase();
  const separator = value.indexOf('.');
  return separator <= 0 || separator >= value.length - 1 ? '' : value.slice(separator + 1);
}

function isEntityLikelyCameraRelated(
  candidateEntityId: string,
  cameraEntityId: string | undefined,
  cameraFriendlyName: string | undefined,
  candidateFriendlyName: string | undefined,
) {
  const candidateObjectId = extractEntityObjectId(candidateEntityId);
  const cameraObjectId = extractEntityObjectId(cameraEntityId);
  if (
    cameraObjectId &&
    candidateObjectId &&
    (candidateObjectId.startsWith(`${cameraObjectId}_`) ||
      candidateObjectId.includes(`_${cameraObjectId}_`) ||
      candidateObjectId === cameraObjectId)
  ) {
    return true;
  }
  const cameraNameToken = normalizeLookupToken(cameraFriendlyName);
  const candidateNameToken = normalizeLookupToken(candidateFriendlyName);
  return Boolean(cameraNameToken && candidateNameToken && candidateNameToken.includes(cameraNameToken));
}

function resolvePtzDirectionFromCandidateText(value: string) {
  const normalized = ` ${normalizeLookupToken(value)} `;
  const has = (token: string) => normalized.includes(` ${token} `);
  if ((has('ptz') && has('destra')) || has('right')) return 'right' as const;
  if ((has('ptz') && has('sinistra')) || has('left')) return 'left' as const;
  if ((has('ptz') && has('su')) || has('up') || has('alto')) return 'up' as const;
  if ((has('ptz') && has('giu')) || has('down') || has('basso')) return 'down' as const;
  return undefined;
}

export function resolveCameraPtzButtons(
  cameraEntityId: string | undefined,
  cameraFriendlyName: string | undefined,
  haStates: MockEntityStateMap,
) {
  const mapping: CameraPtzButtonMap = {};
  Object.entries(haStates).forEach(([entityId, entity]) => {
    if (!entityId.startsWith('button.')) {
      return;
    }
    const candidateFriendlyName = toTrimmedString(entity.rawAttributes?.friendly_name);
    if (!isEntityLikelyCameraRelated(entityId, cameraEntityId, cameraFriendlyName, candidateFriendlyName)) {
      return;
    }
    const direction =
      resolvePtzDirectionFromCandidateText(candidateFriendlyName ?? '') ??
      resolvePtzDirectionFromCandidateText(entityId);
    if (direction && !mapping[direction]) {
      mapping[direction] = entityId;
    }
  });
  return mapping;
}

export function hasAnyCameraPtzButton(mapping: CameraPtzButtonMap) {
  return Boolean(mapping.up || mapping.down || mapping.left || mapping.right);
}

export function resolveCameraPtzButtonPressSequence(
  direction: CameraPtzDirection,
  mapping: CameraPtzButtonMap,
) {
  if (direction === 'up') return mapping.up ? [mapping.up] : [];
  if (direction === 'down') return mapping.down ? [mapping.down] : [];
  if (direction === 'left') return mapping.left ? [mapping.left] : [];
  if (direction === 'right') return mapping.right ? [mapping.right] : [];
  if (direction === 'up_left') return [mapping.up, mapping.left].filter((entry): entry is string => Boolean(entry));
  if (direction === 'up_right') return [mapping.up, mapping.right].filter((entry): entry is string => Boolean(entry));
  if (direction === 'down_left') return [mapping.down, mapping.left].filter((entry): entry is string => Boolean(entry));
  return [mapping.down, mapping.right].filter((entry): entry is string => Boolean(entry));
}

function includesAnyKeyword(value: string, keywords: readonly string[]) {
  return keywords.some((keyword) => value.includes(normalizeLookupToken(keyword)));
}

function resolveSignalState(value: unknown) {
  const direct = toBoolean(value);
  if (direct !== undefined) {
    return direct;
  }
  const normalized = normalizeLookupToken(toTrimmedString(value));
  if (!normalized) {
    return undefined;
  }
  if (
    normalized.includes('detected') ||
    normalized.includes('rilevato') ||
    normalized.includes('triggered') ||
    normalized.includes('active')
  ) {
    return true;
  }
  if (
    normalized.includes('not detected') ||
    normalized.includes('no motion') ||
    normalized.includes('nessun movimento') ||
    normalized.includes('idle')
  ) {
    return false;
  }
  return undefined;
}

function parseItalianDateTime(value: string) {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  const months: Record<string, number> = {
    gennaio: 0,
    febbraio: 1,
    marzo: 2,
    aprile: 3,
    maggio: 4,
    giugno: 5,
    luglio: 6,
    agosto: 7,
    settembre: 8,
    ottobre: 9,
    novembre: 10,
    dicembre: 11,
  };
  const match = normalized.match(
    /(\d{1,2})\s+([a-z]+)\s+(\d{4})(?:\s+alle?\s+ore)?\s+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?/i,
  );
  if (!match) {
    return undefined;
  }
  const day = Number.parseInt(match[1], 10);
  const month = months[match[2]];
  const year = Number.parseInt(match[3], 10);
  const hour = Number.parseInt(match[4], 10);
  const minute = Number.parseInt(match[5], 10);
  const second = match[6] ? Number.parseInt(match[6], 10) : 0;
  if (
    !Number.isFinite(day) ||
    month === undefined ||
    !Number.isFinite(year) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second)
  ) {
    return undefined;
  }
  const timestamp = new Date(year, month, day, hour, minute, second, 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function resolveFlexibleTimestamp(value: unknown) {
  const direct = toTimestampMs(value);
  return direct !== undefined ? direct : typeof value === 'string' ? parseItalianDateTime(value) : undefined;
}

function resolveEntityEventTimestamp(entity: MockEntityState) {
  const rawAttributes = entity.rawAttributes;
  for (const candidate of [
    rawAttributes?.last_triggered,
    rawAttributes?.last_motion,
    rawAttributes?.last_motion_detected,
    rawAttributes?.last_sound,
    rawAttributes?.last_sound_detected,
    rawAttributes?.event_time,
    rawAttributes?.timestamp,
    rawAttributes?.time,
    rawAttributes?.datetime,
    rawAttributes?.__last_changed,
    rawAttributes?.last_changed,
    rawAttributes?.__last_updated,
    rawAttributes?.last_updated,
    entity.state,
  ]) {
    const parsed = resolveFlexibleTimestamp(candidate);
    if (parsed !== undefined) {
      return parsed;
    }
  }
  return undefined;
}

export function resolveCameraDerivedActivity(
  cameraEntityId: string | undefined,
  cameraFriendlyName: string | undefined,
  haStates: MockEntityStateMap,
  haUrl: string,
  relatedEntityIds?: Set<string>,
) {
  const eventLog: Array<{ timestampMs: number; event: Record<string, unknown> }> = [];
  let motionDetected: boolean | undefined;
  let soundDetected: boolean | undefined;
  let lastMotionDetected: number | undefined;
  let lastSoundDetected: number | undefined;
  let lastImageUrl: string | undefined;
  let lastImageTimestamp = -1;

  Object.entries(haStates).forEach(([entityId, entity]) => {
    const belongsToRegisteredDevice =
      relatedEntityIds && relatedEntityIds.size > 0
        ? relatedEntityIds.has(entityId.toLowerCase())
        : isEntityLikelyCameraRelated(
            entityId,
            cameraEntityId,
            cameraFriendlyName,
            toTrimmedString(entity.rawAttributes?.friendly_name),
          );
    if (!belongsToRegisteredDevice) {
      return;
    }
    const domain = entityId.split('.')[0];
    const normalizedKey = normalizeLookupToken(
      `${entityId} ${toTrimmedString(entity.rawAttributes?.friendly_name) ?? ''}`,
    );
    const isMotion = includesAnyKeyword(normalizedKey, CAMERA_MOTION_KEYWORDS);
    const isSound = includesAnyKeyword(normalizedKey, CAMERA_SOUND_KEYWORDS);
    const isImage = domain === 'image' || includesAnyKeyword(normalizedKey, CAMERA_IMAGE_KEYWORDS);
    if (!isMotion && !isSound && !isImage) {
      return;
    }

    const friendlyName = toTrimmedString(entity.rawAttributes?.friendly_name) ?? entityId;
    const stateLabel = toTrimmedString(entity.stateLabel) ?? toTrimmedString(entity.state);
    const timestampMs = resolveEntityEventTimestamp(entity) ?? Date.now();
    const imageCandidate =
      toTrimmedString(entity.imageUrl) ?? toTrimmedString(entity.rawAttributes?.entity_picture);
    const imageUrl = resolveRelativeHaUrl(imageCandidate, haUrl);

    if (isMotion) {
      const signalState = resolveSignalState(entity.state) ?? resolveSignalState(stateLabel);
      if (signalState !== undefined) motionDetected = signalState;
      if (signalState === true || domain === 'event') {
        lastMotionDetected = Math.max(lastMotionDetected ?? 0, timestampMs);
        eventLog.push({
          timestampMs,
          event: {
            title: friendlyName,
            type: 'motion',
            timestamp: timestampMs,
            time: timestampMs,
            event: stateLabel ?? 'Motion update',
            thumbnail_url: imageUrl,
          },
        });
      }
    }
    if (isSound) {
      const signalState = resolveSignalState(entity.state) ?? resolveSignalState(stateLabel);
      if (signalState !== undefined) soundDetected = signalState;
      if (signalState === true || domain === 'event') {
        lastSoundDetected = Math.max(lastSoundDetected ?? 0, timestampMs);
        eventLog.push({
          timestampMs,
          event: {
            title: friendlyName,
            type: 'sound',
            timestamp: timestampMs,
            time: timestampMs,
            event: stateLabel ?? 'Sound update',
            thumbnail_url: imageUrl,
          },
        });
      }
    }
    if (isImage && imageUrl) {
      if (timestampMs >= lastImageTimestamp) {
        lastImageTimestamp = timestampMs;
        lastImageUrl = imageUrl;
      }
      eventLog.push({
        timestampMs,
        event: {
          title: friendlyName,
          type: 'motion',
          timestamp: timestampMs,
          time: timestampMs,
          event: stateLabel ?? 'Snapshot',
          thumbnail_url: imageUrl,
          image_url: imageUrl,
          snapshot_url: imageUrl,
        },
      });
    }
  });

  const deduped = eventLog
    .sort((left, right) => right.timestampMs - left.timestampMs)
    .filter((entry, index, source) => {
      const signature = JSON.stringify(entry.event);
      return source.findIndex((candidate) => JSON.stringify(candidate.event) === signature) === index;
    })
    .slice(0, 12)
    .map((entry) => entry.event);

  return {
    eventLog: deduped,
    motionDetected,
    soundDetected,
    lastMotionDetected: lastMotionDetected !== undefined ? new Date(lastMotionDetected).toISOString() : undefined,
    lastSoundDetected: lastSoundDetected !== undefined ? new Date(lastSoundDetected).toISOString() : undefined,
    lastImageUrl,
  } satisfies CameraDerivedActivity;
}

export function resolveCameraPreviewUrls(
  entity: MockEntityState | undefined,
  fallbackEntityId: string | undefined,
  haUrl: string,
) {
  const rawAttributes = entity?.rawAttributes;
  const cameraEntityId =
    toTrimmedString(rawAttributes?.camera_entity_id) ??
    toTrimmedString(rawAttributes?.entity_id) ??
    toTrimmedString(fallbackEntityId);
  const snapshotCandidate =
    toTrimmedString(entity?.imageUrl) ??
    toTrimmedString(rawAttributes?.entity_picture) ??
    toTrimmedString(rawAttributes?.camera_url) ??
    toTrimmedString(rawAttributes?.cameraUrl);
  return {
    cameraEntityId,
    streamUrl: cameraEntityId ? `/api/camera_proxy_stream/${encodeURIComponent(cameraEntityId)}` : undefined,
    snapshotUrl: resolveRelativeHaUrl(snapshotCandidate, haUrl),
  };
}

export function extractCameraHistoryEntries(payload: unknown, entityIds: string[]): CameraHistoryEntry[] {
  const normalizedIds = entityIds.map((entityId) => entityId.trim()).filter(Boolean);
  const entries: CameraHistoryEntry[] = [];
  const collect = (entityId: string, candidate: unknown) => {
    if (!Array.isArray(candidate)) return;
    candidate.forEach((rawEntry) => {
      if (!isRecordObject(rawEntry)) return;
      const stateValue = rawEntry.s ?? rawEntry.state;
      const state = typeof stateValue === 'string' ? stateValue : String(stateValue ?? '');
      const timestampMs = toHistoryTimestampMs(
        rawEntry.lu ??
          rawEntry.last_updated ??
          rawEntry.last_updated_ts ??
          rawEntry.lc ??
          rawEntry.last_changed ??
          rawEntry.last_changed_ts,
      );
      if (!state || timestampMs === undefined) return;
      const rawAttributes = rawEntry.a ?? rawEntry.attributes;
      entries.push({
        entityId,
        state,
        timestampMs,
        attributes: isRecordObject(rawAttributes) ? rawAttributes : undefined,
      });
    });
  };
  if (isRecordObject(payload)) {
    normalizedIds.forEach((entityId) => collect(entityId, payload[entityId]));
  } else if (Array.isArray(payload)) {
    if (payload.every((candidate) => Array.isArray(candidate))) {
      payload.forEach((candidate, index) => {
        const firstEntry = Array.isArray(candidate) && isRecordObject(candidate[0]) ? candidate[0] : undefined;
        const payloadEntityId = typeof firstEntry?.entity_id === 'string' ? firstEntry.entity_id : undefined;
        const entityId = payloadEntityId ?? normalizedIds[index];
        if (entityId) collect(entityId, candidate);
      });
    } else if (normalizedIds.length === 1) {
      collect(normalizedIds[0], Array.isArray(payload[0]) ? payload[0] : payload);
    } else {
      normalizedIds.forEach((entityId) => {
        collect(
          entityId,
          payload.filter((entry) => isRecordObject(entry) && entry.entity_id === entityId),
        );
      });
    }
  }
  const seen = new Set<string>();
  return entries
    .sort((left, right) => right.timestampMs - left.timestampMs)
    .filter((entry) => {
      const signature = `${entry.entityId}|${entry.state}|${entry.timestampMs}`;
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });
}

function resolveEntityFriendlyLabel(
  entityId: string,
  entity: MockEntityState | undefined,
  registryEntry?: HaEntityRegistryEntry,
) {
  return (
    registryEntry?.name ??
    registryEntry?.originalName ??
    toTrimmedString(entity?.rawAttributes?.friendly_name) ??
    entityId
  );
}

function classifyCameraRelatedEntity(
  entityId: string,
  entity: MockEntityState | undefined,
  registryEntry?: HaEntityRegistryEntry,
): CameraRelatedEntityCategory {
  const domain = entityId.split('.')[0] ?? '';
  const deviceClass = normalizeLower(toTrimmedString(entity?.rawAttributes?.device_class));
  const haystack = normalizeLookupToken(
    `${entityId} ${registryEntry?.name ?? ''} ${registryEntry?.originalName ?? ''} ${
      toTrimmedString(entity?.rawAttributes?.friendly_name) ?? ''
    } ${deviceClass}`,
  );
  if (
    (domain === 'event' || domain === 'binary_sensor') &&
    (domain === 'event' ||
      includesAnyKeyword(haystack, CAMERA_MOTION_KEYWORDS) ||
      includesAnyKeyword(haystack, CAMERA_SOUND_KEYWORDS) ||
      haystack.includes('person') ||
      haystack.includes('vehicle') ||
      haystack.includes('doorbell') ||
      haystack.includes('visitor'))
  ) {
    return 'detection';
  }
  if (
    domain === 'sensor' &&
    (deviceClass === 'battery' ||
      deviceClass === 'signal_strength' ||
      haystack.includes('battery') ||
      haystack.includes('batteria') ||
      haystack.includes('wifi') ||
      haystack.includes('signal') ||
      haystack.includes('storage') ||
      haystack.includes('sd') ||
      haystack.includes('firmware') ||
      haystack.includes('last seen') ||
      haystack.includes('uptime'))
  ) {
    return 'diagnostic';
  }
  if (
    domain === 'switch' ||
    domain === 'select' ||
    domain === 'number' ||
    domain === 'input_boolean' ||
    domain === 'input_select' ||
    domain === 'input_number' ||
    domain === 'fan'
  ) {
    return 'control';
  }
  if (domain === 'button' || domain === 'siren' || domain === 'light') return 'action';
  if (domain === 'image' || domain === 'camera') return 'media';
  return 'other';
}

function parseCameraRelatedEntityOptions(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const options = value
    .map((entry) => toTrimmedString(entry))
    .filter((entry): entry is string => Boolean(entry));
  return options.length > 0 ? options : undefined;
}

export function buildCameraDeviceContext({
  cameraEntityId,
  haStates,
  entityRegistry,
  deviceRegistry,
}: {
  cameraEntityId: string | undefined;
  haStates: MockEntityStateMap;
  entityRegistry: HaEntityRegistryEntry[];
  deviceRegistry: HaDeviceRegistryEntry[];
}): { deviceInfo?: CameraDeviceInfo; relatedEntities: CameraRelatedEntityInfo[] } {
  const normalizedCameraEntityId = (cameraEntityId ?? '').trim();
  if (!normalizedCameraEntityId) {
    return { relatedEntities: [] };
  }
  const registryByEntityId = new Map(entityRegistry.map((entry) => [entry.entityId, entry]));
  const cameraRegistryEntry =
    registryByEntityId.get(normalizedCameraEntityId) ??
    registryByEntityId.get(normalizedCameraEntityId.toLowerCase());
  const buildRelatedEntity = (
    entityId: string,
    registryEntry?: HaEntityRegistryEntry,
  ): CameraRelatedEntityInfo => {
    const entity = haStates[entityId] ?? haStates[entityId.toLowerCase()];
    const rawAttributes = entity?.rawAttributes;
    return {
      entityId,
      name: resolveEntityFriendlyLabel(entityId, entity, registryEntry),
      domain: entityId.split('.')[0] ?? '',
      category: classifyCameraRelatedEntity(entityId, entity, registryEntry),
      state: toTrimmedString(entity?.state),
      stateLabel: toTrimmedString(entity?.stateLabel) ?? toTrimmedString(entity?.state),
      unit: entity?.unit,
      deviceClass: toTrimmedString(rawAttributes?.device_class),
      icon: toTrimmedString(rawAttributes?.icon),
      options: parseCameraRelatedEntityOptions(rawAttributes?.options),
      min: toFiniteNumber(rawAttributes?.min),
      max: toFiniteNumber(rawAttributes?.max),
      step: toFiniteNumber(rawAttributes?.step),
      numericValue:
        toFiniteNumber(entity?.numericValue) ??
        toFiniteNumber(entity?.currentValue) ??
        toFiniteNumber(entity?.state),
    };
  };
  const sortRelatedEntities = (entities: CameraRelatedEntityInfo[]) => {
    const rank: Record<CameraRelatedEntityCategory, number> = {
      detection: 0,
      diagnostic: 1,
      control: 2,
      action: 3,
      media: 4,
      other: 5,
    };
    return entities.sort(
      (left, right) => rank[left.category] - rank[right.category] || left.name.localeCompare(right.name, 'it-IT'),
    );
  };
  const deviceId = cameraRegistryEntry?.deviceId;
  if (!deviceId) {
    const cameraEntity =
      haStates[normalizedCameraEntityId] ?? haStates[normalizedCameraEntityId.toLowerCase()];
    const rawAttributes = cameraEntity?.rawAttributes;
    const relatedIds = Array.isArray(rawAttributes?.demo_related_entities)
      ? rawAttributes.demo_related_entities
          .map((entry) => toTrimmedString(entry))
          .filter((entry): entry is string => Boolean(entry && haStates[entry]))
      : [];
    const rawDeviceInfo = isRecordObject(rawAttributes?.demo_device_info)
      ? rawAttributes.demo_device_info
      : undefined;
    const deviceInfo: CameraDeviceInfo | undefined = rawDeviceInfo
      ? {
          id: toTrimmedString(rawDeviceInfo.id),
          name: toTrimmedString(rawDeviceInfo.name),
          manufacturer: toTrimmedString(rawDeviceInfo.manufacturer),
          model: toTrimmedString(rawDeviceInfo.model),
          swVersion: toTrimmedString(rawDeviceInfo.swVersion),
          hwVersion: toTrimmedString(rawDeviceInfo.hwVersion),
          areaId: toTrimmedString(rawDeviceInfo.areaId),
          configurationUrl: toTrimmedString(rawDeviceInfo.configurationUrl),
        }
      : undefined;
    return {
      deviceInfo,
      relatedEntities: sortRelatedEntities(relatedIds.map((entityId) => buildRelatedEntity(entityId))),
    };
  }
  const deviceEntry = deviceRegistry.find((entry) => entry.id === deviceId);
  const deviceInfo: CameraDeviceInfo = {
    id: deviceId,
    name: deviceEntry?.nameByUser ?? deviceEntry?.name,
    manufacturer: deviceEntry?.manufacturer,
    model: deviceEntry?.model,
    swVersion: deviceEntry?.swVersion,
    hwVersion: deviceEntry?.hwVersion,
    areaId: deviceEntry?.areaId ?? cameraRegistryEntry?.areaId,
    configurationUrl: deviceEntry?.configurationUrl,
  };
  const relatedEntities = entityRegistry
    .filter((entry) => entry.deviceId === deviceId && entry.entityId !== normalizedCameraEntityId)
    .filter((entry) => !entry.disabledBy && !entry.hiddenBy)
    .map((entry) => buildRelatedEntity(entry.entityId, entry));
  return { deviceInfo, relatedEntities: sortRelatedEntities(relatedEntities) };
}
