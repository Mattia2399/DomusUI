import React from 'react';
import { ChevronRight, House, Plus } from 'lucide-react';
import {
  assignRoomAreaTargets,
  filterRoomTabsByFloor,
  getEntityFriendlyName,
  mergeRoomTabs,
  resolveRoomClimateReadings,
  toCustomRoomTabs,
  toHaRoomTabs,
  type RoomAreaTarget,
  type RoomsApiCall,
} from '../../components/rooms/roomsDirectory';
import { useProtectedEntities, useRoomPinnedEntities, useRoomsStoredState } from '../../components/rooms/useRoomsStoredState';
import { LightCard } from '../../components/devices/cards/LightCard';
import { DeviceCard } from '../../components/devices/cards/DeviceCard';
import { DevicePanel } from '../../components/devices/panels/DevicePanel';
import { ClimateCard } from '../../components/devices/cards/ClimateCard';
import { ClimatePanel } from '../../components/devices/panels/ClimatePanel';
import { climateIsOn, type ClimateModel } from '../../components/devices/model/climate';
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
import { DEMO_PROTECTED_ENTITIES, DEMO_ROOM_READINGS, DEMO_ROOMS, DEMO_STATES } from './demoRoomsFixtures';
import { AddAccessoriesSheet, type AccessoryCandidate } from './AddAccessoriesSheet';
import { RoomHead, type FloorOption, type StatusChip } from './RoomHead';
import {
  anyMediaPlaying,
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
 * The second Rooms page, on the Rooms board of the design: the head of the
 * room, its sections in two columns where there is room, and what the room
 * still lacks. Lights and devices are done; the other sections show where
 * they will be. Rooms, floors, local rooms and hidden devices are the ones of
 * the Rooms page, from the same storage.
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
type SectionKey = 'lights' | 'devices';
type PanelKind = SectionKey | 'climate';

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
const ADDABLE_DOMAINS: Record<string, 'chipLights' | 'sectionDevices' | 'sectionClimate' | 'sectionMedia' | 'sectionSecurity'> = {
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
}: RoomsV2PageProps) {
  const rt = useRoomsTranslations();
  const dt = useDevicesTranslations();
  const demo = runtimeMode === 'demo';
  const phone = usePhoneLayout();
  // The demo keeps its own copy of what is saved, so organising it is always allowed.
  const canOrganize = canManageRooms || demo;
  const { customRooms, hiddenRoomEntitiesByRoom, setHiddenRoomEntitiesByRoom, roomsStateRuntime, activeRoomId, setActiveRoomId } =
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
  const [addOpen, setAddOpen] = React.useState(false);
  const { locale } = useI18n();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const areas = React.useMemo(() => (haConnected ? haAreas : []), [haAreas, haConnected]);
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

  // The main unit of the room is the one that does the most (an air conditioner before a radiator valve).
  const roomClimates: ClimateModel[] = React.useMemo(() => {
    if (!activeRoom) return [];
    const hidden = new Set(hiddenRoomEntitiesByRoom[activeRoom.id] ?? []);
    return climateIds
      .filter((entityId) => roomOf(entityId) === activeRoom.id && !hidden.has(entityId))
      .map((entityId) => climates.modelOf(entityId))
      .sort((a, b) => b.modes.length - a.modes.length || a.name.localeCompare(b.name));
  }, [activeRoom, climateIds, climates, hiddenRoomEntitiesByRoom, roomOf]);

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
    buckets.medias.filter((entityId) => `${states[entityId]?.state ?? ''}` === 'playing').length;
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
    ...(anyMediaPlaying(buckets, haStates)
      ? [{ key: 'media' as const, title: dt('chipMedia'), status: dt('playing'), tone: 'media', target: 'rv2-media' }]
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
    alert: false,
  }));

  const addCandidates = React.useMemo<AccessoryCandidate[]>(() => {
    if (!activeRoom) return [];
    if (demo) {
      return [
        ...candidates.map((candidate) => ({ ...candidate, kind: dt('chipLights') })),
        ...deviceCandidates.map((candidate) => ({ ...candidate, kind: dt('sectionDevices') })),
        ...climateCandidates.map((candidate) => ({ ...candidate, kind: dt('sectionClimate') })),
      ].sort(byRoomThenName);
    }
    return Object.keys(haStates)
      .filter((entityId) => ADDABLE_DOMAINS[entityId.split('.')[0]] && registry.entityAreaByEntityId[entityId] !== activeRoom.id)
      .map((entityId) => {
        const room = registry.entityAreaByEntityId[entityId];
        return {
          id: entityId,
          name: getEntityFriendlyName(entityId, haStates[entityId]),
          roomName: room ? roomNameById.get(room) ?? null : null,
          kind: dt(ADDABLE_DOMAINS[entityId.split('.')[0]]),
        };
      })
      .sort(byRoomThenName);
  }, [activeRoom, candidates, climateCandidates, demo, deviceCandidates, dt, haStates, registry.entityAreaByEntityId, roomNameById]);
  const missing = missingSections(buckets);
  const scenes = buckets.others.filter((entityId) => entityId.startsWith('scene.'));
  const hasClimate = buckets.climates.some((entityId) => entityId.startsWith('climate.'));
  const hasSide = hasClimate || buckets.sensors.length > 0;
  const hasSecurity = buckets.locks.length > 0 || buckets.cameras.length > 0;
  const hasMedia = buckets.medias.length > 0;

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
  const confirmDevice = confirmOffId ? devices.modelOf(confirmOffId) : null;

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
          </section>
        </div>
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
          />

          {scenes.length > 0 ? <SectionComing id="rv2-scenes" title={dt('sectionScenes')} /> : null}

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
                {buckets.sensors.length > 0 ? <SectionComing id="rv2-environment" title={dt('sectionEnvironment')} /> : null}
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
                  <SectionComing id="rv2-security" title={dt('sectionSecurity')} />
                </div>
              ) : null}
              {hasMedia ? (
                <div className="min-w-0 flex-[1_1_320px]">
                  <SectionComing id="rv2-media" title={dt('sectionMedia')} />
                </div>
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
    </div>
  );
}

export default RoomsV2Page;
