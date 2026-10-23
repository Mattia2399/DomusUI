import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useCan } from '../security/AccessControlProvider';
import {
  AlertTriangle,
  Blinds,
  ChevronRight,
  Check,
  Clock3,
  Fingerprint,
  House,
  KeyRound,
  Loader2,
  Lock,
  Moon,
  Pencil,
  Plane,
  Search,
  SlidersHorizontal,
  Settings,
  Shield,
  ShieldOff,
  ShieldPlus,
  Unlock,
  WifiOff,
  X,
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useI18n } from '../i18n/I18nProvider';
import GlassDropdown from '../components/ui/GlassDropdown';
import GlassModal from '../components/ui/GlassModal';
import GlassSegmentSelect from '../components/ui/GlassSegmentSelect';
import NestedPageHeader from '../components/ui/NestedPageHeader';
import { PUSH_PAGE_ATTRIBUTE, usePagePushTransition } from '../components/ui/usePagePushTransition';
import { useAmbient } from '../theme/ambient/AmbientProvider';
import { resolveAlarmAmbient } from '../theme/ambient/ambientModel';
import { CameraCardView } from '../components/widgets/CameraCardView';
import { buildCameraCardModel } from '../components/widgets/cameraCardModel';
import CameraViewer from '../components/camera/CameraViewer';
import SecurityAuthModal from '../components/security/SecurityAuthModal';
import { useDeviceAuth } from '../hooks/useDeviceAuth';
import {
  INITIAL_AUTH_ATTEMPT_STATE,
  appendSecurityAuditEvent,
  getAuthRateLimitStatus,
  recordAuthFailure,
  recordAuthSuccess,
} from '../services/securityAuth';
import {
  ALARM_FEATURE_ARM_AWAY,
  ALARM_FEATURE_ARM_CUSTOM_BYPASS,
  ALARM_FEATURE_ARM_HOME,
  ALARM_FEATURE_ARM_NIGHT,
  ALARM_FEATURE_ARM_VACATION,
  ALARM_FEATURE_TRIGGER,
  alarmSupportsFeature,
  normalizeAlarmState,
  resolveAlarmSupportedFeatures,
} from '../utils/alarmUtils';
import {
  resolveAlarmManualCodeSubmission,
  resolveAlarmSecurityRequirement,
} from '../utils/alarmSecurityPolicy';
import {
  SECURITY_CENTER_STORAGE_KEYS as STORAGE_KEYS,
  isSecuritySensorEntity,
  readSecurityCenterAlarm,
  readSecurityCenterSelection as readStoredEntitySelection,
  writeSecurityCenterAlarm,
  writeSecurityCenterSelection as writeStoredEntitySelection,
} from '../services/securityCenterSelection';

const LEGACY_SECURITY_ALARM_PIN_STORAGE_KEY = 'ha.dashboard.security.alarmPin';

const UI_FLAGS = Object.freeze({
  directCallWhenCodeNotRequired: false,
  showSensorSearch: true,
  showEventFeed: true,
});

const SECURITY_OVERVIEW_PATH = '/security';
const SECURITY_CAMERAS_PATH = '/security/cameras';
const SECURITY_SENSORS_PATH = '/security/sensors';
// The overview, then its camera and sensor directories one level below.
const securityViewDepth = (view) => (view === 'overview' ? 1 : 2);
const MAX_CAMERAS_ON_DASHBOARD = 4;
const SECURITY_CAMERA_PREVIEW_REFRESH_MS = 10_000;
const SHIELD_SIZE = 304;
const SHIELD_PROGRESS_RADIUS = 146;
const SHIELD_PROGRESS_CIRCUMFERENCE = 2 * Math.PI * SHIELD_PROGRESS_RADIUS;

const ALARM_MODE_OPTIONS = [
  { value: 'armed_home', label: 'Casa', icon: House, feature: ALARM_FEATURE_ARM_HOME },
  { value: 'armed_away', label: 'Fuori', icon: Plane, feature: ALARM_FEATURE_ARM_AWAY },
  { value: 'armed_night', label: 'Notte', icon: Moon, feature: ALARM_FEATURE_ARM_NIGHT },
  { value: 'armed_vacation', label: 'Vacanza', icon: Plane, feature: ALARM_FEATURE_ARM_VACATION },
  { value: 'armed_custom_bypass', label: 'Bypass', icon: ShieldPlus, feature: ALARM_FEATURE_ARM_CUSTOM_BYPASS },
];

const ALARM_MODE_TRANSLATION_KEYS = {
  armed_home: 'security.mode.home',
  armed_away: 'security.mode.away',
  armed_night: 'security.mode.night',
  armed_vacation: 'security.mode.vacation',
  armed_custom_bypass: 'security.mode.bypass',
};

const ALARM_STATE_TRANSLATION_KEYS = {
  disarmed: 'security.state.disarmed',
  armed_home: 'security.state.home',
  armed_away: 'security.state.away',
  armed_night: 'security.state.night',
  armed_vacation: 'security.state.vacation',
  armed_custom_bypass: 'security.state.bypass',
  pending: 'security.state.pending',
  arming: 'security.state.arming',
  disarming: 'security.state.disarming',
  triggered: 'security.state.triggered',
  unavailable: 'security.state.unavailable',
  unknown: 'security.state.unknown',
};

const ALARM_VISUAL_TRANSLATION_KEYS = {
  disarmed: { badge: 'security.visual.disarmed.badge', helper: 'security.visual.disarmed.helper' },
  armed_home: { badge: 'security.visual.home.badge', helper: 'security.visual.home.helper' },
  armed_away: { badge: 'security.visual.away.badge', helper: 'security.visual.away.helper' },
  armed_night: { badge: 'security.visual.night.badge', helper: 'security.visual.night.helper' },
  armed_vacation: { badge: 'security.visual.vacation.badge', helper: 'security.visual.vacation.helper' },
  armed_custom_bypass: { badge: 'security.visual.bypass.badge', helper: 'security.visual.bypass.helper' },
  triggered: { badge: 'security.visual.triggered.badge', helper: 'security.visual.triggered.helper' },
  pending: { badge: 'security.visual.pending.badge', helper: 'security.visual.pending.helper' },
  unavailable: { badge: 'security.visual.unavailable.badge', helper: 'security.visual.unavailable.helper' },
};

const ALARM_SERVICE_BY_STATE = {
  disarmed: 'alarm_disarm',
  armed_home: 'alarm_arm_home',
  armed_away: 'alarm_arm_away',
  armed_night: 'alarm_arm_night',
  armed_vacation: 'alarm_arm_vacation',
  armed_custom_bypass: 'alarm_arm_custom_bypass',
  triggered: 'alarm_trigger',
};

const ALARM_ACTION_BY_STATE = {
  disarmed: 'disarm',
  armed_home: 'arm_home',
  armed_away: 'arm_away',
  armed_night: 'arm_night',
  armed_vacation: 'arm_vacation',
  armed_custom_bypass: 'arm_custom_bypass',
  triggered: 'trigger',
};

const DEMO_SECURITY_LOGS = [
  { id: 1, time: '14:20', message: 'Movimento rilevato', type: 'warning' },
  { id: 2, time: '18:30', message: 'Allarme inserito', type: 'info' },
];

const ALARM_VISUALS = {
  disarmed: {
    icon: ShieldOff,
    badge: 'Sistema Disinserito',
    helper: 'Casa in standby',
    backgroundColor: 'rgba(52,199,89,0.18)',
    borderColor: 'rgba(52,199,89,0.52)',
    boxShadow:
      '0 0 0 1px rgba(52,199,89,0.35), 0 0 88px rgba(52,199,89,0.3), inset 0 0 80px rgba(52,199,89,0.18)',
    pulseColor: 'rgba(52,199,89,0.65)',
    ringColor: 'rgba(52,199,89,0.9)',
    ringGlow: 'rgba(52,199,89,0.45)',
  },
  armed_home: {
    icon: House,
    badge: 'Inserito Casa',
    helper: 'Perimetro attivo',
    backgroundColor: 'rgba(255,59,48,0.2)',
    borderColor: 'rgba(255,59,48,0.55)',
    boxShadow:
      '0 0 0 1px rgba(255,59,48,0.4), 0 0 96px rgba(255,59,48,0.35), inset 0 0 78px rgba(255,59,48,0.2)',
    pulseColor: 'rgba(255,59,48,0.72)',
    ringColor: 'rgba(255,59,48,0.92)',
    ringGlow: 'rgba(255,59,48,0.46)',
  },
  armed_away: {
    icon: Plane,
    badge: 'Inserito Fuori',
    helper: 'Protezione totale',
    backgroundColor: 'rgba(255,59,48,0.24)',
    borderColor: 'rgba(255,59,48,0.6)',
    boxShadow:
      '0 0 0 1px rgba(255,59,48,0.45), 0 0 106px rgba(255,59,48,0.4), inset 0 0 88px rgba(255,59,48,0.24)',
    pulseColor: 'rgba(255,59,48,0.8)',
    ringColor: 'rgba(255,59,48,0.94)',
    ringGlow: 'rgba(255,59,48,0.5)',
  },
  armed_night: {
    icon: Moon,
    badge: 'Inserito Notte',
    helper: 'Protezione notturna',
    backgroundColor: 'rgba(88,86,214,0.24)',
    borderColor: 'rgba(125,122,255,0.62)',
    boxShadow:
      '0 0 0 1px rgba(125,122,255,0.38), 0 0 92px rgba(88,86,214,0.34), inset 0 0 82px rgba(88,86,214,0.22)',
    pulseColor: 'rgba(125,122,255,0.72)',
    ringColor: 'rgba(155,153,255,0.96)',
    ringGlow: 'rgba(125,122,255,0.5)',
  },
  armed_vacation: {
    icon: Plane,
    badge: 'Inserito Vacanza',
    helper: 'Casa protetta durante l’assenza',
    backgroundColor: 'rgba(0,122,255,0.22)',
    borderColor: 'rgba(64,156,255,0.58)',
    boxShadow:
      '0 0 0 1px rgba(64,156,255,0.34), 0 0 94px rgba(0,122,255,0.32), inset 0 0 84px rgba(0,122,255,0.2)',
    pulseColor: 'rgba(64,156,255,0.7)',
    ringColor: 'rgba(100,180,255,0.96)',
    ringGlow: 'rgba(64,156,255,0.48)',
  },
  armed_custom_bypass: {
    icon: ShieldPlus,
    badge: 'Inserito Bypass',
    helper: 'Protezione personalizzata',
    backgroundColor: 'rgba(255,159,10,0.22)',
    borderColor: 'rgba(255,179,64,0.6)',
    boxShadow:
      '0 0 0 1px rgba(255,179,64,0.36), 0 0 94px rgba(255,159,10,0.32), inset 0 0 84px rgba(255,159,10,0.2)',
    pulseColor: 'rgba(255,179,64,0.72)',
    ringColor: 'rgba(255,195,92,0.98)',
    ringGlow: 'rgba(255,179,64,0.48)',
  },
  triggered: {
    icon: AlertTriangle,
    badge: 'Allarme attivo',
    helper: 'Richiede attenzione immediata',
    backgroundColor: 'rgba(255,59,48,0.32)',
    borderColor: 'rgba(255,105,97,0.8)',
    boxShadow:
      '0 0 0 1px rgba(255,105,97,0.52), 0 0 112px rgba(255,59,48,0.5), inset 0 0 92px rgba(255,59,48,0.28)',
    pulseColor: 'rgba(255,105,97,0.9)',
    ringColor: 'rgba(255,135,128,1)',
    ringGlow: 'rgba(255,59,48,0.68)',
  },
  pending: {
    icon: Loader2,
    badge: 'Transizione in corso',
    helper: 'Tempo di uscita/entrata',
    backgroundColor: 'rgba(255,159,10,0.26)',
    borderColor: 'rgba(255,159,10,0.62)',
    boxShadow:
      '0 0 0 1px rgba(255,159,10,0.4), 0 0 104px rgba(255,159,10,0.38), inset 0 0 92px rgba(255,159,10,0.24)',
    pulseColor: 'rgba(255,159,10,0.8)',
    ringColor: 'rgba(255,159,10,0.98)',
    ringGlow: 'rgba(255,159,10,0.52)',
  },
  unavailable: {
    icon: WifiOff,
    badge: 'Non disponibile',
    helper: 'Controlla la connessione a Home Assistant',
    backgroundColor: 'rgba(142,142,147,0.16)',
    borderColor: 'rgba(142,142,147,0.38)',
    boxShadow: '0 0 0 1px rgba(142,142,147,0.2), inset 0 0 72px rgba(142,142,147,0.12)',
    pulseColor: 'rgba(142,142,147,0.28)',
    ringColor: 'rgba(174,174,178,0.7)',
    ringGlow: 'rgba(142,142,147,0.25)',
  },
};

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

