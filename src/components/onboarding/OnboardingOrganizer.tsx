import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  DoorOpen,
  Layers3,
  ListTree,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { GlassDropdown, type GlassDropdownOption } from '../ui/GlassDropdown';
import { GlassLoader } from '../ui/GlassLoader';
import { GlassSegmentSelect } from '../ui/GlassSegmentSelect';
import {
  SetupActionButton,
  SetupNotice,
  SetupSecondaryButton,
  WizardActions,
} from './OnboardingGlass';
import { useI18n } from '../../i18n/I18nProvider';
import { translateOnboarding, type OnboardingTranslationKey } from '../../i18n/onboardingTranslations';

type CallApi = <TResponse = unknown>(
  message: Record<string, unknown>,
  options?: { reportError?: boolean },
) => Promise<TResponse | null>;

type OrganizerProps = {
  callApi: CallApi;
  canManage: boolean;
  onBack: () => void;
  onComplete: () => void;
  onReconnect: () => void;
};

type FloorDraft = {
  key: string;
  floorId?: string;
  name: string;
  level: string;
  originalName: string;
  originalLevel: number | null;
  isNew: boolean;
};

type RoomDraft = {
  key: string;
  areaId?: string;
  name: string;
  floorKey: string;
  originalName: string;
  originalFloorId: string;
  isNew: boolean;
};

type EntityDraft = {
  entityId: string;
  name: string;
  areaKey: string;
  originalName: string;
  originalAreaId: string;
  deviceId?: string;
};

type OrganizerStep = 'floors' | 'rooms' | 'entities' | 'review';

const ORGANIZER_STEPS: OrganizerStep[] = ['floors', 'rooms', 'entities', 'review'];
const REQUEST_TIMEOUT_MS = 8000;
const ENTITY_PAGE_SIZE = 40;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function registryList(payload: unknown, key: 'entities' | 'devices') {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];
  return Array.isArray(payload[key]) ? payload[key] : [];
}

function settleRequest<T>(request: Promise<T | null>, timeoutMs = REQUEST_TIMEOUT_MS) {
  return new Promise<T | null>((resolve) => {
    let settled = false;
    const finish = (value: T | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve(value);
    };
    const timeoutId = window.setTimeout(() => finish(null), timeoutMs);
    void request.then(finish).catch(() => finish(null));
  });
}

function parseFloors(payload: unknown): FloorDraft[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap<FloorDraft>((entry) => {
    if (!isRecord(entry)) return [];
    const floorId = stringValue(entry.floor_id);
    const name = stringValue(entry.name);
    if (!floorId || !name) return [];
    const level = typeof entry.level === 'number' && Number.isFinite(entry.level) ? entry.level : null;
    return [{
      key: floorId,
      floorId,
      name,
      level: level === null ? '' : String(level),
      originalName: name,
      originalLevel: level,
      isNew: false,
    }];
  });
}

function parseRooms(payload: unknown): RoomDraft[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap<RoomDraft>((entry) => {
    if (!isRecord(entry)) return [];
    const areaId = stringValue(entry.area_id);
    const name = stringValue(entry.name);
    if (!areaId || !name) return [];
    const floorId = stringValue(entry.floor_id);
    return [{
      key: areaId,
      areaId,
      name,
      floorKey: floorId,
      originalName: name,
      originalFloorId: floorId,
      isNew: false,
    }];
  });
}

function parseDeviceAreas(payload: unknown) {
  const areas = new Map<string, string>();
  registryList(payload, 'devices').forEach((entry) => {
    if (!isRecord(entry)) return;
    const deviceId = stringValue(entry.id) || stringValue(entry.device_id) || stringValue(entry.di);
    const areaId = stringValue(entry.area_id) || stringValue(entry.ai);
    if (deviceId && areaId) areas.set(deviceId, areaId);
  });
  return areas;
}

function fallbackEntityName(entityId: string) {
  const objectId = entityId.split('.')[1] ?? entityId;
  return objectId
    .split('_')
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ');
}

