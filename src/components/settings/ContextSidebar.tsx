import { RelatedContext, type RelatedContextValue } from '../devices/panels/related/relatedContext';
import type { Widget } from '../../types/dashboardModels';
import React, { useMemo } from 'react';
import { useCan } from '../../security/AccessControlProvider';
import { isPhysicalAccessCover } from '../../security/entityControlAccess';
import type { LockPanelData } from './lockPanelTypes';
import { Lightbulb } from 'lucide-react';
import { ActiveDevice } from './types';
import type {
  CameraDeviceInfo,
  CameraHistoryEntry,
  CameraHistoryStatus,
  CameraPtzDirection,
  CameraRelatedEntityActionRequest,
  CameraRelatedEntityInfo,
  MediaPlayRequest,
} from './deviceContextTypes';
import type { VacuumRelatedEntityActionRequest } from './VacuumRelatedControl';
import { UnavailablePanel } from './UnavailablePanel';
import type { VacuumDeviceInfo, VacuumMappedArea, VacuumRelatedEntityInfo } from '../widgets/vacuumDeviceModel';
import type { CalendarAgendaController } from '../../hooks/useCalendarAgenda';
import { CONTEXT_PANEL_LAYOUT } from './layoutClasses';
import { onceLoaded } from '../common/onceLoaded';
import { homePanelOf, type HomePanelProps } from './homePanelRoute';
import { useLiftGuard } from './useLiftGuard';
import { StatusGlow } from '../widgets/micro/StatusGlow';
import { ValuePill } from '../widgets/micro/ValuePill';
import { MiniRing } from '../widgets/micro/MiniRing';
import { MicroToggle } from '../widgets/micro/MicroToggle';
import { MicroButton } from '../widgets/micro/MicroButton';
import { MicroSuperChart } from '../widgets/micro/MicroSuperChart';
import { MicroStep } from '../widgets/micro/MicroStep';
import { MicroSlider } from '../widgets/micro/MicroSlider';
import type { DashboardStateShape } from '../../hooks/useDashboardState';
import type { MockEntityStateMap } from '../../types/ha';
import type { AlarmActionAuthOptions } from '../../utils/alarmSecurityPolicy';
import { useI18n } from '../../i18n/I18nProvider';
import { parseWasteTypeStyles, WASTE_TYPES_ATTRIBUTE } from '../../services/calendarClient';

type MediaRepeatMode = 'off' | 'all' | 'one';
type MediaOutputKind = 'speaker' | 'tv' | 'cast';

/** The cards that open a panel of a device: the others have nothing to say when one cannot be read. */
const HOME_DEVICE_TYPES = new Set<string>(['climate', 'light', 'switch', 'fan', 'humidifier', 'camera', 'media', 'sensor', 'lock', 'cover']);

// The shared panels load only when a card opens one.
export const preloadHomePanel = onceLoaded(() => import('./HomePanel'));
const HomePanel = React.lazy(preloadHomePanel);
export const preloadHomePanelParts = () => preloadHomePanel().then((module) => module.preloadWeatherPanel());

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
  onClose?: () => void;
  externalScrollContainer?: boolean;
  haStates?: MockEntityStateMap;
  microChartHistoryByEntity?: Record<string, number[]>;
  /** The cards of the Home, for what the open one holds besides its device. */
  homeWidgets?: readonly Widget[];
  onCallService?: (domain: string, service: string, data: Record<string, unknown>) => unknown;
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
  lock: LockPanelData;
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
  calendarAgenda: CalendarAgendaController;
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
    toggleFan: () => void;
    setFanPercentage: (percentage: number) => void;
    setFanPreset: (mode: string) => void;
    setFanOscillation: (oscillating: boolean) => void;
    setFanDirection: (direction: 'forward' | 'reverse') => void;
    toggleHumidifier: () => void;
    setHumidifierTargetHumidity: (humidity: number) => void;
    setHumidifierMode: (mode: string) => void;
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

const NO_ALTRO_PANELS: ReadonlySet<string> = new Set(['alarm', 'lock', 'weather', 'media']);

