import React from 'react';
import { X } from 'lucide-react';
import { clsx } from 'clsx';
import GlassDropdown, { type GlassDropdownOption } from '../../components/ui/GlassDropdown';
import GlassModal from '../../components/ui/GlassModal';
import type { HaFloorEntry, RoomTab } from '../../components/rooms/roomsDirectory';
import type { HaArea } from '../../hooks/useHaLiveConnection';
import { useRoomsTranslations, type RoomsTranslationKey } from '../../i18n/roomsTranslations';
import { ROOM_ICONS } from './RoomHead';
import { roomIconKind, type RoomIconKind } from './roomSummary';
import { ROOM_ICON_CHOICES, roomDraftOf, type RoomDraft } from './roomManagement';

/*
 * The sheet that creates or changes a room, in the grouped rows of the
 * Profile page. A Home Assistant area has its floor, icon, picture, aliases
 * and sensors; a local room only its name. Deleting asks first.
 */

export const ICON_LABEL: Record<RoomIconKind, RoomsTranslationKey> = {
  sofa: 'iconSofa',
  kitchen: 'iconKitchen',
  bed: 'iconBed',
  bath: 'iconBath',
  desk: 'iconDesk',
  garage: 'iconGarage',
  garden: 'iconGarden',
  room: 'iconRoom',
};

// Above the panel the dropdowns open in (260).
const DROPDOWN_Z = 400;

function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
  const rt = useRoomsTranslations();
  return (
    <div className="flex items-center gap-3">
      <h2 className="m-0 min-w-0 flex-1 truncate text-xl font-bold tracking-[-0.02em]">{title}</h2>
      <button type="button" className="dv-round dv-round-sm" aria-label={rt('close')} onClick={onClose}>
        <X size={15} strokeWidth={2.4} aria-hidden="true" />
      </button>
    </div>
  );
}

