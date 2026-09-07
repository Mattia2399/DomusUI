import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BellRing,
  CarFront,
  ChevronRight,
  Expand,
  Eye,
  Loader2,
  MousePointerClick,
  Pause,
  PersonStanding,
  Play,
  Power,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  Webcam,
} from 'lucide-react';
import CameraPtzJoystick, { type CameraPtzDirection } from '../camera/CameraPtzJoystick';
import CameraViewer from '../camera/CameraViewer';
import GlassDropdown, { type GlassDropdownOption } from '../ui/GlassDropdown';
import GlassLoader from '../ui/GlassLoader';
import GlassToggle from '../ui/GlassToggle';
import GlassSlider from '../ui/GlassSlider';
import { CONTEXT_PANEL_LAYOUT } from './layoutClasses';
import { ContextPanelHeader } from './ContextPanelHeader';
import { ContextSecondaryPage } from './ContextSecondaryPage';
import { useI18n } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n/translations';

export type CameraRelatedEntityCategory =
  | 'detection'
  | 'diagnostic'
  | 'control'
  | 'action'
  | 'media'
  | 'other';

export type CameraRelatedEntityInfo = {
  entityId: string;
  name: string;
  domain: string;
  category: CameraRelatedEntityCategory;
  state?: string;
  stateLabel?: string;
  unit?: string;
  deviceClass?: string;
  icon?: string;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  numericValue?: number;
};

export type CameraDeviceInfo = {
  id?: string;
  name?: string;
  manufacturer?: string;
  model?: string;
  swVersion?: string;
  hwVersion?: string;
  areaId?: string;
  configurationUrl?: string;
};

export type CameraRelatedEntityActionRequest = {
  entity: CameraRelatedEntityInfo;
  action: 'toggle' | 'press' | 'select' | 'set_value';
  value?: string | number | boolean;
};

export type CameraHistoryEntry = {
  entityId: string;
  state: string;
  timestampMs: number;
  attributes?: Record<string, unknown>;
};

export type CameraHistoryStatus = 'idle' | 'loading' | 'available' | 'empty' | 'error' | 'offline';

export type { CameraPtzDirection } from '../camera/CameraPtzJoystick';

interface CameraControlsProps {
  name: string;
  status?: string;
  entityId?: string;
  streamUrl?: string;
  snapshotUrl?: string;
  isOffline?: boolean;
  rawAttributes?: Record<string, unknown>;
  supportsPtz?: boolean;
  deviceInfo?: CameraDeviceInfo;
  relatedEntities?: CameraRelatedEntityInfo[];
  historyEntries?: CameraHistoryEntry[];
  historyStatus?: CameraHistoryStatus;
  historyError?: string;
  onRefreshHistory?: () => void;
  onPtzMove?: (direction: CameraPtzDirection) => void;
  onPtzStop?: () => void;
  onRelatedEntityAction?: (
    request: CameraRelatedEntityActionRequest,
  ) => boolean | void | Promise<boolean | void>;
  onSecondaryPageChange?: (open: boolean) => void;
  commandsEnabled?: boolean;
}

type CameraEventType = 'sound' | 'motion' | 'person' | 'vehicle' | 'doorbell';

export interface CameraEvent {
  id: string;
  type: CameraEventType;
  title: string;
  time: string;
  timestampMs?: number;
  clipUrl?: string;
  thumbnailUrl?: string;
  entityId?: string;
  source?: 'history' | 'attribute' | 'live';
}

interface TimelineItem {
  id: string;
  label: string;
  hasClip: boolean;
  hasSnapshot: boolean;
  timestampMs?: number;
}

type CameraEventDay = {
  key: string;
  label: string;
};

function formatEventDayKey(timestampMs: number | undefined) {
  if (!timestampMs) return 'unknown';
  const date = new Date(timestampMs);
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
}

function formatEventDayLabel(timestampMs: number | undefined) {
  if (!timestampMs) return 'Data sconosciuta';
  const date = new Date(timestampMs);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const key = formatEventDayKey(timestampMs);
  if (key === formatEventDayKey(today.getTime())) return 'Oggi';
  if (key === formatEventDayKey(yesterday.getTime())) return 'Ieri';
  return new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }).format(date);
}

function toTrimmedString(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toTimestampMs(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value > 1e12 ? value : value * 1000);
  }
  if (typeof value === 'string') {
    const parsedDate = Date.parse(value);
    if (Number.isFinite(parsedDate)) {
      return parsedDate;
    }
    const parsedNumeric = Number.parseFloat(value);
    if (Number.isFinite(parsedNumeric)) {
      return Math.round(parsedNumeric > 1e12 ? parsedNumeric : parsedNumeric * 1000);
    }
  }
  return undefined;
}

function formatClockFromTimestamp(timestampMs: number | undefined) {
  if (!timestampMs || Number.isNaN(timestampMs)) {
    return undefined;
  }
  return new Intl.DateTimeFormat('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestampMs));
}

function inferEventType(value: unknown): CameraEventType {
  const normalized = toTrimmedString(value)?.toLowerCase() ?? '';
  if (normalized.includes('sound') || normalized.includes('audio') || normalized.includes('noise')) {
    return 'sound';
  }
  if (normalized.includes('person') || normalized.includes('persona') || normalized.includes('human')) {
    return 'person';
  }
  if (normalized.includes('vehicle') || normalized.includes('veicolo') || normalized.includes('car')) {
    return 'vehicle';
  }
  if (normalized.includes('doorbell') || normalized.includes('campanello') || normalized.includes('visitor')) {
    return 'doorbell';
  }
  return 'motion';
}

function firstStringValue(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const candidate = toTrimmedString(source[key]);
    if (candidate) {
      return candidate;
    }
  }
  return undefined;
}