function parseEntities(payload: unknown, deviceAreas: Map<string, string>): EntityDraft[] {
  return registryList(payload, 'entities').flatMap<EntityDraft>((entry) => {
    if (!isRecord(entry)) return [];
    const entityId = stringValue(entry.entity_id) || stringValue(entry.ei);
    if (!entityId) return [];
    const deviceId = stringValue(entry.device_id) || stringValue(entry.di);
    const directAreaId = stringValue(entry.area_id) || stringValue(entry.ai);
    const areaId = directAreaId || (deviceId ? deviceAreas.get(deviceId) ?? '' : '');
    const name =
      stringValue(entry.name) ||
      stringValue(entry.original_name) ||
      stringValue(entry.en) ||
      fallbackEntityName(entityId);
    return [{
      entityId,
      name,
      areaKey: areaId,
      originalName: name,
      originalAreaId: areaId,
      deviceId: deviceId || undefined,
    }];
  });
}

function parseCreatedId(payload: unknown, key: 'floor_id' | 'area_id') {
  return isRecord(payload) ? stringValue(payload[key]) : '';
}

function parseLevel(value: string) {
  if (!value.trim()) return null;
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : undefined;
}

function changedFloor(floor: FloorDraft) {
  return floor.isNew || floor.name.trim() !== floor.originalName || parseLevel(floor.level) !== floor.originalLevel;
}

function changedRoom(room: RoomDraft) {
  return room.isNew || room.name.trim() !== room.originalName || room.floorKey !== room.originalFloorId;
}

function changedEntity(entity: EntityDraft) {
  return entity.name.trim() !== entity.originalName || entity.areaKey !== entity.originalAreaId;
}

