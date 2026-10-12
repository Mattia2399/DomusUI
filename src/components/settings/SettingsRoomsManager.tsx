import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, DoorOpen, LayoutGrid, Layers3, Plus, RefreshCw } from 'lucide-react';
import type { HaArea } from '../../hooks/useHaLiveConnection';
import { useI18n } from '../../i18n/I18nProvider';
import type { HaDeviceRegistryEntry } from '../../services/haRegistryPresentation';
import GlassBottomSheet from '../ui/GlassBottomSheet';
import GlassDropdown, { type GlassDropdownOption } from '../ui/GlassDropdown';
import GlassModal from '../ui/GlassModal';
import { SettingsListGroup, SettingsListRow } from './SettingsList';

/*
 * Floors and rooms, managed with the Home Assistant registry commands the
 * app already uses (config/area_registry/*, config/floor_registry/*).
 * Home Assistant validates every change and stays the source of truth.
 */

export type RoomsCallApi = <T = unknown>(
  message: Record<string, unknown>,
  options?: { reportError?: boolean; throwOnError?: boolean },
) => Promise<T | null>;

type Room = { id: string; name: string; floorId: string | null; aliases: string[]; raw: Record<string, unknown> };
type Floor = { id: string; name: string; level: number | null; aliases: string[] };

type Editor =
  | { kind: 'room'; id: string | null; name: string; floorId: string; aliases: string }
  | { kind: 'floor'; id: string | null; name: string; level: string; aliases: string };

const NO_FLOOR = '__none__';
const INPUT = 'ui-input min-h-11 w-full min-w-0 rounded-xl px-3 py-2 text-sm';

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const strings = (value: unknown) => (Array.isArray(value) ? value.map(text).filter(Boolean) : []);
const splitAliases = (value: string) =>
  Array.from(new Set(value.split(',').map((alias) => alias.trim()).filter(Boolean)));

function parseRoom(value: unknown): Room | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Record<string, unknown>;
  const id = text(entry.area_id);
  if (!id) return null;
  return { id, name: text(entry.name) || id, floorId: text(entry.floor_id) || null, aliases: strings(entry.aliases), raw: entry };
}

function parseFloor(value: unknown): Floor | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Record<string, unknown>;
  const id = text(entry.floor_id);
  if (!id) return null;
  return {
    id,
    name: text(entry.name) || id,
    level: typeof entry.level === 'number' && Number.isInteger(entry.level) ? entry.level : null,
    aliases: strings(entry.aliases),
  };
}

const parseList = <T,>(value: unknown, parse: (entry: unknown) => T | null) =>
  Array.isArray(value) ? value.map(parse).filter((entry): entry is T => entry !== null) : [];

