import React, { useCallback, useMemo } from 'react';
import { Crown, Lightbulb, LocateFixed, MapPin, Smartphone, Tablet, Users, Watch, X } from 'lucide-react';
import { Map, Marker, type MapProps, type MapRef } from '@vis.gl/react-maplibre';
import { ActiveDevice } from './types';
import { ClimateControls } from './ClimateControls';
import { LightControls } from './LightControls';
import {
  CameraControls,
  type CameraDeviceInfo,
  type CameraHistoryEntry,
  type CameraHistoryStatus,
  type CameraPtzDirection,
  type CameraRelatedEntityActionRequest,
  type CameraRelatedEntityInfo,
} from './CameraControls';
import { MediaControls, type MediaPlayRequest } from './MediaControls';
import { SensorControls } from './SensorControls';
import { WeatherControls } from './WeatherControls';
import { AlarmControls } from './AlarmControls';
import { VacuumControls, type VacuumRelatedEntityActionRequest } from './VacuumControls';
import type { VacuumDeviceInfo, VacuumMappedArea, VacuumRelatedEntityInfo } from '../widgets/vacuumDeviceModel';
import { LockControls } from './LockControls';
import { CoverControls } from './CoverControls';
import { SwitchControls } from './SwitchControls';
import { CONTEXT_PANEL_LAYOUT } from './layoutClasses';
import { ContextPanelHeader } from './ContextPanelHeader';
import { StatusGlow } from '../widgets/micro/StatusGlow';
import { ValuePill } from '../widgets/micro/ValuePill';
import { MiniRing } from '../widgets/micro/MiniRing';
import { MicroToggle } from '../widgets/micro/MicroToggle';
import { MicroButton } from '../widgets/micro/MicroButton';
import { MicroSuperChart } from '../widgets/micro/MicroSuperChart';
import { MicroStep } from '../widgets/micro/MicroStep';
import { MicroSlider } from '../widgets/micro/MicroSlider';
import type { DashboardStateShape } from '../../hooks/useDashboardState';
import type { DashboardAppearance } from '../../theme/dashboardTheme';
import type { MockEntityStateMap } from '../../types/ha';
import type { AlarmActionAuthOptions } from '../../utils/alarmSecurityPolicy';
import { useI18n } from '../../i18n/I18nProvider';

type MediaRepeatMode = 'off' | 'all' | 'one';
type MediaOutputKind = 'speaker' | 'tv' | 'cast';

function resolveEntityStateById(haStates: MockEntityStateMap, entityId: string | undefined) {
  const normalizedEntityId = (entityId ?? '').trim();
  if (!normalizedEntityId) {
    return undefined;
  }
  return haStates[normalizedEntityId] ?? haStates[normalizedEntityId.toLowerCase()];
}