export function OnboardingOrganizer({ callApi, canManage, onBack, onComplete, onReconnect }: OrganizerProps) {
  const { locale } = useI18n();
  const ot = (key: OnboardingTranslationKey, parameters?: Record<string, string | number>) =>
    translateOnboarding(locale, key, parameters);
  const stepOptions = [
    { value: 'floors', label: ot('organizer.tab.floors') },
    { value: 'rooms', label: ot('organizer.tab.rooms') },
    { value: 'entities', label: ot('organizer.tab.entities') },
    { value: 'review', label: ot('organizer.tab.review') },
  ] as const;
  const [step, setStep] = useState<OrganizerStep>('floors');
  const [floors, setFloors] = useState<FloorDraft[]>([]);
  const [rooms, setRooms] = useState<RoomDraft[]>([]);
  const [entities, setEntities] = useState<EntityDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const [entitySearch, setEntitySearch] = useState('');
  const [visibleEntityCount, setVisibleEntityCount] = useState(ENTITY_PAGE_SIZE);
  const loadNonceRef = useRef(0);

  const loadOrganization = async () => {
    const nonce = ++loadNonceRef.current;
    setLoading(true);
    setLoadError('');
    const [floorPayload, areaPayload, entityPayloadPrimary, devicePayloadPrimary] = await Promise.all([
      settleRequest(callApi({ type: 'config/floor_registry/list' }, { reportError: false })),
      settleRequest(callApi({ type: 'config/area_registry/list' }, { reportError: false })),
      settleRequest(callApi({ type: 'config/entity_registry/list' }, { reportError: false })),
      settleRequest(callApi({ type: 'config/device_registry/list' }, { reportError: false })),
    ]);
    if (nonce !== loadNonceRef.current) return;

    const [entityPayload, devicePayload] = await Promise.all([
      registryList(entityPayloadPrimary, 'entities').length > 0
        ? Promise.resolve(entityPayloadPrimary)
        : settleRequest(callApi({ type: 'config/entity_registry/list_for_display' }, { reportError: false })),
      registryList(devicePayloadPrimary, 'devices').length > 0
        ? Promise.resolve(devicePayloadPrimary)
        : settleRequest(callApi({ type: 'config/device_registry/list_for_display' }, { reportError: false })),
    ]);
    if (nonce !== loadNonceRef.current) return;

    const nextFloors = parseFloors(floorPayload);
    const nextRooms = parseRooms(areaPayload);
    const nextEntities = parseEntities(entityPayload, parseDeviceAreas(devicePayload));
    setFloors(nextFloors);
    setRooms(nextRooms);
    setEntities(nextEntities);
    setLoading(false);
    if (!areaPayload || nextEntities.length === 0) {
      setLoadError(ot('organizer.error.registries'));
    }
  };

  useEffect(() => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    const startId = window.setTimeout(() => void loadOrganization(), 0);
    return () => {
      window.clearTimeout(startId);
      loadNonceRef.current += 1;
    };
    // The API callback is stable for the lifetime of the setup connection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callApi, canManage]);

  useEffect(() => {
    setVisibleEntityCount(ENTITY_PAGE_SIZE);
  }, [entitySearch]);

  const floorOptions = useMemo<GlassDropdownOption[]>(
    () => [
      { id: '', name: ot('organizer.noFloor') },
      ...floors.map((floor) => ({ id: floor.key, name: floor.name.trim() || ot('organizer.unnamedFloor') })),
    ],
    [floors, locale],
  );
  const roomOptions = useMemo<GlassDropdownOption[]>(
    () => [
      { id: '', name: ot('organizer.noRoom') },
      ...rooms.map((room) => ({ id: room.key, name: room.name.trim() || ot('organizer.unnamedRoom') })),
    ],
    [rooms, locale],
  );

  const filteredEntities = useMemo(() => {
    const query = entitySearch.trim().toLowerCase();
    if (!query) return entities;
    return entities.filter((entity) => `${entity.name} ${entity.entityId}`.toLowerCase().includes(query));
  }, [entities, entitySearch]);
  const visibleEntities = filteredEntities.slice(0, visibleEntityCount);

  const changedFloors = floors.filter(changedFloor);
  const changedRooms = rooms.filter(changedRoom);
  const changedEntities = entities.filter(changedEntity);
  const totalChanges = changedFloors.length + changedRooms.length + changedEntities.length;

  const currentStepIndex = ORGANIZER_STEPS.indexOf(step);
  const goPrevious = () => {
    if (currentStepIndex <= 0) {
      onBack();
      return;
    }
    setStep(ORGANIZER_STEPS[currentStepIndex - 1]);
  };
  const goNext = () => setStep(ORGANIZER_STEPS[Math.min(ORGANIZER_STEPS.length - 1, currentStepIndex + 1)]);

  const addFloor = () => {
    const key = `new-floor-${Date.now()}-${Math.round(Math.random() * 1000)}`;
    setFloors((current) => [...current, { key, name: ot('organizer.newFloorName'), level: '', originalName: '', originalLevel: null, isNew: true }]);
  };
  const addRoom = () => {
    const key = `new-area-${Date.now()}-${Math.round(Math.random() * 1000)}`;
    setRooms((current) => [...current, { key, name: ot('organizer.newRoomName'), floorKey: '', originalName: '', originalFloorId: '', isNew: true }]);
  };
  const removeDraftFloor = (floorKey: string) => {
    setFloors((current) => current.filter((item) => item.key !== floorKey));
    setRooms((current) => current.map((room) => (
      room.floorKey === floorKey ? { ...room, floorKey: '' } : room
    )));
  };
  const removeDraftRoom = (roomKey: string) => {
    setRooms((current) => current.filter((item) => item.key !== roomKey));
    setEntities((current) => current.map((entity) => (
      entity.areaKey === roomKey ? { ...entity, areaKey: '' } : entity
    )));
  };

  const applyOrganization = async () => {
    if (!canManage || saving) return;
    if (floors.some((floor) => !floor.name.trim() || parseLevel(floor.level) === undefined)) {
      setSaveError(ot('organizer.error.floors'));
      setStep('floors');
      return;
    }
    if (rooms.some((room) => !room.name.trim())) {
      setSaveError(ot('organizer.error.rooms'));
      setStep('rooms');
      return;
    }

    setSaving(true);
    setSaveError('');
    setSaveProgress(4);
    const floorIdByKey = new Map(floors.filter((floor) => floor.floorId).map((floor) => [floor.key, floor.floorId!]));
    const areaIdByKey = new Map(rooms.filter((room) => room.areaId).map((room) => [room.key, room.areaId!]));
    const operationCount = Math.max(1, totalChanges);
    let completedOperations = 0;
    const advance = () => {
      completedOperations += 1;
      setSaveProgress(Math.min(96, Math.round((completedOperations / operationCount) * 100)));
    };

    try {
      for (const floor of changedFloors) {
        const level = parseLevel(floor.level);
        const payload = floor.isNew
          ? {
              type: 'config/floor_registry/create',
              name: floor.name.trim(),
              ...(level === null ? {} : { level }),
            }
          : { type: 'config/floor_registry/update', floor_id: floor.floorId, name: floor.name.trim(), level };
        const result = await settleRequest(callApi(payload), 12000);
        if (result === null) throw new Error('floor');
        if (floor.isNew) {
          const createdId = parseCreatedId(result, 'floor_id');
          if (!createdId) throw new Error('floor');
          floorIdByKey.set(floor.key, createdId);
        }
        advance();
      }

      for (const room of changedRooms) {
        const floorId = room.floorKey ? floorIdByKey.get(room.floorKey) ?? null : null;
        const payload = room.isNew
          ? {
              type: 'config/area_registry/create',
              name: room.name.trim(),
              ...(floorId ? { floor_id: floorId } : {}),
            }
          : { type: 'config/area_registry/update', area_id: room.areaId, name: room.name.trim(), floor_id: floorId };
        const result = await settleRequest(callApi(payload), 12000);
        if (result === null) throw new Error('room');
        if (room.isNew) {
          const createdId = parseCreatedId(result, 'area_id');
          if (!createdId) throw new Error('room');
          areaIdByKey.set(room.key, createdId);
        }
        advance();
      }

      for (const entity of changedEntities) {
        const areaId = entity.areaKey ? areaIdByKey.get(entity.areaKey) ?? entity.areaKey : null;
        const result = await settleRequest(callApi({
          type: 'config/entity_registry/update',
          entity_id: entity.entityId,
          name: entity.name.trim() || null,
          area_id: areaId,
        }), 12000);
        if (result === null) throw new Error('entity');
        advance();
      }

      setSaveProgress(100);
      onComplete();
    } catch {
      setSaveError(ot('organizer.error.save'));
      await loadOrganization();
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) {
    return (
      <>
        <SetupNotice icon={<AlertTriangle size={16} />} title={ot('organizer.permissions.title')}>
          {ot('organizer.permissions.description')}
        </SetupNotice>
        <WizardActions><SetupActionButton onClick={onComplete}>{ot('common.continue')}</SetupActionButton></WizardActions>
      </>
    );
  }

  if (loading) {
    return (
      <div className="onboarding-card flex min-h-64 flex-col items-center justify-center p-6 text-center">
        <GlassLoader
          size="lg"
          label={ot('organizer.loading')}
          description={ot('organizer.loadingDescription')}
        />
      </div>
    );
  }

  return (
    <>
      <GlassSegmentSelect<OrganizerStep>
        options={stepOptions}
        value={step}
        onChange={setStep}
        ariaLabel={ot('organizer.phaseAria')}
        optionClassName="!h-9 px-2"
      />

      {loadError ? (
        <div className="mt-4">
          <SetupNotice icon={<AlertTriangle size={16} />} tone="danger">{loadError}</SetupNotice>
          <div className="mt-3 flex justify-end">
            <SetupSecondaryButton onClick={() => void loadOrganization()} className="w-full sm:w-auto">
              {ot('organizer.retryRead')}
            </SetupSecondaryButton>
          </div>
        </div>
      ) : null}
      {saveError ? <div className="mt-4"><SetupNotice icon={<AlertTriangle size={16} />} tone="danger">{saveError}</SetupNotice></div> : null}

      {step === 'floors' ? (
        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="text-sm font-semibold text-[color:var(--ui-text-primary)]">{ot('common.floors')}</h2><p className="mt-1 text-xs text-[color:var(--ui-text-secondary)]">{ot('organizer.floorsDescription')}</p></div>
            <SetupSecondaryButton onClick={addFloor} className="!min-h-10 !px-3"><Plus size={15} /> {ot('common.add')}</SetupSecondaryButton>
          </div>
          <div className="glass-scrollbar max-h-[21rem] space-y-2 overflow-y-auto pr-1">
            {floors.length === 0 ? <div className="onboarding-card p-5 text-center text-sm text-[color:var(--ui-text-secondary)]">{ot('organizer.noFloors')}</div> : floors.map((floor) => (
              <div key={floor.key} className="onboarding-card grid gap-2 p-3 sm:grid-cols-[2rem_1fr_7rem_auto] sm:items-center">
                <span className="onboarding-choice-icon !h-8 !w-8 !rounded-[0.7rem]"><Building2 size={15} /></span>
                <input aria-label={ot('organizer.floorName', { name: floor.originalName || ot('organizer.newFloor') })} value={floor.name} onChange={(event) => setFloors((current) => current.map((item) => item.key === floor.key ? { ...item, name: event.target.value } : item))} className="onboarding-input-shell h-10 min-w-0 px-3 text-sm text-[color:var(--ui-text-primary)] outline-none" />
                <input aria-label={ot('organizer.floorLevel', { name: floor.name })} value={floor.level} inputMode="numeric" placeholder={ot('organizer.level')} onChange={(event) => setFloors((current) => current.map((item) => item.key === floor.key ? { ...item, level: event.target.value.replace(/[^\d-]/g, '') } : item))} className="onboarding-input-shell h-10 min-w-0 px-3 text-sm text-[color:var(--ui-text-primary)] outline-none" />
                {floor.isNew ? <button type="button" onClick={() => removeDraftFloor(floor.key)} className="glass-icon-button h-9 w-9" aria-label={ot('common.remove', { name: floor.name })}><Trash2 size={14} /></button> : <span className="hidden h-9 w-9 sm:block" />}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {step === 'rooms' ? (
        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="text-sm font-semibold text-[color:var(--ui-text-primary)]">{ot('common.rooms')}</h2><p className="mt-1 text-xs text-[color:var(--ui-text-secondary)]">{ot('organizer.roomsDescription')}</p></div>
            <SetupSecondaryButton onClick={addRoom} className="!min-h-10 !px-3"><Plus size={15} /> {ot('common.add')}</SetupSecondaryButton>
          </div>
          <div className="glass-scrollbar max-h-[21rem] space-y-2 overflow-y-auto pr-1">
            {rooms.map((room) => (
              <div key={room.key} className="onboarding-card grid gap-2 p-3 sm:grid-cols-[2rem_1fr_12rem_auto] sm:items-center">
                <span className="onboarding-choice-icon !h-8 !w-8 !rounded-[0.7rem]"><DoorOpen size={15} /></span>
                <input aria-label={ot('organizer.roomName', { name: room.originalName || ot('organizer.newRoom') })} value={room.name} onChange={(event) => setRooms((current) => current.map((item) => item.key === room.key ? { ...item, name: event.target.value } : item))} className="onboarding-input-shell h-10 min-w-0 px-3 text-sm text-[color:var(--ui-text-primary)] outline-none" />
                <GlassDropdown options={floorOptions} selected={floorOptions.find((option) => option.id === room.floorKey) ?? floorOptions[0]} onChange={(option) => setRooms((current) => current.map((item) => item.key === room.key ? { ...item, floorKey: option.id } : item))} ariaLabel={ot('organizer.roomFloor', { name: room.name })} size="compact" />
                {room.isNew ? <button type="button" onClick={() => removeDraftRoom(room.key)} className="glass-icon-button h-9 w-9" aria-label={ot('common.remove', { name: room.name })}><Trash2 size={14} /></button> : <span className="hidden h-9 w-9 sm:block" />}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {step === 'entities' ? (
        <div className="mt-5">
          <div className="onboarding-input-shell">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[color:var(--ui-text-secondary)]" />
            <input value={entitySearch} onChange={(event) => setEntitySearch(event.target.value)} className="onboarding-input h-11 pl-10 pr-3 text-sm" placeholder={ot('organizer.search')} aria-label={ot('organizer.searchAria')} />
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-[color:var(--ui-text-secondary)]"><span>{ot('organizer.entityCount', { count: filteredEntities.length })}</span><span>{ot('organizer.nameAndRoom')}</span></div>
          <div className="glass-scrollbar mt-2 max-h-[22rem] space-y-2 overflow-y-auto pr-1">
            {visibleEntities.map((entity) => (
              <div key={entity.entityId} className="onboarding-card grid gap-2 p-3 sm:grid-cols-[2rem_minmax(0,1fr)_12rem] sm:items-center">
                <span className="onboarding-choice-icon !h-8 !w-8 !rounded-[0.7rem]"><ListTree size={15} /></span>
                <div className="min-w-0">
                  <input aria-label={ot('organizer.entityName', { name: entity.entityId })} value={entity.name} onChange={(event) => setEntities((current) => current.map((item) => item.entityId === entity.entityId ? { ...item, name: event.target.value } : item))} className="onboarding-input-shell h-9 w-full min-w-0 px-3 text-sm text-[color:var(--ui-text-primary)] outline-none" />
                  <div className="mt-1 truncate px-1 text-[10px] text-[color:var(--ui-text-secondary)]">{entity.entityId}</div>
                </div>
                <GlassDropdown options={roomOptions} selected={roomOptions.find((option) => option.id === entity.areaKey) ?? roomOptions[0]} onChange={(option) => setEntities((current) => current.map((item) => item.entityId === entity.entityId ? { ...item, areaKey: option.id } : item))} ariaLabel={ot('organizer.entityRoom', { name: entity.name })} size="compact" />
              </div>
            ))}
            {visibleEntityCount < filteredEntities.length ? <SetupSecondaryButton onClick={() => setVisibleEntityCount((current) => current + ENTITY_PAGE_SIZE)} className="w-full">{ot('organizer.showMore')}</SetupSecondaryButton> : null}
          </div>
        </div>
      ) : null}

      {step === 'review' ? (
        <div className="mt-5">
          <div className="grid grid-cols-3 gap-2">
            {[[ot('common.floors'), changedFloors.length, Building2], [ot('common.rooms'), changedRooms.length, DoorOpen], [ot('common.entities'), changedEntities.length, ListTree]].map(([label, count, Icon]) => {
              const SummaryIcon = Icon as typeof Building2;
              return <div key={String(label)} className="onboarding-card min-w-0 p-3 text-center"><SummaryIcon size={17} className="mx-auto text-[color:rgb(var(--ui-accent-rgb))]" /><div className="mt-2 text-xl font-semibold text-[color:var(--ui-text-primary)]">{String(count)}</div><div className="truncate text-[10px] text-[color:var(--ui-text-secondary)]">{String(label)}</div></div>;
            })}
          </div>
          <div className="mt-4"><SetupNotice icon={totalChanges > 0 ? <Layers3 size={16} /> : <Check size={16} />} title={totalChanges > 0 ? ot('organizer.changesReady', { count: totalChanges }) : ot('organizer.noChanges')}>
            {totalChanges > 0 ? ot('organizer.changesDescription') : ot('organizer.noChangesDescription')}
          </SetupNotice></div>
          {saving ? <div className="mt-4"><div className="h-2 overflow-hidden rounded-full bg-[color:var(--ui-surface-glass-soft)]"><span className="block h-full rounded-full bg-[linear-gradient(90deg,rgb(var(--ui-accent-rgb)),rgb(var(--ui-accent-secondary-rgb)))] transition-[width] duration-300" style={{ width: `${saveProgress}%` }} /></div><div className="mt-2 text-right text-[10px] text-[color:var(--ui-text-secondary)]">{saveProgress}%</div></div> : null}
        </div>
      ) : null}

      <WizardActions>
        <SetupSecondaryButton onClick={goPrevious} disabled={saving}>{currentStepIndex === 0 ? ot('organizer.backLayout') : ot('common.back')}</SetupSecondaryButton>
        {loadError ? <SetupSecondaryButton onClick={onReconnect} disabled={saving}>{ot('connection.reconnect.title')}</SetupSecondaryButton> : null}
        {step === 'review' ? <SetupActionButton onClick={() => void applyOrganization()} disabled={saving}>{saving ? ot('organizer.applying') : totalChanges > 0 ? ot('organizer.confirm') : ot('organizer.complete')}</SetupActionButton> : <SetupActionButton onClick={goNext}>{ot('common.continue')}</SetupActionButton>}
      </WizardActions>
    </>
  );
}