export function ContextSidebar({
  activeDevice,
  isEditMode = false,
  commandsEnabled = true,
  onClose,
  externalScrollContainer = false,
  haStates = {},
  microChartHistoryByEntity = {},
  homeWidgets,
  onCallService,
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
  calendarAgenda,
  weatherConfig,
  onToggleMicroWidget,
  onSetMicroSliderValue,
  onNavigateMicroWidgetPage,
  onAuthorizeAlarmDeviceAuth,
  actions: providedActions,
}: ContextSidebarProps) {
  const { t } = useI18n();
  // A gate, a garage or a motorized door is physical access: without access.control its panel only shows it.
  const canControlAccess = useCan('access.control');
  const coverIsReadOnly = !canControlAccess && isPhysicalAccessCover(cover.rawAttributes?.device_class);
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
  const microWidgets = activeDevice?.microWidgets ?? [];
  useLiftGuard(activeDevice?.id);
  const homePanelProps: HomePanelProps | null = activeDevice
    ? {
        activeDevice,
        lamp,
        climate,
        cover,
        camera,
        speaker,
        lock,
        coverIsReadOnly,
        haStates,
        actions,
        alarm,
        alarmCommands: {
          disarm: actions.disarmAlarm,
          home: actions.armAlarmHome,
          away: actions.armAlarmAway,
          night: actions.armAlarmNight,
          vacation: actions.armAlarmVacation,
          custom_bypass: actions.armAlarmCustomBypass,
          trigger: actions.triggerAlarm,
        },
        onAuthorizeAlarmDeviceAuth,
        vacuum,
        vacuumCommands: {
          start: actions.startVacuum,
          pause: actions.pauseVacuum,
          stop: actions.stopVacuum,
          returnToBase: actions.returnVacuumToBase,
          locate: actions.locateVacuum,
          cleanSpot: actions.cleanVacuumSpot,
          cleanArea: actions.cleanVacuumArea,
          setFanSpeed: actions.setVacuumFanSpeed,
          related: actions.controlVacuumRelatedEntity,
        },
        vacuumAreas,
        calendarAgenda,
        weather,
        weatherConfig,
        calendarWasteTypes: activeDevice.type === 'calendar'
          ? parseWasteTypeStyles(resolveEntityStateById(haStates, activeDevice.calendarEntityId ?? '')?.rawAttributes?.[WASTE_TYPES_ATTRIBUTE])
          : undefined,
        onConfigureWaste: onNavigateMicroWidgetPage ? () => onNavigateMicroWidgetPage('/settings/home/waste-collection') : undefined,
        panelCommandsEnabled: commandsEnabled && !isEditMode,
        embedded: externalScrollContainer,
        onClose: onClose ?? (() => undefined),
      }
    : null;
  // The cards with a shared panel open it in place of their old content.
  const homePanel = homePanelProps ? homePanelOf(homePanelProps) : null;
  const openCard = homeWidgets?.find((widget) => widget.id === activeDevice?.id);
  // These panels have no Altro: what a card holds besides its device stays in the block under them.
  const hasNoAltro = !homePanel || NO_ALTRO_PANELS.has(activeDevice?.type ?? '');
  const relatedContext = React.useMemo<RelatedContextValue | null>(
    () =>
      openCard && !hasNoAltro
        ? {
            // As holdsPanelChoices of the Rooms: written here, so that the two pages share no piece for one line.
            sourceOf: () => (openCard.relatedControls?.length || openCard.widgets?.length || openCard.panelControls ? openCard : undefined),
            states: haStates,
            history: microChartHistoryByEntity,
            demo: openCard.dataSource === 'mock',
            commands: { call: onCallService, toggle: onToggleMicroWidget, setValue: onSetMicroSliderValue, navigate: onNavigateMicroWidgetPage },
          }
        : null,
    [openCard, hasNoAltro, haStates, microChartHistoryByEntity, onCallService, onToggleMicroWidget, onSetMicroSliderValue, onNavigateMicroWidgetPage],
  );
  return (
    <aside
      className={`context-sidebar w-full shrink-0 relative ${
        externalScrollContainer ? 'h-auto' : 'h-full min-h-0'
      } ${
        activeDevice ? activeDeviceLayoutClass : 'overflow-hidden'
      }`}
    >
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

      {homePanel && homePanelProps ? (
        <div className={`${CONTEXT_PANEL_LAYOUT.shell} dv-panel-frame`}>
          <React.Suspense fallback={<div className="min-h-[60vh] md:min-h-0" aria-hidden="true" />}>
            <RelatedContext.Provider value={relatedContext}>
              <HomePanel {...homePanelProps} />
            </RelatedContext.Provider>
          </React.Suspense>
        </div>
      ) : null}

      {activeDevice && !homePanel && HOME_DEVICE_TYPES.has(activeDevice.type) ? (
        <div className={`${CONTEXT_PANEL_LAYOUT.shell} dv-panel-frame`}>
          <UnavailablePanel name={activeDevice.name} inSheet={externalScrollContainer} onClose={onClose ?? (() => undefined)} />
        </div>
      ) : null}

      {activeDevice && microWidgets.length > 0 && (hasNoAltro || !openCard) ? (
        <div className="px-[clamp(0.75rem,2.8vw,1.5rem)] pb-1">
          <div className={homePanel ? 'dv-card mb-1' : 'context-content-surface mb-1 rounded-2xl p-[clamp(0.8rem,2.4vw,1.15rem)] shadow-lg'}>
            <p className={homePanel ? 'dv-pn-label !m-0' : 'text-[11px] uppercase tracking-[0.16em] text-[color:var(--ui-text-secondary)]'}>{t('context.members.related')}</p>
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
