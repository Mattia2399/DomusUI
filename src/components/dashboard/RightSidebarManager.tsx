import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3,
  ChevronDown,
  DoorOpen,
  Eye,
  EyeOff,
  HelpCircle,
  Home,
  LayoutGrid,
  Lightbulb,
  MonitorSmartphone,
  Music2,
  Rocket,
  Settings,
  ShieldCheck,
  Thermometer,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { ContextSidebar } from '../settings/ContextSidebar';
import type { MediaPlayRequest } from '../settings/MediaControls';
import { translateClimateStatus } from '../settings/ClimateControls';
import { SensorDisplayVariantSkeleton } from '../settings/SensorDisplayVariantSkeleton';
import { LightDisplayVariantSkeleton } from '../settings/LightDisplayVariantSkeleton';
import { SwitchDisplayVariantSkeleton } from '../settings/SwitchDisplayVariantSkeleton';
import { ClimateDisplayVariantSkeleton } from '../settings/ClimateDisplayVariantSkeleton';
import { AlarmDisplayVariantSkeleton } from '../settings/AlarmDisplayVariantSkeleton';
import { LockDisplayVariantSkeleton } from '../settings/LockDisplayVariantSkeleton';
import { CoverDisplayVariantSkeleton } from '../settings/CoverDisplayVariantSkeleton';
import { MediaDisplayVariantSkeleton } from '../settings/MediaDisplayVariantSkeleton';
import { CameraDisplayVariantSkeleton } from '../settings/CameraDisplayVariantSkeleton';
import { VacuumDisplayVariantSkeleton } from '../settings/VacuumDisplayVariantSkeleton';
import GlassCombobox from '../ui/GlassCombobox';
import GlassDropdown, { type GlassDropdownOption } from '../ui/GlassDropdown';
import GlassToggle from '../ui/GlassToggle';
import GlassSegmentSelect from '../ui/GlassSegmentSelect';
import GlassModal from '../ui/GlassModal';
import { WidgetCardRenderer } from '../widgets/CardRenderer';
import {
  resolveWidgetDisplayVariant,
  type WidgetDisplayMetrics,
  type WidgetDisplayVariant,
} from '../widgets/widgetDisplayVariant';
import {
  ALARM_CARD_CAPABILITY,
  CAMERA_CARD_CAPABILITY,
  CLIMATE_CARD_CAPABILITY,
  COVER_CARD_CAPABILITY,
  getCardCapability,
  LIGHT_CARD_CAPABILITY,
  LOCK_CARD_CAPABILITY,
  MEDIA_CARD_CAPABILITY,
  resolveCardLayoutVariant,
  SENSOR_CARD_CAPABILITY,
  SWITCH_CARD_CAPABILITY,
  VACUUM_CARD_CAPABILITY,
} from '../widgets/cardCapabilityRegistry';
import { MiniRing } from '../widgets/micro/MiniRing';
import { MicroButton } from '../widgets/micro/MicroButton';
import { MicroSuperChart } from '../widgets/micro/MicroSuperChart';
import { MicroStep } from '../widgets/micro/MicroStep';
import { MicroSlider } from '../widgets/micro/MicroSlider';
import { MicroToggle } from '../widgets/micro/MicroToggle';
import { StatusGlow } from '../widgets/micro/StatusGlow';
import { ValuePill } from '../widgets/micro/ValuePill';
import type {
  CameraDeviceInfo,
  CameraHistoryEntry,
  CameraHistoryStatus,
  CameraPtzDirection,
  CameraRelatedEntityActionRequest,
  CameraRelatedEntityInfo,
} from '../settings/CameraControls';
import type { ActiveDevice } from '../settings/types';
import type { VacuumRelatedEntityActionRequest } from '../settings/VacuumControls';
import type { VacuumDeviceInfo, VacuumMappedArea, VacuumRelatedEntityInfo } from '../widgets/vacuumDeviceModel';
import type { MockEntityState, MockEntityStateMap } from '../../types/ha';
import type { DashboardStateShape } from '../../hooks/useDashboardState';
import type {
  DashboardSection,
  SceneActionConfig,
  SceneActionType,
  SceneIconKey,
  SceneKey,
  WeatherSecondaryInfo,
  Widget,
  WidgetKind,
  MicroWidget,
} from '../../types/dashboardModels';
import { FAVORITES_GRID_TITLE, ROOT_CANVAS_COLS } from '../../types/dashboardModels';
import {
  SIDEBAR_PATH_ICON_KEYS,
  type SidebarQuickPath,
  type SidebarQuickPathCustomization,
  type SidebarQuickPathIconKey,
} from '../../hooks/useProfileSettings';
import type { DashboardAppearance } from '../../theme/dashboardTheme';
import { getGreetingDefaults } from '../widgets/GreetingCard';
import { ScenesCard, getSceneIconNode, SCENE_ICON_OPTIONS, SCENES_CATALOG } from '../widgets/ScenesCard';
import { GRID_ENGINE_COLS, GRID_ENGINE_GAP_PX, GRID_ENGINE_ROW_UNIT_PX } from './DashboardGrid';
import { resolveWidgetTypeLayoutSpan } from './dashboardBreakpointConfig';
import type {
  DashboardGridBreakpoint,
  WidgetLayoutOverrides,
  WidgetTypeBreakpointLayoutOverride,
  WidgetTypeLayoutOverrides,
} from '../../types/widgetTypeLayout';
import { MAX_SENSOR_DISPLAY_PRECISION } from '../../utils/sensorValue';
import type { AlarmActionAuthOptions } from '../../utils/alarmSecurityPolicy';
import {
  setWidgetSecrets,
  setWidgetSecretsRemembered,
  useWidgetSecrets,
} from '../../services/widgetSecrets';
import { useDashboardSecurity } from '../../security/dashboardAccess';
import { useSensitiveActionGate } from '../../security/SensitiveActionGate';
import { resolveCardDataSource } from '../../security/mockSourcePolicy';
import { DASHBOARD_SIDEBAR_WIDTH_CLASS } from './DashboardSidebarPlaceholder';
import { useI18n } from '../../i18n/I18nProvider';
import { translateBuilderDetail } from '../../i18n/builderDetailCopy';

const BUILDER_INPUT_CLASS = 'ui-input w-full rounded-xl px-3 py-2.5 text-sm';
const BUILDER_TEXTAREA_CLASS = `${BUILDER_INPUT_CLASS} resize-none`;
const BUILDER_LABEL_CLASS = 'mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--ui-text-secondary)]';
const BUILDER_HELPER_CLASS = 'mt-2 text-[11px] leading-snug text-[color:var(--ui-text-tertiary)]';
const BUILDER_CONTENT_CARD_CLASS = 'dashboard-content-surface rounded-2xl p-3';
const BUILDER_CONTENT_CARD_SOFT_CLASS = 'dashboard-content-surface-soft rounded-2xl p-3';

type ContextSidebarActions = {
  toggleLamp: () => void;
  toggleSwitch: () => void;
  setLampBrightness: (value: number, options?: { transition?: number }) => void;
  setLampColorTemp: (kelvin: number, options?: { transition?: number }) => void;
  setLampHsColor: (hs: [number, number], options?: { transition?: number }) => void;
  setLampWhite: (value: number, options?: { transition?: number }) => void;
  setLampEffect: (effect: string, options?: { transition?: number }) => void;
  flashLamp: (mode: 'short' | 'long') => void;
  toggleClimatePower: () => void;
  decreaseClimateTarget: () => void;
  increaseClimateTarget: () => void;
  autoAdjustClimate: () => void;
  nudgeClimateCurrent: () => void;
  setClimateTargetTemp: (value: number) => void;
  setClimateTargetRange: (low: number, high: number) => void;
  setClimateMode: (mode: string) => void;
  setClimateFanMode: (mode: string) => void;
  setClimateTargetHumidity: (value: number) => void;
  setClimatePresetMode: (mode: string) => void;
  setClimateSwingMode: (mode: string) => void;
  setClimateSwingHorizontalMode: (mode: string) => void;
  toggleSpeakerPlayback: () => void;
  toggleSpeakerPower: () => void;
  previousSpeakerTrack: () => void;
  nextSpeakerTrack: () => void;
  seekSpeakerPosition: (position: number) => void;
  setSpeakerVolume: (value: number) => void;
  toggleSpeakerMute: () => void;
  toggleSpeakerShuffle: () => void;
  cycleSpeakerRepeatMode: () => void;
  stopSpeakerPlayback?: () => void;
  clearSpeakerPlaylist?: () => void;
  selectSpeakerSoundMode?: (soundMode: string) => void;
  playSpeakerMedia?: (request: MediaPlayRequest) => void;
  selectSpeakerOutputDevice: (deviceId: string) => void;
  toggleSpeakerGroupMember: (deviceId: string, shouldJoin: boolean) => void;
  disarmAlarm: (code?: string, options?: AlarmActionAuthOptions) => boolean | void | Promise<boolean | void>;
  armAlarmHome: (code?: string, options?: AlarmActionAuthOptions) => boolean | void | Promise<boolean | void>;
  armAlarmAway: (code?: string, options?: AlarmActionAuthOptions) => boolean | void | Promise<boolean | void>;
  armAlarmNight: (code?: string, options?: AlarmActionAuthOptions) => boolean | void | Promise<boolean | void>;
  armAlarmVacation: (code?: string, options?: AlarmActionAuthOptions) => boolean | void | Promise<boolean | void>;
  armAlarmCustomBypass: (code?: string, options?: AlarmActionAuthOptions) => boolean | void | Promise<boolean | void>;
  triggerAlarm: (code?: string, options?: AlarmActionAuthOptions) => boolean | void | Promise<boolean | void>;
  startVacuum: () => void;
  pauseVacuum: () => void;
  stopVacuum: () => void;
  returnVacuumToBase: () => void;
  locateVacuum: () => void;
  cleanVacuumSpot: () => void;
  cleanVacuumArea: (areaIds: string[]) => void;
  setVacuumFanSpeed: (fanSpeed: string) => void;
  sendVacuumCommand: (command: string, params?: unknown) => void;
  controlVacuumRelatedEntity?: (
    request: VacuumRelatedEntityActionRequest,
  ) => boolean | void | Promise<boolean | void>;
  lockDoor: (code?: string) => void;
  unlockDoor: (code?: string) => boolean | void;
  openDoor: (code?: string) => void;
  openCover: () => void;
  closeCover: () => void;
  stopCover: () => void;
  setCoverPosition: (position: number) => void;
  openCoverTilt: () => void;
  closeCoverTilt: () => void;
  stopCoverTilt: () => void;
  setCoverTiltPosition: (position: number) => void;
  moveCameraPtz: (direction: CameraPtzDirection) => void;
  stopCameraPtz: () => void;
  runCameraRelatedEntityAction?: (
    request: CameraRelatedEntityActionRequest,
  ) => boolean | void | Promise<boolean | void>;
};

const SIDEBAR_PATH_ICON_MAP: Record<SidebarQuickPathIconKey, typeof LayoutGrid> = {
  dashboard: LayoutGrid,
  devices: MonitorSmartphone,
  settings: Settings,
  automation: Rocket,
  security: ShieldCheck,
  help: HelpCircle,
  home: Home,
  rooms: DoorOpen,
  chart: BarChart3,
  light: Lightbulb,
  climate: Thermometer,
  media: Music2,
};

const STACK_SECTION_MIN_COLUMNS = 2;
const WEATHER_UNIT_OPTIONS: GlassDropdownOption[] = [
  { id: 'C', name: '\u00B0C' },
  { id: 'F', name: '\u00B0F' },
];
const WEATHER_LAYOUT_OPTIONS: GlassDropdownOption[] = [
  { id: 'auto', name: 'Auto' },
  { id: 'card', name: 'Card' },
  { id: 'chip', name: 'Chip' },
];
const WEATHER_FORECAST_TYPE_OPTIONS: GlassDropdownOption[] = [
  { id: 'daily', name: 'Giornaliero' },
  { id: 'hourly', name: 'Orario' },
];
const SCENE_ACTION_TYPE_OPTIONS: GlassDropdownOption[] = [
  { id: 'script', name: 'Script' },
  { id: 'service', name: 'Servizio' },
];
const SENSOR_DISPLAY_PRECISION_OPTIONS: GlassDropdownOption[] = [
  { id: 'auto', name: 'Automatico (Home Assistant)' },
  ...Array.from({ length: MAX_SENSOR_DISPLAY_PRECISION + 1 }, (_, precision) => ({
    id: String(precision),
    name: precision === 1 ? '1 decimale' : `${precision} decimali`,
  })),
];

const DEFAULT_ACTIVITY_LOG_HOURS = 24;
const DEFAULT_ACTIVITY_LOG_ENTRIES = 6;
const MIN_ACTIVITY_LOG_HOURS = 1;
const MAX_ACTIVITY_LOG_HOURS = 168;
const MIN_ACTIVITY_LOG_ENTRIES = 1;
const MAX_ACTIVITY_LOG_ENTRIES = 30;
const SCENE_ACTION_SERVICE_SUGGESTIONS = [
  'script.turn_on',
  'scene.turn_on',
  'light.turn_on',
  'light.turn_off',
  'media_player.media_play_pause',
  'vacuum.start',
];
const GRID_LAYOUT_PREVIEW_MAX_ROWS = 6;
const WIDGET_LAYOUT_HEIGHT_SCALE_OPTIONS = [
  { label: '0.5x', h: 1 },
  { label: '1x', h: 2 },
  { label: '1,5x', h: 3 },
  { label: '2x', h: 4 },
  { label: '2,5x', h: 5 },
] as const;
function clampActivityLogHours(value: number) {
  return Math.max(MIN_ACTIVITY_LOG_HOURS, Math.min(MAX_ACTIVITY_LOG_HOURS, Math.round(value)));
}

function clampActivityLogEntries(value: number) {
  return Math.max(MIN_ACTIVITY_LOG_ENTRIES, Math.min(MAX_ACTIVITY_LOG_ENTRIES, Math.round(value)));
}

function findDropdownOption(options: GlassDropdownOption[], id: string | number) {
  return options.find((option) => option.id === String(id)) ?? options[0] ?? null;
}

function isValidSceneServiceId(serviceId: string) {
  const trimmed = serviceId.trim();
  const dotIndex = trimmed.indexOf('.');
  return dotIndex > 0 && dotIndex < trimmed.length - 1;
}

