import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import type { ActiveDevice, SensorConnectionState } from '../settings/types';
import { useLocation, useNavigate } from 'react-router';
import { useDashboardState } from '../../hooks/useDashboardState';
import DeferredGlassLoader from '../ui/DeferredGlassLoader';
import GlassModal from '../ui/GlassModal';
import { LeftSidebar } from './LeftSidebar';
import { BottomBarNav } from './BottomBarNav';
import { XsNotificationBell } from './XsNotificationBell';
import { XsProfileChip } from './XsProfileChip';
import { MobileSidebarDrawer } from './MobileSidebarDrawer';
import { DashboardSidebarPlaceholder } from './DashboardSidebarPlaceholder';
import { GridCanvas } from './GridCanvas';
import { HomeAssistantRecoveryBanner } from './HomeAssistantRecoveryBanner';
import { DashboardEditToolbar } from './DashboardEditToolbar';
import { DashboardViewportPreviewBar } from './DashboardViewportPreviewBar';
import DashboardEditDraftRecoveryModal from './DashboardEditDraftRecoveryModal';
import HomeAttentionCenter from '../homeAttention/HomeAttentionCenter';
import type { HomeAttentionItem } from '../homeAttention/homeAttentionEngine';
import {
  CLIMATE_FEATURE_FAN_MODE,
  CLIMATE_FEATURE_PRESET_MODE,
  CLIMATE_FEATURE_SWING_HORIZONTAL_MODE,
  CLIMATE_FEATURE_SWING_MODE,
  CLIMATE_FEATURE_TARGET_HUMIDITY,
  CLIMATE_FEATURE_TARGET_TEMPERATURE,
  CLIMATE_FEATURE_TARGET_TEMPERATURE_RANGE,
  CLIMATE_FEATURE_TURN_OFF,
  CLIMATE_FEATURE_TURN_ON,
  CLIMATE_LIVING_ROOM_MOCK_ENTITY_ID,
  createLivingRoomClimateMock,
  resolveMockClimateAction,
} from './mainboard/mainBoardClimateMock';
import {
  resolveLightCapabilities,
} from './mainboard/mainBoardLightModel';
import {
  CAMERA_PTZ_DIRECTION_VECTORS,
  CAMERA_PTZ_SERVICE_CANDIDATES,
  buildCameraDeviceContext,
  extractCameraHistoryEntries,
  hasAnyCameraPtzButton,
  isCameraOfflineState,
  normalizeCameraState,
  resolveCameraDerivedActivity,
  resolveCameraPreviewUrls,
  resolveCameraPtzButtonPressSequence,
  resolveCameraPtzButtons,
  resolveCameraPtzServiceTarget,
  resolveCameraSupportsPtz,
  type CameraPtzButtonMap,
  type CameraPtzServiceTarget,
  type HaServiceRegistry,
} from './mainboard/mainBoardCameraModel';
import {
  SENSOR_HISTORY_WINDOW_HOURS,
  SENSOR_HISTORY_MAX_POINTS,
  extractSensorHistoryValues,
  resolveSensorMeta,
  sameNumberSeries,
} from './mainboard/mainBoardSensorModel';
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
} from './mainboard/mainBoardValueUtils';
import {
  useLightSwitchPendingController,
} from './mainboard/useLightSwitchPendingController';
import { useLightSwitchCommands } from './mainboard/useLightSwitchCommands';
import {
  CLIMATE_PENDING_TTL_MS,
  hasClimatePendingValues,
  hasCoverPendingValues,
  useClimateCoverPendingController,
} from './mainboard/useClimateCoverPendingController';
import { useClimateCoverCommandTransport } from './mainboard/useClimateCoverCommandTransport';
import {
  VACUUM_COMMAND_TTL_MS,
  normalizeVacuumState,
  translateVacuumState,
} from './mainboard/mainBoardVacuumModel';
import { useVacuumCommands } from './mainboard/useVacuumCommands';
import {
  MEDIA_COMMAND_TTL_MS,
  resolveMediaState,
  resolveMediaRepeatMode,
  type MediaRepeatMode,
} from './mainboard/mainBoardMediaModel';
import { useMediaCommands } from './mainboard/useMediaCommands';
import type { WidgetDisplayMetrics } from '../widgets/widgetDisplayVariant';
import { createHomeAlarmMock, HOME_ALARM_MOCK_ENTITY_ID } from '../widgets/alarmMock';
import {
  createMediaPlayerStateMocks,
} from '../widgets/mediaMock';
import { createCoverStateMocks } from '../widgets/coverMock';
import { createLockStateMocks } from '../widgets/lockMock';
import {
  CAMERA_MAX_COMPAT_MOCK_ENTITY_ID,
  createCameraStateMocks,
} from '../widgets/cameraMock';
import {
  buildVacuumDeviceSnapshot,
  buildVacuumRelatedEntity,
  enrichVacuumEntity,
  parseVacuumMappedAreas,
  type VacuumDeviceInfo,
  type VacuumMappedArea,
  type VacuumRelatedEntityInfo,
} from '../widgets/vacuumDeviceModel';
import {
  createVacuumStateMocks,
} from '../widgets/vacuumMock';
import {
  isCompactViewportNow,
  isDesktopViewportNow,
  isXsViewportNow,
  resolveDashboardViewportPreviewWidth,
  resolveGridBreakpointFromWidth,
  resolveGridBreakpointNow,
  type DashboardViewportPreviewMode,
} from './dashboardViewport';
import { hasFavoriteGridProjection, resolveFavoriteGridTargetSectionId } from './favoriteGridPlacement';
import { LayoutDashboard, Lightbulb, Menu, MousePointerClick, PanelRightOpen, PencilRuler, Plus, Settings2, X } from 'lucide-react';
import {
  normalizeWidgetTypeLayoutOverrides,
  setActiveWidgetTypeLayoutOverrides,
} from './dashboardBreakpointConfig';
import type {
  CameraDeviceInfo,
  CameraHistoryEntry,
  CameraHistoryStatus,
  CameraPtzDirection,
  CameraRelatedEntityActionRequest,
  CameraRelatedEntityCategory,
  CameraRelatedEntityInfo,
} from '../settings/CameraControls';
import { useNotifications } from '../../context/NotificationProvider';
import type {
  ProfileMovementMapPoint,
  ProfileMovementTimelineEntry,
  ProfileSectionId,
} from '../settings/profileModels';
import type { SettingsManagementSectionId } from '../settings/settingsManagementRegistry';
import type { ProfileHouseMember } from '../settings/settingsHouseAccessModel';
import type { GuidedSetupStep } from '../settings/GuidedSetupOverlay';
import {
  FAVORITES_GRID_TITLE,
  GREETING_SECTION_ROWS,
  ROOT_CANVAS_COLS,
  ROOT_CANVAS_ROW_UNITS,
  SCENES_SECTION_ROWS,
  WEATHER_SECTION_BASE_ROWS,
  WEATHER_SECTION_CARD_COLS,
  WEATHER_SECTION_CARD_ROWS,
  WEATHER_SECTION_CHIP_COLS,
  WEATHER_SECTION_CHIP_ROWS,
  createDefaultSectionLayout,
  type DashboardSection,
  type GridItem,
  type SceneKey,
  type SceneRunState,
  type SectionKind,
  type Widget,
  type WidgetCatalogDestination,
  type WidgetKind,
} from '../../types/dashboardModels';
import {
  getEntityOptionsForRuntime,
  normalizeWidgetsForRuntime,
} from '../../demo/dashboardDemoFixtures';
import {
  DASHBOARD_LAYOUT_STORAGE_VERSION,
  loadDashboardLayout,
} from '../../services/dashboardStorage';
import type {
  DashboardResponsiveLayouts,
  DashboardGridBreakpoint,
  WidgetLayoutOverrides,
  WidgetTypeBreakpointLayoutOverride,
  WidgetTypeLayoutOverrides,
} from '../../types/widgetTypeLayout';
import {
  createConsumptionDashboardData,
  type ConsumptionCardId,
  useConsumptionConfig,
} from '../../hooks/useConsumptionConfig';
import { useProfileSettings, type SidebarQuickPath } from '../../hooks/useProfileSettings';
import { resolveApplicationRoutePath } from '../../navigation/applicationRoutes';
import { useHaLiveConnection } from '../../hooks/useHaLiveConnection';
import { useHaPanelBridgeConnection } from '../../hooks/useHaPanelBridgeConnection';
import { useHaIdentityRevalidation } from '../../hooks/useHaIdentityRevalidation';
import { useDashboardLayoutPersistence } from '../../hooks/useDashboardLayoutPersistence';
import { useHaDashboardLayoutPersistence } from '../../hooks/useHaDashboardLayoutPersistence';
import { useDashboardEditorHistory } from '../../hooks/useDashboardEditorHistory';
import { createDashboardStructuralFingerprint } from '../../services/dashboardPersistenceProjection';
import type { DashboardLayoutConfiguration } from '../../services/dashboardConfigurationRepository';
import {
  createDashboardRecoverySnapshot,
  discardDashboardRecoverySnapshot,
  readPendingDashboardRecoverySnapshot,
  restoreDashboardRecoverySnapshot,
} from '../../services/dashboardRecovery';
import {
  discardDashboardEditDraft,
  readDashboardEditDraft,
  saveDashboardEditDraft,
  type DashboardEditDraft,
} from '../../services/dashboardEditDraft';
import { isHaConnectionRecoveryStatus } from '../../services/haConnectionState';
import {
  buildHaOAuthAuthorizeUrl,
  clearHassAuthTokensStorage,
  exchangeHaOAuthCode,
  loadHassAuthTokensFromStorage,
  normalizeHassUrl,
  persistHaOAuthSession,
} from '../../services/haLive';
import {
  fallbackTitleFromEntityId,
  parseDeviceIdsByLabelIds,
  parseEntityIdsByDeviceIds,
  parseEntityIdsByLabelIds,
  parseFavoriteLabelIds,
  parseHaDeviceRegistry,
  parseHaEntityRegistry,
  resolveWidgetKindFromEntityId,
  type HaDeviceRegistryEntry,
  type HaEntityRegistryEntry,
} from '../../services/haRegistryPresentation';
import {
  parseHaAuthUsers,
  parseHaLogbookEvents,
  type HaAuthUser,
  type HaLogbookEvent,
} from '../../services/haIdentityPresentation';
import {
  resolveOAuthReturnPath,
  validateHaOAuthCallbackState,
  type HaOAuthStatePayload,
} from '../../security/oauthState';
import {
  requestTargetsMockEntity,
  shouldBlockMockEntityApiRequest,
} from '../../security/mockSourcePolicy';
import {
  DashboardSecurityProvider,
  createDashboardSecurityValue,
  isDashboardAdministrativeApiMessage,
  isDashboardRestartService,
  type DashboardRuntimeMode,
} from '../../security/dashboardAccess';
import {
  SensitiveActionGateProvider,
} from '../../security/SensitiveActionGate';
import {
  persistDashboardRuntimeMode,
  resolveInitialDashboardRuntimeMode,
} from '../../services/dashboardRuntime';
import type { MockEntityState, MockEntityStateMap } from '../../types/ha';
import { resolveSensorDisplayPrecision } from '../../utils/sensorValue';
import {
  resolveDeviceBatteryLevel,
  resolveDeviceConnection,
  resolveDeviceTelemetryEntities,
} from '../../utils/deviceTelemetry';
import {
  clearManagedDashboardStorage,
  createDashboardBackupPayload,
  parseDashboardBackup,
  restoreDashboardBackup,
  serializeDashboardBackup,
} from '../../services/configBackup';
import type {
  DashboardResetMarker,
  DashboardResetProgressReporter,
} from '../../services/dashboardReset';
import {
  acknowledgeAuthoritativeDashboardReset,
  invalidateLocalDashboardAfterAuthoritativeReset,
} from '../../services/dashboardResetClient';
import {
  INITIAL_AUTH_ATTEMPT_STATE,
  appendSecurityAuditEvent,
  formatAuthRateLimitMessage,
  getAuthRateLimitStatus,
  recordAuthFailure,
  recordAuthSuccess,
} from '../../services/securityAuth';
import { isOnboardingCompleted, markOnboardingCompleted } from '../../services/onboardingStorage';
import { useDeviceAuth } from '../../hooks/useDeviceAuth';
import {
  useDeviceCommandCoordinator,
  type DeviceCommandRollbackReason,
} from '../../hooks/useDeviceCommandCoordinator';
import {
  forgetWidgetSecrets,
  getWidgetSecrets,
  mergeWidgetSecretsIntoWidgets,
  useWidgetSecrets,
} from '../../services/widgetSecrets';
import {
  type AlarmServiceName,
  getAlarmStateLabel,
  isAlarmArmedState,
  normalizeAlarmState,
  resolveAlarmNextState,
  resolveAlarmSupportedFeatures,
} from '../../utils/alarmUtils';
import {
  resolveAlarmManualCodeSubmission,
  resolveAlarmSecurityRequirement,
  type AlarmActionAuthOptions,
  type AlarmCredentialKind,
  type AlarmSecurityActionKind,
} from '../../utils/alarmSecurityPolicy';
import {
  clampPercent,
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
  coverSupportsTilt,
  normalizeCoverState,
  resolveCoverPosition,
  resolveCoverPositionAttribute,
  resolveCoverSupportedFeatures,
  resolveCoverTiltAttribute,
  resolveCoverTiltPosition,
  translateCoverState,
} from '../../utils/coverUtils';
import { translateMediaPlayerState } from '../../utils/mediaPlayerState';
import {
  createOAuthNonce,
  isAppGalleryNavigationTarget,
  isAutomationNavigationTarget,
  isConsumptionDetailNavigationTarget,
  isConsumptionNavigationTarget,
  isExternalNavigationTarget,
  isHomeNavigationTarget,
  isNestedDashboardNavigationTarget,
  isNavigationPathnameAllowed,
  isProfileNavigationTarget,
  isRoomsNavigationTarget,
  isSecurityCamerasNavigationTarget,
  isSecurityNavigationTarget,
  isSettingsNavigationTarget,
  normalizeNavigationPathname,
  resolveAppGalleryFromLocation,
  resolveAutomationFromLocation,
  resolveConsumptionDetailFromLocation,
  resolveConsumptionFromLocation,
  resolveEditAvailabilityFromLocation,
  resolveProfileFromLocation,
  resolveRoomsFromLocation,
  resolveSecurityCamerasFromLocation,
  resolveSecurityFromLocation,
  resolveSettingsFromLocation,
  shouldUseBrowserRouteNavigation,
} from './mainboard/mainBoardNavigation';

const loadConsumptionDashboard = () => import('../../pages/Consumi');
const loadConsumptionEditor = () => import('../settings/ConsumptionEditorSidebar');
const loadAutomationsBuilder = () => import('../../pages/AutomationsBuilder');
const loadAppGallery = () => import('../../pages/AppGallery');
const loadRoomsDashboard = () => import('../../pages/RoomsDashboard');
const loadSecurityDashboard = () => import('../../pages/SecurityDashboard');
const loadSettingsDashboard = () => import('../../pages/SettingsDashboard');
const loadRightSidebarManager = () =>
  import('./RightSidebarManager').then((module) => ({ default: module.RightSidebarManager }));
const loadModernProfilePage = () =>
  import('../settings/ModernProfilePage').then((module) => ({ default: module.ModernProfilePage }));
const loadSettingsManagementPanel = () =>
  import('../settings/SettingsManagementPanel').then((module) => ({
    default: module.SettingsManagementPanel,
  }));
const loadGuidedSetupOverlay = () => import('../settings/GuidedSetupOverlay');
const loadSecurityAuthModal = () => import('../security/SecurityAuthModal');
const loadDashboardRecoveryModal = () => import('./DashboardRecoveryModal');

const ConsumptionDashboardPage = React.lazy(loadConsumptionDashboard);
const ConsumptionEditorSidebar = React.lazy(loadConsumptionEditor);
const AutomationsBuilder = React.lazy(loadAutomationsBuilder);
const AppGallery = React.lazy(loadAppGallery);
const RoomsDashboard = React.lazy(loadRoomsDashboard);
const SecurityDashboard = React.lazy(loadSecurityDashboard);
const SettingsDashboard = React.lazy(loadSettingsDashboard);
const RightSidebarManager = React.lazy(loadRightSidebarManager);
const ModernProfilePage = React.lazy(loadModernProfilePage);
const SettingsManagementPanel = React.lazy(loadSettingsManagementPanel);
const GuidedSetupOverlay = React.lazy(loadGuidedSetupOverlay);
const SecurityAuthModal = React.lazy(loadSecurityAuthModal);
const DashboardRecoveryModal = React.lazy(loadDashboardRecoveryModal);

function prefetchDashboardWorkspace(path: string) {
  const normalizedPath = path.trim().toLowerCase().split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/';

  if (normalizedPath === '/rooms') return void loadRoomsDashboard();
  if (normalizedPath.startsWith('/security')) return void loadSecurityDashboard();
  if (normalizedPath.startsWith('/consumi')) return void loadConsumptionDashboard();
  if (normalizedPath.startsWith('/automations')) return void loadAutomationsBuilder();
  if (normalizedPath.startsWith('/appgallery')) return void loadAppGallery();
  if (normalizedPath.startsWith('/settings')) return void loadSettingsDashboard();
  if (normalizedPath === '/support') return void loadSettingsDashboard();
  if (normalizedPath.startsWith('/profile')) return void loadModernProfilePage();
}

function SecondaryWorkspaceLoading({
  label,
  overlay = false,
}: {
  label?: string;
  overlay?: boolean;
}) {
  const { t } = useI18n();
  return (
    <DeferredGlassLoader
      label={label ?? t('home.loading.section')}
      description={t('home.loading.tools')}
      overlay={overlay}
    />
  );
}

type DashboardEditorSnapshot = Omit<DashboardLayoutConfiguration, 'storageVersion'>;

function cloneDashboardEditorSnapshot(snapshot: DashboardEditorSnapshot): DashboardEditorSnapshot {
  if (typeof structuredClone === 'function') return structuredClone(snapshot);
  return JSON.parse(JSON.stringify(snapshot)) as DashboardEditorSnapshot;
}

function fingerprintDashboardEditorSnapshot(snapshot: DashboardEditorSnapshot) {
  return createDashboardStructuralFingerprint({
    storageVersion: DASHBOARD_LAYOUT_STORAGE_VERSION,
    ...snapshot,
  });
}

const MEDIA_FEATURE_PAUSE = 1;
const MEDIA_FEATURE_SEEK = 2;
const MEDIA_FEATURE_VOLUME_SET = 4;
const MEDIA_FEATURE_VOLUME_MUTE = 8;
const MEDIA_FEATURE_PREVIOUS_TRACK = 16;
const MEDIA_FEATURE_NEXT_TRACK = 32;
const MEDIA_FEATURE_TURN_ON = 128;
const MEDIA_FEATURE_TURN_OFF = 256;
const MEDIA_FEATURE_PLAY_MEDIA = 512;
const MEDIA_FEATURE_VOLUME_STEP = 1024;
const MEDIA_FEATURE_SELECT_SOURCE = 2048;
const MEDIA_FEATURE_STOP = 4096;
const MEDIA_FEATURE_CLEAR_PLAYLIST = 8192;
const MEDIA_FEATURE_PLAY = 16384;
const MEDIA_FEATURE_SHUFFLE_SET = 32768;
const MEDIA_FEATURE_SELECT_SOUND_MODE = 65536;
const MEDIA_FEATURE_BROWSE_MEDIA = 131072;
const MEDIA_FEATURE_REPEAT_SET = 262144;
const MEDIA_FEATURE_GROUPING = 524288;
const MEDIA_FEATURE_ANNOUNCE = 1048576;
const MEDIA_FEATURE_ENQUEUE = 2097152;
const MEDIA_FEATURE_SEARCH_MEDIA = 4194304;
const LOCK_FEATURE_OPEN = 1;
const VACUUM_FEATURE_PAUSE = 4;
const VACUUM_FEATURE_STOP = 8;
const VACUUM_FEATURE_RETURN_HOME = 16;
const VACUUM_FEATURE_FAN_SPEED = 32;
const VACUUM_FEATURE_SEND_COMMAND = 256;
const VACUUM_FEATURE_LOCATE = 512;
const VACUUM_FEATURE_CLEAN_SPOT = 1024;
const VACUUM_FEATURE_MAP = 2048;
const VACUUM_FEATURE_START = 8192;
const VACUUM_FEATURE_CLEAN_AREA = 16384;
const VACUUM_DEMO_TICK_MS = 8000;
const VACUUM_DEMO_FAN_SPEEDS = ['quiet', 'balanced', 'turbo', 'max'] as const;
const VACUUM_DEMO_AREA_OPTIONS = [
  { id: 'living_room', name: 'Living Room' },
  { id: 'kitchen', name: 'Kitchen' },
  { id: 'hallway', name: 'Hallway' },
  { id: 'bedroom', name: 'Bedroom' },
];
const VACUUM_DEMO_SUPPORTED_FEATURES =
  VACUUM_FEATURE_START |
  VACUUM_FEATURE_PAUSE |
  VACUUM_FEATURE_STOP |
  VACUUM_FEATURE_RETURN_HOME |
  VACUUM_FEATURE_FAN_SPEED |
  VACUUM_FEATURE_SEND_COMMAND |
  VACUUM_FEATURE_LOCATE |
  VACUUM_FEATURE_CLEAN_SPOT |
  VACUUM_FEATURE_MAP |
  VACUUM_FEATURE_CLEAN_AREA;
const VACUUM_DEMO_MAP_URL =
  "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D'http%3A//www.w3.org/2000/svg'%20viewBox%3D'0%200%20800%20520'%3E%3Cdefs%3E%3ClinearGradient%20id%3D'g'%20x1%3D'0'%20x2%3D'1'%20y1%3D'0'%20y2%3D'1'%3E%3Cstop%20offset%3D'0%25'%20stop-color%3D'%23131a24'/%3E%3Cstop%20offset%3D'100%25'%20stop-color%3D'%231f2b3b'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect%20width%3D'800'%20height%3D'520'%20fill%3D'url(%23g)'/%3E%3Cg%20stroke%3D'%236f8fb4'%20stroke-opacity%3D'.45'%20stroke-width%3D'3'%20fill%3D'none'%3E%3Crect%20x%3D'58'%20y%3D'48'%20width%3D'684'%20height%3D'424'%20rx%3D'18'/%3E%3Cpath%20d%3D'M245%2048v202h198V48M466%20250v222M58%20320h187M466%20354h276'%20/%3E%3C/g%3E%3Cg%20fill%3D'%23d1e8ff'%20fill-opacity%3D'.9'%20font-family%3D'SF Pro Text'%20font-size%3D'22'%3E%3Ctext%20x%3D'100'%20y%3D'90'%3ELiving%20Room%3C/text%3E%3Ctext%20x%3D'286'%20y%3D'90'%3EKitchen%3C/text%3E%3Ctext%20x%3D'516'%20y%3D'90'%3EBedroom%3C/text%3E%3Ctext%20x%3D'100'%20y%3D'360'%3EHallway%3C/text%3E%3C/g%3E%3Ccircle%20cx%3D'330'%20cy%3D'314'%20r%3D'14'%20fill%3D'%2338bdf8'%3E%3Canimate%20attributeName%3D'r'%20values%3D'12%3B16%3B12'%20dur%3D'2s'%20repeatCount%3D'indefinite'/%3E%3C/circle%3E%3C/svg%3E";
const BACKUP_FILENAME_PREFIX = 'ha-dashboard-backup';
const HA_OAUTH_CALLBACK_PARAM = 'ha_oauth_callback';
const HA_OAUTH_SESSION_STATE_KEY = 'ha.dashboard.oauth.state';
const LOCK_PENDING_TTL_MS = 7000;
const ALARM_PENDING_TTL_MS = 10000;
const SCENE_SCRIPT_START_GRACE_MS = 5000;
const HA_ACTIVITY_REFRESH_MS = 30000;
const DEFAULT_ACTIVITY_WINDOW_HOURS = 24;
const DEFAULT_ACTIVITY_MAX_ENTRIES = 6;
const PROFILE_MOVEMENT_WINDOW_HOURS = 72;
const PROFILE_MOVEMENT_MAX_ENTRIES = 18;
const HIDDEN_MEMBER_ACCOUNT_ALIASES = ['guest', 'ospite', 'ospiti'] as const;
const SHOW_GUEST_MEMBERS_IN_FAMILY = true;
const MIN_ACTIVITY_WINDOW_HOURS = 1;
const MAX_ACTIVITY_WINDOW_HOURS = 168;
const MIN_ACTIVITY_MAX_ENTRIES = 1;
const MAX_ACTIVITY_MAX_ENTRIES = 30;
const CLIMATE_PENDING_TARGET_ATTRIBUTE_KEY = '__dashboard_pending_climate_target';
const CLIMATE_PENDING_FAN_ATTRIBUTE_KEY = '__dashboard_pending_climate_fan';
const CLIMATE_PENDING_HUMIDITY_ATTRIBUTE_KEY = '__dashboard_pending_climate_humidity';
const CLIMATE_PENDING_PRESET_ATTRIBUTE_KEY = '__dashboard_pending_climate_preset';
const CLIMATE_PENDING_SWING_ATTRIBUTE_KEY = '__dashboard_pending_climate_swing';
const CLIMATE_PENDING_SWING_HORIZONTAL_ATTRIBUTE_KEY = '__dashboard_pending_climate_swing_horizontal';
const LIGHT_TOGGLE_PENDING_ATTRIBUTE_KEY = '__dashboard_pending_light_toggle';
const LIGHT_BRIGHTNESS_PENDING_ATTRIBUTE_KEY = '__dashboard_pending_light_brightness';
const SWITCH_TOGGLE_PENDING_ATTRIBUTE_KEY = '__dashboard_pending_switch_toggle';
const LOCK_PENDING_ATTRIBUTE_KEY = '__dashboard_pending_lock';
const ALARM_PENDING_ATTRIBUTE_KEY = '__dashboard_pending_alarm_action';
const COVER_PENDING_ATTRIBUTE_KEY = '__dashboard_pending_cover';
const COVER_PENDING_TILT_ATTRIBUTE_KEY = '__dashboard_pending_cover_tilt';
const DEVICE_COMMAND_PHASE_ATTRIBUTE_KEY = '__dashboard_command_phase';
const MAIN_GUIDED_SETUP_STORAGE_KEYS = {
  welcome: 'ha.dashboard.onboarding.welcome.v1',
  context: 'ha.dashboard.onboarding.context.v1',
} as const;

type LockPendingAction = 'lock' | 'unlock' | 'open';

type LockPendingState = {
  action: LockPendingAction;
  targetState: 'locked' | 'unlocked' | 'open';
  expiresAt: number;
};

type AlarmPendingState = {
  service: AlarmServiceName;
  visualState: string;
  targetState: string;
  expiresAt: number;
};

type AlarmQuickAuthAction = {
  widget: Widget;
  service: AlarmServiceName;
  state: string;
  requiresCode: boolean;
  requiresBiometric: boolean;
  unlockCode: string;
  localExtraCode: string;
  credentialKind: AlarmCredentialKind;
  numericCodeMode: boolean;
};

function resolveAlarmSecurityActionKind(service: AlarmServiceName): AlarmSecurityActionKind {
  if (service === 'alarm_arm_home') {
    return 'arm_home';
  }
  if (service === 'alarm_arm_away') {
    return 'arm_away';
  }
  if (service === 'alarm_arm_night') {
    return 'arm_night';
  }
  if (service === 'alarm_arm_vacation') {
    return 'arm_vacation';
  }
  if (service === 'alarm_arm_custom_bypass') {
    return 'arm_custom_bypass';
  }
  if (service === 'alarm_trigger') {
    return 'trigger';
  }
  return 'disarm';
}

type ActivityTimelineEntry = {
  id: string;
  text: string;
  timestampMs: number;
  actor: string;
  entityId: string | undefined;
};

type ActivityTimelineStatus = 'idle' | 'loading' | 'available' | 'empty' | 'unavailable' | 'offline';

type LockQuickAuthAction = {
  widget: Widget;
  action: 'unlock' | 'open';
  unlockCode: string;
  numericCodeMode: boolean;
};

type MainGuidedSetupKind = keyof typeof MAIN_GUIDED_SETUP_STORAGE_KEYS;

function createMainGuidedSetupContent(t: ReturnType<typeof useI18n>['t']): Record<
  MainGuidedSetupKind,
  {
    tag: string;
    heading: string;
    description: string;
    steps: GuidedSetupStep[];
    completeLabel?: string;
    skipLabel?: string;
  }
> {
 return {
  welcome: {
    tag: t('home.guide.welcome.tag'), heading: t('home.guide.welcome.heading'), description: t('home.guide.welcome.description'),
    steps: [
      {
        id: 'overview',
        title: t('home.guide.overview.title'), description: t('home.guide.overview.description'), hint: t('home.guide.overview.hint'),
        icon: LayoutDashboard,
      },
      {
        id: 'edit-mode',
        title: t('home.guide.edit.title'), description: t('home.guide.edit.description'), hint: t('home.guide.edit.hint'),
        icon: PencilRuler,
        target: '[data-tour-target="edit-mode"]',
        actionLabel: t('home.guide.edit.action'),
      },
      {
        id: 'widget-catalog',
        title: t('home.guide.catalog.title'), description: t('home.guide.catalog.description'), hint: t('home.guide.catalog.hint'),
        icon: Plus,
        target: '[data-tour-target="widget-catalog"]',
        actionLabel: t('home.guide.catalog.action'),
        advanceOnTargetClick: true,
      },
      {
        id: 'catalog-light',
        title: t('home.guide.light.title'), description: t('home.guide.light.description'), hint: t('home.guide.light.hint'),
        icon: Lightbulb,
        target: '[data-tour-target="catalog-light"]',
        actionLabel: t('home.guide.light.action'),
        advanceOnTargetClick: true,
      },
      {
        id: 'catalog-add-light',
        title: t('home.guide.add.title'), description: t('home.guide.add.description'), hint: t('home.guide.add.hint'),
        icon: Plus,
        target: '[data-tour-target="catalog-confirm"]',
        actionLabel: t('home.guide.add.action'),
        advanceOnTargetClick: true,
      },
      {
        id: 'catalog-finish',
        title: t('home.guide.finish.title'), description: t('home.guide.finish.description'),
        icon: PanelRightOpen,
        target: '[data-tour-target="catalog-finish"]',
        actionLabel: t('home.guide.finish.action'),
        advanceOnTargetClick: true,
      },
      {
        id: 'builder-entity',
        title: t('home.guide.entity.title'), description: t('home.guide.entity.description'), hint: t('home.guide.entity.hint'),
        icon: Settings2,
        target: '[data-tour-target="builder-entity"]',
        actionLabel: t('home.guide.entity.action'),
        actionBehavior: 'continue',
      },
    ],
    completeLabel: t('home.guide.welcome.complete'), skipLabel: t('home.guide.closeGuide'),
  },
  context: {
    tag: t('home.guide.context.tag'), heading: t('home.guide.context.heading'), description: t('home.guide.context.description'),
    steps: [
      {
        title: t('home.guide.context.select.title'), description: t('home.guide.context.select.description'),
        icon: MousePointerClick,
      },
      {
        title: t('home.guide.context.info.title'), description: t('home.guide.context.info.description'), hint: t('home.guide.context.info.hint'),
        icon: PanelRightOpen,
      },
      {
        title: t('home.guide.context.change.title'), description: t('home.guide.context.change.description'),
        icon: LayoutDashboard,
      },
    ],
    completeLabel: t('home.guide.context.complete'), skipLabel: t('home.guide.close'),
  },
 };
}

function almostEqual(value: number | undefined, expected: number | undefined, tolerance = 0.15) {
  if (!Number.isFinite(value) || !Number.isFinite(expected)) {
    return false;
  }
  return Math.abs((value as number) - (expected as number)) <= tolerance;
}

function hueAlmostEqual(value: number | undefined, expected: number | undefined, tolerance = 1.2) {
  if (!Number.isFinite(value) || !Number.isFinite(expected)) {
    return false;
  }
  const distance = Math.abs((value as number) - (expected as number)) % 360;
  return Math.min(distance, 360 - distance) <= tolerance;
}

function resolveActivityWindowHours(value: unknown) {
  const parsed = toFiniteNumber(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_ACTIVITY_WINDOW_HOURS;
  }
  return Math.max(MIN_ACTIVITY_WINDOW_HOURS, Math.min(MAX_ACTIVITY_WINDOW_HOURS, Math.round(parsed as number)));
}

function resolveActivityMaxEntries(value: unknown) {
  const parsed = toFiniteNumber(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_ACTIVITY_MAX_ENTRIES;
  }
  return Math.max(MIN_ACTIVITY_MAX_ENTRIES, Math.min(MAX_ACTIVITY_MAX_ENTRIES, Math.round(parsed as number)));
}

function formatActivityTimeLabel(timestampMs: number) {
  return new Date(timestampMs).toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function normalizeMemberAccountToken(value: string | undefined) {
  return normalizeLower(value).replace(/[^a-z0-9]+/g, '');
}

function isGuestServiceAccountMemberCandidate({
  userId,
  displayName,
  username,
  email,
  entityId,
}: {
  userId?: string;
  displayName?: string;
  username?: string;
  email?: string;
  entityId?: string;
}) {
  if (SHOW_GUEST_MEMBERS_IN_FAMILY) {
    return false;
  }
  const emailLocalPart = toTrimmedString(email?.split('@')[0]);
  const personEntitySlug =
    typeof entityId === 'string' && entityId.startsWith('person.')
      ? entityId.slice('person.'.length)
      : entityId;
  const candidates = [userId, displayName, username, emailLocalPart, personEntitySlug]
    .map((entry) => normalizeMemberAccountToken(entry))
    .filter(Boolean);

  return candidates.some((token) =>
    HIDDEN_MEMBER_ACCOUNT_ALIASES.some((alias) => token === alias || token.startsWith(alias)),
  );
}

function resolveGuestAliasUserId(
  usersById: Record<string, HaAuthUser>,
  userNamesById: Record<string, string>,
) {
  const matchesGuestAlias = (value: string | undefined) => {
    const token = normalizeMemberAccountToken(value);
    if (!token) {
      return false;
    }
    return HIDDEN_MEMBER_ACCOUNT_ALIASES.some((alias) => token === alias || token.startsWith(alias));
  };

  const candidatesFromUsers = Object.values(usersById).find((user) => {
    const emailLocalPart = toTrimmedString(user.email?.split('@')[0]);
    return (
      matchesGuestAlias(user.id) ||
      matchesGuestAlias(user.name) ||
      matchesGuestAlias(user.username) ||
      matchesGuestAlias(emailLocalPart)
    );
  });
  if (candidatesFromUsers?.id) {
    return candidatesFromUsers.id;
  }

  const candidatesFromNames = Object.entries(userNamesById).find(([userId, userName]) =>
    matchesGuestAlias(userId) || matchesGuestAlias(userName),
  );
  return candidatesFromNames?.[0] ?? null;
}

function resolveHaAssetUrl(candidate: string | undefined, haUrl: string) {
  if (!candidate) {
    return undefined;
  }
  if (/^https?:\/\//i.test(candidate) || candidate.startsWith('data:')) {
    return candidate;
  }
  if (candidate.startsWith('/')) {
    const base = normalizeHassUrl(haUrl);
    return base ? `${base}${candidate}` : candidate;
  }
  return candidate;
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => toTrimmedString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function toTrackerEntityIds(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => toTrimmedString(entry))
      .filter((entry): entry is string => Boolean(entry))
      .map((entry) => entry.trim())
      .filter((entry) => entry.startsWith('device_tracker.'));
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.startsWith('device_tracker.'));
  }
  return [];
}

function normalizeMovementLocationKey(value: string | undefined) {
  const normalized = normalizeLower(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return normalized;
}

function formatMovementLocationLabel(
  state: string | undefined,
  labels: { unknown: string; home: string; away: string; generic: string },
) {
  const normalized = normalizeLower(state);
  if (!normalized) {
    return labels.unknown;
  }
  if (normalized === 'home') {
    return labels.home;
  }
  if (normalized === 'not_home') {
    return labels.away;
  }
  return state
    ?.replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (chunk) => chunk.toUpperCase()) ?? labels.generic;
}

type MemberTrackerDeviceKind = 'smartwatch' | 'tablet' | 'smartphone';

function classifyTrackerDeviceKind(entityId: string, rawAttributes: Record<string, unknown> | undefined): MemberTrackerDeviceKind | null {
  const entityKey = entityId.startsWith('device_tracker.')
    ? entityId.slice('device_tracker.'.length)
    : entityId;
  const normalized = normalizeLower(
    [
      entityKey,
      toTrimmedString(rawAttributes?.friendly_name),
      toTrimmedString(rawAttributes?.device_name),
      toTrimmedString(rawAttributes?.model),
      toTrimmedString(rawAttributes?.manufacturer),
      toTrimmedString(rawAttributes?.os_name),
      toTrimmedString(rawAttributes?.source_type),
      toTrimmedString(rawAttributes?.device_class),
      toTrimmedString(rawAttributes?.host_name),
    ]
      .filter(Boolean)
      .join(' '),
  );
  if (!normalized) {
    return null;
  }

  const watchTokens = ['watch', 'watchos', 'smartwatch', 'fitbit', 'garmin', 'amazfit', 'wear_os', 'wearos'];
  if (watchTokens.some((token) => normalized.includes(token))) {
    return 'smartwatch';
  }

  const tabletTokens = ['tablet', 'ipad', 'galaxy_tab', 'tab_', 'tab ', 'xiaomi_pad', 'lenovo_tab'];
  if (tabletTokens.some((token) => normalized.includes(token))) {
    return 'tablet';
  }

  const phoneTokens = [
    'phone',
    'iphone',
    'android',
    'pixel',
    'smartphone',
    'mobile',
    'oneplus',
    'xiaomi',
    'redmi',
    'galaxy_s',
  ];
  if (phoneTokens.some((token) => normalized.includes(token))) {
    return 'smartphone';
  }

  const normalizedWords = normalized.replace(/_/g, ' ');
  if (/\bs\d{2}\b/.test(normalizedWords) || normalizedWords.includes('sm-g')) {
    return 'smartphone';
  }

  return null;
}

function readMovementCoordinates(rawAttributes: Record<string, unknown> | undefined) {
  if (!rawAttributes) {
    return null;
  }
  const latitude = toFiniteNumber(rawAttributes.latitude);
  const longitude = toFiniteNumber(rawAttributes.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  return {
    latitude: latitude as number,
    longitude: longitude as number,
  };
}

function buildMovementZoneCoordinateLookup(haStates: MockEntityStateMap) {
  const lookup: Record<string, { latitude: number; longitude: number; label: string }> = {};
  Object.entries(haStates).forEach(([entityId, entity]) => {
    if (!entityId.startsWith('zone.')) {
      return;
    }
    const coordinates = readMovementCoordinates(entity.rawAttributes);
    if (!coordinates) {
      return;
    }
    const zoneKey = normalizeMovementLocationKey(entityId.slice('zone.'.length));
    const friendlyName = toTrimmedString(entity.rawAttributes?.friendly_name) ?? zoneKey;
    if (zoneKey) {
      lookup[zoneKey] = {
        ...coordinates,
        label: friendlyName,
      };
    }
    const friendlyKey = normalizeMovementLocationKey(friendlyName);
    if (friendlyKey) {
      lookup[friendlyKey] = {
        ...coordinates,
        label: friendlyName,
      };
    }
  });
  return lookup;
}

function resolveActivityActor(
  event: HaLogbookEvent,
  userNamesById: Record<string, string>,
  fallbackActor?: string,
) {
  const directUserName =
    toTrimmedString(event.context_user_name) ??
    toTrimmedString(event.user_name) ??
    toTrimmedString(event.context?.user_name);
  if (directUserName) {
    return directUserName;
  }
  const contextUserId =
    toTrimmedString(event.context_user_id) ??
    toTrimmedString(event.user_id) ??
    toTrimmedString(event.context?.user_id);
  if (contextUserId && userNamesById[contextUserId]) {
    return userNamesById[contextUserId];
  }
  return fallbackActor?.trim() || '';
}

function resolveLockActivityVerb(event: HaLogbookEvent) {
  const normalizedState = normalizeLockState(toTrimmedString(event.state));
  const message = normalizeLower(toTrimmedString(event.message));
  if (
    normalizedState === 'unlocked' ||
    normalizedState === 'unlocking' ||
    message.includes('unlock') ||
    message.includes('sblocc')
  ) {
    return 'ha sbloccato';
  }
  if (
    normalizedState === 'locked' ||
    normalizedState === 'locking' ||
    message.includes(' locked') ||
    message.startsWith('locked') ||
    message.includes(' blocc')
  ) {
    return 'ha bloccato';
  }
  if (normalizedState === 'open' || message.includes(' open')) {
    return 'ha aperto';
  }
  if (normalizedState === 'unavailable' || message.includes('non disponibile') || message.includes('unavailable')) {
    return 'ha reso non disponibile';
  }
  return 'ha aggiornato la serratura';
}

function resolveAlarmActivityVerb(event: HaLogbookEvent) {
  const normalizedState = normalizeAlarmState(toTrimmedString(event.state));
  const message = normalizeLower(toTrimmedString(event.message));
  if (normalizedState === 'disarmed' || message.includes('disarm') || message.includes('disinser')) {
    return 'ha disinserito';
  }
  if (normalizedState === 'armed_home' || message.includes('armed_home') || message.includes('arm home')) {
    return 'ha inserito Casa';
  }
  if (normalizedState === 'armed_away' || message.includes('armed_away') || message.includes('arm away')) {
    return 'ha inserito Fuori';
  }
  if (normalizedState === 'armed_night' || message.includes('armed_night') || message.includes('arm night')) {
    return 'ha inserito Notte';
  }
  if (normalizedState === 'armed_vacation' || message.includes('armed_vacation') || message.includes('vacation')) {
    return 'ha inserito Vacanza';
  }
  if (
    normalizedState === 'armed_custom_bypass' ||
    message.includes('custom_bypass') ||
    message.includes('bypass')
  ) {
    return 'ha inserito Bypass';
  }
  if (normalizedState === 'triggered' || message.includes('trigger')) {
    return 'ha attivato il trigger';
  }
  if (normalizedState === 'arming' || normalizedState === 'pending') {
    return 'ha avviato inserimento';
  }
  if (normalizedState === 'disarming') {
    return 'ha avviato disinserimento';
  }
  return "ha aggiornato l'allarme";
}

function resolveLockLogbookText(actor: string, verb: string, entityName: string, timestampMs: number) {
  return `${actor} ${verb} ${entityName} ${formatActivityTimeLabel(timestampMs)}`;
}

function resolveAlarmLogbookText(actor: string, verb: string, entityName: string, timestampMs: number) {
  return `${actor} ${verb} ${entityName} ${formatActivityTimeLabel(timestampMs)}`;
}

function buildTimelineEntries(
  events: HaLogbookEvent[],
  actorResolver: (event: HaLogbookEvent) => string,
  verbResolver: (event: HaLogbookEvent) => string,
  maxEntries: number,
  textResolver?: (event: HaLogbookEvent, timestampMs: number, actor: string, verb: string) => string,
) {
  return events
    .map((event, index) => {
      const timestampMs = toTimestampMs(event.when);
      if (!timestampMs) {
        return null;
      }
      const entityId = toTrimmedString(event.entity_id);
      const actor = actorResolver(event);
      const verb = verbResolver(event);
      return {
        id: `${entityId ?? 'event'}-${timestampMs}-${index}`,
        entityId,
        timestampMs,
        actor,
        text: textResolver?.(event, timestampMs, actor, verb) ?? `${actor} ${verb} ${formatActivityTimeLabel(timestampMs)}`,
      } satisfies ActivityTimelineEntry;
    })
    .filter((entry): entry is ActivityTimelineEntry => entry !== null)
    .sort((left, right) => right.timestampMs - left.timestampMs)
    .slice(0, maxEntries);
}

type MediaOutputKind = 'speaker' | 'tv' | 'cast';

function inferMediaOutputKind(value: string | undefined): MediaOutputKind {
  const normalized = normalizeLower(value);
  if (
    normalized.includes('tv') ||
    normalized.includes('television') ||
    normalized.includes('chromecast')
  ) {
    return 'tv';
  }
  if (
    normalized.includes('cast') ||
    normalized.includes('airplay') ||
    normalized.includes('google home')
  ) {
    return 'cast';
  }
  return 'speaker';
}

function formatMediaPlayerEntityLabel(entityId: string) {
  const slug = entityId
    .replace(/^media_player\./, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  if (!slug) {
    return entityId;
  }
  return slug.replace(/\b\w/g, (char) => char.toUpperCase());
}

function resolveLiveMediaPosition(
  basePosition: number,
  duration: number,
  state: string | undefined,
  updatedAt: number | undefined,
  nowMs: number,
) {
  if (!(duration > 0)) {
    return 0;
  }
  const safeBase = Math.max(0, Math.min(duration, Math.round(basePosition || 0)));
  const mediaState = (state ?? '').trim().toLowerCase();
  if (mediaState !== 'playing' || !updatedAt || nowMs <= updatedAt) {
    return safeBase;
  }
  const elapsedSeconds = Math.floor((nowMs - updatedAt) / 1000);
  if (elapsedSeconds <= 0) {
    return safeBase;
  }
  return Math.max(0, Math.min(duration, safeBase + elapsedSeconds));
}

function resolveMediaCapabilities(entity?: MockEntityState) {
  if (!entity) {
    return {
      supportsSeek: true,
      supportsVolume: true,
      supportsMute: true,
      supportsNextTrack: true,
      supportsPreviousTrack: true,
      supportsPower: true,
      supportsShuffle: true,
      supportsRepeat: true,
      supportsSelectSource: true,
      supportsGrouping: true,
      supportsStop: true,
      supportsClearPlaylist: true,
      supportsVolumeStep: true,
      supportsPlayMedia: true,
      supportsSelectSoundMode: true,
      supportsBrowseMedia: true,
      supportsAnnounce: true,
      supportsEnqueue: true,
      supportsSearchMedia: true,
    };
  }

  const rawSupported = entity.rawAttributes?.supported_features;
  const fromRaw = typeof rawSupported === 'number' ? rawSupported : undefined;
  const features =
    typeof entity.supportedFeatures === 'number'
      ? entity.supportedFeatures
      : fromRaw ?? 0;

  return {
    supportsSeek: (features & MEDIA_FEATURE_SEEK) !== 0 || typeof entity.mediaDuration === 'number',
    supportsVolume: (features & MEDIA_FEATURE_VOLUME_SET) !== 0 || typeof entity.volumeLevel === 'number',
    supportsMute:
      features === 0 ||
      (features & MEDIA_FEATURE_VOLUME_MUTE) !== 0 ||
      typeof entity.mediaMuted === 'boolean' ||
      typeof entity.rawAttributes?.is_volume_muted === 'boolean',
    supportsNextTrack: (features & MEDIA_FEATURE_NEXT_TRACK) !== 0,
    supportsPreviousTrack: (features & MEDIA_FEATURE_PREVIOUS_TRACK) !== 0,
    supportsPower:
      (features & MEDIA_FEATURE_TURN_ON) !== 0 ||
      (features & MEDIA_FEATURE_TURN_OFF) !== 0 ||
      (features & MEDIA_FEATURE_PLAY) !== 0 ||
      (features & MEDIA_FEATURE_PAUSE) !== 0,
    supportsShuffle:
      (features & MEDIA_FEATURE_SHUFFLE_SET) !== 0 ||
      typeof toBoolean(entity.rawAttributes?.shuffle) === 'boolean',
    supportsRepeat:
      (features & MEDIA_FEATURE_REPEAT_SET) !== 0 ||
      ['off', 'all', 'one'].includes(normalizeLower(toTrimmedString(entity.rawAttributes?.repeat))),
    supportsSelectSource:
      (features & MEDIA_FEATURE_SELECT_SOURCE) !== 0 ||
      toStringArray(entity.rawAttributes?.source_list).length > 0,
    supportsGrouping:
      (features & MEDIA_FEATURE_GROUPING) !== 0 ||
      toStringArray(entity.rawAttributes?.group_members).length > 0,
    supportsStop: (features & MEDIA_FEATURE_STOP) !== 0,
    supportsClearPlaylist: (features & MEDIA_FEATURE_CLEAR_PLAYLIST) !== 0,
    supportsVolumeStep: (features & MEDIA_FEATURE_VOLUME_STEP) !== 0,
    supportsPlayMedia: (features & MEDIA_FEATURE_PLAY_MEDIA) !== 0,
    supportsSelectSoundMode:
      (features & MEDIA_FEATURE_SELECT_SOUND_MODE) !== 0 ||
      toStringArray(entity.rawAttributes?.sound_mode_list).length > 0,
    supportsBrowseMedia: (features & MEDIA_FEATURE_BROWSE_MEDIA) !== 0,
    supportsAnnounce: (features & MEDIA_FEATURE_ANNOUNCE) !== 0,
    supportsEnqueue: (features & MEDIA_FEATURE_ENQUEUE) !== 0,
    supportsSearchMedia: (features & MEDIA_FEATURE_SEARCH_MEDIA) !== 0,
  };
}

function buildFallbackVacuumAttributes(widget: Widget, includeDemoFeatures: boolean) {
  const batteryLevel = typeof widget.value === 'number' ? Math.round(widget.value) : 85;
  const cleanedArea =
    typeof widget.vacuumCleanedArea === 'number' && Number.isFinite(widget.vacuumCleanedArea)
      ? Math.max(0, widget.vacuumCleanedArea)
      : 45;
  const cleaningTime =
    typeof widget.vacuumCleaningMinutes === 'number' && Number.isFinite(widget.vacuumCleaningMinutes)
      ? Math.max(0, Math.round(widget.vacuumCleaningMinutes))
      : 32;
  const fanSpeed = widget.vacuumFanSpeed?.trim() || 'balanced';

  return {
    friendly_name: widget.title,
    status: translateVacuumState(normalizeVacuumState(widget.status)),
    battery_level: batteryLevel,
    fan_speed: fanSpeed,
    fan_speed_list: [...VACUUM_DEMO_FAN_SPEEDS],
    cleaned_area: Math.round(cleanedArea * 10) / 10,
    cleaned_area_unit: 'm2',
    cleaning_time: cleaningTime,
    map_url: widget.vacuumMapUrl ?? (includeDemoFeatures ? VACUUM_DEMO_MAP_URL : undefined),
    supported_features: includeDemoFeatures ? VACUUM_DEMO_SUPPORTED_FEATURES : undefined,
  } as Record<string, unknown>;
}

function buildFallbackCoverAttributes(widget: Widget) {
  const normalizedState = normalizeCoverState(widget.status);
  const currentPosition = resolveCoverPosition(normalizedState, widget.value, 70);
  const tiltPosition = resolveCoverTiltPosition(widget.coverTiltPosition, 50);
  return {
    friendly_name: widget.title,
    current_position: currentPosition,
    current_cover_position: currentPosition,
    current_tilt_position: tiltPosition,
    current_cover_tilt_position: tiltPosition,
    position: currentPosition,
    tilt_position: tiltPosition,
    device_class: 'shutter',
    supported_features:
      COVER_FEATURE_OPEN |
      COVER_FEATURE_CLOSE |
      COVER_FEATURE_STOP |
      COVER_FEATURE_SET_POSITION |
      COVER_FEATURE_OPEN_TILT |
      COVER_FEATURE_CLOSE_TILT |
      COVER_FEATURE_STOP_TILT |
      COVER_FEATURE_SET_TILT_POSITION,
  } as Record<string, unknown>;
}

function normalizeLockState(value: string | undefined) {
  const normalized = (value ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  if (!normalized) {
    return 'unknown';
  }
  if (normalized === 'opening') {
    return 'opening';
  }
  if (normalized === 'closing') {
    return 'locking';
  }
  return normalized;
}

function isLockLockedState(state: string) {
  return state === 'locked' || state === 'locking';
}

function translateLockState(state: string) {
  if (state === 'locked') {
    return 'Bloccata';
  }
  if (state === 'unlocked') {
    return 'Sbloccata';
  }
  if (state === 'locking') {
    return 'Blocco...';
  }
  if (state === 'unlocking') {
    return 'Sblocco...';
  }
  if (state === 'opening') {
    return 'Apertura...';
  }
  if (state === 'jammed') {
    return 'Inceppata';
  }
  if (state === 'open') {
    return 'Aperta';
  }
  if (state === 'unavailable') {
    return 'Non disponibile';
  }
  return 'Sconosciuta';
}

function resolveLockPendingTargetState(action: LockPendingAction) {
  if (action === 'lock') {
    return 'locked' as const;
  }
  if (action === 'open') {
    return 'open' as const;
  }
  return 'unlocked' as const;
}

function resolveAlarmPendingState(service: AlarmServiceName) {
  const targetState = resolveAlarmNextState(service);
  if (service === 'alarm_disarm') {
    return {
      visualState: 'disarming',
      targetState,
    };
  }
  if (service === 'alarm_trigger') {
    return {
      visualState: targetState,
      targetState,
    };
  }
  return {
    visualState: 'arming',
    targetState,
  };
}

function buildVacuumDeviceContext({
  vacuumEntityId,
  haStates,
  entityRegistry,
  deviceRegistry,
  haUrl,
}: {
  vacuumEntityId: string;
  haStates: MockEntityStateMap;
  entityRegistry: HaEntityRegistryEntry[];
  deviceRegistry: HaDeviceRegistryEntry[];
  haUrl: string;
}) {
  const normalizedEntityId = vacuumEntityId.trim();
  const mainEntity = haStates[normalizedEntityId] ?? haStates[normalizedEntityId.toLowerCase()];
  const registryByEntityId = new Map(entityRegistry.map((entry) => [entry.entityId.toLowerCase(), entry]));
  const mainRegistryEntry = registryByEntityId.get(normalizedEntityId.toLowerCase());
  const deviceId = mainRegistryEntry?.deviceId;
  const rawAttributes = mainEntity?.rawAttributes;
  const demoRelatedIds = Array.isArray(rawAttributes?.demo_related_entities)
    ? rawAttributes.demo_related_entities
        .map((entry) => toTrimmedString(entry))
        .filter((entry): entry is string => Boolean(entry))
    : [];
  const relatedRegistryEntries = deviceId
    ? entityRegistry.filter(
        (entry) =>
          entry.deviceId === deviceId &&
          entry.entityId.toLowerCase() !== normalizedEntityId.toLowerCase() &&
          !entry.disabledBy &&
          !entry.hiddenBy,
      )
    : [];
  const relatedIds = relatedRegistryEntries.length > 0
    ? relatedRegistryEntries.map((entry) => entry.entityId)
    : demoRelatedIds;
  const relatedEntities = relatedIds
    .map((entityId) => {
      const entity = haStates[entityId] ?? haStates[entityId.toLowerCase()];
      if (!entity) return null;
      const registryEntry = registryByEntityId.get(entityId.toLowerCase());
      return buildVacuumRelatedEntity(entityId, entity, registryEntry, haUrl);
    })
    .filter((entry): entry is VacuumRelatedEntityInfo => entry !== null);
  const snapshot = buildVacuumDeviceSnapshot({
    vacuumEntity: mainEntity,
    relatedEntities,
    haUrl,
  });
  const rawDemoDeviceInfo = isRecordObject(rawAttributes?.demo_device_info)
    ? rawAttributes.demo_device_info
    : undefined;
  const deviceEntry = deviceId ? deviceRegistry.find((entry) => entry.id === deviceId) : undefined;
  const deviceInfo: VacuumDeviceInfo | undefined = deviceEntry || rawDemoDeviceInfo
    ? {
        id: deviceEntry?.id ?? toTrimmedString(rawDemoDeviceInfo?.id),
        name: deviceEntry?.nameByUser ?? deviceEntry?.name ?? toTrimmedString(rawDemoDeviceInfo?.name),
        manufacturer: deviceEntry?.manufacturer ?? toTrimmedString(rawDemoDeviceInfo?.manufacturer),
        model: deviceEntry?.model ?? toTrimmedString(rawDemoDeviceInfo?.model),
        swVersion: deviceEntry?.swVersion ?? toTrimmedString(rawDemoDeviceInfo?.swVersion),
        hwVersion: deviceEntry?.hwVersion ?? toTrimmedString(rawDemoDeviceInfo?.hwVersion),
        areaId: deviceEntry?.areaId ?? mainRegistryEntry?.areaId ?? toTrimmedString(rawDemoDeviceInfo?.areaId),
        configurationUrl: deviceEntry?.configurationUrl ?? toTrimmedString(rawDemoDeviceInfo?.configurationUrl),
      }
    : undefined;

  return {
    mainEntity,
    snapshot,
    deviceInfo,
    relatedEntities,
    registryOptions: mainRegistryEntry?.options ??
      (isRecordObject(rawAttributes?.demo_registry_options) ? rawAttributes.demo_registry_options : undefined),
  };
}

function resolveVacuumMapUrl(
  entity: MockEntityState | undefined,
  haUrl: string,
) {
  if (!entity) {
    return undefined;
  }

  if (entity.imageUrl && entity.imageUrl.trim().length > 0) {
    return entity.imageUrl;
  }

  const rawAttributes = entity.rawAttributes;
  const candidates = [
    toTrimmedString(rawAttributes?.entity_picture),
    toTrimmedString(rawAttributes?.map),
    toTrimmedString(rawAttributes?.map_url),
    toTrimmedString(rawAttributes?.map_image),
  ].filter((entry): entry is string => Boolean(entry));
  if (!candidates.length) {
    return undefined;
  }

  const candidate = candidates[0];
  if (/^https?:\/\//i.test(candidate) || candidate.startsWith('data:')) {
    return candidate;
  }
  if (candidate.startsWith('/')) {
    const base = normalizeHassUrl(haUrl);
    return base ? `${base}${candidate}` : candidate;
  }
  return candidate;
}

function resolveVacuumCapabilities(entity: MockEntityState | undefined) {
  const rawSupported = entity?.rawAttributes?.supported_features;
  const rawFeatures = typeof rawSupported === 'number' ? rawSupported : undefined;
  const supportedFeatures = typeof entity?.supportedFeatures === 'number' ? entity.supportedFeatures : rawFeatures ?? 0;
  return {
    supportedFeatures,
    supportsStart: (supportedFeatures & VACUUM_FEATURE_START) !== 0,
    supportsPause: (supportedFeatures & VACUUM_FEATURE_PAUSE) !== 0,
    supportsStop: (supportedFeatures & VACUUM_FEATURE_STOP) !== 0,
    supportsReturnHome: (supportedFeatures & VACUUM_FEATURE_RETURN_HOME) !== 0,
    supportsLocate: (supportedFeatures & VACUUM_FEATURE_LOCATE) !== 0,
    supportsCleanSpot: (supportedFeatures & VACUUM_FEATURE_CLEAN_SPOT) !== 0,
    supportsFanSpeed: (supportedFeatures & VACUUM_FEATURE_FAN_SPEED) !== 0,
    supportsSendCommand: (supportedFeatures & VACUUM_FEATURE_SEND_COMMAND) !== 0,
    supportsMap: (supportedFeatures & VACUUM_FEATURE_MAP) !== 0,
    supportsCleanArea: (supportedFeatures & VACUUM_FEATURE_CLEAN_AREA) !== 0,
  };
}

function resolveCoverCapabilities(
  entity: MockEntityState | undefined,
  fallbackRawAttributes?: Record<string, unknown>,
) {
  const rawAttributes = entity?.rawAttributes ?? fallbackRawAttributes;
  const supportedFeatures =
    resolveCoverSupportedFeatures(entity) ??
    toFiniteNumber(rawAttributes?.supported_features);
  return {
    supportedFeatures,
    supportsOpen: coverSupportsOpen(supportedFeatures),
    supportsClose: coverSupportsClose(supportedFeatures),
    supportsStop: coverSupportsStop(supportedFeatures),
    supportsSetPosition: coverSupportsSetPosition(supportedFeatures),
    supportsOpenTilt: coverSupportsOpenTilt(supportedFeatures),
    supportsCloseTilt: coverSupportsCloseTilt(supportedFeatures),
    supportsSetTiltPosition: coverSupportsSetTiltPosition(supportedFeatures) || coverSupportsTilt(supportedFeatures, rawAttributes),
    supportsStopTilt: coverSupportsStopTilt(supportedFeatures),
  };
}

function isDemoVacuumEntity(entityId: string | undefined) {
  const value = (entityId ?? '').trim().toLowerCase();
  return value === 'vacuum.demo_robot' || value.startsWith('vacuum.demo_');
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function readClimateStringArray(entity: MockEntityState | undefined, directKey: keyof MockEntityState, rawKey: string) {
  const directValue = entity?.[directKey];
  if (Array.isArray(directValue)) {
    return directValue.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
  }
  const rawValue = entity?.rawAttributes?.[rawKey];
  if (!Array.isArray(rawValue)) {
    return [];
  }
  return rawValue.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function readClimateNumber(entity: MockEntityState | undefined, directKey: keyof MockEntityState, rawKey: string) {
  return toFiniteNumber(entity?.[directKey]) ?? toFiniteNumber(entity?.rawAttributes?.[rawKey]);
}

function readClimateString(entity: MockEntityState | undefined, directKey: keyof MockEntityState, rawKey: string) {
  return toTrimmedString(entity?.[directKey]) ?? toTrimmedString(entity?.rawAttributes?.[rawKey]);
}

function resolveClimateCapabilities(entity?: MockEntityState) {
  const rawFeatures = toFiniteNumber(entity?.rawAttributes?.supported_features);
  const supportedFeatures =
    typeof entity?.supportedFeatures === 'number' ? entity.supportedFeatures : rawFeatures;
  const features = supportedFeatures ?? 0;
  const hvacModes = readClimateStringArray(entity, 'hvacModes', 'hvac_modes');
  const fanModes = readClimateStringArray(entity, 'fanModes', 'fan_modes');
  const presetModes = readClimateStringArray(entity, 'presetModes', 'preset_modes');
  const swingModes = readClimateStringArray(entity, 'swingModes', 'swing_modes');
  const swingHorizontalModes = readClimateStringArray(entity, 'swingHorizontalModes', 'swing_horizontal_modes');
  const hasFeature = (feature: number) => (features & feature) !== 0;
  const hasAnyTargetTemperatureData =
    readClimateNumber(entity, 'targetValue', 'temperature') !== undefined ||
    readClimateNumber(entity, 'minTemp', 'min_temp') !== undefined ||
    readClimateNumber(entity, 'maxTemp', 'max_temp') !== undefined;
  const hasAnyTargetRangeData =
    readClimateNumber(entity, 'targetTempLow', 'target_temp_low') !== undefined ||
    readClimateNumber(entity, 'targetTempHigh', 'target_temp_high') !== undefined;
  const hasAnyHumidityData =
    readClimateNumber(entity, 'targetHumidity', 'humidity') !== undefined ||
    readClimateNumber(entity, 'currentHumidity', 'current_humidity') !== undefined;
  const supportsTargetTemperature = hasFeature(CLIMATE_FEATURE_TARGET_TEMPERATURE) || hasAnyTargetTemperatureData;
  const supportsTargetTemperatureRange = hasFeature(CLIMATE_FEATURE_TARGET_TEMPERATURE_RANGE) || hasAnyTargetRangeData;
  const supportsTargetHumidity = hasFeature(CLIMATE_FEATURE_TARGET_HUMIDITY) || hasAnyHumidityData;
  const supportsFanMode = hasFeature(CLIMATE_FEATURE_FAN_MODE) || fanModes.length > 0;
  const supportsPresetMode = hasFeature(CLIMATE_FEATURE_PRESET_MODE) || presetModes.length > 0;
  const supportsSwingMode = hasFeature(CLIMATE_FEATURE_SWING_MODE) || swingModes.length > 0;
  const supportsSwingHorizontalMode =
    hasFeature(CLIMATE_FEATURE_SWING_HORIZONTAL_MODE) || swingHorizontalModes.length > 0;
  const supportsTurnOff = hasFeature(CLIMATE_FEATURE_TURN_OFF) || hvacModes.includes('off');
  const supportsTurnOn = hasFeature(CLIMATE_FEATURE_TURN_ON) || hvacModes.some((mode) => mode !== 'off');

  return {
    supportedFeatures,
    supportsTargetTemperature,
    supportsTargetTemperatureRange,
    supportsTargetHumidity,
    supportsFanMode,
    supportsPresetMode,
    supportsSwingMode,
    supportsSwingHorizontalMode,
    supportsTurnOn,
    supportsTurnOff,
    currentHumidity: readClimateNumber(entity, 'currentHumidity', 'current_humidity'),
    targetHumidity: readClimateNumber(entity, 'targetHumidity', 'humidity'),
    minHumidity: readClimateNumber(entity, 'minHumidity', 'min_humidity') ?? 30,
    maxHumidity: readClimateNumber(entity, 'maxHumidity', 'max_humidity') ?? 99,
    targetHumidityStep: readClimateNumber(entity, 'targetHumidityStep', 'target_humidity_step') ?? 1,
    presetMode: readClimateString(entity, 'presetMode', 'preset_mode'),
    presetModes,
    swingMode: readClimateString(entity, 'swingMode', 'swing_mode'),
    swingModes,
    swingHorizontalMode: readClimateString(entity, 'swingHorizontalMode', 'swing_horizontal_mode'),
    swingHorizontalModes,
    precision: readClimateNumber(entity, 'precision', 'precision'),
  };
}

export function MainBoard() {
  const { locale, setHomeAssistantLocale, t, formatDate } = useI18n();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const canUseBrowserRouteNavigation = useMemo(shouldUseBrowserRouteNavigation, []);
  const {
    appearance,
    appearanceMode,
    setAppearanceMode,
    background,
    setBackground,
    developerMode,
    setDeveloperMode,
    haUrl: profileHaUrl,
    setHaUrl: setProfileHaUrl,
    haToken,
    setHaToken,
    haRememberToken,
    setHaRememberToken,
    sidebarPaths,
    updateSidebarPath,
    removeSidebarPath,
  } = useProfileSettings();
  const {
    config: consumptionConfig,
    updateConfigField: updateConsumptionConfigField,
    resetConfig: resetConsumptionConfig,
  } = useConsumptionConfig();
  const webSocketHaConnection =
    useHaLiveConnection({
      url: profileHaUrl,
      token: haToken,
    });
  const panelHaBridgeConnection = useHaPanelBridgeConnection();
  const isHaManagedByParent = panelHaBridgeConnection.isManagedByParent;
  const activeHaConnection = isHaManagedByParent ? panelHaBridgeConnection : webSocketHaConnection;
  const haUrl = isHaManagedByParent ? panelHaBridgeConnection.hassUrl || profileHaUrl : profileHaUrl;
  const setHaUrl = setProfileHaUrl;
  const {
    status: haStatus,
    error: haError,
    haStates,
    haAreas,
    lastUpdatedAt: haLastUpdatedAt,
    connect: connectHa,
    disconnect: disconnectHa,
    callService: rawCallHaService,
    callApi: rawCallHaApi,
  } = activeHaConnection;
  const { addNotification, removeNotification } = useNotifications();
  useEffect(() => {
    setHomeAssistantLocale(isHaManagedByParent ? panelHaBridgeConnection.locale : null);
  }, [isHaManagedByParent, panelHaBridgeConnection.locale, setHomeAssistantLocale]);
  const isHaConnected = haStatus === 'connected';
  const [runtimeMode] = useState<DashboardRuntimeMode | null>(() =>
    resolveInitialDashboardRuntimeMode({
      storage: typeof window === 'undefined' ? undefined : window.localStorage,
      isManagedByParent: isHaManagedByParent,
      hasManualToken: haToken.trim().length > 0,
    }),
  );
  const effectiveRuntimeMode: DashboardRuntimeMode = runtimeMode ?? 'demo';
  const entityOptions = useMemo(
    () => getEntityOptionsForRuntime(effectiveRuntimeMode),
    [effectiveRuntimeMode],
  );
  const explicitMockEntityIdsRef = useRef<Set<string>>(new Set());
  const [initialLayout] = useState(() => loadDashboardLayout(effectiveRuntimeMode));
  const [pendingDashboardRecovery, setPendingDashboardRecovery] = useState(() =>
    typeof window === 'undefined'
      ? null
      : readPendingDashboardRecoverySnapshot(effectiveRuntimeMode, window.localStorage),
  );
  const [pendingDashboardEditDraft, setPendingDashboardEditDraft] = useState<DashboardEditDraft | null>(() =>
    typeof window === 'undefined'
      ? null
      : readDashboardEditDraft(window.sessionStorage, effectiveRuntimeMode),
  );
  const [widgets, setWidgets] = useState<Widget[]>(() => initialLayout.widgets);
  const [sections, setSections] = useState<DashboardSection[]>(() => initialLayout.sections);
  const [widgetTypeLayoutOverrides, setWidgetTypeLayoutOverrides] = useState<WidgetTypeLayoutOverrides>(() => {
    const normalized = normalizeWidgetTypeLayoutOverrides(initialLayout.widgetTypeLayoutOverrides);
    setActiveWidgetTypeLayoutOverrides(normalized);
    return normalized;
  });
  const [widgetLayoutOverrides, setWidgetLayoutOverrides] = useState<WidgetLayoutOverrides>(
    () => initialLayout.widgetLayoutOverrides,
  );
  const [responsiveLayouts, setResponsiveLayouts] = useState<DashboardResponsiveLayouts>(
    () => initialLayout.responsiveLayouts,
  );
  explicitMockEntityIdsRef.current = new Set(
    widgets
      .filter((widget) => effectiveRuntimeMode === 'demo' && widget.dataSource === 'mock' && !haStates[widget.entityId.trim()])
      .map((widget) => widget.entityId.trim())
      .filter(Boolean),
  );
  setActiveWidgetTypeLayoutOverrides(widgetTypeLayoutOverrides);
  const administrativeAccessRef = useRef({ manageRooms: false, restartHomeAssistant: false });
  useEffect(() => {
    if (!isHaManagedByParent || runtimeMode === 'real' || typeof window === 'undefined') {
      return;
    }
    persistDashboardRuntimeMode('real', window.localStorage);
    window.location.reload();
  }, [isHaManagedByParent, runtimeMode]);
  useEffect(() => {
    if (runtimeMode !== 'demo' || !isHaConnected || typeof window === 'undefined') {
      return;
    }
    persistDashboardRuntimeMode('real', window.localStorage);
    window.location.reload();
  }, [isHaConnected, runtimeMode]);
  const callHaService = useCallback(
    async (domain: string, service: string, serviceData: Record<string, unknown>) => {
      if (effectiveRuntimeMode !== 'real') {
        return false;
      }
      if (requestTargetsMockEntity(serviceData, explicitMockEntityIdsRef.current)) {
        return false;
      }
      if (isDashboardRestartService(domain, service) && !administrativeAccessRef.current.restartHomeAssistant) {
        return false;
      }
      return rawCallHaService(domain, service, serviceData);
    },
    [effectiveRuntimeMode, rawCallHaService],
  );
  const callHaApi = useCallback(
    <TResponse = unknown,>(
      message: Record<string, unknown>,
      options?: { reportError?: boolean; throwOnError?: boolean },
    ): Promise<TResponse | null> => {
      if (effectiveRuntimeMode !== 'real') {
        if (options?.throwOnError) {
          return Promise.reject(new Error(t('home.api.demoUnavailable')));
        }
        return Promise.resolve(null);
      }
      if (shouldBlockMockEntityApiRequest(message, explicitMockEntityIdsRef.current)) {
        if (options?.throwOnError) {
          return Promise.reject(new Error(t('home.api.mockUnavailable')));
        }
        return Promise.resolve(null);
      }
      if (isDashboardAdministrativeApiMessage(message) && !administrativeAccessRef.current.manageRooms) {
        if (options?.throwOnError) {
          return Promise.reject(new Error('Permesso amministrativo Home Assistant richiesto.'));
        }
        return Promise.resolve(null);
      }
      return rawCallHaApi<TResponse>(message, options);
    },
    [effectiveRuntimeMode, rawCallHaApi],
  );
  const commandCoordinator = useDeviceCommandCoordinator({
    entities: haStates,
    isReliable: effectiveRuntimeMode === 'real' && isHaConnected,
  });
  const {
    climatePendingByEntity,
    coverPendingByEntity,
    upsertClimatePending,
    clearClimatePendingFields,
    upsertCoverPending,
    clearCoverPendingFields,
  } = useClimateCoverPendingController({
    haStates,
    isHaConnected,
  });
  const {
    queueClimateCommandDispatch,
    runCoverCommand,
  } = useClimateCoverCommandTransport({
    isHaConnected,
    commandCoordinator,
    callHaService,
    pending: {
      clearClimatePendingFields,
      upsertCoverPending,
      clearCoverPendingFields,
    },
    addNotification,
  });
  const [livingRoomClimateMock, setLivingRoomClimateMock] = useState<MockEntityState>(createLivingRoomClimateMock);
  const [homeAlarmMock, setHomeAlarmMock] = useState<MockEntityState>(createHomeAlarmMock);
  const [mediaPlayerStateMocks] = useState<MockEntityStateMap>(createMediaPlayerStateMocks);
  const [coverStateMocks, setCoverStateMocks] = useState<MockEntityStateMap>(createCoverStateMocks);
  const [lockStateMocks] = useState<MockEntityStateMap>(createLockStateMocks);
  const [cameraStateMocks, setCameraStateMocks] = useState<MockEntityStateMap>(createCameraStateMocks);
  const [vacuumStateMocks, setVacuumStateMocks] = useState<MockEntityStateMap>(createVacuumStateMocks);
  const {
    lightTogglePendingByEntity,
    lightBrightnessPendingByEntity,
    lightColorPendingByEntity,
    switchTogglePendingByEntity,
    setLightTogglePending,
    setLightPowerPendingIfChanged,
    setLightBrightnessPending,
    setLightColorPending,
    setSwitchTogglePending,
    clearLightTogglePending,
    clearSwitchTogglePending,
    clearLightCommandPending,
  } = useLightSwitchPendingController({
    haStates,
    isHaConnected,
  });
  const [lockPendingByEntity, setLockPendingByEntity] = useState<Record<string, LockPendingState>>({});
  const [alarmPendingByEntity, setAlarmPendingByEntity] = useState<Record<string, AlarmPendingState>>({});
  const [haUserNamesById, setHaUserNamesById] = useState<Record<string, string>>({});
  const [haUsersById, setHaUsersById] = useState<Record<string, HaAuthUser>>({});
  const haCurrentUser = useHaIdentityRevalidation({
    isConnected: effectiveRuntimeMode === 'real' && isHaConnected,
    callApi: callHaApi,
  });
  const dashboardSecurity = useMemo(
    () =>
      createDashboardSecurityValue({
        runtimeMode: effectiveRuntimeMode,
        haStatus,
        user: haCurrentUser,
      }),
    [effectiveRuntimeMode, haCurrentUser, haStatus],
  );
  administrativeAccessRef.current = {
    manageRooms: dashboardSecurity.can('manage_rooms'),
    restartHomeAssistant: dashboardSecurity.can('restart_home_assistant'),
  };
  const [lockTimelineByEntity, setLockTimelineByEntity] = useState<Record<string, ActivityTimelineEntry[]>>({});
  const [lockActivityStatusByEntity, setLockActivityStatusByEntity] = useState<Record<string, ActivityTimelineStatus>>({});
  const [alarmTimelineByEntity, setAlarmTimelineByEntity] = useState<Record<string, ActivityTimelineEntry[]>>({});
  const [alarmActivityStatusByEntity, setAlarmActivityStatusByEntity] = useState<Record<string, ActivityTimelineStatus>>({});
  const [activityRefreshNonce, setActivityRefreshNonce] = useState(0);
  const [haServiceRegistry, setHaServiceRegistry] = useState<HaServiceRegistry | null>(null);
  const [haEntityRegistry, setHaEntityRegistry] = useState<HaEntityRegistryEntry[]>([]);
  const [haDeviceRegistry, setHaDeviceRegistry] = useState<HaDeviceRegistryEntry[]>([]);
  const [haFavoriteEntityIds, setHaFavoriteEntityIds] = useState<string[]>([]);
  const [haFavoriteLabelDetected, setHaFavoriteLabelDetected] = useState(false);
  const [profileMovementTimeline, setProfileMovementTimeline] = useState<ProfileMovementTimelineEntry[]>([]);
  const [profileMovementPoints, setProfileMovementPoints] = useState<ProfileMovementMapPoint[]>([]);
  const [profileMovementUpdatedLabel, setProfileMovementUpdatedLabel] = useState<string>('');
  const profileMovementSource = useMemo(() => {
    const zoneLookup = buildMovementZoneCoordinateLookup(haStates);
    const userIdKey = normalizeLower(haCurrentUser?.id);
    const userNameKey = normalizeMovementLocationKey(haCurrentUser?.name);
    const userUsernameKey = normalizeMovementLocationKey(haCurrentUser?.username);
    const userEmailKey = normalizeMovementLocationKey(haCurrentUser?.email?.split('@')[0]);
    const userNeedles = new Set([userNameKey, userUsernameKey, userEmailKey].filter(Boolean));

    let selectedPersonEntityId: string | null = null;
    let selectedPersonScore = -1;
    let selectedPersonLinkedTrackers: string[] = [];

    Object.entries(haStates).forEach(([entityId, entity]) => {
      if (!entityId.startsWith('person.')) {
        return;
      }
      const rawAttributes = entity.rawAttributes ?? {};
      const friendlyNameKey = normalizeMovementLocationKey(toTrimmedString(rawAttributes.friendly_name));
      const linkedUserId = normalizeLower(toTrimmedString(rawAttributes.user_id));
      const entityKey = normalizeMovementLocationKey(entityId.slice('person.'.length));
      const linkedTrackers = toStringArray(rawAttributes.entity_id).map((entry) => entry.trim()).filter(Boolean);

      let score = 0;
      if (userIdKey && linkedUserId === userIdKey) {
        score += 100;
      }
      if (userNeedles.size > 0) {
        if (friendlyNameKey && userNeedles.has(friendlyNameKey)) {
          score += 45;
        }
        if (entityKey && userNeedles.has(entityKey)) {
          score += 30;
        }
      }
      if (linkedTrackers.some((trackerId) => trackerId.startsWith('device_tracker.'))) {
        score += 5;
      }

      if (score > selectedPersonScore) {
        selectedPersonScore = score;
        selectedPersonEntityId = entityId;
        selectedPersonLinkedTrackers = linkedTrackers;
      }
    });

    const trackerEntityIds = new Set<string>();
    selectedPersonLinkedTrackers.forEach((entityId) => {
      if (entityId.startsWith('device_tracker.')) {
        trackerEntityIds.add(entityId);
      }
    });

    Object.entries(haStates).forEach(([entityId, entity]) => {
      if (!entityId.startsWith('device_tracker.')) {
        return;
      }
      const rawAttributes = entity.rawAttributes ?? {};
      const linkedUserId = normalizeLower(toTrimmedString(rawAttributes.user_id));
      const friendlyNameKey = normalizeMovementLocationKey(toTrimmedString(rawAttributes.friendly_name));
      const entityKey = normalizeMovementLocationKey(entityId.slice('device_tracker.'.length));
      const byUserId = userIdKey && linkedUserId === userIdKey;
      const byName = userNeedles.size > 0 && (userNeedles.has(friendlyNameKey) || userNeedles.has(entityKey));
      if (byUserId || byName) {
        trackerEntityIds.add(entityId);
      }
    });

    const trackedEntityIds = new Set<string>();
    if (selectedPersonEntityId) {
      trackedEntityIds.add(selectedPersonEntityId);
    }
    trackerEntityIds.forEach((entityId) => trackedEntityIds.add(entityId));

    const formatMovementDateTime = (timestampMs: number) =>
      formatDate(timestampMs, {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });

    const basePoints: ProfileMovementMapPoint[] = [];
    const pushPoint = (entityId: string, isCurrent?: boolean) => {
      const entity = haStates[entityId];
      if (!entity) {
        return;
      }
      const coordinates = readMovementCoordinates(entity.rawAttributes);
      if (!coordinates) {
        return;
      }
      const rawAttributes = entity.rawAttributes ?? {};
      const friendlyName = toTrimmedString(rawAttributes.friendly_name) ?? entityId;
      const stateLabel = toTrimmedString(entity.stateLabel ?? entity.state);
      const timestampMs = toTimestampMs(rawAttributes.__last_changed) ?? Date.now();
      basePoints.push({
        id: `${entityId}-${timestampMs}`,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        label: friendlyName,
        zoneLabel: formatMovementLocationLabel(stateLabel, {
          unknown: t('home.location.unknown'),
          home: t('home.location.home'),
          away: t('home.location.away'),
          generic: t('home.location.generic'),
        }),
        timestampLabel: formatMovementDateTime(timestampMs),
        timestampMs,
        isCurrent: isCurrent === true,
      });
    };

    if (selectedPersonEntityId) {
      pushPoint(selectedPersonEntityId, true);
    }
    trackerEntityIds.forEach((entityId) => pushPoint(entityId));

    const dedupedPoints = basePoints
      .sort((first, second) => second.timestampMs - first.timestampMs)
      .filter((entry, index, source) => source.findIndex((candidate) => candidate.id === entry.id) === index)
      .slice(0, PROFILE_MOVEMENT_MAX_ENTRIES);

    const baseTimeline: ProfileMovementTimelineEntry[] = dedupedPoints.map((point, index) => ({
      id: `current-${point.id}-${index}`,
      title: point.zoneLabel
        ? t('home.location.presence', { zone: point.zoneLabel })
        : t('home.location.current'),
      subtitle: point.label,
      timestampLabel: point.timestampLabel,
      timestampMs: point.timestampMs,
      isCurrent: point.isCurrent,
    }));

    return {
      zoneLookup,
      trackedEntityIds: Array.from(trackedEntityIds),
      trackerDeviceCount: trackerEntityIds.size,
      basePoints: dedupedPoints,
      baseTimeline,
    };
  }, [formatDate, haCurrentUser?.email, haCurrentUser?.id, haCurrentUser?.name, haCurrentUser?.username, haStates, t]);

  const baseHaStatesForUi = useMemo<MockEntityStateMap>(() => {
    if (!isHaConnected) {
      if (effectiveRuntimeMode === 'real') {
        return haStates;
      }
      return {
        ...haStates,
        ...mediaPlayerStateMocks,
        ...coverStateMocks,
        ...lockStateMocks,
        ...cameraStateMocks,
        ...vacuumStateMocks,
        [CLIMATE_LIVING_ROOM_MOCK_ENTITY_ID]: livingRoomClimateMock,
        [HOME_ALARM_MOCK_ENTITY_ID]: homeAlarmMock,
      };
    }

    let nextStates: MockEntityStateMap | null = null;
    const ensureNextStates = () => {
      if (!nextStates) {
        nextStates = { ...haStates };
      }
      return nextStates;
    };
    const resolveBaseEntity = (entityId: string): MockEntityState | undefined => {
      const mergedEntity = nextStates?.[entityId];
      if (mergedEntity) {
        return mergedEntity;
      }
      return haStates[entityId];
    };

    Object.entries(climatePendingByEntity).forEach(([entityId, pending]) => {
      if (!hasClimatePendingValues(pending)) {
        return;
      }
      const entity = resolveBaseEntity(entityId);
      if (!entity) {
        return;
      }

      const rawAttributes = { ...(entity.rawAttributes ?? {}) };
      let changed = false;
      let targetValue = entity.targetValue;
      let targetTempLow = entity.targetTempLow;
      let targetTempHigh = entity.targetTempHigh;
      let fanMode = entity.fanMode;
      let targetHumidity = entity.targetHumidity;
      let presetMode = entity.presetMode;
      let swingMode = entity.swingMode;
      let swingHorizontalMode = entity.swingHorizontalMode;
      let hasTargetPending = false;
      let hasFanPending = false;
      let hasHumidityPending = false;
      let hasPresetPending = false;
      let hasSwingPending = false;
      let hasSwingHorizontalPending = false;

      if (Number.isFinite(pending.targetTemp)) {
        targetValue = pending.targetTemp;
        rawAttributes.temperature = pending.targetTemp;
        changed = true;
        hasTargetPending = true;
      }
      if (Number.isFinite(pending.targetTempLow)) {
        targetTempLow = pending.targetTempLow;
        rawAttributes.target_temp_low = pending.targetTempLow;
        changed = true;
        hasTargetPending = true;
      }
      if (Number.isFinite(pending.targetTempHigh)) {
        targetTempHigh = pending.targetTempHigh;
        rawAttributes.target_temp_high = pending.targetTempHigh;
        changed = true;
        hasTargetPending = true;
      }
      const pendingFanMode = normalizeLower(pending.fanMode);
      if (pendingFanMode) {
        fanMode = pendingFanMode;
        rawAttributes.fan_mode = pendingFanMode;
        changed = true;
        hasFanPending = true;
      }
      if (Number.isFinite(pending.targetHumidity)) {
        targetHumidity = pending.targetHumidity;
        rawAttributes.humidity = pending.targetHumidity;
        changed = true;
        hasHumidityPending = true;
      }
      const pendingPresetMode = normalizeLower(pending.presetMode);
      if (pendingPresetMode) {
        presetMode = pendingPresetMode;
        rawAttributes.preset_mode = pendingPresetMode;
        changed = true;
        hasPresetPending = true;
      }
      const pendingSwingMode = normalizeLower(pending.swingMode);
      if (pendingSwingMode) {
        swingMode = pendingSwingMode;
        rawAttributes.swing_mode = pendingSwingMode;
        changed = true;
        hasSwingPending = true;
      }
      const pendingSwingHorizontalMode = normalizeLower(pending.swingHorizontalMode);
      if (pendingSwingHorizontalMode) {
        swingHorizontalMode = pendingSwingHorizontalMode;
        rawAttributes.swing_horizontal_mode = pendingSwingHorizontalMode;
        changed = true;
        hasSwingHorizontalPending = true;
      }
      if (hasTargetPending) {
        rawAttributes[CLIMATE_PENDING_TARGET_ATTRIBUTE_KEY] = true;
      }
      if (hasFanPending) {
        rawAttributes[CLIMATE_PENDING_FAN_ATTRIBUTE_KEY] = true;
      }
      if (hasHumidityPending) {
        rawAttributes[CLIMATE_PENDING_HUMIDITY_ATTRIBUTE_KEY] = true;
      }
      if (hasPresetPending) {
        rawAttributes[CLIMATE_PENDING_PRESET_ATTRIBUTE_KEY] = true;
      }
      if (hasSwingPending) {
        rawAttributes[CLIMATE_PENDING_SWING_ATTRIBUTE_KEY] = true;
      }
      if (hasSwingHorizontalPending) {
        rawAttributes[CLIMATE_PENDING_SWING_HORIZONTAL_ATTRIBUTE_KEY] = true;
      }
      if (!changed) {
        return;
      }

      ensureNextStates()[entityId] = {
        ...entity,
        targetValue,
        targetTempLow,
        targetTempHigh,
        fanMode,
        targetHumidity,
        presetMode,
        swingMode,
        swingHorizontalMode,
        rawAttributes,
      };
    });

    Object.entries(coverPendingByEntity).forEach(([entityId, pending]) => {
      if (!hasCoverPendingValues(pending)) {
        return;
      }
      const entity = resolveBaseEntity(entityId);
      if (!entity) {
        return;
      }
      const rawAttributes = { ...(entity.rawAttributes ?? {}) };
      let changed = false;
      let stateValue = entity.state;
      let stateLabel = entity.stateLabel;

      const pendingState = normalizeCoverState(pending.state);
      if (pendingState && pendingState !== 'unknown') {
        stateValue = pendingState;
        stateLabel = pendingState;
        rawAttributes.state = pendingState;
        changed = true;
      }
      if (Number.isFinite(pending.position)) {
        rawAttributes.current_position = pending.position;
        rawAttributes.position = pending.position;
        rawAttributes.current_cover_position = pending.position;
        changed = true;
      }
      if (Number.isFinite(pending.tiltPosition)) {
        rawAttributes.current_tilt_position = pending.tiltPosition;
        rawAttributes.tilt_position = pending.tiltPosition;
        rawAttributes.current_cover_tilt_position = pending.tiltPosition;
        rawAttributes[COVER_PENDING_TILT_ATTRIBUTE_KEY] = true;
        changed = true;
      }
      if (!changed) {
        return;
      }
      rawAttributes[COVER_PENDING_ATTRIBUTE_KEY] = true;

      ensureNextStates()[entityId] = {
        ...entity,
        state: stateValue,
        stateLabel,
        rawAttributes,
      };
    });

    Object.entries(lightBrightnessPendingByEntity).forEach(([entityId, pending]) => {
      const entity = resolveBaseEntity(entityId);
      if (!entity) {
        return;
      }
      const rawAttributes = { ...(entity.rawAttributes ?? {}) };
      rawAttributes[LIGHT_BRIGHTNESS_PENDING_ATTRIBUTE_KEY] = pending.brightness;
      if (pending.brightness > 0) {
        rawAttributes.brightness = Math.round((pending.brightness / 100) * 255);
      } else {
        delete rawAttributes.brightness;
      }

      ensureNextStates()[entityId] = {
        ...entity,
        brightness: pending.brightness,
        numericValue: pending.brightness,
        rawAttributes,
      };
    });

    Object.entries(lightColorPendingByEntity).forEach(([entityId, pending]) => {
      const entity = resolveBaseEntity(entityId);
      if (!entity) {
        return;
      }
      const rawAttributes = { ...(entity.rawAttributes ?? {}) };
      const nextHsColor: [number, number] = [pending.hsColor[0], pending.hsColor[1]];
      const nextColorMode = entity.colorMode ?? entity.color_mode ?? 'hs';
      rawAttributes.hs_color = nextHsColor;
      rawAttributes.color_mode = nextColorMode;

      ensureNextStates()[entityId] = {
        ...entity,
        state: entity.state === 'off' ? 'on' : entity.state,
        toggleOn: true,
        hsColor: nextHsColor,
        hs_color: nextHsColor,
        colorMode: nextColorMode,
        color_mode: nextColorMode,
        rawAttributes,
      };
    });

    Object.entries(lightTogglePendingByEntity).forEach(([entityId, pending]) => {
      const entity = resolveBaseEntity(entityId);
      if (!entity) {
        return;
      }

      const rawAttributes = { ...(entity.rawAttributes ?? {}) };
      rawAttributes[LIGHT_TOGGLE_PENDING_ATTRIBUTE_KEY] = pending.targetOn;

      ensureNextStates()[entityId] = {
        ...entity,
        state: pending.targetOn ? 'on' : 'off',
        toggleOn: pending.targetOn,
        rawAttributes,
      };
    });

    Object.entries(switchTogglePendingByEntity).forEach(([entityId, pending]) => {
      const entity = resolveBaseEntity(entityId);
      if (!entity) {
        return;
      }

      const rawAttributes = { ...(entity.rawAttributes ?? {}) };
      rawAttributes[SWITCH_TOGGLE_PENDING_ATTRIBUTE_KEY] = pending.targetOn;

      ensureNextStates()[entityId] = {
        ...entity,
        state: pending.targetOn ? 'on' : 'off',
        stateLabel: pending.targetOn ? 'on' : 'off',
        toggleOn: pending.targetOn,
        rawAttributes,
      };
    });

    Object.entries(lockPendingByEntity).forEach(([entityId, pending]) => {
      const entity = resolveBaseEntity(entityId);
      if (!entity) {
        return;
      }
      const rawAttributes = { ...(entity.rawAttributes ?? {}) };
      rawAttributes[LOCK_PENDING_ATTRIBUTE_KEY] = pending.action;

      ensureNextStates()[entityId] = {
        ...entity,
        state: pending.targetState,
        stateLabel: pending.targetState,
        toggleOn: pending.targetState === 'locked',
        rawAttributes,
      };
    });

    Object.entries(alarmPendingByEntity).forEach(([entityId, pending]) => {
      const entity = resolveBaseEntity(entityId);
      if (!entity) {
        return;
      }
      const rawAttributes = { ...(entity.rawAttributes ?? {}) };
      rawAttributes[ALARM_PENDING_ATTRIBUTE_KEY] = pending.service;

      ensureNextStates()[entityId] = {
        ...entity,
        state: pending.visualState,
        stateLabel: pending.visualState,
        toggleOn: isAlarmArmedState(pending.targetState),
        rawAttributes,
      };
    });

    if (effectiveRuntimeMode === 'demo') {
      if (!haStates[CLIMATE_LIVING_ROOM_MOCK_ENTITY_ID]) {
        ensureNextStates()[CLIMATE_LIVING_ROOM_MOCK_ENTITY_ID] = livingRoomClimateMock;
      }
      if (!haStates[HOME_ALARM_MOCK_ENTITY_ID]) {
        ensureNextStates()[HOME_ALARM_MOCK_ENTITY_ID] = homeAlarmMock;
      }
      [mediaPlayerStateMocks, coverStateMocks, lockStateMocks, cameraStateMocks, vacuumStateMocks]
        .forEach((fixtureMap) => {
          Object.entries(fixtureMap).forEach(([entityId, entity]) => {
            if (!haStates[entityId]) {
              ensureNextStates()[entityId] = entity;
            }
          });
        });
    }

    return nextStates ?? haStates;
  }, [alarmPendingByEntity, cameraStateMocks, climatePendingByEntity, coverPendingByEntity, coverStateMocks, effectiveRuntimeMode, haStates, homeAlarmMock, isHaConnected, lightBrightnessPendingByEntity, lightColorPendingByEntity, lightTogglePendingByEntity, livingRoomClimateMock, lockPendingByEntity, lockStateMocks, mediaPlayerStateMocks, switchTogglePendingByEntity, vacuumStateMocks]);
  const haStatesForUi = useMemo<MockEntityStateMap>(() => {
    let enrichedStates: MockEntityStateMap | null = null;
    Object.values(commandCoordinator.statuses)
      .filter((status) => status.phase === 'sending' || status.phase === 'awaiting_confirmation')
      .sort((left, right) => left.updatedAt - right.updatedAt)
      .forEach((status) => {
        const entity = (enrichedStates ?? baseHaStatesForUi)[status.entityId];
        if (!entity) return;
        if (!enrichedStates) enrichedStates = { ...baseHaStatesForUi };
        enrichedStates[status.entityId] = {
          ...entity,
          rawAttributes: {
            ...(entity.rawAttributes ?? {}),
            [DEVICE_COMMAND_PHASE_ATTRIBUTE_KEY]: status.phase,
          },
        };
      });
    Object.entries(baseHaStatesForUi).forEach(([entityId, entity]) => {
      if (!entityId.startsWith('vacuum.')) return;
      const context = buildVacuumDeviceContext({
        vacuumEntityId: entityId,
        haStates: baseHaStatesForUi,
        entityRegistry: haEntityRegistry,
        deviceRegistry: haDeviceRegistry,
        haUrl,
      });
      const snapshot = context.snapshot;
      if (
        snapshot.batteryLevel === undefined &&
        !snapshot.mapUrl &&
        snapshot.cleanedArea === undefined &&
        snapshot.cleaningMinutes === undefined
      ) {
        return;
      }
      const currentEntity = (enrichedStates ?? baseHaStatesForUi)[entityId] ?? entity;
      if (!enrichedStates) enrichedStates = { ...baseHaStatesForUi };
      enrichedStates[entityId] = enrichVacuumEntity(currentEntity, snapshot);
    });
    return enrichedStates ?? baseHaStatesForUi;
  }, [baseHaStatesForUi, commandCoordinator.statuses, haDeviceRegistry, haEntityRegistry, haUrl]);
  const weatherConfigSection = useMemo(() => {
    const greetingWithWeather = sections.find(
      (section) => section.kind === 'greeting' && (section.showWeather ?? false),
    );
    if (greetingWithWeather) {
      return greetingWithWeather;
    }
    return sections.find((section) => section.kind === 'weather') ?? null;
  }, [sections]);
  const weatherEntityId = useMemo(
    () => weatherConfigSection?.weatherEntityId?.trim() || undefined,
    [weatherConfigSection],
  );
  const weatherForecastType = useMemo(
    () => weatherConfigSection?.weatherForecastType ?? 'daily',
    [weatherConfigSection],
  );
  const { state, actions } = useDashboardState({
    haStates: haStatesForUi,
    haStatus,
    allowMockFallback: effectiveRuntimeMode === 'demo',
    weatherEntityId,
    weatherForecastType,
    haCallApi: callHaApi,
  });
  const [activeDevice, setActiveDevice] = useState<ActiveDevice | null>(null);
  const [pendingQuickAlarmAction, setPendingQuickAlarmAction] = useState<AlarmQuickAuthAction | null>(null);
  const [pendingQuickLockAction, setPendingQuickLockAction] = useState<LockQuickAuthAction | null>(null);
  const [hasMountedQuickSecurityAuth, setHasMountedQuickSecurityAuth] = useState(false);
  const [quickAlarmAuthCode, setQuickAlarmAuthCode] = useState('');
  const [quickAlarmSubmissionError, setQuickAlarmSubmissionError] = useState('');
  const [quickAlarmAuthAttemptState, setQuickAlarmAuthAttemptState] = useState(INITIAL_AUTH_ATTEMPT_STATE);
  const [quickLockAuthAttemptState, setQuickLockAuthAttemptState] = useState(INITIAL_AUTH_ATTEMPT_STATE);
  const [isQuickAlarmAuthBusy, setIsQuickAlarmAuthBusy] = useState(false);
  const [isLockAuthBusy, setIsLockAuthBusy] = useState(false);
  const deviceAuthUser = useMemo(
    () => ({
      id:
        haCurrentUser?.id ??
        haCurrentUser?.email ??
        haCurrentUser?.username ??
        'dashboard_user',
      name:
        haCurrentUser?.username ??
        haCurrentUser?.email ??
        haCurrentUser?.name ??
        'current_user',
      displayName: haCurrentUser?.name ?? haCurrentUser?.username ?? 'Utente Corrente',
    }),
    [haCurrentUser?.email, haCurrentUser?.id, haCurrentUser?.name, haCurrentUser?.username],
  );
  const deviceAuth = useDeviceAuth(deviceAuthUser);
  const [sensorHistoryByEntity, setSensorHistoryByEntity] = useState<Record<string, number[]>>({});
  const [cameraHistory, setCameraHistory] = useState<{
    cameraEntityId?: string;
    status: CameraHistoryStatus;
    entries: CameraHistoryEntry[];
    error?: string;
  }>({ status: 'idle', entries: [] });
  const [cameraHistoryRefreshNonce, setCameraHistoryRefreshNonce] = useState(0);
  const cameraHistoryRequestRef = useRef(0);
  const refreshCameraHistory = useCallback(() => {
    setCameraHistoryRefreshNonce(Date.now());
  }, []);
  const [isEditMode, setIsEditMode] = useState(false);
  const [hasUnsavedDashboardEdits, setHasUnsavedDashboardEdits] = useState(false);
  const [isDashboardSaveBusy, setIsDashboardSaveBusy] = useState(false);
  const [isDashboardConflictOpen, setIsDashboardConflictOpen] = useState(false);
  const editSessionBaselineRef = useRef<DashboardEditorSnapshot | null>(null);
  const editSessionCreatedAtRef = useRef<number | null>(null);
  const allowDashboardUnloadRef = useRef(false);
  const editSessionRouteRef = useRef<string | null>(null);
  const [isXsViewport, setIsXsViewport] = useState(isXsViewportNow);
  const [isCompactViewport, setIsCompactViewport] = useState(isCompactViewportNow);
  const [isDesktopViewport, setIsDesktopViewport] = useState(isDesktopViewportNow);
  const [canvasGridBreakpoint, setCanvasGridBreakpoint] = useState<DashboardGridBreakpoint>(resolveGridBreakpointNow);
  const [viewportPreviewMode, setViewportPreviewMode] = useState<DashboardViewportPreviewMode>('auto');
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [selectedWidgetDisplayMetrics, setSelectedWidgetDisplayMetrics] = useState<WidgetDisplayMetrics | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [selectedSidebarPathId, setSelectedSidebarPathId] = useState<string | null>(null);
  const [runningSceneBySectionId, setRunningSceneBySectionId] = useState<Partial<Record<string, SceneRunState>>>({});
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(resolveProfileFromLocation);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [profileInitialSection, setProfileInitialSection] = useState<ProfileSectionId>('members');
  const [editConfirm, setEditConfirm] = useState<'enter' | 'exit' | 'refresh' | null>(null);
  const [pendingStackRemovalId, setPendingStackRemovalId] = useState<string | null>(null);
  const [isConsumptionView, setIsConsumptionView] = useState(resolveConsumptionFromLocation);
  const [isConsumptionDetailView, setIsConsumptionDetailView] = useState(resolveConsumptionDetailFromLocation);
  const [isAutomationView, setIsAutomationView] = useState(resolveAutomationFromLocation);
  const [isAppGalleryView, setIsAppGalleryView] = useState(resolveAppGalleryFromLocation);
  const [isRoomsView, setIsRoomsView] = useState(resolveRoomsFromLocation);
  const [isSecurityView, setIsSecurityView] = useState(resolveSecurityFromLocation);
  const [isSecurityCamerasView, setIsSecurityCamerasView] = useState(resolveSecurityCamerasFromLocation);
  const [isSettingsView, setIsSettingsView] = useState(resolveSettingsFromLocation);
  const [isEditAvailableForRoute, setIsEditAvailableForRoute] = useState(resolveEditAvailabilityFromLocation);
  const [internalNavigationRoute, setInternalNavigationRoute] = useState(() =>
    typeof window === 'undefined' || !canUseBrowserRouteNavigation ? '/home' : window.location.href,
  );
  const [selectedConsumptionCardId, setSelectedConsumptionCardId] = useState<ConsumptionCardId | null>('electricity');
  const [oauthFlowError, setOAuthFlowError] = useState<string | null>(null);
  const [isOAuthFlowBusy, setIsOAuthFlowBusy] = useState(false);
  const oauthExchangePromiseRef = useRef<ReturnType<typeof exchangeHaOAuthCode> | null>(null);
  const [pendingStoredOAuthReconnectUrl, setPendingStoredOAuthReconnectUrl] = useState<string | null>(null);
  const [completedMainGuides, setCompletedMainGuides] = useState<Record<MainGuidedSetupKind, boolean>>(() => ({
    welcome: isOnboardingCompleted(MAIN_GUIDED_SETUP_STORAGE_KEYS.welcome),
    context: isOnboardingCompleted(MAIN_GUIDED_SETUP_STORAGE_KEYS.context),
  }));
  const [activeMainGuideStepId, setActiveMainGuideStepId] = useState<string | null>(null);

  const nextWidgetIdRef = useRef(1);
  const nextSectionIdRef = useRef(1);
  const lockPendingTimeoutRef = useRef<Record<string, number>>({});
  const alarmPendingTimeoutRef = useRef<Record<string, number>>({});
  const lockActivityRefreshTimeoutRef = useRef<Record<string, number[]>>({});
  const alarmActivityRefreshTimeoutRef = useRef<Record<string, number[]>>({});
  const activityFetchSeqRef = useRef(0);
  const vacuumReturnToBaseTimeoutRef = useRef<Record<string, number>>({});
  const profileReturnRouteRef = useRef('/home');
  const cameraPtzControlModeRef = useRef<'button' | 'service' | null>(null);
  const previousHaStatusRef = useRef<typeof haStatus | null>(null);
  const reconnectToastIdRef = useRef<string | null>(null);
  const reconnectInFlightRef = useRef(false);
  const hadSuccessfulConnectionRef = useRef(false);
  const sensorHistoryInFlightRef = useRef<Record<string, boolean>>({});

  const clearTimeoutRegistry = (timeoutRef: React.MutableRefObject<Record<string, number>>) => {
    const timers = timeoutRef.current;
    Object.values(timers).forEach((timeoutId) => window.clearTimeout(timeoutId));
    timeoutRef.current = {};
  };

  const clearTimeoutForEntity = (
    timeoutRef: React.MutableRefObject<Record<string, number>>,
    entityId: string,
  ) => {
    const timeoutId = timeoutRef.current[entityId];
    if (timeoutId === undefined) {
      return;
    }
    window.clearTimeout(timeoutId);
    delete timeoutRef.current[entityId];
  };

  const clearTimeoutArrayForEntity = (
    timeoutRef: React.MutableRefObject<Record<string, number[]>>,
    entityId: string,
  ) => {
    const timeoutIds = timeoutRef.current[entityId];
    if (!timeoutIds) {
      return;
    }
    timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
    delete timeoutRef.current[entityId];
  };

  const clearTimeoutArrayRegistry = (timeoutRef: React.MutableRefObject<Record<string, number[]>>) => {
    Object.values(timeoutRef.current).forEach((timeoutIds) => {
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
    });
    timeoutRef.current = {};
  };

  const scheduleLockActivityRefresh = (entityId: string) => {
    const normalizedEntityId = entityId.trim();
    if (!normalizedEntityId) {
      return;
    }
    clearTimeoutArrayForEntity(lockActivityRefreshTimeoutRef, normalizedEntityId);
    setLockTimelineByEntity((current) => ({
      ...current,
      [normalizedEntityId]: [],
    }));
    setLockActivityStatusByEntity((current) => ({
      ...current,
      [normalizedEntityId]: 'loading',
    }));
    setActivityRefreshNonce((current) => current + 1);
    lockActivityRefreshTimeoutRef.current[normalizedEntityId] = [900, 2600, 5200].map((delayMs) =>
      window.setTimeout(() => {
        setActivityRefreshNonce((current) => current + 1);
      }, delayMs),
    );
  };

  const scheduleAlarmActivityRefresh = (entityId: string) => {
    const normalizedEntityId = entityId.trim();
    if (!normalizedEntityId) {
      return;
    }
    clearTimeoutArrayForEntity(alarmActivityRefreshTimeoutRef, normalizedEntityId);
    setAlarmTimelineByEntity((current) => ({
      ...current,
      [normalizedEntityId]: [],
    }));
    setAlarmActivityStatusByEntity((current) => ({
      ...current,
      [normalizedEntityId]: 'loading',
    }));
    setActivityRefreshNonce((current) => current + 1);
    alarmActivityRefreshTimeoutRef.current[normalizedEntityId] = [900, 2600, 5200].map((delayMs) =>
      window.setTimeout(() => {
        setActivityRefreshNonce((current) => current + 1);
      }, delayMs),
    );
  };

  const removePendingEntities = <TPendingEntry,>(
    setPendingByEntity: React.Dispatch<React.SetStateAction<Record<string, TPendingEntry>>>,
    entityIds: string[],
  ) => {
    if (entityIds.length === 0) {
      return;
    }
    setPendingByEntity((current) => {
      let changed = false;
      const next = { ...current };
      entityIds.forEach((entityId) => {
        if (!(entityId in next)) {
          return;
        }
        changed = true;
        delete next[entityId];
      });
      return changed ? next : current;
    });
  };

  const setEntityPendingWithExpiry = <TPendingEntry,>(
    entityId: string,
    entry: TPendingEntry,
    ttlMs: number,
    timeoutRef: React.MutableRefObject<Record<string, number>>,
    setPendingByEntity: React.Dispatch<React.SetStateAction<Record<string, TPendingEntry>>>,
  ) => {
    clearTimeoutForEntity(timeoutRef, entityId);
    setPendingByEntity((current) => ({
      ...current,
      [entityId]: entry,
    }));
    timeoutRef.current[entityId] = window.setTimeout(() => {
      setPendingByEntity((current) => {
        if (!(entityId in current)) {
          return current;
        }
        const next = { ...current };
        delete next[entityId];
        return next;
      });
      delete timeoutRef.current[entityId];
    }, ttlMs);
  };

  useEffect(() => {
    if (isHaConnected) {
      return;
    }
    sensorHistoryInFlightRef.current = {};
    setSensorHistoryByEntity((current) => (Object.keys(current).length > 0 ? {} : current));
  }, [isHaConnected, haUrl]);

  useEffect(() => {
    const updateViewport = () => {
      const nextXs = isXsViewportNow();
      const nextCompact = isCompactViewportNow();
      const nextDesktop = isDesktopViewportNow();
      setIsXsViewport((current) => (current === nextXs ? current : nextXs));
      setIsCompactViewport((current) => (current === nextCompact ? current : nextCompact));
      setIsDesktopViewport((current) => (current === nextDesktop ? current : nextDesktop));
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
    };
  }, []);

  const visibleSidebarPaths = sidebarPaths;
  const canToggleEditMode =
    runtimeMode !== null &&
    isEditAvailableForRoute &&
    dashboardSecurity.can('edit_dashboard');

  useEffect(() => {
    const maxWidgetCustomIndex = widgets.reduce((max, widget) => {
      const match = /\.custom_(\d+)$/.exec(widget.id);
      if (!match) {
        return max;
      }
      const parsed = Number.parseInt(match[1], 10);
      return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
    }, 0);
    nextWidgetIdRef.current = Math.max(nextWidgetIdRef.current, maxWidgetCustomIndex + 1);

    const maxSectionIndex = sections.reduce((max, section) => {
      const match = /^section-[a-z-]+-(\d+)$/.exec(section.id);
      if (!match) {
        return max;
      }
      const parsed = Number.parseInt(match[1], 10);
      return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
    }, 0);
    nextSectionIdRef.current = Math.max(nextSectionIdRef.current, maxSectionIndex + 1);
  }, [sections, widgets]);

  const selectedWidget = useMemo(
    () => widgets.find((widget) => widget.id === selectedWidgetId) ?? null,
    [widgets, selectedWidgetId],
  );
  const selectedWidgetActiveLayout = useMemo(() => {
    if (!selectedWidget) {
      return null;
    }
    const breakpointLayouts = selectedWidget.parentSectionId
      ? responsiveLayouts.stacks?.[selectedWidget.parentSectionId]
      : responsiveLayouts.root;
    const activeLayoutItem = breakpointLayouts?.[canvasGridBreakpoint]?.find(
      (item) => item.i === selectedWidget.id,
    );
    return activeLayoutItem
      ? {
          w: activeLayoutItem.w,
          h: activeLayoutItem.h,
        }
      : null;
  }, [canvasGridBreakpoint, responsiveLayouts.root, responsiveLayouts.stacks, selectedWidget]);

  const handleWidgetDisplayMetricsChange = useCallback((metrics: WidgetDisplayMetrics) => {
    setSelectedWidgetDisplayMetrics((current) =>
      current?.widgetId === metrics.widgetId &&
      current.width === metrics.width &&
      current.height === metrics.height &&
      current.variant === metrics.variant
        ? current
        : metrics,
    );
  }, []);

  useEffect(() => {
    setSelectedWidgetDisplayMetrics((current) =>
      current?.widgetId === selectedWidgetId ? current : null,
    );
  }, [selectedWidgetId]);

  const selectedSection = useMemo(
    () => sections.find((section) => section.id === selectedSectionId) ?? null,
    [sections, selectedSectionId],
  );

  const pendingStackRemoval = useMemo(() => {
    if (!pendingStackRemovalId) return null;
    const section = sections.find((candidate) => candidate.id === pendingStackRemovalId);
    if (!section || !['stack-grid', 'stack-horizontal', 'stack-vertical'].includes(section.kind)) return null;
    return {
      section,
      cardCount: widgets.filter((widget) => widget.parentSectionId === pendingStackRemovalId).length,
    };
  }, [pendingStackRemovalId, sections, widgets]);

  const selectedSidebarPath = useMemo(
    () => visibleSidebarPaths.find((entry) => entry.id === selectedSidebarPathId) ?? null,
    [selectedSidebarPathId, visibleSidebarPaths],
  );
  const LIGHT_WIDGET_HEIGHT_OFF = 1;
  const LIGHT_WIDGET_HEIGHT_ON = 2;
  const CLIMATE_WIDGET_WIDTH = 2;
  const CLIMATE_WIDGET_HEIGHT = 2;
  const CAMERA_WIDGET_MIN_HEIGHT = 3;
  const MEDIA_WIDGET_MIN_WIDTH = 3;
  const MEDIA_WIDGET_MIN_HEIGHT = 3;
  const VACUUM_WIDGET_MIN_WIDTH = 1;
  const VACUUM_WIDGET_MIN_HEIGHT = 1;
  const VACUUM_WIDGET_DEFAULT_WIDTH = 2;
  const VACUUM_WIDGET_DEFAULT_HEIGHT = 2;
  const COVER_WIDGET_MIN_WIDTH = 2;
  const COVER_WIDGET_MIN_HEIGHT = 1;
  const MEMBERS_WIDGET_MIN_WIDTH = 3;
  const MEMBERS_WIDGET_MIN_HEIGHT = 2;
  const isStackSection = (section: DashboardSection) =>
    section.kind === 'stack-vertical' || section.kind === 'stack-horizontal' || section.kind === 'stack-grid';
  const firstStackSectionId = useMemo(
    () => sections.find((section) => isStackSection(section))?.id ?? null,
    [sections],
  );
  const resolveStackColumns = (section: DashboardSection) => {
    if (section.kind === 'stack-vertical') {
      return 1;
    }
    if (section.kind === 'stack-grid' && section.stackColumnsMode !== 'manual') {
      return Math.max(1, Math.round(section.layout.w));
    }
    return Math.max(1, Math.round(section.stackColumns ?? section.layout.w));
  };
  const normalizeLayoutForStack = (section: DashboardSection, layout: GridItem): GridItem => {
    const cols = resolveStackColumns(section);
    let next = {
      i: layout.i,
      x: Math.max(0, Math.round(layout.x)),
      y: Math.max(0, Math.round(layout.y)),
      w: Math.max(1, Math.round(layout.w)),
      h: Math.max(1, Math.round(layout.h)),
    };

    if (section.kind === 'stack-vertical') {
      next = {
        ...next,
        x: 0,
        w: 1,
      };
    }

    if (section.kind !== 'stack-vertical') {
      const safeW = Math.min(next.w, cols);
      const maxX = Math.max(0, cols - safeW);
      next = {
        ...next,
        w: safeW,
        x: Math.min(next.x, maxX),
      };
    }

    return next;
  };
  const normalizeRootLayout = (layout: GridItem): GridItem => {
    const safeW = Math.min(ROOT_CANVAS_COLS, Math.max(1, Math.round(layout.w)));
    const maxX = Math.max(0, ROOT_CANVAS_COLS - safeW);
    return {
      i: layout.i,
      x: Math.min(Math.max(0, Math.round(layout.x)), maxX),
      y: Math.max(0, Math.round(layout.y)),
      w: safeW,
      h: Math.max(1, Math.round(layout.h)),
    };
  };
  const resolveFixedWeatherSectionSpan = (section: DashboardSection): { w: number; h: number } | null => {
    if (section.kind !== 'weather') {
      return null;
    }
    const layoutMode = section.weatherLayout ?? 'auto';
    if (layoutMode === 'chip') {
      return { w: WEATHER_SECTION_CHIP_COLS, h: WEATHER_SECTION_CHIP_ROWS };
    }
    if (layoutMode === 'card') {
      return { w: WEATHER_SECTION_CARD_COLS, h: WEATHER_SECTION_CARD_ROWS };
    }
    return null;
  };
  const resolveSectionMinHeight = (section: DashboardSection) => {
    if (section.kind === 'greeting') {
      if (section.showWeather ?? false) {
        return WEATHER_SECTION_CARD_ROWS;
      }
      return GREETING_SECTION_ROWS;
    }
    if (section.kind === 'weather') {
      return WEATHER_SECTION_BASE_ROWS;
    }
    if (section.kind === 'scenes') {
      return SCENES_SECTION_ROWS;
    }
    if (section.kind === 'stack-grid') {
      return 1;
    }
    return ROOT_CANVAS_ROW_UNITS * 2;
  };
  const resolveSectionMinWidth = (section: DashboardSection) => {
    if (section.kind === 'greeting' && (section.showWeather ?? false)) {
      return ROOT_CANVAS_COLS;
    }
    if (section.kind === 'weather') {
      return WEATHER_SECTION_CHIP_COLS;
    }
    if (section.kind === 'stack-grid' && section.stackColumnsMode !== 'manual') {
      return 1;
    }
    return 2;
  };
  const haFavoriteEntityIdLookup = useMemo(() => new Set(haFavoriteEntityIds), [haFavoriteEntityIds]);
  const isWidgetMarkedFavorite = (widget: Widget) => {
    if (isHaConnected && haFavoriteLabelDetected) {
      return haFavoriteEntityIdLookup.has(widget.entityId);
    }
    return widget.isFavorite !== false;
  };
  const favoriteGridSections = useMemo(
    () =>
      sections.filter(
        (section) => section.kind === 'stack-grid' && (section.stackUseFavoritesGrid ?? false),
      ),
    [sections],
  );
  const normalizeSectionRootLayout = (section: DashboardSection, layout: GridItem): GridItem => {
    if (section.kind === 'greeting' && (section.showWeather ?? false)) {
      return {
        i: section.id,
        x: 0,
        y: Math.max(0, Math.round(layout.y)),
        w: ROOT_CANVAS_COLS,
        h: WEATHER_SECTION_CARD_ROWS,
      };
    }
    const fixedWeatherSpan = resolveFixedWeatherSectionSpan(section);
    const safeW = fixedWeatherSpan
      ? Math.min(ROOT_CANVAS_COLS, fixedWeatherSpan.w)
      : Math.min(ROOT_CANVAS_COLS, Math.max(resolveSectionMinWidth(section), Math.round(layout.w)));
    const maxX = Math.max(0, ROOT_CANVAS_COLS - safeW);
    return {
      i: section.id,
      x: Math.min(Math.max(0, Math.round(layout.x)), maxX),
      y: Math.max(0, Math.round(layout.y)),
      w: safeW,
      h: fixedWeatherSpan ? fixedWeatherSpan.h : Math.max(resolveSectionMinHeight(section), Math.round(layout.h)),
    };
  };
  const normalizeWidgetLayout = (widget: Widget, layout: GridItem): GridItem => {
    if (!widget.parentSectionId) {
      return normalizeRootLayout(layout);
    }
    const parentSection = sections.find((section) => section.id === widget.parentSectionId);
    if (!parentSection || !isStackSection(parentSection)) {
      return normalizeRootLayout(layout);
    }
    return normalizeLayoutForStack(parentSection, layout);
  };
  const resolveLightHeightRows = (widget: Widget, nextIsOn: boolean) => {
    const currentHeight = Math.max(1, Math.round(widget.layout.h));
    const typeOverride = widgetTypeLayoutOverrides.light?.[canvasGridBreakpoint];
    const widgetOverride = widgetLayoutOverrides[widget.id]?.[canvasGridBreakpoint];
    const autoExpand = widgetOverride?.autoExpand ?? typeOverride?.autoExpand ?? true;
    const configuredHeight = autoExpand
      ? nextIsOn
        ? widgetOverride?.hOn ?? widgetOverride?.h ?? typeOverride?.hOn ?? typeOverride?.h
        : widgetOverride?.hOff ?? widgetOverride?.h ?? typeOverride?.hOff ?? typeOverride?.h
      : widgetOverride?.h ?? widgetOverride?.hOff ?? widgetOverride?.hOn ??
        typeOverride?.h ?? typeOverride?.hOff ?? typeOverride?.hOn;
    if (typeof configuredHeight === 'number' && Number.isFinite(configuredHeight)) {
      return Math.max(1, Math.round(configuredHeight));
    }
    if (!autoExpand) {
      return currentHeight;
    }
    if (nextIsOn && currentHeight <= LIGHT_WIDGET_HEIGHT_OFF) {
      return LIGHT_WIDGET_HEIGHT_ON;
    }
    if (!nextIsOn && currentHeight <= LIGHT_WIDGET_HEIGHT_ON) {
      return LIGHT_WIDGET_HEIGHT_OFF;
    }
    return currentHeight;
  };
  const resolveLockMinimumHeightRows = () => 1;
  const toWidgetLayoutRows = (_widget: Widget, rows: number) => rows;
  const resolveWidgetMinimumLayout = (
    widget: Widget,
    minWidth: number,
    minHeight: number,
  ): GridItem =>
    normalizeWidgetLayout(widget, {
      i: widget.id,
      x: widget.layout.x,
      y: widget.layout.y,
      w: Math.max(minWidth, Math.round(widget.layout.w)),
      h: Math.max(minHeight, Math.round(widget.layout.h)),
    });
  const resolveLightLayoutForState = (widget: Widget, nextIsOn: boolean): GridItem => {
    const nextHeight = resolveLightHeightRows(widget, nextIsOn);
    return normalizeWidgetLayout(widget, {
      i: widget.id,
      x: widget.layout.x,
      y: widget.layout.y,
      w: Math.max(1, Math.round(widget.layout.w)),
      h: nextHeight,
    });
  };
  const resolveSwitchLayout = (widget: Widget): GridItem =>
    normalizeWidgetLayout(widget, {
      ...widget.layout,
      w: Math.max(1, Math.round(widget.layout.w)),
      h: Math.max(1, Math.round(widget.layout.h)),
    });
  const resolveClimateWidth = (widget: Widget) => {
    const parentSection =
      widget.parentSectionId ? sections.find((section) => section.id === widget.parentSectionId) : undefined;
    if (parentSection?.kind === 'stack-vertical') {
      return 1;
    }
    return Math.max(1, Math.round(widget.layout.w));
  };
  const resolveClimateHeight = (widget: Widget) => {
    return Math.max(CLIMATE_WIDGET_HEIGHT, Math.round(widget.layout.h));
  };
  const resolveClimateLayout = (widget: Widget): GridItem =>
    normalizeWidgetLayout(widget, {
      i: widget.id,
      x: widget.layout.x,
      y: widget.layout.y,
      w: resolveClimateWidth(widget),
      h: resolveClimateHeight(widget),
    });
  const resolveMediaLayout = (widget: Widget): GridItem =>
    resolveWidgetMinimumLayout(
      widget,
      MEDIA_WIDGET_MIN_WIDTH,
      toWidgetLayoutRows(widget, MEDIA_WIDGET_MIN_HEIGHT),
    );
  const resolveAlarmLayout = (widget: Widget): GridItem =>
    resolveWidgetMinimumLayout(widget, 1, 1);
  const resolveCameraLayout = (widget: Widget): GridItem =>
    resolveWidgetMinimumLayout(
      widget,
      1,
      toWidgetLayoutRows(widget, CAMERA_WIDGET_MIN_HEIGHT),
    );
  const resolveSensorLayout = (widget: Widget): GridItem =>
    resolveWidgetMinimumLayout(widget, 1, toWidgetLayoutRows(widget, 1));
  const resolveVacuumLayout = (widget: Widget): GridItem =>
    resolveWidgetMinimumLayout(widget, VACUUM_WIDGET_MIN_WIDTH, VACUUM_WIDGET_MIN_HEIGHT);
  const resolveCoverLayout = (widget: Widget): GridItem =>
    resolveWidgetMinimumLayout(widget, 1, 2);
  const resolveMembersLayout = (widget: Widget): GridItem =>
    resolveWidgetMinimumLayout(widget, MEMBERS_WIDGET_MIN_WIDTH, MEMBERS_WIDGET_MIN_HEIGHT);
  const resolveLockLayout = (widget: Widget): GridItem =>
    resolveWidgetMinimumLayout(widget, 1, toWidgetLayoutRows(widget, resolveLockMinimumHeightRows()));
  const resolveWidgetLayoutByKind = (widget: Widget, nextLayout: GridItem): GridItem => {
    const draftWidget: Widget = {
      ...widget,
      layout: nextLayout,
    };
    if (widget.kind === 'light') {
      return resolveLightLayoutForState(draftWidget, widget.isOn);
    }
    if (widget.kind === 'switch') {
      return resolveSwitchLayout(draftWidget);
    }
    if (widget.kind === 'climate') {
      return resolveClimateLayout(draftWidget);
    }
    if (widget.kind === 'media') {
      return resolveMediaLayout(draftWidget);
    }
    if (widget.kind === 'camera') {
      return resolveCameraLayout(draftWidget);
    }
    if (widget.kind === 'sensor') {
      return resolveSensorLayout(draftWidget);
    }
    if (widget.kind === 'alarm') {
      return resolveAlarmLayout(draftWidget);
    }
    if (widget.kind === 'vacuum') {
      return resolveVacuumLayout(draftWidget);
    }
    if (widget.kind === 'cover') {
      return resolveCoverLayout(draftWidget);
    }
    if (widget.kind === 'members') {
      return resolveMembersLayout(draftWidget);
    }
    if (widget.kind === 'lock') {
      return resolveLockLayout(draftWidget);
    }
    return normalizeWidgetLayout(draftWidget, nextLayout);
  };
  const sameLayout = (a: GridItem, b: GridItem) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
  const layoutExpandsFootprint = (previous: GridItem, next: GridItem) =>
    next.w > previous.w ||
    next.h > previous.h;
  const intersects = (a: Pick<GridItem, 'x' | 'y' | 'w' | 'h'>, b: Pick<GridItem, 'x' | 'y' | 'w' | 'h'>) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const findFirstFreePosition = (
    occupied: Array<Pick<GridItem, 'x' | 'y' | 'w' | 'h'>>,
    cols: number,
    width: number,
    height: number,
  ) => {
    const w = Math.min(Math.max(1, width), cols);
    const h = Math.max(1, height);
    const maxBottom = occupied.reduce((max, item) => Math.max(max, item.y + item.h), 0);
    const searchLimit = maxBottom + 40;

    for (let y = 0; y <= searchLimit; y += 1) {
      for (let x = 0; x <= cols - w; x += 1) {
        const candidate = { x, y, w, h };
        const hasCollision = occupied.some((item) => intersects(candidate, item));
        if (!hasCollision) {
          return { x, y };
        }
      }
    }

    return { x: 0, y: maxBottom };
  };
  const compactLayoutsUp = (layouts: GridItem[], cols: number): GridItem[] => {
    const placed: GridItem[] = [];
    const ordered = [...layouts].sort((first, second) => {
      const firstY = Math.max(0, Math.round(first.y));
      const secondY = Math.max(0, Math.round(second.y));
      if (firstY !== secondY) {
        return firstY - secondY;
      }
      const firstX = Math.max(0, Math.round(first.x));
      const secondX = Math.max(0, Math.round(second.x));
      if (firstX !== secondX) {
        return firstX - secondX;
      }
      return first.i.localeCompare(second.i, 'it-IT');
    });

    ordered.forEach((item) => {
      const safeW = Math.min(cols, Math.max(1, Math.round(item.w)));
      const safeX = Math.min(Math.max(0, Math.round(item.x)), Math.max(0, cols - safeW));
      let safeY = Math.max(0, Math.round(item.y));
      const safeH = Math.max(1, Math.round(item.h));

      while (safeY > 0) {
        const candidate = { x: safeX, y: safeY - 1, w: safeW, h: safeH };
        if (placed.some((layout) => intersects(candidate, layout))) {
          break;
        }
        safeY -= 1;
      }

      placed.push({
        i: item.i,
        x: safeX,
        y: safeY,
        w: safeW,
        h: safeH,
      });
    });

    return placed;
  };
  const pushLayoutsDownFromAnchor = (layouts: GridItem[], anchorId: string, cols: number): GridItem[] => {
    const safeCols = Math.max(1, Math.round(cols));
    const normalizeForCols = (item: GridItem): GridItem => {
      const safeW = Math.min(safeCols, Math.max(1, Math.round(item.w)));
      return {
        i: item.i,
        x: Math.min(Math.max(0, Math.round(item.x)), Math.max(0, safeCols - safeW)),
        y: Math.max(0, Math.round(item.y)),
        w: safeW,
        h: Math.max(1, Math.round(item.h)),
      };
    };
    const anchor = layouts.find((item) => item.i === anchorId);
    if (!anchor) {
      return layouts;
    }

    const anchorLayout = normalizeForCols(anchor);
    const placed: GridItem[] = [anchorLayout];
    const ordered = layouts
      .filter((item) => item.i !== anchorId)
      .map(normalizeForCols)
      .sort((first, second) => {
        if (first.y !== second.y) {
          return first.y - second.y;
        }
        if (first.x !== second.x) {
          return first.x - second.x;
        }
        return first.i.localeCompare(second.i, 'it-IT');
      });

    ordered.forEach((item) => {
      let candidate: GridItem = { ...item };
      let collision = placed.find((layout) => intersects(candidate, layout));
      while (collision) {
        candidate = {
          ...candidate,
          y: Math.max(candidate.y + 1, collision.y + collision.h),
        };
        collision = placed.find((layout) => intersects(candidate, layout));
      }
      placed.push(candidate);
    });

    const placedById = new Map(placed.map((layout) => [layout.i, layout]));
    return layouts.map((item) => placedById.get(item.i) ?? item);
  };
  const compactRootCanvasLayout = (
    nextSections: DashboardSection[],
    nextWidgets: Widget[],
  ): { sections: DashboardSection[]; widgets: Widget[] } => {
    const rootWidgets = nextWidgets.filter((widget) => !widget.parentSectionId);
    const rootLayouts = [
      ...nextSections.map((section) => normalizeSectionRootLayout(section, section.layout)),
      ...rootWidgets.map((widget) => resolveWidgetLayoutByKind(widget, normalizeRootLayout(widget.layout))),
    ];
    const compactedLayoutMap = new Map(
      compactLayoutsUp(rootLayouts, ROOT_CANVAS_COLS).map((layout) => [layout.i, layout]),
    );

    return {
      sections: nextSections.map((section) => {
        const layout = compactedLayoutMap.get(section.id);
        if (!layout) {
          return section;
        }
        const normalizedLayout = normalizeSectionRootLayout(section, layout);
        return sameLayout(section.layout, normalizedLayout)
          ? section
          : {
              ...section,
              layout: normalizedLayout,
            };
      }),
      widgets: nextWidgets.map((widget) => {
        if (widget.parentSectionId) {
          return widget;
        }
        const layout = compactedLayoutMap.get(widget.id);
        if (!layout) {
          return widget;
        }
        const normalizedLayout = resolveWidgetLayoutByKind(widget, normalizeRootLayout(layout));
        return sameLayout(widget.layout, normalizedLayout)
          ? widget
          : {
              ...widget,
              layout: normalizedLayout,
            };
      }),
    };
  };
  const compactStackSectionLayout = (section: DashboardSection, nextWidgets: Widget[]): Widget[] => {
    const stackWidgets = nextWidgets.filter((widget) => widget.parentSectionId === section.id);
    if (!stackWidgets.length) {
      return nextWidgets;
    }

    if (section.kind === 'stack-horizontal') {
      const ordered = [...stackWidgets].sort((first, second) => {
        const firstX = Math.max(0, Math.round(first.layout.x));
        const secondX = Math.max(0, Math.round(second.layout.x));
        if (firstX !== secondX) {
          return firstX - secondX;
        }
        return first.id.localeCompare(second.id, 'it-IT');
      });
      let cursorX = 0;
      const compactedById = new Map(
        ordered.map((widget) => {
          const normalizedLayout = resolveWidgetLayoutByKind(
            widget,
            normalizeLayoutForStack(section, {
              i: widget.id,
              x: cursorX,
              y: 0,
              w: Math.max(1, Math.round(widget.layout.w)),
              h: Math.max(1, Math.round(widget.layout.h)),
            }),
          );
          cursorX += normalizedLayout.w;
          return [widget.id, normalizedLayout] as const;
        }),
      );
      return nextWidgets.map((widget) => {
        const layout = compactedById.get(widget.id);
        return layout && !sameLayout(widget.layout, layout)
          ? {
              ...widget,
              layout,
            }
          : widget;
      });
    }

    const compactedLayoutMap = new Map(
      compactLayoutsUp(
        stackWidgets.map((widget) =>
          resolveWidgetLayoutByKind(widget, normalizeLayoutForStack(section, widget.layout)),
        ),
        resolveStackColumns(section),
      ).map((layout) => [layout.i, layout]),
    );

    return nextWidgets.map((widget) => {
      if (widget.parentSectionId !== section.id) {
        return widget;
      }
      const layout = compactedLayoutMap.get(widget.id);
      if (!layout) {
        return widget;
      }
      const normalizedLayout = resolveWidgetLayoutByKind(widget, normalizeLayoutForStack(section, layout));
      return sameLayout(widget.layout, normalizedLayout)
        ? widget
        : {
            ...widget,
          layout: normalizedLayout,
        };
    });
  };
  const pushRootCanvasLayoutDown = (
    nextSections: DashboardSection[],
    nextWidgets: Widget[],
    anchorWidgetId: string,
  ): { sections: DashboardSection[]; widgets: Widget[] } => {
    const rootWidgets = nextWidgets.filter((widget) => !widget.parentSectionId);
    const rootLayouts = [
      ...nextSections.map((section) => normalizeSectionRootLayout(section, section.layout)),
      ...rootWidgets.map((widget) => resolveWidgetLayoutByKind(widget, normalizeRootLayout(widget.layout))),
    ];
    const pushedLayoutMap = new Map(
      pushLayoutsDownFromAnchor(rootLayouts, anchorWidgetId, ROOT_CANVAS_COLS).map((layout) => [layout.i, layout]),
    );

    return {
      sections: nextSections.map((section) => {
        const layout = pushedLayoutMap.get(section.id);
        if (!layout) {
          return section;
        }
        const normalizedLayout = normalizeSectionRootLayout(section, layout);
        return sameLayout(section.layout, normalizedLayout)
          ? section
          : {
              ...section,
              layout: normalizedLayout,
            };
      }),
      widgets: nextWidgets.map((widget) => {
        if (widget.parentSectionId) {
          return widget;
        }
        const layout = pushedLayoutMap.get(widget.id);
        if (!layout) {
          return widget;
        }
        const normalizedLayout = resolveWidgetLayoutByKind(widget, normalizeRootLayout(layout));
        return sameLayout(widget.layout, normalizedLayout)
          ? widget
          : {
              ...widget,
              layout: normalizedLayout,
            };
      }),
    };
  };
  const pushStackSectionLayoutDown = (
    section: DashboardSection,
    nextWidgets: Widget[],
    anchorWidgetId: string,
    restrictToAnchorColumns = false,
  ): Widget[] => {
    const stackWidgets = nextWidgets.filter((widget) => widget.parentSectionId === section.id);
    if (!stackWidgets.length) {
      return nextWidgets;
    }

    const normalizedLayouts = stackWidgets.map((widget) =>
      resolveWidgetLayoutByKind(widget, normalizeLayoutForStack(section, widget.layout)),
    );
    const stackCols = resolveStackColumns(section);
    const anchorLayout = normalizedLayouts.find((layout) => layout.i === anchorWidgetId);
    if (!anchorLayout) {
      return nextWidgets;
    }

    const layoutsForPush =
      restrictToAnchorColumns && section.kind !== 'stack-horizontal'
        ? normalizedLayouts.filter((layout) => {
            const layoutLeft = layout.x;
            const layoutRight = layout.x + layout.w;
            const anchorLeft = anchorLayout.x;
            const anchorRight = anchorLayout.x + anchorLayout.w;
            return layoutLeft < anchorRight && layoutRight > anchorLeft;
          })
        : normalizedLayouts;

    const pushedLayoutMap = new Map(
      pushLayoutsDownFromAnchor(
        layoutsForPush,
        anchorWidgetId,
        stackCols,
      ).map((layout) => [layout.i, layout]),
    );

    return nextWidgets.map((widget) => {
      if (widget.parentSectionId !== section.id) {
        return widget;
      }
      const layout = pushedLayoutMap.get(widget.id);
      if (!layout) {
        return widget;
      }
      const normalizedLayout = resolveWidgetLayoutByKind(widget, normalizeLayoutForStack(section, layout));
      return sameLayout(widget.layout, normalizedLayout)
        ? widget
        : {
            ...widget,
            layout: normalizedLayout,
          };
    });
  };
  useEffect(() => {
    if (!favoriteGridSections.length) {
      return;
    }

    const favoriteSectionById = new Map(favoriteGridSections.map((section) => [section.id, section]));
    const favoriteSectionIds = new Set(favoriteSectionById.keys());
    const fallbackSection = favoriteGridSections[0];
    const autoCreateFromHaLabels =
      isHaConnected && haFavoriteLabelDetected && haFavoriteEntityIdLookup.size > 0;

    setWidgets((prev) => {
      let changed = false;
      const occupiedBySection = new Map<string, Array<Pick<GridItem, 'x' | 'y' | 'w' | 'h'>>>();

      const next = prev.map((widget) => {
        const currentParentId = widget.parentSectionId;
        const targetSectionId = resolveFavoriteGridTargetSectionId({
          widget,
          favoriteSectionIds,
          fallbackSectionId: fallbackSection.id,
          isMarkedFavorite: isWidgetMarkedFavorite(widget),
        });

        if (!targetSectionId) {
          return widget;
        }

        const targetSection = favoriteSectionById.get(targetSectionId);
        if (!targetSection) {
          return widget;
        }

        const sectionOccupied = occupiedBySection.get(targetSectionId) ?? [];
        const normalizedSeed = normalizeLayoutForStack(targetSection, {
          i: widget.id,
          x: widget.layout.x,
          y: widget.layout.y,
          w: Math.max(1, Math.round(widget.layout.w)),
          h: Math.max(1, Math.round(widget.layout.h)),
        });
        const hasCollision = sectionOccupied.some((item) =>
          intersects(
            {
              x: normalizedSeed.x,
              y: normalizedSeed.y,
              w: normalizedSeed.w,
              h: normalizedSeed.h,
            },
            item,
          ),
        );

        let resolvedLayout = normalizedSeed;
        if (currentParentId !== targetSectionId || hasCollision) {
          const stackCols = resolveStackColumns(targetSection);
          const nextPosition = findFirstFreePosition(
            sectionOccupied,
            stackCols,
            normalizedSeed.w,
            normalizedSeed.h,
          );
          resolvedLayout = normalizeLayoutForStack(targetSection, {
            ...normalizedSeed,
            x: nextPosition.x,
            y: nextPosition.y,
          });
        }

        sectionOccupied.push({
          x: resolvedLayout.x,
          y: resolvedLayout.y,
          w: resolvedLayout.w,
          h: resolvedLayout.h,
        });
        occupiedBySection.set(targetSectionId, sectionOccupied);

        const parentChanged = currentParentId !== targetSectionId;
        const layoutChanged = !sameLayout(widget.layout, resolvedLayout);
        if (!parentChanged && !layoutChanged) {
          return widget;
        }

        changed = true;
        return {
          ...widget,
          parentSectionId: targetSectionId,
          layout: resolvedLayout,
        };
      });

      const nextAfterMoves = changed ? next : prev;
      if (!autoCreateFromHaLabels) {
        return nextAfterMoves;
      }

      const targetSection = favoriteSectionById.get(fallbackSection.id) ?? fallbackSection;
      const stackCols = resolveStackColumns(targetSection);
      const sectionOccupied =
        occupiedBySection.get(targetSection.id) ??
        nextAfterMoves
          .filter((widget) => widget.parentSectionId === targetSection.id)
          .map((widget) => ({
            x: widget.layout.x,
            y: widget.layout.y,
            w: widget.layout.w,
            h: widget.layout.h,
          }));
      occupiedBySection.set(targetSection.id, sectionOccupied);

      const sortedFavoriteEntityIds = Array.from(haFavoriteEntityIdLookup).sort((first, second) =>
        first.localeCompare(second, 'it-IT'),
      );
      const additions: Widget[] = [];

      sortedFavoriteEntityIds.forEach((entityId) => {
        // Preferiti is a projection, not a move operation. A manually placed
        // card may remain on the root canvas while an automatically managed
        // card for the same HA entity is shown in the favorites grid.
        if (hasFavoriteGridProjection([...nextAfterMoves, ...additions], entityId, favoriteSectionIds)) {
          return;
        }
        const kind = resolveWidgetKindFromEntityId(entityId);
        if (!kind) {
          return;
        }

        const liveEntity = haStatesForUi[entityId];
        const friendlyName =
          typeof liveEntity?.rawAttributes?.friendly_name === 'string'
            ? liveEntity.rawAttributes.friendly_name.trim()
            : '';
        const title = friendlyName || fallbackTitleFromEntityId(entityId) || entityId;
        const widgetWidth =
          kind === 'climate'
            ? CLIMATE_WIDGET_WIDTH
            : kind === 'sensor' || kind === 'lock'
              ? 1
              : kind === 'media'
                ? MEDIA_WIDGET_MIN_WIDTH
                : kind === 'vacuum'
                  ? VACUUM_WIDGET_DEFAULT_WIDTH
                  : kind === 'cover'
                    ? COVER_WIDGET_MIN_WIDTH
                    : 2;
        const widgetBaseHeight =
          kind === 'climate'
            ? CLIMATE_WIDGET_HEIGHT
            : kind === 'light'
              ? LIGHT_WIDGET_HEIGHT_OFF
            : kind === 'sensor'
              ? 1
              : kind === 'lock'
                ? resolveLockMinimumHeightRows()
                : kind === 'camera'
                  ? CAMERA_WIDGET_MIN_HEIGHT
                  : kind === 'vacuum'
                    ? VACUUM_WIDGET_DEFAULT_HEIGHT
                  : kind === 'cover'
                    ? COVER_WIDGET_MIN_HEIGHT
              : kind === 'media'
                ? MEDIA_WIDGET_MIN_HEIGHT
                : 1;
        const normalizedSeed = normalizeLayoutForStack(targetSection, {
          i: entityId,
          x: 0,
          y: 0,
          w: widgetWidth,
          h: widgetBaseHeight,
        });
        const nextPosition = findFirstFreePosition(
          sectionOccupied,
          stackCols,
          normalizedSeed.w,
          normalizedSeed.h,
        );
        const normalizedLayout = normalizeLayoutForStack(targetSection, {
          ...normalizedSeed,
          x: nextPosition.x,
          y: nextPosition.y,
        });
        const id = `${kind}.custom_${nextWidgetIdRef.current++}`;

        const newWidget: Widget = {
          id,
          kind,
          title,
          entityId,
          dataSource: 'ha',
          isFavorite: true,
          placementPolicy: 'favorites-auto',
          status:
            kind === 'media'
              ? 'paused'
              : kind === 'switch'
                ? 'off'
              : kind === 'alarm'
                ? 'disarmed'
                : kind === 'vacuum'
                  ? 'docked'
                  : kind === 'lock'
                    ? 'locked'
                    : kind === 'cover'
                      ? 'open'
                      : 'Idle',
          isOn: kind === 'lock' || kind === 'cover',
          value:
            kind === 'sensor' ? 40 : kind === 'climate' ? 23 : kind === 'vacuum' ? 100 : kind === 'cover' ? 70 : 0,
          unit:
            kind === 'sensor' || kind === 'media' || kind === 'vacuum' || kind === 'cover'
              ? '%'
              : kind === 'climate'
                ? 'C'
                : kind === 'alarm' || kind === 'lock' || kind === 'switch'
                  ? ''
                  : '%',
          parentSectionId: targetSection.id,
          layout: {
            ...normalizedLayout,
            i: id,
          },
        };

        additions.push(newWidget);
        sectionOccupied.push({
          x: normalizedLayout.x,
          y: normalizedLayout.y,
          w: normalizedLayout.w,
          h: normalizedLayout.h,
        });
      });

      if (additions.length === 0) {
        return nextAfterMoves;
      }
      return [...nextAfterMoves, ...additions];
    });
  }, [favoriteGridSections, haFavoriteEntityIdLookup, haFavoriteLabelDetected, haStatesForUi, isHaConnected]);
  const weatherSection = weatherConfigSection;
  const haEntityIds = useMemo(() => Object.keys(haStates), [haStates]);
  const knownHaEntityIds = useMemo(
    () => [...new Set([...haEntityIds, ...haEntityRegistry.map((entry) => entry.entityId)])],
    [haEntityIds, haEntityRegistry],
  );
  const consumptionData = useMemo(
    () => createConsumptionDashboardData(consumptionConfig, haStates),
    [consumptionConfig, haStates],
  );
  const activeWidget = selectedWidget;
  const activeWidgetSecrets = useWidgetSecrets(activeWidget?.id);
  const mainGuidedSetupContent = useMemo(() => createMainGuidedSetupContent(t), [t]);
  const shouldShowWelcomeGuide = !completedMainGuides.welcome;
  const shouldShowContextGuide =
    !completedMainGuides.context &&
    !isEditMode &&
    !isConsumptionView &&
    !isAutomationView &&
    !isAppGalleryView &&
    Boolean(activeDevice);
  const activeMainGuideKind: MainGuidedSetupKind | null = shouldShowWelcomeGuide
    ? 'welcome'
    : shouldShowContextGuide
      ? 'context'
      : null;
  const activeMainGuide = activeMainGuideKind ? mainGuidedSetupContent[activeMainGuideKind] : null;
  const activeMainGuideSteps = activeMainGuideKind === 'welcome' && !canToggleEditMode
    ? activeMainGuide?.steps.filter((step) => !step.target) ?? []
    : activeMainGuide?.steps ?? [];
  const isGuidedEditTargetActive =
    activeMainGuideKind === 'welcome' &&
    activeMainGuideStepId === 'edit-mode' &&
    !isEditMode &&
    editConfirm === null;

  useEffect(() => {
    if (isGuidedEditTargetActive && isCompactViewport) {
      setIsMobileSidebarOpen(true);
    }
  }, [isCompactViewport, isGuidedEditTargetActive]);

  const dismissActiveMainGuide = () => {
    if (!activeMainGuideKind) {
      return;
    }
    markOnboardingCompleted(MAIN_GUIDED_SETUP_STORAGE_KEYS[activeMainGuideKind]);
    setCompletedMainGuides((current) => ({
      ...current,
      [activeMainGuideKind]: true,
    }));
    setActiveMainGuideStepId(null);
    setIsMobileSidebarOpen(false);
  };

  useEffect(() => {
    const previousStatus = previousHaStatusRef.current;
    const reconnectToastId = reconnectToastIdRef.current;

    if (haStatus === 'connecting' || haStatus === 'reconnecting') {
      const isReconnecting =
        haStatus === 'reconnecting' ||
        previousStatus === 'connected' ||
        previousStatus === 'error' ||
        (previousStatus === 'disconnected' && hadSuccessfulConnectionRef.current);

      if (isReconnecting) {
        reconnectInFlightRef.current = true;
        if (reconnectToastId) {
          removeNotification(reconnectToastId);
        }
        reconnectToastIdRef.current = addNotification('warning', 'Riconnessione Home Assistant in corso...');
      }
    }

    if (haStatus === 'connected') {
      hadSuccessfulConnectionRef.current = true;
      if (reconnectToastId) {
        removeNotification(reconnectToastId);
        reconnectToastIdRef.current = null;
      }
      if (reconnectInFlightRef.current) {
        addNotification('info', 'Home Assistant riconnesso con successo.');
        reconnectInFlightRef.current = false;
      }
    }

    if (haStatus === 'error' || haStatus === 'offline' || haStatus === 'reauth_required') {
      if (reconnectToastId) {
        removeNotification(reconnectToastId);
        reconnectToastIdRef.current = null;
      }
      if (reconnectInFlightRef.current || haStatus === 'reauth_required') {
        addNotification(
          'alert',
          haStatus === 'reauth_required'
            ? 'Sessione Home Assistant scaduta. Accedi nuovamente.'
            : 'Riconnessione Home Assistant non riuscita.',
        );
        reconnectInFlightRef.current = false;
      }
    }

    if (haStatus === 'disconnected' && reconnectToastId) {
      removeNotification(reconnectToastId);
      reconnectToastIdRef.current = null;
    }

    previousHaStatusRef.current = haStatus;
  }, [addNotification, haStatus, removeNotification]);

  const contextLamp = useMemo(() => {
    if (activeWidget?.kind !== 'light') {
      return state.lamp;
    }
    const liveEntity = haStatesForUi[activeWidget.entityId];
    const useDemoFallback = effectiveRuntimeMode === 'demo' && activeWidget.dataSource === 'mock';
    const capabilities = resolveLightCapabilities(liveEntity);
    return {
      name: activeWidget.title,
      isOn: typeof liveEntity?.toggleOn === 'boolean' ? liveEntity.toggleOn : activeWidget.isOn,
      brightness:
        typeof liveEntity?.brightness === 'number'
          ? liveEntity.brightness
          : activeWidget.value ?? (useDemoFallback ? state.lamp.brightness : 0),
      status: liveEntity?.stateLabel ?? liveEntity?.state ?? activeWidget.status,
      hsColor: liveEntity?.hsColor ?? liveEntity?.hs_color ?? (useDemoFallback ? state.lamp.hsColor : undefined),
      colorTemp:
        typeof liveEntity?.colorTempKelvin === 'number'
          ? liveEntity.colorTempKelvin
          : liveEntity?.color_temp_kelvin ?? (useDemoFallback ? state.lamp.colorTemp : undefined),
      supportsBrightness: capabilities.supportsBrightness,
      supportsColorTemp: capabilities.supportsColorTemp,
      supportsColor: capabilities.supportsColor,
      supportsWhite: capabilities.supportsWhite,
      supportsEffects: capabilities.supportsEffects,
      supportsFlash: capabilities.supportsFlash,
      supportsTransition: capabilities.supportsTransition,
      preferredColorMode: capabilities.preferredColorMode,
      minColorTempKelvin: capabilities.minColorTempKelvin,
      maxColorTempKelvin: capabilities.maxColorTempKelvin,
      effect: capabilities.activeEffect,
      effectList: capabilities.effectList,
    };
  }, [activeWidget, effectiveRuntimeMode, haStatesForUi, state.lamp]);

  const contextClimate = useMemo(() => {
    if (activeWidget?.kind !== 'climate') {
      return state.climate;
    }
    const liveEntity = haStatesForUi[activeWidget.entityId];
    if (!liveEntity) {
      if (effectiveRuntimeMode !== 'demo' || activeWidget.dataSource !== 'mock') {
        return {
          ...state.climate,
          name: activeWidget.title || 'Clima',
          mode: 'off',
          isOn: false,
          status: 'Non disponibile',
          currentTemp: Number.NaN,
          targetTemp: Number.NaN,
          minTemp: Number.NaN,
          maxTemp: Number.NaN,
          targetTempLow: undefined,
          targetTempHigh: undefined,
          hvacModes: [],
          fanMode: undefined,
          fanModes: [],
          supportedFeatures: 0,
          currentHumidity: undefined,
          targetHumidity: undefined,
          presetMode: undefined,
          presetModes: [],
          swingMode: undefined,
          swingModes: [],
          swingHorizontalMode: undefined,
          swingHorizontalModes: [],
          supportsTargetTemperature: false,
          supportsTargetTemperatureRange: false,
          supportsTargetHumidity: false,
          supportsFanMode: false,
          supportsPresetMode: false,
          supportsSwingMode: false,
          supportsSwingHorizontalMode: false,
          supportsTurnOn: false,
          supportsTurnOff: false,
          temperatureUnit: '',
          rawAttributes: {},
        };
      }
      return {
        ...state.climate,
        name: activeWidget.title || state.climate.name,
        rawAttributes: {
          ...(state.climate.rawAttributes ?? {}),
          friendly_name: activeWidget.title || state.climate.name,
        },
      };
    }
    const rawAttributes = liveEntity?.rawAttributes;
    const capabilities = resolveClimateCapabilities(liveEntity);
    const hvacMode =
      toTrimmedString(liveEntity?.hvacMode) ??
      toTrimmedString(rawAttributes?.hvac_mode) ??
      toTrimmedString(liveEntity?.state) ??
      '';
    const hvacAction =
      toTrimmedString(liveEntity?.hvacAction) ??
      toTrimmedString(rawAttributes?.hvac_action) ??
      '';
    const hvacModes =
      Array.isArray(liveEntity?.hvacModes) && liveEntity.hvacModes.length > 0
        ? liveEntity.hvacModes
        : Array.isArray(rawAttributes?.hvac_modes)
          ? rawAttributes.hvac_modes.filter(
              (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
            )
          : [];
    const fanMode =
      toTrimmedString(liveEntity?.fanMode) ??
      toTrimmedString(rawAttributes?.fan_mode) ??
      '';
    const fanModes =
      Array.isArray(liveEntity?.fanModes) && liveEntity.fanModes.length > 0
        ? liveEntity.fanModes
        : Array.isArray(rawAttributes?.fan_modes)
          ? rawAttributes.fan_modes.filter(
              (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
            )
          : [];
    const presetModes =
      Array.isArray(liveEntity?.presetModes) && liveEntity.presetModes.length > 0
        ? liveEntity.presetModes
        : capabilities.presetModes;
    const swingModes =
      Array.isArray(liveEntity?.swingModes) && liveEntity.swingModes.length > 0
        ? liveEntity.swingModes
        : capabilities.swingModes;
    const swingHorizontalModes =
      Array.isArray(liveEntity?.swingHorizontalModes) && liveEntity.swingHorizontalModes.length > 0
        ? liveEntity.swingHorizontalModes
        : capabilities.swingHorizontalModes;
    const minTemp =
      toFiniteNumber(liveEntity?.minTemp) ??
      toFiniteNumber(rawAttributes?.min_temp) ??
      Number.NaN;
    const maxTemp =
      toFiniteNumber(liveEntity?.maxTemp) ??
      toFiniteNumber(rawAttributes?.max_temp) ??
      Number.NaN;
    const targetTempStep =
      toFiniteNumber(liveEntity?.targetTempStep) ??
      toFiniteNumber(rawAttributes?.target_temp_step);
    const targetTempLow =
      toFiniteNumber(liveEntity?.targetTempLow) ??
      toFiniteNumber(rawAttributes?.target_temp_low);
    const targetTempHigh =
      toFiniteNumber(liveEntity?.targetTempHigh) ??
      toFiniteNumber(rawAttributes?.target_temp_high);
    const currentTempFromAttributes =
      toFiniteNumber(rawAttributes?.current_temperature) ?? toFiniteNumber(rawAttributes?.temperature);
    const currentTemp =
      typeof liveEntity?.currentValue === 'number'
        ? liveEntity.currentValue
        : currentTempFromAttributes ?? Number.NaN;
    const targetTemp =
      typeof liveEntity?.targetValue === 'number'
        ? liveEntity.targetValue
        : toFiniteNumber(rawAttributes?.temperature) ?? Number.NaN;
    const isOn =
      hvacMode !== undefined
        ? hvacMode.toLowerCase() !== 'off'
        : typeof liveEntity?.state === 'string'
          ? liveEntity.state !== 'off'
          : false;
    return {
      name:
        activeWidget.title ||
        toTrimmedString(rawAttributes?.friendly_name) ||
        state.climate.name,
      mode: hvacMode,
      isOn,
      status: hvacAction || liveEntity?.stateLabel || liveEntity?.state || '',
      currentTemp,
      targetTemp,
      minTemp,
      maxTemp,
      targetTempLow,
      targetTempHigh,
      targetTempStep,
      hvacModes,
      hvacAction,
      fanMode,
      fanModes,
      supportedFeatures: capabilities.supportedFeatures,
      precision: capabilities.precision,
      currentHumidity: capabilities.currentHumidity,
      targetHumidity: capabilities.targetHumidity,
      minHumidity: capabilities.minHumidity,
      maxHumidity: capabilities.maxHumidity,
      targetHumidityStep: capabilities.targetHumidityStep,
      presetMode: capabilities.presetMode,
      presetModes,
      swingMode: capabilities.swingMode,
      swingModes,
      swingHorizontalMode: capabilities.swingHorizontalMode,
      swingHorizontalModes,
      supportsTargetTemperature: capabilities.supportsTargetTemperature,
      supportsTargetTemperatureRange: capabilities.supportsTargetTemperatureRange,
      supportsTargetHumidity: capabilities.supportsTargetHumidity,
      supportsFanMode: capabilities.supportsFanMode,
      supportsPresetMode: capabilities.supportsPresetMode,
      supportsSwingMode: capabilities.supportsSwingMode,
      supportsSwingHorizontalMode: capabilities.supportsSwingHorizontalMode,
      supportsTurnOn: capabilities.supportsTurnOn,
      supportsTurnOff: capabilities.supportsTurnOff,
      temperatureUnit:
        toTrimmedString(liveEntity?.unit) ??
        toTrimmedString(rawAttributes?.temperature_unit) ??
        '',
      rawAttributes,
    };
  }, [activeWidget, effectiveRuntimeMode, haStatesForUi, state.climate]);

  const cameraPtzServiceTarget = useMemo(
    () => resolveCameraPtzServiceTarget(haServiceRegistry),
    [haServiceRegistry],
  );

  const cameraPtzEntityIds = useMemo(
    () => knownHaEntityIds.filter((entityId) => entityId.startsWith('camera.')).filter((entityId) => {
      const liveEntity = haStatesForUi[entityId];
      const rawAttributes = liveEntity?.rawAttributes;
      const cameraFriendlyName = toTrimmedString(rawAttributes?.friendly_name) ?? entityId;
      const ptzButtons = resolveCameraPtzButtons(entityId, cameraFriendlyName, haStatesForUi);
      return hasAnyCameraPtzButton(ptzButtons) || resolveCameraSupportsPtz(entityId, rawAttributes, haServiceRegistry);
    }),
    [haServiceRegistry, haStatesForUi, knownHaEntityIds],
  );

  const cameraPtzButtons = useMemo<CameraPtzButtonMap>(() => {
    if (!isHaConnected || activeWidget?.kind !== 'camera') {
      return {};
    }
    const liveEntity = haStatesForUi[activeWidget.entityId];
    const rawAttributes = liveEntity?.rawAttributes;
    const cameraEntityId =
      toTrimmedString(rawAttributes?.camera_entity_id) ??
      toTrimmedString(rawAttributes?.entity_id) ??
      activeWidget.entityId;
    const cameraFriendlyName =
      toTrimmedString(rawAttributes?.friendly_name) ??
      activeWidget.title;
    return resolveCameraPtzButtons(cameraEntityId, cameraFriendlyName, haStatesForUi);
  }, [activeWidget, haStatesForUi, isHaConnected]);

  const cameraHasPtzButtons = useMemo(
    () => hasAnyCameraPtzButton(cameraPtzButtons),
    [cameraPtzButtons],
  );

  const contextCamera = useMemo(() => {
    if (activeWidget?.kind !== 'camera') {
      return {
        name: 'Camera',
        status: 'Offline',
        entityId: undefined as string | undefined,
        streamUrl: undefined as string | undefined,
        snapshotUrl: undefined as string | undefined,
        isOffline: true,
        supportsPtz: false,
        deviceInfo: undefined as CameraDeviceInfo | undefined,
        relatedEntities: [] as CameraRelatedEntityInfo[],
        rawAttributes: undefined as Record<string, unknown> | undefined,
        historyEntries: [] as CameraHistoryEntry[],
        historyStatus: 'idle' as CameraHistoryStatus,
        historyError: undefined as string | undefined,
        onRefreshHistory: refreshCameraHistory,
      };
    }

    const liveEntity = haStatesForUi[activeWidget.entityId];
    const rawAttributes = liveEntity?.rawAttributes;
    const stateValue = normalizeCameraState(
      toTrimmedString(liveEntity?.stateLabel) ??
        toTrimmedString(liveEntity?.state) ??
        activeWidget.status,
    );
    const isOffline = isCameraOfflineState(stateValue);
    const preview = resolveCameraPreviewUrls(liveEntity, activeWidget.entityId, haUrl);
    const cameraName =
      activeWidget.title ||
      toTrimmedString(rawAttributes?.friendly_name) ||
      'Camera';
    const cameraEntityId = preview.cameraEntityId ?? activeWidget.entityId;
    const deviceContext = buildCameraDeviceContext({
      cameraEntityId,
      haStates: haStatesForUi,
      entityRegistry: haEntityRegistry,
      deviceRegistry: haDeviceRegistry,
    });
    const derivedActivity = resolveCameraDerivedActivity(
      cameraEntityId,
      cameraName,
      haStatesForUi,
      haUrl,
      new Set(deviceContext.relatedEntities.map((entity) => entity.entityId.toLowerCase())),
    );
    const mergedRawAttributes: Record<string, unknown> = {
      ...(rawAttributes ?? {}),
    };

    if (derivedActivity.eventLog.length > 0) {
      const existingEventLog = Array.isArray(mergedRawAttributes.event_log)
        ? (mergedRawAttributes.event_log as unknown[])
        : [];
      mergedRawAttributes.event_log = [...derivedActivity.eventLog, ...existingEventLog].slice(0, 20);
    }
    if (derivedActivity.motionDetected !== undefined && mergedRawAttributes.motion_detected === undefined) {
      mergedRawAttributes.motion_detected = derivedActivity.motionDetected;
    }
    if (derivedActivity.soundDetected !== undefined && mergedRawAttributes.sound_detected === undefined) {
      mergedRawAttributes.sound_detected = derivedActivity.soundDetected;
    }
    if (derivedActivity.lastMotionDetected && mergedRawAttributes.last_motion_detected === undefined) {
      mergedRawAttributes.last_motion_detected = derivedActivity.lastMotionDetected;
    }
    if (derivedActivity.lastSoundDetected && mergedRawAttributes.last_sound_detected === undefined) {
      mergedRawAttributes.last_sound_detected = derivedActivity.lastSoundDetected;
    }
    if (derivedActivity.lastImageUrl && mergedRawAttributes.last_image_url === undefined) {
      mergedRawAttributes.last_image_url = derivedActivity.lastImageUrl;
    }

    const snapshotUrl = preview.snapshotUrl ?? derivedActivity.lastImageUrl;
    const hasMergedAttributes = Object.keys(mergedRawAttributes).length > 0;
    const hasMatchingHistory = cameraHistory.cameraEntityId === cameraEntityId;

    return {
      name: cameraName,
      status: isOffline ? 'Offline' : 'Live',
      entityId: cameraEntityId,
      streamUrl: preview.streamUrl,
      snapshotUrl,
      isOffline,
      supportsPtz:
        cameraHasPtzButtons ||
        resolveCameraSupportsPtz(cameraEntityId, rawAttributes, haServiceRegistry),
      deviceInfo: deviceContext.deviceInfo,
      relatedEntities: deviceContext.relatedEntities,
      rawAttributes: hasMergedAttributes ? mergedRawAttributes : undefined,
      historyEntries: hasMatchingHistory ? cameraHistory.entries : [],
      historyStatus: hasMatchingHistory ? cameraHistory.status : ('idle' as CameraHistoryStatus),
      historyError: hasMatchingHistory ? cameraHistory.error : undefined,
      onRefreshHistory: refreshCameraHistory,
    };
  }, [
    activeWidget,
    cameraHistory,
    cameraHasPtzButtons,
    haDeviceRegistry,
    haEntityRegistry,
    haServiceRegistry,
    haStatesForUi,
    haUrl,
    isHaConnected,
    refreshCameraHistory,
  ]);

  const cameraHistoryEntityIds = useMemo(
    () =>
      (contextCamera.relatedEntities ?? [])
        .filter(
          (entity) =>
            entity.category === 'detection' ||
            entity.domain === 'event' ||
            entity.domain === 'image',
        )
        .map((entity) => entity.entityId.trim())
        .filter(Boolean),
    [contextCamera.relatedEntities],
  );
  const cameraHistoryEntityKey = cameraHistoryEntityIds.join('|');
  const isActiveCameraMock =
    effectiveRuntimeMode === 'demo' &&
    activeWidget?.dataSource === 'mock' &&
    contextCamera.entityId === CAMERA_MAX_COMPAT_MOCK_ENTITY_ID &&
    !haStates[CAMERA_MAX_COMPAT_MOCK_ENTITY_ID];

  useEffect(() => {
    const cameraEntityId = contextCamera.entityId?.trim();
    if (activeDevice?.type !== 'camera' || !cameraEntityId) {
      return;
    }
    if (isActiveCameraMock) {
      setCameraHistory({ cameraEntityId, status: 'available', entries: [] });
      return;
    }
    if (!isHaConnected || contextCamera.isOffline) {
      setCameraHistory({ cameraEntityId, status: 'offline', entries: [] });
      return;
    }
    if (cameraHistoryEntityIds.length === 0) {
      setCameraHistory({ cameraEntityId, status: 'empty', entries: [] });
      return;
    }

    const requestId = cameraHistoryRequestRef.current + 1;
    cameraHistoryRequestRef.current = requestId;
    setCameraHistory((current) => ({
      cameraEntityId,
      status: 'loading',
      entries: current.cameraEntityId === cameraEntityId ? current.entries : [],
    }));

    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);
    const loadHistory = async () => {
      let payload = await callHaApi<unknown>(
        {
          type: 'history/history_during_period',
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          entity_ids: cameraHistoryEntityIds,
          include_start_time_state: false,
          significant_changes_only: false,
          minimal_response: false,
          no_attributes: false,
        },
        { reportError: false },
      );

      if (payload === null) {
        const normalizedUrl = normalizeHassUrl(haUrl);
        const token = haToken.trim();
        if (normalizedUrl && token) {
          try {
            const endpoint = new URL(`${normalizedUrl}/api/history/period/${encodeURIComponent(startTime.toISOString())}`);
            endpoint.searchParams.set('filter_entity_id', cameraHistoryEntityIds.join(','));
            endpoint.searchParams.set('end_time', endTime.toISOString());
            endpoint.searchParams.set('minimal_response', '0');
            endpoint.searchParams.set('no_attributes', '0');
            endpoint.searchParams.set('significant_changes_only', '0');
            const response = await fetch(endpoint.toString(), {
              headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${token}`,
              },
            });
            if (response.ok) {
              payload = (await response.json()) as unknown;
            }
          } catch {
            payload = null;
          }
        }
      }

      if (cameraHistoryRequestRef.current !== requestId) {
        return;
      }
      if (payload === null) {
        setCameraHistory({
          cameraEntityId,
          status: 'error',
          entries: [],
          error: 'Cronologia Home Assistant non disponibile.',
        });
        return;
      }
      const entries = extractCameraHistoryEntries(payload, cameraHistoryEntityIds);
      setCameraHistory({
        cameraEntityId,
        status: entries.length > 0 ? 'available' : 'empty',
        entries,
      });
    };
    void loadHistory();
  }, [
    activeDevice?.type,
    callHaApi,
    cameraHistoryEntityKey,
    cameraHistoryRefreshNonce,
    contextCamera.entityId,
    contextCamera.isOffline,
    haToken,
    haUrl,
    isHaConnected,
    isActiveCameraMock,
  ]);

  const contextSpeaker = useMemo(() => {
    if (activeWidget?.kind !== 'media') {
      return state.speaker;
    }
    const useDemoFallback = effectiveRuntimeMode === 'demo' && activeWidget.dataSource === 'mock';
    const fallbackSpeaker = useDemoFallback
      ? state.speaker
      : {
          ...state.speaker,
          progress: 0,
          positionSeconds: 0,
          durationSeconds: 0,
          volumeLevel: 0,
          muted: false,
          shuffleEnabled: false,
          repeatMode: 'off' as const,
          trackTitle: undefined,
          trackArtist: undefined,
          coverUrl: undefined,
          selectedOutputDeviceId: undefined,
          outputDevices: [],
          multiroomDevices: [],
          rawAttributes: {},
        };
    const liveEntity = haStatesForUi[activeWidget.entityId];
    const rawAttributes = liveEntity?.rawAttributes ?? fallbackSpeaker.rawAttributes;
    const rawMediaStateValue = liveEntity?.state ?? liveEntity?.stateLabel ?? activeWidget.status;
    const mediaState = resolveMediaState(rawMediaStateValue);
    const mediaStateLabel = translateMediaPlayerState(rawMediaStateValue, activeWidget.status ?? fallbackSpeaker.status);
    const capabilities = resolveMediaCapabilities(liveEntity);
    const resolvedDuration =
      typeof liveEntity?.mediaDuration === 'number'
        ? Math.max(0, Math.round(liveEntity.mediaDuration))
        : fallbackSpeaker.durationSeconds ?? 0;
    const mediaPositionUpdatedAt =
      typeof liveEntity?.mediaPositionUpdatedAt === 'number' && Number.isFinite(liveEntity.mediaPositionUpdatedAt)
        ? liveEntity.mediaPositionUpdatedAt
        : undefined;
    const resolvedPositionFromEntity =
      typeof liveEntity?.mediaPosition === 'number'
        ? resolveLiveMediaPosition(
            Math.round(liveEntity.mediaPosition),
            resolvedDuration,
            liveEntity?.stateLabel ?? liveEntity?.state ?? activeWidget.status,
            mediaPositionUpdatedAt,
            Date.now(),
          )
        : undefined;
    const fallbackProgress =
      typeof activeWidget.value === 'number' ? activeWidget.value : fallbackSpeaker.progress;
    const resolvedProgress =
      resolvedPositionFromEntity !== undefined
        ? Math.max(0, Math.min(100, Math.round((resolvedPositionFromEntity / resolvedDuration) * 100)))
        : typeof liveEntity?.progress === 'number'
          ? Math.max(0, Math.min(100, Math.round(liveEntity.progress)))
          : Math.max(0, Math.min(100, Math.round(fallbackProgress)));
    const resolvedPosition =
      resolvedPositionFromEntity ?? Math.max(0, Math.min(resolvedDuration, Math.round((resolvedProgress / 100) * resolvedDuration)));
    const parsedShuffleValue = toBoolean(rawAttributes?.shuffle);
    const resolvedShuffleEnabled =
      typeof parsedShuffleValue === 'boolean'
        ? parsedShuffleValue
        : Boolean(fallbackSpeaker.shuffleEnabled);
    const resolvedRepeatMode = resolveMediaRepeatMode(
      rawAttributes?.repeat ?? fallbackSpeaker.repeatMode ?? 'off',
    );
    const liveSourceList = toStringArray(rawAttributes?.source_list);
    const liveSoundModeList = toStringArray(rawAttributes?.sound_mode_list);
    const selectedSoundMode = toTrimmedString(rawAttributes?.sound_mode);
    const selectedSource =
      toTrimmedString(rawAttributes?.source) ?? fallbackSpeaker.selectedOutputDeviceId ?? '';
    const outputSourceNames = Array.from(
      new Set(
        [selectedSource, ...liveSourceList]
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0),
      ),
    );
    const outputDevices =
      outputSourceNames.length > 0
        ? outputSourceNames.map((sourceName) => ({
            id: sourceName,
            name: sourceName,
            kind: inferMediaOutputKind(sourceName),
          }))
        : isHaConnected
          ? []
          : fallbackSpeaker.outputDevices;
    const groupedMemberIds = toStringArray(rawAttributes?.group_members).filter(
      (entityId) => entityId !== activeWidget.entityId,
    );
    const groupedSet = new Set(groupedMemberIds);
    const multiroomDevices = (() => {
      if (!isHaConnected) {
        return fallbackSpeaker.multiroomDevices;
      }
      const candidateMap = new Map<
        string,
        {
          id: string;
          name: string;
          subtitle?: string;
          kind: MediaOutputKind;
        }
      >();
      Object.entries(haStatesForUi).forEach(([entityId, entity]) => {
        if (!entityId.startsWith('media_player.') || entityId === activeWidget.entityId) {
          return;
        }
        const friendlyName = toTrimmedString(entity.rawAttributes?.friendly_name) ?? formatMediaPlayerEntityLabel(entityId);
        candidateMap.set(entityId, {
          id: entityId,
          name: friendlyName,
          subtitle: translateMediaPlayerState(
            toTrimmedString(entity.state) ?? toTrimmedString(entity.stateLabel),
            toTrimmedString(entity.stateLabel) ?? toTrimmedString(entity.state) ?? t('home.available'),
          ),
          kind: inferMediaOutputKind(friendlyName),
        });
      });
      groupedMemberIds.forEach((entityId) => {
        if (candidateMap.has(entityId)) {
          return;
        }
        candidateMap.set(entityId, {
          id: entityId,
          name: formatMediaPlayerEntityLabel(entityId),
          subtitle: t('home.available'),
          kind: 'speaker',
        });
      });
      return Array.from(candidateMap.values())
        .sort((first, second) => first.name.localeCompare(second.name, 'it-IT'))
        .map((entry) => ({
          ...entry,
          grouped: groupedSet.has(entry.id),
        }));
    })();

    return {
      isPlaying: mediaState === 'playing',
      status: mediaStateLabel,
      progress: resolvedProgress,
      positionSeconds: resolvedPosition,
      trackTitle:
        liveEntity?.mediaTitle?.trim() || liveEntity?.nowPlaying?.trim() || fallbackSpeaker.trackTitle,
      trackArtist: liveEntity?.mediaArtist?.trim() || fallbackSpeaker.trackArtist,
      durationSeconds: resolvedDuration,
      coverUrl:
        liveEntity?.imageUrl ||
        liveEntity?.mediaImageUrl ||
        toTrimmedString(rawAttributes?.media_image_url) ||
        toTrimmedString(rawAttributes?.entity_picture) ||
        fallbackSpeaker.coverUrl,
      volumeLevel:
        typeof liveEntity?.volumeLevel === 'number'
          ? Math.max(0, Math.min(100, Math.round(liveEntity.volumeLevel)))
          : fallbackSpeaker.volumeLevel,
      muted: typeof liveEntity?.mediaMuted === 'boolean' ? liveEntity.mediaMuted : fallbackSpeaker.muted,
      supportsSeek: capabilities.supportsSeek,
      supportsVolume: capabilities.supportsVolume,
      supportsMute: capabilities.supportsMute,
      supportsVolumeStep: capabilities.supportsVolumeStep,
      supportsNextTrack: capabilities.supportsNextTrack,
      supportsPreviousTrack: capabilities.supportsPreviousTrack,
      supportsPower: capabilities.supportsPower,
      supportsShuffle: capabilities.supportsShuffle,
      supportsRepeat: capabilities.supportsRepeat,
      supportsSelectSource: capabilities.supportsSelectSource,
      supportsGrouping: capabilities.supportsGrouping,
      supportsStop: capabilities.supportsStop,
      supportsClearPlaylist: capabilities.supportsClearPlaylist,
      supportsSelectSoundMode: capabilities.supportsSelectSoundMode,
      supportsPlayMedia: capabilities.supportsPlayMedia,
      supportsBrowseMedia: capabilities.supportsBrowseMedia,
      supportsSearchMedia: capabilities.supportsSearchMedia,
      supportsAnnounce: capabilities.supportsAnnounce,
      supportsEnqueue: capabilities.supportsEnqueue,
      shuffleEnabled: resolvedShuffleEnabled,
      repeatMode: resolvedRepeatMode,
      soundMode: selectedSoundMode,
      soundModeList: liveSoundModeList,
      volumeStep:
        typeof liveEntity?.volumeStep === 'number'
          ? liveEntity.volumeStep
          : toFiniteNumber(rawAttributes?.volume_step) ?? fallbackSpeaker.volumeStep,
      outputDevices,
      selectedOutputDeviceId:
        selectedSource ||
        (isHaConnected ? undefined : fallbackSpeaker.selectedOutputDeviceId),
      multiroomDevices,
      rawAttributes,
    };
  }, [activeWidget, effectiveRuntimeMode, haStatesForUi, isHaConnected, state.speaker]);

  const contextVacuum = useMemo(() => {
    if (activeWidget?.kind !== 'vacuum') {
      return {
        name: 'Robot aspirapolvere',
        state: 'unknown',
        status: translateVacuumState('unknown'),
        batteryLevel: undefined as number | undefined,
        cleanedArea: undefined as number | undefined,
        cleanedAreaUnit: undefined as string | undefined,
        cleaningMinutes: undefined as number | undefined,
        fanSpeed: undefined as string | undefined,
        fanSpeedList: [] as string[],
        mapUrl: undefined as string | undefined,
        supportedFeatures: undefined as number | undefined,
        supportsStart: false,
        supportsPause: false,
        supportsStop: false,
        supportsReturnToBase: false,
        supportsLocate: false,
        supportsCleanSpot: false,
        supportsCleanArea: false,
        supportsFanSpeed: false,
        supportsMap: false,
        supportsSendCommand: false,
        deviceInfo: undefined as VacuumDeviceInfo | undefined,
        relatedEntities: [] as VacuumRelatedEntityInfo[],
        areaOptions: [] as VacuumMappedArea[],
        rawAttributes: undefined as Record<string, unknown> | undefined,
      };
    }

    const deviceContext = buildVacuumDeviceContext({
      vacuumEntityId: activeWidget.entityId,
      haStates: haStatesForUi,
      entityRegistry: haEntityRegistry,
      deviceRegistry: haDeviceRegistry,
      haUrl,
    });
    const liveEntity = deviceContext.mainEntity;
    const sourceAttributes = liveEntity?.rawAttributes;
    const normalizedState = normalizeVacuumState(
      toTrimmedString(liveEntity?.state) ??
        toTrimmedString(liveEntity?.stateLabel) ??
        activeWidget.status,
    );
    const statusText = normalizedState === 'error'
      ? toTrimmedString(sourceAttributes?.error_description) ??
        toTrimmedString(sourceAttributes?.error) ??
        translateVacuumState(normalizedState)
      : translateVacuumState(normalizedState);
    const fanSpeed =
      toTrimmedString(sourceAttributes?.fan_speed) ??
      toTrimmedString(sourceAttributes?.fan_mode);
    const fanSpeedListSource =
      Array.isArray(sourceAttributes?.fan_speed_list)
        ? sourceAttributes.fan_speed_list
        : Array.isArray(sourceAttributes?.fan_speeds)
          ? sourceAttributes.fan_speeds
          : Array.isArray(sourceAttributes?.fan_modes)
            ? sourceAttributes.fan_modes
            : [];
    const fanSpeedList = fanSpeedListSource.filter(
      (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
    );
    const capabilities = resolveVacuumCapabilities(liveEntity);
    const areaNameMap = new Map(haAreas.map((area) => [area.area_id, area.name]));
    const areaOptions = parseVacuumMappedAreas(deviceContext.registryOptions, areaNameMap);

    return {
      name:
        activeWidget.title ||
        toTrimmedString(sourceAttributes?.friendly_name) ||
        'Robot aspirapolvere',
      state: normalizedState,
      status: statusText,
      batteryLevel: deviceContext.snapshot.batteryLevel,
      cleanedArea: deviceContext.snapshot.cleanedArea,
      cleanedAreaUnit: deviceContext.snapshot.cleanedAreaUnit,
      cleaningMinutes: deviceContext.snapshot.cleaningMinutes,
      fanSpeed,
      fanSpeedList,
      mapUrl: deviceContext.snapshot.mapUrl,
      supportedFeatures: capabilities.supportedFeatures,
      supportsStart: capabilities.supportsStart,
      supportsPause: capabilities.supportsPause,
      supportsStop: capabilities.supportsStop,
      supportsReturnToBase: capabilities.supportsReturnHome,
      supportsLocate: capabilities.supportsLocate,
      supportsCleanSpot: capabilities.supportsCleanSpot,
      supportsCleanArea: capabilities.supportsCleanArea,
      supportsFanSpeed: capabilities.supportsFanSpeed,
      supportsMap: capabilities.supportsMap,
      supportsSendCommand: capabilities.supportsSendCommand,
      deviceInfo: deviceContext.deviceInfo,
      relatedEntities: deviceContext.relatedEntities,
      areaOptions,
      rawAttributes: sourceAttributes,
    };
  }, [activeWidget, haAreas, haDeviceRegistry, haEntityRegistry, haStatesForUi, haUrl]);

  const contextAlarm = useMemo(() => {
    if (activeWidget?.kind !== 'alarm') {
      return {
        name: 'Allarme',
        state: 'disarmed',
        status: getAlarmStateLabel('disarmed'),
        codeArmRequired: false,
        unlockCode: undefined as string | undefined,
        localExtraCode: undefined as string | undefined,
        requireAuthToDisarm: false,
        activityLogLimit: DEFAULT_ACTIVITY_MAX_ENTRIES,
        activityLogHours: DEFAULT_ACTIVITY_WINDOW_HOURS,
        supportedFeatures: undefined as number | undefined,
        changedBy: undefined as string | undefined,
        activityTimeline: [] as ActivityTimelineEntry[],
        activityTimelineStatus: 'offline' as ActivityTimelineStatus,
        rawAttributes: undefined as Record<string, unknown> | undefined,
      };
    }

    const liveEntity = haStatesForUi[activeWidget.entityId];
    const rawAttributes = liveEntity?.rawAttributes;
    const resolvedState = normalizeAlarmState(
      toTrimmedString(liveEntity?.state) ??
        toTrimmedString(liveEntity?.stateLabel) ??
        activeWidget.status,
    );
    const supportedFeatures = resolveAlarmSupportedFeatures(liveEntity);
    const useMockAlarm =
      effectiveRuntimeMode === 'demo' &&
      activeWidget.dataSource === 'mock' &&
      activeWidget.entityId === HOME_ALARM_MOCK_ENTITY_ID &&
      (!isHaConnected || !haStates[HOME_ALARM_MOCK_ENTITY_ID]);
    const activityLogLimit = resolveActivityMaxEntries(activeWidget.activityLogLimit);
    const activityLogHours = resolveActivityWindowHours(activeWidget.activityLogHours);
    const normalizedAlarmEntityId = normalizeLower(activeWidget.entityId);
    const activityTimeline = (alarmTimelineByEntity[activeWidget.entityId] ?? [])
      .filter((entry) => normalizeLower(entry.entityId) === normalizedAlarmEntityId)
      .slice(0, activityLogLimit);
    const activityTimelineStatus = !useMockAlarm && isHaConnected
      ? alarmActivityStatusByEntity[activeWidget.entityId] ?? 'loading'
      : 'offline';
    const timelineActor = activityTimeline.find((entry) => entry.actor && entry.actor !== t('home.system'))?.actor;
    const changedBy = toTrimmedString(rawAttributes?.changed_by) ?? timelineActor ?? haCurrentUser?.name;
    const codeArmRequired = typeof rawAttributes?.code_arm_required === 'boolean' ? rawAttributes.code_arm_required : false;
    return {
      name:
        activeWidget.title ||
        toTrimmedString(rawAttributes?.friendly_name) ||
        t('alarm.fallback'),
      state: resolvedState,
      status: getAlarmStateLabel(resolvedState),
      codeArmRequired,
      unlockCode: activeWidgetSecrets.values.alarmUnlockCode?.trim() || undefined,
      localExtraCode: activeWidgetSecrets.values.alarmLocalExtraCode?.trim() || undefined,
      requireAuthToDisarm: activeWidget.alarmRequireAuthToDisarm ?? false,
      activityLogLimit,
      activityLogHours,
      supportedFeatures,
      changedBy,
      activityTimeline,
      activityTimelineStatus,
      rawAttributes,
    };
  }, [activeWidget, activeWidgetSecrets.values, alarmActivityStatusByEntity, alarmTimelineByEntity, haCurrentUser?.name, haStates, haStatesForUi, isHaConnected, t]);

  const contextLock = useMemo(() => {
    if (activeWidget?.kind !== 'lock') {
      return {
        name: t('home.lock'),
        state: 'unknown',
        status: translateLockState('unknown'),
        changedBy: undefined as string | undefined,
        activityLogLimit: DEFAULT_ACTIVITY_MAX_ENTRIES,
        activityLogHours: DEFAULT_ACTIVITY_WINDOW_HOURS,
        activityTimeline: [] as ActivityTimelineEntry[],
        activityTimelineStatus: 'offline' as ActivityTimelineStatus,
        supportedFeatures: undefined as number | undefined,
        batteryLevel: undefined as number | undefined,
        connection: undefined as ReturnType<typeof resolveDeviceConnection>,
        rawAttributes: undefined as Record<string, unknown> | undefined,
        lockCode: undefined as string | undefined,
      };
    }

    const liveEntity =
      isHaConnected || activeWidget.dataSource === 'mock'
        ? haStatesForUi[activeWidget.entityId] ?? haStatesForUi[activeWidget.entityId.toLowerCase()]
        : undefined;
    const rawAttributes = liveEntity?.rawAttributes;
    const stateValue = normalizeLockState(
      toTrimmedString(liveEntity?.state) ??
        toTrimmedString(liveEntity?.stateLabel) ??
        activeWidget.status,
    );
    const rawSupportedFeatures = toFiniteNumber(rawAttributes?.supported_features);
    const supportedFeatures =
      typeof liveEntity?.supportedFeatures === 'number'
        ? liveEntity.supportedFeatures
        : rawSupportedFeatures;
    const activityLogLimit = resolveActivityMaxEntries(activeWidget.activityLogLimit);
    const activityLogHours = resolveActivityWindowHours(activeWidget.activityLogHours);
    const normalizedLockEntityId = normalizeLower(activeWidget.entityId);
    const activityTimeline = (lockTimelineByEntity[activeWidget.entityId] ?? [])
      .filter((entry) => normalizeLower(entry.entityId) === normalizedLockEntityId)
      .slice(0, activityLogLimit);
    const activityTimelineStatus = isHaConnected
      ? lockActivityStatusByEntity[activeWidget.entityId] ?? 'loading'
      : 'offline';
    const timelineActor = activityTimeline.find((entry) => entry.actor && entry.actor !== t('home.system'))?.actor;
    const changedBy = toTrimmedString(rawAttributes?.changed_by) ?? timelineActor ?? haCurrentUser?.name;
    const telemetryEntities = resolveDeviceTelemetryEntities({
      mainEntityId: activeWidget.entityId,
      haStates: haStatesForUi,
      entityRegistry: haEntityRegistry,
      batteryEntityId: activeWidget.lockBatteryEntityId,
      connectionEntityId: activeWidget.lockConnectionEntityId,
    });
    const batteryLevel = resolveDeviceBatteryLevel(liveEntity, telemetryEntities.batteryEntity);
    const connection = resolveDeviceConnection(liveEntity, telemetryEntities.connectionEntity);

    return {
      name:
        activeWidget.title ||
        toTrimmedString(rawAttributes?.friendly_name) ||
        t('home.lock'),
      state: stateValue,
      status: translateLockState(stateValue),
      changedBy,
      activityLogLimit,
      activityLogHours,
      activityTimeline,
      activityTimelineStatus,
      supportedFeatures,
      batteryLevel,
      connection,
      rawAttributes,
      lockCode: activeWidgetSecrets.values.lockCode?.trim() || undefined,
    };
  }, [activeWidget, activeWidgetSecrets.values, haCurrentUser?.name, haEntityRegistry, haStatesForUi, isHaConnected, lockActivityStatusByEntity, lockTimelineByEntity, t]);

  const contextCover = useMemo(() => {
    if (activeWidget?.kind !== 'cover') {
      return {
        name: 'Tapparella',
        state: 'unknown',
        status: translateCoverState('unknown'),
        position: 70,
        tiltPosition: 50,
        supportedFeatures: undefined as number | undefined,
        supportsOpen: true,
        supportsClose: true,
        supportsStop: true,
        supportsSetPosition: true,
        supportsOpenTilt: false,
        supportsCloseTilt: false,
        supportsSetTiltPosition: false,
        supportsStopTilt: false,
        rawAttributes: undefined as Record<string, unknown> | undefined,
      };
    }

    const liveEntity = activeWidget.entityId ? haStatesForUi[activeWidget.entityId] : undefined;
    const rawAttributes = liveEntity?.rawAttributes ?? buildFallbackCoverAttributes(activeWidget);
    const stateValue = normalizeCoverState(
      toTrimmedString(liveEntity?.state) ??
        toTrimmedString(liveEntity?.stateLabel) ??
        activeWidget.status,
    );
    const position = resolveCoverPosition(
      stateValue,
      resolveCoverPositionAttribute(rawAttributes) ?? activeWidget.value,
      typeof activeWidget.value === 'number' ? activeWidget.value : 70,
    );
    const tiltPosition = resolveCoverTiltPosition(
      resolveCoverTiltAttribute(rawAttributes) ?? activeWidget.coverTiltPosition,
      typeof activeWidget.coverTiltPosition === 'number' ? activeWidget.coverTiltPosition : 50,
    );
    const capabilities = resolveCoverCapabilities(liveEntity, rawAttributes);

    return {
      name:
        activeWidget.title ||
        toTrimmedString(rawAttributes?.friendly_name) ||
        'Tapparella',
      state: stateValue,
      status: `${translateCoverState(stateValue)} ${position}%`,
      position,
      tiltPosition,
      supportedFeatures: capabilities.supportedFeatures,
      supportsOpen: capabilities.supportsOpen,
      supportsClose: capabilities.supportsClose,
      supportsStop: capabilities.supportsStop,
      supportsSetPosition: capabilities.supportsSetPosition,
      supportsOpenTilt: capabilities.supportsOpenTilt,
      supportsCloseTilt: capabilities.supportsCloseTilt,
      supportsSetTiltPosition: capabilities.supportsSetTiltPosition,
      supportsStopTilt: capabilities.supportsStopTilt,
      rawAttributes,
    };
  }, [activeWidget, haStatesForUi]);

  const activeActivityTarget = useMemo(() => {
    if (!isHaConnected || (activeWidget?.kind !== 'lock' && activeWidget?.kind !== 'alarm')) {
      return null;
    }
    const entityId = activeWidget.entityId?.trim();
    if (!entityId) {
      return null;
    }
    const liveEntity = haStates[entityId];
    const rawAttributes = liveEntity?.rawAttributes;
    const refreshKey = [
      toTrimmedString(liveEntity?.state),
      toTrimmedString(liveEntity?.stateLabel),
      toTrimmedString(rawAttributes?.changed_by),
      toTrimmedString(rawAttributes?.changed_at),
      toTrimmedString(rawAttributes?.last_changed),
      toTrimmedString(rawAttributes?.last_updated),
    ]
      .filter((entry): entry is string => Boolean(entry))
      .join('|');
    return {
      kind: activeWidget.kind,
      entityId,
      entityName:
        activeWidget.title ||
        toTrimmedString(liveEntity?.rawAttributes?.friendly_name) ||
        entityId,
      activityWindowHours: resolveActivityWindowHours(activeWidget.activityLogHours),
      activityMaxEntries: resolveActivityMaxEntries(activeWidget.activityLogLimit),
      fallbackActor: toTrimmedString(rawAttributes?.changed_by) ?? haCurrentUser?.name,
      refreshKey,
    };
  }, [activeWidget, haCurrentUser?.name, haStates, isHaConnected]);

  const stateWithConnectedUser = useMemo(
    () => ({
      ...state,
      userName: haCurrentUser?.name ?? state.userName,
    }),
    [haCurrentUser?.name, state],
  );

  const currentUserAvatarUrl = useMemo(() => {
    if (!isHaConnected || !haCurrentUser?.id) {
      return undefined;
    }

    const personEntity = Object.entries(haStates).find(([entityId, entity]) => {
      if (!entityId.startsWith('person.')) {
        return false;
      }
      const userId = toTrimmedString(entity.rawAttributes?.user_id);
      return userId === haCurrentUser.id;
    })?.[1];

    if (!personEntity) {
      return undefined;
    }

    const directImage = toTrimmedString(personEntity.imageUrl);
    if (directImage) {
      return resolveHaAssetUrl(directImage, haUrl);
    }

    const picture = toTrimmedString(personEntity.rawAttributes?.entity_picture);
    return resolveHaAssetUrl(picture, haUrl);
  }, [haCurrentUser?.id, haStates, haUrl, isHaConnected]);

  const profileHouseMembers = useMemo(() => {
    const collectedMembers: ProfileHouseMember[] = [];
    const seenMemberIds = new Set<string>();
    const currentUserId = toTrimmedString(haCurrentUser?.id);
    const resolveMemberRoleLabel = (userId: string | undefined) => {
      const resolvedUserId = toTrimmedString(userId);
      if (!resolvedUserId) {
        return 'Membro';
      }
      const linkedUser = haUsersById[resolvedUserId] ?? (haCurrentUser?.id === resolvedUserId ? haCurrentUser : undefined);
      if (!linkedUser) {
        return 'Membro';
      }
      return linkedUser.isOwner ? 'Creatore' : linkedUser.isAdmin ? 'Admin' : 'Membro';
    };

    const addMember = (member: ProfileHouseMember) => {
      const memberId = toTrimmedString(member.id);
      const memberName = toTrimmedString(member.name);
      if (!memberId || !memberName || seenMemberIds.has(memberId)) {
        return;
      }
      seenMemberIds.add(memberId);
      collectedMembers.push({
        id: memberId,
        name: memberName,
        userId: toTrimmedString(member.userId),
        avatarUrl: toTrimmedString(member.avatarUrl),
        roleLabel: toTrimmedString(member.roleLabel),
        isCurrent: member.isCurrent === true,
      });
    };

    if (isHaConnected) {
      Object.entries(haStates).forEach(([entityId, entity]) => {
        if (!entityId.startsWith('person.')) {
          return;
        }
        const rawAttributes = entity.rawAttributes ?? {};
        const userId = toTrimmedString(rawAttributes.user_id);
        const entityName = toTrimmedString(rawAttributes.friendly_name);
        const slugFallback = entityId.slice('person.'.length).replace(/[_-]+/g, ' ').trim();
        const name = entityName ?? (slugFallback.length > 0 ? slugFallback : entityId);
        if (
          isGuestServiceAccountMemberCandidate({
            userId,
            displayName: name,
            entityId,
          })
        ) {
          return;
        }
        const avatarCandidate = toTrimmedString(entity.imageUrl) ?? toTrimmedString(rawAttributes.entity_picture);
        const avatarUrl = resolveHaAssetUrl(avatarCandidate, haUrl);
        const memberId = userId ? `user:${userId}` : `person:${entityId}`;
        addMember({
          id: memberId,
          name,
          userId,
          avatarUrl,
          roleLabel: resolveMemberRoleLabel(userId),
          isCurrent: Boolean(currentUserId && userId && currentUserId === userId),
        });
      });
    }

    Object.entries(haUserNamesById).forEach(([userId, userName]) => {
      const trimmedUserId = toTrimmedString(userId);
      const trimmedUserName = toTrimmedString(userName);
      if (!trimmedUserId || !trimmedUserName) {
        return;
      }
      const linkedUserDetails = haUsersById[trimmedUserId];
      if (
        isGuestServiceAccountMemberCandidate({
          userId: trimmedUserId,
          displayName: trimmedUserName,
          username: linkedUserDetails?.username,
          email: linkedUserDetails?.email,
        })
      ) {
        return;
      }
      addMember({
        id: `user:${trimmedUserId}`,
        name: trimmedUserName,
        userId: trimmedUserId,
        roleLabel: resolveMemberRoleLabel(trimmedUserId),
        isCurrent: currentUserId === trimmedUserId,
      });
    });

    if (haCurrentUser?.id && haCurrentUser.name) {
      if (
        !isGuestServiceAccountMemberCandidate({
          userId: haCurrentUser.id,
          displayName: haCurrentUser.name,
          username: haCurrentUser.username,
          email: haCurrentUser.email,
        })
      ) {
        addMember({
          id: `user:${haCurrentUser.id}`,
          name: haCurrentUser.name,
          userId: haCurrentUser.id,
          avatarUrl: currentUserAvatarUrl,
          roleLabel: resolveMemberRoleLabel(haCurrentUser.id),
          isCurrent: true,
        });
      }
    }

    return collectedMembers.sort((first, second) => {
      if (first.isCurrent === true && second.isCurrent !== true) {
        return -1;
      }
      if (second.isCurrent === true && first.isCurrent !== true) {
        return 1;
      }
      return first.name.localeCompare(second.name, 'it-IT');
    });
  }, [currentUserAvatarUrl, haCurrentUser, haStates, haUrl, haUserNamesById, haUsersById, isHaConnected]);

  const membersLiveMapPoints = useMemo(() => {
    type MemberPersonMeta = {
      coordinates?: { latitude: number; longitude: number };
      stateLabel?: string;
      linkedTrackers: string[];
      displayName?: string;
      avatarUrl?: string;
      sourceTracker?: string;
    };
    const personMetaByUserId = new Map<string, MemberPersonMeta>();
    const personMetaByName = new Map<string, MemberPersonMeta>();
    const trackersByUserId = new Map<string, Set<string>>();
    const trackersByName = new Map<string, Set<string>>();
    const trackersByNameToken = new Map<string, Set<string>>();
    const trackerKindByEntityId = new Map<string, MemberTrackerDeviceKind | null>();

    const upsertTrackerLink = (map: Map<string, Set<string>>, key: string | undefined, trackerId: string) => {
      const normalizedKey = toTrimmedString(key);
      const normalizedTrackerId = toTrimmedString(trackerId);
      if (!normalizedKey || !normalizedTrackerId || !normalizedTrackerId.startsWith('device_tracker.')) {
        return;
      }
      const existing = map.get(normalizedKey);
      if (existing) {
        existing.add(normalizedTrackerId);
        return;
      }
      map.set(normalizedKey, new Set([normalizedTrackerId]));
    };

    const upsertTrackerTokenLinks = (source: string | undefined, trackerId: string) => {
      const normalizedSource = toTrimmedString(source);
      const normalizedTrackerId = toTrimmedString(trackerId);
      if (!normalizedSource || !normalizedTrackerId) {
        return;
      }
      normalizedSource
        .split('_')
        .map((token) => token.trim())
        .filter((token) => token.length >= 3)
        .forEach((token) => upsertTrackerLink(trackersByNameToken, token, normalizedTrackerId));
    };

    Object.entries(haStates).forEach(([entityId, entity]) => {
      if (!entityId.startsWith('person.')) {
        return;
      }
      const rawAttributes = entity.rawAttributes ?? {};
      const userId = toTrimmedString(rawAttributes.user_id);
      const friendlyName =
        toTrimmedString(rawAttributes.friendly_name) ??
        entityId.slice('person.'.length).replace(/[_-]+/g, ' ').trim();
      const normalizedName = normalizeMovementLocationKey(friendlyName);
      const linkedTrackers = Array.from(
        new Set([
          ...toTrackerEntityIds(rawAttributes.device_trackers),
          ...toTrackerEntityIds(rawAttributes.entity_id),
        ]),
      );
      const activeSourceTracker = toTrimmedString(rawAttributes.source);
      if (activeSourceTracker?.startsWith('device_tracker.')) {
        linkedTrackers.push(activeSourceTracker);
      }
      const coordinates = readMovementCoordinates(rawAttributes) ?? undefined;
      const stateLabel = toTrimmedString(entity.stateLabel ?? entity.state);
      const personAvatar = resolveHaAssetUrl(
        toTrimmedString(entity.imageUrl) ?? toTrimmedString(rawAttributes.entity_picture),
        haUrl,
      );

      const personMeta: MemberPersonMeta = {
        coordinates,
        stateLabel,
        linkedTrackers,
        displayName: friendlyName,
        avatarUrl: personAvatar,
        sourceTracker: activeSourceTracker,
      };
      if (userId) {
        personMetaByUserId.set(userId, personMeta);
      }
      if (normalizedName) {
        personMetaByName.set(normalizedName, personMeta);
      }
    });

    Object.entries(haStates).forEach(([entityId, entity]) => {
      if (!entityId.startsWith('device_tracker.')) {
        return;
      }
      const rawAttributes = entity.rawAttributes ?? {};
      const linkedUserId = toTrimmedString(rawAttributes.user_id);
      const friendlyNameKey = normalizeMovementLocationKey(toTrimmedString(rawAttributes.friendly_name));
      const entityKey = normalizeMovementLocationKey(entityId.slice('device_tracker.'.length));
      trackerKindByEntityId.set(entityId, classifyTrackerDeviceKind(entityId, rawAttributes));
      upsertTrackerLink(trackersByUserId, linkedUserId, entityId);
      upsertTrackerLink(trackersByName, friendlyNameKey, entityId);
      upsertTrackerLink(trackersByName, entityKey, entityId);
      upsertTrackerTokenLinks(friendlyNameKey, entityId);
      upsertTrackerTokenLinks(entityKey, entityId);
    });

    return profileHouseMembers
      .map((member) => {
        const normalizedUserId = toTrimmedString(member.userId);
        const normalizedName = normalizeMovementLocationKey(member.name);
        const personMeta =
          (normalizedUserId ? personMetaByUserId.get(normalizedUserId) : undefined) ??
          (normalizedName ? personMetaByName.get(normalizedName) : undefined);
        const coordinates = personMeta?.coordinates;
        if (!coordinates) {
          return null;
        }
        const trackerEntityIds = new Set<string>();
        personMeta?.linkedTrackers.forEach((trackerId) => trackerEntityIds.add(trackerId));
        if (normalizedUserId) {
          trackersByUserId.get(normalizedUserId)?.forEach((trackerId) => trackerEntityIds.add(trackerId));
        }
        if (normalizedName) {
          trackersByName.get(normalizedName)?.forEach((trackerId) => trackerEntityIds.add(trackerId));
          normalizedName
            .split('_')
            .map((token) => token.trim())
            .filter((token) => token.length >= 3)
            .forEach((token) =>
              trackersByNameToken.get(token)?.forEach((trackerId) => trackerEntityIds.add(trackerId)),
            );
        }
        const devices = {
          smartwatch: 0,
          tablet: 0,
          smartphone: 0,
        };
        trackerEntityIds.forEach((trackerId) => {
          const trackerKind = trackerKindByEntityId.get(trackerId);
          if (trackerKind) {
            devices[trackerKind] += 1;
          }
        });

        return {
          id: member.id,
          name: personMeta?.displayName ?? member.name,
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          isCurrent: member.isCurrent === true,
          roleLabel: member.roleLabel,
          avatarUrl: personMeta?.avatarUrl ?? member.avatarUrl,
          locationLabel: formatMovementLocationLabel(personMeta?.stateLabel, {
            unknown: t('home.location.unknown'),
            home: t('home.location.home'),
            away: t('home.location.away'),
            generic: t('home.location.generic'),
          }),
          devices,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((first, second) => {
        if (first.isCurrent === true && second.isCurrent !== true) {
          return -1;
        }
        if (second.isCurrent === true && first.isCurrent !== true) {
          return 1;
        }
        return first.name.localeCompare(second.name, locale);
      });
  }, [haStates, haUrl, locale, profileHouseMembers, t]);

  const contextState = useMemo(
    () => ({
      ...stateWithConnectedUser,
      lamp: contextLamp,
      climate: contextClimate,
      speaker: contextSpeaker,
    }),
    [contextClimate, contextLamp, contextSpeaker, stateWithConnectedUser],
  );

  useEffect(() => {
    if (isHaConnected && haCurrentUser) {
      return;
    }
    setHaUsersById({});
    setHaUserNamesById({});
  }, [haCurrentUser, isHaConnected]);

  useEffect(() => {
    if (!isHaConnected || !haCurrentUser) {
      return;
    }
    if (!haCurrentUser.isOwner && !haCurrentUser.isAdmin) {
      setHaUserNamesById({ [haCurrentUser.id]: haCurrentUser.name });
      setHaUsersById({ [haCurrentUser.id]: haCurrentUser });
      return;
    }
    setHaUserNamesById((current) =>
      current[haCurrentUser.id] === haCurrentUser.name
        ? current
        : { ...current, [haCurrentUser.id]: haCurrentUser.name },
    );
    setHaUsersById((current) => ({ ...current, [haCurrentUser.id]: haCurrentUser }));
  }, [haCurrentUser, isHaConnected]);

  useEffect(() => {
    if (!isHaConnected || (!haCurrentUser?.isOwner && !haCurrentUser?.isAdmin)) {
      return;
    }
    let cancelled = false;
    const loadUsers = async () => {
      const primary = await callHaApi<unknown>({ type: 'config/auth/list' }, { reportError: false });
      const secondary = primary ?? (await callHaApi<unknown>({ type: 'auth/list' }, { reportError: false }));
      if (cancelled || secondary === null) {
        return;
      }
      const users = parseHaAuthUsers(secondary);
      if (!users.length) {
        return;
      }
      setHaUserNamesById((current) => {
        const next = { ...current };
        let changed = false;
        users.forEach((user) => {
          if (next[user.id] === user.name) {
            return;
          }
          next[user.id] = user.name;
          changed = true;
        });
        return changed ? next : current;
      });
      setHaUsersById((current) => {
        const next = { ...current };
        let changed = false;
        users.forEach((user) => {
          const previous = next[user.id];
          if (
            previous &&
            previous.name === user.name &&
            previous.username === user.username &&
            previous.email === user.email &&
            previous.isOwner === user.isOwner &&
            previous.isAdmin === user.isAdmin
          ) {
            return;
          }
          next[user.id] = user;
          changed = true;
        });
        return changed ? next : current;
      });
    };

    void loadUsers();
    return () => {
      cancelled = true;
    };
  }, [callHaApi, haCurrentUser?.isAdmin, haCurrentUser?.isOwner, isHaConnected]);

  useEffect(() => {
    if (!isHaConnected) {
      setHaServiceRegistry(null);
      return;
    }
    let cancelled = false;
    const loadServices = async () => {
      const payload = await callHaApi<unknown>({ type: 'get_services' }, { reportError: false });
      if (cancelled || !payload || typeof payload !== 'object') {
        return;
      }
      setHaServiceRegistry(payload as HaServiceRegistry);
    };
    void loadServices();
    return () => {
      cancelled = true;
    };
  }, [callHaApi, isHaConnected]);

  useEffect(() => {
    if (!isHaConnected) {
      setHaEntityRegistry([]);
      setHaDeviceRegistry([]);
      return;
    }
    let cancelled = false;
    const loadRegistries = async () => {
      const entitiesRequest = async () =>
        (await callHaApi<unknown>({ type: 'config/entity_registry/list' }, { reportError: false })) ??
        (await callHaApi<unknown>({ type: 'config/entity_registry/list_for_display' }, { reportError: false }));
      const devicesRequest = async () =>
        (await callHaApi<unknown>({ type: 'config/device_registry/list' }, { reportError: false })) ??
        (await callHaApi<unknown>({ type: 'config/device_registry/list_for_display' }, { reportError: false }));

      const [entitiesPayload, devicesPayload] = await Promise.all([entitiesRequest(), devicesRequest()]);
      if (cancelled) {
        return;
      }
      setHaEntityRegistry(parseHaEntityRegistry(entitiesPayload));
      setHaDeviceRegistry(parseHaDeviceRegistry(devicesPayload));
    };
    void loadRegistries();
    return () => {
      cancelled = true;
    };
  }, [callHaApi, isHaConnected]);

  useEffect(() => {
    if (!isHaConnected) {
      setHaFavoriteEntityIds([]);
      setHaFavoriteLabelDetected(false);
      return;
    }
    if (!favoriteGridSections.length) {
      setHaFavoriteEntityIds([]);
      setHaFavoriteLabelDetected(false);
      return;
    }
    let cancelled = false;
    const loadFavoriteLabels = async () => {
      const labelsRequest = async () =>
        (await callHaApi<unknown>({ type: 'config/label_registry/list' }, { reportError: false })) ??
        (await callHaApi<unknown>({ type: 'config/label_registry/list_for_display' }, { reportError: false }));
      const entitiesRequest = async () =>
        (await callHaApi<unknown>({ type: 'config/entity_registry/list' }, { reportError: false })) ??
        (await callHaApi<unknown>({ type: 'config/entity_registry/list_for_display' }, { reportError: false }));
      const devicesRequest = async () =>
        (await callHaApi<unknown>({ type: 'config/device_registry/list' }, { reportError: false })) ??
        (await callHaApi<unknown>({ type: 'config/device_registry/list_for_display' }, { reportError: false }));

      const [labelsPayload, entitiesPayload, devicesPayload] = await Promise.all([
        labelsRequest(),
        entitiesRequest(),
        devicesRequest(),
      ]);
      if (cancelled) {
        return;
      }
      if (!labelsPayload || !entitiesPayload) {
        return;
      }
      const favoriteLabelIds = parseFavoriteLabelIds(labelsPayload);
      const favoriteEntityIds = parseEntityIdsByLabelIds(entitiesPayload, favoriteLabelIds);
      const favoriteDeviceIds = parseDeviceIdsByLabelIds(devicesPayload, favoriteLabelIds);
      const favoriteEntityIdsFromDevices = parseEntityIdsByDeviceIds(entitiesPayload, favoriteDeviceIds);
      favoriteEntityIdsFromDevices.forEach((entityId) => favoriteEntityIds.add(entityId));
      setHaFavoriteLabelDetected(favoriteLabelIds.size > 0);
      setHaFavoriteEntityIds((current) => {
        const next = Array.from(favoriteEntityIds).sort((first, second) => first.localeCompare(second, 'it-IT'));
        if (current.length === next.length && current.every((item) => favoriteEntityIds.has(item))) {
          return current;
        }
        return next;
      });
    };
    void loadFavoriteLabels();
    const refreshInterval = window.setInterval(() => {
      void loadFavoriteLabels();
    }, 30000);
    const handleWindowFocus = () => {
      void loadFavoriteLabels();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void loadFavoriteLabels();
      }
    };
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(refreshInterval);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [callHaApi, favoriteGridSections.length, isHaConnected]);

  useEffect(() => {
    setProfileMovementPoints(profileMovementSource.basePoints);
    setProfileMovementTimeline(profileMovementSource.baseTimeline);
    if (profileMovementSource.baseTimeline.length > 0) {
      setProfileMovementUpdatedLabel(t('home.updatedAt', { time: profileMovementSource.baseTimeline[0].timestampLabel }));
      return;
    }
    setProfileMovementUpdatedLabel('');
  }, [profileMovementSource.basePoints, profileMovementSource.baseTimeline, t]);

  useEffect(() => {
    if (!isProfileOpen || !isHaConnected || profileMovementSource.trackedEntityIds.length === 0) {
      return;
    }

    let cancelled = false;
    const trackedEntityIdsSet = new Set(profileMovementSource.trackedEntityIds);
    const loadProfileMovementData = async () => {
      const endMs = Date.now();
      const startMs = endMs - PROFILE_MOVEMENT_WINDOW_HOURS * 60 * 60 * 1000;
      const payload = await callHaApi<unknown>(
        {
          type: 'logbook/get_events',
          start_time: new Date(startMs).toISOString(),
          end_time: new Date(endMs).toISOString(),
          entity_ids: profileMovementSource.trackedEntityIds.slice(0, 25),
        },
        { reportError: false },
      );
      if (cancelled || payload === null) {
        return;
      }

      const events = parseHaLogbookEvents(payload)
        .map((event, index) => {
          const eventEntityId = toTrimmedString(event.entity_id);
          const timestampMs = toTimestampMs(event.when);
          if (!eventEntityId || !timestampMs || !trackedEntityIdsSet.has(eventEntityId)) {
            return null;
          }
          const rawState = toTrimmedString(event.state);
          const locationLabel = formatMovementLocationLabel(rawState, {
            unknown: t('home.location.unknown'),
            home: t('home.location.home'),
            away: t('home.location.away'),
            generic: t('home.location.generic'),
          });
          const actorLabel = toTrimmedString(event.name) ?? eventEntityId;
          const timestampLabel = formatDate(timestampMs, {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          });
          const locationKey = normalizeMovementLocationKey(rawState);
          const mappedLocation = locationKey ? profileMovementSource.zoneLookup[locationKey] : undefined;
          return {
            id: `${timestampMs}-${index}-${eventEntityId}`,
            entityId: eventEntityId,
            actorLabel,
            locationLabel,
            timestampMs,
            timestampLabel,
            mappedLocation,
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        .sort((first, second) => second.timestampMs - first.timestampMs)
        .slice(0, PROFILE_MOVEMENT_MAX_ENTRIES);

      if (cancelled) {
        return;
      }

      if (events.length === 0) {
        return;
      }

      const nextTimeline: ProfileMovementTimelineEntry[] = events.map((event, index) => ({
        id: `profile-movement-${event.id}`,
        title: t('home.location.event', { location: event.locationLabel }),
        subtitle: event.actorLabel,
        timestampLabel: event.timestampLabel,
        timestampMs: event.timestampMs,
        isCurrent: index === 0,
      }));

      const nextMapPoints: ProfileMovementMapPoint[] = events
        .map((event) => {
          if (!event.mappedLocation) {
            return null;
          }
          return {
            id: `profile-map-${event.id}`,
            latitude: event.mappedLocation.latitude,
            longitude: event.mappedLocation.longitude,
            label: event.actorLabel,
            zoneLabel: event.locationLabel,
            timestampLabel: event.timestampLabel,
            timestampMs: event.timestampMs,
            isCurrent: false,
          } satisfies ProfileMovementMapPoint;
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

      const enrichedMapPoints =
        nextMapPoints.length > 0
          ? nextMapPoints.map((point, index) => ({
              ...point,
              isCurrent: index === 0,
            }))
          : profileMovementSource.basePoints;

      setProfileMovementTimeline(nextTimeline);
      setProfileMovementPoints(enrichedMapPoints);
      setProfileMovementUpdatedLabel(t('home.updatedAt', {
        time: formatDate(Date.now(), { hour: '2-digit', minute: '2-digit' }),
      }));
    };

    void loadProfileMovementData();
    const refreshIntervalId = window.setInterval(() => {
      void loadProfileMovementData();
    }, HA_ACTIVITY_REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(refreshIntervalId);
    };
  }, [callHaApi, formatDate, isHaConnected, isProfileOpen, profileMovementSource, t]);

  const activeActivityKind = activeActivityTarget?.kind;
  const activeActivityEntityId = activeActivityTarget?.entityId;
  const activeActivityEntityName = activeActivityTarget?.entityName ?? activeActivityEntityId ?? t('home.lock');
  const activeActivityWindowHours = activeActivityTarget?.activityWindowHours ?? DEFAULT_ACTIVITY_WINDOW_HOURS;
  const activeActivityMaxEntries = activeActivityTarget?.activityMaxEntries ?? DEFAULT_ACTIVITY_MAX_ENTRIES;
  const activeActivityFallbackActor = activeActivityTarget?.fallbackActor;
  const activeActivityRefreshKey = activeActivityTarget?.refreshKey;
  const activeActivityUsesMockAlarm =
    effectiveRuntimeMode === 'demo' &&
    activeWidget?.dataSource === 'mock' &&
    activeActivityKind === 'alarm' &&
    activeActivityEntityId === HOME_ALARM_MOCK_ENTITY_ID &&
    !haStates[HOME_ALARM_MOCK_ENTITY_ID];

  useEffect(() => {
    if (!isHaConnected || !activeActivityKind || !activeActivityEntityId || activeActivityUsesMockAlarm) {
      return;
    }

    let cancelled = false;
    const fetchSeq = ++activityFetchSeqRef.current;
    if (activeActivityKind === 'lock') {
      setLockActivityStatusByEntity((current) => ({
        ...current,
        [activeActivityEntityId]: current[activeActivityEntityId] === 'available' ? 'available' : 'loading',
      }));
    } else if (activeActivityKind === 'alarm') {
      setAlarmActivityStatusByEntity((current) => ({
        ...current,
        [activeActivityEntityId]: current[activeActivityEntityId] === 'available' ? 'available' : 'loading',
      }));
    }

    const loadTimeline = async () => {
      const endMs = Date.now() + 2 * 60 * 1000;
      const startMs = endMs - activeActivityWindowHours * 60 * 60 * 1000;
      const payloadWithEntityIds = await callHaApi<unknown>(
        {
          type: 'logbook/get_events',
          start_time: new Date(startMs).toISOString(),
          end_time: new Date(endMs).toISOString(),
          entity_ids: [activeActivityEntityId],
        },
        { reportError: false },
      );
      const payload =
        payloadWithEntityIds ??
        (await callHaApi<unknown>(
          {
            type: 'logbook/get_events',
            start_time: new Date(startMs).toISOString(),
            end_time: new Date(endMs).toISOString(),
            entity_id: activeActivityEntityId,
          },
          { reportError: false },
        ));

      if (cancelled || fetchSeq !== activityFetchSeqRef.current) {
        return;
      }

      if (payload === null) {
        if (activeActivityKind === 'lock') {
          setLockTimelineByEntity((current) => ({
            ...current,
            [activeActivityEntityId]: [],
          }));
          setLockActivityStatusByEntity((current) => ({
            ...current,
            [activeActivityEntityId]: 'unavailable',
          }));
        } else if (activeActivityKind === 'alarm') {
          setAlarmTimelineByEntity((current) => ({
            ...current,
            [activeActivityEntityId]: [],
          }));
          setAlarmActivityStatusByEntity((current) => ({
            ...current,
            [activeActivityEntityId]: 'unavailable',
          }));
        }
        return;
      }

      const events = parseHaLogbookEvents(payload);
      const filteredEvents = events.filter((event) => {
        const eventEntityId = normalizeLower(toTrimmedString(event.entity_id));
        return eventEntityId === normalizeLower(activeActivityEntityId);
      });
      const entries = buildTimelineEntries(
        filteredEvents,
        (event) =>
          resolveActivityActor(
            event,
            haUserNamesById,
            activeActivityKind === 'lock' || activeActivityKind === 'alarm'
              ? t('home.system')
              : activeActivityFallbackActor ?? haCurrentUser?.name ?? t('home.system'),
          ),
        activeActivityKind === 'lock' ? resolveLockActivityVerb : resolveAlarmActivityVerb,
        activeActivityMaxEntries,
        activeActivityKind === 'lock'
          ? (event, timestampMs, actor, verb) =>
              resolveLockLogbookText(actor, verb, toTrimmedString(event.name) ?? activeActivityEntityName, timestampMs)
          : activeActivityKind === 'alarm'
            ? (event, timestampMs, actor, verb) =>
                resolveAlarmLogbookText(actor, verb, toTrimmedString(event.name) ?? activeActivityEntityName, timestampMs)
          : undefined,
      );

      if (cancelled || fetchSeq !== activityFetchSeqRef.current) {
        return;
      }

      if (activeActivityKind === 'lock') {
        setLockTimelineByEntity((current) => {
          return {
            ...current,
            [activeActivityEntityId]: entries,
          };
        });
        setLockActivityStatusByEntity((current) => ({
          ...current,
          [activeActivityEntityId]: entries.length > 0 ? 'available' : 'empty',
        }));
        return;
      }

      setAlarmTimelineByEntity((current) => ({
        ...current,
        [activeActivityEntityId]: entries,
      }));
      setAlarmActivityStatusByEntity((current) => ({
        ...current,
        [activeActivityEntityId]: entries.length > 0 ? 'available' : 'empty',
      }));
    };

    void loadTimeline();
    const intervalId = window.setInterval(() => {
      void loadTimeline();
    }, HA_ACTIVITY_REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    activeActivityEntityId,
    activeActivityEntityName,
    activeActivityFallbackActor,
    activeActivityKind,
    activeActivityMaxEntries,
    activeActivityRefreshKey,
    activeActivityWindowHours,
    activeActivityUsesMockAlarm,
    activityRefreshNonce,
    callHaApi,
    haCurrentUser?.name,
    haUserNamesById,
    isHaConnected,
    t,
  ]);

  useEffect(() => {
    setWidgets((prev) => {
      const next = prev.map((widget) => {
        const liveEntity = haStatus === 'connected' ? haStatesForUi[widget.entityId] : undefined;
        if (liveEntity) {
          let statusLabel = liveEntity.stateLabel ?? liveEntity.state ?? widget.status;
          const unit = liveEntity.unit ?? widget.unit;
          const isOn =
            typeof liveEntity.toggleOn === 'boolean'
              ? liveEntity.toggleOn
              : widget.kind === 'climate' && typeof liveEntity.state === 'string'
                ? liveEntity.state !== 'off'
              : widget.kind === 'media'
                ? ['playing', 'paused', 'buffering', 'on'].includes(resolveMediaState(liveEntity.state ?? liveEntity.stateLabel))
                : widget.kind === 'switch'
                  ? normalizeLower(liveEntity.stateLabel ?? liveEntity.state) === 'on'
                : widget.kind === 'alarm'
                    ? isAlarmArmedState(liveEntity.stateLabel ?? liveEntity.state ?? widget.status)
                  : widget.kind === 'vacuum'
                    ? ['cleaning', 'paused', 'returning'].includes(
                        normalizeVacuumState(liveEntity.stateLabel ?? liveEntity.state ?? widget.status),
                      )
                    : widget.kind === 'lock'
                      ? isLockLockedState(normalizeLockState(liveEntity.stateLabel ?? liveEntity.state ?? widget.status))
                      : widget.kind === 'cover'
                        ? resolveCoverPosition(
                            normalizeCoverState(liveEntity.stateLabel ?? liveEntity.state ?? widget.status),
                            resolveCoverPositionAttribute(liveEntity.rawAttributes) ?? widget.value,
                            typeof widget.value === 'number' ? widget.value : 70,
                          ) > 0
                      : widget.isOn;
          let value = widget.value;
          let vacuumCleanedArea = widget.vacuumCleanedArea;
          let vacuumCleaningMinutes = widget.vacuumCleaningMinutes;
          let coverTiltPosition = widget.coverTiltPosition;
          if (widget.kind === 'light') {
            value =
              typeof liveEntity.brightness === 'number'
                ? liveEntity.brightness
                : typeof liveEntity.numericValue === 'number'
                  ? liveEntity.numericValue
                  : value;
          } else if (widget.kind === 'switch') {
            statusLabel = normalizeLower(liveEntity.stateLabel ?? liveEntity.state) === 'on' ? 'on' : 'off';
          } else if (widget.kind === 'sensor') {
            value = typeof liveEntity.numericValue === 'number' ? liveEntity.numericValue : undefined;
            statusLabel = resolveSensorMeta(widget, liveEntity, haStatesForUi, locale).status;
          } else if (widget.kind === 'media') {
            statusLabel = translateMediaPlayerState(
              liveEntity.state ?? liveEntity.stateLabel ?? widget.status,
              liveEntity.stateLabel ?? liveEntity.state ?? widget.status,
            );
            value = typeof liveEntity.progress === 'number' ? liveEntity.progress : value;
          } else if (widget.kind === 'climate') {
            value = typeof liveEntity.currentValue === 'number' ? liveEntity.currentValue : value;
          } else if (widget.kind === 'alarm') {
            statusLabel = normalizeAlarmState(liveEntity.stateLabel ?? liveEntity.state ?? widget.status);
          } else if (widget.kind === 'vacuum') {
            statusLabel = normalizeVacuumState(liveEntity.stateLabel ?? liveEntity.state ?? widget.status);
            value =
              toFiniteNumber(liveEntity.rawAttributes?.battery_level) ??
              toFiniteNumber(liveEntity.rawAttributes?.battery) ??
              value;
            vacuumCleanedArea =
              toFiniteNumber(liveEntity.rawAttributes?.cleaned_area) ??
              vacuumCleanedArea;
            vacuumCleaningMinutes =
              toFiniteNumber(liveEntity.rawAttributes?.cleaning_time) ??
              toFiniteNumber(liveEntity.rawAttributes?.clean_time) ??
              vacuumCleaningMinutes;
          } else if (widget.kind === 'cover') {
            statusLabel = normalizeCoverState(liveEntity.stateLabel ?? liveEntity.state ?? widget.status);
            value = resolveCoverPosition(
              statusLabel,
              resolveCoverPositionAttribute(liveEntity.rawAttributes) ?? value,
              typeof value === 'number' ? value : 70,
            );
            coverTiltPosition = resolveCoverTiltPosition(
              resolveCoverTiltAttribute(liveEntity.rawAttributes) ?? coverTiltPosition,
              typeof coverTiltPosition === 'number' ? coverTiltPosition : 50,
            );
          } else if (widget.kind === 'lock') {
            statusLabel = normalizeLockState(liveEntity.stateLabel ?? liveEntity.state ?? widget.status);
          }
          const nextLayout =
            widget.kind === 'light'
              ? resolveLightLayoutForState(widget, isOn)
              : widget.kind === 'switch'
                ? resolveSwitchLayout(widget)
                : widget.kind === 'media'
                ? resolveMediaLayout(widget)
                : widget.kind === 'climate'
                  ? resolveClimateLayout(widget)
                  : widget.kind === 'camera'
                    ? resolveCameraLayout(widget)
                    : widget.kind === 'sensor'
                      ? resolveSensorLayout(widget)
                  : widget.kind === 'alarm'
                    ? resolveAlarmLayout(widget)
                    : widget.kind === 'vacuum'
                      ? resolveVacuumLayout(widget)
                      : widget.kind === 'cover'
                        ? resolveCoverLayout(widget)
                      : widget.kind === 'lock'
                        ? resolveLockLayout(widget)
                        : widget.layout;
          if (
            widget.status === statusLabel &&
            widget.isOn === isOn &&
            widget.value === value &&
            widget.unit === unit &&
            widget.vacuumCleanedArea === vacuumCleanedArea &&
            widget.vacuumCleaningMinutes === vacuumCleaningMinutes &&
            widget.coverTiltPosition === coverTiltPosition &&
            sameLayout(widget.layout, nextLayout)
          ) {
            return widget;
          }
          return {
            ...widget,
            status: statusLabel,
            isOn,
            value,
            unit,
            vacuumCleanedArea,
            vacuumCleaningMinutes,
            coverTiltPosition,
            layout: nextLayout,
          };
        }
        if (
          effectiveRuntimeMode === 'demo' &&
          widget.dataSource === 'mock' &&
          widget.id === 'sensor.nest_wifi_download'
        ) {
          if (widget.value === state.wifiDownloadMbps) {
            return widget;
          }
          return { ...widget, value: state.wifiDownloadMbps };
        }
        if (
          effectiveRuntimeMode === 'demo' &&
          widget.dataSource === 'mock' &&
          widget.id === 'light.living_room_lamp'
        ) {
          const nextLayout = resolveLightLayoutForState(widget, state.lamp.isOn);
          if (
            widget.status === state.lamp.status &&
            widget.isOn === state.lamp.isOn &&
            widget.value === state.lamp.brightness &&
            sameLayout(widget.layout, nextLayout)
          ) {
            return widget;
          }
          return {
            ...widget,
            status: state.lamp.status,
            isOn: state.lamp.isOn,
            value: state.lamp.brightness,
            layout: nextLayout,
          };
        }
        if (
          effectiveRuntimeMode === 'demo' &&
          widget.dataSource === 'mock' &&
          widget.id === 'climate.air_conditioner'
        ) {
          const nextLayout = resolveClimateLayout(widget);
          if (
            widget.status === state.climate.status &&
            widget.isOn === state.climate.isOn &&
            widget.value === state.climate.currentTemp &&
            sameLayout(widget.layout, nextLayout)
          ) {
            return widget;
          }
          return {
            ...widget,
            status: state.climate.status,
            isOn: state.climate.isOn,
            value: state.climate.currentTemp,
            layout: nextLayout,
          };
        }
        if (widget.kind === 'climate') {
          const nextLayout = resolveClimateLayout(widget);
          if (sameLayout(widget.layout, nextLayout)) {
            return widget;
          }
          return {
            ...widget,
            layout: nextLayout,
          };
        }
        if (widget.kind === 'alarm') {
          const nextLayout = resolveAlarmLayout(widget);
          if (sameLayout(widget.layout, nextLayout)) {
            return widget;
          }
          return {
            ...widget,
            layout: nextLayout,
          };
        }
        if (widget.kind === 'camera') {
          const nextLayout = resolveCameraLayout(widget);
          if (sameLayout(widget.layout, nextLayout)) {
            return widget;
          }
          return {
            ...widget,
            layout: nextLayout,
          };
        }
        if (widget.kind === 'sensor') {
          const nextLayout = resolveSensorLayout(widget);
          if (sameLayout(widget.layout, nextLayout)) {
            return widget;
          }
          return {
            ...widget,
            layout: nextLayout,
          };
        }
        if (widget.kind === 'vacuum') {
          const nextLayout = resolveVacuumLayout(widget);
          if (effectiveRuntimeMode !== 'demo' || widget.dataSource !== 'mock') {
            if (sameLayout(widget.layout, nextLayout)) {
              return widget;
            }
            return { ...widget, layout: nextLayout };
          }
          const nextArea =
            typeof widget.vacuumCleanedArea === 'number' && Number.isFinite(widget.vacuumCleanedArea)
              ? widget.vacuumCleanedArea
              : 45;
          const nextMinutes =
            typeof widget.vacuumCleaningMinutes === 'number' && Number.isFinite(widget.vacuumCleaningMinutes)
              ? widget.vacuumCleaningMinutes
              : 32;
          if (
            sameLayout(widget.layout, nextLayout) &&
            widget.vacuumCleanedArea === nextArea &&
            widget.vacuumCleaningMinutes === nextMinutes
          ) {
            return widget;
          }
          return {
            ...widget,
            vacuumCleanedArea: nextArea,
            vacuumCleaningMinutes: nextMinutes,
            layout: nextLayout,
          };
        }
        if (widget.kind === 'cover') {
          const nextLayout = resolveCoverLayout(widget);
          if (effectiveRuntimeMode !== 'demo' || widget.dataSource !== 'mock') {
            if (sameLayout(widget.layout, nextLayout)) {
              return widget;
            }
            return { ...widget, layout: nextLayout };
          }
          const nextPosition = resolveCoverPosition(
            normalizeCoverState(widget.status),
            widget.value,
            70,
          );
          const nextTilt = resolveCoverTiltPosition(widget.coverTiltPosition, 50);
          const nextIsOn = nextPosition > 0;
          if (
            sameLayout(widget.layout, nextLayout) &&
            widget.value === nextPosition &&
            widget.coverTiltPosition === nextTilt &&
            widget.isOn === nextIsOn
          ) {
            return widget;
          }
          return {
            ...widget,
            value: nextPosition,
            coverTiltPosition: nextTilt,
            isOn: nextIsOn,
            layout: nextLayout,
          };
        }
        if (widget.kind === 'lock') {
          const nextLayout = resolveLockLayout(widget);
          if (sameLayout(widget.layout, nextLayout)) {
            return widget;
          }
          return {
            ...widget,
            layout: nextLayout,
          };
        }
        if (widget.kind === 'media') {
          const nextLayout = resolveMediaLayout(widget);
          if (sameLayout(widget.layout, nextLayout)) {
            return widget;
          }
          return {
            ...widget,
            layout: nextLayout,
          };
        }
        return widget;
      });
      const resolved = resolveAutoWidgetLayoutChanges(prev, next);
      const changed =
        resolved.length !== prev.length ||
        resolved.some((widget, index) => {
          const previous = prev[index];
          return (
            !previous ||
            previous.id !== widget.id ||
            previous.parentSectionId !== widget.parentSectionId ||
            !sameLayout(previous.layout, widget.layout) ||
            previous.status !== widget.status ||
            previous.isOn !== widget.isOn ||
            previous.value !== widget.value ||
            previous.unit !== widget.unit ||
            previous.vacuumCleanedArea !== widget.vacuumCleanedArea ||
            previous.vacuumCleaningMinutes !== widget.vacuumCleaningMinutes ||
            previous.coverTiltPosition !== widget.coverTiltPosition
          );
        });
      return changed ? resolved : prev;
    });
  }, [
    haStatesForUi,
    haStatus,
    effectiveRuntimeMode,
    state.wifiDownloadMbps,
    state.lamp.name,
    state.lamp.status,
    state.lamp.isOn,
    state.lamp.brightness,
    state.climate.name,
    state.climate.status,
    state.climate.isOn,
    state.climate.currentTemp,
    sections,
    canvasGridBreakpoint,
  ]);

  useEffect(() => {
    if (!isEditMode) {
      setIsCatalogOpen(false);
      setViewportPreviewMode('auto');
    }
  }, [isEditMode]);

  useEffect(() => {
    if (
      isXsViewport ||
      (!isDesktopViewport && viewportPreviewMode === 'desktop')
    ) {
      setViewportPreviewMode('auto');
    }
  }, [isDesktopViewport, isXsViewport, viewportPreviewMode]);

  useEffect(() => {
    return () => {
      clearTimeoutRegistry(lockPendingTimeoutRef);
      clearTimeoutRegistry(alarmPendingTimeoutRef);
      clearTimeoutArrayRegistry(lockActivityRefreshTimeoutRef);
      clearTimeoutArrayRegistry(alarmActivityRefreshTimeoutRef);
      clearTimeoutRegistry(vacuumReturnToBaseTimeoutRef);
    };
  }, []);

  useEffect(() => {
    if (isHaConnected) {
      return;
    }
    clearTimeoutRegistry(lockPendingTimeoutRef);
    clearTimeoutRegistry(alarmPendingTimeoutRef);
    clearTimeoutArrayRegistry(lockActivityRefreshTimeoutRef);
    clearTimeoutArrayRegistry(alarmActivityRefreshTimeoutRef);
    setLockPendingByEntity({});
    setAlarmPendingByEntity({});
    setLockActivityStatusByEntity({});

    setHaUserNamesById({});
    setHaUsersById({});
    setLockTimelineByEntity({});
    setAlarmTimelineByEntity({});
    setAlarmActivityStatusByEntity({});
  }, [isHaConnected]);

  useEffect(() => {
    if (!isHaConnected) {
      return;
    }
    clearTimeoutRegistry(vacuumReturnToBaseTimeoutRef);
  }, [isHaConnected]);

  useEffect(() => {
    if (!isHaConnected || Object.keys(lockPendingByEntity).length === 0) {
      return;
    }

    const resolvedEntityIds = Object.entries(lockPendingByEntity)
      .filter(([entityId, pending]) => {
        const liveEntity = haStates[entityId];
        if (!liveEntity) {
          return false;
        }

        const liveState = normalizeLockState(
          toTrimmedString(liveEntity.state) ??
            toTrimmedString(liveEntity.stateLabel),
        );
        if (pending.targetState === 'locked') {
          return liveState === 'locked';
        }
        if (pending.targetState === 'open') {
          return liveState === 'open' || liveState === 'unlocked';
        }
        return liveState === 'unlocked' || liveState === 'open';
      })
      .map(([entityId]) => entityId);

    if (!resolvedEntityIds.length) {
      return;
    }

    removePendingEntities(setLockPendingByEntity, resolvedEntityIds);
    resolvedEntityIds.forEach((entityId) => clearTimeoutForEntity(lockPendingTimeoutRef, entityId));
  }, [haStates, isHaConnected, lockPendingByEntity]);

  useEffect(() => {
    if (!isHaConnected || Object.keys(alarmPendingByEntity).length === 0) {
      return;
    }

    const resolvedEntityIds = Object.entries(alarmPendingByEntity)
      .filter(([entityId, pending]) => {
        const liveEntity = haStates[entityId];
        if (!liveEntity) {
          return false;
        }

        const liveState = normalizeAlarmState(
          toTrimmedString(liveEntity.state) ??
            toTrimmedString(liveEntity.stateLabel),
        );
        return liveState === pending.targetState;
      })
      .map(([entityId]) => entityId);

    if (!resolvedEntityIds.length) {
      return;
    }

    removePendingEntities(setAlarmPendingByEntity, resolvedEntityIds);
    resolvedEntityIds.forEach((entityId) => clearTimeoutForEntity(alarmPendingTimeoutRef, entityId));
  }, [alarmPendingByEntity, haStates, isHaConnected]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setWidgets((prev) => {
        let changed = false;
        const next = prev.map((widget) => {
          if (
            widget.kind !== 'vacuum' ||
            effectiveRuntimeMode !== 'demo' ||
            widget.dataSource !== 'mock'
          ) {
            return widget;
          }
          const liveEntity = isHaConnected ? haStates[widget.entityId] : undefined;
          if (liveEntity) {
            return widget;
          }
          const normalizedState = normalizeVacuumState(widget.status);
          const batteryLevel = typeof widget.value === 'number' ? widget.value : 85;
          const cleanedArea =
            typeof widget.vacuumCleanedArea === 'number' && Number.isFinite(widget.vacuumCleanedArea)
              ? widget.vacuumCleanedArea
              : 45;
          const cleaningMinutes =
            typeof widget.vacuumCleaningMinutes === 'number' && Number.isFinite(widget.vacuumCleaningMinutes)
              ? widget.vacuumCleaningMinutes
              : 32;

          let nextBattery = batteryLevel;
          let nextArea = cleanedArea;
          let nextMinutes = cleaningMinutes;

          if (normalizedState === 'cleaning') {
            nextBattery = Math.max(0, batteryLevel - 1);
            nextArea = Math.round((cleanedArea + 0.8) * 10) / 10;
            nextMinutes = Math.round(cleaningMinutes + 1);
          } else if (normalizedState === 'docked') {
            nextBattery = Math.min(100, batteryLevel + 1);
          }

          if (
            nextBattery === batteryLevel &&
            nextArea === cleanedArea &&
            nextMinutes === cleaningMinutes
          ) {
            return widget;
          }

          changed = true;
          return {
            ...widget,
            value: nextBattery,
            vacuumCleanedArea: nextArea,
            vacuumCleaningMinutes: nextMinutes,
          };
        });
        return changed ? next : prev;
      });
    }, VACUUM_DEMO_TICK_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [effectiveRuntimeMode, haStates, isHaConnected]);

  useEffect(() => {
    if (!isEditMode) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const isRefreshKey =
        event.key === 'F5' ||
        ((event.ctrlKey || event.metaKey) && (key === 'r' || key === 'f5'));
      if (isRefreshKey) {
        event.preventDefault();
        setEditConfirm('refresh');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isEditMode]);

  useEffect(() => {
    if (!isEditMode || !hasUnsavedDashboardEdits) {
      return;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (allowDashboardUnloadRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedDashboardEdits, isEditMode]);

  useEffect(() => {
    if (!isEditMode || !hasUnsavedDashboardEdits || !editSessionRouteRef.current) return;
    const currentRoute = canUseBrowserRouteNavigation
      ? `${routerLocation.pathname}${routerLocation.search}${routerLocation.hash}`
      : internalNavigationRoute;
    if (currentRoute === editSessionRouteRef.current) return;
    if (canUseBrowserRouteNavigation) {
      navigate(editSessionRouteRef.current, { replace: true });
    } else {
      setInternalNavigationRoute(editSessionRouteRef.current);
    }
    setEditConfirm('exit');
  }, [
    canUseBrowserRouteNavigation,
    hasUnsavedDashboardEdits,
    internalNavigationRoute,
    isEditMode,
    routerLocation.hash,
    routerLocation.pathname,
    routerLocation.search,
    navigate,
  ]);

  useEffect(() => {
    if (selectedWidgetId && !widgets.some((widget) => widget.id === selectedWidgetId)) {
      setSelectedWidgetId(null);
    }
  }, [selectedWidgetId, widgets]);

  useEffect(() => {
    if (selectedSectionId && !sections.some((section) => section.id === selectedSectionId)) {
      setSelectedSectionId(null);
    }
  }, [selectedSectionId, sections]);

  useEffect(() => {
    if (
      selectedSidebarPathId &&
      !visibleSidebarPaths.some((entry) => entry.id === selectedSidebarPathId)
    ) {
      setSelectedSidebarPathId(null);
    }
  }, [selectedSidebarPathId, visibleSidebarPaths]);

  useEffect(() => {
    const currentRoute = canUseBrowserRouteNavigation
      ? `${routerLocation.pathname}${routerLocation.search}${routerLocation.hash}`
      : internalNavigationRoute;
    const nextIsConsumption = isConsumptionNavigationTarget(currentRoute);
    const nextIsConsumptionDetail = nextIsConsumption && isConsumptionDetailNavigationTarget(currentRoute);
    const nextIsAutomation = isAutomationNavigationTarget(currentRoute);
    const nextIsAppGallery = isAppGalleryNavigationTarget(currentRoute);
    const nextIsRooms = isRoomsNavigationTarget(currentRoute);
    const nextIsSecurity = isSecurityNavigationTarget(currentRoute);
    const nextIsSecurityCameras = isSecurityCamerasNavigationTarget(currentRoute);
    const nextIsProfile = isProfileNavigationTarget(currentRoute);
    const nextIsSettings = isSettingsNavigationTarget(currentRoute);
    const nextIsKnownRoute =
      isHomeNavigationTarget(currentRoute) ||
      nextIsConsumption ||
      nextIsAutomation ||
      nextIsAppGallery ||
      nextIsRooms ||
      nextIsSecurity ||
      nextIsProfile ||
      nextIsSettings;
    const nextEditAvailability =
      isHomeNavigationTarget(currentRoute) ||
      nextIsConsumption ||
      nextIsAppGallery ||
      nextIsSecurity ||
      (!canUseBrowserRouteNavigation && !nextIsKnownRoute);
    setIsConsumptionView(nextIsConsumption);
    setIsConsumptionDetailView(nextIsConsumptionDetail);
    setIsAutomationView(nextIsAutomation);
    setIsAppGalleryView(nextIsAppGallery);
    setIsRoomsView(nextIsRooms);
    setIsSecurityView(nextIsSecurity);
    setIsSecurityCamerasView(nextIsSecurityCameras);
    setIsSettingsView(nextIsSettings);
    setIsProfileOpen(nextIsProfile);
    if (nextIsProfile) {
      setProfileInitialSection((currentSection) => {
        if (currentSection === 'movements' || currentSection === 'members' || currentSection === 'security') {
          return currentSection;
        }
        return 'members';
      });
    }
    setIsEditAvailableForRoute(nextEditAvailability);
  }, [
    canUseBrowserRouteNavigation,
    internalNavigationRoute,
    routerLocation.hash,
    routerLocation.pathname,
    routerLocation.search,
  ]);

  useEffect(() => {
    if (isEditAvailableForRoute) {
      return;
    }
    setEditConfirm(null);
    if (isEditMode) {
      setIsEditMode(false);
    }
    if (isCatalogOpen) {
      setIsCatalogOpen(false);
    }
  }, [isCatalogOpen, isEditAvailableForRoute, isEditMode]);

  useEffect(() => {
    if (dashboardSecurity.can('edit_dashboard')) {
      return;
    }
    setEditConfirm(null);
    setIsCatalogOpen(false);
    setSelectedWidgetId(null);
    setSelectedSectionId(null);
    setSelectedSidebarPathId(null);
    if (isEditMode) {
      setIsEditMode(false);
      addNotification(
        'alert',
        dashboardSecurity.identityStatus === 'resolving'
          ? t('home.edit.identityResolving')
          : 'Sessione di modifica chiusa: servono i permessi Owner o Admin.',
      );
    }
  }, [addNotification, dashboardSecurity, isEditMode]);

  useEffect(() => {
    if (!isConsumptionView) {
      setSelectedConsumptionCardId(null);
      return;
    }
    if (isEditMode && isCompactViewport) {
      return;
    }
    if (!selectedConsumptionCardId) {
      setSelectedConsumptionCardId('electricity');
    }
  }, [isCompactViewport, isConsumptionView, isEditMode, selectedConsumptionCardId]);

  useEffect(() => {
    if (isConsumptionView && isEditMode && isCompactViewport) {
      setSelectedConsumptionCardId(null);
    }
  }, [isCompactViewport, isConsumptionView, isEditMode]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.get(HA_OAUTH_CALLBACK_PARAM) !== '1') {
      return;
    }

    const oauthError = currentUrl.searchParams.get('error');
    const oauthErrorDescription = currentUrl.searchParams.get('error_description');
    const oauthCode = currentUrl.searchParams.get('code');
    const receivedState = currentUrl.searchParams.get('state');
    const expectedState = window.sessionStorage.getItem(HA_OAUTH_SESSION_STATE_KEY);
    const stateValidation = validateHaOAuthCallbackState(receivedState, expectedState);
    const oauthState = stateValidation.ok ? stateValidation.payload : null;
    const returnPath = resolveOAuthReturnPath(oauthState?.returnTo);
    const cleanupUrl = () => {
      if (canUseBrowserRouteNavigation) {
        window.history.replaceState({}, '', returnPath);
        return;
      }
      currentUrl.searchParams.delete(HA_OAUTH_CALLBACK_PARAM);
      currentUrl.searchParams.delete('error');
      currentUrl.searchParams.delete('error_description');
      currentUrl.searchParams.delete('code');
      currentUrl.searchParams.delete('state');
      window.history.replaceState({}, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
    };

    if (!stateValidation.ok) {
      window.sessionStorage.removeItem(HA_OAUTH_SESSION_STATE_KEY);
      setOAuthFlowError(t('home.oauth.invalid'));
      cleanupUrl();
      return;
    }

    if (oauthError) {
      window.sessionStorage.removeItem(HA_OAUTH_SESSION_STATE_KEY);
      setOAuthFlowError(
        oauthErrorDescription?.trim() || `Autorizzazione Home Assistant interrotta: ${oauthError}.`,
      );
      cleanupUrl();
      return;
    }

    if (!oauthCode || !oauthState) {
      window.sessionStorage.removeItem(HA_OAUTH_SESSION_STATE_KEY);
      setOAuthFlowError('Risposta OAuth Home Assistant non valida.');
      cleanupUrl();
      return;
    }

    let cancelled = false;

    const runOAuthExchange = async () => {
      setIsOAuthFlowBusy(true);
      try {
        const exchangePromise =
          oauthExchangePromiseRef.current ??
          exchangeHaOAuthCode({
            hassUrl: oauthState.hassUrl,
            clientId: window.location.origin,
            code: oauthCode,
          });
        oauthExchangePromiseRef.current = exchangePromise;
        const oauthTokens = await exchangePromise;
        if (cancelled) {
          return;
        }
        window.sessionStorage.removeItem(HA_OAUTH_SESSION_STATE_KEY);
        persistHaOAuthSession({
          hassUrl: oauthState.hassUrl,
          clientId: window.location.origin,
          tokens: oauthTokens,
        });
        persistDashboardRuntimeMode('real', window.localStorage);
        setOAuthFlowError(null);
        cleanupUrl();
        window.location.reload();
      } catch (error) {
        if (!cancelled) {
          window.sessionStorage.removeItem(HA_OAUTH_SESSION_STATE_KEY);
          setOAuthFlowError(error instanceof Error ? error.message : 'Autenticazione OAuth fallita.');
        }
      } finally {
        if (!cancelled) {
          oauthExchangePromiseRef.current = null;
          setIsOAuthFlowBusy(false);
          cleanupUrl();
        }
      }
    };

    void runOAuthExchange();

    return () => {
      cancelled = true;
    };
  }, [canUseBrowserRouteNavigation]);

  useEffect(() => {
    if (runtimeMode !== 'real') {
      return;
    }
    if (haStatus !== 'disconnected') {
      return;
    }
    if (haToken.trim().length > 0) {
      return;
    }

    let cancelled = false;
    const tryOAuthAutoReconnect = async () => {
      const storedTokens = await loadHassAuthTokensFromStorage();
      if (!storedTokens) {
        return;
      }
      if (cancelled) {
        return;
      }
      const storedHassUrl = normalizeHassUrl(storedTokens.hassUrl);
      if (!storedHassUrl) {
        return;
      }
      setPendingStoredOAuthReconnectUrl(storedHassUrl);
      if (storedHassUrl !== normalizeHassUrl(haUrl)) {
        setHaUrl(storedHassUrl);
      }
    };

    void tryOAuthAutoReconnect();

    return () => {
      cancelled = true;
    };
  }, [haStatus, haToken, haUrl, runtimeMode, setHaUrl]);

  useEffect(() => {
    if (runtimeMode !== 'real') {
      return;
    }
    if (!pendingStoredOAuthReconnectUrl) {
      return;
    }
    if (haStatus !== 'disconnected') {
      return;
    }
    if (haToken.trim().length > 0) {
      setPendingStoredOAuthReconnectUrl(null);
      return;
    }
    if (normalizeHassUrl(haUrl) !== pendingStoredOAuthReconnectUrl) {
      return;
    }
    connectHa();
    setPendingStoredOAuthReconnectUrl(null);
  }, [connectHa, haStatus, haToken, haUrl, pendingStoredOAuthReconnectUrl, runtimeMode]);

  const canPersistDashboardLayout = isEditMode && dashboardSecurity.can('edit_dashboard');
  const localDashboardLayoutPersistence = useDashboardLayoutPersistence({
    // Edit Mode is transactional: keep the draft in memory and write once on exit.
    enabled: false,
    runtimeMode,
    sections,
    widgets,
    widgetTypeLayoutOverrides,
    responsiveLayouts,
    widgetLayoutOverrides,
  });
  const authoritativeDashboardLayout = useMemo(() => ({
    storageVersion: DASHBOARD_LAYOUT_STORAGE_VERSION,
    sections,
    widgets,
    widgetTypeLayoutOverrides,
    responsiveLayouts,
    widgetLayoutOverrides,
  }), [responsiveLayouts, sections, widgetLayoutOverrides, widgetTypeLayoutOverrides, widgets]);
  const hydrateAuthoritativeDashboardLayout = useCallback((layout: typeof authoritativeDashboardLayout) => {
    setSections(layout.sections);
    const widgetsWithSecrets = typeof window === 'undefined'
      ? layout.widgets
      : mergeWidgetSecretsIntoWidgets(layout.widgets, window.localStorage);
    setWidgets(normalizeWidgetsForRuntime(widgetsWithSecrets, effectiveRuntimeMode));
    setWidgetTypeLayoutOverrides(layout.widgetTypeLayoutOverrides);
    setActiveWidgetTypeLayoutOverrides(layout.widgetTypeLayoutOverrides);
    setResponsiveLayouts(layout.responsiveLayouts);
    setWidgetLayoutOverrides(layout.widgetLayoutOverrides);
  }, [effectiveRuntimeMode]);
  const handleAuthoritativeDashboardReset = useCallback((marker: DashboardResetMarker) => {
    if (typeof window === 'undefined') return;
    invalidateLocalDashboardAfterAuthoritativeReset(
      window.localStorage,
      window.sessionStorage,
      marker,
    );
    window.location.reload();
  }, []);
  const haDashboardLayoutPersistence = useHaDashboardLayoutPersistence({
    active: effectiveRuntimeMode === 'real',
    autoSaveEnabled: false,
    deferRemoteUpdates: isEditMode,
    isConnected: effectiveRuntimeMode === 'real' && isHaConnected,
    canManage: dashboardSecurity.can('edit_dashboard'),
    userId: haCurrentUser?.id ?? null,
    callApi: callHaApi,
    dashboard: authoritativeDashboardLayout,
    onHydrate: hydrateAuthoritativeDashboardLayout,
    onAuthoritativeReset: handleAuthoritativeDashboardReset,
  });
  const lastNotifiedRemoteRevisionRef = useRef<number | null>(null);
  const lastAnnouncedAppliedRevisionRef = useRef<number | null>(null);
  const visibleRemoteConflictRevisionRef = useRef<number | null>(null);

  useEffect(() => {
    const pendingRevision = haDashboardLayoutPersistence.pendingRemoteUpdate?.revision ?? null;
    if (pendingRevision === null || lastNotifiedRemoteRevisionRef.current === pendingRevision) return;
    lastNotifiedRemoteRevisionRef.current = pendingRevision;
    addNotification(
      'warning',
      t('home.remote.draftProtected', { revision: pendingRevision }),
    );
  }, [addNotification, haDashboardLayoutPersistence.pendingRemoteUpdate?.revision]);

  useEffect(() => {
    const pendingRevision = haDashboardLayoutPersistence.pendingRemoteUpdate?.revision ?? null;
    if (pendingRevision !== null) {
      visibleRemoteConflictRevisionRef.current = pendingRevision;
      return;
    }
    if (visibleRemoteConflictRevisionRef.current !== null) {
      visibleRemoteConflictRevisionRef.current = null;
      setIsDashboardConflictOpen(false);
    }
  }, [haDashboardLayoutPersistence.pendingRemoteUpdate?.revision]);

  useEffect(() => {
    const appliedRevision = haDashboardLayoutPersistence.lastAppliedRemoteRevision;
    if (appliedRevision === null || lastAnnouncedAppliedRevisionRef.current === appliedRevision) return;
    lastAnnouncedAppliedRevisionRef.current = appliedRevision;
    addNotification('info', `Dashboard aggiornata alla versione ${appliedRevision}.`);
  }, [addNotification, haDashboardLayoutPersistence.lastAppliedRemoteRevision]);
  const persistedDashboardLayoutSaveStatus = effectiveRuntimeMode === 'demo'
    ? localDashboardLayoutPersistence.status
    : haDashboardLayoutPersistence.status;
  const dashboardLayoutSaveStatus = persistedDashboardLayoutSaveStatus.phase === 'saving'
    ? persistedDashboardLayoutSaveStatus
    : isEditMode && hasUnsavedDashboardEdits
      ? { phase: 'dirty' as const }
      : persistedDashboardLayoutSaveStatus;
  const requiresDashboardLayoutMigration =
    effectiveRuntimeMode === 'real' &&
    haDashboardLayoutPersistence.loadStatus === 'migration_required';
  const saveDashboardLayoutNow = useCallback(async () => (
    effectiveRuntimeMode === 'demo'
      ? localDashboardLayoutPersistence.saveNow()
      : haDashboardLayoutPersistence.saveNow()
  ), [effectiveRuntimeMode, haDashboardLayoutPersistence.saveNow, localDashboardLayoutPersistence.saveNow]);
  const [dashboardEditorLayoutRevision, setDashboardEditorLayoutRevision] = useState(0);
  const dashboardEditorSnapshot = useMemo<DashboardEditorSnapshot>(() => ({
    sections,
    widgets,
    widgetTypeLayoutOverrides,
    responsiveLayouts,
    widgetLayoutOverrides,
  }), [responsiveLayouts, sections, widgetLayoutOverrides, widgetTypeLayoutOverrides, widgets]);
  const applyDashboardEditorSnapshot = useCallback((snapshot: typeof dashboardEditorSnapshot) => {
    setSections(snapshot.sections);
    setWidgets((currentWidgets) => {
      const currentById = new Map(currentWidgets.map((widget) => [widget.id, widget]));
      return snapshot.widgets.map((snapshotWidget) => {
        const currentWidget = currentById.get(snapshotWidget.id);
        if (!currentWidget || currentWidget.entityId !== snapshotWidget.entityId) {
          return snapshotWidget;
        }
        return {
          ...snapshotWidget,
          status: currentWidget.status,
          isOn: currentWidget.isOn,
          value: currentWidget.value,
          unit: currentWidget.unit,
          vacuumCleanedArea: currentWidget.vacuumCleanedArea,
          vacuumCleaningMinutes: currentWidget.vacuumCleaningMinutes,
          coverTiltPosition: currentWidget.coverTiltPosition,
        };
      });
    });
    setWidgetTypeLayoutOverrides(snapshot.widgetTypeLayoutOverrides);
    setResponsiveLayouts(snapshot.responsiveLayouts);
    setWidgetLayoutOverrides(snapshot.widgetLayoutOverrides);
    setActiveWidgetTypeLayoutOverrides(snapshot.widgetTypeLayoutOverrides);
    setDashboardEditorLayoutRevision((current) => current + 1);
    setSelectedWidgetId((current) =>
      current && snapshot.widgets.some((widget) => widget.id === current) ? current : null,
    );
    setSelectedSectionId((current) =>
      current && snapshot.sections.some((section) => section.id === current) ? current : null,
    );
  }, []);
  const {
    beginMutation: beginDashboardEditorHistoryMutation,
    undo: undoDashboardEdit,
    redo: redoDashboardEdit,
    canUndo: canUndoDashboardEdit,
    canRedo: canRedoDashboardEdit,
  } = useDashboardEditorHistory({
    enabled: canPersistDashboardLayout,
    current: dashboardEditorSnapshot,
    onApply: applyDashboardEditorSnapshot,
  });
  const beginDashboardEditorMutation = useCallback(() => {
    beginDashboardEditorHistoryMutation();
  }, [beginDashboardEditorHistoryMutation]);

  useEffect(() => {
    const baseline = editSessionBaselineRef.current;
    if (!isEditMode || !baseline) {
      if (!isEditMode) setHasUnsavedDashboardEdits(false);
      return;
    }
    setHasUnsavedDashboardEdits(
      fingerprintDashboardEditorSnapshot(dashboardEditorSnapshot) !==
        fingerprintDashboardEditorSnapshot(baseline),
    );
  }, [dashboardEditorSnapshot, isEditMode]);

  useEffect(() => {
    if (typeof window === 'undefined' || !isEditMode) return;
    if (!hasUnsavedDashboardEdits) {
      discardDashboardEditDraft(window.sessionStorage, effectiveRuntimeMode);
      return;
    }
    const timeoutId = window.setTimeout(() => {
      try {
        saveDashboardEditDraft(window.sessionStorage, {
          runtimeMode: effectiveRuntimeMode,
          createdAt: editSessionCreatedAtRef.current ?? Date.now(),
          baseRevision: haDashboardLayoutPersistence.serverRevision,
          dashboard: authoritativeDashboardLayout,
        });
      } catch {
        // A recovery draft is best-effort and never changes save authority.
      }
    }, 450);
    return () => window.clearTimeout(timeoutId);
  }, [
    authoritativeDashboardLayout,
    effectiveRuntimeMode,
    haDashboardLayoutPersistence.serverRevision,
    hasUnsavedDashboardEdits,
    isEditMode,
  ]);
  const previousEditModeRef = useRef(isEditMode);

  useEffect(() => {
    const wasEditing = previousEditModeRef.current;
    previousEditModeRef.current = isEditMode;
    if (!wasEditing || isEditMode || typeof window === 'undefined') {
      return;
    }
    discardDashboardRecoverySnapshot(effectiveRuntimeMode, window.localStorage);
  }, [effectiveRuntimeMode, isEditMode]);

  useEffect(() => {
    setWidgets((prev) => {
      let changed = false;
      const next = prev.map((widget) => {
        const parentId = widget.parentSectionId;
        const section = parentId ? sections.find((entry) => entry.id === parentId) : undefined;
        if (!section || !isStackSection(section)) {
          return widget;
        }
        const normalized = resolveWidgetLayoutByKind(
          widget,
          normalizeLayoutForStack(section, widget.layout),
        );
        if (
          normalized.x !== widget.layout.x ||
          normalized.y !== widget.layout.y ||
          normalized.w !== widget.layout.w ||
          normalized.h !== widget.layout.h
        ) {
          changed = true;
          return {
            ...widget,
            layout: normalized,
          };
        }
        return widget;
      });
      return changed ? next : prev;
    });
  }, [sections]);

  const updateWidget = (id: string, updater: (widget: Widget) => Widget) => {
    beginDashboardEditorMutation();
    setWidgets((prev) => prev.map((widget) => (widget.id === id ? updater(widget) : widget)));
  };

  const updateWidgetTypeLayoutOverride = (
    kind: WidgetKind,
    breakpoint: DashboardGridBreakpoint,
    nextOverride: WidgetTypeBreakpointLayoutOverride | null,
  ) => {
    beginDashboardEditorMutation();
    setWidgetTypeLayoutOverrides((prev) => {
      const next: WidgetTypeLayoutOverrides = { ...prev };
      const currentByBreakpoint = { ...(next[kind] ?? {}) };
      if (nextOverride) {
        currentByBreakpoint[breakpoint] = nextOverride;
      } else {
        delete currentByBreakpoint[breakpoint];
      }
      if (Object.keys(currentByBreakpoint).length === 0) {
        delete next[kind];
      } else {
        next[kind] = currentByBreakpoint;
      }
      return normalizeWidgetTypeLayoutOverrides(next);
    });
  };

  const updateWidgetLayoutOverride = (
    widgetId: string,
    breakpoint: DashboardGridBreakpoint,
    nextOverride: WidgetTypeBreakpointLayoutOverride | null,
  ) => {
    beginDashboardEditorMutation();
    setWidgetLayoutOverrides((prev) => {
      const next: WidgetLayoutOverrides = { ...prev };
      const currentByBreakpoint = { ...(next[widgetId] ?? {}) };
      if (nextOverride) {
        currentByBreakpoint[breakpoint] = nextOverride;
      } else {
        delete currentByBreakpoint[breakpoint];
      }
      if (Object.keys(currentByBreakpoint).length === 0) {
        delete next[widgetId];
      } else {
        next[widgetId] = currentByBreakpoint;
      }
      return next;
    });
  };

  const updateRootResponsiveLayout = (
    breakpoint: DashboardGridBreakpoint,
    nextLayout: GridItem[],
  ) => {
    beginDashboardEditorMutation();
    const normalized = nextLayout.map((item) => normalizeRootLayout(item));
    setResponsiveLayouts((prev) => ({
      ...prev,
      root: {
        ...(prev.root ?? {}),
        [breakpoint]: normalized,
      },
    }));
  };

  const updateStackResponsiveLayout = (
    sectionId: string,
    breakpoint: DashboardGridBreakpoint,
    nextLayout: GridItem[],
  ) => {
    beginDashboardEditorMutation();
    const section = sections.find((entry) => entry.id === sectionId);
    const normalized = nextLayout.map((item) =>
      section && isStackSection(section)
        ? normalizeLayoutForStack(section, item)
        : {
            i: item.i,
            x: Math.max(0, Math.round(item.x)),
            y: Math.max(0, Math.round(item.y)),
            w: Math.max(1, Math.round(item.w)),
            h: Math.max(1, Math.round(item.h)),
          },
    );
    setResponsiveLayouts((prev) => ({
      ...prev,
      stacks: {
        ...(prev.stacks ?? {}),
        [sectionId]: {
          ...(prev.stacks?.[sectionId] ?? {}),
          [breakpoint]: normalized,
        },
      },
    }));
  };

  const updateWidgetWithAutoLayout = (id: string, updater: (widget: Widget) => Widget) => {
    beginDashboardEditorMutation();
    setWidgets((prev) => {
      const next = prev.map((widget) => (widget.id === id ? updater(widget) : widget));
      const resolved = resolveAutoWidgetLayoutChanges(prev, next);
      const changed =
        resolved.length !== prev.length ||
        resolved.some((widget, index) => {
          const previous = prev[index];
          return (
            !previous ||
            previous.id !== widget.id ||
            previous.parentSectionId !== widget.parentSectionId ||
            !sameLayout(previous.layout, widget.layout) ||
            previous.status !== widget.status ||
            previous.isOn !== widget.isOn ||
            previous.value !== widget.value ||
            previous.unit !== widget.unit
          );
        });
      return changed ? resolved : prev;
    });
  };

  const updateSection = (id: string, updater: (section: DashboardSection) => DashboardSection) => {
    beginDashboardEditorMutation();
    setSections((prev) =>
      prev.map((section) => {
        if (section.id !== id) {
          return section;
        }

        const previousWeatherLayout =
          section.kind === 'weather' || (section.kind === 'greeting' && (section.showWeather ?? false))
            ? section.weatherLayout ?? 'auto'
            : 'auto';
        let nextSection = updater(section);
        if (nextSection.kind === 'stack-grid' && (nextSection.stackUseFavoritesGrid ?? false)) {
          nextSection = {
            ...nextSection,
            title: FAVORITES_GRID_TITLE,
          };
        }

        if (
          nextSection.kind === 'weather' ||
          (nextSection.kind === 'greeting' && (nextSection.showWeather ?? false))
        ) {
          if (nextSection.kind === 'greeting' && (nextSection.showWeather ?? false)) {
            nextSection = {
              ...nextSection,
              weatherLayout: 'auto',
            };
          }
          const nextWeatherLayout = nextSection.weatherLayout ?? 'auto';
          if (nextWeatherLayout !== previousWeatherLayout) {
            if (nextWeatherLayout === 'chip' && nextSection.kind === 'weather') {
              nextSection = {
                ...nextSection,
                layout: {
                  ...nextSection.layout,
                  w: WEATHER_SECTION_CHIP_COLS,
                  h: WEATHER_SECTION_CHIP_ROWS,
                },
              };
            } else if (nextWeatherLayout === 'card') {
              nextSection = {
                ...nextSection,
                layout: {
                  ...nextSection.layout,
                  h: WEATHER_SECTION_CARD_ROWS,
                },
              };
              if (nextSection.kind === 'weather') {
                nextSection = {
                  ...nextSection,
                  layout: {
                    ...nextSection.layout,
                    w: WEATHER_SECTION_CARD_COLS,
                  },
                };
              }
            }
          }
        }

        return {
          ...nextSection,
          layout: normalizeSectionRootLayout(nextSection, nextSection.layout),
        };
      }),
    );
  };
  const handleWidgetLayoutChange = (sectionId: string, nextLayout: GridItem[]) => {
    beginDashboardEditorMutation();
    const nextLayoutMap = new Map(nextLayout.map((item) => [item.i, item]));
    const section = sections.find((entry) => entry.id === sectionId);

    setWidgets((prev) => {
      const expandedAnchorIds = new Set<string>();
      const next = prev.map((widget) => {
        const parentId = widget.parentSectionId;
        if (parentId !== sectionId) {
          return widget;
        }

        const nextItem = nextLayoutMap.get(widget.id);
        if (!nextItem) {
          return widget;
        }

        const normalizedLayout =
          section && isStackSection(section)
            ? normalizeLayoutForStack(section, {
                i: widget.id,
                x: nextItem.x,
                y: nextItem.y,
                w: nextItem.w,
                h: nextItem.h,
              })
            : {
                i: widget.id,
                x: Math.max(0, Math.round(nextItem.x)),
                y: Math.max(0, Math.round(nextItem.y)),
                w: Math.max(1, Math.round(nextItem.w)),
                h: Math.max(1, Math.round(nextItem.h)),
              };
        const constrainedLayout = resolveWidgetLayoutByKind(widget, normalizedLayout);
        if (layoutExpandsFootprint(widget.layout, constrainedLayout)) {
          expandedAnchorIds.add(widget.id);
        }

        const sameLayout =
          widget.layout.x === constrainedLayout.x &&
          widget.layout.y === constrainedLayout.y &&
          widget.layout.w === constrainedLayout.w &&
          widget.layout.h === constrainedLayout.h;
        const sameParent = widget.parentSectionId === sectionId;

        if (sameLayout && sameParent) {
          return widget;
        }

        return {
          ...widget,
          parentSectionId: sectionId,
          layout: constrainedLayout,
        };
      });
      const resolved =
        section && isStackSection(section)
          ? expandedAnchorIds.size > 0
            ? Array.from(expandedAnchorIds).reduce(
                (current, anchorId) => pushStackSectionLayoutDown(section, current, anchorId),
                next,
              )
            : compactStackSectionLayout(section, next)
          : next;
      const changed =
        resolved.length !== prev.length ||
        resolved.some((widget, index) => {
          const previous = prev[index];
          return (
            !previous ||
            previous.id !== widget.id ||
            previous.parentSectionId !== widget.parentSectionId ||
            !sameLayout(previous.layout, widget.layout)
          );
        });

      return changed ? resolved : prev;
    });
  };

  const handleSectionsLayoutChange = (nextLayout: GridItem[]) => {
    beginDashboardEditorMutation();
    const nextLayoutMap = new Map(nextLayout.map((item) => [item.i, item]));
    const expandedAnchorIds = new Set<string>();
    const nextSections = sections.map((section) => {
      const nextItem = nextLayoutMap.get(section.id);
      if (!nextItem) {
        return section;
      }
      const normalizedLayout = normalizeSectionRootLayout(section, {
        i: section.id,
        x: nextItem.x,
        y: nextItem.y,
        w: nextItem.w,
        h: nextItem.h,
      });
      if (layoutExpandsFootprint(section.layout, normalizedLayout)) {
        expandedAnchorIds.add(section.id);
      }
      return sameLayout(section.layout, normalizedLayout)
        ? section
        : {
            ...section,
            layout: normalizedLayout,
          };
    });
    const nextWidgets = widgets.map((widget) => {
      if (widget.parentSectionId) {
        return widget;
      }
      const nextItem = nextLayoutMap.get(widget.id);
      if (!nextItem) {
        return widget;
      }
      const normalizedLayout = normalizeRootLayout({
        i: widget.id,
        x: nextItem.x,
        y: nextItem.y,
        w: nextItem.w,
        h: nextItem.h,
      });
      const constrainedLayout = resolveWidgetLayoutByKind(widget, normalizedLayout);
      if (layoutExpandsFootprint(widget.layout, constrainedLayout)) {
        expandedAnchorIds.add(widget.id);
      }
      return sameLayout(widget.layout, constrainedLayout)
        ? widget
        : {
            ...widget,
            layout: constrainedLayout,
          };
    });
    if (expandedAnchorIds.size > 0) {
      const pushed = Array.from(expandedAnchorIds).reduce(
        (current, anchorId) => pushRootCanvasLayoutDown(current.sections, current.widgets, anchorId),
        { sections: nextSections, widgets: nextWidgets },
      );
      setSections(pushed.sections);
      setWidgets(pushed.widgets);
      return;
    }
    const compacted = compactRootCanvasLayout(nextSections, nextWidgets);
    setSections(compacted.sections);
    setWidgets(compacted.widgets);
  };

  const resolveAutoWidgetLayoutChanges = (previousWidgets: Widget[], nextWidgets: Widget[]): Widget[] => {
    let resolvedSections = sections;
    let resolvedWidgets = nextWidgets;
    let sectionsChanged = false;
    const previousWidgetMap = new Map(previousWidgets.map((widget) => [widget.id, widget]));

    nextWidgets.forEach((nextWidget) => {
      if (nextWidget.kind !== 'light') {
        return;
      }

      const previousWidget = previousWidgetMap.get(nextWidget.id);
      if (!previousWidget || sameLayout(previousWidget.layout, nextWidget.layout)) {
        return;
      }

      const expandsFootprint =
        nextWidget.layout.w > previousWidget.layout.w ||
        nextWidget.layout.h > previousWidget.layout.h ||
        nextWidget.layout.x + nextWidget.layout.w > previousWidget.layout.x + previousWidget.layout.w ||
        nextWidget.layout.y + nextWidget.layout.h > previousWidget.layout.y + previousWidget.layout.h;

      if (nextWidget.parentSectionId) {
        const section = resolvedSections.find((entry) => entry.id === nextWidget.parentSectionId);
        if (!section || !isStackSection(section)) {
          return;
        }
        resolvedWidgets = expandsFootprint
          ? pushStackSectionLayoutDown(
              section,
              resolvedWidgets,
              nextWidget.id,
              nextWidget.kind === 'light',
            )
          : compactStackSectionLayout(section, resolvedWidgets);
        return;
      }

      const resolved = expandsFootprint
        ? pushRootCanvasLayoutDown(resolvedSections, resolvedWidgets, nextWidget.id)
        : compactRootCanvasLayout(resolvedSections, resolvedWidgets);
      sectionsChanged =
        sectionsChanged ||
        resolved.sections.length !== resolvedSections.length ||
        resolved.sections.some((section, index) => {
          const previous = resolvedSections[index];
          return !previous || previous.id !== section.id || !sameLayout(previous.layout, section.layout);
        });
      resolvedSections = resolved.sections;
      resolvedWidgets = resolved.widgets;
    });

    if (sectionsChanged) {
      setSections(resolvedSections);
    }

    return resolvedWidgets;
  };

  const {
    toggleLightEntity,
    toggleSwitchEntity,
    setLightBrightness,
    handleWidgetBrightnessChange,
    setLightColorTemp,
    setLightHsColor,
    setLightWhite,
    setLightEffect,
    flashLight,
  } = useLightSwitchCommands({
    activeWidget,
    isEditMode,
    isHaConnected,
    haStatesForUi,
    commandCoordinator,
    pending: {
      setLightTogglePending,
      setLightPowerPendingIfChanged,
      setLightBrightnessPending,
      setLightColorPending,
      setSwitchTogglePending,
      clearLightTogglePending,
      clearSwitchTogglePending,
      clearLightCommandPending,
    },
    callHaService,
    addNotification,
    actions,
    updateWidgetWithAutoLayout,
    setWidgets,
    setActiveDevice,
    resolveLightLayoutForState,
    resolveSwitchLayout,
    resolveAutoWidgetLayoutChanges,
    sameLayout,
  });

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

  const resolvePreferredHvacMode = (entity?: { hvacModes?: string[]; hvacMode?: string; state?: string }) => {
    const modes = entity?.hvacModes ?? [];
    const preferredOrder = ['cool', 'auto', 'heat', 'heat_cool', 'fan_only', 'dry'];
    const preferred = preferredOrder.find((mode) => modes.includes(mode));
    if (preferred) {
      return preferred;
    }
    if (entity?.hvacMode && entity.hvacMode !== 'off') {
      return entity.hvacMode;
    }
    if (entity?.state && entity.state !== 'off') {
      return entity.state;
    }
    return modes[0] ?? 'cool';
  };

  const setLockPending = (entityId: string, action: LockPendingAction) => {
    const expiresAt = Date.now() + LOCK_PENDING_TTL_MS;
    const targetState = resolveLockPendingTargetState(action);
    setEntityPendingWithExpiry(
      entityId,
      { action, targetState, expiresAt },
      LOCK_PENDING_TTL_MS,
      lockPendingTimeoutRef,
      setLockPendingByEntity,
    );
  };

  const setAlarmPending = (entityId: string, service: AlarmServiceName) => {
    const expiresAt = Date.now() + ALARM_PENDING_TTL_MS;
    const pendingState = resolveAlarmPendingState(service);
    setEntityPendingWithExpiry(
      entityId,
      { service, ...pendingState, expiresAt },
      ALARM_PENDING_TTL_MS,
      alarmPendingTimeoutRef,
      setAlarmPendingByEntity,
    );
  };

  const reportUnconfirmedCommand = (reason: DeviceCommandRollbackReason, message: string) => {
    if (reason === 'superseded' || reason === 'cancelled' || reason === 'connection_lost') return;
    addNotification('alert', message);
  };

  const updateLivingRoomClimateMock = (
    patch: Partial<MockEntityState>,
    rawPatch: Record<string, unknown> = {},
  ) => {
    setLivingRoomClimateMock((current) => ({
      ...current,
      ...patch,
      rawAttributes: {
        ...(current.rawAttributes ?? {}),
        ...rawPatch,
      },
    }));
  };

  const isLivingRoomClimateMock = (widget: Widget | undefined) =>
    effectiveRuntimeMode === 'demo' &&
    widget?.dataSource === 'mock' &&
    widget?.entityId === CLIMATE_LIVING_ROOM_MOCK_ENTITY_ID &&
    !haStates[CLIMATE_LIVING_ROOM_MOCK_ENTITY_ID];

  const resolveClimateTargetContext = (widget?: Widget) => {
    const targetWidget = widget?.kind === 'climate' ? widget : activeWidget?.kind === 'climate' ? activeWidget : undefined;
    const entityId = targetWidget?.entityId;
    const liveEntity = entityId ? haStatesForUi[entityId] : undefined;
    const rawAttributes = liveEntity?.rawAttributes;
    const minTemp =
      toFiniteNumber(liveEntity?.minTemp) ??
      toFiniteNumber(rawAttributes?.min_temp);
    const maxTemp =
      toFiniteNumber(liveEntity?.maxTemp) ??
      toFiniteNumber(rawAttributes?.max_temp);
    const step =
      toFiniteNumber(liveEntity?.targetTempStep) ??
      toFiniteNumber(rawAttributes?.target_temp_step) ??
      0.5;
    const hvacMode =
      toTrimmedString(liveEntity?.hvacMode) ??
      toTrimmedString(rawAttributes?.hvac_mode) ??
      toTrimmedString(liveEntity?.state) ??
      '';
    const isOn = hvacMode ? hvacMode.toLowerCase() !== 'off' : false;
    const targetTemp =
      toFiniteNumber(liveEntity?.targetValue) ??
      toFiniteNumber(rawAttributes?.temperature);
    const currentTemp =
      toFiniteNumber(liveEntity?.currentValue) ??
      toFiniteNumber(rawAttributes?.current_temperature);
    return {
      targetWidget,
      entityId,
      liveEntity,
      minTemp,
      maxTemp,
      step,
      hvacMode,
      isOn,
      targetTemp,
      currentTemp,
    };
  };

  const setClimateMode = (nextMode: string, widget?: Widget) => {
    const { targetWidget, entityId, liveEntity } = resolveClimateTargetContext(widget);
    const normalizedMode = nextMode.trim().toLowerCase();
    if (!normalizedMode) {
      return;
    }

    if (isHaConnected && entityId && !isLivingRoomClimateMock(targetWidget)) {
      void commandCoordinator.run({
        key: `climate-mode:${entityId}`,
        entityId,
        domain: 'climate',
        service: 'set_hvac_mode',
        timeoutMs: CLIMATE_PENDING_TTL_MS,
        send: () => callHaService('climate', 'set_hvac_mode', {
          entity_id: entityId,
          hvac_mode: normalizedMode,
        }),
        confirm: (entity) => normalizeLower(
          toTrimmedString(entity?.hvacMode) ??
            toTrimmedString(entity?.rawAttributes?.hvac_mode) ??
            toTrimmedString(entity?.state),
        ) === normalizedMode,
        onRollback: (reason) => reportUnconfirmedCommand(
          reason,
          t('home.command.climateUnconfirmed'),
        ),
      });
      return;
    }

    if (isLivingRoomClimateMock(targetWidget)) {
      const hvacAction = resolveMockClimateAction(normalizedMode);
      const usesRange = normalizedMode === 'heat_cool' || normalizedMode === 'auto';
      updateLivingRoomClimateMock(
        {
          state: normalizedMode,
          stateLabel: hvacAction,
          toggleOn: normalizedMode !== 'off',
          hvacMode: normalizedMode,
          hvacAction,
          targetTempLow: usesRange ? liveEntity?.targetTempLow ?? 20 : undefined,
          targetTempHigh: usesRange ? liveEntity?.targetTempHigh ?? 24 : undefined,
        },
        {
          hvac_mode: normalizedMode,
          hvac_action: hvacAction,
          target_temp_low: usesRange ? liveEntity?.targetTempLow ?? 20 : undefined,
          target_temp_high: usesRange ? liveEntity?.targetTempHigh ?? 24 : undefined,
        },
      );
      return;
    }

    if (targetWidget?.kind === 'climate' && targetWidget.id !== 'climate.air_conditioner') {
      updateWidget(targetWidget.id, (current) => ({
        ...current,
        isOn: normalizedMode !== 'off',
        status: normalizedMode,
      }));
      return;
    }

    if (!liveEntity) {
      actions.setClimateMode(normalizedMode);
      return;
    }
    actions.nudgeClimateCurrent();
  };

  const setClimateFanMode = (nextFanMode: string, widget?: Widget) => {
    const { targetWidget, entityId } = resolveClimateTargetContext(widget);
    const normalizedFan = nextFanMode.trim().toLowerCase();
    if (!normalizedFan) {
      return;
    }
    if (isHaConnected && entityId && !isLivingRoomClimateMock(targetWidget)) {
      upsertClimatePending(entityId, { fanMode: normalizedFan });
      queueClimateCommandDispatch(entityId, { fanMode: normalizedFan });
      return;
    }
    if (isLivingRoomClimateMock(targetWidget)) {
      updateLivingRoomClimateMock({ fanMode: normalizedFan }, { fan_mode: normalizedFan });
      return;
    }
    if (targetWidget?.kind === 'climate' && targetWidget.id !== 'climate.air_conditioner') {
      updateWidget(targetWidget.id, (current) => ({
        ...current,
        status: normalizedFan,
      }));
      return;
    }
    actions.setClimateFanMode(normalizedFan);
  };

  const setClimateTargetHumidity = (nextValue: number, widget?: Widget) => {
    const { targetWidget, entityId, liveEntity } = resolveClimateTargetContext(widget);
    const capabilities = resolveClimateCapabilities(liveEntity);
    const safeStep = capabilities.targetHumidityStep > 0 ? capabilities.targetHumidityStep : 1;
    const safeMin = capabilities.minHumidity;
    const safeMax = capabilities.maxHumidity;
    const safeHumidity = clamp(Math.round(nextValue / safeStep) * safeStep, safeMin, safeMax);

    if (isHaConnected && entityId && !isLivingRoomClimateMock(targetWidget)) {
      upsertClimatePending(entityId, { targetHumidity: safeHumidity });
      queueClimateCommandDispatch(entityId, { targetHumidity: safeHumidity });
      return;
    }
    if (isLivingRoomClimateMock(targetWidget)) {
      updateLivingRoomClimateMock(
        { targetHumidity: safeHumidity },
        { humidity: safeHumidity },
      );
      return;
    }
    if (targetWidget?.kind === 'climate' && targetWidget.id !== 'climate.air_conditioner') {
      updateWidget(targetWidget.id, (current) => ({
        ...current,
        status: `${safeHumidity}% humidity`,
      }));
      return;
    }
    actions.setClimateTargetHumidity(safeHumidity);
  };

  const setClimatePresetMode = (nextPresetMode: string, widget?: Widget) => {
    const { targetWidget, entityId } = resolveClimateTargetContext(widget);
    const normalizedPreset = nextPresetMode.trim().toLowerCase();
    if (!normalizedPreset) {
      return;
    }
    if (isHaConnected && entityId && !isLivingRoomClimateMock(targetWidget)) {
      upsertClimatePending(entityId, { presetMode: normalizedPreset });
      queueClimateCommandDispatch(entityId, { presetMode: normalizedPreset });
      return;
    }
    if (isLivingRoomClimateMock(targetWidget)) {
      updateLivingRoomClimateMock({ presetMode: normalizedPreset }, { preset_mode: normalizedPreset });
      return;
    }
    if (targetWidget?.kind === 'climate' && targetWidget.id !== 'climate.air_conditioner') {
      updateWidget(targetWidget.id, (current) => ({
        ...current,
        status: normalizedPreset,
      }));
      return;
    }
    actions.setClimatePresetMode(normalizedPreset);
  };

  const setClimateSwingMode = (nextSwingMode: string, widget?: Widget) => {
    const { targetWidget, entityId } = resolveClimateTargetContext(widget);
    const normalizedSwing = nextSwingMode.trim().toLowerCase();
    if (!normalizedSwing) {
      return;
    }
    if (isHaConnected && entityId && !isLivingRoomClimateMock(targetWidget)) {
      upsertClimatePending(entityId, { swingMode: normalizedSwing });
      queueClimateCommandDispatch(entityId, { swingMode: normalizedSwing });
      return;
    }
    if (isLivingRoomClimateMock(targetWidget)) {
      updateLivingRoomClimateMock({ swingMode: normalizedSwing }, { swing_mode: normalizedSwing });
      return;
    }
    if (targetWidget?.kind === 'climate' && targetWidget.id !== 'climate.air_conditioner') {
      updateWidget(targetWidget.id, (current) => ({
        ...current,
        status: normalizedSwing,
      }));
      return;
    }
    actions.setClimateSwingMode(normalizedSwing);
  };

  const setClimateSwingHorizontalMode = (nextSwingHorizontalMode: string, widget?: Widget) => {
    const { targetWidget, entityId } = resolveClimateTargetContext(widget);
    const normalizedSwingHorizontal = nextSwingHorizontalMode.trim().toLowerCase();
    if (!normalizedSwingHorizontal) {
      return;
    }
    if (isHaConnected && entityId && !isLivingRoomClimateMock(targetWidget)) {
      upsertClimatePending(entityId, { swingHorizontalMode: normalizedSwingHorizontal });
      queueClimateCommandDispatch(entityId, { swingHorizontalMode: normalizedSwingHorizontal });
      return;
    }
    if (isLivingRoomClimateMock(targetWidget)) {
      updateLivingRoomClimateMock(
        { swingHorizontalMode: normalizedSwingHorizontal },
        { swing_horizontal_mode: normalizedSwingHorizontal },
      );
      return;
    }
    if (targetWidget?.kind === 'climate' && targetWidget.id !== 'climate.air_conditioner') {
      updateWidget(targetWidget.id, (current) => ({
        ...current,
        status: normalizedSwingHorizontal,
      }));
      return;
    }
    actions.setClimateSwingHorizontalMode(normalizedSwingHorizontal);
  };

  const toggleClimatePower = (widget?: Widget) => {
    const { targetWidget, entityId, liveEntity, isOn } = resolveClimateTargetContext(widget);
    if (isHaConnected && entityId && !isLivingRoomClimateMock(targetWidget)) {
      const capabilities = resolveClimateCapabilities(liveEntity);
      let service: 'turn_off' | 'turn_on' | 'set_hvac_mode';
      let payload: Record<string, unknown> = { entity_id: entityId };
      let expectedMode: string | undefined;
      if (isOn && capabilities.supportsTurnOff) {
        service = 'turn_off';
        expectedMode = 'off';
      } else if (!isOn && capabilities.supportsTurnOn) {
        service = 'turn_on';
      } else {
        expectedMode = isOn ? 'off' : resolvePreferredHvacMode(liveEntity);
        service = 'set_hvac_mode';
        payload = { ...payload, hvac_mode: expectedMode };
      }
      void commandCoordinator.run({
        key: `climate-power:${entityId}`,
        entityId,
        domain: 'climate',
        service,
        timeoutMs: CLIMATE_PENDING_TTL_MS,
        send: () => callHaService('climate', service, payload),
        confirm: (entity) => {
          const mode = normalizeLower(
            toTrimmedString(entity?.hvacMode) ??
              toTrimmedString(entity?.rawAttributes?.hvac_mode) ??
              toTrimmedString(entity?.state),
          );
          return expectedMode ? mode === expectedMode : mode.length > 0 && mode !== 'off';
        },
        onRollback: (reason) => reportUnconfirmedCommand(
          reason,
          'Il climatizzatore non ha confermato il nuovo stato.',
        ),
      });
      return;
    }
    if (isLivingRoomClimateMock(targetWidget)) {
      const nextMode = isOn ? 'off' : resolvePreferredHvacMode(liveEntity);
      const hvacAction = resolveMockClimateAction(nextMode);
      updateLivingRoomClimateMock(
        {
          state: nextMode,
          stateLabel: hvacAction,
          toggleOn: nextMode !== 'off',
          hvacMode: nextMode,
          hvacAction,
        },
        { hvac_mode: nextMode, hvac_action: hvacAction },
      );
      return;
    }
    if (targetWidget?.kind === 'climate' && targetWidget.id !== 'climate.air_conditioner') {
      updateWidget(targetWidget.id, (current) => ({
        ...current,
        isOn: !current.isOn,
        status: current.isOn ? 'off' : 'auto',
      }));
      return;
    }
    actions.toggleClimatePower();
  };

  const setClimateTargetTemp = (nextValue: number, widget?: Widget) => {
    const { targetWidget, entityId, minTemp, maxTemp, step } = resolveClimateTargetContext(widget);
    const safeStep = step > 0 ? step : 0.5;
    const safeMin = minTemp ?? Number.NEGATIVE_INFINITY;
    const safeMax = maxTemp ?? Number.POSITIVE_INFINITY;
    const safeTarget = clamp(Math.round(nextValue / safeStep) * safeStep, safeMin, safeMax);

    if (isHaConnected && entityId && !isLivingRoomClimateMock(targetWidget)) {
      upsertClimatePending(entityId, {
        targetTemp: safeTarget,
        targetTempLow: undefined,
        targetTempHigh: undefined,
      });
      queueClimateCommandDispatch(entityId, {
        targetTemp: safeTarget,
        targetTempLow: undefined,
        targetTempHigh: undefined,
      });
      return;
    }
    if (isLivingRoomClimateMock(targetWidget)) {
      updateLivingRoomClimateMock(
        {
          targetValue: safeTarget,
          targetTempLow: undefined,
          targetTempHigh: undefined,
        },
        {
          temperature: safeTarget,
          target_temp_low: undefined,
          target_temp_high: undefined,
        },
      );
      return;
    }
    if (targetWidget?.kind === 'climate' && targetWidget.id !== 'climate.air_conditioner') {
      updateWidget(targetWidget.id, (current) => ({
        ...current,
        value: safeTarget,
      }));
      return;
    }
    actions.setClimateTarget(safeTarget);
  };

  const setClimateTargetRange = (nextLow: number, nextHigh: number, widget?: Widget) => {
    const { targetWidget, entityId, minTemp, maxTemp, step } = resolveClimateTargetContext(widget);
    const safeStep = step > 0 ? step : 0.5;
    const safeMin = minTemp ?? Number.NEGATIVE_INFINITY;
    const safeMax = maxTemp ?? Number.POSITIVE_INFINITY;
    const safeLow = clamp(Math.round(nextLow / safeStep) * safeStep, safeMin, safeMax);
    const safeHigh = clamp(Math.round(nextHigh / safeStep) * safeStep, safeMin, safeMax);
    const low = Math.min(safeLow, safeHigh);
    const high = Math.max(safeLow, safeHigh);

    if (isHaConnected && entityId && !isLivingRoomClimateMock(targetWidget)) {
      upsertClimatePending(entityId, {
        targetTemp: Math.round(((low + high) / 2) * 10) / 10,
        targetTempLow: low,
        targetTempHigh: high,
      });
      queueClimateCommandDispatch(entityId, {
        targetTemp: Math.round(((low + high) / 2) * 10) / 10,
        targetTempLow: low,
        targetTempHigh: high,
      });
      return;
    }
    if (isLivingRoomClimateMock(targetWidget)) {
      const midpoint = Math.round(((low + high) / 2) * 10) / 10;
      updateLivingRoomClimateMock(
        {
          targetValue: midpoint,
          targetTempLow: low,
          targetTempHigh: high,
        },
        {
          temperature: midpoint,
          target_temp_low: low,
          target_temp_high: high,
        },
      );
      return;
    }
    if (targetWidget?.kind === 'climate' && targetWidget.id !== 'climate.air_conditioner') {
      updateWidget(targetWidget.id, (current) => ({
        ...current,
        value: Math.round(((low + high) / 2) * 10) / 10,
      }));
      return;
    }
    actions.setClimateTargetRange(low, high);
  };

  const increaseClimateTarget = () => {
    if (!isHaConnected && activeWidget?.kind !== 'climate') {
      actions.increaseClimateTarget();
      return;
    }
    const { currentTemp, targetTemp } = resolveClimateTargetContext();
    const currentTarget = Number.isFinite(targetTemp) ? targetTemp : currentTemp;
    setClimateTargetTemp(currentTarget + 0.5);
  };

  const decreaseClimateTarget = () => {
    if (!isHaConnected && activeWidget?.kind !== 'climate') {
      actions.decreaseClimateTarget();
      return;
    }
    const { currentTemp, targetTemp } = resolveClimateTargetContext();
    const currentTarget = Number.isFinite(targetTemp) ? targetTemp : currentTemp;
    setClimateTargetTemp(currentTarget - 0.5);
  };

  const autoAdjustClimate = () => {
    if (!isHaConnected && activeWidget?.kind !== 'climate') {
      actions.autoAdjustClimate();
      return;
    }
    const { currentTemp } = resolveClimateTargetContext();
    const currentValue = Number.isFinite(currentTemp) ? currentTemp : state.climate.currentTemp;
    setClimateTargetTemp(currentValue);
  };

  const updateHomeAlarmMock = (nextState: string) => {
    setHomeAlarmMock((current) => ({
      ...current,
      state: nextState,
      stateLabel: nextState,
      toggleOn: isAlarmArmedState(nextState),
      rawAttributes: {
        ...(current.rawAttributes ?? {}),
        changed_by: 'Dashboard Demo',
      },
    }));
  };

  const isHomeAlarmMock = (widget: Widget | undefined) =>
    effectiveRuntimeMode === 'demo' &&
    widget?.dataSource === 'mock' &&
    widget?.entityId === HOME_ALARM_MOCK_ENTITY_ID &&
    (!isHaConnected || !haStates[HOME_ALARM_MOCK_ENTITY_ID]);

  const resolveAlarmTargetContext = (widget?: Widget) => {
    const targetWidget = widget?.kind === 'alarm' ? widget : activeWidget?.kind === 'alarm' ? activeWidget : undefined;
    const entityId = targetWidget?.entityId;
    return {
      targetWidget,
      entityId,
    };
  };

  const buildAlarmQuickAuthAction = (service: AlarmServiceName, widget: Widget): AlarmQuickAuthAction | null => {
    if (widget.kind !== 'alarm') {
      return null;
    }
    const liveEntity = widget.entityId ? haStatesForUi[widget.entityId] : undefined;
    const rawAttributes = liveEntity?.rawAttributes;
    const codeArmRequired = typeof rawAttributes?.code_arm_required === 'boolean' ? rawAttributes.code_arm_required : false;
    const widgetSecrets = getWidgetSecrets(widget.id);
    const unlockCode = widgetSecrets.alarmUnlockCode?.trim() ?? '';
    const localExtraCode = widgetSecrets.alarmLocalExtraCode?.trim() ?? '';
    const codeFormat = typeof rawAttributes?.code_format === 'string'
      ? rawAttributes.code_format.toLowerCase()
      : undefined;
    const securityRequirement = resolveAlarmSecurityRequirement({
      action: resolveAlarmSecurityActionKind(service),
      codeArmRequired,
      codeFormat,
      storedHaPinConfigured: unlockCode.length > 0,
      localExtraPinConfigured: localExtraCode.length > 0,
      deviceAuthEnabled: widget.alarmRequireAuthToDisarm ?? false,
    });

    return {
      widget,
      service,
      state: resolveAlarmNextState(service),
      requiresCode: securityRequirement.needsCodeInput,
      requiresBiometric: securityRequirement.allowsDeviceAuth,
      unlockCode,
      localExtraCode,
      credentialKind: securityRequirement.credentialKind,
      numericCodeMode: securityRequirement.codeFormat !== 'text',
    };
  };

  const requestAlarmQuickAction = async (service: AlarmServiceName, widget: Widget) => {
    const quickAction = buildAlarmQuickAuthAction(service, widget);
    if (!quickAction) {
      return false;
    }
    if (quickAction.requiresBiometric || quickAction.requiresCode) {
      void loadSecurityAuthModal();
      setPendingQuickAlarmAction(quickAction);
      setQuickAlarmAuthCode('');
      setQuickAlarmSubmissionError('');
      return false;
    }
    return callProtectedAlarmAction(service, undefined, widget);
  };

  const callAlarmAction = async (service: AlarmServiceName, code?: string, widget?: Widget) => {
    const { targetWidget, entityId } = resolveAlarmTargetContext(widget);
    const actionCode = code?.trim();
    if (isHomeAlarmMock(targetWidget)) {
      updateHomeAlarmMock(resolveAlarmNextState(service));
      return true;
    }
    if (isHaConnected && entityId) {
      const payload: Record<string, unknown> = { entity_id: entityId };
      if (actionCode) {
        payload.code = actionCode;
      }
      const targetState = normalizeAlarmState(resolveAlarmNextState(service));
      return commandCoordinator.run({
        key: `alarm:${entityId}`,
        entityId,
        domain: 'alarm_control_panel',
        service,
        timeoutMs: ALARM_PENDING_TTL_MS,
        onOptimistic: () => setAlarmPending(entityId, service),
        send: () => callHaService('alarm_control_panel', service, payload),
        confirm: (entity) => {
          const liveState = normalizeAlarmState(
            toTrimmedString(entity?.state) ?? toTrimmedString(entity?.stateLabel),
          );
          return liveState === targetState;
        },
        onAwaitingConfirmation: () => scheduleAlarmActivityRefresh(entityId),
        onConfirmed: () => {
          removePendingEntities(setAlarmPendingByEntity, [entityId]);
          clearTimeoutForEntity(alarmPendingTimeoutRef, entityId);
        },
        onRollback: (reason) => {
          removePendingEntities(setAlarmPendingByEntity, [entityId]);
          clearTimeoutForEntity(alarmPendingTimeoutRef, entityId);
          if (reason !== 'superseded' && reason !== 'cancelled' && reason !== 'connection_lost') {
            addNotification('alert', 'Home Assistant non ha confermato il nuovo stato dell’allarme.');
          }
        },
      });
    }
    if (targetWidget?.kind === 'alarm') {
      const nextState = resolveAlarmNextState(service);
      updateWidget(targetWidget.id, (current) => ({
        ...current,
        status: nextState,
        isOn: isAlarmArmedState(nextState),
      }));
    }
    return true;
  };

  const requestAuthenticatedAlarmAction = async (service: AlarmServiceName, widget: Widget, code?: string) => {
    if (isLockAuthBusy || isQuickAlarmAuthBusy) {
      return false;
    }

    const targetWidget = widget.kind === 'alarm' ? widget : undefined;
    if (!targetWidget) {
      addNotification('alert', t('home.security.alarmMissing'));
      return false;
    }

    const quickAction = buildAlarmQuickAuthAction(service, targetWidget);
    if (!quickAction) return false;
    void loadSecurityAuthModal();
    setPendingQuickAlarmAction(quickAction);
    setPendingQuickLockAction(null);
    setQuickAlarmAuthCode('');
    setQuickAlarmSubmissionError('');
    return false;
  };

  const authorizeAlarmDeviceAuth = async (label: string) => {
    if (isLockAuthBusy) {
      return false;
    }

    const available = await deviceAuth.isBiometricAvailable();
    if (!available || !deviceAuth.isEnrolled) {
      return false;
    }

    setIsLockAuthBusy(true);
    try {
      return await deviceAuth.authenticate(`Allarme ${label}`);
    } finally {
      setIsLockAuthBusy(false);
    }
  };

  const callProtectedAlarmAction = (
    service: AlarmServiceName,
    code?: string,
    widget?: Widget,
    options?: AlarmActionAuthOptions,
  ) => {
    const targetWidget = widget?.kind === 'alarm' ? widget : activeWidget?.kind === 'alarm' ? activeWidget : undefined;
    if (service === 'alarm_disarm' && targetWidget?.alarmRequireAuthToDisarm) {
      if (options?.deviceAuthVerified || options?.manualCodeVerified) {
        return callAlarmAction(service, code, widget);
      }
      return requestAuthenticatedAlarmAction(service, targetWidget, code);
    }
    return callAlarmAction(service, code, widget);
  };

  const closeQuickAlarmAuth = () => {
    if (isQuickAlarmAuthBusy || isLockAuthBusy) {
      return;
    }
    setPendingQuickAlarmAction(null);
    setPendingQuickLockAction(null);
    setQuickAlarmAuthCode('');
    setQuickAlarmSubmissionError('');
  };

  const confirmQuickAlarmAuth = async (useBiometric = false) => {
    const quickAction = pendingQuickAlarmAction;
    if (!quickAction || isQuickAlarmAuthBusy) {
      return;
    }

    const rateLimitStatus = getAuthRateLimitStatus(quickAlarmAuthAttemptState);
    if (!useBiometric && rateLimitStatus.isLocked) {
      appendSecurityAuditEvent({
        tone: 'warning',
        message: 'PIN allarme bloccato temporaneamente.',
        context: quickAction.widget.entityId || quickAction.widget.title,
      });
      return;
    }

    const needsManualCode = quickAction.requiresCode && !useBiometric;
    const manualCodeSubmission = resolveAlarmManualCodeSubmission({
      inputCode: quickAlarmAuthCode,
      localExtraCode: quickAction.localExtraCode,
      storedHaCode: quickAction.unlockCode,
      requiresCode: needsManualCode,
    });
    if (needsManualCode) {
      if (manualCodeSubmission.ok === false && manualCodeSubmission.reason === 'missing') {
        setQuickAlarmSubmissionError(t('home.security.enterCode'));
        return;
      }
      if (manualCodeSubmission.ok === false) {
      setQuickAlarmSubmissionError(t('home.security.authFailed'));
        setQuickAlarmAuthAttemptState(recordAuthFailure(quickAlarmAuthAttemptState));
        appendSecurityAuditEvent({
          tone: 'warning',
          message: 'Tentativo PIN allarme non valido.',
          context: quickAction.widget.entityId || quickAction.widget.title,
        });
        return;
      }
    }
    setQuickAlarmSubmissionError('');

    setIsQuickAlarmAuthBusy(true);
    try {
      const manualCode = manualCodeSubmission.ok ? manualCodeSubmission.haCode : undefined;
      let didRun: boolean | void;
      if (useBiometric) {
        const verified = await authorizeAlarmDeviceAuth(getAlarmStateLabel(quickAction.state));
        if (!verified) {
          return false;
        }
        if (quickAction.requiresCode && !quickAction.unlockCode) {
          return false;
        }
        didRun = await callProtectedAlarmAction(
          quickAction.service,
          quickAction.requiresCode ? quickAction.unlockCode : undefined,
          quickAction.widget,
          { deviceAuthVerified: true },
        );
      } else {
        didRun = await callProtectedAlarmAction(
          quickAction.service,
          manualCode,
          quickAction.widget,
          { manualCodeVerified: true },
        );
      }
      if (didRun === false) {
        setQuickAlarmSubmissionError('Comando non autorizzato o non completato.');
        setQuickAlarmAuthAttemptState(recordAuthFailure(quickAlarmAuthAttemptState));
        appendSecurityAuditEvent({
          tone: 'warning',
          message: 'Comando allarme non autorizzato o non completato.',
          context: quickAction.widget.entityId || quickAction.widget.title,
        });
        return false;
      }
      setQuickAlarmAuthAttemptState(recordAuthSuccess());
      if (needsManualCode) {
        appendSecurityAuditEvent({
          tone: 'success',
          message: 'PIN allarme verificato.',
          context: quickAction.widget.entityId || quickAction.widget.title,
        });
      }
      setPendingQuickAlarmAction(null);
      setQuickAlarmAuthCode('');
      setQuickAlarmSubmissionError('');
      return true;
    } finally {
      setIsQuickAlarmAuthBusy(false);
    }
  };

  const disarmAlarm = (code?: string, widget?: Widget, options?: AlarmActionAuthOptions) => {
    return callProtectedAlarmAction('alarm_disarm', code, widget, options);
  };

  const armAlarmHome = (code?: string, widget?: Widget, options?: AlarmActionAuthOptions) => {
    return callProtectedAlarmAction('alarm_arm_home', code, widget, options);
  };

  const armAlarmAway = (code?: string, widget?: Widget, options?: AlarmActionAuthOptions) => {
    return callProtectedAlarmAction('alarm_arm_away', code, widget, options);
  };

  const armAlarmNight = (code?: string, widget?: Widget, options?: AlarmActionAuthOptions) => {
    return callProtectedAlarmAction('alarm_arm_night', code, widget, options);
  };

  const armAlarmVacation = (code?: string, widget?: Widget, options?: AlarmActionAuthOptions) => {
    return callProtectedAlarmAction('alarm_arm_vacation', code, widget, options);
  };

  const armAlarmCustomBypass = (code?: string, widget?: Widget, options?: AlarmActionAuthOptions) => {
    return callProtectedAlarmAction('alarm_arm_custom_bypass', code, widget, options);
  };

  const triggerAlarm = (code?: string, widget?: Widget, options?: AlarmActionAuthOptions) => {
    return callProtectedAlarmAction('alarm_trigger', code, widget, options);
  };

  const resolveAlarmArmServiceByMode = (
    mode: 'home' | 'away' | 'night' | 'vacation' | 'custom_bypass',
  ): AlarmServiceName => {
    if (mode === 'home') {
      return 'alarm_arm_home';
    }
    if (mode === 'away') {
      return 'alarm_arm_away';
    }
    if (mode === 'night') {
      return 'alarm_arm_night';
    }
    if (mode === 'vacation') {
      return 'alarm_arm_vacation';
    }
    return 'alarm_arm_custom_bypass';
  };

  const armAlarmByMode = (
    mode: 'home' | 'away' | 'night' | 'vacation' | 'custom_bypass',
    code?: string,
    widget?: Widget,
    options?: AlarmActionAuthOptions,
  ) => {
    return callProtectedAlarmAction(resolveAlarmArmServiceByMode(mode), code, widget, options);
  };

  const resolveLockTargetContext = (widget?: Widget) => {
    const targetWidget = widget?.kind === 'lock' ? widget : activeWidget?.kind === 'lock' ? activeWidget : undefined;
    const entityId = targetWidget?.entityId;
    const liveEntity = entityId && isHaConnected ? haStatesForUi[entityId] : undefined;
    const rawAttributes = liveEntity?.rawAttributes;
    const stateValue = normalizeLockState(
      toTrimmedString(liveEntity?.state) ??
        toTrimmedString(liveEntity?.stateLabel) ??
        targetWidget?.status,
    );
    return {
      targetWidget,
      entityId,
      liveEntity,
      rawAttributes,
      stateValue,
    };
  };

  const callLockAction = async (service: 'lock' | 'unlock' | 'open', code?: string, widget?: Widget) => {
    const { targetWidget, entityId } = resolveLockTargetContext(widget);
    const actionCode = code?.trim();
    const nextState = service === 'lock' ? 'locked' : service === 'open' ? 'open' : 'unlocked';

    if (isHaConnected && entityId) {
      const payload: Record<string, unknown> = { entity_id: entityId };
      if (actionCode) {
        payload.code = actionCode;
      }
      return commandCoordinator.run({
        key: `lock:${entityId}`,
        entityId,
        domain: 'lock',
        service,
        timeoutMs: LOCK_PENDING_TTL_MS,
        onOptimistic: () => {
          setLockPending(entityId, service);
          if (targetWidget) {
            updateWidget(targetWidget.id, (current) => ({
              ...current,
              status: nextState,
              isOn: isLockLockedState(nextState),
            }));
          }
        },
        send: () => callHaService('lock', service, payload),
        confirm: (entity) => {
          const liveState = normalizeLockState(
            toTrimmedString(entity?.state) ?? toTrimmedString(entity?.stateLabel),
          );
          if (service === 'lock') return liveState === 'locked';
          if (service === 'open') return liveState === 'open' || liveState === 'unlocked';
          return liveState === 'unlocked' || liveState === 'open';
        },
        onAwaitingConfirmation: () => scheduleLockActivityRefresh(entityId),
        onConfirmed: () => {
          removePendingEntities(setLockPendingByEntity, [entityId]);
          clearTimeoutForEntity(lockPendingTimeoutRef, entityId);
        },
        onRollback: (reason, entity) => {
          removePendingEntities(setLockPendingByEntity, [entityId]);
          clearTimeoutForEntity(lockPendingTimeoutRef, entityId);
          const confirmedState = normalizeLockState(
            toTrimmedString(entity?.state) ?? toTrimmedString(entity?.stateLabel),
          );
          if (targetWidget && confirmedState !== 'unknown') {
            updateWidget(targetWidget.id, (current) => ({
              ...current,
              status: confirmedState,
              isOn: isLockLockedState(confirmedState),
            }));
          }
          if (reason !== 'superseded' && reason !== 'cancelled' && reason !== 'connection_lost') {
            addNotification('alert', 'Home Assistant non ha confermato il comando della serratura.');
          }
        },
      });
    }

    if (!targetWidget) {
      return;
    }

    updateWidget(targetWidget.id, (current) => ({
      ...current,
      status: nextState,
      isOn: isLockLockedState(nextState),
    }));
    return true;
  };

  const lockDoor = (code?: string, widget?: Widget) => {
    void callLockAction('lock', code, widget);
  };

  const unlockDoor = (code?: string, widget?: Widget) => {
    void callLockAction('unlock', code, widget);
  };

  const openDoor = (code?: string, widget?: Widget) => {
    void callLockAction('open', code, widget);
  };

  const requestAuthenticatedLockAction = async (
    widget: Widget,
    action: 'unlock' | 'open',
    code?: string,
  ) => {
    if (isLockAuthBusy) {
      return false;
    }

    const targetWidget = widget.kind === 'lock' ? widget : undefined;
    if (!targetWidget) {
      addNotification('alert', t('home.security.lockMissing'));
      return false;
    }

    const configuredCode = code?.trim() || getWidgetSecrets(targetWidget.id).lockCode?.trim() || '';
    const showCodeFallback = () => {
      if (!configuredCode) {
        addNotification('warning', t('home.command.lockConfirmationUnavailable'));
        return false;
      }
      void loadSecurityAuthModal();
      setPendingQuickLockAction({
        widget: targetWidget,
        action,
        unlockCode: configuredCode,
        numericCodeMode: /^\d+$/.test(configuredCode),
      });
      setPendingQuickAlarmAction(null);
      setQuickAlarmAuthCode('');
      setQuickAlarmSubmissionError('');
      return false;
    };

    if (!targetWidget.lockRequireAuthToUnlock) {
      return showCodeFallback();
    }

    const available = await deviceAuth.isBiometricAvailable();
    if (!available || !deviceAuth.isEnrolled) {
      appendSecurityAuditEvent({
        tone: 'warning',
        message: t('home.command.lockFallbackRequired'),
        context: targetWidget.entityId || targetWidget.title,
      });
      return showCodeFallback();
    }

    setIsLockAuthBusy(true);
    try {
      const verified = await deviceAuth.authenticate(t('home.lock'));
      if (!verified) {
        appendSecurityAuditEvent({
          tone: 'warning',
          message: t('home.command.lockConfirmationCancelled'),
          context: targetWidget.entityId || targetWidget.title,
        });
        return showCodeFallback();
      }
      appendSecurityAuditEvent({
        tone: 'success',
        message: 'Sblocco serratura autorizzato con biometria.',
        context: targetWidget.entityId || targetWidget.title,
      });
      if (action === 'open') {
        openDoor(configuredCode || undefined, targetWidget);
      } else {
        unlockDoor(configuredCode || undefined, targetWidget);
      }
      return true;
    } finally {
      setIsLockAuthBusy(false);
    }
  };

  const toggleLockDoor = (widget?: Widget) => {
    const { stateValue, rawAttributes, liveEntity } = resolveLockTargetContext(widget);
    const isLocked = isLockLockedState(stateValue);
    const supportedFeatures =
      typeof liveEntity?.supportedFeatures === 'number'
        ? liveEntity.supportedFeatures
        : toFiniteNumber(rawAttributes?.supported_features);
    const supportsOpen = typeof supportedFeatures === 'number' && (supportedFeatures & LOCK_FEATURE_OPEN) !== 0;

    if (stateValue === 'open' && supportsOpen) {
      lockDoor(undefined, widget);
      return true;
    }
    if (isLocked) {
      const targetWidget = widget?.kind === 'lock' ? widget : activeWidget?.kind === 'lock' ? activeWidget : undefined;
      const configuredCode = targetWidget ? getWidgetSecrets(targetWidget.id).lockCode?.trim() : '';
      if (targetWidget && (targetWidget.lockRequireAuthToUnlock || configuredCode)) {
        void requestAuthenticatedLockAction(targetWidget, 'unlock');
        return false;
      }
      unlockDoor(undefined, widget);
      return true;
    }
    lockDoor(undefined, widget);
    return true;
  };

  const unlockDoorFromContext = (code?: string) => {
    const targetWidget = activeWidget?.kind === 'lock' ? activeWidget : undefined;
    const configuredCode = code?.trim() || (targetWidget ? getWidgetSecrets(targetWidget.id).lockCode?.trim() : '');
    if (targetWidget && (targetWidget.lockRequireAuthToUnlock || configuredCode)) {
      void requestAuthenticatedLockAction(targetWidget, 'unlock', code);
      return false;
    }
    unlockDoor(code, targetWidget);
    return true;
  };

  const openDoorFromContext = (code?: string) => {
    const targetWidget = activeWidget?.kind === 'lock' ? activeWidget : undefined;
    const configuredCode = code?.trim() || (targetWidget ? getWidgetSecrets(targetWidget.id).lockCode?.trim() : '');
    if (targetWidget && (targetWidget.lockRequireAuthToUnlock || configuredCode)) {
      void requestAuthenticatedLockAction(targetWidget, 'open', code);
      return false;
    }
    openDoor(code, targetWidget);
    return true;
  };

  const resolveCoverTargetContext = (widget?: Widget) => {
    const targetWidget = widget?.kind === 'cover' ? widget : activeWidget?.kind === 'cover' ? activeWidget : undefined;
    const entityId = targetWidget?.entityId;
    const liveEntity = entityId ? haStatesForUi[entityId] : undefined;
    const rawAttributes = liveEntity?.rawAttributes;
    const stateValue = normalizeCoverState(
      toTrimmedString(liveEntity?.state) ??
        toTrimmedString(liveEntity?.stateLabel) ??
        targetWidget?.status,
    );
    const position = resolveCoverPosition(
      stateValue,
      resolveCoverPositionAttribute(rawAttributes) ?? targetWidget?.value,
      typeof targetWidget?.value === 'number' ? targetWidget.value : 70,
    );
    const tiltPosition = resolveCoverTiltPosition(
      resolveCoverTiltAttribute(rawAttributes) ?? targetWidget?.coverTiltPosition,
      typeof targetWidget?.coverTiltPosition === 'number' ? targetWidget.coverTiltPosition : 50,
    );
    const supportedFeatures = resolveCoverSupportedFeatures(liveEntity);
    return {
      targetWidget,
      entityId,
      stateValue,
      position,
      tiltPosition,
      supportedFeatures,
    };
  };

  const canCallCoverService = (entityId: string | undefined): entityId is string =>
    Boolean(isHaConnected && entityId && haStates[entityId]);

  const patchLocalCoverEntity = (
    entityId: string | undefined,
    patch: {
      state?: string;
      position?: number;
      tiltPosition?: number;
    },
  ) => {
    if (!entityId) {
      return;
    }
    setCoverStateMocks((current) => {
      const entity = current[entityId];
      if (!entity) {
        return current;
      }
      const rawAttributes = { ...(entity.rawAttributes ?? {}) };
      const nextState = patch.state ? normalizeCoverState(patch.state) : normalizeCoverState(entity.stateLabel ?? entity.state);
      const currentPosition = resolveCoverPosition(
        nextState,
        resolveCoverPositionAttribute(rawAttributes) ?? entity.numericValue,
        typeof entity.numericValue === 'number' ? entity.numericValue : 70,
      );
      const nextPosition = Number.isFinite(patch.position) ? clampPercent(patch.position ?? currentPosition) : currentPosition;
      const currentTiltPosition = resolveCoverTiltPosition(resolveCoverTiltAttribute(rawAttributes), 50);
      const nextTiltPosition = Number.isFinite(patch.tiltPosition)
        ? clampPercent(patch.tiltPosition ?? currentTiltPosition)
        : currentTiltPosition;

      rawAttributes.current_position = nextPosition;
      rawAttributes.current_cover_position = nextPosition;
      rawAttributes.position = nextPosition;
      rawAttributes.current_tilt_position = nextTiltPosition;
      rawAttributes.current_cover_tilt_position = nextTiltPosition;
      rawAttributes.tilt_position = nextTiltPosition;

      return {
        ...current,
        [entityId]: {
          ...entity,
          state: nextState,
          stateLabel: nextState,
          numericValue: nextPosition,
          toggleOn: nextState !== 'closed' && nextState !== 'unavailable' && nextState !== 'unknown' && nextPosition > 0,
          rawAttributes,
        },
      };
    });
  };

  const openCover = (widget?: Widget) => {
    const { targetWidget, entityId } = resolveCoverTargetContext(widget);
    if (canCallCoverService(entityId)) {
      runCoverCommand({
        entityId,
        key: 'cover-motion',
        service: 'open_cover',
        pending: { state: 'opening', position: 100 },
        fields: ['state', 'position'],
        confirm: (entity) => {
          const state = normalizeCoverState(toTrimmedString(entity?.state) ?? toTrimmedString(entity?.stateLabel));
          const position = toFiniteNumber(resolveCoverPositionAttribute(entity?.rawAttributes));
          return state === 'open' || almostEqual(position, 100, 1);
        },
      });
      return;
    }
    if (!targetWidget) {
      return;
    }
    updateWidget(targetWidget.id, (current) => ({
      ...current,
      status: 'open',
      value: 100,
      isOn: true,
    }));
    patchLocalCoverEntity(entityId, { state: 'open', position: 100 });
  };

  const closeCover = (widget?: Widget) => {
    const { targetWidget, entityId } = resolveCoverTargetContext(widget);
    if (canCallCoverService(entityId)) {
      runCoverCommand({
        entityId,
        key: 'cover-motion',
        service: 'close_cover',
        pending: { state: 'closing', position: 0 },
        fields: ['state', 'position'],
        confirm: (entity) => {
          const state = normalizeCoverState(toTrimmedString(entity?.state) ?? toTrimmedString(entity?.stateLabel));
          const position = toFiniteNumber(resolveCoverPositionAttribute(entity?.rawAttributes));
          return state === 'closed' || almostEqual(position, 0, 1);
        },
      });
      return;
    }
    if (!targetWidget) {
      return;
    }
    updateWidget(targetWidget.id, (current) => ({
      ...current,
      status: 'closed',
      value: 0,
      isOn: false,
    }));
    patchLocalCoverEntity(entityId, { state: 'closed', position: 0 });
  };

  const stopCover = (widget?: Widget) => {
    const { targetWidget, entityId, position } = resolveCoverTargetContext(widget);
    if (canCallCoverService(entityId)) {
      const previousUpdated = toTrimmedString(haStates[entityId]?.rawAttributes?.__last_updated);
      runCoverCommand({
        entityId,
        key: 'cover-motion',
        service: 'stop_cover',
        pending: { state: 'stopped', position },
        fields: ['state', 'position'],
        confirm: (entity) => {
          const state = normalizeCoverState(toTrimmedString(entity?.state) ?? toTrimmedString(entity?.stateLabel));
          const updated = toTrimmedString(entity?.rawAttributes?.__last_updated);
          return (
            state !== 'opening' &&
            state !== 'closing' &&
            (!previousUpdated || !updated || updated !== previousUpdated)
          );
        },
      });
      return;
    }
    if (!targetWidget) {
      return;
    }
    updateWidget(targetWidget.id, (current) => ({
      ...current,
      status: 'stopped',
      value: position,
      isOn: position > 0,
    }));
    patchLocalCoverEntity(entityId, { state: 'stopped', position });
  };

  const setCoverPosition = (position: number, widget?: Widget) => {
    const { targetWidget, entityId, position: currentPosition } = resolveCoverTargetContext(widget);
    const safePosition = clampPercent(position);
    if (canCallCoverService(entityId)) {
      const pendingState =
        safePosition > currentPosition
          ? 'opening'
          : safePosition < currentPosition
            ? 'closing'
            : 'stopped';
      runCoverCommand({
        entityId,
        key: 'cover-motion',
        service: 'set_cover_position',
        payload: { position: safePosition },
        pending: { state: pendingState, position: safePosition },
        fields: ['state', 'position'],
        confirm: (entity) => almostEqual(
          toFiniteNumber(resolveCoverPositionAttribute(entity?.rawAttributes)),
          safePosition,
          1,
        ),
      });
      return;
    }
    if (!targetWidget) {
      return;
    }
    updateWidget(targetWidget.id, (current) => ({
      ...current,
      status: safePosition <= 0 ? 'closed' : 'open',
      value: safePosition,
      isOn: safePosition > 0,
    }));
    patchLocalCoverEntity(entityId, {
      state: safePosition <= 0 ? 'closed' : 'open',
      position: safePosition,
    });
  };

  const openCoverTilt = (widget?: Widget) => {
    const { targetWidget, entityId } = resolveCoverTargetContext(widget);
    if (canCallCoverService(entityId)) {
      runCoverCommand({
        entityId,
        key: 'cover-tilt',
        service: 'open_cover_tilt',
        pending: { tiltPosition: 100 },
        fields: ['tiltPosition'],
        confirm: (entity) => almostEqual(toFiniteNumber(resolveCoverTiltAttribute(entity?.rawAttributes)), 100, 1),
      });
      return;
    }
    if (!targetWidget) {
      return;
    }
    updateWidget(targetWidget.id, (current) => ({
      ...current,
      coverTiltPosition: 100,
    }));
    patchLocalCoverEntity(entityId, { tiltPosition: 100 });
  };

  const closeCoverTilt = (widget?: Widget) => {
    const { targetWidget, entityId } = resolveCoverTargetContext(widget);
    if (canCallCoverService(entityId)) {
      runCoverCommand({
        entityId,
        key: 'cover-tilt',
        service: 'close_cover_tilt',
        pending: { tiltPosition: 0 },
        fields: ['tiltPosition'],
        confirm: (entity) => almostEqual(toFiniteNumber(resolveCoverTiltAttribute(entity?.rawAttributes)), 0, 1),
      });
      return;
    }
    if (!targetWidget) {
      return;
    }
    updateWidget(targetWidget.id, (current) => ({
      ...current,
      coverTiltPosition: 0,
    }));
    patchLocalCoverEntity(entityId, { tiltPosition: 0 });
  };

  const stopCoverTilt = (widget?: Widget) => {
    const { targetWidget, entityId, tiltPosition } = resolveCoverTargetContext(widget);
    if (canCallCoverService(entityId)) {
      const previousUpdated = toTrimmedString(haStates[entityId]?.rawAttributes?.__last_updated);
      runCoverCommand({
        entityId,
        key: 'cover-tilt',
        service: 'stop_cover_tilt',
        pending: { tiltPosition },
        fields: ['tiltPosition'],
        confirm: (entity) => {
          const updated = toTrimmedString(entity?.rawAttributes?.__last_updated);
          return Boolean(updated && updated !== previousUpdated);
        },
      });
      return;
    }
    if (!targetWidget) {
      return;
    }
    updateWidget(targetWidget.id, (current) => ({
      ...current,
      coverTiltPosition: tiltPosition,
    }));
    patchLocalCoverEntity(entityId, { tiltPosition });
  };

  const setCoverTiltPosition = (position: number, widget?: Widget) => {
    const { targetWidget, entityId } = resolveCoverTargetContext(widget);
    const safePosition = clampPercent(position);
    if (canCallCoverService(entityId)) {
      runCoverCommand({
        entityId,
        key: 'cover-tilt',
        service: 'set_cover_tilt_position',
        payload: { tilt_position: safePosition },
        pending: { tiltPosition: safePosition },
        fields: ['tiltPosition'],
        confirm: (entity) => almostEqual(
          toFiniteNumber(resolveCoverTiltAttribute(entity?.rawAttributes)),
          safePosition,
          1,
        ),
      });
      return;
    }
    if (!targetWidget) {
      return;
    }
    updateWidget(targetWidget.id, (current) => ({
      ...current,
      coverTiltPosition: safePosition,
    }));
    patchLocalCoverEntity(entityId, { tiltPosition: safePosition });
  };

  const confirmQuickLockAuth = () => {
    const quickAction = pendingQuickLockAction;
    if (!quickAction || isLockAuthBusy) {
      return false;
    }
    const rateLimitStatus = getAuthRateLimitStatus(quickLockAuthAttemptState);
    if (rateLimitStatus.isLocked) {
      return false;
    }
    const submittedCode = quickAlarmAuthCode.trim();
    if (!submittedCode) {
      setQuickAlarmSubmissionError(t('home.security.enterCode'));
      return false;
    }
    if (submittedCode !== quickAction.unlockCode) {
      setQuickAlarmSubmissionError(t('home.security.unauthorized'));
      setQuickLockAuthAttemptState(recordAuthFailure(quickLockAuthAttemptState));
      appendSecurityAuditEvent({
        tone: 'warning',
        message: 'Autorizzazione locale serratura non completata.',
        context: quickAction.widget.entityId || quickAction.widget.title,
      });
      return false;
    }
    setQuickLockAuthAttemptState(recordAuthSuccess());
    if (quickAction.action === 'open') {
      openDoor(quickAction.unlockCode, quickAction.widget);
    } else {
      unlockDoor(quickAction.unlockCode, quickAction.widget);
    }
    setPendingQuickLockAction(null);
    setQuickAlarmAuthCode('');
    setQuickAlarmSubmissionError('');
    return true;
  };

  const runHaCoordinatedCommand = ({
    key,
    entityId,
    domain,
    service,
    payload = {},
    timeoutMs,
    confirmation = 'entity_state',
    confirm,
    errorMessage,
  }: {
    key: string;
    entityId: string;
    domain: string;
    service: string;
    payload?: Record<string, unknown>;
    timeoutMs: number;
    confirmation?: 'entity_state' | 'service_response';
    confirm?: (entity: MockEntityState | undefined) => boolean;
    errorMessage: string;
  }) => {
    return commandCoordinator.run({
      key: `${key}:${entityId}`,
      entityId,
      domain,
      service,
      timeoutMs,
      confirmation,
      send: () => callHaService(domain, service, { entity_id: entityId, ...payload }),
      confirm,
      onRollback: (reason) => reportUnconfirmedCommand(reason, errorMessage),
    });
  };

  const {
    startVacuum,
    pauseVacuum,
    stopVacuum,
    returnVacuumToBase,
    locateVacuum,
    cleanVacuumSpot,
    cleanVacuumArea,
    setVacuumFanSpeed,
    sendVacuumCommand,
    toggleVacuumStartPause,
    controlVacuumRelatedEntity,
  } = useVacuumCommands({
    activeWidget,
    isHaConnected,
    haStates,
    haStatesForUi,
    vacuumStateMocks,
    setVacuumStateMocks,
    setWidgets,
    updateWidget,
    commandCoordinator,
    callHaService,
    runHaCoordinatedCommand,
    reportUnconfirmedCommand,
    vacuumReturnToBaseTimeoutRef,
  });

  const {
    toggleMediaPlayback,
    toggleMediaPower,
    previousMediaTrack,
    nextMediaTrack,
    stopMediaPlayback,
    clearMediaPlaylist,
    seekMediaPosition,
    setMediaVolume,
    toggleMediaMute,
    toggleMediaShuffle,
    cycleMediaRepeatMode,
    selectMediaOutputDevice,
    selectMediaSoundMode,
    playMedia,
    toggleMediaGroupMember,
  } = useMediaCommands({
    activeWidget,
    isHaConnected,
    haStatesForUi,
    updateWidget,
    resolveMediaLayout,
    runHaCoordinatedCommand,
    contextSpeaker,
    isSpeakerPlaying: state.speaker.isPlaying,
    speakerActions: actions,
  });

  const toggleMicroWidgetEntity = (entityId: string, nextActive: boolean) => {
    const normalizedEntityId = entityId.trim();
    if (!normalizedEntityId) {
      return;
    }
    if (!isHaConnected) {
      return;
    }

    const domain = normalizedEntityId.split('.')[0]?.trim().toLowerCase();
    if (domain === 'button' || domain === 'input_button') {
      if (!nextActive) {
        return;
      }
      runHaCoordinatedCommand({
        key: 'micro-press',
        entityId: normalizedEntityId,
        domain,
        service: 'press',
        timeoutMs: MEDIA_COMMAND_TTL_MS,
        confirmation: 'service_response',
        errorMessage: t('home.command.quickRejected'),
      });
      return;
    }

    if (domain === 'lock' && !nextActive) {
      addNotification('warning', t('home.command.openLockCard'));
      return;
    }

    const genericService = nextActive ? 'turn_on' : 'turn_off';
    const domainService = (() => {
      switch (domain) {
        case 'cover':
          return nextActive ? 'open_cover' : 'close_cover';
        case 'lock':
          return nextActive ? 'lock' : 'unlock';
        case 'vacuum':
          return nextActive ? 'start' : 'pause';
        default:
          return genericService;
      }
    })();

    const primaryDomain =
      domain === 'cover' || domain === 'lock' || domain === 'vacuum'
        ? domain
        : domain || 'homeassistant';

    void commandCoordinator.run({
      key: `micro-toggle:${normalizedEntityId}`,
      entityId: normalizedEntityId,
      domain: primaryDomain,
      service: domainService,
      timeoutMs: MEDIA_COMMAND_TTL_MS,
      send: async () => {
        const primaryOk = await callHaService(primaryDomain, domainService, {
          entity_id: normalizedEntityId,
        });
        if (primaryOk) return true;
        const fallbackOk = await callHaService('homeassistant', genericService, {
          entity_id: normalizedEntityId,
        });
        if (fallbackOk) return true;
        return callHaService('homeassistant', 'toggle', { entity_id: normalizedEntityId });
      },
      confirm: (entity) => {
        const state = normalizeLower(toTrimmedString(entity?.state) ?? toTrimmedString(entity?.stateLabel));
        if (domain === 'cover') return nextActive ? state === 'open' : state === 'closed';
        if (domain === 'lock') return state === 'locked';
        if (domain === 'vacuum') return nextActive ? state === 'cleaning' : state === 'paused';
        const isOn = typeof entity?.toggleOn === 'boolean' ? entity.toggleOn : state === 'on';
        return isOn === nextActive;
      },
      onRollback: (reason) => reportUnconfirmedCommand(reason, 'Il controllo rapido non ha confermato il nuovo stato.'),
    });
  };

  const setMicroSliderEntityValue = (entityId: string, value: number) => {
    const normalizedEntityId = entityId.trim();
    if (!normalizedEntityId || !Number.isFinite(value) || !isHaConnected) {
      return;
    }
    const domain = normalizedEntityId.split('.')[0]?.trim().toLowerCase();
    const serviceDomain = domain === 'input_number' || domain === 'number' ? domain : null;
    if (!serviceDomain) {
      return;
    }

    runHaCoordinatedCommand({
      key: 'micro-value',
      entityId: normalizedEntityId,
      domain: serviceDomain,
      service: 'set_value',
      payload: { value },
      timeoutMs: MEDIA_COMMAND_TTL_MS,
      confirm: (entity) => almostEqual(
        toFiniteNumber(entity?.numericValue) ?? toFiniteNumber(entity?.state),
        value,
      ),
      errorMessage: 'Il controllo rapido non ha confermato il nuovo valore.',
    });
  };

  const buildCameraPtzMovePayloads = (
    entityId: string,
    direction: CameraPtzDirection,
    serviceTarget: CameraPtzServiceTarget,
  ) => {
    const vector = CAMERA_PTZ_DIRECTION_VECTORS[direction];
    const hasField = (field: string) => serviceTarget.fields.has(field);
    const payloads: Array<Record<string, unknown>> = [];
    const basePayload: Record<string, unknown> = { entity_id: entityId };

    if (hasField('movement')) {
      payloads.push({ ...basePayload, movement: vector.movement });
      payloads.push({ ...basePayload, movement: vector.movement.toUpperCase() });
      payloads.push({ ...basePayload, movement: vector.movement.replace('_', '-') });
    }

    const panField = hasField('pan_velocity') ? 'pan_velocity' : hasField('pan') ? 'pan' : undefined;
    const tiltField = hasField('tilt_velocity') ? 'tilt_velocity' : hasField('tilt') ? 'tilt' : undefined;
    const zoomField = hasField('zoom_velocity') ? 'zoom_velocity' : hasField('zoom') ? 'zoom' : undefined;
    const dynamicPayload: Record<string, unknown> = { ...basePayload };

    if (panField) {
      dynamicPayload[panField] = vector.pan;
    }
    if (tiltField) {
      dynamicPayload[tiltField] = vector.tilt;
    }
    if (zoomField) {
      dynamicPayload[zoomField] = 0;
    }
    if (hasField('distance')) {
      dynamicPayload.distance = 0.15;
    }
    if (hasField('speed')) {
      dynamicPayload.speed = 0.5;
    }
    if (hasField('move_mode')) {
      dynamicPayload.move_mode = 'ContinuousMove';
    }
    if (hasField('continuous_duration')) {
      dynamicPayload.continuous_duration = 0.5;
    }
    if (Object.keys(dynamicPayload).length > 1) {
      payloads.push(dynamicPayload);
    }

    payloads.push({
      ...basePayload,
      pan: vector.pan,
      tilt: vector.tilt,
      zoom: 0,
      speed: 0.5,
      move_mode: 'ContinuousMove',
    });

    const seen = new Set<string>();
    return payloads.filter((payload) => {
      const key = JSON.stringify(payload);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  };

  const buildCameraPtzStopPayloads = (
    entityId: string,
    serviceTarget: CameraPtzServiceTarget,
  ) => {
    const hasField = (field: string) => serviceTarget.fields.has(field);
    const payloads: Array<Record<string, unknown>> = [];
    const basePayload: Record<string, unknown> = { entity_id: entityId };

    if (hasField('movement')) {
      payloads.push({ ...basePayload, movement: 'stop' });
      payloads.push({ ...basePayload, movement: 'STOP' });
    }

    const panField = hasField('pan_velocity') ? 'pan_velocity' : hasField('pan') ? 'pan' : undefined;
    const tiltField = hasField('tilt_velocity') ? 'tilt_velocity' : hasField('tilt') ? 'tilt' : undefined;
    const zoomField = hasField('zoom_velocity') ? 'zoom_velocity' : hasField('zoom') ? 'zoom' : undefined;
    const dynamicPayload: Record<string, unknown> = { ...basePayload };

    if (panField) {
      dynamicPayload[panField] = 0;
    }
    if (tiltField) {
      dynamicPayload[tiltField] = 0;
    }
    if (zoomField) {
      dynamicPayload[zoomField] = 0;
    }
    if (hasField('move_mode')) {
      dynamicPayload.move_mode = 'Stop';
    }
    if (Object.keys(dynamicPayload).length > 1) {
      payloads.push(dynamicPayload);
    }

    payloads.push({ ...basePayload, move_mode: 'Stop' });
    payloads.push({ ...basePayload, movement: 'stop' });

    const seen = new Set<string>();
    return payloads.filter((payload) => {
      const key = JSON.stringify(payload);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  };

  const runCameraPtzPayloads = async (
    serviceTarget: CameraPtzServiceTarget,
    payloads: Array<Record<string, unknown>>,
  ) => {
    for (const payload of payloads) {
      const success = await callHaService(serviceTarget.domain, serviceTarget.service, payload);
      if (success) {
        return true;
      }
    }
    return false;
  };

  const runCameraPtzButtonPresses = async (entityIds: string[]) => {
    let success = false;
    for (const buttonEntityId of entityIds) {
      const pressed = await callHaService('button', 'press', {
        entity_id: buttonEntityId,
      });
      if (pressed) {
        success = true;
      }
    }
    return success;
  };

  const resolveCameraPtzTargets = () => {
    if (cameraPtzServiceTarget) {
      return [cameraPtzServiceTarget];
    }
    return CAMERA_PTZ_SERVICE_CANDIDATES.map((candidate) => ({
      domain: candidate.domain,
      service: candidate.service,
      fields: new Set<string>(),
    }));
  };

  const moveCameraPtz = (direction: CameraPtzDirection, requestedEntityId?: string) => {
    if (!isHaConnected) {
      return;
    }
    const targetWidget = activeWidget?.kind === 'camera' ? activeWidget : undefined;
    const entityId = (requestedEntityId ?? contextCamera.entityId ?? targetWidget?.entityId ?? '').trim();
    const liveEntity = haStatesForUi[entityId];
    const rawAttributes = liveEntity?.rawAttributes;
    const cameraEntityId =
      toTrimmedString(rawAttributes?.camera_entity_id) ??
      toTrimmedString(rawAttributes?.entity_id) ??
      entityId;
    const cameraFriendlyName =
      toTrimmedString(rawAttributes?.friendly_name) ??
      targetWidget?.title ??
      entityId;
    const targetPtzButtons = resolveCameraPtzButtons(cameraEntityId, cameraFriendlyName, haStatesForUi);
    const targetHasPtzButtons = hasAnyCameraPtzButton(targetPtzButtons);
    const targetSupportsPtz = targetHasPtzButtons || resolveCameraSupportsPtz(cameraEntityId, rawAttributes, haServiceRegistry);
    if (!entityId || !targetSupportsPtz) {
      return;
    }

    const buttonSequence = resolveCameraPtzButtonPressSequence(direction, targetPtzButtons);
    if (buttonSequence.length > 0) {
      cameraPtzControlModeRef.current = 'button';
      void commandCoordinator.run({
        key: `camera-ptz:${entityId}`,
        entityId,
        domain: 'camera',
        service: 'ptz',
        confirmation: 'service_response',
        send: () => runCameraPtzButtonPresses(buttonSequence),
        onRollback: (reason) => reportUnconfirmedCommand(reason, 'La videocamera non ha accettato il movimento PTZ.'),
      });
      return;
    }
    if (targetHasPtzButtons && !cameraPtzServiceTarget) {
      return;
    }

    cameraPtzControlModeRef.current = 'service';
    const serviceTargets = resolveCameraPtzTargets();
    void commandCoordinator.run({
      key: `camera-ptz:${entityId}`,
      entityId,
      domain: 'camera',
      service: 'ptz',
      confirmation: 'service_response',
      send: async () => {
        for (const serviceTarget of serviceTargets) {
          const payloads = buildCameraPtzMovePayloads(entityId, direction, serviceTarget);
          if (await runCameraPtzPayloads(serviceTarget, payloads)) return true;
        }
        return false;
      },
      onRollback: (reason) => reportUnconfirmedCommand(reason, 'La videocamera non ha accettato il movimento PTZ.'),
    });
  };

  const stopCameraPtz = (requestedEntityId?: string) => {
    if (!isHaConnected) {
      return;
    }
    const controlMode = cameraPtzControlModeRef.current;
    if (controlMode === 'button') {
      cameraPtzControlModeRef.current = null;
      return;
    }
    const targetWidget = activeWidget?.kind === 'camera' ? activeWidget : undefined;
    const entityId = (requestedEntityId ?? contextCamera.entityId ?? targetWidget?.entityId ?? '').trim();
    const liveEntity = haStatesForUi[entityId];
    const rawAttributes = liveEntity?.rawAttributes;
    const cameraEntityId =
      toTrimmedString(rawAttributes?.camera_entity_id) ??
      toTrimmedString(rawAttributes?.entity_id) ??
      entityId;
    const cameraFriendlyName =
      toTrimmedString(rawAttributes?.friendly_name) ??
      targetWidget?.title ??
      entityId;
    const targetPtzButtons = resolveCameraPtzButtons(cameraEntityId, cameraFriendlyName, haStatesForUi);
    const targetHasPtzButtons = hasAnyCameraPtzButton(targetPtzButtons);
    const targetSupportsPtz = targetHasPtzButtons || resolveCameraSupportsPtz(cameraEntityId, rawAttributes, haServiceRegistry);
    if (!entityId || !targetSupportsPtz) {
      cameraPtzControlModeRef.current = null;
      return;
    }
    if (targetHasPtzButtons && !cameraPtzServiceTarget) {
      cameraPtzControlModeRef.current = null;
      return;
    }
    const serviceTargets = resolveCameraPtzTargets();
    void commandCoordinator.run({
      key: `camera-ptz:${entityId}`,
      entityId,
      domain: 'camera',
      service: 'ptz_stop',
      confirmation: 'service_response',
      send: async () => {
        for (const serviceTarget of serviceTargets) {
          const payloads = buildCameraPtzStopPayloads(entityId, serviceTarget);
          if (await runCameraPtzPayloads(serviceTarget, payloads)) return true;
        }
        return false;
      },
      onConfirmed: () => {
        cameraPtzControlModeRef.current = null;
      },
      onRollback: (reason) => {
        cameraPtzControlModeRef.current = null;
        reportUnconfirmedCommand(reason, 'La videocamera non ha accettato l’arresto PTZ.');
      },
    });
  };

  const runCameraRelatedEntityAction = async (request: CameraRelatedEntityActionRequest) => {
    const entityId = request.entity.entityId.trim();
    const domain = entityId.split('.')[0]?.trim();
    if (!entityId || !domain) {
      return false;
    }

    const isLocalCameraMock =
      effectiveRuntimeMode === 'demo' &&
      activeWidget?.dataSource === 'mock' &&
      Boolean(cameraStateMocks[entityId]) &&
      !haStates[entityId];
    if (isLocalCameraMock) {
      const current = cameraStateMocks[entityId];
      if (!current) return false;
      if (request.action === 'toggle') {
        const nextOn = !Boolean(current.toggleOn ?? toBoolean(current.state));
        setCameraStateMocks((states) => ({
          ...states,
          [entityId]: {
            ...states[entityId],
            state: nextOn ? 'on' : 'off',
            stateLabel: nextOn ? 'Attivo' : 'Disattivato',
            toggleOn: nextOn,
          },
        }));
        return true;
      }
      if (request.action === 'select' && typeof request.value === 'string') {
        setCameraStateMocks((states) => ({
          ...states,
          [entityId]: { ...states[entityId], state: request.value as string, stateLabel: request.value as string },
        }));
        return true;
      }
      if (request.action === 'set_value') {
        const value = toFiniteNumber(request.value);
        if (value === undefined) return false;
        setCameraStateMocks((states) => ({
          ...states,
          [entityId]: { ...states[entityId], state: `${value}`, stateLabel: `${value}`, numericValue: value },
        }));
        return true;
      }
      if (request.action === 'press') {
        const timestamp = new Date().toISOString();
        setCameraStateMocks((states) => {
          const camera = states[CAMERA_MAX_COMPAT_MOCK_ENTITY_ID];
          const cameraAttributes = { ...(camera?.rawAttributes ?? {}) };
          const previousEvents = Array.isArray(cameraAttributes.event_log) ? cameraAttributes.event_log : [];
          cameraAttributes.event_log = [
            {
              title: 'Istantanea acquisita',
              type: 'motion',
              timestamp,
              thumbnail_url: camera?.imageUrl,
            },
            ...previousEvents,
          ].slice(0, 20);
          return {
            ...states,
            [entityId]: { ...states[entityId], state: timestamp, stateLabel: 'Eseguito' },
            [CAMERA_MAX_COMPAT_MOCK_ENTITY_ID]: { ...camera, rawAttributes: cameraAttributes },
          };
        });
        return true;
      }
      return false;
    }

    if (!isHaConnected) {
      return false;
    }

    if (request.action === 'press') {
      if (domain !== 'button' && domain !== 'input_button') {
        return false;
      }
      return runHaCoordinatedCommand({
        key: 'camera-related-press',
        entityId,
        domain,
        service: 'press',
        timeoutMs: MEDIA_COMMAND_TTL_MS,
        confirmation: 'service_response',
        errorMessage: 'Il controllo della videocamera non ha accettato il comando.',
      });
    }

    if (request.action === 'select') {
      const option = toTrimmedString(request.value);
      if (!option || (domain !== 'select' && domain !== 'input_select')) {
        return false;
      }
      return runHaCoordinatedCommand({
        key: 'camera-related-select',
        entityId,
        domain,
        service: 'select_option',
        payload: { option },
        timeoutMs: MEDIA_COMMAND_TTL_MS,
        confirm: (entity) => normalizeLower(toTrimmedString(entity?.state)) === normalizeLower(option),
        errorMessage: 'Il controllo della videocamera non ha confermato la selezione.',
      });
    }

    if (request.action === 'set_value') {
      const value = toFiniteNumber(request.value);
      if (value === undefined || (domain !== 'number' && domain !== 'input_number')) {
        return false;
      }
      return runHaCoordinatedCommand({
        key: 'camera-related-value',
        entityId,
        domain,
        service: 'set_value',
        payload: { value },
        timeoutMs: MEDIA_COMMAND_TTL_MS,
        confirm: (entity) => almostEqual(
          toFiniteNumber(entity?.numericValue) ?? toFiniteNumber(entity?.state),
          value,
        ),
        errorMessage: 'Il controllo della videocamera non ha confermato il valore.',
      });
    }

    if (request.action === 'toggle') {
      const liveEntity = haStatesForUi[entityId] ?? haStatesForUi[entityId.toLowerCase()];
      const rawState = toTrimmedString(liveEntity?.state) ?? request.entity.state;
      const normalizedState = normalizeLower(rawState);
      const currentIsOn =
        toBoolean(rawState) ??
        ['open', 'opening', 'playing', 'recording', 'detected', 'active', 'home'].includes(normalizedState);
      const nextService = currentIsOn ? 'turn_off' : 'turn_on';
      const serviceDomain = domain === 'switch' || domain === 'input_boolean' || domain === 'light' || domain === 'fan' || domain === 'siren'
        ? domain
        : 'homeassistant';
      const service = serviceDomain === 'homeassistant' ? 'toggle' : nextService;
      return commandCoordinator.run({
        key: `camera-related-toggle:${entityId}`,
        entityId,
        domain: serviceDomain,
        service,
        timeoutMs: MEDIA_COMMAND_TTL_MS,
        send: () => callHaService(serviceDomain, service, { entity_id: entityId }),
        confirm: (entity) => {
          const state = normalizeLower(toTrimmedString(entity?.state));
          const nextIsOn = typeof entity?.toggleOn === 'boolean'
            ? entity.toggleOn
            : ['on', 'open', 'playing', 'recording', 'detected', 'active', 'home'].includes(state);
          return nextIsOn === !currentIsOn;
        },
        onRollback: (reason) => reportUnconfirmedCommand(reason, 'Il controllo della videocamera non ha confermato il nuovo stato.'),
      });
    }

    return false;
  };

  const loadSensorHistory = useCallback(
    async (entityId: string) => {
      const normalizedEntityId = entityId.trim();
      if (!normalizedEntityId || !isHaConnected) {
        return null;
      }
      if (sensorHistoryInFlightRef.current[normalizedEntityId]) {
        return null;
      }
      sensorHistoryInFlightRef.current[normalizedEntityId] = true;
      try {
        const endTime = new Date();
        const startTime = new Date(endTime.getTime() - SENSOR_HISTORY_WINDOW_HOURS * 60 * 60 * 1000);
        const payload = await callHaApi<unknown>(
          {
            type: 'history/history_during_period',
            start_time: startTime.toISOString(),
            end_time: endTime.toISOString(),
            entity_ids: [normalizedEntityId],
            include_start_time_state: true,
            significant_changes_only: false,
            minimal_response: true,
            no_attributes: true,
          },
          { reportError: false },
        );
        if (payload === null) {
          return null;
        }
        const nextHistory = extractSensorHistoryValues(payload, normalizedEntityId, SENSOR_HISTORY_MAX_POINTS);
        setSensorHistoryByEntity((current) =>
          sameNumberSeries(current[normalizedEntityId], nextHistory)
            ? current
            : { ...current, [normalizedEntityId]: nextHistory },
        );
        return nextHistory;
      } finally {
        delete sensorHistoryInFlightRef.current[normalizedEntityId];
      }
    },
    [callHaApi, isHaConnected],
  );

  const loadSensorHistoryFromRest = useCallback(
    async (entityId: string) => {
      const normalizedEntityId = entityId.trim();
      const normalizedUrl = normalizeHassUrl(haUrl);
      const token = haToken.trim();
      if (!normalizedEntityId || !normalizedUrl || !token || !isHaConnected) {
        return null;
      }

      const requestKey = `${normalizedEntityId}:rest`;
      if (sensorHistoryInFlightRef.current[requestKey]) {
        return null;
      }

      sensorHistoryInFlightRef.current[requestKey] = true;
      try {
        const endTime = new Date();
        const startTime = new Date(endTime.getTime() - SENSOR_HISTORY_WINDOW_HOURS * 60 * 60 * 1000);
        const endpoint = new URL(`${normalizedUrl}/api/history/period/${encodeURIComponent(startTime.toISOString())}`);
        endpoint.searchParams.set('filter_entity_id', normalizedEntityId);
        endpoint.searchParams.set('end_time', endTime.toISOString());
        endpoint.searchParams.set('minimal_response', '1');
        endpoint.searchParams.set('no_attributes', '1');
        endpoint.searchParams.set('significant_changes_only', '0');

        const response = await fetch(endpoint.toString(), {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
        if (!response.ok) {
          return null;
        }

        const payload = (await response.json()) as unknown;
        const nextHistory = extractSensorHistoryValues(payload, normalizedEntityId, SENSOR_HISTORY_MAX_POINTS);
        setSensorHistoryByEntity((current) =>
          sameNumberSeries(current[normalizedEntityId], nextHistory)
            ? current
            : { ...current, [normalizedEntityId]: nextHistory },
        );
        return nextHistory;
      } catch {
        return null;
      } finally {
        delete sensorHistoryInFlightRef.current[requestKey];
      }
    },
    [haToken, haUrl, isHaConnected],
  );

  const serverPerformanceHistoryEntityIds = useMemo(
    () =>
      Object.entries(haStatesForUi)
        .filter(([entityId, entity]) => {
          if (!entityId.startsWith('sensor.')) {
            return false;
          }
          const attributes = entity.rawAttributes ?? {};
          const haystack = `${entityId} ${String(attributes.friendly_name ?? '')} ${String(attributes.device_class ?? '')}`.toLowerCase();
          const isProcessorSensor = haystack.includes('processor') || haystack.includes('processore') || haystack.includes('cpu');
          const isProcessorTemperature =
            isProcessorSensor &&
            (haystack.includes('temperature') || haystack.includes('temperatura') || haystack.includes('temp'));
          return isProcessorSensor || isProcessorTemperature;
        })
        .map(([entityId]) => entityId.trim())
        .filter((entityId) => entityId.length > 0),
    [haStatesForUi],
  );

  useEffect(() => {
    if (!isHaConnected) {
      return;
    }
    const historyEntityIds = Array.from(
      new Set(
        [
          ...widgets
          .filter((widget) => widget.kind === 'sensor')
          .map((widget) => widget.entityId.trim())
          .filter((entityId) => entityId.length > 0),
          ...widgets.flatMap((widget) =>
            (widget.widgets ?? [])
              .filter((microWidget) => microWidget.type === 'micro_superchart')
              .map((microWidget) => microWidget.entity.trim())
              .filter((entityId) => entityId.length > 0),
          ),
          ...widgets
            .filter((widget) => widget.kind === 'switch')
            .map((widget) => widget.switchConsumptionEntityId?.trim() ?? '')
            .filter((entityId) => entityId.length > 0),
          ...serverPerformanceHistoryEntityIds,
        ],
      ),
    );
    historyEntityIds.forEach((entityId) => {
      const cached = sensorHistoryByEntity[entityId];
      if (cached && cached.length >= 3) {
        return;
      }
      if (serverPerformanceHistoryEntityIds.includes(entityId)) {
        void loadSensorHistoryFromRest(entityId).then((nextHistory) => {
          if (nextHistory && nextHistory.length >= 2) {
            return;
          }
          void loadSensorHistory(entityId);
        });
        return;
      }
      void loadSensorHistory(entityId);
    });
  }, [
    isHaConnected,
    loadSensorHistory,
    loadSensorHistoryFromRest,
    sensorHistoryByEntity,
    serverPerformanceHistoryEntityIds,
    widgets,
  ]);

  const openLiveControls = (widget: Widget) => {
    void loadRightSidebarManager();
    const liveEntity = isHaConnected ? haStatesForUi[widget.entityId] : undefined;
    const microWidgets = widget.widgets ?? [];

    if (widget.kind === 'members') {
      setActiveDevice({
        id: widget.id,
        type: 'members',
        name: widget.title || 'Members',
        microWidgets,
        status:
          membersLiveMapPoints.length > 0
            ? `${membersLiveMapPoints.length} posizioni rilevate`
            : t('home.location.none'),
        membersMapPoints: membersLiveMapPoints,
      });
      return;
    }

    if (widget.kind === 'camera') {
      const rawAttributes = liveEntity?.rawAttributes;
      const stateValue = normalizeCameraState(
        toTrimmedString(liveEntity?.stateLabel) ??
          toTrimmedString(liveEntity?.state) ??
          widget.status,
      );
      setActiveDevice({
        id: widget.id,
        type: 'camera',
        name:
          widget.title ||
          toTrimmedString(rawAttributes?.friendly_name) ||
          'Camera',
        microWidgets,
        status: isCameraOfflineState(stateValue) ? 'Offline' : 'Live',
      });
      return;
    }

    if (widget.kind === 'sensor') {
      const sensorMeta = resolveSensorMeta(widget, liveEntity, haStatesForUi, locale);
      const sensorHistory = sensorHistoryByEntity[widget.entityId] ?? [];
      setActiveDevice({
        id: widget.id,
        type: 'sensor',
        name: widget.title,
        microWidgets,
        status: sensorMeta.status,
        sensorValue:
          typeof liveEntity?.numericValue === 'number' && Number.isFinite(liveEntity.numericValue)
            ? liveEntity.numericValue
            : undefined,
        sensorUnit: liveEntity?.unit ?? widget.unit,
        sensorEntityId: widget.entityId,
        sensorDeviceClass:
          typeof liveEntity?.rawAttributes?.device_class === 'string'
            ? liveEntity.rawAttributes.device_class
            : undefined,
        sensorDisplayPrecision: resolveSensorDisplayPrecision(
          widget.sensorDisplayPrecision,
          liveEntity?.rawAttributes,
          liveEntity?.unit ?? widget.unit,
        ),
        sensorHistory,
        sensorBattery: sensorMeta.battery,
        sensorConnection: sensorMeta.connection,
        sensorConnectionState: sensorMeta.connectionState,
      });
      if (isHaConnected) {
        void loadSensorHistory(widget.entityId).then((nextHistory) => {
          if (!nextHistory) {
            return;
          }
          setActiveDevice((current) => {
            if (!current || current.type !== 'sensor' || current.id !== widget.id) {
              return current;
            }
            if (sameNumberSeries(current.sensorHistory, nextHistory)) {
              return current;
            }
            return {
              ...current,
              sensorHistory: nextHistory,
            };
          });
        });
      }
      return;
    }

    if (widget.kind === 'light') {
      toggleLightEntity(widget);
    }

    if (widget.kind === 'switch') {
      const rawAttributes = liveEntity?.rawAttributes;
      const stateValue = normalizeLower(
        typeof liveEntity?.toggleOn === 'boolean'
          ? liveEntity.toggleOn
            ? 'on'
            : 'off'
          : liveEntity?.stateLabel ?? liveEntity?.state ?? widget.status,
      );
      setActiveDevice({
        id: widget.id,
        type: 'switch',
        name:
          widget.title ||
          toTrimmedString(rawAttributes?.friendly_name) ||
          'Switch',
        microWidgets,
        status:
          stateValue === 'on'
            ? 'Acceso'
            : stateValue === 'off'
              ? 'Spento'
              : stateValue === 'unavailable'
                ? 'Non disponibile'
                : t('home.state.unknown'),
        switchEntityId: widget.entityId,
        switchConsumptionEntityId: widget.switchConsumptionEntityId,
      });
      return;
    }
    if (widget.kind === 'alarm') {
      const rawAttributes = liveEntity?.rawAttributes;
      const supportedFeatures = resolveAlarmSupportedFeatures(liveEntity);
      const stateValue = normalizeAlarmState(
        toTrimmedString(liveEntity?.state) ??
          toTrimmedString(liveEntity?.stateLabel) ??
          widget.status,
      );
      setActiveDevice({
        id: widget.id,
        type: 'alarm',
        name:
          widget.title ||
          toTrimmedString(rawAttributes?.friendly_name) ||
          'Allarme',
        microWidgets,
        status: stateValue,
        alarmState: stateValue,
        alarmCodeRequired: typeof rawAttributes?.code_arm_required === 'boolean' ? rawAttributes.code_arm_required : false,
        alarmChangedBy: toTrimmedString(rawAttributes?.changed_by),
        alarmSupportedFeatures: supportedFeatures,
      });
      return;
    }

    if (widget.kind === 'vacuum') {
      const useDemoData = !liveEntity && isDemoVacuumEntity(widget.entityId);
      const sourceAttributes = liveEntity?.rawAttributes ?? buildFallbackVacuumAttributes(widget, useDemoData);
      const normalizedState = normalizeVacuumState(
        toTrimmedString(liveEntity?.stateLabel) ??
          toTrimmedString(liveEntity?.state) ??
          widget.status,
      );
      setActiveDevice({
        id: widget.id,
        type: 'vacuum',
        name:
          widget.title ||
          toTrimmedString(sourceAttributes?.friendly_name) ||
          'Robot Vacuum',
        microWidgets,
        status: toTrimmedString(sourceAttributes?.status) ?? translateVacuumState(normalizedState),
        vacuumState: normalizedState,
        vacuumBatteryLevel:
          toFiniteNumber(sourceAttributes?.battery_level) ??
          toFiniteNumber(sourceAttributes?.battery) ??
          toFiniteNumber(widget.value),
        vacuumFanSpeed:
          toTrimmedString(sourceAttributes?.fan_speed) ??
          toTrimmedString(sourceAttributes?.fan_mode) ??
          toTrimmedString(widget.vacuumFanSpeed),
        vacuumMapUrl: resolveVacuumMapUrl(liveEntity, haUrl) ?? toTrimmedString(sourceAttributes?.map_url),
      });
      return;
    }

    if (widget.kind === 'lock') {
      const rawAttributes = liveEntity?.rawAttributes;
      const stateValue = normalizeLockState(
        toTrimmedString(liveEntity?.state) ??
          toTrimmedString(liveEntity?.stateLabel) ??
          widget.status,
      );
      const supportedFeatures =
        typeof liveEntity?.supportedFeatures === 'number'
          ? liveEntity.supportedFeatures
          : toFiniteNumber(rawAttributes?.supported_features);
      const supportsOpen = typeof supportedFeatures === 'number' && (supportedFeatures & LOCK_FEATURE_OPEN) !== 0;

      setActiveDevice({
        id: widget.id,
        type: 'lock',
        name:
          widget.title ||
          toTrimmedString(rawAttributes?.friendly_name) ||
          t('home.lock'),
        microWidgets,
        status: translateLockState(stateValue),
        lockState: stateValue,
        lockChangedBy: toTrimmedString(rawAttributes?.changed_by),
        lockSupportsOpen: supportsOpen,
      });
      return;
    }

    if (widget.kind === 'cover') {
      const rawAttributes = liveEntity?.rawAttributes ?? buildFallbackCoverAttributes(widget);
      const stateValue = normalizeCoverState(
        toTrimmedString(liveEntity?.state) ??
          toTrimmedString(liveEntity?.stateLabel) ??
          widget.status,
      );
      const position = resolveCoverPosition(
        stateValue,
        resolveCoverPositionAttribute(rawAttributes) ?? widget.value,
        typeof widget.value === 'number' ? widget.value : 70,
      );
      const tiltPosition = resolveCoverTiltPosition(
        resolveCoverTiltAttribute(rawAttributes) ?? widget.coverTiltPosition,
        typeof widget.coverTiltPosition === 'number' ? widget.coverTiltPosition : 50,
      );
      const supportedFeatures = resolveCoverSupportedFeatures(liveEntity);

      setActiveDevice({
        id: widget.id,
        type: 'cover',
        name:
          widget.title ||
          toTrimmedString(rawAttributes?.friendly_name) ||
          'Tapparella',
        microWidgets,
        status: `${translateCoverState(stateValue)} ${position}%`,
        coverState: stateValue,
        coverPosition: position,
        coverTiltPosition: tiltPosition,
        coverSupportedFeatures: supportedFeatures,
      });
      return;
    }

    setActiveDevice({
      id: widget.id,
      type: widget.kind,
      name: widget.title,
      microWidgets,
      status: liveEntity?.stateLabel ?? liveEntity?.state ?? widget.status,
    } as ActiveDevice);
  };

  const clearContextSelection = () => {
    setActiveDevice(null);
    setSelectedWidgetId(null);
    setSelectedSectionId(null);
    setSelectedSidebarPathId(null);
  };

  const openWeatherControls = () => {
    void loadRightSidebarManager();
    setSelectedWidgetId(null);
    setSelectedSectionId(null);
    setSelectedSidebarPathId(null);
    setActiveDevice({
      id: 'weather.home',
      type: 'weather',
      name: state.weather.location,
      status: state.weather.condition,
    });
  };

  useEffect(() => {
    if (!isHaConnected) {
      setRunningSceneBySectionId((current) =>
        Object.keys(current).length > 0 ? {} : current,
      );
      return;
    }

    setRunningSceneBySectionId((current) => {
      if (Object.keys(current).length === 0) {
        return current;
      }

      const now = Date.now();
      let changed = false;
      const next: Partial<Record<string, SceneRunState>> = { ...current };

      Object.entries(current).forEach(([sectionId, runningScene]) => {
        if (!runningScene || runningScene.actionType !== 'script' || !runningScene.scriptEntityId) {
          return;
        }

        const scriptState = haStates[runningScene.scriptEntityId]?.state?.toLowerCase().trim() ?? '';
        const isScriptRunning = scriptState === 'on' || scriptState === 'running' || scriptState === 'triggered';

        if (isScriptRunning) {
          if (!runningScene.observedRunning) {
            next[sectionId] = {
              ...runningScene,
              observedRunning: true,
            };
            changed = true;
          }
          return;
        }

        if (runningScene.observedRunning) {
          delete next[sectionId];
          changed = true;
          return;
        }

        if (now - runningScene.startedAt > SCENE_SCRIPT_START_GRACE_MS) {
          delete next[sectionId];
          changed = true;
        }
      });

      return changed ? next : current;
    });
  }, [haStates, isHaConnected]);

  const triggerSceneAction = async (section: DashboardSection, sceneId: SceneKey) => {
    if (isEditMode || section.kind !== 'scenes') {
      return;
    }
    if (runningSceneBySectionId[section.id]) {
      return;
    }

    const sceneLabel = section.sceneLabels?.[sceneId]?.trim() || sceneId.replace(/-/g, ' ');
    if (!isHaConnected) {
      addNotification('warning', 'Connetti Home Assistant per eseguire le azioni delle scene.');
      return;
    }

    const actionConfig = section.sceneActions?.[sceneId];
    const actionType = actionConfig?.type === 'service' ? 'service' : 'script';

    if (actionType === 'service') {
      const configuredService = actionConfig?.service?.trim() ?? '';
      const dotIndex = configuredService.indexOf('.');
      if (!configuredService || dotIndex <= 0 || dotIndex === configuredService.length - 1) {
        addNotification(
          'warning',
          `Servizio non valido per la scena "${sceneLabel}". Usa formato dominio.servizio (es. light.turn_on).`,
        );
        return;
      }

      const domain = configuredService.slice(0, dotIndex);
      const service = configuredService.slice(dotIndex + 1);
      const payloadText = actionConfig?.payloadJson?.trim() ?? '';
      let serviceData: Record<string, unknown> = {};

      if (payloadText.length > 0) {
        try {
          const parsedPayload = JSON.parse(payloadText);
          if (!parsedPayload || typeof parsedPayload !== 'object' || Array.isArray(parsedPayload)) {
            addNotification('alert', `Payload JSON non valido per la scena "${sceneLabel}".`);
            return;
          }
          serviceData = { ...(parsedPayload as Record<string, unknown>) };
        } catch {
          addNotification('alert', `Payload JSON non valido per la scena "${sceneLabel}".`);
          return;
        }
      }

      const configuredEntityId = actionConfig?.entityId?.trim();
      if (configuredEntityId.length && serviceData.entity_id === undefined) {
        serviceData.entity_id = configuredEntityId;
      }

      const startedAt = Date.now();
      setRunningSceneBySectionId((current) => ({
        ...current,
        [section.id]: {
          sceneId,
          startedAt,
          actionType: 'service',
        },
      }));
      let serviceOk = false;
      try {
        serviceOk = await callHaService(domain, service, serviceData);
      } finally {
        setRunningSceneBySectionId((current) => {
          const runningScene = current[section.id];
          if (!runningScene || runningScene.sceneId !== sceneId) {
            return current;
          }
          const next = { ...current };
          delete next[section.id];
          return next;
        });
      }
      if (!serviceOk) {
        addNotification('alert', `Azione scena "${sceneLabel}" non riuscita.`);
      }
      return;
    }

    const configuredScript = actionConfig?.scriptEntityId?.trim() ?? section.sceneScripts?.[sceneId]?.trim() ?? '';
    if (!configuredScript) {
      addNotification('warning', t('home.scene.noScript', { scene: sceneLabel }));
      return;
    }

    const scriptEntityId = configuredScript.startsWith('script.') ? configuredScript : `script.${configuredScript}`;
    const startedAt = Date.now();
    setRunningSceneBySectionId((current) => ({
      ...current,
      [section.id]: {
        sceneId,
        startedAt,
        actionType: 'script',
        scriptEntityId,
        observedRunning: false,
      },
    }));
    let scriptOk = false;
    scriptOk = await callHaService('script', 'turn_on', { entity_id: scriptEntityId });
    if (!scriptOk) {
      setRunningSceneBySectionId((current) => {
        const runningScene = current[section.id];
        if (!runningScene || runningScene.sceneId !== sceneId) {
          return current;
        }
        const next = { ...current };
        delete next[section.id];
        return next;
      });
      addNotification('alert', `Esecuzione scena "${sceneLabel}" non riuscita.`);
    }
  };

  const handleWidgetClick = (widget: Widget) => {
    if (isEditMode) {
      setSelectedWidgetId(widget.id);
      setSelectedSectionId(null);
      setSelectedSidebarPathId(null);
      return;
    }
    setSelectedWidgetId(widget.id);
    setSelectedSectionId(null);
    setSelectedSidebarPathId(null);
    openLiveControls(widget);
  };

  const handleOpenHomeAttentionItem = (item: HomeAttentionItem) => {
    const opensDeviceDiagnostics =
      item.deviceId &&
      (item.category === 'availability' ||
        item.category === 'battery' ||
        item.category === 'configuration');
    if (opensDeviceDiagnostics) {
      navigateWithinDashboard(`/settings/devices/${encodeURIComponent(item.deviceId!)}`);
      return;
    }
    const matchingWidget = item.entityId
      ? widgets.find(
          (widget) => widget.entityId.trim().toLowerCase() === item.entityId?.trim().toLowerCase(),
        )
      : undefined;
    if (matchingWidget) {
      handleWidgetClick(matchingWidget);
      return;
    }
    if (item.deviceId) {
      navigateWithinDashboard(`/settings/devices/${encodeURIComponent(item.deviceId)}`);
      return;
    }
    if (item.areaId) {
      navigateWithinDashboard('/rooms');
      return;
    }
    navigateWithinDashboard('/settings/entities');
  };

  const addWidget = (kind: WidgetKind, destination: WidgetCatalogDestination) => {
    beginDashboardEditorMutation();
    const id = `${kind}.custom_${nextWidgetIdRef.current++}`;
    const selectedStackSection = destination.type === 'stack'
      ? sections.find((section) => section.id === destination.sectionId && isStackSection(section))
      : undefined;
    const targetSection = selectedStackSection;
    const targetSectionId = targetSection?.id;
    const widgetWidth =
      kind === 'climate'
        ? CLIMATE_WIDGET_WIDTH
        : kind === 'sensor' || kind === 'lock'
          ? 1
          : kind === 'media'
            ? MEDIA_WIDGET_MIN_WIDTH
            : kind === 'vacuum'
              ? VACUUM_WIDGET_DEFAULT_WIDTH
              : kind === 'cover'
                ? COVER_WIDGET_MIN_WIDTH
                : kind === 'members'
                  ? MEMBERS_WIDGET_MIN_WIDTH
                : 2;
    const widgetBaseHeight =
      kind === 'climate'
        ? CLIMATE_WIDGET_HEIGHT
        : kind === 'light'
          ? LIGHT_WIDGET_HEIGHT_OFF
        : kind === 'sensor'
          ? 1
          : kind === 'lock'
            ? resolveLockMinimumHeightRows()
            : kind === 'camera'
              ? CAMERA_WIDGET_MIN_HEIGHT
              : kind === 'vacuum'
                ? VACUUM_WIDGET_DEFAULT_HEIGHT
              : kind === 'cover'
                ? COVER_WIDGET_MIN_HEIGHT
                : kind === 'members'
                  ? MEMBERS_WIDGET_MIN_HEIGHT
                : kind === 'media'
                  ? MEDIA_WIDGET_MIN_HEIGHT
                  : 1;
    const widgetHeight = kind === 'climate'
      ? CLIMATE_WIDGET_HEIGHT
      : targetSection
      ? widgetBaseHeight
      : kind === 'light'
        ? LIGHT_WIDGET_HEIGHT_OFF
        : widgetBaseHeight;
    const defaultEntityId = entityOptions[kind][0] ?? '';
    const isVacuumDemo = effectiveRuntimeMode === 'demo' && kind === 'vacuum' && isDemoVacuumEntity(defaultEntityId);
    setWidgets((prev) => {
      const baseLayout: GridItem = { i: id, x: 0, y: 0, w: widgetWidth, h: widgetHeight };

      if (targetSection) {
        const stackWidgets = prev.filter((widget) => widget.parentSectionId === targetSectionId);
        const stackCols = resolveStackColumns(targetSection);
        const normalizedSeed = normalizeLayoutForStack(targetSection, baseLayout);
        const occupied = stackWidgets.map((widget) => {
          const normalized = normalizeLayoutForStack(targetSection, widget.layout);
          return {
            x: normalized.x,
            y: normalized.y,
            w: normalized.w,
            h: normalized.h,
          };
        });
        const next = findFirstFreePosition(occupied, stackCols, normalizedSeed.w, normalizedSeed.h);
        baseLayout.x = next.x;
        baseLayout.y = next.y;
        baseLayout.w = normalizedSeed.w;
        baseLayout.h = normalizedSeed.h;
      } else {
        const rootWidgets = prev.filter((widget) => !widget.parentSectionId);
        const occupied = [
          ...sections.map((section) => ({
            x: section.layout.x,
            y: section.layout.y,
            w: section.layout.w,
            h: section.layout.h,
          })),
          ...rootWidgets.map((widget) => ({
            x: widget.layout.x,
            y: widget.layout.y,
            w: widget.layout.w,
            h: widget.layout.h,
          })),
        ];
        const next = findFirstFreePosition(occupied, ROOT_CANVAS_COLS, widgetWidth, widgetHeight);
        baseLayout.x = next.x;
        baseLayout.y = next.y;
      }

      const normalizedLayout = targetSection
        ? normalizeLayoutForStack(targetSection, baseLayout)
        : baseLayout;

      const newWidget: Widget = {
        id,
        kind,
        title: `New ${kind}`,
        entityId: defaultEntityId,
        dataSource: effectiveRuntimeMode === 'demo' && Boolean(defaultEntityId) ? 'mock' : 'ha',
        isFavorite: Boolean(targetSection?.kind === 'stack-grid' && (targetSection.stackUseFavoritesGrid ?? false)),
        placementPolicy: 'manual',
        status: !defaultEntityId
          ? 'Non configurata'
          : kind === 'media'
            ? 'paused'
            : kind === 'switch'
              ? 'off'
            : kind === 'alarm'
              ? 'disarmed'
              : kind === 'vacuum'
                ? 'docked'
                : kind === 'lock'
                  ? 'locked'
                : kind === 'cover'
                  ? 'open'
                : 'Idle',
        isOn: Boolean(defaultEntityId) && (kind === 'lock' || kind === 'cover'),
        value: !defaultEntityId
          ? undefined
          :
          kind === 'sensor' ? 40 : kind === 'climate' ? 23 : kind === 'vacuum' ? 100 : kind === 'cover' ? 70 : 0,
        unit:
          kind === 'sensor' || kind === 'media' || kind === 'vacuum' || kind === 'cover'
            ? '%'
            : kind === 'climate'
              ? 'C'
              : kind === 'alarm' || kind === 'lock' || kind === 'switch' || kind === 'members'
                ? ''
                : '%',
        ...(kind === 'alarm' || kind === 'lock'
          ? {
              activityLogHours: DEFAULT_ACTIVITY_WINDOW_HOURS,
              activityLogLimit: DEFAULT_ACTIVITY_MAX_ENTRIES,
            }
          : {}),
        ...(kind === 'vacuum'
          ? {
              vacuumFanSpeed: isVacuumDemo ? 'balanced' : undefined,
              vacuumMapUrl: isVacuumDemo ? VACUUM_DEMO_MAP_URL : undefined,
              vacuumCleanedArea: isVacuumDemo ? 45 : undefined,
              vacuumCleaningMinutes: isVacuumDemo ? 32 : undefined,
            }
          : {}),
        ...(kind === 'cover'
          ? {
              coverTiltPosition: defaultEntityId ? 50 : undefined,
            }
          : {}),
        parentSectionId: targetSectionId,
        layout: normalizedLayout,
      };

      return [...prev, newWidget];
    });
    setSelectedWidgetId(id);
    setSelectedSectionId(null);
    return id;
  };

  const addSection = (kind: SectionKind) => {
    beginDashboardEditorMutation();
    const id = `section-${kind}-${nextSectionIdRef.current++}`;
    const nextY = sections.reduce((maxY, section) => Math.max(maxY, section.layout.y + section.layout.h), 0);
    setSections((prev) => [
      ...prev,
        {
          id,
          kind,
          layout: createDefaultSectionLayout(kind, id, nextY),
          ...(kind === 'greeting'
            ? {
                showWeather: true,
                weatherLayout: 'auto',
                weatherUnit: 'C',
                weatherShowCondition: true,
                weatherShowPrecipitation: true,
                weatherShowWind: true,
                weatherForecastType: 'daily',
                weatherForecastDays: 4,
                weatherForecastDensity: 'comfortable',
                weatherSecondaryInfo: 'auto',
              }
            : {}),
          ...(kind === 'scenes'
            ? {
              scenes: ['music', 'going-out', 'night', 'movie'],
              scenesShowBackground: true,
              scenesShowBorder: true,
              title: 'Scenari',
            }
          : {}),
        ...(kind === 'stack-vertical'
          ? {
              title: 'Vertical Stack',
              stackShowBackground: true,
              stackShowBorder: true,
              stackShowHeader: true,
            }
          : {}),
        ...(kind === 'stack-horizontal'
          ? {
              title: 'Horizontal Stack',
              stackColumns: 4,
              stackShowBackground: true,
              stackShowBorder: true,
              stackShowHeader: true,
            }
          : {}),
        ...(kind === 'stack-grid'
          ? {
              title: 'Grid Stack',
              stackColumns: 3,
              stackColumnsMode: 'auto',
              stackShowBackground: true,
              stackShowBorder: true,
              stackShowHeader: true,
              stackUseFavoritesGrid: false,
            }
          : {}),
        ...(kind === 'weather'
          ? {
              weatherLayout: 'auto',
              weatherUnit: 'C',
              weatherShowCondition: true,
              weatherShowPrecipitation: true,
              weatherShowWind: true,
              weatherForecastType: 'daily',
              weatherForecastDays: 4,
              weatherForecastDensity: 'comfortable',
              weatherSecondaryInfo: 'auto',
            }
          : {}),
      },
    ]);
    setSelectedSectionId(id);
    setSelectedWidgetId(null);
    return id;
  };

  const executeSectionRemoval = (id: string, stackCardAction: 'move-to-canvas' | 'delete' = 'delete') => {
    beginDashboardEditorMutation();
    const removedSection = sections.find((section) => section.id === id) ?? null;
    const remainingSections = sections.filter((section) => section.id !== id);
    const nextWidgets =
      removedSection && isStackSection(removedSection) && stackCardAction === 'move-to-canvas'
        ? (() => {
            const rootOccupied: Array<Pick<GridItem, 'x' | 'y' | 'w' | 'h'>> = [
              ...remainingSections.map((section) => ({
                x: section.layout.x,
                y: section.layout.y,
                w: section.layout.w,
                h: section.layout.h,
              })),
              ...widgets
                .filter((widget) => !widget.parentSectionId)
                .map((widget) => ({
                  x: widget.layout.x,
                  y: widget.layout.y,
                  w: widget.layout.w,
                  h: widget.layout.h,
                })),
            ];

            return widgets.map((widget) => {
              if (widget.parentSectionId !== id) {
                return widget;
              }

              const normalizedSeed = normalizeRootLayout({
                i: widget.id,
                x: widget.layout.x,
                y: widget.layout.y,
                w: Math.max(1, Math.round(widget.layout.w)),
                h: Math.max(1, Math.round(widget.layout.h)),
              });
              const nextPosition = findFirstFreePosition(
                rootOccupied,
                ROOT_CANVAS_COLS,
                normalizedSeed.w,
                normalizedSeed.h,
              );
              const nextLayout = normalizeRootLayout({
                ...normalizedSeed,
                x: nextPosition.x,
                y: nextPosition.y,
              });

              rootOccupied.push({
                x: nextLayout.x,
                y: nextLayout.y,
                w: nextLayout.w,
                h: nextLayout.h,
              });

              return {
                ...widget,
                parentSectionId: undefined,
                placementPolicy: 'manual' as const,
                layout: nextLayout,
              };
            });
          })()
        : widgets.filter((widget) => widget.parentSectionId !== id);
    const retainedWidgetIds = new Set(nextWidgets.map((widget) => widget.id));
    widgets.forEach((widget) => {
      if (!retainedWidgetIds.has(widget.id)) {
        forgetWidgetSecrets(
          widget.id,
          typeof window === 'undefined' ? undefined : window.localStorage,
        );
      }
    });
    const compacted = compactRootCanvasLayout(remainingSections, nextWidgets);
    setSections(compacted.sections);
    setWidgets(compacted.widgets);
  };

  const removeSection = (id: string) => {
    const section = sections.find((candidate) => candidate.id === id);
    const hasStackCards = Boolean(
      section
      && isStackSection(section)
      && widgets.some((widget) => widget.parentSectionId === id),
    );

    if (hasStackCards) {
      setPendingStackRemovalId(id);
      return;
    }

    executeSectionRemoval(id);
  };

  const removeSelectedWidget = () => {
    if (!selectedWidget) {
      return;
    }
    beginDashboardEditorMutation();
    forgetWidgetSecrets(
      selectedWidget.id,
      typeof window === 'undefined' ? undefined : window.localStorage,
    );
    const nextWidgets = widgets.filter((widget) => widget.id !== selectedWidget.id);
    if (selectedWidget.parentSectionId) {
      const parentSection = sections.find((section) => section.id === selectedWidget.parentSectionId);
      setWidgets(parentSection && isStackSection(parentSection) ? compactStackSectionLayout(parentSection, nextWidgets) : nextWidgets);
    } else {
      const compacted = compactRootCanvasLayout(sections, nextWidgets);
      setSections(compacted.sections);
      setWidgets(compacted.widgets);
    }
    setSelectedWidgetId(null);
  };

  const requestToggleEditMode = () => {
    if (!canToggleEditMode) {
      return;
    }
    if (!isEditMode) {
      void loadRightSidebarManager();
      if (isConsumptionView) {
        void loadConsumptionEditor();
      }
    }
    setEditConfirm(isEditMode ? 'exit' : 'enter');
  };

  const startHomeAssistantOAuth = async () => {
    if (typeof window === 'undefined') {
      return;
    }

    const normalizedUrl = normalizeHassUrl(haUrl);
    if (!normalizedUrl) {
      throw new Error('Inserisci URL Home Assistant prima di avviare OAuth.');
    }

    const nonce = createOAuthNonce();
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set(HA_OAUTH_CALLBACK_PARAM, '1');
    currentUrl.searchParams.delete('code');
    currentUrl.searchParams.delete('state');
    currentUrl.searchParams.delete('error');
    currentUrl.searchParams.delete('error_description');

    const statePayload: HaOAuthStatePayload = {
      nonce,
      hassUrl: normalizedUrl,
      returnTo: `${window.location.pathname}${window.location.search}${window.location.hash}`,
      issuedAt: Date.now(),
    };
    const serializedState = JSON.stringify(statePayload);
    const authorizeUrl = buildHaOAuthAuthorizeUrl({
      hassUrl: normalizedUrl,
      clientId: window.location.origin,
      redirectUri: currentUrl.toString(),
      state: serializedState,
    });

    window.sessionStorage.setItem(HA_OAUTH_SESSION_STATE_KEY, serializedState);
    setOAuthFlowError(null);
    window.location.assign(authorizeUrl);
  };

  const returnToHomeAssistantConnection = () => {
    disconnectHa();
    clearHassAuthTokensStorage();
    window.sessionStorage.removeItem(HA_OAUTH_SESSION_STATE_KEY);
    setPendingStoredOAuthReconnectUrl(null);
    setOAuthFlowError(null);
    setHaToken('');
    setHaRememberToken(false);
    navigate('/setup?reconnect=1');
  };

  const downloadConfigurationBackup = () => {
    if (
      typeof window === 'undefined' ||
      !dashboardSecurity.can('download_backup')
    ) {
      return;
    }

    const payload = createDashboardBackupPayload(window.localStorage, effectiveRuntimeMode);
    const backupJson = serializeDashboardBackup(payload);
    const safeTimestamp = payload.exportedAt.replace(/[:.]/g, '-');
    const fileName = `${BACKUP_FILENAME_PREFIX}-${safeTimestamp}.json`;
    const blob = new Blob([backupJson], { type: 'application/json;charset=utf-8' });
    const downloadUrl = window.URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
  };

  const restoreConfigurationFromFile = async (file: File) => {
    if (
      typeof window === 'undefined' ||
      !dashboardSecurity.can('restore_backup')
    ) {
      return;
    }

    const rawBackup = await file.text();
    const payload = parseDashboardBackup(rawBackup);
    if ((payload.scope ?? 'real') !== effectiveRuntimeMode) {
      throw new Error(
        effectiveRuntimeMode === 'demo'
          ? t('home.backup.selectDemo')
          : t('home.backup.demoCannotReplace'),
      );
    }
    restoreDashboardBackup(payload, window.localStorage, effectiveRuntimeMode);
    window.location.reload();
  };

  const resetAllConfiguration = async (reportProgress?: DashboardResetProgressReporter) => {
    if (
      typeof window === 'undefined' ||
      !dashboardSecurity.can('reset_dashboard')
    ) {
      return;
    }

    let authoritativeResetMarker: DashboardResetMarker | null = null;
    if (effectiveRuntimeMode === 'real') {
      const resetResult = await haDashboardLayoutPersistence.resetAuthoritativeConfiguration(
        reportProgress,
      );
      if (resetResult.status !== 'reset') {
        const message = resetResult.status === 'offline'
          ? t('home.reset.offline')
          : resetResult.status === 'unauthorized'
            ? 'Non hai i permessi necessari per eliminare la configurazione condivisa.'
            : resetResult.status === 'unsupported'
              ? 'Questa installazione non supporta il reset della configurazione condivisa.'
              : 'Home Assistant non ha confermato il reset. I dati locali non sono stati eliminati.';
        throw new Error(message);
      }
      authoritativeResetMarker = resetResult.marker;
    }

    reportProgress?.('clearing_device');
    clearManagedDashboardStorage(
      window.localStorage,
      effectiveRuntimeMode === 'demo' ? 'demo' : 'all',
    );
    if (authoritativeResetMarker) {
      acknowledgeAuthoritativeDashboardReset(window.localStorage, authoritativeResetMarker);
    }
    reportProgress?.('restarting');
    await new Promise<void>((resolve) => window.setTimeout(resolve, 450));
    window.location.reload();
  };

  const discardDashboardEditSession = useCallback(() => {
    const baseline = editSessionBaselineRef.current;
    if (baseline) applyDashboardEditorSnapshot(cloneDashboardEditorSnapshot(baseline));
    editSessionBaselineRef.current = null;
    editSessionCreatedAtRef.current = null;
    editSessionRouteRef.current = null;
    if (typeof window !== 'undefined') {
      discardDashboardEditDraft(window.sessionStorage, effectiveRuntimeMode);
    }
    setHasUnsavedDashboardEdits(false);
    setIsCatalogOpen(false);
    setSelectedWidgetId(null);
    setSelectedSectionId(null);
    setSelectedSidebarPathId(null);
    setIsEditMode(false);
    setEditConfirm(null);
  }, [applyDashboardEditorSnapshot, effectiveRuntimeMode]);

  const discardPendingDashboardEditDraft = useCallback(() => {
    if (typeof window !== 'undefined') {
      discardDashboardEditDraft(window.sessionStorage, effectiveRuntimeMode);
    }
    setPendingDashboardEditDraft(null);
  }, [effectiveRuntimeMode]);

  const suspendDashboardEditSession = useCallback(() => {
    if (typeof window !== 'undefined' && hasUnsavedDashboardEdits) {
      try {
        saveDashboardEditDraft(window.sessionStorage, {
          runtimeMode: effectiveRuntimeMode,
          createdAt: editSessionCreatedAtRef.current ?? Date.now(),
          baseRevision: haDashboardLayoutPersistence.serverRevision,
          dashboard: authoritativeDashboardLayout,
        });
        setPendingDashboardEditDraft(
          readDashboardEditDraft(window.sessionStorage, effectiveRuntimeMode),
        );
      } catch {
        // Closing fail-closed remains more important than draft recovery.
      }
    }
    const baseline = editSessionBaselineRef.current;
    if (baseline) applyDashboardEditorSnapshot(cloneDashboardEditorSnapshot(baseline));
    editSessionBaselineRef.current = null;
    editSessionCreatedAtRef.current = null;
    editSessionRouteRef.current = null;
    setHasUnsavedDashboardEdits(false);
    setIsCatalogOpen(false);
    setSelectedWidgetId(null);
    setSelectedSectionId(null);
    setSelectedSidebarPathId(null);
    setIsEditMode(false);
    setEditConfirm(null);
  }, [
    applyDashboardEditorSnapshot,
    authoritativeDashboardLayout,
    effectiveRuntimeMode,
    haDashboardLayoutPersistence.serverRevision,
    hasUnsavedDashboardEdits,
  ]);

  const resumePendingDashboardEditDraft = useCallback(() => {
    const draft = pendingDashboardEditDraft;
    if (!draft || !dashboardSecurity.can('edit_dashboard') || typeof window === 'undefined') return;
    const recoveryResult = createDashboardRecoverySnapshot(effectiveRuntimeMode, window.localStorage);
    if (!recoveryResult.ok) {
      addNotification('alert', t('home.draft.prepareFailed'));
      return;
    }
    editSessionBaselineRef.current = cloneDashboardEditorSnapshot(dashboardEditorSnapshot);
    editSessionCreatedAtRef.current = draft.createdAt;
    editSessionRouteRef.current = canUseBrowserRouteNavigation
      ? `${routerLocation.pathname}${routerLocation.search}${routerLocation.hash}`
      : internalNavigationRoute;
    applyDashboardEditorSnapshot({
      sections: draft.dashboard.sections,
      widgets: draft.dashboard.widgets,
      widgetTypeLayoutOverrides: draft.dashboard.widgetTypeLayoutOverrides,
      responsiveLayouts: draft.dashboard.responsiveLayouts,
      widgetLayoutOverrides: draft.dashboard.widgetLayoutOverrides,
    });
    setPendingDashboardEditDraft(null);
    setIsEditMode(true);
  }, [
    addNotification,
    applyDashboardEditorSnapshot,
    dashboardEditorSnapshot,
    dashboardSecurity,
    effectiveRuntimeMode,
    canUseBrowserRouteNavigation,
    internalNavigationRoute,
    pendingDashboardEditDraft,
    routerLocation.hash,
    routerLocation.pathname,
    routerLocation.search,
  ]);

  const reloadAfterDashboardConflict = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      saveDashboardEditDraft(window.sessionStorage, {
        runtimeMode: effectiveRuntimeMode,
        createdAt: editSessionCreatedAtRef.current ?? Date.now(),
        baseRevision: haDashboardLayoutPersistence.serverRevision,
        dashboard: authoritativeDashboardLayout,
      });
    } catch {
      // Reload still returns to the authoritative HA layout.
    }
    allowDashboardUnloadRef.current = true;
    window.location.reload();
  }, [
    authoritativeDashboardLayout,
    effectiveRuntimeMode,
    haDashboardLayoutPersistence.serverRevision,
  ]);

  const applyPendingDashboardRemoteUpdate = useCallback(() => {
    if (!haDashboardLayoutPersistence.pendingRemoteUpdate) return;
    const applied = haDashboardLayoutPersistence.applyPendingRemoteUpdate();
    if (!applied) return;
    editSessionBaselineRef.current = null;
    editSessionCreatedAtRef.current = null;
    editSessionRouteRef.current = null;
    if (typeof window !== 'undefined') {
      discardDashboardEditDraft(window.sessionStorage, effectiveRuntimeMode);
    }
    setHasUnsavedDashboardEdits(false);
    setIsCatalogOpen(false);
    setSelectedWidgetId(null);
    setSelectedSectionId(null);
    setSelectedSidebarPathId(null);
    setEditConfirm(null);
    setIsDashboardConflictOpen(false);
    setIsEditMode(false);
  }, [
    effectiveRuntimeMode,
    haDashboardLayoutPersistence.applyPendingRemoteUpdate,
    haDashboardLayoutPersistence.pendingRemoteUpdate,
  ]);

  useEffect(() => {
    if (isEditMode && !canToggleEditMode) suspendDashboardEditSession();
  }, [canToggleEditMode, isEditMode, suspendDashboardEditSession]);

  const confirmEditAction = async () => {
    if (isDashboardSaveBusy) return;
    if (editConfirm === 'refresh') {
      allowDashboardUnloadRef.current = true;
      window.location.reload();
      return;
    }
    if (editConfirm === 'enter' && !canToggleEditMode) {
      setEditConfirm(null);
      return;
    }
    if (editConfirm === 'enter') {
      if (typeof window === 'undefined') {
        setEditConfirm(null);
        return;
      }
      if (effectiveRuntimeMode === 'real' && !requiresDashboardLayoutMigration) {
        const appliedNewerRevision = await haDashboardLayoutPersistence.checkForRemoteUpdate();
        if (appliedNewerRevision) {
          setEditConfirm(null);
          return;
        }
      }
      const baselineSaveResult = requiresDashboardLayoutMigration
        ? await haDashboardLayoutPersistence.initializeFromCurrentDashboard()
        : await saveDashboardLayoutNow();
      if (baselineSaveResult.ok === false) {
        if (baselineSaveResult.code === 'server_conflict') setIsDashboardConflictOpen(true);
        const bridgeNeedsUpgrade = isHaManagedByParent &&
          panelHaBridgeConnection.bridgeProtocolVersion === null;
        const failureMessage = baselineSaveResult.code === 'server_unsupported'
          ? t('home.persistence.bridgeOutdated')
          : baselineSaveResult.code === 'server_unauthorized'
            ? t('home.persistence.unauthorized')
            : baselineSaveResult.code === 'server_conflict'
              ? t('home.persistence.newerExists')
              : baselineSaveResult.code === 'migration_required'
                ? t('home.persistence.notInitialized')
                : bridgeNeedsUpgrade
                  ? t('home.persistence.bridgeMismatch')
                  : isHaManagedByParent
                    ? t('home.persistence.bridgeUnconfirmed')
                    : t('home.persistence.unconfirmed');
        addNotification(
          'alert',
          failureMessage,
        );
        setEditConfirm(null);
        return;
      }
      const recoveryResult = createDashboardRecoverySnapshot(effectiveRuntimeMode, window.localStorage);
      if (!recoveryResult.ok) {
        addNotification('alert', t('home.draft.copyFailed'));
        setEditConfirm(null);
        return;
      }
      editSessionBaselineRef.current = cloneDashboardEditorSnapshot(dashboardEditorSnapshot);
      editSessionCreatedAtRef.current = Date.now();
      editSessionRouteRef.current = canUseBrowserRouteNavigation
        ? `${routerLocation.pathname}${routerLocation.search}${routerLocation.hash}`
        : internalNavigationRoute;
      discardDashboardEditDraft(window.sessionStorage, effectiveRuntimeMode);
      setPendingDashboardEditDraft(null);
      setHasUnsavedDashboardEdits(false);
    }
    if (editConfirm === 'exit') {
      if (!dashboardSecurity.can('edit_dashboard')) {
        discardDashboardEditSession();
        return;
      }
      if (hasUnsavedDashboardEdits) {
        setIsDashboardSaveBusy(true);
        const saveResult = await saveDashboardLayoutNow();
        if (saveResult.ok === false) {
          setIsDashboardSaveBusy(false);
          if (saveResult.code === 'server_conflict') setIsDashboardConflictOpen(true);
          addNotification(
            'alert',
            saveResult.code === 'server_conflict'
              ? t('home.persistence.changedElsewhere')
              : 'Home Assistant non ha confermato il salvataggio. Le modifiche restano aperte e non sono state perse.',
          );
          setEditConfirm(null);
          return;
        }
        setIsDashboardSaveBusy(false);
      }
      editSessionBaselineRef.current = null;
      editSessionCreatedAtRef.current = null;
      editSessionRouteRef.current = null;
      if (typeof window !== 'undefined') {
        discardDashboardEditDraft(window.sessionStorage, effectiveRuntimeMode);
      }
      setHasUnsavedDashboardEdits(false);
      setIsCatalogOpen(false);
      setSelectedWidgetId(null);
      setSelectedSectionId(null);
      setSelectedSidebarPathId(null);
    }
    setIsEditMode((prev) => !prev);
    setEditConfirm(null);
  };

  const handleSidebarPathClick = (entry: { id: string; path: string }) => {
    const target = resolveApplicationRoutePath(entry.id, entry.path);
    if (!target || typeof window === 'undefined') {
      return;
    }
    const normalized = target;

    if (isEditMode) {
      setSelectedSidebarPathId(entry.id);
      setSelectedWidgetId(null);
      setSelectedSectionId(null);
      return;
    }

    setSelectedSidebarPathId(null);

    if (!isExternalNavigationTarget(normalized)) {
      const currentRoute = `${routerLocation.pathname}${routerLocation.search}${routerLocation.hash}`;
      const normalizedRouteForNavigate = normalized.startsWith('#')
        ? `${routerLocation.pathname}${routerLocation.search}${normalized}`
        : normalized.startsWith('?')
          ? `${routerLocation.pathname}${normalized}`
          : normalized;

      if (canUseBrowserRouteNavigation) {
        if (normalizedRouteForNavigate !== currentRoute) {
          navigate(normalizedRouteForNavigate);
        }
      } else {
        setInternalNavigationRoute(normalizedRouteForNavigate);
      }

      const nextIsConsumption = isConsumptionNavigationTarget(normalizedRouteForNavigate);
      const nextIsConsumptionDetail = nextIsConsumption && isConsumptionDetailNavigationTarget(normalizedRouteForNavigate);
      const nextIsAutomation = isAutomationNavigationTarget(normalizedRouteForNavigate);
      const nextIsAppGallery = isAppGalleryNavigationTarget(normalizedRouteForNavigate);
      const nextIsRooms = isRoomsNavigationTarget(normalizedRouteForNavigate);
      const nextIsSecurity = isSecurityNavigationTarget(normalizedRouteForNavigate);
      const nextIsSecurityCameras = isSecurityCamerasNavigationTarget(normalizedRouteForNavigate);
      const nextIsProfile = isProfileNavigationTarget(normalizedRouteForNavigate);
      const nextIsSettings = isSettingsNavigationTarget(normalizedRouteForNavigate);
      const nextIsKnownRoute =
        isHomeNavigationTarget(normalizedRouteForNavigate) ||
        nextIsConsumption ||
        nextIsAutomation ||
        nextIsAppGallery ||
        nextIsRooms ||
        nextIsSecurity ||
        nextIsProfile ||
        nextIsSettings;
      const nextEditAvailability =
        isHomeNavigationTarget(normalizedRouteForNavigate) ||
        nextIsConsumption ||
        nextIsAppGallery ||
        nextIsSecurity ||
        (!canUseBrowserRouteNavigation && !nextIsKnownRoute);
      setIsConsumptionView(nextIsConsumption);
      setIsConsumptionDetailView(nextIsConsumptionDetail);
      setIsAutomationView(nextIsAutomation);
      setIsAppGalleryView(nextIsAppGallery);
      setIsRoomsView(nextIsRooms);
      setIsSecurityView(nextIsSecurity);
      setIsSecurityCamerasView(nextIsSecurityCameras);
      setIsSettingsView(nextIsSettings);
      setIsProfileOpen(nextIsProfile);
      if (nextIsProfile) {
        setProfileInitialSection((currentSection) => {
          if (currentSection === 'movements' || currentSection === 'members' || currentSection === 'security') {
            return currentSection;
          }
          return 'members';
        });
      }
      setIsEditAvailableForRoute(nextEditAvailability);
      setActiveDevice(null);
      setSelectedWidgetId(null);
      setSelectedSectionId(null);
      setSelectedSidebarPathId(null);

      if (!nextEditAvailability) {
        setIsEditMode(false);
        setEditConfirm(null);
        setIsCatalogOpen(false);
      }
      return;
    }

    const currentAbsoluteRoute = `${window.location.origin}${routerLocation.pathname}${routerLocation.search}${routerLocation.hash}`;
    if (normalized === currentAbsoluteRoute) {
      return;
    }
    window.location.assign(normalized);
  };
  const handleMicroWidgetPageNavigation = (path: string) => {
    const normalizedPath = path.trim();
    if (!normalizedPath) {
      return;
    }
    const pageEntry: SidebarQuickPath = {
      id: `micro-widget-page-${Date.now()}`,
      label: 'Micro Widget Page',
      path: normalizedPath,
      icon: 'dashboard',
    };
    handleSidebarPathClick(pageEntry);
  };
  const dashboardBackgroundClass = `dashboard-background-${background}`;
  const profileUserEmail =
    haCurrentUser?.email ??
    (haCurrentUser?.username && haCurrentUser.username.includes('@') ? haCurrentUser.username : undefined);
  const profileUserRoleLabel = haCurrentUser?.isOwner ? 'Creatore' : haCurrentUser?.isAdmin ? 'Admin' : 'Utente';
  const canManageRooms = dashboardSecurity.can('manage_rooms');
  const securityAlarmProfiles = useMemo(
    () =>
      widgets
        .filter((widget) => widget.kind === 'alarm' && widget.entityId.trim().length > 0)
        .map((widget) => {
          const secrets = getWidgetSecrets(widget.id);
          return {
            widgetId: widget.id,
            entityId: widget.entityId,
            unlockCode: secrets.alarmUnlockCode ?? '',
            localExtraCode: secrets.alarmLocalExtraCode ?? '',
            requireDeviceConfirmation: widget.alarmRequireAuthToDisarm ?? false,
          };
        }),
    [activeWidgetSecrets.values, widgets],
  );
  const handleDeveloperModeChange = (nextValue: boolean) => {
    if (!dashboardSecurity.can('developer_mode')) {
      return;
    }
    setDeveloperMode(nextValue);
  };
  const profileUserOwnedDeviceCount = profileMovementSource.trackerDeviceCount;
  const currentNavigationRoute = canUseBrowserRouteNavigation
    ? `${routerLocation.pathname}${routerLocation.search}${routerLocation.hash}`
    : internalNavigationRoute;
  const isSecurityImmersiveView = isSecurityView && isSecurityCamerasView;
  const isConsumptionImmersiveView = isConsumptionView && isConsumptionDetailView;
  const isAppGalleryImmersiveView =
    isAppGalleryView && isNestedDashboardNavigationTarget(currentNavigationRoute);
  const isImmersiveView =
    isSecurityImmersiveView || isConsumptionImmersiveView || isAppGalleryImmersiveView;
  const isDashboardCanvasView =
    !isConsumptionView && !isAutomationView && !isAppGalleryView && !isRoomsView && !isSecurityView && !isSettingsView;
  const viewportPreviewGridWidth = resolveDashboardViewportPreviewWidth(viewportPreviewMode);
  const availableViewportPreviewModes: readonly DashboardViewportPreviewMode[] = isDesktopViewport
    ? ['auto', 'desktop', 'tablet', 'compact', 'mobile']
    : ['auto', 'tablet', 'compact', 'mobile'];
  const shouldShowMobileSidebarShell =
    !isImmersiveView && isCompactViewport && !isCatalogOpen && isDashboardCanvasView && !isProfileOpen;
  const isNestedDashboardPage = isNestedDashboardNavigationTarget(currentNavigationRoute);
  const shouldShowBottomBar =
    !isImmersiveView &&
    isXsViewport &&
    !isEditMode &&
    !isCatalogOpen &&
    !isProfileOpen &&
    !isNestedDashboardPage;

  useEffect(() => {
    if (!shouldShowMobileSidebarShell) {
      setIsMobileSidebarOpen(false);
    }
  }, [shouldShowMobileSidebarShell]);

  const getCurrentNavigationRoute = () => currentNavigationRoute;
  const activeNavigationRoute = getCurrentNavigationRoute();
  const settingsPath = activeNavigationRoute.split(/[?#]/, 1)[0].replace(/\/+$/, '');
  const settingsManagementSection: SettingsManagementSectionId | null =
    settingsPath === '/settings/access'
      ? 'members'
      : settingsPath === '/settings/connections'
        ? 'ha'
        : settingsPath === '/settings/data'
          ? 'config'
          : null;

  const navigateWithinDashboard = (path: string) => {
    prefetchDashboardWorkspace(path);
    if (canUseBrowserRouteNavigation) {
      const currentRoute = `${routerLocation.pathname}${routerLocation.search}${routerLocation.hash}`;
      if (path !== currentRoute) {
        navigate(path);
      }
      return;
    }
    setInternalNavigationRoute(path);
  };

  const openProfileRoute = (section: ProfileSectionId = 'members') => {
    const currentRoute = getCurrentNavigationRoute();
    if (!isProfileNavigationTarget(currentRoute) && !isSettingsNavigationTarget(currentRoute)) {
      profileReturnRouteRef.current = currentRoute || '/home';
    }
    setProfileInitialSection(section);
    setIsProfileOpen(true);
    navigateWithinDashboard('/profile');
  };

  const openSettingsRoute = () => {
    setIsProfileOpen(false);
    navigateWithinDashboard('/settings');
  };

  const closeProfileRoute = () => {
    setIsProfileOpen(false);
    setProfileInitialSection('members');
    const currentRoute = getCurrentNavigationRoute();
    if (isProfileNavigationTarget(currentRoute)) {
      navigateWithinDashboard(profileReturnRouteRef.current || '/home');
    }
  };
  const quickAlarmRequiresCode = Boolean(pendingQuickAlarmAction?.requiresCode);
  const quickLockRequiresCode = Boolean(pendingQuickLockAction);
  const isQuickSecurityAuthOpen = Boolean(pendingQuickAlarmAction || pendingQuickLockAction);
  const visibleDashboardRecovery =
    pendingDashboardRecovery &&
    (runtimeMode === 'demo' || dashboardSecurity.can('edit_dashboard'))
      ? pendingDashboardRecovery
      : null;
  const visibleDashboardEditDraft =
    pendingDashboardEditDraft &&
    !isEditMode &&
    !visibleDashboardRecovery &&
    dashboardSecurity.can('edit_dashboard') &&
    (effectiveRuntimeMode === 'demo' || haDashboardLayoutPersistence.loadStatus === 'ready')
      ? pendingDashboardEditDraft
      : null;
  const dashboardEditDraftHasRevisionConflict = Boolean(
    visibleDashboardEditDraft &&
    effectiveRuntimeMode === 'real' &&
    visibleDashboardEditDraft.baseRevision !== null &&
    haDashboardLayoutPersistence.serverRevision !== null &&
    visibleDashboardEditDraft.baseRevision !== haDashboardLayoutPersistence.serverRevision,
  );
  const quickAlarmCodeTypeLabel =
    pendingQuickAlarmAction?.credentialKind === 'combined_code'
      ? t('home.security.combinedCode')
      : t('home.security.alarmCode');
  const quickAlarmRateLimitStatus = getAuthRateLimitStatus(quickAlarmAuthAttemptState);
  const quickAlarmRateLimitMessage = formatAuthRateLimitMessage(quickAlarmRateLimitStatus);
  const quickAlarmAuthError = quickAlarmRateLimitMessage || quickAlarmSubmissionError;

  useEffect(() => {
    if (isQuickSecurityAuthOpen) {
      setHasMountedQuickSecurityAuth(true);
    }
  }, [isQuickSecurityAuthOpen]);
  const quickLockRateLimitMessage = formatAuthRateLimitMessage(getAuthRateLimitStatus(quickLockAuthAttemptState));
  const quickSecurityAuthError = quickLockRateLimitMessage || quickAlarmAuthError;

  return (
    <DashboardSecurityProvider value={dashboardSecurity}>
    <SensitiveActionGateProvider user={deviceAuthUser}>
    <div
      className={`apple-bg-main relative h-[100dvh] min-h-screen font-sans overflow-hidden flex ${
        isImmersiveView
          ? 'p-0 gap-0'
          : 'py-1.5 px-0.5 sm:p-2 md:p-2.5 lg:p-4 xl:p-5 gap-1.5 sm:gap-2 md:gap-2.5 lg:gap-4 xl:gap-6'
      } ${
        shouldShowMobileSidebarShell
          ? '!pt-[calc(env(safe-area-inset-top)+4rem)]'
          : ''
      } ${
        appearance === 'light'
          ? 'dashboard-theme-light text-[var(--dashboard-text)]'
          : 'dashboard-theme-dark text-[var(--dashboard-text)]'
      } dashboard-shell ${dashboardBackgroundClass}`}
    >
      <div aria-hidden className="dashboard-background-layer" />
      <a href="#dashboard-main-content" className="dashboard-skip-link">
        Vai al contenuto principale
      </a>

      {canPersistDashboardLayout && !isCompactViewport ? (
        <div className="fixed left-1/2 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[215] -translate-x-1/2 md:top-6 lg:hidden">
          <DashboardEditToolbar
            saveStatus={dashboardLayoutSaveStatus}
            canUndo={canUndoDashboardEdit}
            canRedo={canRedoDashboardEdit}
            onUndo={undoDashboardEdit}
            onRedo={redoDashboardEdit}
            remoteRevision={haDashboardLayoutPersistence.pendingRemoteUpdate?.revision}
            onRemoteUpdateClick={() => setIsDashboardConflictOpen(true)}
          />
        </div>
      ) : null}

      {canPersistDashboardLayout && isDashboardCanvasView && !isCatalogOpen && !isXsViewport ? (
        <div className="pointer-events-none fixed inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-[215] flex justify-center md:bottom-5">
          <div className="pointer-events-auto max-w-full">
            <DashboardViewportPreviewBar
              previewMode={viewportPreviewMode}
              canvasBreakpoint={canvasGridBreakpoint}
              onPreviewModeChange={setViewportPreviewMode}
              availableModes={availableViewportPreviewModes}
              primaryAction={
                <button
                  type="button"
                  data-tour-target="widget-catalog"
                  onClick={() => setIsCatalogOpen(true)}
                  className="flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-[color:var(--ui-accent)] transition-colors hover:bg-[color:var(--ui-fill-tertiary)]"
                  aria-label={t('dashboard.catalog.open')}
                >
                  <Plus size={15} aria-hidden />
                  <span className="hidden text-xs font-semibold sm:inline">{t('dashboard.catalog')}</span>
                </button>
              }
              desktopActions={
                <DashboardEditToolbar
                  embedded
                  saveStatus={dashboardLayoutSaveStatus}
                  canUndo={canUndoDashboardEdit}
                  canRedo={canRedoDashboardEdit}
                  onUndo={undoDashboardEdit}
                  onRedo={redoDashboardEdit}
                  remoteRevision={haDashboardLayoutPersistence.pendingRemoteUpdate?.revision}
                  onRemoteUpdateClick={() => setIsDashboardConflictOpen(true)}
                />
              }
            />
          </div>
        </div>
      ) : null}

      {runtimeMode === 'demo' ? (
        <button
          type="button"
          onClick={() => navigateWithinDashboard('/setup')}
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+6.5rem)] right-3 top-auto z-[210] rounded-full border border-amber-200/30 bg-amber-400/15 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100 shadow-lg backdrop-blur-2xl transition hover:bg-amber-400/22 sm:bottom-auto sm:top-3"
        >
          {t('dashboard.demo.connect')}
        </button>
      ) : null}

      {effectiveRuntimeMode === 'real' && isHaConnectionRecoveryStatus(haStatus) ? (
        <HomeAssistantRecoveryBanner
          status={haStatus}
          error={oauthFlowError ?? haError}
          isRetrying={haStatus === 'reconnecting'}
          lastUpdatedAt={haLastUpdatedAt}
          onRetry={connectHa}
          onReconnect={returnToHomeAssistantConnection}
        />
      ) : null}

      {shouldShowMobileSidebarShell ? (
        <>
          <div
            role={isEditMode ? 'toolbar' : undefined}
            aria-label={isEditMode ? t('dashboard.history') : undefined}
            className={`fixed top-0 z-[174] md:hidden ${
            isEditMode
              ? 'liquid-glass-navigation left-3 right-3 mt-[calc(env(safe-area-inset-top)+0.5rem)] flex items-center gap-1 p-1'
              : 'inset-x-0 flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+0.65rem)]'
          }`}
          >
            {isEditMode ? (
              <>
                <button
                  type="button"
                  data-tour-target="widget-catalog"
                  onClick={() => setIsCatalogOpen(true)}
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-[color:var(--ui-accent)] transition-colors hover:bg-[color:var(--ui-fill-tertiary)] active:scale-95"
                  aria-label={t('dashboard.catalog.open')}
                >
                  <Plus size={17} aria-hidden />
                  <span className="text-xs font-semibold">{t('dashboard.catalog')}</span>
                </button>
                <div className="flex min-w-0 flex-1 justify-center overflow-hidden">
                  <DashboardEditToolbar
                    embedded
                    saveStatus={dashboardLayoutSaveStatus}
                    canUndo={canUndoDashboardEdit}
                    canRedo={canRedoDashboardEdit}
                    onUndo={undoDashboardEdit}
                    onRedo={redoDashboardEdit}
                    remoteRevision={haDashboardLayoutPersistence.pendingRemoteUpdate?.revision}
                    onRemoteUpdateClick={() => setIsDashboardConflictOpen(true)}
                  />
                </div>
                <button
                  type="button"
                  onClick={requestToggleEditMode}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[color:var(--ui-text-primary)] transition-colors hover:bg-[color:var(--ui-fill-tertiary)] active:scale-95"
                  aria-label={t('dashboard.edit.exit')}
                >
                  <X size={18} />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setIsMobileSidebarOpen(true)}
                  className="liquid-glass-control inline-flex h-11 w-11 items-center justify-center text-[color:var(--ui-text-primary)] transition-all hover:brightness-110 active:scale-95"
                  aria-label={t('dashboard.menu.open')}
                  aria-expanded={isMobileSidebarOpen}
                >
                  <Menu size={18} />
                </button>
                <div className="flex min-w-0 items-center gap-2">
                  <XsNotificationBell />
                  <XsProfileChip
                    userAvatarUrl={currentUserAvatarUrl}
                    userName={stateWithConnectedUser.userName}
                    haStatus={haStatus}
                    onOpenProfile={() => openProfileRoute('members')}
                  />
                </div>
              </>
            )}
          </div>
          <MobileSidebarDrawer
            isOpen={isMobileSidebarOpen}
            isEditMode={isEditMode}
            isEditTourActive={isGuidedEditTargetActive}
            canToggleEditMode={canToggleEditMode}
            quickPaths={visibleSidebarPaths}
            selectedPathId={selectedSidebarPathId}
            activeRoute={activeNavigationRoute}
            isSettingsActive={isSettingsView}
            userAvatarUrl={currentUserAvatarUrl}
            userAvatarAlt={stateWithConnectedUser.userName}
            userEmail={profileUserEmail}
            haStatus={haStatus}
            onPathClick={handleSidebarPathClick}
            onToggleEditMode={requestToggleEditMode}
            onOpenProfile={() => openProfileRoute('members')}
            onOpenSettings={openSettingsRoute}
            onDisconnectHomeAssistant={disconnectHa}
            onClose={() => setIsMobileSidebarOpen(false)}
            onPrefetchRoute={prefetchDashboardWorkspace}
            onPrefetchEditMode={() => void loadRightSidebarManager()}
          />
        </>
      ) : null}

      {!isImmersiveView && !isCompactViewport ? (
        <LeftSidebar
          isEditMode={isEditMode}
          userAvatarUrl={currentUserAvatarUrl}
          userAvatarAlt={stateWithConnectedUser.userName}
          haStatus={haStatus}
          quickPaths={visibleSidebarPaths}
          selectedPathId={selectedSidebarPathId}
          activeRoute={activeNavigationRoute}
          isEditTourActive={isGuidedEditTargetActive}
          canToggleEditMode={canToggleEditMode}
          onPathClick={handleSidebarPathClick}
          onToggleEditMode={requestToggleEditMode}
          onOpenProfile={() => openProfileRoute('members')}
          onOpenSettings={openSettingsRoute}
          onPrefetchRoute={prefetchDashboardWorkspace}
          onPrefetchEditMode={() => void loadRightSidebarManager()}
          isSettingsActive={isSettingsView}
        />
      ) : null}

      <main
        id="dashboard-main-content"
        tabIndex={-1}
        className={isImmersiveView ? 'h-full min-h-0 flex-1 min-w-0 flex overflow-hidden outline-none' : 'h-full min-h-0 flex-1 min-w-0 flex gap-1.5 overflow-hidden outline-none sm:gap-2 md:gap-2.5 lg:gap-4 xl:gap-6'}
      >
        <React.Suspense fallback={<SecondaryWorkspaceLoading />}>
        {isConsumptionView ? (
          <>
            <div className="h-full min-h-0 flex-1 overflow-hidden">
              <ConsumptionDashboardPage
                embedded
                suppressBrowserNavigation={!canUseBrowserRouteNavigation}
                navigationRoute={internalNavigationRoute}
                isEditMode={isEditMode}
                compactEditMode={isEditMode && isCompactViewport}
                selectedCardId={selectedConsumptionCardId}
                data={consumptionData}
                config={consumptionConfig}
                onDetailViewChange={setIsConsumptionDetailView}
                onSelectCard={(cardId) => {
                  if (!isEditMode) {
                    return;
                  }
                  setSelectedConsumptionCardId(cardId);
                }}
              />
            </div>
            {isEditMode && !isCompactViewport && !isConsumptionDetailView ? (
              <ConsumptionEditorSidebar
                selectedCardId={selectedConsumptionCardId}
                onSelectCard={setSelectedConsumptionCardId}
                config={consumptionConfig}
                haEntityIds={haEntityIds}
                haConnected={isHaConnected}
                onUpdateConfigField={updateConsumptionConfigField}
                onResetConfig={resetConsumptionConfig}
              />
            ) : null}
          </>
        ) : isAutomationView ? (
          <div className="h-full min-h-0 flex-1 overflow-hidden">
            <AutomationsBuilder
              haStates={haStates}
              haStatus={haStatus}
              haUrl={haUrl}
              haToken={haToken}
              onCallService={callHaService}
            />
          </div>
        ) : isAppGalleryView ? (
          <div className="h-full min-h-0 flex-1 overflow-hidden">
            <AppGallery
              canConfigureApps={dashboardSecurity.can('edit_dashboard')}
              currentUserId={haCurrentUser?.id ?? null}
              runtimeMode={effectiveRuntimeMode}
              suppressBrowserNavigation={!canUseBrowserRouteNavigation}
              navigationRoute={internalNavigationRoute}
              haConnected={isHaConnected}
              haStates={haStatesForUi}
              haEntityIds={haEntityIds}
              haUrl={haUrl}
              haToken={haToken}
              onCallService={callHaService}
              onCallApi={callHaApi}
              onNavigate={navigateWithinDashboard}
              onNotify={addNotification}
            />
          </div>
        ) : isRoomsView ? (
          <div className="h-full min-h-0 flex-1 overflow-hidden">
            <RoomsDashboard
              runtimeMode={effectiveRuntimeMode}
              isEditMode={isEditMode}
              suppressBrowserNavigation={!canUseBrowserRouteNavigation}
              navigationRoute={internalNavigationRoute}
              isLoading={haStatus === 'connecting'}
              haConnected={isHaConnected}
              canManageRooms={canManageRooms}
              haAreas={haAreas}
              haStates={haStatesForUi}
              onCallService={callHaService}
              onCallApi={callHaApi}
              cameraPtzEntityIds={cameraPtzEntityIds}
              onCameraPtzMove={(entityId, direction) => moveCameraPtz(direction, entityId)}
              onCameraPtzStop={(entityId) => stopCameraPtz(entityId)}
            />
          </div>
        ) : isSecurityView ? (
          <div className="h-full min-h-0 flex-1 overflow-hidden">
            <SecurityDashboard
              isEditMode={isEditMode}
              canManageSecurity={dashboardSecurity.can('manage_security_config')}
              runtimeMode={effectiveRuntimeMode}
              suppressBrowserNavigation={!canUseBrowserRouteNavigation}
              navigationRoute={internalNavigationRoute}
              haConnected={isHaConnected}
              haStates={haStatesForUi}
              alarmEntityOptions={haEntityIds.filter((entityId) => entityId.startsWith('alarm_control_panel.'))}
              alarmSecurityProfiles={securityAlarmProfiles}
              sensorEntityOptions={knownHaEntityIds.filter((entityId) => entityId.startsWith('binary_sensor.'))}
              cameraEntityOptions={knownHaEntityIds.filter((entityId) => entityId.startsWith('camera.'))}
              cameraPtzEntityIds={cameraPtzEntityIds}
              deviceAuthUser={deviceAuthUser}
              onCallService={callHaService}
              onCameraPtzMove={(entityId, direction) => moveCameraPtz(direction, entityId)}
              onCameraPtzStop={(entityId) => stopCameraPtz(entityId)}
            />
          </div>
        ) : isSettingsView ? (
          <div className="h-full min-h-0 flex-1 overflow-hidden">
            <SettingsDashboard
              developerMode={developerMode}
              haStatus={haStatus}
              haError={oauthFlowError ?? haError}
              haStates={haStatesForUi}
              haAreas={haAreas}
              haEntityRegistry={haEntityRegistry}
              haDeviceRegistry={haDeviceRegistry}
              sections={sections}
              widgets={widgets}
              houseMembers={profileHouseMembers}
              currentLayoutId={canvasGridBreakpoint}
              sensorHistoryByEntity={sensorHistoryByEntity}
              onDeveloperModeChange={handleDeveloperModeChange}
              onDownloadBackup={downloadConfigurationBackup}
              onRestoreBackup={restoreConfigurationFromFile}
              layoutRevisions={haDashboardLayoutPersistence.revisions}
              layoutRevisionHistoryStatus={haDashboardLayoutPersistence.revisionHistoryStatus}
              onRefreshLayoutRevisions={haDashboardLayoutPersistence.refreshRevisionHistory}
              onRestoreLayoutRevision={haDashboardLayoutPersistence.restoreRevision}
              onCallService={callHaService}
              navigationRoute={activeNavigationRoute}
              onNavigate={navigateWithinDashboard}
              managedSectionContent={
                settingsManagementSection ? (
                  <React.Suspense fallback={<SecondaryWorkspaceLoading label="Apertura impostazioni…" />}>
                    <SettingsManagementPanel
                      key={settingsManagementSection}
                      isOpen
                      presentation="embedded"
                      onClose={() => navigateWithinDashboard('/settings')}
                      initialSection={settingsManagementSection}
                      userAvatarUrl={currentUserAvatarUrl}
                      userAvatarAlt={stateWithConnectedUser.userName}
                      userEmail={profileUserEmail}
                      userRoleLabel={profileUserRoleLabel}
                      houseMembers={profileHouseMembers}
                      appearance={appearance}
                      developerMode={developerMode}
                      onDeveloperModeChange={handleDeveloperModeChange}
                      haUrl={haUrl}
                      onUrlChange={setHaUrl}
                      haToken={haToken}
                      onTokenChange={setHaToken}
                      haRememberToken={haRememberToken}
                      onRememberTokenChange={setHaRememberToken}
                      haStatus={haStatus}
                      haError={oauthFlowError ?? haError}
                      haManagedByParent={isHaManagedByParent}
                      onConnect={connectHa}
                      onDisconnect={disconnectHa}
                      onStartOAuth={startHomeAssistantOAuth}
                      isOAuthBusy={isOAuthFlowBusy}
                      onDownloadBackup={downloadConfigurationBackup}
                      onRestoreBackup={restoreConfigurationFromFile}
                      onResetAll={resetAllConfiguration}
                      onOpenLayoutVersions={() => navigateWithinDashboard('/settings/data/history')}
                    />
                  </React.Suspense>
                ) : undefined
              }
            />
          </div>
        ) : (
          <>
            <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-2">
            {!isEditMode ? (
              <HomeAttentionCenter
                runtimeMode={effectiveRuntimeMode}
                connected={isHaConnected}
                states={haStates}
                entityRegistry={haEntityRegistry}
                deviceRegistry={haDeviceRegistry}
                areas={haAreas}
                widgets={widgets}
                onOpenItem={handleOpenHomeAttentionItem}
              />
            ) : null}
            <GridCanvas
              isEditMode={isEditMode}
              layoutRevision={dashboardEditorLayoutRevision}
              previewGridWidth={viewportPreviewGridWidth}
              developerMode={developerMode}
              isXsViewport={isXsViewport}
              onActiveBreakpointChange={setCanvasGridBreakpoint}
              state={stateWithConnectedUser}
              houseMembers={profileHouseMembers}
              sections={sections}
              widgets={widgets}
              runningSceneBySectionId={runningSceneBySectionId}
              selectedWidgetId={selectedWidgetId}
              selectedSectionId={selectedSectionId}
              isCatalogOpen={isCatalogOpen}
              widgetTypeLayoutOverrides={widgetTypeLayoutOverrides}
              widgetLayoutOverrides={widgetLayoutOverrides}
              responsiveLayouts={responsiveLayouts}
              onCloseCatalog={() => setIsCatalogOpen(false)}
              onSelectWidget={(id) => {
                setSelectedWidgetId(id);
                if (id) {
                  setSelectedSectionId(null);
                  setSelectedSidebarPathId(null);
                }
              }}
              onSelectSection={(id) => {
                setSelectedSectionId(id);
                if (id) {
                  setSelectedWidgetId(null);
                  setSelectedSidebarPathId(null);
                }
              }}
              onWidgetClick={handleWidgetClick}
              onWidgetLightToggle={(widget) => {
                if (widget.kind !== 'light') {
                  return;
                }
                toggleLightEntity(widget);
              }}
              onWidgetSwitchToggle={(widget) => {
                if (widget.kind !== 'switch') {
                  return;
                }
                if (!isXsViewport) {
                  handleWidgetClick(widget);
                }
                toggleSwitchEntity(widget);
              }}
              onWidgetBrightnessChange={handleWidgetBrightnessChange}
              onWidgetLightColorChange={(widget, hs) => setLightHsColor(hs, undefined, widget)}
              onWidgetClimateTargetTempChange={(widget, nextValue) => {
                setClimateTargetTemp(nextValue, widget);
              }}
              onWidgetClimateTargetRangeChange={(widget, low, high) => {
                setClimateTargetRange(low, high, widget);
              }}
              onWidgetClimateTargetHumidityChange={(widget, nextValue) => {
                setClimateTargetHumidity(nextValue, widget);
              }}
              onWidgetClimatePowerToggle={(widget) => {
                toggleClimatePower(widget);
              }}
              onWidgetClimateModeChange={(widget, mode) => {
                setClimateMode(mode, widget);
              }}
              onWidgetClimateFanModeChange={(widget, mode) => {
                setClimateFanMode(mode, widget);
              }}
              onWidgetClimatePresetModeChange={(widget, mode) => {
                setClimatePresetMode(mode, widget);
              }}
              onWidgetClimateSwingModeChange={(widget, mode) => {
                setClimateSwingMode(mode, widget);
              }}
              onWidgetClimateSwingHorizontalModeChange={(widget, mode) => {
                setClimateSwingHorizontalMode(mode, widget);
              }}
              onWidgetMediaToggle={toggleMediaPlayback}
              onWidgetMediaPrevious={previousMediaTrack}
              onWidgetMediaNext={nextMediaTrack}
              onWidgetMediaSeek={(widget, position) => {
                if (widget.kind !== 'media') {
                  return;
                }
                if (activeWidget?.id !== widget.id) {
                  setSelectedWidgetId(widget.id);
                }
                seekMediaPosition(position, widget);
              }}
              onWidgetMediaShuffle={(widget) => {
                if (widget.kind !== 'media') {
                  return;
                }
                if (activeWidget?.id !== widget.id) {
                  setSelectedWidgetId(widget.id);
                }
                toggleMediaShuffle(widget);
              }}
              onWidgetMediaRepeat={(widget) => {
                if (widget.kind !== 'media') {
                  return;
                }
                if (activeWidget?.id !== widget.id) {
                  setSelectedWidgetId(widget.id);
                }
                cycleMediaRepeatMode(widget);
              }}
              onWidgetMediaSelectSource={(widget, source) => {
                if (widget.kind !== 'media') {
                  return;
                }
                selectMediaOutputDevice(source, widget);
              }}
              onWidgetAlarmDisarm={(widget) => {
                if (widget.kind !== 'alarm') {
                  return;
                }
                void requestAlarmQuickAction('alarm_disarm', widget);
              }}
              onWidgetAlarmArm={(widget, mode) => {
                if (widget.kind !== 'alarm') {
                  return;
                }
                void requestAlarmQuickAction(resolveAlarmArmServiceByMode(mode), widget);
              }}
              onWidgetVacuumStartPause={(widget) => {
                if (widget.kind !== 'vacuum') {
                  return;
                }
                toggleVacuumStartPause(widget);
              }}
              onWidgetVacuumStop={(widget) => {
                if (widget.kind !== 'vacuum') {
                  return;
                }
                stopVacuum(widget);
              }}
              onWidgetVacuumReturnToBase={(widget) => {
                if (widget.kind !== 'vacuum') {
                  return;
                }
                returnVacuumToBase(widget);
              }}
              onWidgetLockToggle={(widget) => {
                if (widget.kind !== 'lock') {
                  return;
                }
                return toggleLockDoor(widget);
              }}
              onWidgetLockOpen={(widget) => {
                if (widget.kind !== 'lock') {
                  return;
                }
                const configuredCode = getWidgetSecrets(widget.id).lockCode?.trim();
                if (widget.lockRequireAuthToUnlock || configuredCode) {
                  void requestAuthenticatedLockAction(widget, 'open');
                  return;
                }
                openDoor(undefined, widget);
              }}
              onWidgetCoverPositionChange={(widget, position) => {
                if (widget.kind !== 'cover') {
                  return;
                }
                setCoverPosition(position, widget);
              }}
              onWidgetCoverTiltPositionChange={(widget, position) => {
                if (widget.kind !== 'cover') {
                  return;
                }
                setCoverTiltPosition(position, widget);
              }}
              onWidgetCoverOpen={(widget) => {
                if (widget.kind !== 'cover') {
                  return;
                }
                openCover(widget);
              }}
              onWidgetCoverStop={(widget) => {
                if (widget.kind !== 'cover') {
                  return;
                }
                stopCover(widget);
              }}
              onWidgetCoverClose={(widget) => {
                if (widget.kind !== 'cover') {
                  return;
                }
                closeCover(widget);
              }}
              onOpenMembersPanel={() => {
                navigateWithinDashboard('/settings/access');
              }}
              onWeatherClick={openWeatherControls}
              onSceneTrigger={triggerSceneAction}
              onWidgetLayoutChange={handleWidgetLayoutChange}
              onSectionsLayoutChange={handleSectionsLayoutChange}
              onRootBreakpointLayoutChange={updateRootResponsiveLayout}
              onStackBreakpointLayoutChange={updateStackResponsiveLayout}
              onAddWidget={addWidget}
              onAddSection={addSection}
              onRemoveSection={removeSection}
              onUpdateSection={updateSection}
              haConnected={isHaConnected}
              haStates={haStatesForUi}
              sensorHistoryByEntity={sensorHistoryByEntity}
              onWidgetDisplayMetricsChange={handleWidgetDisplayMetricsChange}
            />
            </div>

            {isEditMode || activeDevice ? (
              <React.Suspense
                fallback={
                  <DashboardSidebarPlaceholder
                    isCompactViewport={isCompactViewport}
                    loading
                  />
                }
              >
              <RightSidebarManager
              isEditMode={isEditMode}
              commandsEnabled={effectiveRuntimeMode === 'demo' || isHaConnected}
              isCompactViewport={isCompactViewport}
              theme={appearance}
              activeDevice={activeDevice}
              onCloseContextSidebar={clearContextSelection}
              state={contextState}
              camera={contextCamera}
              alarm={contextAlarm}
              vacuum={contextVacuum}
              lock={contextLock}
              cover={contextCover}
              vacuumAreas={contextVacuum.areaOptions}
              actions={{
                toggleLamp: () => toggleLightEntity(),
                toggleSwitch: () => toggleSwitchEntity(),
                setLampBrightness: (value, options) => setLightBrightness(value, options),
                setLampColorTemp: (kelvin, options) => setLightColorTemp(kelvin, options),
                setLampHsColor: (hs, options) => setLightHsColor(hs, options),
                setLampWhite: (value, options) => setLightWhite(value, options),
                setLampEffect: (effect, options) => setLightEffect(effect, options),
                flashLamp: (mode) => flashLight(mode),
                toggleClimatePower: () => toggleClimatePower(),
                decreaseClimateTarget: () => decreaseClimateTarget(),
                increaseClimateTarget: () => increaseClimateTarget(),
                autoAdjustClimate: () => autoAdjustClimate(),
                nudgeClimateCurrent: () => {
                  if (!isHaConnected) {
                    actions.nudgeClimateCurrent();
                  }
                },
                setClimateTargetTemp: (value) => setClimateTargetTemp(value),
                setClimateTargetRange: (low, high) => setClimateTargetRange(low, high),
                setClimateMode: (mode) => setClimateMode(mode),
                setClimateFanMode: (mode) => setClimateFanMode(mode),
                setClimateTargetHumidity: (value) => setClimateTargetHumidity(value),
                setClimatePresetMode: (mode) => setClimatePresetMode(mode),
                setClimateSwingMode: (mode) => setClimateSwingMode(mode),
                setClimateSwingHorizontalMode: (mode) => setClimateSwingHorizontalMode(mode),
                toggleSpeakerPlayback: () => toggleMediaPlayback(),
                toggleSpeakerPower: () => toggleMediaPower(),
                previousSpeakerTrack: () => previousMediaTrack(),
                nextSpeakerTrack: () => nextMediaTrack(),
                seekSpeakerPosition: (position) => seekMediaPosition(position),
                setSpeakerVolume: (value) => setMediaVolume(value),
                toggleSpeakerMute: () => toggleMediaMute(),
                toggleSpeakerShuffle: () => toggleMediaShuffle(),
                cycleSpeakerRepeatMode: () => cycleMediaRepeatMode(),
                stopSpeakerPlayback: () => stopMediaPlayback(),
                clearSpeakerPlaylist: () => clearMediaPlaylist(),
                selectSpeakerSoundMode: (soundMode) => selectMediaSoundMode(soundMode),
                playSpeakerMedia: (request) => playMedia(request),
                selectSpeakerOutputDevice: (deviceId) => selectMediaOutputDevice(deviceId),
                toggleSpeakerGroupMember: (deviceId, shouldJoin) =>
                  toggleMediaGroupMember(deviceId, shouldJoin),
                disarmAlarm: (code, options) => disarmAlarm(code, undefined, options),
                armAlarmHome: (code, options) => armAlarmHome(code, undefined, options),
                armAlarmAway: (code, options) => armAlarmAway(code, undefined, options),
                armAlarmNight: (code, options) => armAlarmNight(code, undefined, options),
                armAlarmVacation: (code, options) => armAlarmVacation(code, undefined, options),
                armAlarmCustomBypass: (code, options) => armAlarmCustomBypass(code, undefined, options),
                triggerAlarm: (code, options) => triggerAlarm(code, undefined, options),
                startVacuum: () => startVacuum(),
                pauseVacuum: () => pauseVacuum(),
                stopVacuum: () => stopVacuum(),
                returnVacuumToBase: () => returnVacuumToBase(),
                locateVacuum: () => locateVacuum(),
                cleanVacuumSpot: () => cleanVacuumSpot(),
                cleanVacuumArea: (areaIds) => cleanVacuumArea(areaIds),
                setVacuumFanSpeed: (fanSpeed) => setVacuumFanSpeed(fanSpeed),
                sendVacuumCommand: (command, params) => sendVacuumCommand(command, params),
                controlVacuumRelatedEntity: (request) => controlVacuumRelatedEntity(request),
                lockDoor: (code) => lockDoor(code),
                unlockDoor: (code) => unlockDoorFromContext(code),
                openDoor: (code) => openDoorFromContext(code),
                openCover: () => openCover(),
                closeCover: () => closeCover(),
                stopCover: () => stopCover(),
                setCoverPosition: (position) => setCoverPosition(position),
                openCoverTilt: () => openCoverTilt(),
                closeCoverTilt: () => closeCoverTilt(),
                stopCoverTilt: () => stopCoverTilt(),
                setCoverTiltPosition: (position) => setCoverTiltPosition(position),
                moveCameraPtz: (direction) => moveCameraPtz(direction),
                stopCameraPtz: () => stopCameraPtz(),
                runCameraRelatedEntityAction: (request) => runCameraRelatedEntityAction(request),
              }}
              onAuthorizeAlarmDeviceAuth={authorizeAlarmDeviceAuth}
              onToggleMicroWidget={toggleMicroWidgetEntity}
              onSetMicroSliderValue={setMicroSliderEntityValue}
              onNavigateMicroWidgetPage={handleMicroWidgetPageNavigation}
              microChartHistoryByEntity={sensorHistoryByEntity}
              onUpdateUserName={actions.setUserName}
              selectedWidget={selectedWidget}
              selectedWidgetDisplayMetrics={selectedWidgetDisplayMetrics}
              selectedWidgetActiveLayout={selectedWidgetActiveLayout}
              selectedSection={selectedSection}
              selectedSidebarPath={selectedSidebarPath}
              sidebarPaths={visibleSidebarPaths}
              weatherConfig={weatherSection}
              activeGridBreakpoint={canvasGridBreakpoint}
              widgetTypeLayoutOverrides={widgetTypeLayoutOverrides}
              widgetLayoutOverrides={widgetLayoutOverrides}
              entityOptions={entityOptions}
              haEntityIds={haEntityIds}
              haConnected={isHaConnected}
              haStates={haStatesForUi}
              onUpdateWidget={updateWidget}
              onUpdateWidgetTypeLayoutOverride={updateWidgetTypeLayoutOverride}
              onUpdateWidgetLayoutOverride={updateWidgetLayoutOverride}
              onUpdateSection={updateSection}
              onUpdateSidebarPath={updateSidebarPath}
              onRemoveSelectedWidget={removeSelectedWidget}
              onRemoveSection={removeSection}
              onRemoveSidebarPath={(id) => {
                removeSidebarPath(id);
                if (selectedSidebarPathId === id) {
                  setSelectedSidebarPathId(null);
                }
              }}
              />
              </React.Suspense>
            ) : (
              <DashboardSidebarPlaceholder isCompactViewport={isCompactViewport} />
            )}
          </>
        )}
        </React.Suspense>

      </main>

      {isConsumptionView && !isConsumptionDetailView && isEditMode && isCompactViewport && selectedConsumptionCardId ? (
        <>
          <button
            type="button"
            onClick={() => setSelectedConsumptionCardId(null)}
            className="fixed inset-0 z-[218] bg-black/60 backdrop-blur-sm"
            aria-label={t('home.consumption.closeConfiguration')}
          />
          <div className="liquid-glass-sheet fixed inset-x-0 bottom-0 z-[219] flex max-h-[92dvh] min-h-[18rem] w-full flex-col p-3 py-2 transition-all duration-250">
            <div className="mb-2 flex justify-center">
              <span className="liquid-glass-drag-handle" />
            </div>
            <React.Suspense fallback={<SecondaryWorkspaceLoading label="Apertura configurazione…" />}>
              <ConsumptionEditorSidebar
                selectedCardId={selectedConsumptionCardId}
                onSelectCard={setSelectedConsumptionCardId}
                config={consumptionConfig}
                haEntityIds={haEntityIds}
                haConnected={isHaConnected}
                onUpdateConfigField={updateConsumptionConfigField}
                onResetConfig={resetConsumptionConfig}
                variant="sheet"
                onClose={() => setSelectedConsumptionCardId(null)}
              />
            </React.Suspense>
          </div>
        </>
      ) : null}

      {shouldShowBottomBar ? (
        <BottomBarNav
          isEditMode={isEditMode}
          quickPaths={visibleSidebarPaths}
          selectedPathId={selectedSidebarPathId}
          activeRoute={activeNavigationRoute}
          isSettingsActive={isSettingsView}
          onPathClick={handleSidebarPathClick}
          onOpenSettings={openSettingsRoute}
          onPrefetchRoute={prefetchDashboardWorkspace}
        />
      ) : null}

      {isProfileOpen ? (
        <React.Suspense fallback={<SecondaryWorkspaceLoading label="Apertura profilo…" overlay />}>
          <ModernProfilePage
            isOpen
            onClose={closeProfileRoute}
            initialSection={profileInitialSection}
            currentUserId={deviceAuthUser.id}
            userAvatarUrl={currentUserAvatarUrl}
            userAvatarAlt={stateWithConnectedUser.userName}
            userEmail={profileUserEmail}
            userRoleLabel={profileUserRoleLabel}
            houseMembers={profileHouseMembers}
            userOwnedDeviceCount={profileUserOwnedDeviceCount}
            movementTimeline={profileMovementTimeline}
            movementPoints={profileMovementPoints}
            movementUpdatedLabel={profileMovementUpdatedLabel}
            haStatus={haStatus}
            appearanceMode={appearanceMode}
            onAppearanceModeChange={setAppearanceMode}
            background={background}
            onBackgroundChange={setBackground}
            navigationRoute={activeNavigationRoute}
            onNavigate={navigateWithinDashboard}
          />
        </React.Suspense>
      ) : null}

      {activeMainGuide ? (
        <React.Suspense fallback={<SecondaryWorkspaceLoading label="Preparazione guida…" overlay />}>
          <GuidedSetupOverlay
            isOpen
            tag={activeMainGuide.tag}
            heading={activeMainGuide.heading}
            description={activeMainGuide.description}
            steps={activeMainGuideSteps}
            onDismiss={dismissActiveMainGuide}
            onStepChange={(step) => setActiveMainGuideStepId(step.id ?? null)}
            isStepComplete={(step) => step.id === 'edit-mode' && isEditMode}
            completeLabel={activeMainGuide.completeLabel}
            skipLabel={activeMainGuide.skipLabel}
          />
        </React.Suspense>
      ) : null}

      {isQuickSecurityAuthOpen || hasMountedQuickSecurityAuth ? (
        <React.Suspense fallback={<SecondaryWorkspaceLoading label={t('home.security.prepare')} overlay />}>
          <SecurityAuthModal
            isOpen={isQuickSecurityAuthOpen}
            pendingAlarmState={pendingQuickAlarmAction?.state ?? null}
            pendingStateRequiresCode={quickAlarmRequiresCode || quickLockRequiresCode}
            title={
              pendingQuickLockAction
                ? t('home.security.unlockTitle')
                : pendingQuickAlarmAction?.requiresBiometric
                ? t('home.security.deviceTitle')
                : t('home.security.commandTitle')
            }
            description={
              pendingQuickLockAction
                ? t('home.security.lockDescription')
                : quickAlarmRequiresCode
                ? t('home.security.alarmDescription')
                : t('home.security.deviceDescription')
            }
            authError={quickSecurityAuthError}
            isAuthBusy={isQuickAlarmAuthBusy || isLockAuthBusy}
            isAlarmCodeNumeric={pendingQuickLockAction?.numericCodeMode ?? pendingQuickAlarmAction?.numericCodeMode ?? true}
            alarmCodeTypeLabel={pendingQuickLockAction ? t('home.security.lockCode') : quickAlarmCodeTypeLabel}
            authPinInput={quickAlarmAuthCode}
            preferDeviceAuth={Boolean(pendingQuickAlarmAction?.requiresBiometric)}
            deviceAuthLabel={t('home.security.deviceVerify')}
            onVerifyWithDevice={
              pendingQuickAlarmAction?.requiresBiometric
                ? async () => Boolean(await confirmQuickAlarmAuth(true))
                : undefined
            }
            onPinInputChange={(value) => {
              setQuickAlarmSubmissionError('');
              setQuickAlarmAuthCode(
                (pendingQuickLockAction?.numericCodeMode ?? pendingQuickAlarmAction?.numericCodeMode) === false
                  ? value.slice(0, 12)
                  : value.replace(/[^\d]/g, '').slice(0, 12),
              );
            }}
            onVerifyWithPin={() => pendingQuickLockAction ? confirmQuickLockAuth() : confirmQuickAlarmAuth(false)}
            onPushPinDigit={(digit) => {
              setQuickAlarmSubmissionError('');
              setQuickAlarmAuthCode((current) => `${current}${digit}`.slice(0, 12));
            }}
            onPopPinDigit={() => {
              setQuickAlarmSubmissionError('');
              setQuickAlarmAuthCode((current) => current.slice(0, -1));
            }}
            onClearPin={() => {
              setQuickAlarmSubmissionError('');
              setQuickAlarmAuthCode('');
            }}
            onClose={closeQuickAlarmAuth}
            usePortal
          />
        </React.Suspense>
      ) : null}

      <GlassModal
        isOpen={Boolean(pendingStackRemoval)}
        onClose={() => setPendingStackRemovalId(null)}
        eyebrow={t('home.stack.removeEyebrow')}
        title={t('home.stack.removeTitle', { name: pendingStackRemoval?.section.title || t('home.stack.fallbackName') })}
        description={pendingStackRemoval
          ? t('home.stack.removeDescription', { count: pendingStackRemoval.cardCount })
          : undefined}
        variant="responsive"
        size="md"
        zIndex={230}
        showCloseButton={false}
        backdropClassName="bg-black/60 backdrop-blur-3xl"
        bodyClassName="hidden"
        footerClassName="flex-col-reverse items-stretch sm:flex-row sm:items-center"
        footer={
          <>
            <button
              type="button"
              onClick={() => setPendingStackRemovalId(null)}
              className="glass-button w-full rounded-xl px-4 py-2.5 text-sm text-[color:var(--ui-text-secondary)] sm:w-auto"
            >
              {t('home.stack.cancel')}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!pendingStackRemovalId) return;
                const sectionId = pendingStackRemovalId;
                setPendingStackRemovalId(null);
                executeSectionRemoval(sectionId, 'delete');
              }}
              className="glass-button w-full rounded-xl border-rose-300/45 bg-rose-500/16 px-4 py-2.5 text-sm font-semibold text-rose-100 hover:bg-rose-500/26 sm:w-auto"
            >
              {t('home.stack.deleteCards')}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!pendingStackRemovalId) return;
                const sectionId = pendingStackRemovalId;
                setPendingStackRemovalId(null);
                executeSectionRemoval(sectionId, 'move-to-canvas');
              }}
              className="glass-button w-full rounded-xl border-blue-300/45 bg-blue-500/16 px-4 py-2.5 text-sm font-semibold text-blue-100 hover:bg-blue-500/26 sm:w-auto"
            >
              {t('home.stack.moveCards')}
            </button>
          </>
        }
      />

      <GlassModal
        isOpen={Boolean(editConfirm)}
        onClose={() => {
          if (!isDashboardSaveBusy) setEditConfirm(null);
        }}
        eyebrow={editConfirm === 'enter' ? t('dashboard.edit.eyebrow.enter') : editConfirm === 'refresh' ? t('dashboard.edit.eyebrow.refresh') : t('dashboard.edit.eyebrow.exit')}
        title={editConfirm === 'enter' ? t('dashboard.edit.title.enter') : editConfirm === 'refresh' ? t('dashboard.edit.title.refresh') : t('dashboard.edit.title.exit')}
        description={
          editConfirm === 'enter'
            ? requiresDashboardLayoutMigration
              ? t('dashboard.edit.description.migration')
              : t('dashboard.edit.description.enter')
            : editConfirm === 'refresh'
              ? hasUnsavedDashboardEdits
                ? t('dashboard.edit.description.refreshDirty')
                : t('dashboard.edit.description.refreshClean')
              : hasUnsavedDashboardEdits
                ? t('dashboard.edit.description.exitDirty')
                : t('dashboard.edit.description.exitClean')
        }
        variant="responsive"
        size="md"
        zIndex={230}
        showCloseButton={false}
        backdropClassName="bg-black/60 backdrop-blur-3xl"
        bodyClassName="hidden"
        footer={
          <>
            <button type="button" disabled={isDashboardSaveBusy} onClick={() => setEditConfirm(null)} className="glass-button rounded-xl px-4 py-2 text-sm text-white/70 disabled:opacity-45">
              {t('dashboard.edit.cancel')}
            </button>
            {editConfirm === 'exit' && hasUnsavedDashboardEdits ? (
              <button
                type="button"
                disabled={isDashboardSaveBusy}
                onClick={discardDashboardEditSession}
                className="glass-button rounded-xl px-4 py-2 text-sm font-semibold text-[color:var(--ui-text-secondary)]"
              >
                {t('dashboard.edit.discard')}
              </button>
            ) : null}
            <button
              type="button"
              disabled={isDashboardSaveBusy}
              onClick={confirmEditAction}
              className={`glass-button rounded-xl px-4 py-2 text-sm font-semibold ${
                editConfirm === 'enter'
                  ? 'border-blue-300/45 bg-blue-500/16 text-blue-100 hover:bg-blue-500/26'
                  : 'border-rose-300/45 bg-rose-500/16 text-rose-100 hover:bg-rose-500/26'
              }`}
            >
              {isDashboardSaveBusy
                ? t('dashboard.save.saving')
                : editConfirm === 'enter'
                ? requiresDashboardLayoutMigration
                  ? t('dashboard.edit.transfer')
                  : t('dashboard.edit.activate')
                : editConfirm === 'refresh'
                  ? t('dashboard.edit.reload')
                  : hasUnsavedDashboardEdits
                    ? t('dashboard.edit.saveExit')
                    : t('dashboard.edit.exitShort')}
            </button>
          </>
        }
      />

      <GlassModal
        isOpen={isDashboardConflictOpen}
        onClose={() => setIsDashboardConflictOpen(false)}
        eyebrow={haDashboardLayoutPersistence.pendingRemoteUpdate ? t('home.remote.updateEyebrow') : t('home.remote.conflictEyebrow')}
        title={haDashboardLayoutPersistence.pendingRemoteUpdate
          ? t('home.remote.availableTitle', { revision: haDashboardLayoutPersistence.pendingRemoteUpdate.revision })
          : t('home.remote.changedTitle')}
        description={haDashboardLayoutPersistence.pendingRemoteUpdate
          ? hasUnsavedDashboardEdits
            ? t('home.remote.draftDescription')
            : t('home.remote.applyDescription')
          : t('home.remote.conflictDescription')}
        variant="responsive"
        size="md"
        zIndex={240}
        showCloseButton={false}
        backdropClassName="bg-black/65 backdrop-blur-3xl"
        bodyClassName="hidden"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsDashboardConflictOpen(false)}
              className="glass-button rounded-xl px-4 py-2 text-sm text-[color:var(--ui-text-secondary)]"
            >
              {hasUnsavedDashboardEdits ? t('home.remote.continue') : t('home.remote.later')}
            </button>
            <button
              type="button"
              onClick={haDashboardLayoutPersistence.pendingRemoteUpdate
                ? applyPendingDashboardRemoteUpdate
                : reloadAfterDashboardConflict}
              className="glass-button rounded-xl border-blue-300/45 bg-blue-500/16 px-4 py-2 text-sm font-semibold text-blue-100"
            >
              {haDashboardLayoutPersistence.pendingRemoteUpdate
                ? hasUnsavedDashboardEdits
                  ? t('home.remote.discardApply')
                  : t('home.remote.apply')
                : t('home.remote.loadHa')}
            </button>
          </>
        }
      />

      {visibleDashboardRecovery ? (
        <React.Suspense fallback={<SecondaryWorkspaceLoading label={t('home.remote.recoveryLoading')} overlay />}>
          <DashboardRecoveryModal
            snapshot={visibleDashboardRecovery}
            onKeepCurrent={() => {
              if (typeof window === 'undefined') {
                return;
              }
              const result = discardDashboardRecoverySnapshot(effectiveRuntimeMode, window.localStorage);
              if (!result.ok) {
                addNotification('alert', t('home.remote.recoveryDeleteFailed'));
                return;
              }
              setPendingDashboardRecovery(null);
            }}
            onRestore={() => {
              if (typeof window === 'undefined' || !dashboardSecurity.can('edit_dashboard')) {
                return;
              }
              const result = restoreDashboardRecoverySnapshot(effectiveRuntimeMode, window.localStorage);
              if (!result.ok) {
                addNotification('alert', t('home.restore.failed'));
                return;
              }
              window.location.reload();
            }}
          />
        </React.Suspense>
      ) : null}

      <DashboardEditDraftRecoveryModal
        draft={visibleDashboardEditDraft}
        hasRevisionConflict={dashboardEditDraftHasRevisionConflict}
        onResume={resumePendingDashboardEditDraft}
        onDiscard={discardPendingDashboardEditDraft}
      />
    </div>
    </SensitiveActionGateProvider>
    </DashboardSecurityProvider>
  );
}

export default MainBoard;
