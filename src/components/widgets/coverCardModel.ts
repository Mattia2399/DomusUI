import type { Widget } from '../../types/dashboardModels';
import type { MockEntityState } from '../../types/ha';
import { translateForLocale, type AppLocale } from '../../i18n/I18nProvider';
import {
  COVER_FEATURE_CLOSE,
  COVER_FEATURE_CLOSE_TILT,
  COVER_FEATURE_OPEN,
  COVER_FEATURE_OPEN_TILT,
  COVER_FEATURE_SET_POSITION,
  COVER_FEATURE_SET_TILT_POSITION,
  COVER_FEATURE_STOP,
  COVER_FEATURE_STOP_TILT,
  coverSupportsClose,
  coverSupportsCloseTilt,
  coverSupportsOpen,
  coverSupportsOpenTilt,
  coverSupportsSetPosition,
  coverSupportsSetTiltPosition,
  coverSupportsStop,
  coverSupportsStopTilt,
  clampPercent,
  normalizeCoverState,
  resolveCoverPosition,
  resolveCoverPositionAttribute,
  resolveCoverSupportedFeatures,
  resolveCoverTiltAttribute,
  resolveCoverTiltPosition,
  translateCoverState,
  type NormalizedCoverState,
} from '../../utils/coverUtils';

export type CoverDeviceClass =
  | 'awning'
  | 'blind'
  | 'curtain'
  | 'damper'
  | 'door'
  | 'garage'
  | 'gate'
  | 'shade'
  | 'shutter'
  | 'window'
  | 'cover';

export type CoverCardTone = 'open' | 'closed' | 'moving' | 'offline';

export type CoverCardDetailItem = {
  label: string;
  value: string;
};

export type CoverCardModel = {
  title: string;
  state: NormalizedCoverState;
  stateLabel: string;
  compactStateLabel: string;
  caption: string;
  position: number;
  coverage: number;
  tiltPosition: number;
  tiltDegrees: number;
  hasTilt: boolean;
  supportedFeatures?: number;
  supportsOpen: boolean;
  supportsClose: boolean;
  supportsSetPosition: boolean;
  supportsStop: boolean;
  supportsOpenTilt: boolean;
  supportsCloseTilt: boolean;
  supportsSetTiltPosition: boolean;
  supportsStopTilt: boolean;
  deviceClass: CoverDeviceClass;
  deviceClassLabel: string;
  isMoving: boolean;
  isAvailable: boolean;
  pending: boolean;
  tone: CoverCardTone;
  detailItems: CoverCardDetailItem[];
};

const COVER_PENDING_ATTRIBUTE_KEY = '__dashboard_pending_cover';
const COVER_PENDING_TILT_ATTRIBUTE_KEY = '__dashboard_pending_cover_tilt';

const COVER_MAX_COMPAT_FEATURES =
  COVER_FEATURE_OPEN |
  COVER_FEATURE_CLOSE |
  COVER_FEATURE_SET_POSITION |
  COVER_FEATURE_STOP |
  COVER_FEATURE_OPEN_TILT |
  COVER_FEATURE_CLOSE_TILT |
  COVER_FEATURE_STOP_TILT |
  COVER_FEATURE_SET_TILT_POSITION;

const COVER_DEVICE_CLASSES: CoverDeviceClass[] = [
  'awning',
  'blind',
  'curtain',
  'damper',
  'door',
  'garage',
  'gate',
  'shade',
  'shutter',
  'window',
  'cover',
];

