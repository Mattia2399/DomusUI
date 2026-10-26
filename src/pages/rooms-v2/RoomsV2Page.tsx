import React from 'react';
import { ChevronDown, ChevronRight, House, Plus } from 'lucide-react';
import {
  assignRoomAreaTargets,
  DEMO_ROOM_TABS,
  filterRoomTabsByFloor,
  getEntityFriendlyName,
  isAreaSensorEntityCandidate,
  mergeRoomTabs,
  resolveRoomClimateReadings,
  toCustomRoomTabs,
  toHaRoomTabs,
  type RoomAreaTarget,
  type RoomsApiCall,
  type RoomTab,
} from '../../components/rooms/roomsDirectory';
import type { CameraPtzDirection } from '../../components/camera/CameraPtzJoystick';
import type { GlassDropdownOption } from '../../components/ui/GlassDropdown';
import { useProtectedEntities, useRoomPinnedEntities, useRoomsStoredState } from '../../components/rooms/useRoomsStoredState';
import { LightCard } from '../../components/devices/cards/LightCard';
import { DeviceCard } from '../../components/devices/cards/DeviceCard';
import { DevicePanel } from '../../components/devices/panels/DevicePanel';
import { ClimateCard } from '../../components/devices/cards/ClimateCard';
import { ClimatePanel } from '../../components/devices/panels/ClimatePanel';
import { climateIsOn, type ClimateModel } from '../../components/devices/model/climate';
import { SensorCard } from '../../components/devices/cards/SensorCard';
import { SceneCard } from '../../components/devices/cards/SceneCard';
import {
  activeSceneOf,
  runSceneCalls,
  toSceneModel,
  undoSceneCall,
  type SceneModel,
} from '../../components/devices/model/scene';
import { SensorPanel, SENSOR_PERIOD_HOURS, type SensorPeriod } from '../../components/devices/panels/SensorPanel';
import { SecurityCard } from '../../components/devices/cards/SecurityCard';
import { SecurityPanel } from '../../components/devices/panels/SecurityPanel';
import { securityStatus } from '../../components/devices/cards/securityText';
import {
  applyLockCommand,
  lockServiceCall,
  motionNow,
  securityAlerts,
  securityKindOf,
  securityWarns,
  toSecurityModel,
  type LockCommand,
  type LockState,
  type SecurityModel,
} from '../../components/devices/model/security';
import { MediaKindIcon, MediaOffCard, NowPlayingCard } from '../../components/devices/cards/MediaCard';
import { MediaPlayer, type MediaGroupCandidate } from '../../components/devices/panels/MediaPlayer';
import { pickRoomPlayer, type MediaAction, type MediaModel } from '../../components/devices/model/media';
import { useAmbientAssetUrl } from '../../theme/ambient/AmbientProvider';
import { CameraViewer, type CameraViewerItem } from '../../components/camera/CameraViewer';
import { buildCameraCardModel } from '../../components/widgets/cameraCardModel';
import type { Widget } from '../../types/dashboardModels';
import {
  findBatterySensor,
  sensorKindOf,
  sensorNeedsAttention,
  toSensorModel,
  type SensorModel,
} from '../../components/devices/model/sensor';
import { deviceKindOf, findPowerSensor, isStandby, type DeviceAction, type DeviceModel } from '../../components/devices/model/device';
import type { LightModel } from '../../components/devices/model/light';
import type { SectionItem } from '../../components/devices/model/sectionRules';
import GlassModal from '../../components/ui/GlassModal';
import { LightPanel } from '../../components/devices/panels/LightPanel';
import { PanelHost } from '../../components/devices/panels/PanelHost';
import { lightRgb } from '../../components/devices/model/tileColor';
import { pinRanks, togglePinned } from '../../components/devices/model/sectionRules';
import type { HaArea } from '../../hooks/useHaLiveConnection';
import type { MockEntityStateMap } from '../../types/ha';
import type { DashboardRuntimeMode } from '../../security/dashboardAccess';
import { useDevicesTranslations } from '../../i18n/devicesTranslations';
import { useRoomsTranslations } from '../../i18n/roomsTranslations';
import { useI18n } from '../../i18n/I18nProvider';
import { useAmbient } from '../../theme/ambient/AmbientProvider';
import { resolveRoomAmbient } from '../../theme/ambient/ambientModel';
import { useRoomPictureColor } from '../../theme/ambient/roomPictureColor';
import {
  DEMO_MEDIA_TRACKS,
  DEMO_PROTECTED_ENTITIES,
  DEMO_ROOM_READINGS,
  DEMO_ROOMS,
  DEMO_STATES,
  demoSecurityHistory,
  demoSensorSeries,
} from './demoRoomsFixtures';
import { MediaPickPanel, MediaStartPanel } from './MediaSheets';
import { RoomEditPanel } from './RoomManageSheets';
import { useRoomManagement } from './useRoomManagement';
import { useMediaPlayerCommands } from './useMediaPlayerCommands';
import { useSensorHistory } from './useSensorHistory';
import { useStateHistory } from './useStateHistory';
import { AddAccessoriesSheet, type AccessoryCandidate } from './AddAccessoriesSheet';
import { RoomHead, type FloorOption, type StatusChip } from './RoomHead';
import {
  bucketRoomEntities,
  climateGlance,
  formatDegrees,
  missingSections,
  roomIconKind,
  type ClimateGlance,
  type MissingSection,
} from './roomSummary';
import { RoomSection } from './RoomSection';
import { SectionPage, type SectionCandidate } from './SectionPage';
import { useDeviceCommands } from './useDeviceCommands';
import { useClimateCommands } from './useClimateCommands';
import { useLightCommands } from './useLightCommands';
import { useRoomsRegistry } from './useRoomsRegistry';
import './roomsV2.css';

/*
 * The Rooms page, on the Rooms board of the design: the head of the room,
 * its sections in two columns where there is room, and what the room still
 * lacks. Rooms are changed from here; floors in Settings.
 */

export type RoomsV2PageProps = {
  runtimeMode?: DashboardRuntimeMode;
  isLoading?: boolean;
  haConnected: boolean;
  canManageRooms?: boolean;
  haAreas: HaArea[];
  haStates: MockEntityStateMap;
  onCallService?: (domain: string, service: string, serviceData: Record<string, unknown>) => Promise<boolean>;
  onCallApi?: RoomsApiCall;
  /** Cameras that pan and tilt, and how to move them. */
  cameraPtzEntityIds?: string[];
  onCameraPtzMove?: (entityId: string, direction: CameraPtzDirection) => void;
  onCameraPtzStop?: (entityId: string) => void;
  /** Opens another page of the app, as Settings for the floors. */
  onNavigate?: (path: string) => void;
};

const PHONE_QUERY = '(max-width: 760px)';

function usePhoneLayout() {
  const [phone, setPhone] = React.useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(PHONE_QUERY).matches : false,
  );
  React.useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia(PHONE_QUERY);
    const update = () => setPhone(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return phone;
}

type RoomLightItem = SectionItem & { model: LightModel };
type RoomDeviceItem = SectionItem & { model: DeviceModel };
type SectionKey = 'lights' | 'devices' | 'sensors' | 'scenes' | 'security';
type PanelKind = SectionKey | 'climate';
type RoomSensorItem = SectionItem & { model: SensorModel };
type RoomSceneItem = SectionItem & { model: SceneModel };
type RoomSecurityItem = SectionItem & { model: SecurityModel };

// How long a scene reads as applying, and how long its undo stays offered.
const SCENE_APPLYING_MS = 900;
const SCENE_UNDO_MS = 6000;
// How long a lock of the demo takes to turn and its door stays open, as on the board, and how long a real one may take before its command is given up.
const DEMO_LOCK_MS = 1400;
const DEMO_OPEN_MS = 1200;
const DEMO_DOOR_OPEN_MS = 2600;
const LOCK_WAIT_MS = 30_000;

const byRoomThenName = (a: SectionCandidate, b: SectionCandidate) =>
  (a.roomName === null) === (b.roomName === null) ? a.name.localeCompare(b.name) : a.roomName === null ? -1 : 1;

// The tint of a device panel when the device is on: the colour of its kind, "r g b".
const DEVICE_TINT: Record<DeviceModel['kind'], string> = {
  outlet: '48 209 88',
  switch: '48 209 88',
  virtual: '48 209 88',
  fan: '100 210 255',
  cover: '255 159 10',
  humidifier: '90 200 250',
};

const NO_IDS: string[] = [];
const DEMO_ROOM_IDS = new Set(DEMO_ROOM_TABS.map((tab) => tab.id));