export function buildLiveEventLogs(rawAttributes: Record<string, unknown> | undefined) {
  const events: CameraEvent[] = [];
  const pushEvent = (event: CameraEvent) => {
    events.push(event);
  };

  const liveEventSources = [rawAttributes?.event_log, rawAttributes?.events, rawAttributes?.history];
  const liveEventArray = liveEventSources.find((value) => Array.isArray(value) && value.length > 0);

  if (Array.isArray(liveEventArray)) {
    liveEventArray.slice(0, 12).forEach((entry, index) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const source = entry as Record<string, unknown>;
      const timestampMs = toTimestampMs(
        source.time ?? source.timestamp ?? source.when ?? source.created_at ?? source.datetime,
      );
      const title =
        firstStringValue(source, ['title', 'name', 'event', 'type']) ??
        'Detection';
      const type = inferEventType(source.type ?? source.event ?? title);
      const clipUrl = firstStringValue(source, [
        'clip_url',
        'video_url',
        'recording_url',
        'playback_url',
        'media_url',
        'clip',
      ]);
      const thumbnailUrl = firstStringValue(source, [
        'thumbnail_url',
        'thumbnail',
        'snapshot_url',
        'snapshot',
        'image_url',
        'image',
        'preview_url',
        'preview',
      ]);
      pushEvent({
        id: `history-${index}-${title}`.replace(/\s+/g, '-').toLowerCase(),
        type,
        title,
        timestampMs,
        time: formatClockFromTimestamp(timestampMs) ?? '--:--:--',
        clipUrl,
        thumbnailUrl,
        source: 'attribute',
      });
    });
  }

  const lastMotionTimestamp = toTimestampMs(
    rawAttributes?.last_motion_detected ?? rawAttributes?.last_motion ?? rawAttributes?.last_tripped,
  );
  if (lastMotionTimestamp) {
    pushEvent({
      id: `last-motion-${lastMotionTimestamp}`,
      type: 'motion',
      title: 'Last Motion',
      timestampMs: lastMotionTimestamp,
      time: formatClockFromTimestamp(lastMotionTimestamp) ?? '--:--:--',
      source: 'attribute',
    });
  }
  const lastSoundTimestamp = toTimestampMs(
    rawAttributes?.last_sound_detected ?? rawAttributes?.last_sound ?? rawAttributes?.last_audio,
  );
  if (lastSoundTimestamp) {
    pushEvent({
      id: `last-sound-${lastSoundTimestamp}`,
      type: 'sound',
      title: 'Last Sound',
      timestampMs: lastSoundTimestamp,
      time: formatClockFromTimestamp(lastSoundTimestamp) ?? '--:--:--',
      source: 'attribute',
    });
  }

  const deduped = events.filter((event, index, list) => {
    const firstIndex = list.findIndex(
      (entry) =>
        entry.type === event.type &&
        entry.title === event.title &&
        entry.time === event.time &&
        entry.clipUrl === event.clipUrl &&
        entry.thumbnailUrl === event.thumbnailUrl,
    );
    return firstIndex === index;
  });

  return deduped
    .sort((left, right) => (right.timestampMs ?? 0) - (left.timestampMs ?? 0))
    .slice(0, 10);
}

function isActiveCameraHistoryState(value: string) {
  const normalized = value.trim().toLowerCase();
  return ['on', 'open', 'detected', 'active', 'triggered', 'pressed', 'ringing', 'motion'].includes(normalized);
}

export function buildHistoryEventLogs(
  historyEntries: CameraHistoryEntry[],
  relatedEntities: CameraRelatedEntityInfo[],
) {
  const metadataById = new Map(relatedEntities.map((entity) => [entity.entityId.toLowerCase(), entity]));
  return historyEntries
    .map((entry): CameraEvent | null => {
      const metadata = metadataById.get(entry.entityId.toLowerCase());
      const domain = metadata?.domain ?? entry.entityId.split('.')[0] ?? '';
      const isImage = domain === 'image';
      const isEventEntity = domain === 'event';
      if (!isImage && !isEventEntity && !isActiveCameraHistoryState(entry.state)) {
        return null;
      }
      const descriptor = `${metadata?.name ?? ''} ${metadata?.deviceClass ?? ''} ${entry.entityId}`;
      const type = inferEventType(descriptor);
      const attributes = entry.attributes ?? {};
      const explicitClipUrl = firstStringValue(attributes, [
        'clip_url',
        'video_url',
        'recording_url',
        'playback_url',
        'media_url',
      ]);
      const genericUrl = firstStringValue(attributes, ['url']);
      const clipUrl = explicitClipUrl ?? (genericUrl && isLikelyVideoUrl(genericUrl) ? genericUrl : undefined);
      const thumbnailUrl = firstStringValue(attributes, [
        'thumbnail_url',
        'snapshot_url',
        'image_url',
        'entity_picture',
      ]);
      return {
        id: `history-${entry.entityId}-${entry.timestampMs}`,
        type,
        title: metadata?.name ?? (type === 'sound' ? 'Suono rilevato' : 'Movimento rilevato'),
        timestampMs: entry.timestampMs,
        time: formatClockFromTimestamp(entry.timestampMs) ?? '--:--:--',
        clipUrl,
        thumbnailUrl,
        entityId: entry.entityId,
        source: 'history',
      };
    })
    .filter((event): event is CameraEvent => event !== null);
}

export function mergeCameraEvents(...collections: CameraEvent[][]) {
  const events = collections.flat().sort((left, right) => (right.timestampMs ?? 0) - (left.timestampMs ?? 0));
  const seen = new Set<string>();
  return events.filter((event) => {
    const timestampBucket = Math.round((event.timestampMs ?? 0) / 1000);
    const signature = `${event.entityId ?? ''}|${event.type}|${timestampBucket}|${event.clipUrl ?? ''}|${event.thumbnailUrl ?? ''}`;
    if (seen.has(signature)) {
      return false;
    }
    seen.add(signature);
    return true;
  }).slice(0, 80);
}