function toTrimmedString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeToken(value: string | undefined) {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export function normalizeCoverDeviceClass(value: unknown, fallbackText?: string): CoverDeviceClass {
  const direct = normalizeToken(toTrimmedString(value));
  if (COVER_DEVICE_CLASSES.includes(direct as CoverDeviceClass)) {
    return direct as CoverDeviceClass;
  }

  const source = normalizeToken(fallbackText);
  if (source.includes('tenda da sole') || source.includes('awning')) return 'awning';
  if (source.includes('serranda aria') || source.includes('damper')) return 'damper';
  if (source.includes('garage')) return 'garage';
  if (source.includes('cancello') || source.includes('gate')) return 'gate';
  if (source.includes('porta') || source.includes('door')) return 'door';
  if (source.includes('finestra') || source.includes('window')) return 'window';
  if (source.includes('veneziana') || source.includes('blind')) return 'blind';
  if (source.includes('oscurante') || source.includes('shade')) return 'shade';
  if (source.includes('tenda') || source.includes('curtain')) return 'curtain';
  if (source.includes('tapparella') || source.includes('shutter')) return 'shutter';
  return 'cover';
}

export function translateCoverDeviceClass(deviceClass: CoverDeviceClass, locale: AppLocale = 'it') {
  return translateForLocale(locale, `card.cover.deviceClass.${deviceClass}`);
}

function resolveCaption(
  state: NormalizedCoverState,
  position: number,
  deviceClassLabel: string,
  pending: boolean,
  locale: AppLocale,
) {
  if (pending) return translateForLocale(locale, 'card.cover.pending');
  if (state === 'open' || state === 'closed') return translateForLocale(locale, `card.cover.caption.${state}`, { type: deviceClassLabel });
  if (state === 'stopped') return translateForLocale(locale, 'card.cover.caption.stopped', { position });
  return translateForLocale(locale, `card.cover.caption.${state}`);
}

function resolveTone(state: NormalizedCoverState): CoverCardTone {
  if (state === 'opening' || state === 'closing') return 'moving';
  if (state === 'closed') return 'closed';
  if (state === 'unavailable' || state === 'unknown') return 'offline';
  return 'open';
}

function formatFeatureSummary(model: Pick<
  CoverCardModel,
  | 'supportsOpen'
  | 'supportsClose'
  | 'supportsSetPosition'
  | 'supportsStop'
  | 'supportsOpenTilt'
  | 'supportsCloseTilt'
  | 'supportsSetTiltPosition'
  | 'supportsStopTilt'
>, locale: AppLocale) {
  const count = [
    model.supportsOpen,
    model.supportsClose,
    model.supportsSetPosition,
    model.supportsStop,
    model.supportsOpenTilt,
    model.supportsCloseTilt,
    model.supportsSetTiltPosition,
    model.supportsStopTilt,
  ].filter(Boolean).length;

  if (count >= 8) return translateForLocale(locale, 'card.cover.features.complete');
  if (count >= 4) return translateForLocale(locale, 'card.cover.features.extended');
  return translateForLocale(locale, 'card.cover.features.basic');
}

export function buildCoverCardModel({
  widget,
  liveEntity,
  locale = 'it',
}: {
  widget: Widget;
  liveEntity?: MockEntityState;
  locale?: AppLocale;
}): CoverCardModel {
  const rawAttributes = liveEntity?.rawAttributes;
  const rawState =
    toTrimmedString(liveEntity?.state) ??
    toTrimmedString(liveEntity?.stateLabel) ??
    widget.status;
  const state = normalizeCoverState(rawState);
  const position = resolveCoverPosition(
    state,
    resolveCoverPositionAttribute(rawAttributes) ?? widget.value,
    typeof widget.value === 'number' ? widget.value : 70,
  );
  const tiltAttribute = resolveCoverTiltAttribute(rawAttributes);
  const tiltPosition = resolveCoverTiltPosition(
    tiltAttribute ?? widget.coverTiltPosition,
    typeof widget.coverTiltPosition === 'number' ? widget.coverTiltPosition : 50,
  );
  const supportedFeatures = resolveCoverSupportedFeatures(liveEntity);
  const hasTiltAttribute = tiltAttribute !== undefined;
  const supportsOpen = coverSupportsOpen(supportedFeatures);
  const supportsClose = coverSupportsClose(supportedFeatures);
  const supportsSetPosition = coverSupportsSetPosition(supportedFeatures);
  const supportsStop = coverSupportsStop(supportedFeatures);
  const supportsOpenTilt = coverSupportsOpenTilt(supportedFeatures);
  const supportsCloseTilt = coverSupportsCloseTilt(supportedFeatures);
  const supportsSetTiltPosition =
    coverSupportsSetTiltPosition(supportedFeatures) ||
    (hasTiltAttribute && (supportedFeatures === undefined || supportedFeatures === 0));
  const supportsStopTilt = coverSupportsStopTilt(supportedFeatures);
  const hasTilt = hasTiltAttribute || supportsOpenTilt || supportsCloseTilt || supportsSetTiltPosition || supportsStopTilt;
  const pending =
    rawAttributes?.[COVER_PENDING_ATTRIBUTE_KEY] === true ||
    rawAttributes?.[COVER_PENDING_TILT_ATTRIBUTE_KEY] === true;
  const title =
    widget.title ||
    toTrimmedString(rawAttributes?.friendly_name) ||
    translateForLocale(locale, 'controls.cover.title');
  const deviceClass = normalizeCoverDeviceClass(rawAttributes?.device_class, `${title} ${widget.entityId}`);
  const deviceClassLabel = translateCoverDeviceClass(deviceClass, locale);
  const stateLabel = translateForLocale(locale, `controls.cover.state.${state}`);
  const compactStateLabel =
    state === 'unavailable' || state === 'unknown'
      ? stateLabel
      : translateForLocale(locale, 'card.cover.positionOpen', { position });
  const tone = resolveTone(state);
  const capabilityModel = {
    supportsOpen,
    supportsClose,
    supportsSetPosition,
    supportsStop,
    supportsOpenTilt,
    supportsCloseTilt,
    supportsSetTiltPosition,
    supportsStopTilt,
  };

  const detailItems: CoverCardDetailItem[] = [
    { label: translateForLocale(locale, 'card.cover.type'), value: deviceClassLabel },
    { label: translateForLocale(locale, 'card.cover.position'), value: `${position}%` },
    { label: translateForLocale(locale, 'card.cover.commands'), value: formatFeatureSummary(capabilityModel, locale) },
  ];

  return {
    title,
    state,
    stateLabel,
    compactStateLabel,
    caption: resolveCaption(state, position, deviceClassLabel, pending, locale),
    position,
    coverage: clampPercent(100 - position),
    tiltPosition,
    tiltDegrees: Math.round((tiltPosition / 100) * 90),
    hasTilt,
    supportedFeatures: supportedFeatures ?? (hasTilt ? COVER_MAX_COMPAT_FEATURES : undefined),
    supportsOpen,
    supportsClose,
    supportsSetPosition,
    supportsStop,
    supportsOpenTilt,
    supportsCloseTilt,
    supportsSetTiltPosition,
    supportsStopTilt,
    deviceClass,
    deviceClassLabel,
    isMoving: state === 'opening' || state === 'closing',
    isAvailable: state !== 'unavailable' && state !== 'unknown',
    pending,
    tone,
    detailItems,
  };
}
