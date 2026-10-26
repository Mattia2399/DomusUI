import React from 'react';
import { House } from 'lucide-react';
import GlassDropdown, { type GlassDropdownOption } from '../../components/ui/GlassDropdown';
import { RoomsTopTab } from '../../components/rooms/RoomsTopTab';
import {
  assignRoomAreaTargets,
  filterRoomTabsByFloor,
  mergeRoomTabs,
  toCustomRoomTabs,
  toHaRoomTabs,
  type RoomAreaTarget,
  type RoomsApiCall,
} from '../../components/rooms/roomsDirectory';
import { useRoomPinnedEntities, useRoomsStoredState } from '../../components/rooms/useRoomsStoredState';
import { LightPanel } from '../../components/devices/panels/LightPanel';
import { PanelHost } from '../../components/devices/panels/PanelHost';
import { lightRgb } from '../../components/devices/model/tileColor';
import { pinRanks, togglePinned } from '../../components/devices/model/sectionRules';
import type { HaArea } from '../../hooks/useHaLiveConnection';
import type { MockEntityStateMap } from '../../types/ha';
import type { DashboardRuntimeMode } from '../../security/dashboardAccess';
import { useDevicesTranslations } from '../../i18n/devicesTranslations';
import { useRoomsTranslations } from '../../i18n/roomsTranslations';
import { DEMO_LIGHT_ROOMS, DEMO_LIGHT_STATES } from './demoLightsFixtures';
import { LightsSection, type RoomLightItem } from './LightsSection';
import { LightsSectionPage, type LightCandidate } from './LightsSectionPage';
import { useLightCommands } from './useLightCommands';
import { useRoomsRegistry } from './useRoomsRegistry';
import './roomsV2.css';