function appendCacheBuster(url: string, nonce: number) {
  if (!url || nonce <= 0 || url.startsWith('data:')) {
    return url;
  }
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}_ts=${nonce}`;
}

function sanitizeFileSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function formatSnapshotTimestamp(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  const seconds = `${date.getSeconds()}`.padStart(2, '0');
  return `${year}${month}${day}-${hour}${minutes}${seconds}`;
}

function isLikelyVideoUrl(url: string | undefined) {
  if (!url) {
    return false;
  }
  return /\.(mp4|webm|ogg|m3u8)(?:$|[?#])/i.test(url);
}

function formatRelatedEntityValue(entity: CameraRelatedEntityInfo) {
  const rawValue = entity.stateLabel ?? entity.state;
  if (!rawValue) return 'ND';
  const normalized = rawValue.trim().toLowerCase();
  const translated =
    normalized === 'on'
      ? 'Attivo'
      : normalized === 'off'
        ? 'Spento'
        : normalized === 'unavailable'
          ? 'Non disponibile'
          : normalized === 'unknown'
            ? 'ND'
            : rawValue;
  return entity.unit && translated !== 'ND' ? `${translated} ${entity.unit}` : translated;
}

function normalizeEntityState(value: string | undefined) {
  return (value ?? '').trim().toLowerCase();
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRelatedEntityUnavailable(entity: CameraRelatedEntityInfo) {
  const normalized = normalizeEntityState(entity.state ?? entity.stateLabel);
  return normalized === 'unavailable' || normalized === 'unknown';
}

function isRelatedEntityActive(entity: CameraRelatedEntityInfo) {
  const normalized = normalizeEntityState(entity.state);
  return ['on', 'open', 'opening', 'playing', 'recording', 'detected', 'active', 'home'].includes(normalized);
}

function isCameraToggleEntity(entity: CameraRelatedEntityInfo) {
  return ['switch', 'input_boolean', 'light', 'fan', 'siren'].includes(entity.domain);
}

function isCameraButtonEntity(entity: CameraRelatedEntityInfo) {
  return entity.domain === 'button' || entity.domain === 'input_button';
}

function isCameraSelectEntity(entity: CameraRelatedEntityInfo) {
  return (entity.domain === 'select' || entity.domain === 'input_select') && Array.isArray(entity.options) && entity.options.length > 0;
}

function isCameraNumberEntity(entity: CameraRelatedEntityInfo) {
  return entity.domain === 'number' || entity.domain === 'input_number';
}

function formatCameraActionLabel(entity: CameraRelatedEntityInfo, t: (key: TranslationKey) => string) {
  if (isCameraButtonEntity(entity)) {
    return t('camera.action.run');
  }
  if (!isCameraToggleEntity(entity)) {
    return t('camera.action.manage');
  }
  const active = isRelatedEntityActive(entity);
  if (entity.domain === 'siren') {
    return active ? t('camera.action.sirenOff') : t('camera.action.sirenOn');
  }
  return active ? t('camera.action.disable') : t('camera.action.enable');
}

function formatEntityKind(entity: CameraRelatedEntityInfo, t: (key: TranslationKey) => string) {
  const deviceClass = entity.deviceClass?.replaceAll('_', ' ').trim();
  if (deviceClass) {
    return deviceClass.charAt(0).toUpperCase() + deviceClass.slice(1);
  }
  const labels: Record<string, string> = {
    binary_sensor: t('camera.entity.sensor'), sensor: t('camera.entity.information'),
    switch: t('camera.entity.switch'), input_boolean: t('camera.entity.switch'), light: t('camera.entity.light'),
    fan: t('camera.entity.fan'), siren: t('camera.entity.siren'), button: t('camera.entity.action'),
    input_button: t('camera.entity.action'), select: t('camera.entity.choice'), input_select: t('camera.entity.choice'),
    number: t('camera.entity.adjustment'), input_number: t('camera.entity.adjustment'),
  };
  return labels[entity.domain] ?? t('camera.entity.related');
}

function CameraAppleSwitch({
  checked,
  disabled,
  busy,
  label,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  busy: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <GlassToggle
      checked={checked}
      label={label}
      disabled={disabled}
      busy={busy}
      onChange={() => onChange()}
      size="compact"
      tone="accent"
    />
  );
}

function RelatedEntityGrid({
  title,
  entities,
  kind,
}: {
  title: string;
  entities: CameraRelatedEntityInfo[];
  kind: 'detection' | 'diagnostic';
}) {
  const { t } = useI18n();
  if (entities.length === 0) {
    return null;
  }
  const SectionIcon = kind === 'detection' ? Eye : Activity;

  return (
    <section className="mb-1">
      <div className="mb-2.5 flex items-end justify-between gap-3 px-1">
        <div>
          <p className="text-[13px] font-semibold text-[color:var(--ui-text-primary)]">{title}</p>
          <p className="mt-0.5 text-[10px] font-medium text-[color:var(--ui-text-secondary)]">
            {kind === 'detection' ? t('camera.section.detectedEvents') : t('camera.section.health')}
          </p>
        </div>
        <span className="text-[10px] font-semibold tabular-nums text-[color:var(--ui-text-secondary)]">{entities.length}</span>
      </div>
      <div className="space-y-2">
        {entities.slice(0, 8).map((entity) => {
          const active = isRelatedEntityActive(entity);
          const unavailable = isRelatedEntityUnavailable(entity);
          return (
            <div
              key={entity.entityId}
              className={`flex min-w-0 items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all duration-200 ${
                active
                  ? 'bg-[color:rgb(var(--ui-accent-rgb)/0.14)] shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]'
                  : 'bg-[color:var(--ui-fill-tertiary)] hover:bg-[color:var(--ui-fill-secondary)]'
              }`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${
                  active
                    ? 'border-[color:rgb(var(--ui-accent-rgb)/0.38)] bg-[color:rgb(var(--ui-accent-rgb)/0.16)] text-[color:rgb(var(--ui-accent-rgb)/0.95)]'
                    : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]'
                }`}
              >
                <SectionIcon size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-[color:var(--ui-text-primary)]">{entity.name}</span>
                <span className="mt-0.5 block truncate text-[10px] text-[color:var(--ui-text-secondary)]">{formatEntityKind(entity, t)}</span>
              </span>
              <span className={`max-w-[38%] truncate text-right text-[11px] font-semibold ${unavailable ? 'text-[color:var(--ui-text-secondary)]' : active ? 'text-[color:rgb(var(--ui-accent-rgb)/0.95)]' : 'text-[color:var(--ui-text-primary)]'}`}>
                {formatRelatedEntityValue(entity)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CameraNumberEntityControl({
  entity,
  busy,
  disabled,
  onAction,
}: {
  entity: CameraRelatedEntityInfo;
  busy: boolean;
  disabled: boolean;
  onAction: (request: CameraRelatedEntityActionRequest) => void;
}) {
  const initialValue = isFiniteNumber(entity.numericValue)
    ? entity.numericValue
    : Number.isFinite(Number.parseFloat(entity.state ?? ''))
      ? Number.parseFloat(entity.state ?? '')
      : entity.min ?? 0;
  const [draftValue, setDraftValue] = useState(initialValue);

  useEffect(() => {
    setDraftValue(initialValue);
  }, [initialValue]);

  const min = isFiniteNumber(entity.min) ? entity.min : undefined;
  const max = isFiniteNumber(entity.max) ? entity.max : undefined;
  const step = isFiniteNumber(entity.step) && entity.step ? entity.step : 1;
  const canUseRange = min !== undefined && max !== undefined && max > min;
  const commitValue = () => {
    if (!disabled && !busy && Number.isFinite(draftValue)) {
      onAction({ entity, action: 'set_value', value: draftValue });
    }
  };

  return (
    <div className="mt-3">
      {canUseRange ? (
        <div className="flex items-center gap-3">
          <GlassSlider
            min={min}
            max={max}
            step={step}
            value={draftValue}
            disabled={disabled || busy}
            onChange={(event) => setDraftValue(Number.parseFloat(event.target.value))}
            onPointerUp={commitValue}
            onKeyUp={commitValue}
            aria-label={entity.name}
            className="min-w-0 flex-1"
          />
          <span className="min-w-[3.5rem] text-right text-[11px] font-semibold tabular-nums text-[color:var(--ui-text-primary)]">
            {Number.isFinite(draftValue) ? `${draftValue}${entity.unit ? ` ${entity.unit}` : ''}` : 'ND'}
          </span>
        </div>
      ) : (
        <input
          type="number"
          step={step}
          value={draftValue}
          disabled={disabled || busy}
          onChange={(event) => setDraftValue(Number.parseFloat(event.target.value))}
          onBlur={commitValue}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commitValue();
              event.currentTarget.blur();
            }
          }}
          className="w-full rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass-strong)] px-3 py-2 text-xs font-semibold text-[color:var(--ui-text-primary)] outline-none focus:border-[color:rgb(var(--ui-accent-rgb)/0.55)]"
        />
      )}
    </div>
  );
}