function toClockTime(date, locale) {
  return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

function isBinarySensorOpen(value) {
  const normalized = `${value ?? ''}`.trim().toLowerCase();
  return normalized === 'on' || normalized === 'open' || normalized === 'detected' || normalized === 'true';
}

function resolveSensorFriendlyName(entityId, liveEntity) {
  const friendlyName =
    typeof liveEntity?.rawAttributes?.friendly_name === 'string' ? liveEntity.rawAttributes.friendly_name.trim() : '';
  if (friendlyName) return friendlyName;
  return (entityId.split('.').pop() ?? entityId)
    .split('_')
    .map((w) => (w ? `${w[0].toUpperCase()}${w.slice(1)}` : w))
    .join(' ');
}

function resolveSensorType(entityId, liveEntity) {
  const deviceClass = `${liveEntity?.rawAttributes?.device_class ?? ''}`.trim().toLowerCase();
  const token = `${entityId} ${deviceClass}`.toLowerCase();
  if (token.includes('door')) return 'door';
  if (token.includes('window')) return 'window';
  return 'sensor';
}

function resolveCameraFriendlyName(entityId, liveEntity) {
  const friendlyName =
    typeof liveEntity?.rawAttributes?.friendly_name === 'string' ? liveEntity.rawAttributes.friendly_name.trim() : '';
  if (friendlyName) return friendlyName;
  return (entityId.split('.').pop() ?? entityId)
    .split('_')
    .map((w) => (w ? `${w[0].toUpperCase()}${w.slice(1)}` : w))
    .join(' ');
}

function mapAlarmStateForShield(normalizedState, fallbackState) {
  if (normalizedState === 'pending' || normalizedState === 'arming' || normalizedState === 'disarming') return 'pending';
  if (ALARM_VISUALS[normalizedState]) return normalizedState;
  if (normalizedState === 'unknown' || normalizedState === 'unavailable') return 'unavailable';
  return fallbackState;
}

function toPositiveNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.trim().replace(',', '.'));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function resolveAlarmExitDelaySeconds(rawAttributes) {
  if (!rawAttributes || typeof rawAttributes !== 'object') return null;
  for (const key of ['delay_time', 'arming_time', 'exit_delay', 'pending_time', 'delay']) {
    const parsed = toPositiveNumber(rawAttributes[key]);
    if (parsed !== null) return Math.round(parsed);
  }
  return null;
}