function TextRow({ label, value, placeholder, onChange, inputMode, autoFocus }: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  autoFocus?: boolean;
}) {
  return (
    <label className="rv2-form-row">
      <span className="rv2-form-label">{label}</span>
      <input
        className="rv2-form-input"
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function DropdownRow({ label, options, value, onChange }: { label: string; options: GlassDropdownOption[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="rv2-form-row">
      <span className="rv2-form-label">{label}</span>
      <GlassDropdown
        className="min-w-0 flex-1"
        size="compact"
        ariaLabel={label}
        options={options}
        selected={options.find((option) => option.id === value) ?? options[0] ?? null}
        onChange={(option) => onChange(option.id)}
        portalZIndex={DROPDOWN_Z}
      />
    </div>
  );
}

function SheetFooter({ busy, canDelete, deleteLabel, onDelete, onCancel, onSave }: {
  busy: boolean;
  canDelete: boolean;
  deleteLabel: string;
  onDelete: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const rt = useRoomsTranslations();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {canDelete ? (
        <button type="button" className="rv2-form-delete" disabled={busy} onClick={onDelete}>
          {deleteLabel}
        </button>
      ) : null}
      <span className="flex-1" />
      <button type="button" className="glass-button min-h-11 rounded-full px-5 text-sm font-semibold" onClick={onCancel}>
        {rt('cancel')}
      </button>
      <button type="button" className="rv2-form-save" disabled={busy} onClick={onSave}>
        {busy ? rt('saving') : rt('save')}
      </button>
    </div>
  );
}

function ConfirmDelete({ title, description, busy, onConfirm, onClose }: { title: string | null; description?: string; busy: boolean; onConfirm: () => void; onClose: () => void }) {
  const rt = useRoomsTranslations();
  return (
    <GlassModal
      isOpen={title !== null}
      onClose={onClose}
      title={title ?? ''}
      description={description}
      size="sm"
      zIndex={300}
      footer={
        <div className="flex w-full justify-end gap-2">
          <button type="button" className="glass-button min-h-11 rounded-full px-5 text-sm font-semibold" onClick={onClose}>
            {rt('cancel')}
          </button>
          <button type="button" className="glass-button min-h-11 rounded-full px-5 text-sm font-semibold text-[color:var(--dv-red)]" disabled={busy} onClick={onConfirm}>
            {busy ? rt('deleting') : rt('delete')}
          </button>
        </div>
      }
    />
  );
}

export type SensorOptions = { temperature: GlassDropdownOption[]; humidity: GlassDropdownOption[] };

export function RoomEditPanel({
  room,
  area,
  haFields,
  floors,
  sensors,
  busy,
  error,
  onSave,
  onDelete,
  onClose,
}: {
  /** The room changed; null for a new one. */
  room: RoomTab | null;
  area: HaArea | null;
  /** The fields of a Home Assistant area: for an area, or a new room when Home Assistant takes it. */
  haFields: boolean;
  floors: HaFloorEntry[];
  sensors: SensorOptions;
  busy: boolean;
  error: string | null;
  onSave: (draft: RoomDraft) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  onClose: () => void;
}) {
  const rt = useRoomsTranslations();
  const [draft, setDraft] = React.useState<RoomDraft>(() => roomDraftOf(area, room?.name ?? ''));
  const [confirming, setConfirming] = React.useState(false);
  const set = (patch: Partial<RoomDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const iconKind = draft.icon ? roomIconKind(draft.icon, '') : null;
  const floorOptions: GlassDropdownOption[] = [{ id: '', name: rt('noFloor') }, ...floors.map((floor) => ({ id: floor.floor_id, name: floor.name }))];
  const none = { id: '', name: rt('sensorNone') };
  const note = room ? (room.source === 'custom' ? rt('browserEditStorage') : null) : haFields ? rt('roomSavedToHa') : rt('roomSavedOffline');

  return (
    <div className="dv-panel" data-testid="rooms-v2-room-edit">
      <SheetHeader title={room ? rt('editRoom') : rt('newRoom')} onClose={onClose} />
      <div className="dv-card rv2-form-group">
        <TextRow label={rt('nameLabel')} value={draft.name} placeholder={rt('roomExample')} onChange={(name) => set({ name })} autoFocus={!room} />
        {haFields ? <DropdownRow label={rt('floor')} options={floorOptions} value={draft.floorId} onChange={(floorId) => set({ floorId })} /> : null}
      </div>

      {haFields ? (
        <>
          <div className="flex flex-col gap-2">
            <span className="dv-t2 px-1 text-[13px] font-bold">{rt('icon')}</span>
            <div className="rv2-icon-grid" role="radiogroup" aria-label={rt('icon')}>
              {ROOM_ICON_CHOICES.map(([kind, icon]) => {
                const Icon = ROOM_ICONS[kind];
                const chosen = iconKind === kind;
                return (
                  <button
                    key={kind}
                    type="button"
                    role="radio"
                    aria-checked={chosen}
                    aria-label={rt(ICON_LABEL[kind])}
                    className={clsx('rv2-icon-choice', chosen && 'is-on')}
                    onClick={() => set({ icon: chosen ? '' : icon })}
                  >
                    <Icon size={20} strokeWidth={2} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </div>
          <div className="dv-card rv2-form-group">
            <TextRow label={rt('image')} value={draft.picture} placeholder="/local/rooms/studio.jpg" onChange={(picture) => set({ picture })} />
            <TextRow label={rt('aliases')} value={draft.aliases} placeholder="studio, ufficio" onChange={(aliases) => set({ aliases })} />
          </div>
          <p className="dv-t2 m-0 -mt-2 px-1 text-xs leading-[1.4]">{rt('aliasesDescription')}</p>
          <div className="dv-card rv2-form-group">
            <DropdownRow label={rt('temperatureEntity')} options={[none, ...sensors.temperature]} value={draft.temperatureEntityId} onChange={(temperatureEntityId) => set({ temperatureEntityId })} />
            <DropdownRow label={rt('humidityEntity')} options={[none, ...sensors.humidity]} value={draft.humidityEntityId} onChange={(humidityEntityId) => set({ humidityEntityId })} />
          </div>
        </>
      ) : null}

      {note ? <p className="dv-t2 m-0 px-1 text-[13px] leading-[1.45]">{note}</p> : null}
      {error ? (
        <p role="alert" className="m-0 px-1 text-[13px] font-semibold text-[color:var(--dv-red)]">
          {error}
        </p>
      ) : null}

      <SheetFooter
        busy={busy}
        canDelete={room !== null}
        deleteLabel={rt('deleteRoom')}
        onDelete={() => setConfirming(true)}
        onCancel={onClose}
        onSave={() => void onSave(draft).then((done) => done && onClose())}
      />
      <ConfirmDelete
        title={confirming && room ? rt('deleteRoomTitle', { name: room.name }) : null}
        description={room?.source === 'ha' ? rt('areaDeleteConfirm', { name: room.name }) : undefined}
        busy={busy}
        onClose={() => setConfirming(false)}
        onConfirm={() =>
          void onDelete().then((done) => {
            setConfirming(false);
            if (done) onClose();
          })
        }
      />
    </div>
  );
}