/** The sensors a room can read its temperature or humidity from, by name. */
function sensorOptionsOf(states: MockEntityStateMap, kind: 'temperature' | 'humidity'): GlassDropdownOption[] {
  return Object.keys(states)
    .filter((entityId) => isAreaSensorEntityCandidate(entityId, states[entityId], kind))
    .map((entityId) => ({ id: entityId, name: getEntityFriendlyName(entityId, states[entityId]) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// The tint of a climate panel by mode, "r g b", as the cards' mode colours.
const CLIMATE_TINT: Record<ClimateModel['mode'], string> = {
  off: '142 142 147',
  heat: '255 122 26',
  cool: '10 132 255',
  heat_cool: '48 209 88',
  auto: '48 209 88',
  dry: '50 173 230',
  fan_only: '148 163 184',
};

const CLIMATE_TONE: Record<ClimateGlance['mode'], string> = {
  off: 'idle',
  heat: 'heat',
  cool: 'cool',
  heat_cool: 'auto',
  dry: 'dry',
  fan_only: 'fan',
};

// Accessories that can be brought into a room from the head of the page, by the section they go to.
const ADDABLE_DOMAINS: Record<string, 'chipLights' | 'sectionDevices' | 'sectionClimate' | 'sectionMedia' | 'sectionSecurity' | 'sectionScenes'> = {
  light: 'chipLights',
  switch: 'sectionDevices',
  input_boolean: 'sectionDevices',
  fan: 'sectionDevices',
  cover: 'sectionDevices',
  humidifier: 'sectionDevices',
  climate: 'sectionClimate',
  media_player: 'sectionMedia',
  lock: 'sectionSecurity',
  camera: 'sectionSecurity',
  scene: 'sectionScenes',
};

const MISSING_KEY: Record<MissingSection, 'missingClimate' | 'missingDevices' | 'missingSecurity' | 'missingMedia'> = {
  climate: 'missingClimate',
  devices: 'missingDevices',
  security: 'missingSecurity',
  media: 'missingMedia',
};

/** Where a section will be, until it is built. */
function SectionComing({ id, title }: { id: string; title: string }) {
  const dt = useDevicesTranslations();
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex min-w-0 flex-col gap-3" data-testid={`${id}-coming`}>
      <h2 id={`${id}-title`} className="rv2-section-heading flex min-h-11 items-center px-1">
        {title}
      </h2>
      <p className="dv-glass dv-t2 m-0 rounded-[20px] px-4 py-3.5 text-sm font-medium">{dt('sectionComing')}</p>
    </section>
  );
}

/** What the room still lacks; it opens the add sheet when accessories can be brought in. */
function AddAccessoriesRow({ label, detail, onOpen }: { label: string; detail: string; onOpen?: () => void }) {
  const content = (
    <>
      <span className="dv-icon-button pointer-events-none !h-10 !w-10" aria-hidden="true">
        <Plus size={20} strokeWidth={2.2} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-semibold">{label}</span>
        <span className="dv-t2 text-[13px] font-medium">{detail}</span>
      </span>
      {onOpen ? <ChevronRight size={16} strokeWidth={2.4} aria-hidden="true" className="dv-t3" /> : null}
    </>
  );
  return onOpen ? (
    <button type="button" className="dv-glass rv2-add-row" onClick={onOpen} data-testid="rooms-v2-add-row">
      {content}
    </button>
  ) : (
    <div className="dv-glass rv2-add-row" data-testid="rooms-v2-add-row">
      {content}
    </div>
  );
}

function withoutIds(byRoom: Record<string, string[]>, roomId: string, ids: string[]) {
  const leaving = new Set(ids);
  const remaining = (byRoom[roomId] ?? []).filter((id) => !leaving.has(id));
  const next = { ...byRoom };
  if (remaining.length > 0) next[roomId] = remaining;
  else delete next[roomId];
  return next;
}

export function RoomsV2Page({
  runtimeMode = 'real',
  isLoading = false,
  haConnected,
  canManageRooms = false,
  haAreas,
  haStates,
  onCallService,
  onCallApi,
  cameraPtzEntityIds = NO_IDS,
  onCameraPtzMove,
  onCameraPtzStop,
  onNavigate,
}: RoomsV2PageProps) {
  const rt = useRoomsTranslations();
  const dt = useDevicesTranslations();
  const demo = runtimeMode === 'demo';
  const phone = usePhoneLayout();
  // The demo keeps its own copy of what is saved, so organising it is always allowed.
  const canOrganize = canManageRooms || demo;
  const { customRooms, setCustomRooms, hiddenRoomEntitiesByRoom, setHiddenRoomEntitiesByRoom, roomsStateRuntime, activeRoomId, setActiveRoomId } =
    useRoomsStoredState(runtimeMode, canOrganize);
  const { pinnedByRoom, setPinnedByRoom } = useRoomPinnedEntities(runtimeMode, canOrganize);
  const registry = useRoomsRegistry(haConnected, onCallApi);
  // The demo's plugs ask before turning off until the demo is changed.
  const { protectedIds, setProtectedIds } = useProtectedEntities(runtimeMode, canOrganize, demo ? DEMO_PROTECTED_ENTITIES : NO_IDS);
  const [demoRoomByEntity, setDemoRoomByEntity] = React.useState<Record<string, string>>(DEMO_ROOMS);
  const [selectedFloorId, setSelectedFloorId] = React.useState('all');
  const [sectionOpen, setSectionOpen] = React.useState<SectionKey | null>(null);
  const [panel, setPanel] = React.useState<{ kind: PanelKind; id: string } | null>(null);
  const [confirmOffId, setConfirmOffId] = React.useState<string | null>(null);
  const [cameraOpenId, setCameraOpenId] = React.useState<string | null>(null);
  // Media: the player chosen in each room, and which of its sheets is open.
  const [chosenPlayerByRoom, setChosenPlayerByRoom] = React.useState<Record<string, string>>({});
  const [mediaSheet, setMediaSheet] = React.useState<'player' | 'pick' | 'start' | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const { locale } = useI18n();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Rooms, changed from the page; the areas show those changes at once. Floors live in Settings.
  const [roomSheet, setRoomSheet] = React.useState<{ room: RoomTab | null } | null>(null);
  const management = useRoomManagement({
    demo,
    haConnected,
    canManageRooms,
    onCallApi,
    haAreas,
    setCustomRooms,
    onRoomCreated: (roomId) => {
      setSelectedFloorId('all');
      setActiveRoomId(roomId);
    },
  });
  const areas = management.areas;
  const allRoomTabs = React.useMemo(
    () =>
      mergeRoomTabs(
        toHaRoomTabs(areas),
        toCustomRoomTabs(roomsStateRuntime === runtimeMode ? customRooms : []),
        runtimeMode,
      ),
    [areas, customRooms, roomsStateRuntime, runtimeMode],
  );
  const roomTabs = React.useMemo(
    () => filterRoomTabsByFloor(allRoomTabs, areas, selectedFloorId),
    [allRoomTabs, areas, selectedFloorId],
  );
  const activeRoom = roomTabs.find((tab) => tab.id === activeRoomId) ?? roomTabs[0] ?? null;
  const roomNameById = React.useMemo(() => new Map(allRoomTabs.map((tab) => [tab.id, tab.name])), [allRoomTabs]);

  React.useEffect(() => {
    if (roomTabs.length === 0) {
      if (activeRoomId) setActiveRoomId('');
      return;
    }
    if (!activeRoomId || !roomTabs.some((tab) => tab.id === activeRoomId)) setActiveRoomId(roomTabs[0].id);
  }, [activeRoomId, roomTabs, setActiveRoomId]);

  React.useEffect(() => {
    setSectionOpen(null);
    setPanel(null);
    setConfirmOffId(null);
    setCameraOpenId(null);
    setMediaSheet(null);
    setAddOpen(false);
    setError(null);
  }, [activeRoom?.id]);

  const states = demo ? DEMO_STATES : haStates;
  const lights = useLightCommands({ demo, states, onCallService });
  const roomOf = React.useCallback(
    (entityId: string): string | null => (demo ? demoRoomByEntity[entityId] : registry.entityAreaByEntityId[entityId]) ?? null,
    [demo, demoRoomByEntity, registry.entityAreaByEntityId],
  );
  const lightIds = React.useMemo(() => Object.keys(states).filter((entityId) => entityId.startsWith('light.')), [states]);
  const deviceIds = React.useMemo(
    () => Object.keys(states).filter((entityId) => deviceKindOf(entityId, states[entityId]) !== null),
    [states],
  );
  const powerSensorById = React.useMemo(() => {
    const deviceIdOf = (entityId: string) => registry.registryEntityById.get(entityId)?.deviceId ?? null;
    const map = new Map<string, string | null>();
    deviceIds
      .filter((entityId) => entityId.startsWith('switch.'))
      .forEach((entityId) => map.set(entityId, findPowerSensor(entityId, states, deviceIdOf)));
    return map;
  }, [deviceIds, registry.registryEntityById, states]);
  const powerSensorOf = React.useCallback((entityId: string) => powerSensorById.get(entityId) ?? null, [powerSensorById]);
  const devices = useDeviceCommands({ demo, states, onCallService, powerSensorOf });
  const climates = useClimateCommands({ demo, states, onCallService });
  const climateIds = React.useMemo(() => Object.keys(states).filter((entityId) => entityId.startsWith('climate.')), [states]);
  const sensorIds = React.useMemo(
    () => Object.keys(states).filter((entityId) => sensorKindOf(entityId, states[entityId]) !== null),
    [states],
  );
  const sensorModels = React.useMemo(() => {
    const deviceIdOf = (entityId: string) => registry.registryEntityById.get(entityId)?.deviceId ?? null;
    return new Map(
      sensorIds.map((entityId) => {
        const batteryId = findBatterySensor(entityId, states, deviceIdOf);
        const level = batteryId ? Number(states[batteryId]?.state) : Number.NaN;
        return [entityId, toSensorModel(entityId, states[entityId], { battery: Number.isFinite(level) ? level : null }) as SensorModel];
      }),
    );
  }, [registry.registryEntityById, sensorIds, states]);
  const sensorModelOf = React.useCallback((entityId: string) => sensorModels.get(entityId) as SensorModel, [sensorModels]);

  // Security: a lock shows what it was asked until Home Assistant says it moved.
  const securityIds = React.useMemo(
    () => Object.keys(states).filter((entityId) => securityKindOf(entityId, states[entityId]) !== null),
    [states],
  );
  const [lockPending, setLockPending] = React.useState<Record<string, { lock: LockState; from: string; at: number | null }>>({});
  const demoLockTimers = React.useRef(new Map<string, number[]>());
  React.useEffect(() => {
    const timers = demoLockTimers.current;
    return () => timers.forEach((list) => list.forEach((timer) => window.clearTimeout(timer)));
  }, []);
  const securityModels = React.useMemo(() => {
    const deviceIdOf = (entityId: string) => registry.registryEntityById.get(entityId)?.deviceId ?? null;
    return new Map(
      securityIds.map((entityId) => {
        const batteryId = findBatterySensor(entityId, states, deviceIdOf);
        const level = batteryId ? Number(states[batteryId]?.state) : Number.NaN;
        const model = toSecurityModel(entityId, states[entityId], { battery: Number.isFinite(level) ? level : null }) as SecurityModel;
        const pending = lockPending[entityId];
        const stillPending = pending && `${states[entityId]?.state ?? ''}` === pending.from;
        return [
          entityId,
          stillPending ? { ...model, lock: pending.lock, active: pending.lock !== 'locked' && pending.lock !== 'locking', changedAt: pending.at } : model,
        ];
      }),
    );
  }, [lockPending, registry.registryEntityById, securityIds, states]);
  const securityModelOf = React.useCallback((entityId: string) => securityModels.get(entityId) as SecurityModel, [securityModels]);

  const commandLock = async (model: SecurityModel, command: LockCommand) => {
    const entityId = model.entityId;
    const from = `${states[entityId]?.state ?? ''}`;
    const moving = applyLockCommand(model, command).lock as LockState;
    const forget = (lock: LockState) =>
      setLockPending((current) => {
        if (current[entityId]?.lock !== lock || current[entityId]?.from !== from) return current;
        const next = { ...current };
        delete next[entityId];
        return next;
      });
    setLockPending((current) => ({ ...current, [entityId]: { lock: moving, from, at: model.changedAt } }));
    if (demo) {
      // A new command of the same lock replaces what the last one was still to do.
      demoLockTimers.current.get(entityId)?.forEach((timer) => window.clearTimeout(timer));
      const timers: number[] = [];
      demoLockTimers.current.set(entityId, timers);
      const settle = (lock: LockState) => setLockPending((current) => ({ ...current, [entityId]: { lock, from, at: Date.now() } }));
      if (command === 'open') {
        timers.push(
          window.setTimeout(() => {
            settle('open');
            timers.push(window.setTimeout(() => settle('unlocked'), DEMO_DOOR_OPEN_MS));
          }, DEMO_OPEN_MS),
        );
      } else {
        timers.push(window.setTimeout(() => settle(command === 'lock' ? 'locked' : 'unlocked'), DEMO_LOCK_MS));
      }
      return;
    }
    const call = lockServiceCall(model, command);
    const done = onCallService ? await onCallService(call.domain, call.service, call.data).catch(() => false) : false;
    if (!done) forget(moving);
    else window.setTimeout(() => forget(moving), LOCK_WAIT_MS);
  };

  const protectedSet = React.useMemo(() => new Set(protectedIds), [protectedIds]);

  function sectionItems<M>(ids: string[], modelOf: (entityId: string) => M, attention: (model: M) => boolean, active: (model: M) => boolean, name: (model: M) => string) {
    if (!activeRoom) return [];
    const ranks = pinRanks(pinnedByRoom[activeRoom.id] ?? []);
    const hidden = new Set(hiddenRoomEntitiesByRoom[activeRoom.id] ?? []);
    return ids
      .filter((entityId) => roomOf(entityId) === activeRoom.id)
      .map((entityId) => {
        const model = modelOf(entityId);
        return {
          id: entityId,
          name: name(model),
          pinRank: ranks.get(entityId) ?? null,
          needsAttention: attention(model),
          active: active(model),
          hidden: hidden.has(entityId),
          model,
        };
      });
  }

  const roomItems: RoomLightItem[] = sectionItems(
    lightIds,
    lights.modelOf,
    (model) => !model.available,
    (model) => model.available && model.on,
    (model) => model.name,
  );
  const deviceItems: RoomDeviceItem[] = sectionItems(
    deviceIds,
    devices.modelOf,
    (model) => !model.available || isStandby(model),
    (model) => model.available && model.on,
    (model) => model.name,
  );
  const sensorItems: RoomSensorItem[] = sectionItems(
    sensorIds,
    sensorModelOf,
    sensorNeedsAttention,
    () => false,
    (model) => model.name,
  );
  // The cards draw the last 24 hours; a detail draws the period chosen in it.
  const [sensorPeriod, setSensorPeriod] = React.useState<SensorPeriod>('24h');
  const sensorDemoSeries = demo ? demoSensorSeries : undefined;
  const roomSensorHistory = useSensorHistory({
    entityIds: sensorItems.filter((item) => item.model.kind !== 'smoke').map((item) => item.id),
    hours: 24,
    onCallApi,
    demoSeries: sensorDemoSeries,
  });

  const candidatesFrom = (ids: string[], nameOf: (entityId: string) => string): SectionCandidate[] =>
    activeRoom
      ? ids
          .filter((entityId) => roomOf(entityId) !== activeRoom.id)
          .map((entityId) => {
            const room = roomOf(entityId);
            return { id: entityId, name: nameOf(entityId), roomName: room ? roomNameById.get(room) ?? null : null };
          })
          .sort(byRoomThenName)
      : [];
  const candidates = candidatesFrom(lightIds, (entityId) => lights.modelOf(entityId).name);
  const deviceCandidates = candidatesFrom(deviceIds, (entityId) => devices.modelOf(entityId).name);
  const climateCandidates = candidatesFrom(climateIds, (entityId) => climates.modelOf(entityId).name);
  const sensorCandidates = candidatesFrom(sensorIds, (entityId) => sensorModelOf(entityId).name);

  // Scenes: the snapshots that undo them are scenes too, kept out of sight.
  const sceneIds = React.useMemo(
    () => Object.keys(states).filter((entityId) => entityId.startsWith('scene.') && !entityId.startsWith('scene.domus_undo_')),
    [states],
  );
  const [sceneRanAt, setSceneRanAt] = React.useState<Record<string, number | null>>({});
  const [applyingSceneId, setApplyingSceneId] = React.useState<string | null>(null);
  const [sceneUndo, setSceneUndo] = React.useState<{ roomId: string; name: string; sceneId: string; previous: number | null } | null>(null);
  const sceneModelOf = React.useCallback(
    (entityId: string) => {
      const model = toSceneModel(entityId, states[entityId]);
      return entityId in sceneRanAt ? { ...model, ranAt: sceneRanAt[entityId] } : model;
    },
    [sceneRanAt, states],
  );
  const sceneItems: RoomSceneItem[] = sectionItems(sceneIds, sceneModelOf, () => false, () => false, (model) => model.name);
  const activeSceneId = activeSceneOf(sceneItems.map((item) => item.model));
  const sceneCandidates = candidatesFrom(sceneIds, (entityId) => sceneModelOf(entityId).name);

  // Locks and cameras, which are used, come before the sensors that only watch.
  const securityItems: RoomSecurityItem[] = sectionItems(
    securityIds,
    securityModelOf,
    securityWarns,
    (model) => motionNow(model) || model.kind === 'lock' || model.kind === 'camera',
    (model) => model.name,
  );
  const securityCandidates = candidatesFrom(securityIds, (entityId) => securityModelOf(entityId).name);
  const roomAlerts = securityItems.filter((item) => !item.hidden && securityAlerts(item.model));
  // The rooms with something open, wet or stuck show a dot on their pill.
  const alertRoomIds = React.useMemo(() => {
    const ids = new Set<string>();
    securityIds.forEach((entityId) => {
      const room = roomOf(entityId);
      if (room && !(hiddenRoomEntitiesByRoom[room] ?? []).includes(entityId) && securityAlerts(securityModelOf(entityId))) ids.add(room);
    });
    return ids;
  }, [hiddenRoomEntitiesByRoom, roomOf, securityIds, securityModelOf]);
  // The cameras of the room, as the camera viewer of the Rooms page shows them.
  const roomCameras: CameraViewerItem[] = securityItems
    .filter((item) => item.model.kind === 'camera')
    .map((item) => {
      if (demo) return { entityId: item.id, name: item.model.name, statusLabel: dt('cameraLive') };
      const entity = states[item.id];
      const camera = buildCameraCardModel({ entityId: item.id, title: item.model.name, status: entity?.state } as Widget, entity);
      return {
        entityId: item.id,
        name: camera.title,
        statusLabel: camera.statusLabel,
        subtitle: camera.subtitle,
        streamUrl: camera.streamUrl,
        snapshotUrl: camera.imageUrl,
        isOffline: !camera.isAvailable,
        supportsPtz: cameraPtzEntityIds.includes(item.id),
      };
    });

  React.useEffect(() => {
    if (!applyingSceneId) return undefined;
    const timer = window.setTimeout(() => setApplyingSceneId(null), SCENE_APPLYING_MS);
    return () => window.clearTimeout(timer);
  }, [applyingSceneId]);
  React.useEffect(() => {
    if (!sceneUndo) return undefined;
    const timer = window.setTimeout(() => setSceneUndo(null), SCENE_UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [sceneUndo]);

  /** Runs a scene, after a snapshot of what it changes so it can be undone for a few seconds. */
  const runScene = async (model: SceneModel) => {
    if (!activeRoom) return;
    setApplyingSceneId(model.entityId);
    setSceneRanAt((current) => ({ ...current, [model.entityId]: Date.now() }));
    setSceneUndo({ roomId: activeRoom.id, name: model.name, sceneId: model.entityId, previous: model.ranAt });
    if (demo || !onCallService) return;
    for (const call of runSceneCalls(model, activeRoom.id)) {
      await onCallService(call.domain, call.service, call.data);
    }
  };
  const undoScene = () => {
    if (!sceneUndo) return;
    const { roomId, sceneId, previous } = sceneUndo;
    setSceneUndo(null);
    setSceneRanAt((current) => ({ ...current, [sceneId]: previous }));
    if (demo || !onCallService) return;
    const call = undoSceneCall(roomId);
    void onCallService(call.domain, call.service, call.data);
  };

  // The main unit of the room is the one that does the most (an air conditioner before a radiator valve).
  const roomClimates: ClimateModel[] = React.useMemo(() => {
    if (!activeRoom) return [];
    const hidden = new Set(hiddenRoomEntitiesByRoom[activeRoom.id] ?? []);
    return climateIds
      .filter((entityId) => roomOf(entityId) === activeRoom.id && !hidden.has(entityId))
      .map((entityId) => climates.modelOf(entityId))
      .sort((a, b) => b.modes.length - a.modes.length || a.name.localeCompare(b.name));
  }, [activeRoom, climateIds, climates, hiddenRoomEntitiesByRoom, roomOf]);

  // Media: the room shows one player, the one chosen unless another starts playing on its own.
  const media = useMediaPlayerCommands({ demo, states, onCallService });
  const resolveAssetUrl = useAmbientAssetUrl();
  const mediaIds = React.useMemo(() => Object.keys(states).filter((entityId) => entityId.startsWith('media_player.')), [states]);
  const roomPlayers: MediaModel[] = activeRoom
    ? mediaIds
        .filter((entityId) => roomOf(entityId) === activeRoom.id && !(hiddenRoomEntitiesByRoom[activeRoom.id] ?? []).includes(entityId))
        .map((entityId) => media.modelOf(entityId))
    : [];
  const chosenPlayer = roomPlayers.find((model) => model.entityId === (activeRoom ? chosenPlayerByRoom[activeRoom.id] : null)) ?? null;
  const shownPlayer =
    chosenPlayer && (chosenPlayer.playing || !roomPlayers.some((model) => model.playing)) ? chosenPlayer : pickRoomPlayer(roomPlayers, null);
  const pictureOfPlayer = (model: MediaModel) => (model.picture ? resolveAssetUrl(model.picture) ?? null : null);
  const mediaGroupCandidates: MediaGroupCandidate[] = shownPlayer
    ? mediaIds
        .filter((entityId) => entityId !== shownPlayer.entityId && media.modelOf(entityId).supports.group && media.modelOf(entityId).available)
        .map((entityId) => {
          const room = roomOf(entityId);
          return { entityId, name: media.modelOf(entityId).name, roomName: room ? roomNameById.get(room) ?? null : null };
        })
    : [];

  const mediaCandidates = candidatesFrom(mediaIds, (entityId) => media.modelOf(entityId).name);

  /** A media command; the demo, which has no player to ask, moves through its own tracks. */
  const actOnMedia = (entityId: string, action: MediaAction) => {
    const tracks = demo ? DEMO_MEDIA_TRACKS[entityId] : undefined;
    if (tracks && (action.type === 'next' || action.type === 'previous')) {
      const model = media.modelOf(entityId);
      const index = Math.max(0, tracks.findIndex(([title]) => title === model.title));
      const [title, artist, duration] = tracks[(index + (action.type === 'next' ? 1 : tracks.length - 1)) % tracks.length];
      media.act(entityId, { type: 'show_track', title, artist, duration });
      return;
    }
    media.act(entityId, action);
  };
  /** Shows another player; the one playing pauses, as the board says. */
  const pickPlayer = (entityId: string) => {
    if (!activeRoom) return;
    const playing = roomPlayers.find((model) => model.playing && model.entityId !== entityId);
    if (playing && shownPlayer?.entityId !== entityId) actOnMedia(playing.entityId, { type: 'play_pause' });
    setChosenPlayerByRoom((current) => ({ ...current, [activeRoom.id]: entityId }));
    setMediaSheet(null);
  };
  /** Starts a player that is off from one of its sources: on first, then the source. */
  const startFromSource = async (model: MediaModel, source: string) => {
    setMediaSheet(null);
    if (!demo && onCallService) await onCallService('media_player', 'turn_on', { entity_id: model.entityId });
    actOnMedia(model.entityId, { type: 'source', source });
  };

  /** Device commands; a protected plug asks before it turns off. */
  const actOnDevice = (entityId: string, action: DeviceAction) => {
    if (action.type === 'turn_off' && protectedSet.has(entityId)) {
      setConfirmOffId(entityId);
      return;
    }
    devices.act(entityId, action);
  };

  const canMove = demo || Boolean(canManageRooms && haConnected && onCallApi && activeRoom?.source === 'ha');
  const moveRooms = React.useMemo(
    () => allRoomTabs.filter((tab) => tab.id !== activeRoom?.id && (demo || tab.source === 'ha')).map(({ id, name }) => ({ id, name })),
    [activeRoom?.id, allRoomTabs, demo],
  );

  const placeAccessories = async (ids: string[], areaId: string | null) => {
    if (!activeRoom || ids.length === 0) return false;
    if (demo) {
      setDemoRoomByEntity((current) => {
        const next = { ...current };
        ids.forEach((id) => {
          if (areaId) next[id] = areaId;
          else delete next[id];
        });
        return next;
      });
      return true;
    }
    if (!onCallApi) return false;
    // An accessory that only follows its device leaves the room with the device.
    const targets: RoomAreaTarget[] = ids.map((id) => {
      const entry = registry.registryEntityById.get(id);
      return areaId === null && entry?.deviceId && !entry.areaId
        ? { kind: 'device', deviceId: entry.deviceId, entityIds: [id] }
        : { kind: 'entity', entityIds: [id] };
    });
    setBusy(true);
    setError(null);
    try {
      await assignRoomAreaTargets(onCallApi, targets, areaId, (id) => Boolean(registry.registryEntityById.get(id)?.areaId));
      registry.setEntityAreaByEntityId((current) => {
        const next = { ...current };
        ids.forEach((id) => {
          if (areaId) next[id] = areaId;
          else delete next[id];
        });
        return next;
      });
      void registry.refresh().catch(() => undefined);
      return true;
    } catch {
      setError(dt('updateFailed'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const leaveRoom = (ids: string[]) => {
    if (!activeRoom) return;
    setPinnedByRoom((current) => withoutIds(current, activeRoom.id, ids));
    setHiddenRoomEntitiesByRoom((current) => withoutIds(current, activeRoom.id, ids));
  };

  const activeArea = React.useMemo(
    () => (activeRoom?.source === 'ha' ? areas.find((area) => area.area_id === activeRoom.id) ?? null : null),
    [activeRoom, areas],
  );
  const roomEntityIds = React.useMemo(() => {
    if (!activeRoom) return [];
    if (demo) return Object.keys(states).filter((entityId) => roomOf(entityId) === activeRoom.id);
    return Object.keys(haStates).filter((entityId) => registry.entityAreaByEntityId[entityId] === activeRoom.id);
  }, [activeRoom, demo, haStates, registry.entityAreaByEntityId, roomOf, states]);
  const buckets = React.useMemo(() => bucketRoomEntities(roomEntityIds), [roomEntityIds]);

  // The glows of the Dynamic background follow the room, as on the Rooms page.
  const pictureColor = useRoomPictureColor(activeArea?.area_id, activeArea?.picture);
  useAmbient(
    activeRoom
      ? resolveRoomAmbient({ id: activeRoom.id, name: activeRoom.name, icon: activeArea?.icon, picture: activeArea?.picture }, pictureColor)
      : null,
  );

  const readings = demo
    ? (activeRoom && DEMO_ROOM_READINGS[activeRoom.id]) || {}
    : resolveRoomClimateReadings(activeArea, buckets.sensors, haStates);
  const activeCount =
    roomItems.filter((item) => item.active).length +
    deviceItems.filter((item) => item.active).length +
    roomClimates.filter(climateIsOn).length +
    roomPlayers.filter((model) => model.playing).length;
  const subtitle = [
    typeof readings.temperature === 'number' ? formatDegrees(readings.temperature, locale) : null,
    typeof readings.humidity === 'number' ? dt('humidityPct', { pct: Math.round(readings.humidity) }) : null,
    activeCount === 0 ? dt('activeNone') : activeCount === 1 ? dt('activeOne') : dt('activeMany', { count: activeCount }),
  ]
    .filter(Boolean)
    .join(' · ');

  const climate = climateGlance(buckets, states);
  const litCount = roomItems.filter((item) => item.model.available && item.model.on).length;
  const climateStatus = (glance: ClimateGlance) => {
    const degrees = (value?: number) => (typeof value === 'number' ? formatDegrees(value, locale) : '');
    if (glance.mode === 'off') return dt('climateOff');
    if (glance.mode === 'heat') return glance.target !== undefined ? dt('climateHeatTo', { t: degrees(glance.target) }) : dt('sectionClimate');
    if (glance.mode === 'cool') return glance.target !== undefined ? dt('climateCoolTo', { t: degrees(glance.target) }) : dt('sectionClimate');
    if (glance.mode === 'heat_cool') {
      return glance.low !== undefined && glance.high !== undefined
        ? dt('climateAutoRange', { low: degrees(glance.low).replace('°', ''), high: degrees(glance.high) })
        : dt('climateAuto');
    }
    return glance.mode === 'dry' ? dt('climateDry') : dt('climateFan');
  };
  const chips: StatusChip[] = [
    ...(roomAlerts.length > 0
      ? [
          {
            key: 'security' as const,
            title: dt('chipSecurity'),
            status:
              roomAlerts.length === 1
                ? `${roomAlerts[0].model.name} · ${securityStatus(roomAlerts[0].model, dt)}`
                : dt('securityAlertsMany', { count: roomAlerts.length }),
            tone: 'security',
            target: 'rv2-security',
          },
        ]
      : []),
    ...(climate
      ? [{ key: 'climate' as const, title: dt('chipClimate'), status: climateStatus(climate), tone: CLIMATE_TONE[climate.mode], target: 'rv2-climate' }]
      : []),
    ...(roomItems.length > 0
      ? [
          {
            key: 'lights' as const,
            title: dt('chipLights'),
            status: litCount === 0 ? dt('lightsAllOff') : litCount === 1 ? dt('lightsOnOne') : dt('lightsOnMany', { count: litCount }),
            tone: litCount > 0 ? 'light' : 'idle',
            target: 'rv2-lights',
          },
        ]
      : []),
    ...(typeof readings.humidity === 'number'
      ? [
          {
            key: 'humidity' as const,
            title: dt('chipHumidity'),
            status: `${Math.round(readings.humidity)}%`,
            tone: 'humidity',
            target: buckets.sensors.length > 0 ? 'rv2-environment' : null,
          },
        ]
      : []),
    ...(roomPlayers.some((model) => model.playing)
      ? [
          {
            key: 'media' as const,
            title: dt('chipMedia'),
            status: roomPlayers.find((model) => model.playing)?.title ?? dt('playing'),
            tone: 'media',
            target: 'rv2-media',
          },
        ]
      : []),
  ];

  const floorOptions = React.useMemo<FloorOption[]>(
    () => [
      { id: 'all', name: dt('wholeHome'), roomCount: allRoomTabs.length },
      ...registry.floors.map((floor) => ({
        id: floor.floor_id,
        name: floor.name,
        roomCount: areas.filter((area) => area.floor_id === floor.floor_id).length,
      })),
    ],
    [allRoomTabs.length, areas, dt, registry.floors],
  );
  const pills = roomTabs.map((tab) => ({
    id: tab.id,
    name: tab.name,
    icon: roomIconKind(areas.find((area) => area.area_id === tab.id)?.icon, tab.name),
    alert: alertRoomIds.has(tab.id),
  }));

  const addCandidates = React.useMemo<AccessoryCandidate[]>(() => {
    if (!activeRoom) return [];
    if (demo) {
      return [
        ...candidates.map((candidate) => ({ ...candidate, kind: dt('chipLights') })),
        ...deviceCandidates.map((candidate) => ({ ...candidate, kind: dt('sectionDevices') })),
        ...climateCandidates.map((candidate) => ({ ...candidate, kind: dt('sectionClimate') })),
        ...sensorCandidates.map((candidate) => ({ ...candidate, kind: dt('sectionEnvironment') })),
        ...sceneCandidates.map((candidate) => ({ ...candidate, kind: dt('sectionScenes') })),
        ...securityCandidates.map((candidate) => ({ ...candidate, kind: dt('sectionSecurity') })),
        ...mediaCandidates.map((candidate) => ({ ...candidate, kind: dt('sectionMedia') })),
      ].sort(byRoomThenName);
    }
    // Sensors are offered by kind, not every sensor of the home.
    const sectionKeyOf = (entityId: string) =>
      ADDABLE_DOMAINS[entityId.split('.')[0]] ??
      (sensorKindOf(entityId, haStates[entityId])
        ? 'sectionEnvironment'
        : securityKindOf(entityId, haStates[entityId])
          ? 'sectionSecurity'
          : null);
    return Object.keys(haStates)
      .filter((entityId) => sectionKeyOf(entityId) && registry.entityAreaByEntityId[entityId] !== activeRoom.id)
      .map((entityId) => {
        const room = registry.entityAreaByEntityId[entityId];
        return {
          id: entityId,
          name: getEntityFriendlyName(entityId, haStates[entityId]),
          roomName: room ? roomNameById.get(room) ?? null : null,
          kind: dt(sectionKeyOf(entityId) as NonNullable<ReturnType<typeof sectionKeyOf>>),
        };
      })
      .sort(byRoomThenName);
  }, [activeRoom, candidates, climateCandidates, demo, deviceCandidates, dt, haStates, mediaCandidates, registry.entityAreaByEntityId, roomNameById, sceneCandidates, securityCandidates, sensorCandidates]);
  const missing = missingSections(buckets).filter(
    (key) => (key !== 'security' || securityItems.length === 0) && (key !== 'media' || roomPlayers.length === 0),
  );
  const hasClimate = buckets.climates.some((entityId) => entityId.startsWith('climate.'));
  const hasSide = hasClimate || sensorItems.length > 0;
  const hasSecurity = securityItems.length > 0;
  const hasMedia = shownPlayer !== null;

  const renderLight = (item: RoomLightItem, context: { editing: boolean; selected: boolean; onSelect: () => void }) => (
    <LightCard
      model={item.model}
      format="U×2"
      editing={context.editing}
      selected={context.selected}
      onAction={(action) => lights.act(item.id, action)}
      onOpenPanel={() => setPanel({ kind: 'lights', id: item.id })}
      onSelect={context.onSelect}
    />
  );
  const renderDevice = (item: RoomDeviceItem, context: { editing: boolean; selected: boolean; onSelect: () => void }) => (
    <DeviceCard
      model={item.model}
      format="U×2"
      protectedPlug={protectedSet.has(item.id)}
      editing={context.editing}
      selected={context.selected}
      onAction={(action) => actOnDevice(item.id, action)}
      onOpenPanel={() => setPanel({ kind: 'devices', id: item.id })}
      onSelect={context.onSelect}
    />
  );
  const sectionHandlers = activeRoom
    ? {
        onPin: (ids: string[]) => {
          setPinnedByRoom((current) => {
            const next = { ...current, [activeRoom.id]: togglePinned(current[activeRoom.id] ?? [], ids) };
            if (next[activeRoom.id].length === 0) delete next[activeRoom.id];
            return next;
          });
          // In evidence means visible.
          setHiddenRoomEntitiesByRoom((current) => withoutIds(current, activeRoom.id, ids));
        },
        onToggleHidden: (ids: string[], hide: boolean) => {
          if (hide) {
            setHiddenRoomEntitiesByRoom((current) => ({
              ...current,
              [activeRoom.id]: Array.from(new Set([...(current[activeRoom.id] ?? []), ...ids])),
            }));
            setPinnedByRoom((current) => withoutIds(current, activeRoom.id, ids));
          } else {
            setHiddenRoomEntitiesByRoom((current) => withoutIds(current, activeRoom.id, ids));
          }
        },
        onMove: async (ids: string[], roomId: string) => {
          const done = await placeAccessories(ids, roomId);
          if (done) leaveRoom(ids);
          return done;
        },
        onRemove: async (ids: string[]) => {
          const done = await placeAccessories(ids, null);
          if (done) leaveRoom(ids);
          return done;
        },
        onAdd: async (ids: string[]) => {
          const done = await placeAccessories(ids, activeRoom.id);
          if (done) setHiddenRoomEntitiesByRoom((current) => withoutIds(current, activeRoom.id, ids));
          return done;
        },
      }
    : null;
  const panelLight = panel?.kind === 'lights' ? lights.modelOf(panel.id) : null;
  const panelDevice = panel?.kind === 'devices' ? devices.modelOf(panel.id) : null;
  const panelClimate = panel?.kind === 'climate' ? climates.modelOf(panel.id) : null;
  const panelSensor = panel?.kind === 'sensors' ? sensorModelOf(panel.id) ?? null : null;
  const renderScene = (item: RoomSceneItem, context: { editing: boolean; selected: boolean; onSelect: () => void }) => (
    <SceneCard
      model={item.model}
      active={activeSceneId === item.id}
      applying={applyingSceneId === item.id}
      editing={context.editing}
      selected={context.selected}
      hiddenItem={item.hidden}
      onRun={() => void runScene(item.model)}
      onSelect={context.onSelect}
    />
  );
  const panelSensorHistory = useSensorHistory({
    entityIds: panelSensor && panelSensor.kind !== 'smoke' ? [panelSensor.entityId] : [],
    hours: SENSOR_PERIOD_HOURS[sensorPeriod],
    onCallApi,
    demoSeries: sensorDemoSeries,
  });
  const renderSensor = (item: RoomSensorItem, context: { editing: boolean; selected: boolean; onSelect: () => void }) => (
    <SensorCard
      model={item.model}
      history={roomSensorHistory.points[item.id] ?? []}
      editing={context.editing}
      selected={context.selected}
      hiddenItem={item.hidden}
      onOpenPanel={() => {
        setSensorPeriod('24h');
        setPanel({ kind: 'sensors', id: item.id });
      }}
      onSelect={context.onSelect}
    />
  );
  const confirmDevice = confirmOffId ? devices.modelOf(confirmOffId) : null;

  const pictureOf = (entityId: string) => roomCameras.find((camera) => camera.entityId === entityId)?.snapshotUrl ?? null;
  const renderSecurity = (item: RoomSecurityItem, context: { editing: boolean; selected: boolean; onSelect: () => void }) => (
    <SecurityCard
      model={item.model}
      pictureUrl={item.model.kind === 'camera' ? pictureOf(item.id) : null}
      editing={context.editing}
      selected={context.selected}
      hiddenItem={item.hidden}
      onOpen={() => (item.model.kind === 'camera' ? setCameraOpenId(item.id) : setPanel({ kind: 'security', id: item.id }))}
      onLockCommand={(command) => void commandLock(securityModelOf(item.id), command)}
      onSelect={context.onSelect}
    />
  );
  const panelSecurity = panel?.kind === 'security' ? securityModelOf(panel.id) ?? null : null;
  const panelSecurityHistory = useStateHistory({
    entityId: panelSecurity && panelSecurity.kind !== 'camera' ? panelSecurity.entityId : null,
    changedAt: panelSecurity?.changedAt,
    onCallApi,
    demoHistory: demo ? demoSecurityHistory : undefined,
  });

  // A room that can be changed here: not one of the demo's own, and an area only with Home Assistant.
  const canEditRoom = (room: RoomTab | null) =>
    Boolean(room) && management.canManage && !DEMO_ROOM_IDS.has(room!.id) && (room!.source === 'custom' || management.canManageHa);
  const temperatureSensors = sensorOptionsOf(haStates, 'temperature');
  const humiditySensors = sensorOptionsOf(haStates, 'humidity');
  const sheetRoom = roomSheet?.room ?? null;
  const newRoom = () => {
    management.clearError();
    setRoomSheet({ room: null });
  };
  // Floors, and the rooms on them, are managed in Settings.
  const manageFloors = management.canManageHa && onNavigate ? () => onNavigate('/settings/floors') : undefined;
  const roomSheetLayer = (
    <>
      <PanelHost presentation={phone ? 'sheet' : 'dialog'} isOpen={Boolean(roomSheet)} onClose={() => setRoomSheet(null)} title={sheetRoom ? rt('editRoom') : rt('newRoom')}>
        {roomSheet ? (
          <RoomEditPanel
            key={sheetRoom?.id ?? 'new'}
            room={sheetRoom}
            area={sheetRoom?.source === 'ha' ? areas.find((area) => area.area_id === sheetRoom.id) ?? null : null}
            haFields={sheetRoom ? sheetRoom.source === 'ha' : management.canManageHa}
            floors={registry.floors}
            sensors={{ temperature: temperatureSensors, humidity: humiditySensors }}
            busy={management.busy}
            error={management.error}
            onSave={(draft) => management.saveRoom(sheetRoom, draft)}
            onDelete={() => (sheetRoom ? management.deleteRoom(sheetRoom) : Promise.resolve(false))}
            onClose={() => setRoomSheet(null)}
          />
        ) : null}
      </PanelHost>
    </>
  );

  if (roomTabs.length === 0) {
    return (
      <div className="rooms-dashboard dashboard-page-scroll" data-testid="rooms-v2">
        <div className="dashboard-page-content dashboard-page-content-wide flex min-h-[calc(100dvh-5rem)] items-center justify-center px-4">
          <section className="dashboard-content-surface flex w-full max-w-xl flex-col items-center rounded-[2rem] px-6 py-10 text-center">
            <House size={24} aria-hidden="true" className="text-[color:var(--ui-text-secondary)]" />
            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-[color:var(--ui-text-primary)]">
              {isLoading ? rt('loadingRooms') : rt('noRooms')}
            </h1>
            {isLoading ? null : <p className="mt-2 max-w-md text-sm text-[color:var(--ui-text-secondary)]">{rt('noRoomsDescription')}</p>}
            {!isLoading && management.canManage ? (
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  className="rv2-form-save inline-flex items-center gap-1.5"
                  onClick={newRoom}
                >
                  <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
                  {rt('newRoom')}
                </button>
                {manageFloors ? (
                  <button type="button" className="glass-button min-h-11 rounded-full px-5 text-sm font-semibold" onClick={manageFloors}>
                    {rt('manageFloors')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>
        {roomSheetLayer}
      </div>
    );
  }

  return (
    <div className="rooms-dashboard dashboard-page-scroll" data-testid="rooms-v2">
      <div className="dashboard-page-content dashboard-page-content-wide min-w-0 max-w-full">
        <main className="rv2-main">
          <RoomHead
            name={activeRoom?.name ?? ''}
            subtitle={subtitle}
            floors={floorOptions}
            selectedFloorId={selectedFloorId}
            onSelectFloor={setSelectedFloorId}
            rooms={pills}
            activeRoomId={activeRoom?.id ?? ''}
            onSelectRoom={setActiveRoomId}
            chips={chips}
            onAdd={canMove ? () => setAddOpen(true) : undefined}
            onEditRoom={
              canEditRoom(activeRoom)
                ? () => {
                    management.clearError();
                    setRoomSheet({ room: activeRoom });
                  }
                : undefined
            }
            onNewRoom={management.canManage ? newRoom : undefined}
            onManageFloors={manageFloors}
          />

          {sceneItems.length > 0 ? (
            <RoomSection
              id="rv2-scenes"
              testId="rooms-v2-scenes"
              title={dt('sectionScenes')}
              items={sceneItems}
              count={String(sceneItems.length)}
              moreLabel={dt('moreScenes')}
              renderCard={renderScene}
              onOpenPage={() => setSectionOpen('scenes')}
              gridClassName="rv2-strip rv2-scene-strip"
            />
          ) : null}

          <div className="rv2-columns">
            {hasSide ? (
              <div className="rv2-column-side">
                {roomClimates.length > 0 ? (
                  <section id="rv2-climate" aria-labelledby="rv2-climate-title" className="flex min-w-0 flex-col gap-3" data-testid="rooms-v2-climate">
                    <h2 id="rv2-climate-title" className="rv2-section-heading flex min-h-11 items-center px-1">
                      {dt('sectionClimate')}
                    </h2>
                    <div className="rv2-climate-grid">
                      {roomClimates.map((model, index) => (
                        <div key={model.entityId} className={index === 0 ? 'rv2-climate-main' : 'rv2-climate-extra'}>
                          <ClimateCard
                            model={model}
                            size={index === 0 ? 'large' : 'small'}
                            roomTemperature={readings.temperature ?? null}
                            roomHumidity={readings.humidity ?? null}
                            onAction={(action) => climates.act(model.entityId, action)}
                            onOpenPanel={() => setPanel({ kind: 'climate', id: model.entityId })}
                          />
                        </div>
                      ))}
                    </div>
                  </section>
                ) : hasClimate ? (
                  <SectionComing id="rv2-climate" title={dt('sectionClimate')} />
                ) : null}
                {sensorItems.length > 0 ? (
                  <RoomSection
                    id="rv2-environment"
                    testId="rooms-v2-sensors"
                    title={dt('sectionEnvironment')}
                    items={sensorItems}
                    count={String(sensorItems.length)}
                    moreLabel={dt('moreSensors')}
                    renderCard={renderSensor}
                    onOpenPage={() => setSectionOpen('sensors')}
                    gridClassName="rv2-grid-sensors"
                  />
                ) : null}
              </div>
            ) : null}
            <div className="rv2-column-main">
              {roomItems.length > 0 ? (
                <RoomSection
                  id="rv2-lights"
                  testId="rooms-v2-lights"
                  title={dt('lights')}
                  items={roomItems}
                  count={`${roomItems.filter((item) => item.active).length}/${roomItems.length}`}
                  moreLabel={dt('moreLights')}
                  action={
                    roomItems.some((item) => item.active)
                      ? { label: dt('lightsOff'), onPress: () => lights.turnOffAll(roomItems.map((item) => item.id)) }
                      : null
                  }
                  renderCard={renderLight}
                  onOpenPage={() => setSectionOpen('lights')}
                />
              ) : (
                <p className="dv-t2 m-0 px-1 text-sm">{dt('noLightsInRoom')}</p>
              )}
              {deviceItems.length > 0 ? (
                <RoomSection
                  id="rv2-devices"
                  testId="rooms-v2-devices"
                  title={dt('sectionDevices')}
                  items={deviceItems}
                  count={`${deviceItems.filter((item) => item.active).length}/${deviceItems.length}`}
                  moreLabel={dt('moreDevices')}
                  renderCard={renderDevice}
                  onOpenPage={() => setSectionOpen('devices')}
                />
              ) : null}
            </div>
          </div>

          {hasSecurity || hasMedia ? (
            <div className="rv2-row-wrap">
              {hasSecurity ? (
                <div className="min-w-0 flex-[1_1_440px]">
                  <RoomSection
                    id="rv2-security"
                    testId="rooms-v2-security"
                    title={dt('sectionSecurity')}
                    items={securityItems}
                    count={String(securityItems.length)}
                    moreLabel={dt('moreSecurity')}
                    renderCard={renderSecurity}
                    onOpenPage={() => setSectionOpen('security')}
                  />
                </div>
              ) : null}
              {hasMedia && shownPlayer ? (
                <section id="rv2-media" aria-labelledby="rv2-media-title" className="flex min-w-0 flex-[1_1_320px] flex-col gap-3" data-testid="rooms-v2-media">
                  <div className="flex min-h-11 items-center justify-between gap-3">
                    <h2 id="rv2-media-title" className="rv2-section-heading m-0 px-1">
                      {dt('sectionMedia')}
                    </h2>
                    {roomPlayers.length > 1 ? (
                      <button
                        type="button"
                        className="dv-glass rv2-player-pick"
                        aria-label={dt('mediaPickPlayer', { name: shownPlayer.name })}
                        onClick={() => setMediaSheet('pick')}
                      >
                        <MediaKindIcon model={shownPlayer} />
                        <span className="truncate">{shownPlayer.name}</span>
                        <ChevronDown size={14} strokeWidth={2.6} aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                  {shownPlayer.on ? (
                    <NowPlayingCard
                      model={shownPlayer}
                      pictureUrl={pictureOfPlayer(shownPlayer)}
                      onAction={(action) => actOnMedia(shownPlayer.entityId, action)}
                      onOpenPlayer={() => setMediaSheet('player')}
                    />
                  ) : (
                    <MediaOffCard
                      model={shownPlayer}
                      onPowerOn={() => actOnMedia(shownPlayer.entityId, { type: 'power', on: true })}
                      onOpen={() => setMediaSheet('start')}
                    />
                  )}
                </section>
              ) : null}
            </div>
          ) : null}

          {missing.length > 0 ? (
            <AddAccessoriesRow
              label={dt('addAccessories')}
              detail={dt('missingIn', { list: missing.map((key) => dt(MISSING_KEY[key])).join(', ') })}
              onOpen={canMove ? () => setAddOpen(true) : undefined}
            />
          ) : null}
        </main>
      </div>

      {sectionOpen === 'lights' && activeRoom && sectionHandlers ? (
        <SectionPage
          title={dt('lights')}
          roomName={activeRoom.name}
          items={roomItems}
          candidatesEmptyLabel={dt('noCandidates')}
          renderCard={(item, context) => (
            <LightCard
              model={item.model}
              format="U×2"
              editing={context.editing}
              selected={context.selected}
              hiddenItem={item.hidden}
              onAction={(action) => lights.act(item.id, action)}
              onOpenPanel={() => setPanel({ kind: 'lights', id: item.id })}
              onSelect={context.onSelect}
            />
          )}
          canOrganize={canOrganize}
          canMove={canMove}
          busy={busy}
          error={error}
          candidates={candidates}
          rooms={moveRooms}
          onClose={() => setSectionOpen(null)}
          {...sectionHandlers}
        />
      ) : null}
      {sectionOpen === 'devices' && activeRoom && sectionHandlers ? (
        <SectionPage
          title={dt('sectionDevices')}
          roomName={activeRoom.name}
          items={deviceItems}
          candidatesEmptyLabel={dt('noDeviceCandidates')}
          renderCard={(item, context) => (
            <DeviceCard
              model={item.model}
              format="U×2"
              protectedPlug={protectedSet.has(item.id)}
              editing={context.editing}
              selected={context.selected}
              hiddenItem={item.hidden}
              onAction={(action) => actOnDevice(item.id, action)}
              onOpenPanel={() => setPanel({ kind: 'devices', id: item.id })}
              onSelect={context.onSelect}
            />
          )}
          canOrganize={canOrganize}
          canMove={canMove}
          busy={busy}
          error={error}
          candidates={deviceCandidates}
          rooms={moveRooms}
          onClose={() => setSectionOpen(null)}
          {...sectionHandlers}
        />
      ) : null}
      {sectionOpen === 'scenes' && activeRoom && sectionHandlers ? (
        <SectionPage
          title={dt('sectionScenes')}
          roomName={activeRoom.name}
          items={sceneItems}
          candidatesEmptyLabel={dt('noSceneCandidates')}
          renderCard={renderScene}
          gridClassName="rv2-grid rv2-grid-scenes"
          canOrganize={canOrganize}
          canMove={canMove}
          busy={busy}
          error={error}
          candidates={sceneCandidates}
          rooms={moveRooms}
          onClose={() => setSectionOpen(null)}
          {...sectionHandlers}
        />
      ) : null}
      {sectionOpen === 'sensors' && activeRoom && sectionHandlers ? (
        <SectionPage
          title={dt('sectionEnvironment')}
          roomName={activeRoom.name}
          items={sensorItems}
          candidatesEmptyLabel={dt('noSensorCandidates')}
          renderCard={renderSensor}
          gridClassName="rv2-grid-sensors"
          canOrganize={canOrganize}
          canMove={canMove}
          busy={busy}
          error={error}
          candidates={sensorCandidates}
          rooms={moveRooms}
          onClose={() => setSectionOpen(null)}
          {...sectionHandlers}
        />
      ) : null}
      {sectionOpen === 'security' && activeRoom && sectionHandlers ? (
        <SectionPage
          title={dt('sectionSecurity')}
          roomName={activeRoom.name}
          items={securityItems}
          candidatesEmptyLabel={dt('noSecurityCandidates')}
          renderCard={renderSecurity}
          canOrganize={canOrganize}
          canMove={canMove}
          busy={busy}
          error={error}
          candidates={securityCandidates}
          rooms={moveRooms}
          onClose={() => setSectionOpen(null)}
          {...sectionHandlers}
        />
      ) : null}

      <AddAccessoriesSheet
        isOpen={addOpen}
        title={dt('addAccessories')}
        candidates={addCandidates}
        emptyLabel={dt('noCandidates')}
        busy={busy}
        onClose={() => setAddOpen(false)}
        onAdd={async (ids) => {
          if (!activeRoom) return false;
          const done = await placeAccessories(ids, activeRoom.id);
          if (done) setHiddenRoomEntitiesByRoom((current) => withoutIds(current, activeRoom.id, ids));
          return done;
        }}
      />

      <PanelHost
        presentation={phone ? 'sheet' : 'dialog'}
        isOpen={Boolean(panelLight)}
        onClose={() => setPanel(null)}
        title={panelLight?.name ?? ''}
        tintRgb={panelLight && panelLight.on && panelLight.available ? lightRgb(panelLight).join(' ') : null}
      >
        {panelLight ? (
          <LightPanel
            model={panelLight}
            roomName={activeRoom?.name}
            onAction={(action) => lights.act(panelLight.entityId, action)}
            onClose={() => setPanel(null)}
          />
        ) : null}
      </PanelHost>

      <PanelHost
        presentation={phone ? 'sheet' : 'dialog'}
        isOpen={Boolean(panelDevice)}
        onClose={() => setPanel(null)}
        title={panelDevice?.name ?? ''}
        tintRgb={panelDevice && panelDevice.on && panelDevice.available ? DEVICE_TINT[panelDevice.kind] : null}
        softTint
      >
        {panelDevice ? (
          <DevicePanel
            model={panelDevice}
            roomName={activeRoom?.name}
            protectedPlug={protectedSet.has(panelDevice.entityId)}
            onToggleProtected={
              canOrganize && (panelDevice.kind === 'outlet' || panelDevice.kind === 'switch')
                ? (value) =>
                    setProtectedIds((current) =>
                      value ? Array.from(new Set([...current, panelDevice.entityId])) : current.filter((id) => id !== panelDevice.entityId),
                    )
                : undefined
            }
            onAction={(action) => actOnDevice(panelDevice.entityId, action)}
            onClose={() => setPanel(null)}
          />
        ) : null}
      </PanelHost>

      <PanelHost
        presentation={phone ? 'sheet' : 'dialog'}
        isOpen={Boolean(panelSensor)}
        onClose={() => setPanel(null)}
        title={panelSensor?.name ?? ''}
      >
        {panelSensor ? (
          <SensorPanel
            model={panelSensor}
            roomName={activeRoom?.name}
            history={panelSensorHistory.points[panelSensor.entityId] ?? []}
            historyLoading={panelSensorHistory.loading}
            period={sensorPeriod}
            onPeriod={setSensorPeriod}
            onClose={() => setPanel(null)}
          />
        ) : null}
      </PanelHost>

      <PanelHost
        presentation={phone ? 'sheet' : 'dialog'}
        isOpen={Boolean(panelClimate)}
        onClose={() => setPanel(null)}
        title={panelClimate?.name ?? ''}
        tintRgb={panelClimate && climateIsOn(panelClimate) ? CLIMATE_TINT[panelClimate.mode] : null}
        softTint
      >
        {panelClimate ? (
          <ClimatePanel
            model={panelClimate}
            roomName={activeRoom?.name}
            roomTemperature={readings.temperature ?? null}
            roomHumidity={readings.humidity ?? null}
            onAction={(action) => climates.act(panelClimate.entityId, action)}
            onClose={() => setPanel(null)}
          />
        ) : null}
      </PanelHost>

      <PanelHost
        presentation={phone ? 'sheet' : 'dialog'}
        isOpen={Boolean(panelSecurity)}
        onClose={() => setPanel(null)}
        title={panelSecurity?.name ?? ''}
      >
        {panelSecurity ? (
          <SecurityPanel
            model={panelSecurity}
            roomName={activeRoom?.name}
            history={panelSecurityHistory}
            onLockCommand={(command) => void commandLock(securityModelOf(panelSecurity.entityId), command)}
            onClose={() => setPanel(null)}
          />
        ) : null}
      </PanelHost>

      {mediaSheet === 'player' && shownPlayer?.on ? (
        <MediaPlayer
          model={shownPlayer}
          pictureUrl={pictureOfPlayer(shownPlayer)}
          groupCandidates={mediaGroupCandidates}
          onAction={(action) => actOnMedia(shownPlayer.entityId, action)}
          onClose={() => setMediaSheet(null)}
        />
      ) : null}

      <PanelHost
        presentation={phone ? 'sheet' : 'dialog'}
        isOpen={mediaSheet === 'pick' && roomPlayers.length > 1}
        onClose={() => setMediaSheet(null)}
        title={dt('mediaPickTitle')}
      >
        {mediaSheet === 'pick' ? (
          <MediaPickPanel players={roomPlayers} shownId={shownPlayer?.entityId ?? null} onPick={pickPlayer} onClose={() => setMediaSheet(null)} />
        ) : null}
      </PanelHost>

      <PanelHost
        presentation={phone ? 'sheet' : 'dialog'}
        isOpen={mediaSheet === 'start' && Boolean(shownPlayer) && !shownPlayer?.on}
        onClose={() => setMediaSheet(null)}
        title={shownPlayer?.name ?? ''}
      >
        {mediaSheet === 'start' && shownPlayer && !shownPlayer.on ? (
          <MediaStartPanel
            model={shownPlayer}
            roomName={activeRoom?.name ?? ''}
            pictureUrl={pictureOfPlayer(shownPlayer)}
            onPowerOn={() => {
              setMediaSheet(null);
              actOnMedia(shownPlayer.entityId, { type: 'power', on: true });
            }}
            onResume={() => {
              setMediaSheet(null);
              actOnMedia(shownPlayer.entityId, { type: 'play_pause' });
            }}
            onSource={(source) => void startFromSource(shownPlayer, source)}
            onClose={() => setMediaSheet(null)}
          />
        ) : null}
      </PanelHost>

      <CameraViewer
        isOpen={Boolean(cameraOpenId)}
        cameras={roomCameras}
        activeEntityId={cameraOpenId}
        onActiveEntityChange={setCameraOpenId}
        onClose={() => setCameraOpenId(null)}
        commandsEnabled={haConnected && !demo}
        onPtzMove={onCameraPtzMove}
        onPtzStop={onCameraPtzStop}
      />

      {sceneUndo ? (
        <div className="rv2-toast dv-glass" role="status" data-testid="rooms-v2-scene-undo">
          <span className="min-w-0 truncate text-sm font-semibold">{dt('sceneDone', { name: sceneUndo.name })}</span>
          <button type="button" className="rv2-toast-action" onClick={undoScene}>
            {dt('undo')}
          </button>
        </div>
      ) : null}

      <GlassModal
        isOpen={Boolean(confirmDevice)}
        onClose={() => setConfirmOffId(null)}
        title={confirmDevice ? dt('confirmOffTitle', { name: confirmDevice.name }) : ''}
        description={dt('confirmOffText')}
        size="sm"
        footer={
          <div className="flex w-full justify-end gap-2">
            <button type="button" className="glass-button min-h-11 rounded-full px-5 text-sm font-semibold" onClick={() => setConfirmOffId(null)}>
              {dt('cancel')}
            </button>
            <button
              type="button"
              className="glass-button min-h-11 rounded-full px-5 text-sm font-semibold text-[color:var(--dv-red)]"
              onClick={() => {
                if (confirmOffId) devices.act(confirmOffId, { type: 'turn_off' });
                setConfirmOffId(null);
              }}
            >
              {dt('turnOffShort')}
            </button>
          </div>
        }
      />

      {roomSheetLayer}
    </div>
  );
}

export default RoomsV2Page;