function RelatedEntityControlList({
  title,
  entities,
  busyEntityId,
  onAction,
}: {
  title: string;
  entities: CameraRelatedEntityInfo[];
  busyEntityId: string | null;
  onAction: (request: CameraRelatedEntityActionRequest) => void;
}) {
  const { t } = useI18n();
  if (entities.length === 0) {
    return null;
  }

  return (
    <section className="mb-1">
      <div className="mb-2.5 flex items-end justify-between gap-3 px-1">
        <div>
          <p className="text-[13px] font-semibold text-[color:var(--ui-text-primary)]">{title}</p>
          <p className="mt-0.5 text-[10px] font-medium text-[color:var(--ui-text-secondary)]">{t('camera.action.exposedFunctions')}</p>
        </div>
        <span className="text-[10px] font-semibold tabular-nums text-[color:var(--ui-text-secondary)]">{entities.length}</span>
      </div>
      <div className="space-y-2">
        {entities.slice(0, 10).map((entity) => {
          const busy = busyEntityId === entity.entityId;
          const unavailable = isRelatedEntityUnavailable(entity);
          const active = isRelatedEntityActive(entity);
          const canToggle = isCameraToggleEntity(entity);
          const canPress = isCameraButtonEntity(entity);
          const canSelect = isCameraSelectEntity(entity);
          const canSetNumber = isCameraNumberEntity(entity);
          const selectOptions: GlassDropdownOption[] = (entity.options ?? []).map((option) => ({ id: option, name: option }));
          const selectedOption = selectOptions.find((option) => option.id === entity.state) ?? selectOptions[0] ?? null;
          return (
            <div
              key={entity.entityId}
              className={`rounded-2xl px-4 py-3 transition-all duration-200 ${
                active
                  ? 'bg-[color:rgb(var(--ui-accent-rgb)/0.14)] shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]'
                  : 'bg-[color:var(--ui-fill-tertiary)] hover:bg-[color:var(--ui-fill-secondary)]'
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border ${
                    active
                      ? 'border-[color:rgb(var(--ui-accent-rgb)/0.42)] bg-[color:rgb(var(--ui-accent-rgb)/0.18)] text-[color:var(--ui-accent)]'
                      : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]'
                  }`}
                >
                  {canPress ? (
                    <MousePointerClick size={15} />
                  ) : canSelect || canSetNumber ? (
                    <SlidersHorizontal size={15} />
                  ) : (
                    <Power size={15} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-[color:var(--ui-text-primary)]">{entity.name}</p>
                  <p className="mt-0.5 truncate text-[10px] text-[color:var(--ui-text-secondary)]">
                    {canSelect ? t('camera.action.selectValue') : canSetNumber ? t('camera.action.adjustValue') : formatEntityKind(entity, t)}
                  </p>
                </div>
                {canToggle ? (
                  <CameraAppleSwitch
                    checked={active}
                    disabled={unavailable}
                    busy={busy}
                    label={`${entity.name}: ${active ? t('camera.action.active') : t('camera.action.inactive')}`}
                    onChange={() => onAction({ entity, action: 'toggle' })}
                  />
                ) : canPress ? (
                  <button
                    type="button"
                    disabled={unavailable || busy}
                    onClick={() => onAction({ entity, action: 'press' })}
                    className="inline-flex min-w-[68px] items-center justify-center gap-1.5 rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass-strong)] px-3 py-1.5 text-[11px] font-semibold text-[color:rgb(var(--ui-accent-rgb)/0.96)] shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {busy ? <Loader2 size={12} className="animate-spin" /> : null}
                    {t('camera.action.run')}
                  </button>
                ) : canSelect ? (
                  <GlassDropdown
                    ariaLabel={entity.name}
                    options={selectOptions}
                    selected={selectedOption}
                    disabled={unavailable || busy}
                    onChange={(option) => onAction({ entity, action: 'select', value: option.id })}
                    size="compact"
                    className="max-w-[46%] shrink-0"
                    buttonClassName="text-[color:rgb(var(--ui-accent-rgb)/0.96)]"
                  />
                ) : null}
              </div>

              {canSetNumber ? (
                <CameraNumberEntityControl
                  entity={entity}
                  busy={busy}
                  disabled={unavailable}
                  onAction={onAction}
                />
              ) : null}

              {!canToggle && !canPress && !canSelect && !canSetNumber ? (
                <p className="mt-2 text-[10px] text-[color:var(--ui-text-secondary)]">{t('camera.action.notControllable')}</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TimelineSelector({
  value,
  items,
  onChange,
  days,
  selectedDay,
  onDayChange,
  loading,
  onRefresh,
}: {
  value: string;
  items: TimelineItem[];
  onChange: (next: string) => void;
  days: CameraEventDay[];
  selectedDay: string;
  onDayChange: (next: string) => void;
  loading: boolean;
  onRefresh?: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className={CONTEXT_PANEL_LAYOUT.sectionCompact}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[color:var(--ui-text-primary)]">{t('camera.timeline.title')}</p>
          <p className="mt-0.5 text-[10px] font-medium text-[color:var(--ui-text-tertiary)]">{t('camera.events.last24Hours')}</p>
        </div>
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="glass-button flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--ui-text-secondary)] transition disabled:opacity-45"
            aria-label={t('camera.timeline.refresh')}
            title={t('camera.timeline.refresh')}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        ) : null}
      </div>

      {days.length > 1 ? (
        <div className="mt-3 flex max-w-full gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {days.map((day) => (
            <button
              key={day.key}
              type="button"
              onClick={() => onDayChange(day.key)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-semibold transition ${
                selectedDay === day.key
                  ? 'liquid-glass-selection text-[color:var(--ui-text-primary)]'
                  : 'text-[color:var(--ui-text-tertiary)] hover:bg-[color:var(--ui-fill-secondary)] hover:text-[color:var(--ui-text-primary)]'
              }`}
            >
              {day.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex max-w-full gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => {
          const isActive = value === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={`flex min-w-[4.25rem] shrink-0 flex-col items-center gap-1.5 rounded-2xl px-2 py-2.5 text-center transition ${
                isActive ? 'bg-[color:var(--ui-fill-primary)]' : 'hover:bg-[color:var(--ui-fill-tertiary)]'
              }`}
              aria-label={t('camera.timeline.selectTime', { time: item.label })}
            >
              <span className={`text-xs font-medium ${isActive ? 'text-[color:var(--ui-text-primary)]' : 'text-[color:var(--ui-text-tertiary)]'}`}>
                {item.label}
              </span>
              <span
                className={`h-1 w-8 rounded-full transition-colors ${
                  isActive
                    ? 'bg-[color:rgb(var(--ui-accent-rgb)/0.92)]'
                    : item.hasClip
                      ? 'bg-cyan-300/55'
                      : item.hasSnapshot
                        ? 'bg-[color:var(--ui-text-tertiary)]'
                        : 'bg-transparent'
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EventRow({
  event,
  isActive = false,
  onPlay,
}: {
  event: CameraEvent;
  isActive?: boolean;
  onPlay?: () => void;
}) {
  const { t } = useI18n();
  const isSound = event.type === 'sound';
  const hasClip = Boolean(event.clipUrl);
  const hasSnapshot = Boolean(event.thumbnailUrl);
  const hasMedia = hasClip || hasSnapshot;
  const EventIcon = event.type === 'vehicle' ? CarFront : event.type === 'doorbell' ? BellRing : event.type === 'sound' ? Volume2 : PersonStanding;
  return (
    <div
      className={`flex items-center gap-4 rounded-2xl border p-3 transition-colors ${
        isActive ? 'border-[color:rgb(var(--ui-accent-rgb)/0.38)] bg-[color:rgb(var(--ui-accent-rgb)/0.12)]' : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)]'
      }`}
    >
      <span
        className={`w-11 h-11 rounded-full flex items-center justify-center border ${
          isSound
            ? 'bg-indigo-500/20 border-indigo-400/35 text-indigo-200'
            : 'bg-cyan-500/20 border-cyan-400/35 text-cyan-200'
        }`}
      >
        <EventIcon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[color:var(--ui-text-primary)]">{event.title}</p>
        <p className="mt-0.5 text-xs text-[color:var(--ui-text-tertiary)]">{event.time}</p>
      </div>
      <button
        type="button"
        className={`w-10 h-10 rounded-full border flex items-center justify-center transition-colors ${
          hasMedia
            ? 'border-[color:var(--ui-border-strong)] bg-[color:var(--ui-fill-secondary)] text-[color:var(--ui-text-primary)] hover:bg-[color:var(--ui-fill-primary)]'
            : 'cursor-not-allowed border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-disabled)]'
        }`}
        aria-label={hasClip ? t('camera.event.playClip', { time: event.time }) : t('camera.event.openSnapshot', { time: event.time })}
        onClick={onPlay}
        disabled={!hasMedia}
      >
        {hasClip ? <Play size={15} className="ml-0.5" /> : <Eye size={15} />}
      </button>
    </div>
  );
}

export function CameraControlsPanel({
  name,
  status,
  entityId,
  streamUrl,
  snapshotUrl,
  isOffline = false,
  rawAttributes,
  supportsPtz = false,
  deviceInfo,
  relatedEntities = [],
  historyEntries = [],
  historyStatus = 'idle',
  historyError,
  onRefreshHistory,
  onPtzMove,
  onPtzStop,
  onRelatedEntityAction,
  onSecondaryPageChange,
  commandsEnabled = true,
}: CameraControlsProps) {
  const { t } = useI18n();
  const clipVideoRef = useRef<HTMLVideoElement | null>(null);
  const refreshResetTimeoutRef = useRef<number | null>(null);
  const [selectedTimelineId, setSelectedTimelineId] = useState('');
  const [selectedEventDay, setSelectedEventDay] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isClipMode, setIsClipMode] = useState(false);
  const [streamFailed, setStreamFailed] = useState(false);
  const [clipFailed, setClipFailed] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSnapshotBusy, setIsSnapshotBusy] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [activePtzDirection, setActivePtzDirection] = useState<CameraPtzDirection | null>(null);
  const [relatedActionBusyId, setRelatedActionBusyId] = useState<string | null>(null);
  const [settingsPageOpen, setSettingsPageOpen] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(true);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(true);
  const [isPtzVisible, setIsPtzVisible] = useState(false);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [activeImageFailed, setActiveImageFailed] = useState(false);

  useEffect(() => {
    onSecondaryPageChange?.(settingsPageOpen);
    return () => onSecondaryPageChange?.(false);
  }, [onSecondaryPageChange, settingsPageOpen]);

  useEffect(() => {
    setStreamFailed(false);
  }, [entityId, snapshotUrl, streamUrl]);

  useEffect(
    () => () => {
      if (refreshResetTimeoutRef.current !== null) {
        window.clearTimeout(refreshResetTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!actionFeedback) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setActionFeedback(null);
    }, 2600);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [actionFeedback]);

  const resolvedStreamUrl = useMemo(() => {
    const url = toTrimmedString(streamUrl);
    return url ? appendCacheBuster(url, refreshNonce) : undefined;
  }, [refreshNonce, streamUrl]);
  const resolvedSnapshotUrl = useMemo(() => {
    const url = toTrimmedString(snapshotUrl);
    return url ? appendCacheBuster(url, refreshNonce) : undefined;
  }, [refreshNonce, snapshotUrl]);
  const cameraProxySnapshotUrl = useMemo(() => {
    const resolvedEntityId = toTrimmedString(entityId);
    if (!resolvedEntityId) {
      return undefined;
    }
    return appendCacheBuster(`/api/camera_proxy/${encodeURIComponent(resolvedEntityId)}`, refreshNonce);
  }, [entityId, refreshNonce]);

  const fallbackVisual = resolvedSnapshotUrl;
  const liveVisualUrl = streamFailed ? fallbackVisual ?? '' : resolvedStreamUrl ?? fallbackVisual ?? '';
  const hasLiveVisual = liveVisualUrl.length > 0;
  const snapshotCaptureUrl = cameraProxySnapshotUrl ?? fallbackVisual ?? (hasLiveVisual ? liveVisualUrl : undefined);
  const subtitle = isOffline ? t('camera.disconnected') : status?.trim() || t('camera.connected');
  const subtitleClass = isOffline ? 'text-rose-200/90' : 'text-emerald-200/90';
  const detectionEntities = useMemo(
    () => relatedEntities.filter((entity) => entity.category === 'detection'),
    [relatedEntities],
  );
  const diagnosticEntities = useMemo(
    () => relatedEntities.filter((entity) => entity.category === 'diagnostic'),
    [relatedEntities],
  );
  const controlEntities = useMemo(
    () => relatedEntities.filter((entity) => entity.category === 'control' || entity.category === 'action'),
    [relatedEntities],
  );
  const settingsEntityCount = controlEntities.length + detectionEntities.length + diagnosticEntities.length;
  const settingsSummary =
    settingsEntityCount > 0
      ? t('camera.settings.relatedCount', { count: settingsEntityCount })
      : t('camera.settings.noSecondary');
  const hasDeviceMetadata = Boolean(
    deviceInfo?.manufacturer ||
      deviceInfo?.model ||
      deviceInfo?.swVersion ||
      deviceInfo?.hwVersion ||
      deviceInfo?.configurationUrl ||
      relatedEntities.length > 0,
  );
  const deviceSummary =
    [deviceInfo?.manufacturer, deviceInfo?.model].filter(Boolean).join(' • ') ||
    deviceInfo?.name ||
    t('camera.notAvailable');
  const deviceDetail = [
    deviceInfo?.swVersion ? `FW ${deviceInfo.swVersion}` : undefined,
    deviceInfo?.hwVersion ? `HW ${deviceInfo.hwVersion}` : undefined,
    relatedEntities.length > 0 ? t('camera.settings.relatedCount', { count: relatedEntities.length }) : undefined,
  ]
    .filter((entry): entry is string => Boolean(entry))
    .join(' • ');

  useEffect(() => {
    if (settingsEntityCount === 0) {
      setSettingsPageOpen(false);
    }
  }, [settingsEntityCount]);

  const eventLogs = useMemo(
    () => mergeCameraEvents(
      buildHistoryEventLogs(historyEntries, relatedEntities),
      buildLiveEventLogs(rawAttributes),
    ),
    [historyEntries, rawAttributes, relatedEntities],
  );

  const clipEvents = useMemo(
    () => eventLogs.filter((event) => Boolean(event.clipUrl)),
    [eventLogs],
  );

  const eventDays = useMemo<CameraEventDay[]>(() => {
    const seen = new Set<string>();
    return eventLogs.reduce<CameraEventDay[]>((days, event) => {
      const key = formatEventDayKey(event.timestampMs);
      if (seen.has(key)) return days;
      seen.add(key);
      days.push({ key, label: formatEventDayLabel(event.timestampMs) });
      return days;
    }, []);
  }, [eventLogs]);

  useEffect(() => {
    if (eventDays.length === 0) {
      setSelectedEventDay('');
      return;
    }
    if (!eventDays.some((day) => day.key === selectedEventDay)) {
      setSelectedEventDay(eventDays[0].key);
    }
  }, [eventDays, selectedEventDay]);

  const visibleEventLogs = useMemo(
    () => eventLogs.filter((event) => !selectedEventDay || formatEventDayKey(event.timestampMs) === selectedEventDay),
    [eventLogs, selectedEventDay],
  );

  const timelineItems = useMemo<TimelineItem[]>(() => {
    if (visibleEventLogs.length > 0) {
      return visibleEventLogs.slice(0, 12).map((event) => ({
        id: event.id,
        label: event.time,
        hasClip: Boolean(event.clipUrl),
        hasSnapshot: Boolean(event.thumbnailUrl),
        timestampMs: event.timestampMs,
      }));
    }
    return [];
  }, [visibleEventLogs]);

  useEffect(() => {
    if (!timelineItems.length) {
      return;
    }
    const hasCurrent = timelineItems.some((item) => item.id === selectedTimelineId);
    if (!hasCurrent) {
      setSelectedTimelineId(timelineItems[0].id);
    }
  }, [selectedTimelineId, timelineItems]);

  const selectedEvent = useMemo(
    () => eventLogs.find((event) => event.id === selectedTimelineId),
    [eventLogs, selectedTimelineId],
  );
  const selectedClipEvent = useMemo(() => {
    if (selectedEvent && (selectedEvent.clipUrl || selectedEvent.thumbnailUrl)) {
      return selectedEvent;
    }
    return clipEvents[0];
  }, [clipEvents, selectedEvent]);

  useEffect(() => {
    setClipFailed(false);
  }, [refreshNonce, selectedClipEvent?.id]);

  const activeClipUrl = useMemo(() => {
    const candidate = selectedClipEvent?.clipUrl ?? selectedClipEvent?.thumbnailUrl;
    return candidate ? appendCacheBuster(candidate, refreshNonce) : undefined;
  }, [refreshNonce, selectedClipEvent?.clipUrl, selectedClipEvent?.thumbnailUrl]);

  const showClipVisual = isClipMode && Boolean(activeClipUrl) && !clipFailed;
  const activeVisualUrl = showClipVisual ? activeClipUrl ?? '' : liveVisualUrl;
  const hasActiveVisual = activeVisualUrl.length > 0 && !activeImageFailed;
  const activeVisualIsVideo = showClipVisual && Boolean(selectedClipEvent?.clipUrl);
  const showingSnapshot = showClipVisual && !activeVisualIsVideo;
  const canTakeSnapshot = Boolean(snapshotCaptureUrl) && !isSnapshotBusy;
  const canUsePtz = commandsEnabled && supportsPtz && typeof onPtzMove === 'function';
  const previewIsPlaying = showClipVisual ? (activeVisualIsVideo ? isPlaying : true) : isPreviewPlaying;

  useEffect(() => {
    setActiveImageFailed(false);
  }, [activeVisualUrl]);

  useEffect(() => {
    if (!canUsePtz) {
      setIsPtzVisible(false);
    }
  }, [canUsePtz]);

  useEffect(() => {
    if (!showClipVisual || !activeVisualIsVideo || !clipVideoRef.current) {
      return;
    }
    if (previewIsPlaying) {
      void clipVideoRef.current.play().catch(() => undefined);
      return;
    }
    clipVideoRef.current.pause();
  }, [activeVisualIsVideo, previewIsPlaying, showClipVisual]);

  const refreshStream = () => {
    setStreamFailed(false);
    setClipFailed(false);
    setRefreshNonce(Date.now());
    setIsRefreshing(true);
    setActionFeedback(t('camera.feedback.streamRefreshed'));
    if (refreshResetTimeoutRef.current !== null) {
      window.clearTimeout(refreshResetTimeoutRef.current);
    }
    refreshResetTimeoutRef.current = window.setTimeout(() => {
      setIsRefreshing(false);
      refreshResetTimeoutRef.current = null;
    }, 800);
  };

  const captureSnapshot = async () => {
    if (!snapshotCaptureUrl || isSnapshotBusy) {
      setActionFeedback(t('camera.feedback.snapshotUnavailable'));
      return;
    }
    setIsSnapshotBusy(true);
    try {
      const response = await fetch(snapshotCaptureUrl, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const safeName = sanitizeFileSegment(name || entityId || 'camera') || 'camera';
      const extension = blob.type.includes('png') ? 'png' : 'jpg';
      const fileName = `${safeName}-${formatSnapshotTimestamp()}.${extension}`;
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 800);
      setActionFeedback(t('camera.feedback.snapshotSaved', { fileName }));
    } catch {
      setActionFeedback(t('camera.feedback.snapshotError'));
    } finally {
      setIsSnapshotBusy(false);
    }
  };

  const handleTimelineChange = (timelineId: string) => {
    setSelectedTimelineId(timelineId);
    const event = eventLogs.find((entry) => entry.id === timelineId);
    if (!event) {
      return;
    }
    if (event.clipUrl || event.thumbnailUrl) {
      setIsClipMode(true);
      setIsPlaying(Boolean(event.clipUrl));
      setClipFailed(false);
      return;
    }
    setActionFeedback(t('camera.feedback.noClipForEvent'));
  };

  const navigateClips = (step: -1 | 1) => {
    if (!clipEvents.length) {
      setActionFeedback(t('camera.feedback.noClip'));
      return;
    }
    const currentIndex = clipEvents.findIndex((entry) => entry.id === selectedClipEvent?.id);
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (baseIndex + step + clipEvents.length) % clipEvents.length;
    const nextClip = clipEvents[nextIndex];
    setSelectedTimelineId(nextClip.id);
    setIsClipMode(true);
    setIsPlaying(true);
    setClipFailed(false);
  };

  const toggleClipPlayback = () => {
    if (!clipEvents.length) {
      setActionFeedback(t('camera.feedback.noClip'));
      return;
    }
    if (!isClipMode) {
      setIsClipMode(true);
      setIsPlaying(true);
      setClipFailed(false);
      return;
    }
    setIsPlaying((value) => !value);
  };

  const togglePreviewPlayback = () => {
    if (showingSnapshot) {
      setIsClipMode(false);
      setIsPlaying(false);
      return;
    }
    if (showClipVisual) {
      toggleClipPlayback();
      return;
    }
    setIsPreviewPlaying((value) => !value);
  };

  const startPtz = (direction: CameraPtzDirection) => {
    if (!canUsePtz || !onPtzMove) {
      return;
    }
    setActivePtzDirection(direction);
    onPtzMove(direction);
  };

  const stopPtz = () => {
    if (activePtzDirection === null) {
      return;
    }
    setActivePtzDirection(null);
    onPtzStop?.();
  };

  const runRelatedEntityAction = async (request: CameraRelatedEntityActionRequest) => {
    if (!onRelatedEntityAction) {
      setActionFeedback(t('camera.feedback.controlUnavailable'));
      return;
    }
    if (relatedActionBusyId) {
      return;
    }
    setRelatedActionBusyId(request.entity.entityId);
    try {
      const success = await onRelatedEntityAction(request);
      if (success === false) {
        setActionFeedback(t('camera.feedback.commandFailed', { name: request.entity.name }));
        return;
      }
      setActionFeedback(t('camera.feedback.commandSent', { name: request.entity.name }));
    } catch {
      setActionFeedback(t('camera.feedback.commandError', { name: request.entity.name }));
    } finally {
      setRelatedActionBusyId(null);
    }
  };

  useEffect(
    () => () => {
      if (activePtzDirection !== null) {
        onPtzStop?.();
      }
    },
    [activePtzDirection, onPtzStop],
  );

  if (settingsPageOpen) {
    return (
      <ContextSecondaryPage
        title={t('camera.settings.title')}
        subtitle={t('camera.settings.subtitle', { name })}
        backLabel={t('camera.settings.back')}
        icon={<Settings2 size={18} />}
        iconClassName="text-cyan-200"
        onBack={() => setSettingsPageOpen(false)}
      >
        {controlEntities.length > 0 ? (
          <div className={CONTEXT_PANEL_LAYOUT.sectionCompact}>
            <RelatedEntityControlList
              title={t('camera.settings.controls')}
              entities={controlEntities}
              busyEntityId={relatedActionBusyId}
              onAction={(request) => {
                void runRelatedEntityAction(request);
              }}
            />
          </div>
        ) : null}

        {detectionEntities.length > 0 ? (
          <div className={CONTEXT_PANEL_LAYOUT.sectionCompact}>
            <RelatedEntityGrid title={t('camera.settings.detections')} kind="detection" entities={detectionEntities} />
          </div>
        ) : null}

        {diagnosticEntities.length > 0 ? (
          <div className={CONTEXT_PANEL_LAYOUT.sectionCompact}>
            <RelatedEntityGrid title={t('camera.settings.diagnostics')} kind="diagnostic" entities={diagnosticEntities} />
          </div>
        ) : null}

        {hasDeviceMetadata ? (
          <div className={CONTEXT_PANEL_LAYOUT.sectionCompact}>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--ui-text-tertiary)]">{t('camera.settings.info')}</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
              <span className="text-[color:var(--ui-text-tertiary)]">{t('camera.info.status')}</span><span className="text-right font-semibold text-[color:var(--ui-text-secondary)]">{isOffline ? t('camera.unreachable') : t('camera.online')}</span>
              <span className="text-[color:var(--ui-text-tertiary)]">{t('camera.info.manufacturer')}</span><span className="text-right font-semibold text-[color:var(--ui-text-secondary)]">{deviceInfo?.manufacturer ?? t('camera.notAvailable')}</span>
              <span className="text-[color:var(--ui-text-tertiary)]">{t('camera.info.model')}</span><span className="text-right font-semibold text-[color:var(--ui-text-secondary)]">{deviceInfo?.model ?? t('camera.notAvailable')}</span>
              <span className="text-[color:var(--ui-text-tertiary)]">{t('camera.info.firmware')}</span><span className="text-right font-semibold text-[color:var(--ui-text-secondary)]">{deviceInfo?.swVersion ?? t('camera.notAvailable')}</span>
              <span className="text-[color:var(--ui-text-tertiary)]">{t('camera.info.hardware')}</span><span className="text-right font-semibold text-[color:var(--ui-text-secondary)]">{deviceInfo?.hwVersion ?? t('camera.notAvailable')}</span>
            </div>
            {relatedEntities.length > 0 ? (
              <details className="mt-3 border-t border-[color:var(--ui-separator)] pt-3">
                <summary className="cursor-pointer list-none text-xs font-semibold text-cyan-200/78 [&::-webkit-details-marker]:hidden">
                  {t('camera.settings.relatedCount', { count: relatedEntities.length })}
                </summary>
                <div className="mt-2 space-y-1.5">
                  {relatedEntities.map((entity) => <p key={entity.entityId} className="break-all text-[10px] leading-snug text-[color:var(--ui-text-tertiary)]">{entity.entityId}</p>)}
                </div>
              </details>
            ) : null}
          </div>
        ) : null}
      </ContextSecondaryPage>
    );
  }

  return (
    <>
    <div className={`${CONTEXT_PANEL_LAYOUT.shell} relative`}>
      <ContextPanelHeader
        title={name}
        subtitle={subtitle}
        icon={<Webcam size={22} />}
        fallbackTitle={t('camera.fallback')}
        subtitleClassName={subtitleClass}
      />

      <div className="mb-1 overflow-hidden rounded-[clamp(1.25rem,4.6vw,2rem)] bg-black/40 shadow-[0_16px_38px_rgba(0,0,0,0.18)]">
        <div className="relative aspect-video w-full overflow-hidden bg-black/40">
          {hasActiveVisual ? (
            activeVisualIsVideo ? (
              <video
                ref={clipVideoRef}
                src={activeVisualUrl}
                className="absolute inset-0 h-full w-full object-cover"
                autoPlay={previewIsPlaying}
                muted={isAudioMuted}
                loop
                playsInline
                onError={() => {
                  setClipFailed(true);
                  setActionFeedback(t('camera.feedback.clipFailed'));
                }}
              />
            ) : (
              <img
                src={activeVisualUrl}
                alt={name || t('camera.fallback')}
                className="absolute inset-0 h-full w-full object-cover"
                onError={() => {
                  if (showClipVisual) {
                    setClipFailed(true);
                    setActionFeedback(t('camera.feedback.clipUnavailable'));
                    return;
                  }
                  if (!streamFailed && fallbackVisual && activeVisualUrl !== fallbackVisual) {
                    setStreamFailed(true);
                    return;
                  }
                  setActiveImageFailed(true);
                }}
              />
            )
          ) : (
            <>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(59,130,246,0.28),transparent_62%)]" />
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-xs text-gray-400">{t('camera.preview.streamUnavailable')}</p>
              </div>
            </>
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/20 to-black/45" aria-hidden="true" />
          {!previewIsPlaying ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/18 backdrop-blur-[1px]">
              <span className="flex h-14 w-14 items-center justify-center rounded-full border border-white/18 bg-black/32 text-white/86 shadow-[0_12px_30px_rgba(0,0,0,0.28)] backdrop-blur-xl">
                <Play size={20} className="ml-0.5" />
              </span>
            </div>
          ) : null}
          <div className="absolute bottom-4 right-4 z-20">
            <div className="liquid-glass-card flex items-center gap-1.5 rounded-full px-2 py-1.5 shadow-[0_10px_26px_rgba(0,0,0,0.24)]">
              <button
                type="button"
                className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
                  isAudioMuted
                    ? 'border-white/10 bg-white/10 text-white/72 hover:bg-white/15'
                    : 'border-[color:rgb(var(--ui-accent-rgb)/0.42)] bg-[color:rgb(var(--ui-accent-rgb)/0.22)] text-white'
                }`}
                aria-label={isAudioMuted ? t('camera.preview.audioOn') : t('camera.preview.audioOff')}
                title={isAudioMuted ? t('camera.preview.audioOn') : t('camera.preview.audioOff')}
                onClick={() => setIsAudioMuted((value) => !value)}
              >
                {isAudioMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
              {canUsePtz ? (
                <button
                  type="button"
                  className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
                    isPtzVisible
                      ? 'border-[color:rgb(var(--ui-accent-rgb)/0.42)] bg-[color:rgb(var(--ui-accent-rgb)/0.22)] text-white'
                      : 'border-white/10 bg-white/10 text-white/72 hover:bg-white/15'
                  }`}
                  aria-label={isPtzVisible ? t('camera.preview.hidePtz') : t('camera.preview.showPtz')}
                  title={isPtzVisible ? t('camera.preview.hidePtzShort') : t('camera.preview.showPtzShort')}
                  onClick={() => setIsPtzVisible((value) => !value)}
                >
                  <SlidersHorizontal size={14} />
                </button>
              ) : null}
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white/72 transition-colors hover:bg-white/15"
                aria-label={t('camera.preview.fullscreen')}
                title={t('camera.preview.fullscreen')}
                onClick={() => setIsViewerOpen(true)}
              >
                <Expand size={14} />
              </button>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white/72 transition-colors hover:bg-white/15"
                aria-label={showingSnapshot ? t('camera.preview.backToLive') : previewIsPlaying ? t('camera.preview.pause') : t('camera.preview.play')}
                title={showingSnapshot ? t('camera.preview.backToLive') : previewIsPlaying ? t('camera.preview.pause') : t('camera.preview.play')}
                onClick={togglePreviewPlayback}
              >
                {showingSnapshot ? <Webcam size={14} /> : previewIsPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
              </button>
            </div>
          </div>

          {actionFeedback ? (
            <div className="absolute left-4 right-4 top-[4.15rem] z-30 rounded-2xl border border-white/10 bg-black/32 px-3 py-2 text-center text-[11px] font-medium text-white/76 shadow-[0_10px_24px_rgba(0,0,0,0.22)] backdrop-blur-2xl">
              {actionFeedback}
            </div>
          ) : null}
        </div>
      </div>

      {canUsePtz && isPtzVisible ? (
        <div className={`${CONTEXT_PANEL_LAYOUT.section} mb-1`}>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--ui-text-secondary)]">{t('camera.preview.ptz')}</p>
            <span className="rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-[color:var(--ui-text-secondary)]">
              {t('camera.preview.hold')}
            </span>
          </div>
          <CameraPtzJoystick
            activeDirection={activePtzDirection}
            onDirectionStart={startPtz}
            onDirectionStop={stopPtz}
          />
        </div>
      ) : null}

      {timelineItems.length > 0 ? (
        <div className="mb-1">
          <TimelineSelector
            value={selectedTimelineId}
            items={timelineItems}
            onChange={handleTimelineChange}
            days={eventDays}
            selectedDay={selectedEventDay}
            onDayChange={setSelectedEventDay}
            loading={historyStatus === 'loading' || historyStatus === 'idle'}
            onRefresh={onRefreshHistory}
          />
        </div>
      ) : null}

      {visibleEventLogs.length > 0 ? (
        <div className={`${CONTEXT_PANEL_LAYOUT.sectionCompact} mb-1`}>
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <p className="text-xs font-semibold text-[color:var(--ui-text-secondary)]">{t('camera.events.title')}</p>
            <span className="text-[10px] font-medium tabular-nums text-[color:var(--ui-text-tertiary)]">{visibleEventLogs.length}</span>
          </div>
          <div className="space-y-3">
            {visibleEventLogs.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                isActive={event.id === selectedTimelineId}
                onPlay={() => handleTimelineChange(event.id)}
              />
            ))}
          </div>
          {historyStatus === 'error' ? (
            <p className="mt-3 px-1 text-[10px] leading-relaxed text-amber-100/62">
              {historyError ?? t('camera.events.historyUnavailable')} {t('camera.events.attributeFallback')}
            </p>
          ) : null}
        </div>
      ) : (
        <div className={`${CONTEXT_PANEL_LAYOUT.sectionCompact} mb-1`}>
          <div className="dashboard-content-surface rounded-2xl px-4 py-5 text-center">
            {historyStatus === 'loading' || historyStatus === 'idle' ? (
              <GlassLoader
                size="sm"
                label={t('camera.events.loading')}
                description={t('camera.events.loadingDescription')}
              />
            ) : historyStatus === 'error' ? (
              <>
                <p className="text-sm font-semibold text-[color:var(--ui-text-secondary)]">{t('camera.events.historyUnavailable')}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-[color:var(--ui-text-tertiary)]">{historyError ?? t('camera.events.haUnavailable')}</p>
                {onRefreshHistory ? (
                  <button type="button" onClick={onRefreshHistory} className="glass-button mt-3 rounded-full px-4 py-2 text-[11px] font-semibold text-[color:var(--ui-text-secondary)] transition">
                    {t('camera.events.retry')}
                  </button>
                ) : null}
              </>
            ) : historyStatus === 'offline' ? (
              <>
                <p className="text-sm font-semibold text-[color:var(--ui-text-secondary)]">{t('camera.events.cameraOffline')}</p>
                <p className="mt-1 text-[11px] text-[color:var(--ui-text-tertiary)]">{t('camera.events.reconnectHint')}</p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-[color:var(--ui-text-secondary)]">{t('camera.events.empty')}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-[color:var(--ui-text-tertiary)]">{t('camera.events.emptyDescription')}</p>
              </>
            )}
          </div>
        </div>
      )}

      {settingsEntityCount > 0 ? (
        <div className={`${CONTEXT_PANEL_LAYOUT.sectionSoft} mb-1`}>
          <button
            type="button"
            onClick={() => setSettingsPageOpen(true)}
            className="flex w-full items-center justify-between gap-3 rounded-2xl px-2 py-1 text-left transition active:scale-[0.99]"
            aria-label={t('camera.settings.open')}
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]">
                <Settings2 size={17} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-[color:var(--ui-text-primary)]">{t('camera.settings.title')}</span>
                <span className="mt-0.5 block truncate text-[11px] text-[color:var(--ui-text-tertiary)]">{settingsSummary}</span>
              </span>
            </span>
            <ChevronRight size={17} className="shrink-0 text-[color:var(--ui-text-tertiary)]" />
          </button>
        </div>
      ) : null}

      {hasDeviceMetadata ? (
        <div className="dashboard-content-surface-soft mb-1 rounded-[clamp(1rem,3vw,1.45rem)] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-[10px] uppercase tracking-[0.16em] text-[color:var(--ui-text-tertiary)]">{t('camera.settings.device')}</span>
              <span className="mt-1 block truncate text-xs font-semibold text-[color:var(--ui-text-secondary)]">{deviceSummary}</span>
            </span>
            {deviceDetail ? (
              <span className="max-w-[45%] truncate text-right text-[10px] font-medium text-[color:var(--ui-text-tertiary)]">{deviceDetail}</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
    <CameraViewer
      isOpen={isViewerOpen}
      cameras={entityId ? [{
        entityId,
        name,
        statusLabel: subtitle,
        streamUrl,
        snapshotUrl,
        isOffline,
        supportsPtz: canUsePtz,
      }] : []}
      activeEntityId={entityId ?? null}
      onActiveEntityChange={() => undefined}
      onClose={() => setIsViewerOpen(false)}
      commandsEnabled={commandsEnabled && !isOffline}
      onPtzMove={onPtzMove ? (_entityId, direction) => onPtzMove(direction) : undefined}
      onPtzStop={onPtzStop ? () => onPtzStop() : undefined}
    />
    </>
  );
}

export const CameraControls = CameraControlsPanel;