/*
 * The second Rooms page, first slice: the room, its selector and the Lights
 * section with its page. The other sections follow; until then a quiet line
 * stands in for them. Rooms, floors, local rooms and hidden devices are the
 * ones of the Rooms page, from the same storage.
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
  const [demoRoomByLight, setDemoRoomByLight] = React.useState<Record<string, string>>(DEMO_LIGHT_ROOMS);
  const [selectedFloorId, setSelectedFloorId] = React.useState('all');
  const [sectionOpen, setSectionOpen] = React.useState(false);
  const [panelLightId, setPanelLightId] = React.useState<string | null>(null);
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
    setSectionOpen(false);
    setPanelLightId(null);
    setError(null);
  }, [activeRoom?.id]);

  const states = demo ? DEMO_LIGHT_STATES : haStates;
  const lights = useLightCommands({ demo, states, onCallService });
  const roomOfLight = React.useCallback(
    (entityId: string): string | null => (demo ? demoRoomByLight[entityId] : registry.entityAreaByEntityId[entityId]) ?? null,
    [demo, demoRoomByLight, registry.entityAreaByEntityId],
  );
  const lightIds = React.useMemo(() => Object.keys(states).filter((entityId) => entityId.startsWith('light.')), [states]);

  const roomItems = React.useMemo<RoomLightItem[]>(() => {
    if (!activeRoom) return [];
    const ranks = pinRanks(pinnedByRoom[activeRoom.id] ?? []);
    const hidden = new Set(hiddenRoomEntitiesByRoom[activeRoom.id] ?? []);
    return lightIds
      .filter((entityId) => roomOfLight(entityId) === activeRoom.id)
      .map((entityId) => {
        const model = lights.modelOf(entityId);
        return {
          id: entityId,
          name: model.name,
          pinRank: ranks.get(entityId) ?? null,
          needsAttention: !model.available,
          active: model.available && model.on,
          hidden: hidden.has(entityId),
          model,
        };
      });
  }, [activeRoom, hiddenRoomEntitiesByRoom, lightIds, lights, pinnedByRoom, roomOfLight]);

  const candidates = React.useMemo<LightCandidate[]>(
    () =>
      activeRoom
        ? lightIds
            .filter((entityId) => roomOfLight(entityId) !== activeRoom.id)
            .map((entityId) => {
              const room = roomOfLight(entityId);
              return { id: entityId, name: lights.modelOf(entityId).name, roomName: room ? roomNameById.get(room) ?? null : null };
            })
            .sort((a, b) => (a.roomName === null) === (b.roomName === null) ? a.name.localeCompare(b.name) : a.roomName === null ? -1 : 1)
        : [],
    [activeRoom, lightIds, lights, roomNameById, roomOfLight],
  );

  const canMove = demo || Boolean(canManageRooms && haConnected && onCallApi && activeRoom?.source === 'ha');
  const moveRooms = React.useMemo(
    () => allRoomTabs.filter((tab) => tab.id !== activeRoom?.id && (demo || tab.source === 'ha')).map(({ id, name }) => ({ id, name })),
    [activeRoom?.id, allRoomTabs, demo],
  );

  const placeLights = async (ids: string[], areaId: string | null) => {
    if (!activeRoom || ids.length === 0) return false;
    if (demo) {
      setDemoRoomByLight((current) => {
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
    // A light that only follows its device leaves the room with the device.
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

  const floorOptions = React.useMemo<GlassDropdownOption[]>(
    () => [{ id: 'all', name: rt('allFloors') }, ...registry.floors.map((floor) => ({ id: floor.floor_id, name: floor.name }))],
    [registry.floors, rt],
  );
  const panelModel = panelLightId ? lights.modelOf(panelLightId) : null;

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
        <main className="flex min-w-0 max-w-full flex-col gap-7 pb-10 text-[color:var(--dv-text)]">
          <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex min-w-0 flex-col gap-2">
              <h1 className="dashboard-page-title truncate pb-[0.14em]" aria-live="polite">
                {activeRoom?.name}
              </h1>
              <nav aria-label={rt('selectRoom')} className="-mx-1 flex min-w-0 items-center gap-1 overflow-x-auto pb-1 hide-scrollbar">
                {roomTabs
                  .filter((tab) => tab.id !== activeRoom?.id)
                  .map((tab) => (
                    <RoomsTopTab key={tab.id} tab={tab} isActive={false} onClick={() => setActiveRoomId(tab.id)} />
                  ))}
              </nav>
            </div>
            {registry.floors.length > 0 ? (
              <GlassDropdown
                size="compact"
                ariaLabel={rt('floors')}
                options={floorOptions}
                selected={floorOptions.find((option) => option.id === selectedFloorId) ?? floorOptions[0]}
                onChange={(option) => setSelectedFloorId(option.id)}
                className="w-full sm:w-56"
              />
            ) : null}
          </header>

          {roomItems.length > 0 ? (
            <LightsSection
              items={roomItems}
              onAction={lights.act}
              onOpenPanel={setPanelLightId}
              onOpenPage={() => setSectionOpen(true)}
              onTurnOffAll={() => lights.turnOffAll(roomItems.map((item) => item.id))}
            />
          ) : (
            <p className="dv-t2 m-0 text-sm">{dt('noLightsInRoom')}</p>
          )}

          <p className="dv-glass dv-t2 m-0 rounded-[18px] px-4 py-3.5 text-sm font-medium" data-testid="rooms-v2-placeholder">
            {dt('comingSoon', { sections: dt('comingSoonSections') })}
          </p>
        </main>
      </div>

      {sectionOpen && activeRoom ? (
        <LightsSectionPage
          roomName={activeRoom.name}
          items={roomItems}
          canOrganize={canOrganize}
          canMove={canMove}
          busy={busy}
          error={error}
          candidates={candidates}
          rooms={moveRooms}
          onClose={() => setSectionOpen(false)}
          onAction={lights.act}
          onOpenPanel={setPanelLightId}
          onPin={(ids) => {
            setPinnedByRoom((current) => {
              const next = { ...current, [activeRoom.id]: togglePinned(current[activeRoom.id] ?? [], ids) };
              if (next[activeRoom.id].length === 0) delete next[activeRoom.id];
              return next;
            });
            // In evidence means visible.
            setHiddenRoomEntitiesByRoom((current) => withoutIds(current, activeRoom.id, ids));
          }}
          onToggleHidden={(ids, hide) => {
            if (hide) {
              setHiddenRoomEntitiesByRoom((current) => ({
                ...current,
                [activeRoom.id]: Array.from(new Set([...(current[activeRoom.id] ?? []), ...ids])),
              }));
              setPinnedByRoom((current) => withoutIds(current, activeRoom.id, ids));
            } else {
              setHiddenRoomEntitiesByRoom((current) => withoutIds(current, activeRoom.id, ids));
            }
          }}
          onMove={async (ids, roomId) => {
            const done = await placeLights(ids, roomId);
            if (done) leaveRoom(ids);
            return done;
          }}
          onRemove={async (ids) => {
            const done = await placeLights(ids, null);
            if (done) leaveRoom(ids);
            return done;
          }}
          onAdd={async (ids) => {
            const done = await placeLights(ids, activeRoom.id);
            if (done) setHiddenRoomEntitiesByRoom((current) => withoutIds(current, activeRoom.id, ids));
            return done;
          }}
        />
      ) : null}

      <PanelHost
        presentation={phone ? 'sheet' : 'dialog'}
        isOpen={Boolean(panelModel)}
        onClose={() => setPanelLightId(null)}
        title={panelModel?.name ?? ''}
        tintRgb={panelModel && panelModel.on && panelModel.available ? lightRgb(panelModel).join(' ') : null}
      >
        {panelModel ? (
          <LightPanel
            model={panelModel}
            roomName={activeRoom?.name}
            onAction={(action) => lights.act(panelModel.entityId, action)}
            onClose={() => setPanelLightId(null)}
          />
        ) : null}
      </PanelHost>
    </div>
  );
}

export default RoomsV2Page;