function isValidScenePayloadJson(payloadJson: string | undefined) {
  const trimmed = payloadJson?.trim() ?? '';
  if (!trimmed) {
    return true;
  }
  try {
    const parsed = JSON.parse(trimmed);
    return Boolean(parsed) && typeof parsed === 'object' && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

function clampGridSpan(value: number, max: number) {
  return Math.max(1, Math.min(max, Math.round(value)));
}

const WEATHER_LAYOUT_PREVIEWS: Record<
  'auto' | 'chip' | 'card',
  { title: string; description: string; chips: string[] }
> = {
  auto: {
    title: 'Auto responsive',
    description: 'Passa automaticamente tra chip e card in base allo spazio disponibile.',
    chips: ['Chip 2x2', 'Card 4x4'],
  },
  chip: {
    title: 'Chip fisso 2x2',
    description: 'Formato compatto: temperatura, icona animata e seconda info.',
    chips: ['2 colonne', '2 righe'],
  },
  card: {
    title: 'Card fissa 4x4',
    description: 'Formato esteso: header meteo completo con previsioni sottostanti.',
    chips: ['4 colonne', '4 righe'],
  },
};

type WeatherSecondaryInfoOption = {
  value: WeatherSecondaryInfo;
  label: string;
  description: string;
};

const WEATHER_SECONDARY_INFO_META: Record<WeatherSecondaryInfo, WeatherSecondaryInfoOption> = {
  auto: {
    value: 'auto',
    label: 'Auto',
    description: 'Scelta automatica in base ai dati disponibili.',
  },
  precipitation: {
    value: 'precipitation',
    label: 'Pioggia',
    description: 'Probabilita di precipitazione.',
  },
  wind: {
    value: 'wind',
    label: 'Vento',
    description: 'Velocita del vento.',
  },
  humidity: {
    value: 'humidity',
    label: 'Umidita',
    description: 'Percentuale umidita relativa.',
  },
  pressure: {
    value: 'pressure',
    label: 'Pressione',
    description: 'Pressione atmosferica.',
  },
  visibility: {
    value: 'visibility',
    label: 'Visibilita',
    description: 'Distanza di visibilita.',
  },
  uv_index: {
    value: 'uv_index',
    label: 'Indice UV',
    description: 'Indice UV attuale.',
  },
  cloud_coverage: {
    value: 'cloud_coverage',
    label: 'Nuvolosita',
    description: 'Copertura nuvolosa.',
  },
  dew_point: {
    value: 'dew_point',
    label: 'Dew point',
    description: 'Punto di rugiada.',
  },
  condition: {
    value: 'condition',
    label: 'Condizione',
    description: 'Descrizione meteo sintetica.',
  },
  range: {
    value: 'range',
    label: 'Range H/L',
    description: 'Temperatura minima e massima.',
  },
};

function toFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function hasNumericAttribute(attributes: Record<string, unknown> | undefined, keys: string[]) {
  if (!attributes) {
    return false;
  }
  return keys.some((key) => toFiniteNumber(attributes[key]) !== undefined);
}

function resolveWeatherSecondaryInfoOptions(weather: DashboardStateShape['weather']): WeatherSecondaryInfoOption[] {
  const attrs = weather.rawAttributes;
  const firstForecast = weather.forecast[0];
  const hasPrecipitation =
    hasNumericAttribute(attrs, ['precipitation_probability', 'rain_probability', 'precipitation']) ||
    toFiniteNumber(firstForecast?.precipitationProbability) !== undefined ||
    toFiniteNumber(firstForecast?.precipitationAmount) !== undefined ||
    toFiniteNumber(firstForecast?.precipitation) !== undefined ||
    (toFiniteNumber(weather.precipitation) ?? 0) > 0 ||
    (toFiniteNumber(weather.precipitationAmount) ?? 0) > 0;
  const hasWind =
    hasNumericAttribute(attrs, ['wind_speed', 'native_wind_speed', 'wind_gust_speed']) ||
    toFiniteNumber(firstForecast?.windSpeed) !== undefined ||
    toFiniteNumber(firstForecast?.windGustSpeed) !== undefined ||
    (toFiniteNumber(weather.windSpeed) ?? 0) > 0;
  const hasHumidity =
    hasNumericAttribute(attrs, ['humidity', 'relative_humidity']) ||
    toFiniteNumber(firstForecast?.humidity) !== undefined ||
    toFiniteNumber(weather.humidity) !== undefined;
  const hasPressure =
    hasNumericAttribute(attrs, ['pressure']) ||
    toFiniteNumber(firstForecast?.pressure) !== undefined ||
    toFiniteNumber(weather.pressure) !== undefined;
  const hasVisibility =
    hasNumericAttribute(attrs, ['visibility']) ||
    toFiniteNumber(weather.visibility) !== undefined;
  const hasUv =
    hasNumericAttribute(attrs, ['uv_index']) ||
    toFiniteNumber(firstForecast?.uvIndex) !== undefined ||
    toFiniteNumber(weather.uvIndex) !== undefined;
  const hasCloudCoverage =
    hasNumericAttribute(attrs, ['cloud_coverage']) ||
    toFiniteNumber(firstForecast?.cloudCoverage) !== undefined ||
    toFiniteNumber(weather.cloudCoverage) !== undefined;
  const hasDewPoint =
    hasNumericAttribute(attrs, ['dew_point', 'native_dew_point']) ||
    toFiniteNumber(firstForecast?.dewPoint) !== undefined ||
    toFiniteNumber(weather.dewPoint) !== undefined;

  const options: WeatherSecondaryInfoOption[] = [WEATHER_SECONDARY_INFO_META.auto];
  if (hasPrecipitation) {
    options.push(WEATHER_SECONDARY_INFO_META.precipitation);
  }
  if (hasWind) {
    options.push(WEATHER_SECONDARY_INFO_META.wind);
  }
  if (hasHumidity) {
    options.push(WEATHER_SECONDARY_INFO_META.humidity);
  }
  if (hasPressure) {
    options.push(WEATHER_SECONDARY_INFO_META.pressure);
  }
  if (hasVisibility) {
    options.push(WEATHER_SECONDARY_INFO_META.visibility);
  }
  if (hasUv) {
    options.push(WEATHER_SECONDARY_INFO_META.uv_index);
  }
  if (hasCloudCoverage) {
    options.push(WEATHER_SECONDARY_INFO_META.cloud_coverage);
  }
  if (hasDewPoint) {
    options.push(WEATHER_SECONDARY_INFO_META.dew_point);
  }
  options.push(WEATHER_SECONDARY_INFO_META.condition, WEATHER_SECONDARY_INFO_META.range);
  return options;
}

type RightSidebarManagerProps = {
  isEditMode: boolean;
  commandsEnabled?: boolean;
  isCompactViewport?: boolean;
  theme?: DashboardAppearance;
  activeDevice: ActiveDevice | null;
  onCloseContextSidebar: () => void;
  state: DashboardStateShape;
  camera: {
    name: string;
    status?: string;
    entityId?: string;
    streamUrl?: string;
    snapshotUrl?: string;
    isOffline?: boolean;
    supportsPtz?: boolean;
    deviceInfo?: CameraDeviceInfo;
    relatedEntities?: CameraRelatedEntityInfo[];
    rawAttributes?: Record<string, unknown>;
    historyEntries?: CameraHistoryEntry[];
    historyStatus?: CameraHistoryStatus;
    historyError?: string;
    onRefreshHistory?: () => void;
  };
  alarm: {
    name: string;
    state: string;
    status?: string;
    codeArmRequired?: boolean;
    unlockCode?: string;
    localExtraCode?: string;
    requireAuthToDisarm?: boolean;
    changedBy?: string;
    activityLogLimit?: number;
    activityLogHours?: number;
    activityTimeline?: Array<{
      id: string;
      text: string;
    }>;
    activityTimelineStatus?: 'idle' | 'loading' | 'available' | 'empty' | 'unavailable' | 'offline';
    supportedFeatures?: number;
    rawAttributes?: Record<string, unknown>;
  };
  vacuum: {
    name: string;
    state: string;
    status?: string;
    batteryLevel?: number;
    cleanedArea?: number;
    cleanedAreaUnit?: string;
    cleaningMinutes?: number;
    fanSpeed?: string;
    fanSpeedList?: string[];
    mapUrl?: string;
    supportedFeatures?: number;
    supportsStart?: boolean;
    supportsPause?: boolean;
    supportsStop?: boolean;
    supportsReturnToBase?: boolean;
    supportsLocate?: boolean;
    supportsCleanSpot?: boolean;
    supportsCleanArea?: boolean;
    supportsFanSpeed?: boolean;
    supportsMap?: boolean;
    supportsSendCommand?: boolean;
    deviceInfo?: VacuumDeviceInfo;
    relatedEntities?: VacuumRelatedEntityInfo[];
    rawAttributes?: Record<string, unknown>;
  };
  lock: {
    name: string;
    state: string;
    status?: string;
    changedBy?: string;
    activityLogLimit?: number;
    activityLogHours?: number;
    activityTimeline?: Array<{
      id: string;
      text: string;
    }>;
    activityTimelineStatus?: 'idle' | 'loading' | 'available' | 'empty' | 'unavailable' | 'offline';
    supportedFeatures?: number;
    batteryLevel?: number;
    connection?: {
      state: 'online' | 'offline' | 'unknown';
      label: string;
    };
    rawAttributes?: Record<string, unknown>;
    lockCode?: string;
  };
  cover: {
    name: string;
    state: string;
    status?: string;
    position?: number;
    tiltPosition?: number;
    supportedFeatures?: number;
    supportsOpen?: boolean;
    supportsClose?: boolean;
    supportsStop?: boolean;
    supportsSetPosition?: boolean;
    supportsOpenTilt?: boolean;
    supportsCloseTilt?: boolean;
    supportsSetTiltPosition?: boolean;
    supportsStopTilt?: boolean;
    rawAttributes?: Record<string, unknown>;
  };
  vacuumAreas?: VacuumMappedArea[];
  actions: ContextSidebarActions;
  onAuthorizeAlarmDeviceAuth?: (label: string) => Promise<boolean>;
  onToggleMicroWidget?: (entityId: string, nextActive: boolean) => void;
  onSetMicroSliderValue?: (entityId: string, value: number) => void;
  onNavigateMicroWidgetPage?: (path: string) => void;
  microChartHistoryByEntity?: Record<string, number[]>;
  onUpdateUserName: (name: string) => void;
  selectedWidget: Widget | null;
  selectedWidgetDisplayMetrics?: WidgetDisplayMetrics | null;
  selectedWidgetActiveLayout?: { w: number; h: number } | null;
  selectedSection: DashboardSection | null;
  selectedSidebarPath: SidebarQuickPath | null;
  sidebarPaths?: SidebarQuickPath[];
  weatherConfig: DashboardSection | null;
  activeGridBreakpoint: DashboardGridBreakpoint;
  widgetTypeLayoutOverrides?: WidgetTypeLayoutOverrides;
  widgetLayoutOverrides?: WidgetLayoutOverrides;
  entityOptions: Record<WidgetKind, string[]>;
  haEntityIds?: string[];
  haConnected?: boolean;
  haStates?: MockEntityStateMap;
  onUpdateWidget: (id: string, updater: (widget: Widget) => Widget) => void;
  onUpdateWidgetTypeLayoutOverride: (
    kind: WidgetKind,
    breakpoint: DashboardGridBreakpoint,
    nextOverride: WidgetTypeBreakpointLayoutOverride | null,
  ) => void;
  onUpdateWidgetLayoutOverride: (
    widgetId: string,
    breakpoint: DashboardGridBreakpoint,
    nextOverride: WidgetTypeBreakpointLayoutOverride | null,
  ) => void;
  onUpdateSection: (id: string, updater: (section: DashboardSection) => DashboardSection) => void;
  onUpdateSidebarPath: (id: string, patch: SidebarQuickPathCustomization) => void;
  onRemoveSelectedWidget: () => void;
  onRemoveSection: (id: string) => void;
  onRemoveSidebarPath: (id: string) => void;
};

const MICRO_WIDGET_CATALOG: Array<{
  type: MicroWidget['type'];
  label: string;
  description: string;
}> = [
  {
    type: 'value_pill',
    label: 'Value Pill',
    description: 'Valore principale con label secondaria.',
  },
  {
    type: 'status_glow',
    label: 'Status Glow',
    description: 'Indicatore stato con glow dinamico.',
  },
  {
    type: 'mini_ring',
    label: 'Mini Ring',
    description: 'Ring compatto con progress circolare.',
  },
  {
    type: 'micro_toggle',
    label: 'Micro Toggle',
    description: 'Interruttore mini con stato on/off.',
  },
  {
    type: 'micro_button',
    label: 'Button',
    description: 'Pulsante con azione push, switch o pagina.',
  },
  {
    type: 'micro_slider',
    label: 'Slider',
    description: 'Controllo numerico per entita input_number/number.',
  },
  {
    type: 'micro_step',
    label: 'Step',
    description: 'Controllo orizzontale con incremento/decremento su + e -.',
  },
  {
    type: 'micro_superchart',
    label: 'Superchart',
    description: 'Grafico mini live con scelta tipo line/area/bar.',
  },
];

const MICRO_TOGGLE_COMPATIBLE_DOMAINS = new Set([
  'light',
  'switch',
  'input_boolean',
  'fan',
  'media_player',
  'script',
  'automation',
  'scene',
  'cover',
  'lock',
  'vacuum',
]);
const MINI_RING_COMPATIBLE_DOMAINS = new Set([
  'light',
  'cover',
  'fan',
  'vacuum',
  'media_player',
  'sensor',
  'number',
  'input_number',
  'climate',
]);
const STATUS_GLOW_COMPATIBLE_DOMAINS = new Set([
  'binary_sensor',
  'sensor',
  'switch',
  'light',
  'lock',
  'alarm_control_panel',
  'media_player',
  'person',
  'device_tracker',
  'vacuum',
  'cover',
  'fan',
  'climate',
  'script',
  'automation',
  'scene',
]);
const MICRO_SLIDER_COMPATIBLE_DOMAINS = new Set(['input_number', 'number']);
const MICRO_STEP_COMPATIBLE_DOMAINS = new Set(['input_number', 'number']);
const MICRO_SUPERCHART_COMPATIBLE_DOMAINS = new Set(['sensor', 'number', 'input_number']);
const MICRO_WIDGET_CATALOG_ENTITY_LIMIT = 80;
const MICRO_WIDGET_CATALOG_DOMAIN_LIMIT = 10;

function extractEntityDomain(entityId: string | undefined) {
  const trimmed = (entityId ?? '').trim().toLowerCase();
  if (!trimmed.includes('.')) {
    return '';
  }
  return trimmed.split('.')[0] ?? '';
}

function resolveEntityStateById(haStates: MockEntityStateMap, entityId: string | undefined) {
  const normalizedEntityId = (entityId ?? '').trim();
  if (!normalizedEntityId) {
    return undefined;
  }
  return haStates[normalizedEntityId] ?? haStates[normalizedEntityId.toLowerCase()];
}

function resolveEntityHistoryById(historyMap: Record<string, number[]>, entityId: string | undefined) {
  const normalizedEntityId = (entityId ?? '').trim();
  if (!normalizedEntityId) {
    return undefined;
  }
  return historyMap[normalizedEntityId] ?? historyMap[normalizedEntityId.toLowerCase()];
}

function scoreEntitySearchMatch(entityId: string, query: string) {
  const normalizedEntityId = entityId.trim().toLowerCase();
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return 0;
  }
  if (normalizedEntityId === normalizedQuery) {
    return 1000;
  }
  if (normalizedEntityId.startsWith(normalizedQuery)) {
    return 900 - normalizedEntityId.length * 0.01;
  }
  const [domain = '', objectId = ''] = normalizedEntityId.split('.', 2);
  if (objectId === normalizedQuery) {
    return 850;
  }
  if (objectId.startsWith(normalizedQuery)) {
    return 800 - objectId.length * 0.01;
  }
  const dottedQueryIndex = normalizedEntityId.indexOf(`.${normalizedQuery}`);
  if (dottedQueryIndex >= 0) {
    return 650 - dottedQueryIndex * 0.01;
  }
  const includesIndex = normalizedEntityId.indexOf(normalizedQuery);
  if (includesIndex >= 0) {
    return 500 - includesIndex * 0.01;
  }
  if (domain.startsWith(normalizedQuery)) {
    return 250 - domain.length * 0.01;
  }
  return Number.NEGATIVE_INFINITY;
}

function formatEntityDomainLabel(domain: string) {
  return domain.replaceAll('_', ' ');
}

function isMicroWidgetTypeCompatible(type: MicroWidget['type'], entityId: string | undefined) {
  const domain = extractEntityDomain(entityId);
  if (!domain) {
    return true;
  }
  if (type === 'value_pill' || type === 'micro_button') {
    return true;
  }
  if (type === 'micro_slider') {
    return MICRO_SLIDER_COMPATIBLE_DOMAINS.has(domain);
  }
  if (type === 'micro_step') {
    return MICRO_STEP_COMPATIBLE_DOMAINS.has(domain);
  }
  if (type === 'micro_superchart') {
    return MICRO_SUPERCHART_COMPATIBLE_DOMAINS.has(domain);
  }
  if (type === 'status_glow') {
    return STATUS_GLOW_COMPATIBLE_DOMAINS.has(domain);
  }
  if (type === 'mini_ring') {
    return MINI_RING_COMPATIBLE_DOMAINS.has(domain);
  }
  return MICRO_TOGGLE_COMPATIBLE_DOMAINS.has(domain);
}

function buildFallbackMicroWidgetState(type: MicroWidget['type'], label: string): MockEntityState {
  if (type === 'value_pill') {
    return {
      state: 'on',
      stateLabel: 'Attivo',
      numericValue: 24,
      unit: 'C',
      rawAttributes: { friendly_name: label },
    };
  }
  if (type === 'status_glow') {
    return {
      state: 'on',
      stateLabel: 'Connesso',
      rawAttributes: { friendly_name: label },
    };
  }
  if (type === 'mini_ring') {
    return {
      state: 'on',
      numericValue: 72,
      unit: '%',
      rawAttributes: { friendly_name: label },
    };
  }
  if (type === 'micro_button') {
    return {
      state: 'off',
      stateLabel: 'Switch',
      toggleOn: false,
      rawAttributes: { friendly_name: label },
    };
  }
  if (type === 'micro_slider') {
    return {
      state: '42',
      numericValue: 42,
      unit: '%',
      rawAttributes: { friendly_name: label, min: 0, max: 100, step: 1, unit_of_measurement: '%' },
    };
  }
  if (type === 'micro_step') {
    return {
      state: '42',
      numericValue: 42,
      unit: '%',
      rawAttributes: { friendly_name: label, min: 0, max: 100, step: 1, unit_of_measurement: '%' },
    };
  }
  if (type === 'micro_superchart') {
    return {
      state: '31',
      numericValue: 31,
      unit: '',
      rawAttributes: { friendly_name: label, unit_of_measurement: '' },
    };
  }
  return {
    state: 'on',
    stateLabel: 'Acceso',
    toggleOn: true,
    rawAttributes: { friendly_name: label },
  };
}

function renderMicroWidgetPreview(widget: MicroWidget, state: MockEntityState | undefined, history?: number[]) {
  if (widget.type === 'value_pill') {
    return <ValuePill widget={widget} state={state} />;
  }
  if (widget.type === 'status_glow') {
    return <StatusGlow widget={widget} state={state} />;
  }
  if (widget.type === 'mini_ring') {
    return <MiniRing widget={widget} state={state} />;
  }
  if (widget.type === 'micro_button') {
    return <MicroButton widget={widget} state={state} />;
  }
  if (widget.type === 'micro_slider') {
    return <MicroSlider widget={widget} state={state} sendOnRelease={widget.sliderSendOnRelease ?? true} />;
  }
  if (widget.type === 'micro_step') {
    return <MicroStep widget={widget} state={state} />;
  }
  if (widget.type === 'micro_superchart') {
    return <MicroSuperChart widget={widget} state={state} history={history} />;
  }
  return <MicroToggle widget={widget} state={state} />;
}

export function RightSidebarManager({
  isEditMode,
  commandsEnabled = true,
  isCompactViewport = false,
  theme = 'dark',
  activeDevice,
  onCloseContextSidebar,
  state,
  camera,
  alarm,
  vacuum,
  lock,
  cover,
  vacuumAreas = [],
  actions,
  onAuthorizeAlarmDeviceAuth,
  onToggleMicroWidget,
  onSetMicroSliderValue,
  onNavigateMicroWidgetPage,
  microChartHistoryByEntity = {},
  onUpdateUserName,
  selectedWidget,
  selectedWidgetDisplayMetrics = null,
  selectedWidgetActiveLayout = null,
  selectedSection,
  selectedSidebarPath,
  sidebarPaths = [],
  weatherConfig,
  activeGridBreakpoint,
  widgetTypeLayoutOverrides = {},
  widgetLayoutOverrides = {},
  entityOptions,
  haEntityIds = [],
  haConnected = false,
  haStates = {},
  onUpdateWidget,
  onUpdateWidgetTypeLayoutOverride,
  onUpdateWidgetLayoutOverride,
  onUpdateSection,
  onUpdateSidebarPath,
  onRemoveSelectedWidget,
  onRemoveSection,
  onRemoveSidebarPath,
}: RightSidebarManagerProps) {
  const { locale, t } = useI18n();
  const bt = (value: string) => translateBuilderDetail(locale, value);
  const sidebarWidthClass = DASHBOARD_SIDEBAR_WIDTH_CLASS;
  const [isContextSheetDragging, setIsContextSheetDragging] = React.useState(false);
  const [contextSheetDragOffset, setContextSheetDragOffset] = React.useState(0);
  const [isContextSecondaryPage, setIsContextSecondaryPage] = React.useState(false);
  const [isMicroWidgetCatalogOpen, setIsMicroWidgetCatalogOpen] = React.useState(false);
  const [microWidgetCatalogEntity, setMicroWidgetCatalogEntity] = React.useState('');
  const [microWidgetCatalogDomainFilter, setMicroWidgetCatalogDomainFilter] = React.useState('all');
  const [selectedMicroWidgetId, setSelectedMicroWidgetId] = React.useState<string | null>(null);
  const [widgetConfigTab, setWidgetConfigTab] = React.useState<'layout' | 'settings' | 'related'>('settings');
  const [layoutApplyScope, setLayoutApplyScope] = React.useState<'widget' | 'type'>('widget');
  const [sectionConfigTab, setSectionConfigTab] = React.useState<'layout' | 'settings'>('settings');
  const [greetingConfigTab, setGreetingConfigTab] = React.useState<'title' | 'weather'>('title');
  const [selectedSceneConfigId, setSelectedSceneConfigId] = React.useState<SceneKey | null>(null);
  const selectedWidgetSecrets = useWidgetSecrets(selectedWidget?.id);
  const dashboardSecurity = useDashboardSecurity();
  const sensitiveGate = useSensitiveActionGate();
  const selectedWidgetMicroWidgets = selectedWidget?.widgets;
  const hasEditSelection = Boolean(selectedWidget || selectedSection || selectedSidebarPath);
  const contextSheetStartYRef = React.useRef<number | null>(null);
  const contextSheetPointerIdRef = React.useRef<number | null>(null);
  const contextSheetDragOffsetRef = React.useRef(0);
  const CONTEXT_SHEET_CLOSE_THRESHOLD_PX = 88;
  const shouldShowCompactContextSheet = !isEditMode && isCompactViewport && Boolean(activeDevice);
  const shouldShowCompactEditSheet = isEditMode && isCompactViewport && hasEditSelection;
  const shouldShowAnyCompactSheet = shouldShowCompactContextSheet || shouldShowCompactEditSheet;

  React.useEffect(() => {
    setWidgetConfigTab('settings');
  }, [selectedWidget?.id]);

  React.useEffect(() => {
    setIsContextSecondaryPage(false);
  }, [activeDevice?.id]);

  React.useEffect(() => {
    setLayoutApplyScope('widget');
  }, [activeGridBreakpoint, selectedWidget?.id]);

  React.useEffect(() => {
    setSectionConfigTab('settings');
    setGreetingConfigTab('title');
    setSelectedSceneConfigId(null);
  }, [selectedSection?.id]);

  const resetContextSheetDrag = React.useCallback(() => {
    setIsContextSheetDragging(false);
    setContextSheetDragOffset(0);
    contextSheetStartYRef.current = null;
    contextSheetPointerIdRef.current = null;
    contextSheetDragOffsetRef.current = 0;
  }, []);

  const handleContextSheetDragStart = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    contextSheetStartYRef.current = event.clientY;
    contextSheetPointerIdRef.current = event.pointerId;
    contextSheetDragOffsetRef.current = 0;
    setContextSheetDragOffset(0);
    setIsContextSheetDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, []);

  const handleContextSheetDragMove = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (contextSheetPointerIdRef.current !== event.pointerId || contextSheetStartYRef.current === null) {
      return;
    }
    const nextOffset = Math.max(0, event.clientY - contextSheetStartYRef.current);
    contextSheetDragOffsetRef.current = nextOffset;
    setContextSheetDragOffset(nextOffset);
  }, []);

  const finishContextSheetDrag = React.useCallback(
    (event?: React.PointerEvent<HTMLDivElement>) => {
      if (event && contextSheetPointerIdRef.current !== event.pointerId) {
        return;
      }
      if (event) {
        try {
          event.currentTarget.releasePointerCapture?.(event.pointerId);
        } catch {
          // no-op: some browsers throw if capture was already released
        }
      }
      const shouldClose = contextSheetDragOffsetRef.current >= CONTEXT_SHEET_CLOSE_THRESHOLD_PX;
      if (shouldClose) {
        onCloseContextSidebar();
      }
      resetContextSheetDrag();
    },
    [onCloseContextSidebar, resetContextSheetDrag],
  );
  React.useEffect(() => {
    if (!shouldShowAnyCompactSheet) {
      resetContextSheetDrag();
    }
  }, [resetContextSheetDrag, shouldShowAnyCompactSheet]);
  React.useEffect(() => {
    setIsMicroWidgetCatalogOpen(false);
  }, [isEditMode, selectedWidget?.id]);
  React.useEffect(() => {
    setMicroWidgetCatalogEntity('');
    setMicroWidgetCatalogDomainFilter('all');
  }, [selectedWidget?.id]);
  React.useEffect(() => {
    setSelectedMicroWidgetId(null);
  }, [selectedWidget?.id]);
  React.useEffect(() => {
    if (!selectedWidgetMicroWidgets || selectedWidgetMicroWidgets.length === 0) {
      setSelectedMicroWidgetId((current) => (current === null ? current : null));
      return;
    }
    setSelectedMicroWidgetId((current) => {
      if (!current) {
        return current;
      }
      return selectedWidgetMicroWidgets.some((entry) => entry.id === current) ? current : null;
    });
  }, [selectedWidgetMicroWidgets]);

  const applyWidgetTypeLayoutSelection = React.useCallback(
    (nextW: number, nextH: number) => {
      if (!selectedWidget) {
        return;
      }
      const layoutCols = Math.max(1, Math.round(GRID_ENGINE_COLS[activeGridBreakpoint] ?? 1));
      const minimumW = selectedWidget.kind === 'cover' && activeGridBreakpoint !== 'xs' && activeGridBreakpoint !== 'sm'
        ? Math.min(layoutCols, 2)
        : 1;
      const safeW = Math.max(minimumW, clampGridSpan(nextW, layoutCols));
      const safeH = clampGridSpan(nextH, GRID_LAYOUT_PREVIEW_MAX_ROWS);
      const lightWidgetOverride = widgetLayoutOverrides[selectedWidget.id]?.[activeGridBreakpoint];
      const lightTypeOverride = widgetTypeLayoutOverrides.light?.[activeGridBreakpoint];
      const lightAutoExpand = lightWidgetOverride?.autoExpand ?? lightTypeOverride?.autoExpand ?? true;
      const nextOverride =
        selectedWidget.kind === 'light'
          ? lightAutoExpand
            ? selectedWidget.isOn
              ? { w: safeW, hOn: safeH, hOff: Math.max(1, safeH - 1), autoExpand: true }
              : { w: safeW, hOff: safeH, hOn: Math.min(GRID_LAYOUT_PREVIEW_MAX_ROWS, safeH + 1), autoExpand: true }
            : { w: safeW, h: safeH, hOn: safeH, hOff: safeH, autoExpand: false }
          : {
              w: safeW,
              h: safeH,
            };

      if (layoutApplyScope === 'widget') {
        onUpdateWidgetLayoutOverride(selectedWidget.id, activeGridBreakpoint, nextOverride);
        return;
      }

      onUpdateWidgetTypeLayoutOverride(selectedWidget.kind, activeGridBreakpoint, nextOverride);
    },
    [
      activeGridBreakpoint,
      layoutApplyScope,
      onUpdateWidgetLayoutOverride,
      onUpdateWidgetTypeLayoutOverride,
      selectedWidget,
      widgetLayoutOverrides,
      widgetTypeLayoutOverrides,
    ],
  );

  const resetWidgetTypeLayoutSelection = React.useCallback(() => {
    if (!selectedWidget) {
      return;
    }
    if (layoutApplyScope === 'widget') {
      onUpdateWidgetLayoutOverride(selectedWidget.id, activeGridBreakpoint, null);
      return;
    }
    onUpdateWidgetTypeLayoutOverride(selectedWidget.kind, activeGridBreakpoint, null);
  }, [
    activeGridBreakpoint,
    layoutApplyScope,
    onUpdateWidgetLayoutOverride,
    onUpdateWidgetTypeLayoutOverride,
    selectedWidget,
  ]);

  const contextDeviceTitle = activeDevice?.name?.trim() || t('builder.device');
  const contextSwitchEntity =
    activeDevice?.type === 'switch'
      ? resolveEntityStateById(haStates, activeDevice.switchEntityId)
      : undefined;
  const contextSwitchState =
    typeof contextSwitchEntity?.toggleOn === 'boolean'
      ? contextSwitchEntity.toggleOn
        ? 'on'
        : 'off'
      : String(contextSwitchEntity?.stateLabel ?? contextSwitchEntity?.state ?? '').trim().toLowerCase();
  const contextDeviceSubtitle =
    activeDevice?.type === 'climate'
      ? translateClimateStatus(
          state.climate.status ?? state.climate.hvacAction ?? state.climate.mode,
          state.climate.mode,
        )
      : activeDevice?.type === 'switch' && contextSwitchState
        ? contextSwitchState === 'on'
          ? t('builder.on')
          : contextSwitchState === 'off'
            ? t('builder.off')
            : contextSwitchState === 'unavailable'
              ? t('builder.unavailable')
              : activeDevice.status ?? t('builder.unknownState')
      : typeof activeDevice?.status === 'string' && activeDevice.status.trim().length > 0
        ? activeDevice.status.trim()
        : t('builder.deviceControls');
  const renderAppleSwitch = ({
    checked,
    onChange,
    disabled = false,
    label,
  }: {
    checked: boolean;
    onChange: (nextChecked: boolean) => void;
    disabled?: boolean;
    label: string;
  }) => (
    <GlassToggle
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      label={label}
    />
  );
  const contextSidebarPanel = (
    <ContextSidebar
      activeDevice={activeDevice}
      isEditMode={isEditMode}
      theme={theme}
      onClose={onCloseContextSidebar}
      showCloseButton={false}
      onSecondaryPageChange={setIsContextSecondaryPage}
      externalScrollContainer
      haStates={haStates}
      microChartHistoryByEntity={microChartHistoryByEntity}
      lamp={state.lamp}
      climate={state.climate}
      camera={camera}
      speaker={state.speaker}
      vacuum={vacuum}
      vacuumAreas={vacuumAreas}
      weather={state.weather}
      alarm={alarm}
      lock={lock}
      cover={cover}
      weatherConfig={
        weatherConfig
          ? {
              unit: weatherConfig.weatherUnit,
              forecastType: weatherConfig.weatherForecastType,
              forecastDays: weatherConfig.weatherForecastDays,
              forecastDensity: weatherConfig.weatherForecastDensity,
              conditionOverride: weatherConfig.weatherCondition,
              showPrecipitation: weatherConfig.weatherShowPrecipitation,
              showWind: weatherConfig.weatherShowWind,
            }
          : undefined
      }
      actions={actions}
      commandsEnabled={commandsEnabled}
      onAuthorizeAlarmDeviceAuth={onAuthorizeAlarmDeviceAuth}
      onToggleMicroWidget={onToggleMicroWidget}
      onSetMicroSliderValue={onSetMicroSliderValue}
      onNavigateMicroWidgetPage={onNavigateMicroWidgetPage}
    />
  );

  if (!isEditMode) {
    if (isCompactViewport) {
      return (
        <AnimatePresence>
          {activeDevice ? (
            <React.Fragment>
              <motion.button
                key="device-context-overlay"
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={onCloseContextSidebar}
                className="fixed inset-0 z-[188] bg-[color:var(--ui-scrim)] backdrop-blur-sm transition-opacity"
                aria-label={t('builder.closeContext')}
              />

              <div className="fixed inset-0 z-[189] pointer-events-none flex items-end">
                <motion.section
                  key="device-context-mobile"
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="w-full"
                >
                  <div
                    className="device-context-surface liquid-glass-sheet pointer-events-auto flex w-full max-h-[92dvh] flex-col overflow-hidden"
                    style={
                      contextSheetDragOffset > 0
                        ? { transform: `translateY(${contextSheetDragOffset}px)`, transitionDuration: '0ms' }
                        : undefined
                    }
                  >
                    <div
                      className={`touch-none ${isContextSheetDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                      onPointerDown={handleContextSheetDragStart}
                      onPointerMove={handleContextSheetDragMove}
                      onPointerUp={finishContextSheetDrag}
                      onPointerCancel={finishContextSheetDrag}
                    >
                      <span className="liquid-glass-drag-handle mx-auto mt-4 mb-2" />
                    </div>

                    <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-3 md:px-5 md:pt-5 md:pb-4">
                      <div className="min-w-0">
                        <h2 className="truncate text-xl font-semibold tracking-tight text-[color:var(--ui-text-primary)]">{contextDeviceTitle}</h2>
                        <p className="mt-1 text-sm text-[color:var(--ui-text-secondary)]">{contextDeviceSubtitle}</p>
                      </div>
                      {!isContextSecondaryPage ? (
                        <button
                          type="button"
                          onClick={onCloseContextSidebar}
                          className="glass-icon-button h-8 w-8"
                          aria-label={t('builder.closeDevice')}
                        >
                          <X size={16} />
                        </button>
                      ) : null}
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain glass-scrollbar [touch-action:pan-y] [-webkit-overflow-scrolling:touch] px-3 pb-[calc(env(safe-area-inset-bottom)+0.9rem)] [&_.context-panel-header]:hidden">
                      {contextSidebarPanel}
                    </div>
                  </div>
                </motion.section>
              </div>
            </React.Fragment>
          ) : null}
        </AnimatePresence>
      );
    }

    return (
      <div className={`liquid-glass-panel ${sidebarWidthClass} overflow-hidden`}>
        <ContextSidebar
          activeDevice={activeDevice}
          isEditMode={isEditMode}
          theme={theme}
          onClose={onCloseContextSidebar}
          showCloseButton={!isContextSecondaryPage}
          onSecondaryPageChange={setIsContextSecondaryPage}
          haStates={haStates}
          microChartHistoryByEntity={microChartHistoryByEntity}
          lamp={state.lamp}
          climate={state.climate}
          camera={camera}
          speaker={state.speaker}
          vacuum={vacuum}
          vacuumAreas={vacuumAreas}
          weather={state.weather}
          alarm={alarm}
          lock={lock}
          cover={cover}
          weatherConfig={
            weatherConfig
              ? {
                  unit: weatherConfig.weatherUnit,
                  forecastType: weatherConfig.weatherForecastType,
                  forecastDays: weatherConfig.weatherForecastDays,
                  forecastDensity: weatherConfig.weatherForecastDensity,
                  conditionOverride: weatherConfig.weatherCondition,
                  showPrecipitation: weatherConfig.weatherShowPrecipitation,
                  showWind: weatherConfig.weatherShowWind,
                }
              : undefined
          }
          actions={actions}
          commandsEnabled={commandsEnabled}
          onAuthorizeAlarmDeviceAuth={onAuthorizeAlarmDeviceAuth}
          onToggleMicroWidget={onToggleMicroWidget}
          onSetMicroSliderValue={onSetMicroSliderValue}
          onNavigateMicroWidgetPage={onNavigateMicroWidgetPage}
        />
      </div>
    );
  }

  const greetingDefaults = selectedSection?.kind === 'greeting' ? getGreetingDefaults(state) : null;
  const titleAuto = selectedSection?.titleAuto ?? true;
  const subtitleAuto = selectedSection?.subtitleAuto ?? true;
  const showWeather = selectedSection?.kind === 'greeting' ? selectedSection.showWeather ?? true : selectedSection?.kind === 'weather';
  const sectionTitleValue = titleAuto ? greetingDefaults?.title ?? '' : selectedSection?.title ?? '';
  const sectionSubtitleValue = subtitleAuto ? greetingDefaults?.subtitle ?? '' : selectedSection?.subtitle ?? '';
  const weatherLayout = selectedSection?.weatherLayout ?? 'auto';
  const weatherUnit = selectedSection?.weatherUnit ?? 'C';
  const weatherEntityId = selectedSection?.weatherEntityId ?? '';
  const weatherForecastType = selectedSection?.weatherForecastType === 'hourly' ? 'hourly' : 'daily';
  const weatherForecastDays = selectedSection?.weatherForecastDays ?? 4;
  const weatherSecondaryInfo = selectedSection?.weatherSecondaryInfo ?? 'auto';
  const weatherSecondaryInfoOptions = resolveWeatherSecondaryInfoOptions(state.weather);
  const localizedWeatherForecastTypeOptions = WEATHER_FORECAST_TYPE_OPTIONS.map((option) => ({ ...option, name: bt(option.name) }));
  const localizedSceneActionTypeOptions = SCENE_ACTION_TYPE_OPTIONS.map((option) => ({ ...option, name: bt(option.name) }));
  const localizedSensorPrecisionOptions = SENSOR_DISPLAY_PRECISION_OPTIONS.map((option) => ({
    ...option,
    name: option.id === 'auto'
      ? bt(option.name)
      : option.id === '1'
        ? bt('1 decimale')
        : `${option.id} ${bt('decimali')}`,
  }));
  const weatherSecondaryDropdownOptions = weatherSecondaryInfoOptions.map((option) => ({
    id: option.value,
    name: bt(option.label),
  }));
  const weatherSecondaryInfoValues = new Set(weatherSecondaryInfoOptions.map((option) => option.value));
  const safeWeatherSecondaryInfo = weatherSecondaryInfoValues.has(weatherSecondaryInfo)
    ? weatherSecondaryInfo
    : 'auto';
  const weatherSelectedInfoMeta = WEATHER_SECONDARY_INFO_META[safeWeatherSecondaryInfo];
  const weatherLayoutPreview = WEATHER_LAYOUT_PREVIEWS[weatherLayout];
  const weatherForecastDayOptions = (weatherForecastType === 'hourly' ? [1, 2, 3, 4, 5, 6, 7, 8] : [1, 2, 3, 4, 5, 6, 7]).map(
    (days) => ({
      id: String(days),
      name: `${days} ${bt(weatherForecastType === 'hourly' ? 'ore' : 'giorni')}`,
    }),
  );
  const isStackGridSection = selectedSection?.kind === 'stack-grid';
  const activeCanvasCols = Math.max(1, Math.round(GRID_ENGINE_COLS[activeGridBreakpoint] ?? 1));
  const stackColumnOptionMax = activeCanvasCols;
  const stackManualColumnOptions = Array.from({ length: stackColumnOptionMax - STACK_SECTION_MIN_COLUMNS + 1 }, (_, index) => {
    const option = STACK_SECTION_MIN_COLUMNS + index;
    return {
      id: String(option),
      name: `${option} ${bt('colonne')}`,
    };
  });
  const stackColumnsAutoMode = isStackGridSection && selectedSection?.stackColumnsMode !== 'manual';
  const stackCanvasColumnOptions = isStackGridSection
    ? [
        {
          id: 'auto',
          name: bt('Auto (da contenuto)'),
        },
        ...stackManualColumnOptions,
      ]
    : stackManualColumnOptions;
  const weatherEntitySuggestions = haConnected
    ? haEntityIds.filter((entityId) => entityId.startsWith('weather.'))
    : [];
  const scenesSelected = selectedSection?.scenes ?? SCENES_CATALOG.slice(0, 4).map((scene) => scene.id);
  const sceneLabels: Partial<Record<SceneKey, string>> = selectedSection?.sceneLabels ?? {};
  const sceneIcons: Partial<Record<SceneKey, SceneIconKey>> = selectedSection?.sceneIcons ?? {};
  const sceneActions: Partial<Record<SceneKey, SceneActionConfig>> = selectedSection?.sceneActions ?? {};
  const sceneScripts: Partial<Record<SceneKey, string>> = selectedSection?.sceneScripts ?? {};
  const sceneScriptSuggestions = haConnected
    ? haEntityIds.filter((entityId) => entityId.startsWith('script.'))
    : [];
  const scenesShowBackground = selectedSection?.scenesShowBackground ?? true;
  const scenesShowBorder = selectedSection?.scenesShowBorder ?? true;
  const stackShowBackground = selectedSection?.stackShowBackground ?? true;
  const stackShowBorder = selectedSection?.stackShowBorder ?? true;
  const stackShowHeader = selectedSection?.stackShowHeader ?? true;
  const stackUseFavoritesGrid = selectedSection?.stackUseFavoritesGrid ?? false;
  const isFavoritesGridTitleLocked = isStackGridSection && stackUseFavoritesGrid;
  const stackCanvasColumns =
    selectedSection?.kind === 'stack-vertical' || !selectedSection
      ? 1
      : Math.max(
          STACK_SECTION_MIN_COLUMNS,
          Math.min(
            stackColumnOptionMax,
            Math.round(selectedSection.stackColumns ?? selectedSection.layout.w),
          ),
        );
  const stackCanvasColumnSelectionId =
    selectedSection?.kind === 'stack-vertical' || !selectedSection
      ? '1'
      : stackColumnsAutoMode
        ? 'auto'
        : String(stackCanvasColumns);
  const layoutEditorCols = activeCanvasCols;
  const selectedWidgetTypeLayoutSpan = selectedWidget
    ? resolveWidgetTypeLayoutSpan(selectedWidget.kind, activeGridBreakpoint, widgetTypeLayoutOverrides)
    : null;
  const selectedWidgetTypeStateLayoutSpan = selectedWidgetTypeLayoutSpan && selectedWidget?.kind === 'light'
    ? {
        ...selectedWidgetTypeLayoutSpan,
        h: selectedWidget.isOn
          ? selectedWidgetTypeLayoutSpan.hOn ?? selectedWidgetTypeLayoutSpan.h
          : selectedWidgetTypeLayoutSpan.hOff ?? selectedWidgetTypeLayoutSpan.h,
      }
    : selectedWidgetTypeLayoutSpan;
  const selectedWidgetTypeOverride = selectedWidget
    ? widgetTypeLayoutOverrides[selectedWidget.kind]?.[activeGridBreakpoint]
    : undefined;
  const selectedWidgetLayoutOverride = selectedWidget
    ? widgetLayoutOverrides[selectedWidget.id]?.[activeGridBreakpoint]
    : undefined;
  const selectedWidgetCurrentLayoutSpan = selectedWidget
    ? {
        w: selectedWidgetActiveLayout?.w ?? selectedWidget.layout.w,
        h: selectedWidgetActiveLayout?.h ?? selectedWidget.layout.h,
      }
    : null;
  const selectedWidgetOverrideHeight =
    selectedWidget && selectedWidgetLayoutOverride
      ? selectedWidget.kind === 'light'
        ? selectedWidget.isOn
          ? selectedWidgetLayoutOverride.hOn ?? selectedWidgetLayoutOverride.h
          : selectedWidgetLayoutOverride.hOff ?? selectedWidgetLayoutOverride.h
        : selectedWidgetLayoutOverride.h ?? selectedWidgetLayoutOverride.hOn ?? selectedWidgetLayoutOverride.hOff
      : undefined;
  const selectedWidgetOverrideLayoutSpan =
    selectedWidget && selectedWidgetLayoutOverride
      ? {
          w:
            selectedWidgetLayoutOverride.w ??
            selectedWidgetCurrentLayoutSpan?.w ??
            selectedWidgetTypeStateLayoutSpan?.w ??
            selectedWidget.layout.w,
          h:
            selectedWidgetOverrideHeight ??
            selectedWidgetCurrentLayoutSpan?.h ??
            selectedWidgetTypeStateLayoutSpan?.h ??
            selectedWidget.layout.h,
        }
      : null;
  const selectedWidgetLayoutSpan =
    selectedWidget && layoutApplyScope === 'widget'
      ? selectedWidgetOverrideLayoutSpan ?? selectedWidgetCurrentLayoutSpan ?? selectedWidgetTypeStateLayoutSpan
      : selectedWidgetTypeStateLayoutSpan;
  const layoutPickerMinimumWidth =
    selectedWidget?.kind === 'cover' && activeGridBreakpoint !== 'xs' && activeGridBreakpoint !== 'sm'
      ? Math.min(layoutEditorCols, 2)
      : 1;
  const layoutPickerWidth = Math.max(
    layoutPickerMinimumWidth,
    clampGridSpan(selectedWidgetLayoutSpan?.w ?? 1, layoutEditorCols),
  );
  const layoutPickerHeight = clampGridSpan(selectedWidgetLayoutSpan?.h ?? 1, GRID_LAYOUT_PREVIEW_MAX_ROWS);
  const selectedLightAutoExpand = selectedWidget?.kind === 'light'
    ? layoutApplyScope === 'type'
      ? selectedWidgetTypeOverride?.autoExpand ?? true
      : selectedWidgetLayoutOverride?.autoExpand ?? selectedWidgetTypeOverride?.autoExpand ?? true
    : false;
  const selectedLightOffHeight = selectedWidget?.kind === 'light'
    ? clampGridSpan(
        layoutApplyScope === 'type'
          ? selectedWidgetTypeOverride?.hOff ?? selectedWidgetTypeOverride?.h ?? selectedWidgetTypeLayoutSpan?.hOff ?? 1
          : selectedWidgetLayoutOverride?.hOff ?? selectedWidgetLayoutOverride?.h ??
            selectedWidgetTypeOverride?.hOff ?? selectedWidgetTypeOverride?.h ?? selectedWidgetTypeLayoutSpan?.hOff ?? 1,
        GRID_LAYOUT_PREVIEW_MAX_ROWS,
      )
    : layoutPickerHeight;
  const selectedLightOnHeight = selectedWidget?.kind === 'light'
    ? clampGridSpan(
        layoutApplyScope === 'type'
          ? selectedWidgetTypeOverride?.hOn ?? selectedWidgetTypeOverride?.h ?? selectedWidgetTypeLayoutSpan?.hOn ?? 2
          : selectedWidgetLayoutOverride?.hOn ?? selectedWidgetLayoutOverride?.h ??
            selectedWidgetTypeOverride?.hOn ?? selectedWidgetTypeOverride?.h ?? selectedWidgetTypeLayoutSpan?.hOn ?? 2,
        GRID_LAYOUT_PREVIEW_MAX_ROWS,
      )
    : layoutPickerHeight;
  const handleLayoutApplyScopeChange = (nextScope: 'widget' | 'type') => {
    if (!selectedWidget || nextScope === layoutApplyScope) {
      return;
    }
    if (nextScope === 'type') {
      const nextOverride =
        selectedWidget.kind === 'light'
          ? {
              w: layoutPickerWidth,
              ...(selectedLightAutoExpand
                ? { hOn: selectedLightOnHeight, hOff: selectedLightOffHeight, autoExpand: true }
                : { h: layoutPickerHeight, hOn: layoutPickerHeight, hOff: layoutPickerHeight, autoExpand: false }),
            }
          : {
              w: layoutPickerWidth,
              h: layoutPickerHeight,
            };
      onUpdateWidgetTypeLayoutOverride(selectedWidget.kind, activeGridBreakpoint, nextOverride);
      onUpdateWidgetLayoutOverride(selectedWidget.id, activeGridBreakpoint, null);
    }
    setLayoutApplyScope(nextScope);
  };
  const applyLightVariantSelection = (nextW: number, collapsedH: number) => {
    if (selectedWidget?.kind !== 'light') return;
    const safeW = clampGridSpan(nextW, layoutEditorCols);
    const safeOffH = clampGridSpan(collapsedH, GRID_LAYOUT_PREVIEW_MAX_ROWS);
    const safeOnH = selectedLightAutoExpand
      ? clampGridSpan(safeOffH + 1, GRID_LAYOUT_PREVIEW_MAX_ROWS)
      : safeOffH;
    const nextOverride: WidgetTypeBreakpointLayoutOverride = selectedLightAutoExpand
      ? { w: safeW, hOff: safeOffH, hOn: safeOnH, autoExpand: true }
      : { w: safeW, h: safeOffH, hOff: safeOffH, hOn: safeOffH, autoExpand: false };
    if (layoutApplyScope === 'widget') {
      onUpdateWidgetLayoutOverride(selectedWidget.id, activeGridBreakpoint, nextOverride);
    } else {
      onUpdateWidgetTypeLayoutOverride('light', activeGridBreakpoint, nextOverride);
    }
  };
  const handleLightAutoExpandChange = (nextAutoExpand: boolean) => {
    if (selectedWidget?.kind !== 'light') return;
    const fixedHeight = layoutPickerHeight;
    const nextOverride: WidgetTypeBreakpointLayoutOverride = nextAutoExpand
      ? selectedWidget.isOn
        ? { w: layoutPickerWidth, hOn: fixedHeight, hOff: Math.max(1, fixedHeight - 1), autoExpand: true }
        : { w: layoutPickerWidth, hOff: fixedHeight, hOn: Math.min(GRID_LAYOUT_PREVIEW_MAX_ROWS, fixedHeight + 1), autoExpand: true }
      : { w: layoutPickerWidth, h: fixedHeight, hOn: fixedHeight, hOff: fixedHeight, autoExpand: false };
    if (layoutApplyScope === 'widget') {
      onUpdateWidgetLayoutOverride(selectedWidget.id, activeGridBreakpoint, nextOverride);
    } else {
      onUpdateWidgetTypeLayoutOverride('light', activeGridBreakpoint, nextOverride);
    }
  };
  const selectedWidgetDisplayVariant = selectedWidget
    ? resolveWidgetDisplayVariant({
        kind: selectedWidget.kind,
        breakpoint: activeGridBreakpoint,
        layout: {
          w: layoutPickerWidth,
          h: layoutPickerHeight,
        },
        parentSectionId: selectedWidget.parentSectionId,
      })
    : null;
  const selectedWidgetLayoutVariant =
    selectedWidget && selectedWidgetDisplayVariant
      ? resolveCardLayoutVariant(
          getCardCapability(selectedWidget.kind),
          selectedWidgetDisplayVariant,
        )
      : null;
  const sensorDisplayVariantOptions =
    selectedWidget?.kind === 'sensor'
      ? SENSOR_CARD_CAPABILITY.variants.map((option) => {
          const target = SENSOR_CARD_CAPABILITY.resolveVariantTarget(option.id, {
            cols: layoutEditorCols,
            breakpoint: activeGridBreakpoint,
            isInsideStack: Boolean(selectedWidget.parentSectionId),
          });
          const targetW = clampGridSpan(target.w, layoutEditorCols);
          const targetH = clampGridSpan(target.h, GRID_LAYOUT_PREVIEW_MAX_ROWS);
          const resolvedTargetVariant = resolveWidgetDisplayVariant({
            kind: selectedWidget.kind,
            breakpoint: activeGridBreakpoint,
            layout: { w: targetW, h: targetH },
            parentSectionId: selectedWidget.parentSectionId,
          });
          return {
            ...option,
            targetW,
            targetH,
            isActive: selectedWidgetLayoutVariant === option.id,
            isAvailable:
              resolveCardLayoutVariant(SENSOR_CARD_CAPABILITY, resolvedTargetVariant) ===
              option.id,
          };
        })
      : [];
  const selectedLightCollapsedVariant = selectedWidget?.kind === 'light'
    ? resolveWidgetDisplayVariant({
        kind: 'light',
        breakpoint: activeGridBreakpoint,
        layout: { w: layoutPickerWidth, h: selectedLightOffHeight },
        parentSectionId: selectedWidget.parentSectionId,
      })
    : null;
  const selectedLightCollapsedLayoutVariant = selectedLightCollapsedVariant
    ? resolveCardLayoutVariant(LIGHT_CARD_CAPABILITY, selectedLightCollapsedVariant)
    : null;
  const lightDisplayVariantOptions =
    selectedWidget?.kind === 'light'
      ? LIGHT_CARD_CAPABILITY.variants.map((option) => {
          const target = LIGHT_CARD_CAPABILITY.resolveVariantTarget(option.id, {
            cols: layoutEditorCols,
            breakpoint: activeGridBreakpoint,
            isInsideStack: Boolean(selectedWidget.parentSectionId),
          });
          const targetW = clampGridSpan(target.w, layoutEditorCols);
          const targetH = clampGridSpan(target.h, GRID_LAYOUT_PREVIEW_MAX_ROWS);
          const expandedH = selectedLightAutoExpand
            ? clampGridSpan(targetH + 1, GRID_LAYOUT_PREVIEW_MAX_ROWS)
            : targetH;
          const resolvedTargetVariant = resolveWidgetDisplayVariant({
            kind: 'light',
            breakpoint: activeGridBreakpoint,
            layout: { w: targetW, h: targetH },
            parentSectionId: selectedWidget.parentSectionId,
          });
          return {
            ...option,
            targetW,
            targetH,
            expandedH,
            isActive: selectedLightCollapsedLayoutVariant === option.id,
            isAvailable:
              resolveCardLayoutVariant(LIGHT_CARD_CAPABILITY, resolvedTargetVariant) ===
              option.id,
          };
        })
      : [];
  const switchDisplayVariantOptions =
    selectedWidget?.kind === 'switch'
      ? SWITCH_CARD_CAPABILITY.variants.map((option) => {
          const target = SWITCH_CARD_CAPABILITY.resolveVariantTarget(option.id, {
            cols: layoutEditorCols,
            breakpoint: activeGridBreakpoint,
            isInsideStack: Boolean(selectedWidget.parentSectionId),
          });
          const targetW = clampGridSpan(target.w, layoutEditorCols);
          const targetH = clampGridSpan(target.h, GRID_LAYOUT_PREVIEW_MAX_ROWS);
          const resolvedTargetVariant = resolveWidgetDisplayVariant({
            kind: 'switch',
            breakpoint: activeGridBreakpoint,
            layout: { w: targetW, h: targetH },
            parentSectionId: selectedWidget.parentSectionId,
          });
          return {
            ...option,
            targetW,
            targetH,
            isActive: selectedWidgetLayoutVariant === option.id,
            isAvailable:
              resolveCardLayoutVariant(SWITCH_CARD_CAPABILITY, resolvedTargetVariant) ===
              option.id,
          };
        })
      : [];
  const climateDisplayVariantOptions =
    selectedWidget?.kind === 'climate'
      ? CLIMATE_CARD_CAPABILITY.variants.map((option) => {
          const target = CLIMATE_CARD_CAPABILITY.resolveVariantTarget(option.id, {
            cols: layoutEditorCols,
            breakpoint: activeGridBreakpoint,
            isInsideStack: Boolean(selectedWidget.parentSectionId),
          });
          const targetW = clampGridSpan(target.w, layoutEditorCols);
          const targetH = clampGridSpan(target.h, GRID_LAYOUT_PREVIEW_MAX_ROWS);
          const resolvedTargetVariant = resolveWidgetDisplayVariant({
            kind: 'climate',
            breakpoint: activeGridBreakpoint,
            layout: { w: targetW, h: targetH },
            parentSectionId: selectedWidget.parentSectionId,
          });
          return {
            ...option,
            targetW,
            targetH,
            isActive: selectedWidgetLayoutVariant === option.id,
            isAvailable:
              resolveCardLayoutVariant(CLIMATE_CARD_CAPABILITY, resolvedTargetVariant) ===
              option.id,
          };
        })
      : [];
  const alarmDisplayVariantOptions =
    selectedWidget?.kind === 'alarm'
      ? ALARM_CARD_CAPABILITY.variants.map((option) => {
          const target = ALARM_CARD_CAPABILITY.resolveVariantTarget(option.id, {
            cols: layoutEditorCols,
            breakpoint: activeGridBreakpoint,
            isInsideStack: Boolean(selectedWidget.parentSectionId),
          });
          const targetW = clampGridSpan(target.w, layoutEditorCols);
          const targetH = clampGridSpan(target.h, GRID_LAYOUT_PREVIEW_MAX_ROWS);
          const resolvedTargetVariant = resolveWidgetDisplayVariant({
            kind: 'alarm',
            breakpoint: activeGridBreakpoint,
            layout: { w: targetW, h: targetH },
            parentSectionId: selectedWidget.parentSectionId,
          });
          return {
            ...option,
            targetW,
            targetH,
            isActive: selectedWidgetLayoutVariant === option.id,
            isAvailable:
              resolveCardLayoutVariant(ALARM_CARD_CAPABILITY, resolvedTargetVariant) ===
              option.id,
          };
        })
      : [];
  const lockDisplayVariantOptions =
    selectedWidget?.kind === 'lock'
      ? LOCK_CARD_CAPABILITY.variants.map((option) => {
          const target = LOCK_CARD_CAPABILITY.resolveVariantTarget(option.id, {
            cols: layoutEditorCols,
            breakpoint: activeGridBreakpoint,
            isInsideStack: Boolean(selectedWidget.parentSectionId),
          });
          const targetW = clampGridSpan(target.w, layoutEditorCols);
          const targetH = clampGridSpan(target.h, GRID_LAYOUT_PREVIEW_MAX_ROWS);
          const resolvedTargetVariant = resolveWidgetDisplayVariant({
            kind: 'lock',
            breakpoint: activeGridBreakpoint,
            layout: { w: targetW, h: targetH },
            parentSectionId: selectedWidget.parentSectionId,
          });
          return {
            ...option,
            targetW,
            targetH,
            isActive: selectedWidgetLayoutVariant === option.id,
            isAvailable:
              resolveCardLayoutVariant(LOCK_CARD_CAPABILITY, resolvedTargetVariant) ===
              option.id,
          };
        })
      : [];
  const coverDisplayVariantOptions =
    selectedWidget?.kind === 'cover'
      ? COVER_CARD_CAPABILITY.variants.map((option) => {
          const target = COVER_CARD_CAPABILITY.resolveVariantTarget(option.id, {
            cols: layoutEditorCols,
            breakpoint: activeGridBreakpoint,
            isInsideStack: Boolean(selectedWidget.parentSectionId),
          });
          const targetW = clampGridSpan(target.w, layoutEditorCols);
          const targetH = clampGridSpan(target.h, GRID_LAYOUT_PREVIEW_MAX_ROWS);
          const resolvedTargetVariant = resolveWidgetDisplayVariant({
            kind: 'cover',
            breakpoint: activeGridBreakpoint,
            layout: { w: targetW, h: targetH },
            parentSectionId: selectedWidget.parentSectionId,
          });
          return {
            ...option,
            targetW,
            targetH,
            isActive: selectedWidgetLayoutVariant === option.id,
            isAvailable:
              resolveCardLayoutVariant(COVER_CARD_CAPABILITY, resolvedTargetVariant) ===
              option.id,
          };
        })
      : [];
  const selectedCoverHasTilt =
    selectedWidget?.kind === 'cover' &&
    (cover.supportsSetTiltPosition === true ||
      cover.supportsOpenTilt === true ||
      cover.supportsCloseTilt === true ||
      cover.supportsStopTilt === true ||
      typeof cover.tiltPosition === 'number' ||
      cover.rawAttributes?.current_tilt_position !== undefined ||
      cover.rawAttributes?.tilt_position !== undefined ||
      cover.rawAttributes?.current_cover_tilt_position !== undefined);
  const selectedCoverSupportsPosition =
    selectedWidget?.kind !== 'cover' || cover.supportsSetPosition !== false;
  const mediaDisplayVariantOptions =
    selectedWidget?.kind === 'media'
      ? MEDIA_CARD_CAPABILITY.variants.map((option) => {
          const target = MEDIA_CARD_CAPABILITY.resolveVariantTarget(option.id, {
            cols: layoutEditorCols,
            breakpoint: activeGridBreakpoint,
            isInsideStack: Boolean(selectedWidget.parentSectionId),
          });
          const targetW = clampGridSpan(target.w, layoutEditorCols);
          const targetH = clampGridSpan(target.h, GRID_LAYOUT_PREVIEW_MAX_ROWS);
          const resolvedTargetVariant = resolveWidgetDisplayVariant({
            kind: 'media',
            breakpoint: activeGridBreakpoint,
            layout: { w: targetW, h: targetH },
            parentSectionId: selectedWidget.parentSectionId,
          });
          return {
            ...option,
            targetW,
            targetH,
            isActive: selectedWidgetLayoutVariant === option.id,
            isAvailable:
              resolveCardLayoutVariant(MEDIA_CARD_CAPABILITY, resolvedTargetVariant) ===
              option.id,
          };
        })
      : [];
  const cameraDisplayVariantOptions =
    selectedWidget?.kind === 'camera'
      ? CAMERA_CARD_CAPABILITY.variants.map((option) => {
          const target = CAMERA_CARD_CAPABILITY.resolveVariantTarget(option.id, {
            cols: layoutEditorCols,
            breakpoint: activeGridBreakpoint,
            isInsideStack: Boolean(selectedWidget.parentSectionId),
          });
          const targetW = clampGridSpan(target.w, layoutEditorCols);
          const targetH = clampGridSpan(target.h, GRID_LAYOUT_PREVIEW_MAX_ROWS);
          const resolvedTargetVariant = resolveWidgetDisplayVariant({
            kind: 'camera',
            breakpoint: activeGridBreakpoint,
            layout: { w: targetW, h: targetH },
            parentSectionId: selectedWidget.parentSectionId,
          });
          return {
            ...option,
            targetW,
            targetH,
            isActive: selectedWidgetLayoutVariant === option.id,
            isAvailable:
              resolveCardLayoutVariant(CAMERA_CARD_CAPABILITY, resolvedTargetVariant) ===
              option.id,
          };
        })
      : [];
  const vacuumDisplayVariantOptions =
    selectedWidget?.kind === 'vacuum'
      ? VACUUM_CARD_CAPABILITY.variants.map((option) => {
          const target = VACUUM_CARD_CAPABILITY.resolveVariantTarget(option.id, {
            cols: layoutEditorCols,
            breakpoint: activeGridBreakpoint,
            isInsideStack: Boolean(selectedWidget.parentSectionId),
          });
          const targetW = clampGridSpan(target.w, layoutEditorCols);
          const targetH = clampGridSpan(target.h, GRID_LAYOUT_PREVIEW_MAX_ROWS);
          const resolvedTargetVariant = resolveWidgetDisplayVariant({
            kind: 'vacuum',
            breakpoint: activeGridBreakpoint,
            layout: { w: targetW, h: targetH },
            parentSectionId: selectedWidget.parentSectionId,
          });
          return {
            ...option,
            targetW,
            targetH,
            isActive: selectedWidgetLayoutVariant === option.id,
            isAvailable:
              resolveCardLayoutVariant(VACUUM_CARD_CAPABILITY, resolvedTargetVariant) ===
              option.id,
          };
        })
      : [];
  const selectedDisplayVariantOptions = selectedWidget?.kind === 'sensor'
    ? sensorDisplayVariantOptions
    : selectedWidget?.kind === 'light'
      ? lightDisplayVariantOptions
      : selectedWidget?.kind === 'switch'
        ? switchDisplayVariantOptions
        : selectedWidget?.kind === 'climate'
          ? climateDisplayVariantOptions
          : selectedWidget?.kind === 'alarm'
            ? alarmDisplayVariantOptions
            : selectedWidget?.kind === 'lock'
              ? lockDisplayVariantOptions
              : selectedWidget?.kind === 'cover'
                ? coverDisplayVariantOptions
                : selectedWidget?.kind === 'media'
                  ? mediaDisplayVariantOptions
                  : selectedWidget?.kind === 'camera'
                    ? cameraDisplayVariantOptions
                    : selectedWidget?.kind === 'vacuum'
                      ? vacuumDisplayVariantOptions
                      : [];
  const selectedWidgetSkeletonKind = selectedWidget
    ? getCardCapability(selectedWidget.kind).skeleton
    : null;
  const isCompactLayoutEditor = activeGridBreakpoint === 'sm' || activeGridBreakpoint === 'xs';
  const layoutGridCompactCellPx = 38;
  const layoutGridCompactMaxWidth = isCompactLayoutEditor
    ? layoutEditorCols * layoutGridCompactCellPx + Math.max(0, layoutEditorCols - 1) * 6 + 16
    : null;
  const selectedWidgetLiveEntity = selectedWidget
    ? resolveEntityStateById(haStates, selectedWidget.entityId)
    : undefined;
  const selectedWidgetSensorHistory =
    selectedWidget?.kind === 'sensor'
      ? resolveEntityHistoryById(microChartHistoryByEntity, selectedWidget.entityId)
      : undefined;
  const selectedWidgetPreviewValue =
    selectedWidget?.kind === 'sensor'
      ? haConnected
        ? toFiniteNumber(selectedWidgetLiveEntity?.numericValue)
        : undefined
      : toFiniteNumber(selectedWidgetLiveEntity?.numericValue) ?? toFiniteNumber(selectedWidget?.value);
  const layoutPreviewCardGapPx = GRID_ENGINE_GAP_PX;
  const layoutPreviewCellWidthPx = isCompactLayoutEditor ? 96 : 88;
  const layoutPreviewCellHeightPx = GRID_ENGINE_ROW_UNIT_PX;
  const layoutPreviewCardWidthPx = Math.max(
    isCompactLayoutEditor ? 96 : 104,
    Math.min(
      isCompactLayoutEditor ? 312 : 368,
      layoutPickerWidth * layoutPreviewCellWidthPx + Math.max(0, layoutPickerWidth - 1) * layoutPreviewCardGapPx,
    ),
  );
  const layoutPreviewCardHeightPx = Math.max(
    layoutPreviewCellHeightPx,
    Math.min(
      isCompactLayoutEditor ? 312 : 368,
      layoutPickerHeight * layoutPreviewCellHeightPx + Math.max(0, layoutPickerHeight - 1) * layoutPreviewCardGapPx,
    ),
  );
  const selectedWidgetSupportsDisplayMetrics =
    selectedWidget?.kind === 'sensor' ||
    selectedWidget?.kind === 'light' ||
    selectedWidget?.kind === 'switch' ||
    selectedWidget?.kind === 'climate' ||
    selectedWidget?.kind === 'alarm' ||
    selectedWidget?.kind === 'lock' ||
    selectedWidget?.kind === 'cover' ||
    selectedWidget?.kind === 'media' ||
    selectedWidget?.kind === 'camera' ||
    selectedWidget?.kind === 'vacuum';
  const selectedWidgetCanvasMetrics =
    selectedWidget &&
    selectedWidgetSupportsDisplayMetrics &&
    selectedWidgetDisplayMetrics?.widgetId === selectedWidget.id
      ? selectedWidgetDisplayMetrics
      : null;
  const layoutPreviewSourceWidthPx = selectedWidgetCanvasMetrics?.width ?? layoutPreviewCardWidthPx;
  const layoutPreviewSourceHeightPx = selectedWidgetCanvasMetrics?.height ?? layoutPreviewCardHeightPx;
  const layoutPreviewMaxWidthPx = isCompactLayoutEditor ? 272 : 296;
  const layoutPreviewMaxHeightPx = 220;
  const layoutPreviewScale = Math.min(
    1,
    layoutPreviewMaxWidthPx / Math.max(1, layoutPreviewSourceWidthPx),
    layoutPreviewMaxHeightPx / Math.max(1, layoutPreviewSourceHeightPx),
  );
  const layoutPreviewViewportWidthPx = Math.round(layoutPreviewSourceWidthPx * layoutPreviewScale);
  const layoutPreviewViewportHeightPx = Math.round(layoutPreviewSourceHeightPx * layoutPreviewScale);
  const selectedWidgetPreview = selectedWidget
    ? {
        ...selectedWidget,
        layout: {
          ...selectedWidget.layout,
          w: layoutPickerWidth,
          h: layoutPickerHeight,
        },
      }
    : null;
  const layoutIsUsingAuto =
    layoutApplyScope === 'type'
      ? !selectedWidgetTypeOverride
      : !selectedWidgetLayoutOverride;
  const canResetLayout = !layoutIsUsingAuto;
  const activeDisplayVariant =
    selectedWidgetCanvasMetrics?.variant ?? selectedWidgetDisplayVariant;
  const activeCardLayoutVariant =
    selectedWidget && activeDisplayVariant
      ? resolveCardLayoutVariant(
          getCardCapability(selectedWidget.kind),
          activeDisplayVariant,
        )
      : null;
  const activeCardLayoutLabel =
    selectedWidget && activeCardLayoutVariant
      ? getCardCapability(selectedWidget.kind).variants.find(
          (option) => option.id === activeCardLayoutVariant,
        )?.label
      : null;
  const activeLayoutLabel =
    selectedWidgetSupportsDisplayMetrics
      ? activeCardLayoutLabel ?? `${layoutPickerWidth}×${layoutPickerHeight}`
      : `${layoutPickerWidth}×${layoutPickerHeight}`;

  const entityDomains = selectedWidget
    ? selectedWidget.kind === 'media'
      ? ['media_player.']
      : selectedWidget.kind === 'alarm'
        ? ['alarm_control_panel.']
        : selectedWidget.kind === 'switch'
          ? ['switch.', 'input_boolean.', 'fan.']
          : [`${selectedWidget.kind}.`]
    : [];
  const liveEntitySuggestions = haConnected
    ? haEntityIds.filter((entityId) =>
        entityDomains.length > 0 ? entityDomains.some((domain) => entityId.startsWith(domain)) : true,
      )
    : [];
  const staticSuggestions = selectedWidget ? entityOptions[selectedWidget.kind] ?? [] : [];
  const entitySuggestions = Array.from(new Set([...liveEntitySuggestions, ...staticSuggestions]));
  const switchConsumptionSuggestions =
    selectedWidget?.kind === 'switch'
      ? (() => {
          const liveSensorEntityIds = haConnected
            ? haEntityIds.filter((entityId) => entityId.startsWith('sensor.'))
            : [];
          const likelyConsumptionEntityIds = liveSensorEntityIds.filter((entityId) => {
            const entity = resolveEntityStateById(haStates, entityId);
            const deviceClass = String(entity?.rawAttributes?.device_class ?? '').trim().toLowerCase();
            const unit = (entity?.unit ?? String(entity?.rawAttributes?.unit_of_measurement ?? ''))
              .trim()
              .toLowerCase();
            const searchableId = entityId.toLowerCase();
            return (
              ['power', 'energy', 'monetary'].includes(deviceClass) ||
              ['w', 'kw', 'mw', 'wh', 'kwh', 'mwh'].includes(unit) ||
              ['power', 'energy', 'consumption', 'consumo', 'energia', 'potenza', 'watt'].some((token) =>
                searchableId.includes(token),
              )
            );
          });
          return Array.from(
            new Set([
              selectedWidget.switchConsumptionEntityId?.trim() ?? '',
              ...likelyConsumptionEntityIds,
              ...liveSensorEntityIds,
              ...(entityOptions.sensor ?? []),
            ].filter(Boolean)),
          );
        })()
      : [];
  const microWidgets = selectedWidget?.widgets ?? [];
  const selectedMicroWidget = selectedMicroWidgetId
    ? microWidgets.find((entry) => entry.id === selectedMicroWidgetId) ?? null
    : null;
  const selectedMicroWidgetIndex = selectedMicroWidget
    ? microWidgets.findIndex((entry) => entry.id === selectedMicroWidget.id)
    : -1;
  const selectedMicroButtonMode =
    selectedMicroWidget?.type === 'micro_button'
      ? selectedMicroWidget.buttonMode ?? 'switch'
      : null;
  const selectedMicroSliderSendOnRelease =
    selectedMicroWidget?.type === 'micro_slider'
      ? selectedMicroWidget.sliderSendOnRelease ?? true
      : true;
  const selectedMicroSuperChartType =
    selectedMicroWidget?.type === 'micro_superchart'
      ? selectedMicroWidget.superChartType ?? 'line'
      : 'line';
  const microWidgetEntitySuggestions = haConnected ? haEntityIds : [];
  const configuredMicroWidgetEntities = microWidgets
    .map((microWidget) => microWidget.entity.trim())
    .filter((entityId) => entityId.length > 0);
  const microWidgetEntityOptions = Array.from(
    new Set([
      ...configuredMicroWidgetEntities,
      ...microWidgetEntitySuggestions,
      selectedWidget?.entityId?.trim() ?? '',
    ].filter((entityId) => entityId.length > 0)),
  );
  const microWidgetPageOptions = Array.from(
    new Set(
      [
        ...sidebarPaths
          .map((entry) => entry.path.trim())
          .filter((path) => path.length > 0),
        '/home',
        '/automations',
        '/security',
        '/consumi',
        '/appgallery',
      ].filter((path) => path.length > 0),
    ),
  );
  const defaultMicroWidgetPagePath = microWidgetPageOptions[0] ?? '/home';
  const microWidgetPathLabelByPath = new Map(
    sidebarPaths
      .map((entry) => [entry.path.trim(), entry.label.trim()] as const)
      .filter(([path]) => path.length > 0),
  );
  const catalogEntityId = microWidgetCatalogEntity.trim();
  const normalizedCatalogEntityQuery = catalogEntityId.toLowerCase();
  const catalogDomainFilter = microWidgetCatalogDomainFilter === 'all' ? '' : microWidgetCatalogDomainFilter;
  const catalogEntityDomainOptions = (() => {
    const counts = new Map<string, number>();
    microWidgetEntityOptions.forEach((entityId) => {
      const domain = extractEntityDomain(entityId);
      if (!domain) {
        return;
      }
      counts.set(domain, (counts.get(domain) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((first, second) => {
        if (second[1] !== first[1]) {
          return second[1] - first[1];
        }
        return first[0].localeCompare(second[0]);
      })
      .slice(0, MICRO_WIDGET_CATALOG_DOMAIN_LIMIT);
  })();
  const filteredCatalogEntityOptions = (() => {
    const scopedOptions = microWidgetEntityOptions.filter((entityId) => {
      if (!catalogDomainFilter) {
        return true;
      }
      return entityId.toLowerCase().startsWith(`${catalogDomainFilter}.`);
    });
    const sortedOptions = scopedOptions
      .map((entityId) => ({
        entityId,
        score: scoreEntitySearchMatch(entityId, normalizedCatalogEntityQuery),
      }))
      .filter((entry) => (normalizedCatalogEntityQuery ? Number.isFinite(entry.score) : true))
      .sort((first, second) => {
        if (second.score !== first.score) {
          return second.score - first.score;
        }
        return first.entityId.localeCompare(second.entityId);
      })
      .slice(0, MICRO_WIDGET_CATALOG_ENTITY_LIMIT);
    return sortedOptions.map((entry) => entry.entityId);
  })();
  const hasCatalogEntitySelection = catalogEntityId.length > 0;
  const compatibleMicroWidgetCatalog = MICRO_WIDGET_CATALOG.filter((catalogItem) =>
    isMicroWidgetTypeCompatible(catalogItem.type, catalogEntityId),
  );
  const appendMicroWidget = (type: MicroWidget['type'], entityId = catalogEntityId) => {
    if (!selectedWidget) {
      return;
    }
    const normalizedEntityId = entityId.trim();
    if (!normalizedEntityId) {
      return;
    }
    const nextMicroWidgetId = `micro-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
    onUpdateWidget(selectedWidget.id, (widget) => {
      const nextIndex = (widget.widgets ?? []).length + 1;
      const nextMicroWidget: MicroWidget = {
        id: nextMicroWidgetId,
        type,
        entity: normalizedEntityId,
        label: `Widget ${nextIndex}`,
        buttonMode: type === 'micro_button' ? 'switch' : undefined,
        buttonHoldWhilePressed: type === 'micro_button' ? false : undefined,
        buttonPagePath: type === 'micro_button' ? defaultMicroWidgetPagePath : undefined,
        sliderSendOnRelease: type === 'micro_slider' ? true : undefined,
        superChartType: type === 'micro_superchart' ? 'line' : undefined,
      };
      return {
        ...widget,
        widgets: [...(widget.widgets ?? []), nextMicroWidget],
      };
    });
    setSelectedMicroWidgetId(nextMicroWidgetId);
  };
  const sensorMetaSuggestions = haConnected
    ? haEntityIds.filter(
        (entityId) =>
          entityId.startsWith('sensor.') ||
          entityId.startsWith('binary_sensor.') ||
          entityId.startsWith('device_tracker.') ||
          entityId.startsWith('switch.'),
      )
    : [];
  const sensorBatterySuggestions = haConnected
    ? haEntityIds.filter((entityId) => entityId.startsWith('sensor.') || entityId.startsWith('number.'))
    : [];
  const resolveSceneAction = (sceneId: SceneKey): SceneActionConfig => {
    const configured = sceneActions[sceneId];
    if (configured) {
      return configured;
    }
    const legacyScript = sceneScripts[sceneId];
    if (legacyScript?.trim().length) {
      return {
        type: 'script',
        scriptEntityId: legacyScript,
      };
    }
    return {
      type: 'script',
    };
  };
  const resolveSceneLabel = (sceneId: SceneKey, fallback: string) => {
    const customLabel = sceneLabels[sceneId]?.trim();
    return customLabel && customLabel.length > 0 ? customLabel : fallback;
  };
  const resolveSceneIconKey = (sceneId: SceneKey, fallback: SceneIconKey): SceneIconKey => {
    return sceneIcons[sceneId] ?? fallback;
  };
  const resolveSceneIconLabel = (iconKey: SceneIconKey) => {
    return SCENE_ICON_OPTIONS.find((option) => option.id === iconKey)?.label ?? iconKey;
  };
  const resolveSceneActionStatus = (
    sceneId: SceneKey,
    isActive: boolean,
    actionConfig: SceneActionConfig,
  ) => {
    if (!isActive) {
      return {
        label: 'Nascosta',
        className: 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-tertiary)]',
        dotClassName: 'bg-[color:var(--ui-text-disabled)]',
      };
    }

    if (actionConfig.type === 'service') {
      const hasService = isValidSceneServiceId(actionConfig.service ?? '');
      const hasValidPayload = isValidScenePayloadJson(actionConfig.payloadJson);
      if (!hasService) {
        return {
          label: bt('Manca servizio'),
          className: 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]',
          dotClassName: 'bg-amber-200/72',
        };
      }
      if (!hasValidPayload) {
        return {
          label: bt('JSON non valido'),
          className: 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]',
          dotClassName: 'bg-rose-200/72',
        };
      }
      return {
        label: 'Servizio',
        className: 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]',
        dotClassName: 'bg-emerald-200/72',
      };
    }

    const configuredScript = actionConfig.scriptEntityId?.trim() ?? sceneScripts[sceneId]?.trim() ?? '';
    return configuredScript
      ? {
          label: 'Script',
          className: 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]',
          dotClassName: 'bg-emerald-200/72',
        }
      : {
          label: bt('Manca script'),
          className: 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]',
          dotClassName: 'bg-amber-200/72',
        };
  };
  const selectedSceneConfig =
    selectedSection?.kind === 'scenes'
      ? SCENES_CATALOG.find((scene) => scene.id === selectedSceneConfigId) ??
        SCENES_CATALOG.find((scene) => scenesSelected.includes(scene.id)) ??
        SCENES_CATALOG[0] ??
        null
      : null;
  const upsertSceneLabel = (section: DashboardSection, sceneId: SceneKey, nextLabel: string): DashboardSection => {
    const nextSceneLabels: Partial<Record<SceneKey, string>> = {
      ...(section.sceneLabels ?? {}),
    };
    if (nextLabel.trim().length === 0) {
      delete nextSceneLabels[sceneId];
    } else {
      nextSceneLabels[sceneId] = nextLabel;
    }
    return {
      ...section,
      sceneLabels: Object.keys(nextSceneLabels).length ? nextSceneLabels : undefined,
    };
  };
  const upsertSceneIcon = (
    section: DashboardSection,
    sceneId: SceneKey,
    nextIconKey: SceneIconKey | '',
  ): DashboardSection => {
    const nextSceneIcons: Partial<Record<SceneKey, SceneIconKey>> = {
      ...(section.sceneIcons ?? {}),
    };
    if (!nextIconKey) {
      delete nextSceneIcons[sceneId];
    } else {
      nextSceneIcons[sceneId] = nextIconKey;
    }
    return {
      ...section,
      sceneIcons: Object.keys(nextSceneIcons).length ? nextSceneIcons : undefined,
    };
  };
  const upsertSceneAction = (
    section: DashboardSection,
    sceneId: SceneKey,
    updater: (current: SceneActionConfig) => SceneActionConfig,
  ): DashboardSection => {
    const nextSceneActions: Partial<Record<SceneKey, SceneActionConfig>> = {
      ...(section.sceneActions ?? {}),
    };
    const currentAction =
      nextSceneActions[sceneId] ??
      (section.sceneScripts?.[sceneId]?.trim().length
        ? {
            type: 'script' as const,
            scriptEntityId: section.sceneScripts?.[sceneId],
          }
        : {
            type: 'script' as const,
          });
    const nextAction = updater(currentAction);
    const hasMeaningfulValue =
      Boolean(nextAction.type) ||
      (nextAction.scriptEntityId?.trim().length ?? 0) > 0 ||
      (nextAction.service?.trim().length ?? 0) > 0 ||
      (nextAction.entityId?.trim().length ?? 0) > 0 ||
      (nextAction.payloadJson?.trim().length ?? 0) > 0;

    if (hasMeaningfulValue) {
      nextSceneActions[sceneId] = nextAction;
    } else {
      delete nextSceneActions[sceneId];
    }

    return {
      ...section,
      sceneActions: Object.keys(nextSceneActions).length ? nextSceneActions : undefined,
    };
  };
  const isCompactEditOverlayMode = isEditMode && isCompactViewport;
  const compactEditPanelVisible = isCompactEditOverlayMode && hasEditSelection;
  const editSidebarContainerClass = isCompactEditOverlayMode
    ? `liquid-glass-sheet fixed inset-x-0 bottom-0 z-[219] flex max-h-[92dvh] min-h-[16rem] w-full flex-col p-3 py-2 transition-all duration-250 ${
        compactEditPanelVisible ? 'translate-y-0 opacity-100 pointer-events-auto' : 'translate-y-full opacity-0 pointer-events-none'
      }`
    : `liquid-glass-panel ${sidebarWidthClass} flex flex-col p-3 py-1 sm:p-4 sm:py-2 lg:p-5`;
  const editSidebarStyle =
    isCompactEditOverlayMode && contextSheetDragOffset > 0
      ? { transform: `translateY(${contextSheetDragOffset}px)`, transitionDuration: '0ms' }
      : undefined;

  return (
    <>
      <AnimatePresence>
        {compactEditPanelVisible ? (
          <motion.button
            key="edit-sidebar-overlay"
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onCloseContextSidebar}
            className="fixed inset-0 z-[218] bg-[color:var(--ui-scrim)] backdrop-blur-sm transition-opacity"
            aria-label={t('builder.closeConfiguration')}
          />
        ) : null}
      </AnimatePresence>
      <aside className={`builder-sidebar ${editSidebarContainerClass}`} style={editSidebarStyle}>
      {isCompactEditOverlayMode ? (
        <div
          className={`mb-2 flex justify-center touch-none ${isContextSheetDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          onPointerDown={handleContextSheetDragStart}
          onPointerMove={handleContextSheetDragMove}
          onPointerUp={finishContextSheetDrag}
          onPointerCancel={finishContextSheetDrag}
        >
          <span className="liquid-glass-drag-handle" />
        </div>
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--ui-text-tertiary)]">Builder</p>
          <h3 className="mt-2 text-xl font-semibold text-[color:var(--ui-text-primary)]">{t('builder.title')}</h3>
        </div>
        {hasEditSelection ? (
          <button
            type="button"
            onClick={onCloseContextSidebar}
            className="glass-icon-button -mr-1 -mt-1 h-9 w-9 active:scale-95"
            aria-label={t('builder.closeContext')}
            title={t('builder.closeContext')}
          >
            <X size={15} />
          </button>
        ) : null}
      </div>
      {!selectedWidget && !selectedSection && !selectedSidebarPath ? (
        <div className="dashboard-content-surface-soft mt-5 flex flex-1 items-center justify-center rounded-2xl border-dashed p-6 text-center">
          <p className="text-sm text-[color:var(--ui-text-secondary)]">{t('builder.empty')}</p>
        </div>
      ) : selectedSidebarPath ? (
        <div className="flex-1 mt-5 flex flex-col min-h-0">
          <div className="space-y-4 overflow-y-auto glass-scrollbar pr-1">
            <label className="block">
              <p className={BUILDER_LABEL_CLASS}>{t('builder.pathName')}</p>
              <input
                value={selectedSidebarPath.label}
                onChange={(event) =>
                  onUpdateSidebarPath(selectedSidebarPath.id, {
                    label: event.target.value,
                  })
                }
                className={BUILDER_INPUT_CLASS}
              />
            </label>
            <div className="block">
              <p className={BUILDER_LABEL_CLASS}>{t('builder.destination')}</p>
              <div className={`${BUILDER_INPUT_CLASS} cursor-default select-none text-[color:var(--ui-text-secondary)]`}>
                {selectedSidebarPath.path}
              </div>
              <p className={BUILDER_HELPER_CLASS}>{t('builder.protectedDestination')}</p>
            </div>
            <div className="block">
              <p className={BUILDER_LABEL_CLASS}>{t('builder.icon')}</p>
              <div className="grid grid-cols-5 gap-2">
                {SIDEBAR_PATH_ICON_KEYS.map((iconKey) => {
                  const Icon = SIDEBAR_PATH_ICON_MAP[iconKey] ?? LayoutGrid;
                  const active = selectedSidebarPath.icon === iconKey;
                  return (
                    <button
                      key={iconKey}
                      type="button"
                      onClick={() =>
                        onUpdateSidebarPath(selectedSidebarPath.id, {
                          icon: iconKey,
                        })
                      }
                      className={`h-10 w-10 rounded-xl border flex items-center justify-center transition-colors ${
                        active
                          ? 'liquid-glass-selection border-[color:var(--ui-border-strong)] text-[color:var(--ui-text-primary)]'
                          : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)] hover:bg-[color:var(--ui-fill-secondary)] hover:text-[color:var(--ui-text-primary)]'
                      }`}
                      title={iconKey}
                      aria-label={t('builder.setIcon', { icon: iconKey })}
                    >
                      <Icon size={16} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onRemoveSidebarPath(selectedSidebarPath.id)}
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl border border-rose-300/45 bg-rose-500/16 px-4 py-2.5 text-sm font-semibold text-rose-100 hover:bg-rose-500/26"
          >
            <X size={16} />
            {t('builder.hideFromBar')}
          </button>
        </div>
      ) : selectedSection ? (
        <div className="flex-1 mt-5 flex flex-col min-h-0">
          {selectedSection.kind === 'greeting' ? (
            <>
              <GlassSegmentSelect<'title' | 'weather'>
                ariaLabel="Sezione configurazione saluto"
                className="mb-3 shrink-0"
                options={[
                  { value: 'title' as const, label: bt('Titolo e info') },
                  { value: 'weather' as const, label: 'Meteo' },
                ]}
                value={greetingConfigTab}
                onChange={setGreetingConfigTab}
                optionClassName="h-auto py-2 uppercase tracking-[0.14em]"
              />
              <div className="space-y-4 overflow-y-auto glass-scrollbar pr-1">
                {greetingConfigTab === 'title' ? (
                  <>
                    <label className="block">
                      <p className={BUILDER_LABEL_CLASS}>{bt('Nome utente')}</p>
                      <input
                        value={state.userName}
                        onChange={(event) => onUpdateUserName(event.target.value)}
                        placeholder="Nome"
                        disabled={haConnected}
                        className={`${BUILDER_INPUT_CLASS} disabled:cursor-not-allowed disabled:opacity-60`}
                      />
                      <p className={BUILDER_HELPER_CLASS}>
                        {haConnected
                          ? bt('Con Home Assistant connesso, il saluto usa automaticamente l utente autenticato.')
                          : bt('Usato nei saluti automatici.')}
                      </p>
                    </label>
                    <label className="block">
                      <div className="mb-2 flex items-center justify-between">
                        <p className={BUILDER_LABEL_CLASS}>{bt('Titolo')}</p>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateSection(selectedSection.id, (section) => {
                              const nextAuto = !(section.titleAuto ?? true);
                              const nextTitle =
                                !nextAuto && (!section.title || section.title.trim().length === 0)
                                  ? greetingDefaults?.title ?? ''
                                  : section.title;
                              return {
                                ...section,
                                titleAuto: nextAuto,
                                title: nextTitle,
                              };
                            })
                          }
                          className={`text-[10px] uppercase tracking-[0.2em] px-2 py-1 rounded-full border transition-colors ${
                            titleAuto
                              ? 'liquid-glass-selection border-[color:var(--ui-border-strong)]'
                              : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)] hover:bg-[color:var(--ui-fill-secondary)]'
                          }`}
                        >
                          Auto
                        </button>
                      </div>
                      <textarea
                        rows={2}
                        value={sectionTitleValue}
                        onChange={(event) =>
                          onUpdateSection(selectedSection.id, (section) => ({
                            ...section,
                            title: event.target.value,
                          }))
                        }
                        disabled={titleAuto}
                        className={`${BUILDER_TEXTAREA_CLASS} disabled:cursor-not-allowed disabled:opacity-60`}
                      />
                    </label>
                    <label className="block">
                      <div className="mb-2 flex items-center justify-between">
                        <p className={BUILDER_LABEL_CLASS}>{bt('Sottotitolo')}</p>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateSection(selectedSection.id, (section) => {
                              const nextAuto = !(section.subtitleAuto ?? true);
                              const nextSubtitle =
                                !nextAuto && (!section.subtitle || section.subtitle.trim().length === 0)
                                  ? greetingDefaults?.subtitle ?? ''
                                  : section.subtitle;
                              return {
                                ...section,
                                subtitleAuto: nextAuto,
                                subtitle: nextSubtitle,
                              };
                            })
                          }
                          className={`text-[10px] uppercase tracking-[0.2em] px-2 py-1 rounded-full border transition-colors ${
                            subtitleAuto
                              ? 'liquid-glass-selection border-[color:var(--ui-border-strong)]'
                              : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)] hover:bg-[color:var(--ui-fill-secondary)]'
                          }`}
                        >
                          Auto
                        </button>
                      </div>
                      <textarea
                        rows={3}
                        value={sectionSubtitleValue}
                        onChange={(event) =>
                          onUpdateSection(selectedSection.id, (section) => ({
                            ...section,
                            subtitle: event.target.value,
                          }))
                        }
                        disabled={subtitleAuto}
                        className={`${BUILDER_TEXTAREA_CLASS} disabled:cursor-not-allowed disabled:opacity-60`}
                      />
                    </label>
                  </>
                ) : (
                  <div className={`${BUILDER_CONTENT_CARD_CLASS} space-y-3`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--ui-text-secondary)]">
                          {bt('Meteo nella card')}
                        </p>
                        <p className="mt-1 text-[11px] text-[color:var(--ui-text-tertiary)]">
                          {bt('Mostra il widget meteo dentro la card saluto.')}
                        </p>
                      </div>
                      <GlassToggle
                        checked={Boolean(showWeather)}
                        onChange={(nextChecked) =>
                          onUpdateSection(selectedSection.id, (section) => ({
                            ...section,
                            showWeather: nextChecked,
                          }))
                        }
                        label={bt('Mostra il meteo nella card saluto')}
                        tone="green"
                      />
                    </div>
                    {showWeather ? (
                      <div className="space-y-3 border-t border-[color:var(--ui-separator)] pt-3">
                      <div className="dashboard-content-surface-soft rounded-xl px-3 py-2.5">
                        <p className="text-[11px] font-medium text-[color:var(--ui-text-primary)]">{bt('Layout meteo responsive')}</p>
                        <p className="mt-1 text-[11px] text-[color:var(--ui-text-secondary)]">
                          {bt('In questa card unificata il meteo usa chip su xs/sm e card previsioni su md/lg.')}
                        </p>
                      </div>
                      <label className="block">
                        <p className={BUILDER_LABEL_CLASS}>{bt('Unita')}</p>
                        <GlassDropdown
                          options={WEATHER_UNIT_OPTIONS}
                          selected={findDropdownOption(WEATHER_UNIT_OPTIONS, weatherUnit)}
                          onChange={(option) =>
                            onUpdateSection(selectedSection.id, (section) => ({
                              ...section,
                              weatherUnit: option.id as typeof weatherUnit,
                            }))
                          }
                        />
                      </label>
                      <label className="block">
                        <p className={BUILDER_LABEL_CLASS}>{bt('Entita meteo')}</p>
                        <GlassCombobox
                          value={weatherEntityId}
                          options={weatherEntitySuggestions}
                          onChange={(nextValue) =>
                            onUpdateSection(selectedSection.id, (section) => ({
                              ...section,
                              weatherEntityId: nextValue,
                            }))
                          }
                          placeholder="weather.home"
                        />
                      </label>
                      <label className="block">
                        <p className={BUILDER_LABEL_CLASS}>{bt('Seconda info')}</p>
                        <GlassDropdown
                          options={weatherSecondaryDropdownOptions}
                          selected={findDropdownOption(weatherSecondaryDropdownOptions, safeWeatherSecondaryInfo)}
                          onChange={(option) =>
                            onUpdateSection(selectedSection.id, (section) => ({
                              ...section,
                              weatherSecondaryInfo: option.id as WeatherSecondaryInfo,
                            }))
                          }
                        />
                        <p className="mt-2 text-[11px] text-[color:var(--ui-text-secondary)]">{bt(weatherSelectedInfoMeta.description)}</p>
                      </label>
                      <label className="block">
                        <p className={BUILDER_LABEL_CLASS}>{bt('Forecast')}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <GlassDropdown
                            options={localizedWeatherForecastTypeOptions}
                            selected={findDropdownOption(localizedWeatherForecastTypeOptions, weatherForecastType)}
                            onChange={(option) =>
                              onUpdateSection(selectedSection.id, (section) => ({
                                ...section,
                                weatherForecastType: option.id as typeof weatherForecastType,
                                weatherForecastDays: Math.max(
                                  1,
                                  Math.min(
                                    option.id === 'hourly' ? 8 : 7,
                                    section.weatherForecastDays ?? 4,
                                  ),
                                ),
                              }))
                            }
                          />
                          <GlassDropdown
                            options={weatherForecastDayOptions}
                            selected={findDropdownOption(weatherForecastDayOptions, weatherForecastDays)}
                            onChange={(option) =>
                              onUpdateSection(selectedSection.id, (section) => ({
                                ...section,
                                weatherForecastDays: Number(option.id),
                              }))
                            }
                          />
                        </div>
                      </label>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => onRemoveSection(selectedSection.id)}
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl border border-rose-300/45 bg-rose-500/16 px-4 py-2.5 text-sm font-semibold text-rose-100 hover:bg-rose-500/26"
              >
                <X size={16} />
                {t('builder.removeTitle')}
              </button>
            </>
          ) : selectedSection.kind === 'weather' ? (
            <>
            <div className="space-y-4 overflow-y-auto glass-scrollbar pr-1">
              <label className="block">
                <p className={BUILDER_LABEL_CLASS}>{bt('Layout')}</p>
                <GlassDropdown
                  options={WEATHER_LAYOUT_OPTIONS}
                  selected={findDropdownOption(WEATHER_LAYOUT_OPTIONS, weatherLayout)}
                  onChange={(option) =>
                    onUpdateSection(selectedSection.id, (section) => ({
                      ...section,
                      weatherLayout: option.id as typeof weatherLayout,
                    }))
                  }
                />
                <div className="dashboard-content-surface-soft mt-2 rounded-xl px-3 py-2.5">
                  <p className="text-[11px] font-medium text-[color:var(--ui-text-primary)]">{bt(weatherLayoutPreview.title)}</p>
                  <p className="mt-1 text-[11px] text-[color:var(--ui-text-secondary)]">{bt(weatherLayoutPreview.description)}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {weatherLayoutPreview.chips.map((chip) => (
                      <span
                        key={chip}
                        className="rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[color:var(--ui-text-secondary)]"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>
              </label>
              <label className="block">
                <p className={BUILDER_LABEL_CLASS}>{bt('Unita')}</p>
                <GlassDropdown
                  options={WEATHER_UNIT_OPTIONS}
                  selected={findDropdownOption(WEATHER_UNIT_OPTIONS, weatherUnit)}
                  onChange={(option) =>
                    onUpdateSection(selectedSection.id, (section) => ({
                      ...section,
                      weatherUnit: option.id as typeof weatherUnit,
                    }))
                  }
                />
              </label>
              <label className="block">
                <p className={BUILDER_LABEL_CLASS}>{bt('Entita meteo')}</p>
                <GlassCombobox
                  value={weatherEntityId}
                  options={weatherEntitySuggestions}
                  onChange={(nextValue) =>
                    onUpdateSection(selectedSection.id, (section) => ({
                      ...section,
                      weatherEntityId: nextValue,
                    }))
                  }
                  placeholder="weather.home"
                />
                <p className={BUILDER_HELPER_CLASS}>
                  {haConnected && weatherEntitySuggestions.length > 0
                    ? bt('Suggerimenti live dalle entita weather.* di Home Assistant.')
                    : bt('Inserisci manualmente l\'entity id weather.* da usare per questa card.')}
                </p>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-[color:var(--ui-text-secondary)]">
                  <span>{bt('Consiglio provider')}</span>
                  <span className="group relative inline-flex items-center">
                    <button
                      type="button"
                      className="glass-icon-button h-11 w-11"
                      aria-label="Suggerimento OpenWeatherMap"
                    >
                      <HelpCircle size={12} />
                    </button>
                    <span className="liquid-glass-panel pointer-events-none absolute left-1/2 top-full z-30 mt-2 w-72 -translate-x-1/2 rounded-xl px-3 py-2 text-[11px] leading-relaxed text-[color:var(--ui-text-primary)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      Per forecast live completi (giornaliero + orario) e dati meteo piu ricchi, consigliamo
                      l'integrazione OpenWeatherMap in modalita v3.0.
                      <a
                        href="https://www.home-assistant.io/integrations/openweathermap/"
                        target="_blank"
                        rel="noreferrer"
                        className="pointer-events-auto ml-1 font-semibold text-cyan-200 underline underline-offset-2 hover:text-cyan-100"
                      >
                        Documentazione ufficiale
                      </a>
                    </span>
                  </span>
                </div>
              </label>
              <label className="block">
                <p className={BUILDER_LABEL_CLASS}>{bt('Seconda info')}</p>
                <GlassDropdown
                  options={weatherSecondaryDropdownOptions}
                  selected={findDropdownOption(weatherSecondaryDropdownOptions, safeWeatherSecondaryInfo)}
                  onChange={(option) =>
                    onUpdateSection(selectedSection.id, (section) => ({
                      ...section,
                      weatherSecondaryInfo: option.id as WeatherSecondaryInfo,
                    }))
                  }
                />
                <p className="mt-2 text-[11px] text-[color:var(--ui-text-secondary)]">{bt(weatherSelectedInfoMeta.description)}</p>
              </label>
              <label className="block">
                <p className={BUILDER_LABEL_CLASS}>{bt('Forecast')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <GlassDropdown
                    options={localizedWeatherForecastTypeOptions}
                    selected={findDropdownOption(localizedWeatherForecastTypeOptions, weatherForecastType)}
                    onChange={(option) =>
                      onUpdateSection(selectedSection.id, (section) => ({
                        ...section,
                        weatherForecastType: option.id as typeof weatherForecastType,
                        weatherForecastDays: Math.max(
                          1,
                          Math.min(
                            option.id === 'hourly' ? 8 : 7,
                            section.weatherForecastDays ?? 4,
                          ),
                        ),
                      }))
                    }
                  />
                  <GlassDropdown
                    options={weatherForecastDayOptions}
                    selected={findDropdownOption(weatherForecastDayOptions, weatherForecastDays)}
                    onChange={(option) =>
                      onUpdateSection(selectedSection.id, (section) => ({
                        ...section,
                        weatherForecastDays: Number(option.id),
                      }))
                    }
                  />
                </div>
                <p className={BUILDER_HELPER_CLASS}>
                  Le opzioni forecast sono visibili in modalita card e in auto quando la card ha spazio sufficiente.
                </p>
              </label>
            </div>
            <button
              type="button"
              onClick={() => onRemoveSection(selectedSection.id)}
              className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl border border-rose-300/45 bg-rose-500/16 px-4 py-2.5 text-sm font-semibold text-rose-100 hover:bg-rose-500/26"
            >
              <X size={16} />
              {t('builder.removeWeather')}
            </button>
            </>
          ) : selectedSection.kind === 'scenes' ? (
            <>
              <GlassSegmentSelect<'layout' | 'settings'>
                ariaLabel="Sezione configurazione scenari"
                className="mb-3 shrink-0"
                options={[
                  { value: 'layout' as const, label: 'Layout' },
                  { value: 'settings' as const, label: 'Setting' },
                ]}
                value={sectionConfigTab}
                onChange={setSectionConfigTab}
                optionClassName="h-auto py-2 uppercase tracking-[0.16em]"
              />

              {sectionConfigTab === 'layout' ? (
                <div className="space-y-4 overflow-y-auto glass-scrollbar pr-1">
                  <label className="block">
                    <p className={BUILDER_LABEL_CLASS}>{bt('Titolo')}</p>
                    <input
                      value={selectedSection.title ?? 'Scenari'}
                      onChange={(event) =>
                        onUpdateSection(selectedSection.id, (section) => ({
                          ...section,
                          title: event.target.value,
                        }))
                      }
                      placeholder="Scenari"
                      className={BUILDER_INPUT_CLASS}
                    />
                  </label>

                  <div className="space-y-2">
                    <p className={BUILDER_LABEL_CLASS}>{bt('Anteprima')}</p>
                    <div className="dashboard-content-surface overflow-hidden rounded-[1.5rem] p-0">
                      <div className="h-[7rem] w-full">
                        <ScenesCard
                          title={selectedSection.title ?? 'Scenari'}
                          scenes={scenesSelected}
                          sceneLabels={sceneLabels}
                          sceneIcons={sceneIcons}
                          compact
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateSection(selectedSection.id, (section) => ({
                          ...section,
                          scenesShowBackground: !(section.scenesShowBackground ?? true),
                        }))
                      }
                      className={`rounded-xl border px-3 py-2 text-xs uppercase tracking-[0.16em] transition-colors ${
                        scenesShowBackground
                          ? 'liquid-glass-selection border-[color:var(--ui-border-strong)]'
                          : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)] hover:bg-[color:var(--ui-fill-secondary)]'
                      }`}
                    >
                      Background
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateSection(selectedSection.id, (section) => ({
                          ...section,
                          scenesShowBorder: !(section.scenesShowBorder ?? true),
                        }))
                      }
                      className={`rounded-xl border px-3 py-2 text-xs uppercase tracking-[0.16em] transition-colors ${
                        scenesShowBorder
                          ? 'liquid-glass-selection border-[color:var(--ui-border-strong)]'
                          : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)] hover:bg-[color:var(--ui-fill-secondary)]'
                      }`}
                    >
                      Border
                    </button>
                  </div>

                  <div className={BUILDER_CONTENT_CARD_CLASS}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--ui-text-secondary)]">{bt('Scene visibili')}</p>
                      <span className="rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-2.5 py-1 text-xs font-semibold text-[color:var(--ui-text-primary)]">
                        {scenesSelected.length}/{SCENES_CATALOG.length}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 overflow-y-auto glass-scrollbar pr-1">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className={BUILDER_LABEL_CLASS}>{bt('Scene')}</p>
                      <span className="text-[11px] text-[color:var(--ui-text-tertiary)]">{scenesSelected.length} visibili</span>
                    </div>
                    <div className="space-y-2">
                      {SCENES_CATALOG.map((scene) => {
                        const isActive = scenesSelected.includes(scene.id);
                        const isSelectedScene = selectedSceneConfig?.id === scene.id;
                        const displayLabel = resolveSceneLabel(scene.id, scene.label);
                        const displayIconKey = resolveSceneIconKey(scene.id, scene.defaultIcon);
                        const actionStatus = resolveSceneActionStatus(scene.id, isActive, resolveSceneAction(scene.id));
                        return (
                          <div
                            key={`scene-row-${scene.id}`}
                            className={`flex items-center gap-2 rounded-2xl border p-2 transition-colors ${
                              isSelectedScene
                                ? 'liquid-glass-selection border-[color:var(--ui-border-strong)]'
                                : isActive
                                  ? 'border-[color:var(--ui-border-strong)] bg-[color:var(--ui-fill-secondary)]'
                                  : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)]'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setSelectedSceneConfigId(scene.id)}
                              className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left"
                            >
                              <span
                                className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${scene.color} text-[#fff] shadow-md`}
                              >
                                {getSceneIconNode(displayIconKey, 18)}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold text-[color:var(--ui-text-primary)]">{displayLabel}</span>
                                <span className="mt-1 block truncate text-[11px] text-[color:var(--ui-text-tertiary)]">{scene.label}</span>
                              </span>
                              <span className={`hidden shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium sm:inline-flex ${actionStatus.className}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${actionStatus.dotClassName}`} />
                                <span>{actionStatus.label}</span>
                              </span>
                            </button>
                            <button
                              type="button"
                              aria-label={t(isActive ? 'builder.hideNamed' : 'builder.showNamed', { name: displayLabel })}
                              title={isActive ? bt('Nascondi scena') : bt('Mostra scena')}
                              onClick={() => {
                                setSelectedSceneConfigId(scene.id);
                                onUpdateSection(selectedSection.id, (section) => {
                                  const currentScenes = section.scenes ?? scenesSelected;
                                  return {
                                    ...section,
                                    scenes: isActive
                                      ? currentScenes.filter((item) => item !== scene.id)
                                      : [...currentScenes, scene.id],
                                  };
                                });
                              }}
                              className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] transition-colors ${
                                isActive
                                  ? 'liquid-glass-selection border-[color:var(--ui-border-strong)]'
                                  : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)] hover:bg-[color:var(--ui-fill-secondary)]'
                              }`}
                            >
                              {isActive ? <Eye size={15} aria-hidden="true" /> : <EyeOff size={15} aria-hidden="true" />}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {selectedSceneConfig ? (() => {
                    const scene = selectedSceneConfig;
                    const isActive = scenesSelected.includes(scene.id);
                    const displayLabel = resolveSceneLabel(scene.id, scene.label);
                    const displayIconKey = resolveSceneIconKey(scene.id, scene.defaultIcon);
                    const actionConfig = resolveSceneAction(scene.id);
                    const actionType: SceneActionType = actionConfig.type === 'service' ? 'service' : 'script';
                    const actionStatus = resolveSceneActionStatus(scene.id, isActive, actionConfig);
                    const iconOptions = [
                      { id: '', name: `Predefinita (${resolveSceneIconLabel(scene.defaultIcon)})` },
                      ...SCENE_ICON_OPTIONS.map((iconOption) => ({
                        id: iconOption.id,
                        name: iconOption.label,
                      })),
                    ];
                    return (
                      <div className="dashboard-content-surface space-y-3 rounded-[1.5rem] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <span
                              className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${scene.color} text-[#fff] shadow-md`}
                            >
                              {getSceneIconNode(displayIconKey, 19)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[color:var(--ui-text-primary)]">{displayLabel}</p>
                              <p className="truncate text-[11px] text-[color:var(--ui-text-tertiary)]">{scene.id}</p>
                            </div>
                          </div>
                          <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium ${actionStatus.className}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${actionStatus.dotClassName}`} />
                            <span>{actionStatus.label}</span>
                          </span>
                        </div>

                        <label className="block">
                          <p className={BUILDER_LABEL_CLASS}>{bt('Nome scena')}</p>
                          <input
                            value={sceneLabels[scene.id] ?? ''}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              onUpdateSection(selectedSection.id, (section) =>
                                upsertSceneLabel(section, scene.id, nextValue),
                              );
                            }}
                            placeholder={scene.label}
                            className={BUILDER_INPUT_CLASS}
                          />
                        </label>

                        <label className="block">
                          <p className={BUILDER_LABEL_CLASS}>{bt('Icona')}</p>
                          <GlassDropdown
                            options={iconOptions}
                            selected={findDropdownOption(iconOptions, sceneIcons[scene.id] ?? '')}
                            onChange={(option) => {
                              const nextValue = option.id as SceneIconKey | '';
                              onUpdateSection(selectedSection.id, (section) =>
                                upsertSceneIcon(section, scene.id, nextValue),
                              );
                            }}
                          />
                        </label>

                        <label className="block">
                          <p className={BUILDER_LABEL_CLASS}>{bt('Tipo azione')}</p>
                          <GlassDropdown
                            options={localizedSceneActionTypeOptions}
                            selected={findDropdownOption(localizedSceneActionTypeOptions, actionType)}
                            onChange={(option) => {
                              const nextType = option.id as SceneActionType;
                              onUpdateSection(selectedSection.id, (section) =>
                                upsertSceneAction(section, scene.id, (current) => ({
                                  ...current,
                                  type: nextType,
                                })),
                              );
                            }}
                          />
                        </label>

                        {actionType === 'script' ? (
                          <label className="block">
                            <p className={BUILDER_LABEL_CLASS}>Script entity_id</p>
                            <GlassCombobox
                              value={actionConfig.scriptEntityId ?? ''}
                              options={sceneScriptSuggestions}
                              onChange={(nextValue) => {
                                onUpdateSection(selectedSection.id, (section) =>
                                  upsertSceneAction(section, scene.id, (current) => ({
                                    ...current,
                                    type: 'script',
                                    scriptEntityId: nextValue,
                                  })),
                                );
                              }}
                              placeholder={`script.${scene.id.replace(/-/g, '_')}`}
                            />
                          </label>
                        ) : (
                          <div className="space-y-2">
                            <label className="block">
                              <p className={BUILDER_LABEL_CLASS}>{bt('Servizio')}</p>
                              <GlassCombobox
                                value={actionConfig.service ?? ''}
                                options={SCENE_ACTION_SERVICE_SUGGESTIONS}
                                onChange={(nextValue) => {
                                  onUpdateSection(selectedSection.id, (section) =>
                                    upsertSceneAction(section, scene.id, (current) => ({
                                      ...current,
                                      type: 'service',
                                      service: nextValue,
                                    })),
                                  );
                                }}
                                placeholder="light.turn_on"
                              />
                            </label>
                            <label className="block">
                              <p className={BUILDER_LABEL_CLASS}>{bt('Entity ID')}</p>
                              <GlassCombobox
                                value={actionConfig.entityId ?? ''}
                                options={haEntityIds}
                                onChange={(nextValue) => {
                                  onUpdateSection(selectedSection.id, (section) =>
                                    upsertSceneAction(section, scene.id, (current) => ({
                                      ...current,
                                      type: 'service',
                                      entityId: nextValue,
                                    })),
                                  );
                                }}
                                placeholder="light.salone"
                              />
                            </label>
                            <label className="block">
                              <p className={BUILDER_LABEL_CLASS}>{bt('Payload JSON')}</p>
                              <textarea
                                rows={2}
                                value={actionConfig.payloadJson ?? ''}
                                onChange={(event) => {
                                  const nextValue = event.target.value;
                                  onUpdateSection(selectedSection.id, (section) =>
                                    upsertSceneAction(section, scene.id, (current) => ({
                                      ...current,
                                      type: 'service',
                                      payloadJson: nextValue,
                                    })),
                                  );
                                }}
                                placeholder='{"brightness_pct": 35}'
                                className={BUILDER_TEXTAREA_CLASS}
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    );
                  })() : null}

                </div>
              )}
              <button
                type="button"
                onClick={() => onRemoveSection(selectedSection.id)}
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl border border-rose-300/45 bg-rose-500/16 px-4 py-2.5 text-sm font-semibold text-rose-100 hover:bg-rose-500/26"
              >
                <X size={16} />
                {t('builder.removeScenes')}
              </button>
            </>
          ) : selectedSection.kind === 'stack-vertical' ||
            selectedSection.kind === 'stack-horizontal' ||
            selectedSection.kind === 'stack-grid' ? (
            <>
              <div className="space-y-4 overflow-y-auto glass-scrollbar pr-1">
                <label className="block">
                  <p className={BUILDER_LABEL_CLASS}>{bt('Titolo')}</p>
                  <input
                    value={isFavoritesGridTitleLocked ? FAVORITES_GRID_TITLE : selectedSection.title ?? ''}
                    onChange={(event) => {
                      if (isFavoritesGridTitleLocked) {
                        return;
                      }
                      onUpdateSection(selectedSection.id, (section) => ({
                        ...section,
                        title: event.target.value,
                      }));
                    }}
                    disabled={isFavoritesGridTitleLocked}
                    placeholder="Stack"
                    className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-blue-300/60 ${
                      isFavoritesGridTitleLocked
                        ? 'cursor-not-allowed border-emerald-300/25 bg-emerald-500/10 text-emerald-100/80'
                        : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-primary)]'
                    }`}
                  />
                </label>
                {selectedSection.kind !== 'stack-vertical' ? (
                  <label className="block">
                    <p className={BUILDER_LABEL_CLASS}>{bt('Colonne')}</p>
                    <GlassDropdown
                      options={stackCanvasColumnOptions}
                      selected={findDropdownOption(stackCanvasColumnOptions, stackCanvasColumnSelectionId)}
                      onChange={(option) => {
                        if (selectedSection.kind === 'stack-grid' && option.id === 'auto') {
                          onUpdateSection(selectedSection.id, (section) => ({
                            ...section,
                            stackColumnsMode: 'auto',
                          }));
                          return;
                        }
                        const requestedCols = Math.max(
                          STACK_SECTION_MIN_COLUMNS,
                          Math.min(stackColumnOptionMax, Math.round(Number(option.id) || STACK_SECTION_MIN_COLUMNS)),
                        );
                        onUpdateSection(selectedSection.id, (section) => {
                          const safeW = Math.max(
                            STACK_SECTION_MIN_COLUMNS,
                            Math.min(stackColumnOptionMax, requestedCols),
                          );
                          const maxX = Math.max(0, ROOT_CANVAS_COLS - safeW);
                          return {
                            ...section,
                            stackColumns: safeW,
                            ...(section.kind === 'stack-grid'
                              ? {
                                  stackColumnsMode: 'manual' as const,
                                }
                              : {}),
                            layout: {
                              ...section.layout,
                              w: safeW,
                              x: Math.min(section.layout.x, maxX),
                            },
                          };
                        });
                      }}
                    />
                    <p className="mt-2 text-[11px] text-[color:var(--ui-text-secondary)]">
                      {selectedSection.kind === 'stack-grid'
                        ? stackColumnsAutoMode
                          ? bt('Auto: la larghezza viene calcolata dalle card interne.')
                          : bt('Manuale: imposta quante colonne canvas deve occupare lo stack.')
                        : t('builder.stackColumns')}
                    </p>
                  </label>
                ) : null}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSection(selectedSection.id, (section) => ({
                        ...section,
                        stackShowHeader: !(section.stackShowHeader ?? true),
                      }))
                    }
                    className={`rounded-xl border px-3 py-2 text-xs uppercase tracking-[0.16em] transition-colors ${
                      stackShowHeader
                        ? 'liquid-glass-selection border-[color:var(--ui-border-strong)]'
                        : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)] hover:bg-[color:var(--ui-fill-secondary)]'
                    }`}
                  >
                    Header
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSection(selectedSection.id, (section) => ({
                        ...section,
                        stackShowBackground: !(section.stackShowBackground ?? true),
                      }))
                    }
                    className={`rounded-xl border px-3 py-2 text-xs uppercase tracking-[0.16em] transition-colors ${
                      stackShowBackground
                        ? 'liquid-glass-selection border-[color:var(--ui-border-strong)]'
                        : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)] hover:bg-[color:var(--ui-fill-secondary)]'
                    }`}
                  >
                    Background
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSection(selectedSection.id, (section) => ({
                        ...section,
                        stackShowBorder: !(section.stackShowBorder ?? true),
                      }))
                    }
                    className={`rounded-xl border px-3 py-2 text-xs uppercase tracking-[0.16em] transition-colors ${
                      stackShowBorder
                        ? 'liquid-glass-selection border-[color:var(--ui-border-strong)]'
                        : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)] hover:bg-[color:var(--ui-fill-secondary)]'
                    }`}
                  >
                    Border
                  </button>
                  {selectedSection.kind === 'stack-grid' ? (
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateSection(selectedSection.id, (section) => {
                          const nextUseFavoritesGrid = !(section.stackUseFavoritesGrid ?? false);
                          return {
                            ...section,
                            stackUseFavoritesGrid: nextUseFavoritesGrid,
                            ...(nextUseFavoritesGrid ? { title: FAVORITES_GRID_TITLE } : {}),
                          };
                        })
                      }
                      className={`col-span-2 rounded-xl border px-3 py-2 text-xs uppercase tracking-[0.16em] transition-colors ${
                        stackUseFavoritesGrid
                          ? 'border-emerald-300/40 bg-emerald-500/20 text-emerald-100'
                          : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)] hover:bg-[color:var(--ui-fill-secondary)]'
                      }`}
                    >
                      Usa come grid preferiti
                    </button>
                  ) : null}
                </div>
                {selectedSection.kind === 'stack-grid' ? (
                  <p className="text-[11px] text-[color:var(--ui-text-tertiary)]">
                    Crea una vista automatica delle entita con label Home Assistant "preferiti/favorites", senza spostare le card gia presenti nel canvas.
                  </p>
                ) : null}
                <p className="text-[11px] text-[color:var(--ui-text-tertiary)]">
                  {selectedSection.kind === 'stack-vertical'
                    ? bt('Stack verticale con una sola colonna.')
                    : selectedSection.kind === 'stack-horizontal'
                      ? bt('Stack orizzontale: usa la griglia derivata dal canvas.')
                      : stackColumnsAutoMode
                        ? bt('Stack a griglia: larghezza automatica derivata dalle card interne.')
                        : bt('Stack a griglia: larghezza manuale impostata dal pannello.')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRemoveSection(selectedSection.id)}
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl border border-rose-300/45 bg-rose-500/16 px-4 py-2.5 text-sm font-semibold text-rose-100 hover:bg-rose-500/26"
              >
                <X size={16} />
                {t('builder.removeStack')}
              </button>
            </>
          ) : (
            <div className="dashboard-content-surface-soft flex flex-1 items-center justify-center rounded-2xl border-dashed p-6 text-center">
              <p className="text-sm text-[color:var(--ui-text-secondary)]">{bt('Questa sezione non e configurabile.')}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 mt-5 flex flex-col min-h-0">
          <GlassSegmentSelect<'layout' | 'settings' | 'related'>
            ariaLabel="Sezione configurazione card"
            className="mb-3 shrink-0"
            options={[
              { value: 'layout' as const, label: 'Layout' },
              { value: 'settings' as const, label: 'Setting' },
              { value: 'related' as const, label: 'Correlati' },
            ]}
            value={widgetConfigTab}
            onChange={setWidgetConfigTab}
            optionClassName="h-auto py-2 uppercase tracking-[0.16em]"
          />

          {widgetConfigTab === 'layout' ? (
            <div className="flex-1 space-y-4 overflow-y-auto glass-scrollbar pr-1">
              <div className={BUILDER_CONTENT_CARD_CLASS}>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className={BUILDER_LABEL_CLASS}>{bt('Preview live')}</p>
                    <p className="mt-1 text-[11px] text-[color:var(--ui-text-tertiary)]">
                      Dimensione attuale: {layoutPickerWidth} × {layoutPickerHeight}
                      {selectedWidgetCanvasMetrics
                        ? ` · ${selectedWidgetCanvasMetrics.width}×${selectedWidgetCanvasMetrics.height} px`
                        : ''}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-[color:rgb(var(--ui-accent-rgb)/0.34)] bg-[color:rgb(var(--ui-accent-rgb)/0.14)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ui-text-primary)]">
                    {activeLayoutLabel}
                  </span>
                </div>
                <div className="dashboard-content-surface-soft flex min-h-[7rem] items-center justify-center rounded-2xl p-2">
                  <div
                    className="shrink-0 overflow-hidden rounded-[1.45rem] transition-[width,height] duration-200"
                    style={{
                      width: `${layoutPreviewViewportWidthPx}px`,
                      height: `${layoutPreviewViewportHeightPx}px`,
                    }}
                  >
                    <div
                      className="origin-top-left"
                      style={{
                        width: `${layoutPreviewSourceWidthPx}px`,
                        height: `${layoutPreviewSourceHeightPx}px`,
                        transform: `scale(${layoutPreviewScale})`,
                      }}
                    >
                      <WidgetCardRenderer
                        widget={selectedWidgetPreview ?? selectedWidget}
                        dashboardState={state}
                        isEditMode={false}
                        isSelected={false}
                        value={selectedWidgetPreviewValue}
                        sensorHistory={selectedWidgetSensorHistory}
                        onClick={() => undefined}
                        onClimateModeChange={() => undefined}
                        onClimateFanModeChange={() => undefined}
                        onClimatePresetModeChange={() => undefined}
                        onClimateSwingModeChange={() => undefined}
                        onClimateSwingHorizontalModeChange={() => undefined}
                        liveEntity={selectedWidgetLiveEntity}
                        switchConsumptionEntity={
                          selectedWidget.kind === 'switch'
                            ? resolveEntityStateById(haStates, selectedWidget.switchConsumptionEntityId)
                            : undefined
                        }
                        gridBreakpoint={activeGridBreakpoint}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className={BUILDER_CONTENT_CARD_CLASS}>
                <div className="mb-3">
                  <p className={BUILDER_LABEL_CLASS}>{bt('Dimensione')}</p>
                  <p className="mt-1 text-[11px] text-[color:var(--ui-text-tertiary)]">
                    La dimensione decide automaticamente quali elementi mostrare.
                  </p>
                </div>
                {(selectedWidget.kind === 'sensor' || selectedWidget.kind === 'light' || selectedWidget.kind === 'switch' || selectedWidget.kind === 'climate' || selectedWidget.kind === 'alarm' || selectedWidget.kind === 'lock' || selectedWidget.kind === 'cover' || selectedWidget.kind === 'media' || selectedWidget.kind === 'camera' || selectedWidget.kind === 'vacuum') && selectedDisplayVariantOptions.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {selectedDisplayVariantOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => selectedWidget.kind === 'light'
                          ? applyLightVariantSelection(option.targetW, option.targetH)
                          : applyWidgetTypeLayoutSelection(option.targetW, option.targetH)}
                        disabled={!option.isAvailable}
                        className={`min-w-0 rounded-2xl border p-2 text-left transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 ${
                          (selectedWidget.kind === 'climate' || selectedWidget.kind === 'alarm' || selectedWidget.kind === 'lock' || selectedWidget.kind === 'cover' || selectedWidget.kind === 'media' || selectedWidget.kind === 'camera' || selectedWidget.kind === 'vacuum') && option.id === 'expanded' ? 'col-span-2' : ''
                        } ${
                          option.isActive
                            ? 'border-[color:rgb(var(--ui-accent-rgb)/0.58)] bg-[color:rgb(var(--ui-accent-rgb)/0.12)] shadow-[0_12px_26px_rgba(0,0,0,0.18)]'
                            : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] hover:border-[color:var(--ui-border-strong)] hover:bg-[color:var(--ui-fill-secondary)]'
                        }`}
                        aria-pressed={option.isActive}
                        aria-label={`${option.label}, ${option.targetW} per ${option.targetH}`}
                      >
                        {selectedWidgetSkeletonKind === 'light' ? (
                          <LightDisplayVariantSkeleton
                            variant={option.previewVariant}
                            active={option.isActive}
                            disabled={!option.isAvailable}
                          />
                        ) : selectedWidgetSkeletonKind === 'switch' ? (
                          <SwitchDisplayVariantSkeleton
                            variant={option.previewVariant}
                            active={option.isActive}
                            disabled={!option.isAvailable}
                          />
                        ) : selectedWidgetSkeletonKind === 'climate' ? (
                          <ClimateDisplayVariantSkeleton
                            variant={option.previewVariant}
                            active={option.isActive}
                            disabled={!option.isAvailable}
                          />
                        ) : selectedWidgetSkeletonKind === 'alarm' ? (
                          <AlarmDisplayVariantSkeleton
                            variant={option.previewVariant}
                            active={option.isActive}
                            disabled={!option.isAvailable}
                          />
                        ) : selectedWidgetSkeletonKind === 'lock' ? (
                          <LockDisplayVariantSkeleton
                            variant={option.previewVariant}
                            active={option.isActive}
                            disabled={!option.isAvailable}
                          />
                        ) : selectedWidgetSkeletonKind === 'cover' ? (
                          <CoverDisplayVariantSkeleton
                            variant={option.previewVariant}
                            active={option.isActive}
                            disabled={!option.isAvailable}
                            hasTilt={selectedCoverHasTilt}
                            supportsPosition={selectedCoverSupportsPosition}
                            position={cover.position}
                            tiltPosition={cover.tiltPosition}
                          />
                        ) : selectedWidgetSkeletonKind === 'media' ? (
                          <MediaDisplayVariantSkeleton
                            variant={option.previewVariant}
                            active={option.isActive}
                            disabled={!option.isAvailable}
                          />
                        ) : selectedWidgetSkeletonKind === 'camera' ? (
                          <CameraDisplayVariantSkeleton
                            variant={option.previewVariant}
                            active={option.isActive}
                            disabled={!option.isAvailable}
                          />
                        ) : selectedWidgetSkeletonKind === 'vacuum' ? (
                          <VacuumDisplayVariantSkeleton
                            variant={option.previewVariant}
                            active={option.isActive}
                            disabled={!option.isAvailable}
                          />
                        ) : (
                          <SensorDisplayVariantSkeleton
                            variant={option.previewVariant}
                            active={option.isActive}
                            disabled={!option.isAvailable}
                          />
                        )}
                        <span className="mt-2 flex min-w-0 items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-xs font-semibold text-[color:var(--ui-text-primary)]">
                            {option.label}
                          </span>
                          <span className="shrink-0 text-[10px] font-semibold text-[color:var(--ui-text-tertiary)]">
                            {option.targetW}×{option.targetH}
                            {selectedWidget.kind === 'light' && selectedLightAutoExpand && 'expandedH' in option
                              ? ` → ${option.targetW}×${option.expandedH}`
                              : ''}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-[10px] text-[color:var(--ui-text-tertiary)]">
                          {option.isAvailable ? t(option.descriptionKey) : t('builder.variant.unavailable')}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}

                {selectedWidget.kind === 'light' ? (
                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-[color:var(--ui-separator)] pt-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-[color:var(--ui-text-secondary)]">{bt('Espansione automatica')}</p>
                      <p className="mt-0.5 text-[10px] text-[color:var(--ui-text-tertiary)]">
                        {selectedLightAutoExpand
                          ? `Spenta ${layoutPickerWidth}×${selectedLightOffHeight} → Accesa ${layoutPickerWidth}×${selectedLightOnHeight}`
                          : `Dimensione fissa ${layoutPickerWidth}×${layoutPickerHeight}`}
                      </p>
                    </div>
                    {renderAppleSwitch({
                      checked: selectedLightAutoExpand,
                      onChange: handleLightAutoExpandChange,
                      label: bt('Espansione automatica luce'),
                    })}
                  </div>
                ) : null}

                <div className="mt-3 flex items-center gap-2 border-t border-[color:var(--ui-separator)] pt-3">
                  <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-[color:var(--ui-text-tertiary)]">{bt('Applica a')}</span>
                  <GlassSegmentSelect
                    ariaLabel="Applica dimensione"
                    className="min-w-0 flex-1"
                    options={[
                      { value: 'widget' as const, label: <span className="block truncate">{bt('Questa card')}</span>, ariaLabel: bt('Applica solo alla card selezionata') },
                      { value: 'type' as const, label: <span className="block truncate">{bt('Tutte')}</span>, ariaLabel: bt('Applica a tutte le card dello stesso tipo') },
                    ]}
                    value={layoutApplyScope}
                    onChange={handleLayoutApplyScopeChange}
                    optionClassName="h-auto px-2 py-1.5 text-[11px]"
                  />
                </div>
              </div>

              <details className="dashboard-content-surface group rounded-2xl p-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-1 py-1 text-left [&::-webkit-details-marker]:hidden">
                  <span>
                    <span className="block text-xs uppercase tracking-[0.16em] text-[color:var(--ui-text-secondary)]">{bt('Avanzato')}</span>
                    <span className="mt-1 block text-[11px] text-[color:var(--ui-text-tertiary)]">{bt('Controllo manuale colonne × righe')}</span>
                  </span>
                  <span className="liquid-glass-control inline-flex h-11 w-11 shrink-0 items-center justify-center text-[color:var(--ui-text-secondary)] transition group-open:rotate-180">
                    <ChevronDown size={14} strokeWidth={2.2} />
                  </span>
                </summary>
                <div className="mt-3">
                  <div className={`${BUILDER_CONTENT_CARD_SOFT_CLASS} space-y-3`}>
                    <div>
                      <div className="mb-2">
                        <span className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--ui-text-tertiary)]">{bt('Colonne')}</span>
                      </div>
                      <div
                        className="grid w-full gap-1.5"
                        style={{
                          gridTemplateColumns: `repeat(${layoutEditorCols}, minmax(0, 1fr))`,
                          ...(layoutGridCompactMaxWidth
                            ? { maxWidth: `${layoutGridCompactMaxWidth}px`, marginInline: 'auto' }
                            : null),
                        }}
                      >
                        {Array.from({ length: layoutEditorCols }).map((_, colIndex) => {
                          const nextWidth = colIndex + 1;
                          const isSelectedColumn = nextWidth === layoutPickerWidth;
                          const isInsideSelection = nextWidth <= layoutPickerWidth;
                          return (
                            <button
                              key={`layout-col-${nextWidth}`}
                              type="button"
                              onClick={() => applyWidgetTypeLayoutSelection(nextWidth, layoutPickerHeight)}
                              className={`aspect-square rounded-[0.55rem] border transition-all active:scale-[0.94] ${
                                isSelectedColumn
                                  ? 'border-[color:rgb(var(--ui-accent-rgb)/0.72)] bg-[color:rgb(var(--ui-accent-rgb)/0.46)] shadow-[0_0_14px_rgb(var(--ui-accent-rgb)/0.28)]'
                                  : isInsideSelection
                                    ? 'border-[color:rgb(var(--ui-accent-rgb)/0.32)] bg-[color:rgb(var(--ui-accent-rgb)/0.18)]'
                                    : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] hover:border-[color:var(--ui-border-strong)] hover:bg-[color:var(--ui-fill-secondary)]'
                              }`}
                        aria-label={t('builder.setWidth', { count: nextWidth })}
                            />
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <div className="mb-2">
                        <span className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--ui-text-tertiary)]">{bt('Righe')}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {WIDGET_LAYOUT_HEIGHT_SCALE_OPTIONS.map((option) => {
                          const active = option.h === layoutPickerHeight;
                          return (
                            <button
                              key={option.label}
                              type="button"
                              onClick={() => applyWidgetTypeLayoutSelection(layoutPickerWidth, option.h)}
                              className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all active:scale-[0.96] ${
                                active
                                  ? 'liquid-segmented-option-active border-transparent'
                                  : 'liquid-segmented-option-inactive border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] hover:border-[color:var(--ui-border-strong)] hover:bg-[color:var(--ui-fill-secondary)]'
                              }`}
                              aria-pressed={active}
                        aria-label={t('builder.setHeight', { height: option.label })}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={resetWidgetTypeLayoutSelection}
                      className="glass-button min-h-11 rounded-full px-3 text-[11px] font-semibold uppercase tracking-[0.14em] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-45"
                      disabled={!canResetLayout}
                    >
                      Torna ad Auto
                    </button>
                  </div>
                </div>
              </details>

            </div>
          ) : null}
          <div className={widgetConfigTab === 'settings' ? 'contents' : 'hidden'}>
          <div className="space-y-4 overflow-y-auto glass-scrollbar pr-1">
            <label className="block">
              <p className={BUILDER_LABEL_CLASS}>{bt('Titolo')}</p>
              <input
                value={selectedWidget.title}
                onChange={(event) =>
                  onUpdateWidget(selectedWidget.id, (widget) => ({
                    ...widget,
                    title: event.target.value,
                  }))
                }
                className={BUILDER_INPUT_CLASS}
              />
            </label>
            <label className="block" data-tour-target="builder-entity">
              <p className={BUILDER_LABEL_CLASS}>{bt('Entita')}</p>
              <GlassCombobox
                value={selectedWidget.entityId}
                options={entitySuggestions}
                onChange={(nextValue) =>
                  onUpdateWidget(selectedWidget.id, (widget) => ({
                    ...widget,
                    entityId: nextValue,
                    dataSource: resolveCardDataSource({
                      entityId: nextValue,
                      homeAssistantEntityIds: haEntityIds,
                      demoEntityIds: entityOptions[widget.kind] ?? [],
                    }),
                  }))
                }
                placeholder="Es. light.sala, climate.ac"
              />
              <p className={BUILDER_HELPER_CLASS}>
                {haConnected && liveEntitySuggestions.length > 0
                  ? bt('Suggerimenti live dalle entita disponibili in Home Assistant.')
                  : staticSuggestions.length > 0
                    ? bt('Entita dimostrative disponibili esclusivamente nella Demo.')
                    : bt('Digita un entity ID oppure verifica la connessione a Home Assistant.')}
              </p>
            </label>
            {selectedWidget.kind === 'switch' ? (
              <label className="block">
                <p className={BUILDER_LABEL_CLASS}>{bt('Entita consumo')}</p>
                <GlassCombobox
                  value={selectedWidget.switchConsumptionEntityId ?? ''}
                  options={switchConsumptionSuggestions}
                  onChange={(nextValue) =>
                    onUpdateWidget(selectedWidget.id, (widget) => ({
                      ...widget,
                      switchConsumptionEntityId: nextValue.trim() || undefined,
                    }))
                  }
                  placeholder="Es. sensor.presa_potenza"
                />
              </label>
            ) : null}
            {selectedWidget.kind === 'sensor' ? (
              <>
                <label className="block">
                  <p className={BUILDER_LABEL_CLASS}>{bt('Decimali visualizzati')}</p>
                  <GlassDropdown
                    options={localizedSensorPrecisionOptions}
                    selected={findDropdownOption(
                      localizedSensorPrecisionOptions,
                      typeof selectedWidget.sensorDisplayPrecision === 'number'
                        ? String(selectedWidget.sensorDisplayPrecision)
                        : 'auto',
                    )}
                    onChange={(option) =>
                      onUpdateWidget(selectedWidget.id, (widget) => ({
                        ...widget,
                        sensorDisplayPrecision:
                          option.id === 'auto' ? undefined : Number(option.id),
                      }))
                    }
                  />
                  <p className={BUILDER_HELPER_CLASS}>
                    {bt('Automatico usa la precisione suggerita da Home Assistant o il default del device class.')}
                  </p>
                </label>
                <div className={BUILDER_CONTENT_CARD_SOFT_CLASS}>
                  <p className="text-[11px] text-[color:var(--ui-text-secondary)]">
                    {bt('Entita opzionali per metadati sensore. Se lasci vuoto, il pannello contestuale prova a leggere batteria, stato e connessione dagli attributi dell\'entita principale.')}
                  </p>
                </div>
                <label className="block">
                  <p className={BUILDER_LABEL_CLASS}>{bt('Entita batteria')}</p>
                  <GlassCombobox
                    value={selectedWidget.sensorBatteryEntityId ?? ''}
                    options={sensorBatterySuggestions}
                    onChange={(nextValue) =>
                      onUpdateWidget(selectedWidget.id, (widget) => ({
                        ...widget,
                        sensorBatteryEntityId: nextValue,
                      }))
                    }
                    placeholder="Es. sensor.living_room_sensor_battery"
                  />
                </label>
                <label className="block">
                  <p className={BUILDER_LABEL_CLASS}>{bt('Entita stato')}</p>
                  <GlassCombobox
                    value={selectedWidget.sensorStatusEntityId ?? ''}
                    options={sensorMetaSuggestions}
                    onChange={(nextValue) =>
                      onUpdateWidget(selectedWidget.id, (widget) => ({
                        ...widget,
                        sensorStatusEntityId: nextValue,
                      }))
                    }
                    placeholder="Es. binary_sensor.sensor_status"
                  />
                </label>
                <label className="block">
                  <p className={BUILDER_LABEL_CLASS}>{bt('Entita connessione')}</p>
                  <GlassCombobox
                    value={selectedWidget.sensorConnectionEntityId ?? ''}
                    options={sensorMetaSuggestions}
                    onChange={(nextValue) =>
                      onUpdateWidget(selectedWidget.id, (widget) => ({
                        ...widget,
                        sensorConnectionEntityId: nextValue,
                      }))
                    }
                    placeholder="Es. binary_sensor.sensor_connected"
                  />
                </label>
              </>
            ) : null}
            {selectedWidget.kind === 'lock' ? (
              <>
                <div className={BUILDER_CONTENT_CARD_SOFT_CLASS}>
                  <p className="text-[11px] text-[color:var(--ui-text-secondary)]">{t('builder.autoTelemetry')}</p>
                </div>
                <label className="block">
                  <p className={BUILDER_LABEL_CLASS}>{bt('Override batteria')}</p>
                  <GlassCombobox
                    value={selectedWidget.lockBatteryEntityId ?? ''}
                    options={sensorBatterySuggestions}
                    onChange={(nextValue) =>
                      onUpdateWidget(selectedWidget.id, (widget) => ({
                        ...widget,
                        lockBatteryEntityId: nextValue.trim() || undefined,
                      }))
                    }
                    placeholder="Automatico"
                  />
                </label>
                <label className="block">
                  <p className={BUILDER_LABEL_CLASS}>{bt('Override connessione')}</p>
                  <GlassCombobox
                    value={selectedWidget.lockConnectionEntityId ?? ''}
                    options={sensorMetaSuggestions}
                    onChange={(nextValue) =>
                      onUpdateWidget(selectedWidget.id, (widget) => ({
                        ...widget,
                        lockConnectionEntityId: nextValue.trim() || undefined,
                      }))
                    }
                    placeholder="Automatico"
                  />
                </label>
              </>
            ) : null}
            {(selectedWidget.kind === 'alarm' || selectedWidget.kind === 'lock') &&
            dashboardSecurity.can('manage_security_config') &&
            !sensitiveGate.isUnlocked ? (
              <button
                type="button"
                onClick={() => {
                  void sensitiveGate.authorize({
                    action: 'view_security_codes',
                    capability: 'manage_security_config',
                    title: bt('Sbloccare i codici di sicurezza?'),
                    description: bt('I codici resteranno accessibili soltanto fino al refresh o alla chiusura della pagina.'),
                  });
                }}
                className="dashboard-content-surface w-full rounded-2xl p-4 text-left transition hover:border-[color:var(--ui-border-strong)]"
              >
                <span className="block text-sm font-semibold text-[color:var(--ui-text-primary)]">{bt('Sblocca configurazione sicurezza')}</span>
                <span className="mt-1 block text-[11px] leading-snug text-[color:var(--ui-text-tertiary)]">
                  {t('builder.deviceConfirmationHint')}
                </span>
              </button>
            ) : null}
            {selectedWidget.kind === 'alarm' && sensitiveGate.isUnlocked ? (
              <div className="space-y-3">
                <div className={BUILDER_CONTENT_CARD_SOFT_CLASS}>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--ui-text-secondary)]">{bt('Come funziona')}</p>
                  <p className={BUILDER_HELPER_CLASS}>
                    {bt('Di base la dashboard usa il PIN Home Assistant. Se aggiungi un codice extra locale, nel popup inserirai PIN HA + codice extra: ad Home Assistant verra inviato solo il PIN HA. L\'autenticazione dispositivo, se attiva, viene provata per prima.')}
                  </p>
                </div>
                <label className="block">
                  <p className={BUILDER_LABEL_CLASS}>{bt('PIN Home Assistant')}</p>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={selectedWidgetSecrets.values.alarmUnlockCode ?? ''}
                    onChange={(event) =>
                      setWidgetSecrets(
                        selectedWidget.id,
                        { alarmUnlockCode: event.target.value.slice(0, 24) },
                        typeof window === 'undefined' ? undefined : window.localStorage,
                      )
                    }
                    placeholder="Es. 1234"
                    className={BUILDER_INPUT_CLASS}
                  />
                  <p className={BUILDER_HELPER_CLASS}>
                    {bt('Conservato solo fino al refresh. Puoi scegliere sotto se ricordarlo su questo dispositivo.')}
                  </p>
                </label>
                <label className="block">
                  <p className={BUILDER_LABEL_CLASS}>{bt('Codice extra locale')}</p>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={selectedWidgetSecrets.values.alarmLocalExtraCode ?? ''}
                    onChange={(event) =>
                      setWidgetSecrets(
                        selectedWidget.id,
                        { alarmLocalExtraCode: event.target.value.slice(0, 12) },
                        typeof window === 'undefined' ? undefined : window.localStorage,
                      )
                    }
                    placeholder="Opzionale"
                    className={BUILDER_INPUT_CLASS}
                  />
                  <p className={BUILDER_HELPER_CLASS}>
                    {t('builder.extraCodeHint')}
                  </p>
                </label>
                <div className="dashboard-content-surface-soft flex items-center justify-between gap-3 rounded-2xl px-3 py-3">
                  <span className="min-w-0">
                    <span className="block text-xs uppercase tracking-[0.16em] text-[color:var(--ui-text-secondary)]">{t('builder.deviceConfirmation')}</span>
                    <span className="mt-1 block text-[11px] leading-snug text-[color:var(--ui-text-tertiary)]">
                      {bt('Usa Windows Hello, Face ID, impronta o passkey come metodo rapido prima del PIN allarme.')}
                    </span>
                  </span>
                  {renderAppleSwitch({
                    checked: selectedWidget.alarmRequireAuthToDisarm ?? false,
                    label: t('builder.enableAlarmConfirmation'),
                    onChange: (nextChecked) =>
                      onUpdateWidget(selectedWidget.id, (widget) => ({
                        ...widget,
                        alarmRequireAuthToDisarm: nextChecked,
                      })),
                  })}
                </div>
              </div>
            ) : null}
            {selectedWidget.kind === 'lock' && sensitiveGate.isUnlocked ? (
              <div className="space-y-3">
                <label className="block">
                  <p className={BUILDER_LABEL_CLASS}>{bt('Codice Home Assistant serratura')}</p>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={selectedWidgetSecrets.values.lockCode ?? ''}
                    onChange={(event) =>
                      setWidgetSecrets(
                        selectedWidget.id,
                        { lockCode: event.target.value.slice(0, 24) },
                        typeof window === 'undefined' ? undefined : window.localStorage,
                      )
                    }
                    placeholder="Es. 1234"
                    className={BUILDER_INPUT_CLASS}
                  />
                  <p className={BUILDER_HELPER_CLASS}>
                    {bt('Viene inviato ad Home Assistant solo quando richiesto. Per default si cancella al refresh.')}
                  </p>
                </label>
                <div className="dashboard-content-surface-soft flex items-center justify-between gap-3 rounded-2xl px-3 py-3">
                  <span className="min-w-0">
                    <span className="block text-xs uppercase tracking-[0.16em] text-[color:var(--ui-text-secondary)]">{t('builder.deviceConfirmation')}</span>
                    <span className="mt-1 block text-[11px] leading-snug text-[color:var(--ui-text-tertiary)]">
                      {bt('Prova prima Face ID, impronta, PIN dispositivo o passkey; se non riesce, richiede il codice serratura configurato.')}
                    </span>
                  </span>
                  {renderAppleSwitch({
                    checked: selectedWidget.lockRequireAuthToUnlock ?? false,
                    label: t('builder.enableLockConfirmation'),
                    onChange: (nextChecked) =>
                      onUpdateWidget(selectedWidget.id, (widget) => ({
                        ...widget,
                        lockRequireAuthToUnlock: nextChecked,
                      })),
                  })}
                </div>
              </div>
            ) : null}
            {(selectedWidget.kind === 'alarm' || selectedWidget.kind === 'lock') && sensitiveGate.isUnlocked ? (
              <div className="dashboard-content-surface-soft flex items-center justify-between gap-3 rounded-2xl px-3 py-3">
                <span className="min-w-0">
                  <span className="block text-xs uppercase tracking-[0.16em] text-[color:var(--ui-text-secondary)]">{bt('Ricorda su questo dispositivo')}</span>
                  <span className="mt-1 block text-[11px] leading-snug text-[color:var(--ui-text-tertiary)]">
                    {t('builder.localCodeWarning')}
                  </span>
                </span>
                {renderAppleSwitch({
                  checked: selectedWidgetSecrets.rememberOnDevice,
                  label: bt('Ricorda i codici di questa card sul dispositivo'),
                  onChange: (nextChecked) =>
                    setWidgetSecretsRemembered(
                      selectedWidget.id,
                      nextChecked,
                      typeof window === 'undefined' ? undefined : window.localStorage,
                    ),
                })}
              </div>
            ) : null}
            {selectedWidget.kind === 'alarm' || selectedWidget.kind === 'lock' ? (
              <div className={`${BUILDER_CONTENT_CARD_CLASS} space-y-3`}>
                <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--ui-text-secondary)]">{bt('Attivita recente')}</p>
                <label className="block">
                  <p className={BUILDER_LABEL_CLASS}>{bt('Elementi visibili')}</p>
                  <input
                    type="number"
                    min={MIN_ACTIVITY_LOG_ENTRIES}
                    max={MAX_ACTIVITY_LOG_ENTRIES}
                    step={1}
                    value={selectedWidget.activityLogLimit ?? DEFAULT_ACTIVITY_LOG_ENTRIES}
                    onChange={(event) =>
                      onUpdateWidget(selectedWidget.id, (widget) => ({
                        ...widget,
                        activityLogLimit: clampActivityLogEntries(Number(event.target.value) || DEFAULT_ACTIVITY_LOG_ENTRIES),
                      }))
                    }
                    className={BUILDER_INPUT_CLASS}
                  />
                </label>
                <label className="block">
                  <p className={BUILDER_LABEL_CLASS}>{bt('Finestra storico (ore)')}</p>
                  <input
                    type="number"
                    min={MIN_ACTIVITY_LOG_HOURS}
                    max={MAX_ACTIVITY_LOG_HOURS}
                    step={1}
                    value={selectedWidget.activityLogHours ?? DEFAULT_ACTIVITY_LOG_HOURS}
                    onChange={(event) =>
                      onUpdateWidget(selectedWidget.id, (widget) => ({
                        ...widget,
                        activityLogHours: clampActivityLogHours(Number(event.target.value) || DEFAULT_ACTIVITY_LOG_HOURS),
                      }))
                    }
                    className={BUILDER_INPUT_CLASS}
                  />
                </label>
                <p className="text-[11px] text-[color:var(--ui-text-tertiary)]">
                  {t('builder.historyHint')}
                </p>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onRemoveSelectedWidget}
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl border border-rose-300/45 bg-rose-500/16 px-4 py-2.5 text-sm font-semibold text-rose-100 hover:bg-rose-500/26"
          >
            <X size={16} />
            {t('builder.removeCard')}
          </button>
        </div>
          {widgetConfigTab === 'related' ? (
            <div className="flex-1 space-y-4 overflow-y-auto glass-scrollbar pr-1">
              <div className={BUILDER_CONTENT_CARD_CLASS}>
                <div>
                  <p className={BUILDER_LABEL_CLASS}>{bt('Dispositivi correlati')}</p>
                  <p className="mt-1 text-[11px] text-[color:var(--ui-text-tertiary)]">
                    {t('builder.micro.addDescription')}
                  </p>
                </div>

                <div className="dashboard-content-surface-soft mt-3 rounded-2xl p-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--ui-text-secondary)]">{bt('Anteprima pannello live')}</p>
                  <div className="mt-2 grid grid-cols-1 min-[420px]:grid-cols-2 gap-2.5">
                    {microWidgets.map((microWidget, microWidgetIndex) => {
                      const fallbackLabel = microWidget.label?.trim() || `Widget ${microWidgetIndex + 1}`;
                      const livePreviewState = resolveEntityStateById(haStates, microWidget.entity);
                      const livePreviewHistory = resolveEntityHistoryById(microChartHistoryByEntity, microWidget.entity);
                      const previewState =
                        livePreviewState ??
                        buildFallbackMicroWidgetState(microWidget.type, fallbackLabel);
                      const isSelected = selectedMicroWidgetId === microWidget.id;
                      const previewFrameRadius = microWidget.type === 'value_pill' ? 'rounded-full' : 'rounded-2xl';
                      return (
                        <button
                          key={`preview-grid-${microWidget.id}`}
                          type="button"
                          onClick={() => setSelectedMicroWidgetId(microWidget.id)}
                          className={`relative w-full text-left transition-all ${
                            isSelected ? 'scale-[1.01]' : 'hover:scale-[1.005]'
                          }`}
                          aria-label={t('builder.configureNamed', { name: fallbackLabel })}
                          title={t('builder.configureNamed', { name: fallbackLabel })}
                        >
                          <div
                            className={`${previewFrameRadius} overflow-hidden transition-all ${
                              isSelected
                                ? 'ring-1 ring-blue-300/55 shadow-[0_0_0_1px_rgba(147,197,253,0.18),0_10px_28px_rgba(37,99,235,0.25)]'
                                : 'ring-1 ring-transparent hover:ring-[color:var(--ui-border-strong)]'
                            }`}
                          >
                            <div className="pointer-events-none">{renderMicroWidgetPreview(microWidget, previewState, livePreviewHistory)}</div>
                          </div>
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => {
                        if (!isMicroWidgetCatalogOpen) {
                          setMicroWidgetCatalogEntity('');
                          setMicroWidgetCatalogDomainFilter('all');
                        }
                        setIsMicroWidgetCatalogOpen((current) => !current);
                      }}
                      className={`min-h-11 rounded-2xl border border-dashed bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)] transition-colors ${
                        isMicroWidgetCatalogOpen
                          ? 'liquid-glass-selection border-[color:var(--ui-border-strong)]'
                          : 'border-[color:var(--ui-border)] hover:border-[color:var(--ui-border-strong)] hover:bg-[color:var(--ui-fill-secondary)] hover:text-[color:var(--ui-text-primary)]'
                      }`}
                            aria-label={t('builder.micro.openCatalog')}
                            title={t('builder.micro.openCatalog')}
                    >
                      <span className="flex h-full items-center justify-center">
                        <Plus size={18} />
                      </span>
                    </button>
                  </div>
                </div>

                {microWidgets.length > 0 ? (
                  <div className="mt-3 space-y-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--ui-text-secondary)]">{bt('Configurazione widget selezionato')}</p>
                    {selectedMicroWidget ? (
                      <div key={selectedMicroWidget.id} className={BUILDER_CONTENT_CARD_SOFT_CLASS}>
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--ui-text-tertiary)]">
                            Micro-widget {selectedMicroWidgetIndex >= 0 ? selectedMicroWidgetIndex + 1 : 1}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              const nextSelection =
                                microWidgets.find((entry) => entry.id !== selectedMicroWidget.id)?.id ?? null;
                              setSelectedMicroWidgetId(nextSelection);
                              onUpdateWidget(selectedWidget.id, (widget) => {
                                const nextWidgets = (widget.widgets ?? []).filter(
                                  (entry) => entry.id !== selectedMicroWidget.id,
                                );
                                return {
                                  ...widget,
                                  widgets: nextWidgets.length > 0 ? nextWidgets : undefined,
                                };
                              });
                            }}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-300/30 bg-rose-500/12 text-rose-100 transition-colors hover:bg-rose-500/20"
                            aria-label={t('builder.micro.remove')}
                            title={t('builder.micro.remove')}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 gap-3">
                          {selectedMicroWidget.type === 'micro_button' ? (
                            <label className="block">
                              <p className={BUILDER_LABEL_CLASS}>{bt('Funzione')}</p>
                              <GlassSegmentSelect
                                ariaLabel="Funzione micro pulsante"
                                options={[
                                  { value: 'switch' as const, label: 'Switch' },
                                  { value: 'push' as const, label: 'Push' },
                                  { value: 'page' as const, label: 'Page' },
                                ]}
                                value={selectedMicroButtonMode ?? 'switch'}
                                onChange={(mode) =>
                                  onUpdateWidget(selectedWidget.id, (widget) => ({
                                    ...widget,
                                    widgets: (widget.widgets ?? []).map((entry) => {
                                      if (entry.id !== selectedMicroWidget.id) return entry;
                                      return {
                                        ...entry,
                                        buttonMode: mode,
                                        buttonPagePath:
                                          mode === 'page'
                                            ? entry.buttonPagePath?.trim() || defaultMicroWidgetPagePath
                                            : entry.buttonPagePath,
                                        buttonHoldWhilePressed:
                                          mode === 'push'
                                            ? entry.buttonHoldWhilePressed ?? false
                                            : entry.buttonHoldWhilePressed,
                                      };
                                    }),
                                  }))
                                }
                                optionClassName="h-auto px-2.5 py-2 text-sm font-medium"
                              />
                            </label>
                          ) : null}

                          {selectedMicroButtonMode !== 'page' ? (
                            <label className="block">
                              <p className={BUILDER_LABEL_CLASS}>{bt('Entita')}</p>
                              <GlassCombobox
                                value={selectedMicroWidget.entity}
                                options={microWidgetEntityOptions}
                                onChange={(nextValue) =>
                                  onUpdateWidget(selectedWidget.id, (widget) => ({
                                    ...widget,
                                    widgets: (widget.widgets ?? []).map((entry) =>
                                      entry.id === selectedMicroWidget.id
                                        ? { ...entry, entity: nextValue }
                                        : entry,
                                    ),
                                  }))
                                }
                                placeholder="Es. sensor.bollitore_temperature"
                              />
                            </label>
                          ) : null}

                          {selectedMicroButtonMode === 'push' ? (
                            <label className="block">
                              <p className={BUILDER_LABEL_CLASS}>{bt('Invio segnale')}</p>
                              <div className="dashboard-content-surface-soft flex min-h-11 items-center justify-between gap-3 rounded-xl px-3 py-2.5">
                                <span className="text-left text-sm text-[color:var(--ui-text-primary)]">
                                  Mantieni il segnale finche il dito resta premuto
                                </span>
                                <GlassToggle
                                  checked={selectedMicroWidget.buttonHoldWhilePressed === true}
                                  onChange={(buttonHoldWhilePressed) =>
                                    onUpdateWidget(selectedWidget.id, (widget) => ({
                                      ...widget,
                                      widgets: (widget.widgets ?? []).map((entry) =>
                                        entry.id === selectedMicroWidget.id
                                          ? { ...entry, buttonHoldWhilePressed }
                                          : entry,
                                      ),
                                    }))
                                  }
                                  label="Mantieni segnale durante pressione"
                                />
                              </div>
                            </label>
                          ) : null}

                          {selectedMicroButtonMode === 'page' ? (
                            <label className="block">
                              <p className={BUILDER_LABEL_CLASS}>{bt('Pagina destinazione')}</p>
                              <div className="dashboard-content-surface-soft rounded-xl p-2">
                                <div className="max-h-32 overflow-y-auto glass-scrollbar space-y-1">
                                  {microWidgetPageOptions.map((path) => {
                                    const pathLabel = microWidgetPathLabelByPath.get(path);
                                    const optionLabel = pathLabel && pathLabel.length > 0 ? `${pathLabel}  ${path}` : path;
                                    const isPathSelected =
                                      (selectedMicroWidget.buttonPagePath?.trim() || defaultMicroWidgetPagePath) === path;
                                    return (
                                      <button
                                        key={path}
                                        type="button"
                                        onClick={() =>
                                          onUpdateWidget(selectedWidget.id, (widget) => ({
                                            ...widget,
                                            widgets: (widget.widgets ?? []).map((entry) =>
                                              entry.id === selectedMicroWidget.id
                                                ? { ...entry, buttonPagePath: path }
                                                : entry,
                                            ),
                                          }))
                                        }
                                        className={`w-full rounded-lg border px-2.5 py-2 text-left text-sm transition-colors ${
                                          isPathSelected
                                            ? 'liquid-glass-selection border-[color:var(--ui-border-strong)]'
                                            : 'border-transparent bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)] hover:border-[color:var(--ui-border)] hover:bg-[color:var(--ui-fill-secondary)]'
                                        }`}
                                      >
                                        {optionLabel}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                              <GlassCombobox
                                value={selectedMicroWidget.buttonPagePath?.trim() || defaultMicroWidgetPagePath}
                                options={microWidgetPageOptions}
                                onChange={(nextValue) =>
                                  onUpdateWidget(selectedWidget.id, (widget) => ({
                                    ...widget,
                                    widgets: (widget.widgets ?? []).map((entry) =>
                                      entry.id === selectedMicroWidget.id
                                        ? { ...entry, buttonPagePath: nextValue }
                                        : entry,
                                    ),
                                  }))
                                }
                                placeholder="/home"
                                className="mt-2"
                              />
                            </label>
                          ) : null}

                          {selectedMicroWidget.type === 'micro_slider' ? (
                            <label className="block">
                              <p className={BUILDER_LABEL_CLASS}>{bt('Invio valore')}</p>
                              <div className="dashboard-content-surface-soft flex min-h-11 items-center justify-between gap-3 rounded-xl px-3 py-2.5">
                                <span className="text-left text-sm text-[color:var(--ui-text-primary)]">
                                  Invia solo al rilascio
                                </span>
                                <GlassToggle
                                  checked={selectedMicroSliderSendOnRelease}
                                  onChange={(sliderSendOnRelease) =>
                                    onUpdateWidget(selectedWidget.id, (widget) => ({
                                      ...widget,
                                      widgets: (widget.widgets ?? []).map((entry) =>
                                        entry.id === selectedMicroWidget.id
                                          ? { ...entry, sliderSendOnRelease }
                                          : entry,
                                      ),
                                    }))
                                  }
                                  label="Invia solo quando rilasci lo slider"
                                />
                              </div>
                            </label>
                          ) : null}

                          {selectedMicroWidget.type === 'micro_superchart' ? (
                            <label className="block">
                              <p className={BUILDER_LABEL_CLASS}>{bt('Tipo grafico')}</p>
                              <GlassSegmentSelect
                                ariaLabel="Tipo grafico"
                                options={[
                                  { value: 'line' as const, label: 'Line' },
                                  { value: 'area' as const, label: 'Area' },
                                  { value: 'bar' as const, label: 'Bar' },
                                ]}
                                value={selectedMicroSuperChartType}
                                onChange={(chartType) =>
                                  onUpdateWidget(selectedWidget.id, (widget) => ({
                                    ...widget,
                                    widgets: (widget.widgets ?? []).map((entry) =>
                                      entry.id === selectedMicroWidget.id
                                        ? { ...entry, superChartType: chartType }
                                        : entry,
                                    ),
                                  }))
                                }
                                optionClassName="h-auto px-2.5 py-2 text-sm font-medium"
                              />
                            </label>
                          ) : null}

                          <label className="block">
                            <p className={BUILDER_LABEL_CLASS}>Label</p>
                            <input
                              value={selectedMicroWidget.label ?? ''}
                              onChange={(event) =>
                                onUpdateWidget(selectedWidget.id, (widget) => ({
                                  ...widget,
                                  widgets: (widget.widgets ?? []).map((entry) =>
                                    entry.id === selectedMicroWidget.id
                                      ? { ...entry, label: event.target.value || undefined }
                                      : entry,
                                  ),
                                }))
                              }
                              placeholder="Es. Bollitore"
                              className={BUILDER_INPUT_CLASS}
                            />
                          </label>
                        </div>
                      </div>
                    ) : (
                      <div className="dashboard-content-surface-soft rounded-2xl border-dashed px-3 py-3 text-sm text-[color:var(--ui-text-secondary)]">
                        {t('builder.micro.selectPreview')}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {isEditMode && selectedWidget ? (
        <GlassModal
          isOpen={isMicroWidgetCatalogOpen}
          onClose={() => setIsMicroWidgetCatalogOpen(false)}
          eyebrow="Catalogo micro-widget"
          title={t('builder.micro.addRelated')}
          variant="responsive"
          size="xl"
          zIndex={220}
          closeLabel={t('builder.micro.closeCatalog')}
          bodyClassName="pr-1"
        >
                <div>
                  <label className="block">
                    <p className={BUILDER_LABEL_CLASS}>{bt('Entita da associare')}</p>
                    <input
                      value={microWidgetCatalogEntity}
                      onChange={(event) => setMicroWidgetCatalogEntity(event.target.value)}
                      placeholder="Es. switch.bedside_lamp"
                      className={BUILDER_INPUT_CLASS}
                    />
                    <p className={BUILDER_HELPER_CLASS}>
                      Scrivi per filtrare le entita o seleziona dalla lista ordinata qui sotto.
                    </p>
                  </label>

                  <div className="dashboard-content-surface mt-3 rounded-2xl p-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setMicroWidgetCatalogDomainFilter('all')}
                        className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] transition-colors ${
                          microWidgetCatalogDomainFilter === 'all'
                            ? 'liquid-glass-selection border-[color:var(--ui-border-strong)]'
                            : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)] hover:border-[color:var(--ui-border-strong)] hover:text-[color:var(--ui-text-primary)]'
                        }`}
                      >
                        Tutti ({microWidgetEntityOptions.length})
                      </button>
                      {catalogEntityDomainOptions.map(([domain, count]) => (
                        <button
                          key={domain}
                          type="button"
                          onClick={() => setMicroWidgetCatalogDomainFilter(domain)}
                          className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] transition-colors ${
                            microWidgetCatalogDomainFilter === domain
                              ? 'liquid-glass-selection border-[color:var(--ui-border-strong)]'
                              : 'border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)] hover:border-[color:var(--ui-border-strong)] hover:text-[color:var(--ui-text-primary)]'
                          }`}
                        >
                          {formatEntityDomainLabel(domain)} ({count})
                        </button>
                      ))}
                    </div>

                    <div className="mt-2 max-h-48 overflow-y-auto glass-scrollbar space-y-1 pr-1">
                      {filteredCatalogEntityOptions.length > 0 ? (
                        filteredCatalogEntityOptions.map((entityId) => {
                          const domain = extractEntityDomain(entityId);
                          const objectId = entityId.includes('.') ? entityId.split('.').slice(1).join('.') : entityId;
                          const isSelected = catalogEntityId.toLowerCase() === entityId.toLowerCase();
                          return (
                            <button
                              key={entityId}
                              type="button"
                              onClick={() => setMicroWidgetCatalogEntity(entityId)}
                              className={`flex w-full items-center justify-between gap-3 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                                isSelected
                                  ? 'liquid-glass-selection border-[color:var(--ui-border-strong)]'
                                  : 'border-transparent bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-primary)] hover:border-[color:var(--ui-border)] hover:bg-[color:var(--ui-fill-secondary)]'
                              }`}
                            >
                              <span className="min-w-0 truncate text-sm font-medium">{objectId}</span>
                              <span className="shrink-0 rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-[color:var(--ui-text-secondary)]">
                                {domain || 'custom'}
                              </span>
                            </button>
                          );
                        })
                      ) : (
                        <div className="dashboard-content-surface-soft rounded-lg px-2.5 py-2 text-xs text-[color:var(--ui-text-secondary)]">
                          {t('builder.micro.noEntities')}
                        </div>
                      )}
                    </div>

                    <p className={BUILDER_HELPER_CLASS}>
                      Entita corrente: <span className="text-[color:var(--ui-text-primary)]">{catalogEntityId || 'nessuna'}</span>
                    </p>
                  </div>

                  {!hasCatalogEntitySelection ? (
                    <div className="mt-3 rounded-xl border border-amber-300/30 bg-amber-500/12 px-3 py-2 text-xs text-amber-100/90">
                      {t('builder.micro.selectEntityHint')}
                    </div>
                  ) : null}

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {compatibleMicroWidgetCatalog.length > 0 ? (
                      compatibleMicroWidgetCatalog.map((catalogItem) => {
                        const previewWidget: MicroWidget = {
                          id: `preview-${catalogItem.type}`,
                          type: catalogItem.type,
                          entity: catalogEntityId,
                          label: catalogItem.label,
                        };
                        const livePreviewState = resolveEntityStateById(haStates, catalogEntityId);
                        const livePreviewHistory = resolveEntityHistoryById(microChartHistoryByEntity, catalogEntityId);
                        const previewState =
                          livePreviewState ??
                          buildFallbackMicroWidgetState(catalogItem.type, catalogItem.label);
                        return (
                          <div
                            key={catalogItem.type}
                            role="button"
                            tabIndex={hasCatalogEntitySelection ? 0 : -1}
                            onClick={() => {
                              if (!hasCatalogEntitySelection) {
                                return;
                              }
                              appendMicroWidget(catalogItem.type, catalogEntityId);
                              setIsMicroWidgetCatalogOpen(false);
                            }}
                            onKeyDown={(event) => {
                              if (!hasCatalogEntitySelection) {
                                return;
                              }
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                appendMicroWidget(catalogItem.type, catalogEntityId);
                                setIsMicroWidgetCatalogOpen(false);
                              }
                            }}
                            className={`rounded-2xl border p-2.5 transition-colors ${
                              hasCatalogEntitySelection
                                ? 'cursor-pointer border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] hover:border-[color:var(--ui-border-strong)] hover:bg-[color:var(--ui-fill-secondary)]'
                                : 'cursor-not-allowed border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] opacity-60'
                            }`}
                          >
                            <div className="pointer-events-none">
                              {renderMicroWidgetPreview(previewWidget, previewState, livePreviewHistory)}
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-3 px-1">
                              <div className="min-w-0">
                                <p className="truncate text-xs font-semibold text-[color:var(--ui-text-primary)]">{catalogItem.label}</p>
                                <p className="truncate text-[11px] text-[color:var(--ui-text-tertiary)]">{bt(catalogItem.description)}</p>
                              </div>
                              <span className="inline-flex shrink-0 rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-[color:var(--ui-text-secondary)]">
                                {hasCatalogEntitySelection ? t('builder.micro.add') : t('builder.micro.selectEntity')}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="dashboard-content-surface-soft rounded-2xl px-3 py-3 text-sm text-[color:var(--ui-text-secondary)] md:col-span-2">
                        {t('builder.micro.noCompatible')}
                      </div>
                    )}
                  </div>
                </div>
        </GlassModal>
      ) : null}
      </aside>
    </>
  );
}