function isSecurityCamerasNavigationTarget(path) {
  const target = `${path ?? ''}`.trim();
  if (!target) return false;

  try {
    const parsed = new URL(target, 'http://dashboard.local');
    const pathname = parsed.pathname.toLowerCase();
    const hash = parsed.hash.toLowerCase();
    const view = (parsed.searchParams.get('view') ?? '').trim().toLowerCase();
    const pathSegments = pathname.split('/').filter(Boolean);
    const hashNormalized = hash.replace(/^#/, '').replace(/^\//, '');
    const hashSegments = hashNormalized.split('/').filter(Boolean);
    const isPathMatch =
      pathSegments.includes('security') && (pathSegments.includes('cameras') || pathSegments.includes('telecamere'));
    const isHashMatch =
      hashSegments.includes('security') &&
      (hashSegments.includes('cameras') || hashSegments.includes('telecamere'));
    return (
      isPathMatch ||
      hash === '#security/cameras' ||
      hash === '#security/telecamere' ||
      isHashMatch ||
      view === 'security-cameras' ||
      view === 'security-telecamere'
    );
  } catch {
    return false;
  }
}

function resolveSecurityCamerasFromLocation() {
  if (typeof window === 'undefined') return false;
  return isSecurityCamerasNavigationTarget(window.location.href);
}

function isSecuritySensorsNavigationTarget(path) {
  const target = `${path ?? ''}`.trim();
  if (!target) return false;

  try {
    const parsed = new URL(target, 'http://dashboard.local');
    const pathname = parsed.pathname.toLowerCase();
    const hash = parsed.hash.toLowerCase();
    const view = (parsed.searchParams.get('view') ?? '').trim().toLowerCase();
    const pathSegments = pathname.split('/').filter(Boolean);
    const hashSegments = hash.replace(/^#/, '').replace(/^\//, '').split('/').filter(Boolean);
    const containsSensors = (segments) => segments.includes('sensors') || segments.includes('sensori');
    return (
      (pathSegments.includes('security') && containsSensors(pathSegments)) ||
      (hashSegments.includes('security') && containsSensors(hashSegments)) ||
      hash === '#security/sensors' ||
      hash === '#security/sensori' ||
      view === 'security-sensors' ||
      view === 'security-sensori'
    );
  } catch {
    return false;
  }
}

function resolveSecuritySensorsFromLocation() {
  if (typeof window === 'undefined') return false;
  return isSecuritySensorsNavigationTarget(window.location.href);
}

// FeatureDetector (logica capability invariata)
function resolveAlarmCodeFormat(rawAttributes) {
  const raw = `${rawAttributes?.code_format ?? ''}`.trim().toLowerCase();
  if (raw === 'number' || raw === 'numeric') return 'number';
  if (raw === 'text' || raw === 'string') return 'text';
  return null;
}

function sanitizeAlarmCode(value, codeFormat) {
  const raw = `${value ?? ''}`;
  if (codeFormat === 'number') return raw.replace(/[^\d]/g, '').slice(0, 16);
  return raw.trim().slice(0, 48);
}

function isAlarmCodeRequiredForState(nextState, rawAttributes) {
  const codeFormat = resolveAlarmCodeFormat(rawAttributes);
  const codeArmRequired = rawAttributes?.code_arm_required === true;
  const hasCodeCapability = Boolean(codeFormat) || codeArmRequired;
  if (!hasCodeCapability) return false;
  if (nextState === 'disarmed' || nextState === 'triggered') return true;
  return codeArmRequired;
}

function resolveAlarmActionKind(nextState) {
  return ALARM_ACTION_BY_STATE[nextState] ?? 'arm_away';
}
function SecurityMainShield({
  visual,
  statusLabel,
  isTransitioning,
  showDelayProgress,
  delayProgress,
  delayRemainingSeconds,
  onPrimaryAction,
  primaryActionLabel,
  activeState,
  onActionChange,
  alarmOptions,
  disabled,
  commandFeedback,
  canControl = true,
}) {
  const { t } = useI18n();
  const Icon = visual.icon;
  // security.control: without it the shield is only the state, never a command.
  const ShieldElement = canControl ? motion.button : motion.div;
  const shieldInteraction = canControl
    ? {
        type: 'button',
        onClick: onPrimaryAction,
        disabled,
        whileTap: disabled ? undefined : { scale: 0.985 },
        'aria-label': `${statusLabel}. ${primaryActionLabel}`,
      }
    : { role: 'img', 'aria-label': statusLabel };
  return (
    <section className="dashboard-content-surface rounded-[26px] p-4 sm:rounded-[32px] sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold text-[color:var(--ui-text-primary)] sm:text-[1.45rem]">{t('security.hub')}</h2>
        </div>
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] sm:h-11 sm:w-11">
          <Shield className="h-4 w-4 text-[color:var(--ui-text-secondary)]" />
        </span>
      </div>

      <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] items-center gap-5 sm:mt-6">
        <div className="flex items-center justify-center py-2">
          <ShieldElement
            {...shieldInteraction}
            className={cn(
              'relative flex aspect-square w-[clamp(11.5rem,52vw,16.5rem)] items-center justify-center rounded-full border',
              !canControl ? '' : disabled ? 'cursor-not-allowed opacity-80' : 'cursor-pointer',
            )}
            animate={{ backgroundColor: visual.backgroundColor, borderColor: visual.borderColor, boxShadow: visual.boxShadow }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div
              className="pointer-events-none absolute -inset-3 rounded-full sm:-inset-4"
              animate={{ boxShadow: `0 0 0 2px ${visual.pulseColor}`, opacity: isTransitioning ? [0.2, 0.58, 0.22] : [0.08, 0.24, 0.08], scale: isTransitioning ? [1, 1.07, 1] : [1, 1.025, 1] }}
              transition={{ duration: isTransitioning ? 2.8 : 4.2, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
            />
            {showDelayProgress ? (
              <svg className="pointer-events-none absolute inset-0 h-full w-full -rotate-90" viewBox={`0 0 ${SHIELD_SIZE} ${SHIELD_SIZE}`} fill="none">
                <circle cx={SHIELD_SIZE / 2} cy={SHIELD_SIZE / 2} r={SHIELD_PROGRESS_RADIUS} stroke="rgba(255,255,255,0.2)" strokeWidth="4.5" />
                <motion.circle
                  cx={SHIELD_SIZE / 2}
                  cy={SHIELD_SIZE / 2}
                  r={SHIELD_PROGRESS_RADIUS}
                  stroke={visual.ringColor}
                  strokeWidth="4.5"
                  strokeLinecap="round"
                  strokeDasharray={SHIELD_PROGRESS_CIRCUMFERENCE}
                  animate={{ strokeDashoffset: SHIELD_PROGRESS_CIRCUMFERENCE * (1 - delayProgress) }}
                  transition={{ duration: 0.2, ease: 'linear' }}
                  style={{ filter: `drop-shadow(0 0 10px ${visual.ringGlow})` }}
                />
              </svg>
            ) : null}
            <div className="relative z-10 flex max-w-[80%] flex-col items-center text-center">
              <Icon className={cn('h-12 w-12 text-[color:var(--ui-text-primary)] sm:h-14 sm:w-14', isTransitioning ? 'animate-spin' : '')} />
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ui-text-primary)] sm:text-xs">{statusLabel}</p>
              <p className="mt-1.5 text-[11px] leading-snug text-[color:var(--ui-text-secondary)] sm:text-xs">{visual.helper}</p>
              {showDelayProgress ? <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ui-text-secondary)]">{t('security.exitIn', { seconds: delayRemainingSeconds })}</p> : null}
            </div>
          </ShieldElement>
        </div>

        <div className="min-w-0">
          {canControl ? (
          <GlassSegmentSelect
            ariaLabel={t('security.mode.aria')}
            options={alarmOptions.map((option) => {
              const OptionIcon = option.icon;
              return {
                value: option.value,
                label: <OptionIcon className="h-4 w-4" />,
                ariaLabel: option.label,
                title: option.label,
              };
            })}
            value={alarmOptions.some((option) => option.value === activeState) ? activeState : undefined}
            onChange={onActionChange}
            disabled={disabled}
            minOptionWidth="2.8rem"
            scrollable
            optionClassName="h-10 px-2 sm:h-11 sm:px-3"
          />
          ) : null}

          {commandFeedback ? (
            <p className="mt-3 rounded-xl border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-3 py-2 text-xs text-[color:var(--ui-text-secondary)]" role="status">
              {commandFeedback}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function SecurityEntityPickerModal({
  isOpen,
  title,
  description,
  entities,
  selectedEntityIds,
  onToggleEntity,
  onSelectAll,
  onSelectNone,
  onClose,
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (isOpen) setQuery('');
  }, [isOpen]);

  const filteredEntities = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return entities;
    return entities.filter((entry) => `${entry.name} ${entry.entityId}`.toLowerCase().includes(normalized));
  }, [entities, query]);

  const selectedSet = useMemo(() => new Set(selectedEntityIds), [selectedEntityIds]);

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      eyebrow={t('security.editMode')}
      title={title}
      description={description}
      variant="responsive"
      size="xl"
      zIndex={290}
      closeLabel={t('security.picker.close')}
      backdropClassName="bg-[color:var(--ui-scrim)] backdrop-blur-2xl"
      bodyClassName="flex flex-col overflow-hidden"
    >
            <div className="liquid-glass-card mt-4 px-4 py-3">
              <label className="flex items-center gap-3">
                <span className="inline-flex rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] p-2"><Search className="h-3.5 w-3.5 text-[color:var(--ui-text-secondary)]" /></span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent text-sm text-[color:var(--ui-text-primary)] placeholder:text-[color:var(--ui-text-tertiary)] outline-none" placeholder={t('security.picker.searchDevice')} />
              </label>
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              <p className="text-xs text-[color:var(--ui-text-secondary)]">
                {t('security.picker.selected', { selected: selectedEntityIds.length, total: entities.length })}
              </p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={onSelectAll} className="rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-3 py-1 text-xs font-semibold text-[color:var(--ui-text-primary)] hover:bg-[color:var(--ui-fill-secondary)]">
                  {t('security.picker.all')}
                </button>
                <button type="button" onClick={onSelectNone} className="rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-3 py-1 text-xs font-semibold text-[color:var(--ui-text-primary)] hover:bg-[color:var(--ui-fill-secondary)]">
                  {t('security.picker.none')}
                </button>
              </div>
            </div>

            <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
              {filteredEntities.length > 0 ? (
                filteredEntities.map((entry) => {
                  const checked = selectedSet.has(entry.entityId);
                  return (
                    <button
                      key={entry.entityId}
                      type="button"
                      onClick={() => onToggleEntity(entry.entityId)}
                      className={cn(
                        'w-full rounded-2xl border px-3 py-2.5 text-left transition-colors',
                        checked
                          ? 'border-[color:rgb(var(--ui-accent-rgb)/0.35)] bg-[color:rgb(var(--ui-accent-rgb)/0.1)]'
                          : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] hover:bg-[color:var(--ui-fill-secondary)]',
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded-md border', checked ? 'border-[color:var(--ui-accent)] bg-[color:var(--ui-accent)] text-[color:var(--ui-accent-contrast)]' : 'border-[color:var(--ui-border-strong)] bg-transparent text-transparent')}>
                          <Check className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-[color:var(--ui-text-primary)]">{entry.name}</p>
                          <p className="truncate text-[11px] font-light text-[color:var(--ui-text-tertiary)]">{entry.entityId}</p>
                        </div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="dashboard-content-surface-soft rounded-2xl px-4 py-3 text-sm text-[color:var(--ui-text-secondary)]">
                  {t('security.picker.empty')}
                </div>
              )}
            </div>
    </GlassModal>
  );
}

function SecuritySensorRows({ sensors, limitOnMobile = false }) {
  const { t } = useI18n();
  const getIcon = (type) => (type === 'door' ? House : Blinds);

  if (sensors.length === 0) {
    return <div className="dashboard-content-surface-soft rounded-2xl px-4 py-3 text-sm text-[color:var(--ui-text-secondary)]">{t('security.sensor.empty')}</div>;
  }

  return sensors.map((sensor, index) => {
    const Icon = getIcon(sensor.type);
    return (
      <div
        key={sensor.entityId}
        className={cn(
          'dashboard-content-surface-soft rounded-2xl px-4 py-3',
          sensor.isOpen
            ? 'border-[color:color-mix(in_srgb,var(--ui-danger)_35%,transparent)] bg-[color:color-mix(in_srgb,var(--ui-danger)_9%,transparent)]'
            : '',
          limitOnMobile && index >= 5 ? 'hidden sm:block' : '',
        )}
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)]"><Icon className="h-4.5 w-4.5 text-[color:var(--ui-text-secondary)]" /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[color:var(--ui-text-primary)]">{sensor.name}</p>
            <p className="truncate text-[11px] font-light text-[color:var(--ui-text-tertiary)]">{t(`security.sensor.kind.${sensor.type}`)}</p>
          </div>
          <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold', sensor.isOpen
              ? 'border-[color:color-mix(in_srgb,var(--ui-danger)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--ui-danger)_14%,transparent)] text-[color:var(--ui-danger)]'
              : 'border-[color:color-mix(in_srgb,var(--ui-success)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--ui-success)_14%,transparent)] text-[color:var(--ui-success)]')}>
            {sensor.isOpen ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            {sensor.isOpen ? t('security.sensor.open') : t('security.sensor.closed')}
          </span>
        </div>
      </div>
    );
  });
}

function SensorSearchField({ query, onQueryChange }) {
  const { t } = useI18n();
  return (
    <div className="dashboard-content-surface-soft rounded-2xl px-4 py-3">
      <label className="flex items-center gap-3">
        <span className="inline-flex rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] p-2"><Search className="h-3.5 w-3.5 text-[color:var(--ui-text-secondary)]" /></span>
        <input value={query} onChange={(event) => onQueryChange(event.target.value)} className="w-full bg-transparent text-sm text-[color:var(--ui-text-primary)] placeholder:text-[color:var(--ui-text-tertiary)] outline-none" placeholder={t('security.sensor.search')} />
      </label>
    </div>
  );
}

function SecuritySensorList({ sensors, query, onQueryChange, isEditMode = false, selectedCount = 0, totalCount = 0, onOpenSelector, onOpenAll }) {
  const { t } = useI18n();
  const hiddenOnMobileCount = Math.max(0, sensors.length - 5);
  return (
    <section className="dashboard-content-surface rounded-[26px] p-4 sm:rounded-[32px] sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            {isEditMode ? (
              <h3 className="inline-flex min-w-0 items-center gap-2 text-xl font-semibold text-[color:var(--ui-text-primary)]">{t('security.sensor.perimeter')} <Lock className="h-4 w-4 shrink-0 text-[color:var(--ui-text-tertiary)]" /></h3>
            ) : (
              <button type="button" onClick={onOpenAll} className="inline-flex min-h-8 min-w-0 items-center gap-1 text-left text-xl font-semibold text-[color:var(--ui-text-primary)] transition-colors hover:text-[color:var(--ui-text-secondary)]">
                {t('security.sensor.perimeter')}
                <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--ui-text-secondary)]" />
              </button>
            )}
          </div>
          <p className="mt-1 truncate text-xs text-[color:var(--ui-text-secondary)]">{t('security.sensor.subtitle')}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <span className="inline-flex shrink-0 rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--ui-text-secondary)]">
            {isEditMode ? `${selectedCount}/${totalCount}` : sensors.length}
          </span>
          {isEditMode ? (
            <button type="button" onClick={onOpenSelector} className="glass-button min-h-11 rounded-full px-3 text-xs font-semibold">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {t('security.select')}
            </button>
          ) : null}
          {!isEditMode && hiddenOnMobileCount > 0 ? (
            <button type="button" onClick={onOpenAll} className="glass-button min-h-11 rounded-full px-3 text-xs font-semibold sm:hidden">
              {t('security.more', { count: hiddenOnMobileCount })}
            </button>
          ) : null}
        </div>
      </div>
      {UI_FLAGS.showSensorSearch ? (
        <div className="mt-4"><SensorSearchField query={query} onQueryChange={onQueryChange} /></div>
      ) : null}
      <div className="mt-4 grid max-h-none grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-2.5 overflow-visible pr-0 sm:max-h-[28rem] sm:overflow-y-auto sm:pr-1 custom-scrollbar">
        <SecuritySensorRows sensors={sensors} limitOnMobile />
      </div>
    </section>
  );
}

function SecuritySensorDirectoryPage({ sensors, query, onQueryChange, onBackToOverview, scrollContainerRef }) {
  const { t } = useI18n();
  return (
    <section className="dashboard-content-surface min-h-full rounded-none border-0 bg-transparent">
      <NestedPageHeader
        title={t('security.sensor.directoryTitle')}
        subtitle={t('security.sensor.directorySubtitle')}
        onBack={onBackToOverview}
        scrollContainerRef={scrollContainerRef}
        trailing={<span className="inline-flex shrink-0 rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--ui-text-secondary)]">{sensors.length}</span>}
      />
      <div className="px-4 py-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:px-8 sm:py-6">
        {UI_FLAGS.showSensorSearch ? <SensorSearchField query={query} onQueryChange={onQueryChange} /> : null}
        <div className="mt-4 grid min-h-0 grid-cols-1 content-start gap-2.5 overflow-y-auto pr-1 custom-scrollbar sm:grid-cols-2">
          <SecuritySensorRows sensors={sensors} />
        </div>
      </div>
    </section>
  );
}