interface ContextSidebarProps {
  activeDevice: ActiveDevice | null;
  isEditMode?: boolean;
  commandsEnabled?: boolean;
  theme?: DashboardAppearance;
  onClose?: () => void;
  showCloseButton?: boolean;
  onSecondaryPageChange?: (open: boolean) => void;
  externalScrollContainer?: boolean;
  haStates?: MockEntityStateMap;
  microChartHistoryByEntity?: Record<string, number[]>;
  lamp: {
    name: string;
    isOn: boolean;
    brightness: number;
    status: string;
    hsColor: [number, number];
    colorTemp: number;
    supportsBrightness?: boolean;
    supportsColorTemp?: boolean;
    supportsColor?: boolean;
    supportsWhite?: boolean;
    supportsEffects?: boolean;
    supportsFlash?: boolean;
    supportsTransition?: boolean;
    minColorTempKelvin?: number;
    maxColorTempKelvin?: number;
    effect?: string;
    effectList?: string[];
  };
  climate: {
    name: string;
    mode: string;
    isOn: boolean;
    status?: string;
    currentTemp: number;
    targetTemp: number;
    minTemp: number;
    maxTemp: number;
    targetTempLow?: number;
    targetTempHigh?: number;
    targetTempStep?: number;
    hvacModes?: string[];
    hvacAction?: string;
    fanMode?: string;
    fanModes?: string[];
    supportedFeatures?: number;
    precision?: number;
    currentHumidity?: number;
    targetHumidity?: number;
    minHumidity?: number;
    maxHumidity?: number;
    targetHumidityStep?: number;
    presetMode?: string;
    presetModes?: string[];
    swingMode?: string;
    swingModes?: string[];
    swingHorizontalMode?: string;
    swingHorizontalModes?: string[];
    supportsTargetTemperature?: boolean;
    supportsTargetTemperatureRange?: boolean;
    supportsTargetHumidity?: boolean;
    supportsFanMode?: boolean;
    supportsPresetMode?: boolean;
    supportsSwingMode?: boolean;
    supportsSwingHorizontalMode?: boolean;
    supportsTurnOn?: boolean;
    supportsTurnOff?: boolean;
    temperatureUnit?: string;
    rawAttributes?: Record<string, unknown>;
  };
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
  speaker: {
    isPlaying: boolean;
    status: string;
    progress: number;
    positionSeconds?: number;
    trackTitle?: string;
    trackArtist?: string;
    durationSeconds?: number;
    coverUrl?: string;
    volumeLevel?: number;
    muted?: boolean;
    supportsSeek?: boolean;
    supportsVolume?: boolean;
    supportsMute?: boolean;
    supportsVolumeStep?: boolean;
    supportsNextTrack?: boolean;
    supportsPreviousTrack?: boolean;
    supportsPower?: boolean;
    supportsShuffle?: boolean;
    supportsRepeat?: boolean;
    supportsSelectSource?: boolean;
    supportsGrouping?: boolean;
    supportsStop?: boolean;
    supportsClearPlaylist?: boolean;
    supportsSelectSoundMode?: boolean;
    supportsPlayMedia?: boolean;
    supportsBrowseMedia?: boolean;
    supportsSearchMedia?: boolean;
    supportsAnnounce?: boolean;
    supportsEnqueue?: boolean;
    shuffleEnabled?: boolean;
    repeatMode?: MediaRepeatMode;
    soundMode?: string;
    soundModeList?: string[];
    volumeStep?: number;
    outputDevices?: Array<{
      id: string;
      name: string;
      subtitle?: string;
      kind?: MediaOutputKind;
    }>;
    selectedOutputDeviceId?: string;
    multiroomDevices?: Array<{
      id: string;
      name: string;
      subtitle?: string;
      kind?: MediaOutputKind;
      grouped?: boolean;
    }>;
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
  vacuumAreas?: VacuumMappedArea[];
  weather: DashboardStateShape['weather'];
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
  weatherConfig?: {
    unit?: 'C' | 'F';
    forecastType?: 'daily' | 'hourly' | 'twice_daily';
    forecastDays?: number;
    forecastDensity?: 'comfortable' | 'compact';
    conditionOverride?: string;
    showPrecipitation?: boolean;
    showWind?: boolean;
  };
  onToggleMicroWidget?: (entityId: string, nextActive: boolean) => void;
  onSetMicroSliderValue?: (entityId: string, value: number) => void;
  onNavigateMicroWidgetPage?: (path: string) => void;
  onAuthorizeAlarmDeviceAuth?: (label: string) => Promise<boolean>;
  actions: {
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
    setClimateTargetTemp?: (value: number) => void;
    setClimateTargetRange?: (low: number, high: number) => void;
    setClimateMode?: (mode: string) => void;
    setClimateFanMode?: (mode: string) => void;
    setClimateTargetHumidity?: (value: number) => void;
    setClimatePresetMode?: (mode: string) => void;
    setClimateSwingMode?: (mode: string) => void;
    setClimateSwingHorizontalMode?: (mode: string) => void;
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
    setCoverPosition?: (position: number) => void;
    openCoverTilt?: () => void;
    closeCoverTilt?: () => void;
    stopCoverTilt?: () => void;
    setCoverTiltPosition?: (position: number) => void;
    moveCameraPtz?: (direction: CameraPtzDirection) => void;
    stopCameraPtz?: () => void;
    runCameraRelatedEntityAction?: (
      request: CameraRelatedEntityActionRequest,
    ) => boolean | void | Promise<boolean | void>;
  };
}

type MembersMapPoint = NonNullable<ActiveDevice['membersMapPoints']>[number];
type MembersMapInitialViewState = NonNullable<MapProps['initialViewState']>;
const MEMBERS_MAP_LIGHT_STYLE_URL = new URL(
  '../../assets/map-styles/members-light.style.json',
  import.meta.url,
).toString();
const MEMBERS_MAP_DARK_STYLE_URL = new URL(
  '../../assets/map-styles/members-dark.style.json',
  import.meta.url,
).toString();

function buildMembersMapInitialViewState(points: MembersMapPoint[]): MembersMapInitialViewState {
  if (points.length === 0) {
    return { longitude: 12.4964, latitude: 41.9028, zoom: 4 };
  }
  if (points.length === 1) {
    return {
      longitude: points[0].longitude,
      latitude: points[0].latitude,
      zoom: 12.2,
    };
  }

  let minLongitude = Number.POSITIVE_INFINITY;
  let maxLongitude = Number.NEGATIVE_INFINITY;
  let minLatitude = Number.POSITIVE_INFINITY;
  let maxLatitude = Number.NEGATIVE_INFINITY;

  points.forEach((point) => {
    minLongitude = Math.min(minLongitude, point.longitude);
    maxLongitude = Math.max(maxLongitude, point.longitude);
    minLatitude = Math.min(minLatitude, point.latitude);
    maxLatitude = Math.max(maxLatitude, point.latitude);
  });

  const hasArea =
    Math.abs(maxLongitude - minLongitude) > 0.000001 ||
    Math.abs(maxLatitude - minLatitude) > 0.000001;

  if (!hasArea) {
    return {
      longitude: points[0].longitude,
      latitude: points[0].latitude,
      zoom: 12.2,
    };
  }

  return {
    bounds: [minLongitude, minLatitude, maxLongitude, maxLatitude],
    fitBoundsOptions: {
      padding: 36,
      maxZoom: 14,
    },
  };
}

export function ContextSidebar({
  activeDevice,
  isEditMode = false,
  commandsEnabled = true,
  theme = 'dark',
  onClose,
  showCloseButton = true,
  onSecondaryPageChange,
  externalScrollContainer = false,
  haStates = {},
  microChartHistoryByEntity = {},
  lamp,
  climate,
  camera,
  speaker,
  vacuum,
  vacuumAreas,
  weather,
  alarm,
  lock,
  cover,
  weatherConfig,
  onToggleMicroWidget,
  onSetMicroSliderValue,
  onNavigateMicroWidgetPage,
  onAuthorizeAlarmDeviceAuth,
  actions: providedActions,
}: ContextSidebarProps) {
  const { t } = useI18n();
  const actions = useMemo<ContextSidebarProps['actions']>(() => {
    if (commandsEnabled) {
      return providedActions;
    }
    return new Proxy(providedActions, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? () => false : value;
      },
    });
  }, [commandsEnabled, providedActions]);
  const activeDeviceLayoutClass = externalScrollContainer
    ? 'overflow-visible pb-3 pt-2'
    : 'overflow-y-auto overscroll-contain glass-scrollbar [touch-action:pan-y] [-webkit-overflow-scrolling:touch] pb-4 lg:pb-6';
  const membersMapRef = React.useRef<MapRef | null>(null);
  const membersMapPoints = activeDevice?.membersMapPoints ?? [];
  const membersMapStyleUrl =
    theme === 'light' ? MEMBERS_MAP_LIGHT_STYLE_URL : MEMBERS_MAP_DARK_STYLE_URL;
  const currentMemberMapPoint = useMemo(
    () => membersMapPoints.find((point) => point.isCurrent === true) ?? null,
    [membersMapPoints],
  );
  const membersMapInitialViewState = useMemo(
    () => buildMembersMapInitialViewState(membersMapPoints),
    [membersMapPoints],
  );
  const membersMapRenderKey = useMemo(
    () =>
      membersMapPoints.length > 0
        ? membersMapPoints
            .map(
              (point) =>
                `${point.id}:${point.latitude.toFixed(5)}:${point.longitude.toFixed(5)}:${point.isCurrent ? '1' : '0'}`,
            )
            .join('|')
        : 'empty',
    [membersMapPoints],
  );
  const centerMapOnCurrentMember = useCallback(() => {
    if (!currentMemberMapPoint) {
      return;
    }
    const map = membersMapRef.current?.getMap();
    if (!map) {
      return;
    }
    const currentZoom = map.getZoom();
    map.flyTo({
      center: [currentMemberMapPoint.longitude, currentMemberMapPoint.latitude],
      zoom: Number.isFinite(currentZoom) ? Math.max(currentZoom, 12) : 12,
      speed: 0.95,
      essential: true,
    });
  }, [currentMemberMapPoint]);
  const microWidgets = activeDevice?.microWidgets ?? [];
  return (
    <aside
      className={`context-sidebar w-full shrink-0 relative ${
        externalScrollContainer ? 'h-auto' : 'h-full min-h-0'
      } ${
        activeDevice ? activeDeviceLayoutClass : 'overflow-hidden'
      }`}
    >
      {activeDevice && onClose && showCloseButton ? (
        <button
          type="button"
          onClick={onClose}
          className="glass-icon-button absolute z-30 h-9 w-9 right-[calc(clamp(0.75rem,2.8vw,1.5rem)+0.5rem)] top-[calc(clamp(0.75rem,2.8vw,1.5rem)+0.4rem)]"
          aria-label={t('builder.closeContext')}
          title={t('builder.closeContext')}
        >
          <X size={16} />
        </button>
      ) : null}

      {!activeDevice ? (
        <div className="context-content-surface flex h-full min-h-0 items-center justify-center rounded-[2rem] p-8 text-center">
          <div>
            <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]">
              <Lightbulb size={22} />
            </span>
            <p className="text-lg font-semibold text-[color:var(--ui-text-primary)]">{t('home.sidebar.empty')}</p>
            <p className="mt-2 text-sm text-[color:var(--ui-text-secondary)]">{t('home.sidebar.emptyDescription')}</p>
          </div>
        </div>
      ) : null}

      {activeDevice?.type === 'climate' ? (
        <ClimateControls
          climate={{ ...climate, name: activeDevice.name }}
          onTogglePower={actions.toggleClimatePower}
          onDecreaseTarget={actions.decreaseClimateTarget}
          onIncreaseTarget={actions.increaseClimateTarget}
          onAutoAdjust={actions.autoAdjustClimate}
          onRefreshCurrent={actions.nudgeClimateCurrent}
          onSetTargetTemp={actions.setClimateTargetTemp}
          onSetTargetRange={actions.setClimateTargetRange}
          onSetMode={actions.setClimateMode}
          onSetFanMode={actions.setClimateFanMode}
          onSetTargetHumidity={actions.setClimateTargetHumidity}
          onSetPresetMode={actions.setClimatePresetMode}
          onSetSwingMode={actions.setClimateSwingMode}
          onSetSwingHorizontalMode={actions.setClimateSwingHorizontalMode}
        />
      ) : null}

      {activeDevice?.type === 'light' ? (
        <LightControls
          lamp={{ ...lamp, name: activeDevice.name }}
          onToggle={actions.toggleLamp}
          onBrightnessChange={actions.setLampBrightness}
          onColorTempChange={actions.setLampColorTemp}
          onColorChange={actions.setLampHsColor}
          onWhiteChange={actions.setLampWhite}
          onEffectChange={actions.setLampEffect}
          onFlash={actions.flashLamp}
        />
      ) : null}

      {activeDevice?.type === 'switch' ? (
        <SwitchControls
          name={activeDevice.name}
          entityId={activeDevice.switchEntityId}
          fallbackStatus={activeDevice.status}
          entity={resolveEntityStateById(haStates, activeDevice.switchEntityId)}
          consumptionEntityId={activeDevice.switchConsumptionEntityId}
          consumptionEntity={resolveEntityStateById(haStates, activeDevice.switchConsumptionEntityId)}
          consumptionHistory={
            activeDevice.switchConsumptionEntityId
              ? microChartHistoryByEntity[activeDevice.switchConsumptionEntityId.trim()] ??
                microChartHistoryByEntity[activeDevice.switchConsumptionEntityId.trim().toLowerCase()]
              : undefined
          }
          onToggle={actions.toggleSwitch}
        />
      ) : null}

      {activeDevice?.type === 'camera' ? (
        <CameraControls
          name={activeDevice.name}
          status={camera.status ?? activeDevice.status}
          entityId={camera.entityId}
          streamUrl={camera.streamUrl}
          snapshotUrl={camera.snapshotUrl}
          isOffline={camera.isOffline}
          supportsPtz={camera.supportsPtz}
          deviceInfo={camera.deviceInfo}
          relatedEntities={camera.relatedEntities}
          historyEntries={camera.historyEntries}
          historyStatus={camera.historyStatus}
          historyError={camera.historyError}
          onRefreshHistory={camera.onRefreshHistory}
          onPtzMove={actions.moveCameraPtz}
          onPtzStop={actions.stopCameraPtz}
          onRelatedEntityAction={actions.runCameraRelatedEntityAction}
          rawAttributes={camera.rawAttributes}
          onSecondaryPageChange={onSecondaryPageChange}
          commandsEnabled={commandsEnabled && !isEditMode}
        />
      ) : null}

      {activeDevice?.type === 'media' ? (
        <MediaControls
          name={activeDevice.name}
          status={activeDevice.status}
          isPlaying={speaker.isPlaying}
          progress={speaker.progress}
          positionSeconds={speaker.positionSeconds}
          trackTitle={speaker.trackTitle}
          trackArtist={speaker.trackArtist}
          durationSeconds={speaker.durationSeconds}
          coverUrl={speaker.coverUrl}
          volumeLevel={speaker.volumeLevel}
          muted={speaker.muted}
          supportsSeek={speaker.supportsSeek}
          supportsVolume={speaker.supportsVolume}
          supportsMute={speaker.supportsMute}
          supportsVolumeStep={speaker.supportsVolumeStep}
          supportsNextTrack={speaker.supportsNextTrack}
          supportsPreviousTrack={speaker.supportsPreviousTrack}
          supportsPower={speaker.supportsPower}
          supportsShuffle={speaker.supportsShuffle}
          supportsRepeat={speaker.supportsRepeat}
          supportsSelectSource={speaker.supportsSelectSource}
          supportsGrouping={speaker.supportsGrouping}
          supportsStop={speaker.supportsStop}
          supportsClearPlaylist={speaker.supportsClearPlaylist}
          supportsSelectSoundMode={speaker.supportsSelectSoundMode}
          supportsPlayMedia={speaker.supportsPlayMedia}
          supportsBrowseMedia={speaker.supportsBrowseMedia}
          supportsSearchMedia={speaker.supportsSearchMedia}
          supportsAnnounce={speaker.supportsAnnounce}
          supportsEnqueue={speaker.supportsEnqueue}
          shuffleEnabled={speaker.shuffleEnabled}
          repeatMode={speaker.repeatMode}
          soundMode={speaker.soundMode}
          soundModeList={speaker.soundModeList}
          volumeStep={speaker.volumeStep}
          outputDevices={speaker.outputDevices}
          selectedOutputDeviceId={speaker.selectedOutputDeviceId}
          multiroomDevices={speaker.multiroomDevices}
          rawAttributes={speaker.rawAttributes}
          onTogglePlayback={actions.toggleSpeakerPlayback}
          onTogglePower={actions.toggleSpeakerPower}
          onPreviousTrack={actions.previousSpeakerTrack}
          onNextTrack={actions.nextSpeakerTrack}
          onSeek={actions.seekSpeakerPosition}
          onVolumeChange={actions.setSpeakerVolume}
          onToggleMute={actions.toggleSpeakerMute}
          onToggleShuffle={actions.toggleSpeakerShuffle}
          onCycleRepeatMode={actions.cycleSpeakerRepeatMode}
          onStop={actions.stopSpeakerPlayback}
          onClearPlaylist={actions.clearSpeakerPlaylist}
          onSelectSoundMode={actions.selectSpeakerSoundMode}
          onPlayMedia={actions.playSpeakerMedia}
          onSelectOutputDevice={actions.selectSpeakerOutputDevice}
          onToggleMultiroomDevice={actions.toggleSpeakerGroupMember}
          onSecondaryPageChange={onSecondaryPageChange}
        />
      ) : null}

      {activeDevice?.type === 'sensor' ? (
        <SensorControls
          name={activeDevice.name}
          status={activeDevice.status}
          value={activeDevice.sensorValue}
          unit={activeDevice.sensorUnit}
          displayPrecision={activeDevice.sensorDisplayPrecision}
          entityId={activeDevice.sensorEntityId}
          deviceClass={activeDevice.sensorDeviceClass}
          history={activeDevice.sensorHistory}
          battery={activeDevice.sensorBattery}
          connection={activeDevice.sensorConnection}
          connectionState={activeDevice.sensorConnectionState}
        />
      ) : null}

      {activeDevice?.type === 'weather' ? (
        <WeatherControls
          weather={weather}
          unit={weatherConfig?.unit}
          forecastType={weatherConfig?.forecastType}
          forecastDays={weatherConfig?.forecastDays}
          forecastDensity={weatherConfig?.forecastDensity}
          conditionOverride={weatherConfig?.conditionOverride}
          showPrecipitation={weatherConfig?.showPrecipitation}
          showWind={weatherConfig?.showWind}
        />
      ) : null}

      {activeDevice?.type === 'alarm' ? (
        <AlarmControls
          alarm={{ ...alarm, name: activeDevice.name }}
          onAuthorizeDeviceAuth={onAuthorizeAlarmDeviceAuth}
          onDisarm={actions.disarmAlarm}
          onArmHome={actions.armAlarmHome}
          onArmAway={actions.armAlarmAway}
          onArmNight={actions.armAlarmNight}
          onArmVacation={actions.armAlarmVacation}
          onArmCustomBypass={actions.armAlarmCustomBypass}
          onTrigger={actions.triggerAlarm}
        />
      ) : null}

      {activeDevice?.type === 'vacuum' ? (
        <VacuumControls
          vacuum={{ ...vacuum, name: activeDevice.name }}
          areaOptions={vacuumAreas}
          onStart={actions.startVacuum}
          onPause={actions.pauseVacuum}
          onStop={actions.stopVacuum}
          onReturnToBase={actions.returnVacuumToBase}
          onLocate={actions.locateVacuum}
          onCleanSpot={actions.cleanVacuumSpot}
          onCleanArea={actions.cleanVacuumArea}
          onSetFanSpeed={actions.setVacuumFanSpeed}
          onSendCommand={actions.sendVacuumCommand}
          onRelatedEntityAction={actions.controlVacuumRelatedEntity}
          onSecondaryPageChange={onSecondaryPageChange}
        />
      ) : null}

      {activeDevice?.type === 'lock' ? (
        <LockControls
          lock={{ ...lock, name: activeDevice.name }}
          onLock={actions.lockDoor}
          onUnlock={actions.unlockDoor}
          onOpen={actions.openDoor}
        />
      ) : null}

      {activeDevice?.type === 'cover' ? (
        <CoverControls
          cover={{ ...cover, name: activeDevice.name }}
          onOpen={actions.openCover}
          onClose={actions.closeCover}
          onStop={actions.stopCover}
          onSetPosition={actions.setCoverPosition}
          onOpenTilt={actions.openCoverTilt}
          onCloseTilt={actions.closeCoverTilt}
          onStopTilt={actions.stopCoverTilt}
          onSetTiltPosition={actions.setCoverTiltPosition}
        />
      ) : null}

      {activeDevice?.type === 'members' ? (
        <div className={CONTEXT_PANEL_LAYOUT.shell}>
          <ContextPanelHeader
            title={activeDevice.name}
            subtitle={`${membersMapPoints.length} posizione${membersMapPoints.length === 1 ? '' : 'i'} disponibili`}
            icon={<Users size={21} />}
            fallbackTitle="Members"
            iconClassName="border-cyan-300/25 bg-cyan-500/12 text-cyan-100"
          />

          <div className="context-content-surface mb-1 rounded-[clamp(1.25rem,4.6vw,2rem)] p-[clamp(0.9rem,3vw,1.6rem)]">
            <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--ui-text-secondary)]">Mappa Presenze</p>
            <div className="dashboard-content-surface-soft relative mt-2 h-56 overflow-hidden rounded-xl">
              {membersMapPoints.length > 0 ? (
                <Map
                  ref={membersMapRef}
                  key={`${theme}:${membersMapRenderKey}`}
                  initialViewState={membersMapInitialViewState}
                  mapStyle={membersMapStyleUrl}
                  attributionControl={false}
                  dragRotate={false}
                  touchPitch={false}
                  pitchWithRotate={false}
                  maxPitch={0}
                  minZoom={2}
                  maxZoom={17}
                  style={{ width: '100%', height: '100%' }}
                >
                  {membersMapPoints.map((point) => (
                    <Marker key={point.id} longitude={point.longitude} latitude={point.latitude} anchor="center">
                      <span className="relative flex h-9 w-9 items-center justify-center">
                        {point.avatarUrl ? (
                          <img
                            src={point.avatarUrl}
                            alt={`Profilo ${point.name}`}
                            className="h-9 w-9 rounded-full border-2 border-[#fff]/95 bg-[#fff]/[0.08] object-cover shadow-[0_6px_16px_rgba(15,23,42,0.4)]"
                          />
                        ) : (
                          <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#fff]/80 bg-[#fff]/[0.08] text-[11px] font-semibold text-[#fff] shadow-[0_6px_16px_rgba(15,23,42,0.4)] backdrop-blur-xl">
                            {(point.name.trim().charAt(0) || '?').toUpperCase()}
                          </span>
                        )}
                        <span className="pointer-events-none absolute -inset-1 rounded-full border border-[#fff]/35" />
                        {point.isCurrent ? (
                          <>
                            <span className="pointer-events-none absolute -inset-1.5 rounded-full border border-emerald-300/80" />
                            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-[#fff] bg-emerald-400" />
                          </>
                        ) : null}
                      </span>
                    </Marker>
                  ))}
                </Map>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-[color:var(--ui-text-secondary)]">
                  <MapPin size={18} />
                  <p className="text-xs">{t('context.members.noCoordinates')}</p>
                </div>
              )}
              <button
                type="button"
                onClick={centerMapOnCurrentMember}
                disabled={!currentMemberMapPoint}
                className="glass-icon-button absolute right-2 top-2 z-20 h-8 w-8 disabled:cursor-not-allowed disabled:opacity-45"
                aria-label={t('context.members.center')}
                title={
                  currentMemberMapPoint
                    ? t('context.members.center')
                    : t('context.members.positionUnavailable')
                }
              >
                <LocateFixed size={15} />
              </button>
            </div>
          </div>

          {membersMapPoints.length > 0 ? (
            <div className="context-content-surface rounded-[clamp(1.25rem,4.6vw,2rem)] p-[clamp(0.8rem,2.4vw,1.15rem)]">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--ui-text-secondary)]">Membri</p>
              <div className="mt-3 max-h-44 space-y-2 overflow-y-auto pr-1 glass-scrollbar">
                {membersMapPoints.map((point) => (
                  <div key={point.id} className="context-content-surface-soft flex items-center justify-between gap-3 rounded-xl px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="relative shrink-0">
                        {point.avatarUrl ? (
                          <img
                            src={point.avatarUrl}
                            alt={`Profilo ${point.name}`}
                            className="h-9 w-9 rounded-full border border-[color:var(--ui-border-strong)] object-cover"
                          />
                        ) : (
                          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--ui-border-strong)] bg-[color:var(--ui-fill-tertiary)] text-[11px] font-semibold text-[color:var(--ui-text-primary)]">
                            {(point.name.trim().charAt(0) || '?').toUpperCase()}
                          </span>
                        )}
                        {(point.roleLabel?.trim().toLowerCase() === 'admin' ||
                          point.roleLabel?.trim().toLowerCase() === 'creatore') ? (
                          <span className="absolute -right-1 -top-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-amber-200/80 bg-amber-400 text-amber-950 shadow-[0_4px_8px_rgba(0,0,0,0.22)]">
                            <Crown size={9} />
                          </span>
                        ) : null}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[color:var(--ui-text-primary)]">{point.name}</p>
                        <p className="truncate text-[11px] text-[color:var(--ui-text-secondary)]">
                          {point.locationLabel?.trim() || 'Posizione sconosciuta'}
                        </p>
                      </div>
                    </div>
                    <div className="flex max-w-[10.5rem] shrink-0 flex-wrap justify-end gap-1.5">
                      {(point.devices?.smartwatch ?? 0) > 0 ? (
                        <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-primary)]">
                          <Watch size={16} />
                          <span className="absolute -right-1 -top-1 inline-flex min-h-[1rem] min-w-[1rem] items-center justify-center rounded-full border border-[color:var(--ui-border-strong)] bg-[color:var(--ui-bg-elevated)] px-1 text-[9px] font-semibold leading-none text-[color:var(--ui-text-primary)]">
                            {point.devices?.smartwatch}
                          </span>
                        </span>
                      ) : null}
                      {(point.devices?.tablet ?? 0) > 0 ? (
                        <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-primary)]">
                          <Tablet size={16} />
                          <span className="absolute -right-1 -top-1 inline-flex min-h-[1rem] min-w-[1rem] items-center justify-center rounded-full border border-[color:var(--ui-border-strong)] bg-[color:var(--ui-bg-elevated)] px-1 text-[9px] font-semibold leading-none text-[color:var(--ui-text-primary)]">
                            {point.devices?.tablet}
                          </span>
                        </span>
                      ) : null}
                      {(point.devices?.smartphone ?? 0) > 0 ? (
                        <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-primary)]">
                          <Smartphone size={16} />
                          <span className="absolute -right-1 -top-1 inline-flex min-h-[1rem] min-w-[1rem] items-center justify-center rounded-full border border-[color:var(--ui-border-strong)] bg-[color:var(--ui-bg-elevated)] px-1 text-[9px] font-semibold leading-none text-[color:var(--ui-text-primary)]">
                            {point.devices?.smartphone}
                          </span>
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {activeDevice ? (
        <div className="px-[clamp(0.75rem,2.8vw,1.5rem)] pb-1">
          <div className="context-content-surface mb-1 rounded-2xl p-[clamp(0.8rem,2.4vw,1.15rem)] shadow-lg">
            <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--ui-text-secondary)]">{t('context.members.related')}</p>
            <div className={`mt-3 ${CONTEXT_PANEL_LAYOUT.adaptiveGridTwo}`}>
              {microWidgets.map((microWidget) => {
                const state = resolveEntityStateById(haStates, microWidget.entity);
                const history =
                  microChartHistoryByEntity[microWidget.entity.trim()] ??
                  microChartHistoryByEntity[microWidget.entity.trim().toLowerCase()];
                if (microWidget.type === 'value_pill') {
                  return <ValuePill key={microWidget.id} widget={microWidget} state={state} />;
                }
                if (microWidget.type === 'status_glow') {
                  return <StatusGlow key={microWidget.id} widget={microWidget} state={state} />;
                }
                if (microWidget.type === 'mini_ring') {
                  return <MiniRing key={microWidget.id} widget={microWidget} state={state} />;
                }
                if (microWidget.type === 'micro_slider') {
                  return (
                    <MicroSlider
                      key={microWidget.id}
                      widget={microWidget}
                      state={state}
                      sendOnRelease={microWidget.sliderSendOnRelease ?? true}
                      onValueChange={(value) => onSetMicroSliderValue?.(microWidget.entity, value)}
                    />
                  );
                }
                if (microWidget.type === 'micro_step') {
                  return (
                    <MicroStep
                      key={microWidget.id}
                      widget={microWidget}
                      state={state}
                      onValueChange={(value) => onSetMicroSliderValue?.(microWidget.entity, value)}
                    />
                  );
                }
                if (microWidget.type === 'micro_superchart') {
                  return (
                    <MicroSuperChart
                      key={microWidget.id}
                      widget={microWidget}
                      state={state}
                      history={history}
                    />
                  );
                }
                if (microWidget.type === 'micro_button') {
                  const buttonMode = microWidget.buttonMode ?? 'switch';
                  return (
                    <MicroButton
                      key={microWidget.id}
                      widget={microWidget}
                      state={state}
                      onSwitchToggle={
                        buttonMode === 'switch'
                          ? (nextActive) => onToggleMicroWidget?.(microWidget.entity, nextActive)
                          : undefined
                      }
                      onPushTap={
                        buttonMode === 'push'
                          ? () => onToggleMicroWidget?.(microWidget.entity, true)
                          : undefined
                      }
                      onPushStart={
                        buttonMode === 'push'
                          ? () => onToggleMicroWidget?.(microWidget.entity, true)
                          : undefined
                      }
                      onPushEnd={
                        buttonMode === 'push'
                          ? () => onToggleMicroWidget?.(microWidget.entity, false)
                          : undefined
                      }
                      onPageNavigate={
                        buttonMode === 'page'
                          ? (path) => onNavigateMicroWidgetPage?.(path)
                          : undefined
                      }
                    />
                  );
                }
                return (
                  <MicroToggle
                    key={microWidget.id}
                    widget={microWidget}
                    state={state}
                    onToggle={(nextActive) => onToggleMicroWidget?.(microWidget.entity, nextActive)}
                  />
                );
              })}
              {microWidgets.length === 0 ? (
                <div className="context-content-surface-soft col-span-full rounded-2xl px-3 py-3 text-sm text-[color:var(--ui-text-tertiary)]">
                  {t('context.members.noRelated')}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