export function SettingsRoomsManager({
  callApi,
  connected,
  canManage,
  deviceRegistry = [],
  onOpenRooms,
  onRoomsChanged,
}: {
  callApi?: RoomsCallApi;
  connected: boolean;
  canManage: boolean;
  deviceRegistry?: HaDeviceRegistryEntry[];
  onOpenRooms?: () => void;
  /** The rooms after a change, so the rest of the app shows them at once. */
  onRoomsChanged?: (areas: HaArea[]) => void;
}) {
  const { locale, t } = useI18n();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [editorError, setEditorError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const changedRef = useRef(false);
  const fieldId = useId();

  useEffect(() => {
    if (!changedRef.current) return;
    changedRef.current = false;
    onRoomsChanged?.(
      rooms.map((room) => ({
        ...(room.raw as Partial<HaArea>),
        area_id: room.id,
        name: room.name,
        floor_id: room.floorId,
        aliases: room.aliases,
      })),
    );
  }, [onRoomsChanged, rooms]);

  const load = useCallback(async () => {
    if (!callApi || !connected) return;
    setStatus('loading');
    try {
      const [areaPayload, floorPayload] = await Promise.all([
        callApi({ type: 'config/area_registry/list' }, { reportError: false, throwOnError: true }),
        callApi({ type: 'config/floor_registry/list' }, { reportError: false, throwOnError: true }),
      ]);
      setRooms(parseList(areaPayload, parseRoom));
      setFloors(parseList(floorPayload, parseFloor));
      setStatus('ready');
    } catch {
      setStatus('failed');
    }
  }, [callApi, connected]);

  useEffect(() => {
    void load();
  }, [load]);

  // Devices per room, as Home Assistant assigns them.
  const deviceCountByRoom = useMemo(() => {
    const counts = new Map<string, number>();
    deviceRegistry.forEach((device) => {
      if (device.areaId) counts.set(device.areaId, (counts.get(device.areaId) ?? 0) + 1);
    });
    return counts;
  }, [deviceRegistry]);

  const sortedRooms = useMemo(
    () => [...rooms].sort((left, right) => left.name.localeCompare(right.name, locale, { sensitivity: 'base' })),
    [locale, rooms],
  );
  const groups = useMemo(() => {
    const known = new Set(floors.map((floor) => floor.id));
    return [
      ...floors.map((floor) => ({ floor, rooms: sortedRooms.filter((room) => room.floorId === floor.id) })),
      { floor: null, rooms: sortedRooms.filter((room) => !room.floorId || !known.has(room.floorId)) },
    ].filter((group) => group.floor !== null || group.rooms.length > 0);
  }, [floors, sortedRooms]);

  const floorOptions: GlassDropdownOption[] = [
    { id: NO_FLOOR, name: t('settings.rooms.noFloor') },
    ...floors.map((floor) => ({ id: floor.id, name: floor.name })),
  ];

  const deviceCount = (roomId: string) => {
    const count = deviceCountByRoom.get(roomId) ?? 0;
    return count === 0
      ? t('settings.rooms.devicesNone')
      : count === 1
        ? t('settings.rooms.devicesOne')
        : t('settings.rooms.devicesMany', { count });
  };
  const roomCount = (count: number) =>
    count === 1 ? t('settings.rooms.roomsOne') : t('settings.rooms.roomsMany', { count });

  const openRoom = (room: Room | null, floorId: string | null = null) => {
    setEditorError('');
    setEditor({
      kind: 'room',
      id: room?.id ?? null,
      name: room?.name ?? '',
      floorId: room?.floorId ?? floorId ?? NO_FLOOR,
      aliases: room?.aliases.join(', ') ?? '',
    });
  };
  const openFloor = (floor: Floor | null) => {
    setEditorError('');
    setEditor({
      kind: 'floor',
      id: floor?.id ?? null,
      name: floor?.name ?? '',
      level: floor?.level === null || floor?.level === undefined ? '' : String(floor.level),
      aliases: floor?.aliases.join(', ') ?? '',
    });
  };
  const closeEditor = () => {
    if (busy) return;
    setEditor(null);
    setConfirmDelete(false);
  };

  const run = async (action: () => Promise<void>) => {
    if (!callApi) return;
    setBusy(true);
    setEditorError('');
    try {
      await action();
      changedRef.current = true;
      setEditor(null);
      setConfirmDelete(false);
    } catch {
      setEditorError(t('settings.rooms.saveFailed'));
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!editor || !callApi) return;
    const name = editor.name.trim();
    if (!name) {
      setEditorError(t('settings.rooms.nameRequired'));
      return;
    }
    const aliases = splitAliases(editor.aliases);
    if (editor.kind === 'room') {
      const floorId = editor.floorId === NO_FLOOR ? null : editor.floorId;
      void run(async () => {
        if (editor.id) {
          const updated = parseRoom(
            await callApi(
              { type: 'config/area_registry/update', area_id: editor.id, name, floor_id: floorId, aliases },
              { reportError: false, throwOnError: true },
            ),
          );
          setRooms((current) =>
            current.map((room) => (room.id === editor.id ? updated ?? { ...room, name, floorId, aliases } : room)),
          );
        } else {
          const message: Record<string, unknown> = { type: 'config/area_registry/create', name };
          if (floorId) message.floor_id = floorId;
          if (aliases.length > 0) message.aliases = aliases;
          const created = parseRoom(await callApi(message, { reportError: false, throwOnError: true }));
          if (created) setRooms((current) => [...current.filter((room) => room.id !== created.id), created]);
          else await load();
        }
      });
      return;
    }
    const levelText = editor.level.trim();
    const level = levelText === '' ? null : Number.parseInt(levelText, 10);
    if (level !== null && !Number.isInteger(level)) {
      setEditorError(t('settings.rooms.saveFailed'));
      return;
    }
    void run(async () => {
      if (editor.id) {
        const updated = parseFloor(
          await callApi(
            { type: 'config/floor_registry/update', floor_id: editor.id, name, level, aliases },
            { reportError: false, throwOnError: true },
          ),
        );
        setFloors((current) => current.map((floor) => (floor.id === editor.id ? updated ?? { ...floor, name, level, aliases } : floor)));
      } else {
        const message: Record<string, unknown> = { type: 'config/floor_registry/create', name };
        if (level !== null) message.level = level;
        if (aliases.length > 0) message.aliases = aliases;
        const created = parseFloor(await callApi(message, { reportError: false, throwOnError: true }));
        if (created) setFloors((current) => [...current.filter((floor) => floor.id !== created.id), created]);
        else await load();
      }
    });
  };

  const remove = () => {
    if (!editor?.id || !callApi) return;
    const id = editor.id;
    void run(async () => {
      if (editor.kind === 'room') {
        await callApi({ type: 'config/area_registry/delete', area_id: id }, { reportError: false, throwOnError: true });
        setRooms((current) => current.filter((room) => room.id !== id));
      } else {
        await callApi({ type: 'config/floor_registry/delete', floor_id: id }, { reportError: false, throwOnError: true });
        // Home Assistant keeps the rooms of a deleted floor, without a floor.
        setFloors((current) => current.filter((floor) => floor.id !== id));
        setRooms((current) => current.map((room) => (room.floorId === id ? { ...room, floorId: null, raw: { ...room.raw, floor_id: null } } : room)));
      }
    });
  };

  const move = (direction: -1 | 1) => {
    if (editor?.kind !== 'floor' || !editor.id || !callApi) return;
    const index = floors.findIndex((floor) => floor.id === editor.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= floors.length) return;
    const next = [...floors];
    [next[index], next[target]] = [next[target], next[index]];
    setBusy(true);
    setEditorError('');
    void callApi(
      { type: 'config/floor_registry/reorder', floor_ids: next.map((floor) => floor.id) },
      { reportError: false, throwOnError: true },
    )
      .then(() => setFloors(next))
      .catch(() => setEditorError(t('settings.rooms.saveFailed')))
      .finally(() => setBusy(false));
  };

  if (!connected || !callApi) {
    return (
      <div className="mx-auto w-full max-w-[48rem]">
        <SettingsListGroup title={t('settings.home.floors')}>
          <SettingsListRow icon={Layers3} title={t('settings.rooms.offline')} />
        </SettingsListGroup>
      </div>
    );
  }

  const editingName = editor?.name.trim() || (editor?.kind === 'floor' ? t('settings.rooms.newFloor') : t('settings.rooms.newRoom'));
  const floorIndex = editor?.kind === 'floor' && editor.id ? floors.findIndex((floor) => floor.id === editor.id) : -1;

  return (
    <div className="mx-auto w-full max-w-[48rem] space-y-6 pb-4">
      {!canManage ? (
        <p className="px-1 text-xs text-[color:var(--ui-text-secondary)]">{t('settings.rooms.readOnly')}</p>
      ) : null}

      {status === 'loading' && rooms.length === 0 && floors.length === 0 ? (
        <div className="h-40 animate-pulse rounded-[1.4rem] bg-[color:var(--ui-fill-tertiary)] motion-reduce:animate-none" />
      ) : null}

      {status === 'failed' ? (
        <SettingsListGroup title={t('settings.home.floors')}>
          <SettingsListRow
            icon={RefreshCw}
            tone="danger"
            title={t('settings.rooms.loadFailed')}
            subtitle={t('settings.rooms.retry')}
            onClick={() => void load()}
          />
        </SettingsListGroup>
      ) : null}

      {status === 'ready' && rooms.length === 0 && floors.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-8 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]">
            <DoorOpen size={24} />
          </span>
          <p className="mt-3 text-base font-semibold">{t('settings.rooms.emptyTitle')}</p>
          <p className="mt-1 text-sm text-[color:var(--ui-text-secondary)]">{t('settings.rooms.emptyBody')}</p>
        </div>
      ) : null}

      {status === 'ready'
        ? groups.map(({ floor, rooms: floorRooms }) => (
            <SettingsListGroup
              key={floor?.id ?? NO_FLOOR}
              title={floor ? floor.name : t('settings.rooms.noFloor')}
              action={
                floor && canManage ? (
                  <button
                    type="button"
                    onClick={() => openFloor(floor)}
                    aria-label={t('settings.rooms.editFloorAria', { name: floor.name })}
                    className="text-xs font-semibold text-[color:var(--ui-accent)] hover:opacity-80"
                  >
                    {t('settings.rooms.editFloor')}
                  </button>
                ) : (
                  <span className="text-[11px] font-semibold text-[color:var(--ui-text-tertiary)]">{roomCount(floorRooms.length)}</span>
                )
              }
            >
              {floorRooms.map((room) => (
                <SettingsListRow
                  key={room.id}
                  icon={DoorOpen}
                  title={room.name}
                  subtitle={deviceCount(room.id)}
                  onClick={canManage ? () => openRoom(room) : undefined}
                />
              ))}
              {canManage && floor ? (
                <button
                  type="button"
                  onClick={() => openRoom(null, floor.id)}
                  className="flex min-h-[3.25rem] w-full items-center gap-3 px-4 text-left text-sm font-semibold text-[color:var(--ui-accent)] hover:bg-[color:var(--ui-fill-tertiary)]"
                >
                  <Plus size={17} aria-hidden="true" />
                  {t('settings.rooms.addRoom')}
                </button>
              ) : null}
            </SettingsListGroup>
          ))
        : null}

      {status === 'ready' ? (
        <SettingsListGroup title={t('settings.rooms.manage')}>
          {canManage ? (
            <>
              <SettingsListRow icon={DoorOpen} title={t('settings.rooms.addRoom')} onClick={() => openRoom(null)} />
              <SettingsListRow icon={Layers3} title={t('settings.rooms.addFloor')} onClick={() => openFloor(null)} />
            </>
          ) : null}
          {onOpenRooms ? (
            <SettingsListRow
              icon={LayoutGrid}
              title={t('settings.rooms.openRooms')}
              subtitle={t('settings.rooms.openRoomsHint')}
              onClick={onOpenRooms}
            />
          ) : null}
        </SettingsListGroup>
      ) : null}

      <GlassBottomSheet
        isOpen={editor !== null && !confirmDelete}
        onClose={closeEditor}
        title={editingName}
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={closeEditor}
              disabled={busy}
              className="liquid-glass-control inline-flex min-h-11 flex-1 items-center justify-center rounded-full px-4 text-sm font-semibold"
            >
              {t('settings.rooms.cancel')}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-[color:var(--ui-accent)] px-4 text-sm font-semibold text-[color:var(--ui-accent-contrast)] disabled:opacity-50"
            >
              {editor?.id ? t('settings.rooms.save') : t('settings.rooms.create')}
            </button>
          </div>
        }
      >
        {editor ? (
          <div className="space-y-4">
            <div>
              <label htmlFor={`${fieldId}-name`} className="mb-1.5 block text-xs font-semibold text-[color:var(--ui-text-secondary)]">
                {t('settings.rooms.name')}
              </label>
              <input
                id={`${fieldId}-name`}
                className={INPUT}
                value={editor.name}
                maxLength={120}
                autoFocus
                onChange={(event) => setEditor({ ...editor, name: event.target.value })}
              />
            </div>
            {editor.kind === 'room' ? (
              <div>
                <span className="mb-1.5 block text-xs font-semibold text-[color:var(--ui-text-secondary)]">{t('settings.rooms.floor')}</span>
                <GlassDropdown
                  options={floorOptions}
                  selected={floorOptions.find((option) => option.id === editor.floorId) ?? floorOptions[0]}
                  onChange={(option) => setEditor({ ...editor, floorId: option.id })}
                  ariaLabel={t('settings.rooms.floor')}
                  portalZIndex={400}
                />
              </div>
            ) : (
              <div>
                <label htmlFor={`${fieldId}-level`} className="mb-1.5 block text-xs font-semibold text-[color:var(--ui-text-secondary)]">
                  {t('settings.rooms.level')}
                </label>
                <input
                  id={`${fieldId}-level`}
                  aria-describedby={`${fieldId}-level-hint`}
                  className={INPUT}
                  inputMode="numeric"
                  value={editor.level}
                  onChange={(event) => setEditor({ ...editor, level: event.target.value.replace(/[^\d-]/g, '') })}
                />
                <p id={`${fieldId}-level-hint`} className="mt-1 text-[11px] text-[color:var(--ui-text-tertiary)]">
                  {t('settings.rooms.levelHint')}
                </p>
              </div>
            )}
            <div>
              <label htmlFor={`${fieldId}-aliases`} className="mb-1.5 block text-xs font-semibold text-[color:var(--ui-text-secondary)]">
                {t('settings.rooms.aliases')}
              </label>
              <input
                id={`${fieldId}-aliases`}
                aria-describedby={`${fieldId}-aliases-hint`}
                className={INPUT}
                value={editor.aliases}
                onChange={(event) => setEditor({ ...editor, aliases: event.target.value })}
              />
              <p id={`${fieldId}-aliases-hint`} className="mt-1 text-[11px] text-[color:var(--ui-text-tertiary)]">
                {t('settings.rooms.aliasesHint')}
              </p>
            </div>

            {editor.kind === 'floor' && editor.id && floors.length > 1 ? (
              <div>
                <span className="mb-1.5 block text-xs font-semibold text-[color:var(--ui-text-secondary)]">{t('settings.rooms.order')}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => move(-1)}
                    disabled={busy || floorIndex <= 0}
                    className="liquid-glass-control inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold disabled:opacity-40"
                  >
                    <ArrowUp size={14} aria-hidden="true" />
                    {t('settings.rooms.moveUp')}
                  </button>
                  <button
                    type="button"
                    onClick={() => move(1)}
                    disabled={busy || floorIndex < 0 || floorIndex >= floors.length - 1}
                    className="liquid-glass-control inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold disabled:opacity-40"
                  >
                    <ArrowDown size={14} aria-hidden="true" />
                    {t('settings.rooms.moveDown')}
                  </button>
                </div>
              </div>
            ) : null}

            {editorError ? (
              <p role="alert" className="text-xs font-medium text-[color:var(--ui-danger)]">{editorError}</p>
            ) : null}

            {editor.id ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
                className="inline-flex min-h-10 items-center text-sm font-semibold text-[color:var(--ui-danger)] hover:opacity-80 disabled:opacity-40"
              >
                {editor.kind === 'room' ? t('settings.rooms.deleteRoom') : t('settings.rooms.deleteFloor')}
              </button>
            ) : null}
          </div>
        ) : null}
      </GlassBottomSheet>

      <GlassModal
        isOpen={confirmDelete && editor !== null}
        onClose={() => setConfirmDelete(false)}
        title={t('settings.rooms.deleteTitle', { name: editor?.name.trim() || '' })}
        description={editor?.kind === 'floor' ? t('settings.rooms.deleteFloorBody') : t('settings.rooms.deleteRoomBody')}
        variant="dialog"
        size="sm"
        footer={(
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="liquid-glass-control inline-flex min-h-10 items-center justify-center rounded-full px-4 text-sm font-semibold"
              onClick={() => setConfirmDelete(false)}
            >
              {t('settings.rooms.cancel')}
            </button>
            <button
              type="button"
              disabled={busy}
              className="inline-flex min-h-10 items-center justify-center rounded-full bg-[color:var(--ui-danger)] px-4 text-sm font-semibold text-[color:var(--ui-danger-contrast)] disabled:opacity-50"
              onClick={remove}
            >
              {t('settings.rooms.delete')}
            </button>
          </div>
        )}
      />
    </div>
  );
}

export default SettingsRoomsManager;