function SecurityCameraSection({
  cameras,
  previewLimit = MAX_CAMERAS_ON_DASHBOARD,
  isDedicatedPage = false,
  isEditMode = false,
  selectedCount = 0,
  totalCount = 0,
  onOpenSelector,
  onOpenAll,
  onOpenCamera,
  onBackToOverview,
  scrollContainerRef,
}) {
  const { t } = useI18n();
  const visibleCameras = isDedicatedPage ? cameras : cameras.slice(0, previewLimit);
  const hiddenCount = Math.max(0, cameras.length - visibleCameras.length);

  return (
    <section
      className={cn(
        'dashboard-content-surface',
        isDedicatedPage ? 'min-h-full rounded-none border-0 bg-transparent' : 'rounded-[26px] p-4 sm:rounded-[32px] sm:p-6',
      )}
    >
      {isDedicatedPage ? (
        <NestedPageHeader
          title={t('security.camera.title')}
          subtitle={t('security.camera.directorySubtitle')}
          onBack={onBackToOverview}
          scrollContainerRef={scrollContainerRef}
          trailing={<span className="inline-flex shrink-0 rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--ui-text-secondary)]">{cameras.length}</span>}
        />
      ) : (
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {isEditMode ? (
            <>
              <h3 className="inline-flex items-center gap-2 text-left text-xl font-semibold text-[color:var(--ui-text-primary)]">
                {t('security.camera.title')}
                <Lock className="h-4 w-4 text-[color:var(--ui-text-tertiary)]" />
              </h3>
              <p className="mt-1 truncate text-xs text-[color:var(--ui-text-secondary)]">{t('security.camera.subtitle')}</p>
            </>
          ) : (
            <button
              type="button"
              onClick={onOpenAll}
              className="inline-flex min-h-8 items-center gap-1 text-left text-xl font-semibold text-[color:var(--ui-text-primary)] transition-colors hover:text-[color:var(--ui-text-secondary)]"
            >
              {t('security.camera.title')}
              <ChevronRight className="h-4 w-4 text-[color:var(--ui-text-secondary)]" />
            </button>
          )}
          {!isEditMode ? <p className="mt-1 truncate text-xs text-[color:var(--ui-text-secondary)]">{t('security.camera.subtitle')}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <span className="inline-flex shrink-0 rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--ui-text-secondary)]">
            {isEditMode ? `${selectedCount}/${totalCount}` : cameras.length}
          </span>
          {isEditMode ? (
            <button
              type="button"
              onClick={onOpenSelector}
              className="glass-button min-h-11 rounded-full px-3 text-xs font-semibold"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {t('security.select')}
            </button>
          ) : null}
          {hiddenCount > 0 ? (
            <button
              type="button"
              onClick={isEditMode ? onOpenSelector : onOpenAll}
              className="glass-button min-h-11 rounded-full px-3 text-xs font-semibold"
            >
              {isEditMode ? t('security.excluded', { count: hiddenCount }) : t('security.more', { count: hiddenCount })}
            </button>
          ) : null}
        </div>
      </div>
      )}

      <div className={cn('pr-0 sm:pr-1 custom-scrollbar', isDedicatedPage ? 'overflow-visible px-4 py-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:px-8 sm:py-6' : 'mt-4 max-h-none overflow-visible sm:max-h-[28rem] sm:overflow-y-auto')}>
        {visibleCameras.length > 0 ? (
          <div
            className={cn(
              'grid grid-cols-2 gap-3',
              isDedicatedPage && 'lg:grid-cols-3 2xl:grid-cols-4',
            )}
          >
            {visibleCameras.map((camera) => (
              <div
                key={camera.entityId}
                className="aspect-video min-w-0 overflow-hidden rounded-[1.35rem]"
              >
                <CameraCardView
                  model={camera.model}
                  layoutVariant="compact"
                  isSelected={false}
                  isEditMode={isEditMode}
                  onOpen={!isEditMode && onOpenCamera ? () => onOpenCamera(camera.entityId) : undefined}
                  preferStream={false}
                  snapshotRefreshIntervalMs={SECURITY_CAMERA_PREVIEW_REFRESH_MS}
                  imageLoading="lazy"
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="dashboard-content-surface-soft rounded-2xl px-4 py-3 text-sm text-[color:var(--ui-text-secondary)]">
            {t('security.camera.empty')}
          </div>
        )}
      </div>
    </section>
  );
}

export function SecurityDashboard({
  isEditMode = false,
  canManageSecurity = false,
  runtimeMode = 'real',
  suppressBrowserNavigation = false,
  navigationRoute = '',
  haConnected = false,
  haStates = {},
  alarmEntityOptions = [],
  alarmSecurityProfiles = [],
  sensorEntityOptions = [],
  cameraEntityOptions = [],
  cameraPtzEntityIds = [],
  deviceAuthUser = null,
  onCallService,
  onCameraPtzMove,
  onCameraPtzStop,
}) {
  const canControlAlarm = useCan('security.control');
  const { t, locale } = useI18n();
  const localizedDemoLogs = useMemo(() => [
    { ...DEMO_SECURITY_LOGS[0], message: t('security.logs.motion') },
    { ...DEMO_SECURITY_LOGS[1], message: t('security.logs.armed') },
  ], [t]);
  const [logs, setLogs] = useState(() => (runtimeMode === 'demo' ? localizedDemoLogs : []));
  const logsRuntimeRef = useRef(runtimeMode);
  const [sensorSearchQuery, setSensorSearchQuery] = useState('');
  const [selectedAlarmEntityId, setSelectedAlarmEntityId] = useState(() => readSecurityCenterAlarm());
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricAvailabilityResolved, setBiometricAvailabilityResolved] = useState(false);
  const [biometricStatus, setBiometricStatus] = useState(() => t('security.config.verifying'));
  const [biometricMessage, setBiometricMessage] = useState('');
  const [isBiometricBusy, setIsBiometricBusy] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [pendingAlarmState, setPendingAlarmState] = useState(null);
  const [authPinInput, setAuthPinInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthBusy, setIsAuthBusy] = useState(false);
  const [authAttemptState, setAuthAttemptState] = useState(INITIAL_AUTH_ATTEMPT_STATE);
  const [pendingCommand, setPendingCommand] = useState(null);
  const [commandFeedback, setCommandFeedback] = useState('');
  const [dangerActionState, setDangerActionState] = useState(null);
  const [armingDelayTotalMs, setArmingDelayTotalMs] = useState(0);
  const [armingDelayEndAtMs, setArmingDelayEndAtMs] = useState(null);
  const [armingDelayNowMs, setArmingDelayNowMs] = useState(() => Date.now());
  const [armingTargetState, setArmingTargetState] = useState(null);
  const [isCameraDirectoryView, setIsCameraDirectoryView] = useState(() => resolveSecurityCamerasFromLocation());
  const [isSensorDirectoryView, setIsSensorDirectoryView] = useState(() => resolveSecuritySensorsFromLocation());

  useEffect(() => {
    if (logsRuntimeRef.current === runtimeMode) return;
    logsRuntimeRef.current = runtimeMode;
    setLogs(runtimeMode === 'demo' ? localizedDemoLogs : []);
  }, [localizedDemoLogs, runtimeMode]);
  useEffect(() => {
    if (runtimeMode !== 'demo') return;
    setLogs((current) => current.map((log) =>
      localizedDemoLogs.find((demoLog) => demoLog.id === log.id) ?? log));
  }, [localizedDemoLogs, runtimeMode]);
  const [visibleSensorEntityIds, setVisibleSensorEntityIds] = useState(() => readStoredEntitySelection(STORAGE_KEYS.visibleSensorEntityIds));
  const [visibleCameraEntityIds, setVisibleCameraEntityIds] = useState(() => readStoredEntitySelection(STORAGE_KEYS.visibleCameraEntityIds));
  const [activeCameraEntityId, setActiveCameraEntityId] = useState(null);
  const [isSensorSelectorOpen, setIsSensorSelectorOpen] = useState(false);
  const [isCameraSelectorOpen, setIsCameraSelectorOpen] = useState(false);
  const [isMobileSecurityEditMode, setIsMobileSecurityEditMode] = useState(false);
  const alarmCommandContextRef = useRef({ available: false, entityId: '' });
  const authSessionActiveRef = useRef(false);
  const securityDirectoryScrollRef = useRef(null);
  const deviceAuth = useDeviceAuth(deviceAuthUser ?? {
    id: selectedAlarmEntityId || 'security_dashboard',
    name: 'security_dashboard',
    displayName: 'Security Dashboard',
  });
  const effectiveSecurityEditMode = canManageSecurity && (isEditMode || isMobileSecurityEditMode);

  const availableAlarmEntities = useMemo(
    () => (alarmEntityOptions.length > 0 ? [...new Set(alarmEntityOptions)] : Object.keys(haStates).filter((id) => id.startsWith('alarm_control_panel.'))).sort((a, b) => a.localeCompare(b, locale)),
    [alarmEntityOptions, haStates, locale],
  );
  const alarmDropdownOptions = useMemo(
    () =>
      availableAlarmEntities.map((entityId) => ({
        id: entityId,
        name: `${haStates[entityId]?.rawAttributes?.friendly_name ?? ''}`.trim() || entityId,
      })),
    [availableAlarmEntities, haStates],
  );

  const availableSensorEntities = useMemo(
    () => (sensorEntityOptions.length > 0 ? [...new Set(sensorEntityOptions)] : Object.keys(haStates).filter((id) => id.startsWith('binary_sensor.'))).sort((a, b) => a.localeCompare(b, locale)),
    [haStates, locale, sensorEntityOptions],
  );

  const availableSecuritySensorEntities = useMemo(() => {
    const securityEntities = availableSensorEntities.filter((entityId) => isSecuritySensorEntity(entityId, haStates[entityId]));
    // Integrations without a device_class must remain usable: if classification
    // finds nothing, expose the binary sensors instead of rendering an empty page.
    return securityEntities.length > 0 ? securityEntities : availableSensorEntities;
  },
    [availableSensorEntities, haStates],
  );

  const availableCameraEntities = useMemo(
    () => [...new Set([
      ...cameraEntityOptions,
      ...Object.keys(haStates).filter((id) => id.startsWith('camera.')),
    ])].filter((id) => id.startsWith('camera.')).sort((a, b) => a.localeCompare(b, locale)),
    [cameraEntityOptions, haStates, locale],
  );

  const selectedSensorEntityIds = useMemo(
    () => {
      if (visibleSensorEntityIds === null) return availableSecuritySensorEntities;
      const availableIds = new Set(availableSecuritySensorEntities);
      return visibleSensorEntityIds.filter((entityId) => availableIds.has(entityId));
    },
    [availableSecuritySensorEntities, visibleSensorEntityIds],
  );

  const selectedCameraEntityIds = useMemo(
    () => {
      if (visibleCameraEntityIds === null) return availableCameraEntities;
      const availableIds = new Set(availableCameraEntities);
      return visibleCameraEntityIds.filter((entityId) => availableIds.has(entityId));
    },
    [availableCameraEntities, visibleCameraEntityIds],
  );

  const sensors = useMemo(
    () => selectedSensorEntityIds.map((entityId) => ({
      entityId,
      name: resolveSensorFriendlyName(entityId, haStates[entityId]),
      type: resolveSensorType(entityId, haStates[entityId]),
      isOpen: isBinarySensorOpen(haStates[entityId]?.state),
    })),
    [selectedSensorEntityIds, haStates],
  );

  const filteredSensors = useMemo(() => {
    const q = sensorSearchQuery.trim().toLowerCase();
    if (!q) return sensors;
    return sensors.filter((s) => `${s.name}`.toLowerCase().includes(q) || `${s.entityId}`.toLowerCase().includes(q));
  }, [sensorSearchQuery, sensors]);

  const cameras = useMemo(
    () =>
      selectedCameraEntityIds.map((entityId) => {
        const liveEntity = haStates[entityId];
        const name = resolveCameraFriendlyName(entityId, liveEntity);
        const model = buildCameraCardModel({
          id: `security-camera-${entityId}`,
          kind: 'camera',
          title: name,
          entityId,
          status: liveEntity ? `${liveEntity.state ?? ''}` : 'unavailable',
        }, liveEntity);
        return {
          entityId,
          model,
          viewerItem: {
            entityId,
            name: model.title,
            statusLabel: model.statusLabel,
            subtitle: model.subtitle,
            streamUrl: model.streamUrl,
            snapshotUrl: model.imageUrl,
            isOffline: !model.isAvailable,
            supportsPtz: cameraPtzEntityIds.includes(entityId),
          },
        };
      }),
    [cameraPtzEntityIds, selectedCameraEntityIds, haStates],
  );
  const activeCamera = useMemo(
    () => cameras.find((camera) => camera.entityId === activeCameraEntityId) ?? null,
    [activeCameraEntityId, cameras],
  );

  const sensorSelectionOptions = useMemo(
    () =>
      availableSecuritySensorEntities.map((entityId) => ({
        entityId,
        name: resolveSensorFriendlyName(entityId, haStates[entityId]),
      })),
    [availableSecuritySensorEntities, haStates],
  );

  const cameraSelectionOptions = useMemo(
    () =>
      availableCameraEntities.map((entityId) => ({
        entityId,
        name: resolveCameraFriendlyName(entityId, haStates[entityId]),
      })),
    [availableCameraEntities, haStates],
  );

  const activeAlarmEntity = selectedAlarmEntityId ? haStates[selectedAlarmEntityId] : undefined;
  const activeAlarmAttributes = activeAlarmEntity?.rawAttributes;
  const activeAlarmSecurityProfile = alarmSecurityProfiles.find(
    (profile) => profile?.entityId === selectedAlarmEntityId,
  ) ?? null;
  const storedAlarmCode = `${activeAlarmSecurityProfile?.unlockCode ?? ''}`.trim();
  const localExtraCode = `${activeAlarmSecurityProfile?.localExtraCode ?? ''}`.trim();
  const requireDeviceConfirmation = activeAlarmSecurityProfile?.requireDeviceConfirmation === true;
  const alarmCodeFormat = resolveAlarmCodeFormat(activeAlarmAttributes);
  const alarmCodeArmRequired = activeAlarmAttributes?.code_arm_required === true;
  const alarmHasCodeCapability = Boolean(alarmCodeFormat) || alarmCodeArmRequired;
  const alarmCodeTypeLabel = alarmCodeFormat === 'text' ? t('security.auth.code') : t('security.auth.pin');
  const isAlarmCodeNumeric = alarmCodeFormat === 'number';
  const normalizedLiveAlarmState = normalizeAlarmState(activeAlarmEntity?.state ?? activeAlarmEntity?.stateLabel);
  const supportedAlarmFeatures = resolveAlarmSupportedFeatures(activeAlarmEntity);
  const hasSupportedFeatureMask = typeof supportedAlarmFeatures === 'number' && Number.isFinite(supportedAlarmFeatures);
  const supportedAlarmModes = useMemo(
    () =>
      hasSupportedFeatureMask
        ? ALARM_MODE_OPTIONS.filter((option) => alarmSupportsFeature(supportedAlarmFeatures, option.feature))
        : ALARM_MODE_OPTIONS.filter((option) => ['armed_home', 'armed_away', 'armed_night'].includes(option.value)),
    [hasSupportedFeatureMask, supportedAlarmFeatures],
  );
  const localizedSupportedAlarmModes = useMemo(
    () => supportedAlarmModes.map((option) => ({
      ...option,
      label: t(ALARM_MODE_TRANSLATION_KEYS[option.value]),
    })),
    [supportedAlarmModes, t],
  );
  const alarmOptions = useMemo(
    () => [{ value: 'disarmed', label: t('security.mode.disarm'), icon: ShieldOff }, ...localizedSupportedAlarmModes],
    [localizedSupportedAlarmModes, t],
  );
  const triggerSupported = hasSupportedFeatureMask && alarmSupportsFeature(supportedAlarmFeatures, ALARM_FEATURE_TRIGGER);
  const alarmEntityAvailable =
    runtimeMode === 'real' &&
    haConnected &&
    Boolean(activeAlarmEntity) &&
    !['unknown', 'unavailable'].includes(normalizedLiveAlarmState);
  const alarmCommandsAvailable = !effectiveSecurityEditMode && alarmEntityAvailable && typeof onCallService === 'function';
  alarmCommandContextRef.current = { available: alarmCommandsAvailable, entityId: selectedAlarmEntityId };

  const isLiveAlarmTransitioning = ['pending', 'arming', 'disarming'].includes(normalizedLiveAlarmState);
  const baseResolvedShieldState = haConnected && activeAlarmEntity
    ? mapAlarmStateForShield(normalizedLiveAlarmState, 'unavailable')
    : 'unavailable';

  const remainingDelayMs = armingDelayEndAtMs ? Math.max(0, armingDelayEndAtMs - armingDelayNowMs) : 0;
  const hasActiveArmingDelay = armingDelayTotalMs > 0 && remainingDelayMs > 0;
  const delayProgress = hasActiveArmingDelay ? Math.min(1, Math.max(0, 1 - remainingDelayMs / armingDelayTotalMs)) : 0;
  const delayRemainingSeconds = hasActiveArmingDelay ? Math.max(0, Math.ceil(remainingDelayMs / 1000)) : 0;
  const resolvedShieldState = hasActiveArmingDelay && baseResolvedShieldState !== 'pending' ? 'pending' : baseResolvedShieldState;
  // The Dynamic background takes the colour of the alarm state, soberly.
  useAmbient(resolveAlarmAmbient(resolvedShieldState));

  const alarmStateLabel = React.useCallback((state) => {
    const normalizedState = normalizeAlarmState(state);
    const key = ALARM_STATE_TRANSLATION_KEYS[normalizedState];
    return key ? t(key) : `${state ?? ''}`.trim() || t('security.state.unknown');
  }, [t]);
  const currentVisualSource = ALARM_VISUALS[resolvedShieldState] ?? ALARM_VISUALS.unavailable;
  const currentVisualKeys = ALARM_VISUAL_TRANSLATION_KEYS[resolvedShieldState] ?? ALARM_VISUAL_TRANSLATION_KEYS.unavailable;
  const currentVisual = {
    ...currentVisualSource,
    badge: t(currentVisualKeys.badge),
    helper: t(currentVisualKeys.helper),
  };
  const alarmStatusLabel = hasActiveArmingDelay
    ? t('security.status.arming')
    : haConnected && activeAlarmEntity
      ? alarmStateLabel(normalizedLiveAlarmState)
      : currentVisual.badge;
  const isAlarmTransitioning = (haConnected && activeAlarmEntity && isLiveAlarmTransitioning) || resolvedShieldState === 'pending' || hasActiveArmingDelay || Boolean(pendingCommand);

  const pendingStateRequiresCode = pendingAlarmState ? isAlarmCodeRequiredForState(pendingAlarmState, activeAlarmAttributes) : false;
  const pendingSecurityRequirement = pendingAlarmState
    ? resolveAlarmSecurityRequirement({
        action: resolveAlarmActionKind(pendingAlarmState),
        codeArmRequired: alarmCodeArmRequired,
        codeFormat: alarmCodeFormat,
        storedHaPinConfigured: storedAlarmCode.length > 0,
        localExtraPinConfigured: localExtraCode.length > 0,
        deviceAuthEnabled: requireDeviceConfirmation,
      })
    : null;
  const pendingAuthRequiresCode = pendingSecurityRequirement?.needsCodeInput ?? pendingStateRequiresCode;
  const pendingPrefersDeviceAuth = Boolean(
    pendingSecurityRequirement?.allowsDeviceAuth && biometricAvailable && deviceAuth.isEnrolled,
  );
  const authRateLimitStatus = getAuthRateLimitStatus(authAttemptState);
  const localizedRateLimitMessage = React.useCallback((status) => {
    if (!status.isLocked) return '';
    const totalSeconds = Math.max(1, Math.ceil(status.remainingMs / 1000));
    return totalSeconds < 60
      ? t('security.auth.tooManySeconds', { seconds: totalSeconds })
      : t('security.auth.tooManyMinutes', { minutes: Math.ceil(totalSeconds / 60) });
  }, [t]);
  const authRateLimitMessage = localizedRateLimitMessage(authRateLimitStatus);

  const appendLog = (message, type = 'info') => {
    setLogs((curr) => [{ id: Date.now() + Math.round(Math.random() * 1000), time: toClockTime(new Date(), locale), message, type }, ...curr].slice(0, 10));
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(LEGACY_SECURITY_ALARM_PIN_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const run = async () => {
      const available = await deviceAuth.isBiometricAvailable();
      setBiometricAvailable(Boolean(available));
      setBiometricStatus(
        available
          ? deviceAuth.isEnrolled
            ? t('security.auth.passkeyConfigured')
            : t('security.auth.passkeyAvailable')
          : t('security.auth.passkeyUnavailable'),
      );
      setBiometricAvailabilityResolved(true);
    };
    void run();
  }, [deviceAuth, t]);

  useEffect(() => {
    if (typeof window === 'undefined' || suppressBrowserNavigation) return undefined;
    const syncFromLocation = () => {
      setIsCameraDirectoryView(resolveSecurityCamerasFromLocation());
      setIsSensorDirectoryView(resolveSecuritySensorsFromLocation());
    };
    syncFromLocation();
    window.addEventListener('popstate', syncFromLocation);
    window.addEventListener('hashchange', syncFromLocation);
    return () => {
      window.removeEventListener('popstate', syncFromLocation);
      window.removeEventListener('hashchange', syncFromLocation);
    };
  }, [suppressBrowserNavigation]);

  useEffect(() => {
    if (!suppressBrowserNavigation || !navigationRoute) return;
    setIsCameraDirectoryView(isSecurityCamerasNavigationTarget(navigationRoute));
    setIsSensorDirectoryView(isSecuritySensorsNavigationTarget(navigationRoute));
  }, [navigationRoute, suppressBrowserNavigation]);

  useEffect(() => {
    if (availableAlarmEntities.length > 0) {
      setSelectedAlarmEntityId((curr) => (curr && availableAlarmEntities.includes(curr) ? curr : availableAlarmEntities[0]));
    }
  }, [availableAlarmEntities]);

  useEffect(() => {
    if (!effectiveSecurityEditMode) {
      setIsSensorSelectorOpen(false);
      setIsCameraSelectorOpen(false);
    }
  }, [effectiveSecurityEditMode]);

  useEffect(() => {
    if (canManageSecurity) return;
    setIsMobileSecurityEditMode(false);
    setIsSensorSelectorOpen(false);
    setIsCameraSelectorOpen(false);
  }, [canManageSecurity]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      writeSecurityCenterAlarm(selectedAlarmEntityId || null);
    }
  }, [selectedAlarmEntityId]);

  useEffect(() => {
    if (typeof window !== 'undefined' && visibleSensorEntityIds !== null) {
      writeStoredEntitySelection(STORAGE_KEYS.visibleSensorEntityIds, visibleSensorEntityIds);
    }
  }, [visibleSensorEntityIds]);

  useEffect(() => {
    if (typeof window !== 'undefined' && visibleCameraEntityIds !== null) {
      writeStoredEntitySelection(STORAGE_KEYS.visibleCameraEntityIds, visibleCameraEntityIds);
    }
  }, [visibleCameraEntityIds]);

  useEffect(() => {
    if (!armingDelayEndAtMs || typeof window === 'undefined') return undefined;
    setArmingDelayNowMs(Date.now());
    const id = window.setInterval(() => setArmingDelayNowMs(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [armingDelayEndAtMs]);

  useEffect(() => {
    if (!armingDelayEndAtMs || remainingDelayMs > 0) return;
    setArmingDelayEndAtMs(null);
    setArmingDelayTotalMs(0);
    setArmingDelayNowMs(Date.now());
    setArmingTargetState(null);
  }, [armingDelayEndAtMs, remainingDelayMs, haConnected, armingTargetState]);

  useEffect(() => {
    if (!haConnected || !activeAlarmEntity || !['pending', 'arming'].includes(normalizedLiveAlarmState) || armingDelayEndAtMs) return;
    const secs = resolveAlarmExitDelaySeconds(activeAlarmEntity.rawAttributes);
    if (!secs) return;
    const now = Date.now();
    const totalMs = Math.max(1000, secs * 1000);
    setArmingDelayTotalMs(totalMs);
    setArmingDelayEndAtMs(now + totalMs);
    setArmingDelayNowMs(now);
  }, [haConnected, activeAlarmEntity, normalizedLiveAlarmState, armingDelayEndAtMs]);

  useEffect(() => {
    if (!haConnected || !activeAlarmEntity || isLiveAlarmTransitioning || (!armingDelayEndAtMs && !armingDelayTotalMs)) return;
    if (armingTargetState && mapAlarmStateForShield(normalizedLiveAlarmState, 'unavailable') !== armingTargetState) return;
    setArmingDelayEndAtMs(null);
    setArmingDelayTotalMs(0);
    setArmingDelayNowMs(Date.now());
    setArmingTargetState(null);
  }, [haConnected, activeAlarmEntity, isLiveAlarmTransitioning, armingDelayEndAtMs, armingDelayTotalMs, armingTargetState, normalizedLiveAlarmState]);

  useEffect(() => {
    if (!pendingCommand) return undefined;
    if (normalizedLiveAlarmState === pendingCommand.targetState) {
      setPendingCommand(null);
      const stateLabel = alarmStateLabel(pendingCommand.targetState);
      setCommandFeedback(t('security.feedback.confirmed', { state: stateLabel }));
      setLogs((curr) => [
        {
          id: Date.now() + Math.round(Math.random() * 1000),
          time: toClockTime(new Date(), locale),
          message: t('security.feedback.confirmedLog', { state: stateLabel }),
          type: 'success',
        },
        ...curr,
      ].slice(0, 10));
      return undefined;
    }
    if (['pending', 'arming', 'disarming'].includes(normalizedLiveAlarmState)) {
      setPendingCommand(null);
      setCommandFeedback(t('security.feedback.transition'));
      return undefined;
    }

    const remainingMs = Math.max(0, pendingCommand.expiresAt - Date.now());
    const timeoutId = window.setTimeout(() => {
      setPendingCommand(null);
      setCommandFeedback(t('security.feedback.unconfirmed'));
      setLogs((curr) => [
        {
          id: Date.now() + Math.round(Math.random() * 1000),
          time: toClockTime(new Date(), locale),
          message: t('security.feedback.unconfirmedLog'),
          type: 'warning',
        },
        ...curr,
      ].slice(0, 10));
    }, remainingMs);
    return () => window.clearTimeout(timeoutId);
  }, [alarmStateLabel, locale, normalizedLiveAlarmState, pendingCommand, t]);

  useEffect(() => {
    if (alarmEntityAvailable) {
      setCommandFeedback((current) => current === t('security.feedback.controlsUnavailable') ? '' : current);
      return;
    }
    authSessionActiveRef.current = false;
    setPendingCommand(null);
    setDangerActionState(null);
    setIsAuthModalOpen(false);
    setPendingAlarmState(null);
    setAuthPinInput('');
    setAuthError('');
    setIsAuthBusy(false);
    if (runtimeMode === 'real') {
      setCommandFeedback(t('security.feedback.controlsUnavailable'));
    }
  }, [alarmEntityAvailable, runtimeMode, t]);

  useEffect(() => {
    const isConfirmedFeedback = commandFeedback === t('security.feedback.transition') ||
      Object.keys(ALARM_STATE_TRANSLATION_KEYS).some((state) =>
        commandFeedback === t('security.feedback.confirmed', { state: alarmStateLabel(state) }));
    if (!isConfirmedFeedback) return undefined;
    const timeoutId = window.setTimeout(() => setCommandFeedback(''), 2800);
    return () => window.clearTimeout(timeoutId);
  }, [alarmStateLabel, commandFeedback, t]);

  const closeAuthModal = () => {
    if (!isAuthBusy) {
      authSessionActiveRef.current = false;
      setIsAuthModalOpen(false);
      setPendingAlarmState(null);
      setAuthPinInput('');
      setAuthError('');
    }
  };
  const applyAlarmState = async (nextState, authCode) => {
    const service = ALARM_SERVICE_BY_STATE[nextState];
    if (!service) return false;

    const commandContext = alarmCommandContextRef.current;
    if (!commandContext.available || commandContext.entityId !== selectedAlarmEntityId) {
      setAuthError(t('security.feedback.commandUnauthorized'));
      setCommandFeedback(t('security.feedback.controlsUnavailable'));
      return false;
    }

    const requiresCode = isAlarmCodeRequiredForState(nextState, activeAlarmAttributes);
    const cleanedCode = sanitizeAlarmCode(authCode, alarmCodeFormat);
    if (requiresCode && !cleanedCode) {
      setAuthError(t('security.feedback.codeRequired', { code: alarmCodeTypeLabel }));
      return false;
    }

    const payload = { entity_id: selectedAlarmEntityId };
    if (requiresCode && cleanedCode) payload.code = cleanedCode;
    const ok = await onCallService('alarm_control_panel', service, payload);
    if (!ok) {
      setAuthError(t('security.feedback.commandUnauthorized'));
      setCommandFeedback(t('security.feedback.commandUnauthorized'));
      appendLog(t('security.feedback.commandFailed'), 'warning');
      appendSecurityAuditEvent({
        tone: 'warning',
        message: t('security.feedback.commandFailed'),
        context: selectedAlarmEntityId || 'Security Dashboard',
      });
      return false;
    }

    const now = Date.now();
    setPendingCommand({ id: `${now}-${nextState}`, targetState: nextState, expiresAt: now + 20000 });
    setCommandFeedback(t('security.feedback.commandSent'));
    if (nextState !== 'disarmed' && nextState !== 'triggered') setArmingTargetState(nextState);
    appendLog(t('security.feedback.commandSentLog', { state: alarmStateLabel(nextState) }), 'info');

    appendSecurityAuditEvent({
      tone: 'success',
      message: t('security.feedback.commandSentLog', { state: alarmStateLabel(nextState) }),
      context: selectedAlarmEntityId || 'Security Dashboard',
    });
    setIsAuthModalOpen(false);
    authSessionActiveRef.current = false;
    setPendingAlarmState(null);
    setAuthPinInput('');
    setAuthError('');
    return true;
  };

  const beginAlarmStateChange = (nextState) => {
    if (!alarmCommandsAvailable) {
      setCommandFeedback(t('security.feedback.controlsUnavailable'));
      return;
    }
    if (isAlarmTransitioning) {
      appendLog(t('security.feedback.changePending'), 'info');
      return;
    }
    if (nextState === resolvedShieldState || isAuthBusy) return;

    const securityRequirement = resolveAlarmSecurityRequirement({
      action: resolveAlarmActionKind(nextState),
      codeArmRequired: alarmCodeArmRequired,
      codeFormat: alarmCodeFormat,
      storedHaPinConfigured: storedAlarmCode.length > 0,
      localExtraPinConfigured: localExtraCode.length > 0,
      deviceAuthEnabled: requireDeviceConfirmation,
    });
    if (securityRequirement.allowsDeviceAuth && !biometricAvailabilityResolved) {
      setCommandFeedback(t('security.feedback.deviceCheck'));
      return;
    }
    if (securityRequirement.allowsDeviceAuth && (!biometricAvailable || !deviceAuth.isEnrolled) && !securityRequirement.needsCodeInput) {
      appendLog(t('security.feedback.noFallback'), 'warning');
      setCommandFeedback(t('security.feedback.configurePasskey'));
      return;
    }

    if (!securityRequirement.needsCodeInput && !securityRequirement.allowsDeviceAuth) {
      setIsAuthBusy(true);
      void (async () => {
        try {
          await applyAlarmState(nextState);
        } finally {
          setIsAuthBusy(false);
        }
      })();
      return;
    }

    setPendingAlarmState(nextState);
    setAuthPinInput('');
    setAuthError('');
    authSessionActiveRef.current = true;
    setIsAuthModalOpen(true);
  };

  const requestAlarmStateChange = (nextState) => {
    if (nextState === 'triggered') {
      setDangerActionState(nextState);
      return;
    }
    beginAlarmStateChange(nextState);
  };

  const confirmPendingDeviceAuth = async () => {
    if (!pendingAlarmState || !pendingSecurityRequirement?.allowsDeviceAuth) return false;
    const authEntityId = selectedAlarmEntityId;
    const verified = await deviceAuth.authenticate(`${t('security.title')} ${alarmStateLabel(pendingAlarmState)}`);
    if (!authSessionActiveRef.current || alarmCommandContextRef.current.entityId !== authEntityId) return false;
    if (!verified) {
      appendSecurityAuditEvent({
        tone: 'warning',
        message: t('security.auth.deviceCancelled'),
        context: selectedAlarmEntityId || 'Security Dashboard',
      });
      return false;
    }
    if (pendingSecurityRequirement.needsCodeInput && !storedAlarmCode) return false;

    setIsAuthBusy(true);
    try {
      appendSecurityAuditEvent({
        tone: 'success',
        message: t('security.auth.deviceCompleted'),
        context: selectedAlarmEntityId || 'Security Dashboard',
      });
      return await applyAlarmState(
        pendingAlarmState,
        pendingSecurityRequirement.needsHaCode ? storedAlarmCode : undefined,
      );
    } finally {
      setIsAuthBusy(false);
    }
  };

  const verifyWithPin = async () => {
    if (!pendingAlarmState) return;

    if (pendingAuthRequiresCode) {
      const rateLimitStatus = getAuthRateLimitStatus(authAttemptState);
      if (rateLimitStatus.isLocked) {
        setAuthError(localizedRateLimitMessage(rateLimitStatus));
        appendSecurityAuditEvent({
          tone: 'warning',
          message: localizedRateLimitMessage(rateLimitStatus),
          context: selectedAlarmEntityId || 'Security Dashboard',
        });
        return;
      }
      const cleanedInput = sanitizeAlarmCode(authPinInput, alarmCodeFormat);
      if (cleanedInput.length === 0) {
        setAuthError(t('security.feedback.enterCode', { code: alarmCodeTypeLabel.toLowerCase() }));
        return;
      }
      const manualSubmission = resolveAlarmManualCodeSubmission({
        inputCode: cleanedInput,
        localExtraCode,
        storedHaCode: storedAlarmCode,
        requiresCode: pendingAuthRequiresCode,
      });
      if (!manualSubmission.ok) {
        const nextAttemptState = recordAuthFailure(authAttemptState);
        const nextRateLimitStatus = getAuthRateLimitStatus(nextAttemptState);
        setAuthAttemptState(nextAttemptState);
        setAuthError(
          nextRateLimitStatus.isLocked
            ? localizedRateLimitMessage(nextRateLimitStatus)
            : t('security.feedback.commandUnauthorized'),
        );
        appendLog(t('security.feedback.confirmationFailed'), 'warning');
        appendSecurityAuditEvent({
          tone: 'warning',
          message: t('security.feedback.confirmationFailed'),
          context: selectedAlarmEntityId || 'Security Dashboard',
        });
        return;
      }
      setAuthAttemptState(recordAuthSuccess());
      appendSecurityAuditEvent({
        tone: 'success',
        message: t('security.auth.deviceCompleted'),
        context: selectedAlarmEntityId || 'Security Dashboard',
      });
      setIsAuthBusy(true);
      try {
        const didApply = await applyAlarmState(
          pendingAlarmState,
          pendingStateRequiresCode && manualSubmission.ok ? manualSubmission.haCode : undefined,
        );
        if (!didApply) {
          const nextAttemptState = recordAuthFailure(authAttemptState);
          setAuthAttemptState(nextAttemptState);
          setAuthError(
            getAuthRateLimitStatus(nextAttemptState).isLocked
              ? localizedRateLimitMessage(getAuthRateLimitStatus(nextAttemptState))
              : t('security.feedback.commandUnauthorized'),
          );
        }
      } finally {
        setIsAuthBusy(false);
      }
      return;
    }

    setIsAuthBusy(true);
    try {
      await applyAlarmState(pendingAlarmState);
    } finally {
      setIsAuthBusy(false);
    }
  };

  const enrollBiometric = async () => {
    if (!effectiveSecurityEditMode || !canManageSecurity) return;
    if (!biometricAvailable) {
      setBiometricMessage(t('security.auth.deviceUnavailable'));
      return;
    }

    setIsBiometricBusy(true);
    setBiometricMessage('');
    try {
      const wasEnrolled = deviceAuth.isEnrolled;
      const verified = await deviceAuth.verifyOrEnroll(t('security.config.title'));
      if (!verified) throw new Error('Verifica dispositivo annullata.');
      const successMessage = wasEnrolled ? t('security.auth.deviceCompleted') : t('security.auth.passkeyCreated');
      setBiometricMessage(successMessage);
      appendLog(successMessage, 'success');
      appendSecurityAuditEvent({
        tone: 'success',
        message: successMessage,
        context: selectedAlarmEntityId || 'Security Dashboard',
      });
    } catch {
      setBiometricMessage(t('security.auth.deviceCancelled'));
      appendSecurityAuditEvent({
        tone: 'warning',
        message: t('security.auth.deviceCancelled'),
        context: selectedAlarmEntityId || 'Security Dashboard',
      });
    } finally {
      setIsBiometricBusy(false);
    }
  };

  const pushPinDigit = (digit) => {
    if (!isAlarmCodeNumeric) return;
    if (authPinInput.length >= 8) return;
    setAuthPinInput((curr) => `${curr}${digit}`.slice(0, 8));
  };

  const popPinDigit = () => setAuthPinInput((curr) => curr.slice(0, -1));
  const clearPin = () => setAuthPinInput('');

  const defaultArmTarget = localizedSupportedAlarmModes.find((option) => option.value === 'armed_away')?.value ?? localizedSupportedAlarmModes[0]?.value;
  const primaryShieldActionTarget = resolvedShieldState === 'disarmed' ? defaultArmTarget : 'disarmed';
  const primaryShieldActionLabel = primaryShieldActionTarget === 'disarmed'
    ? t('security.action.disarm')
    : primaryShieldActionTarget
      ? t('security.action.arm', { mode: localizedSupportedAlarmModes.find((option) => option.value === primaryShieldActionTarget)?.label ?? '' })
      : t('security.mode.none');

  const toggleVisibleSensorEntity = (entityId) => {
    if (!effectiveSecurityEditMode || !canManageSecurity) return;
    setVisibleSensorEntityIds((curr) => {
      const base = curr === null ? availableSecuritySensorEntities : curr;
      const exists = base.includes(entityId);
      if (exists) return base.filter((id) => id !== entityId);
      return [...base, entityId];
    });
  };

  const toggleVisibleCameraEntity = (entityId) => {
    if (!effectiveSecurityEditMode || !canManageSecurity) return;
    setVisibleCameraEntityIds((curr) => {
      const base = curr === null ? availableCameraEntities : curr;
      const exists = base.includes(entityId);
      if (exists) return base.filter((id) => id !== entityId);
      return [...base, entityId];
    });
  };

  const selectAllSensors = () => {
    if (effectiveSecurityEditMode && canManageSecurity) setVisibleSensorEntityIds([...availableSecuritySensorEntities]);
  };

  const selectNoSensors = () => {
    if (effectiveSecurityEditMode && canManageSecurity) setVisibleSensorEntityIds([]);
  };
  const selectAllCameras = () => {
    if (effectiveSecurityEditMode && canManageSecurity) setVisibleCameraEntityIds([...availableCameraEntities]);
  };
  const selectNoCameras = () => {
    if (effectiveSecurityEditMode && canManageSecurity) setVisibleCameraEntityIds([]);
  };

  const navigateSecurityPage = (targetPath) => {
    const normalizedTarget = `${targetPath}`.trim();
    if (!normalizedTarget) return;
    if (suppressBrowserNavigation || typeof window === 'undefined') {
      setIsCameraDirectoryView(isSecurityCamerasNavigationTarget(normalizedTarget));
      setIsSensorDirectoryView(isSecuritySensorsNavigationTarget(normalizedTarget));
      return;
    }
    const currentRoute = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (currentRoute !== normalizedTarget) {
      window.history.pushState({}, '', normalizedTarget);
    }
    window.dispatchEvent(new PopStateEvent('popstate'));
    setIsCameraDirectoryView(isSecurityCamerasNavigationTarget(normalizedTarget));
    setIsSensorDirectoryView(isSecuritySensorsNavigationTarget(normalizedTarget));
  };

  const openAllCamerasPage = () => {
    if (effectiveSecurityEditMode) return;
    navigateSecurityPage(SECURITY_CAMERAS_PATH);
  };
  const openAllSensorsPage = () => {
    if (effectiveSecurityEditMode) return;
    navigateSecurityPage(SECURITY_SENSORS_PATH);
  };
  const openSecurityOverviewPage = () => navigateSecurityPage(SECURITY_OVERVIEW_PATH);
  const isSecurityDirectoryView = isCameraDirectoryView || isSensorDirectoryView;
  usePagePushTransition(
    'security',
    isCameraDirectoryView ? 'cameras' : isSensorDirectoryView ? 'sensors' : 'overview',
    securityViewDepth,
  );

  return (
    <div {...{ [PUSH_PAGE_ATTRIBUTE]: 'security' }} ref={isSecurityDirectoryView ? securityDirectoryScrollRef : undefined} className={isSecurityDirectoryView ? 'h-full w-full overflow-y-auto p-0' : 'dashboard-page-scroll'}>
      {!isSecurityDirectoryView ? (
        <header className="dashboard-page-content-wide">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="dashboard-page-title">{t('security.title')}</h1>
              <p className="dashboard-page-subtitle">{t('security.subtitle')}</p>
            </div>
            {canManageSecurity && !isEditMode ? (
              <button
                type="button"
                aria-label={isMobileSecurityEditMode ? t('security.finishEdit') : t('security.edit')}
                aria-pressed={isMobileSecurityEditMode}
                onClick={() => setIsMobileSecurityEditMode((current) => !current)}
                className="liquid-glass-control inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[color:var(--ui-text-primary)] md:hidden"
              >
                {isMobileSecurityEditMode ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
              </button>
            ) : null}
          </div>
        </header>
      ) : null}

      {isCameraDirectoryView ? (
        <div className="h-full">
          <SecurityCameraSection
            cameras={cameras}
            isDedicatedPage
            isEditMode={effectiveSecurityEditMode}
            selectedCount={selectedCameraEntityIds.length}
            totalCount={availableCameraEntities.length}
            onOpenSelector={() => setIsCameraSelectorOpen(true)}
            onBackToOverview={openSecurityOverviewPage}
            onOpenCamera={setActiveCameraEntityId}
            scrollContainerRef={securityDirectoryScrollRef}
          />
        </div>
      ) : isSensorDirectoryView ? (
        <div className="h-full">
          <SecuritySensorDirectoryPage
            sensors={filteredSensors}
            query={sensorSearchQuery}
            onQueryChange={setSensorSearchQuery}
            onBackToOverview={openSecurityOverviewPage}
            scrollContainerRef={securityDirectoryScrollRef}
          />
        </div>
      ) : (
        <div className="dashboard-page-content-wide mt-4 space-y-4 sm:mt-6 sm:space-y-6">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,24rem),1fr))] items-start gap-4 sm:gap-6">
            {!effectiveSecurityEditMode ? (
              <SecurityMainShield
                visual={currentVisual}
                statusLabel={alarmStatusLabel}
                isTransitioning={isAlarmTransitioning}
                showDelayProgress={hasActiveArmingDelay}
                delayProgress={delayProgress}
                delayRemainingSeconds={delayRemainingSeconds}
                onPrimaryAction={() => primaryShieldActionTarget && requestAlarmStateChange(primaryShieldActionTarget)}
                primaryActionLabel={primaryShieldActionLabel}
                activeState={resolvedShieldState}
                onActionChange={requestAlarmStateChange}
                alarmOptions={alarmOptions}
                disabled={!alarmCommandsAvailable || isAlarmTransitioning || !primaryShieldActionTarget}
                commandFeedback={commandFeedback}
                canControl={canControlAlarm}
              />
            ) : (
              <section className="dashboard-content-surface rounded-[26px] p-4 sm:rounded-[32px] sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-light uppercase tracking-[0.28em] text-[color:var(--ui-text-tertiary)]">{t('security.config.eyebrow')}</p>
                    <h2 className="mt-2 text-xl font-semibold text-[color:var(--ui-text-primary)]">{t('security.config.title')}</h2>
                  </div>
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)]"><Settings className="h-4 w-4 text-[color:var(--ui-text-secondary)]" /></span>
                </div>

                <div className="mt-5 space-y-4">
                  <label className="block">
                    <span className="text-xs font-light uppercase tracking-[0.16em] text-[color:var(--ui-text-tertiary)]">{t('security.config.alarmEntity')}</span>
                    <GlassDropdown
                      className="mt-2"
                      options={alarmDropdownOptions}
                      selected={alarmDropdownOptions.find((option) => option.id === selectedAlarmEntityId) ?? null}
                      onChange={(option) => {
                        if (effectiveSecurityEditMode && canManageSecurity) setSelectedAlarmEntityId(option.id);
                      }}
                      placeholder={t('security.config.noAlarmEntity')}
                      disabled={alarmDropdownOptions.length === 0}
                    />
                  </label>

                  <div className="dashboard-content-surface-soft rounded-2xl p-3">
                    <p className="text-sm font-semibold text-[color:var(--ui-text-primary)]">{t('security.config.commands')}</p>
                    <p className="mt-1 text-xs leading-relaxed text-[color:var(--ui-text-secondary)]">
                      {activeAlarmSecurityProfile
                        ? t('security.config.cardManaged')
                        : alarmHasCodeCapability
                          ? t('security.config.codeRequired', { code: alarmCodeTypeLabel.toLowerCase() })
                          : t('security.config.noLocalCode')}
                    </p>
                  </div>

                  <div className="dashboard-content-surface-soft rounded-2xl p-3">
                    <p className="text-sm font-semibold text-[color:var(--ui-text-primary)]">{t('security.config.deviceConfirmation')}</p>
                    <p className="mt-1 text-xs text-[color:var(--ui-text-secondary)]">{biometricStatus}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={enrollBiometric} disabled={isBiometricBusy || !biometricAvailable} className="glass-button min-h-11 rounded-xl px-3 text-xs font-semibold">
                        {isBiometricBusy
                          ? (deviceAuth.isEnrolled ? t('security.config.verifying') : t('security.config.creating'))
                          : deviceAuth.isEnrolled
                            ? t('security.config.verifyDevice')
                            : t('security.config.createPasskey')}
                      </button>
                    </div>
                    {biometricMessage ? <p className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-200/90"><Check className="h-3.5 w-3.5" />{biometricMessage}</p> : null}
                  </div>
                </div>
              </section>
            )}

            <SecurityCameraSection
              cameras={cameras}
              previewLimit={MAX_CAMERAS_ON_DASHBOARD}
              isEditMode={effectiveSecurityEditMode}
              selectedCount={selectedCameraEntityIds.length}
              totalCount={availableCameraEntities.length}
              onOpenSelector={() => setIsCameraSelectorOpen(true)}
              onOpenAll={openAllCamerasPage}
              onOpenCamera={setActiveCameraEntityId}
            />
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,24rem),1fr))] items-start gap-4 sm:gap-6">
            <SecuritySensorList
              sensors={filteredSensors}
              query={sensorSearchQuery}
              onQueryChange={setSensorSearchQuery}
              isEditMode={effectiveSecurityEditMode}
              selectedCount={selectedSensorEntityIds.length}
              totalCount={availableSecuritySensorEntities.length}
              onOpenSelector={() => setIsSensorSelectorOpen(true)}
              onOpenAll={openAllSensorsPage}
            />

            {UI_FLAGS.showEventFeed ? (
              <section className="dashboard-content-surface rounded-[26px] p-4 sm:rounded-[32px] sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-light uppercase tracking-[0.28em] text-[color:var(--ui-text-tertiary)]">{t('security.logs.eyebrow')}</p>
                    <h3 className="mt-2 text-xl font-semibold text-[color:var(--ui-text-primary)]">{t('security.logs.title')}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    {runtimeMode === 'demo' ? (
                      <span className="inline-flex h-8 items-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ui-text-secondary)]">
                        {t('security.logs.demo')}
                      </span>
                    ) : null}
                  {triggerSupported && canControlAlarm ? (
                    <button
                      type="button"
                      onClick={() => requestAlarmStateChange('triggered')}
                      disabled={!alarmCommandsAvailable || isAlarmTransitioning}
                      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[color:color-mix(in_srgb,var(--ui-danger)_48%,transparent)] bg-[color:color-mix(in_srgb,var(--ui-danger)_14%,transparent)] px-3 text-xs font-semibold text-[color:var(--ui-danger)] transition hover:bg-[color:color-mix(in_srgb,var(--ui-danger)_20%,transparent)] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />SOS
                    </button>
                  ) : null}
                  </div>
                </div>
                <ul className="mt-4 space-y-2">
                  {logs.map((log) => (
                    <li key={log.id} className="dashboard-content-surface-soft rounded-2xl px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn('text-xs font-semibold uppercase tracking-[0.14em]', log.type === 'warning' ? 'text-[color:var(--ui-warning)]' : log.type === 'success' ? 'text-[color:var(--ui-success)]' : 'text-[color:var(--ui-info)]')}>
                          {log.message}
                        </p>
                        <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-[color:var(--ui-text-tertiary)]"><Clock3 className="h-3.5 w-3.5" />{log.time}</span>
                      </div>
                    </li>
                  ))}
                  {logs.length === 0 ? (
                    <li className="dashboard-content-surface-soft rounded-2xl px-4 py-5 text-center text-xs text-[color:var(--ui-text-tertiary)]">
                      {t('security.logs.empty')}
                    </li>
                  ) : null}
                </ul>
              </section>
            ) : null}
          </div>
        </div>
      )}

      <SecurityEntityPickerModal
        isOpen={effectiveSecurityEditMode && isSensorSelectorOpen}
        title={t('security.selector.sensorsTitle')}
        description={t('security.selector.sensorsDescription')}
        entities={sensorSelectionOptions}
        selectedEntityIds={selectedSensorEntityIds}
        onToggleEntity={toggleVisibleSensorEntity}
        onSelectAll={selectAllSensors}
        onSelectNone={selectNoSensors}
        onClose={() => setIsSensorSelectorOpen(false)}
      />

      <SecurityEntityPickerModal
        isOpen={effectiveSecurityEditMode && isCameraSelectorOpen}
        title={t('security.selector.camerasTitle')}
        description={t('security.selector.camerasDescription')}
        entities={cameraSelectionOptions}
        selectedEntityIds={selectedCameraEntityIds}
        onToggleEntity={toggleVisibleCameraEntity}
        onSelectAll={selectAllCameras}
        onSelectNone={selectNoCameras}
        onClose={() => setIsCameraSelectorOpen(false)}
      />

      <CameraViewer
        isOpen={Boolean(activeCamera)}
        cameras={cameras.map((camera) => camera.viewerItem)}
        activeEntityId={activeCameraEntityId}
        onActiveEntityChange={setActiveCameraEntityId}
        onClose={() => setActiveCameraEntityId(null)}
        commandsEnabled={!effectiveSecurityEditMode && haConnected}
        onPtzMove={onCameraPtzMove}
        onPtzStop={onCameraPtzStop}
      />

      <SecurityAuthModal
        isOpen={isAuthModalOpen}
        pendingAlarmState={pendingAlarmState}
        pendingStateRequiresCode={pendingAuthRequiresCode}
        title={t('security.auth.commandTitle')}
        description={
          pendingPrefersDeviceAuth
            ? t('security.auth.description')
            : localExtraCode && pendingAuthRequiresCode
              ? t('security.auth.combinedDescription')
              : pendingAuthRequiresCode
                ? t('security.auth.pinDescription')
                : pendingSecurityRequirement?.allowsDeviceAuth
                  ? t('security.auth.description')
                  : t('security.auth.noConfirmation')
        }
        authError={authError || authRateLimitMessage}
        isAuthBusy={isAuthBusy}
        isAlarmCodeNumeric={isAlarmCodeNumeric}
        alarmCodeTypeLabel={localExtraCode ? t('security.auth.combinedLabel') : alarmCodeTypeLabel}
        authPinInput={authPinInput}
        preferDeviceAuth={pendingPrefersDeviceAuth}
        deviceAuthLabel={t('security.auth.deviceLabel')}
        onVerifyWithDevice={pendingPrefersDeviceAuth ? confirmPendingDeviceAuth : undefined}
        onPinInputChange={(value) => setAuthPinInput(sanitizeAlarmCode(value, alarmCodeFormat))}
        onVerifyWithPin={verifyWithPin}
        onPushPinDigit={pushPinDigit}
        onPopPinDigit={popPinDigit}
        onClearPin={clearPin}
        onClose={closeAuthModal}
      />

      <GlassModal
        isOpen={dangerActionState === 'triggered'}
        onClose={() => setDangerActionState(null)}
        title={t('security.sos.title')}
        eyebrow={t('security.sos.eyebrow')}
        description={t('security.sos.description')}
        size="sm"
        dismissible={!isAuthBusy}
        footer={
          <div className="grid w-full grid-cols-2 gap-2">
            <button type="button" onClick={() => setDangerActionState(null)} className="glass-button min-h-11 rounded-full px-4 text-sm font-semibold">
              {t('security.sos.cancel')}
            </button>
            <button
              type="button"
              onClick={() => {
                const action = dangerActionState;
                setDangerActionState(null);
                if (action) beginAlarmStateChange(action);
              }}
              className="min-h-11 rounded-full border border-[color:color-mix(in_srgb,var(--ui-danger)_52%,transparent)] bg-[color:color-mix(in_srgb,var(--ui-danger)_18%,transparent)] px-4 text-sm font-semibold text-[color:var(--ui-danger)]"
            >
              {t('security.sos.activate')}
            </button>
          </div>
        }
      />
    </div>
  );
}

export default SecurityDashboard;
